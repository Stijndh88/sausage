import Phaser from 'phaser';
import { codesFor, type Action } from '../state/controls';
import { getSettings } from '../state/settings';

/**
 * Held keys by physical position (KeyboardEvent.code). Cleared when the window loses focus,
 * so a key released while alt-tabbed can't stay stuck.
 */
export class PhysicalKeys {
  private held = new Set<string>();

  constructor(scene: Phaser.Scene) {
    const kb = scene.input.keyboard!;
    const down = (e: KeyboardEvent) => { this.held.add(e.code); };
    const up = (e: KeyboardEvent) => { this.held.delete(e.code); };
    const clear = () => this.held.clear();
    kb.on('keydown', down);
    kb.on('keyup', up);
    scene.game.events.on(Phaser.Core.Events.BLUR, clear);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      kb.off('keydown', down);
      kb.off('keyup', up);
      scene.game.events.off(Phaser.Core.Events.BLUR, clear);
    });
  }

  isDown(code: string): boolean {
    return this.held.has(code);
  }

  /** Is any key bound to this action held (uses the current settings, so rebinding applies at once)? */
  action(action: Action): boolean {
    for (const c of codesFor(getSettings().keyBindings, action)) if (this.held.has(c)) return true;
    return false;
  }

  /** Test hook: press or release a physical key. */
  setHeld(code: string, down: boolean): void {
    if (down) this.held.add(code);
    else this.held.delete(code);
  }

  clear(): void {
    this.held.clear();
  }
}
