import { ITEMS } from '../data/items';

export interface PlayerStats {
  maxHp: number;
  /** Damage reduction, see armorMultiplier(). */
  armor: number;
  regenPerSec: number;
  /** Chance (0-1) per hit you land to heal 1 HP. */
  lifesteal: number;
  /** Chance (0-1) to avoid a hit entirely. */
  dodge: number;
  damageMult: number;
  fireRateMult: number;
  speedMult: number;
  /** Chance (0-1) for a hit to deal double damage. */
  critChance: number;
  /** Better shop rarities, in %. */
  luck: number;
  pickupRadius: number;
  crumbMult: number;
  dashCooldownMs: number;
  explosionRadiusMult: number;
  /** Extra pellets for spread weapons (Pepper Mill, Mustard Squirt). */
  extraProjectiles: number;
  /** Damage dealt to an enemy that touches you. */
  thorns: number;
  /** 1 = grill tiles don't burn you. */
  grillImmune: number;
  /** Times per wave a fatal hit leaves you at 1 HP instead. */
  extraLives: number;
  /** HP restored by a condiment packet. */
  condimentHeal: number;
}

export const BASE_STATS: Readonly<PlayerStats> = {
  maxHp: 100,
  armor: 0,
  regenPerSec: 0,
  lifesteal: 0,
  dodge: 0,
  damageMult: 1,
  fireRateMult: 1,
  speedMult: 1,
  critChance: 0,
  luck: 0,
  pickupRadius: 90,
  crumbMult: 1,
  dashCooldownMs: 1500,
  explosionRadiusMult: 1,
  extraProjectiles: 0,
  thorns: 0,
  grillImmune: 0,
  extraLives: 0,
  condimentHeal: 15,
};

export const CAPS = {
  dodge: 0.6,
  critChance: 1,
  lifesteal: 0.5,
  minDashCooldownMs: 500,
  minSpeedMult: 0.5,
  minMaxHp: 10,
  minFireRateMult: 0.3,
  minDamageMult: 0.2,
} as const;

/** Base stats (from the chosen sausage) plus every owned item, then caps. */
export function computeStats(itemIds: readonly string[], base: Readonly<PlayerStats> = BASE_STATS): PlayerStats {
  const s: PlayerStats = { ...base };
  for (const id of itemIds) {
    const item = ITEMS[id];
    if (item) item.apply(s);
  }
  s.dodge = Math.min(CAPS.dodge, Math.max(0, s.dodge));
  s.critChance = Math.min(CAPS.critChance, Math.max(0, s.critChance));
  s.lifesteal = Math.min(CAPS.lifesteal, Math.max(0, s.lifesteal));
  s.dashCooldownMs = Math.max(CAPS.minDashCooldownMs, s.dashCooldownMs);
  s.speedMult = Math.max(CAPS.minSpeedMult, s.speedMult);
  s.maxHp = Math.max(CAPS.minMaxHp, Math.round(s.maxHp));
  s.fireRateMult = Math.max(CAPS.minFireRateMult, s.fireRateMult);
  s.damageMult = Math.max(CAPS.minDamageMult, s.damageMult);
  s.grillImmune = s.grillImmune > 0 ? 1 : 0;
  return s;
}
