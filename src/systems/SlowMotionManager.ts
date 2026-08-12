import Phaser from 'phaser';
import {
  canTriggerSlowMotion,
  resolveSlowMotion,
  type FeedbackTier,
  type SlowMotionSpec,
} from './FeedbackRules';

/** 一次慢动作结束后，同级及以下请求需要等待的冷却毫秒。 */
const SLOW_MOTION_COOLDOWN = 5000;

/**
 * 慢动作统一入口。
 *
 * 实现上只缩放 `physics.world.timeScale` 与 `anims.globalTimeScale`，
 * **不动 `scene.time.*` 和 `scene.tweens.*`**。原因见执行文档 §4.1：
 * 武器冷却、敌人能力和波次全部基于 `time.now` 的绝对时间点，而 `time.now`
 * 不受 `timeScale` 影响；一旦去缩放场景时钟，就会出现"画面慢了但技能照常结算"，
 * 还要再写一套平移补偿。只缩放物理与动画可以完全绕开既有计时链路。
 *
 * 恢复走 `scene.time.delayedCall`：战场冻结时 `time.timeScale = 0` 会自动挂起该回调，
 * 暂停期间不消耗慢动作时长，与既有暂停语义一致。
 */
export class SlowMotionManager {
  private readonly scene: Phaser.Scene;
  private activePriority: number | null = null;
  private cooldownUntil = -Infinity;
  private restoreEvent: Phaser.Time.TimerEvent | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.reset();
  }

  /** 按反馈档位请求慢动作；B/C 档不配置慢动作，直接忽略。 */
  requestByTier(tier: FeedbackTier, now: number): boolean {
    const spec = resolveSlowMotion(tier);
    if (!spec) return false;
    return this.request(spec, now);
  }

  request(spec: SlowMotionSpec, now: number): boolean {
    if (!canTriggerSlowMotion(spec, now, this.cooldownUntil, this.activePriority)) return false;

    this.restoreEvent?.remove(false);
    this.activePriority = spec.priority;
    // Arcade 的 world.timeScale 是除数语义：值越大越慢，与 anims 的乘数语义相反。
    this.scene.physics.world.timeScale = 1 / spec.scale;
    this.scene.anims.globalTimeScale = spec.scale;

    this.restoreEvent = this.scene.time.delayedCall(spec.duration, () => {
      this.restoreEvent = null;
      this.activePriority = null;
      this.cooldownUntil = this.scene.time.now + SLOW_MOTION_COOLDOWN;
      this.applyNormalSpeed();
    });
    return true;
  }

  /** 场景创建与关闭时复位，避免慢动作跨局残留。 */
  reset(): void {
    this.restoreEvent?.remove(false);
    this.restoreEvent = null;
    this.activePriority = null;
    this.cooldownUntil = -Infinity;
    this.applyNormalSpeed();
  }

  private applyNormalSpeed(): void {
    // Phaser 的 SHUTDOWN 事件可能在 Arcade World 已销毁后才调用场景清理。
    // 此时 `physics.world` 已被置空，复位只能跳过物理倍率；动画管理器仍属于 Game，必须恢复。
    const world = this.scene.physics?.world;
    if (world) world.timeScale = 1;
    this.scene.anims.globalTimeScale = 1;
  }
}
