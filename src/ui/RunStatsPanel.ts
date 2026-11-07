import Phaser from 'phaser';
import { GAME_H, GAME_W } from '../art/textures';
import { WEAPONS, tierLabel } from '../data/weapons';
import { SAUSAGES } from '../data/sausages';
import type { RunState } from '../state/run';
import { damageRows, takenRows, totalDealt, totalTaken } from '../state/runLog';
import { Button } from './Button';
import { FONT } from './Hud';
import { bindPrompt, hint } from './inputMode';

const DEPTH = 400;
const MAX_ROWS = 9;

/** 1234 → "1,234"; 12345 → "12.3k". */
export function shortNum(n: number): string {
  const v = Math.round(n);
  if (Math.abs(v) >= 10_000) return `${(v / 1000).toFixed(1)}k`;
  return v.toLocaleString('en-US');
}

function clock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * The end-of-run statistics: totals up top, damage and DPS per link on the left,
 * what hurt you and where the crumbs went on the right. Opens over the results screen.
 */
export class RunStatsPanel {
  private objects: Phaser.GameObjects.GameObject[] = [];
  open = false;

  constructor(private readonly scene: Phaser.Scene, private readonly run: RunState) {}

  toggle(): void {
    if (this.open) this.hide();
    else this.show();
  }

  show(): void {
    if (this.open) return;
    this.open = true;
    const s = this.scene;
    const run = this.run;
    const log = run.log;
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      this.objects.push(o);
      (o as unknown as Phaser.GameObjects.Components.Depth).setDepth?.(DEPTH);
      return o;
    };
    const text = (x: number, y: number, str: string, size: number, color: string, bold = false) =>
      add(s.add.text(x, y, str, { fontFamily: FONT, fontSize: `${size}px`, color, fontStyle: bold ? 'bold' : 'normal' }));

    add(s.add.rectangle(0, 0, GAME_W, GAME_H, 0x000000, 0.78).setOrigin(0).setInteractive());
    const L = 40;
    const T = 24;
    const W = GAME_W - 80;
    const H = GAME_H - 48;
    const g = add(s.add.graphics());
    g.fillStyle(0x241812, 1).fillRoundedRect(L, T, W, H, 16);
    g.lineStyle(3, 0xffb347, 1).strokeRoundedRect(L, T, W, H, 16);
    add(s.add.text(GAME_W / 2, T + 30, 'RUN STATS', { fontFamily: FONT, fontSize: '32px', fontStyle: 'bold', color: '#ffd9a0' }).setOrigin(0.5));
    add(s.add.text(GAME_W / 2, T + 60, `${SAUSAGES[run.sausage].name}  ·  ${log.waves.length} wave${log.waves.length === 1 ? '' : 's'}  ·  ${clock(run.timeSurvivedSec)} on the grill`, {
      fontFamily: FONT, fontSize: '15px', color: '#c8a890',
    }).setOrigin(0.5));

    // --- Totals ---
    const dealt = totalDealt(log);
    const tiles: [string, string, string][] = [
      ['Damage dealt', shortNum(dealt), '#ffd23f'],
      ['DPS', run.timeSurvivedSec > 0 ? shortNum(dealt / run.timeSurvivedSec) : '0', '#ffb347'],
      ['Utensils bent', shortNum(run.kills), '#ffffff'],
      ['Crumbs collected', shortNum(run.crumbsEarned), '#ffe08a'],
      ['Damage taken', shortNum(totalTaken(log)), '#ff8a70'],
      ['Healed', shortNum(log.healed), '#7dff9a'],
    ];
    const tileW = (W - 40 - 5 * 12) / 6;
    tiles.forEach(([label, value, color], i) => {
      const x = L + 20 + i * (tileW + 12);
      const y = T + 84;
      g.fillStyle(0x000000, 0.35).fillRoundedRect(x, y, tileW, 70, 10);
      add(s.add.text(x + tileW / 2, y + 26, value, { fontFamily: FONT, fontSize: '28px', fontStyle: 'bold', color }).setOrigin(0.5));
      add(s.add.text(x + tileW / 2, y + 54, label, { fontFamily: FONT, fontSize: '13px', color: '#b09080' }).setOrigin(0.5));
    });

