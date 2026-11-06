/**
 * Adversarial / exploratory player tests: key mashing during transitions, pause abuse,
 * dying and winning at once, shop spam, window events, every wave with fixed seeds, walls.
 *
 * Input is real keyboard/mouse (page.keyboard / page.mouse) wherever possible; internals are
 * only used to set up a situation (a bullet in flight, a hit) or to read state for asserts.
 *
 * Everything waits on game state, not wall time, with generous timeouts: on a loaded machine
 * the game can run at ~10 fps and Phaser then advances game time slower than wall time.
 */
const { GameDriver, assert } = require('./harness.cjs');

const GAME_W = 1280;
const GAME_H = 720;
const ARENA = { left: 22, top: 64 + 14, right: 1280 - 22, bottom: 64 + 14 + (720 - 64 - 30) };

// Shop layout (src/scenes/Shop.ts): 4 cards 250 wide, 24 apart, centred, at y=290.
const CARD_X = (i) => GAME_W / 2 - ((250 + 24) * 4 - 24) / 2 + 125 + i * 274;
const SHOP = {
  buy: (i) => [CARD_X(i) - 38, 290 - 145 + 290 - 34],
  keep: (i) => [CARD_X(i) + 82, 290 - 145 + 290 - 34],
  reroll: [GAME_W / 2 - 150, 490],
  next: [GAME_W / 2 + 150, 490],
};
const END = { again: [GAME_W / 2 - 150, 600], menu: [GAME_W / 2 + 150, 600] };

// ---------------------------------------------------------------------------- helpers

/** Game canvas coordinates → page (CSS) coordinates, honouring Scale.FIT. */
async function toPage(page, [x, y]) {
  return page.evaluate(([x, y]) => {
    const r = window.__game.canvas.getBoundingClientRect();
    return [r.left + (x * r.width) / 1280, r.top + (y * r.height) / 720];
  }, [x, y]);
}

async function click(page, xy) {
  const [x, y] = await toPage(page, xy);
  await page.mouse.click(x, y);
}

function waitFor(page, fn, arg, timeout = 30000) {
  return page.waitForFunction(fn, arg, { timeout, polling: 50 });
}

/** Wait until the game loop has advanced `n` frames (game time, not wall time). */
async function frames(page, n) {
  const f0 = await page.evaluate(() => window.__game.loop.frame);
  await waitFor(page, ([f0, n]) => window.__game.loop.frame >= f0 + n, [f0, n], 60000);
}

/**
 * Press a key the way a human does: held for a couple of frames. Game-scene keys are read with
 * JustDown() once per frame, and a down+up inside one frame is lost (see the knownBug test).
 */
async function tap(page, key) {
  await page.keyboard.down(key);
  await frames(page, 2);
  await page.keyboard.up(key);
}

const shopState = (g) => g.evaluate(() => {
  const s = window.__game.scene.getScene('Shop');
  return {
    active: window.__game.scene.isActive('Shop'),
    wave: s.run.wave,
    crumbs: s.run.crumbs,
    rerolls: s.run.rerollCount,
    items: [...s.run.items],
    weapons: s.run.weapons.map((w) => ({ ...w })),
    offers: s.offers.map((o) => (o ? { ...o } : null)),
    locked: [...s.locked],
  };
});

const gameWave = (g) => g.evaluate(() => window.__game.scene.getScene('Game').run.wave);

async function waveClearToShop(g, opts = {}) {
  await g.startRun({ seed: 1, ...opts });
  await g.godMode();
  await g.fastForwardWave();
  await g.waitForScene('Shop', 40000);
}

async function waitForBoss(page) {
  await waitFor(page, () => !!window.__game.scene.getScene('Game').boss, null, 60000);
}

const STRONG = [
  { id: 'toothpick', tier: 4 }, { id: 'pepper', tier: 4 }, { id: 'skewer', tier: 4 },
  { id: 'mustard', tier: 3 }, { id: 'onion', tier: 3 }, { id: 'pickle', tier: 3 },
];

// ---------------------------------------------------------------------------- tests

const tests = [];

// ======================= Transitions & key mashing (regression guards) =======================

tests.push({
  name: 'menu: mashing Enter/Space/click on START starts exactly one run at wave 1',
  timeoutMs: 60000,
  fn: async ({ page, g }) => {
    const [sx, sy] = await toPage(page, [GAME_W / 2, 630]);
    await page.mouse.move(sx, sy);
    await Promise.all([
      page.keyboard.press('Enter'), page.keyboard.press('Space'), page.mouse.down(),
      page.keyboard.press('Enter'), page.keyboard.press('Space'),
    ]);
    await page.mouse.up();
    await g.waitForScene('Game', 30000);
    await frames(page, 10);
    assert.deepEqual(await g.activeScenes(), ['Game']);
    const s = await g.gameState();
    assert.equal(s.wave, 1);
    assert.equal(s.crumbs, 0);
    assert.ok(!s.ending && !s.dying);
  },
});

