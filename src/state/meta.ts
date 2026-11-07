import { courseSpiceMult, locate, type TrophyId } from '../data/courses';
import { menuDef } from '../data/menus';
import { RECIPES, RECIPE_IDS, cookedBy, mergeCounters, type Counters } from '../data/recipes';
import { SAUSAGES, SAUSAGE_IDS, type SausageId } from '../data/sausages';
import { canBuyTalent, TALENT_IDS } from '../data/talents';
import type { RunState } from './run';
import { canAffordSausage, HISTORY_SIZE, loadSave, MAX_CHILI, sausageState, writeSave, type SaveData } from './save';

/**
 * Spice, the doggy bag and how much of it you keep. Everything here is plain math on the run
 * and the save, so it is unit-tested without Phaser.
 */
export type Outcome = 'home' | 'bail' | 'death';

/** Extra share of the bag paid when you take it home. */
export const ESCAPE_BONUS = 0.1;
export const BAIL_KEEP = 0.5;
/** Dying before you ever pushed on keeps half: the harsh rate is a risk you choose. */
export const DEATH_KEEP_BEFORE_PUSH = 0.5;
export const DEATH_KEEP_AFTER_PUSH = 0.25;
export const MAX_DEATH_KEEP = 0.9;
/** Each Chili level adds this much to the Spice multiplier. */
export const CHILI_SPICE = 0.2;

/** Spice per crumb an enemy is worth (a fork is 0.05 Spice, a turret 0.15). */
export const KILL_SPICE_PER_CRUMB = 0.05;
export const BOSS_SPICE = 25;

export function waveClearSpice(courseWave: number): number {
  return 6 + 2 * courseWave;
}

/** One-time bonus for the first kill of each course's boss with each sausage (Seconds pay none). */
export function firstTasteSpice(course: number): number {
  return course < 3 ? 40 * (course + 1) : 0;
}

/** The Spice multiplier right now: course, pushes (All You Can Eat), talents, Chili and menu. */
export function spiceMult(run: Pick<RunState, 'wave' | 'pushes' | 'mods' | 'chili' | 'menu'>): number {
  const course = locate(run.wave).course;
  const base = courseSpiceMult(course) + run.mods.pushMultBonus * run.pushes;
  return base * (1 + run.mods.spiceBonus + CHILI_SPICE * run.chili + menuDef(run.menu).spiceBonus);
}

/** Share of the bag kept for an outcome (before the escape bonus). */
export function keepShare(outcome: Outcome, run: Pick<RunState, 'pushes' | 'mods' | 'chili'>): number {
  if (outcome === 'home') return 1;
  if (outcome === 'bail') return run.mods.bailKeep || BAIL_KEEP;
  if (run.pushes === 0) return DEATH_KEEP_BEFORE_PUSH;
  if (run.chili >= 5) return 0;
  return Math.min(MAX_DEATH_KEEP, DEATH_KEEP_AFTER_PUSH + run.mods.deathKeepBonus);
}

/** What you'd bank right now for each outcome (for the HUD and the choice screen). */
export function bagValue(outcome: Outcome, run: Pick<RunState, 'bag' | 'pushes' | 'mods' | 'chili'>): number {
  const bag = Math.floor(run.bag);
  const kept = Math.floor(bag * keepShare(outcome, run));
  return outcome === 'home' ? kept + Math.floor(bag * ESCAPE_BONUS) : kept;
}

/** Counters that are milestones (a course index), not something a bar should fill toward. */
const PROGRESS_HIDDEN: ReadonlySet<string> = new Set(['bestCourseReached', 'bestEscape', 'chiliEscape']);

export interface RecipeProgress {
  id: string;
  before: number;
  after: number;
  goal: number;
}

export interface Settlement {
  outcome: Outcome;
  bag: number;
  kept: number;
  bonus: number;
  lost: number;
  trophiesKept: TrophyId[];
  trophiesLost: TrophyId[];
  /** Spice banked earlier in the run (First Taste, Lunchbox). */
  bankedDuringRun: number;
  /** Recipes cooked by this run, and the Spice they paid. */
  cooked: string[];
  recipeSpice: number;
  /** Recipes this run moved closer, most advanced first (at most 4). */
  progress: RecipeProgress[];
  spiceBefore: number;
  spiceAfter: number;
  /** Sausages that just became buyable. */
  newSausages: SausageId[];
  /** New Chili level unlocked for this sausage, if any. */
  newChili: number | null;
  /** How many Spice Rack ranks and sausages you can buy now. */
  talentsAffordable: number;
  sausagesAffordable: number;
}

/**
 * Ends a run: works out what you keep, adds the run's Cookbook progress, pays cooked recipes,
 * records best runs and history, and writes the save. Call it exactly once per run.
 */
