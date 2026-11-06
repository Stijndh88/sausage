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
