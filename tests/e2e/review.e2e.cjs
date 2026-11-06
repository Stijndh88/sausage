/**
 * Code-review bug hunt: lifecycle / correctness tests.
 *
 * Tests marked `knownBug` reproduce a confirmed, unfixed bug and are expected to fail.
 * The rest guard invariants that currently hold.
 *
 * Most tests stop the WaveDirector right after the run starts so nothing spawns on its own,
 * then build the exact situation through the scene's (TypeScript-private) methods.
 */
const { assert } = require('./harness.cjs');

/** Installs window.__rv helpers in the page. Call after startRun. */
function installHelpers(g) {
  return g.evaluate(() => {
    const scene = () => window.__game.scene.getScene('Game');
    window.__rv = {
      scene,
      /** Stop natural spawns and make the sausage take no damage. */
      quiet() {
        const s = scene();
        s.director.stop();
        s.invincible = true;
      },
      spawn(kind, x, y) {
        const s = scene();
        s.spawnEnemy(kind, x, y);
        const list = s.enemyList();
        return list[list.length - 1];
      },
      /** Fire a player bullet directly from the pool. */
      fire(shot) {
        const s = scene();
        const b = s.playerBullets.get(shot.x, shot.y);
        b.fire({ speed: 640, damage: 8, texture: 'pb-toothpick', lifetimeMs: 2000, ...shot }, s.time.now);
        return b;
      },
      /** A Pickle Launcher shot, exactly like WeaponSystem.fire builds it. */
      firePickle(x, y, tx, ty, lifetimeMs) {
        const s = scene();
        return window.__rv.fire({
          x, y, angle: Math.atan2(ty - y, tx - x), speed: 400, damage: 18, texture: 'pb-pickle', lifetimeMs,
          lobTarget: { x: tx, y: ty }, explodeRadius: 72, onExplode: (ex, ey, r, d) => s.explode(ex, ey, r, d),
        });
      },
      texts() {
        return scene().children.list.filter((o) => o.type === 'Text' && o.active).map((o) => o.text);
      },
      /** Resolve once the Game scene has advanced `ms` of game (delta) time. */
      gameMs(ms) {
        return new Promise((resolve) => {
          const s = scene();
          let acc = 0;
          const fn = (_t, d) => { acc += d; if (acc >= ms) { s.events.off('update', fn); resolve(); } };
          s.events.on('update', fn);
        });
      },
      /** Resolve after `n` Game updates. */
      frames(n) {
        return new Promise((resolve) => {
          const s = scene();
          let left = n;
          const fn = () => { if (--left <= 0) { s.events.off('postupdate', fn); resolve(); } };
          s.events.on('postupdate', fn);
        });
      },
    };
  });
}

/**
 * Headless Chromium reports the page as unfocused, and Phaser's TimeStep then clamps every
 * frame's delta to 16.7ms while `time.now` follows the wall clock. Pretend we're focused so
 * delta-driven time (physics, delayedCall, director) runs at wall speed like in a real browser.
 */
function realtime(g) {
  return g.evaluate(() => { window.__game.loop.inFocus = true; window.__game.loop._coolDown = 0; });
}

/** Wait `ms` of Game-scene delta time. */
function gameMs(g, ms) {
  return g.evaluate((m) => window.__rv.gameMs(m), ms);
}

/** A key press held long enough to span a frame (Key.onUp clears _justDown). */
async function tap(page, key) {
  await page.keyboard.down(key);
  await page.waitForTimeout(150);
  await page.keyboard.up(key);
}

async function setup(g, opts = {}) {
  await realtime(g);
  await g.startRun({ seed: 7, weapons: [], ...opts });
  await installHelpers(g);
  await g.evaluate(() => window.__rv.quiet());
}

