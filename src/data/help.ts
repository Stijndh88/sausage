import { ITEMS, ITEM_IDS } from './items';
import { RARITIES } from './rarity';
import { WEAPONS, WEAPON_IDS, MAX_TIER } from './weapons';
import {
  BASKET_OPEN_SEC, BOUNTY_SEC, ELITE_HP_MULT, EVENTS, GOLDEN_LIFETIME_SEC, HAPPY_HOUR_SEC, type EventKind,
} from './events';
import { BAIL_KEEP, DEATH_KEEP_AFTER_PUSH, DEATH_KEEP_BEFORE_PUSH, ESCAPE_BONUS, EVENT_SPICE } from '../state/meta';
import type { SaveData } from '../state/save';
import { chiliUnlocked } from '../state/save';
import { itemTooltip, weaponTooltip } from '../ui/tooltipText';

/**
 * The How to Play screen. Every entry says when the player has "met" it; the screen lists only
 * those, so it never spoils items, links or events you haven't run into yet. Things you meet in
 * your first minute (moving, the shop, crumbs) are always known.
 *
 * When a mechanic changes, change its text here.
 */
export type HelpSection = 'basics' | 'shop' | 'events' | 'runs' | 'links' | 'items';

export const HELP_SECTIONS: { id: HelpSection; name: string }[] = [
  { id: 'basics', name: 'Basics' },
  { id: 'shop', name: 'Shop & stats' },
  { id: 'events', name: 'Events' },
  { id: 'runs', name: 'Runs & Spice' },
  { id: 'links', name: 'Links' },
  { id: 'items', name: 'Items' },
];

export interface HelpEntry {
  id: string;
  section: HelpSection;
  title: string;
  body: string;
  /** Accent colour (events, rarities, weapons). */
  color?: number;
  /** Texture shown next to the title, if any. */
  icon?: string;
  /** Has the player met this? Missing = always known. */
  known?: (save: SaveData) => boolean;
}

const seen = (id: string) => (save: SaveData) => save.seen.includes(id);
const pct = (v: number) => `${Math.round(v * 100)}%`;
/** Something you get to after your first run, for saves made before the How to Play screen existed. */
const afterFirstRun = (id: string) => (save: SaveData) => save.seen.includes(id) || save.runs > 0;

const BASICS: HelpEntry[] = [
  {
    id: 'mech:head', section: 'basics', title: 'Your sausage',
    body: 'You steer the head; the links follow behind it. Only the head can be hit, so enemies, bullets and hazards only hurt you when they touch the head. Your links are safe to drag through anything.',
  },
  {
    id: 'mech:links', section: 'basics', title: 'Links fire on their own',
    body: 'Every link carries a weapon. Weapons aim and fire at the nearest enemy in range by themselves: you just move. More links means more weapons.',
  },
  {
    id: 'mech:dash', section: 'basics', title: 'Dash',
    body: 'A quick burst of speed. While dashing you cannot be hit, so you can dash straight through bullets and enemies. The ring on the HUD shows when it is ready again. Oven Mitts make it recharge faster.',
  },
  {
    id: 'mech:waves', section: 'basics', title: 'Waves',
    body: 'Survive until the timer at the top runs out. When it does, the wave is cleared, every enemy is swept away and you go to the shop. You heal to full before every wave.',
  },
  {
    id: 'mech:crumbs', section: 'basics', title: 'Crumbs',
    body: 'Enemies drop crumbs. Walk near them to pick them up (Big Bun pulls them in from further away). Crumbs are spent in the shop and are gone at the end of the run.',
  },
  {
    id: 'mech:condiment', section: 'basics', title: 'Condiments',
    body: 'Now and then an enemy drops a condiment. Picking it up heals you a little.',
  },
  {
    id: 'mech:grill', section: 'basics', title: 'Hot grill tiles',
    body: 'Glowing tiles on the grill burn you while you stand on them, and armor does not help. Keep moving. The Grill Master\'s Apron makes you immune.',
  },
  {
    id: 'mech:boss', section: 'basics', title: 'Bosses',
    body: 'The last wave of every course is a boss with no timer: the wave ends when the boss goes down. Below half health it gets angry and attacks faster. Beating it drops a trophy into your doggy bag.',
    known: (s) => s.seen.includes('mech:boss') || (s.counters.bossKills ?? 0) > 0,
  },
  {
    id: 'mech:poison', section: 'basics', title: 'Poison',
    body: 'Mustard poisons what it hits: the enemy keeps taking damage for 4 seconds. Poison is slow but stacks: up to 3 doses add up on one enemy. It does not spread.',
    known: seen('weapon:mustard'),
  },
  {
    id: 'mech:burn', section: 'basics', title: 'Fire',
    body: 'A burning enemy takes heavy damage for 2 seconds. Fire does not stack: a new flame only refreshes the old one. When a burning enemy dies, the fire jumps to the enemies around it.',
    known: seen('mech:burn'),
  },
  {
    id: 'mech:explosions', section: 'basics', title: 'Explosions',
    body: 'Pickles explode where they land and hurt everything in the blast. Pickle Juice makes the blast bigger.',
    known: seen('weapon:pickle'),
  },
  {
    id: 'mech:pierce', section: 'basics', title: 'Piercing',
    body: 'A piercing shot keeps flying through enemies instead of stopping at the first one. Sharp Cheddar adds one more enemy per shot.',
    known: (s) => s.seen.includes('weapon:skewer') || s.seen.includes('item:sharp_cheddar'),
  },
];