tests.push({
  name: 'wave-clear banner: mashing Esc/P/1-4/R never pauses, never skips; one Enter in the shop = one wave',
  timeoutMs: 90000,
  fn: async ({ page, g }) => {
    await g.startRun({ seed: 3, crumbs: 0 });
    await g.godMode();
    await g.fastForwardWave();
    await waitFor(page, () => window.__game.scene.getScene('Game').ending);
    const keys = ['Escape', 'p', '1', '2', '3', '4', 'r', 'Escape', 'p'];
    let i = 0;
    while (!(await g.activeScenes()).includes('Shop')) {
      const paused = await g.evaluate(() => window.__game.scene.getScene('Game').paused);
      assert.equal(paused, false, 'pause must be ignored during the wave-clear banner');
      await page.keyboard.press(keys[i++ % keys.length]);
      await g.wait(40);
      assert.ok(i < 2000, 'shop never appeared');
    }
    await g.wait(500);
    const shop = await shopState(g);
    assert.equal(shop.wave, 1, 'still "wave 1 survived" in the shop');
    assert.ok(shop.crumbs >= 0);
    await page.keyboard.press('Enter');
    await g.waitForScene('Game', 30000);
    await frames(page, 5);
    assert.equal(await gameWave(g), 2);
    assert.equal(await g.evaluate(() => window.__game.scene.getScene('Game').paused), false);
  },
});

tests.push({
  name: 'death banner: mashing keys during CHARRED → GameOver, then Enter starts a clean run',
  timeoutMs: 90000,
  fn: async ({ page, g }) => {
    await g.startRun({ seed: 4, wave: 5, crumbs: 77, heat: 60, weapons: STRONG, items: ['paprika'] });
    await g.evaluate(() => window.__game.scene.getScene('Game').takeHeat(500));
    const keys = ['Escape', 'p', 'Space', '1', 'r', 'w', 'Shift', 'd'];
    let i = 0;
    while (!(await g.activeScenes()).includes('GameOver')) {
      await page.keyboard.press(keys[i++ % keys.length]);
      await g.wait(40);
      assert.ok(i < 2000, 'GameOver never appeared');
    }
    await g.wait(300);
    assert.deepEqual(await g.activeScenes(), ['GameOver']);
    await page.keyboard.press('Enter');
    await g.waitForScene('Game', 30000);
    await frames(page, 5);
    const s = await g.gameState();
    assert.equal(s.wave, 1);
    assert.equal(s.crumbs, 0);
    assert.equal(s.kills, 0);
    assert.ok(s.heat <= 20 && !s.dying && !s.ending);
    const loadout = await g.evaluate(() => { const s = window.__game.scene.getScene('Game'); return { w: s.run.weapons, i: s.run.items, paused: s.paused }; });
    assert.deepEqual(loadout.w, [{ id: 'toothpick', tier: 1 }]);
    assert.deepEqual(loadout.i, []);
    assert.equal(loadout.paused, false);
  },
});

tests.push({
  name: 'victory banner: mashing keys while the boss dies → Victory, then Enter starts a clean run',
  timeoutMs: 90000,
  fn: async ({ page, g }) => {
    await g.startRun({ seed: 5, wave: 10 });
    await g.godMode();
    await waitForBoss(page);
    await g.evaluate(() => { const s = window.__game.scene.getScene('Game'); s.damageEnemy(s.boss, 1e9, 0, 0, 0); });
    const keys = ['Escape', 'p', 'Space', '4', 'r'];
    let i = 0;
    while (!(await g.activeScenes()).includes('Victory')) {
      const scenes = await g.activeScenes();
      assert.ok(!scenes.includes('GameOver'), 'won, but ended on GameOver');
      await page.keyboard.press(keys[i++ % keys.length]);
      await g.wait(40);
      assert.ok(i < 2000, 'Victory never appeared');
    }
    await g.wait(300);
    assert.deepEqual(await g.activeScenes(), ['Victory']);
    await page.keyboard.press('Enter');
    await g.waitForScene('Game', 30000);
    await frames(page, 5);
    assert.equal(await gameWave(g), 1);
  },
});

tests.push({
  name: 'keys pressed while the page is still loading, and reloading mid-run, leave a clean menu',
  timeoutMs: 60000,
  fn: async ({ page, g }) => {
    await g.startRun({ seed: 9, wave: 3 });
    const reload = page.reload();
    for (let i = 0; i < 20; i++) { await page.keyboard.press(i % 2 ? 'Escape' : 'p').catch(() => {}); await g.wait(20); }
    await reload;
    await g.waitForScene('Menu', 30000);
    await frames(page, 5);
    assert.deepEqual(await g.activeScenes(), ['Menu']);
    await page.keyboard.press('Enter');
    await g.waitForScene('Game', 30000);
    assert.equal(await gameWave(g), 1);
  },
});

// ======================= Pause abuse =======================

