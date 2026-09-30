import { readFileSync } from 'node:fs';
import {
  createSourceFile,
  forEachChild,
  isCallExpression,
  isForOfStatement,
  isMethodDeclaration,
  ScriptTarget,
  type Node,
} from 'typescript';
import { describe, expect, it } from 'vitest';
import { createWaveRewardNotice, formatWeaponRewardLabel } from '../src/systems/WaveRewardRules';

describe('阶段武器奖励提示', () => {
  it.each([true, false])('满编队只解锁许可时明确说明未编入，首次解锁=%s', (licenseUnlocked) => {
    const label = formatWeaponRewardLabel({
      weaponName: 'MP5', alreadyOwned: false, addedToRun: false, licenseUnlocked, loadoutFull: true,
    });
    expect(label).toBe(`MP5 · 编队已满${licenseUnlocked ? '，许可解锁' : ''}，可在武器库调整`);
  });

  it('加入第六把武器不误报编队已满', () => {
    expect(formatWeaponRewardLabel({
      weaponName: 'MP5', alreadyOwned: false, addedToRun: true, licenseUnlocked: true, loadoutFull: true,
    })).toBe('MP5 · 许可解锁');
  });

  it('满编队已持有武器的补弹不误报加入失败', () => {
    expect(formatWeaponRewardLabel({
      weaponName: 'SPAS-12', alreadyOwned: true, addedToRun: false, licenseUnlocked: false, loadoutFull: true,
    })).toBe('SPAS-12');
  });
});

describe('同阶段奖励汇总', () => {
  it('武器许可与绷带放在同一提示，不丢弃任何一项', () => {
    const weaponLabel = formatWeaponRewardLabel({
      weaponName: 'SPAS-12', alreadyOwned: false, addedToRun: false, licenseUnlocked: true, loadoutFull: true,
    });
    const labels = Object.freeze([weaponLabel, '绷带×1']);
    expect(createWaveRewardNotice(labels, false, 0xfbc02d)).toEqual({
      title: `阶段补给 · ${weaponLabel}\n绷带×1`, accent: 0xfbc02d,
    });
    expect(labels).toEqual([weaponLabel, '绷带×1']);
  });

  it('章节补给保留章节标题、顺序与强调色', () => {
    expect(createWaveRewardNotice(['弹药 +40', '医疗包×1'], true, 0x58c9dd)).toEqual({
      title: '章节战利品 · 弹药 +40\n医疗包×1', accent: 0x58c9dd,
    });
  });

  it('只有强化或没有成功发放的实物时不产生空提示', () => {
    expect(createWaveRewardNotice([], false, 0x58c9dd)).toBeNull();
  });

  it('真实阶段处理器只在汇总后、打开强化前发送一次拾取提示', () => {
    const source = createSourceFile(
      'GameScene.ts',
      readFileSync(new URL('../src/scenes/GameScene.ts', import.meta.url), 'utf8'),
      ScriptTarget.Latest,
      true,
    );
    let rewardHandler: Node | undefined;
    const findHandler = (node: Node): void => {
      if (isMethodDeclaration(node) && node.name.getText(source) === 'handleWaveRewards') rewardHandler = node;
      forEachChild(node, findHandler);
    };
    findHandler(source);
    expect(rewardHandler).toBeDefined();
    if (!rewardHandler) throw new Error('阶段奖励处理器缺失');

    const pickupCalls: Node[] = [];
    const summaryCalls: Node[] = [];
    const enhancementCalls: Node[] = [];
    const rewardLoops: Node[] = [];
    const inspectCalls = (node: Node): void => {
      if (isForOfStatement(node)) rewardLoops.push(node);
      if (isCallExpression(node)) {
        const expression = node.expression.getText(source);
        if (expression === 'this.events.emit' && node.arguments[0]?.getText(source) === 'EVENTS.pickupCollected') {
          pickupCalls.push(node);
          expect(node.arguments[1]?.getText(source)).toBe('rewardNotice');
        }
        if (expression === 'createWaveRewardNotice') summaryCalls.push(node);
        if (expression === 'this.handleEnhancementPickup') enhancementCalls.push(node);
      }
      forEachChild(node, inspectCalls);
    };
    inspectCalls(rewardHandler);
    expect(pickupCalls).toHaveLength(1);
    expect(summaryCalls).toHaveLength(1);
    expect(enhancementCalls).toHaveLength(1);
    expect(rewardLoops).toHaveLength(1);
    expect(summaryCalls[0].pos).toBeGreaterThan(rewardLoops[0].end);
    expect(pickupCalls[0].pos).toBeGreaterThan(summaryCalls[0].end);
    expect(pickupCalls[0].end).toBeLessThan(enhancementCalls[0].pos);
  });
});
