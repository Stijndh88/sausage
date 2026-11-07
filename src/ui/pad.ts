import type Phaser from 'phaser';
import { setInputMode } from './inputMode';

export type PadButton = 'up' | 'down' | 'left' | 'right' | 'a' | 'b' | 'x' | 'y' | 'start' | 'lb' | 'rb';
type Face = 'a' | 'b' | 'x' | 'y' | 'lb' | 'rb' | 'lt' | 'rt' | 'back' | 'start';

const STICK = 0.55;
const DEADZONE = 0.2;
/** An axis must be seen this close to centre before we trust it (see `trusted` below). */
const CENTRED = 0.3;

/** Standard-mapping button indices (Xbox layout); the browser remaps most pads to this. */
const STANDARD: Record<Face | 'up' | 'down' | 'left' | 'right', number> = {
  a: 0, b: 1, x: 2, y: 3, lb: 4, rb: 5, lt: 6, rt: 7, back: 8, start: 9, up: 12, down: 13, left: 14, right: 15,
};
/**
 * PlayStation pads (DualSense, DualShock 4) when the browser does NOT remap them (Firefox,
 * some Bluetooth setups): raw HID order, D-pad on a "hat" axis.
 */
const PLAYSTATION_RAW: Record<Face, number> = {
  x: 0 /* Square */, a: 1 /* Cross */, b: 2 /* Circle */, y: 3 /* Triangle */,
  lb: 4, rb: 5, lt: 6, rt: 7, back: 8 /* Create/Share */, start: 9 /* Options */,
};

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
 * Decode a D-pad "hat" axis: eight directions spread over -1..1 in steps of 2/7, starting at
 * up and going clockwise; anything past 1 (usually 1.29) is "not pressed".
 */
export function decodeHat(v: number): { x: number; y: number } {
  if (!Number.isFinite(v) || v < -1.05 || v > 1.05) return { x: 0, y: 0 };
  const step = Math.round((v + 1) / (2 / 7)) & 7; // 0 up, 1 up-right, 2 right, ... 7 up-left
  const dirs = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];
  return { x: dirs[step][0], y: dirs[step][1] };
}

function isPlayStation(id: string): boolean {
  return /054c|dualsense|dualshock|playstation|wireless controller/i.test(id);
}

/**
 * What we've learned about each connected device, kept across screens. Keyed by slot + name.
 *
 * `trusted` holds axes that have been seen near centre at least once. Some devices report an
 * axis pinned at -1 until it first moves, or never move it at all: a DualSense often shows up
 * twice (the raw device plus a Steam / DS4Windows virtual pad), and an untouched entry can sit
 * at -1/-1, which steered the sausage into the top-left corner. An untrusted axis reads 0.
 */
interface PadMemory {
  trusted: Set<number>;
  /** Index of a D-pad hat axis, once seen resting past 1. */
  hat: number | null;
  /** Last time this device was actually used (a button or a trusted stick). */
  usedAt: number;
}
const memory = new Map<string, PadMemory>();
const keyOf = (p: Gamepad) => `${p.index}|${p.id}`;

function remember(p: Gamepad): PadMemory {
  let m = memory.get(keyOf(p));
  if (!m) {
    m = { trusted: new Set(), hat: null, usedAt: 0 };
    memory.set(keyOf(p), m);
  }
  p.axes.forEach((v, i) => {
    if (Math.abs(v) < CENTRED) m!.trusted.add(i);
    if (m!.hat === null && v > 1.1 && v < 1.6 && p.mapping !== 'standard') m!.hat = i;
  });
  return m;
}

export interface PadReading {
  /** Buttons held right now (D-pad and stick directions included as up/down/left/right). */
  held: Set<PadButton>;
  /** Left stick after deadzone, or the D-pad; length ≤ 1. */
  move: { x: number; y: number };
}

/** One device, in the game's terms. */
function readOne(p: Gamepad): PadReading & { active: boolean } {
  const m = remember(p);
  const layout: Partial<Record<Face | 'up' | 'down' | 'left' | 'right', number>> =
    p.mapping === 'standard' ? STANDARD : isPlayStation(p.id) ? PLAYSTATION_RAW : STANDARD;
  const down = (name: keyof typeof STANDARD) => {
    const i = layout[name];
    return i !== undefined && !!p.buttons[i]?.pressed;
  };
  const axis = (i: number) => (m.trusted.has(i) ? p.axes[i] ?? 0 : 0);

  const stick = applyDeadzone(axis(0), axis(1));
  let dx = (down('right') ? 1 : 0) - (down('left') ? 1 : 0);
  let dy = (down('down') ? 1 : 0) - (down('up') ? 1 : 0);
  if (dx === 0 && dy === 0 && m.hat !== null) ({ x: dx, y: dy } = decodeHat(p.axes[m.hat] ?? 2));

  const held = new Set<PadButton>();
  const sx = axis(0);
  const sy = axis(1);
  if (dy < 0 || sy < -STICK) held.add('up');
  if (dy > 0 || sy > STICK) held.add('down');
  if (dx < 0 || sx < -STICK) held.add('left');
  if (dx > 0 || sx > STICK) held.add('right');
  for (const b of ['a', 'b', 'x', 'y'] as const) if (down(b)) held.add(b);
  if (down('start') || down('back')) held.add('start');
  if (down('lb') || down('lt')) held.add('lb');
  if (down('rb') || down('rt')) held.add('rb');

  let move = stick;
  if (move.x === 0 && move.y === 0) move = { x: dx, y: dy };
  const len = Math.hypot(move.x, move.y);
  if (len > 1) move = { x: move.x / len, y: move.y / len };
  const active = held.size > 0 || len > 0;
  if (active) m.usedAt = performance.now();
  return { held, move, active };
}

