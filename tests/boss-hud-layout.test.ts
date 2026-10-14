import { readFileSync } from 'node:fs';
import { createSourceFile, ScriptTarget } from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { ZOMBIES } from '../src/config/zombies';
import type { BossStatus } from '../src/scenes/GameScene';
import { fitTextWidth } from '../src/ui/layout';
import { sceneMethod } from './helpers/scene-method';

vi.mock('phaser', () => ({ default: {} }));

const hudSource = createSourceFile('HUDScene.ts', readFileSync(new URL('../src/scenes/HUDScene.ts', import.meta.url), 'utf8'), ScriptTarget.Latest, true);

function createDisplay(x: number, y: number, fontSize = 0) {
  const display = {
    x, y, fontSize, text: '', width: 0, height: 0, fillColor: 0,
    scaleX: 1, scaleY: 1, originX: 0.5, originY: 0.5, lineSpacing: 0,
    setText(text: string) {
      this.text = text;
      const lines = text.split('\n');
      this.width = Math.max(...lines.map(line => [...line].reduce((width, character) => width + fontSize * (/[^\x00-\x7f]/.test(character) ? 1 : 0.55), 0)));
      this.height = lines.length * (fontSize + 3) + (lines.length - 1) * this.lineSpacing;
      return this;
    },
    setLineSpacing(spacing: number) { this.lineSpacing = spacing; return this.setText(this.text); },
    setOrigin(horizontal: number, vertical = horizontal) { this.originX = horizontal; this.originY = vertical; return this; },
    setScale(scale: number) { this.scaleX = scale; this.scaleY = scale; return this; },
    setStrokeStyle() { return this; },
  };
  return display;
}

type DisplayStub = ReturnType<typeof createDisplay>;

function createContainer(list: DisplayStub[]) {
  return { list, visible: true, setVisible(visible: boolean) { this.visible = visible; return this; } };
}

function render(boss: BossStatus | null, side = true, full = false, panelWidth = full ? 220 : 114) {
  const subject = {
    gameScene: { getBossStatus: () => boss },
    bossPanel: createContainer([]),
    bossNameText: createDisplay(0, 0),
    bossHealthFill: createDisplay(0, 0),
    bossRecoveryText: createDisplay(0, 0),
    add: {
      text: (x: number, y: number, text: string, style: { fontSize: string }) => createDisplay(x, y, Number.parseInt(style.fontSize, 10)).setText(text),
      rectangle: (x: number, y: number, width: number, height: number, fillColor: number) => Object.assign(createDisplay(x, y), { width, height, fillColor }),
      container: (_x: number, _y: number, children: DisplayStub[]) => createContainer(children),
    },
  };
  const bindings = {
    USE_SIDE_HUD: side, USE_FULL_SIDE_HUD: full, USE_NARROW_SIDE_HUD: side && !full && panelWidth < 140,
    RIGHT_PANEL_RIGHT: 1397, RIGHT_PANEL_WIDTH: panelWidth, RIGHT_PANEL_TOP: 18, RIGHT_PANEL_HEIGHT: full ? 142 : 128,
    GAME_WIDTH: 1280, BOSS_HEALTH_WIDTH: panelWidth - 28, UI_FONT_FAMILY: 'ui-font', fitTextWidth,
    Phaser: { Math: { Clamp: (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value)) } },
  };
  sceneMethod('createBossPanel', bindings, hudSource).call(subject);
  const refresh = sceneMethod('refreshBossStatus', bindings, hudSource);
  refresh.call(subject);
  return { subject, refresh, panelWidth };
}

const top = (display: DisplayStub) => display.y - display.height * display.scaleY * display.originY;
const bottom = (display: DisplayStub) => top(display) + display.height * display.scaleY;
const bossCases = (['tank_boss', 'bomber_boss', 'hunter_boss', 'matriarch_boss'] as const).flatMap(id => {
  const definition = ZOMBIES[id];
  return [definition.bossPhaseLabel!, ...definition.bossPhases!.map(phase => phase.label)].map((phaseLabel, index) => ({
    id, phase: index + 1,
    boss: { name: definition.name, health: 50, maxHealth: 100, phase: index + 1, totalPhases: 3, phaseLabel, recovery: { active: true, remaining: 1200, damageMultiplier: 1.25 } } satisfies BossStatus,
  }));
});

describe('Boss侧栏可读性与固定槽', () => {
  it.each(bossCases)('$id 第$phase阶段紧凑标题不缩成细线且不挤压血条/反击提示', ({ boss }) => {
    const { subject, panelWidth } = render(boss);
    const title = subject.bossNameText;
    const background = subject.bossPanel.list[0];
    expect(title.text.split('\n')).toEqual([boss.name, `BOSS P${boss.phase}/3`, boss.phaseLabel]);
    expect(title.fontSize * title.scaleX).toBeGreaterThanOrEqual(16);
    expect(title.width * title.scaleX).toBeLessThanOrEqual(panelWidth - 20);
    expect(top(title)).toBeGreaterThanOrEqual(top(background) + 2);
    expect(bottom(title) + 2).toBeLessThanOrEqual(top(subject.bossHealthFill));
    expect(bottom(subject.bossHealthFill) + 2).toBeLessThanOrEqual(top(subject.bossRecoveryText));
    expect(bottom(subject.bossRecoveryText)).toBeLessThanOrEqual(bottom(background) - 1);
    expect(background.height).toBe(90);
    expect(subject.bossHealthFill.width).toBe((panelWidth - 28) / 2);
    expect(subject.bossRecoveryText.text).toBe('破甲×1.25 1.2s');
  });

  it.each(bossCases)('$id 第$phase阶段完整侧栏维持原单行格式与落点', ({ boss }) => {
    const { subject } = render(boss, true, true);
    expect(subject.bossNameText.text).toBe(`BOSS  //  ${boss.name}  //  P${boss.phase}/3 ${boss.phaseLabel}`);
    expect(subject.bossNameText.fontSize).toBe(14);
    expect(subject.bossNameText.y).toBe(subject.bossPanel.list[0].y - 31);
    expect(subject.bossHealthFill.y).toBe(subject.bossPanel.list[0].y);
    expect(subject.bossRecoveryText.y).toBe(subject.bossPanel.list[0].y + 27);
  });

  it('较宽紧凑侧栏仍保留三行，缺阶段时不残留旧阶段', () => {
    const boss = { ...bossCases[0].boss } as BossStatus;
    const { subject, refresh } = render(boss, true, false, 156);
    expect(subject.bossNameText.text.split('\n')).toHaveLength(3);
    Object.assign(boss, { phase: null, totalPhases: null, phaseLabel: null });
    refresh.call(subject);
    expect(subject.bossNameText.text).toBe(`BOSS\n${boss.name}`);
    expect(subject.bossNameText.scaleX).toBe(1);
  });

  it('无Boss时隐藏面板，不读取空状态的血量', () => {
    expect(render(null).subject.bossPanel.visible).toBe(false);
  });

  it('战场内降级分支保持原式，零上限不产生无效血条', () => {
    const boss = { ...bossCases[0].boss, maxHealth: 0, recovery: { active: false, remaining: 0, damageMultiplier: 1 } };
    const { subject } = render(boss, false, false);
    expect(subject.bossNameText.y).toBe(25);
    expect(subject.bossNameText.text).toBe(`BOSS  //  ${boss.name}  //  P1/3 ${boss.phaseLabel}`);
    expect(subject.bossHealthFill.y).toBe(51);
    expect(subject.bossHealthFill.width).toBe(0);
    expect(subject.bossRecoveryText.text).toBe('');
  });
});
