import type { CharacterId } from './characters';
import type { WeaponId } from './weapons';
import type { ZombieId } from './zombies';
import { GAME_HEIGHT, GAME_WIDTH } from '../constants';

/**
 * 通道模式配置。
 *
 * 与狂潮（`config/frenzy.ts`）同一套「配置 + 纯规则 + 战场编排」结构。
 * 全部调参旋钮集中在这里：真人验收时觉得难度不对，只需要改这一份文件。
 */
export const CORRIDOR_VERSION = 'lane-v1';

/**
 * 单通道同屏上限。主通道是唯一的行军走廊,40 只已经能把 240px 的通道带
 * 排成连续尸墙;取狂潮 80 的一半,因为达成突破只需要一只漏网。
 */
export const CORRIDOR_ENEMY_CAP = 40;

export const CORRIDOR_PRESET_IDS = ['pistol', 'shotgun', 'rifle'] as const;
export type CorridorPresetId = typeof CORRIDOR_PRESET_IDS[number];

export interface CorridorPreset {
  id: CorridorPresetId;
  name: string;
  description: string;
  characterId: CharacterId;
  weaponId: WeaponId;
  enhancements: readonly string[];
}

export const CORRIDOR_PRESETS: Record<CorridorPresetId, CorridorPreset> = {
  pistol: {
    id: 'pistol', name: '精准守门', description: '沙漠之鹰 · 单发高爆头 · 无限弹药',
    characterId: 'watcher', weaponId: 'pistol',
    enhancements: ['pistol_magnum'],
  },
  shotgun: {
    id: 'shotgun', name: '霰弹封廊', description: 'SPAS-12 · 十二弹丸封住通道 · 逐发装填',
    characterId: 'breacher', weaponId: 'shotgun',
    enhancements: ['shotgun_drum_mag'],
  },
  rifle: {
    id: 'rifle', name: '穿透封锁', description: 'M4A1 · 穿透弹道打穿纵队 · 技能回复能量',
    characterId: 'eagle_eye', weaponId: 'rifle',
    enhancements: ['rifle_heavy_barrel'],
  },
};

export function isCorridorPresetId(value: unknown): value is CorridorPresetId {
  return typeof value === 'string' && CORRIDOR_PRESET_IDS.some((id) => id === value);
}

/**
 * 三条横向通道,各占 240px 带。120/360/600 的中心让僵尸群避开
 * 世界边界 20px 带与 HUD 底部危险渐变,读数线不复用铁轨美术。
 */
export const CORRIDOR_LANE = {
  item: { centerY: 120, top: 0, bottom: 240 },
  main: { centerY: 360, top: 240, bottom: 480 },
  ally: { centerY: 600, top: 480, bottom: 720 },
} as const;

export type CorridorLaneId = keyof typeof CORRIDOR_LANE;

/** 玩家柱位:x 被钳在这个区间,y 跨三条通道自由。 */
export const CORRIDOR_COLUMN = { minX: 96, maxX: 240, spawnX: 120, spawnY: CORRIDOR_LANE.main.centerY } as const;

/** 把任意 x 收进柱位区间;钳制逻辑抽成纯函数,便于单测与 HUD/探针复用。 */
export function clampCorridorColumnX(x: number): number {
  if (!Number.isFinite(x)) return CORRIDOR_COLUMN.spawnX;
  return Math.min(CORRIDOR_COLUMN.maxX, Math.max(CORRIDOR_COLUMN.minX, x));
}

/**
 * 突破线。必须严格小于柱位 minX:玩家永远无法站进「漏怪判距带」里堵门,
 * 该不变量由 tests/corridor-rules.test.ts 钉死。
 */
export const CORRIDOR_BREACH_X = 72;

/** 主通道刷怪位:右缘画布外。 */
export const CORRIDOR_SPAWN_X = GAME_WIDTH + 24;
/** 刷怪 y 相对通道中心的抖动半径。 */
export const CORRIDOR_BAND_JITTER = 70;
/** 漂移卡片飘出画布左侧多少像素后判定失踪。 */
export const CORRIDOR_CARD_CULL_X = -70;

// ——— 漂移卡片 ———

export type CorridorCardKind = 'projectile' | 'weapon' | 'damage' | 'supply' | 'ally';

export interface CorridorCardDef {
  kind: CorridorCardKind;
  /** 卡面标题与一句话效果说明。 */
  title: string;
  subtitle: string;
  /** 打死需要的伤害。手枪单发 50,2-3 枪击破是设计节奏。 */
  hp: number;
  /** 右→左漂移速度(px/s)。 */
  driftSpeed: number;
  /** 击破加分。 */
  scoreBonus: number;
  accent: number;
}

export const CORRIDOR_CARDS: Record<CorridorCardKind, CorridorCardDef> = {
  projectile: {
    kind: 'projectile', title: '弹道增幅', subtitle: '每轮齐射 +1 弹',
    hp: 110, driftSpeed: 46, scoreBonus: 150, accent: 0xffb74d,
  },
  weapon: {
    kind: 'weapon', title: '武器补给', subtitle: '随机编入一把新武器',
    hp: 140, driftSpeed: 42, scoreBonus: 200, accent: 0xfbc02d,
  },
  damage: {
    kind: 'damage', title: '火力强化', subtitle: '伤害 ×1.25 · 可叠两层',
    hp: 120, driftSpeed: 46, scoreBonus: 150, accent: 0xef725f,
  },
  supply: {
    kind: 'supply', title: '应急补给', subtitle: '补给 3 弹匣 · 绷带',
    hp: 90, driftSpeed: 50, scoreBonus: 100, accent: 0x65c694,
  },
  ally: {
    kind: 'ally', title: '队友支援', subtitle: '叫一名队友上场',
    hp: 90, driftSpeed: 56, scoreBonus: 250, accent: 0x8fe8ff,
  },
};

