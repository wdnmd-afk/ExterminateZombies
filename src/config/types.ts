/** 所有配置表的类型定义集中于此,配置文件从这里 import type。 */

import type { ZombieId } from './zombies';

export type AmmoType = 'light' | 'heavy' | 'shell' | 'explosive';

/**
 * 伤害的距离衰减档位。
 * 数组必须按 `distance` 升序；命中时取"飞行距离已越过的最后一档"的倍率。
 */
export interface DamageDropoffStop {
  distance: number;    // 起始飞行距离(像素)
  multiplier: number;  // 该档位的伤害倍率
}

// ——— 武器 ———
export interface WeaponDef {
  id: string;
  name: string;
  damage: number;        // 单发伤害
  fireRate: number;      // 射击间隔(毫秒),越小越快
  magazineSize: number;  // 弹匣容量
  reloadTime: number;    // 换弹耗时(毫秒)
  bulletSpeed: number;   // 子弹速度(像素/秒)
  spread: number;        // 散射角度(度),0=绝对精准
  pellets: number;       // 每次击发射出的子弹数(霰弹枪 >1)
  penetration: number;   // 每颗子弹可贯穿的敌人数(0=命中即消失)
  auto: boolean;         // true=按住连发,false=单发
  ammoType: AmmoType;    // 弹药类型(与掉落匹配)
  range: number;         // 子弹最大飞行距离(像素)
  color: number;         // 子弹占位颜色
  projectileRadius?: number; // 弹体碰撞/显示半径，缺省为 4
  infiniteAmmo?: boolean; // 备用弹无限(起始武器保底,防止软锁死)。保留弹匣+换弹节奏,但换弹不扣备用弹
  impactEffect?: EffectDef; // 命中敌人、场景物、障碍或达到射程时触发一次

  // ——— 爽感机制(全部可选，缺省即退化为原行为) ———
  /** 暴击概率 0~1。逐弹丸独立判定，缺省不暴击。 */
  critChance?: number;
  /** 暴击伤害倍率。配置 `critChance` 时必须一起给，且必须大于 1。 */
  critMultiplier?: number;
  /** 命中后沿弹道推开目标的基准距离(像素)。实际距离按目标体型衰减，Boss 免疫。 */
  knockback?: number;
  /** 目标生命比例低于该值时直接处决 0~1。Boss 不受处决影响。 */
  executeThreshold?: number;
  /** 按飞行距离衰减伤害；缺省全程满伤。 */
  damageDropoff?: DamageDropoffStop[];
  /** 每穿透一个目标后的伤害倍率，>1 表示越穿越痛。缺省 1。 */
  chainBonus?: number;
  /** 对非 Boss 造成致死命中时请求的慢动作档位；缺省不触发。 */
  killSlowMotionTier?: 'A' | 'S';
  /** 命中障碍后可反弹次数，仅允许 0 或 1。缺省 0；主要用于 M79 的单次弹跳爆破节奏。 */
  bounceCount?: number;
  /**
   * 移动射击承受散射惩罚的比例 0~1：0=移动完全不影响精度，1=承受完整惩罚。缺省 1。
   * 语义是"承受比例"而不是"直接倍率"，否则小于 1 的值会变成"移动比站着更准"。
   */
  movementPenalty?: number;
  /**
   * 换弹方式。`shell` 为逐发填装：每 `reloadTime / magazineSize` 毫秒装 1 发，
   * 开火可随时打断并保留已装填的进度。缺省 `magazine`（整弹匣，必须装完）。
   */
  reloadMode?: 'magazine' | 'shell';
}

// ——— 区域效果 / 爆炸 ———
export interface LingerDef {
  kind: 'fire' | 'dust';
  duration: number;         // 持续毫秒
  radius: number;           // 区域半径
  tickDamage?: number;      // 每跳伤害(火)
  tickRate?: number;        // 伤害间隔毫秒
  blocksEnemies?: boolean;  // 是否阻挡僵尸(面粉粉尘云 = true)
  slowFactor?: number;      // 减速系数 0~1(可选)
  color: number;            // 区域占位颜色
}

export interface EffectDef {
  kind: 'explosion';
  damage: number;      // 爆炸中心瞬时伤害
  radius: number;      // 爆炸半径
  lingering?: LingerDef;
}

// ——— 掉落 ———
export interface DropDef {
  type: 'ammo' | 'weapon' | 'item' | 'health' | 'enhancement_pack';
  ammoType?: AmmoType;   // type==='ammo' 时用
  itemId?: string;       // type==='item'/'weapon' 时用
  chance: number;        // 0~1 掉落概率
  amount?: number;       // 数量
}

