/**
 * "Pick the menu": when you push on, you choose how the next course is served.
 * One spicy menu (a twist for more Spice) against the Light Lunch (no change).
 */
export type MenuId = 'light_lunch' | 'grease_fire' | 'rush_hour' | 'tough_cuts' | 'glass_plates' | 'stingy_chef';

export interface MenuDef {
  id: MenuId;
  name: string;
  desc: string;
  /** Added to the Spice multiplier for the course (0.25 = +25%). */
  spiceBonus: number;
  extraHotTiles?: number;
  /** Multiplies time between spawns (0.8 = 20% faster). */
  spawnMult?: number;
  enemyHpMult?: number;
  /** Multiplies damage you take. */
  damageTakenMult?: number;
  priceMult?: number;
}

export const MENUS: Record<MenuId, MenuDef> = {
  light_lunch: { id: 'light_lunch', name: 'Light Lunch', desc: 'No surprises.', spiceBonus: 0 },
  grease_fire: { id: 'grease_fire', name: 'Grease Fire', desc: '+2 hot grill tiles every wave.', spiceBonus: 0.25, extraHotTiles: 2 },
  rush_hour: { id: 'rush_hour', name: 'Rush Hour', desc: 'Enemies arrive 20% faster.', spiceBonus: 0.3, spawnMult: 0.8 },
  tough_cuts: { id: 'tough_cuts', name: 'Tough Cuts', desc: 'Enemies have +25% HP.', spiceBonus: 0.3, enemyHpMult: 1.25 },
  glass_plates: { id: 'glass_plates', name: 'Glass Plates', desc: 'You take 25% more damage.', spiceBonus: 0.35, damageTakenMult: 1.25 },
  stingy_chef: { id: 'stingy_chef', name: 'Stingy Chef', desc: 'Shop prices +25%.', spiceBonus: 0.25, priceMult: 1.25 },
};

export const SPICY_MENUS: readonly MenuId[] = ['grease_fire', 'rush_hour', 'tough_cuts', 'glass_plates', 'stingy_chef'];

export function menuDef(id: MenuId | null): MenuDef {
  return MENUS[id ?? 'light_lunch'];
}