tests.push({
  name: 'pause/resume: world freezes while paused, then enemies move and the wave timer continues',
  timeoutMs: 90000,
  fn: async ({ page, g }) => {
    await g.startRun({ seed: 6, wave: 3 });
    await g.godMode();
    await g.installBot();
    await waitFor(page, () => window.__game.scene.getScene('Game').enemyList().filter((e) => !e.dead).length >= 3, null, 60000);
    await g.removeBot();
    const snap = () => g.evaluate(() => {
      const s = window.__game.scene.getScene('Game');
      return {
        paused: s.paused,
        elapsed: s.director.elapsedMs,
        enemies: s.enemyList().filter((e) => !e.dead).map((e) => [Math.round(e.x), Math.round(e.y)]),
        head: [s.head.x, s.head.y],
        pauseText: !!(s.pauseText && s.pauseText.active && s.pauseText.visible),
      };
    });
    await tap(page, 'Escape');
    await waitFor(page, () => window.__game.scene.getScene('Game').paused);
    const a = await snap();
    assert.ok(a.pauseText, 'PAUSED text visible');
    await page.keyboard.down('d'); // holding a direction while paused must not move us
    await frames(page, 20);
    const b = await snap();
    await page.keyboard.up('d');
    assert.equal(b.elapsed, a.elapsed, 'wave timer frozen while paused');
    assert.deepEqual(b.enemies, a.enemies, 'enemies frozen while paused');
    assert.deepEqual(b.head, a.head, 'player frozen while paused');
    await tap(page, 'p');
    await waitFor(page, () => !window.__game.scene.getScene('Game').paused);
    await frames(page, 20);
    const c = await snap();
    assert.ok(!c.pauseText, 'PAUSED text removed');
    assert.ok(c.elapsed > b.elapsed, 'wave timer resumes');
    const moved = c.enemies.length !== b.enemies.length || c.enemies.some((p, i) => !b.enemies[i] || p[0] !== b.enemies[i][0] || p[1] !== b.enemies[i][1]);
    assert.ok(moved, 'enemies move again after resume');
    // Toggle many times quickly: must end in a consistent state (paused flag ⇔ physics paused).
    for (let i = 0; i < 9; i++) { await tap(page, i % 2 ? 'p' : 'Escape'); await frames(page, 1); }
    const st = await g.evaluate(() => { const s = window.__game.scene.getScene('Game'); return { p: s.paused, w: s.physics.world.isPaused, t: s.time.paused, txt: s.children.list.filter((o) => o.type === 'Text' && /PAUSED/.test(o.text)).length }; });
    assert.equal(st.p, st.w);
    assert.equal(st.p, st.t);
    assert.equal(st.txt, st.p ? 1 : 0, 'exactly one PAUSED text when paused, none otherwise');
  },
});

tests.push({
  name: 'pause right before the wave timer runs out: resume → wave clears → shop once',
  timeoutMs: 90000,
  fn: async ({ page, g }) => {
    await g.startRun({ seed: 8 });
    await g.godMode();
    await g.evaluate(() => { const s = window.__game.scene.getScene('Game'); s.director.elapsedMs = s.cfg.durationSec * 1000 - 120; });
    await tap(page, 'Escape');
    await waitFor(page, () => { const s = window.__game.scene.getScene('Game'); return s.paused || s.ending; });
    const st = await g.evaluate(() => { const s = window.__game.scene.getScene('Game'); return { paused: s.paused, ending: s.ending }; });
    if (st.paused) {
      await frames(page, 30);
      assert.equal(await g.evaluate(() => window.__game.scene.getScene('Game').ending), false, 'timer must not run out while paused');
      await tap(page, 'Escape');
    }
    await g.waitForScene('Shop', 40000);
    assert.equal((await shopState(g)).wave, 1);
  },
});

// ======================= Window / browser events =======================

tests.push({
  name: 'window blur releases held movement keys (no stuck keys after alt-tab)',
  timeoutMs: 60000,
  fn: async ({ page, g }) => {
    await g.startRun({ seed: 2 });
    await g.godMode();
    await page.keyboard.down('d');
    await page.keyboard.down('s');
    await frames(page, 10);
    let v = await g.evaluate(() => window.__game.scene.getScene('Game').head.body.velocity.x);
    assert.ok(v > 0, 'moving right while D held');
    // The window loses focus; the key-ups happen elsewhere and never reach the page.
    await g.evaluate(() => {
      window.__swallow = (e) => e.stopImmediatePropagation();
      window.addEventListener('keyup', window.__swallow, true);
      window.dispatchEvent(new Event('blur'));
    });
    await page.keyboard.up('d');
    await page.keyboard.up('s');
    await g.evaluate(() => { window.removeEventListener('keyup', window.__swallow, true); window.dispatchEvent(new Event('focus')); });
    await frames(page, 5);
    // Losing focus auto-pauses the game; resume it, then nothing may still be "held".
    assert.equal(await g.evaluate(() => window.__game.scene.getScene('Game').paused), true, 'blur should auto-pause');
    await page.keyboard.down('Escape');
    await frames(page, 2);
    await page.keyboard.up('Escape');
    await frames(page, 10);
    const st = await g.evaluate(() => { const s = window.__game.scene.getScene('Game'); return { paused: s.paused, D: s.keys.D.isDown, S: s.keys.S.isDown, vx: s.head.body.velocity.x, vy: s.head.body.velocity.y }; });
    assert.deepEqual(st, { paused: false, D: false, S: false, vx: 0, vy: 0 });
  },
});

