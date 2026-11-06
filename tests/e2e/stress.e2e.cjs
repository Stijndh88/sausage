/**
 * Stress, performance and leak tests.
 *
 * Most tests drive the game in "sim mode": the RAF loop is put to sleep and the page steps the game
 * itself at a fixed 60 Hz (prestep → scene update → poststep, no rendering). That makes the
 * simulation deterministic in time, much faster than real time, and independent of headless
 * Chromium's software WebGL, so update-cost numbers are meaningful and long sessions are cheap.
 * Tests that are about the real browser loop (frame stats, hidden tab, main-thread stall) use it.
 *
 * Each test prints a one-line `·` summary with its measurements.
 */
const { assert } = require('./harness.cjs');

const FULL_KIT = [
  { id: 'onion', tier: 4 }, { id: 'onion', tier: 4 }, { id: 'pepper', tier: 4 },
  { id: 'mustard', tier: 4 }, { id: 'pickle', tier: 4 }, { id: 'skewer', tier: 4 },
];
const KIT_ITEMS = ['paprika', 'paprika', 'espresso_mustard', 'espresso_mustard', 'big_bun', 'relish', 'cold_cuts', 'secret_sauce'];

// Budgets for the fixed-60Hz simulated update (game logic + Arcade physics, no render).
// Measured p95 is ~1-2 ms on a loaded 4-core CI box, so these only catch real regressions.
const SIM_P95_BUDGET_MS = 16;
const SIM_AVG_BUDGET_MS = 8;

const report = (name, data) => console.log(`      · ${name} ${JSON.stringify(data)}`);

// ---------------------------------------------------------------------------
// Local helpers (kept here so the shared harness stays untouched).

/** Install window.__sim: manual fixed-step driver with an inline kiting bot. */
function installSim(g) {
  return g.evaluate(() => {
    const game = window.__game;
    const steer = () => {
      if (!game.scene.isActive('Game')) return;
      const s = game.scene.getScene('Game');
      if (!s.head || !s.head.active || !s.keys) return;
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
      const k = s.keys;
      k.D.isDown = fx > 0.3;
      k.A.isDown = fx < -0.3;
      k.S.isDown = fy > 0.3;
      k.W.isDown = fy < -0.3;
    };
    const summarize = (arr) => {
      if (!arr.length) return { n: 0 };
      const sorted = [...arr].sort((a, b) => a - b);
      const pct = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
      const avg = arr.reduce((x, y) => x + y, 0) / arr.length;
      return { n: arr.length, avg: +avg.toFixed(3), p50: +pct(0.5).toFixed(2), p95: +pct(0.95).toFixed(2), max: +sorted[sorted.length - 1].toFixed(2) };
    };
    window.__sim = {
      t: 0,
      on: false,
      hook: null,
      begin() {
        if (this.on) return;
        game.loop.sleep();
        this.t = Math.max(performance.now(), game.loop.now || 0);
        this.on = true;
      },
      /** One game step without rendering. `gapMs` simulates a frame gap (RAF time jumps, delta doesn't). */
      step(dt, gapMs = 0) {
        this.t += dt + gapMs;
        game.events.emit('prestep', this.t, dt);
        game.events.emit('step', this.t, dt);
        game.scene.update(this.t, dt);
        game.events.emit('poststep', this.t, dt);
      },
      /** Run n frames at 60 Hz. opts: { bot, until: sceneKey }. Returns update-time stats. */
      run(n, opts = {}) {
        this.begin();
        const dt = 1000 / 60;
        const times = [];
        for (let i = 0; i < n; i++) {
          if (opts.bot && i % 3 === 0) steer();
          if (this.hook) this.hook(i);
          const a = performance.now();
          this.step(dt);
          times.push(performance.now() - a);
          if (opts.until && game.scene.isActive(opts.until)) break;
        }
        return summarize(times);
      },
    };
  });
}

/** Start a Game run in sim mode (the scene transition is processed by stepping). */
async function simStart(g, opts = {}) {
  await g.evaluate((o) => {
    const game = window.__game;
    const run = window.__debug.newRun(o.seed ?? 12345);
    if (o.wave) run.wave = o.wave;
    if (o.weapons) run.weapons = o.weapons;
    if (o.items) run.items = o.items;
    for (const s of game.scene.getScenes(true)) if (s.scene.key !== 'Game') game.scene.stop(s.scene.key);
    game.scene.start('Game', { run });
    window.__sim.run(2);
    const s = game.scene.getScene('Game');
    if (!game.scene.isActive('Game') || !s.director) throw new Error('Game scene did not start');
    if (o.god) s.invincible = true;
  }, opts);
}

