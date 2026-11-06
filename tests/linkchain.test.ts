import { describe, expect, it } from 'vitest';
import { Trail } from '../src/systems/Trail';

describe('Trail', () => {
  it('prefills a straight line behind the head', () => {
    const t = new Trail(2, 100);
    t.prefill(100, 100, 0); // facing right
    const p = t.sample(30);
    expect(p.x).toBeCloseTo(70);
    expect(p.y).toBeCloseTo(100);
    expect(p.angle).toBeCloseTo(0);
  });

  it('follows the path the head took around a corner', () => {
    const t = new Trail(1, 500);
    t.prefill(0, 0, 0);
    for (let x = 0; x <= 50; x++) t.push(x, 0); // move right
    for (let y = 1; y <= 50; y++) t.push(50, y); // then down
    const near = t.sample(10);
    expect(near.x).toBeCloseTo(50);
    expect(near.y).toBeCloseTo(40);
    expect(near.angle).toBeCloseTo(Math.PI / 2);
    const far = t.sample(70);
    expect(far.x).toBeCloseTo(30);
    expect(far.y).toBeCloseTo(0);
  });

  it('ignores tiny moves and caps its length', () => {
    const t = new Trail(5, 50);
    t.push(0, 0);
    t.push(1, 0);
    expect(t.pointCount).toBe(1);
    for (let x = 5; x <= 500; x += 5) t.push(x, 0);
    expect(t.length).toBeLessThanOrEqual(55);
    const end = t.sample(1000);
    expect(end.x).toBeGreaterThanOrEqual(445);
  });
});
