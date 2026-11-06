/**
 * Code-review bug hunt: invariants of the Phaser-free logic (and WaveDirector, driven by a fake scene).
 */
import { describe, expect, it, vi } from 'vitest';

// WaveDirector only uses Phaser for types; make sure the real engine never loads under Node.
vi.mock('phaser', () => ({ default: {} }));

import { waveConfig, TOTAL_WAVES, type WaveConfig } from '../src/data/waves';
import { ITEM_IDS } from '../src/data/items';
import { WEAPON_IDS } from '../src/data/weapons';
import { Health } from '../src/systems/Health';
import { generateOffers, scalePrice, basePrice, rollCrumbs, type Offer } from '../src/systems/Economy';
import { mulberry32, pickWeighted, randInt } from '../src/systems/rng';
import { Trail } from '../src/systems/Trail';
import { WaveDirector } from '../src/systems/WaveDirector';

// ---------------------------------------------------------------------------------------------
// A tiny stand-in for the bits of Phaser.Scene that WaveDirector touches.

interface FakeImage { destroyed: boolean; setDepth(): FakeImage; setScale(): FakeImage; destroy(): void }

class FakeScene {
  now = 0;
  private timers: { at: number; fn: () => void }[] = [];
  images: FakeImage[] = [];
  add = {
    image: () => {
      const img: FakeImage = {
        destroyed: false,
        setDepth: () => img,
        setScale: () => img,
        destroy: () => { img.destroyed = true; },
      };
      this.images.push(img);
      return img;
    },
  };
  tweens = { add: () => ({}), killTweensOf: () => {} };
  time = {
    delayedCall: (ms: number, fn: () => void) => { this.timers.push({ at: this.now + ms, fn }); },
  };

  /** Advance the fake clock, firing due timers in order. */
  advance(ms: number): void {
    const end = this.now + ms;
    for (;;) {
      this.timers.sort((a, b) => a.at - b.at);
      const t = this.timers[0];
      if (!t || t.at > end) break;
      this.timers.shift();
      this.now = t.at;
      t.fn();
    }
    this.now = end;
  }
}

const ARENA = { left: 22, right: 1258, top: 78, bottom: 768 - 60, centerX: 640, centerY: 400 };

function makeDirector(cfg: WaveConfig, seed = 1) {
  const scene = new FakeScene();
  const alive: { kind: string }[] = [];
  const spawned: string[] = [];
  const director = new WaveDirector(scene as never, cfg, mulberry32(seed), ARENA as never, {
    spawn: (kind) => { spawned.push(kind); alive.push({ kind }); },
    alive: () => ({ total: alive.length, turrets: alive.filter((e) => e.kind === 'hotsauce').length }),
    player: () => ({ x: 640, y: 440 }),
  });
  /** Run the director like Game.update does, in 16ms frames. */
  const run = (ms: number) => {
    for (let t = 0; t < ms; t += 16) {
      director.update(16);
      scene.advance(16);
    }
  };
  return { scene, director, alive, spawned, run };
}

describe('review: WaveDirector', () => {
  it('never lets alive + telegraphed exceed maxAlive', () => {
    for (let w = 1; w < TOTAL_WAVES; w++) {
      const cfg = waveConfig(w);
      const { director, alive, run } = makeDirector(cfg, w);
      for (let i = 0; i < 200; i++) {
        run(160);
        const marks = (director as unknown as { marks: Set<unknown> }).marks.size;
        expect(alive.length + marks).toBeLessThanOrEqual(cfg.maxAlive);
      }
    }
  });

  it('respects the turret cap even with turrets still telegraphing', () => {
    let total = 0;
    for (let w = 4; w < TOTAL_WAVES; w++) {
      const cfg = waveConfig(w);
      const { alive, run } = makeDirector(cfg, 100 + w);
      run(cfg.durationSec * 1000);
      const turrets = alive.filter((e) => e.kind === 'hotsauce').length;
      total += turrets;
      expect(turrets).toBeLessThanOrEqual(cfg.maxTurrets);
    }
    expect(total).toBeGreaterThan(0); // the cap was actually exercised
  });

  it('releases pending turret slots and spawns nothing once stopped', () => {
    const { director, scene, spawned, run } = makeDirector(waveConfig(9), 3);
    run(3000);
    const before = spawned.length;
    director.stop();
    scene.advance(2000);
    expect(spawned.length).toBe(before);
    expect((director as unknown as { pendingTurrets: number }).pendingTurrets).toBe(0);
    expect(scene.images.every((m) => m.destroyed)).toBe(true);
  });

  it('telegraphs the boss once on the boss wave and never times out', () => {
    const { director, spawned, run } = makeDirector(waveConfig(TOTAL_WAVES), 5);
    run(60_000);
    expect(spawned.filter((k) => k === 'tongs')).toHaveLength(1);
    expect(director.timeUp).toBe(false);
  });
});

