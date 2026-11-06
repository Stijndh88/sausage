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
import { BASE_STATS, computeStats, MIN_DASH_COOLDOWN, MIN_HEAT_TAKEN } from '../src/state/stats';
import { Doneness, MAX_HEAT, START_HEAT, TIERS, tierFor } from '../src/systems/Doneness';
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
      expect(s.heatTakenMult).toBeGreaterThanOrEqual(MIN_HEAT_TAKEN);
      expect(s.dashCooldownMs).toBeGreaterThanOrEqual(MIN_DASH_COOLDOWN);
      expect(s.killCoolChance).toBeLessThanOrEqual(1);
      expect(s.killCoolChance).toBeGreaterThanOrEqual(0);
      expect(s.damageMult).toBeGreaterThanOrEqual(BASE_STATS.damageMult);
      expect(s.fireRateMult).toBeGreaterThanOrEqual(BASE_STATS.fireRateMult);
      expect(s.pickupRadius).toBeGreaterThanOrEqual(BASE_STATS.pickupRadius);
      expect(s.crumbMult).toBeGreaterThanOrEqual(BASE_STATS.crumbMult);
    }
  });

  it('no item stack makes heat gain impossible (hits and grills always add heat)', () => {
    const tank = computeStats([...Array(50).fill('casing'), ...Array(50).fill('ice_pack')]);
    const d = new Doneness(50);
    d.heatTakenMult = tank.heatTakenMult;
    d.coolPerSec = tank.coolPerSec;
    expect(d.addHeat(8)).toBeGreaterThan(0);
    expect(d.addHeat(5 / 60)).toBeGreaterThan(0); // one frame on a grill tile
  });

  it('item order does not change the resulting stats', () => {
    const rng = mulberry32(99);
    const items = Array.from({ length: 40 }, () => ITEM_IDS[Math.floor(rng() * ITEM_IDS.length)]);
    const shuffled = [...items].sort(() => rng() - 0.5);
    const a = computeStats(items);
    const b = computeStats(shuffled);
    for (const k of Object.keys(a) as (keyof typeof a)[]) expect(b[k]).toBeCloseTo(a[k], 9);
  });

  // computeStats sums every item and clamps at the end, so once Thicker Casing has pushed heatTakenMult
  // below the 0.4 floor, Smoky Flavor's "+5% heat taken" drawback silently disappears.
  it.fails("Smoky Flavor's +5% heat taken always costs something, even with a full Casing stack", () => {
    const casings = Array(9).fill('casing');
    const without = computeStats(casings).heatTakenMult;
    const withSmoky = computeStats([...casings, 'smoky', 'smoky']).heatTakenMult;
    expect(withSmoky).toBeGreaterThan(without);
  });
});

// --- doneness --------------------------------------------------------------------------------------

describe('doneness risk/reward', () => {
  it('hotter tiers never give less total output (damage x fire rate) until Charred', () => {
    const live = TIERS.filter((t) => t.name !== 'Charred');
    for (let i = 1; i < live.length; i++) {
      expect(live[i].damageMult * live[i].fireRateMult).toBeGreaterThan(live[i - 1].damageMult * live[i - 1].fireRateMult);
    }
  });

  it('carry-over between waves never kills, never adds heat and never starts a wave Well-done', () => {
    for (let h = 0; h <= MAX_HEAT; h += 0.5) {
      const c = Doneness.carryOver(h);
      expect(c).toBeLessThanOrEqual(h);
      expect(c).toBeLessThan(MAX_HEAT);
      expect(tierFor(c).min).toBeLessThan(60);
    }
  });

  it('from the bottom of Burnt, the most common hit (8 heat) is survivable at base resistance', () => {
    const burnt = TIERS.find((t) => t.name === 'Burnt')!;
    const d = new Doneness(burnt.min);
    d.addHeat(Math.min(ENEMIES.fork.contactHeat, ENEMIES.ketchup.bulletHeat));
    expect(d.isCharred).toBe(false);
  });

  it('a new run starts alive and below Well-done', () => {
    expect(START_HEAT).toBeGreaterThanOrEqual(0);
    expect(tierFor(START_HEAT).min).toBeLessThan(60);
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
    expect(BOSS_HP / nominalDps(WEAPONS.toothpick, 1)).toBeLessThanOrEqual(600);
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
  it.fails('a shop always has at least one buyable offer for a player with crumbs (six maxed links)', () => {
    const maxed: WeaponSlot[] = ['toothpick', 'pickle', 'skewer', 'pepper', 'mustard', 'onion'].map((id) => ({ id: id as WeaponSlot['id'], tier: MAX_TIER }));
    for (let seed = 0; seed < 40; seed++) {
      for (let wave = 1; wave < TOTAL_WAVES; wave++) {
        const offers = generateOffers(shopRng(seed, wave, 0), wave + 1);
        expect(offers.some((o) => canBuy(o, 10_000, maxed).ok), `seed ${seed} wave ${wave}`).toBe(true);
      }
    }
  });
});
