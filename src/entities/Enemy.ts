import Phaser from 'phaser';
import { ENEMIES, type EnemyDef, type EnemyKind } from '../data/enemies';
import type { BulletPatterns } from '../systems/BulletPatterns';
import type { BossStyle } from '../data/courses';
import type { SourceKey } from '../state/runLog';

export interface EnemyContext {
  player: { x: number; y: number };
  patterns: BulletPatterns;
  arena: Phaser.Geom.Rectangle;
  spawnMinion(kind: EnemyKind, x: number, y: number): void;
  /** True once the wave is over (death, victory, wave clear): delayed attacks must not fire. */
  halted(): boolean;
}

type Mode = 'move' | 'windup' | 'charge' | 'recover' | 'idle' | 'spray';

const UP_OFFSET = Math.PI / 2; // textures are drawn facing up
export const MAX_POISON_STACKS = 3;

export class Enemy extends Phaser.Physics.Arcade.Sprite {
  readonly def: EnemyDef;
  hp: number;
  readonly maxHp: number;
  dead = false;
  /** Multiplies move speed (Chili 1). */
  speedMult = 1;
  /** How this boss looks and fights (later courses); null for the Backyard Tongs and normal enemies. */
  style: BossStyle | null = null;
  private baseTint = 0xffffff;
  private styleScale = 1;
  /** Elites (timed event): more HP, bigger, glowing. */
  readonly elite: boolean;
  private readonly baseScale: number;
  private aura: Phaser.GameObjects.Image | null = null;