describe('review: Health', () => {
  it('damage, healing and regen never push HP outside [0, max] or to NaN', () => {
    const h = new Health(100);
    h.takeDamage(-10);
    expect(h.hp).toBe(100);
    h.heal(-10);
    expect(h.hp).toBe(100);
    h.regenPerSec = 5;
    h.tick(1e9);
    expect(h.hp).toBe(100);
    h.takeDamage(1e9);
    expect(h.hp).toBe(0);
    expect(Number.isFinite(h.hp)).toBe(true);
  });
});

describe('review: Economy', () => {
  it('never returns more offers than the shop size, even with too many locked', () => {
    const locked: Offer[] = ITEM_IDS.slice(0, 6).map((id) => ({ type: 'item', id, price: 1 }));
    expect(generateOffers(mulberry32(1), 3, locked)).toHaveLength(4);
  });

  it('prices fresh offers for the wave it is given', () => {
    for (let seed = 0; seed < 30; seed++) {
      for (const o of generateOffers(mulberry32(seed), 7)) {
        expect(o.price).toBe(scalePrice(basePrice(o), 7));
      }
    }
  });

  it('every weapon and item can appear in a shop', () => {
    const seen = new Set<string>();
    // Rares appear from wave 3 and legendaries from wave 5, so sample the whole run.
    for (let wave = 2; wave <= 10; wave++) {
      for (let seed = 0; seed < 300; seed++) for (const o of generateOffers(mulberry32(seed), wave)) seen.add(`${o.type}:${o.id}`);
    }
    for (const id of WEAPON_IDS) expect(seen.has(`weapon:${id}`)).toBe(true);
    for (const id of ITEM_IDS) expect(seen.has(`item:${id}`)).toBe(true);
  });

  it('rollCrumbs is exact for whole values and never negative', () => {
    const rng = mulberry32(9);
    for (let i = 0; i < 200; i++) {
      expect(rollCrumbs(rng, 3, 1)).toBe(3);
      expect(rollCrumbs(rng, 0, 1.5)).toBe(0);
      expect(rollCrumbs(rng, 1, 1.15)).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('review: rng', () => {
  it('randInt stays in range and pickWeighted skips zero weights', () => {
    const rng = mulberry32(4);
    for (let i = 0; i < 1000; i++) {
      const v = randInt(rng, 2, 5);
      expect(v).toBeGreaterThanOrEqual(2);
      expect(v).toBeLessThanOrEqual(5);
      expect(pickWeighted(rng, { a: 0, b: 1, c: 0 })).toBe('b');
    }
    expect(() => pickWeighted(rng, { a: 0 })).toThrow();
  });

  it('every wave weight table is pickable', () => {
    for (let w = 1; w <= TOTAL_WAVES; w++) expect(() => pickWeighted(mulberry32(w), waveConfig(w).weights)).not.toThrow();
  });
});

describe('review: Trail', () => {
  it('never produces NaN, even for a head that never moves', () => {
    const t = new Trail(2, 211);
    t.prefill(100, 100, 0);
    for (let i = 0; i < 100; i++) t.push(100, 100);
    for (const d of [0, 27, 51, 147, 500]) {
      const p = t.sample(d);
      expect(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.angle)).toBe(true);
    }
    const empty = new Trail();
    const p = empty.sample(10);
    expect(Number.isFinite(p.x) && Number.isFinite(p.angle)).toBe(true);
  });

  it('the LinkChain trail is long enough for all six links after hard turns', () => {
    const t = new Trail(2, 27 + 24 * 6 + 40);
    t.prefill(0, 0, 0);
    // Zig-zag: lots of short segments.
    for (let i = 0; i < 400; i++) t.push(i * 3, (i % 2) * 3);
    expect(t.length).toBeGreaterThanOrEqual(27 + 24 * 5);
  });
});
