import Phaser from 'phaser';
import type { EnemyKind } from '../data/enemies';
import type { WaveConfig } from '../data/waves';
import { audio } from '../audio/Audio';
import { type Rng, pickWeighted, randRange } from './rng';

const TELEGRAPH_MS = 750;
const MIN_PLAYER_DIST = 240;

export interface DirectorHooks {
  spawn(kind: EnemyKind, x: number, y: number): void;
  alive(): { total: number; turrets: number };
  player(): { x: number; y: number };
}

/** Decides what spawns where and when. Every spawn is telegraphed with a red X first. */
export class WaveDirector {
  elapsedMs = 0;
  private nextSpawnMs = 400;
  private stopped = false;
  private pendingTurrets = 0;
  private readonly marks = new Set<Phaser.GameObjects.Image>();

  constructor(
    private readonly scene: Phaser.Scene,
    readonly cfg: WaveConfig,
    private readonly rng: Rng,
    private readonly arena: Phaser.Geom.Rectangle,
    private readonly hooks: DirectorHooks,
  ) {
    if (cfg.boss) this.telegraph('tongs', arena.centerX, arena.top + 140, 1400);
  }

  get timeLeftSec(): number {
    return Math.max(0, this.cfg.durationSec - this.elapsedMs / 1000);
  }

  get timeUp(): boolean {
    return !this.cfg.boss && this.elapsedMs >= this.cfg.durationSec * 1000;
  }

  update(dtMs: number): void {
    if (this.stopped) return;
    this.elapsedMs += dtMs;
    if (this.elapsedMs < this.nextSpawnMs) return;

    // Spawn faster as the wave goes on.
    const progress = this.cfg.boss ? 0 : Math.min(1, this.elapsedMs / (this.cfg.durationSec * 1000));
    this.nextSpawnMs = this.elapsedMs + this.cfg.spawnIntervalMs * (1 - 0.25 * progress);

    const alive = this.hooks.alive();
    const room = this.cfg.maxAlive - alive.total - this.marks.size;
    const count = Math.min(this.cfg.batch + (progress > 0.7 && this.cfg.batch >= 3 ? 1 : 0), room);
    for (let i = 0; i < count; i++) {
      let kind = pickWeighted(this.rng, this.cfg.weights) as EnemyKind;
      if (kind === 'hotsauce' && alive.turrets + this.pendingTurrets >= this.cfg.maxTurrets) kind = 'fork';
      const minDist = kind === 'hotsauce' ? 320 : MIN_PLAYER_DIST;
      const pos = this.pickSpot(minDist);
      this.telegraph(kind, pos.x, pos.y, TELEGRAPH_MS);
    }
  }

  /**
   * Boss summons go through the same rules as normal spawns: telegraphed, at least
   * MIN_PLAYER_DIST from the sausage (near the summoner when possible) and within maxAlive.
   */
  summon(kind: EnemyKind, nearX: number, nearY: number): void {
    if (this.stopped) return;
    if (this.cfg.maxAlive - this.hooks.alive().total - this.marks.size <= 0) return;
    const p = this.hooks.player();
    const a = this.arena;
    for (let tries = 0; tries < 16; tries++) {
      const ang = this.rng() * Math.PI * 2;
      const r = 60 + this.rng() * 160;
      const x = nearX + Math.cos(ang) * r;
      const y = nearY + Math.sin(ang) * r;
      if (x < a.left + 30 || x > a.right - 30 || y < a.top + 30 || y > a.bottom - 30) continue;
      if (Math.hypot(x - p.x, y - p.y) < MIN_PLAYER_DIST) continue;
      this.telegraph(kind, x, y, TELEGRAPH_MS);
      return;
    }
    const spot = this.pickSpot(MIN_PLAYER_DIST);
    this.telegraph(kind, spot.x, spot.y, TELEGRAPH_MS);
  }

  stop(): void {
    this.stopped = true;
    for (const m of this.marks) this.removeMark(m);
    this.marks.clear();
  }

  /** Destroy a spawn mark and its looping blink tween (Phaser doesn't kill tweens with their target). */
  private removeMark(mark: Phaser.GameObjects.Image): void {
    this.scene.tweens.killTweensOf(mark);
    mark.destroy();
  }

  private pickSpot(minDist: number): { x: number; y: number } {
    const p = this.hooks.player();
    const a = this.arena;
    for (let tries = 0; tries < 20; tries++) {
      const x = randRange(this.rng, a.left + 30, a.right - 30);
      const y = randRange(this.rng, a.top + 30, a.bottom - 30);
      if (Math.hypot(x - p.x, y - p.y) >= minDist) return { x, y };
    }
    // Fallback: the corner farthest from the player.
    return { x: p.x < a.centerX ? a.right - 40 : a.left + 40, y: p.y < a.centerY ? a.bottom - 40 : a.top + 40 };
  }

  private telegraph(kind: EnemyKind, x: number, y: number, ms: number): void {
    if (kind === 'hotsauce') this.pendingTurrets++;
    audio.play('telegraph');
    const mark = this.scene.add.image(x, y, 'spawn-mark').setDepth(2).setScale(kind === 'tongs' ? 3 : 1);
    this.marks.add(mark);
    this.scene.tweens.add({ targets: mark, alpha: 0.25, duration: 120, yoyo: true, repeat: -1 });
    this.scene.time.delayedCall(ms, () => {
      if (kind === 'hotsauce') this.pendingTurrets--;
      if (!this.marks.has(mark)) return; // wave ended
      this.marks.delete(mark);
      this.removeMark(mark);
      if (!this.stopped) this.hooks.spawn(kind, x, y);
    });
  }
}
