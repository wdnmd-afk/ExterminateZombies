import Phaser from 'phaser';
import type { WeaponId } from '../config/weapons';

export const GAME_WEAPON_TEXTURE_KEYS = {
  pistol: 'game-weapon-pistol',
  smg: 'game-weapon-smg',
  rifle: 'game-weapon-rifle',
  shotgun: 'game-weapon-shotgun',
  ak47: 'game-weapon-ak47',
  barrett: 'game-weapon-barrett',
  rpg: 'game-weapon-rpg',
  m79: 'game-weapon-m79',
} as const satisfies Record<WeaponId, string>;

export interface WeaponGameplayVisual {
  textureKey: string;
  frame?: string | number;
  scale: number;
  originX: number;
  originY: number;
  /** 垂直瞄准方向的偏移；Kenney 双手位于人物朝向中线，因此当前均为 0。 */
  sideOffset: number;
  /** 沿瞄准方向的握把落点，与手臂层的拳心大致重合。 */
  forwardOffset: number;
  /**
   * 枪口相对握把、沿瞄准方向的距离。
   * 取 `贴图显示宽度 × (1 - originX)`，使子弹从枪管末端而不是枪身前方凭空出现；
   * AK-47 需扣掉右端刺刀长度。
   */
  muzzleDistance: number;
}

export const WEAPON_GAMEPLAY_VISUALS = {
  pistol: {
    textureKey: GAME_WEAPON_TEXTURE_KEYS.pistol,
    scale: 1.35,
    originX: 0.32,
    originY: 0.52,
    sideOffset: 0,
    forwardOffset: 13,
    muzzleDistance: 27,
  },
  smg: {
    textureKey: GAME_WEAPON_TEXTURE_KEYS.smg,
    scale: 0.42,
    originX: 0.32,
    originY: 0.52,
    sideOffset: 0,
    forwardOffset: 12,
    muzzleDistance: 36,
  },
  rifle: {
    textureKey: GAME_WEAPON_TEXTURE_KEYS.rifle,
    scale: 0.44,
    originX: 0.31,
    originY: 0.52,
    sideOffset: 0,
    forwardOffset: 12,
    muzzleDistance: 38,
  },
  shotgun: {
    textureKey: GAME_WEAPON_TEXTURE_KEYS.shotgun,
    scale: 0.43,
    originX: 0.28,
    originY: 0.52,
    sideOffset: 0,
    forwardOffset: 12,
    muzzleDistance: 40,
  },
  ak47: {
    textureKey: GAME_WEAPON_TEXTURE_KEYS.ak47,
    scale: 0.44,
    originX: 0.31,
    originY: 0.52,
    sideOffset: 0,
    forwardOffset: 12,
    muzzleDistance: 30,
  },
  barrett: {
    textureKey: GAME_WEAPON_TEXTURE_KEYS.barrett,
    scale: 0.46,
    originX: 0.26,
    originY: 0.52,
    sideOffset: 0,
    forwardOffset: 12,
    muzzleDistance: 44,
  },
  rpg: {
    textureKey: GAME_WEAPON_TEXTURE_KEYS.rpg,
    scale: 0.44,
    originX: 0.29,
    originY: 0.52,
    sideOffset: 0,
    forwardOffset: 12,
    muzzleDistance: 41,
  },
  m79: {
    textureKey: GAME_WEAPON_TEXTURE_KEYS.m79,
    scale: 0.43,
    originX: 0.32,
    originY: 0.52,
    sideOffset: 0,
    forwardOffset: 12,
    muzzleDistance: 37,
  },
} satisfies Record<WeaponId, WeaponGameplayVisual>;

/** 武器贴图是像素素材，必须走最近邻采样，否则放大后边缘发虚。 */
export function prepareWeaponAssets(scene: Phaser.Scene): void {
  for (const textureKey of Object.values(GAME_WEAPON_TEXTURE_KEYS)) {
    if (scene.textures.exists(textureKey)) {
      scene.textures.get(textureKey).setFilter(Phaser.Textures.FilterMode.NEAREST);
    }
  }
}

export function getWeaponGameplayVisual(weaponId: WeaponId): WeaponGameplayVisual {
  return WEAPON_GAMEPLAY_VISUALS[weaponId];
}