tests.push({
  name: 'resizing mid-game (tiny, huge, portrait) and DPR 2 keep input mapping correct',
  timeoutMs: 90000,
  fn: async ({ page, g, browser, url }) => {
    await g.startRun({ seed: 2 });
    await g.godMode();
    for (const vp of [{ width: 320, height: 200 }, { width: 2560, height: 1440 }, { width: 360, height: 780 }, { width: 1280, height: 720 }]) {
      await page.setViewportSize(vp);
      await frames(page, 5);
      const r = await g.evaluate(() => window.__game.canvas.getBoundingClientRect().toJSON());
      assert.ok(r.left >= -1 && r.top >= -1 && r.right <= vp.width + 1 && r.bottom <= vp.height + 1, `canvas fits ${JSON.stringify(vp)}: ${JSON.stringify(r)}`);
      assert.ok(Math.abs(r.width / r.height - 16 / 9) < 0.02, 'aspect ratio kept');
    }
    // Tiny portrait viewport at DPR 2: clicking "Next wave" in the shop still hits the button.
    const ctx = await browser.newContext({ viewport: { width: 360, height: 780 }, deviceScaleFactor: 2 });
    try {
      const p2 = await ctx.newPage();
      const g2 = new GameDriver(p2);
      await g2.open(url);
      await g2.openShop({ run: { wave: 1, crumbs: 50 } });
      await frames(p2, 5);
      await click(p2, SHOP.buy(0));
      await frames(p2, 5);
      const s = await shopState(g2);
      assert.ok(s.offers[0] === null || s.crumbs === 50, 'buy click handled (or card unaffordable)');
      await click(p2, SHOP.next);
      await g2.waitForScene('Game', 30000);
      g2.assertNoErrors();
    } finally {
      await ctx.close();
    }
  },
});

// ======================= Movement edge cases =======================

tests.push({
  name: 'walls & corners: hugging, dashing into walls, diagonal dashes and opposite keys keep the sausage inside',
  timeoutMs: 90000,
  fn: async ({ page, g }) => {
    await g.startRun({ seed: 12, weapons: STRONG.slice(0, 6) });
    await g.godMode();
    // Record the extremes of head and link positions every frame.
    await g.evaluate(() => {
      const s = window.__game.scene.getScene('Game');
      window.__ext = { minX: 1e9, minY: 1e9, maxX: -1e9, maxY: -1e9, lminX: 1e9, lminY: 1e9, lmaxX: -1e9, lmaxY: -1e9 };
      s.events.on('postupdate', () => {
        const e = window.__ext;
        e.minX = Math.min(e.minX, s.head.x); e.maxX = Math.max(e.maxX, s.head.x);
        e.minY = Math.min(e.minY, s.head.y); e.maxY = Math.max(e.maxY, s.head.y);
        for (const p of s.chain.positions) {
          e.lminX = Math.min(e.lminX, p.x); e.lmaxX = Math.max(e.lmaxX, p.x);
          e.lminY = Math.min(e.lminY, p.y); e.lmaxY = Math.max(e.lmaxY, p.y);
        }
      });
    });
    const headPos = () => g.evaluate(() => { const s = window.__game.scene.getScene('Game'); return [s.head.x, s.head.y]; });
    /** Hold direction keys, dashing every few frames, until `done(head)` or ~600 frames. */
    const hold = async (keys, done) => {
      for (const k of keys) await page.keyboard.down(k);
      for (let i = 0; i < 100; i++) {
        await tap(page, 'Space');
        await frames(page, 4);
        if (done(await headPos())) break;
      }
      for (const k of keys) await page.keyboard.up(k);
      return headPos();
    };
    const nearLeft = ([x]) => x - ARENA.left < 30;
    const nearRight = ([x]) => ARENA.right - x < 30;
    const nearTop = ([, y]) => y - ARENA.top < 30;
    const nearBottom = ([, y]) => ARENA.bottom - y < 30;
    let h = await hold(['a', 'w'], (p) => nearLeft(p) && nearTop(p)); // top-left corner, dashing into it
    assert.ok(nearLeft(h) && nearTop(h), `reached top-left corner: ${h}`);
    await hold(['a', 'w'], () => true); // keep dashing into the corner
    await hold(['d'], nearRight); // along the top wall
    h = await hold(['s', 'd'], (p) => nearRight(p) && nearBottom(p)); // bottom-right corner
    assert.ok(nearRight(h) && nearBottom(h), `reached bottom-right corner: ${h}`);
    await hold(['ArrowLeft', 'ArrowDown'], nearLeft); // along the bottom wall with arrows
    await hold(['ArrowUp', 'ArrowLeft'], nearTop);
    // Opposite keys cancel out.
    await page.keyboard.down('a'); await page.keyboard.down('d'); await page.keyboard.down('w'); await page.keyboard.down('s');
    await frames(page, 5);
    const v = await g.evaluate(() => { const s = window.__game.scene.getScene('Game'); return [s.head.body.velocity.x, s.head.body.velocity.y]; });
    for (const k of ['a', 'd', 'w', 's']) await page.keyboard.up(k);
    assert.deepEqual(v, [0, 0], 'opposite keys cancel');
    const e = await g.evaluate(() => window.__ext);
    const tol = 1;
    assert.ok(e.minX >= ARENA.left - tol && e.maxX <= ARENA.right + tol && e.minY >= ARENA.top - tol && e.maxY <= ARENA.bottom + tol, `head stayed in arena: ${JSON.stringify(e)}`);
    assert.ok(e.lminX >= ARENA.left - tol && e.lmaxX <= ARENA.right + tol && e.lminY >= ARENA.top - tol && e.lmaxY <= ARENA.bottom + tol, `links stayed in arena: ${JSON.stringify(e)}`);
  },
});