function sim(g, frames, opts = {}) {
  return g.evaluate(([n, o]) => window.__sim.run(n, o), [frames, opts]);
}

/**
 * Precise JS heap after GC. (performance.memory, which the shared harness uses, is bucketed
 * and cached by Chromium unless it runs with --enable-precise-memory-info, so it barely moves.)
 */
async function heapMB(page) {
  const c = await page.context().newCDPSession(page);
  await c.send('HeapProfiler.collectGarbage');
  await c.send('HeapProfiler.collectGarbage');
  const h = await c.send('Runtime.getHeapUsage');
  await c.detach();
  return +(h.usedSize / 1048576).toFixed(2);
}

/** Object/listener counts for the active scene and for global managers. */
function counts(g) {
  return g.evaluate(() => {
    const game = window.__game;
    const listeners = (em) => em.eventNames().reduce((a, n) => a + em.listenerCount(n), 0);
    const out = {
      scene: game.scene.getScenes(true).map((x) => x.scene.key).join(','),
      textures: Object.keys(game.textures.list).length,
      gameListeners: listeners(game.events),
      captures: game.input.keyboard.captures.length,
      sceneListeners: game.scene.scenes.reduce((a, s) => a + listeners(s.sys.events), 0),
    };
    const s = game.scene.getScenes(true)[0];
    if (s) {
      out.display = s.children.length;
      out.updateList = s.sys.updateList.length;
      out.tweens = s.tweens.getTweens().length;
      out.timers = s.time._active.length + s.time._pendingInsertion.length;
      out.keys = s.input.keyboard.keys.filter(Boolean).length;
      out.kbListeners = listeners(s.input.keyboard);
      out.interactive = s.input._list.length;
      out.bodies = s.physics && s.physics.world ? s.physics.world.bodies.size : 0;
    }
    return out;
  });
}

/** Spawn enemies until the wave's maxAlive, using the wave's weights. Optionally unkillable. */
function fillToMaxAlive(g, unkillable) {
  return g.evaluate((immortal) => {
    const s = window.__game.scene.getScene('Game');
    s.director.stop();
    const cfg = s.cfg;
    const kinds = Object.entries(cfg.weights);
    const total = kinds.reduce((a, [, w]) => a + w, 0);
    let turrets = 0;
    let i = 0;
    while (s.enemyList().filter((e) => !e.dead).length < cfg.maxAlive && i++ < 500) {
      let r = ((i * 0.6180339887) % 1) * total;
      let kind = 'fork';
      for (const [k, w] of kinds) { if ((r -= w) <= 0) { kind = k; break; } }
      if (kind === 'hotsauce' && turrets >= cfg.maxTurrets) kind = 'fork';
      if (kind === 'hotsauce') turrets++;
      const a = s.arena;
      s.spawnEnemy(kind, a.left + 30 + ((i * 97) % (a.width - 60)), a.top + 30 + ((i * 61) % (a.height - 60)));
    }
    if (immortal) for (const e of s.enemyList()) e.hp = 1e12;
    return { maxAlive: cfg.maxAlive, alive: s.enemyList().length };
  }, unkillable);
}

function deadTargetTweens(g) {
  return g.evaluate(() => {
    const s = window.__game.scene.getScene('Game');
    // A destroyed Phaser GameObject has scene === undefined.
    return s.tweens.getTweens().filter((t) => (t.targets || []).some((x) => x && typeof x === 'object' && 'renderFlags' in x && x.scene === undefined)).length;
  });
}

/** Compare two count snapshots: listener/key counts must match exactly, object counts within slack. */
function assertBounded(first, last, label) {
  for (const k of ['gameListeners', 'captures', 'sceneListeners', 'keys', 'kbListeners']) {
    assert.equal(last[k], first[k], `${label}: ${k} grew ${first[k]} → ${last[k]}`);
  }
  const slack = { textures: 8, display: 60, updateList: 30, tweens: 30, timers: 10, interactive: 4, bodies: 80 };
  for (const [k, s] of Object.entries(slack)) {
    if (first[k] === undefined) continue;
    assert.ok(last[k] <= first[k] + s, `${label}: ${k} grew ${first[k]} → ${last[k]} (slack ${s})`);
  }
}

