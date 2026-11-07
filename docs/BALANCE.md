# Balance

How strong a run gets, how long bosses last and how fast the Spice Rack fills. Retuned on
2026-11-07 after Stijn's playtest: a Weisswurst run reached Seconds with 6× Skewer IV, +1133%
damage and 94% crit, one-shot the last two bosses, collected 24.5k crumbs, and the Spice from that
one run (3 pushes) bought nearly the whole Spice Rack.

## The simulator

`tools/balance-sim.ts` plays runs on paper with the game's real data and shop code: items, prices,
rarity odds, stack limits, stat caps, weapon tiers, stack bonuses, wave HP and Spice payouts. A greedy
player buys whatever adds the most power per crumb and rerolls when nothing is worth it. Combat is a
model: boss time-to-kill is boss HP over single-target DPS, with per-weapon hit shares measured
against the real game in headless Chromium (six tier IV copies of each weapon against the Meat
Grinder; the model matched within 5%).

```bash
npx tsx tools/balance-sim.ts               # summary: boss fights, build size, Spice per run
npx tsx tools/balance-sim.ts --trace       # one run, wave by wave (--talents for a full rack)
```

`tests/progression.test.ts` pins the targets below with the same model, and the e2e test
"the playtest build that one-shot late bosses now needs a real fight" replays Stijn's build in the
real game.

Fed the old numbers, the simulator reproduced the playtest: about 29k crumbs, +1400% damage, and the
Smokehouse and Seconds bosses dying in about a second.

## Targets and where they landed

Frank, no talents, a greedy player pushing on through one Seconds loop. Boss time-to-kill in
seconds, 10th / 50th / 90th percentile of 150 runs:

| | Tongs | Meat Grinder | Big Smokey | Seconds boss | Fastest 1% | Damage at the end |
|---|---|---|---|---|---|---|
| Before | 15 / 21 / 31 | 4 / 7 / 10 | 1 / 1 / 2 | 0 / 1 / 1 | 0.3 s | +1419% |
| After | 18 / 24 / 38 | 19 / 28 / 41 | 25 / 36 / 53 | 29 / 44 / 63 | 12 s | +209% |

With the full Spice Rack bosses go about twice as fast early (Tongs ~12 s) and stay real fights late.
The strongest build the shop can produce (every item at its limit, six identical tier IV links) still
needs 6+ seconds for the Seconds boss.

Spice taken home (median, no talents), before → after:

| Take it home after | Backyard | Kitchen | Smokehouse | Seconds #1 |
|---|---|---|---|---|
| Before | 201 | 612 | 1,248 | 2,121 |
| After | 134 | 341 | 622 | 984 |

The Spice Rack went from 4,663 Spice (shelves 1–2) + 1,600 (keystones) to 11,520 + 4,000. One deep
run now buys under a tenth of it; filling it takes a few dozen good runs on top of the one-time
recipe (about 4,200) and First Taste (about 1,650) payouts.

## What changed

**Item stacking.** Every item has a stack limit now (`maxStacks` in `src/data/items.ts`), so crumbs
alone can't build an unbounded stack. The biggest offenders: Golden Sausage 2 (was unlimited),
Secret Sauce 5, Paprika and Espresso Mustard 10, Mustard Seed 6 (was 12), Slippery Oil 6 (was 8),
Lucky Relish 5, Hot Dog Cart 1 (was 2), Four-Leaf Relish 3 (was 6). When the rolled rarity has
nothing left, the shop offers any item that isn't maxed instead of an empty slot.

**Stat caps** (`CAPS` in `src/state/stats.ts`), a safety net that normal builds stay under:
damage +300%, fire rate +200%, crit 60% (was 100%), dodge 50% (was 60%), lifesteal 30% (was 50%).

**Shop prices** (`priceGrowth` in `src/systems/Economy.ts`): +30% of the base price per wave, and
from wave 5 also ×1.08 per wave. Wave 5: 2.2×, Tongs shop: 3.3×, Grinder: 8.5×, Big Smokey: 19×,
wave 25: 38× (was 2×, 2.5×, 3.6×, 4.3×, 5×). The Backyard barely changed.

**Crumbs**: later courses pay +25% per course instead of +40%. Greedy Gut is +6% per rank (was +10%),
Regular Customer −4% per rank (was −5%); these two compounded hardest with a full rack.

**Enemy and boss HP** (`src/data/waves.ts`): Kitchen ×2 (was 1.5), Smokehouse ×4.5 (was 2.1), then
×1.6 per Seconds loop (was +0.7). Later bosses ×3.6 of their course (was 2.8). The Tongs are unchanged.

**Spice** (`src/state/meta.ts`, `src/data/courses.ts`): course multipliers ×1, ×1.5, ×2, then +0.5 per
loop (was ×1, ×2, ×3, +1), as the design doc planned. Kills 0.03 Spice per crumb (was 0.05), wave clear
4 + wave (was 6 + 2 × wave), events 6 (was 8), First Taste 25/50/75 (was 40/80/120). All You Can Eat
+0.25 per push (was +0.5).

**Spice Rack** (`rankCost` in `src/data/talents.ts`): rank costs 25, 60, 110, 175, 250, … (about 2.5×),
shelf 2 still 1.6× that, keystones 500 (was 200).

## Still open
- The Food Truck keystone (no Common offers) can leave a late shop with only useless Uncommons once
  the useful ones are maxed.
- Weapons differ a lot against a boss: six Pepper Mills kill the Meat Grinder about 4× faster than six
  Skewers. Worth a look in a weapons pass.
- The model treats regular waves as fully cleared; late-wave difficulty (pressure) is a rough number.
  Check it against the play data once there's more of it.
