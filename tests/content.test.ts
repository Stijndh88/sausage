import { beforeEach, describe, expect, it } from 'vitest';
import { ITEMS, ITEM_IDS } from '../src/data/items';
import { MOST_LINKS, SAUSAGES, SAUSAGE_IDS, sausageBaseStats, type SausageId } from '../src/data/sausages';
import { WEAPONS } from '../src/data/weapons';
import { RECIPES } from '../src/data/recipes';
import { maxLinksFor, newRun, runStats } from '../src/state/run';
import { buySausage, loadSave, migrate, ownedSausages, resetSaveCache, sausageState, writeSave, defaultSave } from '../src/state/save';
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
    expect(ownedSausages()).toEqual(['frank']);
    for (const id of SAUSAGE_IDS.filter((x) => x !== 'frank')) expect(sausageState(id)).toBe('locked');
  });

  it('a sausage needs its recipe cooked, then Spice (and sometimes a trophy) to buy', () => {
    expect(buySausage('bratwurst')).toBe(false);
    writeSave({ ...loadSave(), cooked: ['escape_backyard'], spice: 99 });
    expect(sausageState('bratwurst')).toBe('buyable');
    expect(buySausage('bratwurst')).toBe(false);
    writeSave({ ...loadSave(), spice: 150 });
    expect(buySausage('bratwurst')).toBe(true);
    expect(loadSave().spice).toBe(50);
    expect(ownedSausages()).toEqual(['frank', 'bratwurst']);
    // The Veggie Sausage also costs a Grinder Blade.
    writeSave({ ...loadSave(), cooked: [...loadSave().cooked, 'heal_1000'], spice: 1000 });
    expect(buySausage('veggie')).toBe(false);
    writeSave({ ...loadSave(), trophies: { tong_tip: 0, grinder_blade: 1, smoked_brisket: 0 } });
    expect(buySausage('veggie')).toBe(true);
    expect(loadSave().trophies.grinder_blade).toBe(0);
  });

  it('upgrading an old save keeps every sausage it had unlocked, without paying recipes again', () => {
    const old = { version: 1, bestWave: 10, wins: 1, runs: 7, bestWaveBy: { frank: 10 }, winsBy: { frank: 1 }, lastSausage: 'frank', tutorialDone: true };
    const s = migrate(old);
    expect(s.version).toBe(2);
    expect(s.owned.sort()).toEqual(['bratwurst', 'chorizo', 'frank', 'hotdog', 'veggie', 'weisswurst']);
    expect(s.spice).toBe(0);
    expect(s.cooked).toContain('beat_tongs');
    expect(s.cooked).toContain('escape_backyard');
    expect(s.counters.runs).toBe(7);
    expect(s.bestEscapeBy.frank).toBe(1);
    const early = migrate({ version: 1, bestWave: 5, wins: 0, runs: 2 });
    expect(early.owned.sort()).toEqual(['bratwurst', 'frank']);
  });

  it('every sausage but the Frank has a recipe that names it as its reward, and a price', () => {
    for (const id of SAUSAGE_IDS) {
      const u = SAUSAGES[id].unlock;
      if (id === 'frank') { expect(u.recipe).toBeNull(); continue; }
      expect(u.spice).toBeGreaterThan(0);
      expect(RECIPES[u.recipe!].reward).toEqual({ kind: 'sausage', sausage: id });
    }
  });

  it('an old save keeps the newer sausages it had earned by escaping with another one', () => {
    const s = migrate({ version: 1, bestWave: 10, wins: 2, runs: 9, winsBy: { hotdog: 1, frank: 1 } });
    expect(s.owned).toContain('cocktail');
    expect(s.owned).toContain('weisswurst');
    expect(s.owned).not.toContain('corndog');
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
