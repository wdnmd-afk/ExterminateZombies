import type { WeaponDef } from './types';

export const WEAPONS = {
  pistol:  { id:'pistol',  name:'沙漠之鹰', damage:25, fireRate:300, magazineSize:12, reloadTime:1000,
             bulletSpeed:800, spread:2,  pellets:1, penetration:0, auto:false, ammoType:'light', range:700, color:0xffee88, infiniteAmmo:true },
  shotgun: { id:'shotgun', name:'SPAS-12', damage:18, fireRate:800, magazineSize:6,  reloadTime:1600,
             bulletSpeed:700, spread:14, pellets:7, penetration:1, auto:false, ammoType:'shell', range:400, color:0xffaa55, infiniteAmmo:false },
  rifle:   { id:'rifle',   name:'M4A1',    damage:35, fireRate:120, magazineSize:30, reloadTime:1500,
             bulletSpeed:1000,spread:4,  pellets:1, penetration:2, auto:true,  ammoType:'heavy', range:900, color:0x88ddff, infiniteAmmo:false },
  smg:     { id:'smg',     name:'MP5',     damage:15, fireRate:70,  magazineSize:40, reloadTime:1300,
             bulletSpeed:850, spread:8,  pellets:1, penetration:0, auto:true,  ammoType:'light', range:600, color:0xffee88, infiniteAmmo:false },
} satisfies Record<string, WeaponDef>;

export type WeaponId = keyof typeof WEAPONS;
