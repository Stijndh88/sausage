import Phaser from 'phaser';
import { GAME_H, GAME_W } from './art/textures';
import { waveConfig } from './data/waves';
import { newRun } from './state/run';
import { audio } from './audio/Audio';
import { BootScene } from './scenes/Boot';
import { GameScene } from './scenes/Game';
import { GameOverScene } from './scenes/GameOver';
import { MenuScene } from './scenes/Menu';
import { SelectScene } from './scenes/Select';
import { ShopScene } from './scenes/Shop';
import { VictoryScene } from './scenes/Victory';
import { ChoiceScene } from './scenes/Choice';
import { SpiceRackScene } from './scenes/SpiceRack';
import { CookbookScene } from './scenes/Cookbook';
import { loadSave, resetSaveCache, writeSave } from './state/save';
import { settleRun } from './state/meta';
import { RENDER_SCALE } from './ui/view';

// Every scene.add.text renders at the render scale, so text stays sharp on big / high-DPI screens.
type TextFactory = (x: number, y: number, text: string | string[], style?: Phaser.Types.GameObjects.Text.TextStyle) => Phaser.GameObjects.Text;
const factory = Phaser.GameObjects.GameObjectFactory.prototype as unknown as { text: TextFactory };
const originalText = factory.text;
factory.text = function (this: Phaser.GameObjects.GameObjectFactory, x, y, text, style) {
  return originalText.call(this, x, y, text, { resolution: RENDER_SCALE, ...style });
};

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  // The world is 1280×720; the canvas is that times the render scale (see ui/view.ts).
  width: Math.round(GAME_W * RENDER_SCALE),
  height: Math.round(GAME_H * RENDER_SCALE),
  backgroundColor: '#1a1210',
  // Cap the engine's frame delta at 100ms (10 fps). Physics, tweens, timers and the Game
  // scene's clock all use this same delta, so on a struggling device they slow down together
  // instead of drifting apart. (Arcade physics still sub-steps at a fixed 60Hz.)
  fps: { min: 10 },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  input: { gamepad: true, activePointers: 3 },
  physics: {
    default: 'arcade',
    arcade: { debug: false },
  },
  scene: [BootScene, MenuScene, SelectScene, GameScene, ShopScene, GameOverScene, VictoryScene, ChoiceScene, SpiceRackScene, CookbookScene],
});

// Browsers only allow sound after a user gesture: start audio on the first key, click or tap.
for (const ev of ['keydown', 'pointerdown', 'touchstart'] as const) {
  window.addEventListener(ev, () => audio.unlock(), { passive: true });
}

// Hooks for automated tests (tests/e2e). Harmless in normal play.
Object.assign(window as unknown as Record<string, unknown>, {
  __game: game,
  __debug: { newRun, waveConfig, loadSave, writeSave, resetSaveCache, settleRun },
  __audio: audio,
  __renderScale: RENDER_SCALE,
});
