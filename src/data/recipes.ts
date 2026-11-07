import type { SausageId } from './sausages';
import type { WeaponId } from './weapons';
import type { Rarity } from './rarity';

/**
 * The Cookbook: achievements ("recipes") that pay Spice and unlock things.
 * Progress comes from counters kept in the save. Counters are tallied during a run and added
 * to the save when the run ends, whether you escaped, bailed out or died.
 */
export type CounterId =
  // Summed over all runs.
  | 'kills' | 'crits' | 'dashes' | 'healed' | 'poisonKills' | 'bossKills' | 'hitlessWaves' | 'hitlessBosses'
  | 'escapes' | 'pushes' | 'bigPushes' | 'lowHpEscapes' | 'closeBails' | 'runs' | 'deaths' | 'grillDeaths'
  | 'crumbsEarned' | 'rerolls' | 'legendaries' | 'tier4' | 'trophies' | 'smokeyKills'
  // Best in a single run.
  | 'bestCourseReached' | 'bestEscape' | 'killBurst' | 'maxLinks' | 'peakBag' | 'chiliEscape';

/** Counters that keep the best single-run value instead of a running total. */
export const MAX_COUNTERS: ReadonlySet<CounterId> = new Set<CounterId>([
  'bestCourseReached', 'bestEscape', 'killBurst', 'maxLinks', 'peakBag', 'chiliEscape',
]);

export type Counters = Partial<Record<CounterId, number>>;

export type Reward =
  | { kind: 'none' }
  | { kind: 'sausage'; sausage: SausageId }
  | { kind: 'weapon'; weapon: WeaponId }
  | { kind: 'rarity'; rarity: Rarity }
  | { kind: 'talent'; talent: string }
  | { kind: 'chili' };

export interface RecipeDef {
  id: string;
  name: string;
  /** What to do, with the goal in it. */
  desc: string;
  counter: CounterId;
  goal: number;
  spice: number;
  reward: Reward;
  /** Hidden as "???" until cooked. */
  secret?: boolean;
}

const r = (id: string, name: string, desc: string, counter: CounterId, goal: number, spice: number, reward: Reward = { kind: 'none' }, secret = false): RecipeDef =>
  ({ id, name, desc, counter, goal, spice, reward, secret });

