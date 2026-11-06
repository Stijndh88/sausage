import Phaser from 'phaser';
import { GAME_H, GAME_W } from './art/textures';
import { waveConfig } from './data/waves';
import { newRun } from './state/run';
import { BootScene } from './scenes/Boot';
import { GameScene } from './scenes/Game';
import { GameOverScene } from './scenes/GameOver';
import { MenuScene } from './scenes/Menu';
import { ShopScene } from './scenes/Shop';
import { VictoryScene } from './scenes/Victory';

const game = new Phaser.Game({
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

// Hooks for automated tests (tests/e2e). Harmless in normal play.
Object.assign(window as unknown as Record<string, unknown>, {
  __game: game,
  __debug: { newRun, waveConfig },
});
