/** 所有配置表的类型定义集中于此,配置文件从这里 import type。 */

import type { ZombieId } from './zombies';
import type { MedicineId } from './medicine';

export type AmmoType = 'light' | 'heavy' | 'shell' | 'explosive' | 'belt' | 'fuel';

export interface WeaponSpinUpDef {
  /** Time needed to reach the configured base fire rate while the trigger stays held. */
  durationMs: number;
  /** Fire interval at the beginning of a trigger hold. */
  initialFireRate: number;
}

/**
 * 武器负重对机动性的影响。
 *
 * 三个字段都是**移速倍率**而不是惩罚比例：1 = 完全不受影响，0.35 = 只剩 35% 移速。
 * 与 `movementPenalty`（承受散射惩罚的比例）语义相反，不要互相照抄。
 *
 * 三项由 `WeaponCombatRules.resolveWeaponMobilityMultiplier` 取**最强的一项**合成，
 * 不相乘：相乘会把「重武器 + 换弹」叠成不可玩的数值，而且 HUD 上玩家只需要理解一个数字。
 */
export interface WeaponMobilityDef {
  /** 常驻负重：手持该武器时的基础移速倍率。 */
  carry: number;
  /** 换弹期间的移速倍率。 */
  reload: number;
  /** 架枪扫射到满档时的移速倍率；只配给机枪与重狙，突击步枪及以下不配。 */
  sustainedFire?: number;
  /** 架枪建立时长(毫秒)。缺省取 `spinUp.durationMs`，让转速与负重共用同一条曲线。 */
  braceRampMs?: number;
}

/**
 * 伤害的距离衰减档位。
 * 数组必须按 `distance` 升序；命中时取"飞行距离已越过的最后一档"的倍率。
 */
export interface DamageDropoffStop {
  distance: number;    // 起始飞行距离(像素)
  multiplier: number;  // 该档位的伤害倍率
}

/**
 * 扇形持续攻击。配了它的武器不再生成弹丸：
 * 枪口正前方常驻一片扇形火焰，扇形内的目标按 `damagePerSecond` 连续掉血。
 *
 * 为什么不复用弹丸：喷火器的手感来自「一直烧着」，弹丸只能给出离散的落点，
 * 射程边缘还会出现火焰已经画到脸上但弹丸尚未飞到的空窗。运行期实现见
 * `systems/FlameConeSystem.ts`，命中判定与每跳伤害在 `WeaponCombatRules` 里。
 */
export interface ConeAttackDef {
  /** 扇形半径(像素)，从枪口算起。 */
  range: number;
  /** 扇形总张角(度)，以瞄准方向为中轴左右各一半。 */
  angle: number;
  /** 扇形内每秒伤害。受角色/强化伤害倍率影响，不受 `damage` 字段影响。 */
  damagePerSecond: number;
  /** 伤害结算间隔(毫秒)。越小越平滑，但跳字与音效也越密。 */
  tickRate: number;
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
  pellets: number;       // 每组齐射射出的子弹数(霰弹枪 >1)
  penetration: number;   // 每颗子弹可贯穿的敌人数(0=命中即消失)
  auto: boolean;         // true=按住连发,false=单发
  ammoType: AmmoType;    // 弹药类型(用于共享备用弹池与自适应补给匹配)
  range: number;         // 子弹最大飞行距离(像素)
  color: number;         // 子弹占位颜色
  projectileRadius?: number; // 弹体碰撞/显示半径，缺省为 4
  infiniteAmmo?: boolean; // 备用弹无限(起始武器保底,防止软锁死)。保留弹匣+换弹节奏,但换弹不扣备用弹
  impactEffect?: EffectDef; // 命中敌人、场景物、障碍或达到射程时触发一次
  /** Spawn a non-explosive area effect when the projectile ends. Used by flame streams. */
  impactLinger?: LingerDef;
  /** Projectile presentation. Combat collision remains shared with ordinary bullets. */
  projectileStyle?: 'bullet' | 'flame';
  /**
   * 改为枪口前方的扇形持续攻击，不再生成弹丸。
   * 配了它以后 `damage` / `bulletSpeed` / `pellets` / `spread` 对战斗不再生效，
   * `impactLinger` 转为扇形内周期性刷新的残留地火。
   */
  coneAttack?: ConeAttackDef;
  /** Automatic weapons can accelerate while the trigger remains held. */
  spinUp?: WeaponSpinUpDef;
  /** 负重对移速的影响；缺省完全不影响机动。 */
  mobility?: WeaponMobilityDef;

