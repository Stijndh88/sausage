import Phaser from 'phaser';
import { bindPrompt, getInputMode, hint, type InputMode } from '../ui/inputMode';
import { GAME_H, GAME_W } from '../art/textures';
import { ITEMS } from '../data/items';
import { WEAPONS, tierLabel, type WeaponId } from '../data/weapons';
import type { RunState } from '../state/run';
import { runBaseStats, tally } from '../state/run';
import { bossName, courseName, locate } from '../data/courses';
import { menuDef } from '../data/menus';
import { SAUSAGES } from '../data/sausages';
import { MAX_TIER } from '../data/weapons';
import { loadSave, markSeen, unlockedRarities, unlockedWeapons } from '../state/save';
import { RARITIES } from '../data/rarity';
import { maxLinksFor, runStats } from '../state/run';
import { computeStats } from '../state/stats';
import { statChanges, weaponStatLine } from '../systems/statText';
import {
  applyWeaponPurchase, canBuy, generateOffers, rerollCost, shopRng, weaponBuyModes, type Offer, type ShopContext,
} from '../systems/Economy';
import { nextStack, stackCounts, stackLevel, STACK_THRESHOLDS } from '../data/stacks';
import { Button } from '../ui/Button';
import { FONT } from '../ui/Hud';
import { onKeyPress } from '../ui/input';
import { audio } from '../audio/Audio';
import { PadPoller } from '../ui/pad';
import { fitCamera } from '../ui/view';
import { itemIcon } from '../ui/itemIcon';
import { Tooltip } from '../ui/Tooltip';
import { itemTooltip, weaponTooltip, type TooltipContent } from '../ui/tooltipText';

const CARD_W = 250;
const CARD_H = 322;
const CARD_Y = 300;
const ROW_Y = 500;

