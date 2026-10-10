import { describe, expect, it, vi } from 'vitest';
import { createDebriefLayout } from '../src/ui/debrief';
import { createActionButton } from '../src/ui/components';

vi.mock('phaser', () => ({ default: {} }));
vi.mock('../src/ui/components', () => ({ createActionButton: vi.fn() }));

interface DisplayStub {
  x: number;
  y: number;
  text: string;
  width: number;
  height: number;
  originX: number;
  originY: number;
  scaleX: number;
  scaleY: number;
  setOrigin: (horizontal: number, vertical?: number) => DisplayStub;
  setStrokeStyle: () => DisplayStub;
  setAlpha: () => DisplayStub;
  setRotation: () => DisplayStub;
  setScale: (scale: number) => DisplayStub;
}

function createDisplay(x: number, y: number, text = '', fontSize = '13px'): DisplayStub {
  const size = Number.parseInt(fontSize, 10);
  const display: DisplayStub = {
    x, y, text, width: text.length * size, height: size + 2,
    originX: 0, originY: 0, scaleX: 1, scaleY: 1,
    setOrigin: (horizontal, vertical = horizontal) => { display.originX = horizontal; display.originY = vertical; return display; },
    setStrokeStyle: () => display,
    setAlpha: () => display,
    setRotation: () => display,
    setScale: (scale) => { display.scaleX = scale; display.scaleY = scale; return display; },
  };
  return display;
}

function render(buttonCount: number, hint: string) {
  vi.mocked(createActionButton).mockClear();
  const texts: DisplayStub[] = [];
  const scene = {
    add: {
      text: (x: number, y: number, text: string, style: { fontSize: string }) => {
        const display = createDisplay(x, y, text, style.fontSize);
        texts.push(display);
        return display;
      },
      rectangle: (x: number, y: number) => createDisplay(x, y),
      graphics: () => ({ lineStyle: vi.fn(), lineBetween: vi.fn() }),
    },
  } as unknown as Parameters<typeof createDebriefLayout>[0];
  createDebriefLayout(scene, {
    accent: 0xfbc02d, eyebrow: 'FRENZY', title: '狂潮突破', meta: '霰弹冲阵', watermark: 'FRENZY',
    cards: [], footerRows: [], hint,
    buttons: ['同预设再来一局', '更换预设', '返回主页'].slice(0, buttonCount).map((label, index) => ({ label, primary: index === 0, onSelect: vi.fn() })),
  });
  return { hint: texts.find(display => display.text === hint)!, buttons: vi.mocked(createActionButton).mock.calls.map(call => call[1]) };
}

describe('结算页提示独立占行', () => {
  it.each([1, 2, 3])('%i个按钮时提示不压住按钮且不越出720高画布', (count) => {
    const { hint, buttons } = render(count, '更换猎杀顺序，尝试用上一枚核心的奖励攻下下一个目标。');
    const top = hint.y - hint.height * hint.scaleY * hint.originY;
    expect(top).toBeGreaterThanOrEqual(Math.max(...buttons.map(button => button.y + button.height / 2)) + 12);
    expect(top + hint.height * hint.scaleY).toBeLessThanOrEqual(720 - 24);
    expect(buttons.every(button => button.y === 616 && button.width === 300 && button.height === 56)).toBe(true);
  });

  it('超长提示沿用公共缩放，不侵入左右内容边距', () => {
    const { hint } = render(3, '三核心召唤首领，击杀立即通关；更换猎杀顺序，尝试用上一枚核心的奖励攻下下一个目标。'.repeat(4));
    const width = hint.width * hint.scaleX;
    const left = hint.x - width * hint.originX;
    expect(left).toBeGreaterThanOrEqual(64);
    expect(left + width).toBeLessThanOrEqual(1280 - 64);
  });
});
