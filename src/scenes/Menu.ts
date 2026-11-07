import Phaser from 'phaser';
import { GAME_H, GAME_W } from '../art/textures';
import { loadSave } from '../state/save';
import { COURSES } from '../data/courses';
import { Button } from '../ui/Button';
import { FONT } from '../ui/Hud';
import { onKeyPress } from '../ui/input';
import { SettingsPanel } from '../ui/SettingsPanel';
import { PadPoller } from '../ui/pad';
import { audio } from '../audio/Audio';
import { fitCamera } from '../ui/view';
import { labelForCode, layoutReady, moveLabel } from '../ui/keyboardLayout';
import { getSettings, onSettingsChange } from '../state/settings';

export class MenuScene extends Phaser.Scene {
  private head!: Phaser.GameObjects.Image;
  private links: Phaser.GameObjects.Image[] = [];
  private icons: Phaser.GameObjects.Image[] = [];
  private readonly pad = new PadPoller();
  private startFn: () => void = () => {};
  private rackFn: () => void = () => {};
  private bookFn: () => void = () => {};
  private settingsPanel: SettingsPanel | null = null;

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
    // Gamepad: A/Start to play, X for settings; the pad also drives the settings panel.
    const sp = this.settingsPanel;
    for (const b of this.pad.poll(this)) {
      if (sp?.isOpen) {
        if (b === 'up' || b === 'down') sp.navigate(b === 'up' ? -1 : 1);
        else if (b === 'left' || b === 'right') sp.change(b === 'left' ? -1 : 1);
        else if (b === 'a') sp.confirm();
        else if (b === 'b' || b === 'start') sp.back();
      } else if (b === 'a' || b === 'start') this.startFn();
      else if (b === 'x') sp?.show();
      else if (b === 'y') this.rackFn();
      else if (b === 'b') this.bookFn();
    }
  }

  create(): void {
    fitCamera(this);
    audio.setMood('menu');
    this.add.image(0, 0, 'bg-grill').setOrigin(0).setDisplaySize(GAME_W, GAME_H);
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

    // Key names as printed on this keyboard (ZQSD on AZERTY), from the player's bindings.
    const helpText = () => {
      const b = getSettings().keyBindings;
      const dash = b.dash.slice(0, 2).map(labelForCode).join(' / ');
      return [
        `Move: ${moveLabel(b)} / arrows / left stick        Dash: ${dash} / (A)        Pause: Esc / ${labelForCode(b.pause[0])} / (Start)`,
        '',
        'Your weapons ride on your links and fire on their own. Only your head can be hit.',
        'Tips pop up during your first wave. Change keys in Settings.',
      ].join('\n');
    };
    const help = this.add.text(GAME_W / 2, 440, helpText(), {
      fontFamily: FONT, fontSize: '17px', color: '#ffffff', align: 'center', lineSpacing: 8,
    }).setOrigin(0.5);
    const refreshHelp = () => { if (help.active) help.setText(helpText()); };
    void layoutReady.then(refreshHelp);
    const offSettings = onSettingsChange(refreshHelp);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, offSettings);

    let leaving = false;
    const settings = new SettingsPanel(this, () => {});
    this.settingsPanel = settings;
    const start = () => {
      if (leaving || settings.isOpen) return;
      leaving = true;
      this.scene.start('Select');
    };
    const save = loadSave();
    if (save.runs > 0) {
      const best = Math.max(0, ...Object.values(save.bestEscapeBy).map((n) => n ?? 0));
      const bestText = best ? `best: home after ${best <= COURSES.length ? COURSES[best - 1].name : `Seconds #${best - COURSES.length}`}` : 'not taken home yet';
      this.add.text(GAME_W / 2, 528, `${save.spice} Spice  ·  ${bestText}  ·  ${save.runs} run${save.runs === 1 ? '' : 's'}`, {
        fontFamily: FONT, fontSize: '16px', color: '#ffd060',
      }).setOrigin(0.5);
    }
    const go = (key: string) => {
      if (leaving || settings.isOpen) return;
      leaving = true;
      this.scene.start(key, { back: 'Menu' });
    };
    this.rackFn = () => go('SpiceRack');
    this.bookFn = () => go('Cookbook');
    new Button(this, GAME_W / 2 - 130, 568, 'Spice Rack (Tab)', { width: 230, height: 46, fontSize: 18, fill: 0x8a6a1a, hover: 0xa88228 }, this.rackFn);
    new Button(this, GAME_W / 2 + 130, 568, 'Cookbook (C)', { width: 230, height: 46, fontSize: 18, fill: 0x8a6a1a, hover: 0xa88228 }, this.bookFn);
    onKeyPress(this.input.keyboard!, 'TAB', () => this.rackFn());
    onKeyPress(this.input.keyboard!, 'C', () => this.bookFn());
    this.input.keyboard!.addCapture('TAB');
    this.startFn = start;
    new Button(this, GAME_W / 2, 630, 'START  (Enter)', { width: 280, height: 60, fontSize: 24 }, start);
    new Button(this, GAME_W / 2 - 270, 630, 'Settings', { width: 180, height: 52, fill: 0x5a4a3a, hover: 0x7a6650 }, () => settings.show());
    const fs = new Button(this, GAME_W / 2 + 270, 630, this.scale.isFullscreen ? 'Windowed' : 'Fullscreen', { width: 180, height: 52, fill: 0x5a4a3a, hover: 0x7a6650 }, () => {
      if (this.scale.isFullscreen) this.scale.stopFullscreen();
      else this.scale.startFullscreen();
    });
    this.scale.on('enterfullscreen', () => fs.setText('Windowed'));
    this.scale.on('leavefullscreen', () => fs.setText('Fullscreen'));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off('enterfullscreen');
      this.scale.off('leavefullscreen');
    });
    onKeyPress(this.input.keyboard!, 'ENTER', start);
    onKeyPress(this.input.keyboard!, 'SPACE', start);
    onKeyPress(this.input.keyboard!, 'ESC', () => settings.back());
  }
}
