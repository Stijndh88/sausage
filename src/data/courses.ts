import type { EnemyKind } from './enemies';

/**
 * A run is a meal served in courses. Each course is a few waves and a boss; after every boss the
 * player takes the doggy bag home or goes on to the next course ("seconds").
 *
 * Waves are numbered globally across the run (run.wave = 1, 2, 3, ...) so the shop, prices and
 * rarity odds keep working on one number; `locate()` turns that number into a course and a wave
 * within it.
 */
export type TrophyId = 'tong_tip' | 'grinder_blade' | 'smoked_brisket';

export interface TrophyDef {
  id: TrophyId;
  name: string;
  /** Short name for tight spots (HUD, buttons). */
  short: string;
  color: number;
  css: string;
}

export const TROPHIES: Record<TrophyId, TrophyDef> = {
  tong_tip: { id: 'tong_tip', name: 'Tong Tip', short: 'Tong Tip', color: 0xb040ff, css: '#c070ff' },
  grinder_blade: { id: 'grinder_blade', name: 'Grinder Blade', short: 'Blade', color: 0x8fd3ff, css: '#8fd3ff' },
  smoked_brisket: { id: 'smoked_brisket', name: 'Smoked Brisket', short: 'Brisket', color: 0xff9a4a, css: '#ff9a4a' },
};

export const TROPHY_IDS = Object.keys(TROPHIES) as TrophyId[];

/** How a course's boss looks and fights. All bosses share the Tongs' move set, with twists. */
export interface BossStyle {
  name: string;
  /** Its own sprite (falls back to the Tongs if the texture is missing). */
  texture: string;
  tint: number;
  scale: number;
  /** Multiplies the time between attacks (lower = attacks more often). */
  fireMult: number;
  /** What it summons. */
  minion: Exclude<EnemyKind, 'tongs' | 'goblin'>;
  /** Adds a spiral burst after its normal attacks. */
  extraAttack: boolean;
}

export interface CourseDef {
  id: 'backyard' | 'kitchen' | 'smokehouse';
  name: string;
  /** Normal waves before the boss. */
  waves: number;
  boss: BossStyle;
  trophy: TrophyId;
  /** Tint over the arena background so each course looks different. */
  arenaTint: number;
  /** Banner line when the course starts. */
  intro: string;
}

export const COURSES: readonly CourseDef[] = [
  {
    id: 'backyard', name: 'The Backyard', waves: 6, trophy: 'tong_tip', arenaTint: 0xffffff,
    intro: 'Escape the BBQ!',
    boss: { name: "The Grill Master's Tongs", texture: 'enemy-tongs', tint: 0xffffff, scale: 1, fireMult: 1, minion: 'fork', extraAttack: false },
  },
  {
    id: 'kitchen', name: 'The Kitchen', waves: 5, trophy: 'grinder_blade', arenaTint: 0xbcd4ff,
    intro: 'Everything in here is sharp.',
    boss: { name: 'The Meat Grinder', texture: 'enemy-grinder', tint: 0xffffff, scale: 1.1, fireMult: 0.85, minion: 'spatula', extraAttack: false },
  },
  {
    id: 'smokehouse', name: 'The Smokehouse', waves: 5, trophy: 'smoked_brisket', arenaTint: 0xc8a088,
    intro: 'Low and slow. Very slow.',
    boss: { name: 'Big Smokey', texture: 'enemy-smokey', tint: 0xffffff, scale: 1.25, fireMult: 0.8, minion: 'ketchup', extraAttack: true },
  },
];

/** Waves in a course, counting its boss. */
export function courseLength(course: number): number {
  return course < COURSES.length ? COURSES[course].waves + 1 : COURSES[1].waves + 1;
}

/** First global wave of a course. */
export function courseStart(course: number): number {
  let w = 1;
  for (let c = 0; c < course; c++) w += courseLength(c);
  return w;
}

export interface WaveLocation {
  /** 0 = Backyard, 1 = Kitchen, 2 = Smokehouse, 3+ = Seconds loops. */
  course: number;
  /** 1-based wave within the course; the last one is the boss. */
  courseWave: number;
  /** Normal waves in this course (the boss comes after them). */
  waves: number;
  boss: boolean;
}

export function locate(globalWave: number): WaveLocation {
  let w = Math.max(1, Math.floor(Number.isFinite(globalWave) ? globalWave : 1));
  let course = 0;
  // Cap the walk so absurd inputs stay cheap.
  while (course < 500 && w > courseLength(course)) {
    w -= courseLength(course);
    course++;
  }
  const len = courseLength(course);
  w = Math.min(w, len);
  return { course, courseWave: w, waves: len - 1, boss: w === len };
}

/** The course's definition; Seconds loops remix the three courses in turn. */
export function courseDef(course: number): CourseDef {
  return COURSES[course < COURSES.length ? course : (course - COURSES.length) % COURSES.length];
}

/** "The Kitchen", or "Seconds #2" for the endless loops. */
export function courseName(course: number): string {
  return course < COURSES.length ? COURSES[course].name : `Seconds #${course - COURSES.length + 1}`;
}

export function bossName(course: number): string {
  const name = courseDef(course).boss.name;
  return course < COURSES.length ? name : `${name} (remix)`;
}

/** Spice multiplier of a course: x1, x1.5, x2, then +0.5 per Seconds loop. */
export function courseSpiceMult(course: number): number {
  return 1 + 0.5 * Math.max(0, course);
}

/** Trophy the course's boss drops. */
export function courseTrophy(course: number): TrophyId {
  return courseDef(course).trophy;
}
