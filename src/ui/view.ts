import type Phaser from 'phaser';

/**
 * The game is laid out in a fixed 1280×720 world, but the canvas is rendered at the screen's
 * real pixel count: on a 1440p monitor or a high-DPI laptop the backbuffer is 2× (or more) and
 * every camera zooms in by the same factor. Graphics and text are then drawn at full sharpness
 * instead of a 1280×720 image being stretched by CSS.
 *
 * Computed once at boot; capped so huge 5K screens don't burn the GPU.
 */
/** The game world is always 1280×720 units, whatever the screen. */
export const GAME_W = 1280;
export const GAME_H = 720;

export const MAX_RENDER_SCALE = 2.5;

export function computeRenderScale(viewW: number, viewH: number, dpr: number): number {
  const fit = Math.min(viewW / GAME_W, viewH / GAME_H) * (dpr > 0 ? dpr : 1);
  const rounded = Math.round(fit * 4) / 4;
  return Math.min(MAX_RENDER_SCALE, Math.max(1, rounded));
}

export const RENDER_SCALE: number = (() => {
  try {
    const params = new URLSearchParams(globalThis.location?.search ?? '');
    const forced = Number(params.get('scale'));
    if (forced >= 1 && forced <= 4) return forced;
    return computeRenderScale(globalThis.innerWidth ?? GAME_W, globalThis.innerHeight ?? GAME_H, globalThis.devicePixelRatio ?? 1);
  } catch {
    return 1;
  }
})();

/** Make a scene's main camera show the 1280×720 world at the render scale. Call first in create(). */
export function fitCamera(scene: Phaser.Scene): void {
  scene.cameras.main.setZoom(RENDER_SCALE).centerOn(GAME_W / 2, GAME_H / 2);
}
