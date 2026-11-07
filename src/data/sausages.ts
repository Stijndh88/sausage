import type { PlayerStats } from '../state/stats';
import type { WeaponId } from './weapons';
import { MAX_LINKS } from './weapons';

export type SausageId =
  | 'frank' | 'bratwurst' | 'chorizo' | 'hotdog' | 'veggie'
  | 'corndog' | 'cocktail' | 'blackpudding' | 'merguez' | 'weisswurst' | 'kielbasa';

/** What a saved profile must have achieved to unlock a sausage. */
export type Unlock =
  | { kind: 'always' }
  | { kind: 'reachWave'; wave: number }
  | { kind: 'win' }
  | { kind: 'winWith'; sausage: SausageId };

/**
 * The one rule that makes a sausage play differently. Stats live in `stats`; anything that isn't a
 * plain stat offset lives here and is applied by the Game scene.
 */
export interface SausageRules {
  /** Corn Dog: hits blocked by a batter shell at the start of every wave. */
  waveShield?: number;
  /** Cocktail Sausage: size of the head, its hitbox and the links (1 = normal). */
  bodyScale?: number;
  /** Black Pudding: condiment packets don't heal. */
  noCondimentHeal?: boolean;
  /** Merguez: every hit sets the enemy on fire for this much damage per second. */
  burnDps?: number;
  /** Weisswurst: damage bonus for the first `ms` of every wave, then a penalty for the rest. */
  freshness?: { ms: number; bonus: number; stale: number };
  /** Kielbasa: enemy shots and enemies hurt you when they touch any link, not just the head. */
  linksHittable?: boolean;
}

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
  rules?: SausageRules;
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
  corndog: {
    id: 'corndog', name: 'Corn Dog', tagline: 'Battered, fried and ready for anything.',
    tint: 0xf0c060, stats: { maxHp: 10, speedMult: -0.15 }, startWeapons: ['pickle'], maxLinks: MAX_LINKS,
    perks: ['A batter shell blocks the first hit of every wave', '+10 max HP', '-15% speed', 'Starts with a Pickle Launcher'],
    rules: { waveShield: 1 },
    unlock: { kind: 'winWith', sausage: 'bratwurst' },
  },
  cocktail: {
    id: 'cocktail', name: 'Cocktail Sausage', tagline: 'Small enough to slip through anything.',
    tint: 0xff9a8a, stats: { speedMult: 0.2, maxHp: -30 }, startWeapons: ['toothpick'], maxLinks: 4,
    perks: ['Tiny: 35% smaller hitbox', '+20% speed', '-30 max HP, only 4 links', 'Starts with a Toothpick'],
    rules: { bodyScale: 0.65 },
    unlock: { kind: 'winWith', sausage: 'hotdog' },
  },
  blackpudding: {
    id: 'blackpudding', name: 'Black Pudding', tagline: 'Thirsty. Very thirsty.',
    tint: 0x7a3a44, stats: { lifesteal: 0.12, maxHp: 10 }, startWeapons: ['pepper'], maxLinks: MAX_LINKS,
    perks: ['+12% chance per hit to heal 1 HP', '+10 max HP', 'Condiment packets don\'t heal', 'Starts with a Pepper Mill'],
    rules: { noCondimentHeal: true },
    unlock: { kind: 'winWith', sausage: 'veggie' },
  },
  merguez: {
    id: 'merguez', name: 'Merguez', tagline: 'Hot-blooded. Sets everything on fire.',
    tint: 0xd8583a, stats: { armor: -4 }, startWeapons: ['toothpick'], maxLinks: MAX_LINKS,
    perks: ['Every hit sets enemies on fire (4 dmg/s, stacks 3×)', '-4 armor: takes 20% more damage', 'Starts with a Toothpick'],
    rules: { burnDps: 4 },
    unlock: { kind: 'winWith', sausage: 'chorizo' },
  },
  weisswurst: {
    id: 'weisswurst', name: 'Weisswurst', tagline: 'Eat before noon. Seriously.',
    tint: 0xf4efe2, stats: {}, startWeapons: ['skewer'], maxLinks: MAX_LINKS,
    perks: ['+40% damage for the first 20 s of every wave', '-20% damage after that', 'Starts with a Skewer'],
    rules: { freshness: { ms: 20000, bonus: 0.4, stale: -0.2 } },
    unlock: { kind: 'winWith', sausage: 'frank' },
  },
  kielbasa: {
    id: 'kielbasa', name: 'Kielbasa', tagline: 'Long, loaded and hard to miss.',
    tint: 0xb0603a, stats: { maxHp: 20 }, startWeapons: ['toothpick', 'pepper'], maxLinks: MAX_LINKS + 2,
    perks: ['8 links instead of 6', '+20 max HP', 'Every link can be hit, not just the head', 'Starts with a Toothpick and a Pepper Mill'],
    rules: { linksHittable: true },
    unlock: { kind: 'winWith', sausage: 'cocktail' },
  },
};

export const SAUSAGE_IDS = Object.keys(SAUSAGES) as SausageId[];

/** The most links any sausage can have (sizes the link chain's trail). */
export const MOST_LINKS = Math.max(...SAUSAGE_IDS.map((id) => SAUSAGES[id].maxLinks));

export function unlockText(u: Unlock): string {
  switch (u.kind) {
    case 'always': return 'Unlocked';
    case 'reachWave': return `Reach wave ${u.wave} to unlock`;
    case 'win': return 'Escape the BBQ once to unlock';
    case 'winWith': return `Escape the BBQ as the ${SAUSAGES[u.sausage].name} to unlock`;
  }
}

/** Applies a sausage's stat offsets to the base stats. */
export function sausageBaseStats(base: Readonly<PlayerStats>, id: SausageId): PlayerStats {
  const s: PlayerStats = { ...base };
  for (const [k, v] of Object.entries(SAUSAGES[id].stats) as [keyof PlayerStats, number][]) s[k] += v;
  return s;
}
