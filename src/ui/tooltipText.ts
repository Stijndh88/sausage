import type { ItemDef } from '../data/items';
import { RARITIES } from '../data/rarity';
import { MAX_TIER, tierLabel, tierPierce, type WeaponDef } from '../data/weapons';
import { weaponStatLine } from '../systems/statText';
import { STACKS, STACK_THRESHOLDS, stackLevel, stackStepText } from '../data/stacks';

/** What a tooltip says: a title, a small coloured subtitle and a few lines. No Phaser, so it's unit-tested. */
export interface TooltipContent {
  title: string;
  subtitle: string;
  /** CSS colour for the subtitle and the frame. */
  color: string;
  lines: string[];
}

const css = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

const KIND_TEXT: Record<WeaponDef['kind'], string> = {
  single: 'Single shot',
  cone: 'Cone spray',
  shotgun: 'Spread shot',
  pierce: 'Piercing shot',
  lob: 'Lobbed, explodes',
  boomerang: 'Flies out and back',
};

/**
 * A link (weapon) at a tier: what it does, its numbers now, what the next tier adds, and its stack
 * bonuses (`copies` = links holding this weapon; 0 lists the bonuses without marking any active).
 */
export function weaponTooltip(def: WeaponDef, tier: number, copies = 0): TooltipContent {
  const lines = [def.desc, weaponStatLine(def, tier)];
  if (def.range) lines.push(`Range ${def.range}${tierPierce(def, tier) > 0 ? ` · pierces ${tierPierce(def, tier)}` : ''}`);
  if (def.poisonDps) lines.push(`Poison ${def.poisonDps} damage/s per stack`);
  if (def.explodeRadius) lines.push(`Blast radius ${def.explodeRadius}`);
  if (tier < MAX_TIER) lines.push(`Next tier: ${weaponStatLine(def, tier + 1, tier)}`);
  else lines.push('Max tier');
  const lvl = stackLevel(copies);
  if (copies > 0) lines.push(`Links with ${def.name}: ${copies}`);
  STACK_THRESHOLDS.forEach((at, k) => {
    lines.push(`${copies > 0 ? (k < lvl ? '✓' : '·') : '·'} ${at} links: ${stackStepText(def.id, STACKS[def.id][k])}`);
  });
  return { title: `${def.name} ${tierLabel(tier)}`, subtitle: `LINK · ${KIND_TEXT[def.kind].toUpperCase()}`, color: css(def.color), lines };
}

/** An item: what it does, how many you have (and the cap), and what it pairs with. */
export function itemTooltip(item: ItemDef, count: number): TooltipContent {
  const r = RARITIES[item.rarity];
  const lines = [item.desc];
  if (count > 0) lines.push(item.maxStacks ? `You have ${count} of max ${item.maxStacks}` : `You have ${count}`);
  else if (item.maxStacks) lines.push(`Stacks up to ${item.maxStacks}`);
  else lines.push('Stacks without limit');
  if (item.synergy) lines.push(`Pairs with ${item.synergy}`);
  return { title: item.name, subtitle: `${r.label.toUpperCase()} ITEM`, color: r.css, lines };
}