/** Between waves: spend crumbs on new links (weapons) or passive items. */
/** The how-to line under the shop, for the device in use. */
const SHOP_HELP: Record<InputMode, string> = {
  keyboard: '1-4 buy · Shift+1-4 keep · R reroll · Enter next wave · ◄► pick a card · ▲▼ new link or upgrade · Tab / hover: your links and items',
  pad: '◄► pick a card · ▲▼ new link or upgrade · (A) buy · (Y) keep · (X) reroll · (Start) next wave · (LB/RB) your links and items',
  touch: 'Tap Buy to buy · tap Keep to save it · tap New link / Upgrade to choose · tap a link or item for info',
};

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
  /** Free Refill talent: rerolls left in this shop that cost nothing. */
  private freeRerolls = 0;
  /** Every reroll in this shop, free ones included (seeds the next roll). */
  private rerollsDone = 0;
  /** Weapon cards set to "upgrade a copy" instead of the default "new link". */
  private upgradeMode = new Set<number>();
  /** Info on your links and items: hover / tap, or Tab (LB/RB) then ◄► with keys or a controller. */
  private tooltip!: Tooltip;
  private targets: { content: () => TooltipContent; x: number; y: number }[] = [];
  /** -1 = focus is on the offer cards; otherwise the link/item whose tooltip is open. */
  private loadoutFocus = -1;

  constructor() {
    super('Shop');
  }

  init(data: { run: RunState }): void {
    this.run = data.run;
    this.run.rerollCount = 0;
    this.freeRerolls = this.run.mods.freeRerolls;
    this.rerollsDone = 0;
    this.leaving = false;
    this.loadoutFocus = -1;
    const lockedOffers = this.run.lockedOffers;
    this.offers = generateOffers(shopRng(this.run.seed, this.run.wave, 0), this.run.wave + 1, lockedOffers, undefined, this.run.weapons, this.shopContext());
    this.locked = new Set(lockedOffers.map((_, i) => i));
    this.run.lockedOffers = [];
    this.upgradeMode.clear();
  }

  create(): void {
    fitCamera(this);
    audio.setMood('menu');
    this.add.image(0, 0, 'bg-grill').setOrigin(0).setDisplaySize(GAME_W, GAME_H).setAlpha(0.35);
    this.add.rectangle(0, 0, GAME_W, GAME_H, 0x140d0a, 0.6).setOrigin(0);

    // Space is deliberately NOT bound: it's the dash key, and a held dash must never skip the shop.
    this.inputReadyAt = this.time.now + 350;
    const kb = this.input.keyboard!;
    const ready = () => this.time.now >= this.inputReadyAt;
    // 1-4 buy; Shift+1-4 keeps (locks) that offer instead. Shift is read from the key event itself.
    (['ONE', 'TWO', 'THREE', 'FOUR'] as const).forEach((key, i) => {
      onKeyPress(kb, key, (e) => (e.shiftKey ? this.toggleLock(i) : this.buy(i)), ready);
    });
    onKeyPress(kb, 'R', () => this.reroll(), ready);
    onKeyPress(kb, 'ENTER', () => this.next(), ready);
    onKeyPress(kb, 'LEFT', () => this.moveFocus(-1), ready);
    onKeyPress(kb, 'RIGHT', () => this.moveFocus(1), ready);
    onKeyPress(kb, 'UP', () => this.upDown(), ready);
    onKeyPress(kb, 'DOWN', () => this.upDown(), ready);
    onKeyPress(kb, 'TAB', () => this.browseLoadout(1), ready);
    kb.addCapture('TAB');
    this.tooltip = new Tooltip(this, 50);

    this.render();
    (window as unknown as { __sausage?: unknown }).__sausage = this;
  }

  private render(): void {
    for (const o of this.ui) o.destroy();
    this.ui = [];
    this.targets = [];
    this.tooltip.hide();
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      this.ui.push(o);
      return o;
    };
    const run = this.run;

    add(this.add.text(GAME_W / 2, 46, 'THE CONDIMENT STAND', {
      fontFamily: FONT, fontSize: '40px', fontStyle: 'bold', color: '#ffe0b0', stroke: '#3a1408', strokeThickness: 6,
    }).setOrigin(0.5));
    add(this.add.text(GAME_W / 2, 88, this.headline(), {
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
    const cost = this.rerollPrice();
    const reroll = add(new Button(this, GAME_W / 2 - 150, ROW_Y, '', { width: 240, height: 52, fill: 0x5a4a3a, hover: 0x7a6650 }, () => this.reroll())
      .setEnabled(run.crumbs >= cost && this.canReroll()));
    bindPrompt(reroll, () => `Reroll${hint('R', 'X')}  ${cost === 0 ? 'free' : cost}`);
    const next = add(new Button(this, GAME_W / 2 + 150, ROW_Y, '', { width: 240, height: 52, fill: 0x3c8d3c, hover: 0x52b052 }, () => this.next()));
    bindPrompt(next, () => `Next wave${hint('Enter', 'Start')}  ▶`);

    // Loadout
    add(this.add.text(40, 548, `LINKS ${run.weapons.length}/${maxLinksFor(run)}`, { fontFamily: FONT, fontSize: '16px', fontStyle: 'bold', color: '#c8a890' }));
    // The Kielbasa's 8 links need a tighter row to stay clear of the item list.
    const linkStep = run.weapons.length > 7 ? 90 : 104;
    const counts = stackCounts(run.weapons);
    const stacks = [...counts].filter(([, n]) => n >= STACK_THRESHOLDS[0]).map(([id, n]) => `${WEAPONS[id].name.split(' ')[0]} ×${n} (${stackLevel(n)}/${STACK_THRESHOLDS.length})`);
    if (stacks.length) {
      add(this.add.text(160, 548, `STACKS  ${stacks.join('  ·  ')}`, { fontFamily: FONT, fontSize: '13px', fontStyle: 'bold', color: '#ffd23f' }));
    }
    run.weapons.forEach((w, i) => {
      const x = 60 + i * linkStep;
      add(this.add.image(x, 600, 'sausage-link').setScale(1.6));
      add(this.add.image(x, 600, WEAPONS[w.id].icon).setScale(1.5));
      add(this.add.text(x, 634, `${WEAPONS[w.id].name}\n${tierLabel(w.tier)}`, { fontFamily: FONT, fontSize: '12px', color: '#ffffff', align: 'center' }).setOrigin(0.5, 0));
      this.addTarget(add(this.add.zone(x, 620, linkStep - 8, 84)), () => weaponTooltip(WEAPONS[w.id], w.tier, counts.get(w.id) ?? 1), x, 584);
    });
    add(this.add.text(780, 548, 'ITEMS', { fontFamily: FONT, fontSize: '16px', fontStyle: 'bold', color: '#c8a890' }));
    const itemCounts = new Map<string, number>();
    for (const id of run.items) if (ITEMS[id]) itemCounts.set(id, (itemCounts.get(id) ?? 0) + 1);
    // One text per item, flowed into lines by hand, so each one can be hovered for its tooltip.
    if (!itemCounts.size) add(this.add.text(780, 574, 'None yet', { fontFamily: FONT, fontSize: '14px', color: '#ffffff' }));
    let ix = 780;
    let iy = 574;
    for (const [id, n] of itemCounts) {
      const t = add(this.add.text(ix, iy, `${ITEMS[id].name}${n > 1 ? ` ×${n}` : ''}`, { fontFamily: FONT, fontSize: '14px', color: '#ffffff' }));
      if (ix > 780 && ix + t.width > 1240) {
        ix = 780;
        iy += 23;
        t.setPosition(ix, iy);
      }
      t.setInteractive({ useHandCursor: false });
      this.addTarget(t, () => itemTooltip(ITEMS[id], n), t.x + t.width / 2, t.y);
      ix += t.width + 18;
    }
    if (this.loadoutFocus >= this.targets.length) this.loadoutFocus = this.targets.length - 1;
    if (this.loadoutFocus >= 0) this.showLoadout();
    bindPrompt(add(this.add.text(GAME_W / 2, GAME_H - 18, '', {
      fontFamily: FONT, fontSize: '14px', color: '#b09080',
    }).setOrigin(0.5)), () => SHOP_HELP[getInputMode()]);
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
    const check = canBuy(offer, this.run.crumbs, this.run.weapons, this.run.items, maxLinksFor(this.run), this.modeFor(i));

    g.fillStyle(0x000000, 0.4).fillRoundedRect(left + 4, top + 6, CARD_W, CARD_H, 14);
    g.fillStyle(0x2a1d16, 1).fillRoundedRect(left, top, CARD_W, CARD_H, 14);
    g.fillStyle(color, 0.22).fillRoundedRect(left, top, CARD_W, 84, { tl: 14, tr: 14, bl: 0, br: 0 });
    g.lineStyle(kept ? 4 : 3, kept ? 0x8fd3ff : frame, kept || rarity ? 1 : 0.6).strokeRoundedRect(left, top, CARD_W, CARD_H, 14);
    if (i === this.focus && this.loadoutFocus < 0) g.lineStyle(3, 0xffd23f, 1).strokeRoundedRect(left - 6, top - 6, CARD_W + 12, CARD_H + 12, 18);

    if (def) {
      add(this.add.image(x, top + 44, 'sausage-link').setScale(2));
      add(this.add.image(x, top + 44, def.icon).setScale(2));
    } else {
      g.fillStyle(0x140d0a, 1).fillCircle(x, top + 44, 28);
      g.lineStyle(3, rarity!.color, 1).strokeCircle(x, top + 44, 28);
      add(itemIcon(this, x, top + 44, item!, 46));
    }
    if (kept) add(this.add.image(left + 22, top + 20, 'icon-lock').setTint(0x8fd3ff));

    // What buying this would actually change.
    let subtitle = isWeapon ? 'WEAPON · new link' : `${rarity!.label.toUpperCase()} ITEM`;
    let stats = '';
    let choice: ('link' | 'upgrade')[] = [];
    if (isWeapon) {
      const id = offer.id as WeaponId;
      const max = maxLinksFor(this.run);
      choice = weaponBuyModes(this.run.weapons, id, max);
      const mode = this.modeFor(i);
      const after = applyWeaponPurchase(this.run.weapons, id, max, mode);
      const changed = after?.find((w, idx) => idx < this.run.weapons.length && w.tier !== this.run.weapons[idx].tier);
      if (changed) {
        subtitle = `WEAPON · upgrade to ${tierLabel(changed.tier)}`;
        stats = weaponStatLine(def!, changed.tier, changed.tier - 1);
      } else {
        stats = weaponStatLine(def!, 1);
        // Stacking: say what another copy of this weapon unlocks.
        const have = stackCounts(this.run.weapons).get(id) ?? 0;
        const reached = STACK_THRESHOLDS.find((t) => t === have + 1);
        const upNext = nextStack(id, have);
        if (have > 0) subtitle = `WEAPON · new link (×${have + 1})`;
        if (have > 0 && reached) stats += `\nStack ×${reached}: ${nextStack(id, have)!.text}!`;
        else if (have > 0 && upNext) stats += `\nStack ×${upNext.at}: ${upNext.text}`;
      }
    } else {
      const base = runBaseStats(this.run);
      const lines = statChanges(computeStats(this.run.items, base), computeStats([...this.run.items, offer.id], base));
      stats = lines.length ? lines.join('\n') : 'No effect (maxed)';
    }
    add(this.add.text(x, top + 100, def?.name ?? item!.name, { fontFamily: FONT, fontSize: '21px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5));
    if (choice.length === 2) {
      // You own it and have a free link: pick "New link" (stack it) or "Upgrade" (raise a copy's tier).
      const up = this.upgradeMode.has(i);
      const seg = (label: string, sx: number, on: boolean, toUpgrade: boolean) => add(new Button(this, sx, top + 124, label, {
        width: 106, height: 22, fill: on ? 0x8a5a2a : 0x3a2a20, hover: 0x9a6a3a, fontSize: 12,
      }, () => this.setMode(i, toUpgrade)));
      seg('New link', x - 56, !up, false);
      const target = applyWeaponPurchase(this.run.weapons, offer.id as WeaponId, maxLinksFor(this.run), 'upgrade')!
        .find((w, idx) => w.tier !== this.run.weapons[idx]?.tier);
      seg(`Upgrade → ${tierLabel(target?.tier ?? 2)}`, x + 56, up, true);
    } else {
      add(this.add.text(x, top + 124, subtitle, { fontFamily: FONT, fontSize: '12px', fontStyle: 'bold', color: rarity ? rarity.css : '#c8a890' }).setOrigin(0.5));
    }
    add(this.add.text(x, top + 140, def?.desc ?? item!.desc, {
      fontFamily: FONT, fontSize: '14px', color: '#e8d8c8', align: 'center', wordWrap: { width: CARD_W - 28 },
    }).setOrigin(0.5, 0));
    add(this.add.text(x, top + 198, stats, {
      fontFamily: FONT, fontSize: '13px', fontStyle: 'bold', color: '#9fe7a8', align: 'center', wordWrap: { width: CARD_W - 24 }, lineSpacing: 2,
    }).setOrigin(0.5, 0));

    const buyBtn = add(new Button(this, x - 38, top + CARD_H - 34, '', { width: 156, height: 42, fontSize: 17 }, () => this.buy(i))
      .setEnabled(check.ok));
    bindPrompt(buyBtn, () => `${getInputMode() === 'keyboard' ? `${i + 1}  ` : ''}Buy · ${offer.price}`);
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

  private shopContext(): ShopContext {
    const save = loadSave();
    const run = this.run;
    const weaponPool = [...new Set([...unlockedWeapons(save), ...SAUSAGES[run.sausage].startWeapons])];
    const priceMult = (1 - run.mods.shopDiscount) * (run.chili >= 3 ? 1.2 : 1) * (menuDef(run.menu).priceMult ?? 1);
    return {
      items: run.items,
      luck: runStats(run).luck,
      maxLinks: maxLinksFor(run),
      weaponPool,
      rarities: unlockedRarities(save),
      minRarity: run.mods.betterShop ? 'uncommon' : undefined,
      priceMult,
    };
  }

  /** "The Backyard: wave 3/6 survived. Next up: wave 4" (or the boss, or the next course). */
  private headline(): string {
    const here = locate(this.run.wave);
    const next = locate(this.run.wave + 1);
    const done = here.boss ? `${bossName(here.course)} beaten` : `${courseName(here.course)}: wave ${here.courseWave}/${here.waves} survived`;
    const up = next.boss
      ? `THE BOSS: ${bossName(next.course)}`
      : next.course !== here.course ? `${courseName(next.course)}, wave 1` : `wave ${next.courseWave}`;
    return `${done}. Next up: ${up}`;
  }

  private rerollPrice(): number {
    return this.freeRerolls > 0 ? 0 : rerollCost(this.run.wave, this.run.rerollCount);
  }

  update(): void {
    if (this.time.now < this.inputReadyAt) {
      this.pad.poll(this);
      return;
    }
    for (const b of this.pad.poll(this)) {
      if (b === 'left' || b === 'right') this.moveFocus(b === 'left' ? -1 : 1);
      else if (b === 'up' || b === 'down') this.upDown();
      else if (b === 'lb' || b === 'rb') this.browseLoadout(b === 'lb' ? -1 : 1);
      else if (b === 'a') { if (this.loadoutFocus < 0) this.buy(this.focus); }
      else if (b === 'y') { if (this.loadoutFocus < 0) this.toggleLock(this.focus); }
      else if (b === 'x') this.reroll();
      else if (b === 'start') this.next();
    }
  }

  private moveFocus(d: number): void {
    if (this.loadoutFocus >= 0) {
      // ◄► wrap around your links and items; ↑↓ or Tab past the end go back to the cards.
      const n = this.targets.length;
      this.loadoutFocus = (this.loadoutFocus + d + n) % n;
      audio.play('click');
      this.showLoadout();
      return;
    }
    this.focus = (this.focus + d + this.offers.length) % this.offers.length;
    audio.play('click');
    this.render();
  }

  /** ↑↓: back to the cards from your links and items, otherwise switch a weapon card's buy mode. */
  private upDown(): void {
    if (this.loadoutFocus >= 0) {
      this.loadoutFocus = -1;
      audio.play('click');
      this.render();
    } else {
      this.toggleMode(this.focus);
    }
  }

  /** Tab / LB / RB: step through your links and items (showing each tooltip), then back to the cards. */
  private browseLoadout(d: number): void {
    const n = this.targets.length;
    if (!n) return;
    const wasOnCards = this.loadoutFocus < 0;
    const next = wasOnCards ? (d > 0 ? 0 : n - 1) : this.loadoutFocus + d;
    audio.play('click');
    if (next < 0 || next >= n) {
      this.loadoutFocus = -1;
      this.render();
      return;
    }
    this.loadoutFocus = next;
    if (wasOnCards) this.render(); // drop the card's focus ring (render re-shows the tooltip)
    else this.showLoadout();
  }

  private showLoadout(): void {
    const t = this.targets[this.loadoutFocus];
    if (t) this.tooltip.show(t.content(), t.x, t.y);
  }

  private addTarget(target: Phaser.GameObjects.Zone | Phaser.GameObjects.Text, content: () => TooltipContent, x: number, y: number): void {
    this.targets.push({ content, x, y });
    this.tooltip.attach(target, content, x, y);
  }

  /** How a weapon card buys: 'link' (default) or 'upgrade' when the player picked that. */
  private modeFor(i: number): 'auto' | 'link' | 'upgrade' {
    const offer = this.offers[i];
    if (!offer || offer.type !== 'weapon') return 'auto';
    const modes = weaponBuyModes(this.run.weapons, offer.id as WeaponId, maxLinksFor(this.run));
    if (modes.length < 2) return 'auto';
    return this.upgradeMode.has(i) ? 'upgrade' : 'link';
  }

  private setMode(i: number, upgrade: boolean): void {
    if (upgrade) this.upgradeMode.add(i);
    else this.upgradeMode.delete(i);
    this.render();
  }

  /** ▲▼ on a weapon card you could either stack or upgrade. */
  private toggleMode(i: number): void {
    const offer = this.offers[i];
    if (!offer || offer.type !== 'weapon') return;
    if (weaponBuyModes(this.run.weapons, offer.id as WeaponId, maxLinksFor(this.run)).length < 2) return;
    audio.play('click');
    this.setMode(i, !this.upgradeMode.has(i));
  }

  private buy(i: number): void {
    if (this.leaving) return;
    const offer = this.offers[i];
    if (!offer) return;
    const mode = this.modeFor(i);
    if (!canBuy(offer, this.run.crumbs, this.run.weapons, this.run.items, maxLinksFor(this.run), mode).ok) {
      audio.play('deny');
      return;
    }
    audio.play('buy');
    markSeen(`${offer.type}:${offer.id}`);
    this.run.crumbs -= offer.price;
    if (offer.type === 'weapon') {
      this.run.weapons = applyWeaponPurchase(this.run.weapons, offer.id as WeaponId, maxLinksFor(this.run), mode)!;
      if (this.run.weapons.some((w) => w.id === offer.id && w.tier === MAX_TIER)) tally(this.run, 'tier4', 1, 'max');
      tally(this.run, 'maxLinks', this.run.weapons.length, 'max');
    } else {
      this.run.items.push(offer.id);
      if (ITEMS[offer.id]?.rarity === 'legendary') tally(this.run, 'legendaries');
    }
    this.offers[i] = null;
    this.locked.delete(i);
    this.upgradeMode.delete(i);
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
    const cost = this.rerollPrice();
    if (this.run.crumbs < cost) return;
    this.run.crumbs -= cost;
    if (cost === 0) this.freeRerolls--;
    else this.run.rerollCount++;
    this.rerollsDone++;
    tally(this.run, 'rerolls');
    audio.play('reroll');
    const keep = [...this.locked].map((i) => this.offers[i]).filter((o): o is Offer => !!o);
    this.offers = generateOffers(shopRng(this.run.seed, this.run.wave, this.rerollsDone), this.run.wave + 1, keep, undefined, this.run.weapons, this.shopContext());
    this.locked = new Set(keep.map((_, i) => i));
    this.upgradeMode.clear();
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
