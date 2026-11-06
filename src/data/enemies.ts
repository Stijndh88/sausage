export type EnemyKind = 'fork' | 'spatula' | 'ketchup' | 'hotsauce' | 'tongs';

export interface EnemyDef {
  kind: EnemyKind;
  name: string;
  hp: number;
  speed: number;
  radius: number;
  /** Damage dealt to the sausage on contact. */
  contactDamage: number;
  /** Damage dealt by each of this enemy's bullets. */
  bulletDamage: number;
  crumbs: number;
  texture: string;
  /** Melee enemies get shoved away when they bump into your links. */
  melee: boolean;
}

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  fork: {
    kind: 'fork', name: 'Fork', hp: 12, speed: 100, radius: 14,
    contactDamage: 8, bulletDamage: 0, crumbs: 1, texture: 'enemy-fork', melee: true,
  },
  spatula: {
    kind: 'spatula', name: 'Spatula', hp: 24, speed: 65, radius: 17,
    contactDamage: 14, bulletDamage: 0, crumbs: 2, texture: 'enemy-spatula', melee: true,
  },
  ketchup: {
    kind: 'ketchup', name: 'Ketchup Bottle', hp: 18, speed: 75, radius: 15,
    contactDamage: 8, bulletDamage: 7, crumbs: 2, texture: 'enemy-ketchup', melee: false,
  },
  hotsauce: {
    kind: 'hotsauce', name: 'Hot Sauce Turret', hp: 45, speed: 0, radius: 16,
    contactDamage: 8, bulletDamage: 8, crumbs: 3, texture: 'enemy-hotsauce', melee: false,
  },
  tongs: {
    kind: 'tongs', name: "The Grill Master's Tongs", hp: 4000, speed: 55, radius: 46,
    contactDamage: 18, bulletDamage: 10, crumbs: 0, texture: 'enemy-tongs', melee: false,
  },
};