// ---------------------------------------------------------------------------

module.exports = {
  tests: [
    // ------------------------------------------------------------------ leaks
    {
      name: 'stress: 100 game→shop→game cycles keep heap, objects, tweens, timers and listeners bounded',
      timeoutMs: 90000,
      fn: async ({ g, page }) => {
        await installSim(g);
        await simStart(g, { seed: 3, wave: 3, weapons: FULL_KIT, items: KIT_ITEMS, god: true });
        const snaps = {};
        let heap20 = 0;
        for (let i = 1; i <= 100; i++) {
          await sim(g, 150, { bot: true });
          if (i === 10 || i === 100) snaps[i] = await counts(g);
          if (i === 20) heap20 = await heapMB(page);
          await g.fastForwardWave();
          await sim(g, 300, { bot: true, until: 'Shop' });
          assert.equal(await g.scene(), 'Shop', `cycle ${i}: wave did not end`);
          await g.evaluate(() => {
            const shop = window.__game.scene.getScene('Shop');
            shop.run.wave = 2; // next() increments: keep replaying wave 3 so snapshots are comparable
            shop.next();
          });
          await sim(g, 5, { until: 'Game' });
          await g.evaluate(() => { window.__game.scene.getScene('Game').invincible = true; });
        }
        const heap100 = await heapMB(page);
        report('cycles', { at10: snaps[10], at100: snaps[100], heap20, heap100 });
        assertBounded(snaps[10], snaps[100], 'game↔shop');
        assert.ok(heap100 - heap20 < 3, `heap grew ${heap20} → ${heap100} MB over 80 cycles`);
      },
    },
    {
      name: 'stress: 100 die→GameOver→new run cycles (Enter) stay bounded',
      timeoutMs: 90000,
      fn: async ({ g, page }) => {
        await installSim(g);
        await simStart(g, { seed: 3, wave: 3, weapons: FULL_KIT, items: KIT_ITEMS });
        const snaps = {};
        let heap20 = 0;
        for (let i = 1; i <= 100; i++) {
          await sim(g, 120, { bot: true });
          if (i === 10 || i === 100) snaps[i] = await counts(g);
          if (i === 20) heap20 = await heapMB(page);
          await g.evaluate(() => window.__game.scene.getScene('Game').takeDamage(500, 'test'));
          await sim(g, 300, { until: 'GameOver' });
          assert.equal(await g.scene(), 'GameOver', `cycle ${i}: did not reach GameOver`);
          await page.keyboard.press('Enter');
          await sim(g, 5, { until: 'Game' });
          assert.equal(await g.scene(), 'Game', `cycle ${i}: Enter did not start a new run`);
        }
        const heap100 = await heapMB(page);
        report('cycles', { at10: snaps[10], at100: snaps[100], heap20, heap100 });
        assertBounded(snaps[10], snaps[100], 'die↔gameover');
        assert.ok(heap100 - heap20 < 3, `heap grew ${heap20} → ${heap100} MB over 80 cycles`);
      },
    },
    {
      name: 'stress: 60 menu→game→GameOver→menu cycles and 30 boss→Victory cycles stay bounded',
      timeoutMs: 90000,
      fn: async ({ g, page }) => {
        await installSim(g);
        const menu = {};
        for (let i = 1; i <= 60; i++) {
          await page.keyboard.press('Enter'); // menu → sausage select
          await sim(g, 5, { until: 'Select' });
          await sim(g, 20); // the select screen ignores keys for 250ms
          await page.keyboard.press('Enter'); // select → game
          await sim(g, 5, { until: 'Game' });
          assert.equal(await g.scene(), 'Game', `cycle ${i}: Enter on menu did not start`);
          await sim(g, 60, { bot: true });
          await g.evaluate(() => window.__game.scene.getScene('Game').takeDamage(500, 'test'));
          await sim(g, 300, { until: 'GameOver' });
          await g.evaluate(() => {
            const go = window.__game.scene.getScene('GameOver');
            go.children.list.find((o) => o.label && o.label.text.startsWith('Main menu')).emit('pointerdown');
          });
          await sim(g, 5, { until: 'Menu' });
          assert.equal(await g.scene(), 'Menu', `cycle ${i}: did not return to the menu`);
          if (i === 10 || i === 60) menu[i] = { ...(await counts(g)), heap: await heapMB(page) };
        }
        assertBounded(menu[10], menu[60], 'menu↔game');
        const victory = {};
        for (let i = 1; i <= 30; i++) {
          await simStart(g, { seed: i, wave: 10, weapons: FULL_KIT, items: KIT_ITEMS, god: true });
          await sim(g, 150, { bot: true });
          await g.evaluate(() => { const s = window.__game.scene.getScene('Game'); s.damageEnemy(s.boss, 1e9, 0, 0, 0); });
          await sim(g, 300, { until: 'Victory' });
          assert.equal(await g.scene(), 'Victory', `cycle ${i}: boss kill did not reach Victory`);
          await sim(g, 60);
          if (i === 5 || i === 30) victory[i] = { ...(await counts(g)), heap: await heapMB(page) };
        }
        report('cycles', { menu, victory });
        assertBounded(victory[5], victory[30], 'victory');
        assert.ok(menu[60].heap - menu[10].heap < 3, `heap grew over menu cycles: ${menu[10].heap} → ${menu[60].heap}`);
        assert.ok(victory[30].heap - victory[5].heap < 3, `heap grew over victory cycles: ${victory[5].heap} → ${victory[30].heap}`);
      },
    },
    {
      name: 'stress: spawn telegraphs do not leak looping tweens on destroyed marks',
      timeoutMs: 60000,
      fn: async ({ g }) => {
        await installSim(g);
        await simStart(g, { seed: 5, wave: 9, weapons: FULL_KIT, items: KIT_ITEMS, god: true });
        await sim(g, 1800, { bot: true }); // 30 s of wave 9
        const spawned = await g.evaluate(() => window.__game.scene.getScene('Game').run.kills);
        const dead = await deadTargetTweens(g);
        const c = await counts(g);
        report('tweens', { deadTargetTweens: dead, tweens: c.tweens, kills: spawned });
        assert.ok(dead <= 10, `${dead} tweens still running on destroyed objects after 30 s of wave 9`);
      },
    },
    {
      name: 'stress: long session — wave 9 held open for 3 simulated minutes stays within budget and caps',
      timeoutMs: 90000,
      fn: async ({ g, page }) => {
        await installSim(g);
        await simStart(g, { seed: 5, wave: 9, weapons: FULL_KIT, items: KIT_ITEMS, god: true });
        await g.evaluate(() => {
          const s = window.__game.scene.getScene('Game');
          window.__peak = { alive: 0, eb: 0, pb: 0 };
          // Hold the wave 3 s before its end (spawn rate is at its maximum there) and track peaks.
          window.__sim.hook = () => {
            const lim = s.cfg.durationSec * 1000 - 3000;
            const d = s.director.elapsedMs - lim;
            if (d > 0) { s.director.elapsedMs -= d; s.director.nextSpawnMs -= d; }
            let alive = 0;
            for (const e of s.enemyList()) if (!e.dead) alive++;
            const p = window.__peak;
            p.alive = Math.max(p.alive, alive);
            p.eb = Math.max(p.eb, s.enemyBullets.countActive(true));
            p.pb = Math.max(p.pb, s.playerBullets.countActive(true));
          };
        });
        const heap0 = await heapMB(page);
        const first = await sim(g, 3600, { bot: true });
        await sim(g, 3600, { bot: true });
        const last = await sim(g, 3600, { bot: true });
        const state = await g.evaluate(() => {
          const s = window.__game.scene.getScene('Game');
          window.__sim.hook = null;
          return { scene: window.__game.scene.isActive('Game'), maxAlive: s.cfg.maxAlive, peak: window.__peak, drops: s.pickups.drops.length, display: s.children.length, tweens: s.tweens.getTweens().length, kills: s.run.kills };
        });
        const heap1 = await heapMB(page);
        report('long', { first, last, ...state, heap0, heap1 });
        assert.ok(state.scene, 'wave should still be running');
        assert.ok(state.peak.alive <= state.maxAlive, `alive enemies peaked at ${state.peak.alive} > maxAlive ${state.maxAlive}`);
        assert.ok(state.peak.eb <= 900 && state.peak.pb <= 600, 'pools exceeded their caps');
        assert.ok(last.p95 < SIM_P95_BUDGET_MS, `update p95 in minute 3 = ${last.p95} ms`);
        assert.ok(last.avg < SIM_AVG_BUDGET_MS, `update avg in minute 3 = ${last.avg} ms`);
      },
    },

    // ------------------------------------------------------------------ pools
    {
      name: 'stress: enemy bullet pool saturates at 900 (40 turrets + boss) without errors or slowdown',
      timeoutMs: 60000,
      fn: async ({ g }) => {
        await installSim(g);
        await simStart(g, { seed: 9, wave: 10, weapons: [{ id: 'toothpick', tier: 1 }], god: true });
        const r = await g.evaluate(() => {
          const s = window.__game.scene.getScene('Game');
          s.director.stop();
          const a = s.arena;
          s.spawnEnemy('tongs', a.centerX, a.top + 140);
          for (let i = 0; i < 40; i++) s.spawnEnemy('hotsauce', a.left + 40 + (i % 10) * ((a.width - 80) / 9), a.top + 60 + Math.floor(i / 10) * 150);
          for (const e of s.enemyList()) e.hp = 1e12;
          const pool = s.enemyBullets;
          const get = pool.get.bind(pool);
          let requests = 0;
          let refused = 0;
          pool.get = (...args) => { requests++; const b = get(...args); if (!b) refused++; return b; };
          let peak = 0;
          window.__sim.hook = () => { peak = Math.max(peak, pool.countActive(true)); };
          const st = window.__sim.run(1200, { bot: true });
          window.__sim.hook = null;
          return { ...st, peak, size: pool.getLength(), requests, refused };
        });
        report('enemy pool', r);
        assert.ok(r.peak >= 880, `pool should saturate (peak ${r.peak})`);
        assert.ok(r.size <= 900, `pool grew past maxSize: ${r.size}`);
        assert.ok(r.refused > 0, 'expected some refused get() calls at saturation');
        assert.ok(r.p95 < SIM_P95_BUDGET_MS, `update p95 at saturation = ${r.p95} ms`);
      },
    },
    {
      name: 'stress: player bullet pool saturation (600) is handled by every weapon kind',
      timeoutMs: 60000,
      fn: async ({ g }) => {
        await installSim(g);
        await simStart(g, { seed: 9, wave: 9, weapons: FULL_KIT, items: KIT_ITEMS, god: true });
        const r = await g.evaluate(() => {
          const s = window.__game.scene.getScene('Game');
          s.director.stop();
          const a = s.arena;
          for (let i = 0; i < 40; i++) s.spawnEnemy(['fork', 'spatula', 'ketchup'][i % 3], a.left + 40 + ((i * 97) % (a.width - 80)), a.top + 40 + ((i * 61) % (a.height - 80)));
          for (const e of s.enemyList()) e.hp = 1e12;
          // Fill the pool with slow, long-lived shots spread over the arena (a single dense cluster
          // would instead measure Arcade's quadratic group-vs-group overlap in one tree cell).
          const now = s.time.now;
          for (let i = 0; i < 650; i++) {
            s.weapons.shot({ x: 60 + ((i * 37) % 1160), y: 100 + ((i * 53) % 580), angle: i, speed: 1, damage: 0, texture: 'pb-toothpick', lifetimeMs: 60000 }, now);
          }
          const full = s.playerBullets.countActive(true);
          const st = window.__sim.run(300, { bot: true }); // every weapon keeps trying to fire into a full pool
          return { full, size: s.playerBullets.getLength(), ...st };
        });
        report('player pool', r);
        assert.equal(r.full, 600);
        assert.ok(r.size <= 600, `pool grew past maxSize: ${r.size}`);
        assert.ok(r.p95 < SIM_P95_BUDGET_MS * 2, `update p95 with a full player pool = ${r.p95} ms`);
      },
    },

    // ------------------------------------------------------------------ frame time
    {
      name: 'perf: fixed-60Hz update cost per wave (1, 5, 9, boss) with full kit, items and bot',
      timeoutMs: 90000,
      fn: async ({ g }) => {
        await installSim(g);
        const rows = {};
        for (const wave of [1, 5, 9, 10]) {
          await simStart(g, { seed: 7, wave, weapons: FULL_KIT, items: KIT_ITEMS, god: true });
          await sim(g, 300, { bot: true });
          rows[wave] = await sim(g, 1200, { bot: true }); // 20 s
          rows[wave].scene = await g.scene();
        }
        report('per wave', rows);
        for (const [w, r] of Object.entries(rows)) {
          assert.ok(r.p95 < SIM_P95_BUDGET_MS, `wave ${w}: update p95 ${r.p95} ms`);
          assert.ok(r.avg < SIM_AVG_BUDGET_MS, `wave ${w}: update avg ${r.avg} ms`);
        }
      },
    },
    {
      name: 'perf: every wave filled to maxAlive (unkillable enemies, full kit firing) stays within budget',
      timeoutMs: 90000,
      fn: async ({ g }) => {
        await installSim(g);
        const rows = {};
        for (const wave of [1, 5, 9, 10]) {
          await simStart(g, { seed: 7, wave, weapons: FULL_KIT, items: KIT_ITEMS, god: true });
          const fill = await fillToMaxAlive(g, true);
          await sim(g, 120, { bot: true });
          rows[wave] = { ...fill, ...(await sim(g, 900, { bot: true })) };
          rows[wave].withoutEnemyCollider = await g.evaluate(() => {
            const s = window.__game.scene.getScene('Game');
            const c = s.physics.world.colliders.getActive().find((x) => x.object1 === s.enemies && x.object2 === s.enemies);
            c.active = false;
            const st = window.__sim.run(600, { bot: true });
            c.active = true;
            return { avg: st.avg, p95: st.p95 };
          });
        }
        report('maxAlive', rows);
        for (const [w, r] of Object.entries(rows)) {
          assert.equal(r.alive, r.maxAlive, `wave ${w} did not fill`);
          assert.ok(r.p95 < SIM_P95_BUDGET_MS, `wave ${w} at maxAlive: update p95 ${r.p95} ms`);
        }
      },
    },
    {
      name: 'perf: real browser loop update time on wave 9 and boss (full kit, bot, god mode)',
      timeoutMs: 90000,
      fn: async ({ g }) => {
        const rows = {};
        for (const wave of [9, 10]) {
          await g.startRun({ seed: 7, wave, weapons: FULL_KIT, items: KIT_ITEMS });
          await g.godMode();
          await g.installBot();
          await g.wait(5000);
          await g.startFrameStats();
          await g.wait(12000);
          rows[wave] = { ...(await g.stopFrameStats()), state: await g.gameState() };
        }
        await g.removeBot();
        report('real loop', rows);
        // Headless renders WebGL in software (~10 fps), so a frame runs several physics steps.
        // This only catches catastrophic regressions; the sim tests above hold the real budget.
        for (const [w, r] of Object.entries(rows)) assert.ok(r.update.p95 < 60, `wave ${w}: real-loop update p95 ${r.update.p95} ms`);
      },
    },
    {
      name: 'perf: HUD does not re-render its text textures every frame',
      timeoutMs: 60000,
      fn: async ({ g }) => {
        await installSim(g);
        await simStart(g, { seed: 1, wave: 1, god: true });
        const r = await g.evaluate(() => {
          const s = window.__game.scene.getScene('Game');
          s.director.stop();
          s.health.regenPerSec = 0; // keep the readout constant
          window.__sim.run(70); // let the banner finish
          const proto = Object.getPrototypeOf(s.hud.hpText);
          const orig = proto.updateText;
          const by = {};
          proto.updateText = function () { by[this.text] = (by[this.text] || 0) + 1; return orig.call(this); };
          s.director.elapsedMs = 0; // timer text stays at the same second for the window below
          window.__sim.run(30);
          proto.updateText = orig;
          return { redraws: Object.values(by).reduce((a, b) => a + b, 0), by };
        });
        report('text redraws in 30 frames', r);
        assert.ok(r.redraws <= 4, `${r.redraws} Text redraws in 30 idle frames: ${JSON.stringify(r.by)}`);
      },
    },

    // ------------------------------------------------------------------ frame gaps / pause / timers
    {
      name: 'timers: pausing for 10 s does not expire condiments, recharge the dash or end i-frames',
      timeoutMs: 60000,
      fn: async ({ g }) => {
        await installSim(g);
        await simStart(g, { seed: 2, wave: 1, god: true });
        const r = await g.evaluate(() => {
          const s = window.__game.scene.getScene('Game');
          s.director.stop();
          window.__sim.run(60);
          s.pickups.spawnCondiment(s.head.x + 300, s.head.y); // outside the 90px magnet radius
          s.head.markHit();
          s.head.drive(1, 0, 1, true, s.stats.dashCooldownMs); // spend the dash
          const before = { condiments: s.pickups.drops.length, dash: s.head.dashCharge(s.stats.dashCooldownMs), invuln: s.head.invulnerable };
          s.togglePause();
          window.__sim.run(600); // 10 s paused
          s.togglePause();
          window.__sim.run(1);
          const after = { condiments: s.pickups.drops.length, dash: s.head.dashCharge(s.stats.dashCooldownMs), invuln: s.head.invulnerable };
          return { before, after };
        });
        report('pause', r);
        assert.equal(r.after.condiments, r.before.condiments, 'condiment packet expired while paused');
        assert.ok(r.after.dash < 0.5, `dash recharged while paused (${r.after.dash})`);
        assert.ok(r.after.invuln, 'hit invulnerability ran out while paused');
      },
    },
    {
      name: 'timers: a 10 s hidden tab does not expire condiment packets',
      timeoutMs: 60000,
      fn: async ({ g, page }) => {
        await g.startRun({ seed: 2, wave: 1 });
        await g.godMode();
        const before = await g.evaluate(() => {
          const s = window.__game.scene.getScene('Game');
          s.director.stop();
          s.pickups.spawnCondiment(s.head.x + 300, s.head.y);
          return { condiments: s.pickups.drops.length, now: s.time.now };
        });
        const setHidden = (hidden) => page.evaluate((h) => {
          Object.defineProperty(document, 'hidden', { value: h, configurable: true });
          document.dispatchEvent(new Event('visibilitychange'));
        }, hidden);
        await setHidden(true);
        await g.wait(10000);
        await setHidden(false);
        await g.wait(500);
        const after = await g.evaluate(() => {
          const s = window.__game.scene.getScene('Game');
          return { condiments: s.pickups.drops.length, now: s.time.now };
        });
        report('hidden tab', { before, after });
        assert.equal(after.condiments, before.condiments, 'condiment packet expired while the tab was hidden');
      },
    },
    {
      name: 'timers: at 10 fps the wave timer still runs in real time',
      timeoutMs: 60000,
      fn: async ({ g }) => {
        await installSim(g);
        await simStart(g, { seed: 7, wave: 4, god: true });
        const r = await g.evaluate(() => {
          const s = window.__game.scene.getScene('Game');
          const e0 = s.director.elapsedMs;
          const t0 = s.time.now;
          for (let i = 0; i < 100; i++) window.__sim.step(100); // 10 s at 10 fps (Phaser passes deltas up to 200 ms)
          return { directorSec: (s.director.elapsedMs - e0) / 1000, clockSec: (s.time.now - t0) / 1000 };
        });
        report('10 fps', r);
        assert.ok(Math.abs(r.directorSec - r.clockSec) < 0.5, `wave clock advanced ${r.directorSec}s while the game clock advanced ${r.clockSec}s`);
      },
    },
    {
      name: 'lag: a 10 s main-thread stall causes no tunneling, nothing leaves the arena and play resumes',
      timeoutMs: 60000,
      fn: async ({ g, page }) => {
        await g.startRun({ seed: 2, wave: 6, weapons: FULL_KIT });
        await g.godMode();
        await g.evaluate(() => {
          const s = window.__game.scene.getScene('Game');
          s.director.stop();
          const a = s.arena;
          for (let i = 0; i < 16; i++) s.spawnEnemy('spatula', a.left + 40 + i * 70, a.top + 40);
          for (let i = 0; i < 4; i++) s.spawnEnemy('hotsauce', a.left + 100 + i * 300, a.bottom - 60);
          for (const e of s.enemyList()) e.hp = 1e12;
        });
        await g.wait(2500);
        // Dash into the right wall at the moment the main thread blocks.
        const before = await g.evaluate(() => {
          const s = window.__game.scene.getScene('Game');
          s.head.x = s.arena.right - 30;
          s.keys.D.isDown = true;
          s.head.drive(1, 0, 1, true, s.stats.dashCooldownMs);
          return { x: s.head.x, kills: s.run.kills };
        });
        await page.evaluate(() => { const t = performance.now(); while (performance.now() - t < 10000) { /* stall */ } });
        await g.wait(1500);
        const after = await g.evaluate(() => {
          const s = window.__game.scene.getScene('Game');
          s.keys.D.isDown = false;
          const a = s.arena;
          const b = s.physics.world.bounds;
          const out = (o, r, m) => o.x < r.left - m || o.x > r.right + m || o.y < r.top - m || o.y > r.bottom + m;
          return {
            head: [Math.round(s.head.x), Math.round(s.head.y)],
            headOut: out(s.head, b, 1),
            enemiesOut: s.enemyList().filter((e) => !e.dead && out(e, a, 1)).length,
            bulletsFar: s.enemyBullets.getChildren().filter((x) => x.active && out(x, { left: 0, right: 1280, top: 0, bottom: 720 }, 60)).length,
            alive: s.enemyList().filter((e) => !e.dead).length,
            delta: window.__game.loop.delta,
          };
        });
        report('stall', { before, after });
        assert.ok(!after.headOut, `head left the world bounds: ${after.head}`);
        assert.equal(after.enemiesOut, 0, 'enemies outside the arena after the stall');
        assert.equal(after.bulletsFar, 0, 'bullets far offscreen were not culled');
        assert.equal(after.alive, 20, 'enemies were lost during the stall');
        assert.ok(after.delta < 100, `loop delta did not recover: ${after.delta}`);
      },
    },
    {
      name: 'timers: boss delayed volleys never fire into a restarted scene',
      timeoutMs: 60000,
      fn: async ({ g }) => {
        await installSim(g);
        await simStart(g, { seed: 4, wave: 10, god: true });
        const r = await g.evaluate(() => {
          const game = window.__game;
          let s = game.scene.getScene('Game');
          window.__sim.run(120);
          s.director.stop();
          Object.assign(s.boss, { hp: s.boss.maxHp * 0.4, attackIndex: 1, nextFireAt: 0, mode: 'move' }); // phase-2 14-tick spiral
          window.__sim.run(1);
          const pending = s.time._active.length + s.time._pendingInsertion.length;
          game.scene.start('Game', { run: window.__debug.newRun(1) });
          window.__sim.run(3);
          s = game.scene.getScene('Game');
          s.director.stop();
          window.__sim.run(120);
          return { pending, wave: s.run.wave, enemyBullets: s.enemyBullets.countActive(true), timers: s.time._active.length };
        });
        report('restart', r);
        assert.ok(r.pending >= 14, 'boss volley should have queued delayed calls');
        assert.equal(r.wave, 1);
        assert.equal(r.enemyBullets, 0, 'stale boss callbacks fired into the new scene');
      },
    },
    {
      name: 'timers: the boss stops firing once the sausage dies',
      timeoutMs: 60000,
      fn: async ({ g }) => {
        await installSim(g);
        await simStart(g, { seed: 4, wave: 10 });
        const r = await g.evaluate(() => {
          const s = window.__game.scene.getScene('Game');
          s.invincible = true;
          window.__sim.run(120);
          s.director.stop();
          Object.assign(s.boss, { hp: s.boss.maxHp * 0.4, attackIndex: 1, nextFireAt: 0, mode: 'move' });
          window.__sim.run(1);
          s.invincible = false;
          s.takeDamage(500, 'test');
          window.__sim.run(90);
          return { dying: s.dying, enemyBullets: s.enemyBullets.countActive(true) };
        });
        report('after death', r);
        assert.ok(r.dying);
        assert.equal(r.enemyBullets, 0, `${r.enemyBullets} boss bullets spawned after death`);
      },
    },
    {
      name: 'tweens: HUD crumb counter returns to normal size after rapid pickups',
      timeoutMs: 60000,
      fn: async ({ g }) => {
        await installSim(g);
        await simStart(g, { seed: 1, wave: 1, god: true });
        const r = await g.evaluate(() => {
          const s = window.__game.scene.getScene('Game');
          s.director.stop();
          window.__sim.run(10);
          for (let i = 0; i < 8; i++) { s.run.crumbs++; window.__sim.run(1); } // a burst of magnetised crumbs
          window.__sim.run(60);
          return { scale: s.hud.crumbText.scale };
        });
        report('crumb text', r);
        assert.ok(Math.abs(r.scale - 1) < 0.01, `crumb counter stuck at scale ${r.scale}`);
      },
    },
  ],
};
