import Phaser from 'phaser';
import { GAME_H, GAME_W } from '../art/textures';
import { Button } from './Button';
import { FONT } from './Hud';
import { bindPrompt, hint } from './inputMode';
import { padReport } from './pad';

const W = 860;
const H = 560;
const DEPTH = 330;

/**
 * Settings → Controller check: every controller the browser reports, live, with what the game
 * reads from it. For "my controller doesn't work" reports: a screenshot of this says it all.
 */
export class PadCheckPanel {
  private objects: Phaser.GameObjects.GameObject[] = [];
  private text: Phaser.GameObjects.Text | null = null;
  private open = false;
  private readonly tick = () => this.text?.setText(padReport().join('\n'));

  constructor(private readonly scene: Phaser.Scene, private readonly onClose: () => void) {}

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
    const left = (GAME_W - W) / 2;
    const top = (GAME_H - H) / 2;
    add(s.add.rectangle(0, 0, GAME_W, GAME_H, 0x000000, 0.6).setOrigin(0).setInteractive());
    const g = add(s.add.graphics());
    g.fillStyle(0x241812, 1).fillRoundedRect(left, top, W, H, 16);
    g.lineStyle(3, 0xffb347, 1).strokeRoundedRect(left, top, W, H, 16);
    add(s.add.text(GAME_W / 2, top + 34, 'CONTROLLER CHECK', { fontFamily: FONT, fontSize: '28px', fontStyle: 'bold', color: '#ffd9a0' }).setOrigin(0.5));
    add(s.add.text(GAME_W / 2, top + 68, 'Press buttons and move the sticks. If something is off, send a screenshot of this screen.', {
      fontFamily: FONT, fontSize: '14px', color: '#c8a890',
    }).setOrigin(0.5));
    this.text = add(s.add.text(left + 30, top + 100, '', { fontFamily: 'monospace', fontSize: '15px', color: '#ffffff', lineSpacing: 3, wordWrap: { width: W - 60 } }));
    const done = add(new Button(s, GAME_W / 2, top + H - 40, 'Done', { width: 200, height: 46, fill: 0x3c8d3c, hover: 0x2f7a2f }, () => this.hide()));
    bindPrompt(done, () => `Done${hint('Esc', 'B')}`);
    this.tick();
    s.events.on(Phaser.Scenes.Events.UPDATE, this.tick);
  }

  hide(): void {
    if (!this.open) return;
    this.open = false;
    this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.tick);
    for (const o of this.objects) o.destroy();
    this.objects = [];
    this.text = null;
    this.onClose();
  }
}
