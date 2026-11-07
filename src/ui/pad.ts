import type Phaser from 'phaser';
import { setInputMode } from './inputMode';

export type PadButton = 'up' | 'down' | 'left' | 'right' | 'a' | 'b' | 'x' | 'y' | 'start' | 'lb' | 'rb';

const STICK = 0.55;
const DEADZONE = 0.2;

/** Standard-mapping button indices (Xbox layout). */
const BTN = { a: 0, b: 1, x: 2, y: 3, lb: 4, rb: 5, lt: 6, rt: 7, back: 8, start: 9, up: 12, down: 13, left: 14, right: 15 };

/**
 * Stick deadzone with rescaling: below the deadzone reads 0, and the rest of the throw is
 * stretched back to 0..1, so a small tilt past the deadzone gives a slow crawl instead of a jump.
 */
export function applyDeadzone(x: number, y: number, dz = DEADZONE): { x: number; y: number } {
  const len = Math.hypot(x, y);
  if (len < dz) return { x: 0, y: 0 };
  const k = Math.min(1, (len - dz) / (1 - dz)) / len;
  return { x: x * k, y: y * k };
}

/**
 * The first connected controller, whatever slot it landed in (Windows often uses slot 1+).
 * Read straight from the browser rather than through Phaser: Phaser keeps a separate copy per
 * scene that reads "nothing pressed" on its first frame, so an A still held from the previous
 * screen would count as a brand-new press on the next one.
 */
export function firstPad(): Gamepad | null {
  try {
    for (const p of navigator.getGamepads?.() ?? []) if (p && p.connected) return p;
  } catch {
    // Not allowed (e.g. a permissions policy): no controller.
  }
  return null;
}

/**
 * Reads the first connected gamepad. `poll()` returns buttons pressed since the last call
 * (D-pad and left stick both count as directions); `move()` gives the analog movement vector.
 * Any use of the pad switches the on-screen prompts to controller buttons.
 */
export class PadPoller {
  private held = new Set<PadButton>();
  /**
   * False until the first reading: buttons already down when a screen opens (the A that
   * opened it) must be released before they count, or one long press skips a screen.
   */
  private primed = false;

  poll(_scene?: Phaser.Scene): PadButton[] {
    const pad = firstPad();
    if (!pad) {
      this.held.clear();
      return [];
    }
    const down = (i: number) => !!pad.buttons[i]?.pressed;
    const sx = pad.axes[0] ?? 0;
    const sy = pad.axes[1] ?? 0;
    const now = new Set<PadButton>();
    if (down(BTN.up) || sy < -STICK) now.add('up');
    if (down(BTN.down) || sy > STICK) now.add('down');
    if (down(BTN.left) || sx < -STICK) now.add('left');
    if (down(BTN.right) || sx > STICK) now.add('right');
    if (down(BTN.a)) now.add('a');
    if (down(BTN.b)) now.add('b');
    if (down(BTN.x)) now.add('x');
    if (down(BTN.y)) now.add('y');
    if (down(BTN.start) || down(BTN.back)) now.add('start');
    if (down(BTN.lb) || down(BTN.lt)) now.add('lb');
    if (down(BTN.rb) || down(BTN.rt)) now.add('rb');
    const pressed = this.primed ? [...now].filter((b) => !this.held.has(b)) : [];
    this.primed = true;
    this.held = now;
    if (pressed.length) setInputMode('pad');
    return pressed;
  }

  /** Movement from the left stick (with deadzone) or the D-pad; length ≤ 1. */
  move(_scene?: Phaser.Scene): { x: number; y: number } {
    const pad = firstPad();
    if (!pad) return { x: 0, y: 0 };
    let { x, y } = applyDeadzone(pad.axes[0] ?? 0, pad.axes[1] ?? 0);
    if (x === 0 && y === 0) {
      x = (pad.buttons[BTN.right]?.pressed ? 1 : 0) - (pad.buttons[BTN.left]?.pressed ? 1 : 0);
      y = (pad.buttons[BTN.down]?.pressed ? 1 : 0) - (pad.buttons[BTN.up]?.pressed ? 1 : 0);
    }
    if (x !== 0 || y !== 0) setInputMode('pad');
    const len = Math.hypot(x, y);
    return len > 1 ? { x: x / len, y: y / len } : { x, y };
  }
}
