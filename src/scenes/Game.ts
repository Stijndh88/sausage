import Phaser from 'phaser';
import { GAME_H, GAME_W } from '../art/textures';
import type { EnemyKind } from '../data/enemies';
import { waveConfig, type WaveConfig } from '../data/waves';
import { createEnemyBulletPool, createPlayerBulletPool, EnemyBullet, PlayerBullet } from '../entities/BulletPool';
import { BURN_MS, BURN_SPREAD_RADIUS, Enemy, type EnemyContext } from '../entities/Enemy';
import { LinkChain } from '../entities/LinkChain';
import { Pickups } from '../entities/Pickup';
import { HIT_INVULN_MS, SausageHead } from '../entities/SausageHead';
import { SAUSAGES, type SausageRules } from '../data/sausages';
import { runStats, type RunState } from '../state/run';
import type { PlayerStats } from '../state/stats';
import { BulletPatterns } from '../systems/BulletPatterns';
import { Health } from '../systems/Health';
import { rollCrumbs } from '../systems/Economy';
import { mulberry32, randRange, type Rng } from '../systems/rng';
import { WaveDirector } from '../systems/WaveDirector';
import { EventDirector } from '../systems/EventDirector';
import { rollWaveEvents } from '../data/events';
import { ITEMS } from '../data/items';
import { RARITIES } from '../data/rarity';
import { rollItem } from '../systems/Economy';
import { POISON_MS, WeaponSystem } from '../systems/WeaponSystem';
import { FONT, HUD_H, Hud } from '../ui/Hud';
import { onAction } from '../ui/input';
import { PhysicalKeys } from '../ui/keys';
import { PauseMenu } from '../ui/PauseMenu';
import { SettingsPanel } from '../ui/SettingsPanel';
import { HelpPanel } from '../ui/HelpPanel';
import { Tutorial } from '../ui/Tutorial';
import { DamageNumbers } from '../ui/DamageNumbers';
import { PadPoller } from '../ui/pad';
import { TouchControls } from '../ui/TouchControls';
import { haptic } from '../ui/haptics';
import { getInputMode } from '../ui/inputMode';
import { bankSpice, loadSave, markSeen, unlockedRarities, writeSave } from '../state/save';
import { tally } from '../state/run';
import { bossName, courseDef, courseName, courseTrophy, TROPHIES } from '../data/courses';
import { menuDef } from '../data/menus';
import { BOSS_SPICE, EVENT_SPICE, firstTasteSpice, KILL_SPICE_PER_CRUMB, settleRun, spiceMult, waveClearSpice, bagValue } from '../state/meta';
import { startRun } from './startRun';
import { audio } from '../audio/Audio';
import { getSettings } from '../state/settings';
import { fitCamera } from '../ui/view';
import { logDamage, logKill, logTaken, syncLinks, tickLinks, totalDealt, totalTaken, type SourceKey, type WaveOutcome } from '../state/runLog';
import { markRunActive, recordRunEnd, type RunEnd } from '../state/telemetry';

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
  /** The chosen sausage's special rule (see SausageRules). */
  private rules: SausageRules = {};
  /** Corn Dog: batter-shell hits left this wave, and the ring that shows it. */
  private shellHits = 0;
  private shellRing: Phaser.GameObjects.Image | null = null;
  /** Weisswurst: whether the "gone stale" moment has happened this wave. */
  private stale = false;

  private head!: SausageHead;
  private chain!: LinkChain;
  private weapons!: WeaponSystem;
  private enemies!: Phaser.Physics.Arcade.Group;
  private playerBullets!: Phaser.Physics.Arcade.Group;
  private enemyBullets!: Phaser.Physics.Arcade.Group;
  private patterns!: BulletPatterns;
  private pickups!: Pickups;
  private director!: WaveDirector;
  /** Timed events of this wave (see data/events.ts). */
  private timedEvents!: EventDirector;
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
  private helpPanel!: HelpPanel;
  private onGrill = false;
  /** Smoked keystone: a one-hit shield each wave. */
  private shieldUp = false;
  private hitThisWave = false;
  /** Game times of recent kills, for the "50 kills in 10 seconds" recipe. */
  private killTimes: number[] = [];
  /** Glass Plates menu. */
  private damageTakenMult = 1;
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
  /** Run totals when this wave started, so the wave's own numbers can be logged at the end. */
  private waveStart = { kills: 0, dealt: 0, taken: 0, crumbs: 0, sec: 0 };
  private waveFrames = 0;
  private waveRealMs = 0;
  private slowFrames = 0;
  private waveLogged = false;

  constructor() {
    super('Game');
  }

  init(data: { run: RunState }): void {
    this.run = data.run;
    this.stats = runStats(this.run);
    this.cfg = adjustedWave(this.run);
    this.rng = mulberry32((this.run.seed + this.run.wave * 31337) >>> 0);
    // You start every wave at full health.
    this.health = new Health(this.stats.maxHp);
    this.health.armor = this.stats.armor;
    this.health.regenPerSec = this.stats.regenPerSec;
    this.livesLeft = this.stats.extraLives;
    this.shieldUp = this.run.mods.waveShield > 0;
    this.hitThisWave = false;
    this.killTimes = [];
    this.damageTakenMult = menuDef(this.run.menu).damageTakenMult ?? 1;
    this.rules = SAUSAGES[this.run.sausage].rules ?? {};
    this.shellHits = this.rules.waveShield ?? 0;
    this.shellRing = null;
    this.stale = false;
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
    syncLinks(this.run.log, this.run.weapons);
    this.waveStart = {
      kills: this.run.kills,
      dealt: totalDealt(this.run.log),
      taken: totalTaken(this.run.log),
      crumbs: this.run.crumbsEarned,
      sec: this.run.timeSurvivedSec,
    };
    this.waveFrames = 0;
    this.waveRealMs = 0;
    this.slowFrames = 0;
    this.waveLogged = false;
    markRunActive(this.run, getInputMode());
  }

  create(): void {
    fitCamera(this);
    this.add.image(0, 0, 'bg-grill').setOrigin(0).setDisplaySize(GAME_W, GAME_H).setDepth(0).setTint(courseDef(this.cfg.course).arenaTint);
    tally(this.run, 'bestCourseReached', this.cfg.course, 'max');
    tally(this.run, 'maxLinks', this.run.weapons.length, 'max');
    this.physics.world.setBounds(this.arena.x, this.arena.y, this.arena.width, this.arena.height);
    this.physics.world.timeScale = 1; // in case a hit-stop was cut short by a scene change
    this.createHotTiles();

    const bodyScale = this.rules.bodyScale ?? 1;
    this.head = new SausageHead(this, GAME_W / 2, GAME_H / 2 + 40, this.clock, bodyScale);
    this.chain = new LinkChain(this, this.head.x, this.head.y, 0, bodyScale);
    if (this.shellHits > 0) {
      this.shellRing = this.add.image(this.head.x, this.head.y, 'ring').setDepth(10.5).setTint(0xffc84a).setAlpha(0.8).setScale(0.75);
    }
    this.chain.setWeapons(this.run.weapons);

    this.enemies = this.physics.add.group();
    this.playerBullets = createPlayerBulletPool(this);
    this.enemyBullets = createEnemyBulletPool(this);
    this.patterns = new BulletPatterns(this.enemyBullets, this.clock);
    this.pickups = new Pickups(this, this.clock);

    this.weapons = new WeaponSystem(this.playerBullets, this.chain, this.clock, {
      enemies: () => this.enemyList(),
      head: () => this.head,
      mods: () => this.stats,
      damage: (e, amount, fx, fy, kb) => this.damageEnemy(e, amount, fx, fy, kb),
      explode: (x, y, r, dmg, src) => this.explode(x, y, r, dmg, src),
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
      this.takeDamage(enemy.def.contactDamage, enemy.label);
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

    this.hud = new Hud(this, this.cfg.boss
      ? `${courseName(this.cfg.course).toUpperCase()} · BOSS`
      : `${courseName(this.cfg.course).toUpperCase()} · WAVE ${this.cfg.courseWave}/${this.cfg.courseWaves}`);
    this.hud.setBossName(bossName(this.cfg.course));
    // Events get their own seeded streams so they don't change what the spawner rolls.
    const schedule = rollWaveEvents(mulberry32((this.run.seed ^ (this.run.wave * 0x9e3779b1) ^ 0x5eed) >>> 0), this.run.wave);
    this.timedEvents = new EventDirector(this, schedule, this.cfg, mulberry32((this.run.seed + this.run.wave * 7717 + 1) >>> 0), this.arena, {
      player: () => this.head,
      hurt: (dmg, source) => this.takeDamage(dmg, source),
      spawnElite: (kind, x, y, elite) => this.spawnEnemy(kind, x, y, elite),
      spawnCrumbs: (x, y, n) => this.pickups.spawnCrumbs(x, y, n),
      spawnCondiment: (x, y) => { if (!this.rules.noCondimentHeal) this.pickups.spawnCondiment(x, y); },
      grantItem: () => this.grantRandomItem(),
      floatText: (x, y, text, color) => this.floatText(x, y, text, color),
      blocked: (x, y, r) => this.hotTiles.some((t) => Phaser.Geom.Intersects.CircleToRectangle(new Phaser.Geom.Circle(x, y, r), t)),
      kills: () => this.run.kills,
      onEventStart: (kind) => markSeen(`event:${kind}`),
      onEventDone: (r) => {
        if (!r.success) return;
        this.run.eventsWon[r.kind] = (this.run.eventsWon[r.kind] ?? 0) + 1;
        tally(this.run, 'eventsWon');
        // Events pay Spice into the doggy bag too (Treasure Nose adds to it).
        this.addSpice(EVENT_SPICE * (1 + this.run.mods.bossBonus));
      },
    });
    this.hud.setEvents(schedule, this.cfg.durationSec);
    this.damageNumbers = new DamageNumbers(this);
    // Always there; shows itself whenever the player is playing by touch.
    this.touch = new TouchControls(this, {
      dash: () => { if (!this.paused) this.dashQueued = true; },
      pause: () => { this.pauseQueued = true; },
      isPaused: () => this.paused,
    });
    this.tutorial = this.run.wave === 1 && !loadSave().tutorialDone ? new Tutorial(this) : null;
    this.movedPx = 0;
    this.lastHeadPos = { x: this.head.x, y: this.head.y };
    this.settingsPanel = new SettingsPanel(this, () => this.pauseMenu.setActive(true));
    this.helpPanel = new HelpPanel(this, () => this.pauseMenu.setActive(true));
    this.pauseMenu = new PauseMenu(this, {
      resume: () => { if (this.paused) this.togglePause(); },
      // Leaving a run early banks it like a bail-out, so the bag and the Cookbook progress aren't lost.
      restart: () => this.leavePaused(() => { this.leaveRun('restart'); settleRun(this.run, 'bail', this.health.hp); startRun(this, this.run.sausage); }),
      settings: () => { this.pauseMenu.setActive(false); this.settingsPanel.show(); },
      help: () => { this.pauseMenu.setActive(false); this.helpPanel.show(); },
      quit: () => this.leavePaused(() => { this.leaveRun('quit'); settleRun(this.run, 'bail', this.health.hp); this.scene.start('Menu'); }),
      bail: () => this.leavePaused(() => { this.logWave('left'); this.scene.start('GameOver', { run: this.run, outcome: 'bail', hp: this.health.hp }); }),
      bailValue: () => bagValue('bail', this.run),
    });

    const kb = this.input.keyboard!;
    this.controls = new PhysicalKeys(this);
    kb.addCapture('SPACE,UP,DOWN,LEFT,RIGHT');
    const queueDash = () => { if (!this.paused) this.dashQueued = true; };
    const queuePause = () => { this.pauseQueued = true; };
    onAction(kb, 'dash', queueDash);
    onAction(kb, 'pause', queuePause);

    // What the How to Play screen may explain: this run's links and items, and bosses once you meet one.
    markSeen(...this.run.weapons.map((w) => `weapon:${w.id}`), ...this.run.items.map((id) => `item:${id}`), ...(this.cfg.boss ? ['mech:boss'] : []),
      ...(this.stats.critBurn > 0 || this.rules.burnDps ? ['mech:burn'] : []));

    if (this.cfg.boss) this.banner(bossName(this.cfg.course).toUpperCase(), 'Beat the boss, then take it home or go for seconds!');
    else if (this.cfg.courseWave === 1) this.banner(courseName(this.cfg.course).toUpperCase(), courseDef(this.cfg.course).intro);
    else this.banner(`WAVE ${this.cfg.courseWave}`, 'Survive!');
    audio.setMood(this.cfg.boss ? 'boss' : 'fight');
    audio.play('waveStart');
    if (this.rules.freshness) {
      this.time.delayedCall(900, () => this.floatText(this.head.x, this.head.y - 34, `FRESH! +${Math.round(this.rules.freshness!.bonus * 100)}% damage`, '#fff3c0'));
    }
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());

    // A bullet-hell must not keep running when the player looks away.
    this.game.events.on(Phaser.Core.Events.BLUR, this.autoPause, this);
    this.game.events.on(Phaser.Core.Events.HIDDEN, this.autoPause, this);
    // ...or when the controller they're playing with drops out (battery, cable, Bluetooth).
    window.addEventListener('gamepaddisconnected', this.onPadLost);

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

    // Performance, per wave: real frame times (not the capped, smoothed delta).
    if (!this.dying && !this.ending) {
      const raw = this.game.loop.rawDelta;
      this.waveFrames++;
      this.waveRealMs += raw;
      if (raw > 50) this.slowFrames++;
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
      if (this.head.drive(ix, iy, this.stats.speedMult, wantDash, this.stats.dashCooldownMs)) {
        audio.play('dash');
        tally(this.run, 'dashes');
      }
    } else {
      this.head.halt();
    }
    this.dashQueued = false;
    const tint = this.dying ? 0x2a2a2a : this.stale ? 0xc9c0a6 : SAUSAGES[this.run.sausage].tint;
    this.head.setTint(tint);
    this.chain.update(this.head.x, this.head.y, tint, time);
    this.shellRing?.setPosition(this.head.x, this.head.y).setRotation(time / 400);
    if (this.rules.linksHittable) this.checkLinkHits();

    // --- Health: grill burns, regen heals ---
    this.onGrill = false;
    if (!this.dying && !this.ending) {
      this.onGrill = !this.stats.grillImmune && this.hotTiles.some((r) => r.contains(this.head.x, this.head.y));
      if (this.onGrill && !this.invincible) {
        const burn = Math.min(this.health.hp, GRILL_DAMAGE_PER_SEC * this.stats.grillDamageMult * dt);
        this.health.hp -= burn;
        logTaken(this.run.log, 'Grill tile', burn);
        if (this.health.dead) this.onLethal('Grill tile');
      }
      const before = this.health.hp;
      this.health.tick(dt);
      if (this.health.hp > before) this.logHeal(this.health.hp - before);
    }
    this.sizzle.emitting = !this.dying && this.onGrill;
    this.sizzle.frequency = 90;

    // --- Combat ---
    if (!this.dying && !this.ending) {
      this.weapons.update(time, this.damageMultNow(), this.stats.fireRateMult * this.timedEvents.fireRateMult);
      this.director.update(dtMs);
      if (!this.director.timeUp) this.timedEvents.update(this.director.elapsedMs, dt);
      this.run.timeSurvivedSec += dt;
      tickLinks(this.run.log, this.run.weapons.length, dt);
    }
    for (const e of this.enemyList()) {
      if (this.dying) {
        e.setVelocity(0, 0);
        continue;
      }
      const poisoned = e.think(this.enemyCtx, time, dt);
      if (e.dot.size) {
        for (const [src, amount] of e.dot) logDamage(this.run.log, src, amount, { dot: true });
        e.dot.clear();
      }
      if (poisoned) this.killEnemy(e, true);
      // Melee enemies bounce off your links.
      if (e.def.melee && !e.dead) {
        for (const p of this.chain.positions) {
          const reach = e.def.radius + this.chain.radius;
          if (Math.abs(e.x - p.x) < reach && Math.abs(e.y - p.y) < reach) {
            if (Math.hypot(e.x - p.x, e.y - p.y) < reach) e.shove(p.x, p.y, 220);
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

    const dashCharge = this.head.dashCharge(this.stats.dashCooldownMs);
    this.hud.update(this.health.hp, this.health.maxHp, this.run.crumbs, this.cfg.boss ? null : this.director.timeLeftSec, dashCharge, time);
    this.hud.setBag(Math.floor(this.run.bag), bagValue('death', this.run), this.run.trophies.map((t) => TROPHIES[t].color));
    this.hud.updateTrack(this.director.elapsedMs / 1000, time);
    this.touch?.update(dashCharge);
    this.hud.setBoss(this.boss && !this.boss.dead ? this.boss.hp / this.boss.maxHp : null);
    this.damageNumbers.update(time);

    // Boss phase 2: make the change of pace obvious.
    if (this.boss && !this.boss.dead && !this.bossPhase2 && this.boss.hp < this.boss.maxHp * 0.5) {
      this.bossPhase2 = true;
      this.patterns.clear();
      this.shake(350, 0.012);
      audio.play('bossPhase');
      this.banner('PHASE 2', `${this.boss.label} is furious!`, 900);
    }

    if (!this.ending && !this.dying && this.director.timeUp) this.endWave();
  }

  // ---------------------------------------------------------------------------

  private enemyList(): Enemy[] {
    return this.enemies.getChildren() as Enemy[];
  }

  private spawnEnemy(kind: EnemyKind, x: number, y: number, elite?: { hpMult: number; scale: number }): void {
    if (this.ending || this.dying) return;
    const e = new Enemy(this, x, y, kind, kind === 'tongs' ? this.cfg.bossHpMult : this.cfg.hpMult, elite);
    if (this.run.chili >= 1) e.speedMult = 1.15;
    if (kind === 'tongs') {
      const style = courseDef(this.cfg.course).boss;
      e.applyStyle({ ...style, name: bossName(this.cfg.course), extraAttack: style.extraAttack || this.run.chili >= 4 });
    }
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
    if (bullet.poisonDps > 0) enemy.poison(bullet.poisonDps * this.stats.poisonMult, POISON_MS, this.gameTime, bullet.src);
    // Push away from where the shot came from (its velocity: spinning shots' rotation means nothing).
    const v = (bullet.body as Phaser.Physics.Arcade.Body).velocity;
    const heading = v.lengthSq() > 1 ? Math.atan2(v.y, v.x) : bullet.rotation;
    const fromX = bullet.x - Math.cos(heading) * 20;
    const fromY = bullet.y - Math.sin(heading) * 20;
    this.damageEnemy(enemy, bullet.damage, fromX, fromY, bullet.knockback, bullet.src);
    if (bullet.pierceLeft > 0) bullet.pierceLeft--;
    else bullet.kill();
  }

  /** Every source of player damage goes through here: crits and lifesteal apply to all of them. */
  private damageEnemy(e: Enemy, amount: number, fromX: number, fromY: number, knockback: number, src: SourceKey = 'other'): void {
    // First Bite talent: extra damage to enemies that haven't been hurt yet.
    if (this.stats.firstBite > 0 && e.hp >= e.maxHp) amount *= 1 + this.stats.firstBite;
    const crit = this.stats.critChance > 0 && Math.random() < this.stats.critChance;
    if (crit) {
      amount *= 2;
      tally(this.run, 'crits');
      // Extra Spicy keystone: crits set enemies on fire.
      if (this.stats.critBurn > 0) e.ignite(this.stats.critBurn, BURN_MS, this.gameTime, 'critBurn');
      this.sparks.setParticleTint(0xffd23f);
      this.sparks.explode(4, e.x, e.y);
    }
    if (this.stats.lifesteal > 0 && !this.dying && Math.random() < this.stats.lifesteal) this.logHeal(this.health.heal(1));
    if (this.rules.burnDps) e.ignite(this.rules.burnDps, BURN_MS, this.gameTime, 'burn');
    audio.play(crit ? 'crit' : 'hit');
    if (getSettings().damageNumbers) this.damageNumbers.spawn(e.x, e.y - e.def.radius, amount, crit, this.gameTime);
    logDamage(this.run.log, src, Math.min(amount, Math.max(0, e.hp)), { crit });
    e.lastHitBy = src;
    if (e.hit(amount, this.gameTime, fromX, fromY, knockback)) this.killEnemy(e);
  }

  /** Healing counts toward the Cookbook and the run stats. */
  private logHeal(amount: number): void {
    if (amount <= 0) return;
    tally(this.run, 'healed', amount);
    this.run.log.healed += amount;
  }

  /** A burning enemy that dies sets the enemies around it on fire (poison doesn't spread). */
  private spreadFire(e: Enemy): void {
    const dps = e.burnDpsAt(this.gameTime);
    if (dps <= 0) return;
    let caught = 0;
    for (const o of this.enemyList()) {
      if (o === e || o.dead) continue;
      if (Math.hypot(o.x - e.x, o.y - e.y) > BURN_SPREAD_RADIUS + o.def.radius) continue;
      o.ignite(dps, BURN_MS, this.gameTime, e.burnSource);
      caught++;
    }
    if (caught) {
      this.sparks.setParticleTint(0xff7a2a);
      this.sparks.explode(6 + 2 * caught, e.x, e.y);
    }
  }

  /** Spiky Bun: enemies touching you take damage (at most every THORNS_COOLDOWN_MS each). */
  private applyThorns(e: Enemy): void {
    if (this.stats.thorns <= 0 || e.dead) return;
    const ready = this.thornsReadyAt.get(e) ?? 0;
    if (this.gameTime < ready) return;
    this.thornsReadyAt.set(e, this.gameTime + THORNS_COOLDOWN_MS);
    this.damageEnemy(e, this.stats.thorns, this.head.x, this.head.y, 200, 'thorns');
  }

  private explode(x: number, y: number, radius: number, damage: number, src: SourceKey = 'other'): void {
    audio.play('explode');
    const ring = this.add.image(x, y, 'ring').setDepth(12).setTint(0x8fe35a).setScale(0.2);
    this.tweens.add({ targets: ring, scale: (radius * 2) / 64, alpha: 0, duration: 260, onComplete: () => ring.destroy() });
    this.sparks.setParticleTint(0x8fe35a);
    this.sparks.explode(10, x, y);
    for (const e of [...this.enemyList()]) {
      if (e.dead) continue;
      if (Math.hypot(e.x - x, e.y - y) <= radius + e.def.radius) this.damageEnemy(e, damage, x, y, 180, src);
    }
  }

  private killEnemy(e: Enemy, byPoison = false): void {
    e.dead = true;
    this.spreadFire(e);
    audio.play('kill');
    this.run.kills++;
    tally(this.run, 'kills');
    if (byPoison) tally(this.run, 'poisonKills');
    logKill(this.run.log, e.lastHitBy);
    this.killTimes.push(this.gameTime);
    while (this.killTimes.length && this.killTimes[0] < this.gameTime - 10_000) this.killTimes.shift();
    tally(this.run, 'killBurst', this.killTimes.length, 'max');
    if (!e.isBoss) this.addSpice(e.def.crumbs * KILL_SPICE_PER_CRUMB);
    this.sparks.setParticleTint(e.isBoss ? 0xb040ff : e.def.kind === 'hotsauce' ? 0xff7a00 : e.def.kind === 'ketchup' ? 0xe0242c : 0xd0d8e0);
    this.sparks.explode(e.isBoss ? 60 : 9, e.x, e.y);
    const crumbs = rollCrumbs(this.rng, e.def.crumbs * this.cfg.crumbMult, this.stats.crumbMult * this.timedEvents.crumbMult);
    this.pickups.spawnCrumbs(e.x, e.y, crumbs);
    if (!this.rules.noCondimentHeal && Math.random() < CONDIMENT_DROP_CHANCE) this.pickups.spawnCondiment(e.x, e.y);
    this.killPop(e);
    e.disableBody(true, true);
    this.tweens.killTweensOf(e); // e.g. its spawn pop-in, if it died while appearing
    this.graveyard.push(e);
    this.timedEvents.onKill(e);
    if (e.isBoss) {
      haptic('bossDown');
      this.win();
    }
  }

  /** Spice goes into the doggy bag, times the current multiplier. */
  private addSpice(base: number): void {
    this.run.bag += base * spiceMult(this.run);
    tally(this.run, 'peakBag', Math.floor(this.run.bag), 'max');
  }

  private collect(kind: 'crumb' | 'condiment'): void {
    if (kind === 'crumb') {
      audio.play('crumb');
      this.run.crumbs++;
      this.run.crumbsEarned++;
      this.run.log.crumbs.picked++;
    } else {
      audio.play('heal');
      const healed = this.health.heal(this.stats.condimentHeal);
      this.logHeal(healed);
      this.floatText(this.head.x, this.head.y - 24, `+${Math.round(healed)} HP`, '#7dff9a');
    }
  }

  /** Picnic Basket reward: a random item rolled like a shop slot, applied right away. */
  private grantRandomItem(): { name: string; color: string } | null {
    const id = rollItem(this.rng, this.run.wave, { luck: this.stats.luck, rarities: unlockedRarities() }, this.run.items, new Set());
    if (!id) return null;
    this.run.items.push(id);
    markSeen(`item:${id}`);
    const old = this.stats;
    this.stats = runStats(this.run);
    this.health.maxHp = this.stats.maxHp;
    if (this.stats.maxHp > old.maxHp) this.health.heal(this.stats.maxHp - old.maxHp);
    this.health.hp = Math.min(this.health.hp, this.health.maxHp);
    this.health.armor = this.stats.armor;
    this.health.regenPerSec = this.stats.regenPerSec;
    this.livesLeft = Math.max(0, this.livesLeft + this.stats.extraLives - old.extraLives);
    const item = ITEMS[id];
    return { name: item.name, color: RARITIES[item.rarity].css };
  }

  /** A hit on the sausage: dodge roll, armor, i-frames, then death or a Second Skin save. */
  private takeDamage(amount: number, source: string): void {
    if (this.dying || this.ending || this.invincible) return;
    if (this.stats.dodge > 0 && Math.random() < this.stats.dodge) {
      this.head.markHit(DODGE_IFRAMES_MS);
      this.run.log.dodges++;
      audio.play('dodge');
      this.floatText(this.head.x, this.head.y - 24, 'DODGE', '#8fd3ff');
      return;
    }
    this.hitThisWave = true;
    if (this.shellHits > 0) {
      this.shellHits--;
      this.run.log.blocked++;
      this.head.markHit();
      audio.play('dodge');
      this.sparks.setParticleTint(0xffc84a);
      this.sparks.explode(12, this.head.x, this.head.y);
      this.floatText(this.head.x, this.head.y - 24, 'BATTER CRACKED!', '#ffd27a');
      if (this.shellHits === 0) {
        this.shellRing?.destroy();
        this.shellRing = null;
      }
      return;
    }
    if (this.shieldUp) {
      // Smoked keystone: the first hit of every wave is absorbed.
      this.shieldUp = false;
      this.run.log.blocked++;
      this.head.markHit(600);
      audio.play('dodge');
      this.floatText(this.head.x, this.head.y - 24, 'SHIELD!', '#ffd0a0');
      return;
    }
    const hpBefore = this.health.hp;
    const dealt = this.health.takeDamage(amount * this.damageTakenMult);
    this.run.log.hitsTaken++;
    logTaken(this.run.log, source, hpBefore - this.health.hp);
    this.head.markHit(HIT_INVULN_MS + this.stats.iframeBonusMs);
    if (!getSettings().reducedMotion) this.hitStopMs = 70;
    this.shake(110, 0.005);
    audio.play('hurt');
    if (!this.health.dead) haptic('hit');
    this.floatText(this.head.x, this.head.y - 24, `-${dealt}`, '#ff6a5a');
    if (this.health.dead) this.onLethal(source);
  }

  /**
   * Damage multiplier right now. Weisswurst: a bonus while the wave is young, a penalty once it
   * has gone stale (the moment is announced once per wave).
   */
  private damageMultNow(): number {
    const f = this.rules.freshness;
    if (!f) return this.stats.damageMult;
    const stale = this.director.elapsedMs >= f.ms;
    if (stale && !this.stale) {
      this.stale = true;
      audio.play('hurt');
      this.floatText(this.head.x, this.head.y - 34, `GONE STALE: ${Math.round(f.stale * 100)}% damage`, '#d8d0b8');
    }
    return Math.max(0.2, this.stats.damageMult + (stale ? f.stale : f.bonus));
  }

  /** Kielbasa: enemy shots and enemies that touch any link hurt, just like hitting the head. */
  private checkLinkHits(): void {
    if (this.dying || this.ending || this.head.invulnerable) return;
    const r = this.chain.radius;
    for (const b of this.enemyBullets.getChildren() as EnemyBullet[]) {
      if (!b.active) continue;
      const br = (b.body as Phaser.Physics.Arcade.Body).halfWidth;
      for (const p of this.chain.positions) {
        if (Math.abs(b.x - p.x) > r + br || Math.abs(b.y - p.y) > r + br) continue;
        if (Math.hypot(b.x - p.x, b.y - p.y) < r + br) {
          b.kill();
          this.takeDamage(b.damage, b.source);
          return;
        }
      }
    }
    for (const e of this.enemyList()) {
      if (e.dead) continue;
      for (const p of this.chain.positions) {
        if (Math.hypot(e.x - p.x, e.y - p.y) < e.def.radius + r) {
          e.shove(p.x, p.y, 260);
          this.takeDamage(e.def.contactDamage, e.def.name);
          return;
        }
      }
    }
  }

  private onLethal(source: string): void {
    if (this.livesLeft > 0) {
      this.livesLeft--;
      this.health.hp = 1;
      this.head.markHit(1500);
      this.flash(250, 255, 200, 160);
      audio.play('save');
      haptic('save');
      this.floatText(this.head.x, this.head.y - 40, 'SECOND SKIN!', '#ffd23f');
      return;
    }
    if (this.run.mods.revive && !this.run.reviveUsed) {
      // Second Skin keystone: once per run, get back up at 40% HP.
      this.run.reviveUsed = true;
      this.health.hp = this.health.maxHp * 0.4;
      this.head.markHit(2000);
      this.flash(300, 255, 220, 120);
      audio.play('save');
      this.floatText(this.head.x, this.head.y - 40, 'BACK FROM THE GRILL!', '#ffd23f');
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

  private readonly onPadLost = (): void => {
    if (getInputMode() === 'pad') this.autoPause();
  };

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
      if (this.helpPanel.isOpen) {
        if (b === 'up' || b === 'down') this.helpPanel.navigate(b === 'up' ? -1 : 1);
        else if (b === 'left' || b === 'right' || b === 'lb' || b === 'rb') this.helpPanel.changeTab(b === 'left' || b === 'lb' ? -1 : 1);
        else if (b === 'b' || b === 'a') this.helpPanel.back();
      } else if (this.settingsPanel.isOpen) {
        if (b === 'up' || b === 'down') this.settingsPanel.navigate(b === 'up' ? -1 : 1);
        else if (b === 'left' || b === 'right') this.settingsPanel.change(b === 'left' ? -1 : 1);
        else if (b === 'a') this.settingsPanel.confirm();
        else if (b === 'b') this.settingsPanel.back();
      } else if (b === 'up' || b === 'down') {
        this.pauseMenu.navigate(b === 'up' ? -1 : 1);
      } else if (b === 'left' || b === 'right') {
        this.pauseMenu.browse(b === 'left' ? -1 : 1);
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
    this.helpPanel.hide();
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
    if (this.paused && this.helpPanel.isOpen) {
      this.helpPanel.back();
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
    this.timedEvents.stop();
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
    this.run.log.crumbs.swept += banked;
    this.addSpice(waveClearSpice(this.cfg.courseWave));
    this.logWave('cleared');
    if (!this.hitThisWave) tally(this.run, 'hitlessWaves');
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
    this.logWave('boss');

    // The boss pays into the bag, drops its trophy, and the first kill pays a First Taste bonus.
    const course = this.cfg.course;
    this.addSpice(BOSS_SPICE * (1 + this.run.mods.bossBonus));
    const trophy = courseTrophy(course);
    this.run.trophies.push(trophy);
    tally(this.run, 'bossKills');
    if (courseDef(course).id === 'smokehouse') tally(this.run, 'smokeyKills');
    if (!this.hitThisWave) tally(this.run, 'hitlessBosses');
    const key = `${this.run.sausage}:${course}`;
    const save = loadSave();
    const taste = firstTasteSpice(course);
    if (taste > 0 && !save.firstTaste.includes(key)) {
      writeSave({ ...save, firstTaste: [...save.firstTaste, key] });
      bankSpice(taste);
      this.run.bankedDuringRun += taste;
      this.time.delayedCall(900, () => this.banner('FIRST TASTE!', `+${taste} Spice, banked for keeps`, 1200));
    }
    this.banner('BOSS DEFEATED!', `+1 ${TROPHIES[trophy].name} in your doggy bag`, 1600);
    const hp = this.health.hp;
    this.time.delayedCall(2600, () => this.scene.start('Choice', { run: this.run, hp }));
  }

  private die(source = 'Unknown'): void {
    if (this.dying || this.ending) return;
    this.dying = true;
    this.health.hp = 0;
    this.run.causeOfDeath = source;
    this.logWave('died');
    this.clearArena();
    this.shake(500, 0.012);
    audio.setMood('off');
    audio.play('death');
    haptic('death');
    this.sizzle.emitting = true;
    this.sizzle.frequency = 25;
    this.banner('SKEWERED!', `Done in by: ${source}`, 1500);
    this.time.delayedCall(2200, () => this.scene.start('GameOver', { run: this.run, outcome: 'death', hp: 0 }));
  }

  /** Adds this wave's numbers to the run stats (once per wave). */
  private logWave(outcome: WaveOutcome): void {
    if (this.waveLogged) return;
    this.waveLogged = true;
    const log = this.run.log;
    const w = this.waveStart;
    log.waves.push({
      wave: this.run.wave,
      course: this.cfg.course,
      boss: !!this.cfg.boss,
      outcome,
      sec: Math.round((this.run.timeSurvivedSec - w.sec) * 10) / 10,
      kills: this.run.kills - w.kills,
      dealt: Math.round(totalDealt(log) - w.dealt),
      taken: Math.round(totalTaken(log) - w.taken),
      crumbs: this.run.crumbsEarned - w.crumbs,
      hpLeft: Math.max(0, Math.round(this.health.hp)),
      maxHp: this.health.maxHp,
      fps: this.waveRealMs > 0 ? Math.round((this.waveFrames * 1000) / this.waveRealMs) : 0,
      slowFrames: this.slowFrames,
    });
  }

  /** Restart / main menu from the pause menu: the run ends here. */
  private leaveRun(outcome: RunEnd): void {
    this.logWave('left');
    recordRunEnd(this.run, outcome, getInputMode());
  }

  private cleanup(): void {
    this.game.events.off(Phaser.Core.Events.BLUR, this.autoPause, this);
    this.game.events.off(Phaser.Core.Events.HIDDEN, this.autoPause, this);
    window.removeEventListener('gamepaddisconnected', this.onPadLost);
    this.weapons.destroy();
    this.chain.destroy();
  }
}

/** The wave as served: the course's wave plus this run's menu and Chili twists. */
export function adjustedWave(run: RunState): WaveConfig {
  const base = waveConfig(run.wave);
  const menu = menuDef(run.menu);
  return {
    ...base,
    hotTiles: base.hotTiles + (menu.extraHotTiles ?? 0),
    spawnIntervalMs: Math.round(base.spawnIntervalMs * (menu.spawnMult ?? 1)),
    hpMult: base.hpMult * (menu.enemyHpMult ?? 1) * (run.chili >= 2 ? 1.25 : 1),
    bossHpMult: base.bossHpMult * (menu.enemyHpMult ?? 1) * (run.chili >= 2 ? 1.25 : 1),
  };
}

/** Arcade overlap callbacks don't guarantee argument order; sort them out by type. */
function pair<A, B>(a: unknown, b: unknown, typeA: abstract new (...args: never[]) => A): [A | null, B | null] {
  if (a instanceof typeA) return [a as A, b as B];
  if (b instanceof typeA) return [b as A, a as B];
  return [null, null];
}
