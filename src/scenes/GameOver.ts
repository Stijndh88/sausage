import Phaser from 'phaser';
import { GAME_H, GAME_W } from '../art/textures';
import { courseName, locate, TROPHIES } from '../data/courses';
import { RECIPES, rewardText } from '../data/recipes';
import { SAUSAGES } from '../data/sausages';
import type { RunState } from '../state/run';
import { keepShare, settleRun, type Outcome, type Settlement } from '../state/meta';
import { audio } from '../audio/Audio';
import { PadPoller } from '../ui/pad';
import { Button } from '../ui/Button';
import { FONT } from '../ui/Hud';
import { onKeyPress } from '../ui/input';
import { fitCamera } from '../ui/view';
import { startRun } from './startRun';

export interface EndData {
  run: RunState;
  outcome?: Outcome;
  hp?: number;
}

/** Runs already settled: a scene restart must never pay out twice. */
const settled = new WeakMap<RunState, Settlement>();

function settleOnce(run: RunState, outcome: Outcome, hp: number): Settlement {
  let s = settled.get(run);
  if (!s) {
    s = settleRun(run, outcome, hp);
    settled.set(run, s);
  }
  return s;
}

/** One line per recipe reward, e.g. "unlocks Bratwurst (buy it on the sausage screen)". */
function rewardLine(id: string): string {
  const r = RECIPES[id].reward;
  if (r.kind === 'sausage') return `${SAUSAGES[r.sausage].name} can be bought`;
  return rewardText(r);
}

/**
 * The end-of-run screen: the doggy bag empties into your Spice jar, the Cookbook shows what you
 * got closer to, and "One more run" is one key away.
 */
