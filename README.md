# Wurst Case Scenario 🌭

A roguelite bullet-hell where you play a sausage escaping a backyard BBQ.
Survive 10 waves of angry utensils and condiments, spend crumbs between waves, and beat **The Grill Master's Tongs**.

## How to play
| Key | Action |
|---|---|
| WASD / Arrow keys | Move |
| Space / Shift | Dash (short invulnerability) |
| Esc / P | Pause |
| 1–4, R, Enter | Shop: buy, reroll, next wave |

**Sausage Links.** Each weapon rides on its own link trailing behind your head, and they fire on their own at the nearest enemy.
Buying a new weapon adds a link (max 6). Buying one you already own upgrades it (tiers I–IV).
Only your **head** can be hit; the white dot is your hitbox. Melee enemies bounce off your links.

**Doneness replaces health.** Hits and standing on red-hot grill tiles add heat. You cool down slowly over time,
and blue condiment packets cool you instantly. Running hot is risky but powerful:

| Heat | State | Effect |
|---|---|---|
| 0–24 | Raw | 0.85× damage |
| 25–59 | Medium | 1.0× |
| 60–89 | Well-done | 1.3× damage, +20% fire rate |
| 90–99 | Burnt | 1.5× damage, +20% fire rate |
| 100 | Charred | Game over |

Heat is halved between waves. Grill tiles let you deliberately heat up for more damage.

## Running it
Requires Node 20+.
```bash
npm install
npm run dev        # play at http://localhost:5173
npm test           # unit tests for the game logic
npm run build      # production build into dist/ (static files; host anywhere)
```

## Testing
```bash
npm test                                   # Vitest: game logic, economy, balance invariants (~1s)
npm run e2e                                # browser tests in headless Chromium (~15 min for all)
npm run e2e -- tests/e2e/smoke.e2e.cjs     # one file
npm run e2e -- --grep shop                 # tests whose name matches
```
Browser tests live in `tests/e2e/*.e2e.cjs` and use the helpers in `tests/e2e/harness.cjs`
(start a run at any wave, god mode, a kiting bot, frame timing, heap). Each test fails on any
uncaught page error. A test marked `knownBug: '...'` reproduces an open bug and is expected to
fail; when the bug is fixed the runner flags it so the marker can be removed.

| File | Covers |
|---|---|
| `smoke` | menu → waves → shop → boss → victory / game over |
| `review` | lifecycle and logic bugs found in code review (pause, timers, death/win races, HUD) |
| `adversarial` | key mashing through transitions, pause abuse, shop abuse, resizing, every wave |
| `stress` | full bullet pools, max enemies, 100+ scene cycles for leaks, frame cost per wave, lag spikes |
| `balance` | economy, boss time-to-kill, weapon/item rules |
| `ux` | layout at phone/tablet/ultrawide sizes, contrast, pause/blur behaviour |

### Timing rule
All gameplay timing uses the Game scene's own clock (`gameTime`), which only advances on
unpaused frames by the same capped delta physics uses. Never use `scene.time.now` for gameplay:
it follows the wall clock and keeps running while paused.

## Project layout
```
src/
  main.ts            Phaser config and scene list
  scenes/            Boot, Menu, Game, Shop, GameOver, Victory
  entities/          SausageHead, LinkChain, Enemy, BulletPool, Pickup
  systems/           Doneness, Economy, WaveDirector, WeaponSystem, BulletPatterns, Trail, rng
  data/              weapons, items, enemies, waves   ← all balance numbers live here
  state/             run state and player stats
  art/textures.ts    placeholder art drawn in code
  ui/                HUD and buttons
tests/               Vitest tests for the logic in systems/, data/ and state/
```

## Tuning the game
Everything you'd want to tweak is plain data:
- `src/data/waves.ts` sets wave length, spawn rate, enemy mix, turret cap and grill tile count.
- `src/data/enemies.ts` sets HP, speed, contact and bullet heat, and crumb drops.
- `src/data/weapons.ts` sets damage, cooldown, range, projectiles and price.
- `src/data/items.ts` holds the shop items and what each one does to your stats.

## Swapping in real art
All art is generated in `src/art/textures.ts` under fixed keys (`sausage-head`, `sausage-link`, `enemy-fork`, `eb-ketchup`, …).
To use real sprites, add the PNGs to `public/` and load them in `src/scenes/Boot.ts` with the same keys **before** `generateTextures(this)`:
```ts
preload() { this.load.image('enemy-fork', 'sprites/fork.png'); }
```
`generateTextures` skips any key that already exists, so no other code needs to change.
Sprites face **right** for the sausage and **up** for enemies.

## Ideas for next steps
- More sausages to pick from (Bratwurst = tanky, Chorizo = starts hot, Hot Dog = fast)
- Meta-progression unlocks between runs
- Real pixel art, sound effects and music
- Deploy to GitHub Pages / itch.io; package for Steam with Tauri or Electron
