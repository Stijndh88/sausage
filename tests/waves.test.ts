import { describe, expect, it } from 'vitest';
import { TOTAL_WAVES, waveConfig } from '../src/data/waves';
import { mulberry32, pickWeighted } from '../src/systems/rng';

describe('waves', () => {
  it('only the last wave is the boss and it has no timer', () => {
    for (let w = 1; w < TOTAL_WAVES; w++) {
      expect(waveConfig(w).boss).toBe(false);
      expect(waveConfig(w).durationSec).toBeGreaterThan(0);
    }
    expect(waveConfig(TOTAL_WAVES).boss).toBe(true);
    expect(waveConfig(TOTAL_WAVES).durationSec).toBe(0);
  });

  it('gets harder every wave', () => {
    for (let w = 2; w <= TOTAL_WAVES; w++) {
      expect(waveConfig(w).hpMult).toBeGreaterThan(waveConfig(w - 1).hpMult);
      expect(waveConfig(w).maxAlive).toBeGreaterThan(waveConfig(w - 1).maxAlive);
    }
  });

  it('clamps out-of-range waves', () => {
    expect(waveConfig(0).wave).toBe(1);
    expect(waveConfig(99).wave).toBe(TOTAL_WAVES);
  });

  it('wave 1 only spawns forks', () => {
    const rng = mulberry32(1);
    for (let i = 0; i < 100; i++) expect(pickWeighted(rng, waveConfig(1).weights)).toBe('fork');
  });
});
