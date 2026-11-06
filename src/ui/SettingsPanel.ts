import Phaser from 'phaser';
import { GAME_H, GAME_W } from '../art/textures';
import { audio } from '../audio/Audio';
import { getSettings, updateSettings, type Settings } from '../state/settings';
import { Button } from './Button';
import { FONT } from './Hud';
import { onKeyPress } from './input';

type Row =
  | { kind: 'slider'; key: 'masterVolume' | 'musicVolume' | 'sfxVolume' | 'screenShake'; label: string }
  | { kind: 'toggle'; key: 'reduceFlashing' | 'reducedMotion' | 'damageNumbers'; label: string };

const ROWS: Row[] = [
  { kind: 'slider', key: 'masterVolume', label: 'Master volume' },
  { kind: 'slider', key: 'musicVolume', label: 'Music' },
  { kind: 'slider', key: 'sfxVolume', label: 'Sound effects' },
  { kind: 'slider', key: 'screenShake', label: 'Screen shake' },
  { kind: 'toggle', key: 'reduceFlashing', label: 'Reduce flashing' },
  { kind: 'toggle', key: 'reducedMotion', label: 'Reduce motion' },
  { kind: 'toggle', key: 'damageNumbers', label: 'Damage numbers' },
];

const W = 560;
const ROW_H = 50;
const DEPTH = 300;
/** Title area + Done button + hint, around the rows. */
const PANEL_EXTRA = 150;

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

  constructor(private readonly scene: Phaser.Scene, private readonly onClose: () => void) {
    const kb = scene.input.keyboard!;
    const when = (fn: () => void) => () => { if (this.open) fn(); };
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

  /** Gamepad / external navigation. */
  navigate(dy: number): void {
    if (this.open) this.focus(this.index + dy);
  }

  change(dx: number): void {
    if (this.open) this.adjust(ROWS[this.index], dx);
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
      add(s.add.text(left + 34, y, row.label, { fontFamily: FONT, fontSize: '19px', color: '#ffffff' }).setOrigin(0, 0.5));
      const value = add(s.add.text(left + W - 150, y, '', { fontFamily: FONT, fontSize: '19px', fontStyle: 'bold', color: '#ffd23f' }).setOrigin(0.5));
      this.valueTexts.push(value);
      if (row.kind === 'slider') {
        add(new Button(s, left + W - 220, y, '−', { width: 40, height: 36, fill: 0x4a3a30, hover: 0x6a5240, fontSize: 22 }, () => this.adjust(row, -1)));
        add(new Button(s, left + W - 80, y, '+', { width: 40, height: 36, fill: 0x4a3a30, hover: 0x6a5240, fontSize: 22 }, () => this.adjust(row, 1)));
      } else {
        add(new Button(s, left + W - 80, y, 'Toggle', { width: 90, height: 36, fill: 0x4a3a30, hover: 0x6a5240, fontSize: 15 }, () => this.adjust(row, 1)));
      }
    });
    add(new Button(s, GAME_W / 2, top + h - 52, 'Done (Esc)', { width: 200, height: 46, fill: 0x3c8d3c, hover: 0x2f7a2f }, () => this.hide()));
    add(s.add.text(GAME_W / 2, top + h - 10, '↑↓ choose · ←→ change', { fontFamily: FONT, fontSize: '12px', color: '#b09080' }).setOrigin(0.5, 1));
    this.focus(0);
    this.refresh();
  }

  hide(): void {
    if (!this.open) return;
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
    if (row.kind === 'slider') {
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
      t.setText(row.kind === 'slider' ? `${Math.round(s[row.key] * 100)}%` : s[row.key] ? 'On' : 'Off');
    });
  }
}
