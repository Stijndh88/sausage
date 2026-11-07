import Phaser from 'phaser';
import { GAME_H, GAME_W } from '../art/textures';
import type { EnemyKind } from '../data/enemies';
import { waveConfig, type WaveConfig } from '../data/waves';
import { createEnemyBulletPool, createPlayerBulletPool, EnemyBullet, PlayerBullet } from '../entities/BulletPool';
import { Enemy, type EnemyContext } from '../entities/Enemy';
import { LINK_RADIUS, LinkChain } from '../entities/LinkChain';
import { Pickups } from '../entities/Pickup';
import { SausageHead } from '../entities/SausageHead';
import { SAUSAGES } from '../data/sausages';
import { runStats, type RunState } from '../state/run';
import type { PlayerStats } from '../state/stats';
import { BulletPatterns } from '../systems/BulletPatterns';
import { Health } from '../systems/Health';
import { rollCrumbs } from '../systems/Economy';
import { mulberry32, randRange, type Rng } from '../systems/rng';
import { WaveDirector } from '../systems/WaveDirector';
import { POISON_MS, WeaponSystem } from '../systems/WeaponSystem';
import { FONT, HUD_H, Hud } from '../ui/Hud';
import { onAction } from '../ui/input';
import { PhysicalKeys } from '../ui/keys';
import { PauseMenu } from '../ui/PauseMenu';
import { SettingsPanel } from '../ui/SettingsPanel';
import { Tutorial } from '../ui/Tutorial';
import { DamageNumbers } from '../ui/DamageNumbers';
import { PadPoller } from '../ui/pad';
import { TouchControls, wantsTouchControls } from '../ui/TouchControls';
import { loadSave, writeSave } from '../state/save';
import { newRun } from '../state/run';
import { audio } from '../audio/Audio';
import { getSettings } from '../state/settings';
import { fitCamera } from '../ui/view';

/** HP per second lost while standing on a hot grill tile (armor doesn't help). */
export const GRILL_DAMAGE_PER_SEC = 6;
const CONDIMENT_DROP_CHANCE = 0.06;
/** Share of the crumbs left on the floor that you keep when a wave ends. */
export const FLOOR_CRUMB_BANK = 0.5;
const TILE_SIZE = 110;
const DODGE_IFRAMES_MS = 200;
const THORNS_COOLDOWN_MS = 500;


export class GameScene extends Phaser.Scene {
  private run!: RunState;
  private stats!: PlayerStats;
  private cfg!: WaveConfig;
  private rng!: Rng;
  private health!: Health;
  /** Second Skin charges left this wave. */
  private livesLeft = 0;
  /** Test hook: when true the sausage takes no damage (set by tests/e2e harness godMode). */
  invincible = false;
  private thornsReadyAt = new WeakMap<Enemy, number>();

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
  /** Held keys by physical position; movement uses the player's bindings (WASD = ZQSD on AZERTY). */
  controls!: PhysicalKeys;
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
  private pauseMenu!: PauseMenu;
  /** First-run tips; only during wave 1 until the player has seen them once. */
  private tutorial: Tutorial | null = null;
  private damageNumbers!: DamageNumbers;
  private readonly pad = new PadPoller();
  private touch: TouchControls | null = null;
  /** Remaining hit-stop (brief slow-motion when you're hit), in ms of real frame time. */
  private hitStopMs = 0;
  private bossPhase2 = false;
  private livePops = 0;
  private movedPx = 0;
  private lastHeadPos = { x: 0, y: 0 };
  private settingsPanel!: SettingsPanel;
  private onGrill = false;
  /**
   * Game time in ms. Advances only on unpaused frames, by the same capped delta physics uses,
   * so every gameplay timer (cooldowns, invulnerability, lifetimes, enemy AI) pauses and
   * slows down together. Never use scene.time.now for gameplay: it follows the wall clock.
   */
  private gameTime = 0;
  /** Set from key-down events so a tap shorter than one frame still dashes/pauses. */
  private dashQueued = false;
  private pauseQueued = false;
  readonly clock = { now: (): number => this.gameTime };

  constructor() {
    super('Game');
  }

