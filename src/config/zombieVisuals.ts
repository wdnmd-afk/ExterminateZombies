/**
 * 感染体运行时视觉数据表。
 *
 * 这里只放纯数据与纯查询：切帧、建动画和纹理过滤等需要 Phaser 的步骤留在
 * `systems/GameAssetManager`。拆开的原因是这张表要被配置校验和布局测试读取，
 * 而它们跑在 Node 里，一旦链路上出现 Phaser 运行时依赖就会直接 import 失败。
 */

import type { ZombieId } from './zombies';

/** 运行时正式美术纹理键。原始素材只在 PreloadScene 中映射到这些稳定 key。 */
export const GAME_ASSET_KEYS = {
  player: 'game-player-base',
  zombieWalker: 'game-zombie-walker-src',
  zombieWalkerDirectional: 'game-zombie-walker-directional-src',
  zombieWalkerPortrait: 'game-zombie-walker-portrait',
  zombieRunner: 'game-zombie-runner-src',
  zombieTank: 'game-zombie-tank-src',
  zombieBomber: 'game-zombie-bomber-src',
  zombieLurker: 'game-zombie-lurker-src',
  zombieDrifter: 'game-zombie-drifter-src',
  zombieFeral: 'game-zombie-feral-src',
  zombieBloodied: 'game-zombie-bloodied-src',
  zombieHeadless: 'game-zombie-headless-src',
  zombieRotting: 'game-zombie-rotting-src',
  zombieBloater: 'game-zombie-bloater-src',
  zombieCrawler: 'game-zombie-crawler-src',
  zombieStalker: 'game-zombie-stalker-src',
  zombieOddity: 'game-zombie-oddity-src',
  zombieTankBoss: 'game-zombie-tank-boss-src',
  zombieTankBossAttack: 'game-zombie-tank-boss-attack-src',
  zombieTankBossDeath: 'game-zombie-tank-boss-death-src',
  zombieBomberBoss: 'game-zombie-bomber-boss-src',
  zombieBomberBossAttack: 'game-zombie-bomber-boss-attack-src',
  zombieBomberBossDeath: 'game-zombie-bomber-boss-death-src',
  zombieHunterBoss: 'game-zombie-hunter-boss-src',
  zombieHunterBossAttack: 'game-zombie-hunter-boss-attack-src',
  zombieHunterBossDeath0: 'game-zombie-hunter-boss-death-0-src',
  zombieHunterBossDeath1: 'game-zombie-hunter-boss-death-1-src',
  zombieMatriarchBoss: 'game-zombie-matriarch-boss-src',
  zombieMatriarchBossAttack: 'game-zombie-matriarch-boss-attack-src',
  zombieMatriarchBossDeath0: 'game-zombie-matriarch-boss-death-0-src',
  zombieMatriarchBossDeath1: 'game-zombie-matriarch-boss-death-1-src',
} as const;

export type FacingDirection = 'down' | 'left' | 'right' | 'up';
export type ZombieFacingMode = 'directional' | 'rotating';

export const FACING_DIRECTIONS: readonly FacingDirection[] = ['down', 'left', 'right', 'up'];

export interface ZombieVisual {
  textureKey: string;
  /** 相对源帧的显示缩放。 */
  scale: number;
  frameRate: number;
  /** 叠加着色，0xffffff 表示保持原色。 */
  tint: number;
  facingMode: ZombieFacingMode;
  /** 方向素材偏脚底取原点；俯视旋转素材必须保持几何中心。 */
  originY: number;
  /** 俯视素材原始朝向相对向右方向的修正弧度。 */
  rotationOffset: number;
  /**
   * 碰撞圆心相对实体原点的纵向偏移（逻辑像素，正数向下）。
   * 只用于消化源帧透明留白与 origin 差异，半径仍由玩法配置决定。
   */
  collisionOffsetY: number;
}

interface DirectionalTextureLayout {
  kind: 'directional';
  textureKey: string;
  frameWidth: number;
  frameHeight: number;
  frameXs: readonly number[];
  directionRows: Record<FacingDirection, number>;
}

interface RotatingTextureLayout {
  kind: 'rotating';
  textureKey: string;
  frameWidth: number;
  frameHeight: number;
  frameCount: number;
}

export type ZombieTextureLayout = DirectionalTextureLayout | RotatingTextureLayout;

export type ZombieAction = 'attack' | 'death';

export interface ZombieActionTextureSource {
  textureKey: string;
  frameWidth: number;
  frameHeight: number;
  columns: number;
  frameCount: number;
}

