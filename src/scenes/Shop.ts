import Phaser from 'phaser';
import { GAME_H, GAME_W } from '../art/textures';
import { ITEMS } from '../data/items';
import { WEAPONS, tierLabel, type WeaponId } from '../data/weapons';
import { TOTAL_WAVES } from '../data/waves';
import type { RunState } from '../state/run';
import { RARITIES } from '../data/rarity';
import { maxLinksFor, runStats } from '../state/run';
import { computeStats } from '../state/stats';
import { sausageBaseStats } from '../data/sausages';
import { BASE_STATS } from '../state/stats';
import { statChanges, weaponStatLine } from '../systems/statText';
import {
  applyWeaponPurchase, canBuy, generateOffers, rerollCost, shopRng, type Offer, type ShopContext,
} from '../systems/Economy';
import { Button } from '../ui/Button';
import { FONT } from '../ui/Hud';
import { onKeyPress } from '../ui/input';
import { audio } from '../audio/Audio';
import { PadPoller } from '../ui/pad';

const CARD_W = 250;
const CARD_H = 322;
const CARD_Y = 300;
const ROW_Y = 500;

/** Between waves: spend crumbs on new links (weapons) or passive items. */
export class ShopScene extends Phaser.Scene {
  private run!: RunState;
  private offers: (Offer | null)[] = [];
  private locked = new Set<number>();
  private ui: Phaser.GameObjects.GameObject[] = [];
  /** Set once "next wave" is triggered so a second input in the same frame can't skip a wave. */
  private leaving = false;
  /** Ignore keys for a moment after opening, so keys held through the wave-clear don't act here. */
  private inputReadyAt = 0;
  /** Card with keyboard/gamepad focus (arrows / D-pad), bought with A, kept with Y. */
  private focus = 0;
  private readonly pad = new PadPoller();

  constructor() {
    super('Shop');
  }

  init(data: { run: RunState }): void {
    this.run = data.run;
    this.run.rerollCount = 0;
    this.leaving = false;
    const lockedOffers = this.run.lockedOffers;
    this.offers = generateOffers(shopRng(this.run.seed, this.run.wave, 0), this.run.wave + 1, lockedOffers, undefined, this.run.weapons, this.shopContext());
    this.locked = new Set(lockedOffers.map((_, i) => i));
    this.run.lockedOffers = [];
  }

  create(): void {
    audio.setMood('menu');
    this.add.image(0, 0, 'bg-grill').setOrigin(0).setAlpha(0.35);
    this.add.rectangle(0, 0, GAME_W, GAME_H, 0x140d0a, 0.6).setOrigin(0);

    // Space is deliberately NOT bound: it's the dash key, and a held dash must never skip the shop.
    this.inputReadyAt = this.time.now + 350;
    const kb = this.input.keyboard!;
    const ready = () => this.time.now >= this.inputReadyAt;
    onKeyPress(kb, 'ONE', () => this.buy(0), ready);
    onKeyPress(kb, 'TWO', () => this.buy(1), ready);
    onKeyPress(kb, 'THREE', () => this.buy(2), ready);
    onKeyPress(kb, 'FOUR', () => this.buy(3), ready);
    // Shift+1-4 keeps (locks) an offer, so the whole shop works from the keyboard.
    onKeyPress(kb, 'ONE', () => this.shiftKeep(0), ready);
    onKeyPress(kb, 'TWO', () => this.shiftKeep(1), ready);
    onKeyPress(kb, 'THREE', () => this.shiftKeep(2), ready);
    onKeyPress(kb, 'FOUR', () => this.shiftKeep(3), ready);
    onKeyPress(kb, 'R', () => this.reroll(), ready);
    onKeyPress(kb, 'ENTER', () => this.next(), ready);
    onKeyPress(kb, 'LEFT', () => this.moveFocus(-1), ready);
    onKeyPress(kb, 'RIGHT', () => this.moveFocus(1), ready);

    this.render();
    (window as unknown as { __sausage?: unknown }).__sausage = this;
  }

  private render(): void {
    for (const o of this.ui) o.destroy();
    this.ui = [];
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      this.ui.push(o);
      return o;
    };
    const run = this.run;

