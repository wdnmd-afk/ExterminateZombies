import Phaser from 'phaser';
import type { WeaponId } from '../config/weapons';
import type { CharacterGripAnchor } from '../config/characters';

/**
 * 图标用的**侧视**贴图。HUD 槽位、战前整备、武器库预览与掉落物都用这一套：
 * 那些位置是平面图标，侧视轮廓最容易认出枪型。
 */
export const GAME_WEAPON_TEXTURE_KEYS = {
  pistol: 'game-weapon-pistol',
  smg: 'game-weapon-smg',
  rifle: 'game-weapon-rifle',
  shotgun: 'game-weapon-shotgun',
  ak47: 'game-weapon-ak47',
  barrett: 'game-weapon-barrett',
  rpg: 'game-weapon-rpg',
  m79: 'game-weapon-m79',
  gatling: 'game-weapon-gatling',
  golden_m249: 'game-weapon-golden-m249',
  flamethrower: 'game-weapon-flamethrower',
  m16a4: 'game-weapon-m16a4',
  aa12: 'game-weapon-aa12',
  dual_uzi: 'game-weapon-dual-uzi',
  tesla: 'game-weapon-tesla',
  railgun: 'game-weapon-railgun',
  cryo_sprayer: 'game-weapon-cryo-sprayer',
} as const satisfies Record<WeaponId, string>;

/**
 * 实机玩家手上的**俯视**贴图，由 `scripts/process_weapon_topdown_assets.py` 生成。
 *
 * 与上面的侧视图分成两套，不是重复登记：关卡是正俯视视角，侧视枪的下垂弹匣、
 * 扳机护圈与握把在俯视空间里等于朝人物侧面横向支出，无论怎么对位都读成
 * 「贴了一张侧面图」，而且握把必须被手完全盖住，反过来把武器缩放锁死
 * （手枪一度被压到 0.74 才能藏住握把）。俯视图从上往下看不到握把与弹匣，
 * 这两个约束同时消失。
 */
export const GAME_WEAPON_TOPDOWN_TEXTURE_KEYS = {
  pistol: 'game-weapon-topdown-pistol',
  smg: 'game-weapon-topdown-smg',
  rifle: 'game-weapon-topdown-rifle',
  shotgun: 'game-weapon-topdown-shotgun',
  ak47: 'game-weapon-topdown-ak47',
  barrett: 'game-weapon-topdown-barrett',
  rpg: 'game-weapon-topdown-rpg',
  m79: 'game-weapon-topdown-m79',
  gatling: 'game-weapon-topdown-gatling',
  golden_m249: 'game-weapon-topdown-golden-m249',
  flamethrower: 'game-weapon-topdown-flamethrower',
  m16a4: 'game-weapon-topdown-m16a4',
  aa12: 'game-weapon-topdown-aa12',
  dual_uzi: 'game-weapon-topdown-dual-uzi',
  tesla: 'game-weapon-topdown-tesla',
  railgun: 'game-weapon-topdown-railgun',
  cryo_sprayer: 'game-weapon-topdown-cryo-sprayer',
} as const satisfies Record<WeaponId, string>;

/**
 * 实机武器层的标定点。
 *
 * 三个位置全部用**贴图原始像素坐标**表示，不用 0~1 的 origin 比例：它们都能在
 * `src/assets/processed/weapons/*.png` 上直接数出来，换贴图时可以逐把复核；
 * 而 origin 比例一旦贴图尺寸变化就会静默错位——2026-07-30 到 2026-08-18 之间
 * 的错位就是这么来的。运行时用 `setDisplayOrigin` 把像素坐标换成锚点。
 */
