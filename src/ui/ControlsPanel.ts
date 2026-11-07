import type Phaser from 'phaser';
import { GAME_H, GAME_W } from '../art/textures';
import { audio } from '../audio/Audio';
import { ACTIONS, FIXED_BINDINGS, RESERVED_CODES, defaultBindings, rebind, type Action } from '../state/controls';
import { getSettings, updateSettings } from '../state/settings';
import { Button } from './Button';
import { FONT } from './Hud';
import { onKeyPress } from './input';
import { currentLayout, labelForCode } from './keyboardLayout';

const W = 640;
const ROW_H = 48;
const DEPTH = 320;
const TOP_EXTRA = 128;
const BOTTOM_EXTRA = 96;

/**
 * Keyboard controls: shows each action's keys (as printed on *your* keyboard) and lets you
 * rebind them. Keys are stored by physical position, so the defaults already work on AZERTY.
 */
export class ControlsPanel {
  private objects: Phaser.GameObjects.GameObject[] = [];
  private keyTexts: Phaser.GameObjects.Text[] = [];
  private markers: Phaser.GameObjects.Graphics[] = [];
  private note: Phaser.GameObjects.Text | null = null;
  private index = 0;
  private open = false;
  /** The action waiting for a key press, if any. */
  capturing: Action | null = null;
  private captureListener: ((e: KeyboardEvent) => void) | null = null;

  constructor(private readonly scene: Phaser.Scene, private readonly onClose: () => void) {
    const kb = scene.input.keyboard!;
    const when = (fn: () => void) => () => { if (this.open && !this.capturing) fn(); };
    onKeyPress(kb, 'UP', when(() => this.focus(this.index - 1)));
    onKeyPress(kb, 'W', when(() => this.focus(this.index - 1)));
    onKeyPress(kb, 'DOWN', when(() => this.focus(this.index + 1)));
    onKeyPress(kb, 'S', when(() => this.focus(this.index + 1)));
    onKeyPress(kb, 'ENTER', when(() => this.startCapture(ACTIONS[this.index].id)));
    scene.events.once('shutdown', () => this.stopCapture());
  }

  get isOpen(): boolean {
    return this.open;
  }

  show(): void {
    if (this.open) return;
    this.open = true;
    const s = this.scene;
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      this.objects.push(o);
      (o as unknown as Phaser.GameObjects.Components.Depth).setDepth?.(DEPTH);
      return o;
    };
    const h = TOP_EXTRA + ACTIONS.length * ROW_H + BOTTOM_EXTRA;
    const top = (GAME_H - h) / 2;
    const left = (GAME_W - W) / 2;
    add(s.add.rectangle(0, 0, GAME_W, GAME_H, 0x000000, 0.55).setOrigin(0).setInteractive());
    const g = add(s.add.graphics());
    g.fillStyle(0x241812, 1).fillRoundedRect(left, top, W, h, 16);
    g.lineStyle(3, 0xffb347, 1).strokeRoundedRect(left, top, W, h, 16);
    add(s.add.text(GAME_W / 2, top + 34, 'KEYBOARD CONTROLS', { fontFamily: FONT, fontSize: '28px', fontStyle: 'bold', color: '#ffd9a0' }).setOrigin(0.5));
    const layout = currentLayout();
    add(s.add.text(GAME_W / 2, top + 72, `Keyboard: ${layout.name} (${layout.source === 'browser' ? 'detected' : 'guessed from your language'}).`
      + '\nKeys work by position, so the defaults are WASD on QWERTY and ZQSD on AZERTY.', {
      fontFamily: FONT, fontSize: '14px', color: '#c8a890', align: 'center',
    }).setOrigin(0.5));

