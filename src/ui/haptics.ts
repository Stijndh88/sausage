import { getSettings } from '../state/settings';
import { getInputMode } from './inputMode';

export type Haptic = 'hit' | 'death' | 'save' | 'bossDown';

/** [ms, strong motor, weak motor] per event. */
const EFFECTS: Record<Haptic, [number, number, number]> = {
  hit: [120, 0.55, 0.35],
  save: [260, 0.7, 0.5],
  death: [550, 1, 0.8],
  bossDown: [700, 0.8, 1],
};

interface Actuator {
  playEffect?(type: string, params: { duration: number; strongMagnitude: number; weakMagnitude: number; startDelay?: number }): Promise<unknown>;
}

/**
 * Controller rumble (when playing on a pad) or phone vibration (when playing by touch).
 * Off when the "Vibration" setting is off. Never throws: support varies a lot by browser
 * (iPhones can't vibrate from a web page at all).
 */
export function haptic(kind: Haptic): void {
  if (!getSettings().vibration) return;
  const [ms, strong, weak] = EFFECTS[kind];
  try {
    const mode = getInputMode();
    if (mode === 'pad') {
      for (const pad of navigator.getGamepads?.() ?? []) {
        const act = (pad as unknown as { vibrationActuator?: Actuator } | null)?.vibrationActuator;
        act?.playEffect?.('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak, startDelay: 0 })?.catch?.(() => {});
      }
    } else if (mode === 'touch') {
      navigator.vibrate?.(Math.round(ms * 0.5));
    }
  } catch {
    // Unsupported: no rumble.
  }
}
