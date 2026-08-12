import type { WeaponDef } from './types';

/**
 * 武器战斗配置。
 *
 * P2 切片四把（pistol / smg / shotgun / rifle）已按 D-009 爽感优先方向改造，
 * 每把都有一个不可替代的爽感瞬间；后四把仍是原数值，等 G2-6 单独立项。
 * 数值依据与联动记录见 `docs/execution/2026-08-12-g2-weapon-feel.md`。
 */
export const WEAPONS = {
  // 单发暴击爽：每一枪都有分量，15% 概率炸出三倍伤害。弹匣压到真实的 7 发，强化换弹节奏。
  // 散射保留 1.5° 而不是 0：移动惩罚是按散射倍率实现的，spread 为 0 会让这把枪
  // 成为唯一完全不受移动影响的武器，把 MP5 的机动优势直接架空。
  pistol:  { id:'pistol',  name:'沙漠之鹰', damage:50, fireRate:450, magazineSize:7, reloadTime:1200,
             bulletSpeed:900, spread:1.5,  pellets:1, penetration:0, auto:false, ammoType:'light', range:700, color:0xffee88, infiniteAmmo:true,
             critChance:0.15, critMultiplier:3 },
  // 爆破清场爽：12 弹丸近距离轰飞一片，残血直接处决；110px 外开始明显衰减，逼玩家贴上去。
  // 逐发填装：装两发就能立刻开火，把「换弹僵直被围死」换成玩家自己的取舍。
  shotgun: { id:'shotgun', name:'SPAS-12', damage:28, fireRate:900, magazineSize:6,  reloadTime:1600,
             bulletSpeed:700, spread:20, pellets:12, penetration:1, auto:false, ammoType:'shell', range:340, color:0xffaa55, infiniteAmmo:false,
             knockback:150, executeThreshold:0.3, reloadMode:'shell',
             damageDropoff:[{ distance:0, multiplier:1 }, { distance:110, multiplier:0.7 }, { distance:210, multiplier:0.35 }] },
  // 穿透连杀爽：一枪最多贯穿 7 个，越穿越痛（每穿一个 +20%）。射速降到 150ms 与 MP5 拉开职责。
  rifle:   { id:'rifle',   name:'M4A1',    damage:45, fireRate:150, magazineSize:30, reloadTime:2000,
             bulletSpeed:1500,spread:3,  pellets:1, penetration:6, auto:true,  ammoType:'heavy', range:1200, color:0x88ddff, infiniteAmmo:false,
             chainBonus:1.2 },
  // 扫射压制爽：1200 RPM 弹雨，移动射击只承受 30% 散射惩罚，是唯一能边跑边压制的武器。
  smg:     { id:'smg',     name:'MP5',     damage:18, fireRate:50,  magazineSize:50, reloadTime:1300,
             bulletSpeed:850, spread:8,  pellets:1, penetration:0, auto:true,  ammoType:'light', range:600, color:0xffee88, infiniteAmmo:false,
             movementPenalty:0.3 },
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
