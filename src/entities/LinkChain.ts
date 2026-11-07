import Phaser from 'phaser';
import { MOST_LINKS } from '../data/sausages';
import { WEAPONS, tierLabel } from '../data/weapons';
import type { WeaponSlot } from '../state/run';
import { Trail, type TrailPoint } from '../systems/Trail';

export const FIRST_LINK_GAP = 27;
export const LINK_GAP = 24;
export const LINK_RADIUS = 12;

interface LinkView {
  body: Phaser.GameObjects.Image;
  icon: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
}

/**
 * The sausage's body: a chain of links following the head's path. Each link carries one weapon.
 * Links can't be hurt; they're where your weapons fire from.
 */
export class LinkChain {
  // Room for the longest sausage (the Kielbasa has 8 links).
  readonly trail = new Trail(2, FIRST_LINK_GAP + LINK_GAP * MOST_LINKS + 40);
  readonly positions: TrailPoint[] = [];
  private views: LinkView[] = [];

  /** `scale` shrinks the links and the gaps between them (the Cocktail Sausage is tiny). */
  constructor(private readonly scene: Phaser.Scene, x: number, y: number, angle: number, readonly scale = 1) {
    this.trail.prefill(x, y, angle);
  }

  /** Hit radius of one link. */
  get radius(): number {
    return LINK_RADIUS * this.scale;
  }

  setWeapons(weapons: readonly WeaponSlot[]): void {
    for (const v of this.views) {
      v.body.destroy();
      v.icon.destroy();
      v.label.destroy();
    }
    this.views = weapons.map((w, i) => ({
      body: this.scene.add.image(0, 0, 'sausage-link').setDepth(9 - i * 0.01).setScale(this.scale),
      icon: this.scene.add.image(0, 0, WEAPONS[w.id].icon).setDepth(9.5).setScale(Math.max(0.8, this.scale)),
      label: this.scene.add
        .text(0, 0, tierLabel(w.tier), { fontFamily: 'monospace', fontSize: '10px', color: '#fff6d8', stroke: '#2a120a', strokeThickness: 3 })
        .setOrigin(0.5)
        .setDepth(9.6)
        .setVisible(w.tier > 1),
    }));
    this.positions.length = 0;
    for (let i = 0; i < weapons.length; i++) this.positions.push({ x: 0, y: 0, angle: 0 });
  }

  update(headX: number, headY: number, tint: number, time: number): void {
    this.trail.push(headX, headY);
    for (let i = 0; i < this.views.length; i++) {
      const p = this.trail.sample((FIRST_LINK_GAP + LINK_GAP * i) * this.scale);
      this.positions[i] = p;
      const v = this.views[i];
      // A tiny wiggle makes the chain feel alive.
      const wob = Math.sin(time / 140 + i * 0.9) * 0.06;
      v.body.setPosition(p.x, p.y).setRotation(p.angle + wob).setTint(tint);
      v.icon.setPosition(p.x, p.y);
      v.label.setPosition(p.x, p.y + 13 * this.scale);
    }
  }

  destroy(): void {
    this.setWeapons([]);
  }
}
