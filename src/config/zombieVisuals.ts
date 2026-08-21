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
  zombieTankDirectional: 'game-zombie-tank-directional-src',
  zombieTankPortrait: 'game-zombie-tank-portrait',
  zombieRottingDirectional: 'game-zombie-rotting-directional-src',
  zombieRottingPortrait: 'game-zombie-rotting-portrait',
  zombieBloaterDirectional: 'game-zombie-bloater-directional-src',
  zombieBloaterPortrait: 'game-zombie-bloater-portrait',
  zombieStalkerDirectional: 'game-zombie-stalker-directional-src',
  zombieStalkerPortrait: 'game-zombie-stalker-portrait',
  zombieCrawlerDirectional: 'game-zombie-crawler-directional-src',
  zombieCrawlerPortrait: 'game-zombie-crawler-portrait',
  zombieOddityDirectional: 'game-zombie-oddity-directional-src',
  zombieOddityPortrait: 'game-zombie-oddity-portrait',
  // 四个 Boss 全部换为自生成素材：移动/攻击各一条 4 帧，死亡两条各 4 帧。
  zombieTankBoss: 'game-zombie-tank-boss-src',
  zombieTankBossAttack: 'game-zombie-tank-boss-attack-src',
  zombieTankBossDeath0: 'game-zombie-tank-boss-death-0-src',
  zombieTankBossDeath1: 'game-zombie-tank-boss-death-1-src',
  zombieTankBossPortrait: 'game-zombie-tank-boss-portrait',
  zombieBomberBoss: 'game-zombie-bomber-boss-src',
  zombieBomberBossAttack: 'game-zombie-bomber-boss-attack-src',
  zombieBomberBossDeath0: 'game-zombie-bomber-boss-death-0-src',
  zombieBomberBossDeath1: 'game-zombie-bomber-boss-death-1-src',
  zombieBomberBossPortrait: 'game-zombie-bomber-boss-portrait',
  zombieHunterBoss: 'game-zombie-hunter-boss-src',
  zombieHunterBossAttack: 'game-zombie-hunter-boss-attack-src',
  zombieHunterBossDeath0: 'game-zombie-hunter-boss-death-0-src',
  zombieHunterBossDeath1: 'game-zombie-hunter-boss-death-1-src',
  zombieHunterBossPortrait: 'game-zombie-hunter-boss-portrait',
  zombieMatriarchBoss: 'game-zombie-matriarch-boss-src',
  zombieMatriarchBossAttack: 'game-zombie-matriarch-boss-attack-src',
  zombieMatriarchBossDeath0: 'game-zombie-matriarch-boss-death-0-src',
  zombieMatriarchBossDeath1: 'game-zombie-matriarch-boss-death-1-src',
  zombieMatriarchBossPortrait: 'game-zombie-matriarch-boss-portrait',
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

const CURT_TEXTURE_KEYS = [
  GAME_ASSET_KEYS.zombieWalker,
  GAME_ASSET_KEYS.zombieRunner,
  GAME_ASSET_KEYS.zombieBomber,
  GAME_ASSET_KEYS.zombieLurker,
  GAME_ASSET_KEYS.zombieDrifter,
] as const;

const CABBIT_TEXTURE_KEYS = [
  GAME_ASSET_KEYS.zombieFeral,
  GAME_ASSET_KEYS.zombieBloodied,
  GAME_ASSET_KEYS.zombieHeadless,
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
  GAME_ASSET_KEYS.zombieTankDirectional,
  GAME_ASSET_KEYS.zombieRottingDirectional,
  GAME_ASSET_KEYS.zombieBloaterDirectional,
  GAME_ASSET_KEYS.zombieStalkerDirectional,
  GAME_ASSET_KEYS.zombieCrawlerDirectional,
  GAME_ASSET_KEYS.zombieOddityDirectional,
] as const;

