import { describe, expect, it } from 'vitest';
import {
  ACTIONS, DEFAULT_BINDINGS, actionFor, codesFor, defaultBindings, guessLayoutFromLanguage, keyLabel,
  layoutFromMap, moveKeysLabel, rebind, sanitizeBindings,
} from '../src/state/controls';
import { sanitize, defaultSettings } from '../src/state/settings';
import { computeRenderScale, MAX_RENDER_SCALE } from '../src/ui/view';

const AZERTY_MAP = new Map([['KeyW', 'z'], ['KeyA', 'q'], ['KeyS', 's'], ['KeyD', 'd'], ['KeyQ', 'a'], ['KeyZ', 'w'], ['KeyY', 'y']]);

describe('controls: physical-position bindings', () => {
  it('defaults are WASD positions plus fixed arrows, Space/Shift dash, P and always Esc to pause', () => {
    const b = defaultBindings();
    expect(b.up).toEqual(['KeyW']);
    expect(codesFor(b, 'up')).toEqual(['KeyW', 'ArrowUp']);
    expect(codesFor(b, 'pause')).toEqual(['KeyP', 'Escape']);
    expect(actionFor(b, 'Space')).toBe('dash');
    expect(actionFor(b, 'ArrowLeft')).toBe('left');
    expect(actionFor(b, 'KeyQ')).toBeNull();
  });

  it('rebinding takes the key away from another action, and swaps so nothing is left unbound', () => {
    const b = rebind(defaultBindings(), 'dash', 'KeyW'); // KeyW was "up"
    expect(b.dash[0]).toBe('KeyW');
    expect(b.up).toEqual(['Space']); // up got dash's old primary
    for (const { id } of ACTIONS) expect(b[id].length, id).toBeGreaterThan(0);
  });

  it('rebinding replaces the primary key and keeps the others', () => {
    const b = rebind(defaultBindings(), 'dash', 'KeyJ');
    expect(b.dash).toEqual(['KeyJ', 'ShiftLeft', 'ShiftRight']);
    expect(DEFAULT_BINDINGS.dash[0]).toBe('Space'); // defaults untouched
  });

  it('refuses reserved keys like Escape', () => {
    expect(rebind(defaultBindings(), 'dash', 'Escape')).toEqual(defaultBindings());
  });

  it('sanitizes stored bindings, keeping what is valid', () => {
    expect(sanitizeBindings(null)).toEqual(defaultBindings());
    const s = sanitizeBindings({ up: ['KeyI'], down: [], left: 'nope', dash: [42, 'KeyJ', 'KeyJ'] });
    expect(s.up).toEqual(['KeyI']);
    expect(s.down).toEqual(['KeyS']);
    expect(s.left).toEqual(['KeyA']);
    expect(s.dash).toEqual(['KeyJ']);
    expect(sanitize({ ...defaultSettings(), keyBindings: undefined as never }).keyBindings).toEqual(defaultBindings());
  });
});

describe('controls: labels follow the keyboard layout', () => {
  it('detects AZERTY and QWERTZ from a browser layout map', () => {
    expect(layoutFromMap(AZERTY_MAP)).toBe('AZERTY');
    expect(layoutFromMap(new Map([['KeyW', 'w'], ['KeyY', 'z']]))).toBe('QWERTZ');
    expect(layoutFromMap(new Map([['KeyW', 'w'], ['KeyY', 'y']]))).toBe('QWERTY');
  });

  it('guesses from the language when the browser cannot say', () => {
    expect(guessLayoutFromLanguage('fr-FR')).toBe('AZERTY');
    expect(guessLayoutFromLanguage('fr-BE')).toBe('AZERTY');
    expect(guessLayoutFromLanguage('nl-BE')).toBe('AZERTY');
    expect(guessLayoutFromLanguage('fr-CA')).toBe('QWERTY');
    expect(guessLayoutFromLanguage('de-DE')).toBe('QWERTZ');
    expect(guessLayoutFromLanguage('en-US')).toBe('QWERTY');
    expect(guessLayoutFromLanguage(undefined)).toBe('QWERTY');
  });

  it('shows ZQSD on AZERTY and WASD on QWERTY for the same physical keys', () => {
    const b = defaultBindings();
    expect(moveKeysLabel(b, 'QWERTY')).toBe('WASD');
    expect(moveKeysLabel(b, 'AZERTY')).toBe('ZQSD');
    expect(moveKeysLabel(b, 'QWERTY', AZERTY_MAP)).toBe('ZQSD');
    expect(keyLabel('Space')).toBe('Space');
    expect(keyLabel('ArrowUp')).toBe('↑');
    expect(keyLabel('Digit1', 'AZERTY')).toBe('1');
  });
});

describe('render scale', () => {
  it('matches the screen, never below 1×, capped for huge screens', () => {
    expect(computeRenderScale(1280, 720, 1)).toBe(1);
    expect(computeRenderScale(1280, 720, 2)).toBe(2);
    expect(computeRenderScale(1920, 1080, 1)).toBe(1.5);
    expect(computeRenderScale(2560, 1440, 1)).toBe(2);
    expect(computeRenderScale(800, 450, 1)).toBe(1);
    expect(computeRenderScale(3840, 2160, 2)).toBe(MAX_RENDER_SCALE);
  });
});
