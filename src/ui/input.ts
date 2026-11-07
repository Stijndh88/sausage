import type Phaser from 'phaser';
import { codesFor, type Action } from '../state/controls';
import { getSettings } from '../state/settings';

/**
 * Key names used by the menus, mapped to physical key positions (KeyboardEvent.code), so they
 * work on any keyboard layout: "ONE" is the top-row 1 key even on AZERTY, where it prints "&".
 */
const CODES: Record<string, string[]> = {
  ONE: ['Digit1', 'Numpad1'], TWO: ['Digit2', 'Numpad2'], THREE: ['Digit3', 'Numpad3'], FOUR: ['Digit4', 'Numpad4'], FIVE: ['Digit5', 'Numpad5'],
  ENTER: ['Enter', 'NumpadEnter'], ESC: ['Escape'], SPACE: ['Space'], SHIFT: ['ShiftLeft', 'ShiftRight'],
  UP: ['ArrowUp'], DOWN: ['ArrowDown'], LEFT: ['ArrowLeft'], RIGHT: ['ArrowRight'],
  W: ['KeyW'], A: ['KeyA'], S: ['KeyS'], D: ['KeyD'], P: ['KeyP'], R: ['KeyR'], C: ['KeyC'], H: ['KeyH'], M: ['KeyM'], TAB: ['Tab'],
};

/**
 * Bind a key so each physical press runs `fn` exactly once.
 *
 * - Matches by physical key position (event.code), so layouts don't matter.
 * - Ignores OS auto-repeat (a held key).
 * - Ignores Phaser's replays: the keyboard plugin queues DOM events and re-dispatches the
 *   queue when several keys arrive in one frame, which used to fire shop actions many times.
 * - Optional `ready()` gate, e.g. to ignore keys for a moment after a screen opens.
 */
export function onKeyPress(
  kb: Phaser.Input.Keyboard.KeyboardPlugin,
  key: string,
  fn: (e: KeyboardEvent) => void,
  ready: () => boolean = () => true,
): void {
  const codes = CODES[key] ?? [key];
  onCodes(kb, () => codes, fn, ready);
}

/** Like onKeyPress, for a rebindable action; reads the bindings at press time. */
export function onAction(
  kb: Phaser.Input.Keyboard.KeyboardPlugin,
  action: Action,
  fn: (e: KeyboardEvent) => void,
  ready: () => boolean = () => true,
): void {
  onCodes(kb, () => codesFor(getSettings().keyBindings, action), fn, ready);
}

function onCodes(
  kb: Phaser.Input.Keyboard.KeyboardPlugin,
  codes: () => string[],
  fn: (e: KeyboardEvent) => void,
  ready: () => boolean,
): void {
  const seen = new WeakSet<KeyboardEvent>();
  kb.on('keydown', (e: KeyboardEvent) => {
    if (e.repeat || seen.has(e) || !codes().includes(e.code)) return;
    seen.add(e);
    if (ready()) fn(e);
  });
}
