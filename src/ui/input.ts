import type Phaser from 'phaser';

/**
 * Bind a key so each physical press runs `fn` exactly once.
 *
 * - Ignores OS auto-repeat (a held key).
 * - Ignores Phaser's replays: the keyboard plugin queues DOM events and re-dispatches the
 *   queue when several keys arrive in one frame, which used to fire shop actions many times.
 * - Optional `ready()` gate, e.g. to ignore keys for a moment after a screen opens.
 */
export function onKeyPress(
  kb: Phaser.Input.Keyboard.KeyboardPlugin,
  key: string,
  fn: () => void,
  ready: () => boolean = () => true,
): void {
  const seen = new WeakSet<KeyboardEvent>();
  kb.on(`keydown-${key}`, (e: KeyboardEvent) => {
    if (e.repeat || seen.has(e)) return;
    seen.add(e);
    if (ready()) fn();
  });
}
