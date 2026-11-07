import { beforeEach, describe, expect, it } from 'vitest';
import { HELP, HELP_SECTIONS, helpFor, isKnown } from '../src/data/help';
import { EVENT_KINDS } from '../src/data/events';
import { ITEMS, ITEM_IDS } from '../src/data/items';
import { WEAPONS, WEAPON_IDS, MAX_TIER } from '../src/data/weapons';
import { defaultSave, loadSave, markSeen, migrate, resetSaveCache, writeSave } from '../src/state/save';
import { itemTooltip, weaponTooltip } from '../src/ui/tooltipText';

beforeEach(() => {
  resetSaveCache();
  writeSave(defaultSave());
});

describe('How to Play: no spoilers', () => {
  it('a fresh save shows the basics and the shop, but no links, items or events', () => {
    const save = loadSave();
    expect(helpFor('basics', save).entries.map((e) => e.id)).toContain('mech:dash');
    expect(helpFor('shop', save).entries.length).toBeGreaterThan(3);
    expect(helpFor('links', save).entries).toEqual([]);
    expect(helpFor('items', save).entries).toEqual([]);
    expect(helpFor('events', save).entries).toEqual([]);
    expect(helpFor('links', save).hidden).toBe(WEAPON_IDS.length);
    expect(helpFor('items', save).hidden).toBe(ITEM_IDS.length);
    // Weapon-specific mechanics wait for the weapon.
    expect(helpFor('basics', save).entries.map((e) => e.id)).not.toContain('mech:poison');
  });

  it('meeting things unlocks exactly their entries', () => {
    markSeen('weapon:mustard', 'item:golden_sausage', 'event:bounty', 'event:golden');
    const save = loadSave();
    expect(helpFor('links', save).entries.map((e) => e.id)).toEqual(['weapon:mustard']);
    expect(helpFor('items', save).entries.map((e) => e.id)).toEqual(['item:golden_sausage']);
    const events = helpFor('events', save).entries.map((e) => e.id);
    expect(events).toEqual(['event:about', 'event:golden', 'event:bounty']);
    expect(helpFor('basics', save).entries.map((e) => e.id)).toContain('mech:poison');
  });

  it("explains Chef's Bounty and the Golden Sausage", () => {
    markSeen('event:bounty', 'item:golden_sausage');
    const save = loadSave();
    const bounty = helpFor('events', save).entries.find((e) => e.id === 'event:bounty')!;
    expect(bounty.title).toBe("Chef's Bounty");
    expect(bounty.body).toMatch(/kills within \d+ seconds/);
    const golden = helpFor('items', save).entries.find((e) => e.id === 'item:golden_sausage')!;
    expect(golden.body).toContain(ITEMS.golden_sausage.desc);
  });

  it('every event, link and item has an entry with text', () => {
    for (const k of EVENT_KINDS) expect(HELP.some((e) => e.id === `event:${k}` && e.body.length > 20)).toBe(true);
    for (const id of WEAPON_IDS) expect(HELP.some((e) => e.id === `weapon:${id}`)).toBe(true);
    for (const id of ITEM_IDS) expect(HELP.some((e) => e.id === `item:${id}`)).toBe(true);
    for (const s of HELP_SECTIONS) expect(HELP.some((e) => e.section === s.id)).toBe(true);
    expect(new Set(HELP.map((e) => e.id)).size).toBe(HELP.length);
  });

  it('markSeen only writes new things, and old saves get an empty list', () => {
    markSeen('event:rain', 'event:rain');
    markSeen('event:rain');
    expect(loadSave().seen).toEqual(['event:rain']);
    const old = migrate({ version: 2, spice: 5 });
    expect(old.seen).toEqual([]);
    expect(migrate({ version: 2, seen: 'junk' }).seen).toEqual([]);
  });

  it('things you meet after a first run show for players who already played', () => {
    const veteran = { ...defaultSave(), runs: 3, counters: { bossKills: 1 } };
    const ids = HELP.filter((e) => isKnown(e, veteran)).map((e) => e.id);
    expect(ids).toEqual(expect.arrayContaining(['mech:boss', 'mech:seconds', 'mech:cookbook', 'mech:rack']));
  });
});

describe('tooltips', () => {
  it('a link shows its numbers and the next tier', () => {
    const t = weaponTooltip(WEAPONS.toothpick, 1);
    expect(t.title).toBe('Toothpick I');
    expect(t.lines.join('\n')).toContain('DMG 7');
    expect(t.lines.at(-1)).toMatch(/^Next tier: DMG 7 → 10\.5/);
    expect(weaponTooltip(WEAPONS.toothpick, MAX_TIER).lines.at(-1)).toBe('Max tier');
    expect(weaponTooltip(WEAPONS.mustard, 2).lines.join('\n')).toContain('Poison');
  });

  it('an item shows its effect, stack count and pairing', () => {
    const t = itemTooltip(ITEMS.pickle_juice, 2);
    expect(t.subtitle).toBe('UNCOMMON ITEM');
    expect(t.lines).toEqual([ITEMS.pickle_juice.desc, 'You have 2 of max 4', 'Pairs with Pickle Launcher']);
    expect(itemTooltip(ITEMS.paprika, 3).lines[1]).toBe('You have 3');
  });
});
