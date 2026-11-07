import { ITEMS, ITEM_IDS, isItemMaxed } from '../data/items';
import { SPICY_MENUS, type MenuId } from '../data/menus';
import { mulberry32 } from '../systems/rng';
import type { RunState } from './run';

/** Bag at least this big when you push on counts for the "Doggy Bag Gambler" recipe. */
export const BIG_PUSH = 300;

/** Three items for the "seconds" reward: Rares first, topped up from other rarities. */
export function secondsItems(run: Pick<RunState, 'seed' | 'wave' | 'items'>): string[] {
  const rng = mulberry32((run.seed ^ (run.wave * 92821)) >>> 0);
  const pick = (rarity: string) => ITEM_IDS.filter((id) => ITEMS[id].rarity === rarity && !isItemMaxed(run.items, id));
  const out: string[] = [];
  for (const rarity of ['rare', 'legendary', 'uncommon', 'common']) {
    const pool = pick(rarity).filter((id) => !out.includes(id));
    while (pool.length && out.length < 3) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
    if (out.length >= 3) break;
  }
  return out;
}

/** The menu choice offered when pushing on: one spicy menu against the Light Lunch. */
export function menuOptions(run: Pick<RunState, 'seed' | 'wave'>): MenuId[] {
  const rng = mulberry32((run.seed ^ (run.wave * 15485863)) >>> 0);
  return [SPICY_MENUS[Math.floor(rng() * SPICY_MENUS.length)], 'light_lunch'];
}

