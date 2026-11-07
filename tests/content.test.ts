import { beforeEach, describe, expect, it } from 'vitest';
import { ITEMS, ITEM_IDS } from '../src/data/items';
import { MOST_LINKS, SAUSAGES, SAUSAGE_IDS, sausageBaseStats, unlockText, type SausageId } from '../src/data/sausages';
import { WEAPONS } from '../src/data/weapons';
import { maxLinksFor, newRun, runStats } from '../src/state/run';
import { isUnlocked, loadSave, recordRun, resetSaveCache, unlockedSausages, writeSave, defaultSave } from '../src/state/save';
import { BASE_STATS, computeStats } from '../src/state/stats';
import { applyWeaponPurchase } from '../src/systems/Economy';
import { statChanges, weaponStatLine } from '../src/systems/statText';

describe('sausage types', () => {
  it('every sausage starts alive, with valid weapons and a sensible link limit', () => {
    for (const id of SAUSAGE_IDS) {
      const run = newRun(1, id);
      const s = runStats(run);
      expect(s.maxHp, id).toBeGreaterThanOrEqual(50);
      expect(s.speedMult, id).toBeGreaterThan(0.5);
      expect(run.weapons.length, id).toBeGreaterThan(0);
      for (const w of run.weapons) expect(WEAPONS[w.id], id).toBeDefined();
      expect(run.weapons.length).toBeLessThanOrEqual(maxLinksFor(run));
    }
  });

  it('every sausage except the Classic Frank has a strength and a trade-off', () => {
    for (const id of SAUSAGE_IDS.filter((x) => x !== 'frank')) {
      const def = SAUSAGES[id];
      const rules = def.rules ?? {};
      const s = sausageBaseStats(BASE_STATS, id);
      expect(Object.keys(rules).length > 0 || JSON.stringify(s) !== JSON.stringify(BASE_STATS), `${id} needs a strength`).toBe(true);
      const offsets = Object.values(def.stats) as number[];
      // A weakness is a negative stat offset, fewer links, or a rule with a downside built in.
      const ruleDownside = !!(rules.noCondimentHeal || rules.freshness || rules.linksHittable);
      expect(offsets.some((v) => v < 0) || def.maxLinks < 6 || ruleDownside, `${id} needs a weakness`).toBe(true);
    }
  });

  it('every sausage has a portrait, a unique colour and perks that fit on its card', () => {
    const tints = new Set(SAUSAGE_IDS.map((id) => SAUSAGES[id].tint));
    expect(tints.size).toBe(SAUSAGE_IDS.length);
    for (const id of SAUSAGE_IDS) {
      expect(SAUSAGES[id].perks.length, id).toBeLessThanOrEqual(4);
      for (const p of SAUSAGES[id].perks) expect(p.length, `${id}: ${p}`).toBeLessThanOrEqual(52);
    }
  });

  it('the Weisswurst fresh window and the Merguez burn are sane', () => {
    const f = SAUSAGES.weisswurst.rules!.freshness!;
    expect(f.bonus).toBeGreaterThan(0);
    expect(f.stale).toBeLessThan(0);
    expect(f.ms).toBeLessThan(25000); // shorter than the shortest wave, so every wave has both halves
    expect(SAUSAGES.merguez.rules!.burnDps).toBeGreaterThan(0);
  });

  it('the Hot Dog holds 7 links, the Kielbasa 8, the Cocktail Sausage 4, everyone else 6', () => {
    const fill = (id: SausageId) => {
      let w = newRun(1, id).weapons;
      for (const wid of ['pepper', 'mustard', 'pickle', 'onion', 'skewer', 'toothpick', 'pepper', 'mustard'] as const) {
        w = applyWeaponPurchase(w.map((x) => ({ ...x, tier: 4 })), wid, maxLinksFor({ sausage: id })) ?? w;
      }
      return w.length;
    };
    expect(fill('hotdog')).toBe(7);
    expect(fill('kielbasa')).toBe(8);
    expect(fill('cocktail')).toBe(4);
    expect(fill('frank')).toBe(6);
    expect(MOST_LINKS).toBe(8);
  });
});

