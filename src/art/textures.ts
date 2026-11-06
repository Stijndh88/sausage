import Phaser from 'phaser';

/**
 * Placeholder art drawn in code. Every texture is cached under a fixed key.
 * To use real sprites later, load PNGs with the same keys in Boot (this.load.image('enemy-fork', ...))
 * and skip the matching generator below; no game code needs to change.
 */
export const GAME_W = 1280;
export const GAME_H = 720;

type Draw = (g: Phaser.GameObjects.Graphics) => void;

function make(scene: Phaser.Scene, key: string, w: number, h: number, draw: Draw): void {
  if (scene.textures.exists(key)) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  draw(g);
  g.generateTexture(key, w, h);
  g.destroy();
}

const CASING = 0xd9785a;
const CASING_DARK = 0x8a3b26;
const CASING_LIGHT = 0xf3a98a;

function eye(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, angry = false): void {
  g.fillStyle(0xffffff, 1).fillCircle(x, y, r);
  g.fillStyle(0x1a1a1a, 1).fillCircle(x + r * 0.3, y, r * 0.55);
  if (angry) {
    g.lineStyle(2, 0x1a1a1a, 1).lineBetween(x - r, y - r - 1, x + r, y - r * 0.4);
  }
}

export function generateTextures(scene: Phaser.Scene): void {
  // --- The sausage ---------------------------------------------------------
  // Head faces right (angle 0). White tints well, so the heat tint is applied at runtime.
  make(scene, 'sausage-head', 48, 30, (g) => {
    g.fillStyle(CASING_DARK, 1).fillRoundedRect(0, 0, 48, 30, 15);
    g.fillStyle(CASING, 1).fillRoundedRect(2, 2, 44, 26, 13);
    g.fillStyle(CASING_LIGHT, 0.9).fillRoundedRect(8, 5, 28, 5, 2.5);
    eye(g, 34, 11, 4.5);
    eye(g, 34, 20, 4.5);
    g.lineStyle(2, 0x5a1f12, 1).beginPath();
    g.arc(40, 15, 4, -0.9, 0.9, false).strokePath();
  });
  make(scene, 'sausage-link', 32, 26, (g) => {
    g.fillStyle(CASING_DARK, 1).fillRoundedRect(0, 0, 32, 26, 13);
    g.fillStyle(CASING, 1).fillRoundedRect(2, 2, 28, 22, 11);
    g.fillStyle(CASING_LIGHT, 0.8).fillRoundedRect(7, 5, 16, 4, 2);
    // Grill marks
    g.lineStyle(3, 0x5a2414, 0.75);
    g.lineBetween(10, 22, 16, 4);
    g.lineBetween(18, 22, 24, 4);
  });
  make(scene, 'hitbox', 10, 10, (g) => {
    g.fillStyle(0xffffff, 1).fillCircle(5, 5, 4);
    g.lineStyle(1.5, 0xff2a2a, 1).strokeCircle(5, 5, 4);
  });

  // --- Weapon icons that sit on each link ---------------------------------
  make(scene, 'icon-toothpick', 16, 16, (g) => {
    g.lineStyle(3, 0xe8d3a0, 1).lineBetween(2, 14, 14, 2);
    g.fillStyle(0x3c8d3c, 1).fillTriangle(2, 14, 5, 14, 2, 11);
  });
  make(scene, 'icon-mustard', 16, 16, (g) => {
    g.fillStyle(0xf2c418, 1).fillCircle(8, 10, 5).fillTriangle(3, 9, 13, 9, 8, 1);
  });
  make(scene, 'icon-pepper', 16, 16, (g) => {
    g.fillStyle(0x333333, 1).fillRoundedRect(4, 4, 8, 11, 2);
    g.fillStyle(0x888888, 1).fillCircle(8, 3, 3);
  });
  make(scene, 'icon-skewer', 16, 16, (g) => {
    g.lineStyle(2, 0xd0d8e0, 1).lineBetween(1, 8, 15, 8);
    g.fillStyle(0xd0d8e0, 1).fillTriangle(15, 8, 11, 5, 11, 11);
  });
  make(scene, 'icon-pickle', 16, 16, (g) => {
    g.fillStyle(0x5fae3a, 1).fillEllipse(8, 8, 14, 9);
    g.fillStyle(0x3d7a22, 1).fillCircle(5, 7, 1).fillCircle(9, 9, 1).fillCircle(11, 6, 1);
  });
  make(scene, 'icon-onion', 16, 16, (g) => {
    g.lineStyle(3, 0xf3ead2, 1).strokeCircle(8, 8, 5);
  });

  // --- Player projectiles --------------------------------------------------
  make(scene, 'pb-toothpick', 18, 4, (g) => {
    g.fillStyle(0xf0dfb0, 1).fillRect(0, 1, 18, 2);
    g.fillStyle(0xffffff, 1).fillRect(14, 1, 4, 2);
  });
  make(scene, 'pb-mustard', 10, 10, (g) => {
    g.fillStyle(0xf2c418, 1).fillCircle(5, 5, 5);
    g.fillStyle(0xfff3a0, 1).fillCircle(4, 4, 2);
  });
  make(scene, 'pb-pepper', 7, 7, (g) => {
    g.fillStyle(0x2a2a2a, 1).fillCircle(3.5, 3.5, 3.5);
    g.fillStyle(0x777777, 1).fillCircle(2.5, 2.5, 1.2);
  });
  make(scene, 'pb-skewer', 24, 6, (g) => {
    g.fillStyle(0xc0c8d0, 1).fillRect(0, 2, 18, 2);
    g.fillTriangle(18, 0, 18, 6, 24, 3);
  });
  make(scene, 'pb-pickle', 18, 12, (g) => {
    g.fillStyle(0x3d7a22, 1).fillEllipse(9, 6, 18, 12);
    g.fillStyle(0x6fc444, 1).fillEllipse(9, 5, 14, 8);
  });
  make(scene, 'onion-ring', 20, 20, (g) => {
    g.lineStyle(5, 0xc9a25a, 1).strokeCircle(10, 10, 7);
    g.lineStyle(2, 0xf8eecf, 1).strokeCircle(10, 10, 7);
  });

  // --- Enemy bullets: bright core + coloured rim for readability -----------
  const enemyBullet = (key: string, rim: number, size: number) =>
    make(scene, key, size, size, (g) => {
      const r = size / 2;
      g.fillStyle(rim, 1).fillCircle(r, r, r);
      g.fillStyle(0xffffff, 1).fillCircle(r, r, r * 0.5);
    });
  enemyBullet('eb-ketchup', 0xe0242c, 12);
  enemyBullet('eb-hot', 0xff7a00, 12);
  enemyBullet('eb-boss', 0xb040ff, 14);

  // --- Enemies (drawn facing up; rotated toward the player at runtime) -----
  make(scene, 'enemy-fork', 28, 44, (g) => {
    g.fillStyle(0x9aa4ae, 1);
    g.fillRect(4, 2, 4, 16).fillRect(12, 0, 4, 18).fillRect(20, 2, 4, 16);
    g.fillRoundedRect(3, 14, 22, 9, 4);
    g.fillRect(11, 22, 6, 22);
    g.fillStyle(0xd8dee4, 1).fillRect(13, 24, 2, 18);
    eye(g, 9, 19, 3, true);
    eye(g, 19, 19, 3, true);
  });
  make(scene, 'enemy-spatula', 36, 50, (g) => {
    g.fillStyle(0x2b2b2b, 1).fillRoundedRect(2, 0, 32, 26, 5);
    g.fillStyle(0x444444, 1);
    g.fillRect(8, 5, 3, 14).fillRect(16, 5, 3, 14).fillRect(24, 5, 3, 14);
    g.fillStyle(0x8b5a2b, 1).fillRect(15, 26, 6, 24);
    eye(g, 11, 13, 4, true);
    eye(g, 25, 13, 4, true);
  });
  make(scene, 'enemy-ketchup', 30, 44, (g) => {
    g.fillStyle(0xffffff, 1).fillRect(11, 0, 8, 8);
    g.fillStyle(0xf2f2f2, 1).fillRoundedRect(7, 6, 16, 6, 2);
    g.fillStyle(0xc81d25, 1).fillRoundedRect(2, 10, 26, 34, 8);
    g.fillStyle(0xf0f0f0, 1).fillRoundedRect(6, 24, 18, 10, 3);
    g.fillStyle(0xc81d25, 1).fillCircle(15, 29, 3);
    eye(g, 10, 17, 3.5, true);
    eye(g, 20, 17, 3.5, true);
  });
  make(scene, 'enemy-hotsauce', 34, 40, (g) => {
    g.fillStyle(0x2f8a3a, 1).fillRect(12, 0, 10, 8);
    g.fillStyle(0xff5a00, 1).fillRoundedRect(4, 8, 26, 32, 7);
    g.fillStyle(0xffc400, 1).fillTriangle(17, 18, 11, 34, 23, 34);
    g.fillStyle(0xff5a00, 1).fillTriangle(17, 25, 14, 33, 20, 33);
    eye(g, 11, 15, 3.5, true);
    eye(g, 23, 15, 3.5, true);
  });
  make(scene, 'enemy-tongs', 120, 130, (g) => {
    // Two arms meeting at a hinge, with a scary face.
    g.fillStyle(0x7d8790, 1);
    g.fillTriangle(10, 0, 30, 0, 64, 110);
    g.fillTriangle(90, 0, 110, 0, 56, 110);
    g.fillStyle(0xb8c0c8, 1);
    g.fillTriangle(16, 0, 26, 0, 60, 100);
    g.fillTriangle(94, 0, 104, 0, 60, 100);
    g.fillStyle(0x222222, 1).fillRoundedRect(36, 92, 48, 38, 12);
    g.fillStyle(0xff2a2a, 1).fillCircle(50, 106, 6).fillCircle(70, 106, 6);
    g.fillStyle(0xffd0d0, 1).fillCircle(50, 106, 2).fillCircle(70, 106, 2);
    g.lineStyle(3, 0xff2a2a, 1).lineBetween(46, 120, 74, 120);
  });

  // --- Pickups and FX -------------------------------------------------------
  make(scene, 'crumb', 10, 10, (g) => {
    g.fillStyle(0x9c6a2a, 1).fillPoints([
      { x: 1, y: 4 }, { x: 4, y: 0 }, { x: 9, y: 2 }, { x: 10, y: 7 }, { x: 5, y: 10 }, { x: 0, y: 8 },
    ], true);
    g.fillStyle(0xe0b060, 1).fillCircle(5, 4, 2);
  });
  make(scene, 'condiment', 18, 14, (g) => {
    g.fillStyle(0x7fd3ff, 1).fillRoundedRect(0, 0, 18, 14, 3);
    g.fillStyle(0xffffff, 1).fillRect(3, 5, 12, 4);
    g.fillStyle(0x2a7fbf, 1).fillCircle(9, 7, 2);
  });
  make(scene, 'spawn-mark', 24, 24, (g) => {
    g.lineStyle(4, 0xff3a3a, 1);
    g.lineBetween(3, 3, 21, 21);
    g.lineBetween(21, 3, 3, 21);
  });
  make(scene, 'spark', 6, 6, (g) => {
    g.fillStyle(0xffffff, 1).fillCircle(3, 3, 3);
  });
  make(scene, 'smoke', 16, 16, (g) => {
    g.fillStyle(0xffffff, 1).fillCircle(8, 8, 8);
  });
  make(scene, 'ring', 64, 64, (g) => {
    g.lineStyle(4, 0xffffff, 1).strokeCircle(32, 32, 30);
  });

  // --- Arena backdrop: charcoal grill with grates --------------------------
  make(scene, 'bg-grill', GAME_W, GAME_H, (g) => {
    g.fillStyle(0x1e1714, 1).fillRect(0, 0, GAME_W, GAME_H);
    // Glowing coals peeking through
    for (let i = 0; i < 220; i++) {
      const x = (i * 977) % GAME_W;
      const y = (i * 563) % GAME_H;
      g.fillStyle(i % 3 === 0 ? 0x5a1a08 : 0x2c1c16, 0.8).fillCircle(x, y, 6 + (i % 5) * 3);
    }
    g.fillStyle(0x3a3532, 1);
    for (let y = 40; y < GAME_H; y += 36) g.fillRect(0, y, GAME_W, 7);
    g.fillStyle(0x56504b, 1);
    for (let y = 40; y < GAME_H; y += 36) g.fillRect(0, y, GAME_W, 2);
  });
}