export function settleRun(run: RunState, outcome: Outcome, hpLeft = 0, save: SaveData = loadSave()): Settlement {
  const loc = locate(run.wave);
  const bag = Math.floor(run.bag);
  const kept = Math.floor(bag * keepShare(outcome, run));
  const bonus = outcome === 'home' ? Math.floor(bag * ESCAPE_BONUS) : 0;
  const trophiesKept = outcome === 'death' ? [] : [...run.trophies];
  const trophiesLost = outcome === 'death' ? [...run.trophies] : [];

  // This run's final tallies.
  const t: Counters = { ...run.tally };
  const add = (k: keyof Counters, n = 1) => { t[k] = (t[k] ?? 0) + n; };
  const max = (k: keyof Counters, n: number) => { t[k] = Math.max(t[k] ?? 0, n); };
  add('runs');
  add('crumbsEarned', run.crumbsEarned);
  if (outcome === 'death') {
    add('deaths');
    if (run.causeOfDeath === 'Grill tile') add('grillDeaths');
  }
  if (outcome === 'bail' && hpLeft > 0 && hpLeft < 10) add('closeBails');
  if (outcome === 'home') {
    add('escapes');
    if (hpLeft > 0 && hpLeft < 10) add('lowHpEscapes');
    max('bestEscape', loc.course + 1);
    if (loc.course >= 2 && run.chili > 0) max('chiliEscape', run.chili);
  }
  if (trophiesKept.length) add('trophies', trophiesKept.length);
  max('bestCourseReached', loc.course);
  max('peakBag', bag);

  const counters = mergeCounters(save.counters, t);
  const cookedNow = cookedBy(counters).filter((id) => !save.cooked.includes(id));
  const recipeSpice = cookedNow.reduce((a, id) => a + RECIPES[id].spice, 0);

  const progress: RecipeProgress[] = RECIPE_IDS
    .filter((id) => !save.cooked.includes(id) && !cookedNow.includes(id) && !RECIPES[id].secret && !PROGRESS_HIDDEN.has(RECIPES[id].counter))
    .map((id) => {
      const r = RECIPES[id];
      return { id, before: save.counters[r.counter] ?? 0, after: counters[r.counter] ?? 0, goal: r.goal };
    })
    .filter((p) => p.after > p.before)
    .sort((a, b) => b.after / b.goal - a.after / a.goal)
    .slice(0, 4);

  const trophies = { ...save.trophies };
  for (const id of trophiesKept) trophies[id]++;

  // Chili: taking it home after the Smokehouse at your highest level opens the next one.
  const chili = { ...save.chili };
  let newChili: number | null = null;
  if (outcome === 'home' && loc.course >= 2 && run.chili >= 1 && run.chili >= (chili[run.sausage] ?? 1) && run.chili < MAX_CHILI) {
    newChili = run.chili + 1;
    chili[run.sausage] = newChili;
  }

  const waveReached = run.wave;
  const next: SaveData = {
    ...save,
    spice: save.spice + kept + bonus + recipeSpice,
    trophies,
    counters,
    cooked: [...save.cooked, ...cookedNow],
    chili,
    runs: save.runs + 1,
    bestWave: Math.max(save.bestWave, waveReached),
    bestWaveBy: { ...save.bestWaveBy, [run.sausage]: Math.max(save.bestWaveBy[run.sausage] ?? 0, waveReached) },
    wins: save.wins + (outcome === 'home' ? 1 : 0),
    winsBy: outcome === 'home' ? { ...save.winsBy, [run.sausage]: (save.winsBy[run.sausage] ?? 0) + 1 } : save.winsBy,
    bestEscapeBy: outcome === 'home'
      ? { ...save.bestEscapeBy, [run.sausage]: Math.max(save.bestEscapeBy[run.sausage] ?? 0, loc.course + 1) }
      : save.bestEscapeBy,
    history: [{ sausage: run.sausage, course: loc.course, outcome, spice: kept + bonus, wave: waveReached, chili: run.chili }, ...save.history]
      .slice(0, HISTORY_SIZE),
  };
  writeSave(next);

  const newSausages = SAUSAGE_IDS.filter((id) => {
    const recipe = SAUSAGES[id].unlock.recipe;
    return recipe && cookedNow.includes(recipe) && sausageState(id, next) === 'buyable';
  });
  return {
    outcome,
    bag,
    kept,
    bonus,
    lost: bag - kept,
    trophiesKept,
    trophiesLost,
    bankedDuringRun: run.bankedDuringRun,
    cooked: cookedNow,
    recipeSpice,
    progress,
    spiceBefore: save.spice,
    spiceAfter: next.spice,
    newSausages,
    newChili,
    talentsAffordable: TALENT_IDS.filter((id) => canBuyTalent(id, next.talents, next.spice, next.trophies, next.cooked).ok).length,
    sausagesAffordable: SAUSAGE_IDS.filter((id) => sausageState(id, next) === 'buyable' && canAffordSausage(id, next)).length,
  };
}
