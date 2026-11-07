import Phaser from 'phaser';
import { GAME_H, GAME_W } from '../art/textures';
import { audio } from '../audio/Audio';
import { getSettings, updateSettings, type Settings } from '../state/settings';
import { Button } from './Button';
import { FONT } from './Hud';
import { onKeyPress } from './input';
import { ControlsPanel } from './ControlsPanel';
import { bindPrompt, getInputMode, hint } from './inputMode';
import { moveLabel } from './keyboardLayout';
import { downloadTelemetry } from '../state/telemetry';

type Row =
  | { kind: 'slider'; key: 'masterVolume' | 'musicVolume' | 'sfxVolume' | 'screenShake'; label: string }
  | { kind: 'toggle'; key: 'reduceFlashing' | 'reducedMotion' | 'damageNumbers' | 'vibration'; label: string }
  | { kind: 'dashSide'; label: string }
  | { kind: 'controls'; label: string }
  | { kind: 'playData'; label: string };

const ROWS: Row[] = [
  { kind: 'slider', key: 'masterVolume', label: 'Master volume' },
  { kind: 'slider', key: 'musicVolume', label: 'Music' },
  { kind: 'slider', key: 'sfxVolume', label: 'Sound effects' },
  { kind: 'slider', key: 'screenShake', label: 'Screen shake' },
  { kind: 'toggle', key: 'reduceFlashing', label: 'Reduce flashing' },
  { kind: 'toggle', key: 'reducedMotion', label: 'Reduce motion' },
  { kind: 'toggle', key: 'damageNumbers', label: 'Damage numbers' },
  { kind: 'toggle', key: 'vibration', label: 'Vibration (controller / phone)' },
  { kind: 'dashSide', label: 'Touch: DASH button side' },
  { kind: 'controls', label: 'Keyboard controls' },
  { kind: 'playData', label: 'Share play data' },
];

const W = 560;
const ROW_H = 48;
const DEPTH = 300;
/** Title area + Done button + hint, around the rows. */
const PANEL_EXTRA = 146;

/**
 * Settings overlay. Mouse: -/+ and toggle buttons. Keyboard/gamepad: Up/Down to pick a row,
 * Left/Right to change it, Esc (or Done) to close. Every change is saved immediately.
 */
export class SettingsPanel {
  private objects: Phaser.GameObjects.GameObject[] = [];
  private valueTexts: Phaser.GameObjects.Text[] = [];
  private rowMarkers: Phaser.GameObjects.Graphics[] = [];
  private index = 0;
  private open = false;
  /** The keyboard controls screen, opened from the last row. */
  readonly controls: ControlsPanel;

  constructor(private readonly scene: Phaser.Scene, private readonly onClose: () => void) {
    this.controls = new ControlsPanel(scene, () => this.refresh());
    const kb = scene.input.keyboard!;
    // While the controls screen is open it owns the keyboard.
    const when = (fn: () => void) => () => { if (this.open && !this.controls.isOpen) fn(); };
    onKeyPress(kb, 'UP', when(() => this.focus(this.index - 1)));
    onKeyPress(kb, 'W', when(() => this.focus(this.index - 1)));
    onKeyPress(kb, 'DOWN', when(() => this.focus(this.index + 1)));
    onKeyPress(kb, 'S', when(() => this.focus(this.index + 1)));
    onKeyPress(kb, 'LEFT', when(() => this.adjust(ROWS[this.index], -1)));
    onKeyPress(kb, 'A', when(() => this.adjust(ROWS[this.index], -1)));
    onKeyPress(kb, 'RIGHT', when(() => this.adjust(ROWS[this.index], 1)));
    onKeyPress(kb, 'D', when(() => this.adjust(ROWS[this.index], 1)));
    onKeyPress(kb, 'ENTER', when(() => this.adjust(ROWS[this.index], 1)));
  }

  get isOpen(): boolean {
    return this.open;
  }

  /** Gamepad / external navigation (forwarded to the controls screen when it's open). */
  navigate(dy: number): void {
    if (this.controls.isOpen) this.controls.navigate(dy);
    else if (this.open) this.focus(this.index + dy);
  }

  change(dx: number): void {
    if (this.open && !this.controls.isOpen) this.adjust(ROWS[this.index], dx);
  }

  /** A / Enter equivalent. */
  confirm(): void {
    if (this.controls.isOpen) this.controls.confirm();
    else if (this.open) this.adjust(ROWS[this.index], 1);
  }

