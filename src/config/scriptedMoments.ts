import type { ItemId } from './items';
import type { NormalZombieId } from './zombies';

/**
 * 剧本时刻。
 *
 * 依据 `docs/design/FUN_FIRST_DESIGN.md` §4：一个关卡必须有若干个玩家会记住的
 * 「哦！」时刻，而这些时刻要写进配置刻意制造，不能指望随机掉落或随机刷怪凑出来。
 *
 * 每个时刻在一局内最多触发一次。触发判定是纯函数（`systems/ScriptedMomentRules.ts`），
 * 实际生成与播报由 `systems/ScriptedMomentSystem.ts` 执行。
 */

export type MomentTrigger =
  /** 本局第一次击杀。 */
  | { kind: 'firstKill' }
  /** 指定阶段的指定段落开始生成时（两者均为 0 起始索引）。 */
  | { kind: 'segmentStart'; wave: number; segment: number }
  /** 玩家生命比例跌破阈值，且已推进到 `minWave` 阶段（1 起始）。 */
  | { kind: 'healthBelow'; ratio: number; minWave: number };

/** 在指定坐标列队生成，用来制造可被一枪贯穿的靶列或包夹阵型。 */
export interface MomentFormationAction {
  kind: 'formation';
  type: NormalZombieId;
  points: ReadonlyArray<{ x: number; y: number }>;
}

/** 以玩家为圆心环形生成。半径必须留出反应窗口，不能贴身刷。 */
export interface MomentRingAction {
  kind: 'ring';
  type: NormalZombieId;
  count: number;
  radius: number;
}

/** 临时铺设战术场景物，用来制造连锁爆炸走廊这类机会。 */
export interface MomentPropsAction {
  kind: 'props';
  itemId: ItemId;
  points: ReadonlyArray<{ x: number; y: number }>;
  minPlayerDistance?: number;
}

export type MomentAction = MomentFormationAction | MomentRingAction | MomentPropsAction;

export interface ScriptedMomentDef {
  id: string;
  levelId: string;
  trigger: MomentTrigger;
  /** 播报文案。时刻必须让玩家知道「发生了什么」，否则再精心的编排也读不出来。 */
  announce?: { title: string; subtitle: string; accent: number };
  actions?: MomentAction[];
}

/**
 * 中央维修通道上的连锁爆炸走廊。
 * 通道本身保持开阔（见 `levels.ts` 障碍布局），因此这排油桶既是机会也是风险：
 * 引爆能一次清掉整段推进的敌群，站错位置也会把自己炸掉。
 */
const BARREL_GAUNTLET_POINTS = [
  { x: 430, y: 360 },
  { x: 540, y: 360 },
  { x: 650, y: 360 },
  { x: 760, y: 360 },
  { x: 870, y: 360 },
] as const;

/**
 * 穿透靶列：沿中央通道横向列队，玩家从通道另一端可以一枪贯穿整列。
 * 间距 52px 略大于分离力的最小间距（14+14+12=40），队形能维持一两秒的开火窗口，
 * 之后会被分离力和追击自然打散——这正是「窗口」的含义。
 */
const PIERCE_LINE_POINTS = Array.from({ length: 8 }, (_, index) => ({
  x: 880 + index * 52,
  y: 360,
}));

