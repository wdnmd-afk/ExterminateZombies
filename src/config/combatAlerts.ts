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
    subtitle: `${bossName} · 危险动作即将执行`,
    tone: 'danger',
    priority: ALERT_PRIORITY.danger,
    // 警报的完整入场、停留和退场时长与真实前摇一致，避免文字比危险区提前消失。
    duration: ability.windup,
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
