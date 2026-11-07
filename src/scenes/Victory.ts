import Phaser from 'phaser';
import { GAME_W } from '../art/textures';
import { bossName, courseName, locate } from '../data/courses';
import { endScreen, type EndData } from './GameOver';
import { fitCamera } from '../ui/view';

/** Took it home: the whole bag is banked. */
export class VictoryScene extends Phaser.Scene {
  constructor() {
    super('Victory');
  }

  create(data: EndData): void {
    fitCamera(this);
    const loc = locate(data.run.wave);
    const sub = loc.course === 0
      ? 'The Grill Master will never find you now.'
      : `You beat ${bossName(loc.course)} and got out of ${courseName(loc.course)}.`;
    endScreen(this, { ...data, outcome: 'home' }, 'TAKEN HOME!', sub, '#9cff7a', 0xffffff);
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
