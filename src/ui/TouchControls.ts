import Phaser from 'phaser';
import { GAME_H, GAME_W } from '../art/textures';
import { getSettings } from '../state/settings';
import { FONT, HUD_H } from './Hud';
import { getInputMode, onInputModeChange } from './inputMode';

const STICK_R = 70;
const KNOB_R = 28;
const DASH_R = 70;
const PAUSE_R = 34;
/** Where the stick half ends and the dash half begins, as a share of the screen width. */
const SPLIT = 0.5;

export interface TouchCallbacks {
  dash(): void;
  pause(): void;
  /** While paused the overlay menus own the screen; the touch layer ignores taps. */
  isPaused(): boolean;
}

/**
 * On-screen controls for touch screens, shown whenever the player is playing by touch.
 *
 * - Move: put a thumb down anywhere on the stick half and drag. The stick appears under the
 *   thumb and follows it if you drag past the rim, so reversing direction is instant.
 * - Dash: tap anywhere on the other half (the DASH circle just marks it and shows the cooldown).
 * - Pause: the II button, top right.
 *
 * Settings → "Dash button" swaps the halves for left-handed play.
 */
export class TouchControls {
  /** Current stick direction, length 0..1. */
  vector = { x: 0, y: 0 };
  private stickPointer: number | null = null;
  private origin = { x: 0, y: 0 };
  private readonly base: Phaser.GameObjects.Arc;
  private readonly knob: Phaser.GameObjects.Arc;
  private readonly dashBtn: Phaser.GameObjects.Arc;
  private readonly dashRing: Phaser.GameObjects.Graphics;
  private readonly dashLabel: Phaser.GameObjects.Text;
  private readonly pauseBtn: Phaser.GameObjects.Arc;
  private readonly pauseLabel: Phaser.GameObjects.Text;
  private readonly ghost: Phaser.GameObjects.Arc;
  private dashOnLeft = false;
  private charge = 1;

