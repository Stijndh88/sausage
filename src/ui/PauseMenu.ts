import Phaser from 'phaser';
import { bindPrompt, getInputMode, hint } from './inputMode';
import { GAME_H, GAME_W } from '../art/textures';
import { ITEMS } from '../data/items';
import { RARITIES } from '../data/rarity';
import { SAUSAGES } from '../data/sausages';
import { courseName, locate } from '../data/courses';
import { WEAPONS, tierLabel } from '../data/weapons';
import type { RunState } from '../state/run';
import type { PlayerStats } from '../state/stats';
import { Button } from './Button';
import { FONT } from './Hud';
import { MenuList } from './MenuList';
import { itemIcon } from './itemIcon';

export interface PauseActions {
  resume(): void;
  restart(): void;
  settings(): void;
  quit(): void;
  /** End the run now and keep part of the doggy bag. */
  bail(): void;
  /** Spice a bail-out would bank right now. */
  bailValue(): number;
}

const DEPTH = 200;

/** The pause screen: actions on the left, your current build on the right. */
export class PauseMenu {
  private objects: Phaser.GameObjects.GameObject[] = [];
  private list: MenuList | null = null;
  private armed: 'restart' | 'quit' | 'bail' | null = null;
  open = false;
  /** The "PAUSED" heading while the menu is open (tests check it's visible and on top). */
  title: Phaser.GameObjects.Text | null = null;

  constructor(private readonly scene: Phaser.Scene, private readonly actions: PauseActions) {}

  show(run: RunState, stats: PlayerStats, hp: number): void {
    this.hide();
    this.open = true;
    this.armed = null;
    const s = this.scene;
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      this.objects.push(o);
      (o as unknown as Phaser.GameObjects.Components.Depth).setDepth?.(DEPTH);
      return o;
    };
    add(s.add.rectangle(0, 0, GAME_W, GAME_H, 0x000000, 0.62).setOrigin(0).setInteractive());
    this.title = add(s.add.text(GAME_W / 2, 96, 'PAUSED', {
      fontFamily: FONT, fontSize: '48px', fontStyle: 'bold', color: '#ffffff', stroke: '#000', strokeThickness: 6,
    }).setOrigin(0.5));

    // Actions
    const bx = 250;
    const mk = (y: number, label: string, fn: () => void, fill = 0xb8502a) =>
      add(new Button(s, bx, y, label, { width: 280, height: 54, fill, fontSize: 21 }, fn));
    const resume = mk(200, 'Resume', () => this.actions.resume(), 0x3c8d3c);
    bindPrompt(resume, () => `Resume${hint('Esc', 'B')}`);
    const keep = this.actions.bailValue();
    const bail = mk(270, `Bail out: bank ${keep} Spice`, () => this.confirm('bail', bail, `Bank ${keep}? Press again`), 0x8a6a1a);
    const restart = mk(340, 'Restart run', () => this.confirm('restart', restart, 'Restart? Press again'), 0x5a4a3a);
    const settings = mk(410, 'Settings', () => this.actions.settings(), 0x5a4a3a);
    const quit = mk(480, 'Main menu', () => this.confirm('quit', quit, 'Quit run? Press again'), 0x5a4a3a);
    const buttons = [resume, bail, restart, settings, quit];
    if (this.list) this.list.setButtons(buttons);
    else this.list = new MenuList(s, buttons, () => this.open);
    this.list.active = true;
    add(s.add.text(bx, 540, 'Bailing out keeps part of your doggy bag.\nRestart and Main menu count as bailing out.', {
      fontFamily: FONT, fontSize: '13px', color: '#b09080', align: 'center',
    }).setOrigin(0.5, 0));
    const help = add(s.add.text(bx, 600, '', { fontFamily: FONT, fontSize: '13px', color: '#b09080' }).setOrigin(0.5));
    bindPrompt(help, () => ({ keyboard: '↑↓ + Enter, or click', pad: '↑↓ + (A) · (B) resumes', touch: 'Tap a button' })[getInputMode()]);

    // Build overview
    const px = 470;
    const pw = GAME_W - px - 60;
    const py = 160;
    const g = add(s.add.graphics());
    g.fillStyle(0x241812, 0.95).fillRoundedRect(px, py, pw, 470, 14);
    g.lineStyle(2, 0x5a4a3a, 1).strokeRoundedRect(px, py, pw, 470, 14);
    add(s.add.text(px + 20, py + 16, `${SAUSAGES[run.sausage].name.toUpperCase()} · ${courseName(locate(run.wave).course).toUpperCase()} · WAVE ${locate(run.wave).courseWave}${run.chili ? ` · CHILI ${run.chili}` : ''}`, {
      fontFamily: FONT, fontSize: '16px', fontStyle: 'bold', color: '#c8a890',
    }));