export const SCRIPTED_MOMENTS: readonly ScriptedMomentDef[] = [
  ...[
    { levelId: 'level_3', name: 'wall_fuses', title: '拆墙引信', subtitle: '两侧危墙旁有油桶 · 拉开距离后手动引爆', itemId: 'barrel_oil', points: [{ x: 290, y: 300 }, { x: 990, y: 300 }] },
    { levelId: 'level_3', name: 'dust_exit', title: '断线撤离', subtitle: '南侧与东侧面粉桶 · 引爆粉尘阻断追兵', itemId: 'barrel_flour', points: [{ x: 260, y: 530 }, { x: 980, y: 420 }] },
    { levelId: 'level_4', name: 'channel_relief', title: '渠口减压', subtitle: '左右渠口面粉桶 · 先遮断高速敌群', itemId: 'barrel_flour', points: [{ x: 330, y: 360 }, { x: 950, y: 360 }] },
    { levelId: 'level_4', name: 'crossfire', title: '交叉火线', subtitle: '两端油桶已布置 · 拉出敌群再回身点火', itemId: 'barrel_oil', points: [{ x: 460, y: 170 }, { x: 820, y: 550 }] },
    { levelId: 'level_5', name: 'staggered_charge', title: '错位冲刺', subtitle: '中场两侧面粉桶 · 用粉尘切开冲锋路线', itemId: 'barrel_flour', points: [{ x: 470, y: 360 }, { x: 810, y: 320 }] },
    { levelId: 'level_5', name: 'flank_fire', title: '侧翼燃带', subtitle: '南侧油桶可引爆 · 将追兵带向侧翼', itemId: 'barrel_oil', points: [{ x: 400, y: 580 }, { x: 900, y: 580 }] },
    { levelId: 'level_6', name: 'cargo_blast', title: '卸货爆破', subtitle: '北侧两翼油桶 · 等重装进入爆炸范围', itemId: 'barrel_oil', points: [{ x: 380, y: 230 }, { x: 900, y: 230 }] },
    { levelId: 'level_6', name: 'cargo_cover', title: '货道粉尘', subtitle: '南侧面粉桶 · 手动引爆后换弹撤离', itemId: 'barrel_flour', points: [{ x: 480, y: 630 }, { x: 800, y: 630 }] },
    { levelId: 'level_7', name: 'rubble_fuses', title: '碎墙燃线', subtitle: '北侧碎墙间油桶 · 聚怪后手动引爆', itemId: 'barrel_oil', points: [{ x: 400, y: 280 }, { x: 880, y: 280 }] },
    { levelId: 'level_7', name: 'covered_breakout', title: '遮蔽突围', subtitle: '南侧面粉桶 · 留出避让距离再引爆', itemId: 'barrel_flour', points: [{ x: 480, y: 550 }, { x: 820, y: 550 }] },
  ].map((entry, index): ScriptedMomentDef => ({
    id: `${entry.levelId}_${entry.name}`, levelId: entry.levelId,
    trigger: { kind: 'segmentStart', wave: index % 2 === 0 ? 1 : 2, segment: index % 2 === 0 ? 0 : 1 },
    announce: { title: entry.title, subtitle: `${entry.subtitle} · 近身点不投放`, accent: entry.itemId === 'barrel_oil' ? 0xff8a4c : 0x8fd3ff },
    actions: [{ kind: 'props', itemId: entry.itemId as ItemId, points: entry.points, minPlayerDistance: 180 }],
  })),
  {
    id: 'level_2_first_blood',
    levelId: 'level_2',
    trigger: { kind: 'firstKill' },
    announce: {
      title: 'FIRST BLOOD',
      subtitle: '废车站已进入交战状态',
      accent: 0xfbc02d,
    },
  },
  {
    id: 'level_2_barrel_gauntlet',
    levelId: 'level_2',
    // 阶段二第 3 个段落是「喘息 + 首次精英」：长静默期间铺好油桶，
    // 随后推进的坦克与敌群正好走进走廊。
    trigger: { kind: 'segmentStart', wave: 1, segment: 2 },
    announce: {
      title: 'FUEL LINE',
      subtitle: '维修通道已铺满油桶 · 小心连锁',
      accent: 0xff6f4a,
    },
    actions: [
      { kind: 'props', itemId: 'barrel_oil', points: BARREL_GAUNTLET_POINTS },
    ],
  },
  {
    id: 'level_2_pierce_line',
    levelId: 'level_2',
    // 阶段三第 2 个段落是「重装推进」：此时玩家已拿到 M4A1，靶列给出穿透高光机会。
    trigger: { kind: 'segmentStart', wave: 2, segment: 1 },
    announce: {
      title: 'COLUMN INBOUND',
      subtitle: '敌群列队推进 · 对准通道一次贯穿',
      accent: 0xffab3d,
    },
    actions: [
      { kind: 'formation', type: 'walker', points: PIERCE_LINE_POINTS },
    ],
  },
  {
    id: 'level_2_last_stand',
    levelId: 'level_2',
    // 只在终局阶段生效：更早触发会在玩家还没拿到全部武器时变成单纯的惩罚。
    trigger: { kind: 'healthBelow', ratio: 0.3, minWave: 3 },
    announce: {
      title: 'LAST STAND',
      subtitle: '被包夹 —— 用粉尘或霰弹打开缺口',
      accent: 0xef4b3a,
    },
    actions: [
      // 半径 420 给足反应时间；只放 4 只，让它成为高光而不是处刑。
      { kind: 'ring', type: 'runner', count: 4, radius: 420 },
    ],
  },
];

export function getScriptedMoments(levelId: string | null): ScriptedMomentDef[] {
  if (!levelId) return [];
  return SCRIPTED_MOMENTS.filter((moment) => moment.levelId === levelId);
}
