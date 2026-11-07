# Art brief

A ready-to-use prompt for an image AI (or an artist) to produce the sprites for this game. File names, sizes and orientations match the texture keys in `src/art/textures.ts`, so the art can be loaded in `Boot.preload` under the same keys. The optional extras (portraits, `item-<id>` icons, `tile-hot`) need a small code change to use.

---

You are creating the sprite art for **Wurst Case Scenario**, a top-down 2D roguelite bullet-hell for the browser. You play a **sausage** escaping a backyard BBQ. Your weapons ride on sausage **links** trailing behind you like a snake, and you fight angry kitchen utensils and condiment bottles on a hot grill.

### Style (applies to every image)
- Cute-but-chaotic cartoon, like a modern indie game (think Brotato / Vampire Survivors charm, but cleaner).
- **Thick dark outline** (about 3px at the delivered size, colour #2a120a) around every sprite.
- Flat colours with one soft highlight and one shadow tone. No heavy gradient painting, no photo textures, no text or letters inside the art.
- Characters have big, simple expressive eyes. Enemies look angry; the sausage looks determined and a bit scared.
- Must read clearly at **small size on a dark, busy background**. Strong silhouettes, high contrast against dark brown/charcoal.
- Consistent lighting from the top-left across all sprites.
- **One sprite per image, centred, transparent background (PNG with alpha)**, no drop shadow on the ground, no border or frame around the canvas.
- **Top-down view, seen from directly above** (slightly tilted is fine for charm).

### Size and orientation rules
- Sizes below are the **in-game size**. **Deliver every sprite at 4× that size**, e.g. 48×30 in-game means a 192×120 PNG. Keep the same aspect ratio and fill the canvas edge to edge with only a few pixels of transparent margin.
- **The player sausage faces RIGHT** (head pointing to the right edge).
- **Enemies face UP** (their "front" points to the top edge); the game rotates them toward the player.
- Projectiles fly toward the RIGHT unless stated otherwise.

### 1. The player sausage
The game recolours the sausage for the 5 playable types, so draw these **in light, slightly desaturated sausage tones** (pinkish-tan #e9a98c base, lighter highlight, darker #8a3b26 outline-side shading). They must still look good when tinted brown, red, orange or green.
- `sausage-head`, 48×30, faces right: the front end of a sausage with two big round eyes near the right end and a small worried mouth. Rounded capsule shape.
- `sausage-link`, 32×26, horizontal: one sausage segment with two diagonal dark grill marks. Keep the **centre fairly plain**, because a small weapon icon is drawn on top of it.
- `hitbox`, 10×10: a small white dot with a thin red ring (the only part of the player that can be hit). Very crisp and simple.

Optional, nice to have: one full-colour portrait per sausage type for the select screen, 96×60 each, facing right:
- `portrait-frank`: classic pink frankfurter
- `portrait-bratwurst`: thick, pale brown, slightly scarred
- `portrait-chorizo`: deep red, spicy, flecked
- `portrait-hotdog`: long, orange-pink, sporty, maybe a tiny headband
- `portrait-veggie`: green-tinted, leafy little sprout on top

### 2. Weapon icons (shown on top of a link, and in the shop)
16×16 each, full colour, very simple, readable at tiny size:
- `icon-toothpick`: a wooden toothpick with a small green frilly tip
- `icon-mustard`: a yellow mustard drop
- `icon-pepper`: a black pepper mill
- `icon-skewer`: a silver kebab skewer
- `icon-pickle`: a green pickle
- `icon-onion`: a golden onion ring

### 3. Player projectiles
These must **NOT** look like enemy bullets: elongated or irregular shapes, **no white core**, no dark outline.
- `pb-toothpick`, 18×4: a flying toothpick, pointing right
- `pb-mustard`, 16×8: an elongated yellow mustard splat/droplet, pointing right
- `pb-pepper`, 9×9: a peppercorn (dark with a light rim so it stays visible)
- `pb-skewer`, 24×6: a silver skewer spike, point on the right
- `pb-pickle`, 18×12: a spinning pickle slice/chunk
- `onion-ring`, 20×20: a crispy golden onion ring, transparent hole in the middle

### 4. Enemies (all face UP)
- `enemy-fork`, 28×44: an angry silver dinner fork, tines pointing up, small angry eyes on the neck.
- `enemy-spatula`, 36×50: a black kitchen spatula with slots, wooden handle at the bottom, angry eyes on the blade. **Give it a light grey rim** so it stays visible on a dark background.
- `enemy-ketchup`, 30×44: an angry red squeeze bottle of ketchup, white cap/nozzle at the top, label on the belly.
- `enemy-hotsauce`, 34×40: a stubby orange-red hot-sauce bottle with a green cap and a flame on the label. It's a stationary turret, so make it look planted and menacing.
- `enemy-goblin`, 40×40: **the Loot Goblin**, a rare enemy that runs away. A scrawny, hunched gremlin made of shrivelled beef jerky (bald knobbly head, bony knees, long skinny fingers), crouching low and greedily hugging a round clay pot overflowing with golden crumbs and gold flecks. Scraggly beard of burnt onion strings, ragged paper-napkin loincloth, huge shifty eyes peeking over the pot's rim, sly toothy grin. Give the pot a warm golden glow or bright gold rim so it reads as "special". Front (the pot) faces up.
- `enemy-tongs`, 120×130: **the boss, "The Grill Master's Tongs"**. Big BBQ tongs with the two arms pointing up and the hinge at the bottom, plus a dark menacing face on the hinge with glowing red eyes. Steel with scorch marks.

### 5. Enemy bullets
These must be **instantly readable as danger**: perfectly round, **bright white core, coloured ring, thin dark outline**.
- `eb-ketchup`, 13×13: red ring
- `eb-hot`, 13×13: orange ring
- `eb-boss`, 14×14: purple ring

### 6. Pickups and markers
- `crumb`, 12×12: a golden-brown bread crumb / tiny crouton (the game's money), with a pale outline so it shows up on the grill.
- `condiment`, 18×14: a small blue condiment sachet (heals you).
- `spawn-mark`, 26×26: a warning "X" where an enemy is about to appear: red with a white core line and a dark outline.

### 7. Item icons for the shop (full colour)
40×40 each, a simple pictogram on a transparent background. Each needs a different shape, not just a different colour, so colour-blind players can tell them apart:

| File | Item | Picture |
|---|---|---|
| `item-paprika` | Paprika (+damage) | a red paprika pepper |
| `item-espresso_mustard` | Espresso Mustard (+fire rate) | a coffee cup with a lightning bolt |
| `item-sesame` | Sesame Seeds (+speed) | sesame seeds with speed lines |
| `item-casing` | Thicker Casing (+armor) | a sausage-skin shield |
| `item-cold_cuts` | Cold Cuts (regen) | a heart made of ham slices with a small plus |
| `item-ketchup_kiss` | Ketchup Kiss (lifesteal) | a ketchup drop shaped like lips |
| `item-big_bun` | Big Bun (pickup range) | a hot dog bun with a magnet |
| `item-relish` | Lucky Relish (+crumbs) | a relish jar with a gold coin |
| `item-hearty_meal` | Hearty Meal (+max HP) | a big heart-shaped steak |
| `item-oven_mitt` | Oven Mitt (dash) | an oven mitt with a little wing |
| `item-mustard_seed` | Mustard Seed (crits) | a mustard seed with a star sparkle |
| `item-slippery_oil` | Slippery Oil (dodge) | an oil bottle with a swirl |
| `item-double_dip` | Double Dip (+damage, −HP) | a chip dipping twice into a red dip |
| `item-pickle_juice` | Pickle Juice (bigger explosions) | a green jar mid-explosion |
| `item-smoked_ham` | Smoked Ham (+HP, −speed) | a smoky ham hock |
| `item-four_leaf_relish` | Four-Leaf Relish (+luck) | a four-leaf clover made of relish |
| `item-secret_sauce` | Secret Sauce | a mysterious glowing sauce bottle |
| `item-spiky_bun` | Spiky Bun (thorns) | a bun covered in spikes |
| `item-grill_apron` | Grill Master's Apron | a BBQ apron |
| `item-extra_pellet` | Extra Pellet | three peppercorns in a row |
| `item-vampire_ketchup` | Vampire Ketchup | a ketchup bottle with tiny fangs |
| `item-golden_sausage` | Golden Sausage (legendary) | a shining golden sausage with a crown |
| `item-hot_dog_cart` | Hot Dog Cart (legendary) | a little street hot-dog cart |
| `item-second_skin` | Second Skin (legendary) | a glowing extra sausage skin / ghost outline |

Also `icon-lock`, 20×22: a small padlock (marks an offer you're keeping).

### 8. Arena
- `bg-grill`, 1280×720 (**deliver 2560×1440 or larger**): the arena seen from above, a dark charcoal BBQ grill.
  - Horizontal steel grate bars about every 36px (in-game scale) across the whole image, with dim glowing coals visible between the bars.
  - Keep it **dark and low-contrast** (mostly #1e1714 to #3a3532, small dim red-orange glows), so sprites and bullets pop on top.
  - It must tile cleanly or fill the frame with no focal point.
- `tile-hot`, 110×110: one red-hot section of grill: glowing orange coals under bright yellow-orange bars, slightly rounded corners. It marks a hazard and must look dangerous.

### 9. Effects (simple, white or near-white so the game can tint them)
- `spark`, 6×6: a small soft white spark
- `smoke`, 16×16: a soft round white puff
- `ring`, 64×64: a thin white circle outline (explosion shockwave)

### Delivery checklist
- PNG with transparent background (except `bg-grill`), named exactly as the keys above (e.g. `enemy-fork.png`).
- 4× the in-game size, same aspect ratio, subject filling the frame.
- Same style, outline weight and lighting across every file, so it looks like one game.
- No text, watermarks or signatures in the images.