const SHOP: HelpEntry[] = [
  {
    id: 'shop:buy', section: 'shop', title: 'The shop',
    body: 'Between waves you spend crumbs on links (weapons) and items. Each card shows exactly what buying it would change for you right now. Hover over (or select) your links and items at the bottom to see what they do.',
  },
  {
    id: 'shop:upgrade', section: 'shop', title: 'New link or upgrade',
    body: `Any link can hold any weapon. Buying a weapon you already carry adds another link with it by default. Flip the card to Upgrade (▲▼, the D-pad, or tap) to raise one copy a tier instead: more damage and faster shots, up to tier ${['I', 'II', 'III', 'IV'][MAX_TIER - 1]}. Spread weapons also get more pellets.`,
  },
  {
    id: 'shop:stacks', section: 'shop', title: 'Stack bonuses',
    body: 'Carry the same weapon on 2, 4 or 6 links to unlock its stack bonuses. They add up and boost every copy. A shop card shows the next bonus it would reach, and a link\'s tooltip lists all three.',
  },
  {
    id: 'shop:reroll', section: 'shop', title: 'Reroll',
    body: 'Swaps the cards for new ones. It gets a bit pricier every time you use it in the same shop.',
  },
  {
    id: 'shop:keep', section: 'shop', title: 'Keep',
    body: 'Keep a card to hold it for the next shop (it stays put when you reroll, too). Handy when you can\'t afford it yet.',
  },
  {
    id: 'shop:rarity', section: 'shop', title: 'Rarity',
    body: `Items come in ${Object.values(RARITIES).map((r) => r.label).join(', ')}. The frame colour shows the rarity. Rarer items show up more as the run goes on, and more often with high Luck.`,
  },
  { id: 'stat:armor', section: 'shop', title: 'Armor', body: 'Takes a share off every hit: 5 armor is 25% less damage, 15 is 50% less. It never blocks a hit completely.' },
  { id: 'stat:dodge', section: 'shop', title: 'Dodge', body: 'The chance to ignore a hit completely.' },
  { id: 'stat:regen', section: 'shop', title: 'Regen', body: 'HP healed every second, all the time.' },
  { id: 'stat:lifesteal', section: 'shop', title: 'Lifesteal', body: 'The chance for each hit you land to heal you 1 HP. Fast weapons get the most out of it.' },
  { id: 'stat:crit', section: 'shop', title: 'Crit', body: 'The chance for a hit to do double damage.' },
  { id: 'stat:luck', section: 'shop', title: 'Luck', body: 'Makes rarer items show up in the shop more often.' },
  { id: 'stat:thorns', section: 'shop', title: 'Thorns', body: 'Damage dealt to every enemy that touches you.', known: seen('item:spiky_bun') },
];

/** One line per event, with the numbers that matter. */
const EVENT_TEXT: Record<EventKind, string> = {
  basket: `A picnic basket lands somewhere in the arena. Stand inside its circle for ${BASKET_OPEN_SEC} seconds to open it: a free item and a few crumbs. Leaving the circle drains the progress, and the basket disappears if you take too long.`,
  golden: `A golden hot dog runs around the arena for ${GOLDEN_LIFETIME_SEC} seconds and runs away from you. Touch it with your head to catch it for a pile of crumbs. A dash helps you close the gap.`,
  happy: `For ${HAPPY_HOUR_SEC} seconds every enemy drops double crumbs and your links fire 30% faster. Nothing to do but enjoy it.`,
  bounty: `The chef wants a number of kills within ${BOUNTY_SEC} seconds (less if the wave is nearly over: the bounty always ends before the wave does, and asks for fewer kills). The counter at the top shows how many you have. Make it in time for a crumb bonus; miss it and nothing happens.`,
  elite: `A big glowing enemy with ${ELITE_HP_MULT}× the usual health. Killing it drops a pile of crumbs and a condiment.`,
  stampede: 'Arrows flash on one side of the arena, then a wall of forks charges across. Get to the gap in the line, or dash through the forks.',
  flare: 'Lanes of the grill light up, then burn for a few seconds. Get out of the marked lanes before they catch fire.',
  rain: 'Shadows appear on the ground and sauce splats down on them a moment later. Stay out of the shadows.',
};

