import { describe, expect, it } from 'vitest';
import { DEFAULT_KEYBINDS, formatKeybind } from '../src/config/keybinds';
import {
  BINDING_BOX_SHRINK,
  BINDING_DETAIL_SAFE_GAP,
  BINDING_GRID_COLUMNS,
  BINDING_GRID_TOP,
  SETTINGS_DETAIL_TOP,
  computeBindingGridLayout,
} from '../src/scenes/settingsLayout';

/**
 * 这组测试锁的是一个只在真实渲染里可见、类型检查和既有测试都拦不住的错位：
 * 加入 weapon6 后设置页每列从 9 行变成 10 行，而行高写死 30px，
 * 末行盒体压过了「音频设置 / 辅助选项」标题。
 */
describe('设置页键位网格布局', () => {
  const actionCount = Object.keys(DEFAULT_KEYBINDS).length;

  it('当前动作数下末行不压过详情区标题', () => {
    const layout = computeBindingGridLayout(actionCount);
    expect(layout.lastRowBottomY).toBeLessThanOrEqual(SETTINGS_DETAIL_TOP);
    expect(layout.gapToDetail).toBeGreaterThanOrEqual(BINDING_DETAIL_SAFE_GAP);
  });

  it('相邻两行之间保留可见缝隙', () => {
    const layout = computeBindingGridLayout(actionCount);
    expect(layout.rowHeight - layout.boxHeight).toBe(BINDING_BOX_SHRINK);
    expect(layout.boxHeight).toBeGreaterThan(0);
  });

  it('两列均分动作，且列容量足够放下全部动作', () => {
    const layout = computeBindingGridLayout(actionCount);
    expect(layout.rowsPerColumn * BINDING_GRID_COLUMNS).toBeGreaterThanOrEqual(actionCount);
    expect(layout.rowsPerColumn).toBe(Math.ceil(actionCount / BINDING_GRID_COLUMNS));
  });

  /**
   * 真正的回归保护：未来任何人再加动作都不允许重现叠字。
   * 这里直接把「未来可能的动作数」全扫一遍，而不是只断言当前值。
   */
  it('动作数增长到 40 之前都不会压过详情区', () => {
    for (let n = 2; n <= 40; n += 1) {
      const layout = computeBindingGridLayout(n);
      expect(
        layout.lastRowBottomY,
        `动作数 ${n} 时末行下沿 ${layout.lastRowBottomY} 压过详情区 ${SETTINGS_DETAIL_TOP}`,
      ).toBeLessThanOrEqual(SETTINGS_DETAIL_TOP);
      expect(layout.rowHeight, `动作数 ${n} 的行高必须为正`).toBeGreaterThan(0);
    }
  });

  it('首行不会被顶到详情区之上的负空间', () => {
    const layout = computeBindingGridLayout(actionCount);
    expect(BINDING_GRID_TOP - layout.boxHeight / 2).toBeGreaterThan(0);
  });
});

/**
 * 第二个缺陷：`KEYBIND_LABELS` 只到 FIVE，`formatKeybind('SIX')` 于是
 * 把原始代号当人类可读文案直接显示，设置页第 6 槽显示成 "SIX"。
 * 漏项不会报错，只会显示错，因此必须逐个动作断言。
 */
describe('键位文案', () => {
  it('所有默认绑定都有人类可读文案，不泄漏原始代号', () => {
    for (const [action, code] of Object.entries(DEFAULT_KEYBINDS)) {
      const label = formatKeybind(code);
      // 原始代号形如 ONE / SIX / WHEEL_UP：全大写加下划线。
      // 单个字母（W/A/S/D/R）本身就是合理文案，需要排除在外。
      const looksLikeRawCode = /^[A-Z][A-Z0-9_]+$/.test(label);
      expect(looksLikeRawCode, `${action} 的绑定 ${code} 显示为原始代号 ${label}`).toBe(false);
    }
  });

  it('六个武器栏数字键分别显示为 1..6', () => {
    expect(formatKeybind('ONE')).toBe('1');
    expect(formatKeybind('TWO')).toBe('2');
    expect(formatKeybind('THREE')).toBe('3');
    expect(formatKeybind('FOUR')).toBe('4');
    expect(formatKeybind('FIVE')).toBe('5');
    expect(formatKeybind('SIX')).toBe('6');
  });
});
