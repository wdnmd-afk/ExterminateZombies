/**
 * 武器攻击特效运行时视觉数据表。
 *
 * 这里只放纯数据与纯查询：切帧、建动画和纹理过滤等需要 Phaser 的步骤留在
 * `systems/GameAssetManager`，表现层调度留在 `systems/WeaponEffectManager`。
 * 拆开的原因与 `config/zombieVisuals` 完全相同——这张表要被配置校验和布局测试读取，
 * 而它们跑在 Node 里，链路上一旦出现 Phaser 运行时依赖就会直接 import 失败。
 *
 * 帧尺寸与锚点全部由 `scripts/process_effect_assets.py` 打印后粘贴，不要手改：
 * 它们由 `scripts/effect_asset_specs.json` 的 `frame` / `anchor` 决定，
 * 改了 spec 必须重跑脚本并同步这里，否则切帧会错位。
 */

import type { WeaponId } from './weapons';

/** 运行时正式特效纹理键。原始素材只在 PreloadScene 中映射到这些稳定 key。 */
export const EFFECT_ASSET_KEYS = {
  flameJet: 'game-effect-flame-jet',
  flameBlob: 'game-effect-flame-blob',
  firePatch: 'game-effect-fire-patch',
  muzzleHeavy: 'game-effect-muzzle-heavy',
  muzzleRifle: 'game-effect-muzzle-rifle',
  muzzleShotgun: 'game-effect-muzzle-shotgun',
  smokePuff: 'game-effect-smoke-puff',
  explosion: 'game-effect-explosion',
} as const;

export type EffectAssetKey = typeof EFFECT_ASSET_KEYS[keyof typeof EFFECT_ASSET_KEYS];

/**
 * 内容在帧内的落点，必须与后处理脚本的同名参数一致。
 * `left-center` 的内容左边缘贴在 x=0，运行时用 `setOrigin(0, 0.5)` 把它钉在枪口那一点；
 * `center` 的内容居中，运行时用 `setOrigin(0.5, 0.5)`。
 */
export type EffectAnchor = 'left-center' | 'center';

export interface EffectTextureLayout {
  textureKey: EffectAssetKey;
  frameWidth: number;
  frameHeight: number;
  frameCount: number;
  /**
   * 动画帧率。枪口焰按「整条动画必须在这把枪的射速内播完」反推：
   * 加特林射速 45ms，四帧 55fps 合计 73ms 已经超过一发的间隔，靠对象池并发多个实例表达，
   * 再慢就会看到上一枪的余烬和下一枪的白热核心叠在一起，糊成一团常亮的橙色。
   */
  frameRate: number;
  anchor: EffectAnchor;
  /** `loop` 常驻循环（喷口火舌、地面燃烧区）；`once` 播完即回收（枪口焰、爆炸、余烟）。 */
  repeat: 'loop' | 'once';
}

export const EFFECT_TEXTURE_LAYOUTS = [
  {
    textureKey: EFFECT_ASSET_KEYS.flameJet,
    frameWidth: 224,
    frameHeight: 128,
    frameCount: 4,
    frameRate: 18,
    anchor: 'left-center',
    repeat: 'loop',
  },
  {
    textureKey: EFFECT_ASSET_KEYS.flameBlob,
    frameWidth: 96,
    frameHeight: 64,
    frameCount: 4,
    frameRate: 14,
    anchor: 'center',
    repeat: 'loop',
  },
  {
    textureKey: EFFECT_ASSET_KEYS.firePatch,
    frameWidth: 160,
    frameHeight: 160,
    frameCount: 4,
    frameRate: 8,
    anchor: 'center',
    repeat: 'loop',
  },
  {
    textureKey: EFFECT_ASSET_KEYS.muzzleHeavy,
    frameWidth: 160,
    frameHeight: 112,
    frameCount: 4,
    frameRate: 55,
    anchor: 'left-center',
    repeat: 'once',
  },
  {
    textureKey: EFFECT_ASSET_KEYS.muzzleRifle,
    frameWidth: 128,
    frameHeight: 88,
    frameCount: 4,
    frameRate: 55,
    anchor: 'left-center',
    repeat: 'once',
  },
  {
    textureKey: EFFECT_ASSET_KEYS.muzzleShotgun,
    frameWidth: 128,
    frameHeight: 128,
    frameCount: 4,
    frameRate: 42,
    anchor: 'left-center',
    repeat: 'once',
  },
  {
    textureKey: EFFECT_ASSET_KEYS.smokePuff,
    frameWidth: 128,
    frameHeight: 128,
    frameCount: 4,
    frameRate: 9,
    anchor: 'center',
    repeat: 'once',
  },
  {
    textureKey: EFFECT_ASSET_KEYS.explosion,
    frameWidth: 256,
    frameHeight: 256,
    frameCount: 4,
    frameRate: 14,
    anchor: 'center',
    repeat: 'once',
  },
] as const satisfies readonly EffectTextureLayout[];

