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
  zombieRunnerDirectional: 'game-zombie-runner-directional-src',
  zombieRunnerPortrait: 'game-zombie-runner-portrait',
  zombieTank: 'game-zombie-tank-src',
  zombieBomber: 'game-zombie-bomber-src',
  zombieBomberDirectional: 'game-zombie-bomber-directional-src',
  zombieBomberPortrait: 'game-zombie-bomber-portrait',
  zombieLurker: 'game-zombie-lurker-src',
  zombieLurkerDirectional: 'game-zombie-lurker-directional-src',
  zombieLurkerPortrait: 'game-zombie-lurker-portrait',
  zombieDrifter: 'game-zombie-drifter-src',
  zombieDrifterDirectional: 'game-zombie-drifter-directional-src',
  zombieDrifterPortrait: 'game-zombie-drifter-portrait',
  zombieBloodiedDirectional: 'game-zombie-bloodied-directional-src',
  zombieBloodiedPortrait: 'game-zombie-bloodied-portrait',
  zombieHeadlessDirectional: 'game-zombie-headless-directional-src',
  zombieHeadlessPortrait: 'game-zombie-headless-portrait',
  zombieFeral: 'game-zombie-feral-src',
  zombieFeralDirectional: 'game-zombie-feral-directional-src',
  zombieFeralPortrait: 'game-zombie-feral-portrait',
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

/** 项目自生成方向表统一为 4 行 × 4 列，行序固定 down/left/right/up。 */
const CUSTOM_DIRECTION_ROWS: Record<FacingDirection, number> = {
  down: 0,
  left: 1,
  right: 2,
  up: 3,
};

/**
 * 帧尺寸 512 的项目自生成方向表。
 *
 * 512 而非 Walker 的 1024，因为上游输出尺寸不由我们决定，且随模型变化：
 * `gpt-image-2` 恒定 `1254×1254`（Runner 源图），`gpt-image-2-vip` 恒定 `1024×1024`
 * （Bomber、Lurker、Drifter 源图）；`size` 与 `imageSize` 参数均被忽略。`2×2` 源图单帧因此
 * 只有 `627` 或 `512`，两者都撑不起 Walker 的 1024 帧规格——沿用 1024 需上采样
 * 1.64/2 倍，只会放大生成噪声。512 对两种上游尺寸都是纯降采样或原尺寸。
 * 实机可见 47-66px，417-435px 的源精度已远超需要。
 */
const CUSTOM_512_TEXTURE_KEYS = [
  GAME_ASSET_KEYS.zombieRunnerDirectional,
  GAME_ASSET_KEYS.zombieBomberDirectional,
  GAME_ASSET_KEYS.zombieLurkerDirectional,
  GAME_ASSET_KEYS.zombieDrifterDirectional,
  GAME_ASSET_KEYS.zombieFeralDirectional,
  GAME_ASSET_KEYS.zombieBloodiedDirectional,
  GAME_ASSET_KEYS.zombieHeadlessDirectional,
] as const;

