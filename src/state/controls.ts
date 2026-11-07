/**
 * Keyboard controls are bound to *physical key positions* (KeyboardEvent.code), not to the
 * letters printed on the keys. "KeyW" is the key above "KeyS" on every layout: W on QWERTY,
 * Z on AZERTY. So the default WASD-position controls work on any keyboard without detection;
 * the detected layout is only used to show the right letters (ZQSD on AZERTY).
 */
export type Action = 'up' | 'down' | 'left' | 'right' | 'dash' | 'pause';

export const ACTIONS: readonly { id: Action; label: string }[] = [
  { id: 'up', label: 'Move up' },
  { id: 'left', label: 'Move left' },
  { id: 'down', label: 'Move down' },
  { id: 'right', label: 'Move right' },
  { id: 'dash', label: 'Dash' },
  { id: 'pause', label: 'Pause' },
];

/** Codes per action; the first one is the "primary" key that rebinding replaces. */
export type Bindings = Record<Action, string[]>;

export const DEFAULT_BINDINGS: Readonly<Bindings> = {
  up: ['KeyW'],
  left: ['KeyA'],
  down: ['KeyS'],
  right: ['KeyD'],
  dash: ['Space', 'ShiftLeft', 'ShiftRight'],
  pause: ['KeyP'],
};

/** Always active in addition to the bindings, and not rebindable. */
export const FIXED_BINDINGS: Readonly<Partial<Record<Action, string[]>>> = {
  up: ['ArrowUp'],
  left: ['ArrowLeft'],
  down: ['ArrowDown'],
  right: ['ArrowRight'],
  // Escape always pauses (and closes menus), whatever the bindings.
  pause: ['Escape'],
};

/** Keys that can't be bound to an action (Escape cancels rebinding and always pauses). */
export const RESERVED_CODES = new Set(['Escape', 'Tab', 'F5', 'F11', 'F12']);

export function cloneBindings(b: Readonly<Bindings>): Bindings {
  return Object.fromEntries(ACTIONS.map(({ id }) => [id, [...b[id]]])) as Bindings;
}

export function defaultBindings(): Bindings {
  return cloneBindings(DEFAULT_BINDINGS);
}

export function codesFor(b: Readonly<Bindings>, action: Action): string[] {
  return [...b[action], ...(FIXED_BINDINGS[action] ?? [])];
}

/** Which action a key triggers (bindings first, then the fixed arrows). */
export function actionFor(b: Readonly<Bindings>, code: string): Action | null {
  for (const { id } of ACTIONS) if (codesFor(b, id).includes(code)) return id;
  return null;
}

/**
 * Makes `code` the primary key for `action`. If another action used that key, it loses it;
 * if that leaves it with no keys, it gets this action's old primary key (a swap), so every
 * action always has at least one key. Reserved keys are refused (returns the input unchanged).
 */
export function rebind(b: Readonly<Bindings>, action: Action, code: string): Bindings {
  if (RESERVED_CODES.has(code)) return cloneBindings(b);
  const next = cloneBindings(b);
  const oldPrimary = next[action][0];
  for (const { id } of ACTIONS) {
    if (id === action) continue;
    const i = next[id].indexOf(code);
    if (i < 0) continue;
    next[id].splice(i, 1);
    if (next[id].length === 0 && oldPrimary && oldPrimary !== code) next[id].push(oldPrimary);
  }
  next[action] = [code, ...next[action].filter((c) => c !== code && c !== oldPrimary)];
  return next;
}

/** Keeps whatever is valid in stored bindings and falls back to defaults per action. */
export function sanitizeBindings(raw: unknown): Bindings {
  const out = defaultBindings();
  if (!raw || typeof raw !== 'object') return out;
  for (const { id } of ACTIONS) {
    const v = (raw as Record<string, unknown>)[id];
    if (!Array.isArray(v)) continue;
    const codes = v.filter((c): c is string => typeof c === 'string' && c.length > 0 && c.length < 32);
    if (codes.length) out[id] = [...new Set(codes)];
  }
  return out;
}

// --- Labels ------------------------------------------------------------------------------------

export type LayoutName = 'QWERTY' | 'AZERTY' | 'QWERTZ';

const NAMED: Record<string, string> = {
  Space: 'Space', ShiftLeft: 'L-Shift', ShiftRight: 'R-Shift', ControlLeft: 'L-Ctrl', ControlRight: 'R-Ctrl',
  AltLeft: 'L-Alt', AltRight: 'R-Alt', Escape: 'Esc', Enter: 'Enter', NumpadEnter: 'Num Enter', Backspace: 'Backspace',
  Tab: 'Tab', CapsLock: 'Caps', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
};

/** Letters printed on the keys of the common layouts, where they differ from QWERTY. */
const LAYOUT_DIFFS: Record<LayoutName, Record<string, string>> = {
  QWERTY: {},
  AZERTY: { KeyQ: 'A', KeyW: 'Z', KeyA: 'Q', KeyZ: 'W', Semicolon: 'M', KeyM: ',' },
  QWERTZ: { KeyY: 'Z', KeyZ: 'Y' },
};

/** Guess the layout from the browser language, when the browser can't tell us directly. */
export function guessLayoutFromLanguage(lang: string | undefined): LayoutName {
  const l = (lang ?? '').toLowerCase();
  // French (France, Belgium) and Belgian Dutch use AZERTY; Canadian and Swiss French don't.
  if (l === 'fr' || l.startsWith('fr-fr') || l.startsWith('fr-be') || l.startsWith('nl-be') || l.startsWith('fr-lu') || l.startsWith('fr-mc')) return 'AZERTY';
  if (l.startsWith('de') || l.startsWith('cs') || l.startsWith('sk') || l.startsWith('hu') || l.startsWith('sl') || l.startsWith('hr') || l.startsWith('fr-ch')) return 'QWERTZ';
  return 'QWERTY';
}

/** Recognise the layout from a browser keyboard layout map (code → printed character). */
export function layoutFromMap(map: ReadonlyMap<string, string>): LayoutName {
  const w = map.get('KeyW')?.toUpperCase();
  const y = map.get('KeyY')?.toUpperCase();
  if (w === 'Z') return 'AZERTY';
  if (y === 'Z') return 'QWERTZ';
  return 'QWERTY';
}

/** Printed label for a physical key on the given layout (or browser layout map). */
export function keyLabel(code: string, layout: LayoutName = 'QWERTY', map?: ReadonlyMap<string, string> | null): string {
  if (NAMED[code]) return NAMED[code];
  const fromMap = map?.get(code);
  if (fromMap && fromMap.trim()) return fromMap.toUpperCase();
  const diff = LAYOUT_DIFFS[layout][code];
  if (diff) return diff;
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  return code;
}

/** "ZQSD", "WASD", or "I/J/K/L"-style text for the four movement keys. */
export function moveKeysLabel(b: Readonly<Bindings>, layout: LayoutName = 'QWERTY', map?: ReadonlyMap<string, string> | null): string {
  const keys = (['up', 'left', 'down', 'right'] as const).map((a) => keyLabel(b[a][0], layout, map));
  return keys.every((k) => k.length === 1) ? keys.join('') : keys.join('/');
}
