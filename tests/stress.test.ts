/** Stress tests for pure logic that runs every frame (no Phaser needed). */
import { describe, expect, it } from 'vitest';
import { FIRST_LINK_GAP, LINK_GAP } from '../src/entities/LinkChain';
import { MAX_LINKS } from '../src/data/weapons';
import { BACKYARD_BOSS_WAVE, waveConfig } from '../src/data/waves';
import { Health } from '../src/systems/Health';
import { mulberry32 } from '../src/systems/rng';
import { Trail } from '../src/systems/Trail';

// Same parameters LinkChain uses for the sausage body.
const TRAIL_MIN_STEP = 2;
const TRAIL_MAX = FIRST_LINK_GAP + LINK_GAP * MAX_LINKS + 40;

describe('Trail under long sessions', () => {
  it('stays bounded over an hour of 60 Hz random movement, dashes and teleports', () => {
    const t = new Trail(TRAIL_MIN_STEP, TRAIL_MAX);
    t.prefill(640, 400, 0);
    const rng = mulberry32(42);
    let x = 640;
    let y = 400;
    let maxPoints = 0;
    for (let f = 0; f < 60 * 60 * 60; f++) {
      const r = rng();
      if (r < 0.001) {
        x = rng() * 1280; // teleport-sized jump (e.g. a long frame)
        y = rng() * 720;
      } else {
        const speed = r < 0.05 ? 12.5 : 4; // dash vs walk, px per frame
        const a = rng() * Math.PI * 2;
        x = Math.min(1258, Math.max(22, x + Math.cos(a) * speed));
        y = Math.min(706, Math.max(78, y + Math.sin(a) * speed));
      }
      t.push(x, y);
      if (f % 97 === 0) maxPoints = Math.max(maxPoints, t.pointCount);
    }
    // Each point is at least minStep from the previous one, so the trail can hold at most
    // maxLength / minStep points (plus the one that crosses the limit).
    expect(maxPoints).toBeLessThanOrEqual(Math.ceil(TRAIL_MAX / TRAIL_MIN_STEP) + 2);
    expect(t.length).toBeLessThanOrEqual(TRAIL_MAX + 40);
  });

  it('keeps sampling every link fast enough for per-frame use', () => {
    const t = new Trail(TRAIL_MIN_STEP, TRAIL_MAX);
    t.prefill(640, 400, 0);
    for (let i = 0; i < 500; i++) t.push(640 + Math.cos(i / 10) * 200, 400 + Math.sin(i / 7) * 200);
    const frames = 20000;
    const start = performance.now();
    for (let f = 0; f < frames; f++) {
      for (let i = 0; i < MAX_LINKS; i++) {
        const p = t.sample(FIRST_LINK_GAP + LINK_GAP * i);
        if (!Number.isFinite(p.x) || !Number.isFinite(p.angle)) throw new Error('bad sample');
      }
    }
    const perFrameMs = (performance.now() - start) / frames;
    // Measured ~0.005 ms; one frame is 16.7 ms.
    expect(perFrameMs).toBeLessThan(0.5);
  });
});

describe('Health with extreme frame times', () => {
  it('regen stays finite and clamped for huge or tiny dt', () => {
    const h = new Health(100, 50);
    h.regenPerSec = 3;
    h.tick(1e9);
    expect(h.hp).toBe(100);
    const e = new Health(100, 50);
    e.regenPerSec = 3;
    for (let i = 0; i < 1e5; i++) e.tick(1e-6);
    expect(Number.isFinite(e.hp)).toBe(true);
    expect(e.hp).toBeGreaterThan(50);
  });
});

describe('Wave caps', () => {
  it('every wave (and out-of-range waves) has finite caps the pools can absorb', () => {
    for (const w of [-5, 0, 1, 5, 9, BACKYARD_BOSS_WAVE, BACKYARD_BOSS_WAVE + 1, 1e6]) {
      const cfg = waveConfig(w);
      expect(cfg.wave).toBeGreaterThanOrEqual(1);
      expect(Number.isFinite(cfg.hpMult)).toBe(true);
      expect(cfg.maxAlive).toBeGreaterThan(0);
      expect(cfg.maxAlive).toBeLessThanOrEqual(100);
      expect(cfg.maxTurrets).toBeLessThanOrEqual(cfg.maxAlive);
      expect(Number.isFinite(cfg.spawnIntervalMs)).toBe(true);
    }
  });
});
