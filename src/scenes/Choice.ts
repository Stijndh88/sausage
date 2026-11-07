import Phaser from 'phaser';
import { GAME_H, GAME_W } from '../art/textures';
import { bossName, courseName, courseSpiceMult, locate, TROPHIES } from '../data/courses';
import { ITEMS } from '../data/items';
import { MENUS, type MenuId } from '../data/menus';
import { BIG_PUSH, menuOptions, secondsItems } from '../state/seconds';
import { RARITIES } from '../data/rarity';
import { tally, type RunState } from '../state/run';
import { bagValue, keepShare } from '../state/meta';
import { bankSpice } from '../state/save';
import { audio } from '../audio/Audio';
import { Button } from '../ui/Button';
import { FONT } from '../ui/Hud';
import { itemIcon } from '../ui/itemIcon';
import { onKeyPress } from '../ui/input';
import { PadPoller } from '../ui/pad';
import { fitCamera } from '../ui/view';

type Stage = 'choose' | 'item' | 'menu';

/**
 * After every boss: take the doggy bag home, or go for seconds. Seconds gives a full heal
 * (every wave starts at full HP), a pick of rare items and a choice of menu for the next course.
 */
export class ChoiceScene extends Phaser.Scene {
  private run!: RunState;
  private hp = 0;
  private stage: Stage = 'choose';
  private focus = 0;
  private ui: Phaser.GameObjects.GameObject[] = [];
  private buttons: Button[] = [];
  private leaving = false;
  private readyAt = 0;
  private readonly pad = new PadPoller();
  private items: string[] = [];
  private menus: MenuId[] = [];

  constructor() {
    super('Choice');
  }

  init(data: { run: RunState; hp?: number }): void {
    this.run = data.run;
    this.hp = data.hp ?? 0;
    this.stage = 'choose';
    this.focus = 0;
    this.leaving = false;
    this.items = secondsItems(this.run);
    this.menus = menuOptions(this.run);
  }

  create(): void {
    fitCamera(this);
    audio.setMood('menu');
    this.add.image(0, 0, 'bg-grill').setOrigin(0).setDisplaySize(GAME_W, GAME_H).setAlpha(0.35);
    this.add.rectangle(0, 0, GAME_W, GAME_H, 0x140d0a, 0.7).setOrigin(0);
    this.readyAt = this.time.now + 500;
    const kb = this.input.keyboard!;
    const ready = () => this.time.now >= this.readyAt;
    onKeyPress(kb, 'LEFT', () => this.move(-1), ready);
    onKeyPress(kb, 'RIGHT', () => this.move(1), ready);
    onKeyPress(kb, 'ENTER', () => this.buttons[this.focus]?.press(), ready);
    (['ONE', 'TWO', 'THREE'] as const).forEach((k, i) => onKeyPress(kb, k, () => this.buttons[i]?.press(), ready));
    this.render();
    (window as unknown as { __sausage?: unknown }).__sausage = this;
  }

  update(): void {
    if (this.time.now < this.readyAt) {
      this.pad.poll(this);
      return;
    }
    for (const b of this.pad.poll(this)) {
      if (b === 'left' || b === 'right') this.move(b === 'left' ? -1 : 1);
      else if (b === 'a' || b === 'start') this.buttons[this.focus]?.press();
    }
  }

  private move(d: number): void {
    if (!this.buttons.length) return;
    this.focus = (this.focus + d + this.buttons.length) % this.buttons.length;
    audio.play('click');
    this.buttons.forEach((b, i) => b.setFocused(i === this.focus));
  }

  private render(): void {
    for (const o of this.ui) o.destroy();
    this.ui = [];
    this.buttons = [];
    if (this.stage === 'choose') this.renderChoice();
    else if (this.stage === 'item') this.renderItems();
    else this.renderMenus();
    this.focus = Math.min(this.focus, this.buttons.length - 1);
    this.buttons.forEach((b, i) => b.setFocused(i === this.focus));
  }

