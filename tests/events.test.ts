import { describe, expect, it } from 'vitest';
import {
  EVENTS, EVENT_EDGE_SEC, EVENT_MIN_GAP_SEC, BOUNTY_SEC, bountySeconds, bountyTarget, eventCount, rollWaveEvents,
} from '../src/data/events';
import { BACKYARD_BOSS_WAVE as TOTAL_WAVES, waveConfig } from '../src/data/waves';
import { mulberry32 } from '../src/systems/rng';

const SEEDS = Array.from({ length: 300 }, (_, i) => i * 7919 + 13);

describe('timed events', () => {
  it('rolls the same schedule for the same seed', () => {
    for (let w = 1; w < TOTAL_WAVES; w++) {
      expect(rollWaveEvents(mulberry32(42), w)).toEqual(rollWaveEvents(mulberry32(42), w));
    }
  });

  it('the boss wave has no events', () => {
    expect(rollWaveEvents(mulberry32(1), TOTAL_WAVES)).toEqual([]);
  });

  it('every regular wave gets its events, spread out, away from the start and end', () => {
    for (let w = 1; w < TOTAL_WAVES; w++) {
      const dur = waveConfig(w).durationSec;
      for (const seed of SEEDS) {
        const evs = rollWaveEvents(mulberry32(seed), w);
        expect(evs.length).toBe(eventCount(w));
        for (const e of evs) {
          expect(e.atSec).toBeGreaterThanOrEqual(EVENT_EDGE_SEC);
          expect(e.atSec).toBeLessThanOrEqual(dur - EVENT_EDGE_SEC);
        }
        const times = evs.map((e) => e.atSec).sort((a, b) => a - b);
        for (let i = 1; i < times.length; i++) expect(times[i] - times[i - 1]).toBeGreaterThanOrEqual(EVENT_MIN_GAP_SEC - 1);
      }
    }
  });

  it('no repeats, at most one hazard, at least one reward, nothing before its first wave', () => {
    for (let w = 1; w < TOTAL_WAVES; w++) {
      for (const seed of SEEDS) {
        const kinds = rollWaveEvents(mulberry32(seed), w).map((e) => e.kind);
        expect(new Set(kinds).size).toBe(kinds.length);
        const cats = kinds.map((k) => EVENTS[k].category);
        expect(cats.filter((c) => c === 'hazard').length).toBeLessThanOrEqual(1);
        expect(cats.some((c) => c !== 'hazard' && c !== 'fight')).toBe(true);
        for (const k of kinds) expect(EVENTS[k].minWave).toBeLessThanOrEqual(w);
      }
    }
  });

  it('wave 1 is gentle: only a basket or a golden hot dog', () => {
    for (const seed of SEEDS) {
      for (const e of rollWaveEvents(mulberry32(seed), 1)) expect(['basket', 'golden']).toContain(e.kind);
    }
  });

  it('every event kind shows up somewhere in a run', () => {
    const seen = new Set<string>();
    for (const seed of SEEDS) for (let w = 1; w < TOTAL_WAVES; w++) for (const e of rollWaveEvents(mulberry32(seed), w)) seen.add(e.kind);
    expect([...seen].sort()).toEqual(Object.keys(EVENTS).sort());
  });

  it('bounties ask for fewer kills than the wave spawns in that time', () => {
    for (let w = 2; w < TOTAL_WAVES; w++) {
      const cfg = waveConfig(w);
      const spawnedIn20s = (cfg.batch * 20_000) / cfg.spawnIntervalMs;
      expect(bountyTarget(w)).toBeLessThan(spawnedIn20s);
      expect(bountyTarget(w)).toBeGreaterThanOrEqual(8);
    }
  });

  it("a bounty's timer never runs past the wave timer", () => {
    for (const seed of SEEDS) for (let w = 1; w < TOTAL_WAVES; w++) {
      const cfg = waveConfig(w);
      for (const e of rollWaveEvents(mulberry32(seed), w)) {
        if (e.kind !== 'bounty') continue;
        const sec = bountySeconds(e.atSec, cfg.durationSec);
        expect(e.atSec + sec).toBeLessThan(cfg.durationSec);
        expect(sec).toBeLessThanOrEqual(BOUNTY_SEC);
      }
    }
  });

  it('a shortened bounty asks for proportionally fewer kills', () => {
    for (let w = 1; w < TOTAL_WAVES; w++) {
      expect(bountyTarget(w, 10)).toBeLessThan(bountyTarget(w, BOUNTY_SEC));
      expect(bountyTarget(w, 10)).toBeGreaterThanOrEqual(3);
    }
    expect(bountySeconds(5, 60)).toBe(BOUNTY_SEC);
    expect(bountySeconds(18, 25)).toBe(6);
  });
});
