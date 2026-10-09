import { readFileSync } from 'node:fs';
import { createSourceFile, ScriptTarget } from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_ACCESSIBILITY_SETTINGS, SAVE_KEYS, SaveManager } from '../src/systems/SaveManager';
import { SETTINGS_DETAIL_ROW_GAP, SETTINGS_DETAIL_ROW_TOP, SETTINGS_DETAIL_TOP } from '../src/scenes/settingsLayout';
import { sceneMethod } from './helpers/scene-method';

const source = createSourceFile('SettingsScene.ts', readFileSync(new URL('../src/scenes/SettingsScene.ts', import.meta.url), 'utf8'), ScriptTarget.Latest, true);
const bindings = { UI_FONT_FAMILY: 'sans-serif', SETTINGS_DETAIL_ROW_GAP, SETTINGS_DETAIL_ROW_TOP, SETTINGS_DETAIL_TOP, SAVE_KEYS, SaveManager };

function createSubject() {
  const labels: Array<{ x: number; y: number; text: string }> = [];
  const makeDisplay = () => {
    const handlers = new Map<string, () => void>();
    const display = {
      fillColor: 0,
      handlers,
      setOrigin: () => display,
      setStrokeStyle: () => display,
      setInteractive: () => display,
      on: (event: string, handler: () => void) => { handlers.set(event, handler); return display; },
    };
    return display;
  };
  const subject = {
    accessibilitySettings: { ...DEFAULT_ACCESSIBILITY_SETTINGS },
    accessibilityBoxes: new Map<string, ReturnType<typeof makeDisplay>[]>(),
    add: {
      text: (x: number, y: number, text: string) => { labels.push({ x, y, text }); return makeDisplay(); },
      rectangle: () => makeDisplay(),
    },
    refreshAccessibilityControls: () => {},
  };
  subject.refreshAccessibilityControls = () => { sceneMethod('refreshAccessibilityControls', {}, source).call(subject); };
  sceneMethod('createAccessibilityControls', bindings, source).call(subject);
  return { subject, labels };
}

describe('血液辅助选项真实设置入口', () => {
  it('默认选中开启，第四行不覆盖底部返回按钮', () => {
    const { subject, labels } = createSubject();
    expect(subject.accessibilityBoxes.get('blood')?.map(box => box.fillColor)).toEqual([0x1f2a34, 0xfbc02d]);
    const label = labels.find(entry => entry.text === '血液');
    expect(label?.y).toBe(SETTINGS_DETAIL_ROW_TOP + 3 * SETTINGS_DETAIL_ROW_GAP);
    expect((label?.y ?? Infinity) + 10).toBeLessThan(643);
  });

  it('点击关闭和开启只改变 blood，保存同一套辅助设置并刷新高亮', () => {
    const save = vi.spyOn(SaveManager, 'save').mockImplementation(() => {});
    try {
      const { subject } = createSubject();
      const boxes = subject.accessibilityBoxes.get('blood')!;
      boxes[0].handlers.get('pointerup')!();
      expect(subject.accessibilitySettings).toEqual({ ...DEFAULT_ACCESSIBILITY_SETTINGS, blood: false });
      expect(save).toHaveBeenLastCalledWith(SAVE_KEYS.accessibilitySettings, { ...DEFAULT_ACCESSIBILITY_SETTINGS, blood: false });
      expect(boxes.map(box => box.fillColor)).toEqual([0xfbc02d, 0x1f2a34]);
      boxes[1].handlers.get('pointerup')!();
      expect(subject.accessibilitySettings).toEqual(DEFAULT_ACCESSIBILITY_SETTINGS);
      expect(boxes.map(box => box.fillColor)).toEqual([0x1f2a34, 0xfbc02d]);
      expect(save).toHaveBeenCalledTimes(2);
    } finally { save.mockRestore(); }
  });
});