tests.push({
  name: 'clicking and right-clicking all over the canvas during gameplay is harmless',
  timeoutMs: 60000,
  fn: async ({ page, g }) => {
    await g.startRun({ seed: 13 });
    await g.godMode();
    const spots = [[640, 630], [790, 490], [490, 600], [790, 600], [229, 401], [640, 360], [10, 10], [1270, 710]];
    for (const xy of spots) {
      const [x, y] = await toPage(page, xy);
      await page.mouse.click(x, y);
      await page.mouse.click(x, y, { button: 'right' });
      await page.mouse.dblclick(x, y);
    }
    await frames(page, 10);
    assert.deepEqual(await g.activeScenes(), ['Game']);
    const s = await g.gameState();
    assert.equal(s.wave, 1);
    assert.ok(!s.ending && !s.dying);
  },
});

// ======================= Shop edge cases (regression guards) =======================

tests.push({
  name: 'shop: random keyboard+mouse spam on buy/keep/reroll never makes crumbs negative or breaks the loadout',
  timeoutMs: 90000,
  fn: async ({ page, g }) => {
    await g.openShop({ seed: 21, run: { wave: 4, crumbs: 60 } });
    await frames(page, 3);
    let seed = 7;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    for (let i = 0; i < 60; i++) {
      const r = rnd();
      if (r < 0.35) await page.keyboard.press(String(1 + Math.floor(rnd() * 4)));
      else if (r < 0.5) await page.keyboard.press('r');
      else if (r < 0.7) await click(page, SHOP.buy(Math.floor(rnd() * 4)));
      else if (r < 0.85) await click(page, SHOP.keep(Math.floor(rnd() * 4)));
      else await click(page, SHOP.reroll);
      if (i % 5 === 0) await frames(page, 1);
      const s = await shopState(g);
      assert.ok(s.active, 'still in the shop');
      assert.ok(Number.isInteger(s.crumbs) && s.crumbs >= 0, `crumbs ${s.crumbs}`);
      assert.ok(s.weapons.length >= 1 && s.weapons.length <= 6, 'links 1..6');
      assert.ok(s.weapons.every((w) => w.tier >= 1 && w.tier <= 4), 'tiers 1..4');
      assert.ok(s.locked.every((k) => s.offers[k]), 'only live offers are kept');
      const ids = s.offers.filter(Boolean).map((o) => `${o.type}:${o.id}`);
      assert.equal(new Set(ids).size, ids.length, 'no duplicate offers');
    }
  },
});

tests.push({
  name: 'shop: 6 links all tier IV — weapon offers cannot be bought by key or click, items still can',
  timeoutMs: 60000,
  fn: async ({ page, g }) => {
    const maxed = ['toothpick', 'mustard', 'pepper', 'skewer', 'pickle', 'onion'].map((id) => ({ id, tier: 4 }));
    // A maxed-out loadout is never offered weapons it can't buy (they'd be dead shop slots).
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      await g.openShop({ seed, run: { wave: 5, crumbs: 999, weapons: maxed.map((w) => ({ ...w })) } });
      const s = await shopState(g);
      assert.ok(s.offers.every((o) => o && o.type === 'item'), `seed ${seed}: offered an unbuyable weapon`);
    }
    // A weapon offer can still be on the table (e.g. kept from an earlier shop): it must not be buyable.
    await g.evaluate(() => {
      const sh = window.__game.scene.getScene('Shop');
      sh.offers[0] = { type: 'weapon', id: 'skewer', price: 20 };
      sh.render();
    });
    await frames(page, 3);
    const before = await shopState(g);
    for (let i = 0; i < 4; i++) { await page.keyboard.press(String(i + 1)); await click(page, SHOP.buy(i)); }
    await frames(page, 3);
    const after = await shopState(g);
    assert.deepEqual(after.weapons, maxed);
    const itemCost = before.offers.filter((o) => o.type === 'item').reduce((a, o) => a + o.price, 0);
    assert.equal(after.crumbs, 999 - itemCost);
    before.offers.forEach((o, i) => assert.equal(after.offers[i] === null, o.type === 'item', `card ${i}`));
  },
});

tests.push({
  name: 'shop: 0 crumbs buys nothing; exact crumbs buys; SOLD cards ignore 1-4; reroll needs crumbs',
  timeoutMs: 60000,
  fn: async ({ page, g }) => {
    await g.openShop({ seed: 31, run: { wave: 2, crumbs: 0 } });
    await frames(page, 3);
    for (const k of ['1', '2', '3', '4', 'r', 'R']) await page.keyboard.press(k);
    await click(page, SHOP.reroll);
    await frames(page, 3);
    let s = await shopState(g);
    assert.equal(s.crumbs, 0);
    assert.equal(s.rerolls, 0);
    assert.ok(s.offers.every(Boolean));
    const price = s.offers[1].price;
    await g.openShop({ seed: 31, run: { wave: 2, crumbs: price } });
    await frames(page, 3);
    await click(page, SHOP.buy(1));
    await frames(page, 3);
    s = await shopState(g);
    assert.equal(s.crumbs, 0, 'exact crumbs spent');
    assert.equal(s.offers[1], null, 'card 2 SOLD');
    const snapshot = JSON.stringify([s.items, s.weapons]);
    for (let i = 0; i < 5; i++) { await page.keyboard.press('2'); await click(page, SHOP.buy(1)); await click(page, SHOP.keep(1)); }
    await frames(page, 3);
    s = await shopState(g);
    assert.equal(JSON.stringify([s.items, s.weapons]), snapshot, 'SOLD card does nothing');
    assert.deepEqual(s.locked, [], 'cannot keep a SOLD card');
  },
});

