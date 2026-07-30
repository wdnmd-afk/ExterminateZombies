/** 所有配置表的类型定义集中于此,配置文件从这里 import type。 */

import type { ZombieId } from './zombies';

export type AmmoType = 'light' | 'heavy' | 'shell' | 'explosive';

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
  type: 'ammo' | 'weapon' | 'item' | 'health';
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
export interface WaveDef {
  enemies: Array<{ type: ZombieId; count: number }>;
  spawnInterval: number; // 同波内两只之间生成间隔(毫秒)
  startDelay: number;    // 进入本波后的准备时间(毫秒)
}

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
  props: PropPlacement[];
  obstacles?: ObstaclePlacement[];
  waves: WaveDef[];
  boss: { type: ZombieId } | null;
}
