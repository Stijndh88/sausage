import { describe, expect, it } from 'vitest';
import { MAX_LINKS } from '../src/data/weapons';
import { computeStats, MIN_HEAT_TAKEN } from '../src/state/stats';
import type { WeaponSlot } from '../src/state/run';
import {
  applyWeaponPurchase, canBuy, generateOffers, rerollCost, rollCrumbs, scalePrice, shopRng,
} from '../src/systems/Economy';
import { mulberry32 } from '../src/systems/rng';

describe('shop offers', () => {
  it('is deterministic for the same seed, wave and reroll count', () => {
    const a = generateOffers(shopRng(42, 3, 0), 3);
    const b = generateOffers(shopRng(42, 3, 0), 3);
    const c = generateOffers(shopRng(42, 3, 1), 3);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('fills 4 unique offers and keeps locked ones first', () => {
    const locked = [{ type: 'item' as const, id: 'paprika', price: 99 }];
    for (let seed = 0; seed < 50; seed++) {
      const offers = generateOffers(mulberry32(seed), 5, locked);
      expect(offers).toHaveLength(4);
      expect(offers[0]).toEqual(locked[0]);
      const keys = offers.map((o) => `${o.type}:${o.id}`);
      expect(new Set(keys).size).toBe(4);
    }
  });

  it('scales prices and reroll costs up', () => {
    expect(scalePrice(10, 1)).toBe(10);
    expect(scalePrice(10, 5)).toBe(16);
    expect(rerollCost(1, 0)).toBeLessThan(rerollCost(1, 1));
    expect(rerollCost(1, 0)).toBeLessThan(rerollCost(8, 0));
  });
});

describe('weapon purchases', () => {
  it('adds a link for a new weapon', () => {
    const result = applyWeaponPurchase([{ id: 'toothpick', tier: 1 }], 'pepper');
    expect(result).toEqual([{ id: 'toothpick', tier: 1 }, { id: 'pepper', tier: 1 }]);
  });

  it('upgrades the lowest tier copy you already own', () => {
    const result = applyWeaponPurchase([{ id: 'toothpick', tier: 3 }, { id: 'toothpick', tier: 2 }], 'toothpick');
    expect(result).toEqual([{ id: 'toothpick', tier: 3 }, { id: 'toothpick', tier: 3 }]);
  });

  it('adds a new copy once the owned one is maxed, and refuses when links are full', () => {
    expect(applyWeaponPurchase([{ id: 'skewer', tier: 4 }], 'skewer')).toHaveLength(2);
    const full: WeaponSlot[] = Array.from({ length: MAX_LINKS }, () => ({ id: 'skewer', tier: 4 }));
    expect(applyWeaponPurchase(full, 'skewer')).toBeNull();
    expect(canBuy({ type: 'weapon', id: 'mustard', price: 1 }, 10, full).ok).toBe(false);
    expect(canBuy({ type: 'item', id: 'paprika', price: 1 }, 10, full).ok).toBe(true);
    expect(canBuy({ type: 'item', id: 'paprika', price: 11 }, 10, full).ok).toBe(false);
  });

  it('does not mutate the input', () => {
    const input: WeaponSlot[] = [{ id: 'onion', tier: 1 }];
    applyWeaponPurchase(input, 'onion');
    expect(input[0].tier).toBe(1);
  });
});

describe('stats from items', () => {
  it('stacks items and clamps heat resistance', () => {
    const s = computeStats(['paprika', 'paprika', 'sesame']);
    expect(s.damageMult).toBeCloseTo(1.2);
    expect(s.speedMult).toBeCloseTo(1.08);
    const tank = computeStats(Array(20).fill('casing'));
    expect(tank.heatTakenMult).toBe(MIN_HEAT_TAKEN);
  });

  it('rolls fractional crumbs to the right average', () => {
    const rng = mulberry32(7);
    let total = 0;
    for (let i = 0; i < 10000; i++) total += rollCrumbs(rng, 1, 1.5);
    expect(total / 10000).toBeGreaterThan(1.45);
    expect(total / 10000).toBeLessThan(1.55);
  });
});
