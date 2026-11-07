import { describe, expect, it } from 'vitest';
import { applyDeadzone } from '../src/ui/pad';
import { getInputMode, hint, onInputModeChange, setInputMode } from '../src/ui/inputMode';
import { resetSettingsCache, sanitize, defaultSettings } from '../src/state/settings';

describe('gamepad stick deadzone', () => {
  it('ignores small drift', () => {
    expect(applyDeadzone(0.1, 0.1)).toEqual({ x: 0, y: 0 });
  });
  it('starts slow just past the deadzone and reaches full speed at full tilt', () => {
    const slow = applyDeadzone(0.25, 0);
    expect(slow.x).toBeGreaterThan(0);
    expect(slow.x).toBeLessThan(0.1);
    expect(applyDeadzone(1, 0).x).toBeCloseTo(1);
    const diag = applyDeadzone(0.9, 0.9);
    expect(Math.hypot(diag.x, diag.y)).toBeLessThanOrEqual(1.0001);
  });
});

describe('input mode prompts', () => {
  it('shows the key for the device in use, and nothing on touch', () => {
    const seen: string[] = [];
    const off = onInputModeChange((m) => seen.push(m));
    setInputMode('keyboard');
    expect(hint('Enter', 'A')).toBe(' (Enter)');
    setInputMode('pad');
    expect(getInputMode()).toBe('pad');
    expect(hint('Enter', 'A')).toBe(' (A)');
    setInputMode('touch');
    expect(hint('Enter', 'A')).toBe('');
    setInputMode('touch'); // no duplicate event
    off();
    expect(seen.slice(-2)).toEqual(['pad', 'touch']);
  });
});

describe('controller / touch settings', () => {
  it('default to vibration on and DASH on the right, and reject junk', () => {
    resetSettingsCache();
    const d = defaultSettings();
    expect(d.vibration).toBe(true);
    expect(d.dashSide).toBe('right');
    const s = sanitize({ ...d, vibration: undefined, dashSide: 'up' } as never);
    expect(s.vibration).toBe(true);
    expect(s.dashSide).toBe('right');
    expect(sanitize({ ...d, dashSide: 'left', vibration: false }).dashSide).toBe('left');
  });
});
