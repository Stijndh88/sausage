/**
 * Tests for the features added with HP, sausage types and "the basics":
 * settings, pause menu, sausage select + unlocks, first-run tips, touch, gamepad, audio, shop clarity.
 */
const { assert } = require('./harness.cjs');

const SAVE_KEY = 'wurst-case-scenario/save';
const SETTINGS_KEY = 'wurst-case-scenario/settings';

const scene = (g, key) => g.evaluate((k) => {
  const s = window.__game.scene.getScene(k);
  return s ? { active: window.__game.scene.isActive(k) } : null;
}, key);

async function frames(g, n = 3) {
  await g.evaluate((count) => new Promise((resolve) => {
    let left = count;
    const tick = () => (--left <= 0 ? resolve() : requestAnimationFrame(tick));
    requestAnimationFrame(tick);
  }), n);
}

async function setSave(page, save) {
  await page.evaluate(([k, v]) => localStorage.setItem(k, JSON.stringify(v)), [SAVE_KEY, save]);
}

function save(extra = {}) {
  return { version: 1, bestWave: 0, wins: 0, runs: 0, bestWaveBy: {}, winsBy: {}, lastSausage: 'frank', tutorialDone: true, ...extra };
}

async function reload(page, g, query = '') {
  await page.goto(page.url().split('?')[0] + query);
  await g.waitForScene('Menu', 15000);
  await page.evaluate(() => { window.__game.loop.inFocus = true; });
}

/** Installs a fake standard gamepad that tests can press buttons on. */
function fakeGamepadScript() {
  const buttons = Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 }));
  // Real pads stamp readings with performance.now(); Phaser ignores readings older than the pad object.
  const pad = { id: 'Fake Pad', index: 0, connected: true, mapping: 'standard', buttons, axes: [0, 0, 0, 0], get timestamp() { return performance.now(); } };
  Object.defineProperty(navigator, 'getGamepads', { value: () => [pad, null, null, null], configurable: true });
  window.__fakePad = pad;
  window.__padSet = (i, on) => {
    pad.buttons[i] = { pressed: on, touched: on, value: on ? 1 : 0 };
  };
  window.addEventListener('load', () => {
    const e = new Event('gamepadconnected');
    e.gamepad = pad;
    setTimeout(() => window.dispatchEvent(e), 300);
  });
}

async function tapPad(g, index) {
  await g.evaluate((i) => window.__padSet(i, true), index);
  await frames(g, 3);
  await g.evaluate((i) => window.__padSet(i, false), index);
  await frames(g, 3);
}