export function endScreen(scene: Phaser.Scene, data: EndData, title: string, subtitle: string, color: string, headTint: number): void {
  const run = data.run;
  const outcome = data.outcome ?? 'death';
  const s = settleOnce(run, outcome, data.hp ?? 0);
  const loc = locate(run.wave);

  scene.add.image(0, 0, 'bg-grill').setOrigin(0).setDisplaySize(GAME_W, GAME_H).setAlpha(0.4);
  scene.add.rectangle(0, 0, GAME_W, GAME_H, 0x0c0806, 0.72).setOrigin(0);
  const portrait = `portrait-${run.sausage}`;
  if (scene.textures.exists(portrait)) scene.add.image(110, 80, portrait).setScale(0.9).setTint(headTint);
  else scene.add.image(110, 80, 'sausage-head').setScale(3).setTint(headTint);
  scene.add.text(GAME_W / 2, 50, title, {
    fontFamily: FONT, fontSize: '56px', fontStyle: 'bold', color, stroke: '#000', strokeThickness: 8,
  }).setOrigin(0.5);
  scene.add.text(GAME_W / 2, 102, subtitle, { fontFamily: FONT, fontSize: '19px', color: '#e8c8a8' }).setOrigin(0.5);

  // --- Left: the doggy bag ---
  const panel = (x: number, w: number, label: string) => {
    const g = scene.add.graphics();
    g.fillStyle(0x241812, 0.95).fillRoundedRect(x, 136, w, 380, 14);
    g.lineStyle(2, 0x5a4a3a, 1).strokeRoundedRect(x, 136, w, 380, 14);
    scene.add.text(x + 20, 150, label, { fontFamily: FONT, fontSize: '15px', fontStyle: 'bold', color: '#c8a890' });
  };
  const lx = 50;
  panel(lx, 560, 'DOGGY BAG');
  const pct = Math.round(keepShare(outcome, run) * 100);
  const rows: [string, string, string][] = [['In the bag', `${s.bag} Spice`, '#ffffff']];
  if (outcome === 'home') rows.push(['Kept', `${s.kept} + ${s.bonus} escape bonus`, '#9cff7a']);
  else rows.push([`Kept (${pct}%)`, `${s.kept}`, s.kept ? '#9cff7a' : '#ff8a70']);
  if (s.lost > 0) rows.push(['Spilled', `${s.lost}`, '#ff6a5a']);
  if (s.trophiesKept.length) rows.push(['Trophies kept', s.trophiesKept.map((t) => TROPHIES[t].name).join(', '), '#ffd060']);
  if (s.trophiesLost.length) rows.push(['Trophies lost', s.trophiesLost.map((t) => TROPHIES[t].name).join(', '), '#ff6a5a']);
  if (s.bankedDuringRun > 0) rows.push(['Banked during the run', `${s.bankedDuringRun}`, '#ffd060']);
  if (s.recipeSpice > 0) rows.push(['Recipes cooked', `+${s.recipeSpice}`, '#9fe7a8']);
  rows.forEach(([k, v, c], i) => {
    const y = 186 + i * 32;
    scene.add.text(lx + 20, y, k, { fontFamily: FONT, fontSize: '18px', color: '#b09080' });
    scene.add.text(lx + 540, y, v, { fontFamily: FONT, fontSize: '18px', fontStyle: 'bold', color: c, align: 'right', wordWrap: { width: 300 } }).setOrigin(1, 0);
  });
  // The jar counts up from what you had to what you have now.
  scene.add.text(lx + 20, 448, 'SPICE', { fontFamily: FONT, fontSize: '16px', fontStyle: 'bold', color: '#c8a890' });
  const jar = scene.add.text(lx + 540, 438, String(s.spiceBefore), {
    fontFamily: FONT, fontSize: '40px', fontStyle: 'bold', color: '#ffd060', stroke: '#000', strokeThickness: 5,
  }).setOrigin(1, 0);
  const counter = { v: s.spiceBefore };
  if (s.spiceAfter !== s.spiceBefore) {
    scene.tweens.add({
      targets: counter, v: s.spiceAfter, delay: 500, duration: 1200, ease: 'Cubic.Out',
      onUpdate: () => jar.setText(String(Math.round(counter.v))),
      onComplete: () => { jar.setText(String(s.spiceAfter)); audio.play('buy'); },
    });
  }
  jar.setText(String(counter.v));

  // --- Right: the Cookbook ---
  const rx = 640;
  const rw = 590;
  panel(rx, rw, 'COOKBOOK');
  let y = 182;
  for (const id of s.cooked.slice(0, 3)) {
    const r = RECIPES[id];
    const reward = rewardLine(id);
    scene.add.text(rx + 20, y, `COOKED  ${r.name}`, { fontFamily: FONT, fontSize: '18px', fontStyle: 'bold', color: '#9cff7a' });
    scene.add.text(rx + rw - 20, y, `+${r.spice} Spice`, { fontFamily: FONT, fontSize: '16px', fontStyle: 'bold', color: '#ffd060' }).setOrigin(1, 0);
    scene.add.text(rx + 20, y + 22, `${r.desc}${reward ? ` · ${reward}` : ''}`, { fontFamily: FONT, fontSize: '14px', color: '#c8e8b8' });
    y += 52;
  }
  if (s.cooked.length > 3) {
    scene.add.text(rx + 20, y, `...and ${s.cooked.length - 3} more`, { fontFamily: FONT, fontSize: '14px', color: '#9cff7a' });
    y += 26;
  }
  const g = scene.add.graphics();
  const barW = rw - 40;
  for (const p of s.progress) {
    if (y > 450) break;
    const r = RECIPES[p.id];
    scene.add.text(rx + 20, y, r.name, { fontFamily: FONT, fontSize: '16px', fontStyle: 'bold', color: '#ffffff' });
    scene.add.text(rx + rw - 20, y, `${Math.floor(p.after).toLocaleString('en-US')} / ${p.goal.toLocaleString('en-US')}`, {
      fontFamily: FONT, fontSize: '14px', color: '#c8a890',
    }).setOrigin(1, 0);
    scene.add.text(rx + 20, y + 20, r.desc, { fontFamily: FONT, fontSize: '13px', color: '#b09080' });
    const by = y + 40;
    g.fillStyle(0x000000, 0.6).fillRoundedRect(rx + 20, by, barW, 8, 4);
    g.fillStyle(0x8a6a3a, 1).fillRoundedRect(rx + 20, by, Math.max(4, barW * Math.min(1, p.before / p.goal)), 8, 4);
    const fill = { f: p.before / p.goal };
    const bar = scene.add.graphics();
    scene.tweens.add({
      targets: fill, f: Math.min(1, p.after / p.goal), delay: 700, duration: 900,
      onUpdate: () => bar.clear().fillStyle(0xffb347, 1).fillRoundedRect(rx + 20, by, Math.max(4, barW * fill.f), 8, 4),
    });
    y += 60;
  }
  if (!s.cooked.length && !s.progress.length) {
    scene.add.text(rx + 20, y, 'Every run counts toward the Cookbook,\neven the ones that end in the bin.', { fontFamily: FONT, fontSize: '15px', color: '#b09080' });
  }

  // --- What's new ---
  const news: string[] = [];
  for (const id of s.newSausages) news.push(`${SAUSAGES[id].name} can be bought`);
  if (s.newChili) news.push(`Chili ${s.newChili} unlocked for ${SAUSAGES[run.sausage].name}`);
  if (s.talentsAffordable) news.push(`${s.talentsAffordable} Spice Rack talent${s.talentsAffordable === 1 ? '' : 's'} in reach`);
  else if (s.sausagesAffordable) news.push(`${s.sausagesAffordable} sausage${s.sausagesAffordable === 1 ? '' : 's'} to buy`);
  if (news.length) {
    const t = scene.add.text(GAME_W / 2, 540, news.join('   ·   '), {
      fontFamily: FONT, fontSize: '20px', fontStyle: 'bold', color: '#ffd23f', stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5);
    if (s.newSausages.length || s.newChili) {
      audio.play('unlock');
      scene.tweens.add({ targets: t, scale: 1.05, duration: 500, yoyo: true, repeat: -1 });
    }
  }
  const mins = Math.floor(run.timeSurvivedSec / 60);
  const secs = Math.floor(run.timeSurvivedSec % 60);
  scene.add.text(GAME_W / 2, 578, [
    `${SAUSAGES[run.sausage].name}`,
    `${courseName(loc.course)}${loc.boss ? ', boss' : `, wave ${loc.courseWave}`}`,
    `${run.kills} utensils bent`,
    `${run.crumbsEarned} crumbs`,
    `${mins}:${String(secs).padStart(2, '0')} on the grill`,
    ...(run.chili ? [`Chili ${run.chili}`] : []),
  ].join('  ·  '), { fontFamily: FONT, fontSize: '15px', color: '#b09080' }).setOrigin(0.5);

  // One shared guard: a click and a key in the same frame must not start two scenes.
  let leaving = false;
  const go = (fn: () => void) => {
    if (leaving) return;
    leaving = true;
    fn();
  };
  // Ignore input briefly so a key held from the last fight doesn't skip the results.
  const readyAt = scene.time.now + 600;
  const again = () => go(() => startRun(scene, run.sausage));
  const rack = () => go(() => scene.scene.start('SpiceRack', { back: 'Select' }));
  const menu = () => go(() => scene.scene.start('Menu'));
  new Button(scene, GAME_W / 2 - 300, 650, 'One more run (Enter)', { width: 280, height: 58, fontSize: 21, fill: 0x3c8d3c, hover: 0x52b052 }, again)
    .setFocused(true);
  new Button(scene, GAME_W / 2, 650, 'Spice Rack (Tab)', { width: 240, height: 58, fill: 0x8a6a1a, hover: 0xa88228 }, rack);
  new Button(scene, GAME_W / 2 + 280, 650, 'Main menu (Esc)', { width: 220, height: 58, fill: 0x5a4a3a, hover: 0x7a6650 }, menu);
  const kb = scene.input.keyboard!;
  const ready = () => scene.time.now >= readyAt;
  onKeyPress(kb, 'ENTER', again, ready);
  onKeyPress(kb, 'TAB', rack, ready);
  onKeyPress(kb, 'ESC', menu, ready);
  kb.addCapture('TAB');
  // Gamepad: A / Start = one more run, X = Spice Rack, B = main menu.
  const pad = new PadPoller();
  const onUpdate = () => {
    for (const b of pad.poll(scene)) {
      if (!ready()) continue;
      if (b === 'a' || b === 'start') again();
      else if (b === 'x') rack();
      else if (b === 'b') menu();
    }
  };
  scene.events.on(Phaser.Scenes.Events.UPDATE, onUpdate);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.events.off(Phaser.Scenes.Events.UPDATE, onUpdate));
  (window as unknown as { __results?: unknown }).__results = s;
}

export class GameOverScene extends Phaser.Scene {
  constructor() {
    super('GameOver');
  }

  create(data: EndData): void {
    fitCamera(this);
    if (data.outcome === 'bail') {
      endScreen(this, data, 'BAILED OUT', 'You slipped out the back with part of the bag.', '#ffd060', 0xffffff);
      return;
    }
    const loc = locate(data.run.wave);
    const where = `${courseName(loc.course)}, ${loc.boss ? 'boss fight' : `wave ${loc.courseWave}`}`;
    const cause = data.run.causeOfDeath ? `Done in by ${data.run.causeOfDeath} in ${where}.` : 'That sausage is done.';
    endScreen(this, { ...data, outcome: 'death' }, 'SKEWERED', cause, '#ff6a3a', 0x6a6a6a);
  }
}