export interface WeaponGameplayVisual {
  textureKey: string;
  frame?: string | number;
  scale: number;
  /**
   * 扳机手掌心落点的贴图内像素 x。运行时把这一点对到人物的拳心，
   * 因此枪托会被躯干压住、握把会被持枪手层压住。
   */
  gripX: number;
  /**
   * 枪膛中线的贴图内像素 y。运行时把这条线对到人物的持枪中线；
   * 子弹也沿这条线出膛，所以它同时决定枪身高度与弹道起点的侧向位置。
   */
  boreY: number;
  /**
   * 枪管末端的贴图内像素 x。枪口取这里而不是贴图右边缘，
   * 否则子弹会凭空出现在枪身前方的空气里。
   */
  muzzleX: number;
}

/**
 * 武器层与枪口在人物容器内的落点，单位为世界像素，已按瞄准方向 / 侧向分解。
 * 调用方只需按瞄准角把这两个分量旋转到世界坐标。
 */
export interface WeaponMountOffsets {
  gripForward: number;
  gripSide: number;
  muzzleForward: number;
  muzzleSide: number;
}

/**
 * 缩放统一为 `WEAPON_TOPDOWN_SCALE`，不按枪逐个调：
 * 俯视贴图是按「实机世界像素 x 2」的统一网格画的（见 `weapon_topdown_specs.json`），
 * 各枪的长短差异已经体现在贴图长度里。如果再按枪改缩放，等于同一套像素美术
 * 在不同武器上有不同的像素颗粒度，切枪时会看出颗粒跳变。
 *
 * 三个锚点全部由 `scripts/process_weapon_topdown_assets.py` 打印后粘贴，
 * 不要手改：它们由 spec 的 `length / halfHeight / gripX / muzzleX` 加 2px 描边留边算出，
 * 改了 spec 必须重跑脚本并同步这里。
 */
export const WEAPON_TOPDOWN_SCALE = 0.5;

export const WEAPON_GAMEPLAY_VISUALS = {
  pistol: {
    textureKey: GAME_WEAPON_TOPDOWN_TEXTURE_KEYS.pistol,
    scale: WEAPON_TOPDOWN_SCALE,
    gripX: 11,
    boreY: 11,
    muzzleX: 43,
  },
  smg: {
    textureKey: GAME_WEAPON_TOPDOWN_TEXTURE_KEYS.smg,
    scale: WEAPON_TOPDOWN_SCALE,
    gripX: 25,
    boreY: 13,
    muzzleX: 76,
  },
  rifle: {
    textureKey: GAME_WEAPON_TOPDOWN_TEXTURE_KEYS.rifle,
    scale: WEAPON_TOPDOWN_SCALE,
    gripX: 36,
    boreY: 14,
    muzzleX: 100,
  },
  shotgun: {
    textureKey: GAME_WEAPON_TOPDOWN_TEXTURE_KEYS.shotgun,
    scale: WEAPON_TOPDOWN_SCALE,
    gripX: 33,
    boreY: 15,
    muzzleX: 100,
  },
  ak47: {
    textureKey: GAME_WEAPON_TOPDOWN_TEXTURE_KEYS.ak47,
    scale: WEAPON_TOPDOWN_SCALE,
    gripX: 36,
    boreY: 14,
    muzzleX: 99,
  },
  barrett: {
    textureKey: GAME_WEAPON_TOPDOWN_TEXTURE_KEYS.barrett,
    scale: WEAPON_TOPDOWN_SCALE,
    gripX: 39,
    boreY: 15,
    muzzleX: 120,
  },
  rpg: {
    textureKey: GAME_WEAPON_TOPDOWN_TEXTURE_KEYS.rpg,
    scale: WEAPON_TOPDOWN_SCALE,
    gripX: 50,
    boreY: 17,
    muzzleX: 114,
  },
  m79: {
    textureKey: GAME_WEAPON_TOPDOWN_TEXTURE_KEYS.m79,
    scale: WEAPON_TOPDOWN_SCALE,
    gripX: 35,
    boreY: 14,
    muzzleX: 88,
  },
  gatling: {
    textureKey: GAME_WEAPON_TOPDOWN_TEXTURE_KEYS.gatling,
    scale: WEAPON_TOPDOWN_SCALE,
    gripX: 29,
    boreY: 21,
    muzzleX: 112,
  },
  golden_m249: {
    textureKey: GAME_WEAPON_TOPDOWN_TEXTURE_KEYS.golden_m249,
    scale: WEAPON_TOPDOWN_SCALE,
    gripX: 35,
    boreY: 19,
    muzzleX: 106,
  },
  flamethrower: {
    textureKey: GAME_WEAPON_TOPDOWN_TEXTURE_KEYS.flamethrower,
    scale: WEAPON_TOPDOWN_SCALE,
    gripX: 47,
    boreY: 18,
    muzzleX: 96,
  },
  m16a4: {
    textureKey: GAME_WEAPON_TOPDOWN_TEXTURE_KEYS.m16a4,
    scale: WEAPON_TOPDOWN_SCALE,
    gripX: 36,
    boreY: 14,
    muzzleX: 104,
  },
  aa12: {
    textureKey: GAME_WEAPON_TOPDOWN_TEXTURE_KEYS.aa12,
    scale: WEAPON_TOPDOWN_SCALE,
    gripX: 32,
    boreY: 19,
    muzzleX: 94,
  },
  dual_uzi: {
    textureKey: GAME_WEAPON_TOPDOWN_TEXTURE_KEYS.dual_uzi,
    scale: WEAPON_TOPDOWN_SCALE,
    gripX: 24,
    boreY: 20,
    muzzleX: 72,
  },
  tesla: {
    textureKey: GAME_WEAPON_TOPDOWN_TEXTURE_KEYS.tesla,
    scale: WEAPON_TOPDOWN_SCALE,
    gripX: 34,
    boreY: 17,
    muzzleX: 86,
  },
  railgun: {
    textureKey: GAME_WEAPON_TOPDOWN_TEXTURE_KEYS.railgun,
    scale: WEAPON_TOPDOWN_SCALE,
    gripX: 38,
    boreY: 16,
    muzzleX: 122,
  },
  cryo_sprayer: {
    textureKey: GAME_WEAPON_TOPDOWN_TEXTURE_KEYS.cryo_sprayer,
    scale: WEAPON_TOPDOWN_SCALE,
    gripX: 46,
    boreY: 18,
    muzzleX: 92,
  },
} satisfies Record<WeaponId, WeaponGameplayVisual>;

