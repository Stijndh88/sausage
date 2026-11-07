import Phaser from 'phaser';
import { RENDER_SCALE } from '../ui/view';
import sizes from './sprites.json';

/**
 * Painted sprites (src/art/sprites/<key>.png, cut from the concept sheet by tools/cut_sprites.py).
 *
 * Each one replaces the code-drawn placeholder with the same key. The PNGs are drawn at up to 4×
 * their in-game size; sprites.json holds that in-game size. A sprite keeps its in-game size (so
 * sizes, hit circles and layouts don't change) while its texture holds more pixels, so it stays
 * sharp when the camera zooms in on high-DPI screens. Any key without a PNG keeps its placeholder.
 */
export const SPRITE_SIZES = sizes as unknown as Record<string, [number, number]>;

const URLS = import.meta.glob('./sprites/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

const SOURCE = 'src:';

function keyOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1, -'.png'.length);
}

/** Queue the PNGs for loading. Call from Boot.preload(). */
export function preloadSprites(scene: Phaser.Scene): void {
  for (const [path, url] of Object.entries(URLS)) {
    const key = keyOf(path);
    if (SPRITE_SIZES[key]) scene.load.image(SOURCE + key, url);
  }
}

/**
 * How many texture pixels per in-game pixel. Twice the render scale (capped at the PNGs' 4×)
 * leaves headroom for sprites that UI screens show enlarged.
 */
export function spriteDetail(renderScale: number, webgl: boolean): number {
  // The canvas renderer can't show a frame smaller than its texture, so it gets 1:1 textures.
  if (!webgl) return 1;
  return Math.min(4, Math.max(2, renderScale * 2));
}

/**
 * Turn the loaded PNGs into textures under their final keys. Call from Boot.create() before the
 * placeholders are generated (they skip keys that already exist).
 */
export function buildSprites(scene: Phaser.Scene): void {
  const webgl = scene.game.renderer.type === Phaser.WEBGL;
  const detail = spriteDetail(RENDER_SCALE, webgl);
  for (const [key, [w, h]] of Object.entries(SPRITE_SIZES)) {
    const source = SOURCE + key;
    if (!scene.textures.exists(source)) continue;
    const img = scene.textures.get(source).getSourceImage() as HTMLImageElement;
    // Resample once, with good filtering, to the size the GPU will actually sample.
    const cw = webgl ? Math.max(1, Math.min(img.width, Math.round(w * detail))) : w;
    const ch = webgl ? Math.max(1, Math.min(img.height, Math.round(h * detail))) : h;
    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, cw, ch);
    scene.textures.remove(source);
    const texture = scene.textures.addCanvas(key, canvas);
    if (!texture) continue;
    // The frame reports the in-game size (what game objects use for their size) while its UVs
    // still cover the whole, larger texture.
    if (cw !== w || ch !== h) texture.get().setSize(w, h).setUVs(w, h, 0, 0, 1, 1);
  }
}
