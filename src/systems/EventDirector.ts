import Phaser from 'phaser';
import { EVENT_TEX_SCALE } from '../art/textures';
import { audio } from '../audio/Audio';
import type { EnemyKind } from '../data/enemies';
import {
  BASKET_LIFETIME_SEC, BASKET_OPEN_SEC, BASKET_RADIUS, BOUNTY_SEC, ELITE_HP_MULT, ELITE_SCALE, EVENTS,
  FLARE_BURN_SEC, FLARE_DAMAGE, FLARE_LANE, GOLDEN_LIFETIME_SEC, GOLDEN_SPEED_FRACTION, HAPPY_CRUMB_MULT,
  HAPPY_FIRE_RATE, HAPPY_HOUR_SEC, RAIN_DAMAGE, RAIN_DROPS, RAIN_RADIUS, RAIN_SEC, STAMPEDE_DAMAGE, STAMPEDE_SPEED,
  type EventKind, type ScheduledEvent, bountyCrumbs, bountyTarget, eliteCrumbs, goldenCrumbs,
} from '../data/events';
import type { WaveConfig } from '../data/waves';
import { BASE_SPEED } from '../entities/SausageHead';
import { getSettings } from '../state/settings';
import { FONT, HUD_H } from '../ui/Hud';
import { type Rng, pickWeighted, randRange } from './rng';

export interface EventHooks {
  player(): { x: number; y: number; invulnerable: boolean };
  /** A hazard hit the sausage (goes through dodge, armor and i-frames like any hit). */
  hurt(damage: number, source: string): void;
  spawnElite(kind: EnemyKind, x: number, y: number, elite: { hpMult: number; scale: number }): void;
  spawnCrumbs(x: number, y: number, count: number): void;
  spawnCondiment(x: number, y: number): void;
  /** Adds a random item (rolled for this wave) to the run. Returns its name and colour, or null. */
  grantItem(): { name: string; color: string } | null;
  floatText(x: number, y: number, text: string, color: string): void;
  /** True where a prop shouldn't land (hot grill tiles). */
  blocked(x: number, y: number, radius: number): boolean;
  /** Kills so far this run (for bounties). */
  kills(): number;
  /** An event just started (the How to Play screen learns about it here). */
  onEventStart?(kind: EventKind): void;
  /** Every event ends here exactly once (unless the wave ends first): the one place rewards are paid. */
  onEventDone(result: EventResult): void;
}

/**
 * How an event ended. `success`: basket opened, golden hot dog caught, bounty met, elite killed,
 * Happy Hour lived through, or a hazard dodged without being hit. `crumbs`: the crumb reward dropped.
 */
export interface EventResult {
  kind: EventKind;
  success: boolean;
  crumbs: number;
  wave: number;
}

interface Running {
  kind: EventKind;
  startedMs: number;
  /** Called every frame; returns true when the event is over. */
  tick(nowMs: number, dtSec: number): boolean;
  cleanup(): void;
}

const TELEGRAPH_MS = 900;
const css = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

/**
 * Runs a wave's timed events (rolled up front, see data/events.ts). Time is the wave clock
 * (WaveDirector.elapsedMs), so events pause, slow down and stop with the fight.
 */
