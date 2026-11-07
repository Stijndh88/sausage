import Phaser from 'phaser';
import { GAME_H, GAME_W } from '../art/textures';
import { RECIPES, RECIPE_IDS, recipeProgress } from '../data/recipes';
import { SAUSAGES } from '../data/sausages';
import { WEAPONS } from '../data/weapons';
import { TALENTS } from '../data/talents';
import { loadSave } from '../state/save';
import { audio } from '../audio/Audio';
import { Button } from '../ui/Button';
import { FONT } from '../ui/Hud';
import { onKeyPress } from '../ui/input';
import { PadPoller } from '../ui/pad';
import { fitCamera } from '../ui/view';

const MILESTONES: ReadonlySet<string> = new Set(['bestCourseReached', 'bestEscape', 'chiliEscape']);

function rewardShort(id: string): string {
  const r = RECIPES[id].reward;
  switch (r.kind) {
    case 'none': return '';
    case 'sausage': return SAUSAGES[r.sausage].name;
    case 'weapon': return WEAPONS[r.weapon].name;
    case 'rarity': return r.rarity === 'rare' ? 'Rare items' : 'Legendary items';
    case 'talent': return TALENTS[r.talent].name;
    case 'chili': return 'Chili levels';
  }
}

/** Every recipe, what it pays and how close you are. */
export class CookbookScene extends Phaser.Scene {
  private leaving = false;
  private readonly pad = new PadPoller();

  constructor() {
    super('Cookbook');
  }

  init(): void {
    this.leaving = false;
  }

  create(): void {
    fitCamera(this);
    audio.setMood('menu');
    this.add.image(0, 0, 'bg-grill').setOrigin(0).setDisplaySize(GAME_W, GAME_H).setAlpha(0.3);
    this.add.rectangle(0, 0, GAME_W, GAME_H, 0x140d0a, 0.8).setOrigin(0);
    const save = loadSave();
    const cooked = RECIPE_IDS.filter((id) => save.cooked.includes(id)).length;
    this.add.text(36, 40, 'THE COOKBOOK', {
      fontFamily: FONT, fontSize: '40px', fontStyle: 'bold', color: '#ffe0b0', stroke: '#3a1408', strokeThickness: 6,
    }).setOrigin(0, 0.5);
    this.add.text(GAME_W - 36, 40, `${cooked} / ${RECIPE_IDS.length} cooked`, { fontFamily: FONT, fontSize: '22px', fontStyle: 'bold', color: '#ffd060' }).setOrigin(1, 0.5);
    this.add.text(36, 74, 'Every run counts, even the ones that end in the bin. Rewards in brackets.', { fontFamily: FONT, fontSize: '14px', color: '#c8a890' });

    const perCol = Math.ceil(RECIPE_IDS.length / 2);
    const colW = (GAME_W - 72 - 24) / 2;
    const g = this.add.graphics();
    RECIPE_IDS.forEach((id, i) => {
      const r = RECIPES[id];
      const done = save.cooked.includes(id);
      const col = Math.floor(i / perCol);
      const row = i % perCol;
      const x = 36 + col * (colW + 24);
      const y = 100 + row * 26;
      const hidden = r.secret && !done;
      const reward = rewardShort(id);
      const name = hidden ? '???' : r.name;
      const desc = hidden ? 'A secret recipe' : r.desc;
      this.add.text(x, y, `${done ? '✓' : '·'} ${name}`, { fontFamily: FONT, fontSize: '14px', fontStyle: 'bold', color: done ? '#9cff7a' : '#ffffff' });
      this.add.text(x + 182, y + 1, `${desc}${reward && !hidden ? ` [${reward}]` : ''}`, { fontFamily: FONT, fontSize: '12px', color: done ? '#9fc890' : '#b09080' });
      const right = x + colW;
      if (done) {
        this.add.text(right, y + 1, `+${r.spice}`, { fontFamily: FONT, fontSize: '13px', fontStyle: 'bold', color: '#7a9a6a' }).setOrigin(1, 0);
      } else if (!hidden) {
        const p = Math.min(r.goal, Math.floor(recipeProgress(save.counters, id)));
        const bw = 44;
        // Milestones (reach a course) are done or not: no bar.
        if (r.goal > 1 && !MILESTONES.has(r.counter)) {
          g.fillStyle(0x000000, 0.6).fillRoundedRect(right - 92, y + 7, bw, 6, 3);
          if (p > 0) g.fillStyle(0xffb347, 1).fillRoundedRect(right - 92, y + 7, Math.max(3, (bw * p) / r.goal), 6, 3);
        }
        this.add.text(right, y + 1, `+${r.spice}`, { fontFamily: FONT, fontSize: '13px', fontStyle: 'bold', color: '#ffd060' }).setOrigin(1, 0);
      }
    });

    const back = () => {
      if (this.leaving) return;
      this.leaving = true;
      this.scene.start('Menu');
    };
    new Button(this, GAME_W / 2, GAME_H - 30, 'Back (Esc)', { width: 220, height: 44, fill: 0x5a4a3a, hover: 0x7a6650 }, back);
    const kb = this.input.keyboard!;
    onKeyPress(kb, 'ESC', back);
    onKeyPress(kb, 'ENTER', back);
    this.events.on(Phaser.Scenes.Events.UPDATE, () => {
      for (const b of this.pad.poll(this)) if (b === 'b' || b === 'a' || b === 'start') back();
    });
  }
}
