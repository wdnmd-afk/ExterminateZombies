import type { ZombieAbilityDef } from './types';

export type CombatAlertTone = 'status' | 'warning' | 'danger';

export interface CombatAlert {
  key: string;
  title: string;
  subtitle: string;
  tone: CombatAlertTone;
  priority: number;
  duration: number;
}

const ALERT_PRIORITY: Record<CombatAlertTone, number> = {
  status: 10,
  warning: 20,
  danger: 30,
};

const BOSS_ABILITY_LABELS: Record<ZombieAbilityDef['kind'], string> = {
  shockwave: '震荡冲击蓄力',
  bombard: '区域轰炸锁定',
  dash: '定向冲锋蓄力',
  ranged: '远程攻击蓄力',
  countershot: '可击返爆弹蓄力',
  volley: '多重弹幕齐射',
  barrage: '饱和轰炸覆盖',
  summon: '母巢召唤中',
};

export function createEmptyAmmoAlert(hasReserve: boolean): CombatAlert {
  return {
    key: 'weapon-empty',
    title: '弹匣耗尽',
    subtitle: hasReserve ? '自动换弹已启动' : '当前没有可用备用弹药',
    tone: 'warning',
    priority: ALERT_PRIORITY.warning,
    duration: 1300,
  };
}

export function createBossAbilityAlert(
  bossName: string,
  ability: ZombieAbilityDef,
): CombatAlert {
  return {
    key: `boss-ability-${ability.kind}`,
    title: BOSS_ABILITY_LABELS[ability.kind],
    subtitle: ability.kind === 'countershot'
      ? `${bossName} · 射击标记核心可反打，或侧移躲避`
      : `${bossName} · 危险动作即将执行`,
    tone: 'danger',
    priority: ALERT_PRIORITY.danger,
    // 警报的完整入场、停留和退场时长与真实前摇一致，避免文字比危险区提前消失。
    duration: ability.windup,
  };
}

/** 可破坏障碍的短时状态提示；不占用常驻 HUD，也不依赖颜色单独传达状态。 */
export function createObstacleAlert(
  obstacleId: string,
  stage: 'cracked' | 'collapsed',
): CombatAlert {
  const collapsed = stage === 'collapsed';
  return {
    key: `obstacle-${obstacleId}-${stage}`,
    title: collapsed ? 'GATE BREACHED' : 'WALL CRACKED',
    subtitle: collapsed ? '缺口已打开 · 立即换位' : '危墙受损 · 可继续压制',
    tone: collapsed ? 'status' : 'warning',
    priority: collapsed ? ALERT_PRIORITY.warning : ALERT_PRIORITY.status,
    duration: collapsed ? 1200 : 800,
  };
}

/** 低优先级事件不得打断正在显示的高优先级危险；同 key 允许刷新剩余时长。 */
export function shouldPresentCombatAlert(
  current: Pick<CombatAlert, 'key' | 'priority'> | null,
  incoming: CombatAlert,
): boolean {
  if (!current || current.key === incoming.key) return true;
  return incoming.priority >= current.priority;
}
