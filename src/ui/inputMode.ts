import type Phaser from 'phaser';

/**
 * Which kind of input the player is using right now, so on-screen prompts match their hands:
 * "(Enter)" on a keyboard, "(A)" on a controller, nothing on a touch screen (you just tap).
 * Switches as soon as the player touches another device.
 */
export type InputMode = 'keyboard' | 'pad' | 'touch';

/** ?touch=1 forces touch mode (for testing touch on a desktop). */
function forcedTouch(): boolean {
  try {
    return new URLSearchParams(globalThis.location?.search ?? '').get('touch') === '1';
  } catch {
    return false;
  }
}

function coarsePointer(): boolean {
  try {
    return !!globalThis.matchMedia?.('(pointer: coarse)').matches;
  } catch {
    return false;
  }
}

const FORCED = forcedTouch();
let mode: InputMode = FORCED || coarsePointer() ? 'touch' : 'keyboard';
const listeners = new Set<(m: InputMode) => void>();

export function getInputMode(): InputMode {
  return mode;
}

export function setInputMode(next: InputMode): void {
  if (FORCED || next === mode) return;
  mode = next;
  for (const fn of listeners) fn(mode);
}

export function onInputModeChange(fn: (m: InputMode) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Listen for keyboard and pointer use on the page. Gamepad use is reported by PadPoller. */
export function trackInputMode(target: Window = window): void {
  target.addEventListener('keydown', () => setInputMode('keyboard'), { passive: true, capture: true });
  target.addEventListener('pointerdown', (e: PointerEvent) => {
    if (e.pointerType === 'touch' || e.pointerType === 'pen') setInputMode('touch');
    else if (e.pointerType === 'mouse') setInputMode('keyboard');
  }, { passive: true, capture: true });
}

/** A key hint for the current device: " (Enter)", " (A)", or nothing on touch. */
export function hint(keyboard: string, pad: string): string {
  if (mode === 'touch') return '';
  return ` (${mode === 'pad' ? pad : keyboard})`;
}

/**
 * Keep a text (or a Button) in step with the input mode: `make()` runs now and on every mode
 * change until the object is destroyed.
 */
export function bindPrompt(obj: Phaser.GameObjects.GameObject & { setText(t: string): unknown }, make: () => string): void {
  obj.setText(make());
  const off = onInputModeChange(() => { if (obj.active) obj.setText(make()); });
  obj.once('destroy', off);
}
