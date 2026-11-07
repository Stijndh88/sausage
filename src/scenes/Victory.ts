import Phaser from 'phaser';
import { GAME_W } from '../art/textures';
import type { RunState } from '../state/run';
import { endScreen } from './GameOver';
import { fitCamera } from '../ui/view';

export class VictoryScene extends Phaser.Scene {
  constructor() {
    super('Victory');
  }

  create(data: { run: RunState }): void {
    fitCamera(this);
    endScreen(this, data.run, 'YOU ESCAPED!', 'The Grill Master will never find you now.', '#9cff7a', 0xffffff, true);
    // Confetti made of crumbs.
    this.add.particles(0, -10, 'crumb', {
      x: { min: 0, max: GAME_W },
      lifespan: 4000,
      speedY: { min: 80, max: 180 },
      speedX: { min: -30, max: 30 },
      rotate: { min: 0, max: 360 },
      scale: { min: 1, max: 2 },
      frequency: 60,
    });
  }
}