tests.push({
  name: 'shop: Keep holds an offer through a reroll and into the next shop at its old price',
  timeoutMs: 90000,
  fn: async ({ page, g }) => {
    await waveClearToShop(g, { seed: 41, crumbs: 30 });
    await frames(page, 3);
    const s0 = await shopState(g);
    await click(page, SHOP.keep(2));
    await frames(page, 2);
    await page.keyboard.press('r');
    await frames(page, 3);
    const s1 = await shopState(g);
    assert.equal(s1.rerolls, 1);
    assert.deepEqual(s1.offers[0], s0.offers[2], 'kept offer survives the reroll (moved to slot 1)');
    assert.deepEqual(s1.locked, [0]);
    await page.keyboard.press('Enter');
    await g.waitForScene('Game', 30000);
    assert.equal(await gameWave(g), 2);
    await g.godMode();
    await g.fastForwardWave();
    await g.waitForScene('Shop', 40000);
    const s2 = await shopState(g);
    assert.equal(s2.wave, 2);
    assert.deepEqual(s2.offers[0], s0.offers[2], 'kept offer is in the next shop at the old price');
    assert.deepEqual(s2.locked, [0]);
    assert.equal(s2.rerolls, 0, 'reroll price resets per shop');
  },
});

// ======================= Every wave with fixed seeds =======================

for (let wave = 1; wave <= 10; wave++) {
  const seed = 1000 + wave * 7;
  tests.push({
    name: `wave ${wave} (seed ${seed}): spawns, kills, enemies stay in the arena, ${wave === 10 ? 'boss cannot be skipped by the timer' : 'wave can be cleared'}`,
    timeoutMs: 90000,
    fn: async ({ page, g }) => {
      await g.startRun({ seed, wave, weapons: STRONG.map((w) => ({ ...w })) });
      await g.godMode();
      await g.installBot();
      await g.evaluate(() => {
        const s = window.__game.scene.getScene('Game');
        window.__outside = 0;
        s.events.on('postupdate', () => {
          const a = s.arena;
          for (const e of s.enemyList()) {
            if (e.dead || !e.active) continue;
            // think() clamps to the arena; allow one frame of overshoot.
            if (e.x < a.left - 20 || e.x > a.right + 20 || e.y < a.top - 20 || e.y > a.bottom + 20) window.__outside++;
          }
        });
      });
      await waitFor(page, () => window.__game.scene.getScene('Game').run.kills >= 2, null, 60000);
      const s = await g.gameState();
      assert.equal(s.wave, wave);
      assert.ok(!s.dying && !s.ending);
      assert.equal(await g.evaluate(() => window.__outside), 0, 'no enemy left the arena');
      if (wave === 10) {
        await waitForBoss(page);
        await g.fastForwardWave();
        await frames(page, 60);
        const b = await g.gameState();
        assert.ok(!b.ending, 'boss wave must not end on the timer');
        assert.ok(b.bossHp > 0);
        assert.deepEqual(await g.activeScenes(), ['Game']);
      } else {
        await g.fastForwardWave();
        await g.waitForScene('Shop', 40000);
        const shop = await shopState(g);
        assert.equal(shop.wave, wave);
        assert.ok(shop.crumbs >= s.crumbs, 'crumbs on the floor are collected at wave end');
      }
      await g.removeBot();
    },
  });
}

// ======================= Known bugs =======================

tests.push({
  name: 'BUG shop: pressing Enter and Space together advances exactly one wave',
  timeoutMs: 90000,
  fn: async ({ page, g }) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      await g.openShop({ seed: 51 + attempt, run: { wave: 1 } });
      await frames(page, 3);
      await Promise.all([page.keyboard.press('Enter'), page.keyboard.press('Space')]);
      await g.waitForScene('Game', 30000);
      await frames(page, 3);
      assert.equal(await gameWave(g), 2, `attempt ${attempt}: skipped to wave ${await gameWave(g)}`);
    }
  },
});

tests.push({
  name: 'BUG shop: mashing Enter/Enter/Space in one frame cannot jump past several waves',
  timeoutMs: 90000,
  fn: async ({ page, g }) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      await g.openShop({ seed: 61 + attempt, run: { wave: 1 } });
      await frames(page, 3);
      await Promise.all([page.keyboard.press('Enter'), page.keyboard.press('Enter'), page.keyboard.press('Space')]);
      await g.waitForScene('Game', 30000);
      await frames(page, 3);
      assert.equal(await gameWave(g), 2, `attempt ${attempt}: jumped to wave ${await gameWave(g)}`);
    }
  },
});