module.exports = {
  tests: [
    // ------------------------------------------------------------------ invariants
    {
      name: 'review: an enemy hit by several damage sources in one frame is killed (and paid) once',
      timeoutMs: 30000,
      fn: async ({ g }) => {
        await setup(g);
        const r = await g.evaluate(() => {
          const s = window.__rv.scene();
          const e = window.__rv.spawn('fork', s.head.x + 200, s.head.y);
          e.hp = 1;
          const kills0 = s.run.kills;
          const drops0 = s.pickups.drops.length;
          // Bullet, explosion, orbit ring and poison all in the same frame.
          s.damageEnemy(e, 5, e.x, e.y, 0);
          s.explode(e.x, e.y, 80, 20);
          s.damageEnemy(e, 5, e.x, e.y, 0);
          e.poison(100, 1000, s.time.now);
          const poisonKilled = e.think(s.enemyCtx, s.time.now, 0.1);
          return { kills: s.run.kills - kills0, drops: s.pickups.drops.length - drops0, poisonKilled, graveyard: s.graveyard.filter((x) => x === e).length };
        });
        assert.equal(r.kills, 1);
        assert.equal(r.poisonKilled, false);
        assert.equal(r.graveyard, 1);
        assert.ok(r.drops >= 1 && r.drops <= 2, `fork should drop 1 crumb (+maybe a condiment), got ${r.drops}`);
      },
    },
    {
      name: 'review: boss death from several sources triggers exactly one Victory',
      timeoutMs: 30000,
      fn: async ({ g }) => {
        await setup(g, { wave: 10 });
        const r = await g.evaluate(() => {
          const s = window.__rv.scene();
          let starts = 0;
          const orig = s.scene.start.bind(s.scene);
          s.scene.start = (k, d) => { if (k === 'Victory') starts++; return orig(k, d); };
          window.__victoryStarts = () => starts;
          const boss = window.__rv.spawn('tongs', s.head.x, s.head.y - 200);
          boss.hp = 1;
          s.damageEnemy(boss, 10, 0, 0, 0);
          s.explode(boss.x, boss.y, 100, 100);
          s.damageEnemy(boss, 10, 0, 0, 0);
          s.killEnemy(boss); // even a direct second kill call must not re-run win()
          return { kills: s.run.kills, ending: s.ending, banners: window.__rv.texts().filter((t) => t.includes('ESCAPED')).length };
        });
        assert.equal(r.ending, true);
        assert.equal(r.banners, 1);
        await g.waitForScene('Victory', 15000);
        await g.wait(300);
        // The scene object was shut down; read the counter we left on window.
        assert.equal(await g.evaluate(() => window.__victoryStarts()), 1);
      },
    },
    {
      name: 'review: pending boss bullet callbacks do not leak into a restarted Game scene',
      timeoutMs: 30000,
      fn: async ({ g }) => {
        await setup(g, { wave: 10 });
        await g.evaluate(() => {
          const s = window.__rv.scene();
          const boss = window.__rv.spawn('tongs', s.head.x, s.head.y - 250);
          boss.hp = boss.maxHp * 0.4; // phase 2
          boss.attackIndex = 1; // i % 3 === 1 → 14 delayed spiral ticks over ~1.2s
          boss.nextFireAt = 0;
          boss.think(s.enemyCtx, s.time.now, 0.016);
          // Restart straight into a wave-1 run (forks only, nothing shoots).
          const run = window.__debug.newRun(3);
          window.__game.scene.start('Game', { run });
        });
        await g.wait(300);
        await installHelpers(g);
        await g.evaluate(() => window.__rv.quiet());
        let max = 0;
        for (let i = 0; i < 15; i++) {
          max = Math.max(max, (await g.gameState()).enemyBullets);
          await g.wait(100);
        }
        assert.equal(max, 0, 'boss spiral bullets appeared in the new run');
      },
    },
    {
      name: 'review: HUD shows current and max HP',
      timeoutMs: 20000,
      fn: async ({ g }) => {
        await setup(g, {});
        const text = await g.evaluate(async () => {
          const s = window.__rv.scene();
          s.invincible = false;
          s.takeDamage(10, 'test');
          await window.__rv.frames(2);
          return s.hud.hpText.text;
        });
        assert.equal(text, '90 / 100');
      },
    },
    {
      name: 'review: WaveDirector turret accounting returns to zero after stop()',
      timeoutMs: 20000,
      fn: async ({ g }) => {
        await realtime(g);
        await g.startRun({ seed: 7, wave: 9, weapons: [] });
        await installHelpers(g);
        const r = await g.evaluate(async () => {
          const s = window.__rv.scene();
          s.invincible = true;
          const d = s.director;
          d.telegraph('hotsauce', 300, 300, 750);
          d.telegraph('hotsauce', 900, 300, 750);
          const pending = d.pendingTurrets;
          d.stop();
          await window.__rv.gameMs(1200);
          return { pending, after: d.pendingTurrets, turrets: s.enemyList().filter((e) => e.def.kind === 'hotsauce').length };
        });
        assert.ok(r.pending >= 2);
        assert.equal(r.after, 0);
        assert.equal(r.turrets, 0);
      },
    },

    // ------------------------------------------------------------------ pause bugs
    {
      name: 'review: condiment packets do not expire while the game is paused',
      timeoutMs: 30000,
      fn: async ({ g }) => {
        await setup(g);
        await g.evaluate(() => {
          const s = window.__rv.scene();
          s.pickups.spawnCondiment(s.head.x + 300, s.head.y);
          s.pickups.drops[s.pickups.drops.length - 1].expiresAt = s.time.now + 1500; // 1.5s of life left
          s.togglePause();
        });
        await g.wait(2500); // paused longer than the remaining lifetime
        await g.evaluate(() => window.__rv.scene().togglePause());
        await g.evaluate(() => window.__rv.frames(3));
        const left = await g.evaluate(() => window.__rv.scene().pickups.drops.filter((d) => d.kind === 'condiment').length);
        assert.equal(left, 1, 'condiment vanished during the pause');
      },
    },
    {
      name: 'review: post-hit invulnerability survives a pause',
      timeoutMs: 30000,
      fn: async ({ g }) => {
        await setup(g);
        await g.evaluate(() => {
          const s = window.__rv.scene();
          s.head.markHit(); // 750ms of i-frames
          s.togglePause();
        });
        await g.wait(1000);
        const inv = await g.evaluate(() => {
          const s = window.__rv.scene();
          s.togglePause();
          return s.head.invulnerable;
        });
        assert.equal(inv, true, 'i-frames ran out while paused');
      },
    },
    {
      name: 'review: a lobbed pickle does not explode (or kill) while the game is paused',
      timeoutMs: 30000,
      fn: async ({ g }) => {
        await setup(g);
        const before = await g.evaluate(() => {
          const s = window.__rv.scene();
          const e = window.__rv.spawn('fork', s.head.x + 160, s.head.y);
          e.hp = 1;
          // Pickle flying past the fork toward a target further away, 0.6s of flight left.
          window.__rv.firePickle(s.head.x + 110, s.head.y, s.head.x + 500, s.head.y, 600);
          s.togglePause();
          return s.run.kills;
        });
        await g.wait(1500);
        const r = await g.evaluate(() => {
          const s = window.__rv.scene();
          return { kills: s.run.kills, paused: s.paused, pickles: s.playerBullets.getChildren().filter((b) => b.active && b.lobTarget).length };
        });
        assert.equal(r.paused, true);
        assert.equal(r.kills, before, 'an enemy was killed while the game was paused');
        assert.equal(r.pickles, 1, 'the pickle in flight was consumed during the pause');
      },
    },
    {
      name: 'review: killing the boss with a pickle while paused soft-locks the game (stuck on PAUSED)',
      timeoutMs: 30000,
      fn: async ({ page, g }) => {
        await setup(g, { wave: 10 });
        await g.evaluate(() => {
          const s = window.__rv.scene();
          const boss = window.__rv.spawn('tongs', s.head.x + 170, s.head.y);
          boss.hp = 1;
          window.__rv.firePickle(s.head.x + 110, s.head.y, s.head.x + 500, s.head.y, 600);
          s.togglePause();
        });
        await g.wait(1500);
        await tap(page, 'Escape'); // try to resume
        await g.wait(300);
        const r = await g.evaluate(() => { const s = window.__rv.scene(); return { paused: s.paused, ending: s.ending, clockPaused: s.time.paused }; });
        assert.equal(r.paused, false, `game is stuck paused (ending=${r.ending}, clock paused=${r.clockPaused})`);
        // Once fixed, the pickle resolves after the pause; finish the boss off either way.
        await gameMs(g, 800);
        await g.evaluate(() => { const s = window.__rv.scene(); if (!s.boss.dead) s.damageEnemy(s.boss, 1e9, 0, 0, 0); });
        await g.waitForScene('Victory', 15000);
      },
    },
    {
      name: 'review: Esc pauses and resumes (physics, clock and overlay)',
      timeoutMs: 20000,
      fn: async ({ page, g }) => {
        await setup(g);
        await tap(page, 'Escape');
        const p = await g.evaluate(() => { const s = window.__rv.scene(); return { paused: s.paused, clock: s.time.paused, world: s.physics.world.isPaused, text: !!(s.pauseText && s.pauseText.active) }; });
        assert.deepEqual(p, { paused: true, clock: true, world: true, text: true });
        await tap(page, 'Escape');
        const r = await g.evaluate(() => { const s = window.__rv.scene(); return { paused: s.paused, clock: s.time.paused, world: s.physics.world.isPaused, text: !!(s.pauseText && s.pauseText.active) }; });
        assert.deepEqual(r, { paused: false, clock: false, world: false, text: false });
      },
    },
    {
      name: 'review: at low FPS enemies do not outpace the wave clock',
      timeoutMs: 40000,
      fn: async ({ g }) => {
        await realtime(g);
        await g.startRun({ seed: 7, weapons: [] });
        await installHelpers(g);
        const r = await g.evaluate(async () => {
          const s = window.__rv.scene();
          s.invincible = true;
          s.director.nextSpawnMs = Infinity; // timer keeps running, nothing spawns
          s.head.setPosition(1150, 600);
          const fork = window.__rv.spawn('fork', 120, 160);
          // Simulate a slow device: ~110ms frames.
          const busy = () => { const t = performance.now(); while (performance.now() - t < 100); };
          window.__game.events.on('prestep', busy);
          await window.__rv.frames(15); // let delta smoothing settle and the spawn tween finish
          const x0 = fork.x; const y0 = fork.y; const e0 = s.director.elapsedMs;
          await window.__rv.frames(12);
          const moved = Math.hypot(fork.x - x0, fork.y - y0);
          const waveSec = (s.director.elapsedMs - e0) / 1000;
          window.__game.events.off('prestep', busy);
          return { moved, waveSec, pxPerWaveSec: moved / waveSec };
        });
        // Fork speed is 100 px/s; allow 30% slack.
        assert.ok(r.pxPerWaveSec < 130, `fork covered ${r.pxPerWaveSec.toFixed(0)} px per wave-timer second (moved ${r.moved.toFixed(0)}px in ${r.waveSec.toFixed(2)}s)`);
      },
    },

    // ------------------------------------------------------------------ death / boss
    {
      name: 'review: player bullets still in flight after charring cannot trigger win()',
      timeoutMs: 30000,
      fn: async ({ g }) => {
        await setup(g, { wave: 10 });
        await g.evaluate(() => {
          const s = window.__rv.scene();
          const boss = window.__rv.spawn('tongs', s.head.x + 150, s.head.y);
          boss.hp = 1;
          boss.nextFireAt = Infinity; // keep it quiet
        });
        await gameMs(g, 300); // spawn pop-in tween done
        await g.evaluate(() => {
          const s = window.__rv.scene();
          window.__rv.fire({ x: s.head.x + 20, y: s.boss.y, angle: 0 }); // already on its way when we char
          s.invincible = false;
          s.takeDamage(500, 'test'); // dead
        });
        await gameMs(g, 600);
        const r = await g.evaluate(() => {
          const s = window.__rv.scene();
          return { dying: s.dying, ending: s.ending, bossDead: s.boss.dead, texts: window.__rv.texts() };
        });
        assert.equal(r.dying, true);
        assert.ok(!r.texts.some((t) => t.includes('ESCAPED')), `victory banner shown over the death screen: ${JSON.stringify(r.texts)}`);
        assert.equal(r.ending, false, 'win() ran after the sausage died');
      },
    },
    {
      name: 'review: boss delayed attacks stop when the sausage chars',
      timeoutMs: 30000,
      fn: async ({ g }) => {
        await setup(g, { wave: 10 });
        await g.evaluate(() => {
          const s = window.__rv.scene();
          const boss = window.__rv.spawn('tongs', s.head.x, s.head.y - 250);
          boss.hp = boss.maxHp * 0.4;
          boss.attackIndex = 1; // phase-2 spiral: 14 ticks, 90ms apart
          boss.nextFireAt = 0;
          boss.think(s.enemyCtx, s.time.now, 0.016);
          s.invincible = false;
          s.takeDamage(500, 'test'); // die() → patterns.clear()
        });
        await gameMs(g, 500);
        const n = (await g.gameState()).enemyBullets;
        assert.equal(n, 0, `${n} boss bullets were fired after death`);
      },
    },
    {
      name: 'review: curving boss bullets eventually leave play',
      timeoutMs: 45000,
      fn: async ({ g }) => {
        // Wave 1 with spawning stopped, so the only enemy bullets are the ring below
        // (in the boss wave the boss keeps firing fresh bullets).
        await setup(g, { wave: 1 });
        // Exactly the boss's phase-2 "curving double ring" call, with the boss at (300, 330).
        await g.evaluate(() => {
          const s = window.__rv.scene();
          s.director.stop();
          s.head.setPosition(640, 440);
          s.patterns.ring(300, 360, 24, 190, 10, 'eb-boss', 0, 0.5);
        });
        await gameMs(g, 15000); // > one full loop (2π / 0.5 ≈ 12.6s)
        const n = (await g.gameState()).enemyBullets;
        assert.equal(n, 0, `${n} curving bullets are still orbiting after 16s`);
      },
    },

    // ------------------------------------------------------------------ shop
    {
      name: 'review: holding Space (dash) through the wave-clear transition does not skip the shop',
      timeoutMs: 30000,
      fn: async ({ page, g }) => {
        await setup(g, { seed: 1 });
        await page.keyboard.down('Space'); // dashing
        await g.fastForwardWave();
        await g.waitForScene('Shop', 15000);
        await page.keyboard.down('Space'); // OS key-repeat while still held
        await g.wait(400);
        await page.keyboard.up('Space');
        assert.equal(await g.scene(), 'Shop', 'shop was skipped');
      },
    },
    {
      name: 'review: two "next wave" inputs in one frame advance exactly one wave',
      timeoutMs: 20000,
      fn: async ({ g }) => {
        await g.openShop({ run: { wave: 3 } });
        await g.evaluate(() => {
          // Enter + click on "Next wave" (or Enter + Space) landing in the same frame.
          const ev = (key, keyCode) => new KeyboardEvent('keydown', { key, code: key, keyCode, bubbles: true });
          window.dispatchEvent(ev('Enter', 13));
          window.dispatchEvent(ev(' ', 32));
        });
        await g.waitForScene('Game');
        const s = await g.gameState();
        assert.equal(s.wave, 4);
      },
    },

    // ------------------------------------------------------------------ misc gameplay
    {
      name: 'review: touching a Hot Sauce turret does not shove it around',
      timeoutMs: 20000,
      fn: async ({ g }) => {
        await setup(g);
        const start = await g.evaluate(() => {
          const s = window.__rv.scene();
          const t = window.__rv.spawn('hotsauce', s.head.x + 10, s.head.y);
          window.__turret = t;
          return { x: t.x, y: t.y };
        });
        await g.wait(800);
        const end = await g.evaluate(() => ({ x: window.__turret.x, y: window.__turret.y }));
        const moved = Math.hypot(end.x - start.x, end.y - start.y);
        assert.ok(moved < 2, `turret moved ${moved.toFixed(1)}px`);
      },
    },
    {
      name: 'review: HUD crumb counter returns to normal size after a burst of pickups',
      timeoutMs: 20000,
      fn: async ({ g }) => {
        await setup(g);
        await g.wait(200);
        const scales = await g.evaluate(async () => {
          const s = window.__rv.scene();
          const out = [];
          for (let trial = 0; trial < 5; trial++) {
            // Collect one crumb on each of 3 consecutive frames (a typical magnet burst).
            for (let i = 0; i < 3; i++) {
              s.run.crumbs++;
              await window.__rv.frames(1);
            }
            await new Promise((r) => setTimeout(r, 400));
            out.push(+s.hud.crumbText.scale.toFixed(3));
          }
          return out;
        });
        assert.ok(scales.every((v) => Math.abs(v - 1) < 0.01), `crumb text scale after bursts: ${scales}`);
      },
    },
    {
      name: 'review: onion rings move continuously when fire rate changes mid-wave',
      timeoutMs: 20000,
      fn: async ({ g }) => {
        await setup(g, { weapons: [{ id: 'onion', tier: 1 }] });
        await g.wait(3000); // let absolute time grow a bit
        const maxStep = await g.evaluate(async () => {
          const s = window.__rv.scene();
          const spr = s.weapons.rings[0].sprites[0];
          const steps = [];
          let prev = spr.rotation;
          for (let i = 0; i < 20; i++) {
            if (i === 10) s.stats.fireRateMult = 1.2; // e.g. an item bought or a buff: fire rate ×1.2
            await window.__rv.frames(1);
            let d = Math.abs(spr.rotation - prev) % (Math.PI * 2);
            d = Math.min(d, Math.PI * 2 - d);
            steps.push(d);
            prev = spr.rotation;
          }
          return Math.max(...steps);
        });
        // 3.2 rad/s × 1.2 at ≤50ms per frame ≈ 0.19 rad/frame max.
        assert.ok(maxStep < 0.3, `rings jumped ${maxStep.toFixed(2)} rad in one frame`);
      },
    },
    {
      name: 'review: HUD does not re-render unchanged text every frame',
      timeoutMs: 20000,
      fn: async ({ g }) => {
        await setup(g, {});
        const calls = await g.evaluate(async () => {
          const s = window.__rv.scene();
          s.health.regenPerSec = 0; // HP (and so the HP text) stays constant
          const counts = { tier: 0, timer: 0 };
          for (const [k, t] of [['tier', s.hud.hpText], ['timer', s.hud.timerText]]) {
            const orig = t.updateText.bind(t);
            t.updateText = () => { counts[k]++; return orig(); };
          }
          await window.__rv.frames(30);
          return counts;
        });
        // The timer legitimately changes once a second; the HP text not at all.
        assert.ok(calls.tier <= 2 && calls.timer <= 6, `updateText calls over 30 frames: ${JSON.stringify(calls)}`);
      },
    },
    {
      name: 'review: spawn-mark blink tweens are released when the mark is gone',
      timeoutMs: 20000,
      fn: async ({ g }) => {
        await realtime(g);
        await g.startRun({ seed: 7, weapons: [] });
        await installHelpers(g);
        const r = await g.evaluate(async () => {
          const s = window.__rv.scene();
          s.invincible = true;
          const before = s.tweens.getTweens().length;
          for (let i = 0; i < 40; i++) s.director.telegraph('fork', 100 + i * 25, 200, 50);
          await window.__rv.gameMs(800);
          s.director.stop();
          for (const e of s.enemyList()) { e.dead = true; e.disableBody(true, true); }
          await window.__rv.gameMs(400);
          return { before, after: s.tweens.getTweens().length, marks: s.director.marks.size };
        });
        assert.equal(r.marks, 0);
        assert.ok(r.after - r.before < 10, `${r.after - r.before} tweens left running on destroyed spawn marks`);
      },
    },
  ],
};