const EVENT_ENTRIES: HelpEntry[] = [
  {
    id: 'event:about', section: 'events', title: 'About events',
    body: `Events happen at set times during a wave. The track under the timer shows what is coming and when. Winning one (opening the basket, catching the hot dog, meeting the bounty, killing the elite, or getting through a hazard without a hit) also puts ${EVENT_SPICE} Spice in your doggy bag.`,
    known: (s) => s.seen.some((id) => id.startsWith('event:')),
  },
  ...(Object.keys(EVENTS) as EventKind[]).map((k): HelpEntry => ({
    id: `event:${k}`, section: 'events', title: titleCase(EVENTS[k].name), body: EVENT_TEXT[k], color: EVENTS[k].color, known: seen(`event:${k}`),
  })),
];

const RUNS: HelpEntry[] = [
  {
    id: 'run:spice', section: 'runs', title: 'Spice and the doggy bag',
    body: 'Kills, cleared waves, won events and bosses put Spice into your doggy bag. It is not yours until the run ends. Banked Spice buys new sausages and Spice Rack upgrades between runs.',
  },
  {
    id: 'run:keep', section: 'runs', title: 'How much you keep',
    body: `Take it home after a boss: all of it, plus a ${pct(ESCAPE_BONUS)} bonus. Bail out from the pause menu: ${pct(BAIL_KEEP)}. Die before going for seconds: ${pct(DEATH_KEEP_BEFORE_PUSH)}. Die after going for seconds: only ${pct(DEATH_KEEP_AFTER_PUSH)}.`,
  },
  {
    id: 'mech:seconds', section: 'runs', title: 'Going for seconds',
    body: 'After a boss you choose: take the doggy bag home now, or push on to the next course. The next course is harder but pays more Spice per kill. If you push on and die, you keep much less of the bag.',
    known: (s) => s.seen.includes('mech:seconds') || (s.counters.bossKills ?? 0) > 0,
  },
  {
    id: 'mech:menus', section: 'runs', title: 'Menus',
    body: 'When you go for seconds you pick how the next course is served. The Light Lunch changes nothing; a spicy menu adds a twist (faster enemies, pricier shop, ...) but pays more Spice for that course.',
    known: seen('mech:menus'),
  },
  {
    id: 'mech:trophies', section: 'runs', title: 'Trophies',
    body: 'Every boss drops a trophy into the bag. Take it home to keep it: trophies pay for the best sausages and Spice Rack upgrades. Die and it is gone.',
    known: (s) => s.seen.includes('mech:boss') || (s.counters.bossKills ?? 0) > 0,
  },
  {
    id: 'mech:cookbook', section: 'runs', title: 'The Cookbook',
    body: 'Recipes are goals that carry over between runs (kill so many forks, catch so many hot dogs, ...). Cooking one pays Spice and can unlock new sausages, weapons or rarer items. Check it from the main menu.',
    known: afterFirstRun('mech:cookbook'),
  },
  {
    id: 'mech:rack', section: 'runs', title: 'The Spice Rack',
    body: 'Permanent upgrades bought with banked Spice. You can refund them for free and try something else.',
    known: afterFirstRun('mech:rack'),
  },
  {
    id: 'mech:chili', section: 'runs', title: 'Chili levels',
    body: 'Optional extra difficulty, picked per sausage on the Pick Your Sausage screen. Every level makes runs harder and pays more Spice. Taking a sausage home from the Smokehouse on its highest level unlocks the next level.',
    known: (s) => chiliUnlocked(s),
  },
];

const LINKS: HelpEntry[] = WEAPON_IDS.map((id): HelpEntry => {
  const t = weaponTooltip(WEAPONS[id], 1);
  return { id: `weapon:${id}`, section: 'links', title: WEAPONS[id].name, body: t.lines.join('\n'), color: WEAPONS[id].color, icon: WEAPONS[id].icon, known: seen(`weapon:${id}`) };
});

const ITEM_ENTRIES: HelpEntry[] = ITEM_IDS.map((id): HelpEntry => {
  const t = itemTooltip(ITEMS[id], 0);
  return { id: `item:${id}`, section: 'items', title: ITEMS[id].name, body: t.lines.join('\n'), color: RARITIES[ITEMS[id].rarity].color, known: seen(`item:${id}`) };
});

export const HELP: readonly HelpEntry[] = [...BASICS, ...SHOP, ...EVENT_ENTRIES, ...RUNS, ...LINKS, ...ITEM_ENTRIES];

export function isKnown(e: HelpEntry, save: SaveData): boolean {
  return e.known ? e.known(save) : true;
}

/** What the How to Play screen shows for a section: the entries you know, and how many are still hidden. */
export function helpFor(section: HelpSection, save: SaveData): { entries: HelpEntry[]; hidden: number } {
  const all = HELP.filter((e) => e.section === section);
  const entries = all.filter((e) => isKnown(e, save));
  return { entries, hidden: all.length - entries.length };
}

function titleCase(s: string): string {
  return s.toLowerCase().replace(/(^|[\s-])(\S)/g, (_, a: string, b: string) => a + b.toUpperCase()).replace("Chef'S", "Chef's");
}
