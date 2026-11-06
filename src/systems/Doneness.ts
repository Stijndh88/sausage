/**
 * The Doneness meter replaces HP. Heat goes up when you get hit or stand on the grill,
 * and slowly cools. Hotter = stronger, but at 100 you're charred and the run ends.
 */
export const MAX_HEAT = 100;
export const START_HEAT = 20;
export const BETWEEN_WAVE_RETAIN = 0.5;

export interface DonenessTier {
  name: 'Raw' | 'Medium' | 'Well-done' | 'Burnt' | 'Charred';
  min: number;
  damageMult: number;
  fireRateMult: number;
  color: number;
}

export const TIERS: readonly DonenessTier[] = [
  // Meter colours get brighter/hotter as heat rises, so the most dangerous state is the most visible.
  { name: 'Raw', min: 0, damageMult: 0.85, fireRateMult: 1.0, color: 0xf0a0a0 },
  { name: 'Medium', min: 25, damageMult: 1.0, fireRateMult: 1.0, color: 0xffb347 },
  { name: 'Well-done', min: 60, damageMult: 1.3, fireRateMult: 1.2, color: 0xff7a1a },
  { name: 'Burnt', min: 90, damageMult: 1.5, fireRateMult: 1.2, color: 0xff3b1f },
  { name: 'Charred', min: 100, damageMult: 0, fireRateMult: 0, color: 0xff2a2a },
];

export function tierFor(heat: number): DonenessTier {
  for (let i = TIERS.length - 1; i >= 0; i--) {
    if (heat >= TIERS[i].min) return TIERS[i];
  }
  return TIERS[0];
}

export class Doneness {
  heat: number;
  /** Multiplier on incoming heat (Thicker Casing lowers it). */
  heatTakenMult = 1;
  /** Passive cooling per second. */
  coolPerSec = 1;

  constructor(initialHeat = START_HEAT) {
    this.heat = clamp(initialHeat, 0, MAX_HEAT);
  }

  get tier(): DonenessTier {
    return tierFor(this.heat);
  }

  get isCharred(): boolean {
    return this.heat >= MAX_HEAT;
  }

  /** Adds heat (after resistance). Returns the heat actually applied. */
  addHeat(amount: number): number {
    if (this.isCharred || amount <= 0) return 0;
    const before = this.heat;
    this.heat = clamp(this.heat + amount * this.heatTakenMult, 0, MAX_HEAT);
    return this.heat - before;
  }

  /** Removes heat (passive cooling, condiment pickups, Ketchup Kiss). */
  cool(amount: number): void {
    if (this.isCharred || amount <= 0) return;
    this.heat = clamp(this.heat - amount, 0, MAX_HEAT);
  }

  tick(dtSec: number): void {
    this.cool(this.coolPerSec * dtSec);
  }

  static carryOver(heat: number): number {
    return Math.min(heat, MAX_HEAT - 1) * BETWEEN_WAVE_RETAIN;
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
