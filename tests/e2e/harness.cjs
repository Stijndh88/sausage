/**
 * Shared helpers for browser (end-to-end) tests. Each e2e file exports:
 *
 *   module.exports = {
 *     tests: [
 *       { name: 'does a thing', timeoutMs: 60000, fn: async ({ page, g, url }) => { ... } },
 *       { name: 'reproduces bug X', knownBug: 'short description', fn: async (...) => { ... } },
 *     ],
 *   };
 *
 * `knownBug` tests are expected to FAIL (they reproduce an unfixed bug). If one starts passing,
 * the runner reports it so the marker can be removed and it becomes a normal regression test.
 *
 * `g` is a GameDriver (below). Throw (or use `assert`) to fail a test.
 */
const assert = require('node:assert/strict');

const IGNORED_CONSOLE = [/GL Driver Message/i, /GPU stall/i, /WebGL/i, /favicon/i];

class GameDriver {
  constructor(page) {
    this.page = page;
    this.errors = [];
    page.on('pageerror', (e) => this.errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() !== 'error') return;
      const text = m.text();
      if (IGNORED_CONSOLE.some((r) => r.test(text))) return;
      this.errors.push(`console.error: ${text}`);
    });
  }

  /**
   * Load the page and wait for the menu.
   * Headless Chromium never focuses the page, and Phaser caps every frame's delta at 16.7ms
   * while unfocused, so game time would crawl at ~20-25% of wall time. We mark the loop as
   * focused so game time tracks wall time as closely as the frame rate allows.
   */
  async open(url) {
    await this.page.goto(url);
    await this.waitForScene('Menu', 15000);
    await this.page.evaluate(() => {
      window.__game.loop.inFocus = true;
      window.__game.loop._coolDown = 0;
    });
  }

  /** Game time (ms) of the active Game scene; pauses with the game. Null outside a Game. */
  gameTime() {
    return this.page.evaluate(() => {
      const s = window.__game.scene.getScene('Game');
      return s && window.__game.scene.isActive('Game') ? s.gameTime : null;
    });
  }

  /** Wait until the Game scene's own clock has advanced by `ms` (wall-clock waits mean little headless). */
  async waitGameMs(ms, timeoutMs = 60000) {
    const start = await this.gameTime();
    if (start === null) throw new Error('waitGameMs: no active Game scene');
    await this.page.waitForFunction(
      ([t0, d]) => {
        const s = window.__game.scene.getScene('Game');
        return !window.__game.scene.isActive('Game') || s.gameTime - t0 >= d;
      },
      [start, ms],
      { timeout: timeoutMs, polling: 50 },
    );
  }

  /** Run a function in the page with access to the Phaser game. Use `window.__game` inside. */
  evaluate(fn, arg) {
    return this.page.evaluate(fn, arg);
  }

  /** Keys of the currently active scenes, e.g. ['Game']. */
  activeScenes() {
    return this.page.evaluate(() => window.__game.scene.getScenes(true).map((s) => s.scene.key));
  }

  async scene() {
    return (await this.activeScenes())[0] ?? null;
  }

  async waitForScene(key, timeoutMs = 10000) {
    await this.page.waitForFunction(
      (k) => !!window.__game && window.__game.scene.isActive(k),
      key,
      { timeout: timeoutMs, polling: 50 },
    );
  }

  /**
   * Start a fresh run directly, skipping the menu.
   * opts: { seed, wave, crumbs, sausage, weapons: [{id, tier}], items: [ids] }
   */
  async startRun(opts = {}) {
    await this.page.evaluate((o) => {
      const game = window.__game;
      const run = window.__debug.newRun(o.seed ?? 12345, o.sausage);
      if (o.wave) run.wave = o.wave;
      if (o.crumbs !== undefined) run.crumbs = o.crumbs;
      if (o.weapons) run.weapons = o.weapons;
      if (o.items) run.items = o.items;
      for (const s of game.scene.getScenes(true)) if (s.scene.key !== 'Game') game.scene.stop(s.scene.key);
      game.scene.start('Game', { run });
    }, opts);
    await this.waitForScene('Game');
    // Wait one frame so create() has finished.
    await this.page.waitForFunction(() => {
      const s = window.__game.scene.getScene('Game');
      return !!(s && s.director && s.head);
    }, null, { timeout: 5000, polling: 50 });
  }

  /** Start the Shop scene directly with a run. */
  async openShop(opts = {}) {
    await this.page.evaluate((o) => {
      const game = window.__game;
      const run = window.__debug.newRun(o.seed ?? 12345);
      Object.assign(run, o.run ?? {});
      for (const s of game.scene.getScenes(true)) if (s.scene.key !== 'Shop') game.scene.stop(s.scene.key);
      game.scene.start('Shop', { run });
    }, opts);
    await this.waitForScene('Shop');
  }

  /** Read state from the Game scene. */
  gameState() {
    return this.page.evaluate(() => {
      const s = window.__game.scene.getScene('Game');
      if (!s || !window.__game.scene.isActive('Game') || !s.director) return null;
      return {
        wave: s.run.wave,
        hp: s.health.hp,
        maxHp: s.health.maxHp,
        crumbs: s.run.crumbs,
        kills: s.run.kills,
        elapsedSec: s.director.elapsedMs / 1000,
        enemies: s.enemyList().filter((e) => !e.dead).length,
        enemyBullets: s.enemyBullets.countActive(true),
        playerBullets: s.playerBullets.countActive(true),
        bossHp: s.boss ? s.boss.hp : null,
        ending: s.ending,
        dying: s.dying,
        displayList: s.children.length,
      };
    });
  }

  /** Make the sausage take no damage in the current Game scene. */
  godMode() {
    return this.page.evaluate(() => {
      window.__game.scene.getScene('Game').invincible = true;
    });
  }

  /** End the current wave's timer immediately. */
  fastForwardWave() {
    return this.page.evaluate(() => {
      window.__game.scene.getScene('Game').director.elapsedMs = 1e9;
    });
  }

  /**
   * Install a simple kiting bot that steers away from enemies and nearby bullets.
   * It sets key states each 50ms; it doesn't dash and doesn't chase pickups.
   */
  installBot() {
    return this.page.evaluate(() => {
      if (window.__bot) clearInterval(window.__bot);
      window.__bot = setInterval(() => {
        const game = window.__game;
        if (!game.scene.isActive('Game')) return;
        const s = game.scene.getScene('Game');
        if (!s.head || !s.head.active || !s.controls) return;
        const h = s.head;
        let fx = 0;
        let fy = 0;
        for (const e of s.enemyList()) {
          if (e.dead) continue;
          const dx = h.x - e.x;
          const dy = h.y - e.y;
          const d2 = dx * dx + dy * dy + 1;
          fx += (dx / d2) * 1000;
          fy += (dy / d2) * 1000;
        }
        for (const b of s.enemyBullets.getChildren()) {
          if (!b.active) continue;
          const dx = h.x - b.x;
          const dy = h.y - b.y;
          const d2 = dx * dx + dy * dy + 1;
          if (d2 < 120 * 120) {
            fx += (dx / d2) * 600;
            fy += (dy / d2) * 600;
          }
        }
        fx += (640 - h.x) * 0.004 - (h.y - 400) * 0.003;
        fy += (400 - h.y) * 0.004 + (h.x - 640) * 0.003;
        // Physical keys (KeyboardEvent.code), the same on every keyboard layout.
        const c = s.controls;
        c.setHeld('KeyD', fx > 0.3);
        c.setHeld('KeyA', fx < -0.3);
        c.setHeld('KeyS', fy > 0.3);
        c.setHeld('KeyW', fy < -0.3);
      }, 50);
    });
  }

  removeBot() {
    return this.page.evaluate(() => {
      if (window.__bot) clearInterval(window.__bot);
      window.__bot = null;
    });
  }

  /**
   * Start recording CPU time per frame. Records the whole game step (update + render)
   * and the active scenes' update alone. Headless Chromium renders in software, so FPS
   * there is not representative; update time is the useful number.
   */
  startFrameStats() {
    return this.page.evaluate(() => {
      const game = window.__game;
      const stats = { step: [], update: [] };
      window.__frameStats = stats;
      if (!window.__origLoopCb) window.__origLoopCb = game.loop.callback;
      const orig = window.__origLoopCb;
      game.loop.callback = (t, d) => {
        const a = performance.now();
        orig(t, d);
        stats.step.push(performance.now() - a);
      };
      for (const s of game.scene.scenes) {
        if (s.sys.__origStep) continue;
        s.sys.__origStep = s.sys.step;
        s.sys.step = function (t, d) {
          const a = performance.now();
          this.__origStep(t, d);
          if (window.__frameStats) window.__frameStats.update.push(performance.now() - a);
        };
      }
    });
  }

  /** Stop recording and return summary stats in ms. */
  stopFrameStats() {
    return this.page.evaluate(() => {
      const st = window.__frameStats || { step: [], update: [] };
      window.__frameStats = null;
      const summarize = (arr) => {
        if (!arr.length) return { n: 0 };
        const sorted = [...arr].sort((a, b) => a - b);
        const pct = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
        const avg = arr.reduce((x, y) => x + y, 0) / arr.length;
        return { n: arr.length, avg: +avg.toFixed(2), p50: +pct(0.5).toFixed(2), p95: +pct(0.95).toFixed(2), max: +sorted[sorted.length - 1].toFixed(2) };
      };
      return { step: summarize(st.step), update: summarize(st.update), fps: +window.__game.loop.actualFps.toFixed(1) };
    });
  }

  /**
   * JS heap in MB (Chromium only), read through the DevTools protocol.
   * performance.memory is bucketed by Chromium and can't see small leaks.
   */
  async heapMB(gc = true) {
    const client = await this.page.context().newCDPSession(this.page);
    try {
      if (gc) await client.send('HeapProfiler.collectGarbage');
      const { usedSize } = await client.send('Runtime.getHeapUsage');
      return +(usedSize / 1048576).toFixed(2);
    } finally {
      await client.detach();
    }
  }

  /** Fail if any uncaught page errors or console errors were seen. */
  assertNoErrors() {
    assert.deepEqual(this.errors, [], `Page errors:\n${this.errors.join('\n')}`);
  }

  wait(ms) {
    return this.page.waitForTimeout(ms);
  }
}

module.exports = { GameDriver, assert };
