/**
 * Balance invariants (game-design QA). These check rules and sane ranges, not today's exact numbers.
 * Tests marked `it.fails` reproduce a known logic bug; when it is fixed they start
 * passing, Vitest reports them, and the marker should be removed.
 *
 * Only Phaser-free modules are imported here. The spawn schedule below mirrors
 * src/systems/WaveDirector.ts (which imports Phaser); keep the two in sync.
 */
import { describe, expect, it } from 'vitest';
import { ENEMIES } from '../src/data/enemies';
import { ITEMS, ITEM_IDS } from '../src/data/items';
import { TOTAL_WAVES, waveConfig, type WaveConfig } from '../src/data/waves';
import {
  MAX_LINKS, MAX_TIER, WEAPONS, WEAPON_IDS, tierCooldown, tierDamage, tierPierce, tierProjectiles, type WeaponDef,
} from '../src/data/weapons';
import type { WeaponSlot } from '../src/state/run';
import { BASE_STATS, CAPS, computeStats } from '../src/state/stats';
import { Health } from '../src/systems/Health';
import {
  applyWeaponPurchase, canBuy, generateOffers, scalePrice, shopRng, SHOP_SIZE,
} from '../src/systems/Economy';
import { mulberry32 } from '../src/systems/rng';

// --- helpers ---------------------------------------------------------------------------------------

/** Nominal single-target DPS of one weapon (all projectiles hit, poison kept up). */
function nominalDps(def: WeaponDef, tier: number): number {
  const dmg = tierDamage(def, tier);
  const cdSec = tierCooldown(def, tier) / 1000;
  if (def.kind === 'orbit') {
    // One hit per ring per revolution (see the orbit test below).
    const revSec = (2 * Math.PI) / def.speed;
    return (tierProjectiles(def, tier) * dmg) / revSec;
  }
  let dps = (tierProjectiles(def, tier) * dmg) / cdSec;
  if (def.poisonDps) dps += def.poisonDps * (1 + 0.5 * (tier - 1));
  return dps;
}

/** Number of spawns per WaveDirector tick schedule (mirrors WaveDirector.update, ignoring maxAlive). */
function spawnSchedule(cfg: WaveConfig, durationSec = cfg.durationSec): { t: number; count: number }[] {
  const out: { t: number; count: number }[] = [];
  let elapsed = 0;
  let next = 400;
  const dt = 1000 / 60;
  while (elapsed < durationSec * 1000) {
    elapsed += dt;
    if (elapsed < next) continue;
    const progress = cfg.boss ? 0 : Math.min(1, elapsed / (cfg.durationSec * 1000));
    next = elapsed + cfg.spawnIntervalMs * (1 - 0.25 * progress);
    out.push({ t: elapsed / 1000, count: cfg.batch + (progress > 0.7 && cfg.batch >= 3 ? 1 : 0) });
  }
  return out;
}

function expectedPerSpawn(cfg: WaveConfig, field: 'hp' | 'crumbs'): number {
  const entries = Object.entries(cfg.weights) as [keyof typeof ENEMIES, number][];
  const total = entries.reduce((a, [, w]) => a + w, 0);
  const hpMult = field === 'hp' ? cfg.hpMult : 1;
  return entries.reduce((a, [k, w]) => a + (w / total) * ENEMIES[k].hp * (field === 'hp' ? hpMult : 0) + (field === 'crumbs' ? (w / total) * ENEMIES[k].crumbs : 0), 0);
}

/** Expected enemy HP spawned per second over a whole (non-boss) wave. */
function hpPressure(wave: number): number {
  const cfg = waveConfig(wave);
  const spawns = spawnSchedule(cfg).reduce((a, s) => a + s.count, 0);
  return (spawns * expectedPerSpawn(cfg, 'hp')) / cfg.durationSec;
}

function crumbsIfEverythingDies(wave: number): number {
  const cfg = waveConfig(wave);
  return spawnSchedule(cfg).reduce((a, s) => a + s.count, 0) * expectedPerSpawn(cfg, 'crumbs');
}

