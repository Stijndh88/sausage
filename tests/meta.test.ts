import { beforeEach, describe, expect, it } from 'vitest';
import { courseStart, locate, courseSpiceMult, bossName } from '../src/data/courses';
import { BACKYARD_BOSS_WAVE, waveConfig } from '../src/data/waves';
import { RECIPES, RECIPE_IDS, cookedBy, mergeCounters, STARTER_WEAPONS } from '../src/data/recipes';
import { SAUSAGES, SAUSAGE_IDS } from '../src/data/sausages';
import {
  TALENTS, TALENT_IDS, canBuyTalent, fullTreeCost, rankCost, spentSpice, talentMods, applyTalentStats, KEYSTONE_POINTS,
} from '../src/data/talents';
import { ITEMS } from '../src/data/items';
import { WEAPON_IDS } from '../src/data/weapons';
import { newRun, runStats } from '../src/state/run';
import {
  bagValue, BOSS_SPICE, keepShare, KILL_SPICE_PER_CRUMB, settleRun, spiceMult, waveClearSpice, firstTasteSpice,
} from '../src/state/meta';
import {
  buyTalent, defaultSave, loadSave, maxChili, refundTalents, resetSaveCache, unlockedRarities, unlockedWeapons, writeSave,
} from '../src/state/save';
import { BASE_STATS } from '../src/state/stats';
import { generateOffers, shopRng } from '../src/systems/Economy';
import { menuOptions, secondsItems } from '../src/state/seconds';

beforeEach(() => {
  resetSaveCache();
  writeSave(defaultSave());
});

describe('courses', () => {
  it('the Backyard is 6 waves and the Tongs; later courses are 5 waves and a boss', () => {
    expect(BACKYARD_BOSS_WAVE).toBe(7);
    expect(locate(7)).toEqual({ course: 0, courseWave: 7, waves: 6, boss: true });
    expect(locate(8)).toEqual({ course: 1, courseWave: 1, waves: 5, boss: false });
    expect(locate(13).boss).toBe(true);
    expect(locate(19)).toEqual({ course: 2, courseWave: 6, waves: 5, boss: true });
    expect(courseStart(3)).toBe(20);
    expect(bossName(1)).toBe('The Meat Grinder');
    expect(bossName(3)).toContain('remix');
  });

  it('every wave of every course has sane numbers, and each course starts harder than the last one began', () => {
    for (let w = 1; w <= 40; w++) {
      const c = waveConfig(w);
      expect(c.hpMult, `wave ${w}`).toBeGreaterThan(0);
      expect(c.boss, `wave ${w}`).toBe(c.durationSec === 0);
      expect(c.maxAlive).toBeLessThanOrEqual(100);
    }
    expect(waveConfig(courseStart(1)).hpMult).toBeGreaterThan(waveConfig(courseStart(0)).hpMult);
    expect(waveConfig(courseStart(2)).hpMult).toBeGreaterThan(waveConfig(courseStart(1)).hpMult);
    expect(waveConfig(courseStart(3)).hpMult).toBeGreaterThan(waveConfig(courseStart(2)).hpMult);
  });

  it('Spice multipliers go x1, x1.5, x2, then +0.5 per Seconds loop', () => {
    expect([0, 1, 2, 3, 4].map(courseSpiceMult)).toEqual([1, 1.5, 2, 2.5, 3]);
  });
});

