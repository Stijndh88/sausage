import type { PlayerStats } from '../state/stats';

/** Passive items bought in the shop. They stack. */
export interface ItemDef {
  id: string;
  name: string;
  desc: string;
  price: number;
  color: number;
  apply(s: PlayerStats): void;
}

const list: ItemDef[] = [
  {
    id: 'paprika', name: 'Paprika', desc: '+10% damage.', price: 10, color: 0xd9381e,
    apply: (s) => { s.damageMult += 0.1; },
  },
  {
    id: 'espresso_mustard', name: 'Espresso Mustard', desc: '+10% fire rate.', price: 11, color: 0xc89b1a,
    apply: (s) => { s.fireRateMult += 0.1; },
  },
  {
    id: 'sesame', name: 'Sesame Seeds', desc: '+8% move speed.', price: 8, color: 0xf1e2b8,
    apply: (s) => { s.speedMult += 0.08; },
  },
  {
    id: 'casing', name: 'Thicker Casing', desc: '-8% heat taken from hits and grills.', price: 12, color: 0xa86b4c,
    apply: (s) => { s.heatTakenMult -= 0.08; },
  },
  {
    id: 'ice_pack', name: 'Ice Pack', desc: '+0.6 cooling per second.', price: 10, color: 0x8fd3ff,
    apply: (s) => { s.coolPerSec += 0.6; },
  },
  {
    id: 'ketchup_kiss', name: 'Ketchup Kiss', desc: '10% chance on kill to cool 2 heat.', price: 12, color: 0xe0242c,
    apply: (s) => { s.killCoolChance += 0.1; },
  },
  {
    id: 'big_bun', name: 'Big Bun', desc: '+35 pickup radius.', price: 7, color: 0xe7b86a,
    apply: (s) => { s.pickupRadius += 35; },
  },
  {
    id: 'relish', name: 'Lucky Relish', desc: '+15% crumbs from enemies.', price: 9, color: 0x6dbf3a,
    apply: (s) => { s.crumbMult += 0.15; },
  },
  {
    id: 'smoky', name: 'Smoky Flavor', desc: '+25% damage while Well-done or hotter, but +5% heat taken.', price: 13, color: 0x6b5a4e,
    apply: (s) => { s.hotDamageBonus += 0.25; s.heatTakenMult += 0.05; },
  },
  {
    id: 'oven_mitt', name: 'Oven Mitt', desc: '-20% dash cooldown.', price: 9, color: 0x3c6fd1,
    apply: (s) => { s.dashCooldownMs *= 0.8; },
  },
];

export const ITEMS: Record<string, ItemDef> = Object.fromEntries(list.map((i) => [i.id, i]));
export const ITEM_IDS = list.map((i) => i.id);
