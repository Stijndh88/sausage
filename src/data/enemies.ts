export type EnemyKind = 'fork' | 'spatula' | 'ketchup' | 'hotsauce' | 'tongs';

export interface EnemyDef {
  kind: EnemyKind;
  name: string;
  hp: number;
  speed: number;
  radius: number;
  /** Heat dealt to the sausage on contact. */
  contactHeat: number;
  /** Heat dealt by each of this enemy's bullets. */
  bulletHeat: number;
  crumbs: number;
  texture: string;
  /** Melee enemies get shoved away when they bump into your links. */
  melee: boolean;
}

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  fork: {
    kind: 'fork', name: 'Fork', hp: 12, speed: 100, radius: 14,
    contactHeat: 8, bulletHeat: 0, crumbs: 1, texture: 'enemy-fork', melee: true,
  },
  spatula: {
    kind: 'spatula', name: 'Spatula', hp: 24, speed: 65, radius: 17,
    contactHeat: 14, bulletHeat: 0, crumbs: 3, texture: 'enemy-spatula', melee: true,
  },
  ketchup: {
    kind: 'ketchup', name: 'Ketchup Bottle', hp: 18, speed: 75, radius: 15,
    contactHeat: 8, bulletHeat: 8, crumbs: 3, texture: 'enemy-ketchup', melee: false,
  },
  hotsauce: {
    kind: 'hotsauce', name: 'Hot Sauce Turret', hp: 45, speed: 0, radius: 16,
    contactHeat: 8, bulletHeat: 9, crumbs: 4, texture: 'enemy-hotsauce', melee: false,
  },
  tongs: {
    kind: 'tongs', name: "The Grill Master's Tongs", hp: 2400, speed: 55, radius: 46,
    contactHeat: 18, bulletHeat: 10, crumbs: 0, texture: 'enemy-tongs', melee: false,
  },
};