/**
 * 自生成 Boss 的单朝向帧条：4 帧 × 512，靠运行时旋转表达四方向。
 *
 * 为什么 Boss 用 rotating 而其余普通感染体用 directional（实测约束，不是偏好）：
 * ZOMBIE_ACTION_TEXTURE_LAYOUTS 的攻击/死亡素材是单朝向帧条，没有 directionRows。
 * Zombie.ts 的 updateFacing 对 rotating 素材调 sprite.setRotation，动作动画播在同一个
 * sprite 上，旋转会带着攻击/死亡帧一起对准目标。若 Boss 改成 directional，
 * 朝向改由行选择表达、sprite 不再旋转，单朝向的动作帧就会锁死在被画出来的那个朝向，
 * 属功能回退。素材本身画成朝右（ZOMBIE_PROMPTS.md §1 的基准方向），
 * 所以 rotationOffset 由第三方素材时期的 -PI/2 改为 0。
 */
const CUSTOM_BOSS_MOVE_TEXTURE_KEYS = [
  GAME_ASSET_KEYS.zombieTankBoss,
  GAME_ASSET_KEYS.zombieBomberBoss,
  GAME_ASSET_KEYS.zombieHunterBoss,
  GAME_ASSET_KEYS.zombieMatriarchBoss,
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
  ...CUSTOM_BOSS_MOVE_TEXTURE_KEYS.map((textureKey) => ({
    kind: 'rotating' as const,
    textureKey,
    frameWidth: 512,
    frameHeight: 512,
    frameCount: 4,
  })),
];

/**
 * Boss 动作素材独立于移动条登记，只有完成玩法接入的动作才进入运行时。
 * 多行动作图按 `columns` 行优先切帧，死亡结算等待登记的全部帧播放完成。
 */
/**
 * 自生成 Boss 动作素材统一为 512 帧：攻击一条 4 帧，死亡两条各 4 帧共 8 帧。
 *
 * 帧数比第三方素材少（原为攻击 5-8 帧、死亡 15-16 帧），因为一次生成请求是一张
 * 2×2 网格。帧率按"保持原有动作时长不变"反推，误差都在 35ms 内：
 *
 *   tank_boss      攻击 7@9=778ms  → 4@5=800ms    死亡 15@12=1250ms → 8@6=1333ms
 *   bomber_boss    攻击 8@10=800ms → 4@5=800ms    死亡 16@12=1333ms → 8@6=1333ms
 *   hunter_boss    攻击 8@12=667ms → 4@6=667ms    死亡 16@12=1333ms → 8@6=1333ms
 *   matriarch_boss 攻击 5@8=625ms  → 4@6=667ms    死亡 16@10=1600ms → 8@5=1600ms
 *
 * 攻击时长其实会被 Zombie.playAbilityWindup 的 timeScale 拉伸到技能前摇长度，
 * 所以那一列只决定名义时长；死亡时长是 beginDeathAnimation 的实际等待时间，
 * 必须对齐，否则 Boss 的死亡结算节奏会变。
 */
function bossActionSources(
  keys: readonly string[],
): readonly ZombieActionTextureSource[] {
  return keys.map((textureKey) => ({
    textureKey,
    frameWidth: 512,
    frameHeight: 512,
    columns: 4,
    frameCount: 4,
  }));
}

