import type { PlayerStats } from '../state/stats';
import type { TrophyId } from './courses';

/**
 * The Spice Rack: the permanent talent tree, bought with Spice between runs.
 * Four jars (branches), three shelves each. Shelf 2 opens after SHELF2_POINTS in the jar;
 * keystones (shelf 3) need KEYSTONE_POINTS in the jar plus trophies. Refunds are free.
 */
export type JarId = 'seasoning' | 'casing' | 'hustle' | 'doggybag';

export interface JarDef {
  id: JarId;
  name: string;
  /** What the jar is about, one word. */
  theme: string;
  color: number;
  css: string;
}

export const JARS: readonly JarDef[] = [
  { id: 'seasoning', name: 'Seasoning', theme: 'Attack', color: 0xe0482c, css: '#ff7a5a' },
  { id: 'casing', name: 'Casing', theme: 'Defence', color: 0xd89a5a, css: '#f0b880' },
  { id: 'hustle', name: 'Hustle', theme: 'Speed & shop', color: 0x5fd36b, css: '#7ee88a' },
  { id: 'doggybag', name: 'Doggy Bag', theme: 'Risk & reward', color: 0xffc23a, css: '#ffd060' },
];

export const SHELF2_POINTS = 5;
export const KEYSTONE_POINTS = 10;

/** Run-wide effects that aren't plain player stats. All default to 0 (off). */
export interface MetaMods {
  /** Added to the Spice multiplier (0.05 = +5%). */
  spiceBonus: number;
  /** Added to the share of the bag kept on death after pushing on. */
  deathKeepBonus: number;
  /** Share kept when bailing out (0 = the default 50%). */
  bailKeep: number;
  /** Share of the bag banked each time you push on. */
  pushBank: number;
  /** Added to event and boss Spice (0.2 = +20%). */
  bossBonus: number;
  startCrumbs: number;
  freeRerolls: number;
  /** Shop price discount (0.05 = 5% off). */
  shopDiscount: number;
  /** 1 = shop item offers are at least Uncommon. */
  betterShop: number;
  /** 1 = start every run with a random common item. */
  startItem: number;
  /** 1 = your starting weapon starts at tier II. */
  starterTier2: number;
  /** 1 = revive once per run at 40% HP. */
  revive: number;
  /** 1 = a one-hit shield at the start of every wave. */
  waveShield: number;
  /** Multiplier added per course you push on (All You Can Eat). */
  pushMultBonus: number;
}

export function emptyMods(): MetaMods {
  return {
    spiceBonus: 0, deathKeepBonus: 0, bailKeep: 0, pushBank: 0, bossBonus: 0, startCrumbs: 0, freeRerolls: 0,
    shopDiscount: 0, betterShop: 0, startItem: 0, starterTier2: 0, revive: 0, waveShield: 0, pushMultBonus: 0,
  };
}

export interface TalentDef {
  id: string;
  jar: JarId;
  /** 1, 2, or 3 (keystone). */
  shelf: 1 | 2 | 3;
  name: string;
  /** Per-rank effect, short ("+3% damage"). */
  desc: string;
  maxRank: number;
  /** Trophies a keystone costs on top of its Spice. */
  trophies?: Partial<Record<TrophyId, number>>;
  /** Recipe that must be cooked before this can be bought. */
  recipe?: string;
  stats?: (s: PlayerStats, rank: number) => void;
  mods?: (m: MetaMods, rank: number) => void;
}

