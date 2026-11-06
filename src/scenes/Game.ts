import Phaser from 'phaser';
import { GAME_H, GAME_W } from '../art/textures';
import type { EnemyKind } from '../data/enemies';
import { waveConfig, type WaveConfig } from '../data/waves';
import { createEnemyBulletPool, createPlayerBulletPool, EnemyBullet, PlayerBullet } from '../entities/BulletPool';
import { Enemy, type EnemyContext } from '../entities/Enemy';
import { LINK_RADIUS, LinkChain } from '../entities/LinkChain';
import { Pickups } from '../entities/Pickup';
import { SausageHead } from '../entities/SausageHead';
import type { RunState } from '../state/run';
import { computeStats, type PlayerStats } from '../state/stats';
import { BulletPatterns } from '../systems/BulletPatterns';
import { Doneness, tierFor } from '../systems/Doneness';
import { rollCrumbs } from '../systems/Economy';
import { mulberry32, randRange, type Rng } from '../systems/rng';
import { WaveDirector } from '../systems/WaveDirector';
import { POISON_MS, WeaponSystem } from '../systems/WeaponSystem';
import { FONT, HUD_H, Hud } from '../ui/Hud';

const GRILL_HEAT_PER_SEC = 5;
const CONDIMENT_DROP_CHANCE = 0.06;
const CONDIMENT_COOL = 10;
const TILE_SIZE = 110;

type Keys = Record<'W' | 'A' | 'S' | 'D' | 'UP' | 'DOWN' | 'LEFT' | 'RIGHT' | 'SPACE' | 'SHIFT' | 'ESC' | 'P', Phaser.Input.Keyboard.Key>;

export class GameScene extends Phaser.Scene {
  private run!: RunState;
  private stats!: PlayerStats;
  private cfg!: WaveConfig;
  private rng!: Rng;
  private doneness!: Doneness;

  private head!: SausageHead;
  private chain!: LinkChain;
  private weapons!: WeaponSystem;
  private enemies!: Phaser.Physics.Arcade.Group;
  private playerBullets!: Phaser.Physics.Arcade.Group;
  private enemyBullets!: Phaser.Physics.Arcade.Group;
  private patterns!: BulletPatterns;
  private pickups!: Pickups;
  private director!: WaveDirector;
  private hud!: Hud;
  private keys!: Keys;
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private sizzle!: Phaser.GameObjects.Particles.ParticleEmitter;
  private boss: Enemy | null = null;

  private readonly arena = new Phaser.Geom.Rectangle(22, HUD_H + 14, GAME_W - 44, GAME_H - HUD_H - 30);
  private hotTiles: Phaser.Geom.Rectangle[] = [];
  private enemyCtx!: EnemyContext;
  private graveyard: Enemy[] = [];
  private ending = false;
  private dying = false;
  private paused = false;
  private pauseText?: Phaser.GameObjects.Text;
  private onGrill = false;

  constructor() {
    super('Game');
  }

  init(data: { run: RunState }): void {
    this.run = data.run;
    this.stats = computeStats(this.run.items);
    this.cfg = waveConfig(this.run.wave);
    this.rng = mulberry32((this.run.seed + this.run.wave * 31337) >>> 0);
    this.doneness = new Doneness(this.run.heat);
    this.doneness.heatTakenMult = this.stats.heatTakenMult;
    this.doneness.coolPerSec = this.stats.coolPerSec;
    this.boss = null;
    this.graveyard = [];
    this.ending = false;
    this.dying = false;
    this.paused = false;
  }

