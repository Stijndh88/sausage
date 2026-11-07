# Roadmap: from prototype to a complete game

Heat/Doneness is removed. Everything below is built in phases; each phase is committed and pushed
on its own, with tests updated as it lands.

**Status:** Phases 1–3 are done. Item rarities were built in Phase 1 (the item system had to be
rewritten for HP anyway). Phase 4 (tests) is done for everything listed; "Later" is still open.

## Design decisions
- **Health replaces heat.** A plain HP bar (readable at a glance, no explanation needed).
  Damage is reduced by **Armor**, restored by **Regen**, **Lifesteal** and condiment packets.
  You heal to full between waves. Short invulnerability after each hit stays.
- **Grill tiles stay as hazards**: standing on one burns you (damage over time). They make
  positioning matter without being a second health system.
- **Crumbs on the floor matter**: anything you didn't pick up is banked at 50% when the wave ends,
  so pickup radius and movement are worth something.
- **Sausage types** change starting stats, starting weapon and one unique rule each.
- **Item rarities**: Common, Uncommon, Rare, Legendary. Better rarities show up more often in later
  waves. Each rarity has a colour and a card frame.

## Phase 1: Core rework and balance (heat out, HP in)
1. `Health` system (HP, max HP, armor, regen, lifesteal, i-frames) replacing `Doneness`.
2. HUD: HP bar with numbers, damage numbers, low-HP warning.
3. Grill tiles burn; condiments heal; full heal between waves.
4. Balance pass (numbers from the QA report, minus heat):
   smoother wave 3/6/8 steps, slower ketchup fire, targeting that prefers ranged enemies,
   +25% price growth, fewer late crumbs, 8 starting crumbs, boss HP 4000,
   Onion/Mustard rework, poison stacks (3), Toothpick 7 damage, Pickle 18 crumbs.
5. Shop: kept offers re-priced each wave, maxed items not offered, floor crumbs banked at 50%.

## Phase 2: Item rarities and sausage types
1. Rarity tiers with wave-scaled odds and a Luck stat; about 24 items, including synergies.
2. Sausage select screen: Bratwurst (tank), Chorizo (spicy damage), Hot Dog (fast, extra link),
   Veggie Sausage (regen, immune to grill tiles). Each unlocks by winning or reaching a wave.
3. Shop clarity: stat changes on cards ("DMG 8 → 12"), rarity frames, item pictograms,
   lock icon for Keep, keyboard key for Keep (Shift+1-4).

## Phase 3: The basics
1. **Sound**: synthesized sound effects (shots per weapon, hits, kills, pickups, dash, warnings,
   buy, boss) and a procedural music loop; no audio files needed.
2. **Settings** (saved): master, music and effects volume; screen shake; reduce flashing;
   reduced motion (defaults to the OS setting); damage numbers on/off.
3. **Pause menu**: dim backdrop, Resume / Restart / Settings / Main menu, plus your current build.
4. **First-run tutorial hints** during wave 1 (hitbox dot, HP, first grill tile, first condiment, shop).
5. **Best run saved** (best wave, wins per sausage); cause of death on the Game Over screen.
6. **Gamepad** (left stick to move, A/RT to dash, Start to pause).
7. **Touch controls**: virtual stick + dash button, rotate-device prompt in portrait, fullscreen button.
8. **Juice**: hit-stop, squash and stretch, kill pops, boss phase-2 banner.
9. **Readability**: outlines on the spatula, pepper pellets, enemy bullets and the spawn X;
   player shots shaped differently from enemy bullets.

## Phase 4: Test and report
Update every unit and browser test for HP, add tests for each new feature, run the full suite,
and update the QA report.

## Later (not in this pass)
Mid-wave level-ups (pick 1 of 3), elites and wave modifiers, meta-progression and a longer run,
a painted arena background and sprite animations. (Painted sprites are in: see Art in the README.)