export class EventDirector {
  private next = 0;
  private readonly running: Running[] = [];
  private stopped = false;
  private happyUntilMs = -1;
  private nowMs = 0;
  /** Status line at the top of the arena for the event(s) in progress. */
  private readonly status: Phaser.GameObjects.Text;
  /** Events that already fired, for tests and the HUD track. */
  readonly fired: EventKind[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    readonly schedule: readonly ScheduledEvent[],
    private readonly cfg: WaveConfig,
    private readonly rng: Rng,
    private readonly arena: Phaser.Geom.Rectangle,
    private readonly hooks: EventHooks,
  ) {
    this.status = scene.add.text(arena.centerX, HUD_H + 22, '', {
      fontFamily: FONT, fontSize: '18px', fontStyle: 'bold', color: '#ffffff', stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(55);
  }

  /** Fire-rate multiplier from events (Happy Hour). */
  get fireRateMult(): number {
    return this.happyActive ? HAPPY_FIRE_RATE : 1;
  }

  /** Crumb multiplier from events (Happy Hour). */
  get crumbMult(): number {
    return this.happyActive ? HAPPY_CRUMB_MULT : 1;
  }

  private get happyActive(): boolean {
    return !this.stopped && this.nowMs < this.happyUntilMs;
  }

  /** Start an event right now (tests, and the scheduler below). */
  trigger(kind: EventKind): void {
    if (this.stopped) return;
    const def = EVENTS[kind];
    this.fired.push(kind);
    this.hooks.onEventStart?.(kind);
    this.announce(def.name, def.hint, css(def.color));
    audio.play(def.category === 'hazard' || def.category === 'fight' ? 'waveStart' : 'unlock');
    const start = this.nowMs;
    const run = this.start(kind, start);
    if (run) this.running.push(run);
  }

  update(elapsedMs: number, dtSec: number): void {
    if (this.stopped) return;
    this.nowMs = elapsedMs;
    while (this.next < this.schedule.length && elapsedMs >= this.schedule[this.next].atSec * 1000) {
      this.trigger(this.schedule[this.next++].kind);
    }
    for (let i = this.running.length - 1; i >= 0; i--) {
      const r = this.running[i];
      if (r.tick(elapsedMs, dtSec)) {
        r.cleanup();
        this.running.splice(i, 1);
      }
    }
    this.refreshStatus();
  }

  /** Called by the Game for every kill. */
  onKill(e: { x: number; y: number; elite: boolean }): void {
    if (!e.elite || this.stopped) return;
    audio.play('waveClear');
    this.finish('elite', true, eliteCrumbs(this.cfg.wave), e.x, e.y);
    this.hooks.spawnCondiment(e.x + 20, e.y);
    this.hooks.floatText(e.x, e.y - 40, 'ELITE DOWN!', css(EVENTS.elite.color));
  }

  /** Pays out (crumbs dropped at x,y) and reports the result. All event rewards go through here. */
  private finish(kind: EventKind, success: boolean, crumbs = 0, x = 0, y = 0): void {
    if (crumbs > 0) this.hooks.spawnCrumbs(x, y, crumbs);
    this.hooks.onEventDone({ kind, success, crumbs, wave: this.cfg.wave });
  }

  stop(): void {
    this.stopped = true;
    for (const r of this.running) r.cleanup();
    this.running.length = 0;
    this.status.setText('');
  }

  // ---------------------------------------------------------------------------

  private statusLines = new Map<Running, string>();

  private refreshStatus(): void {
    const parts = this.running.map((r) => this.statusLines.get(r)).filter((s): s is string => !!s);
    const text = parts.join('   ·   ');
    if (this.status.text !== text) this.status.setText(text);
  }

  private setStatus(r: Running, text: string | null): void {
    if (text) this.statusLines.set(r, text);
    else this.statusLines.delete(r);
  }

  private announce(title: string, hint: string, color: string): void {
    const y = HUD_H + 60;
    const t = this.scene.add.text(this.arena.centerX, y, title, {
      fontFamily: FONT, fontSize: '30px', fontStyle: 'bold', color, stroke: '#1a0a05', strokeThickness: 6,
    }).setOrigin(0.5).setDepth(56);
    const s = this.scene.add.text(this.arena.centerX, y + 30, hint, {
      fontFamily: FONT, fontSize: '16px', color: '#ffffff', stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(56);
    t.setScale(0.7);
    this.scene.tweens.add({ targets: t, scale: 1, duration: 200, ease: 'Back.Out' });
    this.scene.tweens.add({ targets: [t, s], alpha: 0, delay: 2000, duration: 400, onComplete: () => { t.destroy(); s.destroy(); } });
  }

  private start(kind: EventKind, t0: number): Running | null {
    switch (kind) {
      case 'basket': return this.basket(t0);
      case 'golden': return this.golden(t0);
      case 'happy': return this.happy(t0);
      case 'bounty': return this.bounty(t0);
      case 'elite': return this.elite(t0);
      case 'stampede': return this.stampede(t0);
      case 'flare': return this.flare(t0);
      case 'rain': return this.rain(t0);
    }
  }

  /** A spot at least `minDist` from the sausage, `margin` inside the arena. */
  private spot(minDist: number, margin = 80, clearRadius = 0): { x: number; y: number } {
    const p = this.hooks.player();
    const a = this.arena;
    for (let i = 0; i < 40; i++) {
      const x = randRange(this.rng, a.left + margin, a.right - margin);
      const y = randRange(this.rng, a.top + margin, a.bottom - margin);
      if (Math.hypot(x - p.x, y - p.y) < minDist) continue;
      if (clearRadius > 0 && i < 30 && this.hooks.blocked(x, y, clearRadius)) continue;
      return { x, y };
    }
    return { x: p.x < a.centerX ? a.right - margin : a.left + margin, y: p.y < a.centerY ? a.bottom - margin : a.top + margin };
  }

  private image(x: number, y: number, key: string, w: number, h: number): Phaser.GameObjects.Image {
    return this.scene.add.image(x, y, key).setDisplaySize(w, h);
  }

  // --- Picnic Basket: stand in the circle to open it -----------------------------------------

  private basket(t0: number): Running {
    const { x, y } = this.spot(220, 110, BASKET_RADIUS);
    const img = this.image(x, y, 'evt-basket', 52, 44).setDepth(3);
    const ring = this.scene.add.graphics().setDepth(2);
    img.setScale(0);
    this.scene.tweens.add({ targets: img, scaleX: 1 / EVENT_TEX_SCALE, scaleY: 1 / EVENT_TEX_SCALE, duration: 300, ease: 'Bounce.Out' });
    let progress = 0;
    let opened = false;
    const r: Running = {
      kind: 'basket',
      startedMs: t0,
      tick: (now, dt) => {
        const p = this.hooks.player();
        const inside = Math.hypot(p.x - x, p.y - y) < BASKET_RADIUS;
        progress = Phaser.Math.Clamp(progress + (inside ? dt : -2 * dt), 0, BASKET_OPEN_SEC);
        const left = BASKET_LIFETIME_SEC - (now - t0) / 1000;
        const blink = left < 4 && Math.floor(now / 150) % 2 === 0;
        ring.clear();
        ring.fillStyle(0x6fd36b, inside ? 0.18 : 0.08).fillCircle(x, y, BASKET_RADIUS);
        ring.lineStyle(3, 0x6fd36b, blink ? 0.3 : 0.9).strokeCircle(x, y, BASKET_RADIUS);
        if (progress > 0) {
          ring.lineStyle(7, 0xffffff, 1).beginPath();
          ring.arc(x, y, BASKET_RADIUS, -Math.PI / 2, -Math.PI / 2 + (progress / BASKET_OPEN_SEC) * Math.PI * 2, false).strokePath();
        }
        this.setStatus(r, `PICNIC BASKET ${Math.ceil(Math.max(0, left))}s`);
        if (progress >= BASKET_OPEN_SEC) {
          opened = true;
          const item = this.hooks.grantItem();
          audio.play('waveClear');
          this.finish('basket', true, 3 + Math.floor(this.cfg.wave / 2), x, y);
          if (item) this.hooks.floatText(x, y - 50, `+ ${item.name}`, item.color);
          return true;
        }
        return left <= 0;
      },
      cleanup: () => {
        this.setStatus(r, null);
        ring.destroy();
        this.scene.tweens.killTweensOf(img);
        if (opened || this.stopped) {
          img.destroy();
          return;
        }
        this.finish('basket', false);
        this.scene.tweens.add({ targets: img, alpha: 0, duration: 250, onComplete: () => img.destroy() });
      },
    };
    return r;
  }

  // --- Golden Hot Dog: a runner that flees ---------------------------------------------------

  private golden(t0: number): Running {
    const { x, y } = this.spot(300, 80);
    const img = this.scene.add.image(x, y, 'sausage-head').setDepth(9).setScale(1.15).setTintFill(0xffd23f);
    const glow = this.scene.add.image(x, y, 'ring').setDepth(8).setTint(0xffd23f).setScale(0.8).setAlpha(0.6);
    const speed = BASE_SPEED * GOLDEN_SPEED_FRACTION;
    let heading = this.rng() * Math.PI * 2;
    let caught = false;
    const a = this.arena;
    const r: Running = {
      kind: 'golden',
      startedMs: t0,
      tick: (now, dt) => {
        const p = this.hooks.player();
        const dx = img.x - p.x;
        const dy = img.y - p.y;
        const dist = Math.hypot(dx, dy) || 1;
        if (dist < 28) {
          caught = true;
          audio.play('save');
          this.finish('golden', true, goldenCrumbs(this.cfg.wave), img.x, img.y);
          this.hooks.floatText(img.x, img.y - 30, 'CAUGHT!', '#ffd23f');
          return true;
        }
        // Flee from the sausage when it is close, wander otherwise; walls push back so it can't hide in a corner.
        let fx = Math.cos(heading) * 0.6;
        let fy = Math.sin(heading) * 0.6;
        if (dist < 320) {
          fx += (dx / dist) * 1.4;
          fy += (dy / dist) * 1.4;
        }
        const wall = 140;
        if (img.x - a.left < wall) fx += 2 * (1 - (img.x - a.left) / wall);
        if (a.right - img.x < wall) fx -= 2 * (1 - (a.right - img.x) / wall);
        if (img.y - a.top < wall) fy += 2 * (1 - (img.y - a.top) / wall);
        if (a.bottom - img.y < wall) fy -= 2 * (1 - (a.bottom - img.y) / wall);
        const want = Math.atan2(fy, fx);
        heading = Phaser.Math.Angle.RotateTo(heading, want, 4 * dt);
        heading += (this.rng() - 0.5) * 0.3;
        img.x = Phaser.Math.Clamp(img.x + Math.cos(heading) * speed * dt, a.left + 20, a.right - 20);
        img.y = Phaser.Math.Clamp(img.y + Math.sin(heading) * speed * dt, a.top + 20, a.bottom - 20);
        img.setRotation(heading);
        glow.setPosition(img.x, img.y).setScale(0.8 + Math.sin(now / 90) * 0.12);
        img.setTintFill(Math.floor(now / 140) % 2 ? 0xffd23f : 0xfff2a8);
        const left = GOLDEN_LIFETIME_SEC - (now - t0) / 1000;
        img.setAlpha(left < 3 && Math.floor(now / 120) % 2 === 0 ? 0.4 : 1);
        this.setStatus(r, `GOLDEN HOT DOG ${Math.ceil(Math.max(0, left))}s`);
        return left <= 0;
      },
      cleanup: () => {
        this.setStatus(r, null);
        glow.destroy();
        if (!caught && !this.stopped) {
          this.hooks.floatText(img.x, img.y - 30, 'It got away...', '#c8a890');
          this.finish('golden', false);
        }
        img.destroy();
      },
    };
    return r;
  }

  // --- Happy Hour: double crumbs and faster shots --------------------------------------------

  private happy(t0: number): Running {
    this.happyUntilMs = t0 + HAPPY_HOUR_SEC * 1000;
    const r: Running = {
      kind: 'happy',
      startedMs: t0,
      tick: (now) => {
        const left = (this.happyUntilMs - now) / 1000;
        this.setStatus(r, `HAPPY HOUR ${Math.ceil(Math.max(0, left))}s · 2× crumbs`);
        return left <= 0;
      },
      cleanup: () => {
        this.setStatus(r, null);
        if (!this.stopped) this.finish('happy', true);
      },
    };
    return r;
  }

  // --- Chef's Bounty: kill N in time ---------------------------------------------------------

  private bounty(t0: number): Running {
    const target = bountyTarget(this.cfg.wave);
    const base = this.hooks.kills();
    const r: Running = {
      kind: 'bounty',
      startedMs: t0,
      tick: (now) => {
        const got = this.hooks.kills() - base;
        const left = BOUNTY_SEC - (now - t0) / 1000;
        this.setStatus(r, `BOUNTY ${Math.min(got, target)}/${target} kills · ${Math.ceil(Math.max(0, left))}s`);
        if (got >= target) {
          const p = this.hooks.player();
          audio.play('buy');
          this.finish('bounty', true, bountyCrumbs(this.cfg.wave), p.x, p.y);
          this.hooks.floatText(p.x, p.y - 44, 'BOUNTY COMPLETE!', css(EVENTS.bounty.color));
          return true;
        }
        if (left <= 0) {
          const p = this.hooks.player();
          this.hooks.floatText(p.x, p.y - 44, 'Bounty failed', '#c8a890');
          this.finish('bounty', false);
          return true;
        }
        return false;
      },
      cleanup: () => this.setStatus(r, null),
    };
    return r;
  }

  // --- Elite: a big glowing enemy ------------------------------------------------------------

  private elite(t0: number): Running {
    const weights = { ...this.cfg.weights };
    delete weights.hotsauce; // a rooted turret makes a dull elite
    const kind = pickWeighted(this.rng, weights) as EnemyKind;
    const { x, y } = this.spot(300, 90);
    const mark = this.scene.add.image(x, y, 'spawn-mark').setDepth(2).setScale(2.2).setTint(0xd070ff);
    this.scene.tweens.add({ targets: mark, alpha: 0.25, duration: 120, yoyo: true, repeat: -1 });
    return {
      kind: 'elite',
      startedMs: t0,
      tick: (now) => {
        if (now - t0 < TELEGRAPH_MS * 1.5) return false;
        this.hooks.spawnElite(kind, x, y, { hpMult: ELITE_HP_MULT, scale: ELITE_SCALE });
        return true;
      },
      cleanup: () => {
        this.scene.tweens.killTweensOf(mark);
        mark.destroy();
      },
    };
  }

  // --- Fork Stampede: a line of forks charges across, with a gap ------------------------------

  private stampede(t0: number): Running {
    const a = this.arena;
    const horizontal = this.rng() < 0.6; // charge left↔right (the arena is wide) or top↔bottom
    const forward = this.rng() < 0.5;
    const spacing = 46;
    const span = horizontal ? a.height : a.width;
    const slots = Math.floor((span - 40) / spacing);
    // A gap of 3 slots, never right at the edge.
    const gapAt = 1 + Math.floor(this.rng() * (slots - 4));
    const dir = horizontal ? { x: forward ? 1 : -1, y: 0 } : { x: 0, y: forward ? 1 : -1 };
    const lanes: number[] = [];
    for (let i = 0; i < slots; i++) if (i < gapAt || i >= gapAt + 3) lanes.push(20 + spacing / 2 + i * spacing);

    const startPos = (lane: number) => horizontal
      ? { x: forward ? a.left - 20 : a.right + 20, y: a.top + lane }
      : { x: a.left + lane, y: forward ? a.top - 20 : a.bottom + 20 };
    const arrowPos = (lane: number) => horizontal
      ? { x: forward ? a.left + 22 : a.right - 22, y: a.top + lane }
      : { x: a.left + lane, y: forward ? a.top + 22 : a.bottom - 22 };

    const arrows = lanes.map((l) => {
      const p = arrowPos(l);
      return this.image(p.x, p.y, 'evt-arrow', 24, 24).setDepth(13).setTint(0xff5040).setRotation(Math.atan2(dir.y, dir.x));
    });
    for (const ar of arrows) this.scene.tweens.add({ targets: ar, alpha: 0.2, duration: 140, yoyo: true, repeat: -1 });

    const forks: Phaser.GameObjects.Image[] = [];
    let hit = false;
    const warn = EVENTS.stampede.warnMs;
    const r: Running = {
      kind: 'stampede',
      startedMs: t0,
      tick: (now, dt) => {
        if (now - t0 < warn) {
          this.setStatus(r, `FORK STAMPEDE in ${Math.ceil((warn - (now - t0)) / 1000)}s`);
          return false;
        }
        if (arrows.length) {
          for (const ar of arrows) { this.scene.tweens.killTweensOf(ar); ar.destroy(); }
          arrows.length = 0;
          audio.play('bossRoar');
          for (const l of lanes) {
            const p = startPos(l);
            forks.push(this.scene.add.image(p.x, p.y, 'enemy-fork').setDepth(7).setTint(0xffb0a0)
              .setRotation(Math.atan2(dir.y, dir.x) + Math.PI / 2));
          }
        }
        this.setStatus(r, null);
        const pl = this.hooks.player();
        let anyLeft = false;
        for (const f of forks) {
          f.x += dir.x * STAMPEDE_SPEED * dt;
          f.y += dir.y * STAMPEDE_SPEED * dt;
          if (f.x > a.left - 40 && f.x < a.right + 40 && f.y > a.top - 40 && f.y < a.bottom + 40) anyLeft = true;
          if (!pl.invulnerable && Math.abs(f.x - pl.x) < 22 && Math.abs(f.y - pl.y) < 22) { hit = true; this.hooks.hurt(STAMPEDE_DAMAGE, 'Fork Stampede'); }
        }
        if (!anyLeft) this.finish('stampede', !hit);
        return !anyLeft;
      },
      cleanup: () => {
        this.setStatus(r, null);
        for (const ar of arrows) { this.scene.tweens.killTweensOf(ar); ar.destroy(); }
        for (const f of forks) f.destroy();
      },
    };
    return r;
  }

  // --- Grease Flare-up: two lanes of fire ----------------------------------------------------

  private flare(t0: number): Running {
    const a = this.arena;
    const horizontal = this.rng() < 0.5;
    const span = horizontal ? a.height : a.width;
    // Two lanes, at least one lane-width apart, so there is always room between and around them.
    const pick = () => randRange(this.rng, FLARE_LANE / 2 + 10, span - FLARE_LANE / 2 - 10);
    const first = pick();
    let second = pick();
    for (let i = 0; i < 20 && Math.abs(second - first) < FLARE_LANE * 2; i++) second = pick();
    const rects = [first, second].map((c) => horizontal
      ? new Phaser.Geom.Rectangle(a.left, a.top + c - FLARE_LANE / 2, a.width, FLARE_LANE)
      : new Phaser.Geom.Rectangle(a.left + c - FLARE_LANE / 2, a.top, FLARE_LANE, a.height));
    const g = this.scene.add.graphics().setDepth(2);
    const warn = EVENTS.flare.warnMs;
    const burnMs = FLARE_BURN_SEC * 1000;
    const calm = getSettings().reduceFlashing;
    let hit = false;
    const r: Running = {
      kind: 'flare',
      startedMs: t0,
      tick: (now) => {
        const t = now - t0;
        g.clear();
        if (t < warn) {
          const on = calm || Math.floor(t / 160) % 2 === 0;
          for (const rc of rects) {
            g.fillStyle(0xff7a00, on ? 0.22 : 0.1).fillRect(rc.x, rc.y, rc.width, rc.height);
            g.lineStyle(2, 0xffb040, 0.9).strokeRectShape(rc);
          }
          this.setStatus(r, `GREASE FLARE-UP in ${Math.ceil((warn - t) / 1000)}s`);
          return false;
        }
        this.setStatus(r, null);
        const flick = calm ? 0.6 : 0.5 + Math.sin(now / 50) * 0.15;
        for (const rc of rects) {
          g.fillStyle(0xff3a00, flick).fillRect(rc.x, rc.y, rc.width, rc.height);
          g.fillStyle(0xffd060, flick * 0.6).fillRect(rc.x, rc.centerY - rc.height * 0.15, rc.width, rc.height * 0.3);
          if (!horizontal) g.fillRect(rc.centerX - rc.width * 0.15, rc.y, rc.width * 0.3, rc.height);
        }
        const p = this.hooks.player();
        if (!p.invulnerable && rects.some((rc) => rc.contains(p.x, p.y))) {
          hit = true;
          this.hooks.hurt(FLARE_DAMAGE, 'Grease Flare-up');
        }
        if (t >= warn + burnMs) this.finish('flare', !hit);
        return t >= warn + burnMs;
      },
      cleanup: () => {
        this.setStatus(r, null);
        g.destroy();
      },
    };
    return r;
  }

  // --- Sauce Rain: drops fall where shadows grow ---------------------------------------------

  private rain(t0: number): Running {
    const warn = EVENTS.rain.warnMs;
    const drops: { at: number; x: number; y: number; shadow: Phaser.GameObjects.Graphics | null; done: boolean }[] = [];
    for (let i = 0; i < RAIN_DROPS; i++) {
      drops.push({ at: t0 + (i / RAIN_DROPS) * RAIN_SEC * 1000 + this.rng() * 300, x: 0, y: 0, shadow: null, done: false });
    }
    const a = this.arena;
    let hit = false;
    const r: Running = {
      kind: 'rain',
      startedMs: t0,
      tick: (now) => {
        const p = this.hooks.player();
        let pending = false;
        for (const d of drops) {
          if (d.done) continue;
          pending = true;
          if (now < d.at) continue;
          if (!d.shadow) {
            // Every other drop aims where you are now, so standing still is not an option.
            const aim = drops.indexOf(d) % 2 === 0;
            d.x = aim ? p.x : randRange(this.rng, a.left + 40, a.right - 40);
            d.y = aim ? p.y : randRange(this.rng, a.top + 40, a.bottom - 40);
            d.shadow = this.scene.add.graphics().setDepth(2);
          }
          const k = Math.min(1, (now - d.at) / warn);
          d.shadow.clear();
          d.shadow.fillStyle(0x000000, 0.25 + 0.3 * k).fillCircle(d.x, d.y, RAIN_RADIUS * (0.3 + 0.7 * k));
          d.shadow.lineStyle(2, 0xe0242c, 0.4 + 0.5 * k).strokeCircle(d.x, d.y, RAIN_RADIUS);
          if (k >= 1) {
            d.done = true;
            d.shadow.destroy();
            d.shadow = null;
            const splash = this.scene.add.image(d.x, d.y, 'ring').setDepth(12).setTint(0xe0242c).setScale(0.3);
            this.scene.tweens.add({ targets: splash, scale: (RAIN_RADIUS * 2) / 64, alpha: 0, duration: 220, onComplete: () => splash.destroy() });
            audio.play('hit');
            if (!p.invulnerable && Math.hypot(p.x - d.x, p.y - d.y) < RAIN_RADIUS) {
              hit = true;
              this.hooks.hurt(RAIN_DAMAGE, 'Sauce Rain');
            }
          }
        }
        if (!pending) this.finish('rain', !hit);
        return !pending;
      },
      cleanup: () => {
        for (const d of drops) d.shadow?.destroy();
      },
    };
    return r;
  }
}