export const ZOMBIE_ACTION_TEXTURE_LAYOUTS = [
  {
    typeId: 'tank_boss',
    action: 'attack',
    sources: bossActionSources([GAME_ASSET_KEYS.zombieTankBossAttack]),
    frameCount: 4,
    frameRate: 5,
  },
  {
    typeId: 'tank_boss',
    action: 'death',
    sources: bossActionSources([
      GAME_ASSET_KEYS.zombieTankBossDeath0,
      GAME_ASSET_KEYS.zombieTankBossDeath1,
    ]),
    frameCount: 8,
    frameRate: 6,
  },
  {
    typeId: 'bomber_boss',
    action: 'attack',
    sources: bossActionSources([GAME_ASSET_KEYS.zombieBomberBossAttack]),
    frameCount: 4,
    frameRate: 5,
  },
  {
    typeId: 'bomber_boss',
    action: 'death',
    sources: bossActionSources([
      GAME_ASSET_KEYS.zombieBomberBossDeath0,
      GAME_ASSET_KEYS.zombieBomberBossDeath1,
    ]),
    frameCount: 8,
    frameRate: 6,
  },
  {
    typeId: 'hunter_boss',
    action: 'attack',
    sources: bossActionSources([GAME_ASSET_KEYS.zombieHunterBossAttack]),
    frameCount: 4,
    frameRate: 6,
  },
  {
    typeId: 'hunter_boss',
    action: 'death',
    sources: bossActionSources([
      GAME_ASSET_KEYS.zombieHunterBossDeath0,
      GAME_ASSET_KEYS.zombieHunterBossDeath1,
    ]),
    frameCount: 8,
    frameRate: 6,
  },
  {
    typeId: 'matriarch_boss',
    action: 'attack',
    sources: bossActionSources([GAME_ASSET_KEYS.zombieMatriarchBossAttack]),
    frameCount: 4,
    frameRate: 6,
  },
  {
    typeId: 'matriarch_boss',
    action: 'death',
    sources: bossActionSources([
      GAME_ASSET_KEYS.zombieMatriarchBossDeath0,
      GAME_ASSET_KEYS.zombieMatriarchBossDeath1,
    ]),
    frameCount: 8,
    frameRate: 5,
  },
] as const satisfies readonly ZombieActionTextureLayout[];

/**
 * 「可见长边 / 碰撞半径」的全表约定值。
 *
 * 由 8 类已验收的普通感染体标定：Walker 可见 62.3px / 半径 14 = 4.45、
 * Runner 48.7 / 11 = 4.43、Bomber 57.6 / 13 = 4.43。等价于"精灵长边约为碰撞直径的
 * 2.2 倍"，即精灵刻意外溢于碰撞圆——这是本项目一贯的取舍（擦到轮廓边缘不算命中）。
 * 新增或重做任何一类时，scale 都按 `半径 × 本值 / 方向表最大主体像素` 反推。
 */
const SPRITE_TO_RADIUS_RATIO = 4.43;

/**
 * Boss 可见长边的下限与上限，单位分别是逻辑像素和「可见长边 / 碰撞半径」比值。
 *
 * 下限存在的原因：全表约定让精灵尺寸跟着碰撞半径走，而 Boss 的碰撞半径是玩法数值，
 * 其中 tank_boss 的 30 只比普通 tank 的 24 大 25%，纯按约定算只有 133px、
 * 对 tank 的 106px 仅大 25%，在实机里读不出「这是首领」。137px 取自 tank 的 1.29 倍。
 *
 * 上限存在的原因（这一条是实测补上的）：下限对半径特别小的 Boss 会把外溢推到失真。
 * bomber_boss 半径 18（四个 Boss 最小，玩法设定为高机动低耐久的轰炸者），
 * 按 137px 下限算出的比值高达 8.30，即精灵长边是碰撞直径的 4.1 倍——
 * 全表其余 17 类都在 4.39~4.57。那种程度的外溢会让玩家看到一个大目标却打不中，
 * 属于误导而不是压迫感。上限 5.0 把外溢封在「比普通感染体多约 13%」的范围内。
 *
 * 两条一起作用的结果（可见长边 / 比值）：
 *   matriarch_boss 190px / 4.43   hunter_boss 177px / 4.43
 *   tank_boss      137px / 4.57   bomber_boss  90px / 5.00
 * 三个大 Boss 明显大于最大的普通感染体（tank 106px）；bomber_boss 是刻意的最小 Boss，
 * 因为它的碰撞半径本就最小，压迫感靠画面内容（撑裂的躯干、发光囊体、长撑臂）取得。
 * 若要它更大，应该动的是碰撞半径而不是缩放——那是玩法数值。
 */