const list: TalentDef[] = [
  // --- Seasoning (attack) ---------------------------------------------------------------------
  { id: 'sharp_seasoning', jar: 'seasoning', shelf: 1, name: 'Sharp Seasoning', desc: '+3% damage', maxRank: 5,
    stats: (s, r) => { s.damageMult += 0.03 * r; } },
  { id: 'quick_hands', jar: 'seasoning', shelf: 1, name: 'Quick Hands', desc: '+3% fire rate', maxRank: 5,
    stats: (s, r) => { s.fireRateMult += 0.03 * r; } },
  { id: 'coarse_grind', jar: 'seasoning', shelf: 1, name: 'Coarse Grind', desc: '+2% crit chance', maxRank: 5,
    stats: (s, r) => { s.critChance += 0.02 * r; } },
  { id: 'spread_flavour', jar: 'seasoning', shelf: 2, name: 'Spread the Flavour', desc: '+5% explosion size', maxRank: 3,
    stats: (s, r) => { s.explosionRadiusMult += 0.05 * r; } },
  { id: 'marinade', jar: 'seasoning', shelf: 2, name: 'Marinade', desc: '+15% poison damage', maxRank: 3,
    stats: (s, r) => { s.poisonMult += 0.15 * r; } },
  { id: 'first_bite', jar: 'seasoning', shelf: 2, name: 'First Bite', desc: '+20% damage to unhurt enemies', maxRank: 2,
    stats: (s, r) => { s.firstBite += 0.2 * r; } },
  { id: 'extra_spicy', jar: 'seasoning', shelf: 3, name: 'Extra Spicy', desc: 'Crits set enemies on fire (8 dmg/s, spreads on death)', maxRank: 1,
    trophies: { tong_tip: 2 }, stats: (s, r) => { s.critBurn += 8 * r; } },
  { id: 'double_batch', jar: 'seasoning', shelf: 3, name: 'Double Batch', desc: 'Starting weapon begins at tier II', maxRank: 1,
    trophies: { smoked_brisket: 1 }, mods: (m, r) => { m.starterTier2 += r; } },

  // --- Casing (defence) -----------------------------------------------------------------------
  { id: 'plump', jar: 'casing', shelf: 1, name: 'Plump', desc: '+5 max HP', maxRank: 10,
    stats: (s, r) => { s.maxHp += 5 * r; } },
  { id: 'tough_skin', jar: 'casing', shelf: 1, name: 'Tough Skin', desc: '+1 armor', maxRank: 3,
    stats: (s, r) => { s.armor += r; } },
  { id: 'simmer', jar: 'casing', shelf: 1, name: 'Simmer', desc: '+0.2 HP/s regen', maxRank: 3,
    stats: (s, r) => { s.regenPerSec += 0.2 * r; } },
  { id: 'condiment_lover', jar: 'casing', shelf: 2, name: 'Condiment Lover', desc: '+15% condiment healing', maxRank: 3,
    stats: (s, r) => { s.condimentHeal *= 1 + 0.15 * r; } },
  { id: 'grill_marks', jar: 'casing', shelf: 2, name: 'Grill Marks', desc: '-20% grill tile damage', maxRank: 3,
    stats: (s, r) => { s.grillDamageMult -= 0.2 * r; } },
  { id: 'iron_stomach', jar: 'casing', shelf: 2, name: 'Iron Stomach', desc: '+0.15 s invulnerable after a hit', maxRank: 2,
    stats: (s, r) => { s.iframeBonusMs += 150 * r; } },
  { id: 'second_skin_key', jar: 'casing', shelf: 3, name: 'Second Skin', desc: 'Revive once per run at 40% HP', maxRank: 1,
    trophies: { grinder_blade: 2 }, mods: (m, r) => { m.revive += r; } },
  { id: 'smoked', jar: 'casing', shelf: 3, name: 'Smoked', desc: 'A one-hit shield every wave', maxRank: 1,
    trophies: { tong_tip: 2 }, mods: (m, r) => { m.waveShield += r; } },

  // --- Hustle (movement and shop) -------------------------------------------------------------
  { id: 'quick_feet', jar: 'hustle', shelf: 1, name: 'Quick Feet', desc: '+3% move speed', maxRank: 5,
    stats: (s, r) => { s.speedMult += 0.03 * r; } },
  { id: 'hot_pan', jar: 'hustle', shelf: 1, name: 'Hot Pan', desc: '-5% dash cooldown', maxRank: 4,
    stats: (s, r) => { s.dashCooldownMs *= 1 - 0.05 * r; } },
  { id: 'big_plate', jar: 'hustle', shelf: 1, name: 'Big Plate', desc: '+10% pickup range', maxRank: 3,
    stats: (s, r) => { s.pickupRadius *= 1 + 0.1 * r; } },
  { id: 'tip_jar', jar: 'hustle', shelf: 2, name: 'Tip Jar', desc: '+3 starting crumbs', maxRank: 3,
    mods: (m, r) => { m.startCrumbs += 3 * r; } },
  { id: 'free_refill', jar: 'hustle', shelf: 2, name: 'Free Refill', desc: '+1 free reroll per shop', maxRank: 2,
    mods: (m, r) => { m.freeRerolls += r; } },
  { id: 'regular_customer', jar: 'hustle', shelf: 2, name: 'Regular Customer', desc: '-4% shop prices', maxRank: 3,
    mods: (m, r) => { m.shopDiscount += 0.04 * r; } },
  { id: 'food_truck', jar: 'hustle', shelf: 3, name: 'Food Truck', desc: 'Shop items Uncommon or better', maxRank: 1,
    trophies: { grinder_blade: 1 }, mods: (m, r) => { m.betterShop += r; } },
  { id: 'mise_en_place', jar: 'hustle', shelf: 3, name: 'Mise en Place', desc: 'Start with a random common item', maxRank: 1,
    trophies: { tong_tip: 2 }, mods: (m, r) => { m.startItem += r; } },

  // --- Doggy Bag (risk and reward) ------------------------------------------------------------
  { id: 'spice_hound', jar: 'doggybag', shelf: 1, name: 'Spice Hound', desc: '+5% Spice', maxRank: 5,
    mods: (m, r) => { m.spiceBonus += 0.05 * r; } },
  { id: 'tupperware', jar: 'doggybag', shelf: 1, name: 'Tupperware', desc: '+5% of the bag kept if you die', maxRank: 4,
    mods: (m, r) => { m.deathKeepBonus += 0.05 * r; } },
  { id: 'lucky_fork', jar: 'doggybag', shelf: 1, name: 'Lucky Fork', desc: '+3 luck', maxRank: 5,
    stats: (s, r) => { s.luck += 3 * r; } },
  { id: 'lunchbox', jar: 'doggybag', shelf: 2, name: 'Lunchbox', desc: 'Bank 10% of the bag per push', maxRank: 2,
    recipe: 'big_push', mods: (m, r) => { m.pushBank += 0.1 * r; } },
  { id: 'treasure_nose', jar: 'doggybag', shelf: 2, name: 'Treasure Nose', desc: '+20% Spice from bosses and events', maxRank: 3,
    mods: (m, r) => { m.bossBonus += 0.2 * r; } },
  { id: 'greedy_gut', jar: 'doggybag', shelf: 2, name: 'Greedy Gut', desc: '+6% crumbs from enemies', maxRank: 3,
    stats: (s, r) => { s.crumbMult += 0.06 * r; } },
  { id: 'takeout', jar: 'doggybag', shelf: 3, name: 'Takeout', desc: 'Bailing out keeps 75% of the bag', maxRank: 1,
    trophies: { grinder_blade: 1 }, mods: (m, r) => { if (r) m.bailKeep = 0.75; } },
  { id: 'all_you_can_eat', jar: 'doggybag', shelf: 3, name: 'All You Can Eat', desc: '+0.25 Spice multiplier per push', maxRank: 1,
    trophies: { smoked_brisket: 1 }, mods: (m, r) => { m.pushMultBonus += 0.25 * r; } },
];

