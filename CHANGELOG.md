# Changelog

Versions follow [semantic versioning](https://semver.org). The main menu shows the running version.

## Unreleased
- **Balance pass** after the 2026-11-07 playtest (late bosses were one-shot, one run filled the Spice Rack).
  Details and numbers: `docs/BALANCE.md`.
  - Every item has a stack limit (Golden Sausage 2, Secret Sauce 5, Paprika 10, Mustard Seed 6, ...).
  - Stat caps: damage +300%, fire rate +200%, crit 60%, dodge 50%, lifesteal 30%.
  - Shop prices climb much faster after the Backyard (wave 13 8.5x, wave 25 38x the base price).
  - Kitchen, Smokehouse and Seconds enemies and bosses have a lot more HP; the Tongs are unchanged.
  - Less Spice per run (course multipliers x1 / x1.5 / x2 / +0.5 per loop) and a Spice Rack that costs
    about 2.5x as much (keystones 500), so it fills over a few dozen good runs.
  - `tools/balance-sim.ts` simulates runs to check balance changes; `tests/progression.test.ts` pins the targets.
- **Loot Goblin** (rare timed event, wave 2+): a jerky gremlin with a pot of gold runs from you for 12 s.
  It never hurts you, spills crumbs as you shoot it, and drops a pile of crumbs, bonus Spice, a condiment and
  sometimes an item when it dies. Ignore it and it vanishes with the loot. Uses a placeholder sprite for now.
- **Stack the same weapon**: any link can hold any weapon (3× Onion Ring, even 6×). Buying a weapon you own
  adds a new link by default; the card's New link / Upgrade switch (▲▼, D-pad or tap) upgrades a copy instead.
- **Stack bonuses** at 2, 4 and 6 copies of one weapon boost every copy. Shop cards show the next bonus and
  the loadout lists your stacks.
- **Merge links**: two links with the same weapon at the same tier (say two tier I Skewers) merge into one
  tier II link in the shop, freeing a link. Click Merge under the pair, press M, or pick the link with LB/RB and press A.
- **How to play** screen (main menu: H / RB, and the pause menu) explains the mechanics, events, links
  and items. It only lists what you have already met, so it never spoils anything.
- Tooltips: hover or tap a link or item in the pause menu or the shop to see what it does, its numbers,
  its stack bonuses and what the next tier adds. With keys or a controller: ←→ in the pause menu, Tab (LB/RB) in the shop.
- The Pick Your Sausage cards no longer show a number before each name (the number keys still work).
- **Run stats** screen after every run (S / (Y) on the results screen): totals, damage / DPS / kills per
  link, what hurt you, where the crumbs went, damage per wave.
- **Share play data** (Settings, on by default): run summaries and errors are uploaded once each to the
  game's Supabase project with a random player id. Tables and rules: `supabase/play_data.sql`.
- **Play data** kept on the device: a summary of every run, errors, and runs that never finished
  (closed tab vs. probable crash). Settings → Play data downloads it as JSON. Nothing is sent anywhere yet.

## 0.2.0
- New rare item **Sharp Cheddar**: straight shots (Toothpick, Mustard Squirt, Pepper Mill, Skewer) pierce
  one more enemy per stack, up to 3 stacks.
- The main menu shows the game's version and build in the bottom-right corner.

## 0.1.0
- First playable build: 10 waves and the Grill Master's Tongs, 6 weapons, shop items, 5 sausages.