export interface ZombieActionTextureLayout {
  typeId: ZombieId;
  action: ZombieAction;
  /** 多张原始帧条按数组顺序拼成一个连续动作。 */
  sources: readonly ZombieActionTextureSource[];
  /** 动作总帧数，必须等于全部 sources 的 frameCount 之和。 */
  frameCount: number;
  frameRate: number;
}

/** Curt 表的实际列边界不等距，必须使用已核实的像素坐标手动切帧。 */
const CURT_FRAME_X = [1, 47, 93] as const;
const CURT_DIRECTION_ROWS: Record<FacingDirection, number> = {
  down: 0,
  left: 1,
  right: 2,
  up: 3,
};

/** Cabbit 文件名标明 NESW，实际四行顺序为北、东、南、西。 */
const CABBIT_DIRECTION_ROWS: Record<FacingDirection, number> = {
  down: 2,
  left: 3,
  right: 1,
  up: 0,
};

/** Reemax 合图前三列是僵尸，四行依次为下、左、右、上。 */
const REEMAX_DIRECTION_ROWS: Record<FacingDirection, number> = {
  down: 0,
  left: 1,
  right: 2,
  up: 3,
};

const CURT_TEXTURE_KEYS = [
  GAME_ASSET_KEYS.zombieWalker,
  GAME_ASSET_KEYS.zombieRunner,
  GAME_ASSET_KEYS.zombieTank,
  GAME_ASSET_KEYS.zombieBomber,
  GAME_ASSET_KEYS.zombieLurker,
  GAME_ASSET_KEYS.zombieDrifter,
] as const;

const CABBIT_TEXTURE_KEYS = [
  GAME_ASSET_KEYS.zombieFeral,
  GAME_ASSET_KEYS.zombieBloodied,
  GAME_ASSET_KEYS.zombieHeadless,
  GAME_ASSET_KEYS.zombieRotting,
] as const;

export const ZOMBIE_TEXTURE_LAYOUTS: readonly ZombieTextureLayout[] = [
  {
    kind: 'directional',
    textureKey: GAME_ASSET_KEYS.zombieWalkerDirectional,
    frameWidth: 1024,
    frameHeight: 1024,
    frameXs: [0, 1024, 2048, 3072],
    directionRows: { down: 0, left: 1, right: 2, up: 3 },
  },
  ...CURT_TEXTURE_KEYS.map((textureKey) => ({
    kind: 'directional' as const,
    textureKey,
    frameWidth: 31,
    frameHeight: 36,
    frameXs: CURT_FRAME_X,
    directionRows: CURT_DIRECTION_ROWS,
  })),
  ...CABBIT_TEXTURE_KEYS.map((textureKey) => ({
    kind: 'directional' as const,
    textureKey,
    frameWidth: 48,
    frameHeight: 64,
    frameXs: [0, 48, 96] as const,
    directionRows: CABBIT_DIRECTION_ROWS,
  })),
  {
    kind: 'directional',
    textureKey: GAME_ASSET_KEYS.zombieBloater,
    frameWidth: 32,
    frameHeight: 64,
    frameXs: [0, 32, 64],
    directionRows: REEMAX_DIRECTION_ROWS,
  },
  {
    kind: 'rotating',
    textureKey: GAME_ASSET_KEYS.zombieCrawler,
    frameWidth: 64,
    frameHeight: 64,
    frameCount: 4,
  },
  {
    kind: 'rotating',
    textureKey: GAME_ASSET_KEYS.zombieStalker,
    frameWidth: 64,
    frameHeight: 64,
    frameCount: 4,
  },
  {
    kind: 'rotating',
    textureKey: GAME_ASSET_KEYS.zombieOddity,
    frameWidth: 64,
    frameHeight: 64,
    frameCount: 8,
  },
  {
    kind: 'rotating',
    textureKey: GAME_ASSET_KEYS.zombieTankBoss,
    frameWidth: 80,
    frameHeight: 80,
    frameCount: 8,
  },
  {
    kind: 'rotating',
    textureKey: GAME_ASSET_KEYS.zombieBomberBoss,
    frameWidth: 64,
    frameHeight: 64,
    frameCount: 8,
  },
  {
    kind: 'rotating',
    textureKey: GAME_ASSET_KEYS.zombieHunterBoss,
    frameWidth: 64,
    frameHeight: 64,
    frameCount: 4,
  },
  {
    kind: 'rotating',
    textureKey: GAME_ASSET_KEYS.zombieMatriarchBoss,
    frameWidth: 64,
    frameHeight: 64,
    frameCount: 8,
  },
];

