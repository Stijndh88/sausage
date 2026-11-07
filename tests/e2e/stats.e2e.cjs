/** Run stats: damage per link is logged, the end-of-run stats screen opens, play data is kept. */
const { assert } = require('./harness.cjs');

const SHOTS = process.env.E2E_SHOTS;

module.exports = {
  tests: [
    {
      name: 'stats: links get credited for damage and kills, and the wave is logged',
      fn: async ({ g }) => {
        await g.startRun({ seed: 3, weapons: [{ id: 'toothpick', tier: 2 }, { id: 'mustard', tier: 2 }, { id: 'pickle', tier: 2 }] });
        await g.godMode();
        await g.installBot();
        await g.waitGameMs(10000);
        // Poison on an enemy is credited to the link that put it there.
        await g.evaluate(() => {
          const s = window.__game.scene.getScene('Game');
          for (const e of s.enemyList()) if (!e.dead && !e.isBoss) e.poison(40, 2500, s.gameTime, 'L1');
        });
        await g.waitGameMs(1500);
        await g.fastForwardWave();
        await g.waitForScene('Shop', 6000);
        const log = await g.evaluate(() => window.__game.scene.getScene('Shop').run.log);
        assert.equal(log.links.length, 3);
        assert.deepEqual(log.links.map((l) => l.weapon), ['toothpick', 'mustard', 'pickle']);
        const dealt = log.links.reduce((s, l) => s + l.damage, 0);
        assert.ok(dealt > 0, 'links dealt damage');
        assert.ok(log.links.some((l) => l.kills > 0), 'a link got kills');
        assert.ok(log.links[1].dot > 0, 'poison is credited to its link: ' + JSON.stringify(log.links));
        for (const l of log.links) assert.ok(l.activeSec > 10, `link fought for ${l.activeSec}s`);
        assert.equal(log.waves.length, 1);
        const w = log.waves[0];
        assert.equal(w.outcome, 'cleared');
        assert.ok(w.kills > 0 && w.dealt > 0 && w.fps > 0, JSON.stringify(w));
        // Damage logged never exceeds what enemies had (overkill is not counted).
        const kills = await g.evaluate(() => window.__game.scene.getScene('Shop').run.kills);
        assert.equal(log.links.reduce((s, l) => s + l.kills, 0) + Object.values(log.other).reduce((s, o) => s + o.kills, 0), kills);
      },
    },
    {
      name: 'stats: dying records the run and the hit; S opens the stats screen, Esc closes it, then Esc leaves',
      fn: async ({ page, g }) => {
        await g.evaluate(() => window.__debug.clearTelemetry());
        await g.startRun({ seed: 4, weapons: [{ id: 'toothpick', tier: 1 }, { id: 'skewer', tier: 1 }] });
        await g.installBot();
        await g.waitGameMs(6000);
        await g.evaluate(() => window.__game.scene.getScene('Game').takeDamage(500, 'Test Fork'));
        await g.waitForScene('GameOver', 6000);
        await g.wait(700);
        const data = await g.evaluate(() => window.__telemetry);
        assert.equal(data.runs.length, 1);
        const rec = data.runs[0];
        assert.equal(rec.outcome, 'death');
        assert.equal(rec.causeOfDeath, 'Test Fork');
        assert.ok(rec.taken['Test Fork'] > 0, JSON.stringify(rec.taken));
        assert.equal(rec.links.length, 2);
        assert.equal(rec.waves.at(-1).outcome, 'died');
        assert.equal(data.active, undefined, 'the run is no longer marked as in progress');

        await page.keyboard.press('KeyS');
        await g.wait(200);
        assert.equal(await g.evaluate(() => window.__runStats.open), true);
        const texts = await g.evaluate(() => window.__game.scene.getScene('GameOver').children.list
          .filter((o) => o.type === 'Text' && o.visible).map((o) => o.text));
        for (const t of ['RUN STATS', 'DAMAGE BY LINK', 'WHAT HURT YOU', 'Test Fork', 'Crumbs collected']) {
          assert.ok(texts.some((x) => x.includes(t)), `missing "${t}"`);
        }
        assert.ok(texts.some((x) => /^1\. (Toothpick|Skewer)/.test(x) || /^2\. (Toothpick|Skewer)/.test(x)), 'links are listed');
        if (SHOTS) await page.screenshot({ path: `${SHOTS}/run-stats.png` });
        await page.keyboard.press('Escape');
        await g.wait(200);
        assert.equal(await g.evaluate(() => window.__runStats.open), false);
        assert.ok((await g.activeScenes()).includes('GameOver'), 'Esc only closed the stats');
        await page.keyboard.press('Escape');
        await g.waitForScene('Menu', 4000);
      },
    },
    {
      name: 'stats: the Run stats button opens it with the mouse too, and Enter closes it without starting a run',
      fn: async ({ page, g }) => {
        await g.startRun({ seed: 5 });
        await g.evaluate(() => window.__game.scene.getScene('Game').takeDamage(500, 'Test Knife'));
        await g.waitForScene('GameOver', 6000);
        await g.wait(700);
        await page.mouse.click(515, 650);
        await g.wait(200);
        assert.equal(await g.evaluate(() => window.__runStats.open), true);
        await page.keyboard.press('Enter');
        await g.wait(300);
        assert.equal(await g.evaluate(() => window.__runStats.open), false);
        assert.ok((await g.activeScenes()).includes('GameOver'));
      },
    },
    {
      name: 'play data: quitting from the pause menu is recorded, errors are captured, an unfinished run counts as a crash',
      fn: async ({ page, g }) => {
        await g.evaluate(() => window.__debug.clearTelemetry());
        await g.startRun({ seed: 6 });
        await g.waitGameMs(1500);
        // A run in progress is noted at wave start.
        const active = await g.evaluate(() => window.__telemetry.active);
        assert.ok(active && active.record.seed === 6, 'run marked active');
        await g.evaluate(() => window.__game.scene.getScene('Game').pauseMenu.actions.quit());
        await g.waitForScene('Menu', 4000);
        let data = await g.evaluate(() => window.__telemetry);
        assert.equal(data.runs.at(-1).outcome, 'quit');

        await g.evaluate(() => window.dispatchEvent(new ErrorEvent('error', { message: 'test boom', error: new Error('test boom') })));
        data = await g.evaluate(() => window.__telemetry);
        assert.ok(data.errors.some((e) => e.message === 'test boom' && e.scene.includes('Menu')), JSON.stringify(data.errors));

        // A run left mid-wave without the page closing cleanly shows up as a crash on the next visit.
        await g.startRun({ seed: 7 });
        await g.waitGameMs(500);
        await page.reload();
        await page.waitForFunction(() => window.__game && window.__game.scene.isActive('Menu'), null, { timeout: 15000 });
        data = await g.evaluate(() => window.__telemetry);
        const last = data.runs.at(-1);
        assert.equal(last.seed, 7);
        assert.ok(last.outcome === 'abandoned' || last.outcome === 'crashed', last.outcome);
        assert.ok(data.sessions >= 1);
      },
    },
  ],
};
