import { beforeEach, describe, expect, it } from 'vitest';
import { newRun } from '../src/state/run';
import {
  damageRows, linkSource, logDamage, logKill, logTaken, newRunLog, syncLinks, takenRows, tickLinks, totalDealt, totalTaken,
} from '../src/state/runLog';
import {
  MAX_ERRORS, MAX_RUNS, loadTelemetry, markPageClosed, markRunActive, recordError, recordRunEnd, resetTelemetryCache, runRecord, startSession,
} from '../src/state/telemetry';

describe('run log', () => {
  it('starts with one entry per starting link', () => {
    const run = newRun(1, 'hotdog');
    expect(run.log.links.map((l) => l.weapon)).toEqual(run.weapons.map((w) => w.id));
  });

  it('credits damage, poison, crits and kills to the right link', () => {
    const log = newRunLog([{ id: 'toothpick', tier: 1 }, { id: 'mustard', tier: 2 }]);
    logDamage(log, linkSource(0), 10, { crit: true });
    logDamage(log, linkSource(1), 5);
    logDamage(log, linkSource(1), 3, { dot: true });
    logKill(log, linkSource(1));
    expect(log.links[0]).toMatchObject({ damage: 10, crits: 1, kills: 0 });
    expect(log.links[1]).toMatchObject({ damage: 8, dot: 3, kills: 1, tier: 2 });
    expect(totalDealt(log)).toBe(18);
  });

  it('keeps sources that are not links apart, and ignores zero or bad amounts', () => {
    const log = newRunLog([{ id: 'toothpick', tier: 1 }]);
    logDamage(log, 'thorns', 4);
    logDamage(log, 'burn', 6, { dot: true });
    logDamage(log, 'L7', 2); // a link that doesn't exist
    logDamage(log, 'L0', 0);
    logDamage(log, 'L0', Number.NaN);
    logKill(log, 'burn');
    expect(log.other.thorns?.damage).toBe(4);
    expect(log.other.burn).toEqual({ damage: 6, kills: 1 });
    expect(log.other.other?.damage).toBe(2);
    expect(log.links[0].damage).toBe(0);
  });

  it('works out DPS per link from the time it was on the sausage', () => {
    const log = newRunLog([{ id: 'toothpick', tier: 1 }]);
    tickLinks(log, 1, 10);
    // A link bought later only counts the time since.
    syncLinks(log, [{ id: 'toothpick', tier: 2 }, { id: 'pickle', tier: 1 }]);
    tickLinks(log, 2, 10);
    logDamage(log, 'L0', 200);
    logDamage(log, 'L1', 100);
    logDamage(log, 'thorns', 20);
    const rows = damageRows(log, 20);
    expect(rows.map((r) => r.name)).toEqual(['Toothpick', 'Pickle Launcher', 'Spiky Bun (thorns)']);
    expect(rows[0]).toMatchObject({ link: 1, tier: 2, dps: 10 });
    expect(rows[1]).toMatchObject({ link: 2, dps: 10 });
    expect(rows[2]).toMatchObject({ link: 0, dps: 1 });
    expect(rows.reduce((s, r) => s + r.share, 0)).toBeCloseTo(1);
  });

  it('a link that changes weapon starts a fresh entry', () => {
    const log = newRunLog([{ id: 'toothpick', tier: 1 }]);
    logDamage(log, 'L0', 50);
    syncLinks(log, [{ id: 'skewer', tier: 1 }]);
    expect(log.links[0]).toMatchObject({ weapon: 'skewer', damage: 0 });
  });

  it('sorts damage taken by source', () => {
    const log = newRunLog();
    logTaken(log, 'Fork', 5);
    logTaken(log, 'Grill tile', 12);
    logTaken(log, 'Fork', 10);
    logTaken(log, 'Fork', -3);
    expect(takenRows(log)).toEqual([{ source: 'Fork', amount: 15 }, { source: 'Grill tile', amount: 12 }]);
    expect(totalTaken(log)).toBe(27);
  });
});

describe('play data (telemetry)', () => {
  const store = new Map<string, string>();
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
  });

  it('records a finished run once, with per-link numbers', () => {
    const run = newRun(5, 'frank');
    tickLinks(run.log, 1, 4);
    logDamage(run.log, 'L0', 40);
    run.timeSurvivedSec = 4;
    recordRunEnd(run, 'death');
    recordRunEnd(run, 'death');
    const data = loadTelemetry();
    expect(data.runs).toHaveLength(1);
    expect(data.runs[0]).toMatchObject({ sausage: 'frank', outcome: 'death', damageDealt: 40 });
    expect(data.runs[0].links[0]).toMatchObject({ weapon: 'toothpick', damage: 40, dps: 10 });
    // It survives a reload.
    resetTelemetryCache();
    expect(loadTelemetry().runs).toHaveLength(1);
    expect(JSON.parse(JSON.stringify(runRecord(run, 'home')))).toBeTruthy();
  });

  it('keeps the same random player id across visits', () => {
    const id = loadTelemetry().player;
    startSession();
    resetTelemetryCache();
    expect(loadTelemetry().player).toBe(id);
    expect(loadTelemetry().sessions).toBe(1);
  });

  it('notices a run that never finished: closed tab vs crash', () => {
    markRunActive(newRun(1, 'frank'));
    markPageClosed();
    resetTelemetryCache();
    startSession();
    markRunActive(newRun(2, 'frank'));
    resetTelemetryCache();
    startSession();
    expect(loadTelemetry().runs.map((r) => r.outcome)).toEqual(['abandoned', 'crashed']);
    expect(loadTelemetry().active).toBeUndefined();
  });

  it('counts repeated errors instead of storing them again, and caps the lists', () => {
    recordError('boom', 'at x');
    recordError('boom', 'at x');
    expect(loadTelemetry().errors).toEqual([expect.objectContaining({ message: 'boom', count: 2 })]);
    for (let i = 0; i < MAX_ERRORS + 5; i++) recordError(`e${i}`);
    expect(loadTelemetry().errors).toHaveLength(MAX_ERRORS);
    for (let i = 0; i < MAX_RUNS + 3; i++) recordRunEnd(newRun(i, 'frank'), 'quit');
    expect(loadTelemetry().runs).toHaveLength(MAX_RUNS);
  });

  it('copes with broken storage', () => {
    store.set('wurst-case-scenario:telemetry', '{not json');
    expect(loadTelemetry().runs).toEqual([]);
    (globalThis as unknown as { localStorage: Storage }).localStorage.setItem = () => { throw new Error('full'); };
    expect(() => recordRunEnd(newRun(9, 'frank'), 'death')).not.toThrow();
  });
});
