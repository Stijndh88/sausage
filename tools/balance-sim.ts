/**
 * Balance simulator: plays thousands of runs on paper, using the game's real data and shop code
 * (items, prices, rarity odds, stat caps, weapon tiers, stack bonuses, wave HP, Spice payouts).
 * Combat is modelled, not simulated: a wave's kills follow from the build's damage against the
 * enemy HP the wave spawns. It answers "how strong does a good player get, how fast does a boss
 * die, how much Spice does a run pay", before and after a balance change.
 *
 *   npx tsx tools/balance-sim.ts              # summary table
 *   npx tsx tools/balance-sim.ts --runs 400   # more runs per row
 *   npx tsx tools/balance-sim.ts --trace      # one run, wave by wave
 *
 * The same model backs tests/progression.test.ts, which pins the targets.
 */
import { ENEMIES } from '../src/data/enemies';
import { locate } from '../src/data/courses';
import { waveConfig, type WaveConfig } from '../src/data/waves';
import { WEAPONS, tierCooldown, tierDamage, tierPierce, tierProjectiles, type WeaponId } from '../src/data/weapons';
import { stackBonus, stackCounts } from '../src/data/stacks';
import { SAUSAGES, sausageBaseStats, type SausageId } from '../src/data/sausages';
import { applyTalentStats, talentMods, TALENTS, rankCost, type MetaMods, type Ranks } from '../src/data/talents';
import { BASE_STATS, computeStats, type PlayerStats } from '../src/state/stats';
import { armorMultiplier } from '../src/systems/Health';
import {
  applyWeaponPurchase, canBuy, generateOffers, rerollCost, shopRng, type Offer,
} from '../src/systems/Economy';
import { mulberry32, type Rng } from '../src/systems/rng';
import type { WeaponSlot } from '../src/state/run';
import {
  BOSS_SPICE, EVENT_SPICE, KILL_SPICE_PER_CRUMB, keepShare, ESCAPE_BONUS, waveClearSpice,
} from '../src/state/meta';
import { courseSpiceMult } from '../src/data/courses';
import { eliteCrumbs, goldenCrumbs, bountyCrumbs } from '../src/data/events';

// --- Combat model --------------------------------------------------------------------------------

/** Share of shots that hit something in a crowd (moving targets, overkill, idle links). */
const ACCURACY = 0.6;
/**
 * Damage that lands on a boss per shot fired, by weapon kind (boomerang: per ring thrown, both legs).
 * Calibrated on 2026-11-07 against the real game: six tier IV copies of each weapon against the
 * Meat Grinder (wave 13) in headless Chromium; the model's time-to-kill matched within 5%.
 */
const SINGLE_HIT: Record<string, number> = { single: 0.94, pierce: 0.63, shotgun: 0.63, cone: 0.47, lob: 1.07, boomerang: 0.4 };
/** Share of a boss fight your links are actually shooting the boss (minions, dodging). */
const BOSS_UPTIME = 0.7;
/** Extra targets a weapon hits per shot in a crowd (beyond the first). */
function crowdFactor(kind: string, pierce: number, radiusMult: number): number {
  switch (kind) {
    case 'pierce':
    case 'single': return 1 + 0.45 * pierce;
    case 'cone':
    case 'shotgun': return 1.2 + 0.3 * pierce;
    case 'lob': return 2.2 * radiusMult;
    case 'boomerang': return 2.5;
    default: return 1;
  }
}

export interface Power {
  /** Damage per second against one target (boss). */
  single: number;
  /** Damage per second into a crowd (waves). */
  crowd: number;
  /** HP you can lose before dying to the average hit, in raw damage. */
  ehp: number;
}

