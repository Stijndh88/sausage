import { describe, expect, it } from 'vitest';
import { Doneness, MAX_HEAT, tierFor } from '../src/systems/Doneness';

describe('tierFor', () => {
  it('maps heat to the right tier at each boundary', () => {
    expect(tierFor(0).name).toBe('Raw');
    expect(tierFor(24.9).name).toBe('Raw');
    expect(tierFor(25).name).toBe('Medium');
    expect(tierFor(59).name).toBe('Medium');
    expect(tierFor(60).name).toBe('Well-done');
    expect(tierFor(90).name).toBe('Burnt');
    expect(tierFor(100).name).toBe('Charred');
  });

  it('rewards running hot', () => {
    expect(tierFor(10).damageMult).toBeLessThan(tierFor(40).damageMult);
    expect(tierFor(40).damageMult).toBeLessThan(tierFor(70).damageMult);
    expect(tierFor(70).damageMult).toBeLessThan(tierFor(95).damageMult);
  });
});

describe('Doneness', () => {
  it('applies heat resistance and clamps at max', () => {
    const d = new Doneness(50);
    d.heatTakenMult = 0.5;
    expect(d.addHeat(10)).toBe(5);
    expect(d.heat).toBe(55);
    d.addHeat(1000);
    expect(d.heat).toBe(MAX_HEAT);
    expect(d.isCharred).toBe(true);
  });

  it('cools over time but never below zero, and stops once charred', () => {
    const d = new Doneness(3);
    d.coolPerSec = 2;
    d.tick(1);
    expect(d.heat).toBe(1);
    d.tick(5);
    expect(d.heat).toBe(0);

    const dead = new Doneness(MAX_HEAT);
    dead.tick(10);
    expect(dead.heat).toBe(MAX_HEAT);
  });

  it('halves heat between waves', () => {
    expect(Doneness.carryOver(80)).toBe(40);
  });
});
