import Phaser from 'phaser';
import { GAME_H, GAME_W } from './art/textures';
import { BootScene } from './scenes/Boot';
import { GameScene } from './scenes/Game';
import { GameOverScene } from './scenes/GameOver';
import { MenuScene } from './scenes/Menu';
import { ShopScene } from './scenes/Shop';
import { VictoryScene } from './scenes/Victory';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_W,
  height: GAME_H,
  backgroundColor: '#1a1210',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
    arcade: { debug: false },
  },
  scene: [BootScene, MenuScene, GameScene, ShopScene, GameOverScene, VictoryScene],
});
