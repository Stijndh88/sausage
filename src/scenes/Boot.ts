import Phaser from 'phaser';
import { generateTextures } from '../art/textures';
import { buildSprites, preloadSprites } from '../art/sprites';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    preloadSprites(this);
  }

  create(): void {
    // Painted sprites first; the code-drawn placeholders only fill the keys still missing.
    buildSprites(this);
    generateTextures(this);
    this.scene.start('Menu');
  }
}
