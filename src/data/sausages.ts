import type { PlayerStats } from '../state/stats';
import type { WeaponId } from './weapons';
import { MAX_LINKS } from './weapons';

export type SausageId = 'frank' | 'bratwurst' | 'chorizo' | 'hotdog' | 'veggie';

/** What a saved profile must have achieved to unlock a sausage. */
export type Unlock =
  | { kind: 'always' }
  | { kind: 'reachWave'; wave: number }
  | { kind: 'win' };

export interface SausageDef {
  id: SausageId;
  name: string;
  tagline: string;
  /** Multiplied onto the head and link textures. */
  tint: number;
  /** Stat changes on top of BASE_STATS (added; multipliers are offsets from 1). */
  stats: Partial<PlayerStats>;
  startWeapons: WeaponId[];
  maxLinks: number;
  /** One-line rules shown on the select screen. */
  perks: string[];
  unlock: Unlock;
}

export const SAUSAGES: Record<SausageId, SausageDef> = {
  frank: {
    id: 'frank', name: 'Classic Frank', tagline: 'Good at everything, great at nothing.',
    tint: 0xffffff, stats: {}, startWeapons: ['toothpick'], maxLinks: MAX_LINKS,
    perks: ['No strengths, no weaknesses', 'Starts with a Toothpick'],
    unlock: { kind: 'always' },
  },
  bratwurst: {
    id: 'bratwurst', name: 'Bratwurst', tagline: 'Thick-skinned and in no hurry.',
    tint: 0xe2b48a, stats: { maxHp: 40, armor: 3, speedMult: -0.1, damageMult: -0.1 }, startWeapons: ['pepper'], maxLinks: MAX_LINKS,
    perks: ['+40 max HP, +3 armor', '-10% speed, -10% damage', 'Starts with a Pepper Mill'],
    unlock: { kind: 'reachWave', wave: 4 },
  },
  chorizo: {
    id: 'chorizo', name: 'Chorizo', tagline: 'Spicy. Fragile. Hits like a truck.',
    tint: 0xff8f6e, stats: { damageMult: 0.2, critChance: 0.1, maxHp: -25 }, startWeapons: ['mustard'], maxLinks: MAX_LINKS,
    perks: ['+20% damage, +10% crit chance', '-25 max HP', 'Starts with a Mustard Squirt'],
    unlock: { kind: 'reachWave', wave: 7 },
  },
  hotdog: {
    id: 'hotdog', name: 'Hot Dog', tagline: 'Long, fast and always in a hurry.',
    tint: 0xffcfa6, stats: { speedMult: 0.15, dashCooldownMs: -400, maxHp: -15 }, startWeapons: ['toothpick', 'skewer'], maxLinks: MAX_LINKS + 1,
    perks: ['7 links instead of 6', '+15% speed, faster dash', '-15 max HP', 'Starts with a Toothpick and a Skewer'],
    unlock: { kind: 'reachWave', wave: 10 },
  },
  veggie: {
    id: 'veggie', name: 'Veggie Sausage', tagline: 'Grows back. Grill-proof.',
    tint: 0xb9e08c, stats: { regenPerSec: 1.5, grillImmune: 1, damageMult: -0.1 }, startWeapons: ['onion'], maxLinks: MAX_LINKS,
    perks: ['Regenerates 1.5 HP/s', 'Immune to grill tiles', '-10% damage', 'Starts with an Onion Ring'],
    unlock: { kind: 'win' },
  },
};

export const SAUSAGE_IDS = Object.keys(SAUSAGES) as SausageId[];

export function unlockText(u: Unlock): string {
  switch (u.kind) {
    case 'always': return 'Unlocked';
    case 'reachWave': return `Reach wave ${u.wave} to unlock`;
    case 'win': return 'Escape the BBQ once to unlock';
  }
}

/** Applies a sausage's stat offsets to the base stats. */
export function sausageBaseStats(base: Readonly<PlayerStats>, id: SausageId): PlayerStats {
  const s: PlayerStats = { ...base };
  for (const [k, v] of Object.entries(SAUSAGES[id].stats) as [keyof PlayerStats, number][]) s[k] += v;
  return s;
}
