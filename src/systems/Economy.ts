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

/**
 * Prices rise 30% of the base price per wave, and from wave 5 they also compound by 8% a wave, so
 * deep runs, where crumbs pour in, still have to choose what to buy. Price multiplier by wave:
 * 5: 2.2x · 7 (Tongs): 3.3x · 13 (Grinder): 8.5x · 19 (Big Smokey): 19x · 25: 38x.
 * Tuned with tools/balance-sim.ts.
 */
export const PRICE_GROWTH_PER_WAVE = 0.3;
export const PRICE_COMPOUND_PER_WAVE = 1.08;
export const PRICE_COMPOUND_FROM_WAVE = 5;

export function priceGrowth(wave: number): number {
  const w = Math.max(1, Math.min(200, wave));
  return (1 + PRICE_GROWTH_PER_WAVE * (w - 1)) * PRICE_COMPOUND_PER_WAVE ** Math.max(0, w - PRICE_COMPOUND_FROM_WAVE);
}

export function scalePrice(base: number, wave: number, priceMult = 1): number {
  return Math.max(1, Math.round(base * priceGrowth(wave) * priceMult));
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
  /** Weapons that may be offered (unlocked ones); all when missing. */
  weaponPool?: readonly WeaponId[];
  /** Item rarities that may be offered; all when missing. */
  rarities?: readonly Rarity[];
  /** Lowest item rarity offered (Food Truck keystone). */
  minRarity?: Rarity;
  /** Multiplies every price (talent discount, Chili, menus). */
  priceMult?: number;
}

/** Item ids of one rarity that can still be offered. */
function itemPool(rarity: Rarity, owned: readonly string[]): string[] {
  return ITEM_IDS.filter((id) => ITEMS[id].rarity === rarity && !isItemMaxed(owned, id));
}

/**
 * Rolls a rarity (by wave and luck), falling back to lower rarities when a pool is empty.
 * Locked rarities are never rolled; with a minimum rarity, lower ones aren't either.
 */
export function rollItem(rng: Rng, wave: number, ctx: ShopContext, owned: readonly string[], used: Set<string>): string | null {
  const allowed = ctx.rarities ?? RARITY_ORDER;
  const min = RARITY_ORDER.indexOf(ctx.minRarity ?? 'common');
  const weights = rarityWeights(wave, ctx.luck ?? 0);
  for (const r of RARITY_ORDER) if (!allowed.includes(r) || RARITY_ORDER.indexOf(r) < min) weights[r] = 0;
  if (!Object.values(weights).some((w) => w > 0)) return null;
  let rarity = pickWeighted(rng, weights);
  for (let r = RARITY_ORDER.indexOf(rarity); r >= 0; r--) {
    rarity = RARITY_ORDER[r];
    if (!allowed.includes(rarity) || r < min) continue;
    const pool = itemPool(rarity, owned).filter((id) => !used.has(`item:${id}`));
    if (pool.length) return pool[Math.floor(rng() * pool.length)];
  }
  // Everything at or below the rolled rarity is maxed (late in a run, or Food Truck with every
  // Uncommon maxed): offer anything still worth having rather than an empty slot.
  for (let r = RARITY_ORDER.length - 1; r >= 0; r--) {
    if (!allowed.includes(RARITY_ORDER[r])) continue;
    const pool = itemPool(RARITY_ORDER[r], owned).filter((id) => !used.has(`item:${id}`));
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
  const priceMult = ctx.priceMult ?? 1;
  const pool = ctx.weaponPool ?? WEAPON_IDS;
  const offers: Offer[] = locked.slice(0, count).map((o) => ({ ...o, price: scalePrice(basePrice(o), wave, priceMult) }));
  const used = new Set(offers.map((o) => `${o.type}:${o.id}`));
  let guard = 0;
  while (offers.length < count && guard++ < 200) {
    const type: Offer['type'] = rng() < WEAPON_OFFER_CHANCE ? 'weapon' : 'item';
    let id: string | null;
    if (type === 'weapon') {
      if (!pool.length) continue;
      id = pool[Math.floor(rng() * pool.length)];
      if (weapons && applyWeaponPurchase(weapons, id as WeaponId, ctx.maxLinks) === null) continue;
    } else {
      id = rollItem(rng, wave, ctx, owned, used);
      if (!id) continue;
    }
    const key = `${type}:${id}`;
    if (used.has(key)) continue;
    used.add(key);
    offers.push({ type, id, price: scalePrice(basePrice({ type, id }), wave, priceMult) });
  }
  return offers;
}

/**
 * What buying a weapon does:
 * - 'link' puts it on a new link (any link can hold any weapon, so copies stack).
 * - 'upgrade' raises your lowest-tier copy that isn't maxed.
 * - 'auto' (the default) adds a link while there's room, otherwise upgrades.
 */
export type WeaponBuyMode = 'auto' | 'link' | 'upgrade';

/** Returns the new loadout, or null if this purchase isn't possible. */
export function applyWeaponPurchase(
  weapons: readonly WeaponSlot[],
  id: WeaponId,
  maxLinks = MAX_LINKS,
  mode: WeaponBuyMode = 'auto',
): WeaponSlot[] | null {
  const next = weapons.map((w) => ({ ...w }));
  const room = next.length < maxLinks;
  if (mode === 'link' || (mode === 'auto' && room)) {
    if (!room) return null;
    next.push({ id, tier: 1 });
    return next;
  }
  let target: WeaponSlot | undefined;
  for (const w of next) {
    if (w.id === id && w.tier < MAX_TIER && (!target || w.tier < target.tier)) target = w;
  }
  if (!target) return null;
  target.tier++;
  return next;
}

/** The ways a weapon offer can be bought right now (empty if none). */
export function weaponBuyModes(weapons: readonly WeaponSlot[], id: WeaponId, maxLinks = MAX_LINKS): ('link' | 'upgrade')[] {
  return (['link', 'upgrade'] as const).filter((m) => applyWeaponPurchase(weapons, id, maxLinks, m) !== null);
}

export function canBuy(
  offer: Offer,
  crumbs: number,
  weapons: readonly WeaponSlot[],
  items: readonly string[] = [],
  maxLinks = MAX_LINKS,
  mode: WeaponBuyMode = 'auto',
): { ok: boolean; reason?: string } {
  if (offer.type === 'item' && isItemMaxed(items, offer.id)) return { ok: false, reason: 'Maxed out' };
  if (crumbs < offer.price) return { ok: false, reason: 'Not enough crumbs' };
  if (offer.type === 'weapon' && applyWeaponPurchase(weapons, offer.id as WeaponId, maxLinks, mode) === null) {
    const owned = weapons.some((w) => w.id === offer.id);
    if (mode === 'upgrade') return { ok: false, reason: owned ? 'Every copy is maxed' : 'Nothing to upgrade' };
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
