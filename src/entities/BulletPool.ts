import Phaser from 'phaser';
import { GAME_H, GAME_W } from '../art/textures';

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
}

export type ExplodeHandler = (x: number, y: number, radius: number, damage: number) => void;

export class PlayerBullet extends Phaser.Physics.Arcade.Image {
  damage = 0;
  pierceLeft = 0;
  poisonDps = 0;
  knockback = 0;
  explodeRadius = 0;
  lobTarget: { x: number; y: number } | null = null;
  onExplode: ExplodeHandler | null = null;
  readonly hitSet = new Set<Phaser.GameObjects.GameObject>();
  private dieAt = 0;

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
    this.hitSet.clear();
    this.dieAt = now + shot.lifetimeMs;
    this.setScale(1);
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
        this.onExplode?.(this.x, this.y, this.explodeRadius, this.damage);
        this.kill();
      }
      return;
    }
    if (time >= this.dieAt || isOffscreen(this.x, this.y)) this.kill();
  }

  kill(): void {
    this.disableBody(true, true);
  }
}

export class EnemyBullet extends Phaser.Physics.Arcade.Image {
  heat = 0;
  /** Optional per-frame steering in radians/sec, for curving spiral bullets. */
  curve = 0;
  private speed = 0;
  private dieAt = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, texture: string) {
    super(scene, x, y, texture);
  }

  fire(x: number, y: number, angle: number, speed: number, heat: number, texture: string, now: number, curve = 0): void {
    this.enableBody(true, x, y, true, true);
    this.dieAt = now + ENEMY_BULLET_LIFETIME_MS;
    this.setTexture(texture);
    this.setDepth(7);
    // Hitbox a bit smaller than the sprite: fair dodging.
    const r = this.width * 0.32;
    (this.body as Phaser.Physics.Arcade.Body).setCircle(r, this.width / 2 - r, this.height / 2 - r);
    this.speed = speed;
    this.heat = heat;
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