const list: RecipeDef[] = [
  // Progress
  r('beat_tongs', 'Tong-Tied', 'Beat the Grill Master\'s Tongs', 'bossKills', 1, 30, { kind: 'rarity', rarity: 'rare' }),
  r('escape_backyard', 'Takeaway', 'Take it home after the Backyard', 'bestEscape', 1, 30, { kind: 'sausage', sausage: 'bratwurst' }),
  r('reach_kitchen', 'Back of House', 'Reach the Kitchen', 'bestCourseReached', 1, 40, { kind: 'weapon', weapon: 'pickle' }),
  r('escape_kitchen', 'Kitchen Porter', 'Take it home after the Kitchen', 'bestEscape', 2, 80, { kind: 'rarity', rarity: 'legendary' }),
  r('reach_smokehouse', 'Where There\'s Smoke', 'Reach the Smokehouse', 'bestCourseReached', 2, 80),
  r('beat_smokey', 'Smoke Signals', 'Beat Big Smokey', 'smokeyKills', 1, 100),
  r('escape_smokehouse', 'Full Course', 'Take it home after the Smokehouse', 'bestEscape', 3, 150, { kind: 'chili' }),
  r('reach_seconds', 'Seconds, Please', 'Reach Seconds', 'bestCourseReached', 3, 200),
  r('seconds_deep', 'Bottomless', 'Reach Seconds #3', 'bestCourseReached', 5, 400),
  // Sausage deeds
  r('crits_300', 'Spicy Hands', 'Land 300 crits', 'crits', 300, 30, { kind: 'sausage', sausage: 'chorizo' }),
  r('crits_3000', 'Hot Streak', 'Land 3,000 crits', 'crits', 3000, 120),
  r('dash_500', 'Fast Food', 'Dash 500 times', 'dashes', 500, 30, { kind: 'sausage', sausage: 'hotdog' }),
  r('dash_5000', 'Drive-Thru', 'Dash 5,000 times', 'dashes', 5000, 120),
  r('heal_1000', 'Comfort Food', 'Heal 1,000 HP', 'healed', 1000, 40, { kind: 'sausage', sausage: 'veggie' }),
  r('heal_10000', 'Bone Broth', 'Heal 10,000 HP', 'healed', 10000, 150),
  // Weapons and builds
  r('kills_100', 'Amuse-Bouche', 'Bend 100 utensils', 'kills', 100, 20),
  r('kills_1000', 'Skewered Back', 'Bend 1,000 utensils', 'kills', 1000, 50, { kind: 'weapon', weapon: 'skewer' }),
  r('kills_5000', 'Utensil Drawer', 'Bend 5,000 utensils', 'kills', 5000, 150),
  r('kills_20000', 'Cutlery Crisis', 'Bend 20,000 utensils', 'kills', 20000, 400),
  r('poison_500', 'Off Flavour', 'Finish 500 enemies with poison or fire', 'poisonKills', 500, 60),
  r('links_6', 'Long Boi', 'Have 6 links at once', 'maxLinks', 6, 40),
  r('tier4', 'Well Done', 'Upgrade a weapon to tier IV', 'tier4', 1, 40),
  r('legendary', 'Chef\'s Kiss', 'Buy a Legendary item', 'legendaries', 1, 50),
  r('crumbs_2000', 'Crumb Collector', 'Earn 2,000 crumbs', 'crumbsEarned', 2000, 50),
  r('rerolls_100', 'Picky Eater', 'Reroll the shop 100 times', 'rerolls', 100, 40),
  // Combat
  r('hitless_wave', 'Not a Scratch', 'Clear a wave without getting hit', 'hitlessWaves', 1, 20),
  r('hitless_10', 'Untouchable', 'Clear 10 waves without getting hit', 'hitlessWaves', 10, 80),
  r('hitless_boss', 'Clean Plate', 'Beat a boss without getting hit', 'hitlessBosses', 1, 150),
  r('burst_50', 'Buffet Rush', 'Bend 50 utensils within 10 seconds', 'killBurst', 50, 60),
  // Risk
  r('big_push', 'Doggy Bag Gambler', 'Push on with 300+ Spice in the bag', 'bigPushes', 1, 50, { kind: 'talent', talent: 'lunchbox' }),
  r('push_10', 'Second Helpings', 'Push on 10 times', 'pushes', 10, 80),
  r('peak_bag_1000', 'Overstuffed', 'Carry 1,000 Spice in the bag at once', 'peakBag', 1000, 150),
  r('low_escape', 'By a Hair', 'Take it home with under 10 HP', 'lowHpEscapes', 1, 80),
  r('trophies_10', 'Trophy Cabinet', 'Bring home 10 trophies', 'trophies', 10, 100),
  r('chili_1', 'Feeling the Heat', 'Take it home after the Smokehouse on Chili 1', 'chiliEscape', 1, 100),
  r('chili_5', 'Ghost Pepper', 'Take it home after the Smokehouse on Chili 5', 'chiliEscape', 5, 500),
  // Habit
  r('runs_10', 'Regular', 'Play 10 runs', 'runs', 10, 30),
  r('runs_50', 'Part of the Family', 'Play 50 runs', 'runs', 50, 100),
  // Secrets
  r('grill_death', 'Charred', 'Get burned to a crisp on a grill tile', 'grillDeaths', 1, 20, { kind: 'none' }, true),
  r('deaths_25', 'Overcooked', 'Get skewered 25 times', 'deaths', 25, 50, { kind: 'none' }, true),
  r('close_bail', 'Cold Feet', 'Bail out with under 10 HP', 'closeBails', 1, 40, { kind: 'none' }, true),
];

export const RECIPES: Record<string, RecipeDef> = Object.fromEntries(list.map((x) => [x.id, x]));
export const RECIPE_IDS = list.map((x) => x.id);

/** Weapons in the shop pool from the start. The others come from recipes. */
export const STARTER_WEAPONS: readonly WeaponId[] = ['toothpick', 'mustard', 'pepper', 'onion'];

export function recipeProgress(counters: Counters, id: string): number {
  return counters[RECIPES[id].counter] ?? 0;
}

export function isCooked(counters: Counters, id: string): boolean {
  return recipeProgress(counters, id) >= RECIPES[id].goal;
}

/** Recipes whose goal is met by these counters, in Cookbook order. */
export function cookedBy(counters: Counters): string[] {
  return RECIPE_IDS.filter((id) => isCooked(counters, id));
}

/** Merges a run's tally into lifetime counters (sum, or max for MAX_COUNTERS). */
export function mergeCounters(lifetime: Counters, run: Counters): Counters {
  const out: Counters = { ...lifetime };
  for (const [k, v] of Object.entries(run) as [CounterId, number][]) {
    if (!v) continue;
    out[k] = MAX_COUNTERS.has(k) ? Math.max(out[k] ?? 0, v) : (out[k] ?? 0) + v;
  }
  return out;
}

export function rewardText(rw: Reward): string {
  switch (rw.kind) {
    case 'none': return '';
    case 'sausage': return 'unlocks a sausage';
    case 'weapon': return 'unlocks a weapon';
    case 'rarity': return rw.rarity === 'rare' ? 'unlocks Rare items' : 'unlocks Legendary items';
    case 'talent': return 'unlocks a talent';
    case 'chili': return 'unlocks Chili levels';
  }
}