  // ——— 爽感机制（爆头资格与倍率显式配置，其余字段可选） ———
  /** 是否允许直接弹丸命中触发爆头；爆炸武器必须显式为 false。 */
  canHeadshot: boolean;
  /** 在角色基础爆头率上增加的百分点，0~0.5。 */
  headshotChanceBonus: number;
  /** 爆头伤害倍率；可爆头武器必须大于 1，不可爆头武器固定为 1。 */
  headshotMultiplier: number;
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
  /** 一次扣除 1 发弹药时生成的齐射组数；每组各生成 `pellets` 颗弹丸。 */
  burstCount?: number;
  /** 按该武器的实际击发次数周期触发额外齐射。 */
  ammoChain?: AmmoChainDef;
  /** 命中后给目标附加短时标记，标记期间后续玩家命中获得伤害倍率。 */
  markOnHit?: MarkOnHitDef;
  /** 对普通感染体造成致死命中时，在死亡位置生成一次额外爆炸。 */
  killExplosion?: EffectDef;
  /** 主命中爆炸后，在固定环形位置生成的次级爆破配置。 */
  impactFragments?: ImpactFragmentsDef;
  /**
   * 换弹方式。`shell` 为逐发填装：每 `reloadTime / magazineSize` 毫秒装 1 发，
   * 开火可随时打断并保留已装填的进度。缺省 `magazine`（整弹匣，必须装完）。
   */
  reloadMode?: 'magazine' | 'shell';
}

export interface AmmoChainDef {
  interval: number;
  bonusBurstCount: number;
  damageFactor: number;
}

export interface MarkOnHitDef {
  duration: number;
  damageFactor: number;
}

export interface ImpactFragmentsDef {
  count: number;
  offset: number;
  damageFactor: number;
  radiusFactor: number;
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
  /** Refresh an equivalent nearby zone instead of stacking another damage source. */
  stackMode?: 'stack' | 'refresh-nearby';
  /** Maximum center distance used by refresh-nearby. Defaults to the smaller radius. */
  refreshDistance?: number;
  /** Fire zones hurt the player by default; weapon flame streams explicitly opt out. */
  damagesPlayer?: boolean;
  /** Fire zones play the ambient loop by default. Short-lived weapon zones can disable it. */
  playLoop?: boolean;
}

export interface EffectDef {
  kind: 'explosion';
  damage: number;      // 爆炸中心瞬时伤害
  radius: number;      // 爆炸半径
  lingering?: LingerDef;
}

// ——— 掉落 ———
interface DropBase {
  chance: number;        // 0~1 掉落概率
}

export type AmmoDropDef =
  | (DropBase & {
    type: 'ammo';
    ammoMode: 'adaptive';
  })
  | (DropBase & {
    type: 'ammo';
    ammoMode: 'fixed';
    ammoType: AmmoType;
    amount: number;
  });

export type DropDef =
  | AmmoDropDef
  | (DropBase & {
    type: 'weapon' | 'item' | 'enhancement_pack';
    itemId?: string;       // type==='item'/'weapon' 时用
    amount?: number;       // 数量
  })
  | (DropBase & {
    type: 'medicine';
    medicineId: MedicineId;
    amount: number;
  });