export const TALENTS: Record<string, TalentDef> = Object.fromEntries(list.map((t) => [t.id, t]));
export const TALENT_IDS = list.map((t) => t.id);

/**
 * Spice cost of the next rank (rank = ranks already owned). The whole rack (about 16,000 Spice) is
 * meant to take a few dozen good runs; the first ranks stay cheap so even a short run buys one.
 */
export const KEYSTONE_COST = 500;
export function rankCost(t: TalentDef, rank: number): number {
  if (t.shelf === 3) return KEYSTONE_COST;
  const curve = [25, 60, 110, 175, 250, 340, 440, 550, 675, 810];
  const base = curve[Math.min(rank, curve.length - 1)];
  return t.shelf === 2 ? Math.round(base * 1.6) : base;
}

/** Total Spice to buy every rank of every talent (keystones included). */
export function fullTreeCost(): number {
  let total = 0;
  for (const t of list) for (let r = 0; r < t.maxRank; r++) total += rankCost(t, r);
  return total;
}

export type Ranks = Readonly<Record<string, number>>;

export function rankOf(ranks: Ranks, id: string): number {
  return Math.max(0, Math.min(TALENTS[id]?.maxRank ?? 0, Math.floor(ranks[id] ?? 0)));
}

export function jarPoints(ranks: Ranks, jar: JarId): number {
  return list.filter((t) => t.jar === jar).reduce((a, t) => a + rankOf(ranks, t.id), 0);
}

