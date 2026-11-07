import Phaser from 'phaser';
import { GAME_H, GAME_W, RENDER_SCALE } from '../ui/view';

// The world size lives in ui/view.ts (it decides the render scale); re-exported here for convenience.
export { GAME_H, GAME_W };

/**
 * Art drawn in code, cached under fixed keys. Most keys are replaced by painted sprites
 * (art/sprites.ts, loaded first); `make` skips any key that already exists, so these drawings are
 * only used where no PNG exists. The arena, hitbox and white tintable effects are always drawn here.
 */

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


/** Pictogram kinds for shop items; each is drawn in white and tinted with the item's colour. */
export type ItemIcon =
  | 'chili' | 'bolt' | 'boot' | 'shield' | 'heart' | 'heartplus' | 'drop' | 'magnet' | 'coin'
  | 'wing' | 'star' | 'swirl' | 'burst' | 'clover' | 'spikes' | 'apron' | 'dots' | 'crown' | 'flask' | 'ring' | 'spear';

const ICON_SIZE = 40;

function star(g: Phaser.GameObjects.Graphics, cx: number, cy: number, r1: number, r2: number, n: number): void {
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 === 0 ? r1 : r2;
    const a = -Math.PI / 2 + (i * Math.PI) / n;
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  g.fillPoints(pts, true);
}

const ICON_DRAW: Record<ItemIcon, (g: Phaser.GameObjects.Graphics) => void> = {
  chili: (g) => {
    g.fillEllipse(20, 24, 14, 26);
    g.fillTriangle(13, 30, 27, 30, 20, 38);
    g.fillRect(18, 6, 4, 8);
  },
  bolt: (g) => g.fillPoints([{ x: 24, y: 3 }, { x: 10, y: 22 }, { x: 19, y: 22 }, { x: 15, y: 37 }, { x: 30, y: 16 }, { x: 21, y: 16 }], true),
  boot: (g) => {
    for (const x of [6, 17]) g.fillPoints([{ x, y: 8 }, { x: x + 12, y: 20 }, { x, y: 32 }, { x: x + 5, y: 20 }], true);
  },
  shield: (g) => g.fillPoints([{ x: 20, y: 4 }, { x: 34, y: 9 }, { x: 32, y: 24 }, { x: 20, y: 37 }, { x: 8, y: 24 }, { x: 6, y: 9 }], true),
  heart: (g) => {
    g.fillCircle(14, 15, 8).fillCircle(26, 15, 8);
    g.fillTriangle(6.5, 18, 33.5, 18, 20, 35);
  },
  heartplus: (g) => {
    ICON_DRAW.heart(g);
    g.fillStyle(0x000000, 0.55).fillRect(18, 11, 4, 14).fillRect(13, 16, 14, 4);
  },
  drop: (g) => {
    g.fillCircle(20, 25, 10);
    g.fillTriangle(11, 21, 29, 21, 20, 4);
  },
  magnet: (g) => {
    g.lineStyle(7, 0xffffff, 1).beginPath().arc(20, 18, 10, Math.PI, 0, false).strokePath();
    g.fillRect(6.5, 18, 7, 14).fillRect(26.5, 18, 7, 14);
  },
  coin: (g) => {
    g.fillCircle(20, 20, 15);
    g.fillStyle(0x000000, 0.35).fillCircle(20, 20, 10);
    g.fillStyle(0xffffff, 1).fillRect(18, 13, 4, 14);
  },
  wing: (g) => {
    g.fillPoints([{ x: 4, y: 28 }, { x: 36, y: 8 }, { x: 30, y: 18 }, { x: 34, y: 20 }, { x: 24, y: 28 }, { x: 26, y: 31 }], true);
  },
  star: (g) => star(g, 20, 21, 16, 7, 5),
  swirl: (g) => {
    g.lineStyle(4, 0xffffff, 1);
    g.beginPath().arc(20, 20, 14, 0.3, Math.PI * 1.5, false).strokePath();
    g.beginPath().arc(20, 20, 7, Math.PI * 1.2, Math.PI * 2.8, false).strokePath();
  },
  burst: (g) => star(g, 20, 20, 18, 8, 8),
  clover: (g) => {
    g.fillCircle(14, 14, 7).fillCircle(26, 14, 7).fillCircle(14, 26, 7).fillCircle(26, 26, 7);
    g.fillRect(19, 26, 3, 12);
  },
  spikes: (g) => {
    g.fillCircle(20, 20, 9);
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      g.fillTriangle(20 + Math.cos(a - 0.3) * 8, 20 + Math.sin(a - 0.3) * 8, 20 + Math.cos(a + 0.3) * 8, 20 + Math.sin(a + 0.3) * 8, 20 + Math.cos(a) * 18, 20 + Math.sin(a) * 18);
    }
  },
  apron: (g) => {
    g.fillPoints([{ x: 12, y: 6 }, { x: 28, y: 6 }, { x: 28, y: 14 }, { x: 34, y: 18 }, { x: 31, y: 36 }, { x: 9, y: 36 }, { x: 6, y: 18 }, { x: 12, y: 14 }], true);
    g.fillStyle(0x000000, 0.4).fillRect(14, 22, 12, 8);
  },
  dots: (g) => {
    g.fillCircle(10, 26, 6).fillCircle(20, 14, 6).fillCircle(30, 26, 6);
  },
  crown: (g) => {
    g.fillPoints([{ x: 5, y: 32 }, { x: 5, y: 12 }, { x: 13, y: 20 }, { x: 20, y: 6 }, { x: 27, y: 20 }, { x: 35, y: 12 }, { x: 35, y: 32 }], true);
  },
  flask: (g) => {
    g.fillRect(16, 4, 8, 10);
    g.fillPoints([{ x: 16, y: 14 }, { x: 24, y: 14 }, { x: 34, y: 34 }, { x: 6, y: 34 }], true);
  },
  ring: (g) => {
    ICON_DRAW.heart(g);
    g.lineStyle(3, 0xffffff, 1).strokeCircle(20, 20, 18);
  },
  spear: (g) => {
    // A spike through a block: piercing.
    g.fillRect(12, 14, 16, 14);
    g.lineStyle(4, 0xffffff, 1).lineBetween(3, 33, 30, 8);
    g.fillTriangle(27, 5, 37, 2, 33, 12);
  },
};