module.exports = {
  tests: [
    {
      name: 'settings: changes apply immediately and survive a reload',
      fn: async ({ page, g }) => {
        await page.mouse.click(640 - 270, 630); // Settings
        await frames(g, 3);
        // Music row: down once, then left twice (−20%).
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('ArrowLeft');
        await page.keyboard.press('ArrowLeft');
        // Reduce flashing: down 3 more rows, Enter toggles.
        for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter');
        await page.keyboard.press('Escape');
        await frames(g, 3);
        assert.equal(await g.evaluate(() => window.__game.scene.isActive('Menu')), true, 'Esc closes settings, stays on the menu');
        const stored = JSON.parse(await page.evaluate((k) => localStorage.getItem(k), SETTINGS_KEY));
        assert.equal(stored.musicVolume, 0.3);
        assert.equal(stored.reduceFlashing, true);
        await reload(page, g);
        const after = JSON.parse(await page.evaluate((k) => localStorage.getItem(k), SETTINGS_KEY));
        assert.equal(after.musicVolume, 0.3);
      },
    },
    {
      name: 'pause menu: Esc opens it with the build; Settings opens over it; Esc backs out step by step',
      fn: async ({ page, g }) => {
        await g.startRun({ seed: 3, items: ['paprika', 'casing'] });
        await g.godMode();
        await frames(g, 5);
        await page.keyboard.press('Escape');
        await frames(g, 3);
        const open = await g.evaluate(() => {
          const s = window.__game.scene.getScene('Game');
          // Button labels live inside containers, so collect texts recursively.
          const texts = [];
          const walk = (list) => list.forEach((o) => { if (o.type === 'Text' && o.visible) texts.push(o.text); if (o.list) walk(o.list); });
          walk(s.children.list);
          return { paused: s.paused, menu: s.pauseMenu.open, texts };
        });
        assert.ok(open.paused && open.menu);
        for (const t of ['PAUSED', 'Resume (Esc)', 'Restart run', 'Settings', 'Main menu', 'Armor']) {
          assert.ok(open.texts.some((x) => x.includes(t)), `pause menu shows "${t}"`);
        }
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter'); // Settings
        await frames(g, 3);
        assert.equal(await g.evaluate(() => window.__game.scene.getScene('Game').settingsPanel.isOpen), true);
        await page.keyboard.press('Escape'); // closes settings only
        await frames(g, 3);
        let st = await g.evaluate(() => { const s = window.__game.scene.getScene('Game'); return { paused: s.paused, settings: s.settingsPanel.isOpen }; });
        assert.deepEqual(st, { paused: true, settings: false });
        await page.keyboard.press('Escape'); // resumes
        await frames(g, 3);
        st = await g.evaluate(() => ({ paused: window.__game.scene.getScene('Game').paused }));
        assert.equal(st.paused, false);
      },
    },
    {
      name: 'pause menu: Restart and Main menu need a second press',
      fn: async ({ page, g }) => {
        await g.startRun({ seed: 3, wave: 4, crumbs: 50 });
        await g.godMode();
        await page.keyboard.press('Escape');
        await frames(g, 3);
        await page.keyboard.press('ArrowDown'); // Restart run
        await page.keyboard.press('Enter');
        await frames(g, 3);
        let s = await g.gameState();
        assert.equal(s.wave, 4, 'first press only asks for confirmation');
        await page.keyboard.press('Enter');
        await frames(g, 10);
        s = await g.gameState();
        assert.equal(s.wave, 1, 'second press restarts at wave 1');
        assert.equal(await g.evaluate(() => window.__game.scene.getScene('Game').paused), false);
      },
    },
    {
      name: 'sausage select: locked sausages cannot start; unlocked ones start with their own stats',
      fn: async ({ page, g }) => {
        await setSave(page, save({ bestWave: 4, runs: 2, lastSausage: 'frank' }));
        await reload(page, g);
        await page.keyboard.press('Enter');
        await g.waitForScene('Select');
        await g.wait(350);
        await page.keyboard.press('4'); // Hot Dog: locked (needs wave 10)
        await page.keyboard.press('Enter');
        await frames(g, 5);
        assert.equal(await g.evaluate(() => window.__game.scene.isActive('Select')), true, 'locked sausage did not start');
        await page.keyboard.press('2'); // Bratwurst: unlocked by wave 4
        await page.keyboard.press('Enter');
        await g.waitForScene('Game');
        const r = await g.evaluate(() => {
          const s = window.__game.scene.getScene('Game');
          return { sausage: s.run.sausage, maxHp: s.health.maxHp, armor: s.health.armor, weapons: s.run.weapons.map((w) => w.id) };
        });
        assert.deepEqual(r, { sausage: 'bratwurst', maxHp: 140, armor: 3, weapons: ['pepper'] });
        const stored = JSON.parse(await page.evaluate((k) => localStorage.getItem(k), SAVE_KEY));
        assert.equal(stored.lastSausage, 'bratwurst', 'the choice is remembered');
      },
    },
    {
      name: 'unlocks: dying on wave 4 with a fresh profile unlocks the Bratwurst and records the run',
      fn: async ({ g }) => {
        await g.startRun({ seed: 5, wave: 4 });
        await g.evaluate(() => window.__game.scene.getScene('Game').takeDamage(999, 'Fork'));
        await g.waitForScene('GameOver', 10000);
        await frames(g, 3);
        const r = await g.evaluate((k) => {
          const s = window.__game.scene.getScene('GameOver');
          const texts = s.children.list.filter((o) => o.type === 'Text').map((o) => o.text);
          return { texts, save: JSON.parse(localStorage.getItem(k)) };
        }, SAVE_KEY);
        assert.ok(r.texts.some((t) => t.includes('NEW SAUSAGE UNLOCKED') && t.includes('Bratwurst')), 'unlock announced');
        assert.ok(r.texts.some((t) => t.includes('Done in by Fork')), 'cause of death shown');
        assert.equal(r.save.bestWave, 4);
        assert.equal(r.save.runs, 1);
      },
    },
    {
      name: 'tips: a fresh profile gets tips in wave 1, once',
      timeoutMs: 120000,
      fn: async ({ page, g }) => {
        await setSave(page, save({ tutorialDone: false }));
        await reload(page, g);
        await g.startRun({ seed: 2 });
        await g.godMode();
        await g.waitGameMs(2500);
        const shown = await g.evaluate(() => window.__game.scene.getScene('Game').tutorial?.shown ?? []);
        assert.ok(shown.includes('move'), `first tip shown, got ${JSON.stringify(shown)}`);
        await g.fastForwardWave();
        await g.waitForScene('Shop', 15000);
        const stored = JSON.parse(await page.evaluate((k) => localStorage.getItem(k), SAVE_KEY));
        assert.equal(stored.tutorialDone, true);
        await g.startRun({ seed: 2 });
        assert.equal(await g.evaluate(() => window.__game.scene.getScene('Game').tutorial), null, 'no tips the second time');
      },
    },
    {
      name: 'touch: the virtual stick moves the sausage and the DASH button dashes',
      fn: async ({ page, g }) => {
        await reload(page, g, '?touch=1');
        await g.startRun({ seed: 2 });
        await g.godMode();
        await g.evaluate(() => window.__game.scene.getScene('Game').director.stop());
        await frames(g, 5);
        const x0 = await g.evaluate(() => window.__game.scene.getScene('Game').head.x);
        await page.mouse.move(300, 450);
        await page.mouse.down();
        await page.mouse.move(380, 450, { steps: 4 });
        await g.waitGameMs(600);
        const x1 = await g.evaluate(() => window.__game.scene.getScene('Game').head.x);
        await page.mouse.up();
        assert.ok(x1 > x0 + 40, `stick moved the head right: ${x0} → ${x1}`);
        const before = await g.evaluate(() => window.__game.scene.getScene('Game').head.dashCharge(1500));
        await page.mouse.click(1280 - 110, 720 - 110);
        await frames(g, 3);
        const after = await g.evaluate(() => window.__game.scene.getScene('Game').head.dashCharge(1500));
        assert.equal(before, 1);
        assert.ok(after < 1, 'dash used');
      },
    },
    {
      name: 'gamepad: Start pauses, A resumes from the pause menu, A in a fight dashes',
      fn: async ({ page, g, context }) => {
        await context.addInitScript(fakeGamepadScript);
        await reload(page, g);
        await g.wait(500);
        assert.ok(await g.evaluate(() => window.__game.scene.getScene('Menu').input.gamepad.total >= 1), 'fake pad connected');
        await g.startRun({ seed: 2 });
        await g.godMode();
        await frames(g, 5);
        await tapPad(g, 9); // Start
        assert.equal(await g.evaluate(() => window.__game.scene.getScene('Game').paused), true, 'Start pauses');
        await tapPad(g, 0); // A on "Resume"
        assert.equal(await g.evaluate(() => window.__game.scene.getScene('Game').paused), false, 'A resumes');
        await g.waitGameMs(1600);
        await tapPad(g, 0); // A dashes
        const charge = await g.evaluate(() => window.__game.scene.getScene('Game').head.dashCharge(1500));
        assert.ok(charge < 1, 'A dashed');
      },
    },
    {
      name: 'audio: effects fire for gameplay and music changes mood per screen',
      fn: async ({ page, g }) => {
        await page.mouse.click(10, 10); // a gesture so the AudioContext may start
        assert.equal(await g.evaluate(() => window.__audio.currentMood), 'menu');
        await g.startRun({ seed: 2 });
        await g.godMode();
        await g.waitGameMs(3000);
        const r = await g.evaluate(() => ({ mood: window.__audio.currentMood, played: window.__audio.played }));
        assert.equal(r.mood, 'fight');
        assert.ok(r.played > 5, `effects requested: ${r.played}`);
        await g.evaluate(() => { const s = window.__game.scene.getScene('Game'); s.invincible = false; s.takeDamage(999, 'test'); });
        await frames(g, 3);
        assert.equal(await g.evaluate(() => window.__audio.currentMood), 'off', 'music stops on death');
      },
    },
    {
      name: 'damage numbers appear, and the setting turns them off',
      fn: async ({ page, g }) => {
        const count = () => g.evaluate(() => window.__game.scene.getScene('Game').damageNumbers.live.length);
        await g.startRun({ seed: 2 });
        await g.godMode();
        await g.waitGameMs(5000);
        let seen = 0;
        for (let i = 0; i < 20 && !seen; i++) { seen = await count(); await frames(g, 2); }
        assert.ok(seen > 0, 'numbers shown');
        await page.evaluate((k) => localStorage.setItem(k, JSON.stringify({ damageNumbers: false })), SETTINGS_KEY);
        await reload(page, g);
        await g.startRun({ seed: 2 });
        await g.godMode();
        await g.waitGameMs(5000);
        let max = 0;
        for (let i = 0; i < 20; i++) { max = Math.max(max, await count()); await frames(g, 2); }
        assert.equal(max, 0);
      },
    },
    {
      name: 'shop: arrows move card focus, Shift+number keeps, cards show exact stat changes',
      fn: async ({ page, g }) => {
        await g.openShop({ seed: 11, run: { wave: 5, crumbs: 500 } });
        await g.wait(450);
        await page.keyboard.press('ArrowRight');
        await page.keyboard.press('ArrowRight');
        assert.equal(await g.evaluate(() => window.__game.scene.getScene('Shop').focus), 2);
        await page.keyboard.down('Shift');
        await page.keyboard.press('1');
        await page.keyboard.up('Shift');
        await frames(g, 2);
        const r = await g.evaluate(() => {
          const s = window.__game.scene.getScene('Shop');
          const texts = s.children.list.filter((o) => o.type === 'Text').map((o) => o.text);
          return { locked: [...s.locked], crumbs: s.run.crumbs, texts };
        });
        assert.deepEqual(r.locked, [0], 'Shift+1 kept the first offer');
        assert.equal(r.crumbs, 500, 'and did not buy it');
        assert.ok(r.texts.some((t) => /→/.test(t) || /^DMG /.test(t)), 'stat lines shown on cards');
      },
    },
  ],
};
