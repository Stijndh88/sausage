/** Small seeded RNG so shops and spawns are reproducible from a run seed. */
export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randInt(rng: Rng, min: number, maxInclusive: number): number {
  return min + Math.floor(rng() * (maxInclusive - min + 1));
}

export function randRange(rng: Rng, min: number, max: number): number {
  return min + rng() * (max - min);
}

/** Pick a key from a weight table. Entries with weight <= 0 are ignored. */
export function pickWeighted<T extends string>(rng: Rng, weights: Partial<Record<T, number>>): T {
  const entries = (Object.entries(weights) as [T, number][]).filter(([, w]) => w > 0);
  if (entries.length === 0) throw new Error('pickWeighted: empty weight table');
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let roll = rng() * total;
  for (const [key, w] of entries) {
    roll -= w;
    if (roll < 0) return key;
  }
  return entries[entries.length - 1][0];
}
