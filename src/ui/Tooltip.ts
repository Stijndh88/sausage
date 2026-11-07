import Phaser from 'phaser';
import { GAME_H, GAME_W } from '../art/textures';
import { FONT } from './Hud';
import { getInputMode } from './inputMode';
import type { TooltipContent } from './tooltipText';

const W = 290;
const PAD = 14;

/**
 * A small info panel for links and items. Mouse: hover shows it. Touch: tap shows it, tap
 * anywhere else hides it. Keyboard and controller screens call `show()` for the focused thing.
 */
export class Tooltip {
  private objects: Phaser.GameObjects.GameObject[] = [];
  private shownAt = -1;
  /** The content on screen right now (tests read it). */
  current: TooltipContent | null = null;

  constructor(private readonly scene: Phaser.Scene, private readonly depth: number) {
    // A tap on anything that isn't a tooltip target closes it (touch has no "pointer out").
    const onDown = () => {
      if (getInputMode() === 'touch' && this.scene.game.loop.frame !== this.shownAt) this.hide();
    };
    scene.input.on('pointerdown', onDown);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.input.off('pointerdown', onDown));
  }

  /** Show `content` next to (x, y), above it when there's room, kept on screen. */
  show(content: TooltipContent, x: number, y: number): void {
    this.hide();
    this.current = content;
    this.shownAt = this.scene.game.loop.frame;
    const s = this.scene;
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      this.objects.push(o);
      (o as unknown as Phaser.GameObjects.Components.Depth).setDepth?.(this.depth);
      return o;
    };
    const color = Phaser.Display.Color.HexStringToColor(content.color).color;
    const g = add(s.add.graphics());
    const title = add(s.add.text(0, 0, content.title, { fontFamily: FONT, fontSize: '18px', fontStyle: 'bold', color: '#ffffff' }));
    const sub = add(s.add.text(0, 0, content.subtitle, { fontFamily: FONT, fontSize: '11px', fontStyle: 'bold', color: content.color }));
    const body = add(s.add.text(0, 0, content.lines.join('\n'), {
      fontFamily: FONT, fontSize: '13px', color: '#e8d8c8', wordWrap: { width: W - PAD * 2 }, lineSpacing: 4,
    }));
    const h = PAD + title.height + 2 + sub.height + 8 + body.height + PAD;
    const left = Phaser.Math.Clamp(x - W / 2, 8, GAME_W - W - 8);
    let top = y - h - 34;
    if (top < 8) top = Math.min(GAME_H - h - 8, y + 34);
    g.fillStyle(0x000000, 0.45).fillRoundedRect(left + 3, top + 4, W, h, 10);
    g.fillStyle(0x140d0a, 0.97).fillRoundedRect(left, top, W, h, 10);
    g.lineStyle(2, color, 1).strokeRoundedRect(left, top, W, h, 10);
    title.setPosition(left + PAD, top + PAD);
    sub.setPosition(left + PAD, title.y + title.height + 2);
    body.setPosition(left + PAD, sub.y + sub.height + 8);
  }

  hide(): void {
    this.current = null;
    for (const o of this.objects) o.destroy();
    this.objects = [];
  }

  /**
   * Make `target` show this tooltip: on hover with a mouse, on tap with touch. `onShow` lets the
   * screen move its keyboard/controller focus to the same thing.
   */
  attach(target: Phaser.GameObjects.GameObject & { input?: Phaser.Types.Input.InteractiveObject | null }, content: () => TooltipContent, x: number, y: number, onShow?: () => void): void {
    if (!target.input) (target as unknown as Phaser.GameObjects.Zone).setInteractive();
    const show = () => {
      this.show(content(), x, y);
      onShow?.();
    };
    target.on('pointerover', () => { if (getInputMode() !== 'touch') show(); });
    target.on('pointerout', () => { if (getInputMode() !== 'touch') this.hide(); });
    target.on('pointerdown', () => { if (getInputMode() === 'touch') show(); });
  }
}
