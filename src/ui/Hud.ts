import Phaser from 'phaser';
import { GAME_H, GAME_W } from '../art/textures';
import { TOTAL_WAVES } from '../data/waves';
import { EVENTS, type ScheduledEvent } from '../data/events';

export const HUD_H = 64;
const BAR_X = 20;
const BAR_Y = 18;
const BAR_W = 340;
const BAR_H = 22;

export const FONT = '"Trebuchet MS", "Segoe UI", sans-serif';

const BOSS_BAR_CX = GAME_W / 2 + 80;
const BOSS_BAR_W = 420;
const BOSS_BAR_Y = 34;

/** Event track: a thin line under the wave timer with an icon at each event's second. */
const TRACK_CX = GAME_W / 2 + 80;
const TRACK_W = 380;
const TRACK_Y = 55;
const TRACK_ICON = 16;
/** Upcoming events pulse on the track for this long before they start. */
const TRACK_WARN_SEC = 3;

function setTextIfChanged(t: Phaser.GameObjects.Text, text: string): void {
  if (t.text !== text) t.setText(text);
}

function setColorIfChanged(t: Phaser.GameObjects.Text, color: string): void {
  if (t.style.color !== color) t.setColor(color);
}

/** Below this fraction of max HP the bar pulses and the screen edge glows red. */
export const LOW_HP_FRACTION = 0.3;
const HP_COLOR = 0xe8484d;
const HP_LOW_COLOR = 0xff2a2a;

/** HP bar, crumbs, wave timer, dash charge, boss bar, and the low-HP vignette. */
export class Hud {
  private readonly bar: Phaser.GameObjects.Graphics;
  private readonly hpText: Phaser.GameObjects.Text;
  private readonly crumbText: Phaser.GameObjects.Text;
  private readonly timerText: Phaser.GameObjects.Text;
  private readonly vignette: Phaser.GameObjects.Graphics;
  private readonly bossBar: Phaser.GameObjects.Graphics;
  private readonly bossName: Phaser.GameObjects.Text;
  private shownCrumbs = -1;
  private lastHp = -1;
  private hurtFlashUntil = 0;
  private track: { g: Phaser.GameObjects.Graphics; durationSec: number; icons: { ev: ScheduledEvent; img: Phaser.GameObjects.Image }[] } | null = null;