describe('the doggy bag', () => {
  it('keeps 100% (+10%) going home, 50% bailing, 50% dying before a push and 25% after', () => {
    const run = newRun(1, 'frank');
    run.bag = 200;
    expect(bagValue('home', run)).toBe(220);
    expect(bagValue('bail', run)).toBe(100);
    expect(bagValue('death', run)).toBe(100);
    run.pushes = 1;
    expect(bagValue('death', run)).toBe(50);
    run.chili = 5;
    expect(keepShare('death', run)).toBe(0);
  });

  it('talents raise what you keep (Tupperware, Takeout) and the multiplier (Spice Hound)', () => {
    const run = newRun(1, 'frank', { talents: { tupperware: 4, takeout: 1, spice_hound: 5 } });
    run.pushes = 1;
    expect(keepShare('death', run)).toBeCloseTo(0.45);
    expect(keepShare('bail', run)).toBe(0.75);
    expect(spiceMult(run)).toBeCloseTo(1.25);
  });

  it('the multiplier follows the course, Chili and the menu', () => {
    const run = newRun(1, 'frank', { chili: 2 });
    run.wave = courseStart(1);
    run.menu = 'grease_fire';
    expect(spiceMult(run)).toBeCloseTo(1.5 * (1 + 0.4 + 0.25));
  });

  it('a clean Backyard pays roughly 70 to 120 Spice', () => {
    // About 350 kills worth ~1.7 crumbs each, six cleared waves and the boss.
    const kills = 350 * 1.7 * KILL_SPICE_PER_CRUMB;
    const waves = [1, 2, 3, 4, 5, 6].reduce((a, w) => a + waveClearSpice(w), 0);
    const total = kills + waves + BOSS_SPICE;
    expect(total).toBeGreaterThan(70);
    expect(total).toBeLessThan(120);
    expect(firstTasteSpice(0)).toBeGreaterThan(0);
    expect(firstTasteSpice(3)).toBe(0);
  });

  it('pushing on after the first boss pays off for a player who wins about a quarter of the time', () => {
    const backyard = 120;
    const bank = Math.floor(backyard * 1.1);
    const kitchen = backyard + 110 * 2;
    const win = Math.floor(kitchen * 1.1);
    const dieHalfway = Math.floor((backyard + 55 * 2) * 0.25);
    const breakEven = (bank - dieHalfway) / (win - dieHalfway);
    expect(breakEven).toBeGreaterThan(0.15);
    expect(breakEven).toBeLessThan(0.3);
  });
});

describe('settling a run', () => {
  it('banks the kept share, keeps trophies on the way home, and records progress', () => {
    const run = newRun(1, 'frank');
    run.wave = BACKYARD_BOSS_WAVE;
    run.bag = 130;
    run.trophies = ['tong_tip'];
    run.tally = { kills: 120, bossKills: 1 };
    const s = settleRun(run, 'home', 50);
    expect(s.kept).toBe(130);
    expect(s.bonus).toBe(13);
    expect(s.trophiesKept).toEqual(['tong_tip']);
    const save = loadSave();
    expect(save.trophies.tong_tip).toBe(1);
    expect(save.counters.kills).toBe(120);
    expect(save.counters.bestEscape).toBe(1);
    // Takeaway (Bratwurst), Tong-Tied (Rare items), Amuse-Bouche (100 kills).
    expect(s.cooked).toEqual(expect.arrayContaining(['escape_backyard', 'beat_tongs', 'kills_100']));
    expect(s.newSausages).toEqual(['bratwurst']);
    expect(save.spice).toBe(130 + 13 + s.recipeSpice);
    expect(save.wins).toBe(1);
  });

  it('dying loses the trophies and most of the bag, but Cookbook progress still counts', () => {
    const run = newRun(1, 'frank');
    run.wave = courseStart(1) + 2;
    run.pushes = 1;
    run.bag = 400;
    run.trophies = ['tong_tip'];
    run.tally = { crits: 50 };
    run.causeOfDeath = 'Grill tile';
    const s = settleRun(run, 'death');
    expect(s.kept).toBe(100);
    expect(s.lost).toBe(300);
    expect(s.trophiesLost).toEqual(['tong_tip']);
    const save = loadSave();
    expect(save.trophies.tong_tip).toBe(0);
    expect(save.counters.crits).toBe(50);
    expect(save.counters.bestCourseReached).toBe(1);
    expect(save.cooked).toContain('grill_death');
    expect(save.history[0]).toMatchObject({ outcome: 'death', course: 1 });
  });

  it('pays each recipe only once', () => {
    const run = () => {
      const r = newRun(1, 'frank');
      r.tally = { kills: 200 };
      return r;
    };
    const first = settleRun(run(), 'bail');
    const second = settleRun(run(), 'bail');
    expect(first.cooked).toContain('kills_100');
    expect(second.cooked).not.toContain('kills_100');
  });

  it('taking it home after the Smokehouse at your top Chili level opens the next one', () => {
    writeSave({ ...loadSave(), cooked: ['escape_smokehouse'] });
    expect(maxChili('frank')).toBe(1);
    const run = newRun(1, 'frank', { chili: 1 });
    run.wave = courseStart(2) + 5;
    const s = settleRun(run, 'home', 80);
    expect(s.newChili).toBe(2);
    expect(maxChili('frank')).toBe(2);
    expect(loadSave().counters.chiliEscape).toBe(1);
  });
});

