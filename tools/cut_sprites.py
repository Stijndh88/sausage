#!/usr/bin/env python3
"""
Cut the game sprites out of a concept-art sheet.

    python3 tools/cut_sprites.py art/source/concept-atlas-01.png

The sheet has real transparency: every sprite is an opaque shape on a fully transparent
background. Each opaque shape is given to the box (below) that contains its centre, so sprites
made of several pieces (a splat with droplets, a crown floating over a sausage) stay together,
and soft glow pixels go to the nearest shape. Each sprite is trimmed, scaled down to at most
4x its in-game size, and written to src/art/sprites/<key>.png.

It also writes src/art/sprites.json with each sprite's in-game size. The size keeps the area of
the old placeholder (BASE below) but follows the drawing's own proportions, so a tall fork stays
a tall fork. Gameplay doesn't depend on these sizes: hit circles come from the enemy and weapon
definitions.

Needs Pillow, numpy and scipy.
"""
import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / 'src' / 'art' / 'sprites'
MANIFEST = ROOT / 'src' / 'art' / 'sprites.json'

# Box (x0, y0, x1, y1) around each sprite on concept-atlas-01.png.
BOXES = {
    'sausage-head': (20, 40, 225, 165),
    'sausage-link': (238, 60, 375, 150),
    'portrait-frank': (440, 30, 558, 182),
    'portrait-bratwurst': (558, 30, 670, 182),
    'portrait-chorizo': (670, 30, 786, 182),
    'portrait-hotdog': (786, 20, 903, 186),
    'portrait-veggie': (903, 15, 1030, 186),
    'icon-toothpick': (1068, 40, 1148, 165),
    'icon-mustard': (1148, 70, 1202, 156),
    'icon-pepper': (1202, 58, 1270, 166),
    'icon-skewer': (1270, 48, 1362, 170),
    'icon-pickle': (1362, 48, 1452, 162),
    'icon-onion': (1452, 50, 1534, 166),
    'pb-toothpick': (8, 296, 145, 336),
    'pb-mustard': (148, 268, 288, 366),
    'pb-pepper': (296, 288, 360, 350),
    'pb-skewer': (370, 296, 535, 345),
    'pb-pickle': (548, 278, 645, 366),
    'onion-ring': (662, 260, 798, 382),
    'enemy-fork': (812, 195, 912, 438),
    'enemy-spatula': (945, 192, 1074, 442),
    'enemy-ketchup': (1098, 195, 1218, 414),
    'enemy-hotsauce': (1229, 195, 1345, 410),
    'enemy-tongs': (1352, 176, 1530, 456),
    'eb-ketchup': (22, 430, 104, 514),
    'eb-hot': (134, 430, 216, 514),
    'eb-boss': (244, 430, 326, 514),
    'crumb': (370, 422, 455, 510),
    'condiment': (500, 422, 608, 526),
    'spawn-mark': (650, 426, 776, 530),
    'item-paprika': (26, 520, 138, 650),
    'item-espresso_mustard': (146, 528, 262, 652),
    'item-sesame': (264, 540, 380, 640),
    'item-casing': (380, 522, 494, 648),
    'item-cold_cuts': (500, 532, 636, 652),
    'item-ketchup_kiss': (644, 534, 744, 646),
    'item-big_bun': (744, 524, 896, 648),
    'item-relish': (896, 514, 1000, 656),
    'item-hearty_meal': (1000, 524, 1132, 652),
    'item-oven_mitt': (1132, 526, 1280, 656),
    'item-mustard_seed': (1282, 530, 1386, 636),
    'item-slippery_oil': (1388, 518, 1480, 660),
    'item-double_dip': (14, 652, 136, 800),
    'item-pickle_juice': (136, 645, 276, 806),
    'item-smoked_ham': (276, 645, 414, 806),
    'item-four_leaf_relish': (414, 660, 512, 806),
    'item-secret_sauce': (512, 645, 634, 812),
    'item-spiky_bun': (634, 660, 762, 806),
    'item-grill_apron': (762, 660, 892, 806),
    'item-extra_pellet': (892, 688, 1006, 750),
    'item-vampire_ketchup': (1006, 660, 1100, 810),
    'item-golden_sausage': (1100, 655, 1264, 800),
    'item-hot_dog_cart': (1264, 645, 1406, 806),
    'item-second_skin': (1406, 645, 1520, 812),
    'tile-hot': (312, 812, 496, 992),
    'icon-lock': (832, 850, 922, 960),
}

# The old placeholder sizes (in-game pixels) whose area each sprite keeps.
BASE = {
    'sausage-head': (48, 30), 'sausage-link': (32, 26),
    'icon-toothpick': (16, 16), 'icon-mustard': (16, 16), 'icon-pepper': (16, 16),
    'icon-skewer': (16, 16), 'icon-pickle': (16, 16), 'icon-onion': (16, 16),
    'pb-toothpick': (18, 4), 'pb-mustard': (16, 8), 'pb-pepper': (9, 9),
    'pb-skewer': (24, 6), 'pb-pickle': (18, 12), 'onion-ring': (20, 20),
    'enemy-fork': (28, 44), 'enemy-spatula': (36, 50), 'enemy-ketchup': (30, 44),
    'enemy-hotsauce': (34, 40), 'enemy-tongs': (120, 130),
    'eb-ketchup': (13, 13), 'eb-hot': (13, 13), 'eb-boss': (14, 14),
    'crumb': (12, 12), 'condiment': (18, 14), 'spawn-mark': (26, 26),
    'tile-hot': (110, 110), 'icon-lock': (20, 22),
}
PORTRAIT_BASE = (60, 76)
ITEM_BASE = (40, 40)

