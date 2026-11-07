import type Phaser from 'phaser';
import type { SausageId } from '../data/sausages';
import { newRun } from '../state/run';
import { loadSave, pickedChili } from '../state/save';

/** Starts a fresh run with this sausage, the current Spice Rack and the Chili level picked for it. */
export function startRun(scene: Phaser.Scene, sausage: SausageId): void {
  const save = loadSave();
  const run = newRun(undefined, sausage, { talents: save.talents, chili: pickedChili(sausage, save) });
  scene.scene.start('Game', { run });
}