tests.push({
  name: 'BUG shop: one R and one 4 pressed together reroll once and buy once',
  timeoutMs: 90000,
  fn: async ({ page, g }) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      await g.openShop({ seed: 71, run: { wave: 3, crumbs: 100 } });
      await frames(page, 3);
      const before = await shopState(g);
      await Promise.all([page.keyboard.press('r'), page.keyboard.press('4')]);
      await frames(page, 3);
      const after = await shopState(g);
      const bought = after.items.length + after.weapons.reduce((a, w) => a + w.tier, 0) - before.items.length - before.weapons.reduce((a, w) => a + w.tier, 0);
      assert.equal(after.rerolls, 1, `attempt ${attempt}: ${after.rerolls} rerolls`);
      assert.ok(bought <= 1, `attempt ${attempt}: ${bought} purchases from a single key press`);
    }
  },
});

tests.push({
  name: 'BUG shop: double-clicking "Next wave" (or click + Enter) advances exactly one wave',
  timeoutMs: 90000,
  fn: async ({ page, g }) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      await g.openShop({ seed: 81 + attempt, run: { wave: 1 } });
      await frames(page, 3);
      const [x, y] = await toPage(page, SHOP.next);
      if (attempt % 2 === 0) {
        await page.mouse.dblclick(x, y);
      } else {
        await page.mouse.move(x, y);
        await Promise.all([page.mouse.down(), page.keyboard.press('Enter')]);
        await page.mouse.up();
      }
      await g.waitForScene('Game', 30000);
      await frames(page, 3);
      assert.equal(await gameWave(g), 2, `attempt ${attempt}: skipped to wave ${await gameWave(g)}`);
    }
  },
});

tests.push({
  name: 'BUG shop: holding Space (dash) from the end of a wave does not skip the shop',
  timeoutMs: 90000,
  fn: async ({ page, g }) => {
    await g.startRun({ seed: 91 });
    await g.godMode();
    await page.keyboard.down('Space');
    await g.fastForwardWave();
    // Keep the key held; the OS sends auto-repeat keydowns about every 33ms.
    let sawShopAt = null;
    const t0 = Date.now();
    for (;;) {
      await page.keyboard.down('Space');
      await g.wait(33);
      const scenes = await g.activeScenes();
      if (scenes.includes('Shop') && sawShopAt === null) sawShopAt = Date.now();
      if (sawShopAt !== null && Date.now() - sawShopAt > 600) break;
      if (scenes.includes('Game') && (await gameWave(g)) > 1) break;
      if (Date.now() - t0 > 60000) break;
    }
    await page.keyboard.up('Space');
    await frames(page, 3);
    assert.deepEqual(await g.activeScenes(), ['Shop'], 'the shop must still be open');
    assert.equal((await shopState(g)).wave, 1);
  },
});

tests.push({
  name: 'BUG shop: dash-mashing Space through the wave-clear banner does not skip the shop',
  timeoutMs: 90000,
  fn: async ({ page, g }) => {
    await g.startRun({ seed: 92 });
    await g.godMode();
    await g.fastForwardWave();
    let sawShopFrame = null;
    for (let i = 0; i < 3000; i++) {
      await page.keyboard.press('Space'); // a player dashing every ~0.1s
      await g.wait(80);
      const scenes = await g.activeScenes();
      if (scenes.includes('Shop') && sawShopFrame === null) sawShopFrame = await g.evaluate(() => window.__game.loop.frame);
      if (sawShopFrame !== null && (await g.evaluate(() => window.__game.loop.frame)) - sawShopFrame > 12) break; // ~0.2s of shop
      if (scenes.includes('Game') && (await gameWave(g)) > 1) break;
    }
    await frames(page, 3);
    assert.deepEqual(await g.activeScenes(), ['Shop'], 'a dash press in the first moments of the shop must not leave it');
  },
});

tests.push({
  name: 'BUG shop: reroll with all four offers kept should not charge crumbs',
  timeoutMs: 60000,
  fn: async ({ page, g }) => {
    await g.openShop({ seed: 101, run: { wave: 3, crumbs: 50 } });
    await frames(page, 3);
    for (let i = 0; i < 4; i++) { await click(page, SHOP.keep(i)); await frames(page, 2); }
    const before = await shopState(g);
    assert.deepEqual(before.locked, [0, 1, 2, 3]);
    await page.keyboard.press('r');
    await frames(page, 3);
    const after = await shopState(g);
    assert.deepEqual(after.offers, before.offers, 'offers unchanged');
    assert.equal(after.crumbs, before.crumbs, `charged ${before.crumbs - after.crumbs} crumbs for a reroll that changed nothing`);
  },
});

