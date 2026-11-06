import Phaser from 'phaser';
import { GAME_H, GAME_W } from '../art/textures';
import { newRun } from '../state/run';
import { Button } from '../ui/Button';
import { FONT } from '../ui/Hud';
import { onKeyPress } from '../ui/input';

export class MenuScene extends Phaser.Scene {
  private head!: Phaser.GameObjects.Image;
  private links: Phaser.GameObjects.Image[] = [];
  private icons: Phaser.GameObjects.Image[] = [];

  constructor() {
    super('Menu');
  }

  update(time: number): void {
    this.links.forEach((l, i) => {
      const y = 250 + Math.sin(time / 220 - i * 0.8) * 10;
      l.y = y;
      this.icons[i].y = y;
    });
    this.head.y = 250 + Math.sin(time / 220 + 0.8) * 10;
  }

  create(): void {
    this.add.image(0, 0, 'bg-grill').setOrigin(0);
    this.add.rectangle(0, 0, GAME_W, GAME_H, 0x140d0a, 0.45).setOrigin(0);

    // A happy little sausage wiggling across the title.
    this.head = this.add.image(GAME_W / 2 + 70, 250, 'sausage-head').setScale(3);
    this.links = [0, 1, 2, 3].map((i) => this.add.image(GAME_W / 2 - 20 - i * 64, 250, 'sausage-link').setScale(2.6));
    this.icons = ['icon-toothpick', 'icon-mustard', 'icon-pickle', 'icon-onion'].map((k, i) =>
      this.add.image(GAME_W / 2 - 20 - i * 64, 250, k).setScale(2.4));

    this.add.text(GAME_W / 2, 110, 'WURST CASE SCENARIO', {
      fontFamily: FONT, fontSize: '72px', fontStyle: 'bold', color: '#ffd9a0', stroke: '#3a1408', strokeThickness: 10,
    }).setOrigin(0.5);
    this.add.text(GAME_W / 2, 170, 'Escape the backyard BBQ.', { fontFamily: FONT, fontSize: '22px', color: '#e8c8a8' }).setOrigin(0.5);

    const help = [
      'WASD / Arrows   move          Space / Shift   dash          Esc   pause',
      '',
      'Your weapons ride on your sausage links and fire on their own.',
      'Only your head can be hit. The white dot is your hitbox.',
      '',
      'DONENESS replaces health. Hits and grill tiles heat you up.',
      'Hotter = more damage. Reach 100° and you are CHARRED.',
      'Blue condiment packets cool you down.',
    ];
    this.add.text(GAME_W / 2, 440, help.join('\n'), {
      fontFamily: FONT, fontSize: '18px', color: '#ffffff', align: 'center', lineSpacing: 6,
    }).setOrigin(0.5);

    let leaving = false;
    const start = () => {
      if (leaving) return;
      leaving = true;
      this.scene.start('Game', { run: newRun() });
    };
    new Button(this, GAME_W / 2, 630, 'START  (Enter)', { width: 280, height: 60, fontSize: 24 }, start);
    onKeyPress(this.input.keyboard!, 'ENTER', start);
    onKeyPress(this.input.keyboard!, 'SPACE', start);
  }
}