/**
 * Boss 动作素材独立于移动条登记，只有完成玩法接入的动作才进入运行时。
 * 多行动作图按 `columns` 行优先切帧，死亡结算等待登记的全部帧播放完成。
 */
export const ZOMBIE_ACTION_TEXTURE_LAYOUTS = [
  {
    typeId: 'tank_boss',
    action: 'attack',
    sources: [{
      textureKey: GAME_ASSET_KEYS.zombieTankBossAttack,
      frameWidth: 80,
      frameHeight: 80,
      columns: 7,
      frameCount: 7,
    }],
    frameCount: 7,
    frameRate: 9,
  },
  {
    typeId: 'tank_boss',
    action: 'death',
    sources: [{
      textureKey: GAME_ASSET_KEYS.zombieTankBossDeath,
      frameWidth: 80,
      frameHeight: 80,
      columns: 3,
      frameCount: 15,
    }],
    frameCount: 15,
    frameRate: 12,
  },
  {
    typeId: 'bomber_boss',
    action: 'attack',
    sources: [{
      textureKey: GAME_ASSET_KEYS.zombieBomberBossAttack,
      frameWidth: 64,
      frameHeight: 64,
      columns: 8,
      frameCount: 8,
    }],
    frameCount: 8,
    frameRate: 10,
  },
  {
    typeId: 'bomber_boss',
    action: 'death',
    sources: [{
      textureKey: GAME_ASSET_KEYS.zombieBomberBossDeath,
      frameWidth: 64,
      frameHeight: 64,
      columns: 8,
      frameCount: 16,
    }],
    frameCount: 16,
    frameRate: 12,
  },
  {
    typeId: 'hunter_boss',
    action: 'attack',
    sources: [{
      textureKey: GAME_ASSET_KEYS.zombieHunterBossAttack,
      frameWidth: 64,
      frameHeight: 64,
      columns: 8,
      frameCount: 8,
    }],
    frameCount: 8,
    frameRate: 12,
  },
  {
    typeId: 'hunter_boss',
    action: 'death',
    sources: [
      {
        textureKey: GAME_ASSET_KEYS.zombieHunterBossDeath0,
        frameWidth: 64,
        frameHeight: 64,
        columns: 8,
        frameCount: 8,
      },
      {
        textureKey: GAME_ASSET_KEYS.zombieHunterBossDeath1,
        frameWidth: 64,
        frameHeight: 64,
        columns: 8,
        frameCount: 8,
      },
    ],
    frameCount: 16,
    frameRate: 12,
  },
  {
    typeId: 'matriarch_boss',
    action: 'attack',
    sources: [{
      textureKey: GAME_ASSET_KEYS.zombieMatriarchBossAttack,
      frameWidth: 64,
      frameHeight: 64,
      columns: 5,
      frameCount: 5,
    }],
    frameCount: 5,
    frameRate: 8,
  },
  {
    typeId: 'matriarch_boss',
    action: 'death',
    sources: [
      {
        textureKey: GAME_ASSET_KEYS.zombieMatriarchBossDeath0,
        frameWidth: 64,
        frameHeight: 64,
        columns: 8,
        frameCount: 8,
      },
      {
        textureKey: GAME_ASSET_KEYS.zombieMatriarchBossDeath1,
        frameWidth: 64,
        frameHeight: 64,
        columns: 8,
        frameCount: 8,
      },
    ],
    frameCount: 16,
    frameRate: 10,
  },
] as const satisfies readonly ZombieActionTextureLayout[];

function directionalVisual(
  textureKey: string,
  scale: number,
  frameRate: number,
  tint = 0xffffff,
): ZombieVisual {
  return {
    textureKey,
    scale,
    frameRate,
    tint,
    facingMode: 'directional',
    originY: 0.62,
    rotationOffset: 0,
    collisionOffsetY: 0,
  };
}

function rotatingVisual(
  textureKey: string,
  scale: number,
  frameRate: number,
  rotationOffset: number,
): ZombieVisual {
  return {
    textureKey,
    scale,
    frameRate,
    tint: 0xffffff,
    facingMode: 'rotating',
    originY: 0.5,
    rotationOffset,
    collisionOffsetY: 0,
  };
}

