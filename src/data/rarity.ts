/** Item rarities: better ones show up more often in later waves and with more Luck. */
export type Rarity = 'common' | 'uncommon' | 'rare' | 'legendary';

export const RARITY_ORDER: readonly Rarity[] = ['common', 'uncommon', 'rare', 'legendary'];

export interface RarityDef {
  id: Rarity;
  label: string;
  /** Card frame / label colour. */
  color: number;
  css: string;
}

export const RARITIES: Record<Rarity, RarityDef> = {
  common: { id: 'common', label: 'Common', color: 0xd8d0c4, css: '#d8d0c4' },
  uncommon: { id: 'uncommon', label: 'Uncommon', color: 0x5fd36b, css: '#5fd36b' },
  rare: { id: 'rare', label: 'Rare', color: 0x4aa8ff, css: '#4aa8ff' },
  legendary: { id: 'legendary', label: 'Legendary', color: 0xffb21f, css: '#ffb21f' },
};

/**
 * Relative odds of each rarity for one item slot in the shop after `wave`'s fight.
 * Rares start at wave 3, legendaries at wave 5. Luck (in %) boosts everything but common.
 */
export function rarityWeights(wave: number, luck = 0): Record<Rarity, number> {
  const l = 1 + Math.max(0, luck) / 100;
  return {
    common: 100,
    uncommon: (10 + 6 * (wave - 1)) * l,
    rare: wave >= 3 ? (2 + 3 * (wave - 3)) * l : 0,
    legendary: wave >= 5 ? (0.5 + 1.2 * (wave - 5)) * l : 0,
  };
}
