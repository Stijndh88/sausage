import { defaultBindings, sanitizeBindings, type Bindings } from './controls';

/** Player settings, saved in localStorage (guarded: the game works without storage). */
export interface Settings {
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  /** 0 = no screen shake, 1 = full. */
  screenShake: number;
  /** Softer, slower blinks and no full-screen flashes. */
  reduceFlashing: boolean;
  /** Fewer particles and tweens; defaults to the OS "reduce motion" setting. */
  reducedMotion: boolean;
  damageNumbers: boolean;
  /** Controller rumble / phone vibration on hits. */
  vibration: boolean;
  /** Touch screens: which side the DASH button sits on (the move stick takes the other side). */
  dashSide: 'right' | 'left';
  /** Keyboard bindings by physical key position (see state/controls.ts). */
  keyBindings: Bindings;
  /** Send anonymous play data (run summaries, errors) to help improve the game. See state/playDataSync.ts. */
  sharePlayData: boolean;
}

const KEY = 'wurst-case-scenario/settings';

function prefersReducedMotion(): boolean {
  try {
    return !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function defaultSettings(): Settings {
  const reduced = prefersReducedMotion();
  return {
    masterVolume: 0.8,
    musicVolume: 0.5,
    sfxVolume: 0.8,
    screenShake: reduced ? 0 : 1,
    reduceFlashing: reduced,
    reducedMotion: reduced,
    damageNumbers: true,
    vibration: true,
    dashSide: 'right',
    keyBindings: defaultBindings(),
    sharePlayData: true,
  };
}

let cache: Settings | null = null;
const listeners = new Set<(s: Settings) => void>();

export function getSettings(): Settings {
  if (cache) return cache;
  let s = defaultSettings();
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (raw) s = sanitize({ ...s, ...JSON.parse(raw) });
  } catch {
    // Unreadable storage: defaults.
  }
  cache = s;
  return s;
}

export function updateSettings(patch: Partial<Settings>): Settings {
  const next = sanitize({ ...getSettings(), ...patch });
  cache = next;
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(next));
  } catch {
    // Not persisted; still applies for this session.
  }
  for (const fn of listeners) fn(next);
  return next;
}

export function onSettingsChange(fn: (s: Settings) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function clamp01(v: unknown, fallback: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  return Math.min(1, Math.max(0, n));
}

export function sanitize(s: Settings): Settings {
  const d = defaultSettings();
  return {
    masterVolume: clamp01(s.masterVolume, d.masterVolume),
    musicVolume: clamp01(s.musicVolume, d.musicVolume),
    sfxVolume: clamp01(s.sfxVolume, d.sfxVolume),
    screenShake: clamp01(s.screenShake, d.screenShake),
    reduceFlashing: !!s.reduceFlashing,
    reducedMotion: !!s.reducedMotion,
    damageNumbers: s.damageNumbers !== false,
    vibration: s.vibration !== false,
    dashSide: s.dashSide === 'left' ? 'left' : 'right',
    keyBindings: sanitizeBindings(s.keyBindings),
    sharePlayData: s.sharePlayData !== false,
  };
}

/** For tests. */
export function resetSettingsCache(): void {
  cache = null;
}
