/** Timed in-run events: the schedule, the HUD track, and every event start-to-finish. */
const { assert } = require('./harness.cjs');

const SAVE = { version: 1, bestWave: 0, wins: 0, runs: 0, bestWaveBy: {}, winsBy: {}, lastSausage: 'frank', tutorialDone: true };

async function setup(g, page, opts) {
  await page.evaluate((v) => localStorage.setItem('wurst-case-scenario/save', JSON.stringify(v)), SAVE);
  await g.startRun({ seed: 7, wave: 6, ...opts });
  // Log every finished event.
  await g.evaluate(() => {
    const s = window.__game.scene.getScene('Game');
    window.__evlog = [];
    const orig = s.timedEvents.hooks.onEventDone;
    s.timedEvents.hooks.onEventDone = (r) => { window.__evlog.push(r); orig(r); };
    // Keep the scheduled events out of the way of the one under test.
    s.timedEvents.next = s.timedEvents.schedule.length;
  });
}

const trigger = (g, kind) => g.evaluate((k) => window.__game.scene.getScene('Game').timedEvents.trigger(k), kind);
const log = (g) => g.evaluate(() => window.__evlog);

/** Hold the sausage on a point every 30ms (physics would otherwise keep it where it is anyway). */
const pinHead = (g, fn) => g.evaluate((src) => {
  const where = new Function('s', src);
  window.__pin = setInterval(() => {
    const s = window.__game.scene.getScene('Game');
    if (!s || !s.head || !s.head.body) return;
    const p = where(s);
    if (p) s.head.body.reset(p.x, p.y);
  }, 30);
}, fn);
const unpin = (g) => g.evaluate(() => clearInterval(window.__pin));

