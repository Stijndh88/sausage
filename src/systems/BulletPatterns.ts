import Phaser from 'phaser';
import { EnemyBullet } from '../entities/BulletPool';
import { audio } from '../audio/Audio';
import type { GameClock } from './clock';

/** Bullet-hell pattern helpers. All angles in radians. */
export class BulletPatterns {
  constructor(
    private readonly pool: Phaser.Physics.Arcade.Group,
    private readonly clock: GameClock,
  ) {}

  shoot(x: number, y: number, angle: number, speed: number, damage: number, texture: string, curve = 0): void {
    const b = this.pool.get(x, y) as EnemyBullet | null;
    if (!b) return;
    b.fire(x, y, angle, speed, damage, texture, this.clock.now(), curve);
  }

  /** `count` bullets fanned around `angle`. */
  spread(x: number, y: number, angle: number, count: number, arc: number, speed: number, damage: number, texture: string): void {
    audio.play('enemyShoot');
    if (count === 1) return this.shoot(x, y, angle, speed, damage, texture);
    const start = angle - arc / 2;
    const step = arc / (count - 1);
    for (let i = 0; i < count; i++) this.shoot(x, y, start + step * i, speed, damage, texture);
  }

  /** Full circle of bullets. `offset` rotates the ring so consecutive rings interleave. */
  ring(x: number, y: number, count: number, speed: number, damage: number, texture: string, offset = 0, curve = 0): void {
    audio.play('enemyShoot');
    const step = (Math.PI * 2) / count;
    for (let i = 0; i < count; i++) this.shoot(x, y, offset + step * i, speed, damage, texture, curve);
  }

  /** One "tick" of a multi-armed spiral. Call repeatedly while advancing `angle`. */
  spiral(x: number, y: number, angle: number, arms: number, speed: number, damage: number, texture: string): void {
    audio.play('enemyShoot');
    const step = (Math.PI * 2) / arms;
    for (let i = 0; i < arms; i++) this.shoot(x, y, angle + step * i, speed, damage, texture);
  }

  clear(): void {
    for (const b of this.pool.getChildren() as EnemyBullet[]) if (b.active) b.kill();
  }
}
