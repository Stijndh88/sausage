import Phaser from 'phaser';
import { GAME_H, GAME_W } from '../art/textures';
import { ITEMS } from '../data/items';
import { MAX_LINKS, WEAPONS, tierLabel, type WeaponId } from '../data/weapons';
import { TOTAL_WAVES } from '../data/waves';
import type { RunState } from '../state/run';
import { tierFor } from '../systems/Doneness';
import {
  applyWeaponPurchase, canBuy, generateOffers, rerollCost, shopRng, type Offer,
} from '../systems/Economy';
import { Button } from '../ui/Button';
import { FONT } from '../ui/Hud';

const CARD_W = 250;
const CARD_H = 290;

/** Between waves: spend crumbs on new links (weapons) or passive items. */
export class ShopScene extends Phaser.Scene {
  private run!: RunState;
  private offers: (Offer | null)[] = [];
  private locked = new Set<number>();
  private ui: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super('Shop');
  }

  init(data: { run: RunState }): void {
    this.run = data.run;
    this.run.rerollCount = 0;
    const lockedOffers = this.run.lockedOffers;
    this.offers = generateOffers(shopRng(this.run.seed, this.run.wave, 0), this.run.wave + 1, lockedOffers);
    this.locked = new Set(lockedOffers.map((_, i) => i));
    this.run.lockedOffers = [];
  }

  create(): void {
    this.add.image(0, 0, 'bg-grill').setOrigin(0).setAlpha(0.35);
    this.add.rectangle(0, 0, GAME_W, GAME_H, 0x140d0a, 0.6).setOrigin(0);

    const kb = this.input.keyboard!;
    kb.on('keydown-ONE', () => this.buy(0));
    kb.on('keydown-TWO', () => this.buy(1));
    kb.on('keydown-THREE', () => this.buy(2));
    kb.on('keydown-FOUR', () => this.buy(3));
    kb.on('keydown-R', () => this.reroll());
    kb.on('keydown-ENTER', () => this.next());
    kb.on('keydown-SPACE', () => this.next());

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

    // Crumbs + heat summary
    add(this.add.image(GAME_W - 190, 46, 'crumb').setScale(2.4));
    add(this.add.text(GAME_W - 170, 46, String(run.crumbs), { fontFamily: FONT, fontSize: '32px', fontStyle: 'bold', color: '#f0c070' }).setOrigin(0, 0.5));
    const tier = tierFor(run.heat);
    add(this.add.text(40, 46, `${tier.name} · ${Math.floor(run.heat)}°`, { fontFamily: FONT, fontSize: '22px', fontStyle: 'bold', color: '#ffb070' }).setOrigin(0, 0.5));

    // Offer cards
    const total = this.offers.length;
    const gap = 24;
    const startX = GAME_W / 2 - ((CARD_W + gap) * total - gap) / 2 + CARD_W / 2;
    this.offers.forEach((offer, i) => this.renderCard(add, offer, i, startX + i * (CARD_W + gap), 290));

    // Bottom row: reroll + next
    const cost = rerollCost(run.wave, run.rerollCount);
    add(new Button(this, GAME_W / 2 - 150, 490, `Reroll (R)  ${cost}`, { width: 240, height: 52, fill: 0x5a4a3a, hover: 0x7a6650 }, () => this.reroll())
      .setEnabled(run.crumbs >= cost));
    add(new Button(this, GAME_W / 2 + 150, 490, 'Next wave  ▶', { width: 240, height: 52, fill: 0x3c8d3c, hover: 0x52b052 }, () => this.next()));

    // Loadout
    add(this.add.text(40, 548, `LINKS ${run.weapons.length}/${MAX_LINKS}`, { fontFamily: FONT, fontSize: '16px', fontStyle: 'bold', color: '#c8a890' }));
    run.weapons.forEach((w, i) => {
      const x = 60 + i * 120;
      add(this.add.image(x, 600, 'sausage-link').setScale(1.6));
      add(this.add.image(x, 600, WEAPONS[w.id].icon).setScale(1.5));
      add(this.add.text(x, 634, `${WEAPONS[w.id].name}\n${tierLabel(w.tier)}`, { fontFamily: FONT, fontSize: '12px', color: '#ffffff', align: 'center' }).setOrigin(0.5, 0));
    });
    add(this.add.text(780, 548, 'ITEMS', { fontFamily: FONT, fontSize: '16px', fontStyle: 'bold', color: '#c8a890' }));
    const counts = new Map<string, number>();
    for (const id of run.items) counts.set(id, (counts.get(id) ?? 0) + 1);
    const itemLines = [...counts].map(([id, n]) => `${ITEMS[id].name}${n > 1 ? ` ×${n}` : ''}`);
    add(this.add.text(780, 574, itemLines.length ? itemLines.join('   ') : 'None yet', {
      fontFamily: FONT, fontSize: '14px', color: '#ffffff', wordWrap: { width: 460 }, lineSpacing: 6,
    }));
    add(this.add.text(GAME_W / 2, GAME_H - 18, '1-4 buy · R reroll · Enter next wave · "Keep" holds an offer through rerolls and into the next shop', {
      fontFamily: FONT, fontSize: '13px', color: '#8a7060',
    }).setOrigin(0.5));
  }

  private renderCard(add: <T extends Phaser.GameObjects.GameObject>(o: T) => T, offer: Offer | null, i: number, x: number, y: number): void {
    const g = add(this.add.graphics());
    const left = x - CARD_W / 2;
    const top = y - CARD_H / 2;
    if (!offer) {
      g.lineStyle(2, 0x5a4a3a, 0.6).strokeRoundedRect(left, top, CARD_W, CARD_H, 14);
      add(this.add.text(x, y, 'SOLD', { fontFamily: FONT, fontSize: '28px', fontStyle: 'bold', color: '#5a4a3a' }).setOrigin(0.5));
      return;
    }
    const isWeapon = offer.type === 'weapon';
    const def = isWeapon ? WEAPONS[offer.id as WeaponId] : null;
    const item = isWeapon ? null : ITEMS[offer.id];
    const color = def?.color ?? item!.color;
    const check = canBuy(offer, this.run.crumbs, this.run.weapons);

    g.fillStyle(0x000000, 0.4).fillRoundedRect(left + 4, top + 6, CARD_W, CARD_H, 14);
    g.fillStyle(0x2a1d16, 1).fillRoundedRect(left, top, CARD_W, CARD_H, 14);
    g.fillStyle(color, 0.25).fillRoundedRect(left, top, CARD_W, 80, { tl: 14, tr: 14, bl: 0, br: 0 });
    g.lineStyle(3, this.locked.has(i) ? 0x8fd3ff : color, this.locked.has(i) ? 1 : 0.6).strokeRoundedRect(left, top, CARD_W, CARD_H, 14);

    if (def) {
      add(this.add.image(x, top + 42, 'sausage-link').setScale(2));
      add(this.add.image(x, top + 42, def.icon).setScale(2));
    } else {
      const ig = add(this.add.graphics());
      ig.fillStyle(color, 1).fillCircle(x, top + 42, 22);
      ig.lineStyle(3, 0xffffff, 0.5).strokeCircle(x, top + 42, 22);
    }

    let subtitle = isWeapon ? 'WEAPON · new link' : 'ITEM';
    if (isWeapon) {
      const after = applyWeaponPurchase(this.run.weapons, offer.id as WeaponId);
      const upgraded = after && after.length === this.run.weapons.length;
      if (upgraded) {
        const changed = after.find((w, idx) => w.tier !== this.run.weapons[idx].tier)!;
        subtitle = `WEAPON · upgrade to ${tierLabel(changed.tier)}`;
      }
    }
    add(this.add.text(x, top + 98, def?.name ?? item!.name, { fontFamily: FONT, fontSize: '22px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5));
    add(this.add.text(x, top + 124, subtitle, { fontFamily: FONT, fontSize: '12px', fontStyle: 'bold', color: '#c8a890' }).setOrigin(0.5));
    add(this.add.text(x, top + 150, def?.desc ?? item!.desc, {
      fontFamily: FONT, fontSize: '15px', color: '#e8d8c8', align: 'center', wordWrap: { width: CARD_W - 30 },
    }).setOrigin(0.5, 0));

    add(new Button(this, x - 38, top + CARD_H - 34, `${i + 1}  Buy · ${offer.price}`, { width: 156, height: 42, fontSize: 17 }, () => this.buy(i))
      .setEnabled(check.ok));
    add(new Button(this, x + 82, top + CARD_H - 34, this.locked.has(i) ? 'Kept' : 'Keep', {
      width: 64, height: 42, fill: this.locked.has(i) ? 0x2a7fbf : 0x4a3a30, hover: 0x3a8fcf, fontSize: 14,
    }, () => this.toggleLock(i)));
    if (!check.ok && check.reason) {
      add(this.add.text(x, top + CARD_H - 70, check.reason, { fontFamily: FONT, fontSize: '12px', color: '#ff8a70' }).setOrigin(0.5));
    }
  }

  private buy(i: number): void {
    const offer = this.offers[i];
    if (!offer || !canBuy(offer, this.run.crumbs, this.run.weapons).ok) return;
    this.run.crumbs -= offer.price;
    if (offer.type === 'weapon') {
      this.run.weapons = applyWeaponPurchase(this.run.weapons, offer.id as WeaponId)!;
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

  private reroll(): void {
    const cost = rerollCost(this.run.wave, this.run.rerollCount);
    if (this.run.crumbs < cost) return;
    this.run.crumbs -= cost;
    this.run.rerollCount++;
    const keep = [...this.locked].map((i) => this.offers[i]).filter((o): o is Offer => !!o);
    this.offers = generateOffers(shopRng(this.run.seed, this.run.wave, this.run.rerollCount), this.run.wave + 1, keep);
    this.locked = new Set(keep.map((_, i) => i));
    this.render();
  }

  private next(): void {
    this.run.lockedOffers = [...this.locked].map((i) => this.offers[i]).filter((o): o is Offer => !!o);
    this.run.wave++;
    this.scene.start('Game', { run: this.run });
  }
}