// ——— 僵尸 ———
export interface ZombieAbilityBase {
  cooldown: number;      // 两次能力执行之间的最短间隔(毫秒)
  windup: number;        // 前摇时长(毫秒)，必须给玩家反应窗口
  recovery: number;      // 执行后的恢复时长(毫秒)
  minRange: number;      // 能力触发最小距离(像素)
  maxRange: number;      // 能力触发最大距离(像素)
  /**
   * 能力执行后的恢复期受伤倍率。缺省为 1；大于 1 时表示攻击后暴露弱点，
   * 玩家与场景物造成的伤害统一享受该倍率。
   */
  recoveryDamageMultiplier?: number;
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
  /**
   * 关卡与无尽模式能否把它作为地图场景物摆放。
   * 与「玩家能否携带」正交：携带资格只由 `carryMax` 决定，
   * 因此油桶既是地图场景物、也能被玩家捡起来重新布置。
   */
  scenePlaceable: boolean;
  trigger: 'onDamage' | 'onProximity' | 'manual';
  health?: number;       // prop 被打爆所需伤害
  proximity?: number;    // 触发半径(地雷)
  chainable: boolean;    // 是否会被其它爆炸连锁引爆
  color: number;         // 占位颜色
  effect: EffectDef;     // 触发后产生的效果
  /** 玩家携带上限。缺省或 0 表示玩家不能携带布置，也不能作为道具掉落。 */
  carryMax?: number;
  radius?: number;       // 占位显示半径
}

// ——— 关卡 ———
export interface WaveEnemyEntry {
  type: ZombieId;
  count: number;
}

/** 无尽模式的十波章节节奏类型。 */
export type EndlessWaveKind =
  | 'warmup'
  | 'assault'
  | 'supply'
  | 'swarm'
  | 'elite'
  | 'tactical'
  | 'climax'
  | 'boss';

/**
 * 无尽波次的玩家可读信息。
 *
 * 波次生成与 HUD/公告必须共用这份数据，避免玩法已经切成事件波，界面仍只显示
 * 一句无法区分内容的“敌群继续逼近”。
 */
export interface EndlessWaveMeta {
  kind: EndlessWaveKind;
  chapter: number;
  chapterWave: number;
  label: string;
  title: string;
  subtitle: string;
  accent: number;
  bossId?: ZombieId;
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
  /** 仅无尽模式生成的波次携带；固定关卡保持缺省。 */
  endless?: EndlessWaveMeta;
} & (
  | { enemies: WaveEnemyEntry[]; spawnInterval: number; segments?: never }
  | { segments: WaveSegmentDef[]; enemies?: never; spawnInterval?: never }
);

export type WaveRewardDef =
  | { type: 'weapon'; weaponId: string; ammo: number }
  | { type: 'enhancement' }
  /** 按当前编队中各弹种最大弹匣补充备用弹，避免给玩家不存在的固定弹种。 */
  | { type: 'resupply'; magazines: number }
  | { type: 'medicine'; medicineId: MedicineId; amount: number }
  | { type: 'item'; itemId: string; amount: number };

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
    setBurstCount?: number;     // 一次击发形成多组齐射，但只消耗 1 发弹药
    setAmmoChain?: AmmoChainDef; // 每隔固定击发次数触发额外齐射
    setMarkOnHit?: MarkOnHitDef; // 命中后附加短时伤害标记
    setKillExplosion?: EffectDef; // 普通感染体致死命中触发额外爆炸
    setImpactFragments?: ImpactFragmentsDef; // 主爆炸后生成固定环形次级爆破

    // 加法修正
    addSpread?: number;         // e.g., -5 (减少5度散射)
    addPenetration?: number;    // e.g., 2 (在原有穿透基础上再加2)

    // 命中爆炸修正(仅对配置了 impactEffect 的武器生效)
    addExplosionRadius?: number;    // e.g., 50 (爆炸半径增加50像素)
    explosionDamageFactor?: number; // e.g., 1.6 (爆炸伤害变为160%)
    setImpactLingering?: LingerDef; // e.g., 爆炸后留下燃烧区域

    // 扇形攻击修正(仅对配置了 coneAttack 的武器生效)
    coneDamageFactor?: number; // e.g., 1.3 (扇形每秒伤害变为130%)
    coneRangeFactor?: number;  // e.g., 1.25 (扇形射程增加25%)
    coneAngleFactor?: number;  // e.g., 1.4 (扇形张角增加40%)
    setConeLinger?: LingerDef; // 改造扇形喷出的残留地火(时长/半径/每跳伤害)
  }
}