/** 道具通道的抽取池(均匀抽取);ally 卡走队友通道,不进这个池。 */
export const CORRIDOR_ITEM_CARD_POOL: readonly CorridorCardKind[] = ['projectile', 'weapon', 'damage', 'supply'];

/** 武器补给卡的可发放池:正式表里全部弹药类型齐备,排除预设三枪与手枪。 */
export const CORRIDOR_WEAPON_REWARD_POOL: readonly WeaponId[] = [
  'smg', 'ak47', 'rpg', 'tesla', 'railgun', 'm16a4', 'gatling', 'aa12',
];

export const CORRIDOR_MAX_BONUS_PROJECTILES = 3;
export const CORRIDOR_MAX_DAMAGE_STACKS = 2;
export const CORRIDOR_MAX_ALLIES = 3;

// ——— 漂移卡片投放节奏(elapsedMs 域) ———

export const CORRIDOR_ITEM_CARD_FIRST_AT_MS = 15_000;
export const CORRIDOR_ITEM_CARD_INTERVAL_MS = 22_000;
export const CORRIDOR_ALLY_CARD_FIRST_AT_MS = 25_000;
export const CORRIDOR_ALLY_CARD_INTERVAL_MS = 31_000;

// ——— 主通道僵尸阶段表 ———

/**
 * 尸潮压力随时间升级。早期刻意宽松:第三阶段(90 秒)之前没有冲刺型,
 * 玩家有完整的一分半钟熟悉「守主通道 / 拦漂移卡」的双线节奏。
 * 权重和必须为 1(测试钉死)。
 */
export interface CorridorPhase {
  name: string;
  fromMs: number;
  intervalMs: number;
  batchSize: number;
  weights: Readonly<Record<string, number>>;
}

export const CORRIDOR_PHASES: readonly CorridorPhase[] = [
  {
    name: '行军', fromMs: 0, intervalMs: 3200, batchSize: 1,
    weights: { walker: 1 },
  },
  {
    name: '渗透', fromMs: 30_000, intervalMs: 2500, batchSize: 2,
    weights: { walker: 0.65, drifter: 0.35 },
  },
  {
    name: '快袭', fromMs: 90_000, intervalMs: 2100, batchSize: 2,
    weights: { walker: 0.4, drifter: 0.25, runner: 0.2, bomber: 0.15 },
  },
  {
    name: '压制', fromMs: 150_000, intervalMs: 1800, batchSize: 3,
    weights: { walker: 0.2, runner: 0.25, drifter: 0.2, bloodied: 0.2, bomber: 0.15 },
  },
  {
    name: '精锐', fromMs: 240_000, intervalMs: 1600, batchSize: 3,
    weights: { runner: 0.2, bloodied: 0.2, headless: 0.2, drifter: 0.15, tank: 0.1, bloater: 0.05, bomber: 0.1 },
  },
  {
    name: '狂潮', fromMs: 360_000, intervalMs: 1400, batchSize: 4,
    weights: {
      runner: 0.25, crawler: 0.15, stalker: 0.2, walker: 0.15,
      bloodied: 0.1, headless: 0.05, tank: 0.05, bloater: 0.05,
    },
  },
];

/** 涌浪:第 120 秒起每 60 秒一波密集行军,给冲分的玩家制造高风险收割窗口。 */
export const CORRIDOR_SURGE_START_MS = 120_000;
export const CORRIDOR_SURGE_INTERVAL_MS = 60_000;
export const CORRIDOR_SURGE_COUNT = 8;
export const CORRIDOR_SURGE_GAP_MS = 180;

/** 血量随时间上涨:每 180 秒 +20%,上限 2 倍,只作用于新刷出的实例。 */
export function getCorridorHealthScaling(elapsedMs: number): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return 1;
  const steps = Math.floor(elapsedMs / 180_000);
  return Math.min(2, 1 + 0.2 * steps);
}

/** 结算时的存活奖励:活过一秒记 2 分,把「活多久」也计入总分。 */
export const CORRIDOR_SURVIVAL_SCORE_PER_SECOND = 2;

/** 队友属性(集中在这里,调难度不必翻 Ally 实现)。 */
export const CORRIDOR_ALLY = {
  damage: 24,
  fireIntervalMs: 800,
  range: 1050,
  bulletSpeed: 950,
  bulletRadius: 4,
  color: 0x8fe8ff,
} as const;

export function isCorridorZombieKind(value: string): value is ZombieId {
  return Boolean(ZOMBIE_KIND_SET[value]);
}

const ZOMBIE_KIND_SET: Record<string, true> = {
  walker: true, runner: true, tank: true, bomber: true, drifter: true,
  bloodied: true, headless: true, bloater: true, crawler: true, stalker: true,
};

/** 结算画布内可能出现的目标 y 上限,供测试与校验避免越界配置。 */
export function assertCorridorLaneBounds(): boolean {
  return CORRIDOR_LANE.ally.bottom === GAME_HEIGHT && CORRIDOR_LANE.item.top === 0
    && CORRIDOR_SPAWN_X > GAME_WIDTH;
}
