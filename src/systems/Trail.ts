/**
 * Records the head's recent path so sausage links can follow it like a snake.
 * Points are stored newest-first; `sample(d)` returns the point `d` pixels back along the path.
 */
export interface TrailPoint {
  x: number;
  y: number;
  /** Direction of travel at this point, in radians. */
  angle: number;
}

export class Trail {
  private pts: { x: number; y: number }[] = [];

  constructor(
    private readonly minStep = 2,
    private readonly maxLength = 400,
  ) {}

  /** Lay a straight trail behind (x, y) so links start neatly lined up. */
  prefill(x: number, y: number, angle: number): void {
    this.pts = [];
    const dx = -Math.cos(angle);
    const dy = -Math.sin(angle);
    for (let d = 0; d <= this.maxLength; d += this.minStep * 2) {
      this.pts.push({ x: x + dx * d, y: y + dy * d });
    }
  }

  push(x: number, y: number): void {
    const head = this.pts[0];
    if (head && Math.hypot(x - head.x, y - head.y) < this.minStep) return;
    this.pts.unshift({ x, y });
    this.trim();
  }

  get length(): number {
    let total = 0;
    for (let i = 1; i < this.pts.length; i++) total += dist(this.pts[i - 1], this.pts[i]);
    return total;
  }

  get pointCount(): number {
    return this.pts.length;
  }

  sample(distance: number): TrailPoint {
    if (this.pts.length === 0) return { x: 0, y: 0, angle: 0 };
    if (this.pts.length === 1) return { ...this.pts[0], angle: 0 };
    let remaining = Math.max(0, distance);
    for (let i = 1; i < this.pts.length; i++) {
      const a = this.pts[i - 1];
      const b = this.pts[i];
      const seg = dist(a, b);
      // Direction of travel goes from older (b) to newer (a).
      const angle = Math.atan2(a.y - b.y, a.x - b.x);
      if (remaining <= seg) {
        const t = seg === 0 ? 0 : remaining / seg;
        return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, angle };
      }
      remaining -= seg;
    }
    const last = this.pts[this.pts.length - 1];
    const prev = this.pts[this.pts.length - 2];
    return { x: last.x, y: last.y, angle: Math.atan2(prev.y - last.y, prev.x - last.x) };
  }

  private trim(): void {
    let total = 0;
    for (let i = 1; i < this.pts.length; i++) {
      total += dist(this.pts[i - 1], this.pts[i]);
      if (total > this.maxLength) {
        this.pts.length = i + 1;
        return;
      }
    }
  }
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
