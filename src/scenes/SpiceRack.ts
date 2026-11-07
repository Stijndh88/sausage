import Phaser from 'phaser';
import { GAME_H, GAME_W } from '../art/textures';
import { TROPHIES, TROPHY_IDS, type TrophyId } from '../data/courses';
import {
  canBuyTalent, JARS, jarPoints, KEYSTONE_POINTS, rankCost, rankOf, SHELF2_POINTS, spentSpice, TALENT_IDS, TALENTS, type TalentDef,
} from '../data/talents';
import { RECIPES } from '../data/recipes';
import { buyTalent, loadSave, refundTalents } from '../state/save';
import { audio } from '../audio/Audio';
import { Button } from '../ui/Button';
import { FONT } from '../ui/Hud';
import { onKeyPress } from '../ui/input';
import { PadPoller } from '../ui/pad';
import { fitCamera } from '../ui/view';

const COL_W = 290;
const COL_GAP = 16;
const NODE_H = 46;
/** Top of each of the 8 rows: shelf 1 (3), shelf 2 (3), keystones (2). */
const ROW_Y = [140, 190, 240, 306, 356, 406, 472, 522];

function jarTalents(jar: string): TalentDef[] {
  const list = TALENT_IDS.map((id) => TALENTS[id]).filter((t) => t.jar === jar);
  return [...list.filter((t) => t.shelf === 1), ...list.filter((t) => t.shelf === 2), ...list.filter((t) => t.shelf === 3)];
}

/** The talent tree: four spice jars, bought with Spice. Refunds are free. */
export class SpiceRackScene extends Phaser.Scene {
  private col = 0;
  private row = 0;
  private ui: Phaser.GameObjects.GameObject[] = [];
  private back = 'Menu';
  private leaving = false;
  private refundArmed = false;
  private readyAt = 0;
  private readonly pad = new PadPoller();

  constructor() {
    super('SpiceRack');
  }

  init(data: { back?: string }): void {
    this.back = data?.back ?? 'Menu';
    this.leaving = false;
    this.refundArmed = false;
  }

  create(): void {
    fitCamera(this);
    audio.setMood('menu');
    this.add.image(0, 0, 'bg-grill').setOrigin(0).setDisplaySize(GAME_W, GAME_H).setAlpha(0.3);
    this.add.rectangle(0, 0, GAME_W, GAME_H, 0x140d0a, 0.75).setOrigin(0);
    this.readyAt = this.time.now + 250;
    const kb = this.input.keyboard!;
    const ready = () => this.time.now >= this.readyAt;
    onKeyPress(kb, 'LEFT', () => this.move(-1, 0), ready);
    onKeyPress(kb, 'RIGHT', () => this.move(1, 0), ready);
    onKeyPress(kb, 'UP', () => this.move(0, -1), ready);
    onKeyPress(kb, 'DOWN', () => this.move(0, 1), ready);
    onKeyPress(kb, 'ENTER', () => this.buy(), ready);
    onKeyPress(kb, 'R', () => this.refund(), ready);
    onKeyPress(kb, 'ESC', () => this.leave(), ready);
    onKeyPress(kb, 'TAB', () => this.leave(), ready);
    kb.addCapture('TAB');
    this.render();
    (window as unknown as { __sausage?: unknown }).__sausage = this;
  }

  update(): void {
    if (this.time.now < this.readyAt) {
      this.pad.poll(this);
      return;
    }
    for (const b of this.pad.poll(this)) {
      if (b === 'left') this.move(-1, 0);
      else if (b === 'right') this.move(1, 0);
      else if (b === 'up') this.move(0, -1);
      else if (b === 'down') this.move(0, 1);
      else if (b === 'a') this.buy();
      else if (b === 'y') this.refund();
      else if (b === 'b' || b === 'start') this.leave();
    }
  }

  private focused(): TalentDef {
    return jarTalents(JARS[this.col].id)[this.row];
  }

  private move(dc: number, dr: number): void {
    this.col = (this.col + dc + JARS.length) % JARS.length;
    const rows = jarTalents(JARS[this.col].id).length;
    this.row = Math.max(0, Math.min(rows - 1, this.row + dr));
    this.refundArmed = false;
    audio.play('click');
    this.render();
  }

