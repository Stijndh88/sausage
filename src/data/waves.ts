import type { EnemyKind } from './enemies';
import { locate } from './courses';

/** The Backyard is 6 waves and the Tongs, so the Tongs are global wave 7. */
export const BACKYARD_BOSS_WAVE = 7;

export interface WaveConfig {
  /** Global wave number (across courses). */
  wave: number;
  /** Course index (0 = Backyard) and 1-based wave within it. */
  course: number;
  courseWave: number;
  /** Normal waves in this course. */
  courseWaves: number;
  /** 0 for the boss wave, which ends when the boss dies. */
  durationSec: number;
  spawnIntervalMs: number;
  batch: number;
  maxAlive: number;
  maxTurrets: number;
  hpMult: number;
  /** HP multiplier of the boss itself (boss waves only; minions use hpMult). */
  bossHpMult: number;
  /** Crumbs per kill are multiplied by this (later courses pay more, prices rise too). */
  crumbMult: number;
  hotTiles: number;
  weights: Partial<Record<Exclude<EnemyKind, 'tongs' | 'goblin'>, number>>;
  boss: boolean;
}

type Row = Pick<WaveConfig, 'durationSec' | 'spawnIntervalMs' | 'batch' | 'maxTurrets' | 'hotTiles' | 'weights'>;

/** Difficulty rows, easiest first. Courses pick rows from here; the last one is the boss wave. */
const TABLE: Row[] = [
  { durationSec: 25, spawnIntervalMs: 1800, batch: 2, maxTurrets: 0, hotTiles: 2, weights: { fork: 1 } },
  { durationSec: 30, spawnIntervalMs: 1700, batch: 2, maxTurrets: 0, hotTiles: 2, weights: { fork: 3, spatula: 1 } },
  { durationSec: 35, spawnIntervalMs: 1350, batch: 2, maxTurrets: 0, hotTiles: 3, weights: { fork: 3, spatula: 1, ketchup: 0.5 } },
  { durationSec: 40, spawnIntervalMs: 1600, batch: 3, maxTurrets: 1, hotTiles: 3, weights: { fork: 3, spatula: 1, ketchup: 1.2, hotsauce: 0.4 } },
  { durationSec: 40, spawnIntervalMs: 1500, batch: 3, maxTurrets: 2, hotTiles: 3, weights: { fork: 3, spatula: 1.5, ketchup: 1.5, hotsauce: 0.5 } },
  { durationSec: 45, spawnIntervalMs: 1300, batch: 3, maxTurrets: 2, hotTiles: 4, weights: { fork: 3, spatula: 1.5, ketchup: 2, hotsauce: 0.6 } },
  { durationSec: 45, spawnIntervalMs: 1400, batch: 4, maxTurrets: 3, hotTiles: 4, weights: { fork: 3, spatula: 2, ketchup: 2, hotsauce: 0.7 } },
  { durationSec: 50, spawnIntervalMs: 1200, batch: 4, maxTurrets: 3, hotTiles: 4, weights: { fork: 3, spatula: 2, ketchup: 2.5, hotsauce: 0.8 } },
  { durationSec: 55, spawnIntervalMs: 1300, batch: 5, maxTurrets: 4, hotTiles: 5, weights: { fork: 3, spatula: 2.5, ketchup: 2.5, hotsauce: 0.9 } },
  // The boss wave: a trickle of minions.
  { durationSec: 0, spawnIntervalMs: 3500, batch: 2, maxTurrets: 0, hotTiles: 4, weights: { fork: 2, spatula: 1 } },
];
const BOSS_ROW = TABLE.length - 1;

/** Which difficulty row each Backyard wave uses (6 waves, then the Tongs). */
const BACKYARD_ROWS = [0, 1, 2, 4, 6, 8];
/** Later courses start where the Backyard got tough. */
const LATER_ROWS = [4, 5, 6, 7, 8];

/**
 * Enemy HP multiplier of a course on top of its row: Kitchen x2, Smokehouse x4.5, then x1.6 per
 * Seconds loop. Builds grow fast between courses (a full shop every wave), so later courses have
 * to grow faster too, or late waves melt and late bosses die in seconds.
 */
export function courseHpScale(course: number): number {
  if (course <= 0) return 1;
  if (course === 1) return 2;
  if (course === 2) return 4.5;
  return 4.5 * 1.6 ** Math.min(30, course - 2);
}

/** Boss HP multipliers (times the course scale for later bosses). */
const BACKYARD_BOSS_HP = 1.9;
const LATER_BOSS_HP = 3.6;

export function waveConfig(wave: number): WaveConfig {
  const n = Math.max(1, Math.floor(Number.isFinite(wave) ? wave : 1));
  const loc = locate(n);
  const c = loc.course;
  const rows = c === 0 ? BACKYARD_ROWS : LATER_ROWS;
  const rowIndex = loc.boss ? BOSS_ROW : rows[Math.min(loc.courseWave, rows.length) - 1];
  const row = TABLE[rowIndex];
  const scale = courseHpScale(c);
  const hpMult = (1 + 0.2 * rowIndex) * scale;
  const bossHpMult = c === 0 ? BACKYARD_BOSS_HP : LATER_BOSS_HP * scale;
  return {
    ...row,
    spawnIntervalMs: Math.round(row.spawnIntervalMs * Math.max(0.7, 1 - 0.06 * c)),
    wave: n,
    course: c,
    courseWave: loc.courseWave,
    courseWaves: loc.waves,
    maxAlive: Math.min(100, 40 + 6 * (loc.boss ? BOSS_ROW + 1 : rowIndex + 1) + 4 * c),
    hpMult: Math.round(hpMult * 100) / 100,
    bossHpMult: loc.boss ? Math.round(bossHpMult * 100) / 100 : 0,
    crumbMult: 1 + 0.25 * c,
    boss: loc.boss,
  };
}