    // Stats in two columns.
    const pct = (v: number) => `${v >= 1 ? '+' : ''}${Math.round((v - 1) * 100)}%`;
    const statLines: [string, string][] = [
      ['HP', `${Math.ceil(hp)} / ${stats.maxHp}`],
      ['Armor', String(stats.armor)],
      ['Regen', `${stats.regenPerSec.toFixed(1)}/s`],
      ['Lifesteal', `${Math.round(stats.lifesteal * 100)}%`],
      ['Dodge', `${Math.round(stats.dodge * 100)}%`],
      ['Damage', pct(stats.damageMult)],
      ['Fire rate', pct(stats.fireRateMult)],
      ['Crit', `${Math.round(stats.critChance * 100)}%`],
      ['Speed', pct(stats.speedMult)],
      ['Luck', String(stats.luck)],
    ];
    statLines.forEach(([k, v], i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = px + 20 + col * 200;
      const y = py + 52 + row * 26;
      add(s.add.text(x, y, k, { fontFamily: FONT, fontSize: '15px', color: '#b09080' }));
      add(s.add.text(x + 180, y, v, { fontFamily: FONT, fontSize: '15px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(1, 0));
    });

    // Weapons
    const wy = py + 200;
    add(s.add.text(px + 20, wy, 'LINKS', { fontFamily: FONT, fontSize: '14px', fontStyle: 'bold', color: '#c8a890' }));
    run.weapons.forEach((w, i) => {
      const x = px + 46 + i * (run.weapons.length > 7 ? 86 : 92);
      add(s.add.image(x, wy + 44, 'sausage-link').setScale(1.4));
      add(s.add.image(x, wy + 44, WEAPONS[w.id].icon).setScale(1.4));
      add(s.add.text(x, wy + 70, `${WEAPONS[w.id].name.split(' ')[0]} ${tierLabel(w.tier)}`, {
        fontFamily: FONT, fontSize: '12px', color: '#ffffff', align: 'center',
      }).setOrigin(0.5, 0));
    });

    // Items as icon chips with counts.
    const iy = wy + 110;
    add(s.add.text(px + 20, iy, 'ITEMS', { fontFamily: FONT, fontSize: '14px', fontStyle: 'bold', color: '#c8a890' }));
    const counts = new Map<string, number>();
    for (const id of run.items) if (ITEMS[id]) counts.set(id, (counts.get(id) ?? 0) + 1);
    if (!counts.size) add(s.add.text(px + 20, iy + 28, 'None yet', { fontFamily: FONT, fontSize: '14px', color: '#8a7a70' }));
    [...counts].forEach(([id, n], i) => {
      const item = ITEMS[id];
      const perRow = Math.floor((pw - 30) / 48);
      const x = px + 40 + (i % perRow) * 48;
      const y = iy + 46 + Math.floor(i / perRow) * 50;
      const chip = add(s.add.graphics());
      chip.fillStyle(0x140d0a, 1).fillCircle(x, y, 20);
      chip.lineStyle(2, RARITIES[item.rarity].color, 1).strokeCircle(x, y, 20);
      add(itemIcon(s, x, y, item, 32));
      if (n > 1) add(s.add.text(x + 14, y + 12, `×${n}`, { fontFamily: FONT, fontSize: '12px', fontStyle: 'bold', color: '#ffffff', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5));
    });
  }

  /** Destructive actions need a second press. */
  private confirm(which: 'restart' | 'quit' | 'bail', button: Button, prompt: string): void {
    if (this.armed === which) {
      if (which === 'restart') this.actions.restart();
      else if (which === 'bail') this.actions.bail();
      else this.actions.quit();
      return;
    }
    this.armed = which;
    button.setText(prompt);
  }

  /** Gamepad navigation. */
  navigate(d: number): void {
    if (this.open && this.list?.active) this.list.move(d);
  }

  pressFocused(): void {
    if (this.open && this.list?.active) this.list.confirm();
  }

  /** Temporarily hand the keyboard to another overlay (settings). */
  setActive(active: boolean): void {
    if (this.list) this.list.active = active && this.open;
  }

  hide(): void {
    this.open = false;
    this.title = null;
    if (this.list) this.list.active = false;
    for (const o of this.objects) o.destroy();
    this.objects = [];
  }
}
