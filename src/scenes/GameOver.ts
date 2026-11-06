import Phaser from 'phaser';
import { GAME_H, GAME_W } from '../art/textures';
import { TOTAL_WAVES } from '../data/waves';
import { newRun, type RunState } from '../state/run';
import { Button } from '../ui/Button';
import { FONT } from '../ui/Hud';
import { onKeyPress } from '../ui/input';

/** Shared layout for the end-of-run screens. */
export function endScreen(scene: Phaser.Scene, run: RunState, title: string, subtitle: string, color: string, headTint: number): void {
  scene.add.image(0, 0, 'bg-grill').setOrigin(0).setAlpha(0.4);
  scene.add.rectangle(0, 0, GAME_W, GAME_H, 0x0c0806, 0.65).setOrigin(0);
  scene.add.image(GAME_W / 2, 150, 'sausage-head').setScale(4).setTint(headTint);
  scene.add.text(GAME_W / 2, 250, title, {
    fontFamily: FONT, fontSize: '64px', fontStyle: 'bold', color, stroke: '#000', strokeThickness: 8,
  }).setOrigin(0.5);
  scene.add.text(GAME_W / 2, 310, subtitle, { fontFamily: FONT, fontSize: '22px', color: '#e8c8a8' }).setOrigin(0.5);

  const mins = Math.floor(run.timeSurvivedSec / 60);
  const secs = Math.floor(run.timeSurvivedSec % 60);
  const lines = [
    `Wave reached     ${Math.min(run.wave, TOTAL_WAVES)} / ${TOTAL_WAVES}`,
    `Utensils bent    ${run.kills}`,
    `Crumbs earned    ${run.crumbsEarned}`,
    `Time on grill    ${mins}:${String(secs).padStart(2, '0')}`,
    `Links            ${run.weapons.length}`,
  ];
  scene.add.text(GAME_W / 2, 430, lines.join('\n'), {
    fontFamily: 'monospace', fontSize: '22px', color: '#ffffff', lineSpacing: 8,
  }).setOrigin(0.5);

  // One shared guard: a click and a key in the same frame must not start two scenes.
  let leaving = false;
  const go = (key: string, data?: object) => {
    if (leaving) return;
    leaving = true;
    scene.scene.start(key, data);
  };
  // Ignore input briefly so a key held from the last fight doesn't skip the results.
  const readyAt = scene.time.now + 400;
  const again = () => go('Game', { run: newRun() });
  new Button(scene, GAME_W / 2 - 150, 600, 'Try again (Enter)', { width: 260, height: 56 }, again);
  new Button(scene, GAME_W / 2 + 150, 600, 'Main menu', { width: 260, height: 56, fill: 0x5a4a3a, hover: 0x7a6650 }, () => go('Menu'));
  onKeyPress(scene.input.keyboard!, 'ENTER', again, () => scene.time.now >= readyAt);
}

export class GameOverScene extends Phaser.Scene {
  constructor() {
    super('GameOver');
  }

  create(data: { run: RunState }): void {
    endScreen(this, data.run, 'CHARRED', 'Your sausage is extremely well done.', '#ff6a3a', 0x2a2a2a);
  }
}