export function buildPower(weapons: readonly WeaponSlot[], s: PlayerStats): Power {
  const counts = stackCounts(weapons);
  let single = 0;
  let crowd = 0;
  for (const w of weapons) {
    const def = WEAPONS[w.id];
    const b = stackBonus(w.id, counts.get(w.id) ?? 1);
    const spread = def.kind === 'cone' || def.kind === 'shotgun';
    const shots = tierProjectiles(def, w.tier) + (spread ? s.extraProjectiles : 0) + b.extraProjectiles;
    const perSec = (s.fireRateMult * b.fireRateMult * 1000) / tierCooldown(def, w.tier);
    const hit = tierDamage(def, w.tier) * s.damageMult * b.damageMult * (1 + s.critChance);
    // Single-target hit share per shot, measured against the real game (a Kitchen boss, an invincible
    // sausage standing still, minions around): see SINGLE_HIT.
    let dps = hit * shots * perSec * SINGLE_HIT[def.kind];
    if (def.poisonDps) dps += def.poisonDps * (1 + 0.5 * (w.tier - 1)) * s.damageMult * b.poisonMult * s.poisonMult * 3 * SINGLE_HIT[def.kind];
    single += dps;
    const pierce = tierPierce(def, w.tier) + s.pierce + b.pierce;
    crowd += hit * shots * perSec * crowdFactor(def.kind, pierce, s.explosionRadiusMult * b.radiusMult);
  }
  // Fire (Merguez, Extra Spicy) and thorns: rough flat bonuses.
  crowd += s.critBurn * s.critChance * 6 + s.thorns * 0.6;
  const mitig = armorMultiplier(s.armor) * (1 - s.dodge);
  const sustain = s.regenPerSec * 30 + s.lifesteal * 40;
  return { single, crowd: crowd * ACCURACY, ehp: (s.maxHp + sustain) / mitig };
}

/** Enemy HP and crumbs a normal wave spawns (mirrors WaveDirector's schedule, like balance.test.ts). */
export function waveTotals(cfg: WaveConfig): { hp: number; crumbs: number; count: number } {
  let elapsed = 0;
  let next = 400;
  let count = 0;
  const dt = 1000 / 60;
  while (elapsed < cfg.durationSec * 1000) {
    elapsed += dt;
    if (elapsed < next) continue;
    const progress = Math.min(1, elapsed / (cfg.durationSec * 1000));
    next = elapsed + cfg.spawnIntervalMs * (1 - 0.25 * progress);
    count += cfg.batch + (progress > 0.7 && cfg.batch >= 3 ? 1 : 0);
  }
  const entries = Object.entries(cfg.weights) as [keyof typeof ENEMIES, number][];
  const total = entries.reduce((a, [, w]) => a + w, 0);
  const avgHp = entries.reduce((a, [k, w]) => a + (w / total) * ENEMIES[k].hp, 0) * cfg.hpMult;
  const avgCrumbs = entries.reduce((a, [k, w]) => a + (w / total) * ENEMIES[k].crumbs, 0);
  return { hp: count * avgHp, crumbs: count * avgCrumbs, count };
}

export function bossHp(cfg: WaveConfig): number {
  return ENEMIES.tongs.hp * cfg.bossHpMult;
}

// --- Player model --------------------------------------------------------------------------------

export interface SimOptions {
  sausage?: SausageId;
  talents?: Ranks;
  /** How many courses to play before taking it home (1 = Backyard only, 4 = one Seconds loop). */
  courses?: number;
  seed?: number;
  /** 0..1: how well the player plays (dodging, crumb pickup). 1 = very good. */
  skill?: number;
  /** Rerolls the player is willing to pay for per shop. */
  maxRerolls?: number;
  trace?: boolean;
}

export interface WaveTrace {
  wave: number;
  course: number;
  boss: boolean;
  crumbsEarned: number;
  crumbsBank: number;
  killShare: number;
  /** Enemy HP the wave spawns over the damage you can deal in it (0.2 = a fifth of your firepower). */
  pressure: number;
  single: number;
  crowd: number;
  ehp: number;
  bossTtk: number | null;
  damagePct: number;
  fireRatePct: number;
  crit: number;
  items: number;
  bag: number;
  price10: number;
}