/** Every connected device. Never throws. */
export function connectedPads(): Gamepad[] {
  try {
    return [...(navigator.getGamepads?.() ?? [])].filter((p): p is Gamepad => !!p && p.connected);
  } catch {
    return []; // Not allowed (e.g. a permissions policy): no controller.
  }
}

/**
 * Read all connected controllers as one. Buttons from any of them count; movement comes from
 * the one in use (the most recently used one that is moving). Read straight from the browser
 * rather than through Phaser, which keeps a separate copy per scene that reads "nothing
 * pressed" on its first frame (a held A then counted as a new press on the next screen).
 */
export function readPads(): PadReading & { connected: number } {
  const pads = connectedPads();
  const held = new Set<PadButton>();
  let move = { x: 0, y: 0 };
  let moveAt = -1;
  for (const p of pads) {
    const r = readOne(p);
    for (const b of r.held) held.add(b);
    const usedAt = memory.get(keyOf(p))?.usedAt ?? 0;
    if ((r.move.x || r.move.y) && usedAt >= moveAt) {
      move = r.move;
      moveAt = usedAt;
    }
  }
  return { held, move, connected: pads.length };
}

/**
 * Whether losing this device matters: it was the one being used, or nothing is left.
 * A never-used duplicate (a DualSense's second entry, say) coming and going is ignored.
 */
export function lostPadMatters(p: Gamepad | null | undefined): boolean {
  if (!connectedPads().length) return true;
  if (!p) return false;
  return (memory.get(keyOf(p))?.usedAt ?? 0) > 0;
}

/** The controller in use (most recently used, else the first), e.g. for its name. */
export function firstPad(): Gamepad | null {
  const pads = connectedPads();
  let best: Gamepad | null = pads[0] ?? null;
  let at = -1;
  for (const p of pads) {
    const u = memory.get(keyOf(p))?.usedAt ?? 0;
    if (u > at) {
      at = u;
      best = p;
    }
  }
  return best;
}

/** Plain-text report of every device and what the game reads from it (Settings → Controller check). */
export function padReport(): string[] {
  const pads = connectedPads();
  if (!pads.length) return ['No controller found.', 'Connect one and press any button on it.'];
  const lines: string[] = [];
  for (const p of pads) {
    const r = readOne(p);
    const m = memory.get(keyOf(p))!;
    const name = p.id.replace(/\s*\(.*$/, '').slice(0, 48);
    lines.push(`#${p.index + 1}  ${name}`);
    lines.push(`   layout: ${p.mapping === 'standard' ? 'standard' : isPlayStation(p.id) ? 'PlayStation (raw)' : 'unknown (raw)'}` +
      `   ${p.buttons.length} buttons, ${p.axes.length} axes${m.hat !== null ? `, D-pad on axis ${m.hat}` : ''}`);
    const pressedIdx = p.buttons.map((b, i) => (b?.pressed ? i : -1)).filter((i) => i >= 0);
    lines.push(`   raw buttons down: ${pressedIdx.length ? pressedIdx.join(' ') : '-'}`);
    lines.push(`   raw axes: ${p.axes.map((v, i) => `${m.trusted.has(i) || i === m.hat ? '' : '?'}${v.toFixed(2)}`).join('  ')}`);
    lines.push(`   game reads: ${r.held.size ? [...r.held].join(' ') : '-'}   move ${r.move.x.toFixed(2)}, ${r.move.y.toFixed(2)}`);
    lines.push('');
  }
  lines.push('? = axis ignored until it has been seen near the centre.');
  return lines;
}

/**
 * Reads the controllers each frame. `poll()` returns buttons pressed since the last call
 * (D-pad and left stick both count as directions); `move()` gives the analog movement vector.
 * Any use of a pad switches the on-screen prompts to controller buttons.
 */
export class PadPoller {
  private held = new Set<PadButton>();
  /**
   * False until the first reading: buttons already down when a screen opens (the A that
   * opened it) must be released before they count, or one long press skips a screen.
   */
  private primed = false;

  poll(_scene?: Phaser.Scene): PadButton[] {
    const r = readPads();
    if (!r.connected) {
      this.held.clear();
      return [];
    }
    const pressed = this.primed ? [...r.held].filter((b) => !this.held.has(b)) : [];
    this.primed = true;
    this.held = r.held;
    if (pressed.length) setInputMode('pad');
    return pressed;
  }

  /** Movement from the left stick (with deadzone) or the D-pad; length ≤ 1. */
  move(_scene?: Phaser.Scene): { x: number; y: number } {
    const { move } = readPads();
    if (move.x !== 0 || move.y !== 0) setInputMode('pad');
    return move;
  }
}