  constructor(private readonly scene: Phaser.Scene, private readonly cb: TouchCallbacks) {
    this.base = scene.add.circle(0, 0, STICK_R, 0xffffff, 0.12).setStrokeStyle(3, 0xffffff, 0.35).setDepth(80).setVisible(false);
    this.knob = scene.add.circle(0, 0, KNOB_R, 0xffffff, 0.4).setDepth(81).setVisible(false);
    // A faint resting stick so new players see where to put their thumb.
    this.ghost = scene.add.circle(0, 0, STICK_R, 0xffffff, 0.05).setStrokeStyle(2, 0xffffff, 0.18).setDepth(80);

    this.dashBtn = scene.add.circle(0, 0, DASH_R, 0x8fd3ff, 0.22).setStrokeStyle(4, 0x8fd3ff, 0.75).setDepth(80);
    this.dashRing = scene.add.graphics().setDepth(81);
    this.dashLabel = scene.add.text(0, 0, 'DASH', { fontFamily: FONT, fontSize: '22px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5).setDepth(81);

    this.pauseBtn = scene.add.circle(GAME_W - 54, HUD_H + 48, PAUSE_R, 0x000000, 0.45).setStrokeStyle(2, 0xffffff, 0.7).setDepth(80);
    this.pauseLabel = scene.add.text(this.pauseBtn.x, this.pauseBtn.y, 'II', { fontFamily: FONT, fontSize: '22px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5).setDepth(81);

    this.layout();
    this.applyVisibility();
    const offMode = onInputModeChange(() => this.applyVisibility());
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, offMode);

    scene.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.down(p));
    scene.input.on('pointermove', (p: Phaser.Input.Pointer) => this.move(p));
    const release = (p: Phaser.Input.Pointer) => {
      if (p.id === this.stickPointer) this.releaseStick();
    };
    scene.input.on('pointerup', release);
    scene.input.on('pointerupoutside', release);
  }

  /** Whether the on-screen controls are showing (they hide while you use keys or a pad). */
  get shown(): boolean {
    return this.dashBtn.visible;
  }

  /** Call each frame with the dash charge (0..1) to fill the cooldown ring. */
  update(dashCharge: number): void {
    const side = getSettings().dashSide === 'left';
    if (side !== this.dashOnLeft) this.layout();
    const c = Math.min(1, dashCharge);
    if (c === this.charge || (c < 1 && Math.abs(c - this.charge) < 0.01)) return;
    this.charge = c;
    dashCharge = c;
    const ready = dashCharge >= 1;
    this.dashRing.clear();
    if (!ready) {
      this.dashRing.lineStyle(7, 0xffffff, 0.85);
      this.dashRing.beginPath();
      this.dashRing.arc(this.dashBtn.x, this.dashBtn.y, DASH_R + 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * dashCharge);
      this.dashRing.strokePath();
    }
    this.dashBtn.setFillStyle(0x8fd3ff, ready ? 0.3 : 0.1);
    this.dashLabel.setAlpha(ready ? 1 : 0.5);
  }

  private inStickHalf(x: number): boolean {
    return this.dashOnLeft ? x > GAME_W * (1 - SPLIT) : x < GAME_W * SPLIT;
  }

  private layout(): void {
    this.dashOnLeft = getSettings().dashSide === 'left';
    const dx = this.dashOnLeft ? 120 : GAME_W - 120;
    const sx = this.dashOnLeft ? GAME_W - 200 : 200;
    this.dashBtn.setPosition(dx, GAME_H - 120);
    this.dashLabel.setPosition(dx, GAME_H - 120);
    this.ghost.setPosition(sx, GAME_H - 160);
    this.charge = -1; // redraw the ring at the new spot
  }

  private applyVisibility(): void {
    const on = getInputMode() === 'touch';
    for (const o of [this.dashBtn, this.dashRing, this.dashLabel, this.pauseBtn, this.pauseLabel]) o.setVisible(on);
    this.ghost.setVisible(on && this.stickPointer === null);
    if (!on) this.releaseStick();
  }

  /** Only real touches drive the stick (or anything while in touch mode, e.g. ?touch=1 tests). */
  private accepts(p: Phaser.Input.Pointer): boolean {
    return p.wasTouch || getInputMode() === 'touch';
  }

  private down(p: Phaser.Input.Pointer): void {
    if (!this.accepts(p) || this.cb.isPaused()) return;
    // World coordinates: the camera is zoomed by the render scale, so screen pixels ≠ game units.
    p.updateWorldPoint(this.scene.cameras.main);
    const x = p.worldX;
    const y = p.worldY;
    if (Phaser.Math.Distance.Between(x, y, this.pauseBtn.x, this.pauseBtn.y) < PAUSE_R + 16) {
      this.cb.pause();
      return;
    }
    if (y < HUD_H) return;
    if (!this.inStickHalf(x)) {
      this.cb.dash();
      this.scene.tweens.add({ targets: this.dashBtn, scale: { from: 0.88, to: 1 }, duration: 120 });
      return;
    }
    if (this.stickPointer !== null) return;
    this.stickPointer = p.id;
    this.origin = { x, y };
    this.base.setPosition(x, y).setVisible(true);
    this.knob.setPosition(x, y).setVisible(true);
    this.ghost.setVisible(false);
  }

  private move(p: Phaser.Input.Pointer): void {
    if (p.id !== this.stickPointer) return;
    p.updateWorldPoint(this.scene.cameras.main);
    let dx = p.worldX - this.origin.x;
    let dy = p.worldY - this.origin.y;
    let len = Math.hypot(dx, dy);
    if (len > STICK_R) {
      // Drag the stick along with the thumb, so pulling back the other way responds at once.
      const pull = (len - STICK_R) / len;
      this.origin.x += dx * pull;
      this.origin.y += dy * pull;
      this.base.setPosition(this.origin.x, this.origin.y);
      dx = p.worldX - this.origin.x;
      dy = p.worldY - this.origin.y;
      len = STICK_R;
    }
    this.knob.setPosition(this.origin.x + dx, this.origin.y + dy);
    const mag = Math.min(1, len / STICK_R);
    this.vector = len < 6 ? { x: 0, y: 0 } : { x: (dx / len) * mag, y: (dy / len) * mag };
  }

  private releaseStick(): void {
    this.stickPointer = null;
    this.vector = { x: 0, y: 0 };
    this.base.setVisible(false);
    this.knob.setVisible(false);
    this.ghost.setVisible(getInputMode() === 'touch');
  }
}
