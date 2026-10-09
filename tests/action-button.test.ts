import { describe, expect, it, vi } from 'vitest';
import { createActionButton } from '../src/ui/components';

function createDisplayObject() {
  const handlers = new Map<string, (pointer: { id: number }) => void>();
  const display = {
    fillColor: 0,
    width: 100,
    handlers,
    setOrigin: () => display,
    setStrokeStyle: () => display,
    setAlpha: () => display,
    setScale: vi.fn(() => display),
    setInteractive: vi.fn(() => display),
    on: (event: string, handler: (pointer: { id: number }) => void) => { handlers.set(event, handler); return display; },
    emit: (event: string, pointerId = 0) => handlers.get(event)?.({ id: pointerId }),
  };
  return display;
}

function createSubject(shortcut = true) {
  const displays: ReturnType<typeof createDisplayObject>[] = [];
  const displayObject = () => {
    const display = createDisplayObject();
    displays.push(display);
    return display;
  };
  const onSelect = vi.fn();
  const scene = {
    add: { rectangle: displayObject, text: displayObject },
    tweens: { add: vi.fn() },
  } as unknown as Parameters<typeof createActionButton>[0];
  createActionButton(scene, { x: 300, y: 610, width: 280, height: 56, label: '下一关整备', primary: true, onSelect, shortcut: shortcut ? 'ESC' : undefined });
  return { scene, box: displays[0], label: displays[1], displays, onSelect };
}

describe('公共操作按钮的完整点击边界', () => {
  it.each([true, false])('正常按下再松开只调用一次，快捷键显示=%s', (shortcut) => {
    const { box, onSelect } = createSubject(shortcut);
    box.emit('pointerdown'); box.emit('pointerup'); box.emit('pointerup');
    expect(onSelect).toHaveBeenCalledOnce();
    expect(box.setScale).toHaveBeenLastCalledWith(1);
  });

  it('旧场景的松开或从外部拖入不能激活新按钮', () => {
    const { box, onSelect } = createSubject();
    box.emit('pointerover'); box.emit('pointerup');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it.each(['pointerout', 'pointerupoutside'])('%s 取消已开始的按压，再移回松开无效', (event) => {
    const { box, onSelect } = createSubject();
    box.emit('pointerdown'); box.emit(event); box.emit('pointerover'); box.emit('pointerup');
    expect(onSelect).not.toHaveBeenCalled();
    expect(box.setScale).toHaveBeenLastCalledWith(1);
    box.emit('pointerdown'); box.emit('pointerup');
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it('另一指针松开不能消费先前指针的点击', () => {
    const { box, onSelect } = createSubject();
    box.emit('pointerdown', 1); box.emit('pointerup', 2); box.emit('pointerup', 1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('文字与快捷键使用矩形的统一命中区，避免松开重复回调', () => {
    const { box, label, displays } = createSubject();
    expect(box.setInteractive).toHaveBeenCalledOnce();
    expect(label.setInteractive).not.toHaveBeenCalled();
    expect(displays[2].setInteractive).not.toHaveBeenCalled();
    expect(label.handlers.has('pointerup')).toBe(false);
  });

  it('悬停动画和按下反馈仍执行', () => {
    const { scene, box } = createSubject();
    box.emit('pointerover'); box.emit('pointerdown');
    expect(scene.tweens.add).toHaveBeenCalledOnce();
    expect(box.setScale).toHaveBeenLastCalledWith(0.985);
    box.emit('pointerout');
    expect(scene.tweens.add).toHaveBeenCalledTimes(2);
    expect(box.setScale).toHaveBeenLastCalledWith(1);
  });
});