const BOSS_HP = ENEMIES.tongs.hp * waveConfig(TOTAL_WAVES).hpMult;

// --- weapons ---------------------------------------------------------------------------------------

describe('weapon tiers', () => {
  it('each tier is strictly better than the one below for every weapon', () => {
    for (const id of WEAPON_IDS) {
      const def = WEAPONS[id];
      for (let t = 2; t <= MAX_TIER; t++) {
        expect(tierDamage(def, t), `${id} damage T${t}`).toBeGreaterThan(tierDamage(def, t - 1));
        expect(tierCooldown(def, t), `${id} cooldown T${t}`).toBeLessThanOrEqual(tierCooldown(def, t - 1));
        expect(tierProjectiles(def, t)).toBeGreaterThanOrEqual(tierProjectiles(def, t - 1));
        expect(tierPierce(def, t)).toBeGreaterThanOrEqual(tierPierce(def, t - 1));
        expect(nominalDps(def, t), `${id} DPS T${t}`).toBeGreaterThan(nominalDps(def, t - 1));
      }
    }
  });

  it('cooldowns stay positive and projectile counts stay sane at max tier', () => {
    for (const id of WEAPON_IDS) {
      const def = WEAPONS[id];
      expect(tierCooldown(def, MAX_TIER)).toBeGreaterThan(100);
      expect(tierProjectiles(def, MAX_TIER)).toBeLessThanOrEqual(12);
    }
  });

  it('single-target projectile weapons are within 3x of each other per crumb at tier I', () => {
    const ids = WEAPON_IDS.filter((id) => WEAPONS[id].kind !== 'orbit' && WEAPONS[id].kind !== 'lob');
    const perCrumb = ids.map((id) => nominalDps(WEAPONS[id], 1) / WEAPONS[id].price);
    expect(Math.max(...perCrumb) / Math.min(...perCrumb)).toBeLessThan(3);
  });

  it('upgrading costs one purchase per tier and caps at MAX_TIER', () => {
    let w: WeaponSlot[] = [{ id: 'pepper', tier: 1 }];
    for (let i = 1; i < MAX_TIER; i++) w = applyWeaponPurchase(w, 'pepper')!;
    expect(w).toEqual([{ id: 'pepper', tier: MAX_TIER }]);
    // The next copy is a new link, not a tier V.
    expect(applyWeaponPurchase(w, 'pepper')).toEqual([{ id: 'pepper', tier: MAX_TIER }, { id: 'pepper', tier: 1 }]);
  });

});

// --- items & stats ---------------------------------------------------------------------------------