export interface RunResult {
  waves: WaveTrace[];
  spiceKept: number;
  bag: number;
  /** Lowest boss time-to-kill of the run, in seconds. */
  fastestBoss: number;
  bossTtks: number[];
  crumbs: number;
  build: { weapons: WeaponSlot[]; items: string[]; stats: PlayerStats };
}

function statsFor(sausage: SausageId, talents: Ranks, items: readonly string[]): PlayerStats {
  const base = applyTalentStats(sausageBaseStats(BASE_STATS, sausage), talents);
  return computeStats(items, base);
}

/** How much a build is worth to a greedy player: damage times staying alive. */
function score(p: Power, crumbMult: number, wavesLeft: number): number {
  const econ = 1 + (crumbMult - 1) * Math.min(1, wavesLeft / 12) * 0.5;
  return (p.crowd * 0.6 + p.single * 0.4) * Math.sqrt(p.ehp) * econ;
}

export function simulateRun(opts: SimOptions = {}): RunResult {
  const sausage = opts.sausage ?? 'frank';
  const talents = opts.talents ?? {};
  const mods: MetaMods = talentMods(talents);
  const courses = opts.courses ?? 4;
  const skill = opts.skill ?? 0.9;
  const rng: Rng = mulberry32(opts.seed ?? 1);
  const seed = Math.floor(rng() * 2 ** 31);
  const def = SAUSAGES[sausage];
  let weapons: WeaponSlot[] = def.startWeapons.map((id) => ({ id, tier: mods.starterTier2 ? 2 : 1 }));
  const items: string[] = [];
  let crumbs = mods.startCrumbs;
  let totalCrumbs = 0;
  let bag = 0;
  let pushes = 0;
  const waves: WaveTrace[] = [];
  const bossTtks: number[] = [];
  let lastWave = 0;
  for (let wave = 1; ; wave++) {
    const loc = locate(wave);
    if (loc.course >= courses) break;
    lastWave = wave;
    const cfg = waveConfig(wave);
    const stats = statsFor(sausage, talents, items);
    const p = buildPower(weapons, stats);
    const spiceMult = (courseSpiceMult(loc.course) + mods.pushMultBonus * pushes) * (1 + mods.spiceBonus);
    let earned = 0;
    let killShare = 1;
    let bossTtk: number | null = null;
    let pressure = 0;
    if (!cfg.boss) {
      const t = waveTotals(cfg);
      // Kill share: damage you can put out over the wave against the HP it throws at you.
      const capacity = p.crowd * cfg.durationSec;
      killShare = Math.min(1, (capacity / t.hp) ** 0.8);
      pressure = t.hp / capacity;
      const kills = t.count * killShare;
      const enemyCrumbs = t.crumbs * killShare * cfg.crumbMult * stats.crumbMult;
      // Events: about 1.5 a wave from wave 2, half of them paying crumbs.
      const eventCrumbs = wave >= 2 ? 0.75 * ((eliteCrumbs(wave) + goldenCrumbs(wave) + bountyCrumbs(wave)) / 3) * stats.crumbMult : 0;
      earned = (enemyCrumbs + eventCrumbs) * (0.85 + 0.15 * skill);
      bag += (t.crumbs * killShare * KILL_SPICE_PER_CRUMB + waveClearSpice(loc.courseWave) + EVENT_SPICE * 0.6) * spiceMult;
      void kills;
    } else {
      bossTtk = bossHp(cfg) / Math.max(1e-6, p.single * BOSS_UPTIME);
      bossTtks.push(bossTtk);
      bag += BOSS_SPICE * (1 + mods.bossBonus) * spiceMult;
    }
    const earnedWhole = Math.floor(earned);
    crumbs += earnedWhole;
    totalCrumbs += earnedWhole;

    // After a boss: push on (pick a free rare item like the Choice screen) or stop.
    if (cfg.boss) {
      if (loc.course + 1 >= courses) {
        waves.push(trace());
        break;
      }
      pushes++;
    }

    // --- Shop ---
    const wavesLeft = courses * 7 - wave;
    let rerolls = 0;
    let freeRerolls = mods.freeRerolls;
    const ctx = () => ({
      items, luck: statsFor(sausage, talents, items).luck, maxLinks: def.maxLinks,
      minRarity: mods.betterShop ? ('uncommon' as const) : undefined,
      priceMult: 1 - mods.shopDiscount,
    });
    let offers: Offer[] = generateOffers(shopRng(seed, wave, 0), wave, [], 4, weapons, ctx());
    for (let guard = 0; guard < 40; guard++) {
      const now = statsFor(sausage, talents, items);
      const base = score(buildPower(weapons, now), now.crumbMult, wavesLeft);
      let best = -1;
      let bestValue = 0;
      let bestWeapons: WeaponSlot[] | null = null;
      offers.forEach((o, i) => {
        if (!canBuy(o, crumbs, weapons, items, def.maxLinks).ok) return;
        let nextWeapons = weapons;
        let nextItems: string[] = items;
        if (o.type === 'weapon') {
          // Try both ways to buy it; keep the better one.
          const opts2 = (['link', 'upgrade'] as const).map((m) => applyWeaponPurchase(weapons, o.id as WeaponId, def.maxLinks, m)).filter(Boolean) as WeaponSlot[][];
          let top = -Infinity;
          for (const w of opts2) {
            const v = score(buildPower(w, now), now.crumbMult, wavesLeft);
            if (v > top) { top = v; nextWeapons = w; }
          }
        } else nextItems = [...items, o.id];
        const s2 = o.type === 'item' ? statsFor(sausage, talents, nextItems) : now;
        const gain = score(buildPower(nextWeapons, s2), s2.crumbMult, wavesLeft) / base - 1;
        const value = gain / o.price;
        if (gain > 0.004 && value > bestValue) {
          bestValue = value;
          best = i;
          bestWeapons = o.type === 'weapon' ? nextWeapons : null;
        }
      });
      if (best >= 0) {
        const o = offers[best];
        crumbs -= o.price;
        if (bestWeapons) weapons = bestWeapons;
        else items.push(o.id);
        offers = offers.filter((_, i) => i !== best);
        continue;
      }
      // Nothing worth buying: reroll if it's cheap next to the wallet.
      const cost = freeRerolls > 0 ? 0 : rerollCost(wave, rerolls);
      if (rerolls < (opts.maxRerolls ?? 6) && crumbs > cost * 4 && crumbs >= 15) {
        if (cost === 0) freeRerolls--;
        else crumbs -= cost;
        rerolls++;
        offers = generateOffers(shopRng(seed, wave, rerolls), wave, [], 4, weapons, ctx());
        continue;
      }
      break;
    }
    waves.push(trace());

    function trace(): WaveTrace {
      const s = statsFor(sausage, talents, items);
      const pw = buildPower(weapons, s);
      return {
        wave, course: loc.course, boss: cfg.boss, crumbsEarned: earnedWhole, crumbsBank: crumbs, killShare, pressure,
        single: pw.single, crowd: pw.crowd, ehp: pw.ehp, bossTtk,
        damagePct: Math.round((s.damageMult - 1) * 100), fireRatePct: Math.round((s.fireRateMult - 1) * 100),
        crit: Math.round(s.critChance * 100), items: items.length, bag: Math.floor(bag), price10: 0,
      };
    }
  }
  void lastWave;
  const run = { pushes, mods, chili: 0 };
  const kept = Math.floor(bag * keepShare('home', run)) + Math.floor(bag * ESCAPE_BONUS);
  return {
    waves, spiceKept: kept, bag: Math.floor(bag), fastestBoss: Math.min(...bossTtks), bossTtks, crumbs: totalCrumbs,
    build: { weapons, items, stats: statsFor(sausage, talents, items) },
  };
}

