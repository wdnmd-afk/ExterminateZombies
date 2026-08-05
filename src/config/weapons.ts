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
  ak47:    { id:'ak47',    name:'AK-47',   damage:30, fireRate:105, magazineSize:30, reloadTime:1650,
             bulletSpeed:920, spread:6, pellets:1, penetration:1, auto:true, ammoType:'heavy', range:820, color:0xffc36b, infiniteAmmo:false },
  barrett: { id:'barrett', name:'BARRETT M82', damage:140, fireRate:900, magazineSize:5, reloadTime:2300,
             bulletSpeed:1400, spread:1, pellets:1, penetration:6, auto:false, ammoType:'heavy', range:1200, color:0xd4f1ff, infiniteAmmo:false, projectileRadius:5 },
  rpg:     { id:'rpg',     name:'RPG-7', damage:30, fireRate:1200, magazineSize:1, reloadTime:2400,
             bulletSpeed:420, spread:2, pellets:1, penetration:0, auto:false, ammoType:'explosive', range:760, color:0xff7f4d, infiniteAmmo:false, projectileRadius:8,
             impactEffect:{ kind:'explosion', damage:180, radius:125 } },
  m79:     { id:'m79',     name:'M79', damage:20, fireRate:850, magazineSize:1, reloadTime:1750,
             bulletSpeed:360, spread:5, pellets:1, penetration:0, auto:false, ammoType:'explosive', range:520, color:0xf0b95e, infiniteAmmo:false, projectileRadius:7,
             impactEffect:{ kind:'explosion', damage:120, radius:90 } },
} satisfies Record<string, WeaponDef>;

export type WeaponId = keyof typeof WEAPONS;

/**
 * 按 `WeaponDef` 接口读取武器定义。
 * `WEAPONS` 用 `satisfies` 保留了字面量类型，直接索引得到的是联合类型，
 * 只在部分武器上出现的可选字段（`impactEffect`、`projectileRadius`）会读不到。
 */
export function getWeaponDef(id: WeaponId): WeaponDef {
  return WEAPONS[id];
}