// ——— 僵尸 ———
export interface ZombieAbilityBase {
  cooldown: number;      // 两次能力执行之间的最短间隔(毫秒)
  windup: number;        // 前摇时长(毫秒)，必须给玩家反应窗口
  recovery: number;      // 执行后的恢复时长(毫秒)
  minRange: number;      // 能力触发最小距离(像素)
  maxRange: number;      // 能力触发最大距离(像素)
}

export interface RangedZombieAbility extends ZombieAbilityBase {
  kind: 'ranged';
  damage: number;
  projectileSpeed: number;
  projectileRange: number;
  projectileRadius: number;
}

export interface DashZombieAbility extends ZombieAbilityBase {
  kind: 'dash';
  dashSpeed: number;
  dashDuration: number;
}

export interface ShockwaveZombieAbility extends ZombieAbilityBase {
  kind: 'shockwave';
  damage: number;
  radius: number;
  /** 是否引爆范围内可连锁场景物；用于让 Boss 技能与战场资源发生关系。 */
  triggerProps?: boolean;
}

export interface BombardZombieAbility extends ZombieAbilityBase {
  kind: 'bombard';
  damage: number;
  radius: number;
}

export type ZombieAbilityDef =
  | RangedZombieAbility
  | DashZombieAbility
  | ShockwaveZombieAbility
  | BombardZombieAbility;

export interface BossPhaseDef {
  /** 当前生命比例小于等于该值时进入此阶段，阶段按阈值从高到低排列。 */
  healthRatio: number;
  label: string;
  speedMultiplier?: number;
  /** 只缩放基础能力的冷却；阶段解锁能力使用自身配置。 */
  baseAbilityCooldownMultiplier?: number;
  /** 缩短基础能力恢复窗口时仍需保留玩家可读的反击期。 */
  baseAbilityRecoveryMultiplier?: number;
  /** 进入该阶段后新增的能力，使用独立冷却槽。 */
  unlockAbilities?: ZombieAbilityDef[];
}

export interface ZombieDef {
  id: string;
  name: string;
  health: number;
  speed: number;         // 追击速度(像素/秒)
  damage: number;        // 接触/攻击伤害
  attackRate: number;    // 攻击间隔(毫秒)
  radius: number;        // 碰撞半径
  color: number;         // 占位颜色(0xRRGGBB)
  scoreValue: number;    // 击杀得分
  drops: DropDef[];      // 掉落表
  explodeOnDeath?: EffectDef;  // 死亡爆炸(爆炸僵尸),缺省=不爆
  ability?: ZombieAbilityDef;  // 特殊攻击；缺省使用近战追击行为
  bossPhaseLabel?: string;      // Boss 第一阶段名称；缺省不在 HUD 展示阶段
  bossPhases?: BossPhaseDef[];  // 生命阈值驱动的后续阶段
}

// ——— 道具 / 场景物 ———
export interface ItemDef {
  id: string;
  name: string;
  category: 'prop' | 'deployable';        // prop=地图场景物; deployable=玩家携带布置
  trigger: 'onDamage' | 'onProximity' | 'manual';
  health?: number;       // prop 被打爆所需伤害
  proximity?: number;    // 触发半径(地雷)
  chainable: boolean;    // 是否会被其它爆炸连锁引爆
  color: number;         // 占位颜色
  effect: EffectDef;     // 触发后产生的效果
  carryMax?: number;     // 携带上限(deployable)
  radius?: number;       // 占位显示半径
}

// ——— 关卡 ———
export interface WaveEnemyEntry {
  type: ZombieId;
  count: number;
}

/**
 * 一个战斗阶段内的生成段落。
 *
 * 段落是「阶段内部节奏」的载体：D-002 把标准关锁定为 3 个常规阶段，
 * 但一个阶段塞 100 只敌人再一次性放出来只会变成平铺直叙的消耗战。
 * 拆成段落后，同一个阶段内可以做出 准备 → 积压 → 释放 → 收束 的节奏，
 * 而清场判定与阶段奖励仍然只结算一次，不影响已冻结的单局结构。
 */
export interface WaveSegmentDef {
  enemies: WaveEnemyEntry[];
  /** 段落内两只之间的生成间隔(毫秒)。 */
  spawnInterval: number;
  /** 进入本段落前的静默时间(毫秒)，用于制造喘息与积压。首个段落通常为 0，由阶段 startDelay 承担。 */
  leadIn: number;
  /**
   * 本段落的同屏敌人上限。达到上限时暂停生成，直到场上敌人降到上限以下。
   * 这是「密度爆炸」与「糊屏掉帧」之间唯一的闸门：没有它，高总量段落会把
   * 全部敌人同时堆在场上；有了它，屏幕保持饱和而总量由玩家清杀速度自然消化。
   */
  concurrentCap?: number;
}

