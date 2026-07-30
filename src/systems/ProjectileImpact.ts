import type { EffectDef } from '../config/types';

/** 爆炸弹命中效果的单次消费容器，防止同一弹体在多条碰撞回调中重复结算。 */
export class ProjectileImpact {
  private effect: EffectDef | null = null;

  reset(effect?: EffectDef): void {
    this.effect = effect ?? null;
  }

  consume(): EffectDef | null {
    const effect = this.effect;
    this.effect = null;
    return effect;
  }
}
