import Phaser from 'phaser';
import { DEPTH } from '../constants';
import {
  isEmphasizedDamage,
  resolveDamageNumberAdmission,
  type DamageNumberKind,
} from './FeedbackRules';

interface DamageNumberStyle {
  color: string;
  stroke: string;
  /** 相对基准字号的倍率。 */
  scale: number;
}

const BASE_FONT_SIZE = 26;

/**
 * 分色分级样式。
 * 强调类使用 2 倍字号与高对比描边，确保在高密度战斗里仍然一眼可辨。
 */
const STYLES: Record<DamageNumberKind, DamageNumberStyle> = {
  normal: { color: '#ffffff', stroke: '#0f0e13', scale: 1 },
  critical: { color: '#ffd54a', stroke: '#3a2600', scale: 2 },
  execute: { color: '#ff5b45', stroke: '#3a0b06', scale: 2 },
  pierce: { color: '#ffab3d', stroke: '#3a1d00', scale: 1.35 },
  explosion: { color: '#ff8a4c', stroke: '#3a1400', scale: 1.2 },
};

/**
 * 伤害数字管理器。
 *
 * 走对象池复用 Text，避免高密度战斗每帧 new 造成 GC 抖动；
 * 并发上限与降级策略见 `FeedbackRules.resolveDamageNumberAdmission`。
 */
export class DamageNumberManager {
  private readonly scene: Phaser.Scene;
  private readonly pool: Phaser.GameObjects.Text[] = [];
  /** 按加入顺序记录存活项，硬上限触发时回收队首。 */
  private readonly active: Phaser.GameObjects.Text[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /** 当前存活的伤害数字数量。供性能压测读取活跃对象统计。 */
  get activeCount(): number {
    return this.active.length;
  }

  show(x: number, y: number, amount: number, kind: DamageNumberKind = 'normal'): void {
    const admission = resolveDamageNumberAdmission(kind, this.active.length);
    if (admission === 'skip') return;
    if (admission === 'recycle') this.recycleOldest();

    const style = STYLES[kind];
    const text = this.acquire();

    text.setText(`${Math.round(amount)}`);
    text.setColor(style.color);
    text.setStroke(style.stroke, 5);
    text.setFontSize(BASE_FONT_SIZE * style.scale);
    // 同一位置的连续命中会完全重叠，横向抖开才能看清连续输出。
    text.setPosition(x + Phaser.Math.Between(-10, 10), y - 12);
    text.setOrigin(0.5, 1);
    text.setAlpha(1);
    text.setScale(isEmphasizedDamage(kind) ? 0.6 : 1);
    text.setActive(true);
    text.setVisible(true);
    this.active.push(text);

    this.scene.tweens.killTweensOf(text);
    // 强调类先弹出再飘走，普通伤害直接飘走，避免每一发都抢注意力。
    if (isEmphasizedDamage(kind)) {
      this.scene.tweens.add({
        targets: text,
        scale: 1,
        duration: 130,
        ease: 'Back.Out',
      });
    }
    this.scene.tweens.add({
      targets: text,
      y: text.y - (isEmphasizedDamage(kind) ? 58 : 38),
      alpha: 0,
      duration: isEmphasizedDamage(kind) ? 760 : 520,
      ease: 'Cubic.Out',
      onComplete: () => this.release(text),
    });
  }

  /**
   * 展示文字而不是数值的场合，例如 M4A1 的穿透计数 `×4 PIERCE!`。
   * 与 `show` 共用同一套池、样式和降级预算。
   */
  showLabel(x: number, y: number, label: string, kind: DamageNumberKind): void {
    const admission = resolveDamageNumberAdmission(kind, this.active.length);
    if (admission === 'skip') return;
    if (admission === 'recycle') this.recycleOldest();

    const style = STYLES[kind];
    const text = this.acquire();
    text.setText(label);
    text.setColor(style.color);
    text.setStroke(style.stroke, 5);
    text.setFontSize(BASE_FONT_SIZE * style.scale);
    text.setPosition(x, y - 12);
    text.setOrigin(0.5, 1);
    text.setAlpha(1);
    text.setScale(0.6);
    text.setActive(true);
    text.setVisible(true);
    this.active.push(text);

    this.scene.tweens.killTweensOf(text);
    this.scene.tweens.add({ targets: text, scale: 1, duration: 130, ease: 'Back.Out' });
    this.scene.tweens.add({
      targets: text,
      y: text.y - 58,
      alpha: 0,
      duration: 760,
      ease: 'Cubic.Out',
      onComplete: () => this.release(text),
    });
  }

  destroy(): void {
    for (const text of [...this.active, ...this.pool]) {
      this.scene.tweens.killTweensOf(text);
      text.destroy();
    }
    this.active.length = 0;
    this.pool.length = 0;
  }

  private acquire(): Phaser.GameObjects.Text {
    const pooled = this.pool.pop();
    if (pooled) return pooled;

    const text = this.scene.add.text(0, 0, '', {
      fontFamily: 'Impact, "Arial Black", sans-serif',
      fontSize: `${BASE_FONT_SIZE}px`,
      color: '#ffffff',
    });
    text.setDepth(DEPTH.damageNumber);
    return text;
  }

  private recycleOldest(): void {
    const oldest = this.active[0];
    if (!oldest) return;
    this.scene.tweens.killTweensOf(oldest);
    this.release(oldest);
  }

  private release(text: Phaser.GameObjects.Text): void {
    const index = this.active.indexOf(text);
    if (index >= 0) this.active.splice(index, 1);
    text.setActive(false);
    text.setVisible(false);
    this.pool.push(text);
  }
}