describe('save data and unlocks', () => {
  beforeEach(() => {
    resetSaveCache();
    writeSave(defaultSave());
  });

  it('a fresh profile has only the Classic Frank', () => {
    expect(unlockedSausages()).toEqual(['frank']);
  });

  it('reaching waves and winning unlock sausages, and records bests per sausage', () => {
    expect(recordRun('frank', 4, false)).toEqual(['bratwurst']);
    expect(recordRun('bratwurst', 7, false)).toEqual(['chorizo']);
    expect(recordRun('chorizo', 10, true).sort()).toEqual(['hotdog', 'merguez', 'veggie']);
    const s = loadSave();
    expect(s.bestWave).toBe(10);
    expect(s.wins).toBe(1);
    expect(s.runs).toBe(3);
    expect(s.bestWaveBy).toEqual({ frank: 4, bratwurst: 7, chorizo: 10 });
    expect(s.winsBy).toEqual({ chorizo: 1 });
    expect(isUnlocked(SAUSAGES.veggie.unlock)).toBe(true);
  });

  it('the newer sausages each need an escape with a specific sausage', () => {
    expect(recordRun('frank', 10, true).sort()).toEqual(['bratwurst', 'chorizo', 'hotdog', 'veggie', 'weisswurst']);
    expect(recordRun('frank', 10, true)).toEqual([]);
    expect(recordRun('hotdog', 10, true)).toEqual(['cocktail']);
    expect(recordRun('cocktail', 10, true)).toEqual(['kielbasa']);
    expect(unlockedSausages()).not.toContain('corndog');
    expect(unlockText(SAUSAGES.corndog.unlock)).toBe('Escape the BBQ as the Bratwurst to unlock');
  });

  it('survives a broken save in storage', () => {
    resetSaveCache();
    globalThis.localStorage?.setItem('wurst-case-scenario/save', '{not json');
    expect(loadSave().bestWave).toBe(0);
  });
});

describe('shop stat text', () => {
  it('lists only the stats an item changes, with before and after values', () => {
    const before = computeStats([]);
    expect(statChanges(before, computeStats(['paprika']))).toEqual(['Damage 100% → 108%']);
    expect(statChanges(before, computeStats(['smoked_ham']))).toEqual(['Max HP 100 → 125', 'Speed 100% → 97%']);
    expect(statChanges(before, computeStats(['grill_apron']))).toEqual(['Armor 0 → 3', 'Grill-proof no → yes']);
  });

  it('every item shows at least one stat change when bought first', () => {
    for (const id of ITEM_IDS) expect(statChanges(computeStats([]), computeStats([id])).length, ITEMS[id].name).toBeGreaterThan(0);
  });

  it('weapon lines show damage and rate, with arrows only for upgrades', () => {
    expect(weaponStatLine(WEAPONS.toothpick, 1)).toBe('DMG 7 · every 0.40s');
    expect(weaponStatLine(WEAPONS.toothpick, 2, 1)).toBe('DMG 7 → 10.5 · every 0.40s → 0.36s');
    expect(weaponStatLine(WEAPONS.pepper, 2, 1)).toContain('6 → 7 shots');
    expect(weaponStatLine(WEAPONS.onion, 3, 2)).toContain('1 → 2 rings');
  });
});

describe('Sharp Cheddar (piercing)', () => {
  it('adds one pierce per stack and stops being offered at 3', () => {
    expect(BASE_STATS.pierce).toBe(0);
    expect(computeStats(['sharp_cheddar']).pierce).toBe(1);
    expect(computeStats(['sharp_cheddar', 'sharp_cheddar']).pierce).toBe(2);
    expect(ITEMS.sharp_cheddar.maxStacks).toBe(3);
    expect(statChanges(BASE_STATS, computeStats(['sharp_cheddar']))).toEqual(['Pierce +0 → +1']);
  });
});