module.exports = {
  tests: [
    {
      name: 'events: the wave rolls its events and shows them on the HUD track',
      fn: async ({ g }) => {
        await g.startRun({ seed: 7, wave: 6 });
        const info = await g.evaluate(() => {
          const s = window.__game.scene.getScene('Game');
          return { schedule: s.timedEvents.schedule, icons: s.hud.track ? s.hud.track.icons.length : 0, track: s.hud.trackBounds };
        });
        assert.equal(info.schedule.length, 3);
        assert.equal(info.icons, 3);
        assert.ok(info.track.y + info.track.h <= 64, 'track stays inside the HUD strip');
      },
    },
    {
      name: 'events: scheduled events fire at their second',
      fn: async ({ g }) => {
        await g.startRun({ seed: 7, wave: 6 });
        await g.godMode();
        const first = await g.evaluate(() => window.__game.scene.getScene('Game').timedEvents.schedule[0]);
        await g.evaluate((t) => { window.__game.scene.getScene('Game').director.elapsedMs = t * 1000 - 300; }, first.atSec);
        await g.waitGameMs(600);
        const fired = await g.evaluate(() => window.__game.scene.getScene('Game').timedEvents.fired);
        assert.deepEqual(fired, [first.kind]);
      },
    },
    {
      name: 'events: the boss wave has no event track',
      fn: async ({ g }) => {
        await g.startRun({ seed: 7, wave: 10 });
        const n = await g.evaluate(() => window.__game.scene.getScene('Game').timedEvents.schedule.length);
        assert.equal(n, 0);
      },
    },
    {
      name: 'events: standing in the picnic basket circle opens it and grants an item',
      fn: async ({ g, page }) => {
        await setup(g, page);
        await g.godMode();
        await trigger(g, 'basket');
        await g.waitGameMs(100);
        const before = await g.evaluate(() => window.__game.scene.getScene('Game').run.items.length);
        await pinHead(g, `const r = s.timedEvents.running.find((x) => x.kind === 'basket');
          const img = r && s.children.list.find((o) => o.texture && o.texture.key === 'evt-basket');
          return img ? { x: img.x, y: img.y } : null;`);
        await g.waitGameMs(3600);
        await unpin(g);
        const after = await g.evaluate(() => window.__game.scene.getScene('Game').run.items.length);
        assert.equal(after, before + 1);
        const l = await log(g);
        assert.equal(l.length, 1);
        assert.equal(l[0].kind, 'basket');
        assert.equal(l[0].success, true);
        assert.ok(l[0].crumbs > 0);
        assert.equal(await g.evaluate(() => window.__game.scene.getScene('Game').run.eventsWon.basket), 1);
      },
    },
    {
      name: 'events: an ignored basket disappears and reports a failure',
      timeoutMs: 60000,
      fn: async ({ g, page }) => {
        await setup(g, page);
        await g.godMode();
        await trigger(g, 'basket');
        await g.waitGameMs(16500);
        const l = await log(g);
        assert.deepEqual(l.map((r) => [r.kind, r.success]), [['basket', false]]);
        const props = await g.evaluate(() => window.__game.scene.getScene('Game').children.list.filter((o) => o.texture && o.texture.key === 'evt-basket' && o.active).length);
        assert.equal(props, 0);
      },
    },
    {
      name: 'events: catching the golden hot dog pays crumbs',
      fn: async ({ g, page }) => {
        await setup(g, page);
        await g.godMode();
        await trigger(g, 'golden');
        await g.waitGameMs(200);
        await pinHead(g, `const img = s.children.list.find((o) => o.texture && o.texture.key === 'sausage-head' && o !== s.head && o.active);
          return img ? { x: img.x, y: img.y } : null;`);
        await g.waitGameMs(800);
        await unpin(g);
        const l = await log(g);
        assert.equal(l.length, 1);
        assert.equal(l[0].kind, 'golden');
        assert.equal(l[0].success, true);
      },
    },
    {
      name: 'events: happy hour speeds up shots and doubles crumbs, then ends',
      timeoutMs: 60000,
      fn: async ({ g, page }) => {
        await setup(g, page);
        await g.godMode();
        await trigger(g, 'happy');
        await g.waitGameMs(200);
        const during = await g.evaluate(() => { const e = window.__game.scene.getScene('Game').timedEvents; return [e.fireRateMult, e.crumbMult]; });
        assert.deepEqual(during, [1.3, 2]);
        await g.waitGameMs(15200);
        const after = await g.evaluate(() => { const e = window.__game.scene.getScene('Game').timedEvents; return [e.fireRateMult, e.crumbMult]; });
        assert.deepEqual(after, [1, 1]);
        assert.deepEqual((await log(g)).map((r) => r.kind), ['happy']);
      },
    },
    {
      name: 'events: a bounty completes when enough enemies die in time',
      fn: async ({ g, page }) => {
        await setup(g, page);
        await g.godMode();
        await trigger(g, 'bounty');
        await g.waitGameMs(100);
        await g.evaluate(() => { window.__game.scene.getScene('Game').run.kills += 100; });
        await g.waitGameMs(200);
        const l = await log(g);
        assert.deepEqual(l.map((r) => [r.kind, r.success]), [['bounty', true]]);
      },
    },
    {
      name: 'events: an elite spawns big and tough, and pays out when killed',
      fn: async ({ g, page }) => {
        await setup(g, page);
        await g.godMode();
        await trigger(g, 'elite');
        await g.waitGameMs(1600);
        const elite = await g.evaluate(() => {
          const s = window.__game.scene.getScene('Game');
          const e = s.enemyList().find((x) => x.elite && !x.dead);
          return e ? { hp: e.maxHp, base: e.def.hp * s.cfg.hpMult, scale: e.scaleX } : null;
        });
        assert.ok(elite, 'an elite spawned');
        assert.ok(elite.hp >= elite.base * 5, `elite HP ${elite.hp} vs base ${elite.base}`);
        assert.ok(elite.scale > 1.4);
        await g.evaluate(() => {
          const s = window.__game.scene.getScene('Game');
          const e = s.enemyList().find((x) => x.elite && !x.dead);
          s.damageEnemy(e, 1e6, e.x, e.y, 0);
        });
        await g.waitGameMs(100);
        assert.deepEqual((await log(g)).map((r) => [r.kind, r.success]), [['elite', true]]);
      },
    },
    {
      name: 'events: every hazard runs to the end and reports; sauce rain hits a sausage that stands still',
      timeoutMs: 60000,
      fn: async ({ g, page }) => {
        for (const kind of ['rain', 'flare', 'stampede']) {
          await setup(g, page);
          // No enemies, so only the hazard can do damage.
          await g.evaluate(() => { const s = window.__game.scene.getScene('Game'); s.director.nextSpawnMs = 1e12; });
          await trigger(g, kind);
          await g.waitGameMs(kind === 'rain' ? 9000 : kind === 'flare' ? 6500 : 5500);
          const l = await log(g);
          assert.equal(l.length, 1, `${kind} finished: ${JSON.stringify(l)}`);
          assert.equal(l[0].kind, kind);
          if (kind === 'rain') {
            // Every other drop aims at you: standing still gets you hit.
            assert.equal(l[0].success, false);
            const hp = await g.evaluate(() => window.__game.scene.getScene('Game').health.hp);
            assert.ok(hp < 100, `hp ${hp}`);
          }
        }
      },
    },
    {
      name: 'events: a hazard dodged entirely counts as a success',
      fn: async ({ g, page }) => {
        await setup(g, page);
        await g.godMode();
        await g.evaluate(() => { window.__game.scene.getScene('Game').director.nextSpawnMs = 1e12; });
        // Invulnerable the whole time (as if always dashing): never hit.
        await g.evaluate(() => { const s = window.__game.scene.getScene('Game'); s.head.markHit(60000); });
        await trigger(g, 'rain');
        await g.waitGameMs(9000);
        assert.deepEqual((await log(g)).map((r) => [r.kind, r.success]), [['rain', true]]);
      },
    },
    {
      name: 'events: ending the wave mid-event cleans everything up without a report',
      fn: async ({ g, page }) => {
        await setup(g, page);
        await g.godMode();
        for (const k of ['basket', 'golden', 'happy', 'bounty', 'stampede', 'flare', 'rain']) await trigger(g, k);
        await g.waitGameMs(500);
        await g.fastForwardWave();
        await g.waitForScene('Shop', 5000);
        assert.deepEqual((await log(g)).map((r) => [r.kind, r.success]), []);
      },
    },
  ],
};
