import Phaser from 'phaser';

/**
 * 文本排版助手。
 *
 * Phaser 的行高来自 `MeasureText` 实测的 ascent+descent（见 GetTextSize.js:
 * `lineHeight = size.fontSize + strokeThickness`），而不是样式里写的 fontSize。
 * 普惠体的 win 量度是 1.4em，之前的方舟像素体是 1.3333em，系统兜底黑体又是另一个值；
 * 同一个 '26px' 在三者下的实际行高各不相同。因此任何把行 y 写成魔法数字的面板，
 * 一旦字体量度变化就会互相压字。
 *
 * 这里的做法是：先建好 Text，再按实测高度自上而下堆叠，让布局跟随字体自适应。
 */

/** 参与堆叠的一行：文本行按实测高度占位，间隔行只占固定高度。 */
export type LayoutRow =
  | { kind: 'text'; text: Phaser.GameObjects.Text; maxWidth?: number }
  | { kind: 'spacer'; height: number };

export interface StackOptions {
  /** 首行顶边的 y 坐标。 */
  top: number;
  /** 相邻行之间的额外留白。 */
  gap?: number;
}

/** 便捷构造器，避免调用点写满 `{ kind: 'text' }`。 */
export function textRow(text: Phaser.GameObjects.Text, maxWidth?: number): LayoutRow {
  return { kind: 'text', text, maxWidth };
}

export function spacerRow(height: number): LayoutRow {
  return { kind: 'spacer', height };
}

/**
 * 把若干行按实测高度自上而下排布，返回内容总高度。
 *
 * 每行的 y 只取决于「本行之前所有行的未缩放高度」，所以 `fitTextWidth` 造成的
 * 缩放不会让后续行上下跳动 —— 刷新文案时行位保持稳定。
 *
 * 要求各行 originY 为 0（顶对齐）；originX 不受影响，左右对齐都能用。
 */
export function stackRows(rows: LayoutRow[], options: StackOptions): number {
  const gap = options.gap ?? 0;
  let cursor = options.top;

  rows.forEach((row, index) => {
    if (index > 0) cursor += gap;

    if (row.kind === 'spacer') {
      cursor += row.height;
      return;
    }

    row.text.setY(cursor);
    if (row.maxWidth !== undefined) {
      fitTextWidth(row.text, row.maxWidth);
    }
    cursor += row.text.height;
  });

  return cursor - options.top;
}

/**
 * 内容超出可用宽度时等比缩小，未超出则保持 1 倍。
 *
 * 只缩不放，所以正常长度的文案永远是原始字号；仅在武器名过长、得分位数变多这类
 * 情况下让该行自己变窄，而不是溢出面板或挤掉相邻元素。
 */
export function fitTextWidth(text: Phaser.GameObjects.Text, maxWidth: number): void {
  if (maxWidth <= 0 || text.width <= 0) {
    text.setScale(1);
    return;
  }
  text.setScale(Math.min(1, maxWidth / text.width));
}

/**
 * 按实测高度把多行文本块缩放到目标高度带内，并垂直居中于该带。
 *
 * 用于结算面板：统计行数会随玩法迭代增长，写死字号迟早会压到标题或按钮上。
 * 传入的 Text 需为 originY=0.5。
 */
export function fitTextBlock(
  text: Phaser.GameObjects.Text,
  bounds: { top: number; bottom: number; maxWidth: number },
): void {
  const available = bounds.bottom - bounds.top;
  const heightScale = text.height > 0 ? available / text.height : 1;
  const widthScale = text.width > 0 ? bounds.maxWidth / text.width : 1;
  text.setScale(Math.min(1, heightScale, widthScale));
  text.setY(bounds.top + available / 2);
}