tests.push({
  name: 'BUG pause: enemy attack timers, i-frames and dash cooldown are frozen while paused',
  timeoutMs: 90000,
  fn: async ({ page, g }) => {
    await g.startRun({ seed: 7, wave: 4 });
    await g.godMode();
    await g.installBot();
    await waitFor(page, () => window.__game.scene.getScene('Game').enemyList().filter((e) => !e.dead && e.def.kind === 'ketchup').length >= 2, null, 60000);
    await g.removeBot();
    // Count ketchup volleys fired in the very frame the game resumes.
    await g.evaluate(() => {
      const s = window.__game.scene.getScene('Game');
      window.__resumeShots = 0;
      window.__inResume = false;
      const toggle = s.togglePause.bind(s);
      s.togglePause = () => { toggle(); if (!s.paused) window.__inResume = true; };
      s.events.on('postupdate', () => { window.__inResume = false; });
      const spread = s.patterns.spread.bind(s.patterns);
      s.patterns.spread = (...a) => { if (window.__inResume) window.__resumeShots++; return spread(...a); };
    });
    await tap(page, 'Space'); // dashed: 1.5s cooldown
    await tap(page, 'Escape');
    await waitFor(page, () => window.__game.scene.getScene('Game').paused);
    const due = await g.evaluate(() => {
      const s = window.__game.scene.getScene('Game');
      s.head.markHit(); // the hit that made us pause: 750ms of i-frames
      return s.enemyList().filter((e) => !e.dead && e.def.kind === 'ketchup' && e.nextFireAt - s.time.now < 200).length;
    });
    await g.wait(2500); // a short pause
    await tap(page, 'Escape');
    await waitFor(page, () => !window.__game.scene.getScene('Game').paused);
    const st = await g.evaluate(() => { const s = window.__game.scene.getScene('Game'); return { invuln: s.head.invulnerable, dash: s.head.dashCharge(s.stats.dashCooldownMs), shots: window.__resumeShots }; });
    assert.ok(st.invuln, 'i-frames from the hit taken just before pausing should survive the pause');
    assert.ok(st.dash < 1, `dash should not recharge while paused (charge ${st.dash.toFixed(2)})`);
    assert.ok(st.shots <= due, `${st.shots} ketchup volleys fired the instant the game resumed (only ${due} were due)`);
  },
});

tests.push({
  name: 'BUG input: a quick Esc / Space tap (down+up within one frame) still pauses / dashes',
  timeoutMs: 60000,
  fn: async ({ page, g }) => {
    await g.startRun({ seed: 2 });
    await g.godMode();
    await frames(page, 5);
    // Both events reach the page before the next frame: a fast tap, a macro, or any tap at low fps.
    await Promise.all([page.keyboard.down('Space'), page.keyboard.up('Space')]);
    await frames(page, 3);
    const dash = await g.evaluate(() => { const s = window.__game.scene.getScene('Game'); return s.head.dashCharge(s.stats.dashCooldownMs); });
    await Promise.all([page.keyboard.down('Escape'), page.keyboard.up('Escape')]);
    await frames(page, 3);
    const paused = await g.evaluate(() => window.__game.scene.getScene('Game').paused);
    assert.ok(dash < 1, 'the Space tap should have dashed');
    assert.ok(paused, 'the Esc tap should have paused');
  },
});

tests.push({
  name: 'BUG end of run: a charred sausage cannot also "escape" when an in-flight bullet kills the boss',
  timeoutMs: 90000,
  fn: async ({ page, g }) => {
    await g.startRun({ seed: 111, wave: 10, heat: 50 });
    await waitForBoss(page);
    await g.evaluate(() => {
      const s = window.__game.scene.getScene('Game');
      window.__banners = new Set();
      s.events.on('postupdate', () => { for (const o of s.children.list) if (o.type === 'Text' && /ESCAPED|CHARRED!/.test(o.text)) window.__banners.add(o.text); });
      s.boss.hp = 1;
      // A toothpick is already flying at the boss…
      const b = s.playerBullets.get(s.boss.x, s.boss.y + 70);
      b.fire({ x: s.boss.x, y: s.boss.y + 70, angle: -Math.PI / 2, speed: 640, damage: 10, texture: 'pb-toothpick', lifetimeMs: 3000 }, s.time.now);
      // …when the sausage chars.
      s.takeHeat(500);
    });
    await waitFor(page, () => window.__game.scene.isActive('GameOver') || window.__game.scene.isActive('Victory'), null, 60000);
    const banners = await g.evaluate(() => [...window.__banners]);
    assert.ok(!(banners.includes('CHARRED!') && banners.includes('YOU ESCAPED THE BBQ!')), `contradicting banners: ${banners.join(' + ')}`);
  },
});

tests.push({
  name: 'BUG end screen: clicking "Main menu" while pressing Enter starts only one scene',
  timeoutMs: 90000,
  fn: async ({ page, g }) => {
    await g.startRun({ seed: 121 });
    await g.evaluate(() => window.__game.scene.getScene('Game').takeHeat(500));
    await g.waitForScene('GameOver', 40000);
    await frames(page, 3);
    const [x, y] = await toPage(page, END.menu);
    await page.mouse.move(x, y);
    await Promise.all([page.mouse.down(), page.keyboard.press('Enter')]);
    await page.mouse.up();
    await frames(page, 10);
    const scenes = await g.activeScenes();
    assert.equal(scenes.length, 1, `active scenes: ${scenes.join(', ')}`);
  },
});

tests.push({
  name: 'BUG layout: canvas is centred in a wide (non-16:9) window',
  viewport: { width: 2000, height: 600 },
  timeoutMs: 60000,
  fn: async ({ g }) => {
    const r = await g.evaluate(() => ({ ...window.__game.canvas.getBoundingClientRect().toJSON(), vw: innerWidth, vh: innerHeight }));
    const leftGap = r.left;
    const rightGap = r.vw - r.right;
    assert.ok(Math.abs(leftGap - rightGap) <= 2, `left gap ${leftGap.toFixed(0)}px vs right gap ${rightGap.toFixed(0)}px`);
  },
});

module.exports = { tests };