  constructor(private readonly scene: Phaser.Scene, wave: number) {
    const bg = scene.add.graphics().setDepth(50);
    bg.fillStyle(0x120c0a, 0.92).fillRect(0, 0, GAME_W, HUD_H);
    bg.fillStyle(0x3a2418, 1).fillRect(0, HUD_H - 3, GAME_W, 3);

    this.bar = scene.add.graphics().setDepth(51);
    scene.add.text(BAR_X, 2, 'HP', { fontFamily: FONT, fontSize: '12px', fontStyle: 'bold', color: '#c8a890' }).setDepth(51);
    this.hpText = scene.add
      .text(BAR_X + BAR_W / 2, BAR_Y + BAR_H / 2, '', {
        fontFamily: FONT, fontSize: '16px', fontStyle: 'bold', color: '#ffffff', stroke: '#000000', strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(52);

    // Crumbs are the money you spend in the shop.
    scene.add.text(GAME_W - 150, 2, 'CRUMBS', { fontFamily: FONT, fontSize: '12px', fontStyle: 'bold', color: '#c8a890' }).setDepth(51);
    scene.add.image(GAME_W - 150, HUD_H / 2 + 4, 'crumb').setScale(2).setDepth(51);
    this.crumbText = scene.add
      .text(GAME_W - 132, HUD_H / 2 + 4, '0', { fontFamily: FONT, fontSize: '24px', fontStyle: 'bold', color: '#f0c070' })
      .setOrigin(0, 0.5)
      .setDepth(51);

    scene.add
      .text(GAME_W / 2 + 80, 12, wave >= TOTAL_WAVES ? 'FINAL WAVE' : `WAVE ${wave}/${TOTAL_WAVES}`, {
        fontFamily: FONT, fontSize: '16px', color: '#c8a890',
      })
      .setOrigin(0.5, 0.5)
      .setDepth(51);
    this.timerText = scene.add
      .text(GAME_W / 2 + 80, 34, '', { fontFamily: FONT, fontSize: '26px', fontStyle: 'bold', color: '#ffffff' })
      .setOrigin(0.5, 0.5)
      .setDepth(51);

    this.vignette = scene.add.graphics().setDepth(49);
    this.bossBar = scene.add.graphics().setDepth(51).setVisible(false);
    // The boss bar lives in the HUD strip (where the timer would be), never over the arena.
    this.bossName = scene.add
      .text(BOSS_BAR_CX, BOSS_BAR_Y + 6, "THE GRILL MASTER'S TONGS", {
        fontFamily: FONT, fontSize: '12px', fontStyle: 'bold', color: '#ffffff', stroke: '#000000', strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(51)
      .setVisible(false);
  }

  update(hp: number, maxHp: number, crumbs: number, timeLeftSec: number | null, dashCharge: number, now: number): void {
    const frac = Math.max(0, Math.min(1, hp / maxHp));
    const low = frac <= LOW_HP_FRACTION;
    if (this.lastHp >= 0 && hp < this.lastHp - 0.5) this.hurtFlashUntil = now + 180;
    this.lastHp = hp;

    const g = this.bar;
    g.clear();
    g.fillStyle(0x000000, 0.6).fillRoundedRect(BAR_X - 2, BAR_Y - 2, BAR_W + 4, BAR_H + 4, 6);
    g.fillStyle(0x3a1a1a, 1).fillRoundedRect(BAR_X, BAR_Y, BAR_W, BAR_H, 4);
    if (frac > 0) {
      const w = Math.max(4, frac * BAR_W);
      g.fillStyle(low ? HP_LOW_COLOR : HP_COLOR, 1).fillRoundedRect(BAR_X, BAR_Y, w, BAR_H, 4);
      g.fillStyle(0xffffff, 0.2).fillRect(BAR_X + 2, BAR_Y + 3, Math.max(0, w - 4), 4);
      if (low) g.fillStyle(0xffffff, 0.15 + Math.sin(now / 90) * 0.15).fillRoundedRect(BAR_X, BAR_Y, w, BAR_H, 4);
    }
    if (now < this.hurtFlashUntil) g.lineStyle(2, 0xffffff, 1).strokeRoundedRect(BAR_X - 1, BAR_Y - 1, BAR_W + 2, BAR_H + 2, 5);
    // Dash charge strip.
    g.fillStyle(0x000000, 0.6).fillRect(BAR_X, BAR_Y + BAR_H + 6, 120, 5);
    g.fillStyle(dashCharge >= 1 ? 0x8fd3ff : 0x4a6a80, 1).fillRect(BAR_X, BAR_Y + BAR_H + 6, 120 * dashCharge, 5);

    // setText/setColor re-render the text texture, so only call them when something changed.
    setTextIfChanged(this.hpText, `${Math.ceil(hp)} / ${maxHp}`);

    if (crumbs !== this.shownCrumbs) {
      if (this.shownCrumbs >= 0 && crumbs > this.shownCrumbs) {
        // Restart the bounce from scale 1 so overlapping bounces can't leave it stuck enlarged.
        this.scene.tweens.killTweensOf(this.crumbText);
        this.crumbText.setScale(1);
        this.scene.tweens.add({ targets: this.crumbText, scale: 1.25, duration: 60, yoyo: true });
      }
      this.shownCrumbs = crumbs;
      this.crumbText.setText(String(crumbs));
    }

    if (timeLeftSec === null) {
      // Boss wave: the boss bar takes the timer's place.
      this.timerText.setVisible(false);
    } else {
      const s = Math.ceil(timeLeftSec);
      setTextIfChanged(this.timerText, `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
      setColorIfChanged(this.timerText, s <= 5 ? '#ffd060' : '#ffffff');
    }

    // Red edge glow when low on HP.
    this.vignette.clear();
    if (low && hp > 0) {
      const a = 0.22 + Math.sin(now / 110) * 0.12;
      this.vignette.lineStyle(24, 0xff2000, a).strokeRect(12, HUD_H + 12, GAME_W - 24, GAME_H - HUD_H - 24);
    }
  }

  /** Shows the wave's events on the track (called once per wave; none on the boss wave). */
  setEvents(events: readonly ScheduledEvent[], durationSec: number): void {
    if (!events.length || durationSec <= 0) return;
    const g = this.scene.add.graphics().setDepth(51);
    const icons = events.map((ev) => {
      const x = TRACK_CX - TRACK_W / 2 + (ev.atSec / durationSec) * TRACK_W;
      const img = this.scene.add.image(x, TRACK_Y, `evt-icon-${ev.kind}`).setDisplaySize(TRACK_ICON, TRACK_ICON).setDepth(52);
      return { ev, img };
    });
    this.track = { g, durationSec, icons };
    this.updateTrack(0, 0);
  }

  /** Track bounds (for layout tests). */
  get trackBounds(): { x: number; y: number; w: number; h: number } {
    return { x: TRACK_CX - TRACK_W / 2 - TRACK_ICON / 2, y: TRACK_Y - TRACK_ICON / 2, w: TRACK_W + TRACK_ICON, h: TRACK_ICON };
  }

  updateTrack(elapsedSec: number, now: number): void {
    const t = this.track;
    if (!t) return;
    const left = TRACK_CX - TRACK_W / 2;
    const x = left + Math.min(1, elapsedSec / t.durationSec) * TRACK_W;
    t.g.clear();
    t.g.fillStyle(0x000000, 0.6).fillRect(left - 1, TRACK_Y - 2, TRACK_W + 2, 4);
    t.g.fillStyle(0x6a4a38, 1).fillRect(left, TRACK_Y - 1, TRACK_W, 2);
    t.g.fillStyle(0xffe0b0, 1).fillRect(left, TRACK_Y - 1, x - left, 2);
    for (const { ev, img } of t.icons) {
      const until = ev.atSec - elapsedSec;
      const color = EVENTS[ev.kind].color;
      if (until <= 0) {
        img.setAlpha(0.35).setDisplaySize(TRACK_ICON, TRACK_ICON);
      } else if (until <= TRACK_WARN_SEC) {
        const pulse = 1 + 0.25 * Math.abs(Math.sin(now / 120));
        img.setAlpha(1).setDisplaySize(TRACK_ICON * pulse, TRACK_ICON * pulse);
        t.g.lineStyle(2, color, 0.9).strokeCircle(img.x, TRACK_Y, TRACK_ICON * 0.5 * pulse + 2);
      } else {
        img.setAlpha(0.9).setDisplaySize(TRACK_ICON, TRACK_ICON);
        t.g.lineStyle(1.5, color, 0.8).strokeCircle(img.x, TRACK_Y, TRACK_ICON / 2 + 1);
      }
    }
    t.g.fillStyle(0xffffff, 1).fillRect(x - 1, TRACK_Y - 5, 2, 10);
  }

  /** Where the boss bar is drawn (inside the HUD strip, never over the arena). */
  get bossBarBounds(): { x: number; y: number; w: number; h: number } {
    return { x: BOSS_BAR_CX - BOSS_BAR_W / 2 - 3, y: BOSS_BAR_Y - 3, w: BOSS_BAR_W + 6, h: 18 };
  }

  setBoss(fraction: number | null): void {
    const show = fraction !== null;
    this.bossBar.setVisible(show);
    this.bossName.setVisible(show);
    if (!show) return;
    const w = BOSS_BAR_W;
    const x = BOSS_BAR_CX - w / 2;
    const y = BOSS_BAR_Y;
    this.bossBar.clear();
    this.bossBar.fillStyle(0x000000, 0.7).fillRoundedRect(x - 3, y - 3, w + 6, 18, 5);
    this.bossBar.fillStyle(fraction < 0.5 ? 0xff3a3a : 0xb040ff, 1).fillRoundedRect(x, y, Math.max(2, w * fraction), 12, 4);
  }
}
