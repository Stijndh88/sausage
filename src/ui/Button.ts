import Phaser from 'phaser';
import { FONT } from './Hud';

export interface ButtonOpts {
  width: number;
  height: number;
  fill?: number;
  hover?: number;
  fontSize?: number;
}

/** A simple rounded button: a container with a background and a label. */
export class Button extends Phaser.GameObjects.Container {
  private readonly bg: Phaser.GameObjects.Graphics;
  readonly label: Phaser.GameObjects.Text;
  private enabled = true;
  private hovered = false;

  constructor(scene: Phaser.Scene, x: number, y: number, text: string, private readonly opts: ButtonOpts, onClick: () => void) {
    super(scene, x, y);
    this.bg = scene.add.graphics();
    this.label = scene.add
      .text(0, 0, text, { fontFamily: FONT, fontSize: `${opts.fontSize ?? 20}px`, fontStyle: 'bold', color: '#ffffff', align: 'center' })
      .setOrigin(0.5);
    this.add([this.bg, this.label]);
    this.setSize(opts.width, opts.height);
    this.setInteractive({ useHandCursor: true });
    this.on('pointerover', () => { this.hovered = true; this.draw(); });
    this.on('pointerout', () => { this.hovered = false; this.draw(); });
    this.on('pointerdown', () => { if (this.enabled) onClick(); });
    scene.add.existing(this);
    this.draw();
  }

  setEnabled(enabled: boolean): this {
    this.enabled = enabled;
    this.draw();
    return this;
  }

  setText(text: string): this {
    this.label.setText(text);
    return this;
  }

  private draw(): void {
    const { width: w, height: h } = this.opts;
    const fill = !this.enabled ? 0x3a3330 : this.hovered ? (this.opts.hover ?? 0xe0703a) : (this.opts.fill ?? 0xb8502a);
    this.bg.clear();
    this.bg.fillStyle(0x000000, 0.4).fillRoundedRect(-w / 2 + 3, -h / 2 + 4, w, h, 10);
    this.bg.fillStyle(fill, 1).fillRoundedRect(-w / 2, -h / 2, w, h, 10);
    this.bg.lineStyle(2, 0xffffff, this.enabled ? 0.25 : 0.08).strokeRoundedRect(-w / 2, -h / 2, w, h, 10);
    this.label.setAlpha(this.enabled ? 1 : 0.45);
  }
}
