import type { WeaponDef } from './types';

/**
 * 武器战斗配置。
 *
 * P2 切片四把（pistol / smg / shotgun / rifle）与 G2-6 后四把均已按 D-009
 * 爽感优先方向改造，各自具备独立定位。数值依据与联动记录见对应 G2 执行文档。
 */
export const WEAPONS = {
  // 单发爆头爽：额外 10 个百分点爆头率与 2.5 倍爆头伤害，让精准角色进一步放大单发价值。
  // 散射保留 1.5° 而不是 0：移动惩罚是按散射倍率实现的，spread 为 0 会让这把枪
  // 成为唯一完全不受移动影响的武器，把 MP5 的机动优势直接架空。
  pistol:  { id:'pistol',  name:'沙漠之鹰', damage:50, fireRate:450, magazineSize:7, reloadTime:1200,
             bulletSpeed:900, spread:1.5,  pellets:1, penetration:0, auto:false, ammoType:'light', range:700, color:0xffee88, infiniteAmmo:true,
             canHeadshot:true, headshotChanceBonus:0.1, headshotMultiplier:2.5 },
  // 爆破清场爽：12 弹丸近距离轰飞一片，残血直接处决；110px 外开始明显衰减，逼玩家贴上去。
  // 逐发填装：装两发就能立刻开火，把「换弹僵直被围死」换成玩家自己的取舍。
  shotgun: { id:'shotgun', name:'SPAS-12', damage:28, fireRate:900, magazineSize:6,  reloadTime:1600,
             bulletSpeed:700, spread:20, pellets:12, penetration:1, auto:false, ammoType:'shell', range:340, color:0xffaa55, infiniteAmmo:false,
             canHeadshot:true, headshotChanceBonus:0, headshotMultiplier:2,
             knockback:150, executeThreshold:0.3, reloadMode:'shell',
             damageDropoff:[{ distance:0, multiplier:1 }, { distance:110, multiplier:0.7 }, { distance:210, multiplier:0.35 }] },
  // 穿透连杀爽：一枪最多贯穿 7 个，越穿越痛（每穿一个 +20%）。射速降到 150ms 与 MP5 拉开职责。
  rifle:   { id:'rifle',   name:'M4A1',    damage:45, fireRate:150, magazineSize:30, reloadTime:2000,
             bulletSpeed:1500,spread:3,  pellets:1, penetration:6, auto:true,  ammoType:'heavy', range:1200, color:0x88ddff, infiniteAmmo:false,
             canHeadshot:true, headshotChanceBonus:0, headshotMultiplier:2,
             chainBonus:1.2 },
  // 扫射压制爽：1200 RPM 弹雨，移动射击只承受 30% 散射惩罚，是唯一能边跑边压制的武器。
  smg:     { id:'smg',     name:'MP5',     damage:18, fireRate:50,  magazineSize:50, reloadTime:1300,
             bulletSpeed:850, spread:8,  pellets:1, penetration:0, auto:true,  ammoType:'light', range:600, color:0xffee88, infiniteAmmo:false,
             canHeadshot:true, headshotChanceBonus:0, headshotMultiplier:2,
             movementPenalty:0.3 },
  // 泼洒压制：中高伤害 + 高射速 + 大弹匣，移动时只承受 65% 散射惩罚，适合边走边压制密集群。
  ak47:    { id:'ak47',    name:'AK-47',   damage:34, fireRate:82, magazineSize:45, reloadTime:1850,
             bulletSpeed:980, spread:8, pellets:1, penetration:2, auto:true, ammoType:'heavy', range:880, color:0xffc36b, infiniteAmmo:false,
             canHeadshot:true, headshotChanceBonus:0, headshotMultiplier:2,
             movementPenalty:0.65 },
  // 一击必杀：极高单发、强穿透与击退，精准武器修正用于制造 S 级单枪高光；Boss 仍不吃处决。
  barrett: { id:'barrett', name:'BARRETT M82', damage:210, fireRate:1150, magazineSize:4, reloadTime:2600,
             bulletSpeed:1650, spread:1, pellets:1, penetration:8, auto:false, ammoType:'heavy', range:1350, color:0xd4f1ff, infiniteAmmo:false, projectileRadius:6,
             canHeadshot:true, headshotChanceBonus:0.1, headshotMultiplier:2.5,
             knockback:220, chainBonus:1.08, killSlowMotionTier:'A' },
  // 大清屏：单发慢装但爆炸半径与伤害显著提高，定位为主动清掉一整团敌人的资源型武器。
  rpg:     { id:'rpg',     name:'RPG-7', damage:35, fireRate:1450, magazineSize:1, reloadTime:2800,
             bulletSpeed:390, spread:2, pellets:1, penetration:0, auto:false, ammoType:'explosive', range:820, color:0xff7f4d, infiniteAmmo:false, projectileRadius:9,
             canHeadshot:false, headshotChanceBonus:0, headshotMultiplier:1,
             impactEffect:{ kind:'explosion', damage:260, radius:170 } },
  // 弹跳节奏爆破：命中障碍先反弹一次，玩家可以把榴弹打进拐角后爆炸。
  m79:     { id:'m79',     name:'M79', damage:24, fireRate:780, magazineSize:1, reloadTime:1650,
             bulletSpeed:420, spread:4, pellets:1, penetration:0, auto:false, ammoType:'explosive', range:620, color:0xf0b95e, infiniteAmmo:false, projectileRadius:7,
             canHeadshot:false, headshotChanceBonus:0, headshotMultiplier:1,
             bounceCount:1, impactEffect:{ kind:'explosion', damage:145, radius:105 } },
  // 持续压制：起步较慢，按住扳机 1.2 秒后进入最高射速；大弹箱换来最长换弹窗口。
  gatling: { id:'gatling', name:'GAU-8 GATLING', damage:15, fireRate:45, magazineSize:180, reloadTime:4200,
             bulletSpeed:1050, spread:12, pellets:1, penetration:1, auto:true, ammoType:'belt', range:780, color:0xff9b63, infiniteAmmo:false,
             canHeadshot:true, headshotChanceBonus:0, headshotMultiplier:2,
             movementPenalty:1, spinUp:{ durationMs:1200, initialFireRate:160 } },
  // 稳定轻机枪：不需要预热，以更高精度和每十发一次的黄金弹链与加特林区分。
  golden_m249: { id:'golden_m249', name:'GOLDEN M249', damage:25, fireRate:85, magazineSize:100, reloadTime:3200,
             bulletSpeed:1000, spread:6, pellets:1, penetration:1, auto:true, ammoType:'belt', range:900, color:0xf4c84a, infiniteAmmo:false,
             canHeadshot:true, headshotChanceBonus:0, headshotMultiplier:2,
             movementPenalty:0.7, ammoChain:{ interval:10, bonusBurstCount:1, damageFactor:1.4 } },
  // 短程火流：每份燃料同时喷出三束火焰，落点刷新邻近燃烧区，不触发爆炸反馈也不反伤玩家。
  flamethrower: { id:'flamethrower', name:'FLAMETHROWER', damage:5, fireRate:90, magazineSize:60, reloadTime:2600,
             bulletSpeed:460, spread:16, pellets:3, penetration:0, auto:true, ammoType:'fuel', range:250, color:0xff642e, infiniteAmmo:false, projectileRadius:7,
             canHeadshot:false, headshotChanceBonus:0, headshotMultiplier:1,
             movementPenalty:0.85, projectileStyle:'flame',
             impactLinger:{ kind:'fire', duration:700, radius:36, tickDamage:6, tickRate:250, color:0xff642e,
               stackMode:'refresh-nearby', refreshDistance:42, damagesPlayer:false, playLoop:false } },
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
