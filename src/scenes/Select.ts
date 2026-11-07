import Phaser from 'phaser';
import { GAME_H, GAME_W } from '../art/textures';
import { SAUSAGES, SAUSAGE_IDS, type SausageId } from '../data/sausages';
import { WEAPONS } from '../data/weapons';
import { COURSES, TROPHIES, type TrophyId } from '../data/courses';
import { RECIPES, recipeProgress } from '../data/recipes';
import {
  buySausage, canAffordSausage, chiliUnlocked, isOwned, loadSave, maxChili, pickedChili, sausageState, setChili, writeSave,
} from '../state/save';
import { startRun } from './startRun';
import { Button } from '../ui/Button';
import { FONT } from '../ui/Hud';
import { onKeyPress } from '../ui/input';
import { audio } from '../audio/Audio';
import { PadPoller } from '../ui/pad';
import { fitCamera } from '../ui/view';

const CARD_W = 226;
const CARD_H = 430;
const GAP = 14;
const CARD_Y = 330;

/** Pick a sausage. Locked ones show what unlocks them. */
export class SelectScene extends Phaser.Scene {
  private selected: SausageId = 'frank';
  private ui: Phaser.GameObjects.GameObject[] = [];
  private leaving = false;
  private readyAt = 0;
  private readonly pad = new PadPoller();

  constructor() {
    super('Select');
  }

  init(): void {
    const save = loadSave();
    this.selected = isOwned(save.lastSausage, save) ? save.lastSausage : 'frank';
    this.leaving = false;
  }

  create(): void {
    fitCamera(this);
    audio.setMood('menu');
    this.add.image(0, 0, 'bg-grill').setOrigin(0).setDisplaySize(GAME_W, GAME_H);
    this.add.rectangle(0, 0, GAME_W, GAME_H, 0x140d0a, 0.55).setOrigin(0);
    this.add.text(GAME_W / 2, 52, 'PICK YOUR SAUSAGE', {
      fontFamily: FONT, fontSize: '44px', fontStyle: 'bold', color: '#ffd9a0', stroke: '#3a1408', strokeThickness: 7,
    }).setOrigin(0.5);

    this.readyAt = this.time.now + 250;
    const ready = () => this.time.now >= this.readyAt;
    const kb = this.input.keyboard!;
    const move = (d: number) => {
      const i = SAUSAGE_IDS.indexOf(this.selected);
      this.select(SAUSAGE_IDS[(i + d + SAUSAGE_IDS.length) % SAUSAGE_IDS.length]);
    };
    onKeyPress(kb, 'LEFT', () => move(-1), ready);
    onKeyPress(kb, 'A', () => move(-1), ready);
    onKeyPress(kb, 'RIGHT', () => move(1), ready);
    onKeyPress(kb, 'D', () => move(1), ready);
    ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE'].forEach((k, i) => onKeyPress(kb, k, () => this.select(SAUSAGE_IDS[i]), ready));
    onKeyPress(kb, 'ENTER', () => this.start(), ready);
    onKeyPress(kb, 'SPACE', () => this.start(), ready);
    onKeyPress(kb, 'ESC', () => this.back(), ready);
    onKeyPress(kb, 'UP', () => this.chili(1), ready);
    onKeyPress(kb, 'W', () => this.chili(1), ready);
    onKeyPress(kb, 'DOWN', () => this.chili(-1), ready);
    onKeyPress(kb, 'S', () => this.chili(-1), ready);
    onKeyPress(kb, 'TAB', () => this.rack(), ready);
    kb.addCapture('TAB');

    this.render();
  }

  update(): void {
    if (this.time.now < this.readyAt) {
      this.pad.poll(this); // swallow presses held over from the menu
      return;
    }
    for (const b of this.pad.poll(this)) {
      const i = SAUSAGE_IDS.indexOf(this.selected);
      if (b === 'left') this.select(SAUSAGE_IDS[(i - 1 + SAUSAGE_IDS.length) % SAUSAGE_IDS.length]);
      else if (b === 'right') this.select(SAUSAGE_IDS[(i + 1) % SAUSAGE_IDS.length]);
      else if (b === 'up' || b === 'down') this.chili(b === 'up' ? 1 : -1);
      else if (b === 'a' || b === 'start') this.start();
      else if (b === 'x') this.rack();
      else if (b === 'b') this.back();
    }
  }

  private select(id: SausageId): void {
    if (this.selected === id) return;
    audio.play('click');
    this.selected = id;
    this.render();
  }

