import type Phaser from 'phaser';

export type PadButton = 'up' | 'down' | 'left' | 'right' | 'a' | 'b' | 'x' | 'y' | 'start' | 'lb' | 'rb';

const STICK = 0.55;
const DEADZONE = 0.2;

/** Standard-mapping button indices (Xbox layout). */
const BTN = { a: 0, b: 1, x: 2, y: 3, lb: 4, rb: 5, lt: 6, rt: 7, start: 9, up: 12, down: 13, left: 14, right: 15 };

/**
 * Reads the first connected gamepad. `poll()` returns buttons pressed since the last call
 * (D-pad and left stick both count as directions); `move()` gives the analog movement vector.
 */
export class PadPoller {
  private held = new Set<PadButton>();

  private pad(scene: Phaser.Scene): Phaser.Input.Gamepad.Gamepad | null {
    const gp = scene.input.gamepad;
    if (!gp || gp.total === 0) return null;
    return gp.getPad(0) ?? gp.pad1 ?? null;
  }

  poll(scene: Phaser.Scene): PadButton[] {
    const pad = this.pad(scene);
    if (!pad) {
      this.held.clear();
      return [];
    }
    const down = (i: number) => !!pad.buttons[i]?.pressed;
    const sx = pad.leftStick?.x ?? 0;
    const sy = pad.leftStick?.y ?? 0;
    const now = new Set<PadButton>();
    if (down(BTN.up) || sy < -STICK) now.add('up');
    if (down(BTN.down) || sy > STICK) now.add('down');
    if (down(BTN.left) || sx < -STICK) now.add('left');
    if (down(BTN.right) || sx > STICK) now.add('right');
    if (down(BTN.a)) now.add('a');
    if (down(BTN.b)) now.add('b');
    if (down(BTN.x)) now.add('x');
    if (down(BTN.y)) now.add('y');
    if (down(BTN.start)) now.add('start');
    if (down(BTN.lb) || down(BTN.lt)) now.add('lb');
    if (down(BTN.rb) || down(BTN.rt)) now.add('rb');
    const pressed = [...now].filter((b) => !this.held.has(b));
    this.held = now;
    return pressed;
  }

  /** Movement from the left stick (with deadzone) or the D-pad; length ≤ 1. */
  move(scene: Phaser.Scene): { x: number; y: number } {
    const pad = this.pad(scene);
    if (!pad) return { x: 0, y: 0 };
    let x = pad.leftStick?.x ?? 0;
    let y = pad.leftStick?.y ?? 0;
    if (Math.hypot(x, y) < DEADZONE) {
      x = (pad.buttons[BTN.right]?.pressed ? 1 : 0) - (pad.buttons[BTN.left]?.pressed ? 1 : 0);
      y = (pad.buttons[BTN.down]?.pressed ? 1 : 0) - (pad.buttons[BTN.up]?.pressed ? 1 : 0);
    }
    const len = Math.hypot(x, y);
    return len > 1 ? { x: x / len, y: y / len } : { x, y };
  }
}