const LAYOUT_BY_KEY = new Map<string, EffectTextureLayout>(
  EFFECT_TEXTURE_LAYOUTS.map((layout) => [layout.textureKey, layout]),
);

export function getEffectLayout(textureKey: EffectAssetKey): EffectTextureLayout {
  const layout = LAYOUT_BY_KEY.get(textureKey);
  if (!layout) throw new Error(`未登记的特效纹理: ${textureKey}`);
  return layout;
}

/** 动画键。与 `zombieVisuals` 的 `${textureKey}-rotate` 同构，单条帧条只有一个动画。 */
export function getEffectAnimationKey(textureKey: EffectAssetKey): string {
  return `${textureKey}-play`;
}

export function resolveEffectOrigin(anchor: EffectAnchor): { x: number; y: number } {
  return anchor === 'left-center' ? { x: 0, y: 0.5 } : { x: 0.5, y: 0.5 };
}

/**
 * 一把武器的开火表现档案。
 *
 * 为什么不按武器逐把配而是按"档"配：十一把武器里真正需要各自一套枪口表现的只有
 * 火舌（喷火器）、扇形焰（霰弹枪）、巨焰（两把机枪）与尾焰（两把发射器）四类，
 * 其余五把的差别只是尺寸。按档配让新武器接入时只需选一档，
 * 而不是复制一段容易与既有武器不自洽的数值。
 */
export interface MuzzleFlashProfile {
  /** 枪口焰帧条；`null` 表示这把武器不出枪口焰（喷火器用常驻火舌代替）。 */
  textureKey: EffectAssetKey | null;
  /** 枪口焰沿膛线方向的显示长度（逻辑像素）。贴图等比缩放到这个宽度。 */
  length: number;
  /**
   * 每次击发抛出余烟的概率 0~1。
   * 不做成"每枪必出"：加特林 45ms 一发，每枪一团烟会在两秒内把屏幕糊成灰白，
   * 而概率化后烟量自然随射速上升，视觉上正好读成"打得越久越呛"。
   */
  smokeChance: number;
  /** 余烟直径（逻辑像素）。 */
  smokeSize: number;
  /** 每次击发抛出的弹壳数。0 表示无壳（发射器、喷火器）。 */
  casings: number;
  /** 弹壳颜色。黄铜与钢壳的区别在实机只有 3px，但成片抛壳时能看出色调差。 */
  casingColor: number;
  /**
   * 持续开火时枪口积热光晕的最大半径，0 表示这把枪不积热。
   * 只有配了 `mobility.sustainedFire` 的武器（加特林、M249、喷火器）会累积架枪进度，
   * 也只有它们的 `braceRatio` 会离开 0，所以这个字段对其余武器天然无效。
   */
  heatRadius: number;
  /** 积热光晕颜色。 */
  heatColor: number;
}

export type MuzzleProfileId = 'light' | 'rifle' | 'magnum' | 'shotgun' | 'heavy' | 'launcher' | 'flame';

