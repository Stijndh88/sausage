import { ITEMS, ITEM_IDS } from '../data/items';
import { MAX_LINKS, MAX_TIER, WEAPONS, WEAPON_IDS, type WeaponId } from '../data/weapons';
import type { WeaponSlot } from '../state/run';
import { type Rng, mulberry32 } from './rng';

export interface Offer {
  type: 'weapon' | 'item';
  id: string;
  price: number;
}

export const SHOP_SIZE = 4;
export const WEAPON_OFFER_CHANCE = 0.45;

/** Prices rise 15% per wave. */
export function scalePrice(base: number, wave: number): number {
  return Math.round(base * (1 + 0.15 * (wave - 1)));
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

/**
 * Builds a shop: locked offers stay (at their old price), the rest are rolled fresh.
 * No duplicate ids within one shop.
 */
export function generateOffers(rng: Rng, wave: number, locked: readonly Offer[] = [], count = SHOP_SIZE): Offer[] {
  const offers: Offer[] = locked.slice(0, count).map((o) => ({ ...o }));
  const used = new Set(offers.map((o) => `${o.type}:${o.id}`));
  let guard = 0;
  while (offers.length < count && guard++ < 200) {
    const type: Offer['type'] = rng() < WEAPON_OFFER_CHANCE ? 'weapon' : 'item';
    const pool = type === 'weapon' ? WEAPON_IDS : ITEM_IDS;
    const id = pool[Math.floor(rng() * pool.length)];
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
export function applyWeaponPurchase(weapons: readonly WeaponSlot[], id: WeaponId): WeaponSlot[] | null {
  const next = weapons.map((w) => ({ ...w }));
  let target: WeaponSlot | undefined;
  for (const w of next) {
    if (w.id === id && w.tier < MAX_TIER && (!target || w.tier < target.tier)) target = w;
  }
  if (target) {
    target.tier++;
    return next;
  }
  if (next.length >= MAX_LINKS) return null;
  next.push({ id, tier: 1 });
  return next;
}

export function canBuy(offer: Offer, crumbs: number, weapons: readonly WeaponSlot[]): { ok: boolean; reason?: string } {
  if (crumbs < offer.price) return { ok: false, reason: 'Not enough crumbs' };
  if (offer.type === 'weapon' && applyWeaponPurchase(weapons, offer.id as WeaponId) === null) {
    return { ok: false, reason: 'No free links' };
  }
  return { ok: true };
}

/** Converts a fractional crumb amount into whole crumbs, rounding randomly. */
export function rollCrumbs(rng: Rng, base: number, mult: number): number {
  const value = base * mult;
  const whole = Math.floor(value);
  return whole + (rng() < value - whole ? 1 : 0);
}
