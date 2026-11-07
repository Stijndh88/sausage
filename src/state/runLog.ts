import { WEAPONS, type WeaponId } from '../data/weapons';
import type { WeaponSlot } from './run';

/**
 * Everything one run did, in numbers: who dealt the damage, what hurt you, where the crumbs went,
 * and how each wave went. The end-of-run stats screen reads it, and so does the play-data record
 * (state/telemetry.ts). Pure data, so it survives scene changes as part of RunState.
 */

/** Damage source keys: `L<slot>` for a link (0 = the first link), or one of these. */
export type OtherSource = 'thorns' | 'burn' | 'critBurn' | 'other';
export type SourceKey = `L${number}` | OtherSource;

export const linkSource = (slot: number): SourceKey => `L${slot}`;

/** Display names for the sources that aren't links. */
export const OTHER_SOURCE_NAMES: Record<OtherSource, string> = {
  thorns: 'Spiky Bun (thorns)',
  burn: 'Merguez fire',
  critBurn: 'Extra Spicy (crit fire)',
  other: 'Other',
};

export interface LinkLog {
  weapon: WeaponId;
  tier: number;
  /** All damage, direct hits plus damage over time (capped at the enemy's remaining HP). */
  damage: number;
  /** The part of `damage` dealt by poison it applied. */
  dot: number;
  kills: number;
  crits: number;
  /** Seconds of fighting this link was on the sausage: its DPS is damage / activeSec. */
  activeSec: number;
}

export interface SourceLog {
  damage: number;
  kills: number;
}

export type WaveOutcome = 'cleared' | 'boss' | 'died' | 'left';

export interface WaveLog {
  wave: number;
  course: number;
  boss: boolean;
  outcome: WaveOutcome;
  sec: number;
  kills: number;
  dealt: number;
  taken: number;
  crumbs: number;
  hpLeft: number;
  maxHp: number;
  /** Average frames per second (real time) and frames slower than 50 ms: performance trouble. */
  fps: number;
  slowFrames: number;
}

export interface RunLog {
  links: LinkLog[];
  other: Partial<Record<OtherSource, SourceLog>>;
  /** Damage you took, by what dealt it (enemy names, "Grill tile", event names). */
  taken: Record<string, number>;
  hitsTaken: number;
  dodges: number;
  /** Hits soaked by the Corn Dog shell or the Smoked shield. */
  blocked: number;
  healed: number;
  crumbs: {
    /** Picked up off the floor during waves. */
    picked: number;
    /** Swept up at half value when a wave ends. */
    swept: number;
    spentWeapons: number;
    spentItems: number;
    spentRerolls: number;
  };
  bought: { weapons: number; items: number; rerolls: number };
  waves: WaveLog[];
}

export function newRunLog(weapons: readonly WeaponSlot[] = []): RunLog {
  const log: RunLog = {
    links: [],
    other: {},
    taken: {},
    hitsTaken: 0,
    dodges: 0,
    blocked: 0,
    healed: 0,
    crumbs: { picked: 0, swept: 0, spentWeapons: 0, spentItems: 0, spentRerolls: 0 },
    bought: { weapons: 0, items: 0, rerolls: 0 },
    waves: [],
  };
  syncLinks(log, weapons);
  return log;
}

/** Makes sure every link has an entry and its weapon/tier are current (call when links change). */
export function syncLinks(log: RunLog, weapons: readonly WeaponSlot[]): void {
  weapons.forEach((w, i) => {
    const l = log.links[i];
    if (!l || l.weapon !== w.id) {
      log.links[i] = { weapon: w.id, tier: w.tier, damage: 0, dot: 0, kills: 0, crits: 0, activeSec: 0 };
    } else {
      l.tier = w.tier;
    }
  });
}

function linkIndex(src: SourceKey): number {
  return src.startsWith('L') ? Number(src.slice(1)) : -1;
}

function otherLog(log: RunLog, src: OtherSource): SourceLog {
  return (log.other[src] ??= { damage: 0, kills: 0 });
}

/** Damage an enemy actually lost (overkill already removed by the caller). */
export function logDamage(log: RunLog, src: SourceKey, amount: number, opts: { dot?: boolean; crit?: boolean } = {}): void {
  if (!(amount > 0)) return;
  const i = linkIndex(src);
  const link = i >= 0 ? log.links[i] : undefined;
  if (link) {
    link.damage += amount;
    if (opts.dot) link.dot += amount;
    if (opts.crit) link.crits++;
    return;
  }
  otherLog(log, i >= 0 ? 'other' : (src as OtherSource)).damage += amount;
}

export function logKill(log: RunLog, src: SourceKey): void {
  const i = linkIndex(src);
  const link = i >= 0 ? log.links[i] : undefined;
  if (link) link.kills++;
  else otherLog(log, i >= 0 ? 'other' : (src as OtherSource)).kills++;
}

export function logTaken(log: RunLog, source: string, amount: number): void {
  if (!(amount > 0)) return;
  log.taken[source] = (log.taken[source] ?? 0) + amount;
}

/** Fighting time for the links you have now. */
export function tickLinks(log: RunLog, linkCount: number, dt: number): void {
  for (let i = 0; i < linkCount; i++) {
    const l = log.links[i];
    if (l) l.activeSec += dt;
  }
}

export function totalDealt(log: RunLog): number {
  let sum = 0;
  for (const l of log.links) sum += l.damage;
  for (const o of Object.values(log.other)) sum += o?.damage ?? 0;
  return sum;
}

export function totalTaken(log: RunLog): number {
  let sum = 0;
  for (const v of Object.values(log.taken)) sum += v;
  return sum;
}

export interface DamageRow {
  name: string;
  /** Weapon colour for links, a neutral colour for the rest. */
  color: number;
  /** 1-based link number, or 0 for other sources. */
  link: number;
  tier: number;
  damage: number;
  dot: number;
  kills: number;
  dps: number;
  /** Share of the run's damage, 0-1. */
  share: number;
}

/** One row per link plus one per other source, biggest damage first. */
export function damageRows(log: RunLog, runSec: number): DamageRow[] {
  const total = totalDealt(log) || 1;
  const rows: DamageRow[] = log.links.map((l, i) => ({
    name: WEAPONS[l.weapon]?.name ?? l.weapon,
    color: WEAPONS[l.weapon]?.color ?? 0xffffff,
    link: i + 1,
    tier: l.tier,
    damage: l.damage,
    dot: l.dot,
    kills: l.kills,
    dps: l.activeSec > 0 ? l.damage / l.activeSec : 0,
    share: l.damage / total,
  }));
  for (const [k, o] of Object.entries(log.other) as [OtherSource, SourceLog][]) {
    if (!o || (o.damage <= 0 && o.kills <= 0)) continue;
    rows.push({
      name: OTHER_SOURCE_NAMES[k] ?? k,
      color: 0xb09080,
      link: 0,
      tier: 0,
      damage: o.damage,
      dot: k === 'thorns' ? 0 : o.damage,
      kills: o.kills,
      dps: runSec > 0 ? o.damage / runSec : 0,
      share: o.damage / total,
    });
  }
  return rows.sort((a, b) => b.damage - a.damage);
}

/** What hurt you most, biggest first. */
export function takenRows(log: RunLog): { source: string; amount: number }[] {
  return Object.entries(log.taken)
    .map(([source, amount]) => ({ source, amount }))
    .sort((a, b) => b.amount - a.amount);
}
