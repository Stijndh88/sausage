import Phaser from 'phaser';
import { GAME_H, GAME_W } from '../art/textures';
import { FONT, HUD_H } from './Hud';

const STICK_R = 64;
const KNOB_R = 26;

/** True on phones/tablets (or with ?touch=1 for testing). */
export function wantsTouchControls(game: Phaser.Game): boolean {
  try {
    if (new URLSearchParams(globalThis.location?.search ?? '').get('touch') === '1') return true;
    return game.device.input.touch && !!globalThis.matchMedia?.('(pointer: coarse)').matches;
  } catch {
    return false;
  }
}

/**
 * On-screen controls for touch screens: a floating stick on the left half of the screen,
 * and Dash / Pause buttons on the right.
 */
export class TouchControls {
  /** Current stick direction, length 0..1. */
  vector = { x: 0, y: 0 };
  private stickPointer: number | null = null;
  private origin = { x: 0, y: 0 };
  private readonly base: Phaser.GameObjects.Arc;
  private readonly knob: Phaser.GameObjects.Arc;

  constructor(scene: Phaser.Scene, onDash: () => void, onPause: () => void) {
    this.base = scene.add.circle(0, 0, STICK_R, 0xffffff, 0.12).setStrokeStyle(3, 0xffffff, 0.35).setDepth(80).setVisible(false);
    this.knob = scene.add.circle(0, 0, KNOB_R, 0xffffff, 0.4).setDepth(81).setVisible(false);

    const dash = scene.add.circle(GAME_W - 110, GAME_H - 110, 62, 0x8fd3ff, 0.25).setStrokeStyle(4, 0x8fd3ff, 0.8).setDepth(80)
      .setInteractive({ useHandCursor: false });
    scene.add.text(dash.x, dash.y, 'DASH', { fontFamily: FONT, fontSize: '20px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5).setDepth(81);
    dash.on('pointerdown', () => onDash());

    const pause = scene.add.circle(GAME_W - 46, HUD_H + 40, 26, 0x000000, 0.4).setStrokeStyle(2, 0xffffff, 0.7).setDepth(80).setInteractive();
    scene.add.text(pause.x, pause.y, 'II', { fontFamily: FONT, fontSize: '20px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5).setDepth(81);
    pause.on('pointerdown', () => onPause());

    scene.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.stickPointer !== null || p.x > GAME_W * 0.55 || p.y < HUD_H) return;
      this.stickPointer = p.id;
      this.origin = { x: p.x, y: p.y };
      this.base.setPosition(p.x, p.y).setVisible(true);
      this.knob.setPosition(p.x, p.y).setVisible(true);
    });
    scene.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (p.id !== this.stickPointer) return;
      const dx = p.x - this.origin.x;
      const dy = p.y - this.origin.y;
      const len = Math.hypot(dx, dy);
      const k = len > STICK_R ? STICK_R / len : 1;
      this.knob.setPosition(this.origin.x + dx * k, this.origin.y + dy * k);
      const mag = Math.min(1, len / STICK_R);
      this.vector = len < 6 ? { x: 0, y: 0 } : { x: (dx / len) * mag, y: (dy / len) * mag };
    });
    const release = (p: Phaser.Input.Pointer) => {
      if (p.id !== this.stickPointer) return;
      this.stickPointer = null;
      this.vector = { x: 0, y: 0 };
      this.base.setVisible(false);
      this.knob.setVisible(false);
    };
    scene.input.on('pointerup', release);
    scene.input.on('pointerupoutside', release);
  }
}
