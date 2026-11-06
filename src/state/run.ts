import { SAUSAGES, sausageBaseStats, type SausageId } from '../data/sausages';
import type { WeaponId } from '../data/weapons';
import { BASE_STATS, computeStats, type PlayerStats } from './stats';
import type { Offer } from '../systems/Economy';

export interface WeaponSlot {
  id: WeaponId;
  tier: number;
}

/** Everything that persists between waves of a single run. */
export interface RunState {
  seed: number;
  sausage: SausageId;
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
}

/** Enough for one cheap item in the first shop. */
export const STARTING_CRUMBS = 8;

export function newRun(seed: number = Date.now() >>> 0, sausage: SausageId = 'frank'): RunState {
  return {
    seed,
    sausage,
    wave: 1,
    crumbs: STARTING_CRUMBS,
    weapons: SAUSAGES[sausage].startWeapons.map((id) => ({ id, tier: 1 })),
    items: [],
    lockedOffers: [],
    rerollCount: 0,
    kills: 0,
    crumbsEarned: 0,
    timeSurvivedSec: 0,
  };
}

/** The run's current stats: the sausage's base stats plus every item owned. */
export function runStats(run: Pick<RunState, 'items' | 'sausage'>): PlayerStats {
  return computeStats(run.items, sausageBaseStats(BASE_STATS, run.sausage));
}

export function maxLinksFor(run: Pick<RunState, 'sausage'>): number {
  return SAUSAGES[run.sausage].maxLinks;
}
