/**
 * Controller and touch-screen play: prompts that follow the device in use, the touch layer
 * (follow-thumb stick, tap-a-half dash, left-handed swap) and controller extras (any slot,
 * menu focus, rumble, pause when the controller drops out).
 */
const { assert } = require('./harness.cjs');

const SETTINGS_KEY = 'wurst-case-scenario/settings';

async function frames(g, n = 3) {
  await g.evaluate((count) => new Promise((resolve) => {
    let left = count;
    const tick = () => (--left <= 0 ? resolve() : requestAnimationFrame(tick));
    requestAnimationFrame(tick);
  }), n);
}

async function reload(page, g, query = '') {
  await page.goto(page.url().split('?')[0] + query);
  await g.waitForScene('Menu', 15000);
  await page.evaluate(() => { window.__game.loop.inFocus = true; });
}

/** A fake standard controller in the given slot, with a rumble motor that records its calls. */
function fakePadInSlot(slot) {
  const buttons = Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 }));
  window.__rumbles = [];
  const pad = {
    id: 'Fake Pad (STANDARD GAMEPAD Vendor: 045e)', index: slot, connected: true, mapping: 'standard', buttons, axes: [0, 0, 0, 0],
    get timestamp() { return performance.now(); },
    vibrationActuator: { playEffect: (type, p) => { window.__rumbles.push({ type, ...p }); return Promise.resolve('complete'); } },
  };
  const list = [null, null, null, null];
  list[slot] = pad;
  Object.defineProperty(navigator, 'getGamepads', { value: () => list, configurable: true });
  window.__padSet = (i, on) => { pad.buttons[i] = { pressed: on, touched: on, value: on ? 1 : 0 }; };
  window.__padDrop = () => {
    pad.connected = false;
    list[slot] = null;
    const e = new Event('gamepaddisconnected');
    e.gamepad = pad;
    window.dispatchEvent(e);
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

const menuStartLabel = (g) => g.evaluate(() => {
  const m = window.__game.scene.getScene('Menu');
  return m.children.list.filter((o) => o.label).map((o) => o.label.text);
});

const game = (g, fn) => g.evaluate(fn);

module.exports = {
  tests: [
    {
      name: 'touch: prompts drop key names and the on-screen controls show',
      fn: async ({ page, g }) => {
        await reload(page, g, '?touch=1');
        const labels = await menuStartLabel(g);
        assert.ok(labels.includes('START'), `menu button reads START: ${labels}`);
        const help = await g.evaluate(() => window.__game.scene.getScene('Menu').children.list.filter((o) => o.type === 'Text').map((o) => o.text).join('\n'));
        assert.match(help, /drag on the left side/i);
        assert.doesNotMatch(help, /WASD|Space/);
        await g.startRun({ seed: 2 });
        assert.equal(await game(g, () => window.__game.scene.getScene('Game').touch.shown), true, 'touch controls visible');
      },
    },
    {
      name: 'touch: a tap anywhere on the dash half dashes, and the cooldown ring fills back up',
      fn: async ({ page, g }) => {
        await reload(page, g, '?touch=1');
        await g.startRun({ seed: 2 });
        await g.godMode();
        await game(g, () => window.__game.scene.getScene('Game').director.stop());
        await frames(g, 5);
        assert.equal(await game(g, () => window.__game.scene.getScene('Game').head.dashCharge(1500)), 1);
        await page.mouse.click(900, 360); // middle of the right half, nowhere near the DASH circle
        await frames(g, 3);
        const charge = await game(g, () => window.__game.scene.getScene('Game').head.dashCharge(1500));
        assert.ok(charge < 1, `dash used: ${charge}`);
      },
    },
    {
      name: 'touch: the stick follows the thumb past its rim, so pulling back reverses at once',
      fn: async ({ page, g }) => {
        await reload(page, g, '?touch=1');
        await g.startRun({ seed: 2 });
        await g.godMode();
        await frames(g, 5);
        await page.mouse.move(250, 450);
        await page.mouse.down();
        await page.mouse.move(520, 450, { steps: 6 }); // far past the 70px rim
        await frames(g, 2);
        assert.ok((await game(g, () => window.__game.scene.getScene('Game').touch.vector.x)) > 0.9, 'full right');
        await page.mouse.move(420, 450, { steps: 3 }); // pull back 100px: without follow the knob would still point right
        await frames(g, 2);
        const x = await game(g, () => window.__game.scene.getScene('Game').touch.vector.x);
        await page.mouse.up();
        assert.ok(x < 0, `pulling back points left right away: ${x}`);
      },
    },
    {
      name: 'touch: left-handed layout puts DASH on the left and the stick on the right',
      fn: async ({ page, g }) => {
        await page.evaluate((k) => localStorage.setItem(k, JSON.stringify({ dashSide: 'left' })), SETTINGS_KEY);
        await reload(page, g, '?touch=1');
        await g.startRun({ seed: 2 });
        await g.godMode();
        await game(g, () => window.__game.scene.getScene('Game').director.stop());
        await frames(g, 5);
        const x0 = await game(g, () => window.__game.scene.getScene('Game').head.x);
        await page.mouse.move(900, 450);
        await page.mouse.down();
        await page.mouse.move(820, 450, { steps: 4 });
        await g.waitGameMs(500);
        await page.mouse.up();
        const x1 = await game(g, () => window.__game.scene.getScene('Game').head.x);
        assert.ok(x1 < x0 - 30, `stick on the right moved the head left: ${x0} → ${x1}`);
        await g.waitGameMs(1600);
        await page.mouse.click(200, 400);
        await frames(g, 3);
        assert.ok((await game(g, () => window.__game.scene.getScene('Game').head.dashCharge(1500))) < 1, 'tap on the left dashed');
      },
    },
    {
      name: 'gamepad: a controller in slot 2 works, prompts switch to (A), the D-pad walks the menu',
      fn: async ({ page, g, context }) => {
        await context.addInitScript(fakePadInSlot, 1);
        await reload(page, g);
        await g.wait(500);
        assert.match(await page.evaluate(() => document.getElementById('toast').textContent), /Controller connected: Fake Pad/);
        await tapPad(g, 14); // D-pad left: focus Settings
        assert.ok((await menuStartLabel(g)).includes('START (A)'), 'pad prompts');
        await tapPad(g, 0); // A on Settings
        assert.equal(await game(g, () => window.__game.scene.getScene('Menu').settingsPanel.isOpen), true, 'A opened the focused Settings button');
        await tapPad(g, 1); // B closes
        assert.equal(await game(g, () => window.__game.scene.getScene('Menu').settingsPanel.isOpen), false);
        await tapPad(g, 15); // back to START
        await tapPad(g, 0);
        await g.waitForScene('Select', 5000);
        // The A that left the menu must not also pick a sausage: held buttons don't carry over.
        await frames(g, 30);
        assert.deepEqual(await g.activeScenes(), ['Select']);
      },
    },
    {
      name: 'gamepad: rumbles on a hit, and pauses when the controller drops out',
      fn: async ({ page, g, context }) => {
        await context.addInitScript(fakePadInSlot, 0);
        await reload(page, g);
        await g.wait(500);
        await g.startRun({ seed: 2 });
        await frames(g, 5);
        await tapPad(g, 5); // RB: a dash, and it marks the controller as the device in use
        await game(g, () => { const s = window.__game.scene.getScene('Game'); s.invincible = false; s.takeDamage(1, 'test'); });
        const rumbles = await page.evaluate(() => window.__rumbles);
        assert.ok(rumbles.length >= 1 && rumbles[0].type === 'dual-rumble', `rumbled: ${JSON.stringify(rumbles)}`);
        await g.godMode();
        await page.evaluate(() => window.__padDrop());
        await frames(g, 3);
        assert.equal(await game(g, () => window.__game.scene.getScene('Game').paused), true, 'paused on disconnect');
      },
    },
    {
      name: 'settings: vibration and DASH side rows toggle by tap',
      fn: async ({ page, g }) => {
        await reload(page, g, '?touch=1');
        await g.evaluate(() => window.__game.scene.getScene('Menu').settingsPanel.show());
        await frames(g, 3);
        // Rows start at y = top + 90, 48 apart; vibration is row 8, DASH side row 9 (0-based 7 and 8).
        const top = (720 - (146 + 10 * 48)) / 2;
        await page.mouse.click(500, top + 90 + 7 * 48);
        await page.mouse.click(500, top + 90 + 8 * 48);
        await frames(g, 2);
        const s = JSON.parse(await page.evaluate((k) => localStorage.getItem(k), SETTINGS_KEY));
        assert.equal(s.vibration, false);
        assert.equal(s.dashSide, 'left');
      },
    },
  ],
};