    add(this.add.text(GAME_W / 2, 46, 'THE CONDIMENT STAND', {
      fontFamily: FONT, fontSize: '40px', fontStyle: 'bold', color: '#ffe0b0', stroke: '#3a1408', strokeThickness: 6,
    }).setOrigin(0.5));
    add(this.add.text(GAME_W / 2, 88, `Wave ${run.wave} survived. Next up: ${run.wave + 1 >= TOTAL_WAVES ? 'THE BOSS' : `wave ${run.wave + 1}`}`, {
      fontFamily: FONT, fontSize: '18px', color: '#c8a890',
    }).setOrigin(0.5));

    // Crumbs + your key stats (you heal to full before every wave)
    add(this.add.image(GAME_W - 190, 46, 'crumb').setScale(2.4));
    add(this.add.text(GAME_W - 170, 46, String(run.crumbs), { fontFamily: FONT, fontSize: '32px', fontStyle: 'bold', color: '#f0c070' }).setOrigin(0, 0.5));
    const st = runStats(run);
    const summary = `HP ${st.maxHp}  ·  Armor ${st.armor}${st.luck ? `  ·  Luck ${st.luck}` : ''}`;
    add(this.add.text(40, 46, summary, { fontFamily: FONT, fontSize: '20px', fontStyle: 'bold', color: '#ffb070' }).setOrigin(0, 0.5));

    // Offer cards
    const total = this.offers.length;
    const gap = 24;
    const startX = GAME_W / 2 - ((CARD_W + gap) * total - gap) / 2 + CARD_W / 2;
    this.offers.forEach((offer, i) => this.renderCard(add, offer, i, startX + i * (CARD_W + gap), CARD_Y));

    // Bottom row: reroll + next
    const cost = rerollCost(run.wave, run.rerollCount);
    add(new Button(this, GAME_W / 2 - 150, ROW_Y, `Reroll (R)  ${cost}`, { width: 240, height: 52, fill: 0x5a4a3a, hover: 0x7a6650 }, () => this.reroll())
      .setEnabled(run.crumbs >= cost && this.canReroll()));
    add(new Button(this, GAME_W / 2 + 150, ROW_Y, 'Next wave (Enter)  ▶', { width: 240, height: 52, fill: 0x3c8d3c, hover: 0x52b052 }, () => this.next()));

