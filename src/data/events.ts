import { type Rng, pickWeighted } from '../systems/rng';
import { waveConfig } from './waves';

/**
 * Events at marked times during a wave (in the spirit of Vampire Survivors' map events and
 * Hellforged's beacons and elite timers): each wave rolls its events up front from the run seed,
 * and the HUD shows them on a track under the timer, so you can see them coming and plan.
 */
export type EventKind = 'basket' | 'golden' | 'happy' | 'bounty' | 'elite' | 'stampede' | 'flare' | 'rain';

export type EventCategory = 'treasure' | 'chase' | 'buff' | 'quest' | 'fight' | 'hazard';

export interface EventDef {
  kind: EventKind;
  name: string;
  /** One line shown under the name when the event starts. */
  hint: string;
  category: EventCategory;
  /** First wave it can appear in. */
  minWave: number;
  /** Relative odds when rolling a wave's events. */
  weight: number;
  /** HUD/track colour. */
  color: number;
  /** Hazards are announced this long before they hit. */
  warnMs: number;
}

export const EVENTS: Record<EventKind, EventDef> = {
  basket: {
    kind: 'basket', name: 'PICNIC BASKET', hint: 'Stand in the circle to open it: a free item!',
    category: 'treasure', minWave: 1, weight: 3, color: 0x6fd36b, warnMs: 0,
  },
  golden: {
    kind: 'golden', name: 'GOLDEN HOT DOG', hint: 'Catch it before it escapes!',
    category: 'chase', minWave: 1, weight: 3, color: 0xffd23f, warnMs: 0,
  },
  happy: {
    kind: 'happy', name: 'HAPPY HOUR', hint: 'Double crumbs and +30% fire rate for 15 s',
    category: 'buff', minWave: 2, weight: 2, color: 0xffa03a, warnMs: 0,
  },
  bounty: {
    kind: 'bounty', name: "CHEF'S BOUNTY", hint: 'Kill enough enemies in time for a crumb bonus',
    category: 'quest', minWave: 2, weight: 2.5, color: 0x8fd3ff, warnMs: 0,
  },
  elite: {
    kind: 'elite', name: 'ELITE', hint: 'A tough glowing enemy. It drops a pile of crumbs.',
    category: 'fight', minWave: 3, weight: 2.5, color: 0xd070ff, warnMs: 0,
  },
  stampede: {
    kind: 'stampede', name: 'FORK STAMPEDE', hint: 'Get out of the way, or dash through the gap!',
    category: 'hazard', minWave: 2, weight: 2.5, color: 0xff5040, warnMs: 2200,
  },
  flare: {
    kind: 'flare', name: 'GREASE FLARE-UP', hint: 'Stay out of the burning lanes!',
    category: 'hazard', minWave: 4, weight: 2, color: 0xff7a00, warnMs: 2000,
  },
  rain: {
    kind: 'rain', name: 'SAUCE RAIN', hint: 'Dodge the shadows!',
    category: 'hazard', minWave: 5, weight: 2, color: 0xe0242c, warnMs: 1500,
  },
};

export const EVENT_KINDS = Object.keys(EVENTS) as EventKind[];

export interface ScheduledEvent {
  kind: EventKind;
  /** Seconds into the wave. */
  atSec: number;
}

/** No events this close to the start or end of a wave (the spawn-in and the wave-clear sweep). */
export const EVENT_EDGE_SEC = 7;
/** Minimum gap between two events in the same wave. */
export const EVENT_MIN_GAP_SEC = 9;

/** How many events a wave gets: 1 in wave 1, 2 in waves 2-4, 3 after. Boss waves have none. */
export function eventCount(wave: number): number {
  if (waveConfig(wave).boss) return 0;
  if (wave <= 1) return 1;
  return wave <= 4 ? 2 : 3;
}

const isReward = (k: EventKind) => EVENTS[k].category !== 'hazard' && EVENTS[k].category !== 'fight';

/**
 * Rolls a wave's events: no kind twice, at most one hazard, and always at least one reward
 * (treasure, chase, buff or quest), so every wave has something to go for.
 */
export function rollWaveEvents(rng: Rng, wave: number): ScheduledEvent[] {
  const cfg = waveConfig(wave);
  const count = eventCount(wave);
  if (count === 0 || cfg.boss) return [];

  const kinds: EventKind[] = [];
  const pool = () => {
    const w: Partial<Record<EventKind, number>> = {};
    const hasHazard = kinds.some((k) => EVENTS[k].category === 'hazard');
    const needReward = kinds.length === count - 1 && !kinds.some(isReward);
    for (const k of EVENT_KINDS) {
      const d = EVENTS[k];
      if (d.minWave > wave || kinds.includes(k)) continue;
      if (hasHazard && d.category === 'hazard') continue;
      if (needReward && !isReward(k)) continue;
      w[k] = d.weight;
    }
    return w;
  };
  while (kinds.length < count) {
    const w = pool();
    if (Object.keys(w).length === 0) break;
    kinds.push(pickWeighted(rng, w));
  }

  // Spread them over the wave: split the usable time into equal slots and jitter inside each.
  const start = EVENT_EDGE_SEC;
  const end = cfg.durationSec - EVENT_EDGE_SEC;
  const slot = (end - start) / kinds.length;
  const jitter = Math.max(0, slot - EVENT_MIN_GAP_SEC);
  // Shuffle so hazards don't always land in the same slot.
  for (let i = kinds.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [kinds[i], kinds[j]] = [kinds[j], kinds[i]];
  }
  return kinds.map((kind, i) => ({ kind, atSec: Math.round(start + slot * i + rng() * jitter) }));
}

// --- Tuning ----------------------------------------------------------------------------------

/** Seconds of standing in the basket's circle to open it (leaving drains progress twice as fast). */
export const BASKET_OPEN_SEC = 3;
export const BASKET_RADIUS = 62;
export const BASKET_LIFETIME_SEC = 16;

export const GOLDEN_LIFETIME_SEC = 10;
/** The golden hot dog runs at this fraction of the base sausage speed: catchable, with a dash or two. */
export const GOLDEN_SPEED_FRACTION = 0.82;
export const goldenCrumbs = (wave: number) => 6 + 2 * wave;

export const HAPPY_HOUR_SEC = 15;
export const HAPPY_FIRE_RATE = 1.3;
export const HAPPY_CRUMB_MULT = 2;

export const BOUNTY_SEC = 20;
/** Kills needed: scales with how fast the wave spawns enemies. */
export function bountyTarget(wave: number): number {
  const cfg = waveConfig(wave);
  const perSec = (cfg.batch * 1000) / cfg.spawnIntervalMs;
  return Math.max(8, Math.round(perSec * BOUNTY_SEC * 0.7));
}
export const bountyCrumbs = (wave: number) => 8 + 2 * wave;

export const ELITE_HP_MULT = 6;
export const ELITE_SCALE = 1.6;
export const eliteCrumbs = (wave: number) => 8 + 2 * wave;

export const STAMPEDE_DAMAGE = 14;
export const STAMPEDE_SPEED = 520;
export const FLARE_BURN_SEC = 3.5;
export const FLARE_DAMAGE = 10;
export const FLARE_LANE = 96;
export const RAIN_DROPS = 14;
export const RAIN_SEC = 6;
export const RAIN_RADIUS = 42;
export const RAIN_DAMAGE = 12;
