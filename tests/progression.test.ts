/**
 * Progression targets, checked with the run simulator (tools/balance-sim.ts), which plays runs on
 * paper with the real items, shop, prices, caps, wave HP and Spice payouts and a greedy shopper.
 * These pin the feel Stijn asked for after the 2026-11-07 playtest: bosses take a real fight,
 * one-shots only happen in extremely lucky runs, and one run doesn't fill the Spice Rack.
 */
import { describe, expect, it } from 'vitest';
import { bossHp, buildPower, fullTalents, simulateRun, type RunResult } from '../tools/balance-sim';
import { ITEMS, ITEM_IDS } from '../src/data/items';
import { CAPS, computeStats } from '../src/state/stats';
import { fullTreeCost } from '../src/data/talents';
import { waveConfig } from '../src/data/waves';
import { WEAPON_IDS } from '../src/data/weapons';

const RUNS = 60;
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

/** Frank, no talents, pushing on through one Seconds loop. */
const fresh: RunResult[] = Array.from({ length: RUNS }, (_, i) => simulateRun({ seed: i + 1, courses: 4 }));

describe('boss fights', () => {
  it('every boss takes a real fight for a typical build: 20 to 70 s at the median', () => {
    for (let b = 0; b < 4; b++) {
      const ttk = median(fresh.map((r) => r.bossTtks[b]));
      expect(ttk, `boss ${b + 1}`).toBeGreaterThan(20);
      expect(ttk, `boss ${b + 1}`).toBeLessThan(70);
    }
  });

  it('later bosses are not easier than the Tongs', () => {
    const tongs = median(fresh.map((r) => r.bossTtks[0]));
    for (let b = 1; b < 4; b++) expect(median(fresh.map((r) => r.bossTtks[b])), `boss ${b + 1}`).toBeGreaterThan(tongs * 0.9);
  });

  it('even the luckiest of 60 runs needs several seconds for any boss', () => {
    expect(Math.min(...fresh.map((r) => r.fastestBoss))).toBeGreaterThan(8);
  });

  it('a full Spice Rack makes bosses faster but never trivial', () => {
    const maxed = Array.from({ length: 30 }, (_, i) => simulateRun({ seed: i + 1, courses: 4, talents: fullTalents() }));
    expect(Math.min(...maxed.map((r) => r.fastestBoss))).toBeGreaterThan(4);
  });

  it('the strongest possible build (every item at its max, six tier IV copies) needs 6+ s for the Seconds boss even with every shot landing', () => {
    const items = ITEM_IDS.flatMap((id) => Array(ITEMS[id].maxStacks).fill(id));
    const stats = computeStats(items);
    for (const id of WEAPON_IDS) {
      const p = buildPower(Array.from({ length: 6 }, () => ({ id, tier: 4 })), stats);
      expect(bossHp(waveConfig(25)) / p.single, id).toBeGreaterThan(6);
    }
  });
});

describe('build growth', () => {
  it('a typical run is still shopping at the end of Seconds: damage stays below the cap', () => {
    const dmg = median(fresh.map((r) => r.build.stats.damageMult));
    expect(dmg).toBeLessThan(CAPS.maxDamageMult - 0.5);
  });

  it('crumbs over a whole run stay in the low tens of thousands', () => {
    const crumbs = median(fresh.map((r) => r.crumbs));
    expect(crumbs).toBeGreaterThan(5000);
    expect(crumbs).toBeLessThan(25000);
  });
});

describe('Spice and the Spice Rack', () => {
  const home = (courses: number) => median(Array.from({ length: 40 }, (_, i) => simulateRun({ seed: i + 1, courses }).spiceKept));

  it('taking it home pays more the further you get', () => {
    const pays = [1, 2, 3, 4].map(home);
    for (let i = 1; i < pays.length; i++) expect(pays[i]).toBeGreaterThan(pays[i - 1]);
    expect(pays[0]).toBeGreaterThan(60);
  });

  it('one deep run (home after Seconds) buys well under a tenth of the rack', () => {
    expect(home(4)).toBeLessThan(fullTreeCost() / 10);
  });

  it('the rack takes a dozen or more deep runs even counting every recipe and first taste', () => {
    // Recipes pay about 4,200 Spice once; First Taste about 1,650 over all sausages.
    expect((fullTreeCost() - 4300 - 1700) / home(4)).toBeGreaterThan(8);
    expect(fullTreeCost() / home(3)).toBeGreaterThan(20);
  });
});
