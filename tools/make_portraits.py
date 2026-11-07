#!/usr/bin/env python3
"""
Paint the portraits of the sausages that aren't on the concept sheet (yet), by recolouring the
painted ones and adding a prop: the Corn Dog's stick, the Cocktail Sausage's party pick, and so on.

    python3 tools/make_portraits.py

Run it after tools/cut_sprites.py (which wipes src/art/sprites/ and rewrites sprites.json).
It reads the cut portraits, writes src/art/sprites/portrait-<id>.png and adds their in-game
sizes to src/art/sprites.json. When real art for one of these arrives, add it to the concept
sheet's BOXES in cut_sprites.py and drop it from DERIVED below.

Needs Pillow and numpy.
"""
import colorsys
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SPRITES = ROOT / 'src' / 'art' / 'sprites'
MANIFEST = ROOT / 'src' / 'art' / 'sprites.json'
SUPERSAMPLE = 2  # The cut portraits are about 2x their in-game size.


def recolour(img, hue, sat, value=1.0, lift=0.0):
    """Moves the casing to a new colour. The outline, eyes and brows (dark or grey) are kept."""
    a = np.asarray(img.convert('RGBA')).astype(np.float32) / 255
    out = a.copy()
    h, w = a.shape[:2]
    for y in range(h):
        for x in range(w):
            r, g, b, al = a[y, x]
            if al == 0:
                continue
            _, s, v = colorsys.rgb_to_hsv(r, g, b)
            if s < 0.28 or v < 0.22:  # outline, eye whites, pupils, brows
                continue
            nv = min(1.0, v * value + lift)
            out[y, x, :3] = colorsys.hsv_to_rgb(hue / 360, min(1.0, s * sat), nv)
    return Image.fromarray((out * 255).astype(np.uint8), 'RGBA')


def pad(img, left=0, top=0, right=0, bottom=0):
    c = Image.new('RGBA', (img.width + left + right, img.height + top + bottom), (0, 0, 0, 0))
    c.paste(img, (left, top), img)
    return c


def casing_mask(base):
    """True where the painted portrait shows casing: not the outline, eyes, brows or background."""
    a = np.asarray(base.convert('RGBA')).astype(np.float32) / 255
    mx, mn = a[..., :3].max(-1), a[..., :3].min(-1)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    return (a[..., 3] > 0.98) & (sat >= 0.28) & (mx >= 0.22)


def speckle(img, base, colour, count, radius, seed):
    """Dots on the casing only (fat in black pudding, parsley in weisswurst)."""
    rng = np.random.default_rng(seed)
    ok = casing_mask(base)
    d = ImageDraw.Draw(img)
    w, h = img.size
    m = int(radius) + 3
    placed = tries = 0
    while placed < count and tries < 5000:
        tries += 1
        x, y = int(rng.uniform(m, w - m)), int(rng.uniform(m, h - m))
        if not ok[y - m:y + m + 1, x - m:x + m + 1].all():
            continue
        d.ellipse((x - radius, y - radius * 0.8, x + radius, y + radius * 0.8), fill=colour)
        placed += 1
    return img


def clip_to(layer, body):
    """Keeps only the parts of `layer` that sit on the body."""
    la = np.asarray(layer).copy()
    la[..., 3] = (la[..., 3].astype(np.uint16) * (np.asarray(body)[..., 3] > 200)).astype(np.uint8)
    return Image.fromarray(la, 'RGBA')


def corndog(base):
    body = recolour(base, 38, 1.0, 1.08, 0.04)
    body = speckle(body, base, (150, 92, 30, 255), 14, 2.2, 1)
    stick_h = 34
    c = pad(body, bottom=stick_h)
    d = ImageDraw.Draw(c)
    cx = c.width // 2
    top = body.height - 18
    d.rounded_rectangle((cx - 7, top, cx + 7, c.height - 2), 5, fill=(20, 12, 8, 255))
    d.rounded_rectangle((cx - 4, top, cx + 4, c.height - 5), 3, fill=(222, 188, 130, 255))
    c.alpha_composite(body)  # the stick goes into the corn dog, not over it
    return c


