/**
 * The six newer sausages: each one's special rule works in a real run, and the select screen
 * scrolls to show all of them.
 */
const { assert } = require('./harness.cjs');

const SAVE_KEY = 'wurst-case-scenario/save';

async function frames(g, n = 3) {
  await g.evaluate((count) => new Promise((resolve) => {
    let left = count;
    const tick = () => (--left <= 0 ? resolve() : requestAnimationFrame(tick));
    requestAnimationFrame(tick);
  }), n);
}

/** Puts one enemy bullet right on a point and lets a frame run. */
async function shootAt(g, where) {
  await g.evaluate((w) => {
    const s = window.__game.scene.getScene('Game');
    const p = w === 'head' ? s.head : s.chain.positions[w];
    const b = s.enemyBullets.get(p.x, p.y, 'eb-ketchup');
    b.fire(p.x, p.y, 0, 1, 10, 'eb-ketchup', s.gameTime);
  }, where);
  await frames(g, 2);
}

module.exports = {
  tests: [
    {
      name: 'corn dog: the batter shell blocks the first hit of the wave, not the second',
      fn: async ({ g }) => {
        await g.startRun({ seed: 3, sausage: 'corndog' });
        const hp0 = await g.evaluate(() => window.__game.scene.getScene('Game').health.hp);
        await g.evaluate(() => window.__game.scene.getScene('Game').takeDamage(20, 'Fork'));
        let r = await g.evaluate(() => { const s = window.__game.scene.getScene('Game'); return { hp: s.health.hp, shell: s.shellHits, ring: !!s.shellRing }; });
        assert.deepEqual(r, { hp: hp0, shell: 0, ring: false }, 'first hit is blocked and the shell is gone');
        await g.evaluate(() => { const s = window.__game.scene.getScene('Game'); s.head.invulnUntil = 0; s.takeDamage(20, 'Fork'); });
        r = await g.evaluate(() => window.__game.scene.getScene('Game').health.hp);
        assert.ok(r < hp0, 'second hit hurts');
        // The shell comes back next wave.
        await g.startRun({ seed: 3, sausage: 'corndog', wave: 2 });
        assert.equal(await g.evaluate(() => window.__game.scene.getScene('Game').shellHits), 1);
      },
    },
    {
      name: 'cocktail sausage: smaller head hitbox and links, 4-link limit',
      fn: async ({ g }) => {
        await g.startRun({ seed: 3 });
        const frank = await g.evaluate(() => { const s = window.__game.scene.getScene('Game'); return { r: s.head.body.halfWidth, link: s.chain.radius }; });
        await g.startRun({ seed: 3, sausage: 'cocktail' });
        const tiny = await g.evaluate(() => { const s = window.__game.scene.getScene('Game'); return { r: s.head.body.halfWidth, link: s.chain.radius, hp: s.health.maxHp }; });
        assert.ok(tiny.r < frank.r * 0.75, `hitbox ${tiny.r} vs ${frank.r}`);
        assert.ok(tiny.link < frank.link, 'links are smaller too');
        assert.equal(tiny.hp, 70);
      },
    },
    {
      name: 'black pudding: kills never drop condiment packets, and lifesteal heals',
      fn: async ({ g }) => {
        await g.startRun({ seed: 3, sausage: 'blackpudding' });
        const r = await g.evaluate(() => {
          const s = window.__game.scene.getScene('Game');
          const orig = Math.random;
          Math.random = () => 0; // every roll succeeds: condiment drop, lifesteal
          let packets = 0;
          const spawn = s.pickups.spawnCondiment.bind(s.pickups);
          s.pickups.spawnCondiment = (...a) => { packets++; spawn(...a); };
          s.health.hp = 50;
          for (let i = 0; i < 5; i++) {
            s.spawnEnemy('fork', 200 + i * 40, 200);
            const e = s.enemyList().at(-1);
            s.damageEnemy(e, 9999, e.x, e.y, 0);
          }
          Math.random = orig;
          return { packets, hp: s.health.hp };
        });
        assert.equal(r.packets, 0);
        assert.ok(r.hp > 50, `healed from lifesteal, hp ${r.hp}`);
      },
    },
    {
      name: 'merguez: any hit sets the enemy burning, and it takes 20% more damage',
      fn: async ({ g }) => {
        await g.startRun({ seed: 3, sausage: 'merguez' });
        const r = await g.evaluate(() => {
          const s = window.__game.scene.getScene('Game');
          s.spawnEnemy('spatula', 300, 300);
          const e = s.enemyList().at(-1);
          s.damageEnemy(e, 1, e.x, e.y, 0);
          const hp = s.health.maxHp;
          s.takeDamage(10, 'Fork');
          return { stacks: e.poisonStacks, lost: hp - s.health.hp };
        });
        assert.equal(r.stacks, 1);
        assert.equal(r.lost, 12);
      },
    },
    {
      name: 'weisswurst: bonus damage while fresh, a penalty once stale',
      fn: async ({ g }) => {
        await g.startRun({ seed: 3, sausage: 'weisswurst' });
        const fresh = await g.evaluate(() => window.__game.scene.getScene('Game').damageMultNow());
        await g.evaluate(() => { window.__game.scene.getScene('Game').director.elapsedMs = 20500; });
        await frames(g, 2);
        const r = await g.evaluate(() => { const s = window.__game.scene.getScene('Game'); return { mult: s.damageMultNow(), stale: s.stale }; });
        assert.ok(Math.abs(fresh - 1.4) < 1e-9, `fresh ${fresh}`);
        assert.ok(Math.abs(r.mult - 0.8) < 1e-9, `stale ${r.mult}`);
        assert.equal(r.stale, true);
      },
    },
    {
      name: 'kielbasa: a shot on a link hurts; on another sausage it passes through',
      fn: async ({ g }) => {
        await g.startRun({ seed: 3, sausage: 'kielbasa', weapons: [{ id: 'toothpick', tier: 1 }, { id: 'pepper', tier: 1 }, { id: 'skewer', tier: 1 }] });
        await g.evaluate(() => { const s = window.__game.scene.getScene('Game'); s.director.stop(); });
        await frames(g, 5);
        const hp0 = await g.evaluate(() => window.__game.scene.getScene('Game').health.hp);
        await shootAt(g, 2);
        const hp1 = await g.evaluate(() => window.__game.scene.getScene('Game').health.hp);
        assert.ok(hp1 < hp0, `kielbasa link hit: ${hp0} -> ${hp1}`);

        await g.startRun({ seed: 3, weapons: [{ id: 'toothpick', tier: 1 }, { id: 'pepper', tier: 1 }, { id: 'skewer', tier: 1 }] });
        await g.evaluate(() => { const s = window.__game.scene.getScene('Game'); s.director.stop(); });
        await frames(g, 5);
        const f0 = await g.evaluate(() => window.__game.scene.getScene('Game').health.hp);
        await shootAt(g, 2);
        const f1 = await g.evaluate(() => window.__game.scene.getScene('Game').health.hp);
        assert.equal(f1, f0, 'frank links are safe');
      },
    },
    {
      name: 'select screen: scrolls through all 11 sausages; unlocked new ones start with their own rule',
      fn: async ({ page, g }) => {
        await page.evaluate(([k, v]) => localStorage.setItem(k, JSON.stringify(v)), [SAVE_KEY, {
          version: 1, bestWave: 10, wins: 2, runs: 2, bestWaveBy: {}, winsBy: { cocktail: 1, frank: 1 }, lastSausage: 'frank', tutorialDone: true,
        }]);
        await page.goto(page.url().split('?')[0]);
        await g.waitForScene('Menu', 15000);
        await page.keyboard.press('Enter');
        await g.waitForScene('Select');
        await g.wait(350);
        const names = () => g.evaluate(() => window.__game.scene.getScene('Select').children.list
          .filter((o) => o.type === 'Text').map((o) => o.text));
        assert.ok((await names()).some((t) => t.includes('Classic Frank')));
        for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowRight');
        await frames(g, 2);
        const t = await names();
        assert.ok(t.some((x) => x.includes('Kielbasa')), 'scrolled to the last card');
        assert.ok(!t.some((x) => x.includes('Classic Frank')), 'the first card scrolled away');
        await page.keyboard.press('Enter');
        await g.waitForScene('Game');
        const r = await g.evaluate(() => { const s = window.__game.scene.getScene('Game'); return { sausage: s.run.sausage, links: s.run.weapons.length, hit: s.rules.linksHittable }; });
        assert.deepEqual(r, { sausage: 'kielbasa', links: 2, hit: true });
      },
    },
  ],
};
