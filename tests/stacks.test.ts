import { describe, expect, it } from 'vitest';
import { WEAPON_IDS } from '../src/data/weapons';
import { STACKS, STACK_THRESHOLDS, nextStack, stackBonus, stackCounts, stackLevel, stackStepText } from '../src/data/stacks';

describe('weapon stacking bonuses', () => {
  it('every weapon has a bonus at 2, 4 and 6 copies, each with a readable line', () => {
    expect([...STACK_THRESHOLDS]).toEqual([2, 4, 6]);
    for (const id of WEAPON_IDS) {
      expect(STACKS[id], id).toHaveLength(3);
      for (const step of STACKS[id]) expect(stackStepText(id, step).length, id).toBeGreaterThan(0);
    }
  });

  it('one copy gets nothing; bonuses add up as copies are added', () => {
    expect(stackLevel(1)).toBe(0);
    expect(stackLevel(2)).toBe(1);
    expect(stackLevel(5)).toBe(2);
    expect(stackLevel(8)).toBe(3);
    expect(stackBonus('onion', 1)).toEqual(stackBonus('onion', 0));
    expect(stackBonus('onion', 2).rangeMult).toBeCloseTo(1.15);
    expect(stackBonus('onion', 4).extraProjectiles).toBe(1);
    const six = stackBonus('onion', 6);
    expect(six.rangeMult).toBeCloseTo(1.15);
    expect(six.extraProjectiles).toBe(1);
    expect(six.damageMult).toBeCloseTo(1.25);
  });

  it('counts copies and names the next bonus', () => {
    const counts = stackCounts([{ id: 'onion', tier: 1 }, { id: 'pepper', tier: 2 }, { id: 'onion', tier: 3 }]);
    expect(counts.get('onion')).toBe(2);
    expect(counts.get('pepper')).toBe(1);
    expect(nextStack('onion', 2)).toEqual({ at: 4, text: '+1 ring' });
    expect(nextStack('toothpick', 0)).toEqual({ at: 2, text: '+15% fire rate' });
    expect(nextStack('onion', 6)).toBeNull();
  });

  it('stack bonuses stay modest: 6 copies add under 60% damage x fire rate per link', () => {
    for (const id of WEAPON_IDS) {
      const b = stackBonus(id, 6);
      expect(b.damageMult * b.fireRateMult, id).toBeLessThan(1.6);
    }
  });
});
