import { describe, expect, it } from 'vitest';
import sizes from '../src/art/sprites.json';
import { ITEMS } from '../src/data/items';
import { SAUSAGE_IDS } from '../src/data/sausages';
import { ENEMIES } from '../src/data/enemies';
import { WEAPONS } from '../src/data/weapons';

const pngFiles = Object.keys(import.meta.glob('../src/art/sprites/*.png'));
const sheets = Object.keys(import.meta.glob('../art/source/*.png'));
const sized = sizes as unknown as Record<string, [number, number]>;
/** Textures still on their code-drawn placeholder while the painted art is on its way. */
const AWAITING_ART = new Set(['enemy-goblin']);

describe('painted sprites', () => {
  it('every sprite has a PNG and every PNG has an in-game size', () => {
    const pngs = pngFiles.map((f) => f.slice(f.lastIndexOf('/') + 1, -4)).sort();
    expect(pngs).toEqual(Object.keys(sized).sort());
  });

  it('in-game sizes are sane', () => {
    for (const [key, [w, h]] of Object.entries(sized)) {
      expect(Number.isInteger(w) && Number.isInteger(h), key).toBe(true);
      expect(w >= 4 && h >= 4 && w <= 200 && h <= 200, `${key} ${w}x${h}`).toBe(true);
    }
  });

  it('covers every item, sausage, enemy and weapon icon', () => {
    for (const id of Object.keys(ITEMS)) expect(sized[`item-${id}`], id).toBeDefined();
    for (const id of SAUSAGE_IDS) expect(sized[`portrait-${id}`], id).toBeDefined();
    for (const e of Object.values(ENEMIES)) if (!AWAITING_ART.has(e.texture)) expect(sized[e.texture], e.texture).toBeDefined();
    for (const w of Object.values(WEAPONS)) expect(sized[w.icon], w.icon).toBeDefined();
  });

  it('round enemy bullets are square, so they sit on their hit circle', () => {
    for (const key of ['eb-ketchup', 'eb-hot', 'eb-boss']) {
      const [w, h] = sized[key];
      expect(w, key).toBe(h);
    }
  });

  it('the source sheet is kept for re-cutting', () => {
    expect(sheets.some((f) => f.endsWith('/concept-atlas-01.png'))).toBe(true);
  });
});
