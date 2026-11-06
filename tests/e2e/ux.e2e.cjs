/**
 * UX / readability / accessibility checks (UI layout, contrast, input safety, pause behaviour).
 *
 * Every check here is objective: positions, overlaps, measured pixel contrast, scene state.
 * Tests marked `knownBug` reproduce an open UX bug and are expected to fail until it is fixed.
 */
const { assert } = require('./harness.cjs');

const GAME_W = 1280;
const GAME_H = 720;

// ---------------------------------------------------------------------------
// Local helpers (kept here so the shared harness stays untouched).

/** World-space bounds of every visible Text in a scene (including texts inside containers). */
function textBounds(page, sceneKey, filter = {}) {
  return page.evaluate(([key, f]) => {
    const s = window.__game.scene.getScene(key);
    const out = [];
    const walk = (list) => {
      for (const o of list) {
        if (!o.visible || o.alpha === 0) continue;
        if (o.type === 'Text' && o.text.trim()) {
          if (f.minDepth !== undefined && o.depth < f.minDepth) continue;
          if (f.maxDepth !== undefined && o.depth > f.maxDepth) continue;
          const b = o.getBounds();
          out.push({ text: o.text.replace(/\n/g, ' / ').slice(0, 60), x: b.x, y: b.y, w: b.width, h: b.height, size: parseFloat(o.style.fontSize), color: o.style.color, depth: o.depth });
        }
        if (o.list) walk(o.list);
      }
    };
    walk(s.children.list);
    return out;
  }, [sceneKey, filter]);
}

/** Bounds of every interactive Button container (anything with a `label` Text child). */
function buttonBounds(page, sceneKey) {
  return page.evaluate((key) => {
    const s = window.__game.scene.getScene(key);
    return s.children.list
      .filter((o) => o.type === 'Container' && o.label && o.input)
      .map((o) => {
        const b = o.getBounds();
        return { text: o.label.text, x: b.x, y: b.y, w: b.width, h: b.height };
      });
  }, sceneKey);
}

function overlaps(a, b, tol = 1) {
  // Text bounds include ascent/descent padding; `tol` ignores sub-glyph slivers of overlap.
  return a.x + tol < b.x + b.w && b.x + tol < a.x + a.w && a.y + tol < b.y + b.h && b.y + tol < a.y + a.h;
}

function insideCanvas(r, tol = 0.5) {
  return r.x >= -tol && r.y >= -tol && r.x + r.w <= GAME_W + tol && r.y + r.h <= GAME_H + tol;
}

function assertNoOverlaps(rects, what) {
  const bad = [];
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      if (overlaps(rects[i], rects[j], 4)) bad.push(`"${rects[i].text}" ↔ "${rects[j].text}"`);
    }
  }
  assert.deepEqual(bad, [], `${what} overlap:\n  ${bad.join('\n  ')}`);
}

function assertAllInside(rects, what) {
  const bad = rects.filter((r) => !insideCanvas(r)).map((r) => `"${r.text}" @ ${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.w)}x${Math.round(r.h)}`);
  assert.deepEqual(bad, [], `${what} outside the 1280x720 canvas:\n  ${bad.join('\n  ')}`);
}

/** RGB of one rendered pixel, in game coordinates (works for WebGL and Canvas renderers). */
function pixel(page, x, y) {
  return page.evaluate(([px, py]) => new Promise((resolve) => {
    window.__game.renderer.snapshotPixel(px, py, (c) => resolve([c.r, c.g, c.b]));
  }), [x, y]);
}

