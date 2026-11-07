import { SAUSAGES, SAUSAGE_IDS, type SausageId } from '../data/sausages';
import { TROPHY_IDS, type TrophyId } from '../data/courses';
import { RECIPES, STARTER_WEAPONS, cookedBy, type Counters } from '../data/recipes';
import type { Rarity } from '../data/rarity';
import type { WeaponId } from '../data/weapons';
import { canBuyTalent, rankOf, spentSpice, spentTrophies, TALENTS } from '../data/talents';

/** One finished run, for the history list. */
export interface RunRecord {
  sausage: SausageId;
  /** Furthest course reached (0 = Backyard). */
  course: number;
  outcome: 'home' | 'bail' | 'death';
  spice: number;
  wave: number;
  chili: number;
}

/**
 * Everything kept between runs, in localStorage. Storage can be missing or throw (private
 * windows, blocked site data), so every access is guarded and the game works without it.
 */
export interface SaveData {
  version: 2;
  bestWave: number;
  wins: number;
  runs: number;
  /** Best wave reached per sausage, and wins (escapes) per sausage. */
  bestWaveBy: Partial<Record<SausageId, number>>;
  winsBy: Partial<Record<SausageId, number>>;
  lastSausage: SausageId;
  tutorialDone: boolean;
  /** Banked meta currency. */
  spice: number;
  trophies: Record<TrophyId, number>;
  /** Spice Rack ranks by talent id. */
  talents: Record<string, number>;
  /** Sausages you can play. */
  owned: SausageId[];
  /** Cookbook progress. */
  counters: Counters;
  /** Recipes already cooked and paid out. */
  cooked: string[];
  /** Highest Chili level unlocked per sausage (0 = none), and the level picked. */
  chili: Partial<Record<SausageId, number>>;
  chiliPick: Partial<Record<SausageId, number>>;
  /** "sausage:course" pairs whose First Taste bonus has been paid. */
  firstTaste: string[];
  /** Furthest course escaped per sausage (1 = took it home after the Backyard). */
  bestEscapeBy: Partial<Record<SausageId, number>>;
  history: RunRecord[];
}

const KEY = 'wurst-case-scenario/save';
export const HISTORY_SIZE = 20;
export const MAX_CHILI = 5;

export function defaultSave(): SaveData {
  return {
    version: 2, bestWave: 0, wins: 0, runs: 0, bestWaveBy: {}, winsBy: {}, lastSausage: 'frank', tutorialDone: false,
    spice: 0, trophies: { tong_tip: 0, grinder_blade: 0, smoked_brisket: 0 }, talents: {}, owned: ['frank'],
    counters: {}, cooked: [], chili: {}, chiliPick: {}, firstTaste: [], bestEscapeBy: {}, history: [],
  };
}

/**
 * Upgrades a version-1 save (best wave, wins). Everything you had unlocked stays playable;
 * recipes your old record already meets are marked cooked without paying them again.
 */
export function migrate(raw: Record<string, unknown>): SaveData {
  const base = defaultSave();
  const data = { ...base, ...raw } as SaveData & { version: number };
  if (raw.version !== 2) {
    const bestWave = Number(raw.bestWave) || 0;
    const wins = Number(raw.wins) || 0;
    const owned = new Set<SausageId>(['frank']);
    // The old unlock rules: wave 4, wave 7, wave 10, and one escape.
    if (bestWave >= 4) owned.add('bratwurst');
    if (bestWave >= 7) owned.add('chorizo');
    if (bestWave >= 10) owned.add('hotdog');
    if (wins > 0) owned.add('veggie');
    data.owned = [...owned];
    data.counters = { runs: Number(raw.runs) || 0, bossKills: wins, bestEscape: wins > 0 ? 1 : 0, bestCourseReached: 0 };
    data.cooked = cookedBy(data.counters);
    data.bestEscapeBy = {};
    for (const [id, n] of Object.entries((raw.winsBy as Record<string, number>) ?? {})) {
      if (n > 0 && id in SAUSAGES) data.bestEscapeBy[id as SausageId] = 1;
    }
  }
  data.version = 2;
  // Repair anything missing or malformed.
  data.trophies = { ...base.trophies, ...(data.trophies ?? {}) };
  for (const t of TROPHY_IDS) data.trophies[t] = Math.max(0, Math.floor(Number(data.trophies[t]) || 0));
  data.spice = Math.max(0, Math.floor(Number(data.spice) || 0));
  data.owned = Array.isArray(data.owned) ? data.owned.filter((id) => id in SAUSAGES) : ['frank'];
  if (!data.owned.includes('frank')) data.owned.unshift('frank');
  for (const k of ['talents', 'counters', 'chili', 'chiliPick', 'bestEscapeBy', 'bestWaveBy', 'winsBy'] as const) {
    if (!data[k] || typeof data[k] !== 'object') (data as unknown as Record<string, unknown>)[k] = {};
  }
  for (const k of ['cooked', 'firstTaste', 'history'] as const) {
    if (!Array.isArray(data[k])) (data as unknown as Record<string, unknown>)[k] = [];
  }
  data.cooked = data.cooked.filter((id) => id in RECIPES);
  if (!(data.lastSausage in SAUSAGES)) data.lastSausage = 'frank';
  return data as SaveData;
}