    // --- Damage by link ---
    const tx = L + 24;
    const ty = T + 176;
    const tw = 740;
    text(tx, ty, 'DAMAGE BY LINK', 15, '#c8a890', true);
    const cols = { name: tx, dmg: tx + 380, bar: tx + 396, dps: tx + 680, kills: tx + 740 };
    text(cols.dmg, ty + 26, 'Damage', 12, '#8a7060').setOrigin(1, 0);
    text(cols.dps, ty + 26, 'DPS', 12, '#8a7060').setOrigin(1, 0);
    text(cols.kills, ty + 26, 'Kills', 12, '#8a7060').setOrigin(1, 0);
    const rows = damageRows(log, run.timeSurvivedSec).slice(0, MAX_ROWS);
    if (!rows.length || dealt <= 0) {
      text(tx, ty + 52, 'No damage dealt this run.', 15, '#b09080');
    }
    const top = rows[0]?.damage || 1;
    rows.forEach((r, i) => {
      const y = ty + 46 + i * 28;
      if (i % 2 === 0) g.fillStyle(0xffffff, 0.04).fillRect(tx - 8, y - 2, tw + 16, 28);
      const icon = r.link ? WEAPONS[log.links[r.link - 1].weapon]?.icon : undefined;
      let nx = cols.name;
      if (icon && s.textures.exists(icon)) {
        const img = add(s.add.image(nx + 12, y + 12, icon));
        img.setScale(Math.min(24 / img.width, 24 / img.height));
        nx += 30;
      }
      const label = r.link ? `${r.link}. ${r.name} ${tierLabel(r.tier)}` : r.name;
      text(nx, y + 3, label, 16, r.link ? '#ffffff' : '#d8c0a8', !!r.link);
      text(cols.dmg, y + 3, shortNum(r.damage), 16, '#ffd23f', true).setOrigin(1, 0);
      const barW = 170;
      g.fillStyle(0x000000, 0.5).fillRoundedRect(cols.bar, y + 8, barW, 10, 5);
      g.fillStyle(r.color, 1).fillRoundedRect(cols.bar, y + 8, Math.max(4, barW * (r.damage / top)), 10, 5);
      text(cols.bar + barW + 8, y + 4, `${Math.round(r.share * 100)}%`, 13, '#b09080');
      text(cols.dps, y + 3, r.dps >= 100 ? shortNum(r.dps) : r.dps.toFixed(1), 16, '#ffb347').setOrigin(1, 0);
      text(cols.kills, y + 3, shortNum(r.kills), 16, '#ffffff').setOrigin(1, 0);
      if (r.dot > 0 && r.link) {
        text(nx + 250, y + 5, `${Math.round((r.dot / Math.max(1, r.damage)) * 100)}% poison`, 11, '#9fe7a8').setOrigin(1, 0);
      }
    });

    // --- Right column ---
    const rx = L + 24 + tw + 50;
    const rw = L + W - 24 - rx;
    let y = ty;
    const kv = (k: string, v: string, color = '#ffffff') => {
      text(rx, y, k, 15, '#b09080');
      text(rx + rw, y, v, 15, color, true).setOrigin(1, 0);
      y += 24;
    };
    text(rx, y, 'WHAT HURT YOU', 15, '#c8a890', true);
    y += 28;
    const hurt = takenRows(log).slice(0, 5);
    if (!hurt.length) {
      text(rx, y, 'Nothing. Not a scratch.', 15, '#9cff7a');
      y += 24;
    }
    for (const h of hurt) kv(h.source, shortNum(h.amount), '#ff8a70');
    kv('Hits / dodged / blocked', `${log.hitsTaken} / ${log.dodges} / ${log.blocked}`);
    y += 12;
    text(rx, y, 'CRUMBS', 15, '#c8a890', true);
    y += 28;
    kv('Picked up', shortNum(log.crumbs.picked), '#ffe08a');
    if (log.crumbs.swept) kv('Swept up after waves', shortNum(log.crumbs.swept), '#ffe08a');
    kv('Spent on links', shortNum(log.crumbs.spentWeapons));
    kv('Spent on items', shortNum(log.crumbs.spentItems));
    if (log.crumbs.spentRerolls) kv('Spent on rerolls', shortNum(log.crumbs.spentRerolls));

    // --- Damage per wave: how the build ramped up ---
    const waves = log.waves.slice(-24);
    if (waves.length) {
      const wy = T + H - 168;
      const wh = 70;
      text(tx, wy - 26, 'DAMAGE PER WAVE', 15, '#c8a890', true);
      const maxDealt = Math.max(1, ...waves.map((w) => w.dealt));
      const step = Math.min(56, (W - 48) / waves.length);
      const bw = Math.max(6, step - 10);
      waves.forEach((w, i) => {
        const x = tx + i * step;
        const bh = Math.max(2, (wh * w.dealt) / maxDealt);
        const color = w.outcome === 'died' ? 0xff6a5a : w.boss ? 0xb070ff : w.outcome === 'left' ? 0x8a7060 : 0xffb347;
        g.fillStyle(color, 1).fillRoundedRect(x, wy + wh - bh, bw, bh, Math.min(3, bh / 2));
        add(s.add.text(x + bw / 2, wy + wh + 4, w.boss ? 'B' : String(w.wave), { fontFamily: FONT, fontSize: '11px', color: '#8a7060' }).setOrigin(0.5, 0));
        const hit = add(s.add.zone(x, wy, bw, wh).setOrigin(0).setInteractive());
        hit.on('pointerover', () => tip.setText(`Wave ${w.wave}: ${shortNum(w.dealt)} damage, ${w.kills} kills, ${shortNum(w.taken)} taken, ${w.crumbs} crumbs`));
        hit.on('pointerout', () => tip.setText(''));
      });
      const tip = text(tx + 220, wy - 25, '', 13, '#e8c8a8');
    }

    const close = add(new Button(s, GAME_W / 2, T + H - 36, '', { width: 220, height: 46, fill: 0x5a4a3a, hover: 0x7a6650 }, () => this.hide()));
    close.setFocused(true);
    bindPrompt(close, () => `Back${hint('Esc', 'B')}`);
  }

  hide(): void {
    if (!this.open) return;
    this.open = false;
    for (const o of this.objects) o.destroy();
    this.objects = [];
  }
}
