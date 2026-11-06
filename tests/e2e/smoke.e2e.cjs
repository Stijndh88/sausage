/** Smoke tests: the main flow works end to end without page errors. */
const { assert } = require('./harness.cjs');

module.exports = {
  tests: [
    {
      name: 'menu → game via Enter, wave 1 runs and weapons kill enemies',
      fn: async ({ page, g }) => {
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
      name: 'killing the boss leads to Victory',
      fn: async ({ g }) => {
        await g.startRun({ wave: 10 });
        await g.godMode();
        await g.evaluate(() => new Promise((resolve) => {
          const s = window.__game.scene.getScene('Game');
          const t = setInterval(() => { if (s.boss) { clearInterval(t); resolve(); } }, 50);
        }));
        await g.evaluate(() => { const s = window.__game.scene.getScene('Game'); s.damageEnemy(s.boss, 1e9, 0, 0, 0); });
        await g.waitForScene('Victory', 6000);
      },
    },
  ],
};
