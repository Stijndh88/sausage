import Phaser from 'phaser';
import {
  WEAPONS, tierCooldown, tierDamage, tierPierce, tierProjectiles, type WeaponDef,
} from '../data/weapons';
import { PlayerBullet, type ExplodeHandler } from '../entities/BulletPool';
import type { Enemy } from '../entities/Enemy';
import type { LinkChain } from '../entities/LinkChain';
import type { WeaponSlot } from '../state/run';
import { audio } from '../audio/Audio';
import type { GameClock } from './clock';

const DEG = Math.PI / 180;
export const POISON_MS = 2500;
/** A shot this late (at most ~one long frame) keeps its rhythm; later than that it restarts. */
const MAX_CARRY_MS = 100;

export interface WeaponHooks {
  enemies(): Enemy[];
  /** The sausage's head: where a boomerang goes if its link is gone. */
  head(): { x: number; y: number };
  /** Item effects that change how weapons fire. */
  mods(): { explosionRadiusMult: number; extraProjectiles: number; pierce: number };
  /** Deal damage from a weapon. Returns nothing; the scene handles death. */
  damage(enemy: Enemy, amount: number, fromX: number, fromY: number, knockback: number): void;
  explode: ExplodeHandler;
}

/** Fires every link's weapon automatically at the nearest enemy in range. */
export class WeaponSystem {
  private weapons: WeaponSlot[] = [];
  private nextFire: number[] = [];

  constructor(
    private readonly pool: Phaser.Physics.Arcade.Group,
    private readonly chain: LinkChain,
    private readonly clock: GameClock,
    private readonly hooks: WeaponHooks,
  ) {}

  setWeapons(weapons: readonly WeaponSlot[]): void {
    this.weapons = weapons.map((w) => ({ ...w }));
    const now = this.clock.now();
    // Stagger first shots so links don't all fire on the same frame.
    this.nextFire = this.weapons.map((_, i) => now + 300 + i * 90);
  }

  update(now: number, damageMult: number, fireRateMult: number): void {
    const enemies = this.hooks.enemies();
    for (let slot = 0; slot < this.weapons.length; slot++) {
      const w = this.weapons[slot];
      const def = WEAPONS[w.id];
      const pos = this.chain.positions[slot];
      if (!pos) continue;
      if (now < this.nextFire[slot]) continue;
      const target = nearest(enemies, pos.x, pos.y, def.range);
      if (!target) continue;
      // Carry the frame-rounding leftover so fire rate doesn't depend on frame rate, but if the
      // weapon sat idle (no target) restart from now instead of banking shots.
      const late = now - this.nextFire[slot];
      const base = late <= MAX_CARRY_MS ? this.nextFire[slot] : now;
      this.nextFire[slot] = base + tierCooldown(def, w.tier) / fireRateMult;
      this.fire(def, w.tier, slot, pos.x, pos.y, target, now, damageMult);
    }
  }

  private fire(def: WeaponDef, tier: number, slot: number, x: number, y: number, target: Enemy, now: number, damageMult: number): void {
    const angle = Math.atan2(target.y - y, target.x - x);
    const damage = tierDamage(def, tier) * damageMult;
    const lifetimeMs = (def.range / def.speed) * 1000 + 80;
    const spread = def.kind === 'cone' || def.kind === 'shotgun';
    const mods = this.hooks.mods();
    const count = tierProjectiles(def, tier) + (spread ? mods.extraProjectiles : 0);
    // Sharp Cheddar: straight shots pass through extra enemies (lobs explode, boomerangs already pass through all).
    const pierce = (p: number) => p + mods.pierce;

    audio.play(`shoot_${def.kind}`);
    switch (def.kind) {
      case 'single':
      case 'pierce':
        this.shot({ x, y, angle, speed: def.speed, damage, texture: def.bulletTexture, lifetimeMs, pierce: pierce(tierPierce(def, tier)), knockback: def.kind === 'pierce' ? 120 : 60 }, now);
        break;
      case 'cone':
      case 'shotgun': {
        const arc = def.spreadDeg * DEG;
        for (let i = 0; i < count; i++) {
          const a = angle - arc / 2 + (arc * i) / Math.max(1, count - 1) + (Math.random() - 0.5) * 0.08;
          const speed = def.speed * (0.85 + Math.random() * 0.3);
          this.shot({
            x, y, angle: a, speed, damage, texture: def.bulletTexture, lifetimeMs,
            pierce: pierce(0),
            poisonDps: def.poisonDps ? def.poisonDps * (1 + 0.5 * (tier - 1)) * damageMult : 0,
            knockback: def.kind === 'shotgun' ? 90 : 20,
          }, now);
        }
        break;
      }
      case 'lob': {
        const dist = Math.hypot(target.x - x, target.y - y);
        this.shot({
          x, y, angle, speed: def.speed, damage, texture: def.bulletTexture,
          lifetimeMs: (dist / def.speed) * 1000 + 50,
          lobTarget: { x: target.x, y: target.y },
          explodeRadius: (def.explodeRadius ?? 60) * (1 + 0.1 * (tier - 1)) * mods.explosionRadiusMult,
          onExplode: this.hooks.explode,
        }, now);
        break;
      }
      case 'boomerang': {
        // Flies out through everything, then homes back to its link (which keeps moving).
        const home = () => this.chain.positions[slot] ?? this.hooks.head();
        for (let i = 0; i < count; i++) {
          const a = angle + (i - (count - 1) / 2) * 0.35;
          this.shot({
            x, y, angle: a, speed: def.speed, damage, texture: def.bulletTexture,
            lifetimeMs: (def.range / def.speed) * 1000 * 4 + 1000,
            boomerang: { outMs: (def.range / def.speed) * 1000, home },
            knockback: 40,
          }, now);
        }
        break;
      }
    }
  }

  private shot(s: Parameters<PlayerBullet['fire']>[0], now: number): void {
    const b = this.pool.get(s.x, s.y) as PlayerBullet | null;
    if (b) b.fire(s, now);
  }

  destroy(): void {
    this.weapons = [];
  }
}

/**
 * Ranged enemies (ketchup, hot sauce) count as this much closer when picking a target, so
 * links don't ignore the shooters behind a wall of forks. Squared, since we compare squared distances.
 */
export const RANGED_TARGET_BIAS = 0.65;
const RANGED_BIAS_SQ = RANGED_TARGET_BIAS * RANGED_TARGET_BIAS;

export function nearest(enemies: readonly Enemy[], x: number, y: number, range: number): Enemy | null {
  let best: Enemy | null = null;
  let bestScore = Infinity;
  const r2 = range * range;
  for (const e of enemies) {
    if (e.dead || !e.active) continue;
    const d = (e.x - x) ** 2 + (e.y - y) ** 2;
    if (d > r2) continue;
    const score = e.def.melee || e.isBoss ? d : d * RANGED_BIAS_SQ;
    if (score < bestScore) {
      bestScore = score;
      best = e;
    }
  }
  return best;
}
