/**
 * The sausage's health. Damage is reduced by armor; regen heals over time.
 * HP is kept as a float (regen is fractional); show it rounded up.
 */
export const ARMOR_SCALE = 15;
export const MIN_ARMOR = -10;

/** Damage multiplier for an armor value: 5 armor = 25% less damage, 15 = 50% less; negative armor hurts more. */
export function armorMultiplier(armor: number): number {
  if (armor >= 0) return ARMOR_SCALE / (ARMOR_SCALE + armor);
  return 1 + Math.min(-armor, -MIN_ARMOR) * 0.05;
}

export class Health {
  hp: number;
  maxHp: number;
  armor = 0;
  regenPerSec = 0;

  constructor(maxHp: number, hp: number = maxHp) {
    this.maxHp = Math.max(1, maxHp);
    this.hp = clamp(hp, 0, this.maxHp);
  }

  get dead(): boolean {
    return this.hp <= 0;
  }

  get fraction(): number {
    return this.hp / this.maxHp;
  }

  /** Shown value: rounded up so a sliver of HP never reads as 0. */
  get display(): number {
    return Math.ceil(this.hp);
  }

  /** Applies armor; every hit does at least 1. Returns the damage dealt. */
  takeDamage(raw: number): number {
    if (this.dead || raw <= 0) return 0;
    const dealt = Math.max(1, Math.round(raw * armorMultiplier(this.armor)));
    this.hp = Math.max(0, this.hp - dealt);
    return dealt;
  }

  /** Returns the HP actually restored. */
  heal(amount: number): number {
    if (this.dead || amount <= 0) return 0;
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    return this.hp - before;
  }

  tick(dtSec: number): void {
    if (this.regenPerSec > 0) this.heal(this.regenPerSec * dtSec);
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