  init(data: { run: RunState }): void {
    this.run = data.run;
    this.stats = runStats(this.run);
    this.cfg = waveConfig(this.run.wave);
    this.rng = mulberry32((this.run.seed + this.run.wave * 31337) >>> 0);
    // You start every wave at full health.
    this.health = new Health(this.stats.maxHp);
    this.health.armor = this.stats.armor;
    this.health.regenPerSec = this.stats.regenPerSec;
    this.livesLeft = this.stats.extraLives;
    this.invincible = false;
    this.thornsReadyAt = new WeakMap();
    this.boss = null;
    this.bossPhase2 = false;
    this.hitStopMs = 0;
    this.livePops = 0;
    this.graveyard = [];
    this.ending = false;
    this.dying = false;
    this.paused = false;
    this.onGrill = false;
    this.gameTime = 0;
    this.time.paused = false;
    this.dashQueued = false;
    this.pauseQueued = false;
  }

  create(): void {
    fitCamera(this);
    this.add.image(0, 0, 'bg-grill').setOrigin(0).setDisplaySize(GAME_W, GAME_H).setDepth(0);
    this.physics.world.setBounds(this.arena.x, this.arena.y, this.arena.width, this.arena.height);
    this.physics.world.timeScale = 1; // in case a hit-stop was cut short by a scene change
    this.createHotTiles();

    this.head = new SausageHead(this, GAME_W / 2, GAME_H / 2 + 40, this.clock);
    this.chain = new LinkChain(this, this.head.x, this.head.y, 0);
    this.chain.setWeapons(this.run.weapons);

    this.enemies = this.physics.add.group();
    this.playerBullets = createPlayerBulletPool(this);
    this.enemyBullets = createEnemyBulletPool(this);
    this.patterns = new BulletPatterns(this.enemyBullets, this.clock);
    this.pickups = new Pickups(this, this.clock);

    this.weapons = new WeaponSystem(this, this.playerBullets, this.chain, this.clock, {
      enemies: () => this.enemyList(),
      mods: () => this.stats,
      damage: (e, amount, fx, fy, kb) => this.damageEnemy(e, amount, fx, fy, kb),
      explode: (x, y, r, dmg) => this.explode(x, y, r, dmg),
    });
    this.weapons.setWeapons(this.run.weapons);

    this.enemyCtx = {
      player: this.head,
      patterns: this.patterns,
      arena: this.arena,
      spawnMinion: (kind, x, y) => this.director.summon(kind, x, y),
      halted: () => this.dying || this.ending || !this.scene.isActive(),
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
      this.takeDamage(bullet.damage, bullet.source);
    });
    this.physics.add.overlap(this.head, this.enemies, (a, b) => {
      const enemy = (a instanceof Enemy ? a : b) as Enemy;
      if (enemy.dead || this.dying || this.ending) return;
      enemy.shove(this.head.x, this.head.y, 260);
      this.applyThorns(enemy);
      if (this.head.invulnerable) return;
      this.takeDamage(enemy.def.contactDamage, enemy.def.name);
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
    this.damageNumbers = new DamageNumbers(this);
    this.touch = wantsTouchControls(this.game)
      ? new TouchControls(this, () => { if (!this.paused) this.dashQueued = true; }, () => { this.pauseQueued = true; })
      : null;
    this.tutorial = this.run.wave === 1 && !loadSave().tutorialDone ? new Tutorial(this) : null;
    this.movedPx = 0;
    this.lastHeadPos = { x: this.head.x, y: this.head.y };
    this.settingsPanel = new SettingsPanel(this, () => this.pauseMenu.setActive(true));
    this.pauseMenu = new PauseMenu(this, {
      resume: () => { if (this.paused) this.togglePause(); },
      restart: () => this.leavePaused(() => this.scene.start('Game', { run: newRun(undefined, this.run.sausage) })),
      settings: () => { this.pauseMenu.setActive(false); this.settingsPanel.show(); },
      quit: () => this.leavePaused(() => this.scene.start('Menu')),
    });

    const kb = this.input.keyboard!;
    this.controls = new PhysicalKeys(this);
    kb.addCapture('SPACE,UP,DOWN,LEFT,RIGHT');
    const queueDash = () => { if (!this.paused) this.dashQueued = true; };
    const queuePause = () => { this.pauseQueued = true; };
    onAction(kb, 'dash', queueDash);
    onAction(kb, 'pause', queuePause);

    this.banner(this.cfg.boss ? "THE GRILL MASTER'S TONGS" : `WAVE ${this.run.wave}`, this.cfg.boss ? 'Defeat the boss to escape the BBQ!' : 'Survive!');
    audio.setMood(this.cfg.boss ? 'boss' : 'fight');
    audio.play('waveStart');
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());

    // A bullet-hell must not keep running when the player looks away.
    this.game.events.on(Phaser.Core.Events.BLUR, this.autoPause, this);
    this.game.events.on(Phaser.Core.Events.HIDDEN, this.autoPause, this);

    // Debug/testing hook (used by automated screenshots, harmless otherwise).
    (window as unknown as { __sausage?: unknown }).__sausage = this;
  }