function luminance([r, g, b]) {
  const lin = (v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function cssToRgb(css) {
  const m = /^#?([0-9a-f]{6})$/i.exec(css.trim());
  if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  const r = /rgba?\((\d+),\s*(\d+),\s*(\d+)/i.exec(css);
  if (r) return [+r[1], +r[2], +r[3]];
  throw new Error(`unparsed colour ${css}`);
}

/** Wait until `fn` (run in the page) returns truthy. */
function until(page, fn, arg, timeout = 15000) {
  return page.waitForFunction(fn, arg, { timeout, polling: 50 });
}

/** Freeze the wave in place: no spawns, no damage, no regen; optionally pin HP. */
function freezeWave(g, hp) {
  return g.evaluate((h) => {
    const s = window.__game.scene.getScene('Game');
    s.director.stop();
    s.invincible = true;
    s.health.regenPerSec = 0;
    if (h !== undefined) s.health.hp = h;
  }, hp);
}

async function canvasRect(page) {
  return page.evaluate(() => {
    const c = document.querySelector('canvas').getBoundingClientRect();
    return { x: c.x, y: c.y, w: c.width, h: c.height, vw: window.innerWidth, vh: window.innerHeight,
      sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight };
  });
}

async function resizeTo(page, width, height) {
  await page.setViewportSize({ width, height });
  // Phaser's ScaleManager reacts to window resize on its next step.
  await page.waitForFunction(([w, h]) => {
    const c = document.querySelector('canvas').getBoundingClientRect();
    return Math.abs(c.width - w) < 1.5 || Math.abs(c.height - h) < 1.5;
  }, [width, height], { timeout: 5000, polling: 50 });
}

const W = (ids) => ids.map((id) => (typeof id === 'string' ? { id, tier: 1 } : id));
const MANY_ITEMS = ['paprika', 'paprika', 'paprika', 'espresso_mustard', 'espresso_mustard', 'sesame', 'casing', 'casing',
  'cold_cuts', 'cold_cuts', 'ketchup_kiss', 'big_bun', 'big_bun', 'relish', 'four_leaf_relish', 'golden_sausage', 'oven_mitt', 'oven_mitt'];
const FULL_LINKS = W([{ id: 'toothpick', tier: 4 }, { id: 'mustard', tier: 4 }, { id: 'pepper', tier: 4 }, { id: 'skewer', tier: 4 }, { id: 'pickle', tier: 4 }, { id: 'onion', tier: 4 }]);

/** Put specific offers in the shop and redraw it (worst-case text lengths). */
function setOffers(g, offers, locked = []) {
  return g.evaluate(([o, l]) => {
    const s = window.__game.scene.getScene('Shop');
    s.offers = o;
    s.locked = new Set(l);
    s.render();
  }, [offers, locked]);
}

const LONG_OFFERS = [
  // Longest descriptions, most stat lines, synergy hint, an upgrade and a new link.
  { type: 'item', id: 'golden_sausage', price: 120 },
  { type: 'weapon', id: 'onion', price: 21 },
  { type: 'item', id: 'pickle_juice', price: 23 },
  { type: 'item', id: 'second_skin', price: 18 },
];

async function checkShopLayout(page, label) {
  const texts = await textBounds(page, 'Shop');
  const buttons = await buttonBounds(page, 'Shop');
  assertAllInside(texts, `${label}: shop text`);
  assertAllInside(buttons, `${label}: shop buttons`);
  // Button labels sit on their buttons by design; check them against each other, not against their own button.
  const free = texts.filter((t) => !buttons.some((b) => b.text.replace(/\n/g, ' / ').slice(0, 60) === t.text));
  assertNoOverlaps(free, `${label}: shop text`);
  assertNoOverlaps(buttons, `${label}: shop buttons`);
  for (const t of free) {
    for (const b of buttons) {
      assert.ok(!overlaps(t, b), `${label}: text "${t.text}" is covered by button "${b.text}"`);
    }
  }
}

// ---------------------------------------------------------------------------

module.exports = {
  tests: [
    // ----- Layout & scaling ---------------------------------------------------
    {
      name: 'ux: canvas scales to fit phone, tablet, landscape and ultrawide viewports without page scrollbars',
      fn: async ({ page }) => {
        for (const [w, h] of [[390, 844], [768, 1024], [844, 390], [2560, 1080], [1366, 768], [1280, 720]]) {
          await resizeTo(page, w, h);
          const r = await canvasRect(page);
          assert.ok(r.sw <= r.vw && r.sh <= r.vh, `${w}x${h}: page scrolls (${r.sw}x${r.sh})`);
          assert.ok(r.x >= -0.5 && r.y >= -0.5 && r.x + r.w <= r.vw + 0.5 && r.y + r.h <= r.vh + 0.5, `${w}x${h}: canvas leaves the viewport ${JSON.stringify(r)}`);
          assert.ok(Math.abs(r.w / r.h - GAME_W / GAME_H) < 0.01, `${w}x${h}: aspect ratio changed`);
          assert.ok(Math.abs(r.w - w) < 1.5 || Math.abs(r.h - h) < 1.5, `${w}x${h}: canvas does not fill either dimension`);
        }
      },
    },
    {
      name: 'ux: canvas is centred in the viewport (phone portrait and ultrawide)',
      fn: async ({ page }) => {
        for (const [w, h] of [[390, 844], [2560, 1080], [1920, 1200]]) {
          await resizeTo(page, w, h);
          const r = await canvasRect(page);
          const ex = (r.vw - r.w) / 2;
          const ey = (r.vh - r.h) / 2;
          assert.ok(Math.abs(r.x - ex) <= 1 && Math.abs(r.y - ey) <= 1,
            `${w}x${h}: canvas at (${r.x.toFixed(0)}, ${r.y.toFixed(0)}), centred would be (${ex.toFixed(0)}, ${ey.toFixed(0)})`);
        }
      },
    },
    {
      name: 'ux: HUD text stays at least 9 CSS px tall on a phone in portrait',
      knownBug: 'no responsive layout: at 390x844 the 1280x720 canvas is scaled to 0.30x, so 12px HUD labels render ~3.7px',
      viewport: { width: 390, height: 844 },
      fn: async ({ page, g }) => {
        await g.startRun({ seed: 1 });
        await freezeWave(g);
        const r = await canvasRect(page);
        const scale = r.w / GAME_W;
        const hud = await textBounds(page, 'Game', { minDepth: 51, maxDepth: 51 });
        const smallest = Math.min(...hud.map((t) => t.size));
        assert.ok(smallest * scale >= 9, `smallest HUD text is ${smallest}px × ${scale.toFixed(3)} = ${(smallest * scale).toFixed(1)} CSS px`);
      },
    },

    // ----- Text placement on every screen --------------------------------------
    {
      name: 'ux: menu text and START button are inside the canvas and do not overlap',
      fn: async ({ page }) => {
        const texts = await textBounds(page, 'Menu');
        const buttons = await buttonBounds(page, 'Menu');
        assert.ok(texts.length >= 3, 'expected title, subtitle and help text');
        assert.equal(buttons.length, 3, 'Settings, START and Fullscreen');
        assertAllInside([...texts, ...buttons], 'menu');
        const free = texts.filter((t) => !buttons.some((b) => b.text === t.text));
        assertNoOverlaps([...free, ...buttons], 'menu');
      },
    },
    {
      name: 'ux: HUD text (normal wave and boss wave) is inside the canvas, inside the HUD strip and non-overlapping',
      fn: async ({ page, g }) => {
        await g.startRun({ seed: 1, crumbs: 9999 });
        await freezeWave(g, 7);
        await g.wait(300);
        let hud = await textBounds(page, 'Game', { minDepth: 51, maxDepth: 51 });
        assert.ok(hud.length >= 4, `expected ≥4 HUD texts, got ${hud.length}`);
        assertAllInside(hud, 'HUD');
        assertNoOverlaps(hud, 'HUD');
        for (const t of hud) assert.ok(t.y + t.h <= 64 + 1, `HUD text "${t.text}" spills below the 64px HUD strip`);

        await g.startRun({ seed: 1, wave: 10, crumbs: 999 });
        await g.godMode();
        await until(page, () => !!window.__game.scene.getScene('Game').boss);
        await g.wait(200);
        hud = await textBounds(page, 'Game', { minDepth: 51, maxDepth: 51 });
        assertAllInside(hud, 'boss HUD');
        assertNoOverlaps(hud, 'boss HUD');
      },
    },
    {
      name: 'ux: boss health bar and name do not cover the playable arena',
      fn: async ({ page, g }) => {
        await g.startRun({ seed: 1, wave: 10 });
        await g.godMode();
        await until(page, () => !!window.__game.scene.getScene('Game').boss);
        await g.wait(200);
        const r = await g.evaluate(() => {
          const s = window.__game.scene.getScene('Game');
          const n = s.hud.bossName.getBounds();
          return {
            arena: { x: s.arena.x, y: s.arena.y, w: s.arena.width, h: s.arena.height },
            name: { text: 'boss name', x: n.x, y: n.y, w: n.width, h: n.height },
            bar: { text: 'boss bar', ...s.hud.bossBarBounds },
          };
        });
        const bar = r.bar;
        assert.ok(!overlaps(r.name, r.arena), `boss name ${JSON.stringify(r.name)} overlaps arena ${JSON.stringify(r.arena)}`);
        assert.ok(!overlaps(bar, r.arena), `boss bar ${JSON.stringify(bar)} overlaps arena ${JSON.stringify(r.arena)}`);
      },
    },
    {
      name: 'ux: shop layout holds up (affordable, broke, kept + SOLD, full links + 18 items, longest descriptions)',
      fn: async ({ page, g }) => {
        await g.openShop({ seed: 11, run: { wave: 3, crumbs: 40, weapons: W(['toothpick', 'mustard']), items: ['paprika'] } });
        await checkShopLayout(page, 'affordable');

        await g.openShop({ seed: 11, run: { wave: 3, crumbs: 0 } });
        await checkShopLayout(page, 'broke');

        await g.openShop({ seed: 11, run: { wave: 3, crumbs: 60, weapons: W(['toothpick', 'mustard']) } });
        await g.evaluate(() => { const s = window.__game.scene.getScene('Shop'); s.toggleLock(1); s.buy(0); });
        await checkShopLayout(page, 'kept+sold');

        await g.openShop({ seed: 21, run: { wave: 8, crumbs: 3, weapons: FULL_LINKS, items: MANY_ITEMS } });
        await setOffers(g, LONG_OFFERS, [2]);
        await checkShopLayout(page, 'full links, many items, long descriptions, unaffordable');

        // The owned-items list must stay clear of the key hint at the bottom.
        const texts = await textBounds(page, 'Shop');
        const items = texts.find((t) => t.text.startsWith('Paprika'));
        const hint = texts.find((t) => t.text.startsWith('1-4 buy'));
        assert.ok(items && hint, 'items list and key hint present');
        assert.ok(items.y + items.h <= hint.y, `items list (bottom ${items.y + items.h}) runs into the hint (top ${hint.y})`);
      },
    },
    {
      name: 'ux: Game Over and Victory text and buttons are inside the canvas and do not overlap',
      fn: async ({ page, g }) => {
        for (const key of ['GameOver', 'Victory']) {
          await g.evaluate((k) => {
            const game = window.__game;
            const run = window.__debug.newRun(5);
            Object.assign(run, { wave: 10, kills: 12345, crumbsEarned: 9999, timeSurvivedSec: 3599 });
            for (const s of game.scene.getScenes(true)) game.scene.stop(s.scene.key);
            game.scene.start(k, { run });
          }, key);
          await g.waitForScene(key);
          await g.wait(100);
          const texts = await textBounds(page, key);
          const buttons = await buttonBounds(page, key);
          assert.equal(buttons.length, 2, `${key}: expected two buttons`);
          assertAllInside([...texts, ...buttons], key);
          const free = texts.filter((t) => !buttons.some((b) => b.text === t.text));
          assertNoOverlaps([...free, ...buttons], key);
        }
      },
    },

    // ----- Pause --------------------------------------------------------------
    {
      name: 'ux: Esc shows a visible pause overlay and freezes the wave; Esc again resumes',
      fn: async ({ page, g }) => {
        await g.startRun({ seed: 2 });
        await g.godMode();
        await g.wait(400);
        await page.keyboard.press('Escape');
        await until(page, () => window.__game.scene.getScene('Game').paused);
        const overlay = await g.evaluate(() => {
          const t = window.__game.scene.getScene('Game').pauseMenu.title;
          const b = t.getBounds();
          return { text: t.text, visible: t.visible && t.alpha > 0, depth: t.depth, x: b.x, y: b.y, w: b.width, h: b.height };
        });
        assert.ok(overlay.visible && /PAUSED/.test(overlay.text), 'pause text visible');
        assert.ok(insideCanvas(overlay), 'pause text inside canvas');
        assert.ok(overlay.depth > 51, 'pause text above the HUD');
        const t0 = (await g.gameState()).elapsedSec;
        await g.wait(600);
        const t1 = (await g.gameState()).elapsedSec;
        assert.equal(t1, t0, 'wave timer must not advance while paused');
        await page.keyboard.press('Escape');
        await until(page, () => !window.__game.scene.getScene('Game').paused);
        await until(page, (t) => window.__game.scene.getScene('Game').director.elapsedMs / 1000 > t, t1);
      },
    },
    {
      name: 'ux: game auto-pauses when the window loses focus',
      fn: async ({ page, g }) => {
        await g.startRun({ seed: 2 });
        await g.wait(300);
        await page.evaluate(() => window.dispatchEvent(new Event('blur')));
        await g.wait(100);
        const t0 = (await g.gameState()).elapsedSec;
        await g.wait(700);
        const s = await g.evaluate(() => ({ paused: window.__game.scene.getScene('Game').paused, t: window.__game.scene.getScene('Game').director.elapsedMs / 1000 }));
        assert.ok(s.paused || s.t === t0, `still running after blur: elapsed ${t0.toFixed(2)}s → ${s.t.toFixed(2)}s, paused=${s.paused}`);
      },
    },
    {
      name: 'ux: returning to a hidden tab shows the pause overlay instead of resuming mid-fight',
      fn: async ({ page, g }) => {
        await g.startRun({ seed: 2 });
        await g.wait(300);
        const setHidden = (hidden) => page.evaluate((h) => {
          Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
          Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') });
          document.dispatchEvent(new Event('visibilitychange'));
        }, hidden);
        await setHidden(true);
        await g.wait(300);
        await setHidden(false);
        await g.wait(300);
        const paused = await g.evaluate(() => window.__game.scene.getScene('Game').paused);
        assert.ok(paused, 'Game scene is not paused after the tab became visible again');
      },
    },

    // ----- Input safety -------------------------------------------------------
    {
      name: 'ux: Space (the dash key) does not instantly leave the shop',
      fn: async ({ page, g }) => {
        await g.openShop({ seed: 3, run: { wave: 2, crumbs: 30 } });
        await page.keyboard.press('Space');
        await g.wait(300);
        assert.deepEqual(await g.activeScenes(), ['Shop'], 'a single Space press right after opening left the shop');
      },
    },
    {
      name: 'ux: disabled shop buttons do not show the hand cursor',
      fn: async ({ page, g }) => {
        await g.openShop({ seed: 11, run: { wave: 3, crumbs: 0 } });
        const b = (await buttonBounds(page, 'Shop')).find((x) => /^1\s+Buy/.test(x.text));
        assert.ok(b, 'first Buy button exists');
        const box = await page.locator('canvas').boundingBox();
        const k = box.width / GAME_W;
        await page.mouse.move(box.x + (b.x + b.w / 2) * k, box.y + (b.y + b.h / 2) * k);
        await g.wait(150);
        const cursor = await page.evaluate(() => document.querySelector('canvas').style.cursor);
        assert.notEqual(cursor, 'pointer', 'disabled Buy button shows the pointer cursor');
      },
    },
    {
      name: 'ux: shop buttons give hover feedback',
      fn: async ({ page, g }) => {
        await g.openShop({ seed: 11, run: { wave: 3, crumbs: 99 } });
        const b = (await buttonBounds(page, 'Shop')).find((x) => /Next wave/.test(x.text));
        const box = await page.locator('canvas').boundingBox();
        const k = box.width / GAME_W;
        const cx = Math.round(b.x + b.w / 2);
        const cy = Math.round(b.y + 8);
        const before = await pixel(page, cx, cy);
        await page.mouse.move(box.x + cx * k, box.y + cy * k);
        await g.wait(200);
        const after = await pixel(page, cx, cy);
        assert.notDeepEqual(after, before, 'button colour unchanged on hover');
      },
    },

    // ----- Contrast (measured from rendered pixels) -----------------------------
    {
      name: 'ux: HUD text meets WCAG AA contrast (4.5:1) against the HUD panel',
      fn: async ({ page, g }) => {
        await g.startRun({ seed: 1 });
        await freezeWave(g, 70);
        await g.wait(200);
        const bg = await pixel(page, 960, 56);
        const hud = await textBounds(page, 'Game', { minDepth: 51, maxDepth: 51 });
        const bad = hud.map((t) => ({ t: t.text, c: contrast(cssToRgb(t.color), bg) })).filter((x) => x.c < 4.5);
        assert.deepEqual(bad, [], `low-contrast HUD text vs ${bg}: ${JSON.stringify(bad)}`);
      },
    },
    {
      name: 'ux: shop key-hint line meets WCAG AA contrast (4.5:1)',
      fn: async ({ page, g }) => {
        await g.openShop({ seed: 11, run: { wave: 3, crumbs: 10 } });
        const hint = (await textBounds(page, 'Shop')).find((t) => t.text.startsWith('1-4 buy'));
        const samples = [];
        for (const x of [20, 60, 1220, 1260]) samples.push(await pixel(page, x, Math.round(hint.y + hint.h / 2)));
        const worst = Math.min(...samples.map((bg) => contrast(cssToRgb(hint.color), bg)));
        assert.ok(worst >= 4.5, `hint contrast ${worst.toFixed(2)}:1`);
      },
    },
    {
      name: 'ux: HP bar fill stands out from its empty track (≥3:1) at high, mid and low HP',
      fn: async ({ page, g }) => {
        await g.startRun({ seed: 1 });
        for (const hp of [75, 45, 15]) {
          await freezeWave(g, hp);
          await g.wait(150);
          // Sample the fill away from the centred "HP / max" label.
          const fill = await pixel(page, 20 + Math.round((hp / 100) * 340 / 4), 34);
          const empty = await pixel(page, 352, 34);
          const c = contrast(fill, empty);
          assert.ok(c >= 3, `hp ${hp}: fill ${fill} vs empty ${empty} = ${c.toFixed(2)}:1`);
        }
      },
    },
    {
      name: 'ux: HP bar stays visible at low HP (the most dangerous state), even while it pulses',
      fn: async ({ page, g }) => {
        await g.startRun({ seed: 1 });
        await freezeWave(g, 12);
        let worst = Infinity;
        for (let i = 0; i < 4; i++) {
          await g.wait(110);
          const fill = await pixel(page, 26, 34);
          const empty = await pixel(page, 355, 34);
          worst = Math.min(worst, contrast(fill, empty));
        }
        assert.ok(worst >= 3, `low-HP bar fill vs empty track: ${worst.toFixed(2)}:1`);
      },
    },
    {
      name: 'ux: the sausage head stays visible against the grill',
      fn: async ({ page, g }) => {
        await g.startRun({ seed: 1 });
        await freezeWave(g, 10);
        await g.wait(300);
        const probe = await g.evaluate(() => {
          const s = window.__game.scene.getScene('Game');
          s.sizzle.setVisible(false);
          // A point on the head's casing (behind the eyes, off the hitbox dot), in world space.
          const a = s.head.rotation;
          const lx = -12;
          const ly = 6;
          return { x: Math.round(s.head.x + lx * Math.cos(a) - ly * Math.sin(a)), y: Math.round(s.head.y + lx * Math.sin(a) + ly * Math.cos(a)) };
        });
        const head = await pixel(page, probe.x, probe.y);
        await g.evaluate(() => {
          const s = window.__game.scene.getScene('Game');
          s.head.setVisible(false);
          s.head.dot.setVisible(false);
          for (const v of s.chain.views) { v.body.setVisible(false); v.icon.setVisible(false); v.label.setVisible(false); }
        });
        await g.wait(150);
        const bg = await pixel(page, probe.x, probe.y);
        const c = contrast(head, bg);
        assert.ok(c >= 3, `head ${head} vs background ${bg}: ${c.toFixed(2)}:1`);
      },
    },
  ],
};
