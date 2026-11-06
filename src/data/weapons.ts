/** Every weapon rides on its own sausage link. All balance numbers live here. */
export type WeaponId = 'toothpick' | 'mustard' | 'pepper' | 'skewer' | 'pickle' | 'onion';
export type WeaponKind = 'single' | 'cone' | 'shotgun' | 'pierce' | 'lob' | 'orbit';

export interface WeaponDef {
  id: WeaponId;
  name: string;
  desc: string;
  kind: WeaponKind;
  price: number;
  damage: number;
  /** Time between shots. For orbit weapons: how often a ring can hit the same enemy. */
  cooldownMs: number;
  speed: number;
  /** Targeting range in px. For orbit weapons: the orbit radius. */
  range: number;
  projectiles: number;
  spreadDeg: number;
  pierce: number;
  poisonDps?: number;
  explodeRadius?: number;
  bulletTexture: string;
  icon: string;
  color: number;
}

export const MAX_TIER = 4;
export const MAX_LINKS = 6;

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  toothpick: {
    id: 'toothpick', name: 'Toothpick', kind: 'single',
    desc: 'Fast, precise single shots.',
    price: 10, damage: 7, cooldownMs: 400, speed: 640, range: 440,
    projectiles: 1, spreadDeg: 0, pierce: 0,
    bulletTexture: 'pb-toothpick', icon: 'icon-toothpick', color: 0xe8d3a0,
  },
  mustard: {
    id: 'mustard', name: 'Mustard Squirt', kind: 'cone',
    desc: 'Cone of mustard. Poison stacks up to 3 times.',
    price: 12, damage: 2, cooldownMs: 750, speed: 360, range: 260,
    projectiles: 5, spreadDeg: 50, pierce: 0, poisonDps: 5,
    bulletTexture: 'pb-mustard', icon: 'icon-mustard', color: 0xf2c418,
  },
  pepper: {
    id: 'pepper', name: 'Pepper Mill', kind: 'shotgun',
    desc: 'Blast of peppercorns. Great up close.',
    price: 14, damage: 4, cooldownMs: 1000, speed: 540, range: 300,
    projectiles: 6, spreadDeg: 40, pierce: 0,
    bulletTexture: 'pb-pepper', icon: 'icon-pepper', color: 0x555555,
  },
  skewer: {
    id: 'skewer', name: 'Skewer', kind: 'pierce',
    desc: 'Slow, heavy spike that pierces lines of enemies.',
    price: 15, damage: 13, cooldownMs: 1150, speed: 720, range: 620,
    projectiles: 1, spreadDeg: 0, pierce: 3,
    bulletTexture: 'pb-skewer', icon: 'icon-skewer', color: 0xc0c8d0,
  },
  pickle: {
    id: 'pickle', name: 'Pickle Launcher', kind: 'lob',
    desc: 'Lobs a pickle that explodes on landing.',
    price: 18, damage: 18, cooldownMs: 1500, speed: 400, range: 380,
    projectiles: 1, spreadDeg: 0, pierce: 0, explodeRadius: 72,
    bulletTexture: 'pb-pickle', icon: 'icon-pickle', color: 0x5fae3a,
  },
  onion: {
    id: 'onion', name: 'Onion Ring', kind: 'orbit',
    desc: 'Rings orbit this link and slice anything they touch. Upgrades spin faster.',
    price: 14, damage: 9, cooldownMs: 450, speed: 3.2, range: 64,
    projectiles: 2, spreadDeg: 0, pierce: 0,
    bulletTexture: 'onion-ring', icon: 'icon-onion', color: 0xf3ead2,
  },
};

export const WEAPON_IDS = Object.keys(WEAPONS) as WeaponId[];

export function tierDamage(def: WeaponDef, tier: number): number {
  return def.damage * (1 + 0.5 * (tier - 1));
}

export function tierCooldown(def: WeaponDef, tier: number): number {
  // Orbit rings hit once per pass, so a shorter re-hit cooldown does nothing; they spin faster instead.
  if (def.kind === 'orbit') return def.cooldownMs;
  return def.cooldownMs * (1 - 0.1 * (tier - 1));
}

/** Orbit spin speed multiplier per tier. */
export function tierSpin(def: WeaponDef, tier: number): number {
  return def.kind === 'orbit' ? 1 + 0.2 * (tier - 1) : 1;
}

/** Extra projectiles / rings / pierce granted by higher tiers. */
export function tierProjectiles(def: WeaponDef, tier: number): number {
  if (def.kind === 'orbit') return def.projectiles + (tier >= 3 ? 1 : 0) + (tier >= 4 ? 1 : 0);
  if (def.kind === 'shotgun' || def.kind === 'cone') return def.projectiles + (tier - 1);
  return def.projectiles;
}

export function tierPierce(def: WeaponDef, tier: number): number {
  return def.kind === 'pierce' ? def.pierce + (tier - 1) : def.pierce;
}

export function tierLabel(tier: number): string {
  return ['I', 'II', 'III', 'IV'][tier - 1] ?? String(tier);
}
