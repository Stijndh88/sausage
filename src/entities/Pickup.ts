import Phaser from 'phaser';
import type { GameClock } from '../systems/clock';

export type PickupKind = 'crumb' | 'condiment';

interface Drop {
  img: Phaser.GameObjects.Image;
  kind: PickupKind;
  vx: number;
  vy: number;
  magnet: boolean;
  expiresAt: number;
}

const MAGNET_SPEED = 620;
const COLLECT_RADIUS = 18;
const CONDIMENT_LIFETIME_MS = 9000;

/** Crumbs (currency) and condiment packets (cool you down). Simple pooled images. */
export class Pickups {
  private drops: Drop[] = [];
  private pool: Phaser.GameObjects.Image[] = [];

  constructor(private readonly scene: Phaser.Scene, private readonly clock: GameClock) {}

  spawnCrumbs(x: number, y: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 40 + Math.random() * 90;
      this.add('crumb', x, y, Math.cos(a) * s, Math.sin(a) * s, Infinity);
    }
  }

  spawnCondiment(x: number, y: number): void {
    this.add('condiment', x, y, 0, -30, this.clock.now() + CONDIMENT_LIFETIME_MS);
  }

  update(dt: number, px: number, py: number, radius: number, collect: (kind: PickupKind) => void): void {
    const now = this.clock.now();
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      const dx = px - d.img.x;
      const dy = py - d.img.y;
      const dist = Math.hypot(dx, dy);
      if (dist < radius) d.magnet = true;
      if (d.magnet) {
        d.vx = (dx / (dist || 1)) * MAGNET_SPEED;
        d.vy = (dy / (dist || 1)) * MAGNET_SPEED;
      } else {
        const f = Math.max(0, 1 - 5 * dt);
        d.vx *= f;
        d.vy *= f;
      }
      d.img.x += d.vx * dt;
      d.img.y += d.vy * dt;
      if (dist < COLLECT_RADIUS) {
        collect(d.kind);
        this.remove(i);
        continue;
      }
      if (now > d.expiresAt) {
        this.remove(i);
        continue;
      }
      if (d.kind === 'condiment') {
        const left = d.expiresAt - now;
        d.img.setAlpha(left < 2500 && Math.floor(now / 120) % 2 === 0 ? 0.3 : 1);
        d.img.setScale(1 + Math.sin(now / 160) * 0.08);
      }
    }
  }

  /** End of wave: everything left on the floor is yours. */
  collectAll(collect: (kind: PickupKind) => void): void {
    for (let i = this.drops.length - 1; i >= 0; i--) {
      if (this.drops[i].kind === 'crumb') collect('crumb');
      this.remove(i);
    }
  }

  private add(kind: PickupKind, x: number, y: number, vx: number, vy: number, expiresAt: number): void {
    const img = this.pool.pop() ?? this.scene.add.image(0, 0, kind);
    img.setTexture(kind).setPosition(x, y).setVisible(true).setActive(true).setAlpha(1).setScale(1).setDepth(3);
    img.setRotation(Math.random() * Math.PI * 2);
    if (kind === 'condiment') img.setRotation(0);
    this.drops.push({ img, kind, vx, vy, magnet: false, expiresAt });
  }

  private remove(i: number): void {
    const d = this.drops[i];
    d.img.setVisible(false).setActive(false);
    this.pool.push(d.img);
    this.drops[i] = this.drops[this.drops.length - 1];
    this.drops.pop();
  }
}
