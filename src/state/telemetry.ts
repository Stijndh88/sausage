import { locate } from '../data/courses';
import type { RunState } from './run';
import { damageRows, totalDealt, totalTaken, type WaveLog } from './runLog';
import { VERSION, COMMIT } from '../version';

/**
 * Play data, kept on this device: a summary of every finished
 * run, the errors the game hit, and runs that never finished (closed tab or crash). It exists so
 * balance problems, bugs and crashes can be spotted from real play. Settings → Play data downloads
 * it as a JSON file; `window.__telemetry` shows it in the console. Unless the player turns
 * "Share play data" off, state/playDataSync.ts also uploads each record once.
 *
 * Storage can be missing or throw (private mode, blocked site data): every access is guarded and
 * the game never depends on it.
 */

const KEY = 'wurst-case-scenario:telemetry';
export const MAX_RUNS = 60;
export const MAX_ERRORS = 40;
export const TELEMETRY_VERSION = 1;

export type RunEnd = 'death' | 'home' | 'bail' | 'restart' | 'quit' | 'abandoned' | 'crashed';

export interface RunRecord {
  /** Random id, so an upload that's retried is stored only once. */
  id: string;
  /** Uploaded already (see playDataSync.ts). */
  sent?: boolean;
  /** When the run ended (ISO time). */
  at: string;
  build: string;
  seed: number;
  sausage: string;
  chili: number;
  outcome: RunEnd;
  wave: number;
  course: number;
  timeSec: number;
  kills: number;
  crumbs: number;
  bag: number;
  pushes: number;
  causeOfDeath?: string;
  damageDealt: number;
  damageTaken: number;
  healed: number;
  hitsTaken: number;
  dodges: number;
  links: { weapon: string; tier: number; damage: number; dps: number; kills: number }[];
  items: string[];
  taken: Record<string, number>;
  waves: WaveLog[];
  input?: string;
}

export interface ErrorRecord {
  id: string;
  sent?: boolean;
  at: string;
  build: string;
  message: string;
  stack?: string;
  /** Scene(s) running when it happened. */
  scene?: string;
  wave?: number;
  /** The same error again: counted instead of stored twice. */
  count: number;
}

/** The run in progress, written at every wave start, so a run that never ends is noticed. */
interface ActiveRun {
  record: RunRecord;
  /** Set when the page is hidden/closed normally: if missing on the next visit, it probably crashed. */
  closed?: boolean;
}

export interface TelemetryData {
  version: number;
  /** Random id for this device's play data; not linked to anything about the player. */
  player: string;
  createdAt: string;
  sessions: number;
  runs: RunRecord[];
  errors: ErrorRecord[];
  active?: ActiveRun;
}

function now(): string {
  return new Date().toISOString();
}

function randomId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function build(): string {
  return COMMIT ? `${VERSION}+${COMMIT}` : VERSION;
}

function fresh(): TelemetryData {
  return { version: TELEMETRY_VERSION, player: randomId(), createdAt: now(), sessions: 0, runs: [], errors: [] };
}

let cache: TelemetryData | null = null;
const listeners = new Set<() => void>();

/** Called after a run or an error is recorded (the uploader listens). */
export function onTelemetryRecord(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify(): void {
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      /* ignore */
    }
  }
}

/** Marks records as uploaded (by id) and saves. */
export function markSent(ids: readonly string[]): void {
  const set = new Set(ids);
  const data = loadTelemetry();
  for (const r of [...data.runs, ...data.errors]) if (set.has(r.id)) r.sent = true;
  persist(data);
}

export function loadTelemetry(): TelemetryData {
  if (cache) return cache;
  let data = fresh();
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<TelemetryData>;
      if (parsed && typeof parsed === 'object') {
        data = {
          ...data,
          ...parsed,
          version: TELEMETRY_VERSION,
          runs: Array.isArray(parsed.runs) ? parsed.runs : [],
          errors: Array.isArray(parsed.errors) ? parsed.errors : [],
        };
        // Records from before ids existed get one now.
        for (const r of [...data.runs, ...data.errors]) if (!r.id) r.id = randomId();
      }
    }
  } catch {
    // Corrupt or unreadable: start over.
  }
  cache = data;
  return data;
}

function persist(data: TelemetryData): void {
  cache = data;
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(data));
  } catch {
    // Full or blocked storage: drop the oldest runs once and try again, then give up quietly.
    try {
      data.runs = data.runs.slice(-Math.floor(MAX_RUNS / 2));
      globalThis.localStorage?.setItem(KEY, JSON.stringify(data));
    } catch {
      /* ignore */
    }
  }
}

/** Test hook. */
export function resetTelemetryCache(): void {
  cache = null;
}

export function clearTelemetry(): void {
  const keepId = loadTelemetry().player;
  persist({ ...fresh(), player: keepId });
}