const BOSS_MIN_VISIBLE = 137;
const BOSS_MAX_SPRITE_TO_RADIUS_RATIO = 5.0;

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
  // Tank 起自 v03（v01/v02 的侧向被画成近似正面，见 spec 的 _versionNote）。
  // 缩放按已验收的"可见长边 / 碰撞半径 ≈ 4.43"约定反推：半径 24 → 目标可见 106.3px，
  // 方向表最大主体实测 418px → 106.3/418 ≈ 0.254，回代 418×0.254 = 106.2px，比值 4.42。
  // 帧率 5：速度 13 在 Walker 6@22 与 Runner 10@52 之间线性插值得 4.8，是全类最慢一档。
  // 去掉原 0xdce8d1 冷色 tint：生成素材自带确定色板，叠加会与灰绿肤色打架。
  tank: directionalVisual(GAME_ASSET_KEYS.zombieTankDirectional, 0.254, 5, 0xffffff, 0.5),
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
  // 以下三类与 tank_boss 同样按"可见长边 / 碰撞半径 ≈ 4.43"反推，帧率按速度在
  // Walker 6@22 与 Runner 10@52 之间线性插值。括号内是方向表最大主体实测像素。
  // rotting 半径 16 → 目标 70.9px，最大主体 413px → 0.172（回代 71.0px，比值 4.44）。
  // 帧率 5：速度 16 插值得 5.2，是全类第二慢。
  rotting: directionalVisual(GAME_ASSET_KEYS.zombieRottingDirectional, 0.172, 5, 0xffffff, 0.5),
  // bloater 半径 23 → 目标 101.9px，最大主体 435px → 0.234（回代 101.8px，比值 4.43）。
  // 帧率 5：速度 14 插值得 4.9。
  bloater: directionalVisual(GAME_ASSET_KEYS.zombieBloaterDirectional, 0.234, 5, 0xffffff, 0.5),
  // crawler 半径 10（全表最小）→ 目标 44.3px，最大主体 435px → 0.102
  // （回代 44.4px，比值 4.44）。帧率 11：速度 59 插值得 10.9，是全表第二快。
  // 由 rotating 改为 directional，理由同 stalker：伏地四足体的侧向宽高比实测 2.41、
  // 正面 0.55，是全表朝向差异最大的一类，旋转单帧表达不了。
  crawler: directionalVisual(GAME_ASSET_KEYS.zombieCrawlerDirectional, 0.102, 11, 0xffffff, 0.5),
  // stalker 半径 13 → 目标 57.6px，最大主体 435px → 0.132（回代 57.4px，比值 4.42）。
  // 帧率 9：速度 46 插值得 9.2。
  // 由 rotating 改为 directional：伏地四足体的四个朝向轮廓差异极大
  // （侧向宽高比实测 1.64 对正面 0.57），旋转单帧表达不了，且它没有动作素材，
  // 不受 Boss 那条"动作帧锁死朝向"的约束。
  stalker: directionalVisual(GAME_ASSET_KEYS.zombieStalkerDirectional, 0.132, 9, 0xffffff, 0.5),
  // oddity 半径 18（普通感染体最大）→ 目标 79.7px，最大主体 399px → 0.200
  // （回代 79.8px，比值 4.43）。帧率 8：速度 34 插值得 7.6。
  // 由 rotating 改为 directional：刻意不对称的体型在四个朝向下轮廓差异明显
  // （侧向宽高比实测 1.39、正面 0.81），且旋转会让"一侧肩巨大"这个识别特征
  // 随朝向转到不该出现的位置。
  oddity: directionalVisual(GAME_ASSET_KEYS.zombieOddityDirectional, 0.200, 8, 0xffffff, 0.5),
  // tank_boss 保持 rotating，但 rotationOffset 由第三方素材时期的 -PI/2 改为 0：
  // 自生成素材本就画成朝右（ZOMBIE_PROMPTS.md §1 的基准方向），无需修正。
  // 必须保持 rotating 的理由见 CUSTOM_BOSS_MOVE_TEXTURE_KEYS 的注释。
  //
  // Boss 的缩放规则见 resolveBossVisibleLongEdge：
  //   可见长边 = clamp(半径 × 4.43, 下限 137px, 半径 × 5.0)
  // tank_boss 半径 30 → 约定值 132.9px 被下限抬到 137px，最大主体 401px → 0.342
  // （回代 137.1px，比值 4.57）。帧率 5：速度 18 插值得 5.5，与旧值一致。
  tank_boss: rotatingVisual(GAME_ASSET_KEYS.zombieTankBoss, 0.342, 5, 0),
  // bomber_boss 半径 18 是四个 Boss 最小的，约定值 79.7px 低于下限，但下限会把外溢
  // 推到比值 8.30（全表其余都在 4.4 附近），因此由上限 5.0 收口 → 90.0px，
  // 最大主体 406px → 0.222（回代 90.1px，比值 5.00）。它是刻意的最小 Boss，
  // 理由见 BOSS_MAX_SPRITE_TO_RADIUS_RATIO。帧率 8：速度 40 插值得 8.4，与旧值一致。
  bomber_boss: rotatingVisual(GAME_ASSET_KEYS.zombieBomberBoss, 0.222, 8, 0),
  // hunter_boss 半径 40 → 约定值 177.2px，在下限与上限之间 → 最大主体 431px → 0.411
  // （回代 177.1px，比值 4.43）。
  // 帧率 9：速度 44 插值得 8.9（旧值 12 按第三方 4 帧条标定，现统一按插值规则）。
  hunter_boss: rotatingVisual(GAME_ASSET_KEYS.zombieHunterBoss, 0.411, 9, 0),
  // matriarch_boss 半径 43 是全表最大 → 约定值 190.5px → 最大主体 435px → 0.438
  // （回代 190.5px，比值 4.43）。实机可见约 190px，约占 720p 画面高度的 26%，
  // 是全部 18 类里最大的单位。帧率 5：速度 17（全表最慢）插值得 5.3。
  matriarch_boss: rotatingVisual(GAME_ASSET_KEYS.zombieMatriarchBoss, 0.438, 5, 0),
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
  tank: GAME_ASSET_KEYS.zombieTankPortrait,
  rotting: GAME_ASSET_KEYS.zombieRottingPortrait,
  bloater: GAME_ASSET_KEYS.zombieBloaterPortrait,
  stalker: GAME_ASSET_KEYS.zombieStalkerPortrait,
  crawler: GAME_ASSET_KEYS.zombieCrawlerPortrait,
  oddity: GAME_ASSET_KEYS.zombieOddityPortrait,
  tank_boss: GAME_ASSET_KEYS.zombieTankBossPortrait,
  bomber_boss: GAME_ASSET_KEYS.zombieBomberBossPortrait,
  hunter_boss: GAME_ASSET_KEYS.zombieHunterBossPortrait,
  matriarch_boss: GAME_ASSET_KEYS.zombieMatriarchBossPortrait,
};

export function getZombiePortraitTextureKey(typeId: ZombieId): string | null {
  return ZOMBIE_PORTRAIT_TEXTURE_KEYS[typeId] ?? null;
}

export function getZombieVisual(typeId: ZombieId): ZombieVisual {
  return ZOMBIE_VISUALS[typeId];
}

/**
 * Boss 缩放的反推口径，供测试与执行文档共用，避免这条规则散落在注释里。
 * 返回该 Boss 应有的可见长边（逻辑像素）。
 */
export function resolveBossVisibleLongEdge(radius: number): number {
  return Math.min(
    Math.max(radius * SPRITE_TO_RADIUS_RATIO, BOSS_MIN_VISIBLE),
    radius * BOSS_MAX_SPRITE_TO_RADIUS_RATIO,
  );
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
