import type { WeaponId } from '../data/weapons';
import { START_HEAT } from '../systems/Doneness';
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
  heat: number;
  weapons: WeaponSlot[];
  items: string[];
  lockedOffers: Offer[];
  rerollCount: number;
  kills: number;
  crumbsEarned: number;
  timeSurvivedSec: number;
}

export function newRun(seed: number = Date.now() >>> 0): RunState {
  return {
    seed,
    wave: 1,
    crumbs: 0,
    heat: START_HEAT,
    weapons: [{ id: 'toothpick', tier: 1 }],
    items: [],
    lockedOffers: [],
    rerollCount: 0,
    kills: 0,
    crumbsEarned: 0,
    timeSurvivedSec: 0,
  };
}
