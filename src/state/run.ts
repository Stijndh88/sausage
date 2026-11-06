import type { WeaponId } from '../data/weapons';
import type { Offer } from '../systems/Economy';

export interface WeaponSlot {
  id: WeaponId;
  tier: number;
}

/** Everything that persists between waves of a single run. */
export interface RunState {
  seed: number;
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

export function newRun(seed: number = Date.now() >>> 0): RunState {
  return {
    seed,
    wave: 1,
    crumbs: STARTING_CRUMBS,
    weapons: [{ id: 'toothpick', tier: 1 }],
    items: [],
    lockedOffers: [],
    rerollCount: 0,
    kills: 0,
    crumbsEarned: 0,
    timeSurvivedSec: 0,
  };
}