# Exact sizes where the area rule isn't what we want.
EXACT = {
    'tile-hot': (110, 110),  # Drawn over a 110×110 hazard square.
    'enemy-tongs': (90, 150),  # The boss should loom: a bit taller than the placeholder.
    'eb-ketchup': (13, 13), 'eb-hot': (13, 13), 'eb-boss': (14, 14), 'pb-pepper': (9, 9),
}

# Round shots are cropped to a square centred on their solid shape (ignoring faint glow),
# so the picture sits exactly on the hit circle.
CENTRED = {'eb-ketchup', 'eb-hot', 'eb-boss', 'pb-pepper'}

# Never make a side more than this much longer than the placeholder's.
MAX_STRETCH = 1.35
# Stored resolution relative to the in-game size.
MAX_SUPERSAMPLE = 4
SOLID = 40  # Alpha above this counts as part of a shape.


def base_size(key):
    if key in BASE:
        return BASE[key]
    if key.startswith('portrait-'):
        return PORTRAIT_BASE
    return ITEM_BASE


def logical_size(key, w, h):
    if key in EXACT:
        return EXACT[key]
    bw, bh = base_size(key)
    aspect = w / h
    lw = math.sqrt(bw * bh * aspect)
    lh = lw / aspect
    shrink = max(lw / (bw * MAX_STRETCH), lh / (bh * MAX_STRETCH), 1)
    return max(1, round(lw / shrink)), max(1, round(lh / shrink))


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    sheet = Image.open(sys.argv[1]).convert('RGBA')
    rgba = np.array(sheet)
    alpha = rgba[:, :, 3]

    labels, count = ndimage.label(alpha > SOLID)
    centres = ndimage.center_of_mass(alpha > SOLID, labels, range(1, count + 1))
    owner = np.zeros(count + 1, dtype=object)
    owner[:] = None
    for i, (cy, cx) in enumerate(centres, start=1):
        for key, (x0, y0, x1, y1) in BOXES.items():
            if x0 <= cx < x1 and y0 <= cy < y1:
                owner[i] = key
                break

    # Soft edge and glow pixels belong to the nearest solid shape.
    _, (iy, ix) = ndimage.distance_transform_edt(labels == 0, return_indices=True)
    nearest = labels[iy, ix]

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for old in OUT_DIR.glob('*.png'):
        old.unlink()
    # Keep sprites that came as their own PNG (not cut from this sheet), e.g. enemy-goblin.
    manifest = {k: v for k, v in json.loads(MANIFEST.read_text()).items() if k not in BOXES} if MANIFEST.exists() else {}
    for key, (x0, y0, x1, y1) in BOXES.items():
        ids = [i for i in range(1, count + 1) if owner[i] == key]
        if not ids:
            sys.exit(f'No shape found for {key}')
        mine = np.isin(nearest, ids) & (alpha > 0)
        window = np.zeros_like(mine)
        window[y0:y1, x0:x1] = True
        mine &= window
        ys, xs = np.nonzero(mine)
        top, bottom, left, right = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        if key in CENTRED:
            sy, sx = np.nonzero(mine & (alpha > SOLID))
            cy, cx = (sy.min() + sy.max() + 1) / 2, (sx.min() + sx.max() + 1) / 2
            half = max(sy.max() + 1 - sy.min(), sx.max() + 1 - sx.min()) / 2 + 2
            top, bottom = round(cy - half), round(cy + half)
            left, right = round(cx - half), round(cx + half)
        crop = rgba[top:bottom, left:right].copy()
        crop[~mine[top:bottom, left:right]] = 0
        crop[crop[:, :, 3] == 0] = 0  # No stray colour under transparent pixels.

        w, h = right - left, bottom - top
        lw, lh = logical_size(key, w, h)
        img = Image.fromarray(crop, 'RGBA')
        # Never store more than MAX_SUPERSAMPLE times the in-game size (per side).
        tw, th = min(w, lw * MAX_SUPERSAMPLE), min(h, lh * MAX_SUPERSAMPLE)
        if (tw, th) != (w, h):
            img = img.resize((round(tw), round(th)), Image.LANCZOS)
        img.save(OUT_DIR / f'{key}.png', optimize=True)
        manifest[key] = [lw, lh]
        print(f'{key:24s} {w:4d}x{h:<4d} -> {img.width:4d}x{img.height:<4d}  in game {lw}x{lh}')

    MANIFEST.write_text(json.dumps(manifest, indent=2) + '\n')
    print(f'{len(manifest)} sprites written to {OUT_DIR.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