  /** Esc / B: step back one level (cancel a rebind, close controls, then close settings). */
  back(): void {
    if (this.controls.isOpen) this.controls.back();
    else this.hide();
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
    const h = PANEL_EXTRA + ROWS.length * ROW_H;
    const top = (GAME_H - h) / 2;
    const left = (GAME_W - W) / 2;
    add(s.add.rectangle(0, 0, GAME_W, GAME_H, 0x000000, 0.6).setOrigin(0).setInteractive());
    const g = add(s.add.graphics());
    g.fillStyle(0x241812, 1).fillRoundedRect(left, top, W, h, 16);
    g.lineStyle(3, 0xffb347, 1).strokeRoundedRect(left, top, W, h, 16);
    add(s.add.text(GAME_W / 2, top + 36, 'SETTINGS', { fontFamily: FONT, fontSize: '30px', fontStyle: 'bold', color: '#ffd9a0' }).setOrigin(0.5));

    this.valueTexts = [];
    this.rowMarkers = [];
    ROWS.forEach((row, i) => {
      const y = top + 90 + i * ROW_H;
      const marker = add(s.add.graphics());
      this.rowMarkers.push(marker);
      // Tap anywhere on a row to pick it (and flip it, for on/off rows): big targets for thumbs.
      const hit = add(s.add.zone(left + 16, y - ROW_H / 2, W - 32 - 260, ROW_H).setOrigin(0).setInteractive());
      hit.on('pointerdown', () => {
        this.focus(i);
        if (row.kind !== 'slider') this.adjust(row, 1);
      });
      add(s.add.text(left + 34, y, row.label, { fontFamily: FONT, fontSize: '19px', color: '#ffffff' }).setOrigin(0, 0.5));
      // Slider values sit between − and +; the others end just left of their button.
      const value = add(s.add.text(row.kind === 'slider' ? left + W - 150 : left + W - 138, y, '', { fontFamily: FONT, fontSize: '19px', fontStyle: 'bold', color: '#ffd23f' })
        .setOrigin(row.kind === 'slider' ? 0.5 : 1, 0.5));
      this.valueTexts.push(value);
      if (row.kind === 'playData') {
        // Download a copy of what's kept on this device; the main button turns sharing on/off.
        add(new Button(s, left + W - 222, y, 'Save', { width: 64, height: 36, fill: 0x3a3028, hover: 0x5a4636, fontSize: 14 }, () => {
          audio.play(downloadTelemetry() ? 'click' : 'deny');
        }));
        add(new Button(s, left + W - 78, y, 'Toggle', { width: 96, height: 40, fill: 0x4a3a30, hover: 0x6a5240, fontSize: 15 }, () => this.adjust(row, 1)));
      } else if (row.kind === 'controls') {
        add(new Button(s, left + W - 80, y, 'Change…', { width: 100, height: 36, fill: 0x4a3a30, hover: 0x6a5240, fontSize: 15 }, () => this.adjust(row, 1)));
      } else if (row.kind === 'slider') {
        add(new Button(s, left + W - 222, y, '−', { width: 56, height: 40, fill: 0x4a3a30, hover: 0x6a5240, fontSize: 24 }, () => this.adjust(row, -1)));
        add(new Button(s, left + W - 78, y, '+', { width: 56, height: 40, fill: 0x4a3a30, hover: 0x6a5240, fontSize: 24 }, () => this.adjust(row, 1)));
      } else {
        add(new Button(s, left + W - 78, y, row.kind === 'dashSide' ? 'Swap' : 'Toggle', { width: 96, height: 40, fill: 0x4a3a30, hover: 0x6a5240, fontSize: 15 }, () => this.adjust(row, 1)));
      }
    });
    bindPrompt(add(new Button(s, GAME_W / 2, top + h - 50, '', { width: 200, height: 46, fill: 0x3c8d3c, hover: 0x2f7a2f }, () => this.hide())), () => `Done${hint('Esc', 'B')}`);
    bindPrompt(add(s.add.text(GAME_W / 2, top + h - 8, '', { fontFamily: FONT, fontSize: '12px', color: '#b09080' }).setOrigin(0.5, 1)),
      () => ({ keyboard: '↑↓ choose · ←→ change', pad: '↑↓ choose · ◄► change · (A) toggle · (B) close', touch: 'Tap − / + or a row to change it' })[getInputMode()]);
    this.focus(0);
    this.refresh();
  }

  hide(): void {
    if (!this.open) return;
    this.controls.hide();
    this.open = false;
    for (const o of this.objects) o.destroy();
    this.objects = [];
    this.onClose();
  }

  private focus(i: number): void {
    this.index = (i + ROWS.length) % ROWS.length;
    const h = PANEL_EXTRA + ROWS.length * ROW_H;
    const top = (GAME_H - h) / 2;
    const left = (GAME_W - W) / 2;
    this.rowMarkers.forEach((m, k) => {
      m.clear();
      if (k === this.index) m.fillStyle(0xffffff, 0.08).fillRoundedRect(left + 16, top + 90 + k * ROW_H - 22, W - 32, 44, 8);
    });
  }

  private adjust(row: Row, dir: number): void {
    const s = getSettings();
    if (row.kind === 'controls') {
      audio.play('click');
      this.controls.show();
      return;
    }
    if (row.kind === 'playData') {
      updateSettings({ sharePlayData: !s.sharePlayData });
      audio.play('click');
    } else if (row.kind === 'dashSide') {
      updateSettings({ dashSide: s.dashSide === 'left' ? 'right' : 'left' });
      audio.play('click');
    } else if (row.kind === 'slider') {
      const v = Math.round((s[row.key] + dir * 0.1) * 10) / 10;
      updateSettings({ [row.key]: Math.min(1, Math.max(0, v)) } as Partial<Settings>);
      if (row.key !== 'screenShake') audio.play('click');
    } else {
      updateSettings({ [row.key]: !s[row.key] } as Partial<Settings>);
      audio.play('click');
    }
    this.refresh();
  }

  private refresh(): void {
    const s = getSettings();
    ROWS.forEach((row, i) => {
      const t = this.valueTexts[i];
      if (!t) return;
      if (row.kind === 'controls') t.setText(`Move: ${moveLabel(s.keyBindings)}`);
      else if (row.kind === 'playData') t.setText(s.sharePlayData ? 'On' : 'Off');
      else if (row.kind === 'dashSide') t.setText(s.dashSide === 'left' ? 'Left' : 'Right');
      else t.setText(row.kind === 'slider' ? `${Math.round(s[row.key] * 100)}%` : s[row.key] ? 'On' : 'Off');
    });
  }
}
