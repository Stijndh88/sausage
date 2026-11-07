import Phaser from 'phaser';
import { getInputMode } from './inputMode';
import { GAME_W } from '../art/textures';
import { FONT, HUD_H } from './Hud';
import { getSettings } from '../state/settings';
import { labelForCode, moveLabel } from './keyboardLayout';

type Point = { x: number; y: number };

/** What the tutorial can see about the fight each frame. */
export interface TutorialView {
  head: Point;
  movedPx: number;
  kills: number;
  hotTiles: readonly Phaser.Geom.Rectangle[];
  firstPickup(kind: 'crumb' | 'condiment'): Point | null;
  timeMs: number;
}

interface Step {
  id: string;
  text: string | (() => string);
  /** When to show; return the point to point at, or null to keep waiting. */
  when(v: TutorialView): Point | null;
  /** When it has been understood (or ignored long enough). */
  done(v: TutorialView, shownAt: number): boolean;
  /** Keep pointing at a moving target. */
  follow?(v: TutorialView): Point | null;
}

const STEPS: Step[] = [
  {
    id: 'move',
    text: () => {
      const mode = getInputMode();
      if (mode === 'pad') return 'Move with the left stick. (A) dashes.';
      if (mode === 'touch') {
        const dashSide = getSettings().dashSide;
        return `Drag on the ${dashSide === 'left' ? 'right' : 'left'} side to move. Tap the ${dashSide} side to dash.`;
      }
      const b = getSettings().keyBindings;
      return `Move with ${moveLabel(b)} or the arrows. ${labelForCode(b.dash[0])} dashes.`;
    },
    when: (v) => (v.timeMs > 1700 ? v.head : null),
    follow: (v) => v.head,
    done: (v, t) => v.movedPx > 260 || v.timeMs - t > 6500,
  },
  {
    id: 'hitbox', text: 'Only the white dot on your head can be hit.',
    when: (v) => v.head,
    follow: (v) => v.head,
    done: (v, t) => v.timeMs - t > 4500,
  },
  {
    id: 'auto', text: 'Your links fire on their own. Just stay alive!',
    when: (v) => v.head,
    follow: (v) => v.head,
    done: (v, t) => v.kills >= 3 || v.timeMs - t > 5000,
  },
  {
    id: 'grill', text: 'Red-hot grill tiles burn you. Stay off them.',
    when: (v) => {
      const near = v.hotTiles.find((r) => Phaser.Math.Distance.Between(r.centerX, r.centerY, v.head.x, v.head.y) < 260);
      return near ? { x: near.centerX, y: near.y } : null;
    },
    done: (v, t) => v.timeMs - t > 4500,
  },
  {
    id: 'crumbs', text: 'Grab crumbs to spend in the shop. Leftovers are only worth half.',
    when: (v) => v.firstPickup('crumb'),
    follow: (v) => v.firstPickup('crumb'),
    done: (v, t) => v.timeMs - t > 5000,
  },
  {
    id: 'condiment', text: 'Blue condiment packets heal you. At full HP they wait on the floor.',
    when: (v) => v.firstPickup('condiment'),
    follow: (v) => v.firstPickup('condiment'),
    done: (v, t) => v.timeMs - t > 4500 || !v.firstPickup('condiment'),
  },
];

/**
 * First-run tips during wave 1: one speech bubble at a time, pointing at what it explains.
 * Steps are shown in order; ones whose trigger never happens (no condiment dropped) are skipped
 * when the wave ends.
 */
export class Tutorial {
  private index = 0;
  private shownAt = -1;
  private bubble: Phaser.GameObjects.Container | null = null;
  private pointer: Point = { x: 0, y: 0 };
  readonly shown: string[] = [];

  constructor(private readonly scene: Phaser.Scene) {}

  get finished(): boolean {
    return this.index >= STEPS.length;
  }

  update(v: TutorialView): void {
    const step = STEPS[this.index];
    if (!step) return;
    if (this.shownAt < 0) {
      const at = step.when(v);
      if (!at) {
        // Optional steps (grill, condiment) shouldn't block the rest forever.
        if (step.id === 'condiment' && v.timeMs > 20000) this.next();
        return;
      }
      this.shownAt = v.timeMs;
      this.pointer = at;
      this.show(typeof step.text === 'function' ? step.text() : step.text);
      this.shown.push(step.id);
    } else {
      const p = step.follow?.(v);
      if (p) this.pointer = p;
      if (step.done(v, this.shownAt)) {
        this.next();
        return;
      }
    }
    this.place();
  }

  private next(): void {
    this.hide();
    this.index++;
    this.shownAt = -1;
  }

  private show(text: string): void {
    const s = this.scene;
    const label = s.add.text(0, 0, text, {
      fontFamily: FONT, fontSize: '16px', fontStyle: 'bold', color: '#1b1210', align: 'center', wordWrap: { width: 300 },
    }).setOrigin(0.5);
    const w = label.width + 28;
    const h = label.height + 18;
    const g = s.add.graphics();
    g.fillStyle(0xfff3d6, 0.96).fillRoundedRect(-w / 2, -h / 2, w, h, 10);
    g.lineStyle(2, 0xffb347, 1).strokeRoundedRect(-w / 2, -h / 2, w, h, 10);
    g.fillStyle(0xfff3d6, 0.96).fillTriangle(-9, h / 2 - 1, 9, h / 2 - 1, 0, h / 2 + 12);
    this.bubble = s.add.container(0, 0, [g, label]).setDepth(70).setAlpha(0);
    this.bubble.setSize(w, h);
    s.tweens.add({ targets: this.bubble, alpha: 1, duration: 180 });
  }

  /** Keep the bubble above its target and inside the arena. */
  private place(): void {
    const b = this.bubble;
    if (!b) return;
    const halfW = b.width / 2;
    const x = Phaser.Math.Clamp(this.pointer.x, halfW + 8, GAME_W - halfW - 8);
    const y = Math.max(HUD_H + b.height / 2 + 8, this.pointer.y - 40 - b.height / 2);
    b.setPosition(x, y);
  }

  hide(): void {
    if (!this.bubble) return;
    const b = this.bubble;
    this.bubble = null;
    this.scene.tweens.killTweensOf(b);
    this.scene.tweens.add({ targets: b, alpha: 0, duration: 150, onComplete: () => b.destroy() });
  }
}
