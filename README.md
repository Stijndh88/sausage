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
| Move | WASD (ZQSD on AZERTY) / arrows | Left stick / D-pad | Drag anywhere on the left half (the stick follows your thumb) |
| Dash (brief invulnerability) | Space / Shift | A / bumpers / triggers | Tap anywhere on the right half |
| Pause menu | Esc / P | Start / Back | II button, top right |
| Menus | Arrows + Enter, Esc to go back | D-pad / stick + A, B to go back | Tap |
| Shop: buy / keep / reroll / next | 1–4 / Shift+1–4 / R / Enter | A / Y / X / Start (◄► picks a card) | Tap Buy / Keep / Reroll / Next |
| What a link or item does | Hover it; ←→ in the pause menu, Tab in the shop | ◄► in the pause menu, LB / RB in the shop | Tap it |
| How to play screen | H on the main menu, or the pause menu | RB on the main menu, or the pause menu | Tap How to play |

On-screen prompts follow whatever you last touched: key names on a keyboard, (A)/(B) on a controller,
nothing on a touch screen. Any controller in any slot works; the game pauses if it disconnects,
and it rumbles when you get hit (phones vibrate on Android). **Settings → Vibration** turns that off,
and **Settings → Touch: DASH button side** swaps the halves for left-handed play.
If a controller misbehaves, **Settings → Controller check** (or the button on the Keyboard controls
screen) shows every device the browser reports and what the game reads from it. A screenshot of it is
the best bug report. PlayStation pads work with or without the browser's remapping, and a DualSense
that shows up twice (Steam / DS4Windows) no longer confuses the game.

On a phone, tapping START goes full screen in landscape (Android). On iPhone, use
**Share → Add to Home Screen** to play full screen without the browser bars.

Keys work by **position**, not by the letter printed on them, so the defaults work on any keyboard
(WASD on QWERTY, ZQSD on AZERTY, and so on) and the game shows the letters of your layout.
Every key can be changed in **Settings → Keyboard controls**.

**Pick a sausage.** Eleven sausages, each with its own stats, starting weapons and one special rule.
The Classic Frank is yours from the start. Each other sausage is listed in the Cookbook: cook its recipe,
then buy it with Spice (the Veggie Sausage also needs a Grinder Blade trophy).

| Sausage | Strength | Weakness | Recipe, then price |
|---|---|---|---|
| Classic Frank | Balanced, Toothpick | None | Free |
| Bratwurst | +40 HP, +3 armor, Pepper Mill | -10% speed and damage | Take it home from the Backyard, 100 Spice |
| Chorizo | +20% damage, +10% crit, Mustard | -25 HP | Land 300 crits, 200 Spice |
| Hot Dog | 7 links, faster, Toothpick + Skewer | -15 HP | Dash 500 times, 200 Spice |
| Veggie Sausage | 1.5 HP/s regen, grill-proof, Onion Ring | -10% damage | Heal 1000 HP, 250 Spice + 1 Grinder Blade |
| Corn Dog | Batter shell blocks the first hit of every wave, +10 HP, Pickle Launcher | -15% speed | Clear 3 waves without a hit, 300 Spice |
| Cocktail Sausage | 35% smaller hitbox, +20% speed, Toothpick | -30 HP, only 4 links | Take it home after the Smokehouse on Chili 1, 400 Spice |
| Black Pudding | 12% lifesteal, +10 HP, Pepper Mill | Condiment packets don't drop | Heal 300 HP in one run, 400 Spice |
| Merguez | Every hit sets enemies on fire (fire spreads when a burning enemy dies), Toothpick | -4 armor (takes 20% more damage) | Finish 500 enemies with poison or fire, 400 Spice |
| Weisswurst | +40% damage for the first 20 s of every wave, Skewer | -20% damage after that | Kill 50 enemies within 10 s, 450 Spice |
| Kielbasa | 8 links, +20 HP, Toothpick + Pepper Mill | Every link can be hit | Have 6 links at once, 600 Spice |

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

**The Cookbook** (C on the menu) lists 44 recipes, some secret. Every run counts towards them, even the
ones that end in death. Recipes pay Spice and unlock sausages, Rare and Legendary items, more weapons,
talents and **Chili levels**: optional difficulty steps per sausage that add Spice. Pick your Chili level
on the sausage select screen (up and down).

**Sausage links.** Each weapon rides on its own link trailing behind your head and fires on its own,
preferring ranged enemies. Any link can hold any weapon, so you can run 3 or even 6 Onion Rings. Buying a
weapon you own puts it on a new link by default; switch the card to **Upgrade** (▲▼ or tap) to raise a copy's
tier instead (I–IV). With full links, buying upgrades. **Merge** two links with the same weapon and tier in the
shop (Merge button, M, or LB/RB then A) to get one link a tier higher and a free link. **Stack bonuses:** 2, 4 and 6 links of the same weapon
each unlock a bonus for every copy (see `src/data/stacks.ts`), e.g. Onion Ring: +15% range, +1 ring, +25% damage.
Only your **head** can be hit (except as the Kielbasa); the white dot is your hitbox. Melee enemies bounce off your links.