  private render(): void {
    for (const o of this.ui) o.destroy();
    this.ui = [];
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      this.ui.push(o);
      return o;
    };
    const save = loadSave();
    add(this.add.text(GAME_W - 40, 52, `${save.spice} Spice`, {
      fontFamily: FONT, fontSize: '26px', fontStyle: 'bold', color: '#ffd060', stroke: '#000', strokeThickness: 4,
    }).setOrigin(1, 0.5));
    const trophyLine = (Object.keys(TROPHIES) as TrophyId[]).filter((t) => save.trophies[t]).map((t) => `${save.trophies[t]} ${TROPHIES[t].short}`).join(' · ');
    if (trophyLine) add(this.add.text(GAME_W - 40, 82, trophyLine, { fontFamily: FONT, fontSize: '14px', color: '#c8a890' }).setOrigin(1, 0.5));
    const total = SAUSAGE_IDS.length * CARD_W + (SAUSAGE_IDS.length - 1) * GAP;
    SAUSAGE_IDS.forEach((id, i) => {
      const def = SAUSAGES[id];
      const state = sausageState(id, save);
      const owned = state === 'owned';
      const sel = id === this.selected;
      const x = (GAME_W - total) / 2 + i * (CARD_W + GAP) + CARD_W / 2;
      const left = x - CARD_W / 2;
      const top = CARD_Y - CARD_H / 2;
      const g = add(this.add.graphics());
      g.fillStyle(0x000000, 0.4).fillRoundedRect(left + 4, top + 6, CARD_W, CARD_H, 14);
      g.fillStyle(sel ? 0x3a2418 : 0x241812, 1).fillRoundedRect(left, top, CARD_W, CARD_H, 14);
      g.lineStyle(sel ? 4 : 2, sel ? 0xffb347 : state === 'buyable' ? 0xffd060 : 0x5a4a3a, 1).strokeRoundedRect(left, top, CARD_W, CARD_H, 14);

      // The sausage itself: its portrait, or head + three links in its colour.
      const lit = owned ? 0xffffff : state === 'buyable' ? 0x9a8a80 : 0x333333;
      if (this.textures.exists(`portrait-${id}`)) {
        add(this.add.image(x, top + 62, `portrait-${id}`).setTint(lit));
      } else {
        const tint = owned ? def.tint : lit;
        for (let k = 2; k >= 0; k--) add(this.add.image(x - 30 - k * 26, top + 70, 'sausage-link').setScale(1.2).setTint(tint));
        add(this.add.image(x + 26, top + 70, 'sausage-head').setScale(1.5).setTint(tint));
      }

      add(this.add.text(x, top + 118, `${i + 1}  ${def.name}`, { fontFamily: FONT, fontSize: '20px', fontStyle: 'bold', color: owned ? '#ffffff' : '#8a7a70' }).setOrigin(0.5));
      const u = def.unlock;
      const price = `${u.spice} Spice${Object.entries(u.trophies ?? {}).map(([t, n]) => ` + ${n} ${TROPHIES[t as TrophyId].name}`).join('')}`;
      if (state === 'locked') {
        const r = RECIPES[u.recipe!];
        const prog = Math.min(r.goal, Math.floor(recipeProgress(save.counters, r.id)));
        add(this.add.image(x, top + 180, 'icon-lock').setScale(2).setTint(0x8a7a70));
        add(this.add.text(x, top + 214, `Recipe: ${r.name}`, { fontFamily: FONT, fontSize: '15px', fontStyle: 'bold', color: '#e8d8c8', align: 'center', wordWrap: { width: CARD_W - 24 } }).setOrigin(0.5, 0));
        add(this.add.text(x, top + 238, r.desc, { fontFamily: FONT, fontSize: '14px', color: '#c8a890', align: 'center', wordWrap: { width: CARD_W - 30 } }).setOrigin(0.5, 0));
        const bw = CARD_W - 40;
        g.fillStyle(0x000000, 0.6).fillRoundedRect(left + 20, top + 300, bw, 8, 4);
        g.fillStyle(0xffb347, 1).fillRoundedRect(left + 20, top + 300, Math.max(4, (bw * prog) / r.goal), 8, 4);
        add(this.add.text(x, top + 314, `${prog.toLocaleString('en-US')} / ${r.goal.toLocaleString('en-US')}`, { fontFamily: FONT, fontSize: '13px', color: '#c8a890' }).setOrigin(0.5, 0));
        add(this.add.text(x, top + 350, `Then buy it: ${price}`, { fontFamily: FONT, fontSize: '13px', color: '#8a7a70', align: 'center', wordWrap: { width: CARD_W - 24 } }).setOrigin(0.5, 0));
      } else if (state === 'buyable') {
        add(this.add.text(x, top + 150, 'Recipe cooked!', { fontFamily: FONT, fontSize: '16px', fontStyle: 'bold', color: '#9cff7a' }).setOrigin(0.5, 0));
        add(this.add.text(left + 16, top + 186, def.perks.map((p) => `•  ${p}`).join('\n'), {
          fontFamily: FONT, fontSize: '13px', color: '#b8a898', wordWrap: { width: CARD_W - 32 }, lineSpacing: 5,
        }));
        add(this.add.text(x, top + CARD_H - 54, `Buy: ${price}`, {
          fontFamily: FONT, fontSize: '15px', fontStyle: 'bold', color: canAffordSausage(id, save) ? '#ffd060' : '#ff8a70', align: 'center', wordWrap: { width: CARD_W - 24 },
        }).setOrigin(0.5, 0));
      } else {
        add(this.add.text(x, top + 142, def.tagline, {
          fontFamily: FONT, fontSize: '13px', fontStyle: 'italic', color: '#c8a890', align: 'center', wordWrap: { width: CARD_W - 24 },
        }).setOrigin(0.5, 0));
        add(this.add.text(left + 16, top + 190, def.perks.map((p) => `•  ${p}`).join('\n'), {
          fontFamily: FONT, fontSize: '14px', color: '#e8d8c8', wordWrap: { width: CARD_W - 32 }, lineSpacing: 6,
        }));
        def.startWeapons.forEach((w, k) => add(this.add.image(x - (def.startWeapons.length - 1) * 18 + k * 36, top + CARD_H - 92, WEAPONS[w].icon).setScale(1.8)));
        const esc = save.bestEscapeBy[id] ?? 0;
        const best = esc ? `Best: home after ${esc <= COURSES.length ? COURSES[esc - 1].name.replace('The ', 'the ') : `Seconds #${esc - COURSES.length}`}` : (save.bestWaveBy[id] ? 'Not taken home yet' : 'Not played yet');
        add(this.add.text(x, top + CARD_H - 58, best, { fontFamily: FONT, fontSize: '13px', color: '#b09080', align: 'center', wordWrap: { width: CARD_W - 20 } }).setOrigin(0.5, 0));
        if (chiliUnlocked(save)) {
          const lv = pickedChili(id, save);
          add(this.add.text(x, top + CARD_H - 30, `Chili ${lv} / ${maxChili(id, save)}${sel ? '  (↑↓)' : ''}`, {
            fontFamily: FONT, fontSize: '14px', fontStyle: 'bold', color: lv ? '#ff7a5a' : '#8a7a70',
          }).setOrigin(0.5, 0));
        }
      }
      const hit = add(this.add.zone(x, CARD_Y, CARD_W, CARD_H).setInteractive({ useHandCursor: state !== 'locked' }));
      hit.on('pointerdown', () => {
        if (this.selected === id) this.start();
        else this.select(id);
      });
    });

