import { ITEMS, ITEM_IDS, isItemMaxed } from '../data/items';
import { RARITY_ORDER, rarityWeights, type Rarity } from '../data/rarity';
import { MAX_LINKS, MAX_TIER, WEAPONS, WEAPON_IDS, type WeaponId } from '../data/weapons';
import type { WeaponSlot } from '../state/run';
import { type Rng, mulberry32, pickWeighted } from './rng';

export interface Offer {
  type: 'weapon' | 'item';
  id: string;
  price: number;
}

export const SHOP_SIZE = 4;
export const WEAPON_OFFER_CHANCE = 0.45;

/** Prices rise 25% (of the base price) per wave. */
export const PRICE_GROWTH_PER_WAVE = 0.25;

export function scalePrice(base: number, wave: number): number {
  return Math.round(base * (1 + PRICE_GROWTH_PER_WAVE * (wave - 1)));
}

export function rerollCost(wave: number, rerollCount: number): number {
  return 2 + Math.floor(wave / 2) + rerollCount * 2;
}

export function shopRng(seed: number, wave: number, rerollCount: number): Rng {
  return mulberry32((seed ^ (wave * 7919) ^ (rerollCount * 104729)) >>> 0);
}

export function basePrice(offer: Pick<Offer, 'type' | 'id'>): number {
  return offer.type === 'weapon' ? WEAPONS[offer.id as WeaponId].price : ITEMS[offer.id].price;
}

export interface ShopContext {
  /** Owned items: maxed ones aren't offered. */
  items?: readonly string[];
  /** Luck stat (%), improves rarity odds. */
  luck?: number;
  /** Link limit for the chosen sausage. */
  maxLinks?: number;
}

/** Item ids of one rarity that can still be offered. */
function itemPool(rarity: Rarity, owned: readonly string[]): string[] {
  return ITEM_IDS.filter((id) => ITEMS[id].rarity === rarity && !isItemMaxed(owned, id));
}

/** Rolls a rarity (by wave and luck), falling back to lower rarities when a pool is empty. */
function rollItem(rng: Rng, wave: number, luck: number, owned: readonly string[], used: Set<string>): string | null {
  let rarity = pickWeighted(rng, rarityWeights(wave, luck));
  for (let r = RARITY_ORDER.indexOf(rarity); r >= 0; r--) {
    rarity = RARITY_ORDER[r];
    const pool = itemPool(rarity, owned).filter((id) => !used.has(`item:${id}`));
    if (pool.length) return pool[Math.floor(rng() * pool.length)];
  }
  return null;
}

/**
 * Builds a shop. Kept offers stay but are re-priced for this wave; the rest are rolled fresh.
 * No duplicate ids within one shop, no weapons you couldn't buy, no items you've maxed out.
 */
export function generateOffers(
  rng: Rng,
  wave: number,
  locked: readonly Offer[] = [],
  count = SHOP_SIZE,
  /** The player's links: weapons that couldn't be bought (all copies maxed, no free link) aren't offered. */
  weapons?: readonly WeaponSlot[],
  ctx: ShopContext = {},
): Offer[] {
  const owned = ctx.items ?? [];
  const offers: Offer[] = locked.slice(0, count).map((o) => ({ ...o, price: scalePrice(basePrice(o), wave) }));
  const used = new Set(offers.map((o) => `${o.type}:${o.id}`));
  let guard = 0;
  while (offers.length < count && guard++ < 200) {
    const type: Offer['type'] = rng() < WEAPON_OFFER_CHANCE ? 'weapon' : 'item';
    let id: string | null;
    if (type === 'weapon') {
      id = WEAPON_IDS[Math.floor(rng() * WEAPON_IDS.length)];
      if (weapons && applyWeaponPurchase(weapons, id as WeaponId, ctx.maxLinks) === null) continue;
    } else {
      id = rollItem(rng, wave, ctx.luck ?? 0, owned, used);
      if (!id) continue;
    }
    const key = `${type}:${id}`;
    if (used.has(key)) continue;
    used.add(key);
    offers.push({ type, id, price: scalePrice(basePrice({ type, id }), wave) });
  }
  return offers;
}

/**
 * Buying a weapon you own upgrades your lowest-tier copy that isn't maxed.
 * Otherwise it adds a new link, if there's room. Returns null if it can't be bought.
 */
export function applyWeaponPurchase(weapons: readonly WeaponSlot[], id: WeaponId, maxLinks = MAX_LINKS): WeaponSlot[] | null {
  const next = weapons.map((w) => ({ ...w }));
  let target: WeaponSlot | undefined;
  for (const w of next) {
    if (w.id === id && w.tier < MAX_TIER && (!target || w.tier < target.tier)) target = w;
  }
  if (target) {
    target.tier++;
    return next;
  }
  if (next.length >= maxLinks) return null;
  next.push({ id, tier: 1 });
  return next;
}

export function canBuy(
  offer: Offer,
  crumbs: number,
  weapons: readonly WeaponSlot[],
  items: readonly string[] = [],
  maxLinks = MAX_LINKS,
): { ok: boolean; reason?: string } {
  if (offer.type === 'item' && isItemMaxed(items, offer.id)) return { ok: false, reason: 'Maxed out' };
  if (crumbs < offer.price) return { ok: false, reason: 'Not enough crumbs' };
  if (offer.type === 'weapon' && applyWeaponPurchase(weapons, offer.id as WeaponId, maxLinks) === null) {
    const owned = weapons.some((w) => w.id === offer.id);
    return { ok: false, reason: owned ? 'Maxed out · no free links' : 'No free links' };
  }
  return { ok: true };
}

/** Converts a fractional crumb amount into whole crumbs, rounding randomly. */
export function rollCrumbs(rng: Rng, base: number, mult: number): number {
  const value = base * mult;
  const whole = Math.floor(value);
  return whole + (rng() < value - whole ? 1 : 0);
}
