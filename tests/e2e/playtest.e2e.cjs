/**
 * Fixes from playtest notes (Nov 2026): shop sell-out and flashes, condiments at full HP, auto-aim priority.
 */
const { assert } = require('./harness.cjs');

const shopState = (g) => g.evaluate(() => {
  const s = window.__game.scene.getScene('Shop');
  return { offers: s.offers.map((o) => o && { id: o.id, price: o.price }), crumbs: s.run.crumbs, rerolls: s.rerollsDone, flashing: s.cameras.main.flashEffect.isRunning };
});

module.exports = {
  tests: [
    {
      name: 'buying every offer restocks the shop for free, without a screen flash',
      fn: async ({ page, g }) => {
        await g.openShop({ run: { crumbs: 9999, wave: 3 } });
        await g.wait(500);
        const start = await shopState(g);
        const total = start.offers.reduce((n, o) => n + o.price, 0);
        for (const key of ['1', '2', '3', '4']) {
          await page.keyboard.press(key);
          await g.wait(60);
          assert.equal((await shopState(g)).flashing, false, 'buying flashes the screen');
        }
        await g.wait(300);
        const end = await shopState(g);
        assert.equal(end.offers.filter(Boolean).length, 4, 'shop did not restock after selling out');
        assert.equal(end.crumbs, start.crumbs - total, 'the restock cost crumbs');
        const price = await g.evaluate(() => { const s = window.__game.scene.getScene('Shop'); return [s.run.rerollCount, s.rerollPrice()]; });
        assert.equal(price[0], 0, 'the restock raised the reroll price');
      },
    },
    {
      name: 'condiments stay on the floor at full HP and are picked up once hurt',
      fn: async ({ g }) => {
        await g.startRun({ seed: 7 });
        await g.godMode();
        const pin = () => g.evaluate(() => {
          const s = window.__game.scene.getScene('Game');
          const mine = s.pickups.drops.find((d) => d.img === window.__testCondiment);
          if (mine) mine.img.setPosition(s.head.x, s.head.y);
          return { hp: s.health.hp, max: s.health.maxHp, condiments: mine ? 1 : 0 };
        });
        await g.evaluate(() => {
          const s = window.__game.scene.getScene('Game');
          s.health.regenPerSec = 0;
          s.pickups.spawnCondiment(s.head.x, s.head.y);
          window.__testCondiment = s.pickups.drops[s.pickups.drops.length - 1].img;
        });
        for (let i = 0; i < 10; i++) { await pin(); await g.waitGameMs(40); }
        let st = await pin();
        assert.equal(st.hp, st.max);
        assert.equal(st.condiments, 1, 'condiment was eaten at full HP');
        await g.evaluate(() => { const s = window.__game.scene.getScene('Game'); s.health.hp = s.health.maxHp - 10; });
        for (let i = 0; i < 10 && st.condiments; i++) { await g.waitGameMs(40); st = await pin(); }
        assert.equal(st.condiments, 0, 'condiment not picked up when hurt');
        assert.ok(st.hp > st.max - 10, 'condiment did not heal');
        await g.evaluate(() => { delete window.__testCondiment; });
      },
    },
    {
      name: 'auto-aim shoots bosses, elites and the loot goblin first, then the closest',
      fn: async ({ g }) => {
        await g.startRun({ seed: 7 });
        const r = await g.evaluate(async () => {
          const { nearest } = await import('/src/systems/WeaponSystem.ts');
          const s = window.__game.scene.getScene('Game');
          const x = 640;
          const y = 360;
          const spawn = (kind, dx, elite) => s.spawnEnemy(kind, x + dx, y, elite);
          const fork = spawn('fork', 60);
          const farFork = spawn('fork', -90);
          const elite = spawn('spatula', 200, { hpMult: 3, scale: 1.4 });
          const goblin = spawn('goblin', 150);
          const outOfRange = spawn('goblin', 600);
          const name = (e) => (e === fork ? 'fork' : e === farFork ? 'farFork' : e === elite ? 'elite' : e === goblin ? 'goblin' : e === outOfRange ? 'outOfRange' : String(e));
          const pick = (list) => name(nearest(list, x, y, 300));
          return {
            all: pick([fork, farFork, elite, goblin, outOfRange]),
            eliteVsFork: pick([fork, elite]),
            onlyFar: pick([fork, farFork, outOfRange]),
          };
        });
        assert.equal(r.all, 'goblin', 'closest priority target in range');
        assert.equal(r.eliteVsFork, 'elite');
        assert.equal(r.onlyFar, 'fork', 'out-of-range priority targets are ignored');
      },
    },
  ],
};