def cocktail(base):
    small = recolour(base, 4, 0.75, 1.1, 0.06)
    small = small.resize((round(base.width * 0.72), round(base.height * 0.72)), Image.LANCZOS)
    c = Image.new('RGBA', base.size, (0, 0, 0, 0))
    ox, oy = (base.width - small.width) // 2, base.height - small.height - 4
    c.alpha_composite(small, (ox, oy))
    d = ImageDraw.Draw(c)
    # A party pick through the middle, with a frilly top.
    x0, y0 = ox + small.width * 0.2, oy + small.height * 0.95
    x1, y1 = base.width * 0.76, 16
    d.line((x0, y0, x1, y1), fill=(20, 12, 8, 255), width=6)
    d.line((x0, y0, x1, y1), fill=(232, 210, 160, 255), width=3)
    for i, col in enumerate([(240, 70, 90), (70, 170, 240), (250, 210, 60)]):
        r = 12 - i * 3
        d.ellipse((x1 - r, y1 - r, x1 + r, y1 + r), fill=(20, 12, 8, 255))
        d.ellipse((x1 - r + 2, y1 - r + 2, x1 + r - 2, y1 + r - 2), fill=col + (255,))
    return c


def blackpudding(base):
    body = recolour(base, 348, 0.55, 0.42)
    return speckle(body, base, (236, 222, 205, 255), 18, 1.8, 2)


def merguez(base):
    body = recolour(base, 8, 1.05, 0.9)
    body = body.resize((round(body.width * 0.86), body.height), Image.LANCZOS)
    c = pad(body, left=8, right=8, top=32)
    d = ImageDraw.Draw(c)
    cx, top = c.width / 2, 38
    # A little flame on the head.
    for scale, col in [(1.0, (20, 12, 8)), (0.82, (255, 120, 30)), (0.5, (255, 220, 80))]:
        w, h = 22 * scale, 36 * scale
        d.polygon([(cx - w, top), (cx - w * 0.6, top - h * 0.55), (cx - w * 0.2, top - h * 0.35),
                   (cx, top - h), (cx + w * 0.3, top - h * 0.45), (cx + w * 0.6, top - h * 0.65),
                   (cx + w, top)], fill=col + (255,))
    c.alpha_composite(pad(body, left=8, right=8, top=32))
    return c


def weisswurst(base):
    body = recolour(base, 40, 0.18, 1.25, 0.18)
    return speckle(body, base, (70, 140, 50, 255), 22, 1.6, 3)


def kielbasa(base):
    body = recolour(base, 16, 1.0, 0.82)
    twine = Image.new('RGBA', body.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(twine)
    w, h = body.size
    # Twine ties near both ends, kept inside the outline.
    for y in (h * 0.2, h * 0.86):
        d.line((0, y - 3, w, y + 5), fill=(20, 12, 8, 255), width=6)
        d.line((0, y - 3, w, y + 5), fill=(236, 220, 180, 255), width=3)
    body.alpha_composite(clip_to(twine, base))
    return body


# id -> (painted portrait it starts from, how to change it)
DERIVED = {
    'corndog': ('frank', corndog),
    'cocktail': ('frank', cocktail),
    'blackpudding': ('frank', blackpudding),
    'merguez': ('chorizo', merguez),
    'weisswurst': ('frank', weisswurst),
    'kielbasa': ('bratwurst', kielbasa),
}


def main():
    manifest = json.loads(MANIFEST.read_text())
    for sid, (src, paint) in DERIVED.items():
        base = Image.open(SPRITES / f'portrait-{src}.png').convert('RGBA')
        img = paint(base)
        img.save(SPRITES / f'portrait-{sid}.png', optimize=True)
        manifest[f'portrait-{sid}'] = [round(img.width / SUPERSAMPLE), round(img.height / SUPERSAMPLE)]
        print(f'portrait-{sid:14s} {img.width}x{img.height}  in game {manifest[f"portrait-{sid}"]}')
    MANIFEST.write_text(json.dumps(manifest, indent=2) + '\n')


if __name__ == '__main__':
    main()
