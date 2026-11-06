import type Phaser from 'phaser';
import type { Button } from './Button';
import { onKeyPress } from './input';

/**
 * Keyboard (and gamepad, via `move`/`confirm`) navigation over a vertical list of buttons.
 * Keys are bound once per scene; the list only reacts while `active` is true.
 */
export class MenuList {
  active = true;
  private index = 0;

  constructor(scene: Phaser.Scene, private buttons: Button[], ready: () => boolean = () => true) {
    const kb = scene.input.keyboard!;
    const when = (fn: () => void) => () => { if (this.active && ready()) fn(); };
    onKeyPress(kb, 'UP', when(() => this.move(-1)));
    onKeyPress(kb, 'W', when(() => this.move(-1)));
    onKeyPress(kb, 'DOWN', when(() => this.move(1)));
    onKeyPress(kb, 'S', when(() => this.move(1)));
    onKeyPress(kb, 'ENTER', when(() => this.confirm()));
    this.refresh();
  }

  setButtons(buttons: Button[], index = 0): void {
    this.buttons = buttons;
    this.index = Math.min(index, Math.max(0, buttons.length - 1));
    this.refresh();
  }

  move(d: number): void {
    if (!this.buttons.length) return;
    this.index = (this.index + d + this.buttons.length) % this.buttons.length;
    this.refresh();
  }

  confirm(): void {
    this.buttons[this.index]?.press();
  }

  get focusedIndex(): number {
    return this.index;
  }

  private refresh(): void {
    this.buttons.forEach((b, i) => b.setFocused(i === this.index));
  }
}