  private buy(id = this.focused().id): void {
    if (buyTalent(id)) {
      audio.play('buy');
    } else {
      audio.play('deny');
    }
    this.refundArmed = false;
    this.render();
  }

  private refund(): void {
    const save = loadSave();
    if (!spentSpice(save.talents)) return;
    if (!this.refundArmed) {
      this.refundArmed = true;
      this.render();
      return;
    }
    refundTalents();
    audio.play('reroll');
    this.refundArmed = false;
    this.render();
  }

  private leave(): void {
    if (this.leaving) return;
    this.leaving = true;
    this.scene.start(this.back);
  }

  private render(): void {
    for (const o of this.ui) o.destroy();
    this.ui = [];
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      this.ui.push(o);
      return o;
    };
    const save = loadSave();
    add(this.add.text(36, 40, 'THE SPICE RACK', {
      fontFamily: FONT, fontSize: '40px', fontStyle: 'bold', color: '#ffe0b0', stroke: '#3a1408', strokeThickness: 6,
    }).setOrigin(0, 0.5));
    add(this.add.text(GAME_W - 36, 30, `${save.spice} Spice`, {
      fontFamily: FONT, fontSize: '28px', fontStyle: 'bold', color: '#ffd060', stroke: '#000', strokeThickness: 4,
    }).setOrigin(1, 0.5));
    add(this.add.text(GAME_W - 36, 60, TROPHY_IDS.map((t) => `${save.trophies[t]} ${TROPHIES[t].name}`).join('  ·  '), {
      fontFamily: FONT, fontSize: '14px', color: '#c8a890',
    }).setOrigin(1, 0.5));

