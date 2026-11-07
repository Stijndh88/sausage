import Phaser from 'phaser';
import type { GameClock } from '../systems/clock';

export const BASE_SPEED = 235;
const DASH_SPEED_MULT = 3.2;
const DASH_MS = 170;
export const HIT_INVULN_MS = 750;

/** The player. Only the head can be hit; its hitbox is the small dot in the middle. */
export class SausageHead extends Phaser.Physics.Arcade.Sprite {
  facing = 0;
  private invulnUntil = 0;
  private dashUntil = 0;
  private dashReadyAt = 0;
  private dashAngle = 0;
  private readonly dot: Phaser.GameObjects.Image;

  /** `scale` shrinks the head and its hitbox together (the Cocktail Sausage is tiny). */
  constructor(scene: Phaser.Scene, x: number, y: number, private readonly clock: GameClock, scale = 1) {
    super(scene, x, y, 'sausage-head');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    // Scale before the circle: Arcade sizes the circle by the sprite's scale, offsets stay in texture pixels.
    this.setScale(scale);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setCircle(8, this.width / 2 - 8, this.height / 2 - 8);
    body.setCollideWorldBounds(true);
    this.setDepth(10);
    this.dot = scene.add.image(x, y, 'hitbox').setDepth(11).setAlpha(0.85).setScale(Math.max(0.7, scale));
  }

  get isDashing(): boolean {
    return this.clock.now() < this.dashUntil;
  }

  get invulnerable(): boolean {
    const now = this.clock.now();
    return now < this.invulnUntil || now < this.dashUntil;
  }

  /** 0..1, how charged the dash is. */
  dashCharge(cooldownMs: number): number {
    const remaining = this.dashReadyAt - this.clock.now();
    return remaining <= 0 ? 1 : 1 - remaining / cooldownMs;
  }

  /** Moves the head. Returns true on the frame a dash starts. */
  drive(ix: number, iy: number, speedMult: number, wantDash: boolean, dashCooldownMs: number): boolean {
    let dashed = false;
    const now = this.clock.now();
    const len = Math.hypot(ix, iy);
    const moving = len > 0.01;
    if (moving) {
      ix /= len;
      iy /= len;
    }
    if (wantDash && now >= this.dashReadyAt) {
      this.dashAngle = moving ? Math.atan2(iy, ix) : this.facing;
      this.dashUntil = now + DASH_MS;
      this.dashReadyAt = now + dashCooldownMs;
      dashed = true;
    }
    const speed = BASE_SPEED * speedMult;
    if (now < this.dashUntil) {
      this.setVelocity(Math.cos(this.dashAngle) * speed * DASH_SPEED_MULT, Math.sin(this.dashAngle) * speed * DASH_SPEED_MULT);
    } else {
      this.setVelocity(ix * speed, iy * speed);
    }
    if (moving) {
      const target = Math.atan2(iy, ix);
      this.facing = Phaser.Math.Angle.RotateTo(this.facing, target, 0.25);
    }
    this.setRotation(this.facing);

    // Blink while invulnerable after a hit.
    const blinking = now < this.invulnUntil;
    this.setAlpha(blinking && Math.floor(now / 70) % 2 === 0 ? 0.4 : 1);
    this.dot.setPosition(this.x, this.y);
    return dashed;
  }

  markHit(ms: number = HIT_INVULN_MS): void {
    this.invulnUntil = Math.max(this.invulnUntil, this.clock.now() + ms);
  }

  halt(): void {
    this.setVelocity(0, 0);
  }

  destroy(fromScene?: boolean): void {
    this.dot?.destroy();
    super.destroy(fromScene);
  }
}
