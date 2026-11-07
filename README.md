# Wurst Case Scenario 🌭

A roguelite bullet-hell where you play a sausage escaping a backyard BBQ.
Fight through the Backyard, the Kitchen and the Smokehouse, spend crumbs between waves, beat each course's boss,
then decide: take your Spice home, or go back for seconds and risk the lot.

## Play it
**In your browser:** https://stijndh88.github.io/sausage/ (rebuilt automatically on every push).

**On your own computer:** install [Node.js](https://nodejs.org) 20 or newer, then:
```bash
git clone https://github.com/Stijndh88/sausage.git
cd sausage
git checkout ccr-68a72b4a-nfbezy
npm install
npm run dev        # then open http://localhost:5173
```
No Git? On GitHub pick the `ccr-68a72b4a-nfbezy` branch, choose **Code → Download ZIP**, unzip it, open a
terminal in the folder and run `npm install` and `npm run dev`.

## How to play
| Action | Keyboard | Gamepad | Touch |
|---|---|---|---|
| Move | WASD (ZQSD on AZERTY) / arrows | Left stick / D-pad | Drag on the left half |
| Dash (brief invulnerability) | Space / Shift | A / bumpers / triggers | DASH button |
| Pause menu | Esc / P | Start | II button |
| Shop: buy / keep / reroll / next | 1–4 / Shift+1–4 / R / Enter | A / Y / X / Start (◄► picks a card) | Tap |

Keys work by **position**, not by the letter printed on them, so the defaults work on any keyboard
(WASD on QWERTY, ZQSD on AZERTY, and so on) and the game shows the letters of your layout.
Every key can be changed in **Settings → Keyboard controls**.

**Pick a sausage.** Each sausage has its own stats, starting weapons and one special rule.
The Classic Frank is yours from the start. Each other sausage is listed in the Cookbook: cook its recipe,
then buy it with Spice (the Veggie Sausage also needs a Grinder Blade trophy).

| Sausage | Strength | Weakness | Recipe, then price |
|---|---|---|---|
| Classic Frank | Balanced, Toothpick | None | Free |
| Bratwurst | +40 HP, +3 armor, Pepper Mill | -10% speed and damage | Take it home from the Backyard, 100 Spice |
| Chorizo | +20% damage, +10% crit, Mustard | -25 HP | Land 300 crits, 200 Spice |
| Hot Dog | 7 links, faster, Toothpick + Skewer | -15 HP | Dash 500 times, 200 Spice |
| Veggie Sausage | 1.5 HP/s regen, grill-proof, Onion Ring | -10% damage | Heal 1000 HP, 250 Spice + 1 Grinder Blade |

**Courses and the doggy bag.** A run is three courses: the Backyard (6 waves, then the Tongs), the Kitchen
(5 waves, then The Meat Grinder) and the Smokehouse (5 waves, then Big Smokey). After that come endless
"Seconds" loops. Kills, cleared waves and bosses fill your **doggy bag** with **Spice**; later courses pay
more per kill. After each boss you choose:
- **Take it home**: bank the whole bag plus 10%, and the run ends.
- **Seconds?**: pick a free item and a menu (a spicy one pays more Spice but makes the next course harder),
  then carry on. If you die after pushing on you keep only 25% of the bag (50% if you never pushed on).

You can also **bail out** from the pause menu and keep 50%. Each course boss drops a trophy into the bag
(lost if you die) and pays a one-time **First Taste** bonus per sausage straight into your Spice.

**The Spice Rack** (Tab on the menu) is the talent tree you spend Spice on: four jars (Seasoning, Casing,
Hustle, Doggy Bag), each with two shelves and two keystones that also cost trophies. You can refund
everything for free.

**The Cookbook** (C on the menu) lists 41 recipes, some secret. Every run counts towards them, even the
ones that end in death. Recipes pay Spice and unlock sausages, Rare and Legendary items, more weapons,
talents and **Chili levels**: optional difficulty steps per sausage that add Spice. Pick your Chili level
on the sausage select screen (up and down).

**Sausage links.** Each weapon rides on its own link trailing behind your head and fires on its own,
preferring ranged enemies. Buying a new weapon adds a link; buying one you own upgrades it (tiers I–IV).
Only your **head** can be hit; the white dot is your hitbox. Melee enemies bounce off your links.

**Health.** Armor reduces every hit (diminishing returns), regen and lifesteal heal you, and blue condiment
packets restore HP. Red-hot grill tiles burn you. You heal to full between waves.

**The shop.** Items come in four rarities (Common, Uncommon, Rare, Legendary); rarer ones show up in later
waves and with more Luck. Every card shows exactly what it would change ("Damage 108% → 116%").
"Keep" holds an offer through rerolls and into the next shop (re-priced for that wave).
Crumbs left on the floor when a wave ends are swept up at half value.

**Settings** (from the menu or the pause menu): volumes, screen shake, reduce flashing, reduce motion
(defaults to your OS setting) and damage numbers. Settings, Spice, talents, recipes and best runs are saved in the browser.

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
| `features` | settings, pause menu, sausage select and unlocks, tips, touch, gamepad, audio, shop controls |

### Timing rule
All gameplay timing uses the Game scene's own clock (`gameTime`), which only advances on
unpaused frames by the same capped delta physics uses. Never use `scene.time.now` for gameplay:
it follows the wall clock and keeps running while paused.

## Project layout
```
src/
  main.ts            Phaser config and scene list
  scenes/            Boot, Menu, Select, Game, Shop, Choice, GameOver, Victory, SpiceRack, Cookbook
  entities/          SausageHead, LinkChain, Enemy, BulletPool, Pickup
  systems/           Health, Economy, WaveDirector, WeaponSystem, BulletPatterns, Trail, statText, rng
  data/              weapons, items, rarity, sausages, enemies, waves, courses, talents, recipes, menus
                     ← all balance numbers live here
  state/             run state, player stats, save file, settings, meta (Spice and settling a run)
  audio/Audio.ts     synthesized sound effects and music (Web Audio, no files)
  art/sprites.ts     loads the painted sprites (art/sprites/*.png, sizes in art/sprites.json)
  art/textures.ts    code-drawn background, effects and fallbacks
  ui/                HUD, buttons, pause menu, settings, tips, damage numbers, touch and gamepad input
tests/               Vitest tests for the logic in systems/, data/ and state/
```

## Tuning the game
Everything you'd want to tweak is plain data:
- `src/data/waves.ts` sets wave length, spawn rate, enemy mix, turret cap and grill tile count.
- `src/data/enemies.ts` sets HP, speed, contact and bullet damage, and crumb drops.
- `src/data/sausages.ts` defines the playable sausages, their recipe and their price.
- `src/data/courses.ts` sets the courses, their bosses and trophies; `src/state/meta.ts` sets how much Spice
  everything pays and how much of the bag you keep.
- `src/data/talents.ts` holds the Spice Rack and its prices; `src/data/recipes.ts` holds the Cookbook.
- `src/data/rarity.ts` sets how rarity odds grow with waves and Luck.
- `src/data/weapons.ts` sets damage, cooldown, range, projectiles and price.
- `src/data/items.ts` holds the shop items and what each one does to your stats.

## Screen resolution
The game world is always 1280×720, but the canvas renders at your screen's real pixel count
(up to 2.5×), so text and shapes stay sharp on big and high-DPI screens. Add `?scale=1` to the URL to
force the old 1× rendering (e.g. on a slow machine).

## Art
The sprites are painted art, cut from a concept sheet (`art/source/concept-atlas-01.png`) by
`tools/cut_sprites.py` into `src/art/sprites/<key>.png`, with each sprite's in-game size in
`src/art/sprites.json`. `src/art/sprites.ts` loads them in Boot. Each sprite keeps its in-game size
while its texture holds 2–4× the pixels, so it stays sharp on high-DPI screens.

A few things are still drawn in code (`src/art/textures.ts`): the arena background, the hitbox dot
and the white particle effects (spark, smoke, ring), which the game tints. Any sprite key without a
PNG falls back to its drawn placeholder.

**To replace or add a sprite:** drop a PNG named after its key into `src/art/sprites/` (transparent
background; the sausage faces **right**, enemies face **up**), add its in-game size to
`sprites.json`, and reload. To re-cut everything from a new sheet with the same layout, run
`python3 tools/cut_sprites.py <sheet.png>` (needs Pillow, numpy and scipy). The keys and sizes the art
must follow are in [docs/ART_BRIEF.md](docs/ART_BRIEF.md).

## What's next
See [docs/ROADMAP.md](docs/ROADMAP.md). Not done yet: mid-wave level-ups, elites and wave modifiers,
painted Kitchen and Smokehouse enemies and bosses, a painted arena background and animations.