  create(): void {
    this.add.image(0, 0, 'bg-grill').setOrigin(0).setDepth(0);
    this.physics.world.setBounds(this.arena.x, this.arena.y, this.arena.width, this.arena.height);
    this.createHotTiles();

    this.head = new SausageHead(this, GAME_W / 2, GAME_H / 2 + 40);
    this.chain = new LinkChain(this, this.head.x, this.head.y, 0);
    this.chain.setWeapons(this.run.weapons);

    this.enemies = this.physics.add.group();
    this.playerBullets = createPlayerBulletPool(this);
    this.enemyBullets = createEnemyBulletPool(this);
    this.patterns = new BulletPatterns(this.enemyBullets);
    this.pickups = new Pickups(this);

    this.weapons = new WeaponSystem(this, this.playerBullets, this.chain, {
      enemies: () => this.enemyList(),
      damage: (e, amount, fx, fy, kb) => this.damageEnemy(e, amount, fx, fy, kb),
      explode: (x, y, r, dmg) => this.explode(x, y, r, dmg),
    });
    this.weapons.setWeapons(this.run.weapons);

    this.enemyCtx = {
      player: this.head,
      patterns: this.patterns,
      arena: this.arena,
      spawnMinion: (kind, x, y) => this.spawnEnemy(kind, x, y),
    };

    this.director = new WaveDirector(this, this.cfg, this.rng, this.arena, {
      spawn: (kind, x, y) => this.spawnEnemy(kind, x, y),
      alive: () => {
        let total = 0;
        let turrets = 0;
        for (const e of this.enemyList()) {
          if (e.dead) continue;
          total++;
          if (e.def.kind === 'hotsauce') turrets++;
        }
        return { total, turrets };
      },
      player: () => this.head,
    });

    this.physics.add.overlap(this.playerBullets, this.enemies, (a, b) => this.onBulletHit(a, b), (a, b) => {
      const [bullet, enemy] = pair<PlayerBullet, Enemy>(a, b, PlayerBullet);
      return !!bullet && !!enemy && bullet.active && bullet.collides && !enemy.dead && !bullet.hitSet.has(enemy);
    });
    this.physics.add.overlap(this.head, this.enemyBullets, (a, b) => {
      const bullet = (a instanceof EnemyBullet ? a : b) as EnemyBullet;
      if (!bullet.active || this.head.invulnerable || this.dying || this.ending) return;
      bullet.kill();
      this.takeHeat(bullet.heat);
    });
    this.physics.add.overlap(this.head, this.enemies, (a, b) => {
      const enemy = (a instanceof Enemy ? a : b) as Enemy;
      if (enemy.dead || this.dying || this.ending) return;
      if (!enemy.isBoss) enemy.shove(this.head.x, this.head.y, 260);
      if (this.head.invulnerable) return;
      this.takeHeat(enemy.def.contactHeat);
    });
    this.physics.add.collider(this.enemies, this.enemies);

    this.sparks = this.add.particles(0, 0, 'spark', {
      lifespan: 380,
      speed: { min: 80, max: 280 },
      scale: { start: 1.1, end: 0 },
      emitting: false,
    }).setDepth(12);
    this.sizzle = this.add.particles(0, 0, 'smoke', {
      lifespan: 800,
      speedY: { min: -70, max: -25 },
      speedX: { min: -15, max: 15 },
      scale: { start: 0.35, end: 1.1 },
      alpha: { start: 0.35, end: 0 },
      tint: 0xbbbbbb,
      frequency: 140,
      emitting: false,
    }).setDepth(12);
    this.sizzle.startFollow(this.head);

    this.hud = new Hud(this, this.run.wave);

    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE,SHIFT,ESC,P') as Keys;
    kb.addCapture('SPACE,UP,DOWN,LEFT,RIGHT');

    this.banner(this.cfg.boss ? "THE GRILL MASTER'S TONGS" : `WAVE ${this.run.wave}`, this.cfg.boss ? 'Defeat the boss to escape the BBQ!' : 'Survive!');
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());