let cache: SaveData | null = null;

export function loadSave(): SaveData {
  if (cache) return cache;
  let data = defaultSave();
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (raw) data = migrate(JSON.parse(raw) as Record<string, unknown>);
  } catch {
    // Unreadable or blocked storage: play with a fresh profile.
  }
  cache = data;
  return data;
}

export function writeSave(data: SaveData): void {
  cache = data;
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(data));
  } catch {
    // Storage full or blocked: progress just isn't kept.
  }
}

/** For tests: forget the in-memory copy so the next load reads storage again. */
export function resetSaveCache(): void {
  cache = null;
}

// --- Sausages ---------------------------------------------------------------------------------

export function isOwned(id: SausageId, save: SaveData = loadSave()): boolean {
  return save.owned.includes(id);
}

export function ownedSausages(save: SaveData = loadSave()): SausageId[] {
  return SAUSAGE_IDS.filter((id) => save.owned.includes(id));
}

export type SausageState = 'owned' | 'buyable' | 'locked';

export function sausageState(id: SausageId, save: SaveData = loadSave()): SausageState {
  if (isOwned(id, save)) return 'owned';
  const u = SAUSAGES[id].unlock;
  if (u.recipe && !save.cooked.includes(u.recipe)) return 'locked';
  return 'buyable';
}

export function canAffordSausage(id: SausageId, save: SaveData = loadSave()): boolean {
  const u = SAUSAGES[id].unlock;
  if (save.spice < u.spice) return false;
  for (const [k, n] of Object.entries(u.trophies ?? {}) as [TrophyId, number][]) if (save.trophies[k] < n) return false;
  return true;
}

/** Buys a sausage whose recipe is cooked. Returns false if it can't be bought. */
export function buySausage(id: SausageId): boolean {
  const save = loadSave();
  if (sausageState(id, save) !== 'buyable' || !canAffordSausage(id, save)) return false;
  const u = SAUSAGES[id].unlock;
  const trophies = { ...save.trophies };
  for (const [k, n] of Object.entries(u.trophies ?? {}) as [TrophyId, number][]) trophies[k] -= n;
  writeSave({ ...save, spice: save.spice - u.spice, trophies, owned: [...save.owned, id] });
  return true;
}

// --- Talents ----------------------------------------------------------------------------------

export function buyTalent(id: string): boolean {
  const save = loadSave();
  const check = canBuyTalent(id, save.talents, save.spice, save.trophies, save.cooked);
  if (!check.ok) return false;
  const t = TALENTS[id];
  const trophies = { ...save.trophies };
  for (const [k, n] of Object.entries(t.trophies ?? {}) as [TrophyId, number][]) trophies[k] -= n;
  writeSave({ ...save, spice: save.spice - check.cost, trophies, talents: { ...save.talents, [id]: rankOf(save.talents, id) + 1 } });
  return true;
}

/** Free refund: every rank goes back, with the Spice and trophies spent on it. */
export function refundTalents(): void {
  const save = loadSave();
  const back = spentTrophies(save.talents);
  const trophies = { ...save.trophies };
  for (const t of TROPHY_IDS) trophies[t] += back[t];
  writeSave({ ...save, spice: save.spice + spentSpice(save.talents), trophies, talents: {} });
}

// --- Content gating ---------------------------------------------------------------------------

/** Weapons the shop may offer (starter pool + recipe unlocks + this sausage's own starters). */
export function unlockedWeapons(save: SaveData = loadSave()): WeaponId[] {
  const out = new Set<WeaponId>(STARTER_WEAPONS);
  for (const id of save.cooked) {
    const rw = RECIPES[id].reward;
    if (rw.kind === 'weapon') out.add(rw.weapon);
  }
  return [...out];
}

/** Item rarities the shop may offer. Common and Uncommon are always open. */
export function unlockedRarities(save: SaveData = loadSave()): Rarity[] {
  const out: Rarity[] = ['common', 'uncommon'];
  for (const id of save.cooked) {
    const rw = RECIPES[id].reward;
    if (rw.kind === 'rarity' && !out.includes(rw.rarity)) out.push(rw.rarity);
  }
  return out;
}

export function chiliUnlocked(save: SaveData = loadSave()): boolean {
  return save.cooked.some((id) => RECIPES[id].reward.kind === 'chili');
}

/** Highest Chili level this sausage can pick. */
export function maxChili(id: SausageId, save: SaveData = loadSave()): number {
  if (!chiliUnlocked(save)) return 0;
  return Math.min(MAX_CHILI, Math.max(1, save.chili[id] ?? 1));
}

export function pickedChili(id: SausageId, save: SaveData = loadSave()): number {
  return Math.max(0, Math.min(maxChili(id, save), save.chiliPick[id] ?? 0));
}

export function setChili(id: SausageId, level: number): void {
  const save = loadSave();
  writeSave({ ...save, chiliPick: { ...save.chiliPick, [id]: Math.max(0, Math.min(maxChili(id, save), level)) } });
}

/** Banks Spice right away (First Taste, Lunchbox), outside the end-of-run settlement. */
export function bankSpice(amount: number): void {
  if (amount <= 0) return;
  const save = loadSave();
  writeSave({ ...save, spice: save.spice + Math.floor(amount) });
}