  update(_time: number, deltaMs: number): void {
    const k = this.controls;
    this.handlePad();
    if (this.pauseQueued) {
      this.pauseQueued = false;
      this.togglePause();
    }
    if (this.paused) {
      this.dashQueued = false;
      return;
    }

    // The engine already caps delta at 100ms (fps.min = 10 in main.ts); this is a safety net.
    let dtMs = Math.min(deltaMs, 100);
    // Hit-stop: a few frames of heavy slow-motion when you get hit, so hits register.
    if (this.hitStopMs > 0) {
      this.hitStopMs -= dtMs;
      dtMs *= 0.15;
      this.physics.world.timeScale = this.hitStopMs > 0 ? 1 / 0.15 : 1;
    }
    const dt = dtMs / 1000;
    this.gameTime += dtMs;
    const time = this.gameTime;

    for (const b of this.playerBullets.getChildren() as PlayerBullet[]) if (b.active) b.update(time, dtMs);
    for (const b of this.enemyBullets.getChildren() as EnemyBullet[]) if (b.active) b.update(time, dtMs);

    // --- Player ---
    if (!this.dying) {
      let ix = (k.action('right') ? 1 : 0) - (k.action('left') ? 1 : 0);
      let iy = (k.action('down') ? 1 : 0) - (k.action('up') ? 1 : 0);
      if (ix === 0 && iy === 0) {
        // Analog input: gamepad stick, or the touch stick.
        const m = this.touch?.vector ?? { x: 0, y: 0 };
        const p = m.x || m.y ? m : this.pad.move(this);
        ix = p.x;
        iy = p.y;
      }
      const wantDash = this.dashQueued;
      if (this.head.drive(ix, iy, this.stats.speedMult, wantDash, this.stats.dashCooldownMs)) audio.play('dash');
    } else {
      this.head.halt();
    }
    this.dashQueued = false;
    const tint = this.dying ? 0x2a2a2a : SAUSAGES[this.run.sausage].tint;
    this.head.setTint(tint);
    this.chain.update(this.head.x, this.head.y, tint, time);

    // --- Health: grill burns, regen heals ---
    this.onGrill = false;
    if (!this.dying && !this.ending) {
      this.onGrill = !this.stats.grillImmune && this.hotTiles.some((r) => r.contains(this.head.x, this.head.y));
      if (this.onGrill && !this.invincible) {
        this.health.hp = Math.max(0, this.health.hp - GRILL_DAMAGE_PER_SEC * dt);
        if (this.health.dead) this.onLethal('Grill tile');
      }
      this.health.tick(dt);
    }
    this.sizzle.emitting = !this.dying && this.onGrill;
    this.sizzle.frequency = 90;

    // --- Combat ---
    if (!this.dying && !this.ending) {
      this.weapons.update(time, this.stats.damageMult, this.stats.fireRateMult);
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

    // --- First-run tips ---
    if (this.tutorial && !this.dying && !this.ending) {
      this.movedPx += Math.hypot(this.head.x - this.lastHeadPos.x, this.head.y - this.lastHeadPos.y);
      this.lastHeadPos = { x: this.head.x, y: this.head.y };
      this.tutorial.update({
        head: this.head,
        movedPx: this.movedPx,
        kills: this.run.kills,
        hotTiles: this.hotTiles,
        firstPickup: (kind) => this.pickups.firstOf(kind),
        timeMs: this.gameTime,
      });
    }

    // --- Pickups ---
    this.pickups.update(dt, this.head.x, this.head.y, this.stats.pickupRadius, (kind) => this.collect(kind));

    for (const e of this.graveyard) e.destroy();
    this.graveyard.length = 0;

    this.hud.update(this.health.hp, this.health.maxHp, this.run.crumbs, this.cfg.boss ? null : this.director.timeLeftSec, this.head.dashCharge(this.stats.dashCooldownMs), time);
    this.hud.setBoss(this.boss && !this.boss.dead ? this.boss.hp / this.boss.maxHp : null);
    this.damageNumbers.update(time);

    // Boss phase 2: make the change of pace obvious.
    if (this.boss && !this.boss.dead && !this.bossPhase2 && this.boss.hp < this.boss.maxHp * 0.5) {
      this.bossPhase2 = true;
      this.patterns.clear();
      this.shake(350, 0.012);
      audio.play('bossPhase');
      this.banner('PHASE 2', 'The tongs are furious!', 900);
    }

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
    e.setup(this.gameTime);
    if (kind === 'tongs') {
      this.boss = e;
      this.shake(400, 0.01);
      audio.play('bossRoar');
    }
  }

  private onBulletHit(a: unknown, b: unknown): void {
    const [bullet, enemy] = pair<PlayerBullet, Enemy>(a, b, PlayerBullet);
    if (!bullet || !enemy || !bullet.active || enemy.dead || bullet.hitSet.has(enemy)) return;
    bullet.hitSet.add(enemy);
    if (bullet.poisonDps > 0) enemy.poison(bullet.poisonDps, POISON_MS, this.gameTime);
    const fromX = bullet.x - Math.cos(bullet.rotation) * 20;
    const fromY = bullet.y - Math.sin(bullet.rotation) * 20;
    this.damageEnemy(enemy, bullet.damage, fromX, fromY, bullet.knockback);
    if (bullet.pierceLeft > 0) bullet.pierceLeft--;
    else bullet.kill();
  }

  /** Every source of player damage goes through here: crits and lifesteal apply to all of them. */
  private damageEnemy(e: Enemy, amount: number, fromX: number, fromY: number, knockback: number): void {
    const crit = this.stats.critChance > 0 && Math.random() < this.stats.critChance;
    if (crit) {
      amount *= 2;
      this.sparks.setParticleTint(0xffd23f);
      this.sparks.explode(4, e.x, e.y);
    }
    if (this.stats.lifesteal > 0 && !this.dying && Math.random() < this.stats.lifesteal) this.health.heal(1);
    audio.play(crit ? 'crit' : 'hit');
    if (getSettings().damageNumbers) this.damageNumbers.spawn(e.x, e.y - e.def.radius, amount, crit, this.gameTime);
    if (e.hit(amount, this.gameTime, fromX, fromY, knockback)) this.killEnemy(e);
  }

  /** Spiky Bun: enemies touching you take damage (at most every THORNS_COOLDOWN_MS each). */
  private applyThorns(e: Enemy): void {
    if (this.stats.thorns <= 0 || e.dead) return;
    const ready = this.thornsReadyAt.get(e) ?? 0;
    if (this.gameTime < ready) return;
    this.thornsReadyAt.set(e, this.gameTime + THORNS_COOLDOWN_MS);
    this.damageEnemy(e, this.stats.thorns, this.head.x, this.head.y, 200);
  }

  private explode(x: number, y: number, radius: number, damage: number): void {
    audio.play('explode');
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
    audio.play('kill');
    this.run.kills++;
    this.sparks.setParticleTint(e.isBoss ? 0xb040ff : e.def.kind === 'hotsauce' ? 0xff7a00 : e.def.kind === 'ketchup' ? 0xe0242c : 0xd0d8e0);
    this.sparks.explode(e.isBoss ? 60 : 9, e.x, e.y);
    const crumbs = rollCrumbs(this.rng, e.def.crumbs, this.stats.crumbMult);
    this.pickups.spawnCrumbs(e.x, e.y, crumbs);
    if (Math.random() < CONDIMENT_DROP_CHANCE) this.pickups.spawnCondiment(e.x, e.y);
    this.killPop(e);
    e.disableBody(true, true);
    this.tweens.killTweensOf(e); // e.g. its spawn pop-in, if it died while appearing
    this.graveyard.push(e);
    if (e.isBoss) this.win();
  }

  private collect(kind: 'crumb' | 'condiment'): void {
    if (kind === 'crumb') {
      audio.play('crumb');
      this.run.crumbs++;
      this.run.crumbsEarned++;
    } else {
      audio.play('heal');
      const healed = this.health.heal(this.stats.condimentHeal);
      this.floatText(this.head.x, this.head.y - 24, `+${Math.round(healed)} HP`, '#7dff9a');
    }
  }

  /** A hit on the sausage: dodge roll, armor, i-frames, then death or a Second Skin save. */
  private takeDamage(amount: number, source: string): void {
    if (this.dying || this.ending || this.invincible) return;
    if (this.stats.dodge > 0 && Math.random() < this.stats.dodge) {
      this.head.markHit(DODGE_IFRAMES_MS);
      audio.play('dodge');
      this.floatText(this.head.x, this.head.y - 24, 'DODGE', '#8fd3ff');
      return;
    }
    const dealt = this.health.takeDamage(amount);
    this.head.markHit();
    if (!getSettings().reducedMotion) this.hitStopMs = 70;
    this.shake(110, 0.005);
    audio.play('hurt');
    this.floatText(this.head.x, this.head.y - 24, `-${dealt}`, '#ff6a5a');
    if (this.health.dead) this.onLethal(source);
  }

  private onLethal(source: string): void {
    if (this.livesLeft > 0) {
      this.livesLeft--;
      this.health.hp = 1;
      this.head.markHit(1500);
      this.flash(250, 255, 200, 160);
      audio.play('save');
      this.floatText(this.head.x, this.head.y - 40, 'SECOND SKIN!', '#ffd23f');
      return;
    }
    this.die(source);
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
    const tiles: Phaser.GameObjects.Image[] = [];
    for (const r of this.hotTiles) {
      g.fillStyle(0xff2000, 0.18).fillRoundedRect(r.x - 10, r.y - 10, r.width + 20, r.height + 20, 18);
      if (this.textures.exists('tile-hot')) {
        tiles.push(this.add.image(r.centerX, r.centerY, 'tile-hot').setDisplaySize(r.width, r.height).setDepth(1));
        continue;
      }
      g.fillStyle(0x7a1200, 0.9).fillRoundedRect(r.x, r.y, r.width, r.height, 10);
      for (let i = 0; i < 9; i++) {
        g.fillStyle(i % 2 ? 0xff5a00 : 0xffa020, 0.55)
          .fillCircle(r.x + 14 + ((i * 37) % (r.width - 28)), r.y + 14 + ((i * 53) % (r.height - 28)), 10 + (i % 3) * 4);
      }
      g.lineStyle(5, 0xffd060, 0.95);
      for (let i = 1; i < 5; i++) g.lineBetween(r.x + 6, r.y + (r.height * i) / 5, r.right - 6, r.y + (r.height * i) / 5);
      g.lineStyle(2, 0xffb040, 0.8).strokeRoundedRect(r.x, r.y, r.width, r.height, 10);
    }
    this.tweens.add({ targets: [g, ...tiles], alpha: 0.7, duration: 700, yoyo: true, repeat: -1 });
  }

  /** A white flash of the enemy that pops outward as it dies (skipped with reduced motion). */
  private killPop(e: Enemy): void {
    if (getSettings().reducedMotion || this.livePops >= 24) return;
    this.livePops++;
    const pop = this.add.image(e.x, e.y, e.texture.key).setRotation(e.rotation).setTintFill(0xffffff).setDepth(6);
    this.tweens.add({
      targets: pop, scale: e.isBoss ? 1.6 : 1.4, alpha: 0, duration: e.isBoss ? 400 : 130,
      onComplete: () => { pop.destroy(); this.livePops--; },
    });
  }

  /** Screen shake scaled by the player's setting (0 turns it off). */
  private shake(ms: number, intensity: number): void {
    const k = getSettings().screenShake;
    if (k > 0) this.cameras.main.shake(ms, intensity * k);
  }

  /** Full-screen flashes are skipped when "reduce flashing" is on. */
  private flash(ms: number, r: number, g: number, b: number): void {
    if (!getSettings().reduceFlashing) this.cameras.main.flash(ms, r, g, b);
  }

  private autoPause(): void {
    if (!this.paused && this.scene.isActive()) this.togglePause();
  }

  /** Gamepad: Start pauses; in a fight A/bumpers dash; while paused the pad drives the menus. */
  private handlePad(): void {
    for (const b of this.pad.poll(this)) {
      if (b === 'start') {
        this.pauseQueued = true;
        continue;
      }
      if (!this.paused) {
        if (b === 'a' || b === 'rb' || b === 'lb') this.dashQueued = true;
        continue;
      }
      if (this.settingsPanel.isOpen) {
        if (b === 'up' || b === 'down') this.settingsPanel.navigate(b === 'up' ? -1 : 1);
        else if (b === 'left' || b === 'right') this.settingsPanel.change(b === 'left' ? -1 : 1);
        else if (b === 'a') this.settingsPanel.confirm();
        else if (b === 'b') this.settingsPanel.back();
      } else if (b === 'up' || b === 'down') {
        this.pauseMenu.navigate(b === 'up' ? -1 : 1);
      } else if (b === 'a') {
        this.pauseMenu.pressFocused();
      } else if (b === 'b') {
        this.pauseQueued = true;
      }
    }
  }

  /** Leave the paused state cleanly, then go somewhere else (restart / main menu). */
  private leavePaused(go: () => void): void {
    this.settingsPanel.hide();
    this.pauseMenu.hide();
    this.physics.world.resume();
    this.tweens.resumeAll();
    this.time.paused = false;
    this.paused = false;
    audio.duck(false);
    go();
  }

  private togglePause(): void {
    // Esc while the settings overlay is open just closes it.
    if (this.paused && this.settingsPanel.isOpen) {
      this.settingsPanel.back();
      return;
    }
    // Never *enter* pause during the end-of-wave/death/victory transitions,
    // but always allow leaving it (otherwise those transitions could soft-lock).
    if (!this.paused && (this.ending || this.dying)) return;
    this.paused = !this.paused;
    if (this.paused) {
      this.physics.world.pause();
      this.tweens.pauseAll();
      this.time.paused = true;
      audio.duck(true);
      this.pauseMenu.show(this.run, this.stats, this.health.hp);
    } else {
      this.physics.world.resume();
      this.tweens.resumeAll();
      this.time.paused = false;
      audio.duck(false);
      this.pauseMenu.hide();
    }
  }

  private clearArena(): void {
    this.director.stop();
    this.patterns.clear();
    for (const b of this.playerBullets.getChildren() as PlayerBullet[]) if (b.active) b.kill();
  }

  private endWave(): void {
    this.ending = true;
    if (this.tutorial) {
      this.tutorial.hide();
      writeSave({ ...loadSave(), tutorialDone: true });
    }
    this.clearArena();
    for (const e of [...this.enemyList()]) {
      if (e.dead) continue;
      this.sparks.setParticleTint(0xffffff);
      this.sparks.explode(6, e.x, e.y);
      e.dead = true;
      e.disableBody(true, true);
      this.graveyard.push(e);
    }
    // Crumbs you didn't pick up are swept up at half value, so pickup radius and movement matter.
    let floor = 0;
    this.pickups.collectAll((kind) => { if (kind === 'crumb') floor++; });
    const banked = rollCrumbs(this.rng, floor, FLOOR_CRUMB_BANK);
    this.run.crumbs += banked;
    this.run.crumbsEarned += banked;
    audio.play('waveClear');
    this.banner('WAVE CLEARED!', floor
      ? `You left ${floor} crumb${floor === 1 ? '' : 's'} on the floor: you get half (+${banked})`
      : 'You grabbed every crumb!');
    this.time.delayedCall(1700, () => this.scene.start('Shop', { run: this.run }));
  }

  private win(): void {
    if (this.ending || this.dying) return;
    this.ending = true;
    this.clearArena();
    this.shake(600, 0.015);
    this.flash(400, 255, 240, 200);
    audio.setMood('off');
    audio.play('victory');
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

  private die(source = 'Unknown'): void {
    if (this.dying || this.ending) return;
    this.dying = true;
    this.health.hp = 0;
    this.run.causeOfDeath = source;
    this.clearArena();
    this.shake(500, 0.012);
    audio.setMood('off');
    audio.play('death');
    this.sizzle.emitting = true;
    this.sizzle.frequency = 25;
    this.banner('SKEWERED!', `Done in by: ${source}`, 1500);
    this.time.delayedCall(2200, () => this.scene.start('GameOver', { run: this.run }));
  }

  private cleanup(): void {
    this.game.events.off(Phaser.Core.Events.BLUR, this.autoPause, this);
    this.game.events.off(Phaser.Core.Events.HIDDEN, this.autoPause, this);
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
