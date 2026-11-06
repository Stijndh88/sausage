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

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

module.exports = {
  tests: [
    {
      name: 'crumbs left on the floor are banked when the wave timer ends',
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
        assert.ok(r.after - r.before >= 10, `expected the 10 floor crumbs to be banked, got ${r.before} -> ${r.after}`);
        assert.equal(r.scene, 'Shop');
      },
    },
    {
      name: 'heat is halved between waves (never carried into Well-done)',
      fn: async ({ g }) => {
        await g.startRun({ seed: 4, heat: 92 });
        await installStepper(g);
        const r = await g.evaluate(() => {
          const s = window.__game.scene.getScene('Game');
          s.doneness.heatTakenMult = 0;
          s.doneness.coolPerSec = 0;
          s.director.elapsedMs = 1e9;
          window.__balStep(130);
          const sh = window.__game.scene.getScene('Shop');
          return { active: window.__game.scene.isActive('Shop'), heat: sh.run.heat };
        });
        assert.ok(r.active, 'shop should open');
        assert.ok(r.heat > 40 && r.heat < 60, `carried heat ${r.heat}`);
      },
    },
    {
      name: 'boss time-to-kill is sane: a mid build kills it, a maxed build does not one-shot it',
      timeoutMs: 120000,
      fn: async ({ g }) => {
        const ttk = async (weapons, items) => {
          await g.startRun({ seed: 7, wave: 10, heat: 40, weapons, items });
          await installStepper(g);
          return g.evaluate(() => {
            const s = window.__game.scene.getScene('Game');
            s.doneness.heatTakenMult = 0;
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
      name: 'onion rings keep moving smoothly when heat crosses into Well-done',
      knownBug: 'ring angle = now * speed * fireRateMult, so the +20% fire rate at 60 heat teleports the rings (WeaponSystem.updateRings)',
      fn: async ({ g }) => {
        await g.startRun({ seed: 5, heat: 50, weapons: [{ id: 'onion', tier: 1 }] });
        await g.godMode();
        await installStepper(g);
        const r = await g.evaluate(() => {
          const s = window.__game.scene.getScene('Game');
          const hold = (h) => () => { s.doneness.heat = h; };
          const ring = () => s.weapons.rings[0].sprites[0].rotation;
          // Wait for a moment where the jump would be large (> 1 rad), so the test doesn't pass by luck.
          for (let i = 0; i < 2000; i++) {
            const j = ((window.__balNow() + 1000 / 60) / 1000) * 3.2 * 0.2;
            if (Math.abs(Math.atan2(Math.sin(j), Math.cos(j))) > 1) break;
            window.__balStep(1, 1000 / 60, hold(50));
          }
          const a0 = ring();
          window.__balStep(1, 1000 / 60, hold(50));
          const a1 = ring();
          s.doneness.heat = 65;
          window.__balStep(1, 1000 / 60, hold(65));
          const a2 = ring();
          return { normal: a1 - a0, crossing: a2 - a1 };
        });
        const normal = Math.abs(wrap(r.normal));
        const crossing = Math.abs(wrap(r.crossing));
        assert.ok(crossing < Math.max(0.3, normal * 3), `ring moved ${crossing.toFixed(2)} rad in one frame (normal ${normal.toFixed(3)})`);
      },
    },
    {
      name: 'boss minions respect the spawn rules (telegraph / 240 px from the sausage)',
      knownBug: 'the boss summons forks at boss.x±60 instantly, without a telegraph and regardless of where the sausage is (Enemy.bossThink)',
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