/** 图标与实机两套贴图都是像素素材，必须走最近邻采样，否则缩放后边缘发虚。 */
export function prepareWeaponAssets(scene: Phaser.Scene): void {
  const keys = [
    ...Object.values(GAME_WEAPON_TEXTURE_KEYS),
    ...Object.values(GAME_WEAPON_TOPDOWN_TEXTURE_KEYS),
  ];
  for (const textureKey of keys) {
    if (scene.textures.exists(textureKey)) {
      scene.textures.get(textureKey).setFilter(Phaser.Textures.FilterMode.NEAREST);
    }
  }
}

export function getWeaponGameplayVisual(weaponId: WeaponId): WeaponGameplayVisual {
  return WEAPON_GAMEPLAY_VISUALS[weaponId];
}

/**
 * 把「人物贴图内的握枪锚点」与「武器贴图内的标定点」合成为容器内的落点。
 *
 * 两侧锚点各自量在自己的贴图上，所以要分别乘各自的显示缩放：人物锚点乘人物缩放，
 * 枪管长度乘武器缩放。枪口与枪膛同线，因此侧向偏移与握把完全一致，
 * 只沿瞄准方向前移一段枪管——这样换枪不会改变弹道的侧向偏移，玩家的瞄准手感一致。
 */
export function resolveWeaponMount(
  visual: WeaponGameplayVisual,
  anchor: CharacterGripAnchor,
  characterScale: number,
): WeaponMountOffsets {
  const gripForward = anchor.forward * characterScale;
  const gripSide = anchor.boreSide * characterScale;
  return {
    gripForward,
    gripSide,
    muzzleForward: gripForward + (visual.muzzleX - visual.gripX) * visual.scale,
    muzzleSide: gripSide,
  };
}
