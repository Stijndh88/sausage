/**
 * Balance / game-logic e2e tests. Most tests drive the game with VIRTUAL time (the RAF loop is put to
 * sleep and frames are stepped with `game.headlessStep(t, 16.67)`), so they are fast and independent of
 * the headless frame rate. That helper is local to this file.
 */
const { assert } = require('./harness.cjs');

/** Put the RAF loop to sleep and install `window.__balStep(frames, deltaMs)` that steps the game. */
function installStepper(g) {
  return g.evaluate(() => {
    const game = window.__game;
    game.loop.sleep();
    let t = game.loop.time || performance.now();
    window.__balNow = () => t;
    window.__balStep = (frames, delta = 1000 / 60, each) => {
      for (let i = 0; i < frames; i++) {
        t += delta;
        game.headlessStep(t, delta);
        if (each) each();
      }
      return t;
    };
  });
}


module.exports = {
  tests: [
    {
      name: 'half the crumbs left on the floor are banked when the wave timer ends',
      fn: async ({ g }) => {
        await g.startRun({ seed: 3, crumbs: 0 });
        await g.godMode();
        await installStepper(g);
        const r = await g.evaluate(() => {
          const s = window.__game.scene.getScene('Game');
          s.pickups.spawnCrumbs(60, 120, 10); // far from the sausage
          window.__balStep(5);
          const before = s.run.crumbs;
          s.director.elapsedMs = 1e9;
          window.__balStep(130);
          return { before, after: s.run.crumbs, scene: window.__game.scene.isActive('Shop') ? 'Shop' : 'Game' };
        });
        // Half of what's left on the floor is swept up (FLOOR_CRUMB_BANK = 0.5).
        assert.equal(r.after - r.before, 5, `expected half of the 10 floor crumbs to be banked, got ${r.before} -> ${r.after}`);
        assert.equal(r.scene, 'Shop');
      },
    },
    {
      name: 'you start every wave at full HP',
      fn: async ({ g }) => {
        await g.startRun({ seed: 4 });
        await installStepper(g);
        const r = await g.evaluate(() => {
          const s = window.__game.scene.getScene('Game');
          s.director.stop();
          s.takeDamage(60, 'test');
          const hurt = s.health.hp;
          s.director.elapsedMs = 1e9;
          window.__balStep(130);
          const sh = window.__game.scene.getScene('Shop');
          const inShop = window.__game.scene.isActive('Shop');
          sh.next();
          window.__balStep(5);
          const g2 = window.__game.scene.getScene('Game');
          return { hurt, inShop, wave: g2.run.wave, hp: g2.health.hp, max: g2.health.maxHp };
        });
        assert.ok(r.hurt < r.max, 'should have taken damage');
        assert.ok(r.inShop, 'shop should open');
        assert.equal(r.wave, 2);
        assert.equal(r.hp, r.max);
      },
    },
    {
      name: 'boss time-to-kill is sane: a mid build kills it, a maxed build does not one-shot it',
      timeoutMs: 120000,
      fn: async ({ g }) => {
        const ttk = async (weapons, items) => {
          await g.startRun({ seed: 7, wave: 10, weapons, items });
          await installStepper(g);
          return g.evaluate(() => {
            const s = window.__game.scene.getScene('Game');
            s.invincible = true;
            let frames = 0;
            while (frames < 60 * 300) {
              window.__balStep(60);
              frames += 60;
              if (s.boss && s.boss.dead) break;
            }
            return { sec: frames / 60, dead: !!(s.boss && s.boss.dead), hp: s.boss ? s.boss.hp : null };
          });
        };
        const mid = await ttk(
          [{ id: 'toothpick', tier: 3 }, { id: 'pickle', tier: 2 }, { id: 'skewer', tier: 2 }, { id: 'pepper', tier: 2 }],
          ['paprika', 'paprika', 'espresso_mustard', 'espresso_mustard'],
        );
        assert.ok(mid.dead, `mid build should beat the boss within 300 s (boss hp left ${mid.hp})`);
        const maxed = await ttk(['toothpick', 'pickle', 'skewer', 'pepper', 'toothpick', 'pickle'].map((id) => ({ id, tier: 4 })), []);
        assert.ok(maxed.sec >= 5, `maxed build killed the boss in ${maxed.sec}s`);
      },
    },
    {
      name: 'onion ring: thrown out, hits on the way out and on the way back, then is caught by its link',
      timeoutMs: 120000,
      fn: async ({ g }) => {
        await g.startRun({ seed: 5, wave: 2, weapons: [{ id: 'onion', tier: 1 }] });
        await g.godMode();
        await g.installBot();
        await g.evaluate(() => {
          const s = window.__game.scene.getScene('Game');
          const log = (window.__boom = { out: 0, back: 0, both: 0, caught: 0, expired: 0 });
          const legs = new Map();
          let ids = 0;
          const orig = s.onBulletHit.bind(s);
          s.onBulletHit = (a, b) => {
            const ring = [a, b].find((o) => o.texture && o.texture.key === 'onion-ring');
            if (ring && ring.active) {
              const enemy = ring === a ? b : a;
              enemy.__id = enemy.__id || ++ids;
              if (!ring.hitSet.has(enemy)) {
                const key = `${ring.firedAt}:${enemy.__id}`;
                const seen = legs.get(key) || new Set();
                seen.add(ring.returning ? 'back' : 'out');
                legs.set(key, seen);
                if (ring.returning) log.back++; else log.out++;
                if (seen.size === 2) log.both++;
              }
            }
            orig(a, b);
          };
          const proto = Object.getPrototypeOf(s.playerBullets.getFirstAlive() || s.playerBullets.get(-999, -999));
          const kill = proto.kill;
          proto.kill = function () {
            if (this.active && this.texture.key === 'onion-ring') {
              if (this.returning && s.gameTime < this.dieAt - 50) log.caught++;
              else log.expired++;
            }
            return kill.call(this);
          };
          window.__unboom = () => { proto.kill = kill; };
        });
        await g.waitGameMs(15000, 110000);
        const r = await g.evaluate(() => { window.__unboom(); return window.__boom; });
        assert.ok(r.out > 0 && r.back > 0, `hits out ${r.out}, back ${r.back}`);
        assert.ok(r.both > 0, `no enemy was hit by the same throw on both legs: ${JSON.stringify(r)}`);
        assert.ok(r.caught > 0 && r.caught >= r.expired * 3, `rings should come home, not time out: ${JSON.stringify(r)}`);
      },
    },
    {
      name: 'boss minions respect the spawn rules (telegraph / 240 px from the sausage)',
      fn: async ({ g }) => {
        await g.startRun({ seed: 9, wave: 10 });
        await g.godMode();
        await installStepper(g);
        const r = await g.evaluate(() => {
          const s = window.__game.scene.getScene('Game');
          const spawns = [];
          const orig = s.spawnEnemy.bind(s);
          s.spawnEnemy = (kind, x, y) => { spawns.push({ kind, d: Math.hypot(x - s.head.x, y - s.head.y) }); return orig(kind, x, y); };
          window.__balStep(100);
          const park = () => { if (s.boss) s.head.body.reset(s.boss.x, s.boss.y + 90); };
          window.__balStep(60 * 7, 1000 / 60, park);
          return { boss: !!s.boss, minDist: Math.min(...spawns.filter((p) => p.kind !== 'tongs').map((p) => p.d)) };
        });
        assert.ok(r.boss, 'boss should have spawned');
        assert.ok(r.minDist >= 240, `a minion spawned ${r.minDist.toFixed(0)} px from the sausage`);
      },
    },
  ],
};