/** 每种感染体的唯一运行时表现；四个 Boss 均使用独立纹理。 */
export const ZOMBIE_VISUALS = {
  // 新 Walker 源帧朝左；旋转系统以朝右为零角度，因此补偿 180 度。
  walker: directionalVisual(GAME_ASSET_KEYS.zombieWalkerDirectional, 0.068, 6),
  runner: directionalVisual(GAME_ASSET_KEYS.zombieRunner, 0.92, 11, 0xffe6b0),
  tank: directionalVisual(GAME_ASSET_KEYS.zombieTank, 1.32, 4, 0xdce8d1),
  bomber: directionalVisual(GAME_ASSET_KEYS.zombieBomber, 1.08, 8, 0xffc893),
  lurker: directionalVisual(GAME_ASSET_KEYS.zombieLurker, 1.04, 7),
  drifter: directionalVisual(GAME_ASSET_KEYS.zombieDrifter, 1, 8),
  feral: directionalVisual(GAME_ASSET_KEYS.zombieFeral, 0.72, 11),
  bloodied: directionalVisual(GAME_ASSET_KEYS.zombieBloodied, 0.78, 6),
  headless: directionalVisual(GAME_ASSET_KEYS.zombieHeadless, 0.78, 5),
  rotting: directionalVisual(GAME_ASSET_KEYS.zombieRotting, 0.76, 4),
  bloater: directionalVisual(GAME_ASSET_KEYS.zombieBloater, 0.9, 4),
  crawler: rotatingVisual(GAME_ASSET_KEYS.zombieCrawler, 0.76, 10, 0),
  // 俯行猎手与 crawler 同包同姿态（头朝右），无需朝向修正；
  // 源帧非透明区仅约 36px 宽，scale 1.0 才与碰撞圆（radius 13）比例吻合。
  stalker: rotatingVisual(GAME_ASSET_KEYS.zombieStalker, 1, 9, 0),
  // SpriteAttack 帧条原始朝向为上，转向右时需顺时针修正 90 度。
  oddity: rotatingVisual(GAME_ASSET_KEYS.zombieOddity, 0.7, 8, Math.PI / 2),
  // Warlock's Gauntlet 四套原图均朝下；逻辑角度 0 代表朝右，因此统一逆时针修正 90 度。
  // 缩放按原有实机可见尺寸与既有碰撞半径校准，不改 Boss 玩法数值。
  tank_boss: rotatingVisual(GAME_ASSET_KEYS.zombieTankBoss, 0.93, 5, -Math.PI / 2),
  bomber_boss: rotatingVisual(GAME_ASSET_KEYS.zombieBomberBoss, 0.95, 8, -Math.PI / 2),
  hunter_boss: rotatingVisual(GAME_ASSET_KEYS.zombieHunterBoss, 1.25, 12, -Math.PI / 2),
  matriarch_boss: rotatingVisual(GAME_ASSET_KEYS.zombieMatriarchBoss, 1.35, 4, -Math.PI / 2),
} satisfies Record<ZombieId, ZombieVisual>;

export function getZombieVisual(typeId: ZombieId): ZombieVisual {
  return ZOMBIE_VISUALS[typeId];
}

export function getZombieAnimationKey(typeId: ZombieId, direction: FacingDirection = 'down'): string {
  const visual = getZombieVisual(typeId);
  return visual.facingMode === 'rotating'
    ? `${visual.textureKey}-rotate`
    : `${visual.textureKey}-${direction}`;
}

export function getZombieActionLayout(
  typeId: ZombieId,
  action: ZombieAction,
): ZombieActionTextureLayout | null {
  return ZOMBIE_ACTION_TEXTURE_LAYOUTS.find(
    (layout) => layout.typeId === typeId && layout.action === action,
  ) ?? null;
}

export function getZombieActionAnimationKey(typeId: ZombieId, action: ZombieAction): string | null {
  const layout = getZombieActionLayout(typeId, action);
  return layout ? `game-zombie-${typeId}-${action}` : null;
}

/**
 * 感染体源帧的像素尺寸。
 * 当前移动素材来自多个来源，帧尺寸从 31×36 到 80×80 不等，任何需要按真实尺寸反推
 * 显示缩放的界面都必须查这张表，不能假设全表同规格。
 */
export function getZombieFrameSize(typeId: ZombieId): { width: number; height: number } {
  const { textureKey } = getZombieVisual(typeId);
  const layout = ZOMBIE_TEXTURE_LAYOUTS.find((entry) => entry.textureKey === textureKey);
  if (!layout) {
    throw new Error(`感染体 ${typeId} 的纹理 ${textureKey} 没有登记帧布局`);
  }
  return { width: layout.frameWidth, height: layout.frameHeight };
}

/** 同一纹理可被 Boss 复用，动画基准帧率取该纹理第一项，实体侧再设置 timeScale。 */
export function resolveTextureFrameRate(textureKey: string): number {
  const match = Object.values(ZOMBIE_VISUALS).find((visual) => visual.textureKey === textureKey);
  return match?.frameRate ?? 6;
}