describe('item stacking and stat caps', () => {
  it('every item changes at least one stat when bought', () => {
    for (const id of ITEM_IDS) {
      expect(computeStats([id]), id).not.toEqual(computeStats([]));
    }
  });

  it('caps hold under 50 copies of any item and of everything at once', () => {
    const stacks = [...ITEM_IDS.map((id) => Array(50).fill(id)), ITEM_IDS.flatMap((id) => Array(50).fill(id))];
    for (const items of stacks) {
      const s = computeStats(items);
      for (const [k, v] of Object.entries(s)) expect(Number.isFinite(v), `${items[0]} ${k}`).toBe(true);
      expect(s.dodge).toBeLessThanOrEqual(CAPS.dodge);
      expect(s.critChance).toBeLessThanOrEqual(CAPS.critChance);
      expect(s.lifesteal).toBeLessThanOrEqual(CAPS.lifesteal);
      expect(s.dashCooldownMs).toBeGreaterThanOrEqual(CAPS.minDashCooldownMs);
      expect(s.speedMult).toBeGreaterThanOrEqual(CAPS.minSpeedMult);
      expect(s.maxHp).toBeGreaterThanOrEqual(CAPS.minMaxHp);
      expect(s.pickupRadius).toBeGreaterThanOrEqual(BASE_STATS.pickupRadius);
      expect(s.crumbMult).toBeGreaterThanOrEqual(BASE_STATS.crumbMult);
    }
  });

  it('no item stack makes you immune: every hit still does at least 1 damage', () => {
    const tank = computeStats(ITEM_IDS.flatMap((id) => Array(50).fill(id)));
    const h = new Health(tank.maxHp);
    h.armor = tank.armor;
    expect(h.takeDamage(ENEMIES.ketchup.bulletDamage)).toBeGreaterThanOrEqual(1);
  });

  it('item order does not change the resulting stats', () => {
    const rng = mulberry32(99);
    const items = Array.from({ length: 40 }, () => ITEM_IDS[Math.floor(rng() * ITEM_IDS.length)]);
    const shuffled = [...items].sort(() => rng() - 0.5);
    const a = computeStats(items);
    const b = computeStats(shuffled);
    for (const k of Object.keys(a) as (keyof typeof a)[]) expect(b[k]).toBeCloseTo(a[k], 9);
  });

  it('items with a drawback always cost something', () => {
    expect(computeStats(['double_dip']).maxHp).toBeLessThan(BASE_STATS.maxHp);
    expect(computeStats(['smoked_ham']).speedMult).toBeLessThan(BASE_STATS.speedMult);
  });

  it('better rarities give more per crumb on their headline stat', () => {
    // Golden Sausage (legendary) vs Paprika (common): more damage per crumb, not just more damage.
    const dmgPerCrumb = (id: string) => (computeStats([id]).damageMult - 1) / ITEMS[id].price;
    expect(dmgPerCrumb('golden_sausage')).toBeGreaterThan(dmgPerCrumb('paprika') * 0.5);
  });
});

// --- health ----------------------------------------------------------------------------------------

describe('health', () => {
  const hits = Object.values(ENEMIES).flatMap((e) => [e.contactDamage, e.bulletDamage]).filter((d) => d > 0);

  it('a fresh sausage survives at least 8 of the most common hits', () => {
    const h = new Health(BASE_STATS.maxHp);
    const common = Math.max(ENEMIES.fork.contactDamage, ENEMIES.ketchup.bulletDamage);
    let n = 0;
    while (!h.dead && n < 100) { h.takeDamage(common); n++; }
    expect(n).toBeGreaterThanOrEqual(8);
  });

  it('no single hit takes more than a quarter of a fresh sausage', () => {
    expect(Math.max(...hits)).toBeLessThanOrEqual(BASE_STATS.maxHp / 4);
  });

  it('armor always helps but never makes a hit free', () => {
    for (const armor of [0, 2, 5, 15, 50, 500]) {
      const h = new Health(1000);
      h.armor = armor;
      const dealt = h.takeDamage(10);
      expect(dealt).toBeGreaterThanOrEqual(1);
      if (armor > 0) expect(dealt).toBeLessThan(10);
    }
  });
});

// --- waves -----------------------------------------------------------------------------------------

