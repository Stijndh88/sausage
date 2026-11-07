import Phaser from 'phaser';
import { GAME_H, GAME_W } from '../art/textures';
import type { SourceKey } from '../state/runLog';

const OFFSCREEN_MARGIN = 40;
/** Enemy bullets die after this long even if still on screen (curving bullets can loop forever). */
export const ENEMY_BULLET_LIFETIME_MS = 9000;

export interface PlayerShot {
  x: number;
  y: number;
  angle: number;
  speed: number;
  damage: number;
  texture: string;
  lifetimeMs: number;
  pierce?: number;
  poisonDps?: number;
  /** For lobbed shots: explode at the target instead of hitting things in flight. */
  lobTarget?: { x: number; y: number };
  explodeRadius?: number;
  onExplode?: ExplodeHandler;
  knockback?: number;
  /** Who fired it, for the run stats (see state/runLog.ts). */
  src?: SourceKey;
  /** Boomerang: fly out for `outMs`, then home back to `home()`; pierces everything, and can hit each enemy again on the way back. */
  boomerang?: { outMs: number; home: () => { x: number; y: number } };
}

/** Boomerangs slow down to this fraction of their speed at the turn, then speed up on the way back. */
const BOOMERANG_MIN_SPEED = 0.2;
const BOOMERANG_RETURN_SPEED = 1.25;
/** A returning boomerang this close to its link is caught. */
const BOOMERANG_CATCH_PX = 22;

export type ExplodeHandler = (x: number, y: number, radius: number, damage: number, src: SourceKey) => void;

export class PlayerBullet extends Phaser.Physics.Arcade.Image {
  damage = 0;
  pierceLeft = 0;
  poisonDps = 0;
  knockback = 0;
  explodeRadius = 0;
  lobTarget: { x: number; y: number } | null = null;
  onExplode: ExplodeHandler | null = null;
  src: SourceKey = 'other';
  readonly hitSet = new Set<Phaser.GameObjects.GameObject>();
  private dieAt = 0;
  private speed = 0;
  private home: (() => { x: number; y: number }) | null = null;
  private firedAt = 0;
  private turnAt = 0;
  /** Set once a boomerang has turned around. */
  returning = false;

  constructor(scene: Phaser.Scene, x: number, y: number, texture: string) {
    super(scene, x, y, texture);
  }

  fire(shot: PlayerShot, now: number): void {
    this.enableBody(true, shot.x, shot.y, true, true);
    this.setTexture(shot.texture);
    this.setDepth(6);
    this.setRotation(shot.angle);
    const r = Math.max(3, Math.min(this.width, this.height) / 2 + 1);
    (this.body as Phaser.Physics.Arcade.Body).setCircle(r, this.width / 2 - r, this.height / 2 - r);
    this.scene.physics.velocityFromRotation(shot.angle, shot.speed, (this.body as Phaser.Physics.Arcade.Body).velocity);
    this.damage = shot.damage;
    this.pierceLeft = shot.pierce ?? 0;
    this.poisonDps = shot.poisonDps ?? 0;
    this.knockback = shot.knockback ?? 60;
    this.explodeRadius = shot.explodeRadius ?? 0;
    this.lobTarget = shot.lobTarget ?? null;
    this.onExplode = shot.onExplode ?? null;
    this.src = shot.src ?? 'other';
    this.hitSet.clear();
    this.dieAt = now + shot.lifetimeMs;
    this.setScale(1);
    this.speed = shot.speed;
    this.home = shot.boomerang?.home ?? null;
    this.firedAt = now;
    this.turnAt = now + (shot.boomerang?.outMs ?? 0);
    this.returning = false;
    if (this.home) this.pierceLeft = Number.POSITIVE_INFINITY;
  }

  /** Lobbed shots don't collide in flight. */
  get collides(): boolean {
    return this.lobTarget === null;
  }

  /** Called by the Game scene each unpaused frame with game time. */
  update(time: number, delta: number): void {
    if (!this.active) return;
    if (this.lobTarget) {
      // Fake an arc by scaling up then down.
      this.rotation += 15 * (delta / 1000);
      const total = Math.hypot(this.lobTarget.x - this.x, this.lobTarget.y - this.y);
      this.setScale(1 + Math.min(0.6, total / 400));
      if (total < 12 || time >= this.dieAt) {
        this.onExplode?.(this.x, this.y, this.explodeRadius, this.damage, this.src);
        this.kill();
      }
      return;
    }
    if (this.home) {
      this.updateBoomerang(time, delta);
      return;
    }
    if (time >= this.dieAt || isOffscreen(this.x, this.y)) this.kill();
  }