    const state = sausageState(this.selected, save);
    const name = SAUSAGES[this.selected].name;
    const label = state === 'owned' ? `Fry ${name}  ▶` : state === 'buyable' ? `Buy ${name}` : 'Locked';
    const enabled = state === 'owned' || (state === 'buyable' && canAffordSausage(this.selected, save));
    add(new Button(this, GAME_W / 2 + 200, GAME_H - 54, label, {
      width: 300, height: 56, fontSize: 21, fill: state === 'buyable' ? 0x8a6a1a : 0x3c8d3c, hover: 0x2f7a2f,
    }, () => this.start()).setEnabled(enabled));
    add(new Button(this, GAME_W / 2 - 280, GAME_H - 54, 'Back (Esc)', { width: 180, height: 56, fill: 0x5a4a3a, hover: 0x7a6650 }, () => this.back()));
    add(new Button(this, GAME_W / 2 - 60, GAME_H - 54, 'Spice Rack (Tab)', { width: 220, height: 56, fill: 0x8a6a1a, hover: 0xa88228 }, () => this.rack()));
  }

  private chili(d: number): void {
    const save = loadSave();
    if (!chiliUnlocked(save) || !isOwned(this.selected, save)) return;
    const next = pickedChili(this.selected, save) + d;
    if (next < 0 || next > maxChili(this.selected, save)) return;
    setChili(this.selected, next);
    audio.play('click');
    this.render();
  }

  private rack(): void {
    if (this.leaving) return;
    this.leaving = true;
    this.scene.start('SpiceRack', { back: 'Select' });
  }

  private start(): void {
    if (this.leaving) return;
    const state = sausageState(this.selected);
    if (state === 'buyable') {
      if (buySausage(this.selected)) {
        audio.play('unlock');
        this.cameras.main.flash(200, 255, 220, 150);
      } else {
        audio.play('deny');
      }
      this.render();
      return;
    }
    if (state !== 'owned') return;
    this.leaving = true;
    writeSave({ ...loadSave(), lastSausage: this.selected });
    startRun(this, this.selected);
  }

  private back(): void {
    if (this.leaving) return;
    this.leaving = true;
    this.scene.start('Menu');
  }
}
