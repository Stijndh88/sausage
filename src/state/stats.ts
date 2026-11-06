import { ITEMS } from '../data/items';

export interface PlayerStats {
  damageMult: number;
  fireRateMult: number;
  speedMult: number;
  /** Multiplier on incoming heat. Lower is better. */
  heatTakenMult: number;
  coolPerSec: number;
  /** Chance (0-1) to cool on each kill. */
  killCoolChance: number;
  killCoolAmount: number;
  pickupRadius: number;
  crumbMult: number;
  dashCooldownMs: number;
  /** Extra damage multiplier while Well-done or hotter. */
  hotDamageBonus: number;
}

export const BASE_STATS: Readonly<PlayerStats> = {
  damageMult: 1,
  fireRateMult: 1,
  speedMult: 1,
  heatTakenMult: 1,
  coolPerSec: 1,
  killCoolChance: 0,
  killCoolAmount: 2,
  pickupRadius: 90,
  crumbMult: 1,
  dashCooldownMs: 1500,
  hotDamageBonus: 0,
};

export const MIN_HEAT_TAKEN = 0.4;
export const MIN_DASH_COOLDOWN = 500;

export function computeStats(itemIds: readonly string[]): PlayerStats {
  const s: PlayerStats = { ...BASE_STATS };
  for (const id of itemIds) {
    const item = ITEMS[id];
    if (item) item.apply(s);
  }
  s.heatTakenMult = Math.max(MIN_HEAT_TAKEN, s.heatTakenMult);
  s.dashCooldownMs = Math.max(MIN_DASH_COOLDOWN, s.dashCooldownMs);
  s.killCoolChance = Math.min(1, s.killCoolChance);
  return s;
}