    const g = add(this.add.graphics());
    JARS.forEach((jar, c) => {
      const x = 36 + c * (COL_W + COL_GAP);
      const pts = jarPoints(save.talents, jar.id);
      const talents = jarTalents(jar.id);
      const maxPts = talents.reduce((a, t) => a + t.maxRank, 0);
      // The jar: fills with its colour as you put points in.
      g.fillStyle(0x241812, 0.95).fillRoundedRect(x, 82, COL_W, 48, 10);
      g.fillStyle(jar.color, 0.35).fillRoundedRect(x, 82, Math.max(10, (COL_W * pts) / maxPts), 48, 10);
      g.lineStyle(2, jar.color, 1).strokeRoundedRect(x, 82, COL_W, 48, 10);
      add(this.add.text(x + 12, 88, jar.name.toUpperCase(), { fontFamily: FONT, fontSize: '18px', fontStyle: 'bold', color: jar.css }));
      add(this.add.text(x + 12, 110, jar.theme, { fontFamily: FONT, fontSize: '12px', color: '#c8a890' }));
      add(this.add.text(x + COL_W - 12, 106, `${pts} pts`, { fontFamily: FONT, fontSize: '16px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(1, 0.5));
      add(this.add.text(x + 4, 288, pts >= SHELF2_POINTS ? 'SHELF 2' : `SHELF 2 · ${SHELF2_POINTS} pts to open`, { fontFamily: FONT, fontSize: '11px', fontStyle: 'bold', color: pts >= SHELF2_POINTS ? '#c8a890' : '#7a6a60' }));
      add(this.add.text(x + 4, 454, pts >= KEYSTONE_POINTS ? 'KEYSTONES · need trophies' : `KEYSTONES · ${KEYSTONE_POINTS} pts + trophies`, { fontFamily: FONT, fontSize: '11px', fontStyle: 'bold', color: pts >= KEYSTONE_POINTS ? '#ffd060' : '#7a6a60' }));

      talents.forEach((t, r) => {
        const y = ROW_Y[r];
        const rank = rankOf(save.talents, t.id);
        const check = canBuyTalent(t.id, save.talents, save.spice, save.trophies, save.cooked);
        const maxed = rank >= t.maxRank;
        const open = maxed || check.ok || (check.reason === 'Not enough Spice' || check.reason === 'Not enough trophies');
        const focus = c === this.col && r === this.row;
        g.fillStyle(rank ? 0x3a2418 : 0x1c130f, 1).fillRoundedRect(x, y, COL_W, NODE_H, 8);
        if (rank) g.fillStyle(jar.color, 0.18).fillRoundedRect(x, y, (COL_W * rank) / t.maxRank, NODE_H, 8);
        g.lineStyle(focus ? 3 : 1.5, focus ? 0xffd23f : t.shelf === 3 ? 0xffd060 : open ? 0x7a6a5a : 0x3a2a22, 1).strokeRoundedRect(x, y, COL_W, NODE_H, 8);
        const nameColor = maxed ? jar.css : open ? '#ffffff' : '#7a6a60';
        add(this.add.text(x + 10, y + 5, t.name, { fontFamily: FONT, fontSize: '15px', fontStyle: 'bold', color: nameColor }));
        add(this.add.text(x + COL_W - 10, y + 5, `${rank}/${t.maxRank}`, { fontFamily: FONT, fontSize: '14px', fontStyle: 'bold', color: maxed ? jar.css : '#c8a890' }).setOrigin(1, 0));
        add(this.add.text(x + 10, y + 26, t.desc, { fontFamily: FONT, fontSize: '11.5px', color: open ? '#c8b8a8' : '#6a5a50', wordWrap: { width: COL_W - 70 } }));
        if (!maxed) {
          add(this.add.text(x + COL_W - 10, y + 26, `${rankCost(t, rank)}`, { fontFamily: FONT, fontSize: '13px', fontStyle: 'bold', color: check.ok ? '#ffd060' : '#8a6a50' }).setOrigin(1, 0));
        }
        const hit = add(this.add.zone(x + COL_W / 2, y + NODE_H / 2, COL_W, NODE_H).setInteractive({ useHandCursor: true }));
        hit.on('pointerdown', () => {
          this.col = c;
          this.row = r;
          this.buy(t.id);
        });
      });
    });

    // Detail line for the focused talent.
    const t = this.focused();
    const rank = rankOf(save.talents, t.id);
    const check = canBuyTalent(t.id, save.talents, save.spice, save.trophies, save.cooked);
    const trophyCost = Object.entries(t.trophies ?? {}).map(([k, n]) => `${n} ${TROPHIES[k as TrophyId].name}`).join(' + ');
    const needs = t.recipe && !save.cooked.includes(t.recipe) ? ` · needs the recipe "${RECIPES[t.recipe].name}" (${RECIPES[t.recipe].desc})` : '';
    const status = rank >= t.maxRank ? 'Maxed.' : check.ok
      ? `Enter/A: buy rank ${rank + 1} for ${check.cost} Spice${trophyCost ? ` + ${trophyCost}` : ''}.`
      : `${check.reason}.${trophyCost ? ` Costs ${check.cost} Spice + ${trophyCost}.` : ''}`;
    g.fillStyle(0x241812, 0.95).fillRoundedRect(36, 586, GAME_W - 72, 58, 10);
    add(this.add.text(52, 594, `${t.name}: ${t.desc}${t.maxRank > 1 ? ' per rank' : ''}${needs}`, { fontFamily: FONT, fontSize: '16px', fontStyle: 'bold', color: '#ffffff' }));
    add(this.add.text(52, 618, status, { fontFamily: FONT, fontSize: '15px', color: check.ok ? '#9fe7a8' : '#c8a890' }));

    const spent = spentSpice(save.talents);
    add(new Button(this, 160, GAME_H - 34, 'Back (Esc)', { width: 200, height: 48, fill: 0x5a4a3a, hover: 0x7a6650 }, () => this.leave()));
    add(new Button(this, GAME_W / 2, GAME_H - 34, this.refundArmed ? `Refund ${spent}? Press again` : `Refund all, free (R)`, {
      width: 320, height: 48, fill: 0x6a4a2a, hover: 0x8a6a3a,
    }, () => this.refund()).setEnabled(spent > 0));
    add(this.add.text(GAME_W - 40, GAME_H - 34, 'Arrows pick · Enter buys · Click buys · Pad: A buy, Y refund, B back', {
      fontFamily: FONT, fontSize: '13px', color: '#b09080',
    }).setOrigin(1, 0.5));
  }
}
