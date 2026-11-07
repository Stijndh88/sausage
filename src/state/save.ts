import { SAUSAGES, type SausageId, type Unlock } from '../data/sausages';

/**
 * Everything kept between runs, in localStorage. Storage can be missing or throw (private
 * windows, blocked site data), so every access is guarded and the game works without it.
 */
export interface SaveData {
  version: 1;
  bestWave: number;
  wins: number;
  runs: number;
  /** Best wave reached per sausage, and wins per sausage. */
  bestWaveBy: Partial<Record<SausageId, number>>;
  winsBy: Partial<Record<SausageId, number>>;
  lastSausage: SausageId;
  tutorialDone: boolean;
}

const KEY = 'wurst-case-scenario/save';

export function defaultSave(): SaveData {
  return { version: 1, bestWave: 0, wins: 0, runs: 0, bestWaveBy: {}, winsBy: {}, lastSausage: 'frank', tutorialDone: false };
}

let cache: SaveData | null = null;

export function loadSave(): SaveData {
  if (cache) return cache;
  let data = defaultSave();
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (raw) data = { ...data, ...JSON.parse(raw) };
  } catch {
    // Unreadable or blocked storage: play with a fresh profile.
  }
  if (!(data.lastSausage in SAUSAGES)) data.lastSausage = 'frank';
  cache = data;
  return data;
}

export function writeSave(data: SaveData): void {
  cache = data;
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(data));
  } catch {
    // Storage full or blocked: progress just isn't kept.
  }
}

/** Records the end of a run. Returns the sausages this run unlocked. */
export function recordRun(sausage: SausageId, waveReached: number, won: boolean): SausageId[] {
  const before = unlockedSausages();
  const s = { ...loadSave() };
  s.runs++;
  s.bestWave = Math.max(s.bestWave, waveReached);
  s.bestWaveBy = { ...s.bestWaveBy, [sausage]: Math.max(s.bestWaveBy[sausage] ?? 0, waveReached) };
  if (won) {
    s.wins++;
    s.winsBy = { ...s.winsBy, [sausage]: (s.winsBy[sausage] ?? 0) + 1 };
  }
  writeSave(s);
  return unlockedSausages().filter((id) => !before.includes(id));
}

export function isUnlocked(u: Unlock, save: SaveData = loadSave()): boolean {
  switch (u.kind) {
    case 'always': return true;
    case 'reachWave': return save.bestWave >= u.wave;
    case 'win': return save.wins > 0;
    case 'winWith': return (save.winsBy[u.sausage] ?? 0) > 0;
  }
}

export function unlockedSausages(save: SaveData = loadSave()): SausageId[] {
  return (Object.keys(SAUSAGES) as SausageId[]).filter((id) => isUnlocked(SAUSAGES[id].unlock, save));
}

/** For tests: forget the in-memory copy so the next load reads storage again. */
export function resetSaveCache(): void {
  cache = null;
}
