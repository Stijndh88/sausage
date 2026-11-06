import type { EnemyKind } from './enemies';

export const TOTAL_WAVES = 10;

export interface WaveConfig {
  wave: number;
  /** 0 for the boss wave, which ends when the boss dies. */
  durationSec: number;
  spawnIntervalMs: number;
  batch: number;
  maxAlive: number;
  maxTurrets: number;
  hpMult: number;
  hotTiles: number;
  weights: Partial<Record<Exclude<EnemyKind, 'tongs'>, number>>;
  boss: boolean;
}

type Row = Omit<WaveConfig, 'wave' | 'maxAlive' | 'hpMult' | 'boss'>;

const TABLE: Row[] = [
  { durationSec: 25, spawnIntervalMs: 1800, batch: 2, maxTurrets: 0, hotTiles: 2, weights: { fork: 1 } },
  { durationSec: 30, spawnIntervalMs: 1700, batch: 2, maxTurrets: 0, hotTiles: 2, weights: { fork: 3, spatula: 1 } },
  { durationSec: 35, spawnIntervalMs: 1700, batch: 3, maxTurrets: 0, hotTiles: 3, weights: { fork: 3, spatula: 1, ketchup: 1 } },
  { durationSec: 40, spawnIntervalMs: 1600, batch: 3, maxTurrets: 1, hotTiles: 3, weights: { fork: 3, spatula: 1, ketchup: 1.2, hotsauce: 0.4 } },
  { durationSec: 40, spawnIntervalMs: 1500, batch: 3, maxTurrets: 2, hotTiles: 3, weights: { fork: 3, spatula: 1.5, ketchup: 1.5, hotsauce: 0.5 } },
  { durationSec: 45, spawnIntervalMs: 1450, batch: 4, maxTurrets: 2, hotTiles: 4, weights: { fork: 3, spatula: 1.5, ketchup: 2, hotsauce: 0.6 } },
  { durationSec: 45, spawnIntervalMs: 1400, batch: 4, maxTurrets: 3, hotTiles: 4, weights: { fork: 3, spatula: 2, ketchup: 2, hotsauce: 0.7 } },
  { durationSec: 50, spawnIntervalMs: 1350, batch: 5, maxTurrets: 3, hotTiles: 4, weights: { fork: 3, spatula: 2, ketchup: 2.5, hotsauce: 0.8 } },
  { durationSec: 55, spawnIntervalMs: 1300, batch: 5, maxTurrets: 4, hotTiles: 5, weights: { fork: 3, spatula: 2.5, ketchup: 2.5, hotsauce: 0.9 } },
  // Wave 10: the boss, with a trickle of minions.
  { durationSec: 0, spawnIntervalMs: 3500, batch: 2, maxTurrets: 0, hotTiles: 4, weights: { fork: 2, spatula: 1 } },
];

export function waveConfig(wave: number): WaveConfig {
  const n = Math.min(Math.max(1, Math.floor(wave)), TOTAL_WAVES);
  const row = TABLE[n - 1];
  return {
    ...row,
    wave: n,
    maxAlive: 40 + 6 * n,
    hpMult: 1 + 0.2 * (n - 1),
    boss: n === TOTAL_WAVES,
  };
}