export const ZOMBIE_TEXTURE_LAYOUTS: readonly ZombieTextureLayout[] = [
  {
    kind: 'directional',
    textureKey: GAME_ASSET_KEYS.zombieWalkerDirectional,
    frameWidth: 1024,
    frameHeight: 1024,
    frameXs: [0, 1024, 2048, 3072],
    directionRows: CUSTOM_DIRECTION_ROWS,
  },
  ...CUSTOM_512_TEXTURE_KEYS.map((textureKey) => ({
    kind: 'directional' as const,
    textureKey,
    frameWidth: 512,
    frameHeight: 512,
    frameXs: [0, 512, 1024, 1536] as const,
    directionRows: CUSTOM_DIRECTION_ROWS,
  })),
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
  originY = 0.62,
): ZombieVisual {
  return {
    textureKey,
    scale,
    frameRate,
    tint,
    facingMode: 'directional',
    originY,
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
  // Runner 缩放按 Walker 已验收比例反推，保证两者体型关系与碰撞半径一致：
  // Walker 最大帧主体 916px，1024 帧 ×0.068 → 可见 62.3px，半径 14 → 4.45px 每半径单位；
  // Runner 半径 11 → 目标可见 48.9px，最大帧主体 435px → 48.9/435 ≈ 0.112。
  // originY 取 0.5 而非 0.62：Runner 方向表是几何居中放置的（真正的俯视没有脚底基线，
  // 侧向帧横躺、高度远小于正面帧，底部对齐会让角色转向时上下跳动），
  // 居中后原点 0.5 即等于主体质心，转向时视觉位置稳定。
  // 帧率 10 高于 Walker 的 6，因为 Runner 速度 52 对 22，四帧循环需要更快步频。
  // 不再叠加暖色 tint：新素材自带确定色板，叠加会与生成配色打架。
  runner: directionalVisual(GAME_ASSET_KEYS.zombieRunnerDirectional, 0.112, 10, 0xffffff, 0.5),
  tank: directionalVisual(GAME_ASSET_KEYS.zombieTank, 1.32, 4, 0xdce8d1),
  // Bomber 缩放同样按已验收的"可见高度 / 碰撞半径"比值反推，保持三者体型关系一致：
  // Walker 62.3px / r14 = 4.449，Runner 48.7px / r11 = 4.429。
  // Bomber 半径 13、最大帧主体实测 417px → 417 × 0.138 = 57.6px，比值 4.427。
  // 帧率 7：速度 30 落在 Walker 6@22 与 Runner 10@52 之间，线性插值得 7.07。
  // originY 0.5：方向表为几何居中放置，原点即主体质心，转向时视觉位置稳定。
  // 去掉原 0xffc893 暖色 tint：生成素材自带确定色板，叠加会与橙红感染囊打架。
  bomber: directionalVisual(GAME_ASSET_KEYS.zombieBomberDirectional, 0.138, 7, 0xffffff, 0.5),
  // Lurker 缩放同样按已验收的"可见高度 / 碰撞半径"比值反推，而不是按 ZOMBIE_PROMPTS.md
  // §1 的档位文字：Walker 62.3/14 = 4.45、Runner 48.7/11 = 4.43，比值才是让精灵与碰撞圆
  // 对得上的那一条。lurker 半径 15 → 目标可见约 66.5px；最大帧主体 418px → 66.5/418 ≈ 0.159。
  // 这会让 lurker 落在 §1 的"重装/精英 48-64px"档之上，是明知的偏离，见执行文档 §7.1。
  // 帧率 7 由速度插值得到（Walker 6@22、Runner 10@52，lurker 27 → 6.67），与旧值一致。
  // originY 0.5：方向表几何居中放置，原点即主体质心，转向时视觉位置稳定。
  lurker: directionalVisual(GAME_ASSET_KEYS.zombieLurkerDirectional, 0.159, 7, 0xffffff, 0.5),
  // Drifter 缩放同样按已验收的"可见高度 / 碰撞半径"比值反推，不按 ZOMBIE_PROMPTS.md §1
  // 的档位文字：Walker 62.3/14 = 4.450、Runner 48.7/11 = 4.429、Bomber 57.6/13 = 4.427。
  // drifter 半径 13（与 Bomber 同）→ 目标可见约 57.6px；最大帧主体 426px → 57.6/426 ≈ 0.135。
  // 反推 426×0.135 = 57.5px，比值 4.424，与三者一致；且落在 §1 的"普通感染体 28-48px"
  // 之上但仍在"重装/精英 48-64px"档内，不像 lurker 那样需要专门说明偏离。
  // 帧率 8 由速度插值得到（Walker 6@22、Runner 10@52，drifter 38 → 8.13），与旧值一致。
  // originY 0.5：方向表几何居中放置，原点即主体质心，转向时视觉位置稳定。
  drifter: directionalVisual(GAME_ASSET_KEYS.zombieDrifterDirectional, 0.135, 8, 0xffffff, 0.5),
  // Feral 缩放同样按已验收的"可见高度 / 碰撞半径"比值反推：
  // Walker 62.3/14 = 4.450、Runner 48.7/11 = 4.429。
  // feral 半径 11 与 Runner 相同，最大帧主体也同为 435px，因此缩放与 Runner 一致取 0.112，
  // 可见 435×0.112 = 48.7px，比值 4.43。这是 Bomber / Lurker 之后第一次不产生档位偏离。
  // 帧率 11：速度 62 在 Walker 6@22 与 Runner 10@52 之间线性插值得 11.3，与旧值一致，未改。
  // originY 0.5：方向表几何居中放置，原点即主体质心，转向时视觉位置稳定。
  // 不叠加 tint：生成素材自带确定色板，叠加会与暗红褐的裸露血肉打架。
  feral: directionalVisual(GAME_ASSET_KEYS.zombieFeralDirectional, 0.112, 11, 0xffffff, 0.5),
  // Bloodied 与 Headless 半径都是 17，是普通感染体里最大的一档，两者共用同一目标可见高度。
  // 缩放仍按已验收的"可见高度 / 碰撞半径 ≈ 4.43"反推：目标可见 17 × 4.43 = 75.3px。
  // bloodied 最大帧主体 435px → 75.3/435 ≈ 0.173，反推 435×0.173 = 75.3px，比值 4.427。
  // 帧率 6：速度 25 在 Walker 6@22 与 Runner 10@52 之间插值得 6.4，与旧值一致，未改。
  bloodied: directionalVisual(GAME_ASSET_KEYS.zombieBloodiedDirectional, 0.173, 6, 0xffffff, 0.5),
  // headless 最大帧主体 415px → 75.3/415 ≈ 0.181，反推 415×0.181 = 75.1px，比值 4.418。
  // 帧率由 5 改为 6：速度 20 插值得 5.73。旧值 5 是按 Curt 三帧表标定的，
  // 新表是四帧循环，按同一条插值规则重新取值（其余四类都走这条规则）。
  headless: directionalVisual(GAME_ASSET_KEYS.zombieHeadlessDirectional, 0.181, 6, 0xffffff, 0.5),
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

/**
 * 拥有独立图鉴立绘的感染体。
 *
 * 这些立绘是单帧静态整图，不属于 `ZOMBIE_TEXTURE_LAYOUTS` 的切帧对象，图鉴要用
 * `__BASE` 帧显示。没有登记的感染体继续用移动方向表的首帧当预览。
 * 集中登记而不是在场景里按 id 写条件分支，新增立绘时只改这一处。
 */
export const ZOMBIE_PORTRAIT_TEXTURE_KEYS: Partial<Record<ZombieId, string>> = {
  walker: GAME_ASSET_KEYS.zombieWalkerPortrait,
  runner: GAME_ASSET_KEYS.zombieRunnerPortrait,
  bomber: GAME_ASSET_KEYS.zombieBomberPortrait,
  lurker: GAME_ASSET_KEYS.zombieLurkerPortrait,
  drifter: GAME_ASSET_KEYS.zombieDrifterPortrait,
  feral: GAME_ASSET_KEYS.zombieFeralPortrait,
  bloodied: GAME_ASSET_KEYS.zombieBloodiedPortrait,
  headless: GAME_ASSET_KEYS.zombieHeadlessPortrait,
};

export function getZombiePortraitTextureKey(typeId: ZombieId): string | null {
  return ZOMBIE_PORTRAIT_TEXTURE_KEYS[typeId] ?? null;
}

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
