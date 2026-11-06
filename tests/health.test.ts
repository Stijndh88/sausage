import { describe, expect, it } from 'vitest';
import { armorMultiplier, Health, MIN_ARMOR } from '../src/systems/Health';

describe('armorMultiplier', () => {
  it('is 1 at 0 armor, halves damage at 15, and falls with diminishing returns', () => {
    expect(armorMultiplier(0)).toBe(1);
    expect(armorMultiplier(15)).toBeCloseTo(0.5);
    const gainFirst5 = armorMultiplier(0) - armorMultiplier(5);
    const gainNext5 = armorMultiplier(5) - armorMultiplier(10);
    expect(gainNext5).toBeLessThan(gainFirst5);
  });

  it('negative armor increases damage, but only down to the floor', () => {
    expect(armorMultiplier(-4)).toBeGreaterThan(1);
    expect(armorMultiplier(-1000)).toBe(armorMultiplier(MIN_ARMOR));
  });
});

describe('Health', () => {
  it('takes damage after armor, at least 1 per hit, and never below 0', () => {
    const h = new Health(100);
    h.armor = 15;
    expect(h.takeDamage(10)).toBe(5);
    expect(h.hp).toBe(95);
    expect(h.takeDamage(0.1)).toBe(1);
    h.takeDamage(10_000);
    expect(h.hp).toBe(0);
    expect(h.dead).toBe(true);
    expect(h.takeDamage(5)).toBe(0);
  });

  it('heals up to max HP, regenerates over time, and never revives the dead', () => {
    const h = new Health(50, 10);
    expect(h.heal(15)).toBe(15);
    expect(h.heal(1000)).toBe(25);
    expect(h.hp).toBe(50);

    const r = new Health(50, 40);
    r.regenPerSec = 2;
    r.tick(2.5);
    expect(r.hp).toBeCloseTo(45);

    const dead = new Health(50, 0);
    dead.regenPerSec = 10;
    dead.tick(5);
    expect(dead.heal(10)).toBe(0);
    expect(dead.hp).toBe(0);
  });

  it('shows a sliver of HP as 1, not 0', () => {
    const h = new Health(100, 0.2);
    expect(h.display).toBe(1);
    expect(h.fraction).toBeCloseTo(0.002);
  });
});
