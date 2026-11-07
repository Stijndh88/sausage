import { SAUSAGES, sausageBaseStats, type SausageId } from '../data/sausages';
import type { WeaponId } from '../data/weapons';
import type { TrophyId } from '../data/courses';
import type { Counters } from '../data/recipes';
import { applyTalentStats, emptyMods, talentMods, type MetaMods, type Ranks } from '../data/talents';
import { ITEMS, ITEM_IDS } from '../data/items';
import { BASE_STATS, computeStats, type PlayerStats } from './stats';
import type { Offer } from '../systems/Economy';
import { mulberry32 } from '../systems/rng';
import type { MenuId } from '../data/menus';

export interface WeaponSlot {
  id: WeaponId;
  tier: number;
}

/** Everything that persists between waves of a single run. */
export interface RunState {
  seed: number;
  sausage: SausageId;
  /** Global wave number across courses; see data/courses.ts locate(). */
  wave: number;
  crumbs: number;
  weapons: WeaponSlot[];
  items: string[];
  lockedOffers: Offer[];
  rerollCount: number;
  kills: number;
  crumbsEarned: number;
  timeSurvivedSec: number;
  /** What landed the final hit, shown on the Game Over screen. */
  causeOfDeath?: string;

  // --- The doggy bag -------------------------------------------------------------------------
  /** Spice in the bag (not yours until you get out). Fractional; shown rounded down. */
  bag: number;
  /** Trophies in the bag. */
  trophies: TrophyId[];
  /** Times you chose "seconds". */
  pushes: number;
  /** Spice already banked during the run (First Taste, Lunchbox): shown on the results. */
  bankedDuringRun: number;
  /** The menu (modifier) picked for the current course, if any. */
  menu: MenuId | null;
  /** Chili level picked for this run (0 = none). */
  chili: number;
  /** Spice Rack ranks, frozen at the start of the run. */
  talents: Ranks;
  /** Talent effects that aren't player stats. */
  mods: MetaMods;
  /** Second Skin keystone used. */
  reviveUsed: boolean;
  /** Cookbook counters gathered this run. */
  tally: Counters;
}

/** Enough for one cheap item in the first shop. */
export const STARTING_CRUMBS = 8;

export interface NewRunOptions {
  talents?: Ranks;
  chili?: number;
}

export function newRun(seed: number = Date.now() >>> 0, sausage: SausageId = 'frank', opts: NewRunOptions = {}): RunState {
  const talents = { ...(opts.talents ?? {}) };
  const mods = opts.talents ? talentMods(talents) : emptyMods();
  const weapons = SAUSAGES[sausage].startWeapons.map((id) => ({ id, tier: 1 }));
  if (mods.starterTier2 && weapons.length) weapons[0].tier = 2;
  const items: string[] = [];
  if (mods.startItem) {
    const commons = ITEM_IDS.filter((id) => ITEMS[id].rarity === 'common');
    items.push(commons[Math.floor(mulberry32(seed ^ 0x5eed)() * commons.length)]);
  }
  return {
    seed,
    sausage,
    wave: 1,
    crumbs: STARTING_CRUMBS + mods.startCrumbs,
    weapons,
    items,
    lockedOffers: [],
    rerollCount: 0,
    kills: 0,
    crumbsEarned: 0,
    timeSurvivedSec: 0,
    bag: 0,
    trophies: [],
    pushes: 0,
    bankedDuringRun: 0,
    menu: null,
    chili: Math.max(0, Math.floor(opts.chili ?? 0)),
    talents,
    mods,
    reviveUsed: false,
    tally: {},
  };
}

/** The sausage's base stats with the Spice Rack applied (before items). */
export function runBaseStats(run: Pick<RunState, 'sausage'> & Partial<Pick<RunState, 'talents'>>): PlayerStats {
  return applyTalentStats(sausageBaseStats(BASE_STATS, run.sausage), run.talents ?? {});
}

/** The run's current stats: base stats, talents, then every item owned. */
export function runStats(run: Pick<RunState, 'items' | 'sausage'> & Partial<Pick<RunState, 'talents'>>): PlayerStats {
  return computeStats(run.items, runBaseStats(run));
}

export function maxLinksFor(run: Pick<RunState, 'sausage'>): number {
  return SAUSAGES[run.sausage].maxLinks;
}

/** Adds to one of this run's Cookbook counters (or keeps the max, for best-of counters). */
export function tally(run: RunState, key: keyof Counters, amount = 1, mode: 'add' | 'max' = 'add'): void {
  const cur = run.tally[key] ?? 0;
  run.tally[key] = mode === 'max' ? Math.max(cur, amount) : cur + amount;
}