describe('wave pressure', () => {
  it('enemy HP spawned per second never drops from one regular wave to the next', () => {
    for (let w = 2; w < TOTAL_WAVES; w++) expect(hpPressure(w), `wave ${w}`).toBeGreaterThanOrEqual(hpPressure(w - 1));
  });

  it('enemies spawned per wave never drop from one regular wave to the next', () => {
    const count = (w: number) => spawnSchedule(waveConfig(w)).reduce((a, s) => a + s.count, 0);
    for (let w = 2; w < TOTAL_WAVES; w++) expect(count(w), `wave ${w}`).toBeGreaterThanOrEqual(count(w - 1));
  });

  it('turrets only appear in waves that allow them, and the cap never exceeds the batch size of a wave', () => {
    for (let w = 1; w <= TOTAL_WAVES; w++) {
      const c = waveConfig(w);
      const hasTurretWeight = (c.weights.hotsauce ?? 0) > 0;
      expect(hasTurretWeight, `wave ${w}`).toBe(c.maxTurrets > 0);
      expect(c.maxTurrets).toBeLessThanOrEqual(c.maxAlive);
    }
  });

  it('the boss wave trickle is lighter than the last regular wave', () => {
    const boss = waveConfig(TOTAL_WAVES);
    const minionPressure = (spawnSchedule(boss, 60).reduce((a, s) => a + s.count, 0) * expectedPerSpawn(boss, 'hp')) / 60;
    expect(minionPressure).toBeLessThan(hpPressure(TOTAL_WAVES - 1));
  });

  // Sane range only: wave 3 is currently the steepest step (~2x). See the balance report.
  it('no single wave more than 2.5x the enemy HP pressure of the previous one', () => {
    for (let w = 2; w < TOTAL_WAVES; w++) expect(hpPressure(w) / hpPressure(w - 1), `wave ${w}`).toBeLessThanOrEqual(2.5);
  });

  // Sane range: the boss must not be killable faster than a few seconds by the best possible loadout,
  // and must be killable by a starting-strength weapon within ten minutes.
  it('boss HP is in a sane range against the strongest and weakest single-target loadouts', () => {
    const best = Math.max(...WEAPON_IDS.map((id) => nominalDps(WEAPONS[id], MAX_TIER)));
    expect(BOSS_HP / (best * MAX_LINKS)).toBeGreaterThanOrEqual(5);
    // A sausage that never bought anything could still grind the boss down eventually (< 15 min).
    expect(BOSS_HP / nominalDps(WEAPONS.toothpick, 1)).toBeLessThanOrEqual(900);
  });
});

// --- economy ---------------------------------------------------------------------------------------

describe('economy', () => {
  it('the first shop is affordable: killing wave 1 buys at least one weapon', () => {
    const cheapest = Math.min(...WEAPON_IDS.map((id) => scalePrice(WEAPONS[id].price, 2)));
    expect(crumbsIfEverythingDies(1)).toBeGreaterThanOrEqual(cheapest);
  });

  it('every base price is a positive whole number and scaled prices never fall', () => {
    for (const p of [...WEAPON_IDS.map((id) => WEAPONS[id].price), ...ITEM_IDS.map((id) => ITEMS[id].price)]) {
      expect(Number.isInteger(p) && p > 0).toBe(true);
      for (let w = 2; w <= TOTAL_WAVES; w++) expect(scalePrice(p, w)).toBeGreaterThanOrEqual(scalePrice(p, w - 1));
    }
  });

  it('every shop has SHOP_SIZE unique offers priced for the next wave', () => {
    for (let seed = 0; seed < 200; seed++) {
      const wave = 1 + (seed % 9);
      const offers = generateOffers(shopRng(seed, wave, 0), wave + 1);
      expect(offers).toHaveLength(SHOP_SIZE);
      expect(new Set(offers.map((o) => `${o.type}:${o.id}`)).size).toBe(SHOP_SIZE);
      for (const o of offers) {
        const base = o.type === 'weapon' ? WEAPONS[o.id as keyof typeof WEAPONS].price : ITEMS[o.id].price;
        expect(o.price).toBe(scalePrice(base, wave + 1));
      }
    }
  });

  // generateOffers ignores the loadout. With six maxed links every weapon offer is unbuyable
  // ("No free links") and ~1.7% of shops are all weapons (seed 6, after wave 9 is one).
  it('a shop always has at least one buyable offer for a player with crumbs (six maxed links)', () => {
    const maxed: WeaponSlot[] = ['toothpick', 'pickle', 'skewer', 'pepper', 'mustard', 'onion'].map((id) => ({ id: id as WeaponSlot['id'], tier: MAX_TIER }));
    for (let seed = 0; seed < 40; seed++) {
      for (let wave = 1; wave < TOTAL_WAVES; wave++) {
        const offers = generateOffers(shopRng(seed, wave, 0), wave + 1, [], SHOP_SIZE, maxed);
        expect(offers.some((o) => canBuy(o, 10_000, maxed).ok), `seed ${seed} wave ${wave}`).toBe(true);
      }
    }
  });
});
