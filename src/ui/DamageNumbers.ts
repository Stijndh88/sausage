import type Phaser from 'phaser';
import { FONT } from './Hud';

const POOL = 32;
const LIFE_MS = 480;
/** Normal hits show at most one number per this many ms (crits always show). */
const NORMAL_GAP_MS = 45;

interface Num {
  text: Phaser.GameObjects.Text;
  born: number;
  x: number;
  y: number;
}

/** Floating damage numbers from a fixed pool; animated by hand on the game clock (no tweens). */
export class DamageNumbers {
  private free: Phaser.GameObjects.Text[] = [];
  private live: Num[] = [];
  private lastNormal = -Infinity;

  constructor(scene: Phaser.Scene) {
    for (let i = 0; i < POOL; i++) {
      this.free.push(scene.add.text(0, 0, '', {
        fontFamily: FONT, fontSize: '15px', fontStyle: 'bold', color: '#ffffff', stroke: '#000000', strokeThickness: 3,
      }).setOrigin(0.5).setDepth(15).setVisible(false));
    }
  }

  spawn(x: number, y: number, amount: number, crit: boolean, now: number): void {
    if (!crit && now - this.lastNormal < NORMAL_GAP_MS) return;
    if (!crit) this.lastNormal = now;
    const text = this.free.pop() ?? this.live.shift()?.text;
    if (!text) return;
    text.setText(String(Math.round(amount))).setColor(crit ? '#ffd23f' : '#ffffff').setFontSize(crit ? 20 : 15);
    text.setVisible(true).setAlpha(1);
    const jx = (Math.random() - 0.5) * 16;
    this.live.push({ text, born: now, x: x + jx, y: y - 14 });
  }

  update(now: number): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const n = this.live[i];
      const t = (now - n.born) / LIFE_MS;
      if (t >= 1) {
        n.text.setVisible(false);
        this.free.push(n.text);
        this.live.splice(i, 1);
        continue;
      }
      n.text.setPosition(n.x, n.y - 26 * t).setAlpha(1 - t * t);
    }
  }
}