  private kbX = 0;
  private kbY = 0;
  /** Up to MAX_POISON_STACKS independent poison stacks, each with its own timer. */
  private poisons: { dps: number; until: number; src: SourceKey }[] = [];
  /** Damage over time dealt since the scene last read it, by source (for the run stats). */
  readonly dot = new Map<SourceKey, number>();
  /** Who hit it last: gets the kill in the run stats. */
  lastHitBy: SourceKey = 'other';
  private flashUntil = 0;
  private mode: Mode = 'move';
  private stateUntil = 0;
  private chargeAngle = 0;
  private nextFireAt = 0;
  private spiralAngle = 0;
  private attackIndex = 0;
  private nextSummonAt = 0;
  private strafeDir = 1;
  private born = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, kind: EnemyKind, hpMult: number, elite?: { hpMult: number; scale: number }) {
    const def = ENEMIES[kind];
    super(scene, x, y, def.texture);
    this.def = def;
    this.elite = !!elite;
    this.baseScale = elite?.scale ?? 1;
    this.maxHp = Math.round(def.hp * hpMult * (elite?.hpMult ?? 1));
    this.hp = this.maxHp;
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDepth(kind === 'tongs' ? 4 : 5);
    if (elite) {
      this.aura = scene.add.image(x, y, 'ring').setDepth(4).setTint(0xd070ff).setAlpha(0.8)
        .setScale((def.radius * 2 * elite.scale * 1.3) / 64);
    }
  }

  destroy(fromScene?: boolean): void {
    this.aura?.destroy();
    this.aura = null;
    super.destroy(fromScene);
  }

  /** Call after adding to the physics group (groups reset body settings). */
  setup(now: number): void {
    const body = this.body as Phaser.Physics.Arcade.Body;
    const r = this.def.radius;
    body.setCircle(r, this.width / 2 - r, this.height / 2 - r);
    if (this.def.kind === 'hotsauce' || this.def.kind === 'tongs') {
      body.setImmovable(true);
      body.pushable = false;
    }
    this.born = now;
    this.nextFireAt = now + 600 + Math.random() * 1200;
    this.stateUntil = now + (this.def.kind === 'hotsauce' ? 900 : 0);
    this.mode = this.def.kind === 'hotsauce' ? 'idle' : 'move';
    this.nextSummonAt = now + 5000;
    this.strafeDir = Math.random() < 0.5 ? -1 : 1;
    const scale = this.baseScale * this.styleScale;
    this.setScale(0.2 * scale);
    this.scene.tweens.add({ targets: this, scale, duration: 180, ease: 'Back.Out' });
  }

  /** Call before setup(): turns the Tongs into a later course's boss. */
  applyStyle(style: BossStyle): void {
    this.style = style;
    this.baseTint = style.tint;
    this.styleScale = style.scale;
  }

  /** Name for the HUD and the cause of death. */
  get label(): string {
    return this.style?.name ?? this.def.name;
  }

  get isBoss(): boolean {
    return this.def.kind === 'tongs';
  }

  /** Returns true if this hit killed the enemy. */
  hit(amount: number, now: number, fromX?: number, fromY?: number, knockback = 0): boolean {
    if (this.dead) return false;
    this.hp -= amount;
    this.flashUntil = now + 60;
    if (knockback > 0 && fromX !== undefined && fromY !== undefined && !this.isBoss && this.def.kind !== 'hotsauce') {
      const a = Math.atan2(this.y - fromY, this.x - fromX);
      this.kbX += Math.cos(a) * knockback;
      this.kbY += Math.sin(a) * knockback;
    }
    if (this.hp <= 0) {
      this.dead = true;
      return true;
    }
    return false;
  }

  /** Adds a poison stack; at the cap, the weakest (or oldest) stack is replaced. */
  poison(dps: number, durationMs: number, now: number, src: SourceKey = 'other'): void {
    this.poisons = this.poisons.filter((p) => p.until > now);
    const stack = { dps, until: now + durationMs, src };
    if (this.poisons.length < MAX_POISON_STACKS) {
      this.poisons.push(stack);
      return;
    }
    let weakest = 0;
    for (let i = 1; i < this.poisons.length; i++) {
      const p = this.poisons[i];
      const w = this.poisons[weakest];
      if (p.dps < w.dps || (p.dps === w.dps && p.until < w.until)) weakest = i;
    }
    this.poisons[weakest] = stack;
  }

  get poisonStacks(): number {
    return this.poisons.length;
  }

  shove(fromX: number, fromY: number, strength: number): void {
    // Turrets are rooted and the boss is immovable.
    if (this.isBoss || this.def.kind === 'hotsauce') return;
    const a = Math.atan2(this.y - fromY, this.x - fromX);
    this.kbX = Math.cos(a) * strength;
    this.kbY = Math.sin(a) * strength;
  }

  /** Returns true if poison killed it this frame. */
  think(ctx: EnemyContext, now: number, dt: number): boolean {
    if (this.dead) return false;
    let poisonKill = false;
    if (this.poisons.length) {
      let dps = 0;
      for (const p of this.poisons) if (p.until > now) dps += p.dps;
      if (dps === 0) this.poisons.length = 0;
      // Credit each stack its share of what the enemy actually lost (no overkill).
      const lost = Math.min(dps * dt, Math.max(0, this.hp));
      let top: { dps: number; src: SourceKey } | null = null;
      if (lost > 0) {
        for (const p of this.poisons) {
          if (p.until <= now) continue;
          this.dot.set(p.src, (this.dot.get(p.src) ?? 0) + (lost * p.dps) / dps);
          if (!top || p.dps > top.dps) top = p;
        }
      }
      this.hp -= dps * dt;
      if (this.hp <= 0) {
        this.dead = true;
        poisonKill = true;
        if (top) this.lastHitBy = top.src;
      }
    }

    const dx = ctx.player.x - this.x;
    const dy = ctx.player.y - this.y;
    const dist = Math.hypot(dx, dy) || 1;
    const toPlayer = Math.atan2(dy, dx);
    let vx = 0;
    let vy = 0;
    let face = toPlayer;
    const speed = this.def.speed * this.speedMult;
    const spawning = now - this.born < 250;

    switch (this.def.kind) {
      case 'fork': {
        vx = (dx / dist) * speed;
        vy = (dy / dist) * speed;
        break;
      }
      case 'spatula': {
        if (this.mode === 'move') {
          vx = (dx / dist) * speed;
          vy = (dy / dist) * speed;
          if (dist < 330 && now >= this.stateUntil && !spawning) this.setMode('windup', now, 550);
        } else if (this.mode === 'windup') {
          this.chargeAngle = toPlayer;
          if (now >= this.stateUntil) this.setMode('charge', now, 450);
        } else if (this.mode === 'charge') {
          face = this.chargeAngle;
          vx = Math.cos(this.chargeAngle) * 440;
          vy = Math.sin(this.chargeAngle) * 440;
          if (now >= this.stateUntil) this.setMode('recover', now, 700);
        } else if (now >= this.stateUntil) {
          this.mode = 'move';
          this.stateUntil = now + 900;
        }
        break;
      }
      case 'ketchup': {
        if (dist > 360) {
          vx = (dx / dist) * speed;
          vy = (dy / dist) * speed;
        } else if (dist < 240) {
          vx = (-dx / dist) * speed;
          vy = (-dy / dist) * speed;
        } else {
          vx = (-dy / dist) * speed * 0.7 * this.strafeDir;
          vy = (dx / dist) * speed * 0.7 * this.strafeDir;
        }
        if (now >= this.nextFireAt && !spawning) {
          ctx.patterns.spread(this.x, this.y, toPlayer, 3, 0.5, 210, this.def.bulletDamage, 'eb-ketchup');
          this.nextFireAt = now + 2400 + Math.random() * 600;
          if (Math.random() < 0.3) this.strafeDir *= -1;
        }
        break;
      }
      case 'hotsauce': {
        face = -UP_OFFSET; // stands upright
        if (this.mode === 'idle' && now >= this.stateUntil) this.setMode('spray', now, 1800);
        if (this.mode === 'spray') {
          if (now >= this.nextFireAt) {
            ctx.patterns.spiral(this.x, this.y - 6, this.spiralAngle, 3, 150, this.def.bulletDamage, 'eb-hot');
            this.spiralAngle += 0.29;
            this.nextFireAt = now + 115;
          }
          if (now >= this.stateUntil) this.setMode('idle', now, 1500);
        }
        break;
      }
      case 'tongs': {
        face = -UP_OFFSET;
        [vx, vy] = this.bossThink(ctx, now, dist, toPlayer, dx, dy);
        break;
      }
    }

    // Knockback decays quickly.
    const decay = Math.max(0, 1 - 7 * dt);
    this.kbX *= decay;
    this.kbY *= decay;
    this.setVelocity(vx + this.kbX, vy + this.kbY);
    this.setRotation(face + UP_OFFSET);

    // Keep inside the arena.
    const a = ctx.arena;
    this.x = Phaser.Math.Clamp(this.x, a.left, a.right);
    this.y = Phaser.Math.Clamp(this.y, a.top, a.bottom);

    this.updateTint(now);
    if (this.aura) {
      this.aura.setPosition(this.x, this.y).setRotation(now / 400).setVisible(!this.dead);
      this.aura.setAlpha(0.55 + 0.3 * Math.sin(now / 120));
    }
    return poisonKill;
  }

  private bossThink(ctx: EnemyContext, now: number, dist: number, toPlayer: number, dx: number, dy: number): [number, number] {
    const phase2 = this.hp < this.maxHp * 0.5;
    const p = ctx.patterns;
    const dmg = this.def.bulletDamage;
    let vx = 0;
    let vy = 0;

    if (this.mode === 'windup') {
      this.chargeAngle = toPlayer;
      if (now >= this.stateUntil) this.setMode('charge', now, 650);
      return [0, 0];
    }
    if (this.mode === 'charge') {
      if (now >= this.stateUntil) this.setMode('move', now, 0);
      return [Math.cos(this.chargeAngle) * 420, Math.sin(this.chargeAngle) * 420];
    }

    // Drift toward the player, but keep some distance.
    if (dist > 260) {
      vx = (dx / dist) * this.def.speed * this.speedMult;
      vy = (dy / dist) * this.def.speed * this.speedMult;
    }
    const fireMult = this.style?.fireMult ?? 1;

    if (now >= this.nextFireAt) {
      const i = this.attackIndex++;
      if (!phase2) {
        if (i % 2 === 0) {
          // Three aimed fans.
          for (let k = 0; k < 3; k++) {
            this.scene.time.delayedCall(k * 220, () => {
              if (!this.dead && !ctx.halted()) p.spread(this.x, this.y + 30, Math.atan2(ctx.player.y - this.y, ctx.player.x - this.x), 9, 1.1, 230, dmg, 'eb-boss');
            });
          }
        } else {
          p.ring(this.x, this.y + 30, 22, 170, dmg, 'eb-boss', i * 0.15);
          this.scene.time.delayedCall(350, () => {
            if (!this.dead && !ctx.halted()) p.ring(this.x, this.y + 30, 22, 170, dmg, 'eb-boss', i * 0.15 + 0.14);
          });
        }
        this.nextFireAt = now + 1700 * fireMult;
      } else {
        const pick = i % 3;
        if (pick === 0) {
          // Curving double ring: pretty and nasty.
          p.ring(this.x, this.y + 30, 24, 190, dmg, 'eb-boss', 0, 0.5);
          p.ring(this.x, this.y + 30, 24, 190, dmg, 'eb-hot', 0.13, -0.5);
        } else if (pick === 1) {
          for (let k = 0; k < 14; k++) {
            this.scene.time.delayedCall(k * 90, () => {
              if (!this.dead && !ctx.halted()) p.spiral(this.x, this.y + 30, this.spiralAngle += 0.33, 4, 180, dmg, 'eb-hot');
            });
          }
        } else {
          this.setMode('windup', now, 650);
        }
        this.nextFireAt = now + 1500 * fireMult;
      }
      // Big Smokey (and Chili 4 bosses): a short aimed spiral after every other attack.
      if (this.style?.extraAttack && i % 2 === 1) {
        for (let k = 0; k < 6; k++) {
          this.scene.time.delayedCall(500 + k * 110, () => {
            if (!this.dead && !ctx.halted()) p.spiral(this.x, this.y + 30, (this.spiralAngle -= 0.41), 3, 160, dmg, 'eb-hot');
          });
        }
      }
    }

    if (now >= this.nextSummonAt) {
      const minion = this.style?.minion ?? 'fork';
      ctx.spawnMinion(minion, this.x - 60, this.y + 40);
      ctx.spawnMinion(minion, this.x + 60, this.y + 40);
      this.nextSummonAt = now + (phase2 ? 4500 : 6500);
    }
    return [vx, vy];
  }

  private setMode(mode: Mode, now: number, durationMs: number): void {
    this.mode = mode;
    this.stateUntil = now + durationMs;
  }

  private updateTint(now: number): void {
    if (now < this.flashUntil) {
      this.setTintFill(0xffffff);
    } else if (this.mode === 'windup') {
      this.setTint(Math.floor(now / 80) % 2 ? 0xff5040 : 0xffffff);
    } else if (this.poisons.length) {
      this.setTint(0xc8ff6a);
    } else if (this.elite) {
      this.setTint(0xffd0ff);
    } else if (this.baseTint !== 0xffffff) {
      this.setTint(this.baseTint);
    } else {
      this.clearTint();
    }
  }
}
