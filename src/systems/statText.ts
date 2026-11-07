import { tierCooldown, tierDamage, tierProjectiles, type WeaponDef } from '../data/weapons';
import type { PlayerStats } from '../state/stats';

type Format = 'int' | 'pct' | 'mult' | 'sec' | 'perSec' | 'bool' | 'plus';

const STATS: [keyof PlayerStats, string, Format][] = [
  ['maxHp', 'Max HP', 'int'],
  ['armor', 'Armor', 'int'],
  ['regenPerSec', 'Regen', 'perSec'],
  ['lifesteal', 'Lifesteal', 'pct'],
  ['dodge', 'Dodge', 'pct'],
  ['damageMult', 'Damage', 'mult'],
  ['fireRateMult', 'Fire rate', 'mult'],
  ['speedMult', 'Speed', 'mult'],
  ['critChance', 'Crit', 'pct'],
  ['luck', 'Luck', 'int'],
  ['pickupRadius', 'Pickup range', 'int'],
  ['crumbMult', 'Crumbs', 'mult'],
  ['dashCooldownMs', 'Dash cooldown', 'sec'],
  ['explosionRadiusMult', 'Explosion size', 'mult'],
  ['extraProjectiles', 'Spread pellets', 'plus'],
  ['pierce', 'Pierce', 'plus'],
  ['thorns', 'Thorns', 'int'],
  ['grillImmune', 'Grill-proof', 'bool'],
  ['extraLives', 'Second Skin', 'int'],
  ['condimentHeal', 'Condiment heal', 'int'],
];

function fmt(v: number, f: Format): string {
  switch (f) {
    case 'int': return String(Math.round(v));
    case 'pct': return `${Math.round(v * 100)}%`;
    case 'mult': return `${Math.round(v * 100)}%`;
    case 'sec': return `${(v / 1000).toFixed(2)}s`;
    case 'perSec': return `${v.toFixed(1)}/s`;
    case 'bool': return v > 0 ? 'yes' : 'no';
    case 'plus': return `+${Math.round(v)}`;
  }
}

/** Lines like "Damage 116% → 124%" for every stat that differs between two stat sets. */
export function statChanges(before: PlayerStats, after: PlayerStats): string[] {
  const out: string[] = [];
  for (const [k, label, f] of STATS) {
    if (Math.abs(after[k] - before[k]) < 1e-9) continue;
    out.push(`${label} ${fmt(before[k], f)} → ${fmt(after[k], f)}`);
  }
  return out;
}

/** "DMG 7 · every 0.40s" for a new link, or "DMG 7 → 10.5 · every 0.40s → 0.36s" for an upgrade. */
export function weaponStatLine(def: WeaponDef, tier: number, fromTier?: number): string {
  const dmg = (t: number) => trim(tierDamage(def, t));
  const cd = (t: number) => `${(tierCooldown(def, t) / 1000).toFixed(2)}s`;
  const proj = (t: number) => tierProjectiles(def, t);
  const parts: string[] = [];
  const pair = (a: string, b: string) => (fromTier !== undefined && a !== b ? `${a} → ${b}` : b);
  parts.push(`DMG ${pair(dmg(fromTier ?? tier), dmg(tier))}`);
  parts.push(`every ${pair(cd(fromTier ?? tier), cd(tier))}`);
  const noun = def.kind === 'boomerang' ? 'rings' : 'shots';
  if (proj(tier) > 1) parts.push(`${pair(String(proj(fromTier ?? tier)), String(proj(tier)))} ${noun}`);
  return parts.join(' · ');
}

function trim(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