/** Every talent at max rank (keystones included). */
export function fullTalents(): Ranks {
  return Object.fromEntries(Object.values(TALENTS).map((t) => [t.id, t.maxRank]));
}

/** Total Spice for every non-keystone rank. */
export function shelfCost(): number {
  let total = 0;
  for (const t of Object.values(TALENTS)) if (t.shelf < 3) for (let r = 0; r < t.maxRank; r++) total += rankCost(t, r);
  return total;
}

function pct(xs: number[], q: number): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
}

// --- CLI -----------------------------------------------------------------------------------------

/** Node's process, typed loosely so the game's tsconfig (no Node types) still checks this file. */
const proc = (globalThis as { process?: { argv: string[] } }).process;
if (proc?.argv[1]?.endsWith('balance-sim.ts')) {
  const args = proc.argv.slice(2);
  const runs = Number(args[args.indexOf('--runs') + 1]) || 200;
  if (args.includes('--trace')) {
    const r = simulateRun({ seed: Number(args[args.indexOf('--seed') + 1]) || 7, courses: 4, sausage: (args.includes('--hotdog') ? 'hotdog' : 'weisswurst'), talents: args.includes('--talents') ? fullTalents() : {} });
    console.log('wave course  earned  bank  kill%  single   crowd    ehp  bossTTK  dmg%  fr%  crit  items  bag');
    for (const w of r.waves) {
      console.log([w.wave, w.course, w.crumbsEarned, w.crumbsBank, Math.round(w.killShare * 100), Math.round(w.single), Math.round(w.crowd), Math.round(w.ehp),
        w.bossTtk ? w.bossTtk.toFixed(1) : '', w.damagePct, w.fireRatePct, w.crit, w.items, w.bag].map((x) => String(x).padStart(6)).join(' '));
    }
    console.log('items', r.build.items.join(' '));
    console.log('weapons', r.build.weapons.map((w) => `${w.id}${w.tier}`).join(' '));
  } else {
    console.log(`Spice Rack, all non-keystone ranks: ${shelfCost()} Spice`);
    const half = Object.fromEntries(Object.values(TALENTS).filter((t) => t.shelf === 1).map((t) => [t.id, t.maxRank]));
    for (const [label, talents] of [['no talents', {}], ['shelf 1', half], ['full tree', fullTalents()]] as const) {
      for (const sausage of ['frank', 'weisswurst', 'hotdog'] as SausageId[]) {
        const rs = Array.from({ length: runs }, (_, i) => simulateRun({ seed: i + 1, sausage, talents, courses: 4 }));
        const fmt = (xs: number[]) => xs.length ? `${pct(xs, 0.1).toFixed(0)}/${pct(xs, 0.5).toFixed(0)}/${pct(xs, 0.9).toFixed(0)}` : '-';
        const line = [0, 1, 2, 3].map((c) => {
          const ttk = rs.map((r) => r.bossTtks[c]).filter((x) => x !== undefined);
          const pr = rs.map((r) => Math.max(...r.waves.filter((w) => w.course === c && !w.boss).map((w) => w.pressure)));
          return `C${c} boss ${fmt(ttk).padEnd(9)} press ${pct(pr, 0.5).toFixed(2)}`;
        }).join(' | ');
        console.log(`${label.padEnd(10)} ${sausage.padEnd(10)} ${line} | 1% fastest boss ${pct(rs.map((r) => r.fastestBoss), 0.01).toFixed(1)}s | dmg ${pct(rs.map((r) => r.build.stats.damageMult * 100 - 100), 0.5).toFixed(0)}% | crumbs ${pct(rs.map((r) => r.crumbs), 0.5)}`);
      }
      const spice = [1, 2, 3, 4].map((c) => pct(Array.from({ length: 60 }, (_, i) => simulateRun({ seed: i + 1, talents, courses: c }).spiceKept), 0.5));
      console.log(`${label.padEnd(10)} Spice taken home after course 1/2/3/4: ${spice.join(' / ')}`);
    }
  }
}