export const MUZZLE_FLASH_PROFILES = {
  // 冲锋枪：50ms 一发，枪口焰必须短小，否则前方永远被一团橙色糊住。
  light: {
    textureKey: EFFECT_ASSET_KEYS.muzzleRifle,
    length: 24,
    smokeChance: 0.06,
    smokeSize: 26,
    casings: 1,
    casingColor: 0xd8b45a,
    heatRadius: 0,
    heatColor: 0xff9b63,
  },
  rifle: {
    textureKey: EFFECT_ASSET_KEYS.muzzleRifle,
    length: 34,
    smokeChance: 0.14,
    smokeSize: 32,
    casings: 1,
    casingColor: 0xd8b45a,
    heatRadius: 0,
    heatColor: 0xff9b63,
  },
  // 单发大口径：射速慢，可以给最长的焰与最明显的烟，把"一发一响"的分量做出来。
  magnum: {
    textureKey: EFFECT_ASSET_KEYS.muzzleRifle,
    length: 44,
    smokeChance: 0.5,
    smokeSize: 38,
    casings: 1,
    casingColor: 0xe0c070,
    heatRadius: 0,
    heatColor: 0xff9b63,
  },
  shotgun: {
    textureKey: EFFECT_ASSET_KEYS.muzzleShotgun,
    length: 46,
    smokeChance: 0.6,
    smokeSize: 44,
    casings: 1,
    casingColor: 0xc4453a,
    heatRadius: 0,
    heatColor: 0xff9b63,
  },
  // 两把机枪的签名档：最大的焰、会积热、双壳抛出。
  heavy: {
    textureKey: EFFECT_ASSET_KEYS.muzzleHeavy,
    length: 50,
    smokeChance: 0.3,
    smokeSize: 40,
    casings: 2,
    casingColor: 0xe8c15c,
    heatRadius: 13,
    heatColor: 0xff7a3c,
  },
  // 发射器：焰最长、必出大团尾烟、无壳。
  launcher: {
    textureKey: EFFECT_ASSET_KEYS.muzzleHeavy,
    length: 54,
    smokeChance: 1,
    smokeSize: 62,
    casings: 0,
    casingColor: 0xe8c15c,
    heatRadius: 0,
    heatColor: 0xff9b63,
  },
  // 喷火器不出枪口焰：它的枪口表现是常驻火舌，逐发再叠一层闪光会变成频闪。
  flame: {
    textureKey: null,
    length: 0,
    smokeChance: 0,
    smokeSize: 0,
    casings: 0,
    casingColor: 0xe8c15c,
    heatRadius: 9,
    heatColor: 0xff642e,
  },
} as const satisfies Record<MuzzleProfileId, MuzzleFlashProfile>;

/**
 * 每把武器的开火表现档。
 * 用 `satisfies Record<WeaponId, ...>` 保证新增武器时编译期就暴露缺失的档位，
 * 而不是等到运行时取不到 profile 才发现枪口没有火焰。
 */
export const WEAPON_MUZZLE_PROFILES = {
  pistol: 'magnum',
  smg: 'light',
  rifle: 'rifle',
  shotgun: 'shotgun',
  ak47: 'rifle',
  barrett: 'magnum',
  rpg: 'launcher',
  m79: 'launcher',
  gatling: 'heavy',
  golden_m249: 'heavy',
  flamethrower: 'flame',
  m16a4: 'rifle',
  aa12: 'shotgun',
  dual_uzi: 'light',
  // 能量武器取最轻的枪口档：它们没有火药燃气，重档的浓烟与抛壳会读成错的物理。
  // 弧光与充能环各自由 chainLightning / chargeShot 的专属表现承担。
  tesla: 'light',
  railgun: 'magnum',
  // 低温喷射与火焰共用扇形管线，枪口档也取 flame：两者都是"喷口持续喷出介质"，
  // 差异体现在扇形本身的颜色上，不在枪口。
  cryo_sprayer: 'flame',
} as const satisfies Record<WeaponId, MuzzleProfileId>;

export function getMuzzleFlashProfile(weaponId: WeaponId): MuzzleFlashProfile {
  return MUZZLE_FLASH_PROFILES[WEAPON_MUZZLE_PROFILES[weaponId]];
}

/**
 * 喷火器常驻火舌的显示参数。
 *
 * `length` 84 而不是武器射程 250：火舌只负责"喷口这一段"，其余距离由飞行火团表达。
 * 画满射程会让火舌盖住整个交战距离，玩家再也看不到自己打中了谁——
 * 而喷火器的乐趣恰恰是看着感染体在火里跑出来。
 */
export const FLAME_JET_VISUAL = {
  length: 84,
  /** 架枪进度为 0 时的长度比例；按住扳机后线性拉到 1。 */
  minLengthRatio: 0.62,
  /** 每帧长度抖动幅度，制造喷嘴脉动。 */
  lengthJitter: 0.08,
  /** 最后一发之后火舌保持可见的毫秒数，必须略大于射速 90ms 才不会在连喷时闪断。 */
  holdMs: 150,
} as const;
