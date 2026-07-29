import Phaser from 'phaser';
import type { ZombieId } from '../config/zombies';

/** 运行时正式美术纹理键。原始素材只在 PreloadScene 中映射到这些稳定 key。 */
export const GAME_ASSET_KEYS = {
  player: 'game-player-pistolet',
  zombieWalker: 'game-zombie-walker-src',
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
} as const;

export const PLAYER_WALK_ANIMATION = 'game-player-walk';

export type FacingDirection = 'down' | 'left' | 'right' | 'up';
export type ZombieFacingMode = 'directional' | 'rotating';

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

type ZombieTextureLayout = DirectionalTextureLayout | RotatingTextureLayout;

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

const ZOMBIE_TEXTURE_LAYOUTS: readonly ZombieTextureLayout[] = [
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
    frameCount: 8,
  },
  {
    kind: 'rotating',
    textureKey: GAME_ASSET_KEYS.zombieOddity,
    frameWidth: 64,
    frameHeight: 64,
    frameCount: 8,
  },
];

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
  };
}

/** 每种感染体的唯一运行时表现；Boss 仅按既有设计复用基础表并放大着色。 */
export const ZOMBIE_VISUALS = {
  walker: directionalVisual(GAME_ASSET_KEYS.zombieWalker, 1, 6),
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
  // SpriteAttack 两个帧条原始朝向为上，转向右时需顺时针修正 90 度。
  stalker: rotatingVisual(GAME_ASSET_KEYS.zombieStalker, 0.7, 9, Math.PI / 2),
  oddity: rotatingVisual(GAME_ASSET_KEYS.zombieOddity, 0.7, 8, Math.PI / 2),
  tank_boss: directionalVisual(GAME_ASSET_KEYS.zombieTank, 1.9, 5, 0xffe1af),
  bomber_boss: directionalVisual(GAME_ASSET_KEYS.zombieBomber, 1.7, 8, 0xff9a7d),
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

/**
 * 在 Preload 完成后统一切帧、建立动画并启用最近邻采样。
 * 所有处理只发生在内存中，不改写已归档的原始素材。
 */
export function prepareGameAssets(scene: Phaser.Scene): void {
  prepareTextureFiltering(scene);
  prepareZombieFrames(scene);
  preparePlayerAnimation(scene);
  prepareZombieAnimations(scene);
}

function prepareTextureFiltering(scene: Phaser.Scene): void {
  const zombieKeys = ZOMBIE_TEXTURE_LAYOUTS.map((layout) => layout.textureKey);
  const keys = new Set<string>([GAME_ASSET_KEYS.player, ...zombieKeys]);
  for (const key of keys) {
    if (scene.textures.exists(key)) {
      scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
    }
  }
}

function prepareZombieFrames(scene: Phaser.Scene): void {
  for (const layout of ZOMBIE_TEXTURE_LAYOUTS) {
    if (!scene.textures.exists(layout.textureKey)) continue;
    const texture = scene.textures.get(layout.textureKey);

    if (layout.kind === 'rotating') {
      for (let frameIndex = 0; frameIndex < layout.frameCount; frameIndex++) {
        const frameName = String(frameIndex);
        if (!texture.has(frameName)) {
          texture.add(
            frameName,
            0,
            frameIndex * layout.frameWidth,
            0,
            layout.frameWidth,
            layout.frameHeight,
          );
        }
      }
      continue;
    }

    for (let row = 0; row < 4; row++) {
      layout.frameXs.forEach((x, column) => {
        const frameName = `${row}-${column}`;
        if (!texture.has(frameName)) {
          texture.add(
            frameName,
            0,
            x,
            row * layout.frameHeight,
            layout.frameWidth,
            layout.frameHeight,
          );
        }
      });
    }
  }
}

function preparePlayerAnimation(scene: Phaser.Scene): void {
  if (scene.anims.exists(PLAYER_WALK_ANIMATION)) return;
  if (!scene.textures.exists(GAME_ASSET_KEYS.player)) return;
  scene.anims.create({
    key: PLAYER_WALK_ANIMATION,
    frames: scene.anims.generateFrameNumbers(GAME_ASSET_KEYS.player, { start: 0, end: 11 }),
    frameRate: 12,
    repeat: -1,
  });
}

function prepareZombieAnimations(scene: Phaser.Scene): void {
  const directions = Object.keys(CURT_DIRECTION_ROWS) as FacingDirection[];

  for (const layout of ZOMBIE_TEXTURE_LAYOUTS) {
    if (!scene.textures.exists(layout.textureKey)) continue;
    const frameRate = resolveTextureFrameRate(layout.textureKey);

    if (layout.kind === 'rotating') {
      const animationKey = `${layout.textureKey}-rotate`;
      if (!scene.anims.exists(animationKey)) {
        scene.anims.create({
          key: animationKey,
          frames: Array.from({ length: layout.frameCount }, (_, frameIndex) => ({
            key: layout.textureKey,
            frame: String(frameIndex),
          })),
          frameRate,
          repeat: -1,
        });
      }
      continue;
    }

    for (const direction of directions) {
      const animationKey = `${layout.textureKey}-${direction}`;
      if (scene.anims.exists(animationKey)) continue;
      const row = layout.directionRows[direction];
      scene.anims.create({
        key: animationKey,
        frames: layout.frameXs.map((_x, column) => ({
          key: layout.textureKey,
          frame: `${row}-${column}`,
        })),
        frameRate,
        repeat: -1,
      });
    }
  }
}

/** 同一纹理可被 Boss 复用，动画基准帧率取该纹理第一项，实体侧再设置 timeScale。 */
function resolveTextureFrameRate(textureKey: string): number {
  const match = Object.values(ZOMBIE_VISUALS).find((visual) => visual.textureKey === textureKey);
  return match?.frameRate ?? 6;
}