export const ITEM_ICONS = Object.keys(ICON_DRAW) as ItemIcon[];

function generateItemIcons(scene: Phaser.Scene): void {
  for (const kind of ITEM_ICONS) {
    make(scene, `icon-item-${kind}`, ICON_SIZE, ICON_SIZE, (g) => {
      g.fillStyle(0xffffff, 1);
      ICON_DRAW[kind](g);
    });
  }
  make(scene, 'icon-lock', 20, 22, (g) => {
    g.lineStyle(3, 0xffffff, 1).beginPath().arc(10, 9, 6, Math.PI, 0, false).strokePath();
    g.fillStyle(0xffffff, 1).fillRoundedRect(2, 9, 16, 12, 3);
    g.fillStyle(0x000000, 0.5).fillRect(9, 13, 2, 4);
  });
}

/** Pixels per in-game pixel for the event props and track icons (shown with setDisplaySize). */
export const EVENT_TEX_SCALE = 2;

/** Props for timed events (see data/events.ts) and their icons on the HUD event track. */
function generateEventTextures(scene: Phaser.Scene): void {
  const k = EVENT_TEX_SCALE;
  const scaled = (key: string, w: number, h: number, draw: Draw) =>
    make(scene, key, w * k, h * k, (g) => { g.scaleCanvas(k, k); draw(g); });

  const basket = (g: Phaser.GameObjects.Graphics, w: number, h: number) => {
    // Handle, wicker body, red-and-white checked cloth.
    g.lineStyle(h * 0.1, 0x7a4a20, 1).beginPath();
    g.arc(w / 2, h * 0.45, w * 0.3, Math.PI, 0, false).strokePath();
    g.fillStyle(0x5a3414, 1).fillRoundedRect(w * 0.06, h * 0.42, w * 0.88, h * 0.54, h * 0.1);
    g.fillStyle(0xb87a3a, 1).fillRoundedRect(w * 0.1, h * 0.46, w * 0.8, h * 0.46, h * 0.08);
    g.lineStyle(Math.max(1, h * 0.05), 0x7a4a20, 1);
    for (let i = 1; i < 4; i++) g.lineBetween(w * 0.1, h * (0.46 + 0.115 * i), w * 0.9, h * (0.46 + 0.115 * i));
    const cell = w * 0.8 / 6;
    for (let i = 0; i < 6; i++) {
      g.fillStyle(i % 2 ? 0xffffff : 0xe0242c, 1).fillRect(w * 0.1 + i * cell, h * 0.38, cell, h * 0.12);
    }
  };
  scaled('evt-basket', 52, 44, (g) => basket(g, 52, 44));
  scaled('evt-arrow', 28, 28, (g) => {
    g.fillStyle(0x1a0a05, 1).fillTriangle(26, 14, 4, 2, 4, 26);
    g.fillStyle(0xffffff, 1).fillTriangle(22, 14, 7, 6, 7, 22);
  });

  const icon = (key: string, draw: Draw) => scaled(`evt-icon-${key}`, 18, 18, (g) => {
    g.fillStyle(0x1a0f0a, 1).fillCircle(9, 9, 9);
    draw(g);
  });
  icon('basket', (g) => basket(g, 18, 18));
  icon('golden', (g) => {
    g.fillStyle(0xb8860b, 1).fillRoundedRect(2, 6, 14, 7, 3.5);
    g.fillStyle(0xffd23f, 1).fillRoundedRect(3, 7, 12, 5, 2.5);
    g.fillStyle(0xffffff, 0.8).fillRect(5, 8, 6, 1);
  });
  icon('goblin', (g) => {
    g.fillStyle(0xb0622a, 1).fillCircle(9, 10.5, 5.5);
    g.fillStyle(0xffd23f, 1).fillEllipse(9, 6.5, 10, 4.5);
    g.fillStyle(0xfff2a8, 1).fillCircle(7, 5.5, 1.2).fillCircle(11.5, 6, 1);
  });
  icon('happy', (g) => {
    g.fillStyle(0xffb030, 1).fillRect(4, 6, 8, 9);
    g.lineStyle(1.5, 0xffb030, 1).strokeRect(12, 8, 3, 4);
    g.fillStyle(0xffffff, 1).fillCircle(6, 5, 2.2).fillCircle(9, 4.5, 2.4).fillCircle(11.5, 5.2, 2);
  });
  icon('bounty', (g) => {
    g.lineStyle(1.6, 0x8fd3ff, 1).strokeCircle(9, 9, 6);
    g.fillStyle(0x8fd3ff, 1).fillCircle(9, 9, 2.4);
    g.lineBetween(9, 1, 9, 5).lineBetween(9, 13, 9, 17).lineBetween(1, 9, 5, 9).lineBetween(13, 9, 17, 9);
  });
  icon('elite', (g) => {
    const pts: Phaser.Math.Vector2[] = [];
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 3 : 7.5;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      pts.push(new Phaser.Math.Vector2(9 + Math.cos(a) * r, 9.5 + Math.sin(a) * r));
    }
    g.fillStyle(0xd070ff, 1).fillPoints(pts, true);
  });
  icon('stampede', (g) => {
    g.lineStyle(1.6, 0xff6a5a, 1);
    g.lineBetween(9, 9, 9, 16);
    g.lineBetween(6, 3, 6, 9).lineBetween(9, 3, 9, 9).lineBetween(12, 3, 12, 9).lineBetween(6, 9, 12, 9);
  });
  icon('flare', (g) => {
    g.fillStyle(0xff5a00, 1).fillCircle(9, 11.5, 4.5).fillTriangle(4.6, 11, 13.4, 11, 9, 2);
    g.fillStyle(0xffd060, 1).fillCircle(9, 12.5, 2.4).fillTriangle(6.8, 12, 11.2, 12, 9, 6.5);
  });
  icon('rain', (g) => {
    g.fillStyle(0xe0242c, 1).fillCircle(9, 11, 4.5).fillTriangle(4.6, 10, 13.4, 10, 9, 2.5);
    g.fillStyle(0xffffff, 0.7).fillCircle(7.5, 11, 1.2);
  });
}