    // Debug/testing hook (used by automated screenshots, harmless otherwise).
    (window as unknown as { __sausage?: unknown }).__sausage = this;
  }

  update(time: number, deltaMs: number): void {
    const k = this.keys;
    if (Phaser.Input.Keyboard.JustDown(k.ESC) || Phaser.Input.Keyboard.JustDown(k.P)) this.togglePause();
    if (this.paused) return;

    const dtMs = Math.min(deltaMs, 50);
    const dt = dtMs / 1000;

    // --- Player ---
    if (!this.dying) {
      const ix = (k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.LEFT.isDown ? 1 : 0);
      const iy = (k.S.isDown || k.DOWN.isDown ? 1 : 0) - (k.W.isDown || k.UP.isDown ? 1 : 0);
      const wantDash = Phaser.Input.Keyboard.JustDown(k.SPACE) || Phaser.Input.Keyboard.JustDown(k.SHIFT);
      this.head.drive(ix, iy, this.stats.speedMult, wantDash, this.stats.dashCooldownMs);
    } else {
      this.head.halt();
    }
    const tint = heatTint(this.doneness.heat);
    this.head.setTint(this.dying ? 0x2a2a2a : tint);
    this.chain.update(this.head.x, this.head.y, this.dying ? 0x2a2a2a : tint, time);

    // --- Heat ---
    if (!this.dying && !this.ending) {
      this.onGrill = this.hotTiles.some((r) => r.contains(this.head.x, this.head.y));
      if (this.onGrill) {
        this.doneness.addHeat(GRILL_HEAT_PER_SEC * dt);
        if (this.doneness.isCharred) this.die();
      } else {
        this.doneness.tick(dt);
      }
    }
    const tier = tierFor(this.doneness.heat);
    this.sizzle.emitting = !this.dying && (tier.min >= 60 || this.onGrill);
    this.sizzle.frequency = tier.min >= 90 ? 60 : 140;

    // --- Combat ---
    if (!this.dying && !this.ending) {
      const hot = tier.min >= 60 ? 1 + this.stats.hotDamageBonus : 1;
      this.weapons.update(time, this.stats.damageMult * tier.damageMult * hot, this.stats.fireRateMult * tier.fireRateMult);
      this.director.update(dtMs);
      this.run.timeSurvivedSec += dt;
    }
    for (const e of this.enemyList()) {
      if (this.dying) {
        e.setVelocity(0, 0);
        continue;
      }
      if (e.think(this.enemyCtx, time, dt)) this.killEnemy(e);
      // Melee enemies bounce off your links.
      if (e.def.melee && !e.dead) {
        for (const p of this.chain.positions) {
          if (Math.abs(e.x - p.x) < e.def.radius + LINK_RADIUS && Math.abs(e.y - p.y) < e.def.radius + LINK_RADIUS) {
            if (Math.hypot(e.x - p.x, e.y - p.y) < e.def.radius + LINK_RADIUS) e.shove(p.x, p.y, 220);
          }
        }
      }
    }

    // --- Pickups ---
    this.pickups.update(dt, this.head.x, this.head.y, this.stats.pickupRadius, (kind) => this.collect(kind));

    for (const e of this.graveyard) e.destroy();
    this.graveyard.length = 0;

    this.hud.update(this.doneness.heat, this.run.crumbs, this.cfg.boss ? null : this.director.timeLeftSec, this.head.dashCharge(this.stats.dashCooldownMs), time);
    this.hud.setBoss(this.boss && !this.boss.dead ? this.boss.hp / this.boss.maxHp : null);

    if (!this.ending && !this.dying && this.director.timeUp) this.endWave();
  }

  // ---------------------------------------------------------------------------

  private enemyList(): Enemy[] {
    return this.enemies.getChildren() as Enemy[];
  }

  private spawnEnemy(kind: EnemyKind, x: number, y: number): void {
    if (this.ending || this.dying) return;
    const e = new Enemy(this, x, y, kind, this.cfg.hpMult);
    this.enemies.add(e);
    e.setup(this.time.now);
    if (kind === 'tongs') {
      this.boss = e;
      this.cameras.main.shake(400, 0.01);
    }
  }

  private onBulletHit(a: unknown, b: unknown): void {
    const [bullet, enemy] = pair<PlayerBullet, Enemy>(a, b, PlayerBullet);
    if (!bullet || !enemy || !bullet.active || enemy.dead || bullet.hitSet.has(enemy)) return;
    bullet.hitSet.add(enemy);
    if (bullet.poisonDps > 0) enemy.poison(bullet.poisonDps, POISON_MS, this.time.now);
    const fromX = bullet.x - Math.cos(bullet.rotation) * 20;
    const fromY = bullet.y - Math.sin(bullet.rotation) * 20;
    this.damageEnemy(enemy, bullet.damage, fromX, fromY, bullet.knockback);
    if (bullet.pierceLeft > 0) bullet.pierceLeft--;
    else bullet.kill();
  }

  private damageEnemy(e: Enemy, amount: number, fromX: number, fromY: number, knockback: number): void {
    if (e.hit(amount, this.time.now, fromX, fromY, knockback)) this.killEnemy(e);
  }

  private explode(x: number, y: number, radius: number, damage: number): void {
    const ring = this.add.image(x, y, 'ring').setDepth(12).setTint(0x8fe35a).setScale(0.2);
    this.tweens.add({ targets: ring, scale: (radius * 2) / 64, alpha: 0, duration: 260, onComplete: () => ring.destroy() });
    this.sparks.setParticleTint(0x8fe35a);
    this.sparks.explode(10, x, y);
    for (const e of [...this.enemyList()]) {
      if (e.dead) continue;
      if (Math.hypot(e.x - x, e.y - y) <= radius + e.def.radius) this.damageEnemy(e, damage, x, y, 180);
    }
  }

  private killEnemy(e: Enemy): void {
    e.dead = true;
    this.run.kills++;
    this.sparks.setParticleTint(e.isBoss ? 0xb040ff : e.def.kind === 'hotsauce' ? 0xff7a00 : e.def.kind === 'ketchup' ? 0xe0242c : 0xd0d8e0);
    this.sparks.explode(e.isBoss ? 60 : 9, e.x, e.y);
    const crumbs = rollCrumbs(this.rng, e.def.crumbs, this.stats.crumbMult);
    this.pickups.spawnCrumbs(e.x, e.y, crumbs);
    if (Math.random() < CONDIMENT_DROP_CHANCE) this.pickups.spawnCondiment(e.x, e.y);
    if (this.stats.killCoolChance > 0 && Math.random() < this.stats.killCoolChance) this.doneness.cool(this.stats.killCoolAmount);
    e.disableBody(true, true);
    this.graveyard.push(e);
    if (e.isBoss) this.win();
  }

  private collect(kind: 'crumb' | 'condiment'): void {
    if (kind === 'crumb') {
      this.run.crumbs++;
      this.run.crumbsEarned++;
    } else {
      this.doneness.cool(CONDIMENT_COOL);
      this.floatText(this.head.x, this.head.y - 24, `-${CONDIMENT_COOL}°`, '#8fd3ff');
    }
  }

  private takeHeat(amount: number): void {
    const applied = this.doneness.addHeat(amount);
    this.head.markHit();
    this.cameras.main.shake(110, 0.005);
    this.floatText(this.head.x, this.head.y - 24, `+${Math.round(applied)}°`, '#ff8a50');
    if (this.doneness.isCharred) this.die();
  }

  private floatText(x: number, y: number, text: string, color: string): void {
    const t = this.add.text(x, y, text, { fontFamily: FONT, fontSize: '16px', fontStyle: 'bold', color, stroke: '#000', strokeThickness: 3 })
      .setOrigin(0.5).setDepth(20);
    this.tweens.add({ targets: t, y: y - 30, alpha: 0, duration: 650, onComplete: () => t.destroy() });
  }

  private banner(title: string, subtitle?: string, holdMs = 1300): void {
    const t = this.add.text(GAME_W / 2, GAME_H / 2 - 60, title, {
      fontFamily: FONT, fontSize: '56px', fontStyle: 'bold', color: '#ffe0b0', stroke: '#3a1408', strokeThickness: 8,
    }).setOrigin(0.5).setDepth(60);
    const s = subtitle
      ? this.add.text(GAME_W / 2, GAME_H / 2, subtitle, { fontFamily: FONT, fontSize: '22px', color: '#ffffff', stroke: '#000', strokeThickness: 4 })
        .setOrigin(0.5).setDepth(60)
      : null;
    const targets = s ? [t, s] : [t];
    t.setScale(0.6);
    this.tweens.add({ targets: t, scale: 1, duration: 260, ease: 'Back.Out' });
    this.tweens.add({ targets, alpha: 0, delay: holdMs, duration: 400, onComplete: () => targets.forEach((o) => o.destroy()) });
  }

  private createHotTiles(): void {
    this.hotTiles = [];
    const g = this.add.graphics().setDepth(1);
    const cx = GAME_W / 2;
    const cy = GAME_H / 2 + 40;
    let tries = 0;
    while (this.hotTiles.length < this.cfg.hotTiles && tries++ < 100) {
      const x = randRange(this.rng, this.arena.left + 20, this.arena.right - TILE_SIZE - 20);
      const y = randRange(this.rng, this.arena.top + 20, this.arena.bottom - TILE_SIZE - 20);
      const r = new Phaser.Geom.Rectangle(x, y, TILE_SIZE, TILE_SIZE);
      if (r.contains(cx, cy) || Math.hypot(r.centerX - cx, r.centerY - cy) < 180) continue;
      if (this.hotTiles.some((o) => Phaser.Geom.Intersects.RectangleToRectangle(o, Phaser.Geom.Rectangle.Inflate(Phaser.Geom.Rectangle.Clone(r), 30, 30)))) continue;
      this.hotTiles.push(r);
    }
    // Red-hot grate sections: glowing coals under bright bars.
    for (const r of this.hotTiles) {
      g.fillStyle(0xff2000, 0.18).fillRoundedRect(r.x - 10, r.y - 10, r.width + 20, r.height + 20, 18);
      g.fillStyle(0x7a1200, 0.9).fillRoundedRect(r.x, r.y, r.width, r.height, 10);
      for (let i = 0; i < 9; i++) {
        g.fillStyle(i % 2 ? 0xff5a00 : 0xffa020, 0.55)
          .fillCircle(r.x + 14 + ((i * 37) % (r.width - 28)), r.y + 14 + ((i * 53) % (r.height - 28)), 10 + (i % 3) * 4);
      }
      g.lineStyle(5, 0xffd060, 0.95);
      for (let i = 1; i < 5; i++) g.lineBetween(r.x + 6, r.y + (r.height * i) / 5, r.right - 6, r.y + (r.height * i) / 5);
      g.lineStyle(2, 0xffb040, 0.8).strokeRoundedRect(r.x, r.y, r.width, r.height, 10);
    }
    this.tweens.add({ targets: g, alpha: 0.7, duration: 700, yoyo: true, repeat: -1 });
  }

  private togglePause(): void {
    if (this.ending || this.dying) return;
    this.paused = !this.paused;
    if (this.paused) {
      this.physics.world.pause();
      this.tweens.pauseAll();
      this.time.paused = true;
      this.pauseText = this.add.text(GAME_W / 2, GAME_H / 2, 'PAUSED\n\nEsc / P to resume', {
        fontFamily: FONT, fontSize: '40px', color: '#ffffff', align: 'center', stroke: '#000', strokeThickness: 6,
      }).setOrigin(0.5).setDepth(100);
    } else {
      this.physics.world.resume();
      this.tweens.resumeAll();
      this.time.paused = false;
      this.pauseText?.destroy();
    }
  }

  private clearArena(): void {
    this.director.stop();
    this.patterns.clear();
    for (const b of this.playerBullets.getChildren() as PlayerBullet[]) if (b.active) b.kill();
  }

  private endWave(): void {
    this.ending = true;
    this.clearArena();
    for (const e of [...this.enemyList()]) {
      if (e.dead) continue;
      this.sparks.setParticleTint(0xffffff);
      this.sparks.explode(6, e.x, e.y);
      e.dead = true;
      e.disableBody(true, true);
      this.graveyard.push(e);
    }
    this.pickups.collectAll((kind) => this.collect(kind));
    this.run.heat = Doneness.carryOver(this.doneness.heat);
    this.banner('WAVE CLEARED!', 'Heat cools by half between waves');
    this.time.delayedCall(1700, () => this.scene.start('Shop', { run: this.run }));
  }

  private win(): void {
    if (this.ending) return;
    this.ending = true;
    this.clearArena();
    this.cameras.main.shake(600, 0.015);
    this.cameras.main.flash(400, 255, 240, 200);
    for (const e of [...this.enemyList()]) {
      if (!e.dead) {
        e.dead = true;
        e.disableBody(true, true);
        this.graveyard.push(e);
      }
    }
    this.pickups.collectAll((kind) => this.collect(kind));
    this.banner('YOU ESCAPED THE BBQ!', undefined, 1800);
    this.time.delayedCall(2600, () => this.scene.start('Victory', { run: this.run }));
  }

  private die(): void {
    if (this.dying || this.ending) return;
    this.dying = true;
    this.run.heat = this.doneness.heat;
    this.director.stop();
    this.patterns.clear();
    this.cameras.main.shake(500, 0.012);
    this.sizzle.emitting = true;
    this.sizzle.frequency = 25;
    this.banner('CHARRED!', 'Well... that sausage is done.', 1500);
    this.time.delayedCall(2200, () => this.scene.start('GameOver', { run: this.run }));
  }

  private cleanup(): void {
    this.weapons.destroy();
    this.chain.destroy();
  }
}

/** Arcade overlap callbacks don't guarantee argument order; sort them out by type. */
function pair<A, B>(a: unknown, b: unknown, typeA: abstract new (...args: never[]) => A): [A | null, B | null] {
  if (a instanceof typeA) return [a as A, b as B];
  if (b instanceof typeA) return [b as A, a as B];
  return [null, null];
}

/** Raw sausages are pale; well-done ones are browned. */
function heatTint(heat: number): number {
  const stops: [number, number][] = [
    [0, 0xffd6d6],
    [40, 0xffffff],
    [70, 0xc88a64],
    [100, 0x5a3a28],
  ];
  for (let i = 1; i < stops.length; i++) {
    if (heat <= stops[i][0]) {
      const [h0, c0] = stops[i - 1];
      const [h1, c1] = stops[i];
      const t = (heat - h0) / (h1 - h0);
      const a = Phaser.Display.Color.IntegerToColor(c0);
      const b = Phaser.Display.Color.IntegerToColor(c1);
      const c = Phaser.Display.Color.Interpolate.ColorWithColor(a, b, 100, t * 100);
      return Phaser.Display.Color.GetColor(c.r, c.g, c.b);
    }
  }
  return stops[stops.length - 1][1];
}