    this.keyTexts = [];
    this.markers = [];
    ACTIONS.forEach(({ id, label }, i) => {
      const y = top + TOP_EXTRA + i * ROW_H + ROW_H / 2 - 6;
      this.markers.push(add(s.add.graphics()));
      add(s.add.text(left + 34, y, label, { fontFamily: FONT, fontSize: '19px', color: '#ffffff' }).setOrigin(0, 0.5));
      this.keyTexts.push(add(s.add.text(left + 330, y, '', { fontFamily: FONT, fontSize: '18px', fontStyle: 'bold', color: '#ffd23f' }).setOrigin(0.5)));
      add(new Button(s, left + W - 80, y, 'Change', { width: 104, height: 36, fill: 0x4a3a30, hover: 0x6a5240, fontSize: 15 }, () => {
        this.focus(i);
        this.startCapture(id);
      }));
    });
    const by = top + h - 48;
    add(new Button(s, GAME_W / 2 - 120, by, 'Reset to defaults', { width: 210, height: 44, fill: 0x5a4a3a, hover: 0x7a6650, fontSize: 16 }, () => this.reset()));
    add(new Button(s, GAME_W / 2 + 120, by, 'Done (Esc)', { width: 200, height: 44, fill: 0x3c8d3c, hover: 0x2f7a2f }, () => this.hide()));
    this.note = add(s.add.text(GAME_W / 2, by - 36, '', { fontFamily: FONT, fontSize: '14px', color: '#ff8a70' }).setOrigin(0.5));
    this.focus(this.index);
    this.refresh();
  }

  hide(): void {
    if (!this.open) return;
    this.stopCapture();
    this.open = false;
    for (const o of this.objects) o.destroy();
    this.objects = [];
    this.note = null;
    this.onClose();
  }

  /** Esc / B: cancel a pending rebind, otherwise close. */
  back(): void {
    if (this.capturing) this.stopCapture();
    else this.hide();
  }

  navigate(d: number): void {
    if (this.open && !this.capturing) this.focus(this.index + d);
  }

  confirm(): void {
    if (this.open && !this.capturing) this.startCapture(ACTIONS[this.index].id);
  }

  private focus(i: number): void {
    this.index = (i + ACTIONS.length) % ACTIONS.length;
    const h = TOP_EXTRA + ACTIONS.length * ROW_H + BOTTOM_EXTRA;
    const top = (GAME_H - h) / 2;
    const left = (GAME_W - W) / 2;
    this.markers.forEach((m, k) => {
      m.clear();
      if (k === this.index) m.fillStyle(0xffffff, 0.08).fillRoundedRect(left + 16, top + TOP_EXTRA + k * ROW_H - 6, W - 32, ROW_H - 4, 8);
    });
  }

  private startCapture(action: Action): void {
    if (this.capturing) return;
    this.capturing = action;
    this.note?.setText('');
    this.refresh();
    // Listen on window in the capture phase and stop the event, so the key that's being bound
    // (or Esc to cancel) doesn't also do something else in the game.
    this.captureListener = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.repeat) return;
      if (e.code === 'Escape') {
        this.stopCapture();
        return;
      }
      if (RESERVED_CODES.has(e.code)) {
        this.note?.setText(`${labelForCode(e.code)} is reserved. Pick another key.`);
        audio.play('deny');
        return;
      }
      const s = getSettings();
      updateSettings({ keyBindings: rebind(s.keyBindings, action, e.code) });
      audio.play('click');
      this.stopCapture();
    };
    globalThis.addEventListener?.('keydown', this.captureListener, { capture: true });
  }

  private stopCapture(): void {
    if (this.captureListener) globalThis.removeEventListener?.('keydown', this.captureListener, { capture: true });
    this.captureListener = null;
    this.capturing = null;
    this.refresh();
  }

  private reset(): void {
    this.stopCapture();
    updateSettings({ keyBindings: defaultBindings() });
    this.note?.setText('');
    this.refresh();
  }

  private refresh(): void {
    if (!this.open) return;
    const b = getSettings().keyBindings;
    ACTIONS.forEach(({ id }, i) => {
      const t = this.keyTexts[i];
      if (!t) return;
      if (this.capturing === id) {
        t.setText('Press a key… (Esc cancels)').setColor('#8fd3ff');
        return;
      }
      const keys = [...b[id], ...(FIXED_BINDINGS[id] ?? [])].map(labelForCode);
      t.setText(keys.join(' / ')).setColor('#ffd23f');
    });
  }
}