export function generateTextures(scene: Phaser.Scene): void {
  generateItemIcons(scene);
  generateEventTextures(scene);
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
  // Player shots are elongated and have no white core, so "round with a white core" always means danger.
  make(scene, 'pb-mustard', 16, 8, (g) => {
    g.fillStyle(0xf2c418, 0.9).fillEllipse(8, 4, 16, 7);
    g.fillStyle(0xffe680, 0.9).fillEllipse(10, 3.5, 6, 3);
  });
  make(scene, 'pb-pepper', 9, 9, (g) => {
    g.fillStyle(0xd8d0c4, 1).fillCircle(4.5, 4.5, 4.5);
    g.fillStyle(0x2a2a2a, 1).fillCircle(4.5, 4.5, 3.2);
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
      // A dark outline keeps enemy bullets visible over the bright grill bars.
      const r = size / 2;
      g.fillStyle(0x1a0a05, 1).fillCircle(r, r, r);
      g.fillStyle(rim, 1).fillCircle(r, r, r - 1.5);
      g.fillStyle(0xffffff, 1).fillCircle(r, r, (r - 1.5) * 0.5);
    });
  enemyBullet('eb-ketchup', 0xe0242c, 13);
  enemyBullet('eb-hot', 0xff7a00, 13);
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
    // Light rim: a black spatula on a black grill was nearly invisible (1.25:1).
    g.fillStyle(0xc9c2b8, 1).fillRoundedRect(0, 0, 36, 28, 6);
    g.fillStyle(0x2b2b2b, 1).fillRoundedRect(2, 2, 32, 24, 5);
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
  // Placeholder until the painted loot goblin arrives: a hunched jerky gremlin hugging a pot of gold.
  make(scene, 'enemy-goblin', 40, 40, (g) => {
    g.fillStyle(0x2a120a, 1).fillEllipse(20, 25, 34, 28); // outline
    g.fillStyle(0x8a3b26, 1).fillEllipse(20, 25, 30, 24); // jerky back
    g.fillStyle(0xb85a36, 1).fillEllipse(17, 22, 16, 10);
    g.fillStyle(0x8a3b26, 1).fillCircle(7, 14, 4).fillCircle(33, 14, 4); // knees
    g.fillStyle(0x2a120a, 1).fillCircle(20, 9, 9); // pot
    g.fillStyle(0xb0622a, 1).fillCircle(20, 9, 7.5);
    g.fillStyle(0xffd23f, 1).fillEllipse(20, 6, 12, 6); // gold in the pot
    g.fillStyle(0xfff2a8, 1).fillCircle(17, 5, 1.5).fillCircle(23, 6, 1.2);
    eye(g, 14, 21, 3.5);
    eye(g, 26, 21, 3.5);
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
  make(scene, 'crumb', 12, 12, (g) => {
    g.fillStyle(0xf6e2b0, 1).fillCircle(6, 6, 6);
    g.fillStyle(0x9c6a2a, 1).translateCanvas(1, 1).fillPoints([
      { x: 1, y: 4 }, { x: 4, y: 0 }, { x: 9, y: 2 }, { x: 10, y: 7 }, { x: 5, y: 10 }, { x: 0, y: 8 },
    ], true);
    g.fillStyle(0xe0b060, 1).fillCircle(5, 4, 2);
    g.translateCanvas(-1, -1);
  });
  make(scene, 'condiment', 18, 14, (g) => {
    g.fillStyle(0x7fd3ff, 1).fillRoundedRect(0, 0, 18, 14, 3);
    g.fillStyle(0xffffff, 1).fillRect(3, 5, 12, 4);
    g.fillStyle(0x2a7fbf, 1).fillCircle(9, 7, 2);
  });
  make(scene, 'spawn-mark', 26, 26, (g) => {
    // Dark outline + red + white core: readable on the grill, on hot tiles and for protanopes.
    g.lineStyle(8, 0x1a0a05, 1);
    g.lineBetween(4, 4, 22, 22).lineBetween(22, 4, 4, 22);
    g.lineStyle(5, 0xff3a3a, 1);
    g.lineBetween(4, 4, 22, 22).lineBetween(22, 4, 4, 22);
    g.lineStyle(1.5, 0xffffff, 1);
    g.lineBetween(5, 5, 21, 21).lineBetween(21, 5, 5, 21);
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
  // Drawn at the render scale so the full-screen backdrop is sharp on big screens;
  // scenes show it with setDisplaySize(GAME_W, GAME_H).
  make(scene, 'bg-grill', Math.round(GAME_W * RENDER_SCALE), Math.round(GAME_H * RENDER_SCALE), (g) => {
    g.scaleCanvas(RENDER_SCALE, RENDER_SCALE);
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