/** Spice spent on a set of ranks (what a refund gives back). */
export function spentSpice(ranks: Ranks): number {
  let total = 0;
  for (const t of list) for (let r = 0; r < rankOf(ranks, t.id); r++) total += rankCost(t, r);
  return total;
}

/** Trophies spent on keystones (refunded too). */
export function spentTrophies(ranks: Ranks): Record<TrophyId, number> {
  const out: Record<TrophyId, number> = { tong_tip: 0, grinder_blade: 0, smoked_brisket: 0 };
  for (const t of list) {
    if (!rankOf(ranks, t.id) || !t.trophies) continue;
    for (const [k, n] of Object.entries(t.trophies) as [TrophyId, number][]) out[k] += n;
  }
  return out;
}

export type BuyCheck = { ok: true; cost: number } | { ok: false; reason: string; cost: number };

/** Can this talent's next rank be bought with this wallet? */
export function canBuyTalent(
  id: string,
  ranks: Ranks,
  spice: number,
  trophies: Readonly<Record<TrophyId, number>>,
  recipesDone: readonly string[],
): BuyCheck {
  const t = TALENTS[id];
  const rank = rankOf(ranks, id);
  const cost = rankCost(t, rank);
  if (rank >= t.maxRank) return { ok: false, reason: 'Maxed', cost };
  const pts = jarPoints(ranks, t.jar);
  if (t.shelf === 2 && pts < SHELF2_POINTS) return { ok: false, reason: `Needs ${SHELF2_POINTS} points in this jar`, cost };
  if (t.shelf === 3 && pts < KEYSTONE_POINTS) return { ok: false, reason: `Needs ${KEYSTONE_POINTS} points in this jar`, cost };
  if (t.recipe && !recipesDone.includes(t.recipe)) return { ok: false, reason: 'Cook its recipe first', cost };
  if (t.trophies) {
    for (const [k, n] of Object.entries(t.trophies) as [TrophyId, number][]) {
      if ((trophies[k] ?? 0) < n) return { ok: false, reason: 'Not enough trophies', cost };
    }
  }
  if (spice < cost) return { ok: false, reason: 'Not enough Spice', cost };
  return { ok: true, cost };
}

/** Applies every owned talent's stat changes. */
export function applyTalentStats(s: PlayerStats, ranks: Ranks): PlayerStats {
  for (const t of list) {
    const r = rankOf(ranks, t.id);
    if (r && t.stats) t.stats(s, r);
  }
  return s;
}

export function talentMods(ranks: Ranks): MetaMods {
  const m = emptyMods();
  for (const t of list) {
    const r = rankOf(ranks, t.id);
    if (r && t.mods) t.mods(m, r);
  }
  return m;
}