  private keep<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.ui.push(o);
    return o;
  }

  private text(x: number, y: number, s: string, size: number, color = '#ffffff', bold = false, wrap = 0): Phaser.GameObjects.Text {
    return this.keep(this.add.text(x, y, s, {
      fontFamily: FONT, fontSize: `${size}px`, fontStyle: bold ? 'bold' : 'normal', color, align: 'center',
      wordWrap: wrap ? { width: wrap } : undefined, lineSpacing: 6,
    }).setOrigin(0.5, 0));
  }

  private card(x: number, y: number, w: number, h: number, color: number, focused = false): void {
    const g = this.keep(this.add.graphics());
    g.fillStyle(0x000000, 0.4).fillRoundedRect(x - w / 2 + 4, y + 6, w, h, 16);
    g.fillStyle(0x2a1d16, 1).fillRoundedRect(x - w / 2, y, w, h, 16);
    g.fillStyle(color, 0.18).fillRoundedRect(x - w / 2, y, w, 70, { tl: 16, tr: 16, bl: 0, br: 0 });
    g.lineStyle(focused ? 4 : 3, color, 1).strokeRoundedRect(x - w / 2, y, w, h, 16);
  }

  private renderChoice(): void {
    const run = this.run;
    const here = locate(run.wave);
    const next = locate(run.wave + 1);
    const bag = Math.floor(run.bag);
    const trophyNames = run.trophies.map((t) => TROPHIES[t].name);
    this.text(GAME_W / 2, 28, `${bossName(here.course).toUpperCase()}: DEFEATED!`, 44, '#ffe0b0', true);
    this.text(GAME_W / 2, 92, `Doggy bag: ${bag} Spice${trophyNames.length ? `  +  ${trophyNames.join(', ')}` : ''}`, 22, '#ffd060', true);

    // Take it home.
    const lx = GAME_W / 2 - 300;
    const cy = 150;
    const w = 520;
    const h = 430;
    this.card(lx, cy, w, h, 0x5fd36b);
    this.text(lx, cy + 18, 'TAKE IT HOME', 32, '#9cff7a', true);
    const home = bagValue('home', run);
    this.text(lx, cy + 96, `Bank ${home} Spice`, 30, '#ffffff', true);
    this.text(lx, cy + 140, `${bag} in the bag + ${home - bag} escape bonus`, 17, '#c8a890');
    this.text(lx, cy + 186, trophyNames.length ? `Keep your trophies: ${trophyNames.join(', ')}` : 'No trophies to keep', 17, '#e8d8c8', false, w - 60);
    this.text(lx, cy + 236, 'The run ends as a win.', 17, '#e8d8c8');
    this.buttons.push(this.keep(new Button(this, lx, cy + h - 50, 'Take it home  (1)', { width: 300, height: 56, fontSize: 21, fill: 0x3c8d3c, hover: 0x52b052 }, () => this.takeHome())));

    // Seconds.
    const rx = GAME_W / 2 + 300;
    this.card(rx, cy, w, h, 0xff8a3a);
    this.text(rx, cy + 18, 'SECONDS?', 32, '#ffb070', true);
    const multNow = courseSpiceMult(here.course);
    const multNext = courseSpiceMult(next.course);
    this.text(rx, cy + 86, `On to ${courseName(next.course)}`, 24, '#ffffff', true);
    this.text(rx, cy + 122, `Spice x${multNext} from now on (was x${multNow}). Tougher enemies, a new boss.`, 16, '#c8a890', false, w - 60);
    this.text(rx, cy + 176, 'Right now: pick 1 of 3 rare items and the menu for the next course. Heal to full.', 17, '#9fe7a8', false, w - 60);
    const after = { ...run, pushes: run.pushes + 1 };
    const banked = Math.floor(bag * run.mods.pushBank);
    const keepPct = Math.round(keepShare('death', after) * 100);
    const keepIfDie = Math.floor((bag - banked) * keepShare('death', after));
    this.text(rx, cy + 250, `If you die from here: keep ${keepPct}% of the bag (${keepIfDie} Spice now) and lose ${trophyNames.length ? 'your trophies' : 'any trophies'}.`, 17, '#ff8a70', true, w - 60);
    if (banked > 0) this.text(rx, cy + 310, `Lunchbox: ${banked} Spice is banked for keeps when you push on.`, 15, '#ffd060', false, w - 60);
    this.buttons.push(this.keep(new Button(this, rx, cy + h - 50, 'Seconds!  (2)', { width: 300, height: 56, fontSize: 21, fill: 0xb8502a, hover: 0xd0643a }, () => this.seconds())));

    this.text(GAME_W / 2, GAME_H - 52, '←→ pick · Enter or A confirm · 1 take it home · 2 seconds', 15, '#b09080');
  }

  private renderItems(): void {
    this.text(GAME_W / 2, 40, 'SECONDS! PICK A DISH', 44, '#ffb070', true);
    this.text(GAME_W / 2, 100, 'One of these comes with you for free.', 20, '#c8a890');
    const w = 300;
    const gap = 40;
    this.items.forEach((id, i) => {
      const item = ITEMS[id];
      const rarity = RARITIES[item.rarity];
      const x = GAME_W / 2 + (i - (this.items.length - 1) / 2) * (w + gap);
      const y = 160;
      this.card(x, y, w, 400, rarity.color);
      const g = this.keep(this.add.graphics());
      g.fillStyle(0x140d0a, 1).fillCircle(x, y + 70, 34);
      g.lineStyle(3, rarity.color, 1).strokeCircle(x, y + 70, 34);
      this.keep(itemIcon(this, x, y + 70, item, 54));
      this.text(x, y + 120, item.name, 24, '#ffffff', true);
      this.text(x, y + 156, `${rarity.label.toUpperCase()} ITEM`, 13, rarity.css, true);
      this.text(x, y + 184, item.desc, 16, '#e8d8c8', false, w - 40);
      this.buttons.push(this.keep(new Button(this, x, y + 350, `Take it  (${i + 1})`, { width: 200, height: 52, fontSize: 19 }, () => this.pickItem(id))));
    });
    this.text(GAME_W / 2, GAME_H - 52, '←→ pick · Enter or A take · 1-3 take', 15, '#b09080');
  }

  private renderMenus(): void {
    const next = locate(this.run.wave + 1);
    this.text(GAME_W / 2, 40, 'PICK THE MENU', 44, '#ffb070', true);
    this.text(GAME_W / 2, 100, `How ${courseName(next.course)} is served. A spicy menu pays more Spice for this course.`, 20, '#c8a890');
    const w = 420;
    this.menus.forEach((id, i) => {
      const m = MENUS[id];
      const spicy = m.spiceBonus > 0;
      const x = GAME_W / 2 + (i === 0 ? -240 : 240);
      const y = 170;
      this.card(x, y, w, 340, spicy ? 0xff5a3a : 0xd8d0c4);
      this.text(x, y + 22, m.name.toUpperCase(), 30, spicy ? '#ff9a7a' : '#ffffff', true);
      this.text(x, y + 100, m.desc, 20, '#e8d8c8', false, w - 50);
      this.text(x, y + 170, spicy ? `+${Math.round(m.spiceBonus * 100)}% Spice this course` : 'Normal Spice', 22, spicy ? '#ffd060' : '#c8a890', true);
      this.buttons.push(this.keep(new Button(this, x, y + 290, `Serve it  (${i + 1})`, { width: 220, height: 52, fontSize: 19, fill: spicy ? 0xb8502a : 0x5a4a3a }, () => this.pickMenu(id))));
    });
    this.text(GAME_W / 2, GAME_H - 52, '←→ pick · Enter or A serve · 1-2 serve', 15, '#b09080');
  }

  private takeHome(): void {
    if (this.leaving || this.time.now < this.readyAt) return;
    this.leaving = true;
    audio.play('victory');
    this.scene.start('Victory', { run: this.run, outcome: 'home', hp: this.hp });
  }

  private seconds(): void {
    if (this.leaving || this.time.now < this.readyAt) return;
    const run = this.run;
    const bag = Math.floor(run.bag);
    if (bag >= BIG_PUSH) tally(run, 'bigPushes');
    tally(run, 'pushes');
    // Lunchbox talent: part of the bag is banked for keeps.
    const banked = Math.floor(bag * run.mods.pushBank);
    if (banked > 0) {
      run.bag -= banked;
      run.bankedDuringRun += banked;
      bankSpice(banked);
    }
    run.pushes++;
    audio.play('buy');
    this.stage = 'item';
    this.focus = 0;
    this.readyAt = this.time.now + 300;
    this.render();
  }

  private pickItem(id: string): void {
    if (this.time.now < this.readyAt) return;
    this.run.items.push(id);
    audio.play('buy');
    this.stage = 'menu';
    this.focus = 0;
    this.readyAt = this.time.now + 300;
    this.render();
  }

  private pickMenu(id: MenuId): void {
    if (this.leaving || this.time.now < this.readyAt) return;
    this.leaving = true;
    this.run.menu = id;
    audio.play('click');
    this.scene.start('Shop', { run: this.run });
  }
}
