import { beforeEach, describe, expect, it } from 'vitest';
import { ITEMS, ITEM_IDS } from '../src/data/items';
import { SAUSAGES, SAUSAGE_IDS, sausageBaseStats } from '../src/data/sausages';
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

  it('every sausage except the Classic Frank differs from the base stats, and has a trade-off', () => {
    for (const id of SAUSAGE_IDS.filter((x) => x !== 'frank')) {
      const s = sausageBaseStats(BASE_STATS, id);
      expect(s, id).not.toEqual(BASE_STATS);
      const offsets = Object.values(SAUSAGES[id].stats) as number[];
      // Each sausage has at least one downside (a negative offset) except Veggie's damage penalty counts too.
      expect(offsets.some((v) => v < 0), `${id} needs a weakness`).toBe(true);
    }
  });

  it('the Hot Dog can hold 7 links, everyone else 6', () => {
    const fill = (id: 'hotdog' | 'frank') => {
      let w = newRun(1, id).weapons;
      for (const wid of ['pepper', 'mustard', 'pickle', 'onion', 'skewer', 'toothpick', 'pepper', 'mustard'] as const) {
        w = applyWeaponPurchase(w.map((x) => ({ ...x, tier: 4 })), wid, maxLinksFor({ sausage: id })) ?? w;
      }
      return w.length;
    };
    expect(fill('hotdog')).toBe(7);
    expect(fill('frank')).toBe(6);
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
    expect(recordRun('chorizo', 10, true).sort()).toEqual(['hotdog', 'veggie']);
    const s = loadSave();
    expect(s.bestWave).toBe(10);
    expect(s.wins).toBe(1);
    expect(s.runs).toBe(3);
    expect(s.bestWaveBy).toEqual({ frank: 4, bratwurst: 7, chorizo: 10 });
    expect(s.winsBy).toEqual({ chorizo: 1 });
    expect(isUnlocked(SAUSAGES.veggie.unlock)).toBe(true);
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
    expect(weaponStatLine(WEAPONS.onion, 3, 2)).toContain('spins faster');
  });
});