describe('the Spice Rack', () => {
  it('the full tree costs about 16,000 Spice: a few dozen good runs, not one', () => {
    const total = fullTreeCost();
    expect(total).toBeGreaterThan(12000);
    expect(total).toBeLessThan(20000);
  });

  it('the first rank of every shelf-1 talent costs 25, so even a short first run buys something', () => {
    for (const id of TALENT_IDS) if (TALENTS[id].shelf === 1) expect(rankCost(TALENTS[id], 0)).toBe(25);
  });

  it('shelf 2 needs 5 points in the jar, keystones need 10 points and trophies', () => {
    const ranks: Record<string, number> = { plump: 4 };
    const wallet = { tong_tip: 0, grinder_blade: 0, smoked_brisket: 0 };
    expect(canBuyTalent('grill_marks', ranks, 999, wallet, []).ok).toBe(false);
    ranks.plump = 5;
    expect(canBuyTalent('grill_marks', ranks, 999, wallet, []).ok).toBe(true);
    ranks.plump = KEYSTONE_POINTS;
    expect(canBuyTalent('second_skin_key', ranks, 999, wallet, []).ok).toBe(false);
    expect(canBuyTalent('second_skin_key', ranks, 999, { ...wallet, grinder_blade: 2 }, []).ok).toBe(true);
    // Lunchbox needs its recipe too.
    ranks.tupperware = 4;
    ranks.spice_hound = 1;
    expect(canBuyTalent('lunchbox', ranks, 999, wallet, []).ok).toBe(false);
    expect(canBuyTalent('lunchbox', ranks, 999, wallet, ['big_push']).ok).toBe(true);
  });

  it('buying spends Spice and trophies; refunding gives every bit back', () => {
    writeSave({ ...loadSave(), spice: 5000, trophies: { tong_tip: 2, grinder_blade: 0, smoked_brisket: 0 } });
    for (let i = 0; i < 10; i++) expect(buyTalent('plump')).toBe(true);
    expect(buyTalent('smoked')).toBe(true);
    const save = loadSave();
    expect(save.trophies.tong_tip).toBe(0);
    expect(save.spice).toBe(5000 - spentSpice(save.talents));
    refundTalents();
    expect(loadSave().spice).toBe(5000);
    expect(loadSave().trophies.tong_tip).toBe(2);
    expect(loadSave().talents).toEqual({});
  });

  it('talents change the run: stats, start crumbs, starting tier, a starting item', () => {
    const run = newRun(3, 'frank', { talents: { plump: 2, tip_jar: 3, double_batch: 1, mise_en_place: 1 } });
    expect(runStats(run).maxHp).toBe(110);
    expect(run.crumbs).toBe(8 + 9);
    expect(run.weapons[0].tier).toBe(2);
    expect(run.items).toHaveLength(1);
    expect(ITEMS[run.items[0]].rarity).toBe('common');
    const s = applyTalentStats({ ...BASE_STATS }, { first_bite: 2, marinade: 1, grill_marks: 3 });
    expect(s.firstBite).toBeCloseTo(0.4);
    expect(s.poisonMult).toBeCloseTo(1.15);
    expect(s.grillDamageMult).toBeCloseTo(0.4);
    expect(talentMods({ free_refill: 2 }).freeRerolls).toBe(2);
  });

  it('a full tree is worth roughly a quarter more strength, not a different game', () => {
    const all = Object.fromEntries(TALENT_IDS.map((id) => [id, TALENTS[id].maxRank]));
    const s = applyTalentStats({ ...BASE_STATS }, all);
    expect(s.damageMult).toBeLessThanOrEqual(1.2);
    expect(s.maxHp).toBeLessThanOrEqual(BASE_STATS.maxHp * 1.6);
  });
});

