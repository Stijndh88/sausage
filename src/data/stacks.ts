import { WEAPONS, type WeaponId } from './weapons';
import type { WeaponSlot } from '../state/run';

/**
 * Stacking: every link can hold any weapon, so you can run 3x Onion Ring or even 6x.
 * Each weapon has three stack bonuses, at 2, 4 and 6 links of it, that boost every copy.
 * The bonuses add up (6 copies get all three). All numbers live here.
 */
export const STACK_THRESHOLDS = [2, 4, 6] as const;

export interface StackBonus {
  /** Multiplies the weapon's damage (and poison). */
  damageMult: number;
  /** Multiplies the weapon's fire rate. */
  fireRateMult: number;
  /** Extra projectiles (pellets, rings). */
  extraProjectiles: number;
  /** Extra enemies each shot passes through. */
  pierce: number;
  /** Multiplies explosion size. */
  radiusMult: number;
  /** Multiplies targeting range (and how far rings fly). */
  rangeMult: number;
  /** Multiplies poison damage per second. */
  poisonMult: number;
}

export function noStackBonus(): StackBonus {
  return { damageMult: 1, fireRateMult: 1, extraProjectiles: 0, pierce: 0, radiusMult: 1, rangeMult: 1, poisonMult: 1 };
}

/** One step of a stack bonus: only the fields it changes. Multipliers are given as +%, e.g. 0.15. */
export interface StackStep {
  damage?: number;
  fireRate?: number;
  projectiles?: number;
  pierce?: number;
  radius?: number;
  range?: number;
  poison?: number;
}

/** [at 2, at 4, at 6] for each weapon. */
export const STACKS: Record<WeaponId, [StackStep, StackStep, StackStep]> = {
  toothpick: [{ fireRate: 0.15 }, { pierce: 1 }, { damage: 0.3 }],
  mustard: [{ poison: 0.3 }, { projectiles: 2 }, { poison: 0.5, damage: 0.2 }],
  pepper: [{ projectiles: 1 }, { damage: 0.2 }, { projectiles: 2, damage: 0.15 }],
  skewer: [{ pierce: 1 }, { damage: 0.2 }, { pierce: 2, fireRate: 0.15 }],
  pickle: [{ radius: 0.15 }, { damage: 0.2 }, { radius: 0.25, fireRate: 0.15 }],
  onion: [{ range: 0.15 }, { projectiles: 1 }, { damage: 0.25 }],
};

/** How many links hold each weapon. */
export function stackCounts(weapons: readonly WeaponSlot[]): Map<WeaponId, number> {
  const out = new Map<WeaponId, number>();
  for (const w of weapons) out.set(w.id, (out.get(w.id) ?? 0) + 1);
  return out;
}

/** How many of a weapon's stack bonuses are active with this many copies (0 to 3). */
export function stackLevel(count: number): number {
  return STACK_THRESHOLDS.filter((t) => count >= t).length;
}

/** The combined bonus for `count` copies of a weapon. */
export function stackBonus(id: WeaponId, count: number): StackBonus {
  const b = noStackBonus();
  STACKS[id].slice(0, stackLevel(count)).forEach((s) => {
    b.damageMult += s.damage ?? 0;
    b.fireRateMult += s.fireRate ?? 0;
    b.extraProjectiles += s.projectiles ?? 0;
    b.pierce += s.pierce ?? 0;
    b.radiusMult += s.radius ?? 0;
    b.rangeMult += s.range ?? 0;
    b.poisonMult += s.poison ?? 0;
  });
  return b;
}

/** "+15% fire rate", "+1 pierce, +20% damage" */
export function stackStepText(id: WeaponId, step: StackStep): string {
  const ring = WEAPONS[id].kind === 'boomerang';
  const parts: string[] = [];
  const pct = (v: number | undefined, label: string) => v && parts.push(`+${Math.round(v * 100)}% ${label}`);
  pct(step.damage, 'damage');
  pct(step.fireRate, 'fire rate');
  if (step.projectiles) parts.push(`+${step.projectiles} ${ring ? (step.projectiles > 1 ? 'rings' : 'ring') : step.projectiles > 1 ? 'pellets' : 'pellet'}`);
  if (step.pierce) parts.push(`+${step.pierce} pierce`);
  pct(step.radius, 'blast size');
  pct(step.range, 'range');
  pct(step.poison, 'poison');
  return parts.join(', ');
}

/** The next stack bonus a weapon would reach, or null at the top. */
export function nextStack(id: WeaponId, count: number): { at: number; text: string } | null {
  const lvl = stackLevel(count);
  if (lvl >= STACK_THRESHOLDS.length) return null;
  return { at: STACK_THRESHOLDS[lvl], text: stackStepText(id, STACKS[id][lvl]) };
}
