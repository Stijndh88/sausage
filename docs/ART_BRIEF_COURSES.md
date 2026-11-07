# Art brief: the Kitchen and the Smokehouse

A second prompt for the image AI, for the art the Kitchen and Smokehouse still borrow from the Backyard:
two bosses and a themed version of each of the four regular enemies per course. Same style rules as
[ART_BRIEF.md](ART_BRIEF.md), repeated below so this prompt works on its own.

**How the game uses them:** drop each PNG into `src/art/sprites/` under the file name given, and add its
in-game size (the size in the list, not the 4× delivery size) to `src/art/sprites.json`. The game picks it
up on its own: a Kitchen fork uses `enemy-fork-kitchen` when that file exists and the normal fork when it
doesn't. Until then the bosses use code-drawn placeholders and the enemies keep their Backyard look.

Tip: ask for one sprite per message, and paste the style block first each time.

---

You are creating sprite art for **Wurst Case Scenario**, a top-down 2D roguelite bullet-hell for the
browser. You play a **sausage** escaping a BBQ, fighting angry kitchen utensils and condiment bottles.
A run goes through three areas: the Backyard (done), **the Kitchen** (cold steel and tiles) and
**the Smokehouse** (dark wood, soot and smoke). These sprites are for the Kitchen and the Smokehouse.

### Style (applies to every image)
- Cute-but-chaotic cartoon, like a modern indie game (think Brotato / Vampire Survivors charm, but cleaner).
- **Thick dark outline** (about 3px at the delivered size, colour #2a120a) around every sprite.
- Flat colours with one soft highlight and one shadow tone. No heavy gradient painting, no photo textures, no text or letters inside the art.
- Enemies have big, simple, **angry** eyes.
- Must read clearly at **small size on a dark, busy background**. Strong silhouettes, high contrast against dark brown/charcoal.
- Lighting from the top-left.
- **One sprite per image, centred, transparent background (PNG with alpha)**, no ground shadow, no frame.
- **Top-down view, seen from directly above** (slightly tilted is fine for charm).
- **Enemies face UP**: their front points to the top edge; the game rotates them toward the player.
- Sizes below are the in-game size. **Deliver at 4× that size** (e.g. 22×55 → 88×220), same aspect ratio, subject filling the canvas with only a few pixels of margin.
- Kitchen palette: brushed steel, white enamel, pale blue and mint accents. Smokehouse palette: charred black, dark wood, rust, ember orange, grey smoke.

### 1. Bosses (face UP)
- `enemy-grinder`, 120×130: **The Meat Grinder**, boss of the Kitchen. A cast-iron, hand-cranked meat
  grinder seen from above. A big round steel hopper takes up most of the sprite, with a dark mouth full of
  spinning cutting blades in the middle. The outlet tube points UP, with pink strands of ground meat
  squeezing out of its holes. A crank arm with a red wooden knob sticks out to the right side.
  Two furious glowing red eyes and heavy angry brows on the hopper's rim. Pale steel-blue with
  scratches and a few red splatters. It should look heavy, mechanical and hungry.
- `enemy-smokey`, 120×130: **Big Smokey**, boss of the Smokehouse. A fat, round barrel smoker seen from
  above, charred black metal with two rusty orange bands around it. A short chimney points UP, puffing
  a curl of grey smoke. On its belly a firebox grille glows orange and yellow like a mouth full of
  burning teeth. Two glowing amber eyes with heavy brows above the grille. Soot and rust streaks.
  It should look huge, slow and smouldering.

### 2. Kitchen enemies (face UP)
Same jobs as the Backyard enemies, new outfits. Keep each one the same size and silhouette weight as the
one it replaces.
- `enemy-fork-kitchen`, 22×55 (fast melee chaser): an angry **paring knife**, short steel blade pointing
  up, small black handle with rivets at the bottom, angry eyes on the blade near the handle.
- `enemy-spatula-kitchen`, 30×60 (tough melee bruiser): an angry **meat tenderizer mallet**, the spiky
  square steel head at the top, a long wooden handle at the bottom, angry eyes on the head. Light grey
  rim so it stays visible.
- `enemy-ketchup-kitchen`, 27×49 (shoots red blobs): an angry **mayonnaise squeeze bottle**, creamy
  white with a pale yellow cap and nozzle at the top, a blue label on the belly. Give it a darker
  outline-side shade so the white body still reads on dark ground.
- `enemy-hotsauce-kitchen`, 26×52 (stationary turret): an angry **soy sauce dispenser**, a stout glass
  bottle with dark brown sauce inside and a red plastic cap with a spout at the top. Planted and menacing.

### 3. Smokehouse enemies (face UP)
- `enemy-fork-smokehouse`, 22×55 (fast melee chaser): an angry **butcher's meat hook**, rusty S-shaped
  steel hook with the sharp point at the top, angry eyes on the bend.
- `enemy-spatula-smokehouse`, 30×60 (tough melee bruiser): an angry **meat cleaver**, a wide blackened
  steel blade at the top with a hole near the spine, worn wooden handle at the bottom, angry eyes on
  the blade, light grey edge highlight.
- `enemy-ketchup-smokehouse`, 27×49 (shoots red blobs): an angry **BBQ sauce bottle**, dark
  brown-red glass with a black cap and nozzle at the top, a kraft-paper label with a flame shape.
- `enemy-hotsauce-smokehouse`, 26×52 (stationary turret): an angry **chipotle pepper jar**, a squat jar
  of smoked dark-red chillies with a black lid at the top and a wisp of smoke, planted and menacing.

### Delivery checklist
- PNG with transparent background, named exactly as above (e.g. `enemy-grinder.png`).
- 4× the in-game size, same aspect ratio, subject filling the frame.
- Same outline weight and lighting as the Backyard sprites, so the three areas look like one game.
- No text, watermarks or signatures.
