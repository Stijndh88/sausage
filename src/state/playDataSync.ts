import { getSettings } from './settings';
import { loadTelemetry, markSent, onTelemetryRecord, type ErrorRecord, type RunRecord } from './telemetry';

/**
 * Uploads play data (state/telemetry.ts) to the game's own Supabase project, so balance problems,
 * bugs and crashes show up from real play. Each run summary and each distinct error is sent once,
 * with the device's random player id and nothing else about the player. "Settings → Share play
 * data" turns it off. Without an endpoint configured, nothing is sent at all.
 *
 * The server side (tables and insert-only policies) is in supabase/play_data.sql.
 */

/**
 * The game's own Supabase project ("wurst"). The publishable key is meant to ship in the client:
 * the tables only accept inserts (supabase/play_data.sql). VITE_PLAY_DATA_URL / _KEY override them.
 */
export const PLAY_DATA_URL: string = (import.meta.env.VITE_PLAY_DATA_URL as string | undefined) ?? 'https://sabxjyesqcymeayxirxk.supabase.co';
export const PLAY_DATA_KEY: string = (import.meta.env.VITE_PLAY_DATA_KEY as string | undefined) ?? 'sb_publishable_5tZtxHFFSzf8XIcxMgEkmw_1Re8NoX9';

/** Records per request, so one upload stays small. */
const BATCH = 20;

export interface Endpoint {
  url: string;
  key: string;
}

type Fetch = (input: string, init: RequestInit) => Promise<{ ok: boolean; status: number }>;

export function playDataEndpoint(): Endpoint | null {
  if (!PLAY_DATA_URL || !PLAY_DATA_KEY) return null;
  return { url: PLAY_DATA_URL.replace(/\/+$/, ''), key: PLAY_DATA_KEY };
}

/** Local dev servers and the browser tests don't send anything unless asked to with ?playdata=1. */
function isDevHost(): boolean {
  try {
    const loc = globalThis.location;
    if (!loc) return false;
    if (new URLSearchParams(loc.search).get('playdata') === '1') return false;
    return /^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)$/.test(loc.hostname) || /^192\.168\./.test(loc.hostname);
  } catch {
    return false;
  }
}

export function runRow(r: RunRecord, player: string): Record<string, unknown> {
  const { id, sent: _sent, ...rest } = r;
  void _sent;
  return {
    id,
    player,
    at: r.at,
    build: r.build,
    outcome: r.outcome,
    sausage: r.sausage,
    chili: r.chili,
    wave: r.wave,
    course: r.course,
    time_sec: r.timeSec,
    kills: r.kills,
    damage_dealt: r.damageDealt,
    damage_taken: r.damageTaken,
    cause_of_death: r.causeOfDeath ?? null,
    data: rest,
  };
}

export function errorRow(e: ErrorRecord, player: string): Record<string, unknown> {
  return {
    id: e.id,
    player,
    at: e.at,
    build: e.build,
    message: e.message,
    stack: e.stack ?? null,
    scene: e.scene ?? null,
    wave: e.wave ?? null,
  };
}

let busy = false;

async function post(fetchFn: Fetch, ep: Endpoint, table: string, rows: Record<string, unknown>[]): Promise<boolean> {
  const res = await fetchFn(`${ep.url.replace(/\/+$/, '')}/rest/v1/${table}?on_conflict=id`, {
    method: 'POST',
    headers: {
      apikey: ep.key,
      'Content-Type': 'application/json',
      // Already uploaded (a retry after a lost reply): skip it quietly.
      Prefer: 'resolution=ignore-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
    keepalive: true,
  });
  // 409: every row is already there.
  return res.ok || res.status === 409;
}

/**
 * Sends whatever hasn't been sent yet. Returns how many records were uploaded. Never throws:
 * offline, blocked or failing uploads are retried at the next run end or visit.
 */
export async function syncPlayData(opts: { fetch?: Fetch; endpoint?: Endpoint | null; force?: boolean } = {}): Promise<number> {
  const ep = opts.endpoint === undefined ? playDataEndpoint() : opts.endpoint;
  if (!ep || busy || !getSettings().sharePlayData) return 0;
  if (!opts.force && isDevHost()) return 0;
  if (globalThis.navigator && globalThis.navigator.onLine === false) return 0;
  const fetchFn: Fetch | undefined = opts.fetch ?? (globalThis.fetch?.bind(globalThis) as Fetch | undefined);
  if (!fetchFn) return 0;
  busy = true;
  let sent = 0;
  try {
    const data = loadTelemetry();
    const runs = data.runs.filter((r) => !r.sent).slice(0, BATCH);
    if (runs.length && await post(fetchFn, ep, 'play_runs', runs.map((r) => runRow(r, data.player)))) {
      markSent(runs.map((r) => r.id));
      sent += runs.length;
    }
    const errors = data.errors.filter((e) => !e.sent).slice(0, BATCH);
    if (errors.length && await post(fetchFn, ep, 'play_errors', errors.map((e) => errorRow(e, data.player)))) {
      markSent(errors.map((e) => e.id));
      sent += errors.length;
    }
  } catch {
    // Offline or blocked: try again later.
  } finally {
    busy = false;
  }
  return sent;
}

/** Call once at boot: uploads leftovers now, then after every recorded run or error. */
export function startPlayDataSync(): void {
  if (!playDataEndpoint()) return;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const soon = (ms: number) => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      void syncPlayData();
    }, ms);
  };
  soon(3000);
  onTelemetryRecord(() => soon(1500));
}