    // Loadout
    add(this.add.text(40, 548, `LINKS ${run.weapons.length}/${maxLinksFor(run)}`, { fontFamily: FONT, fontSize: '16px', fontStyle: 'bold', color: '#c8a890' }));
    run.weapons.forEach((w, i) => {
      const x = 60 + i * 104;
      add(this.add.image(x, 600, 'sausage-link').setScale(1.6));
      add(this.add.image(x, 600, WEAPONS[w.id].icon).setScale(1.5));
      add(this.add.text(x, 634, `${WEAPONS[w.id].name}\n${tierLabel(w.tier)}`, { fontFamily: FONT, fontSize: '12px', color: '#ffffff', align: 'center' }).setOrigin(0.5, 0));
    });
    add(this.add.text(780, 548, 'ITEMS', { fontFamily: FONT, fontSize: '16px', fontStyle: 'bold', color: '#c8a890' }));
    const counts = new Map<string, number>();
    for (const id of run.items) if (ITEMS[id]) counts.set(id, (counts.get(id) ?? 0) + 1);
    // Non-breaking spaces inside each entry so word-wrap never splits "Thicker Casing ×2".
    const itemLines = [...counts].map(([id, n]) => `${ITEMS[id].name}${n > 1 ? ` ×${n}` : ''}`.replace(/ /g, '\u00a0'));
    add(this.add.text(780, 574, itemLines.length ? itemLines.join('   ') : 'None yet', {
      fontFamily: FONT, fontSize: '14px', color: '#ffffff', wordWrap: { width: 460 }, lineSpacing: 6,
    }));
    add(this.add.text(GAME_W / 2, GAME_H - 18, '1-4 buy · Shift+1-4 keep · R reroll · Enter next wave · Pad: ◄► pick, A buy, Y keep, X reroll, Start next', {
      fontFamily: FONT, fontSize: '14px', color: '#b09080',
    }).setOrigin(0.5));
  }

  private renderCard(add: <T extends Phaser.GameObjects.GameObject>(o: T) => T, offer: Offer | null, i: number, x: number, y: number): void {
    const g = add(this.add.graphics());
    const left = x - CARD_W / 2;
    const top = y - CARD_H / 2;
    if (!offer) {
      g.lineStyle(2, 0x5a4a3a, 0.6).strokeRoundedRect(left, top, CARD_W, CARD_H, 14);
      if (i === this.focus) g.lineStyle(3, 0xffd23f, 0.6).strokeRoundedRect(left - 6, top - 6, CARD_W + 12, CARD_H + 12, 18);
      add(this.add.text(x, y, 'SOLD', { fontFamily: FONT, fontSize: '28px', fontStyle: 'bold', color: '#5a4a3a' }).setOrigin(0.5));
      return;
    }
    const kept = this.locked.has(i);
    const isWeapon = offer.type === 'weapon';
    const def = isWeapon ? WEAPONS[offer.id as WeaponId] : null;
    const item = isWeapon ? null : ITEMS[offer.id];
    const color = def?.color ?? item!.color;
    const rarity = item ? RARITIES[item.rarity] : null;
    // Items are framed by rarity (so colour always means rarity); weapons by their own colour.
    const frame = rarity ? rarity.color : color;
    const check = canBuy(offer, this.run.crumbs, this.run.weapons, this.run.items, maxLinksFor(this.run));

    g.fillStyle(0x000000, 0.4).fillRoundedRect(left + 4, top + 6, CARD_W, CARD_H, 14);
    g.fillStyle(0x2a1d16, 1).fillRoundedRect(left, top, CARD_W, CARD_H, 14);
    g.fillStyle(color, 0.22).fillRoundedRect(left, top, CARD_W, 84, { tl: 14, tr: 14, bl: 0, br: 0 });
    g.lineStyle(kept ? 4 : 3, kept ? 0x8fd3ff : frame, kept || rarity ? 1 : 0.6).strokeRoundedRect(left, top, CARD_W, CARD_H, 14);
    if (i === this.focus) g.lineStyle(3, 0xffd23f, 1).strokeRoundedRect(left - 6, top - 6, CARD_W + 12, CARD_H + 12, 18);

    if (def) {
      add(this.add.image(x, top + 44, 'sausage-link').setScale(2));
      add(this.add.image(x, top + 44, def.icon).setScale(2));
    } else {
      g.fillStyle(0x140d0a, 1).fillCircle(x, top + 44, 28);
      g.lineStyle(3, rarity!.color, 1).strokeCircle(x, top + 44, 28);
      add(this.add.image(x, top + 44, `icon-item-${item!.icon}`).setTint(item!.color));
    }
    if (kept) add(this.add.image(left + 22, top + 20, 'icon-lock').setTint(0x8fd3ff));

    // What buying this would actually change.
    let subtitle = isWeapon ? 'WEAPON · new link' : `${rarity!.label.toUpperCase()} ITEM`;
    let stats = '';
    if (isWeapon) {
      const after = applyWeaponPurchase(this.run.weapons, offer.id as WeaponId, maxLinksFor(this.run));
      const changed = after?.find((w, idx) => idx < this.run.weapons.length && w.tier !== this.run.weapons[idx].tier);
      if (changed) {
        subtitle = `WEAPON · upgrade to ${tierLabel(changed.tier)}`;
        stats = weaponStatLine(def!, changed.tier, changed.tier - 1);
      } else {
        stats = weaponStatLine(def!, 1);
      }
    } else {
      const base = sausageBaseStats(BASE_STATS, this.run.sausage);
      const lines = statChanges(computeStats(this.run.items, base), computeStats([...this.run.items, offer.id], base));
      stats = lines.length ? lines.join('\n') : 'No effect (maxed)';
    }
    add(this.add.text(x, top + 100, def?.name ?? item!.name, { fontFamily: FONT, fontSize: '21px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5));
    add(this.add.text(x, top + 124, subtitle, { fontFamily: FONT, fontSize: '12px', fontStyle: 'bold', color: rarity ? rarity.css : '#c8a890' }).setOrigin(0.5));
    add(this.add.text(x, top + 140, def?.desc ?? item!.desc, {
      fontFamily: FONT, fontSize: '14px', color: '#e8d8c8', align: 'center', wordWrap: { width: CARD_W - 28 },
    }).setOrigin(0.5, 0));
    add(this.add.text(x, top + 198, stats, {
      fontFamily: FONT, fontSize: '13px', fontStyle: 'bold', color: '#9fe7a8', align: 'center', wordWrap: { width: CARD_W - 24 }, lineSpacing: 2,
    }).setOrigin(0.5, 0));

    add(new Button(this, x - 38, top + CARD_H - 34, `${i + 1}  Buy · ${offer.price}`, { width: 156, height: 42, fontSize: 17 }, () => this.buy(i))
      .setEnabled(check.ok));
    add(new Button(this, x + 82, top + CARD_H - 34, kept ? 'Kept' : 'Keep', {
      width: 64, height: 42, fill: kept ? 0x2a7fbf : 0x4a3a30, hover: 0x3a8fcf, fontSize: 14,
    }, () => this.toggleLock(i)));
    // One line above the buttons: why you can't buy it, or which weapon it pairs with.
    if (!check.ok && check.reason) {
      add(this.add.text(x, top + CARD_H - 64, check.reason, { fontFamily: FONT, fontSize: '12px', color: '#ff8a70' }).setOrigin(0.5));
    } else if (item?.synergy) {
      add(this.add.text(x, top + CARD_H - 64, `Pairs with ${item.synergy}`, { fontFamily: FONT, fontSize: '11px', color: '#c8a890' }).setOrigin(0.5));
    }
  }

  /** Number keys buy; with Shift held they keep instead. */
  private shiftKeep(i: number): void {
    if (this.shiftHeld()) this.toggleLock(i);
  }

  private shopContext(): ShopContext {
    return { items: this.run.items, luck: runStats(this.run).luck, maxLinks: maxLinksFor(this.run) };
  }

  private shiftHeld(): boolean {
    return !!this.input.keyboard?.addKey('SHIFT').isDown;
  }

  update(): void {
    if (this.time.now < this.inputReadyAt) {
      this.pad.poll(this);
      return;
    }
    for (const b of this.pad.poll(this)) {
      if (b === 'left' || b === 'right') this.moveFocus(b === 'left' ? -1 : 1);
      else if (b === 'a') this.buy(this.focus);
      else if (b === 'y') this.toggleLock(this.focus);
      else if (b === 'x') this.reroll();
      else if (b === 'start') this.next();
    }
  }

  private moveFocus(d: number): void {
    this.focus = (this.focus + d + this.offers.length) % this.offers.length;
    audio.play('click');
    this.render();
  }

  private buy(i: number): void {
    if (this.leaving || this.shiftHeld()) return;
    const offer = this.offers[i];
    if (!offer) return;
    if (!canBuy(offer, this.run.crumbs, this.run.weapons, this.run.items, maxLinksFor(this.run)).ok) {
      audio.play('deny');
      return;
    }
    audio.play('buy');
    this.run.crumbs -= offer.price;
    if (offer.type === 'weapon') {
      this.run.weapons = applyWeaponPurchase(this.run.weapons, offer.id as WeaponId, maxLinksFor(this.run))!;
    } else {
      this.run.items.push(offer.id);
    }
    this.offers[i] = null;
    this.locked.delete(i);
    this.cameras.main.flash(120, 255, 220, 150);
    this.render();
  }

  private toggleLock(i: number): void {
    if (!this.offers[i]) return;
    if (this.locked.has(i)) this.locked.delete(i);
    else this.locked.add(i);
    this.render();
  }

  /** Rerolling only makes sense if at least one slot isn't kept (sold slots get refilled). */
  private canReroll(): boolean {
    return this.offers.some((o, i) => !o || !this.locked.has(i));
  }

  private reroll(): void {
    if (this.leaving || !this.canReroll()) return;
    const cost = rerollCost(this.run.wave, this.run.rerollCount);
    if (this.run.crumbs < cost) return;
    this.run.crumbs -= cost;
    this.run.rerollCount++;
    audio.play('reroll');
    const keep = [...this.locked].map((i) => this.offers[i]).filter((o): o is Offer => !!o);
    this.offers = generateOffers(shopRng(this.run.seed, this.run.wave, this.run.rerollCount), this.run.wave + 1, keep, undefined, this.run.weapons, this.shopContext());
    this.locked = new Set(keep.map((_, i) => i));
    this.render();
  }

  private next(): void {
    if (this.leaving) return;
    this.leaving = true;
    this.run.lockedOffers = [...this.locked].map((i) => this.offers[i]).filter((o): o is Offer => !!o);
    this.run.wave++;
    this.scene.start('Game', { run: this.run });
  }
}
