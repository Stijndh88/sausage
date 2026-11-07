import { afterEach, describe, expect, it } from 'vitest';
import { decodeHat, lostPadMatters, padReport, readPads } from '../src/ui/pad';

type FakePad = { id: string; index: number; connected: boolean; mapping: string; buttons: { pressed: boolean; value: number }[]; axes: number[]; timestamp: number };

let list: (FakePad | null)[] = [];
Object.defineProperty(globalThis.navigator, 'getGamepads', { value: () => list, configurable: true });

let nextIndex = 0;
function pad(opts: Partial<FakePad> & { nButtons?: number; nAxes?: number } = {}): FakePad {
  const p: FakePad = {
    id: opts.id ?? 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e)',
    index: opts.index ?? nextIndex++,
    connected: true,
    mapping: opts.mapping ?? 'standard',
    buttons: Array.from({ length: opts.nButtons ?? 17 }, () => ({ pressed: false, value: 0 })),
    axes: opts.axes ?? [0, 0, 0, 0],
    timestamp: 0,
  };
  return p;
}
const press = (p: FakePad, i: number, on = true) => { p.buttons[i] = { pressed: on, value: on ? 1 : 0 }; };

afterEach(() => {
  list = [];
  nextIndex += 10; // fresh slot keys so learned state from one test can't leak into another
});

describe('D-pad hat axis', () => {
  it('decodes the eight directions and treats the resting value as nothing', () => {
    expect(decodeHat(-1)).toEqual({ x: 0, y: -1 });
    expect(decodeHat(-3 / 7)).toEqual({ x: 1, y: 0 });
    expect(decodeHat(1 / 7)).toEqual({ x: 0, y: 1 });
    expect(decodeHat(5 / 7)).toEqual({ x: -1, y: 0 });
    expect(decodeHat(1)).toEqual({ x: -1, y: -1 });
    expect(decodeHat(9 / 7)).toEqual({ x: 0, y: 0 });
  });
});

describe('DualSense showing up twice (raw device + Steam/DS4Windows virtual pad)', () => {
  it('a duplicate entry stuck at -1/-1 does not steer the sausage to the top-left', () => {
    const ghost = pad({ id: '054c-0ce6-DualSense Wireless Controller', mapping: '', axes: [-1, -1, -1, -1, -1, -1] });
    const real = pad();
    list = [ghost, real];
    expect(readPads().move).toEqual({ x: 0, y: 0 });
    expect(readPads().held.size).toBe(0);
  });

  it('buttons on the second entry still work', () => {
    const ghost = pad({ id: '054c-0ce6-DualSense Wireless Controller', mapping: '', axes: [-1, -1, -1, -1] });
    const real = pad();
    list = [ghost, real];
    press(real, 0);
    expect(readPads().held.has('a')).toBe(true);
  });

  it('the stick on the second entry drives movement', () => {
    const ghost = pad({ mapping: '', axes: [-1, -1] });
    const real = pad();
    list = [ghost, real];
    readPads();
    real.axes = [1, 0, 0, 0];
    const m = readPads().move;
    expect(m.x).toBeCloseTo(1);
    expect(m.y).toBeCloseTo(0);
  });

  it('an axis that starts at -1 is trusted once it has passed through the centre', () => {
    const p = pad({ axes: [-1, -1, 0, 0] });
    list = [p];
    expect(readPads().move).toEqual({ x: 0, y: 0 });
    p.axes = [0.02, -0.01, 0, 0];
    readPads();
    p.axes = [-1, 0, 0, 0];
    expect(readPads().move.x).toBeCloseTo(-1);
  });

  it('only losing the controller in use (or the last one) matters', () => {
    const ghost = pad({ mapping: '', axes: [-1, -1] });
    const real = pad();
    list = [ghost, real];
    press(real, 0);
    readPads();
    list = [real];
    expect(lostPadMatters(ghost as unknown as Gamepad)).toBe(false);
    list = [ghost];
    expect(lostPadMatters(real as unknown as Gamepad)).toBe(true);
    list = [];
    expect(lostPadMatters(ghost as unknown as Gamepad)).toBe(true);
  });
});

describe('PlayStation pad without browser remapping (Firefox, some Bluetooth setups)', () => {
  const raw = () => pad({ id: '054c-0ce6-DualSense Wireless Controller', mapping: '', nButtons: 14, axes: [0, 0, 0, -1, -1, 0, 0, 0, 0, 9 / 7] });

  it('Cross is A, Circle is B, Square is X, Triangle is Y, Options is Start', () => {
    const p = raw();
    list = [p];
    press(p, 1);
    expect([...readPads().held]).toEqual(['a']);
    press(p, 1, false);
    press(p, 2);
    expect([...readPads().held]).toEqual(['b']);
    press(p, 2, false);
    press(p, 0);
    expect([...readPads().held]).toEqual(['x']);
    press(p, 0, false);
    press(p, 9);
    expect([...readPads().held]).toEqual(['start']);
  });

  it('the D-pad on the hat axis moves and navigates', () => {
    const p = raw();
    list = [p];
    readPads(); // learns the hat axis from its resting value
    p.axes[9] = -1; // up
    const r = readPads();
    expect(r.held.has('up')).toBe(true);
    expect(r.move).toEqual({ x: 0, y: -1 });
  });

  it('triggers resting at -1 are not read as a stick', () => {
    const p = raw();
    list = [p];
    expect(readPads().move).toEqual({ x: 0, y: 0 });
    expect(readPads().held.size).toBe(0);
  });

  it('the controller check lists both entries and what the game reads', () => {
    list = [raw(), pad()];
    const text = padReport().join('\n');
    expect(text).toMatch(/DualSense/);
    expect(text).toMatch(/PlayStation \(raw\)/);
    expect(text).toMatch(/game reads/);
  });
});
