import { beforeEach, describe, expect, it } from 'vitest';
import { newRun } from '../src/state/run';
import { loadTelemetry, recordError, recordRunEnd, resetTelemetryCache } from '../src/state/telemetry';
import { errorRow, runRow, syncPlayData } from '../src/state/playDataSync';
import { resetSettingsCache, updateSettings } from '../src/state/settings';

const ep = { url: 'https://example.supabase.co/', key: 'sb_publishable_test' };

describe('play data upload', () => {
  const store = new Map<string, string>();
  let calls: { url: string; init: RequestInit }[] = [];
  let status = 201;
  const fetch = async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return { ok: status < 300, status };
  };

  beforeEach(() => {
    store.clear();
    (globalThis as unknown as { localStorage: Storage }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
      key: () => null,
      length: 0,
    };
    resetTelemetryCache();
    resetSettingsCache();
    calls = [];
    status = 201;
  });

  it('sends each run and error once, with the player id and the publishable key', async () => {
    recordRunEnd(newRun(1, 'frank'), 'death');
    recordError('boom', 'at x');
    expect(await syncPlayData({ fetch, endpoint: ep, force: true })).toBe(2);
    expect(calls.map((c) => c.url)).toEqual([
      'https://example.supabase.co/rest/v1/play_runs?on_conflict=id',
      'https://example.supabase.co/rest/v1/play_errors?on_conflict=id',
    ]);
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.apikey).toBe('sb_publishable_test');
    const rows = JSON.parse(calls[0].init.body as string);
    expect(rows[0]).toMatchObject({ player: loadTelemetry().player, outcome: 'death', sausage: 'frank' });
    expect(rows[0].data.id).toBeUndefined();
    // Nothing left to send.
    calls = [];
    expect(await syncPlayData({ fetch, endpoint: ep, force: true })).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it('keeps records for later when the upload fails, and counts a duplicate as sent', async () => {
    recordRunEnd(newRun(2, 'frank'), 'quit');
    status = 500;
    expect(await syncPlayData({ fetch, endpoint: ep, force: true })).toBe(0);
    expect(loadTelemetry().runs[0].sent).toBeFalsy();
    status = 409;
    expect(await syncPlayData({ fetch, endpoint: ep, force: true })).toBe(1);
    expect(loadTelemetry().runs[0].sent).toBe(true);
  });

  it('sends nothing when the player turned sharing off, or there is no endpoint', async () => {
    recordRunEnd(newRun(3, 'frank'), 'death');
    expect(await syncPlayData({ fetch, endpoint: null, force: true })).toBe(0);
    updateSettings({ sharePlayData: false });
    expect(await syncPlayData({ fetch, endpoint: ep, force: true })).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it('survives a network error', async () => {
    recordRunEnd(newRun(4, 'frank'), 'death');
    const broken = async () => { throw new Error('offline'); };
    expect(await syncPlayData({ fetch: broken, endpoint: ep, force: true })).toBe(0);
  });

  it('row shapes match the tables', () => {
    recordRunEnd(newRun(5, 'chorizo'), 'home');
    recordError('x');
    const d = loadTelemetry();
    expect(Object.keys(runRow(d.runs[0], d.player)).sort()).toEqual(
      ['at', 'build', 'cause_of_death', 'chili', 'course', 'damage_dealt', 'damage_taken', 'data', 'id', 'kills', 'outcome', 'player', 'sausage', 'time_sec', 'wave'],
    );
    expect(Object.keys(errorRow(d.errors[0], d.player)).sort()).toEqual(['at', 'build', 'id', 'message', 'player', 'scene', 'stack', 'wave']);
  });
});