  private updateBoomerang(time: number, delta: number): void {
    this.rotation += 14 * (delta / 1000);
    const body = this.body as Phaser.Physics.Arcade.Body;
    if (!this.returning && time >= this.turnAt) {
      this.returning = true;
      // A fresh pass: everything can be hit once more on the way back.
      this.hitSet.clear();
    }
    if (!this.returning) {
      // Ease out: full speed at the throw, slow at the turn.
      const left = 1 - (time - this.firedAt) / Math.max(1, this.turnAt - this.firedAt);
      const v = Math.hypot(body.velocity.x, body.velocity.y) || 1;
      const speed = this.speed * Math.max(BOOMERANG_MIN_SPEED, left);
      body.velocity.set((body.velocity.x / v) * speed, (body.velocity.y / v) * speed);
    } else {
      const target = this.home!();
      const dx = target.x - this.x;
      const dy = target.y - this.y;
      const dist = Math.hypot(dx, dy);
      if (dist < BOOMERANG_CATCH_PX) {
        this.kill();
        return;
      }
      const ramp = Math.min(1, (time - this.turnAt) / 300);
      const speed = this.speed * (BOOMERANG_MIN_SPEED + (BOOMERANG_RETURN_SPEED - BOOMERANG_MIN_SPEED) * ramp);
      body.velocity.set((dx / dist) * speed, (dy / dist) * speed);
    }
    if (time >= this.dieAt) this.kill();
  }

  kill(): void {
    this.disableBody(true, true);
  }
}

const BULLET_SOURCES: Record<string, string> = {
  'eb-ketchup': 'Ketchup Bottle',
  'eb-hot': 'Hot Sauce',
  'eb-boss': "The Grill Master's Tongs",
};

export class EnemyBullet extends Phaser.Physics.Arcade.Image {
  damage = 0;
  /** Optional per-frame steering in radians/sec, for curving spiral bullets. */
  curve = 0;
  private speed = 0;
  private dieAt = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, texture: string) {
    super(scene, x, y, texture);
  }

  fire(x: number, y: number, angle: number, speed: number, damage: number, texture: string, now: number, curve = 0): void {
    this.enableBody(true, x, y, true, true);
    this.dieAt = now + ENEMY_BULLET_LIFETIME_MS;
    this.setTexture(texture);
    this.setDepth(7);
    // Hitbox a bit smaller than the sprite: fair dodging.
    const r = this.width * 0.32;
    (this.body as Phaser.Physics.Arcade.Body).setCircle(r, this.width / 2 - r, this.height / 2 - r);
    this.speed = speed;
    this.damage = damage;
    this.curve = curve;
    this.setRotation(angle);
    this.scene.physics.velocityFromRotation(angle, speed, (this.body as Phaser.Physics.Arcade.Body).velocity);
  }

  /** Called by the Game scene each unpaused frame with game time. */
  update(time: number, delta: number): void {
    if (!this.active) return;
    if (time >= this.dieAt) {
      this.kill();
      return;
    }
    if (this.curve !== 0) {
      this.rotation += this.curve * (delta / 1000);
      this.scene.physics.velocityFromRotation(this.rotation, this.speed, (this.body as Phaser.Physics.Arcade.Body).velocity);
    }
    if (isOffscreen(this.x, this.y)) this.kill();
  }

  kill(): void {
    this.disableBody(true, true);
  }

  /** Who fired it, for the Game Over screen. */
  get source(): string {
    return BULLET_SOURCES[this.texture.key] ?? 'A stray bullet';
  }
}

function isOffscreen(x: number, y: number): boolean {
  return x < -OFFSCREEN_MARGIN || y < -OFFSCREEN_MARGIN || x > GAME_W + OFFSCREEN_MARGIN || y > GAME_H + OFFSCREEN_MARGIN;
}

export function createPlayerBulletPool(scene: Phaser.Scene): Phaser.Physics.Arcade.Group {
  return scene.physics.add.group({
    classType: PlayerBullet,
    defaultKey: 'pb-toothpick',
    maxSize: 600,
  });
}

export function createEnemyBulletPool(scene: Phaser.Scene): Phaser.Physics.Arcade.Group {
  return scene.physics.add.group({
    classType: EnemyBullet,
    defaultKey: 'eb-ketchup',
    maxSize: 900,
  });
}
