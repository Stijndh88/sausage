import Phaser from 'phaser';
import { bindPrompt, hint } from '../ui/inputMode';
import { GAME_H, GAME_W } from '../art/textures';
import { SAUSAGES, SAUSAGE_IDS, unlockText, type SausageId } from '../data/sausages';
import { WEAPONS } from '../data/weapons';
import { newRun } from '../state/run';
import { isUnlocked, loadSave, writeSave } from '../state/save';
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
/** Cards on screen at once; the row scrolls to keep the selected one in view. */
const VISIBLE = 5;
const NUMBER_KEYS = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'ZERO'];

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
    this.selected = isUnlocked(SAUSAGES[save.lastSausage].unlock) ? save.lastSausage : 'frank';
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
    NUMBER_KEYS.slice(0, SAUSAGE_IDS.length).forEach((k, i) => onKeyPress(kb, k, () => this.select(SAUSAGE_IDS[i]), ready));
    onKeyPress(kb, 'ENTER', () => this.start(), ready);
    onKeyPress(kb, 'SPACE', () => this.start(), ready);
    onKeyPress(kb, 'ESC', () => this.back(), ready);

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
      else if (b === 'a' || b === 'start') this.start();
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
    const n = SAUSAGE_IDS.length;
    const shown = Math.min(VISIBLE, n);
    const first = Phaser.Math.Clamp(SAUSAGE_IDS.indexOf(this.selected) - Math.floor(shown / 2), 0, n - shown);
    const total = shown * CARD_W + (shown - 1) * GAP;
    const rowLeft = (GAME_W - total) / 2;
    SAUSAGE_IDS.slice(first, first + shown).forEach((id, slot) => {
      const i = first + slot;
      const def = SAUSAGES[id];
      const unlocked = isUnlocked(def.unlock, save);
      const sel = id === this.selected;
      const x = rowLeft + slot * (CARD_W + GAP) + CARD_W / 2;
      const left = x - CARD_W / 2;
      const top = CARD_Y - CARD_H / 2;
      const g = add(this.add.graphics());
      g.fillStyle(0x000000, 0.4).fillRoundedRect(left + 4, top + 6, CARD_W, CARD_H, 14);
      g.fillStyle(sel ? 0x3a2418 : 0x241812, 1).fillRoundedRect(left, top, CARD_W, CARD_H, 14);
      g.lineStyle(sel ? 4 : 2, sel ? 0xffb347 : 0x5a4a3a, 1).strokeRoundedRect(left, top, CARD_W, CARD_H, 14);

      // The sausage itself: its portrait, or head + three links in its colour.
      if (this.textures.exists(`portrait-${id}`)) {
        add(this.add.image(x, top + 62, `portrait-${id}`).setTint(unlocked ? 0xffffff : 0x333333));
      } else {
        const tint = unlocked ? def.tint : 0x333333;
        for (let k = 2; k >= 0; k--) add(this.add.image(x - 30 - k * 26, top + 70, 'sausage-link').setScale(1.2).setTint(tint));
        add(this.add.image(x + 26, top + 70, 'sausage-head').setScale(1.5).setTint(tint));
      }

      add(this.add.text(x, top + 118, `${i < NUMBER_KEYS.length ? `${(i + 1) % 10}  ` : ''}${def.name}`, { fontFamily: FONT, fontSize: '20px', fontStyle: 'bold', color: unlocked ? '#ffffff' : '#8a7a70' }).setOrigin(0.5));
      if (!unlocked) {
        add(this.add.image(x, top + 200, 'icon-lock').setScale(2.2).setTint(0x8a7a70));
        add(this.add.text(x, top + 250, unlockText(def.unlock), {
          fontFamily: FONT, fontSize: '15px', color: '#c8a890', align: 'center', wordWrap: { width: CARD_W - 30 },
        }).setOrigin(0.5, 0));
      } else {
        add(this.add.text(x, top + 142, def.tagline, {
          fontFamily: FONT, fontSize: '13px', fontStyle: 'italic', color: '#c8a890', align: 'center', wordWrap: { width: CARD_W - 24 },
        }).setOrigin(0.5, 0));
        add(this.add.text(left + 16, top + 190, def.perks.map((p) => `•  ${p}`).join('\n'), {
          fontFamily: FONT, fontSize: '14px', color: '#e8d8c8', wordWrap: { width: CARD_W - 32 }, lineSpacing: 6,
        }));
        def.startWeapons.forEach((w, k) => add(this.add.image(x - (def.startWeapons.length - 1) * 18 + k * 36, top + CARD_H - 70, WEAPONS[w].icon).setScale(1.8)));
        const best = save.bestWaveBy[id] ?? 0;
        const wins = save.winsBy[id] ?? 0;
        add(this.add.text(x, top + CARD_H - 32, best ? `Best: wave ${best}${wins ? ` · ${wins} win${wins > 1 ? 's' : ''}` : ''}` : 'Not played yet', {
          fontFamily: FONT, fontSize: '13px', color: '#b09080',
        }).setOrigin(0.5));
      }
      const hit = add(this.add.zone(x, CARD_Y, CARD_W, CARD_H).setInteractive({ useHandCursor: unlocked }));
      hit.on('pointerdown', () => {
        if (this.selected === id) this.start();
        else this.select(id);
      });
    });

    // Scroll arrows and a dot per sausage, when there are more than fit.
    if (n > shown) {
      const arrow = (dx: number, label: string, enabled: boolean, target: number) => {
        const t = add(this.add.text(GAME_W / 2 + dx, CARD_Y, label, {
          fontFamily: FONT, fontSize: '34px', fontStyle: 'bold', color: enabled ? '#ffd9a0' : '#5a4a3a', stroke: '#3a1408', strokeThickness: 5,
        }).setOrigin(0.5));
        if (enabled) t.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.select(SAUSAGE_IDS[target]));
      };
      arrow(-total / 2 - 2 - GAP, '◀', first > 0, first - 1);
      arrow(total / 2 + 2 + GAP, '▶', first + shown < n, first + shown);
      const dotGap = 18;
      SAUSAGE_IDS.forEach((id, i) => {
        const dx = (i - (n - 1) / 2) * dotGap;
        const on = id === this.selected;
        const visible = i >= first && i < first + shown;
        add(this.add.circle(GAME_W / 2 + dx, CARD_Y + CARD_H / 2 + 22, on ? 6 : 4, on ? 0xffb347 : visible ? 0xc8a890 : 0x5a4a3a));
      });
    }

    const canStart = isUnlocked(SAUSAGES[this.selected].unlock, save);
    add(new Button(this, GAME_W / 2 + 130, GAME_H - 54, canStart ? `Fry ${SAUSAGES[this.selected].name}  ▶` : 'Locked', {
      width: 300, height: 56, fontSize: 21, fill: 0x3c8d3c, hover: 0x2f7a2f,
    }, () => this.start()).setEnabled(canStart));
    bindPrompt(add(new Button(this, GAME_W / 2 - 160, GAME_H - 54, 'Back', { width: 200, height: 56, fill: 0x5a4a3a, hover: 0x7a6650 }, () => this.back())), () => `Back${hint('Esc', 'B')}`);
  }

  private start(): void {
    if (this.leaving || !isUnlocked(SAUSAGES[this.selected].unlock)) return;
    this.leaving = true;
    writeSave({ ...loadSave(), lastSausage: this.selected });
    this.scene.start('Game', { run: newRun(undefined, this.selected) });
  }

  private back(): void {
    if (this.leaving) return;
    this.leaving = true;
    this.scene.start('Menu');
  }
}
