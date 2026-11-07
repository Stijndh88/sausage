import { describe, expect, it } from 'vitest';
import { ITEMS } from '../src/data/items';
import { RARITY_ORDER, rarityWeights } from '../src/data/rarity';
import { MAX_LINKS } from '../src/data/weapons';
import { BASE_STATS, CAPS, computeStats } from '../src/state/stats';
import type { WeaponSlot } from '../src/state/run';
import {
  applyWeaponPurchase, canBuy, itemHasEffect, weaponBuyModes, generateOffers, rerollCost, rollCrumbs, scalePrice, shopRng,
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

  it('fills 4 unique offers and keeps locked ones first, re-priced for the new wave', () => {
    const locked = [{ type: 'item' as const, id: 'paprika', price: 3 }];
    for (let seed = 0; seed < 50; seed++) {
      const offers = generateOffers(mulberry32(seed), 5, locked);
      expect(offers).toHaveLength(4);
      expect(offers[0]).toEqual({ type: 'item', id: 'paprika', price: scalePrice(ITEMS.paprika.price, 5) });
      const keys = offers.map((o) => `${o.type}:${o.id}`);
      expect(new Set(keys).size).toBe(4);
    }
  });

  it('scales prices and reroll costs up', () => {
    expect(scalePrice(10, 1)).toBe(10);
    expect(scalePrice(10, 5)).toBe(20);
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
    const result = applyWeaponPurchase([{ id: 'toothpick', tier: 3 }, { id: 'toothpick', tier: 2 }], 'toothpick', undefined, 'upgrade');
    expect(result).toEqual([{ id: 'toothpick', tier: 3 }, { id: 'toothpick', tier: 3 }]);
  });

  it('stacks: an owned weapon goes on a new link by default, up to every link', () => {
    let w: WeaponSlot[] = [{ id: 'onion', tier: 1 }];
    for (let i = 1; i < MAX_LINKS; i++) w = applyWeaponPurchase(w, 'onion')!;
    expect(w).toHaveLength(MAX_LINKS);
    expect(w.every((x) => x.id === 'onion' && x.tier === 1)).toBe(true);
    // Links full: the default now upgrades a copy, and "new link" is refused.
    expect(applyWeaponPurchase(w, 'onion')!.filter((x) => x.tier === 2)).toHaveLength(1);
    expect(applyWeaponPurchase(w, 'onion', MAX_LINKS, 'link')).toBeNull();
    expect(canBuy({ type: 'weapon', id: 'onion', price: 1 }, 10, w).ok).toBe(true);
    expect(canBuy({ type: 'weapon', id: 'onion', price: 1 }, 10, w, [], MAX_LINKS, 'link').ok).toBe(false);
  });

  it('offers both choices only when you own the weapon and have a free link', () => {
    expect(weaponBuyModes([{ id: 'onion', tier: 1 }], 'onion')).toEqual(['link', 'upgrade']);
    expect(weaponBuyModes([{ id: 'onion', tier: 1 }], 'pepper')).toEqual(['link']);
    expect(weaponBuyModes([{ id: 'onion', tier: 4 }], 'onion')).toEqual(['link']);
    const full: WeaponSlot[] = Array.from({ length: MAX_LINKS }, () => ({ id: 'onion', tier: 2 }));
    expect(weaponBuyModes(full, 'onion')).toEqual(['upgrade']);
    expect(weaponBuyModes(full, 'pepper')).toEqual([]);
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
  it('stacks items and clamps capped stats', () => {
    const s = computeStats(['paprika', 'paprika', 'sesame']);
    expect(s.damageMult).toBeCloseTo(1.16);
    expect(s.speedMult).toBeCloseTo(1.06);
    expect(computeStats(Array(20).fill('casing')).armor).toBe(40);
    expect(computeStats(Array(20).fill('slippery_oil')).dodge).toBe(CAPS.dodge);
  });

  it('rolls fractional crumbs to the right average', () => {
    const rng = mulberry32(7);
    let total = 0;
    for (let i = 0; i < 10000; i++) total += rollCrumbs(rng, 1, 1.5);
    expect(total / 10000).toBeGreaterThan(1.45);
    expect(total / 10000).toBeLessThan(1.55);
  });
});

describe('rarities and maxed items', () => {
  it('rares start at wave 3, legendaries at wave 5, and luck shifts odds away from common', () => {
    expect(rarityWeights(2).rare).toBe(0);
    expect(rarityWeights(3).rare).toBeGreaterThan(0);
    expect(rarityWeights(4).legendary).toBe(0);
    expect(rarityWeights(5).legendary).toBeGreaterThan(0);
    const share = (w: Record<string, number>) => w.common / Object.values(w).reduce((a, b) => a + b, 0);
    expect(share(rarityWeights(8, 100))).toBeLessThan(share(rarityWeights(8, 0)));
    for (let w = 2; w <= 10; w++) expect(share(rarityWeights(w))).toBeLessThanOrEqual(share(rarityWeights(w - 1)));
  });

  it('never offers an item you have maxed out, and refuses to sell one', () => {
    const owned = ['grill_apron', 'second_skin'];
    for (let seed = 0; seed < 300; seed++) {
      for (const o of generateOffers(mulberry32(seed), 9, [], 4, undefined, { items: owned, luck: 200 })) {
        expect(owned).not.toContain(o.id);
      }
    }
    expect(canBuy({ type: 'item', id: 'grill_apron', price: 1 }, 99, [], owned)).toEqual({ ok: false, reason: 'Maxed out' });
  });

  it('later waves offer better items on average', () => {
    const avgRank = (wave: number) => {
      let total = 0;
      let n = 0;
      for (let seed = 0; seed < 300; seed++) {
        for (const o of generateOffers(mulberry32(seed), wave)) {
          if (o.type !== 'item') continue;
          total += RARITY_ORDER.indexOf(ITEMS[o.id].rarity);
          n++;
        }
      }
      return total / n;
    };
    expect(avgRank(9)).toBeGreaterThan(avgRank(2));
  });
});

describe('items that would do nothing', () => {
  // Dodge and crit already at their caps: the items that only raise those do nothing.
  const capped = { ...BASE_STATS, dodge: CAPS.dodge, critChance: CAPS.critChance };

  it('knows when an item would change no stat', () => {
    expect(itemHasEffect([], 'slippery_oil', capped)).toBe(false);
    expect(itemHasEffect([], 'mustard_seed', capped)).toBe(false);
    expect(itemHasEffect([], 'slippery_oil')).toBe(true);
  });

  it('never offers them in the shop', () => {
    for (let seed = 1; seed <= 400; seed++) {
      const offers = generateOffers(shopRng(seed, 6, 0), 6, [], undefined, [], { baseStats: capped });
      for (const o of offers) {
        if (o.type === 'item') expect(itemHasEffect([], o.id, capped), `${o.id} (seed ${seed})`).toBe(true);
      }
    }
  });

  it('stops offering an item once an owned copy reaches the stat cap', () => {
    // One Slippery Oil tops dodge up to the cap, well below the item's own stack limit.
    const nearCap = { ...BASE_STATS, dodge: CAPS.dodge - 0.01 };
    expect(computeStats(['slippery_oil'], nearCap).dodge).toBe(CAPS.dodge);
    expect(itemHasEffect([], 'slippery_oil', nearCap)).toBe(true);
    for (let seed = 1; seed <= 400; seed++) {
      const offers = generateOffers(shopRng(seed, 6, 0), 6, [], undefined, [], { items: ['slippery_oil'], baseStats: nearCap });
      expect(offers.some((o) => o.id === 'slippery_oil')).toBe(false);
    }
  });
});
