/** Smoke tests: the main flow works end to end without page errors. */
const { assert } = require('./harness.cjs');

module.exports = {
  tests: [
    {
      name: 'menu → sausage select → game via Enter, wave 1 runs and weapons kill enemies',
      fn: async ({ page, g }) => {
        await page.keyboard.press('Enter');
        await g.waitForScene('Select');
        await g.wait(400);
        await page.keyboard.press('Enter');
        await g.waitForScene('Game');
        await g.godMode();
        await g.installBot();
        await g.wait(8000);
        const s = await g.gameState();
        assert.equal(s.wave, 1);
        assert.ok(s.kills > 0, `expected kills, got ${s.kills}`);
      },
    },
    {
      name: 'wave clear → shop → next wave',
      fn: async ({ page, g }) => {
        await g.startRun({ seed: 1 });
        await g.fastForwardWave();
        await g.waitForScene('Shop', 5000);
        await page.keyboard.press('Enter');
        await g.waitForScene('Game');
        const s = await g.gameState();
        assert.equal(s.wave, 2);
      },
    },
    {
      name: 'dying sends you to Game Over, Enter starts a new run',
      fn: async ({ page, g }) => {
        await g.startRun();
        await g.evaluate(() => window.__game.scene.getScene('Game').takeDamage(500, 'test'));
        await g.waitForScene('GameOver', 6000);
        await page.keyboard.press('Enter');
        await g.waitForScene('Game');
        const s = await g.gameState();
        assert.equal(s.wave, 1);
        assert.equal(s.hp, s.maxHp);
      },
    },
    {
      name: 'killing the boss leads to the choice, and taking it home to Victory',
      fn: async ({ g }) => {
        await g.startRun({ wave: 7 });
        await g.godMode();
        await g.evaluate(() => new Promise((resolve) => {
          const s = window.__game.scene.getScene('Game');
          const t = setInterval(() => { if (s.boss) { clearInterval(t); resolve(); } }, 50);
        }));
        await g.evaluate(() => { const s = window.__game.scene.getScene('Game'); s.damageEnemy(s.boss, 1e9, 0, 0, 0); });
        await g.takeHome();
      },
    },
    {
      name: 'seconds: after the boss, push on → pick an item → pick a menu → shop → the Kitchen (wave 8)',
      fn: async ({ page, g }) => {
        await g.startRun({ seed: 3, wave: 7 });
        await g.godMode();
        await g.evaluate(() => new Promise((resolve) => {
          const s = window.__game.scene.getScene('Game');
          const t = setInterval(() => { if (s.boss) { clearInterval(t); resolve(); } }, 50);
        }));
        await g.evaluate(() => { const s = window.__game.scene.getScene('Game'); s.damageEnemy(s.boss, 1e9, 0, 0, 0); });
        await g.waitForScene('Choice', 10000);
        await g.wait(700);
        await page.keyboard.press('2'); // Seconds?
        await g.wait(500);
        await page.keyboard.press('1'); // first free item
        await g.wait(500);
        await page.keyboard.press('2'); // Light Lunch
        await g.waitForScene('Shop', 5000);
        const run = await g.evaluate(() => { const r = window.__game.scene.getScene('Shop').run; return { pushes: r.pushes, items: r.items.length, menu: r.menu }; });
        assert.deepEqual(run, { pushes: 1, items: 1, menu: 'light_lunch' });
        await page.keyboard.press('Enter');
        await g.waitForScene('Game');
        const s = await g.gameState();
        assert.equal(s.wave, 8);
      },
    },
    {
      name: 'every sausage type can start a run and fight',
      fn: async ({ g }) => {
        for (const sausage of ['frank', 'bratwurst', 'chorizo', 'hotdog', 'veggie']) {
          await g.evaluate((id) => {
            const game = window.__game;
            for (const s of game.scene.getScenes(true)) game.scene.stop(s.scene.key);
            game.scene.start('Game', { run: window.__debug.newRun(5, id) });
          }, sausage);
          await g.waitForScene('Game');
          await g.godMode();
          await g.waitGameMs(4000);
          const s = await g.gameState();
          assert.equal(s.wave, 1, sausage);
          assert.ok(s.maxHp > 0, sausage);
        }
      },
    },
  ],
};
