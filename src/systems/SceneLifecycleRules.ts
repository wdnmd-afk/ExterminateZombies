/**
 * 场景解除暂停时的物理恢复契约。
 *
 * shutdown 阶段 Arcade World 可能已经被 Phaser 销毁；此时只能复位场景
 * 自身的时钟，不能再调用 resume 或平移战斗计时。将判断抽成纯函数，便于
 * 在 Node 测试环境锁定生命周期边界，而不加载浏览器专属的 Phaser 设备探测。
 */
export interface PausablePhysicsWorld {
  resume: () => void;
}

export function resumePhysicsAfterPause(
  world: PausablePhysicsWorld | null | undefined,
  now: number,
  frozenAt: number,
  shiftBattleTimers: (offset: number) => void,
): boolean {
  if (!world) return false;
  world.resume();
  shiftBattleTimers(now - frozenAt);
  return true;
}

