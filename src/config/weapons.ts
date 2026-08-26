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
             canHeadshot:true, headshotChanceBonus:0.1, headshotMultiplier:2.5,
             mobility:{ carry:1, reload:0.95 } },
  // 爆破清场爽：12 弹丸近距离轰飞一片，残血直接处决；110px 外开始明显衰减，逼玩家贴上去。
  // 逐发填装：装两发就能立刻开火，把「换弹僵直被围死」换成玩家自己的取舍。
  shotgun: { id:'shotgun', name:'SPAS-12', damage:28, fireRate:900, magazineSize:6,  reloadTime:1600,
             bulletSpeed:700, spread:20, pellets:12, penetration:1, auto:false, ammoType:'shell', range:340, color:0xffaa55, infiniteAmmo:false,
             canHeadshot:true, headshotChanceBonus:0, headshotMultiplier:2,
             knockback:150, executeThreshold:0.3, reloadMode:'shell',
             mobility:{ carry:0.95, reload:0.8 },
             damageDropoff:[{ distance:0, multiplier:1 }, { distance:110, multiplier:0.7 }, { distance:210, multiplier:0.35 }] },
  // 穿透连杀爽：一枪最多贯穿 7 个，越穿越痛（每穿一个 +20%）。射速降到 150ms 与 MP5 拉开职责。
  rifle:   { id:'rifle',   name:'M4A1',    damage:45, fireRate:150, magazineSize:30, reloadTime:2000,
             bulletSpeed:1500,spread:3,  pellets:1, penetration:6, auto:true,  ammoType:'heavy', range:1200, color:0x88ddff, infiniteAmmo:false,
             canHeadshot:true, headshotChanceBonus:0, headshotMultiplier:2,
             mobility:{ carry:0.95, reload:0.75 },
             chainBonus:1.2 },
  // 扫射压制爽：1200 RPM 弹雨，移动射击只承受 30% 散射惩罚，是唯一能边跑边压制的武器。
  smg:     { id:'smg',     name:'MP5',     damage:18, fireRate:50,  magazineSize:50, reloadTime:1300,
             bulletSpeed:850, spread:8,  pellets:1, penetration:0, auto:true,  ammoType:'light', range:600, color:0xffee88, infiniteAmmo:false,
             canHeadshot:true, headshotChanceBonus:0, headshotMultiplier:2,
             mobility:{ carry:1, reload:0.9 },
             movementPenalty:0.3 },
  // 泼洒压制：中高伤害 + 高射速 + 大弹匣，移动时只承受 65% 散射惩罚，适合边走边压制密集群。
  ak47:    { id:'ak47',    name:'AK-47',   damage:34, fireRate:82, magazineSize:45, reloadTime:1850,
             bulletSpeed:980, spread:8, pellets:1, penetration:2, auto:true, ammoType:'heavy', range:880, color:0xffc36b, infiniteAmmo:false,
             canHeadshot:true, headshotChanceBonus:0, headshotMultiplier:2,
             mobility:{ carry:0.92, reload:0.72 },
             movementPenalty:0.65 },
  // 一击必杀：极高单发、强穿透与击退，精准武器修正用于制造 S 级单枪高光；Boss 仍不吃处决。
  // 不配架枪移速：架枪进度靠"按住扳机"累积，单发武器按住也不会连续击发，
  // 配了只会变成"按着不放就被拖慢"。它的重量由常驻负重与 2.6 秒半速换弹承担。
  barrett: { id:'barrett', name:'BARRETT M82', damage:210, fireRate:1150, magazineSize:4, reloadTime:2600,
             bulletSpeed:1650, spread:1, pellets:1, penetration:8, auto:false, ammoType:'heavy', range:1350, color:0xd4f1ff, infiniteAmmo:false, projectileRadius:6,
             canHeadshot:true, headshotChanceBonus:0.1, headshotMultiplier:2.5,
             mobility:{ carry:0.85, reload:0.5 },
             knockback:220, chainBonus:1.08, killSlowMotionTier:'A' },
  // 大清屏：单发慢装但爆炸半径与伤害显著提高，定位为主动清掉一整团敌人的资源型武器。
  rpg:     { id:'rpg',     name:'RPG-7', damage:35, fireRate:1450, magazineSize:1, reloadTime:2800,
             bulletSpeed:390, spread:2, pellets:1, penetration:0, auto:false, ammoType:'explosive', range:820, color:0xff7f4d, infiniteAmmo:false, projectileRadius:9,
             canHeadshot:false, headshotChanceBonus:0, headshotMultiplier:1,
             mobility:{ carry:0.85, reload:0.45 },
             impactEffect:{ kind:'explosion', damage:260, radius:170 } },
  // 弹跳节奏爆破：命中障碍先反弹一次，玩家可以把榴弹打进拐角后爆炸。
  m79:     { id:'m79',     name:'M79', damage:24, fireRate:780, magazineSize:1, reloadTime:1650,
             bulletSpeed:420, spread:4, pellets:1, penetration:0, auto:false, ammoType:'explosive', range:620, color:0xf0b95e, infiniteAmmo:false, projectileRadius:7,
             canHeadshot:false, headshotChanceBonus:0, headshotMultiplier:1,
             mobility:{ carry:0.92, reload:0.65 },
             bounceCount:1, impactEffect:{ kind:'explosion', damage:145, radius:105 } },
  // 持续压制：起步较慢，按住扳机 1.2 秒后进入最高射速；大弹箱换来最长换弹窗口。
  // 散射 4.5 而不是 12：负重把它变成「架起来打」的平台，精度就是架枪换来的回报。
  // 移动扫射仍吃 100% 惩罚（4.5 × 2.5 ≈ 11.25°），等于把旧的站桩精度变成边挪边打的下限。
  gatling: { id:'gatling', name:'GAU-8 GATLING', damage:15, fireRate:45, magazineSize:180, reloadTime:4200,
             bulletSpeed:1050, spread:4.5, pellets:1, penetration:1, auto:true, ammoType:'belt', range:780, color:0xff9b63, infiniteAmmo:false,
             canHeadshot:true, headshotChanceBonus:0, headshotMultiplier:2,
             mobility:{ carry:0.8, reload:0.35, sustainedFire:0.4 },
             movementPenalty:1, spinUp:{ durationMs:1200, initialFireRate:160 } },
  // 稳定轻机枪：不需要预热，以更高精度和每十发一次的黄金弹链与加特林区分。
  // 散射 3.5 而不是 6：不吃预热的代价就是精度必须明确优于加特林，否则两把机枪没有分工。
  golden_m249: { id:'golden_m249', name:'GOLDEN M249', damage:25, fireRate:85, magazineSize:100, reloadTime:3200,
             bulletSpeed:1000, spread:3.5, pellets:1, penetration:1, auto:true, ammoType:'belt', range:900, color:0xf4c84a, infiniteAmmo:false,
             canHeadshot:true, headshotChanceBonus:0, headshotMultiplier:2,
             mobility:{ carry:0.85, reload:0.5, sustainedFire:0.65, braceRampMs:800 },
             movementPenalty:0.7, ammoChain:{ interval:10, bonusBurstCount:1, damageFactor:1.4 } },
  // 枪口前方的常驻扇形火焰：不再喷出弹丸，扇形范围内的目标每秒持续掉血，
  // 并周期性在扇形里刷新残留地火。damage/bulletSpeed/spread 对扇形武器不参与战斗结算。
  flamethrower: { id:'flamethrower', name:'FLAMETHROWER', damage:5, fireRate:110, magazineSize:60, reloadTime:2600,
             bulletSpeed:0, spread:0, pellets:1, penetration:0, auto:true, ammoType:'fuel', range:210, color:0xff642e, infiniteAmmo:false, projectileRadius:7,
             canHeadshot:false, headshotChanceBonus:0, headshotMultiplier:1,
             mobility:{ carry:0.9, reload:0.6, sustainedFire:0.8, braceRampMs:700 },
             movementPenalty:0.85,
             coneAttack:{ range:210, angle:58, damagePerSecond:78, tickRate:120 },
             impactLinger:{ kind:'fire', duration:700, radius:36, tickDamage:6, tickRate:250, color:0xff642e,
               stackMode:'refresh-nearby', refreshDistance:42, damagesPlayer:false, playLoop:false } },

  // ——— 第二批六把：填补「点射节奏」「近距连发」「双持泼弹」与三种全新机制 ———

  // 三连发节奏爽：一次扣扳机打出 3 发并真的扣 3 发弹药，单发伤害与精度都优于 AK。
  // 它与 M4A1 的分工是节奏而不是数值：M4A1 是按住不放的穿透流，这把是「点—点—点」的
  // 三发一顿，每次扣扳机都有明确的起止，配合最低的散射做中距精确压制。
  m16a4:  { id:'m16a4', name:'M16A4', damage:38, fireRate:340, magazineSize:30, reloadTime:1900,
             bulletSpeed:1450, spread:2, pellets:1, penetration:2, auto:false, ammoType:'heavy', range:1050, color:0x9fe0b0, infiniteAmmo:false,
             canHeadshot:true, headshotChanceBonus:0.05, headshotMultiplier:2.2,
             mobility:{ carry:0.95, reload:0.78 },
             burstCount:3, ammoPerShot:3 },
  // 全自动霰弹：把霰弹枪的「一枪清一片」变成「按住清一路」。
  // 代价配在射程与负重上：170px 后开始明显衰减，比 SPAS 更近，且换弹只剩 55% 移速。
  aa12:   { id:'aa12', name:'AA-12', damage:19, fireRate:270, magazineSize:20, reloadTime:2600,
             bulletSpeed:680, spread:15, pellets:8, penetration:1, auto:true, ammoType:'shell', range:330, color:0xffb066, infiniteAmmo:false,
             canHeadshot:true, headshotChanceBonus:0, headshotMultiplier:2,
             knockback:95, executeThreshold:0.22,
             mobility:{ carry:0.9, reload:0.55, sustainedFire:0.72, braceRampMs:600 },
             movementPenalty:0.8,
             damageDropoff:[{ distance:0, multiplier:1 }, { distance:170, multiplier:0.68 }, { distance:270, multiplier:0.34 }] },
  // 双持泼弹：两把枪交替出弹，射速与弹匣都翻倍，代价是散射大到只能近距离糊脸。
  // `burstCount: 2` 表达「左右两管同时出弹」，仍然只扣 1 发——这是双持的浪漫，
  // 用弹匣容量（64 发听着多，实际 32 次扣扳机）和高散射来平衡。
  dual_uzi:{ id:'dual_uzi', name:'DUAL UZI', damage:14, fireRate:44, magazineSize:64, reloadTime:1700,
             bulletSpeed:820, spread:13, pellets:1, penetration:0, auto:true, ammoType:'light', range:520, color:0xffe08a, infiniteAmmo:false,
             canHeadshot:true, headshotChanceBonus:0, headshotMultiplier:2,
             mobility:{ carry:1, reload:0.85 },
             movementPenalty:0.45, burstCount:2 },
  // 链式闪电：命中后沿附近目标连跳 4 次，每跳伤害降到 72%。
  // 定位是「散开的敌群」——穿透要求敌人排成一列，这把反而在敌人铺开时最强，
  // 填的正是穿透覆盖不到的那一档。单发伤害压得低，价值全在链式覆盖。
  tesla:  { id:'tesla', name:'TESLA COIL', damage:26, fireRate:260, magazineSize:24, reloadTime:2200,
             bulletSpeed:1250, spread:3, pellets:1, penetration:0, auto:true, ammoType:'energy', range:640, color:0x7fd4ff, infiniteAmmo:false,
             canHeadshot:false, headshotChanceBonus:0, headshotMultiplier:1,
             mobility:{ carry:0.94, reload:0.7 },
             chainLightning:{ jumps:4, radius:150, damageFactor:0.72, color:0x9fe4ff } },
  // 蓄力磁轨：按住 1.1 秒蓄满，伤害从 40% 涨到 260% 并额外穿透 6 个。
  // 与巴雷特的区别是「代价前置」：巴雷特是扣下就打、靠慢换弹付账，
  // 这把要在开火前先站住 1.1 秒，等于用一段暴露窗口换一发超高单发。
  railgun:{ id:'railgun', name:'RAILGUN', damage:120, fireRate:900, magazineSize:5, reloadTime:2500,
             bulletSpeed:1900, spread:0.5, pellets:1, penetration:3, auto:false, ammoType:'energy', range:1280, color:0xbfa8ff, infiniteAmmo:false, projectileRadius:7,
             canHeadshot:true, headshotChanceBonus:0.08, headshotMultiplier:2.4,
             mobility:{ carry:0.86, reload:0.52 },
             knockback:180, chainBonus:1.1, killSlowMotionTier:'A',
             chargeShot:{ durationMs:1100, minDamageFactor:0.4, maxDamageFactor:2.6, maxPenetrationBonus:6, color:0xbfa8ff } },
  // 冷冻扇形：与喷火器共用扇形管线，但把「持续伤害」换成「持续控场」。
  // 每秒伤害只有喷火器的一半，换来的是 55% 减速——它解决的是喷火器解决不了的问题：
  // 高速感染体在被烧死之前就已经贴到脸上了。
  cryo_sprayer:{ id:'cryo_sprayer', name:'CRYO SPRAYER', damage:4, fireRate:120, magazineSize:70, reloadTime:2400,
             bulletSpeed:0, spread:0, pellets:1, penetration:0, auto:true, ammoType:'fuel', range:196, color:0x8fe8ff, infiniteAmmo:false,
             canHeadshot:false, headshotChanceBonus:0, headshotMultiplier:1,
             mobility:{ carry:0.92, reload:0.62, sustainedFire:0.82, braceRampMs:650 },
             movementPenalty:0.8,
             coneAttack:{ range:196, angle:64, damagePerSecond:38, tickRate:130 },
             slowOnHit:{ duration:1400, speedMultiplier:0.45, tint:0x9fe4ff } },
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
