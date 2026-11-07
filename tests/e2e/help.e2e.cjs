/**
 * Tooltips (pause menu, shop) and the How to Play screen (main menu, pause menu).
 * Set E2E_SHOTS=<dir> to also save screenshots of each screen.
 */
const path = require('node:path');
const { assert } = require('./harness.cjs');

const SAVE_KEY = 'wurst-case-scenario/save';

async function frames(g, n = 3) {
  await g.evaluate((count) => new Promise((resolve) => {
    let left = count;
    const tick = () => (--left <= 0 ? resolve() : requestAnimationFrame(tick));
    requestAnimationFrame(tick);
  }), n);
}

async function shot(page, name) {
  if (process.env.E2E_SHOTS) await page.screenshot({ path: path.join(process.env.E2E_SHOTS, `${name}.png`) });
}

const tooltip = (g, key, field) => g.evaluate(([k, f]) => {
  const s = window.__game.scene.getScene(k);
  const t = f === 'pause' ? s.pauseMenu.tooltip : s.tooltip;
  return t.current;
}, [key, field]);

module.exports = {
  tests: [
    {
      name: 'pick your sausage: cards show names without numbers',
      fn: async ({ page, g }) => {
        await page.keyboard.press('Enter');
        await g.waitForScene('Select');
        await frames(g, 3);
        const texts = await g.evaluate(() => window.__game.scene.getScene('Select').children.list.filter((o) => o.type === 'Text').map((o) => o.text));
        assert.ok(texts.includes('Classic Frank'), 'Frank is named');
        assert.ok(!texts.some((t) => /^\d\s+(Classic|Bratwurst|Chorizo|Hot Dog)/.test(t)), `no numbered names: ${texts.join(' | ')}`);
        await shot(page, 'select');
      },
    },
    {
      name: 'pause menu: arrow keys and hover show link and item tooltips',
      fn: async ({ page, g }) => {
        await g.startRun({ seed: 5, wave: 3, weapons: [{ id: 'toothpick', tier: 2 }, { id: 'mustard', tier: 1 }], items: ['paprika', 'paprika', 'pickle_juice'] });
        await g.godMode();
        await page.keyboard.press('Escape');
        await frames(g, 3);
        assert.equal(await tooltip(g, 'Game', 'pause'), null);
        await page.keyboard.press('ArrowRight');
        await frames(g, 2);
        let t = await tooltip(g, 'Game', 'pause');
        assert.equal(t.title, 'Toothpick II');
        await page.keyboard.press('ArrowRight');
        await page.keyboard.press('ArrowRight');
        await frames(g, 2);
        t = await tooltip(g, 'Game', 'pause');
        assert.equal(t.title, 'Paprika');
        assert.ok(t.lines.includes('You have 2'), JSON.stringify(t.lines));
        await shot(page, 'pause-tooltip');
        // Mouse hover on the second link.
        await page.mouse.move(470 + 46 + 92, 160 + 200 + 50);
        await frames(g, 3);
        t = await tooltip(g, 'Game', 'pause');
        assert.equal(t && t.title, 'Mustard Squirt I');
        // Up/Down still drive the buttons; resuming hides the tooltip.
        await page.keyboard.press('Escape');
        await frames(g, 3);
        assert.equal(await tooltip(g, 'Game', 'pause'), null);
      },
    },
    {
      name: 'pause menu: How to play opens, Esc closes it and then resumes',
      fn: async ({ page, g }) => {
        await g.startRun({ seed: 5, wave: 2 });
        await g.godMode();
        await page.keyboard.press('Escape');
        await frames(g, 3);
        for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter');
        await frames(g, 3);
        const st = await g.evaluate(() => {
          const s = window.__game.scene.getScene('Game');
          return { open: s.helpPanel.isOpen, selected: s.helpPanel.selected && s.helpPanel.selected.id };
        });
        assert.deepEqual(st, { open: true, selected: 'mech:head' });
        // ↓ moves the topic, not the pause menu behind it.
        await page.keyboard.press('ArrowDown');
        await frames(g, 2);
        assert.equal(await g.evaluate(() => window.__game.scene.getScene('Game').helpPanel.selected.id), 'mech:links');
        assert.equal(await g.evaluate(() => window.__game.scene.getScene('Game').pauseMenu.list.focusedIndex), 4);
        await shot(page, 'help-pause');
        await page.keyboard.press('Escape');
        await frames(g, 3);
        let s = await g.evaluate(() => { const x = window.__game.scene.getScene('Game'); return { paused: x.paused, help: x.helpPanel.isOpen }; });
        assert.deepEqual(s, { paused: true, help: false });
        await page.keyboard.press('Escape');
        await frames(g, 3);
        s = await g.evaluate(() => window.__game.scene.getScene('Game').paused);
        assert.equal(s, false);
      },
    },
    {
      name: 'How to play from the main menu: only what you have met, no spoilers',
      fn: async ({ page, g }) => {
        await page.evaluate((k) => {
          const s = JSON.parse(localStorage.getItem(k) || 'null') || window.__debug.loadSave();
          localStorage.setItem(k, JSON.stringify({ ...s, tutorialDone: true, seen: ['weapon:toothpick', 'event:bounty', 'item:golden_sausage'] }));
        }, SAVE_KEY);
        await page.goto(page.url().split('?')[0]);
        await g.waitForScene('Menu', 15000);
        await page.keyboard.press('h');
        await frames(g, 3);
        assert.equal(await g.evaluate(() => window.__game.scene.getScene('Menu').helpPanel.isOpen), true);
        // Enter must not start a run behind the overlay.
        await page.keyboard.press('Enter');
        await frames(g, 3);
        assert.equal(await g.evaluate(() => window.__game.scene.isActive('Menu')), true);
        await page.keyboard.press('ArrowRight');
        await page.keyboard.press('ArrowRight'); // Events
        await frames(g, 2);
        let ids = await g.evaluate(() => window.__game.scene.getScene('Menu').helpPanel.entries.map((e) => e.id));
        assert.deepEqual(ids, ['event:about', 'event:bounty']);
        await page.keyboard.press('ArrowDown');
        await frames(g, 2);
        await shot(page, 'help-events');
        await page.keyboard.press('ArrowRight');
        await page.keyboard.press('ArrowRight');
        await page.keyboard.press('ArrowRight'); // Items
        await frames(g, 2);
        ids = await g.evaluate(() => window.__game.scene.getScene('Menu').helpPanel.entries.map((e) => e.id));
        assert.deepEqual(ids, ['item:golden_sausage']);
        await shot(page, 'help-items');
        await page.keyboard.press('Escape');
        await frames(g, 2);
        assert.equal(await g.evaluate(() => window.__game.scene.getScene('Menu').helpPanel.isOpen), false);
      },
    },
    {
      name: 'shop: ↓ then ◄► browses your links and items; buying marks them seen',
      fn: async ({ page, g }) => {
        await g.openShop({ run: { wave: 3, crumbs: 500, weapons: [{ id: 'toothpick', tier: 1 }, { id: 'pepper', tier: 3 }], items: ['casing', 'big_bun', 'big_bun'] } });
        await g.wait(400);
        await page.keyboard.press('ArrowDown');
        await frames(g, 2);
        let t = await tooltip(g, 'Shop');
        assert.equal(t.title, 'Toothpick I');
        await page.keyboard.press('ArrowLeft');
        await frames(g, 2);
        t = await tooltip(g, 'Shop');
        assert.equal(t.title, 'Big Bun');
        assert.ok(t.lines.includes('You have 2 of max 6'), JSON.stringify(t.lines));
        await shot(page, 'shop-tooltip');
        await page.keyboard.press('ArrowUp');
        await frames(g, 2);
        assert.equal(await tooltip(g, 'Shop'), null);
        // Hovering the second link (x = 60 + 104).
        await page.mouse.move(164, 610);
        await frames(g, 3);
        t = await tooltip(g, 'Shop');
        assert.equal(t && t.title, 'Pepper Mill III');
        const offer = await g.evaluate(() => window.__game.scene.getScene('Shop').offers[0]);
        await page.keyboard.press('1');
        await frames(g, 2);
        const seen = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)).seen, SAVE_KEY);
        assert.ok(seen.includes(`${offer.type}:${offer.id}`), `bought ${offer.type}:${offer.id} is seen: ${seen}`);
      },
    },
  ],
};
