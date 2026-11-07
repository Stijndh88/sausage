# Design: why you play one more run

Status: **proposal**, waiting for approval before it's built.
Section 4 (events at marked times) is built: see `src/data/events.ts`. The Escape Hatch and Tasting Spoon wait for the doggy bag.

## The problem
Right now a run ends and nothing carries over except a high score. One good run unlocks every
sausage (they unlock at wave 4, 7 and 10 and on the first escape), so after that there's nothing left
to chase. The best games in this genre all give you something to take home from every run, a reason
to risk more, and a steady drip of new things to unlock.

## What the well-reviewed games do
| Game | How it's received | What keeps people playing |
|---|---|---|
| [Megabonk](https://en.wikipedia.org/wiki/Megabonk) | "Very positive" on Steam; Rogueliker's [best survivors-like of 2025](https://rogueliker.com/roguelike-game-of-the-year-2025/) | **Quests unlock everything** (characters, weapons, slots), then you **buy** the unlock with Silver, the meta currency. Quests also pay Silver. [Guide](https://progameguides.com/megabonk/megabonk-beginners-guide-how-to-farm-silver-unlock-extra-slots/) |
| Halls of Torment | Popular, long-lived | Quests pay gold; gold buys **Blessings**, permanent upgrades with 5 ranks, each rank unlocked by a requirement. [Guide](https://primagames.com/gaming/best-blessings-in-halls-of-torment) |
| [Loop Hero](https://www.gfinityesports.com/article/loop-hero-death-what-happens-when-you-die) | Acclaimed | **Retreat or push on**: retreat at camp keeps 100% of resources, retreat elsewhere 60%, death 30%. A popup shows exactly what you'd keep. Reviewers call it "a painful but good compromise". |
| [Hellforged](https://indiegame.com/en/archives/33598) (demo) | 89% positive (552 reviews) | **Extraction bullet heaven**: what you find is only yours once you extract; players "often pushed their luck for better loot". Capture points, chests, quests and risky rifts on the map. ([preview](https://devplaymedia.com/2026/05/14/hellforged-blending-bullet-heaven-with-extraction-risk/)) |
| [Deep Rock Galactic: Survivor](https://opencritic.com/game/19313/deep-rock-galactic-survivor) | 87% positive (24k reviews), OpenCritic 85 | You must reach the drop pod after the boss to finish; materials are kept even if you die. The main complaint is a **grindy** meta. |
| [Brotato](https://en.wikipedia.org/wiki/Brotato) | 10M+ copies | Characters unlock by winning with other characters; **Danger levels 0–5** per character as a difficulty ladder. |
| Vampire Survivors | One of the best-reviewed games on Steam | **Hundreds of achievements, each unlocking something** (characters, weapons, stages, relics); gold buys permanent PowerUps you can refund at any time; timed events in every stage (swarms and walls at fixed minutes, the Reaper at 30:00). |

(Steam's own pages are blocked from my sandbox, so the numbers are from the sources linked; the
Vampire Survivors and Brotato notes are from what I know of those games.)

**The pattern, in five points:**
1. **Every run pays out** a currency you spend on permanent upgrades, even a run that ends in death
   (Hades II, DRG Survivor, Halls of Torment). A run that pays nothing feels wasted.
2. **Risk is your choice, and the stakes are on screen.** Loop Hero shows what you'd keep before you
   decide; Hellforged's whole hook is "extract now or push your luck".
3. **Achievements unlock content**, so new runs contain new things (VS, Megabonk). Unlocks that need
   both a deed *and* currency (Megabonk) spread them over many runs.
4. **A difficulty ladder per character** (Brotato Danger, Hades Heat, Balatro stakes) gives
   long-term goals once the basics are done.
5. **Events at fixed times** in a run (VS, Halls of Torment elites, Hellforged quests and rifts) break
   up the waves and give moment-to-moment goals.

**Pitfall to avoid:** a grindy meta (the main complaint about DRG Survivor). Early upgrades must be
cheap, so the first runs always buy something.

---

## 1. The run: three courses and the doggy bag
A run is a meal at the BBQ, served in **courses**:

| Course | Place | Waves | Boss | Spice multiplier |
|---|---|---|---|---|
| 1 | **The Backyard** (today's game) | 9 + boss | The Grill Master's Tongs | ×1 |
| 2 | **The Kitchen** | 5 + boss | The Meat Grinder | ×1.5 |
| 3 | **The Smokehouse** | 5 + boss | Big Smokey (the smoker) | ×2 |
| 4+ | **Seconds** (endless) | 5 + boss, looping | Remixed bosses | +0.5 per loop |

A full run is about 20 minutes, the genre's usual length. Escaping after course 1 takes about 8.

### Spice and the doggy bag
- **Crumbs** stay what they are: money for the shop, inside one run.
- **Spice** 🌶 is the new **meta currency**. You earn it during a run from kills, cleared waves,
  events, elites and bosses, multiplied by the course multiplier. It goes into your **doggy bag** 🎒
  and is only yours once you get out.
- The HUD always shows the bag and what you'd keep if you died now: `🎒 240 · keep 60 if you die`.

### After each boss: take it home, or seconds?
A screen shows both options with real numbers:

> **TAKE IT HOME**: bank all **420 🌶** (+10% escape bonus). The run ends as a win.
>
> **SECONDS?** Go on to The Kitchen. Spice ×1.5 from now on, tougher enemies, a new boss.
> Pick 1 of 3 rare items now. Heal to full. *If you die, you keep 25% of your bag.*

Pushing on comes with something good right away (a rare item and a full heal), so it feels exciting,
not just dangerous.

| How the run ends | You keep |
|---|---|
| Take it home after a boss | **100%** + 10% escape bonus |
| **Bail out** from the pause menu (any time) | **50%** |
| Die | **25%** (talents can raise this) |

These are Loop Hero's proven 100 / 60 / 30, made a bit harsher because bosses are rarer than camp
visits. Dying always pays *something*, so no run is wasted, but going too deep and dying really
hurts. That's the tension you asked for.

### Rough payouts (to tune with the bot)
| Run | Spice banked |
|---|---|
| Die early in the Backyard | 15–40 |
| Escape after the Backyard | 150–200 |
| Push on, die mid-Kitchen | ~90 |
| Escape after the Kitchen | ~450 |
| Escape after the Smokehouse | ~1,000 |

---

## 2. The talent tree: **The Spice Rack**
Four spice jars (branches), each with three shelves (tiers). Spend Spice on ranks. Shelf 2 opens
after 5 points in that jar. Shelf 3 holds **keystones**: big rule-changers that need 12 points in the
jar *and* a Cookbook recipe (section 3). **Refunds are free**, like Vampire Survivors' PowerUps, so you
can try builds. Rank costs grow (15, 30, 55, 90, …). The first rank of every shelf-1 node costs 15,
so every run buys something. The whole tree costs about 12,000 Spice: roughly 40–60 runs, with
something new every run. (Built: shelf-1 ranks start at 25 Spice, keystones cost 500, and the whole
rack is about 15,500 Spice. Live numbers and how they were tuned: `docs/BALANCE.md`.)

| Jar | Shelf 1 | Shelf 2 | Keystones (pick freely once unlocked) |
|---|---|---|---|
| 🧂 **Seasoning** (offense) | Sharp Seasoning +3% damage ×5 · Quick Hands +3% fire rate ×5 · Coarse Grind +2% crit ×5 | Spread the Flavour +5% explosion size ×3 · Marinade +15% poison ×3 · First Bite +20% damage to unhurt enemies ×2 | **Extra Spicy**: crits set enemies on fire · **Double Batch**: your starting weapon begins at tier II |
| 🥩 **Casing** (defense) | Plump +5 max HP ×10 · Tough Skin +1 armor ×3 · Simmer +0.2 HP/s ×3 | Condiment Lover +15% healing ×3 · Grill Marks −20% hot-tile damage ×3 · Iron Stomach longer invulnerability after a hit ×2 | **Second Skin**: revive once per run at 40% HP · **Smoked**: a one-hit shield at the start of every wave |
| 👟 **Hustle** (movement and shop) | Quick Feet +3% speed ×5 · Hot Pan −5% dash cooldown ×4 · Big Plate +10% pickup range ×3 | Tip Jar +3 starting crumbs ×3 · Free Refill +1 free reroll per shop ×2 · Regular Customer −4% shop prices ×3 | **Food Truck**: shop items are Uncommon or better · **Mise en Place**: start each run with a random common item |
| 🎒 **Doggy Bag** (risk and reward) | Spice Hound +5% Spice ×5 · Tupperware +5% kept on death ×4 (25% → 45%) · Lucky Fork +3 luck ×5 | Lunchbox: bank 10% of the bag each time you push on ×2 · Treasure Nose +20% boss and event Spice ×3 · Greedy Gut +6% crumbs ×3 | **Takeout**: bailing out keeps 75% · **All You Can Eat**: each course you push on adds another +0.25 multiplier |

---

## 3. The Cookbook (achievements that unlock things)
About 40 **recipes**. Each one pays Spice and unlocks something. Locked things show up as greyed-out
cards with a progress bar (*"Land 112/300 crits"*): the "almost there, one more run" pull that
Vampire Survivors and Megabonk rely on. The end-of-run screen shows the recipes you got closer to.

**Starting content shrinks** so there's something to unlock. A new save starts with 1 sausage, 4 of
the 6 weapons, and the common and uncommon items. The rest comes from recipes.

| Type | Examples (reward) |
|---|---|
| Progress | Escape the Backyard (Bratwurst can be bought) · Reach the Kitchen (the Kitchen's items join the pool) · Escape the Smokehouse (Chili level 1) |
| Sausage deeds | Land 300 crits in total (Chorizo can be bought) · Dash 500 times (Hot Dog) · Heal 1,000 HP in total (Veggie) · Own 6 links at once (Kielbasa) |
| Weapons | 1,000 toothpick kills (Skewer unlocked) · Hit one enemy with both legs of an onion throw 100 times (onion keystone) |
| Combat | Beat a boss without being hit · Clear a wave without taking damage · Kill 50 enemies in 10 s |
| Risk | Push on with 500+ Spice in the bag (Lunchbox node) · Escape after dropping below 10 HP · Bail out with exactly 1 HP |
| Events | Open 10 picnic baskets · Catch the golden hot dog · Finish 20 bounties |
| Secret | A few hidden ones, shown as "???" |

**Sausages need a recipe and then Spice to buy** (Megabonk's two-step), which fixes "everything
unlocks after one run". Example: the Bratwurst needs *Escape the Backyard*, then costs 150 🌶.

### More sausages (11 in total)
Every sausage gets a strength, a weakness and **one rule that changes how it plays**:

| Sausage | Rule | Unlock |
|---|---|---|
| Classic Frank | Balanced | Start |
| Bratwurst | +40 HP, +3 armor, slower | Escape the Backyard + 150 🌶 |
| Chorizo | +20% damage, +10% crit, fragile | 300 crits + 250 🌶 |
| Hot Dog | 7 links, fast | Dash 500 times + 250 🌶 |
| Veggie | Regenerates, immune to hot tiles | Heal 1,000 HP + 300 🌶 |
| **Corn Dog** (new) | A batter shell blocks the first hit of every wave; −15% speed | Clear 3 waves without a hit + 300 🌶 |
| **Cocktail Sausage** (new) | Tiny: 35% smaller hitbox, +20% speed, only 4 links, −30 HP | Escape at Chili 1 + 400 🌶 |
| **Black Pudding** (new) | 6% lifesteal, but condiment packets don't heal | Heal 300 HP in one run + 400 🌶 |
| **Merguez** (new) | Every hit sets enemies on fire; takes +20% damage | 500 poison/burn kills + 400 🌶 |
| **Weisswurst** (new) | "Eat before noon": +40% damage for the first 20 s of every wave, −20% after | Kill 30 enemies in the first 10 s of a wave + 450 🌶 |
| **Kielbasa** (new) | Two extra links, but **every link can be hit**, not just the head | Own 6 links at once + 600 🌶 |

### Chili levels (difficulty ladder per sausage)
Escape with a sausage to unlock its next Chili level 🌶1–🌶5. Each level adds a twist and +20% Spice,
and your highest level shows on the sausage's card:

1. Enemies are 15% faster
2. Enemies have +25% HP
3. Shop prices +20%
4. Bosses gain a new attack
5. You keep **0%** of your bag if you die

---

## 4. Events at marked times
Every wave gets an **event track**: a thin bar under the wave timer with icons at the seconds where
events will happen. You can see `0:15 🧺` and `0:32 ⚠` coming and plan around them. Each wave rolls
1–3 events from the course's pool (seeded). There's a 3-second warning before hazards.

| Event | Kind | What happens |
|---|---|---|
| 🧺 **Picnic Basket** | Treasure | A basket lands; stand in its circle for 3 s to open it, then pick 1 of 3 items or take a Spice bundle |
| 🌭 **Golden Hot Dog** | Chase | A golden runner flees; catch it within 10 s for a pile of crumbs and Spice |
| ⭐ **Elite** | Fight | A big glowing enemy with a trait (fast, shielded, splits); drops a basket |
| 🍴 **Fork Stampede** | Hazard | A line of forks charges across the arena, telegraphed with arrows |
| 🔥 **Grease Flare-up** | Hazard | Fire sweeps across 2–3 lanes, telegraphed |
| ☔ **Sauce Rain** | Hazard | Drops fall where shadows appear |
| 📜 **Chef's Bounty** | Quest | "Kill 25 forks in 20 s" for a Spice reward |
| 🍺 **Happy Hour** | Buff | 15 s of double crumbs and +30% fire rate |
| 🥄 **Tasting Spoon** | Deal | Step on it to choose: "+30% damage taken this course, +50% Spice" (a small push-your-luck bet) |
| 🕳 **Escape Hatch** | Exit (Kitchen and later) | A drain opens for 10 s; jump in to bail out with 75% |

---

## 5. Build order
Each phase is playable on its own and comes with tests.

1. **The loop**: Spice, the doggy bag and its HUD, the boss choice screen, bail out, courses 2 and 3
   with placeholder content (remixed enemies with new behaviours, upgraded Tongs), endless Seconds,
   a results screen, the Spice Rack tree with its UI, save-file migration, and the new sausage
   unlock rules. *This is the hook; it comes first.*
2. **Events** and the event track on the HUD.
3. **Cookbook**: about 40 recipes, content gating, 6 new sausages, 2–3 new weapons, Chili levels.
4. **Art**: a second art brief for the Kitchen and Smokehouse enemies, 2 bosses, per-type in-game
   sausages, event props and talent icons. You can generate it while I build phases 1–3; placeholders
   are used until then.
5. **Balance and test pass**: bot runs per course, payout tuning, the full test suite and a report.

## What was built (phases 1 and 3)
Stijn approved the design as written: 25% kept on death, the names as proposed, and a 6-wave Backyard.
Changes made while building it:
- **Double Batch** starts your first weapon at tier II (two copies of one weapon would just stack).
- **Food Truck** makes every shop item Uncommon or better (5 offers did not fit the shop layout).
- **Busy Kitchen** became **Greedy Gut** (+10% crumbs) until the events system lands.
- The Kitchen and Smokehouse reuse the Backyard enemies with tougher numbers, a tinted arena and two
  Tongs variants (The Meat Grinder, Big Smokey) as placeholders until their art exists.
- **Treasure Nose** pays +20% Spice from bosses and events. Each won event puts 8 Spice (times the multiplier) in the bag.
- The 6 new sausages from the sausages PR use recipes and prices from the table above (Weisswurst uses
  "50 kills within 10 s" and Black Pudding "heal 300 HP in one run").
- Chili 1 makes enemies faster rather than adding elites, since events already spawn elites.

## Open questions
- Payouts and prices need a tuning pass with the bot once all phases are in.
