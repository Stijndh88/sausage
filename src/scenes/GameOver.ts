import Phaser from 'phaser';
import { GAME_H, GAME_W } from '../art/textures';
import { TOTAL_WAVES } from '../data/waves';
import { SAUSAGES } from '../data/sausages';
import { newRun, type RunState } from '../state/run';
import { recordRun } from '../state/save';
import { audio } from '../audio/Audio';
import { PadPoller } from '../ui/pad';
import { Button } from '../ui/Button';
import { FONT } from '../ui/Hud';
import { onKeyPress } from '../ui/input';

/** Shared layout for the end-of-run screens. */
export function endScreen(scene: Phaser.Scene, run: RunState, title: string, subtitle: string, color: string, headTint: number, won = false): void {
  // Save progress first: best wave, wins, and any sausage this run unlocked.
  const unlocked = recordRun(run.sausage, Math.min(run.wave, TOTAL_WAVES), won);
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
    `Sausage          ${SAUSAGES[run.sausage].name}`,
  ];
  // Six lines, kept clear of the "new sausage unlocked" banner below.
  scene.add.text(GAME_W / 2, 428, lines.join('\n'), {
    fontFamily: 'monospace', fontSize: '20px', color: '#ffffff', lineSpacing: 4,
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
  const again = () => go('Game', { run: newRun(undefined, run.sausage) });
  if (unlocked.length) {
    audio.play('unlock');
    const t = scene.add.text(GAME_W / 2, 545, `NEW SAUSAGE UNLOCKED: ${unlocked.map((id) => SAUSAGES[id].name).join(', ')}!`, {
      fontFamily: FONT, fontSize: '22px', fontStyle: 'bold', color: '#ffd23f', stroke: '#000', strokeThickness: 5,
    }).setOrigin(0.5);
    scene.tweens.add({ targets: t, scale: 1.08, duration: 500, yoyo: true, repeat: -1 });
  }
  new Button(scene, GAME_W / 2 - 150, 600, 'Try again (Enter)', { width: 260, height: 56 }, again);
  new Button(scene, GAME_W / 2 + 150, 600, 'Main menu (Esc)', { width: 260, height: 56, fill: 0x5a4a3a, hover: 0x7a6650 }, () => go('Menu'));
  onKeyPress(scene.input.keyboard!, 'ENTER', again, () => scene.time.now >= readyAt);
  onKeyPress(scene.input.keyboard!, 'ESC', () => go('Menu'), () => scene.time.now >= readyAt);
  // Gamepad: A / Start = try again, B = main menu.
  const pad = new PadPoller();
  const onUpdate = () => {
    for (const b of pad.poll(scene)) {
      if (scene.time.now < readyAt) continue;
      if (b === 'a' || b === 'start') again();
      else if (b === 'b') go('Menu');
    }
  };
  scene.events.on(Phaser.Scenes.Events.UPDATE, onUpdate);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.events.off(Phaser.Scenes.Events.UPDATE, onUpdate));
}

export class GameOverScene extends Phaser.Scene {
  constructor() {
    super('GameOver');
  }

  create(data: { run: RunState }): void {
    const cause = data.run.causeOfDeath ? `Done in by ${data.run.causeOfDeath} on wave ${data.run.wave}.` : 'That sausage is done.';
    endScreen(this, data.run, 'SKEWERED', cause, '#ff6a3a', 0x6a6a6a);
  }
}