/** The compact record kept for one run. */
export function runRecord(run: RunState, outcome: RunEnd, input?: string): RunRecord {
  const log = run.log;
  const rows = damageRows(log, run.timeSurvivedSec).filter((r) => r.link > 0);
  return {
    id: randomId(),
    at: now(),
    build: build(),
    seed: run.seed,
    sausage: run.sausage,
    chili: run.chili,
    outcome,
    wave: run.wave,
    course: locate(run.wave).course,
    timeSec: Math.round(run.timeSurvivedSec),
    kills: run.kills,
    crumbs: run.crumbsEarned,
    bag: Math.floor(run.bag),
    pushes: run.pushes,
    ...(run.causeOfDeath ? { causeOfDeath: run.causeOfDeath } : {}),
    damageDealt: Math.round(totalDealt(log)),
    damageTaken: Math.round(totalTaken(log)),
    healed: Math.round(log.healed),
    hitsTaken: log.hitsTaken,
    dodges: log.dodges,
    links: log.links.map((l, i) => ({
      weapon: l.weapon,
      tier: l.tier,
      damage: Math.round(l.damage),
      dps: Math.round((rows.find((r) => r.link === i + 1)?.dps ?? 0) * 10) / 10,
      kills: l.kills,
    })),
    items: [...run.items],
    taken: Object.fromEntries(Object.entries(log.taken).map(([k, v]) => [k, Math.round(v)])),
    waves: log.waves.map((w) => ({ ...w })),
    ...(input ? { input } : {}),
  };
}

/** Runs already recorded: a scene restart must never record one twice. */
const recorded = new WeakSet<RunState>();

/** Records a finished run (once). */
export function recordRunEnd(run: RunState, outcome: RunEnd, input?: string): void {
  if (recorded.has(run)) return;
  recorded.add(run);
  const data = loadTelemetry();
  data.runs = [...data.runs, runRecord(run, outcome, input)].slice(-MAX_RUNS);
  delete data.active;
  persist(data);
  notify();
}

/** Notes the run in progress (call at every wave start). */
export function markRunActive(run: RunState, input?: string): void {
  if (recorded.has(run)) return;
  const data = loadTelemetry();
  data.active = { record: runRecord(run, 'abandoned', input) };
  persist(data);
}

/** The page is going away normally (tab closed, app switched). */
export function markPageClosed(): void {
  const data = loadTelemetry();
  if (!data.active || data.active.closed) return;
  data.active.closed = true;
  persist(data);
}

/** The page is back (e.g. a phone app switch): the run is still alive. */
export function markPageOpen(): void {
  const data = loadTelemetry();
  if (!data.active?.closed) return;
  data.active.closed = false;
  persist(data);
}

/**
 * Call once at boot. A run still marked active belongs to an earlier visit that never finished:
 * it's kept as 'abandoned' (the page was closed) or 'crashed' (it never got to close cleanly).
 */
export function startSession(): TelemetryData {
  const data = loadTelemetry();
  data.sessions++;
  if (data.active) {
    const rec = { ...data.active.record, outcome: (data.active.closed ? 'abandoned' : 'crashed') as RunEnd };
    data.runs = [...data.runs, rec].slice(-MAX_RUNS);
    delete data.active;
  }
  persist(data);
  return data;
}

export function recordError(message: string, stack?: string, ctx: { scene?: string; wave?: number } = {}): void {
  const data = loadTelemetry();
  const msg = String(message).slice(0, 500);
  const st = stack ? String(stack).slice(0, 2000) : undefined;
  const same = data.errors.find((e) => e.message === msg && e.stack === st && e.build === build());
  if (same) {
    same.count++;
    same.at = now();
  } else {
    data.errors = [...data.errors, { id: randomId(), at: now(), build: build(), message: msg, ...(st ? { stack: st } : {}), ...ctx, count: 1 }].slice(-MAX_ERRORS);
  }
  persist(data);
  notify();
}

/** Catches uncaught errors and promise rejections into the play data. */
export function installErrorCapture(ctx: () => { scene?: string; wave?: number } = () => ({})): void {
  let inHandler = false;
  const safe = (fn: () => void) => {
    if (inHandler) return;
    inHandler = true;
    try {
      fn();
    } catch {
      /* never let telemetry throw */
    } finally {
      inHandler = false;
    }
  };
  window.addEventListener('error', (e) => safe(() => {
    const err = e.error as Error | undefined;
    recordError(err?.message ?? e.message ?? 'Unknown error', err?.stack ?? `${e.filename}:${e.lineno}:${e.colno}`, ctx());
  }));
  window.addEventListener('unhandledrejection', (e) => safe(() => {
    const r = e.reason as Error | undefined;
    recordError(`Unhandled rejection: ${r?.message ?? String(e.reason)}`, r?.stack, ctx());
  }));
  window.addEventListener('pagehide', () => safe(markPageClosed));
  document.addEventListener('visibilitychange', () => safe(() => {
    if (document.visibilityState === 'hidden') markPageClosed();
    else markPageOpen();
  }));
}

/** The whole play-data file, for Settings → Play data. */
export function exportTelemetry(): string {
  return JSON.stringify({ ...loadTelemetry(), exportedAt: now(), build: build() }, null, 2);
}

/** Starts a download of the play data as a JSON file. */
export function downloadTelemetry(): boolean {
  try {
    const blob = new Blob([exportTelemetry()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wurst-play-data-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch {
    return false;
  }
}
