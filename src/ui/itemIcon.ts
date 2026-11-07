import type Phaser from 'phaser';
import type { ItemDef } from '../data/items';

/**
 * An item's icon, at most `fit` pixels on its longest side: its painted icon (item-<id>) if there
 * is one, otherwise the tinted pictogram.
 */
export function itemIcon(scene: Phaser.Scene, x: number, y: number, item: ItemDef, fit: number): Phaser.GameObjects.Image {
  const painted = `item-${item.id}`;
  if (scene.textures.exists(painted)) {
    const img = scene.add.image(x, y, painted);
    return img.setScale(Math.min(1, fit / Math.max(img.width, img.height)));
  }
  return scene.add.image(x, y, `icon-item-${item.icon}`).setScale(fit / 40).setTint(item.color);
}
