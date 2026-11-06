import Phaser from 'phaser';
import {
  WEAPONS, tierCooldown, tierDamage, tierPierce, tierProjectiles, type WeaponDef,
} from '../data/weapons';
import { PlayerBullet, type ExplodeHandler } from '../entities/BulletPool';
import type { Enemy } from '../entities/Enemy';
import type { LinkChain } from '../entities/LinkChain';
import type { WeaponSlot } from '../state/run';

const DEG = Math.PI / 180;
export const POISON_MS = 2500;

export interface WeaponHooks {
  enemies(): Enemy[];
  /** Deal damage from a weapon. Returns nothing; the scene handles death. */
  damage(enemy: Enemy, amount: number, fromX: number, fromY: number, knockback: number): void;
  explode: ExplodeHandler;
}

interface Ring {
  slot: number;
  sprites: Phaser.GameObjects.Image[];
}

/** Fires every link's weapon automatically at the nearest enemy in range. */
export class WeaponSystem {
  private weapons: WeaponSlot[] = [];
  private nextFire: number[] = [];
  private rings: Ring[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly pool: Phaser.Physics.Arcade.Group,
    private readonly chain: LinkChain,
    private readonly hooks: WeaponHooks,
  ) {}

  setWeapons(weapons: readonly WeaponSlot[]): void {
    this.weapons = weapons.map((w) => ({ ...w }));
    const now = this.scene.time.now;
    // Stagger first shots so links don't all fire on the same frame.
    this.nextFire = this.weapons.map((_, i) => now + 300 + i * 90);
    for (const r of this.rings) r.sprites.forEach((s) => s.destroy());
    this.rings = [];
    this.weapons.forEach((w, slot) => {
      const def = WEAPONS[w.id];
      if (def.kind !== 'orbit') return;
      const n = tierProjectiles(def, w.tier);
      this.rings.push({
        slot,
        sprites: Array.from({ length: n }, () => this.scene.add.image(0, 0, def.bulletTexture).setDepth(8)),
      });
    });
  }

  update(now: number, damageMult: number, fireRateMult: number): void {
    const enemies = this.hooks.enemies();
    for (let slot = 0; slot < this.weapons.length; slot++) {
      const w = this.weapons[slot];
      const def = WEAPONS[w.id];
      const pos = this.chain.positions[slot];
      if (!pos || def.kind === 'orbit') continue;
      if (now < this.nextFire[slot]) continue;
      const target = nearest(enemies, pos.x, pos.y, def.range);
      if (!target) continue;
      this.nextFire[slot] = now + tierCooldown(def, w.tier) / fireRateMult;
      this.fire(def, w.tier, pos.x, pos.y, target, now, damageMult);
    }
    this.updateRings(now, enemies, damageMult, fireRateMult);
  }

  private fire(def: WeaponDef, tier: number, x: number, y: number, target: Enemy, now: number, damageMult: number): void {
    const angle = Math.atan2(target.y - y, target.x - x);
    const damage = tierDamage(def, tier) * damageMult;
    const lifetimeMs = (def.range / def.speed) * 1000 + 80;
    const count = tierProjectiles(def, tier);

    switch (def.kind) {
      case 'single':
      case 'pierce':
        this.shot({ x, y, angle, speed: def.speed, damage, texture: def.bulletTexture, lifetimeMs, pierce: tierPierce(def, tier), knockback: def.kind === 'pierce' ? 120 : 60 }, now);
        break;
      case 'cone':
      case 'shotgun': {
        const arc = def.spreadDeg * DEG;
        for (let i = 0; i < count; i++) {
          const a = angle - arc / 2 + (arc * i) / Math.max(1, count - 1) + (Math.random() - 0.5) * 0.08;
          const speed = def.speed * (0.85 + Math.random() * 0.3);
          this.shot({
            x, y, angle: a, speed, damage, texture: def.bulletTexture, lifetimeMs,
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
          explodeRadius: (def.explodeRadius ?? 60) * (1 + 0.1 * (tier - 1)),
          onExplode: this.hooks.explode,
        }, now);
        break;
      }
      case 'orbit':
        break;
    }
  }

  private shot(s: Parameters<PlayerBullet['fire']>[0], now: number): void {
    const b = this.pool.get(s.x, s.y) as PlayerBullet | null;
    if (b) b.fire(s, now);
  }

  private updateRings(now: number, enemies: Enemy[], damageMult: number, fireRateMult: number): void {
    for (const ring of this.rings) {
      const w = this.weapons[ring.slot];
      const def = WEAPONS[w.id];
      const pos = this.chain.positions[ring.slot];
      if (!pos) continue;
      const n = ring.sprites.length;
      const spin = (now / 1000) * def.speed * fireRateMult;
      const hitEvery = tierCooldown(def, w.tier) / fireRateMult;
      const damage = tierDamage(def, w.tier) * damageMult;
      for (let k = 0; k < n; k++) {
        const a = spin + (k * Math.PI * 2) / n;
        const rx = pos.x + Math.cos(a) * def.range;
        const ry = pos.y + Math.sin(a) * def.range;
        ring.sprites[k].setPosition(rx, ry).setRotation(a);
        for (const e of enemies) {
          if (e.dead) continue;
          const reach = e.def.radius + 9;
          if (Math.abs(e.x - rx) > reach || Math.abs(e.y - ry) > reach) continue;
          if (Math.hypot(e.x - rx, e.y - ry) > reach) continue;
          const key = ring.slot * 10 + k;
          const last = e.orbitHits.get(key) ?? -Infinity;
          if (now - last < hitEvery) continue;
          e.orbitHits.set(key, now);
          this.hooks.damage(e, damage, pos.x, pos.y, 140);
        }
      }
    }
  }

  destroy(): void {
    for (const r of this.rings) r.sprites.forEach((s) => s.destroy());
    this.rings = [];
  }
}

function nearest(enemies: Enemy[], x: number, y: number, range: number): Enemy | null {
  let best: Enemy | null = null;
  let bestD = range * range;
  for (const e of enemies) {
    if (e.dead || !e.active) continue;
    const d = (e.x - x) ** 2 + (e.y - y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}
