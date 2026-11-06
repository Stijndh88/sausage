import type { PlayerStats } from '../state/stats';
import type { Rarity } from './rarity';

/** Passive items bought in the shop. Most stack; `maxStacks` stops the shop offering useless copies. */
export interface ItemDef {
  id: string;
  name: string;
  desc: string;
  rarity: Rarity;
  price: number;
  /** Icon colour (pictograms are drawn in art/textures.ts as `item-<id>`). */
  color: number;
  maxStacks?: number;
  /** Weapon this item works especially well with (shown on the card). */
  synergy?: string;
  apply(s: PlayerStats): void;
}

const list: ItemDef[] = [
  // --- Common -----------------------------------------------------------------------------
  { id: 'paprika', name: 'Paprika', rarity: 'common', price: 10, color: 0xd9381e,
    desc: '+8% damage.', apply: (s) => { s.damageMult += 0.08; } },
  { id: 'espresso_mustard', name: 'Espresso Mustard', rarity: 'common', price: 10, color: 0xc89b1a,
    desc: '+8% fire rate.', apply: (s) => { s.fireRateMult += 0.08; } },
  { id: 'sesame', name: 'Sesame Seeds', rarity: 'common', price: 8, color: 0xf1e2b8, maxStacks: 8,
    desc: '+6% move speed.', apply: (s) => { s.speedMult += 0.06; } },
  { id: 'casing', name: 'Thicker Casing', rarity: 'common', price: 10, color: 0xa86b4c,
    desc: '+2 armor (less damage from every hit).', apply: (s) => { s.armor += 2; } },
  { id: 'cold_cuts', name: 'Cold Cuts', rarity: 'common', price: 10, color: 0x8fd3ff,
    desc: 'Regenerate 0.3 HP per second.', apply: (s) => { s.regenPerSec += 0.3; } },
  { id: 'ketchup_kiss', name: 'Ketchup Kiss', rarity: 'common', price: 10, color: 0xe0242c, maxStacks: 12,
    desc: '+4% chance per hit to heal 1 HP.', apply: (s) => { s.lifesteal += 0.04; } },
  { id: 'big_bun', name: 'Big Bun', rarity: 'common', price: 8, color: 0xe7b86a, maxStacks: 6,
    desc: '+40 pickup radius. Condiments heal +5.', apply: (s) => { s.pickupRadius += 40; s.condimentHeal += 5; } },
  { id: 'relish', name: 'Lucky Relish', rarity: 'common', price: 9, color: 0x6dbf3a,
    desc: '+12% crumbs from enemies.', apply: (s) => { s.crumbMult += 0.12; } },
  { id: 'hearty_meal', name: 'Hearty Meal', rarity: 'common', price: 10, color: 0xb5651d,
    desc: '+12 max HP.', apply: (s) => { s.maxHp += 12; } },

  // --- Uncommon ---------------------------------------------------------------------------
  { id: 'oven_mitt', name: 'Oven Mitt', rarity: 'uncommon', price: 15, color: 0x3c6fd1, maxStacks: 5,
    desc: '-20% dash cooldown.', apply: (s) => { s.dashCooldownMs *= 0.8; } },
  { id: 'mustard_seed', name: 'Mustard Seed', rarity: 'uncommon', price: 16, color: 0xf2c418, maxStacks: 12,
    desc: '+7% critical hit chance (double damage).', apply: (s) => { s.critChance += 0.07; } },
  { id: 'slippery_oil', name: 'Slippery Oil', rarity: 'uncommon', price: 16, color: 0xd4c26a, maxStacks: 8,
    desc: '+7% chance to dodge a hit.', apply: (s) => { s.dodge += 0.07; } },
  { id: 'double_dip', name: 'Double Dip', rarity: 'uncommon', price: 16, color: 0xb03060,
    desc: '+16% damage, -6 max HP.', apply: (s) => { s.damageMult += 0.16; s.maxHp -= 6; } },
  { id: 'pickle_juice', name: 'Pickle Juice', rarity: 'uncommon', price: 15, color: 0x7fc94a, maxStacks: 4, synergy: 'Pickle Launcher',
    desc: 'Explosions are 25% bigger.', apply: (s) => { s.explosionRadiusMult += 0.25; } },
  { id: 'smoked_ham', name: 'Smoked Ham', rarity: 'uncommon', price: 15, color: 0xc0504d,
    desc: '+25 max HP, -3% move speed.', apply: (s) => { s.maxHp += 25; s.speedMult -= 0.03; } },
  { id: 'four_leaf_relish', name: 'Four-Leaf Relish', rarity: 'uncommon', price: 14, color: 0x3fae5a, maxStacks: 6,
    desc: '+20 luck (rarer items in the shop).', apply: (s) => { s.luck += 20; } },

  // --- Rare -------------------------------------------------------------------------------
  { id: 'secret_sauce', name: 'Secret Sauce', rarity: 'rare', price: 28, color: 0xff6a3d,
    desc: '+12% damage and +10% fire rate.', apply: (s) => { s.damageMult += 0.12; s.fireRateMult += 0.1; } },
  { id: 'spiky_bun', name: 'Spiky Bun', rarity: 'rare', price: 26, color: 0xc9a25a, maxStacks: 3,
    desc: 'Enemies that touch you take 20 damage.', apply: (s) => { s.thorns += 20; } },
  { id: 'grill_apron', name: "Grill Master's Apron", rarity: 'rare', price: 26, color: 0x3a3a3a, maxStacks: 1,
    desc: 'Grill tiles no longer burn you. +3 armor.', apply: (s) => { s.grillImmune = 1; s.armor += 3; } },
  { id: 'extra_pellet', name: 'Extra Pellet', rarity: 'rare', price: 30, color: 0x555555, maxStacks: 2, synergy: 'Pepper Mill, Mustard Squirt',
    desc: '+1 pellet for spread weapons.', apply: (s) => { s.extraProjectiles += 1; } },
  { id: 'vampire_ketchup', name: 'Vampire Ketchup', rarity: 'rare', price: 30, color: 0x8b0000, maxStacks: 3,
    desc: '+10% chance per hit to heal 1 HP. +1 HP regen.', apply: (s) => { s.lifesteal += 0.1; s.regenPerSec += 1; } },

  // --- Legendary --------------------------------------------------------------------------
  { id: 'golden_sausage', name: 'Golden Sausage', rarity: 'legendary', price: 55, color: 0xffc83d,
    desc: '+25% damage, +20% fire rate, +25 max HP.', apply: (s) => { s.damageMult += 0.25; s.fireRateMult += 0.2; s.maxHp += 25; } },
  { id: 'hot_dog_cart', name: 'Hot Dog Cart', rarity: 'legendary', price: 50, color: 0xe85d2a, maxStacks: 2,
    desc: '+40% crumbs and +40 luck.', apply: (s) => { s.crumbMult += 0.4; s.luck += 40; } },
  { id: 'second_skin', name: 'Second Skin', rarity: 'legendary', price: 50, color: 0xf3a98a, maxStacks: 1,
    desc: 'Once per wave, a fatal hit leaves you at 1 HP instead.', apply: (s) => { s.extraLives += 1; } },
];

export const ITEMS: Record<string, ItemDef> = Object.fromEntries(list.map((i) => [i.id, i]));
export const ITEM_IDS = list.map((i) => i.id);

export function countOf(items: readonly string[], id: string): number {
  let n = 0;
  for (const x of items) if (x === id) n++;
  return n;
}

/** True when owning another copy would do nothing. */
export function isItemMaxed(items: readonly string[], id: string): boolean {
  const def = ITEMS[id];
  return !!def?.maxStacks && countOf(items, id) >= def.maxStacks;
}