**Health.** Armor reduces every hit (diminishing returns), regen and lifesteal heal you, and blue condiment
packets restore HP. Red-hot grill tiles burn you. You heal to full between waves.

**The shop.** Items come in four rarities (Common, Uncommon, Rare, Legendary); rarer ones show up in later
waves and with more Luck. Every card shows exactly what it would change ("Damage 108% → 116%").
"Keep" holds an offer through rerolls and into the next shop (re-priced for that wave).
Crumbs left on the floor when a wave ends are swept up at half value.

**Events.** Every wave except the boss has 1–3 events at set seconds. The line under the wave timer shows
an icon at each one, and an icon pulses 3 seconds before its event. A wave never has two hazards, and it
always has at least one event that pays something.

| Event | From wave | What happens |
|---|---|---|
| Picnic Basket | 1 | Stand in its circle for 3 s to open it: a free random item and some crumbs. It vanishes after 16 s. |
| Golden Hot Dog | 1 | A golden runner flees from you; catch it within 10 s for a pile of crumbs. |
| Happy Hour | 2 | 15 s of double crumbs and +30% fire rate. |
| Chef's Bounty | 2 | Kill a number of enemies within 20 s (less, with fewer kills, if the wave ends sooner) for a crumb bonus. |
| Fork Stampede | 2 | Arrows warn you; then a wall of forks charges across the arena. Dodge, or dash through the gap. |
| Elite | 3 | A big, glowing enemy with 6× HP; drops a pile of crumbs and a condiment packet. |
| Grease Flare-up | 4 | Two lanes flash for 2 s, then burn for 3.5 s. |
| Sauce Rain | 5 | Shadows grow where sauce will land, and every other drop aims at you. |

**Settings** (from the menu or the pause menu): volumes, screen shake, reduce flashing, reduce motion
(defaults to your OS setting) and damage numbers. Settings, Spice, talents, recipes and best runs are saved in the browser.

**Run stats.** After every run, **Run stats** (S / (Y)) on the results screen shows the damage you dealt,
DPS, kills, crumbs collected, damage taken and healed; damage, DPS and kills per link (and for thorns and
fire); what hurt you most; where your crumbs went; and damage per wave.

**Play data.** The game keeps a summary of each run, the errors it hit, and runs that never finished
(a closed tab, or a crash) on the device, and uploads each one once to the game's own Supabase project
with a random player id (nothing else about the player), so balance problems and bugs can be spotted
from real play. **Settings → Share play data** turns uploading off; **Save** downloads the local copy as
JSON (in the console it's `window.__telemetry`). It goes to the "wurst" Supabase project (URL and
publishable key in `src/state/playDataSync.ts`; `VITE_PLAY_DATA_URL` / `VITE_PLAY_DATA_KEY` override
them) and is skipped on localhost unless the page has `?playdata=1`. The tables and insert-only rules are in `supabase/play_data.sql`.
See `src/state/telemetry.ts` and `src/state/playDataSync.ts`.

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
| `controls` | prompts per device, touch stick/dash/left-handed layout, controller in any slot, menu focus, rumble, pause on disconnect |
| `sausages` | each newer sausage's special rule in a real run, and the scrolling select screen |
| `stats` | damage credited per link, the run stats screen, play data (runs, errors, unfinished runs) |

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
  state/             run state, player stats, save file, settings, meta (Spice and settling a run),
                     runLog (per-run statistics), telemetry (play data kept on the device)
  audio/Audio.ts     synthesized sound effects and music (Web Audio, no files)
  art/sprites.ts     loads the painted sprites (art/sprites/*.png, sizes in art/sprites.json)
  art/textures.ts    code-drawn background, effects and fallbacks
  ui/                HUD, buttons, pause menu, settings, tips, damage numbers, touch and gamepad input
tests/               Vitest tests for the logic in systems/, data/ and state/
```

## Versioning
The version lives in `package.json` and follows [semantic versioning](https://semver.org): bump the
minor number for new content or features, the patch number for fixes. The main menu shows it in the
bottom-right corner with the build's commit, e.g. `v0.2.0 (1a2b3c4)`, so a bug report can name the
exact build. Bump it with `npm version minor --no-git-tag-version` (or `patch`) and add a line to
[CHANGELOG.md](CHANGELOG.md).

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
- `src/data/help.ts` holds the How to Play text. Each entry says when the player has met it (the save's
  `seen` list), so the screen never shows what they haven't run into. Change the text when a mechanic changes.

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
`python3 tools/cut_sprites.py <sheet.png>` (needs Pillow, numpy and scipy), then
`python3 tools/make_portraits.py`, which paints the portraits of the six newer sausages from the cut
ones until they get their own art. The keys and sizes the art
must follow are in [docs/ART_BRIEF.md](docs/ART_BRIEF.md); the Kitchen and Smokehouse art is in
[docs/ART_BRIEF_COURSES.md](docs/ART_BRIEF_COURSES.md).

## What's next
See [docs/ROADMAP.md](docs/ROADMAP.md). Not done yet: mid-wave level-ups, elites and wave modifiers,
painted Kitchen and Smokehouse enemies and bosses, a painted arena background and animations.