/**
 * 一个战斗阶段。
 *
 * 两种写法互斥（类型层用 `never` 保证不可能同时出现）：
 * 1. 单段写法 `enemies` + `spawnInterval`：其余九关原型与无尽模式继续使用。
 * 2. 段落写法 `segments`：正式关卡用来表达阶段内节奏。
 *
 * 读取方必须走 `config/waveShape.ts` 的取值函数，不要直接访问 `enemies`。
 */
export type WaveDef = {
  startDelay: number;    // 进入本阶段后的准备时间(毫秒)
  /** 清场后按顺序结算；强化选择完成前不得推进下一阶段。 */
  rewards?: WaveRewardDef[];
} & (
  | { enemies: WaveEnemyEntry[]; spawnInterval: number; segments?: never }
  | { segments: WaveSegmentDef[]; enemies?: never; spawnInterval?: never }
);

export type WaveRewardDef =
  | { type: 'weapon'; weaponId: string; ammo: number }
  | { type: 'enhancement' };

export interface PropPlacement {
  type: string;          // ITEMS 里的 prop id
  x: number;
  y: number;
}

// ——— 地形障碍物 ———
// 静态掩体:挡玩家移动、挡僵尸移动(撞墙滑行)、挡子弹。矩形碰撞体。
// kind 决定 canvas 程序化绘制的外观,贴合各关设定;摆放凸形、留通路避免僵尸卡死。
export type ObstacleKind = 'container' | 'wreck' | 'barricade';

export interface ObstaclePlacement {
  kind: ObstacleKind;
  x: number;             // 中心 x
  y: number;             // 中心 y
  width: number;
  height: number;
  rotation?: number;     // 旋转(度),缺省 0
}

export interface LevelDef {
  id: string;
  name: string;
  /** 主菜单展示的本关任务目标与战术提示，必须由关卡配置独立提供。 */
  briefing: string;
  props: PropPlacement[];
  obstacles?: ObstaclePlacement[];
  waves: WaveDef[];
  boss: { type: ZombieId } | null;
}

// ——— 武器增强 ———
// 同一武器的多张强化可以同时持有并叠加，不存在互斥组：
// 倍率相乘、加法相加、改造类(set*)取最强的一档。
// 解析规则见 EnhancementManager.resolveWeaponDef。

export interface EnhancementDef {
  id: string; // 唯一ID, e.g., 'shotgun_double_pellets'
  weaponId: string; // 关联的武器ID

  cardTitle: string; // 卡片标题, e.g., "双倍火力"
  cardDescription: string; // 卡片效果描述, e.g., "霰弹枪的弹丸数量翻倍，但单发伤害略微降低。"

  // 具体的效果改动, 由 EnhancementManager.resolveWeaponDef 解析
  // 使用 key-value 形式，便于扩展
  effects: {
    // 乘法修正
    damageFactor?: number;      // e.g., 0.8 (伤害变为80%)
    fireRateFactor?: number;    // e.g., 0.5 (射速翻倍)
    reloadTimeFactor?: number;  // e.g., 1.2 (换弹时间增加20%)
    pelletsFactor?: number;     // e.g., 2.0 (弹丸数量翻倍)
    spreadFactor?: number;      // e.g., 1.5 (散射范围增加50%)
    magazineFactor?: number;    // e.g., 2.0 (弹匣容量翻倍,结果取整且不小于1)

    // 替换/赋值(改造类)。同一武器上多张卡都赋值时取最强的一档，
    // 保证后抽到的卡不会把已有改造削回去。
    setToAuto?: boolean;        // e.g., true (变为全自动)
    setPellets?: number;        // e.g., 1 (变为独头弹)。弹丸被锁定后，
                                // 其它卡的 pelletsFactor 会折算成等效伤害倍率
    setPenetration?: number;    // e.g., 10 (变为可穿透10个敌人)

    // 加法修正
    addSpread?: number;         // e.g., -5 (减少5度散射)
    addPenetration?: number;    // e.g., 2 (在原有穿透基础上再加2)

    // 命中爆炸修正(仅对配置了 impactEffect 的武器生效)
    addExplosionRadius?: number;    // e.g., 50 (爆炸半径增加50像素)
    explosionDamageFactor?: number; // e.g., 1.6 (爆炸伤害变为160%)
    setImpactLingering?: LingerDef; // e.g., 爆炸后留下燃烧区域
  }
}