describe('the Cookbook', () => {
  it('has about 40 recipes, each with a real goal and a Spice reward', () => {
    expect(RECIPE_IDS.length).toBeGreaterThanOrEqual(38);
    for (const id of RECIPE_IDS) {
      expect(RECIPES[id].goal).toBeGreaterThan(0);
      expect(RECIPES[id].spice).toBeGreaterThan(0);
    }
  });

  it('every locked sausage, weapon and rarity has a recipe that unlocks it', () => {
    for (const id of SAUSAGE_IDS) {
      const r = SAUSAGES[id].unlock.recipe;
      if (r) expect(RECIPES[r], id).toBeDefined();
    }
    const unlockedByRecipes = RECIPE_IDS.map((id) => RECIPES[id].reward).filter((rw) => rw.kind === 'weapon').map((rw) => rw.kind === 'weapon' && rw.weapon);
    for (const w of WEAPON_IDS) expect(STARTER_WEAPONS.includes(w) || unlockedByRecipes.includes(w), w).toBe(true);
  });

  it('best-of counters keep the max, the rest add up', () => {
    const c = mergeCounters({ kills: 10, killBurst: 30 }, { kills: 5, killBurst: 20 });
    expect(c).toEqual({ kills: 15, killBurst: 30 });
    expect(cookedBy({ kills: 100 })).toContain('kills_100');
  });

  it('a new save starts with 4 weapons and no Rare or Legendary items in the shop', () => {
    expect(unlockedWeapons()).toEqual([...STARTER_WEAPONS]);
    expect(unlockedRarities()).toEqual(['common', 'uncommon']);
    for (let seed = 0; seed < 50; seed++) {
      const offers = generateOffers(shopRng(seed, 9, 0), 10, [], 4, [], { weaponPool: unlockedWeapons(), rarities: unlockedRarities() });
      for (const o of offers) {
        if (o.type === 'weapon') expect(STARTER_WEAPONS).toContain(o.id);
        else expect(['common', 'uncommon']).toContain(ITEMS[o.id].rarity);
      }
    }
    writeSave({ ...loadSave(), cooked: ['beat_tongs', 'kills_1000'] });
    expect(unlockedRarities()).toContain('rare');
    expect(unlockedWeapons()).toContain('skewer');
  });

  it('Food Truck: shop items are always Uncommon or better', () => {
    for (let seed = 0; seed < 50; seed++) {
      const offers = generateOffers(shopRng(seed, 2, 0), 3, [], 4, [], { minRarity: 'uncommon' });
      for (const o of offers) if (o.type === 'item') expect(ITEMS[o.id].rarity).not.toBe('common');
    }
  });
});

describe('seconds', () => {
  it('offers three different Rare items and one spicy menu against the Light Lunch', () => {
    const run = newRun(42, 'frank');
    run.wave = BACKYARD_BOSS_WAVE;
    const items = secondsItems(run);
    expect(new Set(items).size).toBe(3);
    for (const id of items) expect(ITEMS[id].rarity).toBe('rare');
    const menus = menuOptions(run);
    expect(menus[1]).toBe('light_lunch');
    expect(menus[0]).not.toBe('light_lunch');
  });
});
