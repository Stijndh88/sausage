import Phaser from 'phaser';
import { GAME_H, GAME_W } from '../art/textures';
import { audio } from '../audio/Audio';
import { HELP_SECTIONS, helpFor, type HelpEntry } from '../data/help';
import { loadSave } from '../state/save';
import { Button } from './Button';
import { FONT } from './Hud';
import { onKeyPress } from './input';
import { bindPrompt, getInputMode, hint } from './inputMode';

const DEPTH = 320;
const LEFT = 60;
const TOP = 30;
const W = GAME_W - 2 * LEFT;
const H = GAME_H - 2 * TOP;
const LIST_W = 360;
const ROW_H = 32;
const ROWS = 14;
const css = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

/**
 * The How to Play overlay, from the main menu and the pause menu. Tabs for each part of the game;
 * each tab lists only what you have already met (see data/help.ts), so nothing is spoiled.
 * Keyboard: ←→ tabs, ↑↓ entries, Esc closes. Controller: the same on the D-pad, (B) closes.
 */
export class HelpPanel {
  private objects: Phaser.GameObjects.GameObject[] = [];
  private open = false;
  private tab = 0;
  private index = 0;
  private scroll = 0;
  private entries: HelpEntry[] = [];

  constructor(private readonly scene: Phaser.Scene, private readonly onClose: () => void = () => {}) {
    const kb = scene.input.keyboard!;
    const when = (fn: () => void) => () => { if (this.open) fn(); };
    onKeyPress(kb, 'LEFT', when(() => this.changeTab(-1)));
    onKeyPress(kb, 'A', when(() => this.changeTab(-1)));
    onKeyPress(kb, 'RIGHT', when(() => this.changeTab(1)));
    onKeyPress(kb, 'D', when(() => this.changeTab(1)));
    onKeyPress(kb, 'UP', when(() => this.navigate(-1)));
    onKeyPress(kb, 'W', when(() => this.navigate(-1)));
    onKeyPress(kb, 'DOWN', when(() => this.navigate(1)));
    onKeyPress(kb, 'S', when(() => this.navigate(1)));
    onKeyPress(kb, 'TAB', when(() => this.changeTab(1)));
    scene.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => {
      if (this.open) this.navigate(dy > 0 ? 1 : -1);
    });
  }

  get isOpen(): boolean {
    return this.open;
  }

  /** The entry shown on the right (tests read it). */
  get selected(): HelpEntry | null {
    return this.entries[this.index] ?? null;
  }

  show(): void {
    if (this.open) return;
    this.open = true;
    this.index = 0;
    this.scroll = 0;
    this.render();
  }

  hide(): void {
    if (!this.open) return;
    this.open = false;
    this.clear();
    this.onClose();
  }

  /** Esc / B. */
  back(): void {
    this.hide();
  }

  navigate(d: number): void {
    if (!this.open || !this.entries.length) return;
    this.index = Phaser.Math.Clamp(this.index + d, 0, this.entries.length - 1);
    if (this.index < this.scroll) this.scroll = this.index;
    if (this.index >= this.scroll + ROWS) this.scroll = this.index - ROWS + 1;
    audio.play('click');
    this.render();
  }

  changeTab(d: number): void {
    if (!this.open) return;
    this.selectTab((this.tab + d + HELP_SECTIONS.length) % HELP_SECTIONS.length);
  }

  private selectTab(i: number): void {
    this.tab = i;
    this.index = 0;
    this.scroll = 0;
    audio.play('click');
    this.render();
  }

  private clear(): void {
    for (const o of this.objects) o.destroy();
    this.objects = [];
  }

  private render(): void {
    this.clear();
    const s = this.scene;
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      this.objects.push(o);
      (o as unknown as Phaser.GameObjects.Components.Depth).setDepth?.(DEPTH);
      return o;
    };
    const save = loadSave();
    const section = HELP_SECTIONS[this.tab];
    const { entries, hidden } = helpFor(section.id, save);
    this.entries = entries;
    this.index = Math.min(this.index, Math.max(0, entries.length - 1));

    add(s.add.rectangle(0, 0, GAME_W, GAME_H, 0x000000, 0.7).setOrigin(0).setInteractive());
    const g = add(s.add.graphics());
    g.fillStyle(0x241812, 1).fillRoundedRect(LEFT, TOP, W, H, 16);
    g.lineStyle(3, 0xffb347, 1).strokeRoundedRect(LEFT, TOP, W, H, 16);
    add(s.add.text(GAME_W / 2, TOP + 34, 'HOW TO PLAY', { fontFamily: FONT, fontSize: '30px', fontStyle: 'bold', color: '#ffd9a0' }).setOrigin(0.5));

    // Tabs
    const tabW = 172;
    const gap = 8;
    const tabsLeft = GAME_W / 2 - (HELP_SECTIONS.length * tabW + (HELP_SECTIONS.length - 1) * gap) / 2;
    HELP_SECTIONS.forEach((sec, i) => {
      const x = tabsLeft + i * (tabW + gap) + tabW / 2;
      const on = i === this.tab;
      const b = add(new Button(s, x, TOP + 84, sec.name, {
        width: tabW, height: 38, fontSize: 15, fill: on ? 0xb8502a : 0x4a3a30, hover: on ? 0xe0703a : 0x6a5240,
      }, () => { if (i !== this.tab) this.selectTab(i); }));
      b.setFocused(on);
    });

    // Entry list
    const listX = LEFT + 24;
    const listY = TOP + 124;
    g.fillStyle(0x140d0a, 0.8).fillRoundedRect(listX, listY, LIST_W, ROWS * ROW_H + 8, 10);
    entries.slice(this.scroll, this.scroll + ROWS).forEach((e, k) => {
      const i = this.scroll + k;
      const y = listY + 4 + k * ROW_H;
      const sel = i === this.index;
      if (sel) g.fillStyle(0xffffff, 0.1).fillRoundedRect(listX + 4, y, LIST_W - 8, ROW_H - 2, 6);
      if (e.color !== undefined) g.fillStyle(e.color, 1).fillCircle(listX + 18, y + ROW_H / 2 - 1, 5);
      add(s.add.text(listX + 32, y + ROW_H / 2 - 1, e.title, {
        fontFamily: FONT, fontSize: '16px', fontStyle: sel ? 'bold' : 'normal', color: sel ? '#ffd23f' : '#ffffff',
      }).setOrigin(0, 0.5));
      const hit = add(s.add.zone(listX, y, LIST_W, ROW_H).setOrigin(0).setInteractive({ useHandCursor: true }));
      hit.on('pointerdown', () => {
        if (this.index === i) return;
        this.index = i;
        audio.play('click');
        this.render();
      });
    });
    if (this.scroll > 0) add(s.add.text(listX + LIST_W - 14, listY + 6, '▲', { fontFamily: FONT, fontSize: '14px', color: '#c8a890' }).setOrigin(1, 0));
    if (this.scroll + ROWS < entries.length) add(s.add.text(listX + LIST_W - 14, listY + ROWS * ROW_H, '▼', { fontFamily: FONT, fontSize: '14px', color: '#c8a890' }).setOrigin(1, 1));
    const nothing = section.id === 'links' || section.id === 'items' ? 'Nothing bought yet.' : 'Nothing here yet.';
    if (!entries.length) add(s.add.text(listX + 20, listY + 18, nothing, { fontFamily: FONT, fontSize: '15px', color: '#8a7a70' }));
    if (hidden > 0) {
      const what = section.id === 'links' ? 'link' : section.id === 'items' ? 'item' : 'thing';
      const how = section.id === 'links' || section.id === 'items' ? 'buy' : 'run into';
      add(s.add.text(listX + LIST_W / 2, listY + ROWS * ROW_H + 24, `${hidden} more ${what}${hidden === 1 ? '' : 's'} to discover: they show up here once you ${how} them.`, {
        fontFamily: FONT, fontSize: '13px', color: '#b09080', align: 'center', wordWrap: { width: LIST_W },
      }).setOrigin(0.5, 0));
    }

    // Detail
    const e = this.selected;
    const dx = listX + LIST_W + 28;
    const dw = LEFT + W - 28 - dx;
    if (e) {
      const accent = e.color ?? 0xffb347;
      g.fillStyle(accent, 1).fillRoundedRect(dx, listY + 4, 6, 40, 3);
      let tx = dx + 20;
      if (e.icon && s.textures.exists(e.icon)) {
        add(s.add.image(dx + 40, listY + 24, 'sausage-link').setScale(1.4));
        add(s.add.image(dx + 40, listY + 24, e.icon).setScale(1.4));
        tx = dx + 72;
      }
      add(s.add.text(tx, listY + 24, e.title, { fontFamily: FONT, fontSize: '28px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0, 0.5));
      add(s.add.text(dx + 20, listY + 68, e.body, {
        fontFamily: FONT, fontSize: '18px', color: '#e8d8c8', wordWrap: { width: dw - 30 }, lineSpacing: 8,
      }));
      if (e.color !== undefined && section.id === 'events') {
        add(s.add.text(dx + 20, listY + 48, 'EVENT', { fontFamily: FONT, fontSize: '12px', fontStyle: 'bold', color: css(e.color) }));
      }
    }

    bindPrompt(add(new Button(s, GAME_W / 2, TOP + H - 36, '', { width: 200, height: 44, fill: 0x3c8d3c, hover: 0x2f7a2f }, () => this.hide())), () => `Close${hint('Esc', 'B')}`);
    bindPrompt(add(s.add.text(LEFT + W - 24, TOP + H - 36, '', { fontFamily: FONT, fontSize: '13px', color: '#b09080' }).setOrigin(1, 0.5)),
      () => ({ keyboard: '←→ tabs · ↑↓ topics', pad: '◄► tabs · ↑↓ topics', touch: 'Tap a tab or a topic' })[getInputMode()]);
  }
}
