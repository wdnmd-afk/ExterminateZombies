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
import { describe, expect, it, vi } from 'vitest';
import { EVENTS, SCENES } from '../src/constants';
import { WEAPONS } from '../src/config/weapons';
import { MAX_WEAPON_LOADOUT_SIZE } from '../src/config/loadout';
import { sceneMethod } from './helpers/scene-method';
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

  it('真实阶段处理器只在汇总后保留一个直接提示出口', () => {
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

describe('阶段实物提示与抽卡队列的真实接线', () => {
  function createContext(opened = true) {
    const flush = sceneMethod('flushPendingWaveRewardNotice', { EVENTS });
    const context = {
      state: { player: { ownedWeapons: ['pistol'], activeEnhancements: new Set<string>() } },
      weaponManager: { pickupWeapon: vi.fn(() => true) },
      pendingWaveRewardNotice: null as { title: string; accent: number } | null,
      rewardContinuationPending: false,
      pauseReason: null as string | null,
      events: { emit: vi.fn() },
      scene: { stop: vi.fn() },
      waveManager: { continueAfterReward: vi.fn() },
      handleEnhancementPickup: () => { context.pauseReason = opened ? 'cardSelection' : null; return opened; },
      setPause: (reason: string | null) => { context.pauseReason = reason; },
      drainPendingEnhancementPacks: vi.fn(),
      flushPendingWaveRewardNotice: () => { flush.call(context); },
    };
    const reward = sceneMethod('handleWaveRewards', {
      EVENTS, WEAPONS, MAX_WEAPON_LOADOUT_SIZE, formatWeaponRewardLabel, createWaveRewardNotice,
      SaveManager: { unlockWeapon: () => true }, SoundManager: { play: vi.fn() },
    });
    const selected = sceneMethod('handleCardSelected', { EVENTS, SCENES, ENHANCEMENTS: { sample: { cardTitle: '测试强化' } } });
    return { context, reward, selected };
  }

  it('含强化时先发放武器，选卡后才显示一次汇总', () => {
    const { context, reward, selected } = createContext();
    expect(reward.call(context, { rewards: [{ type: 'weapon', weaponId: 'smg', ammo: 20 }, { type: 'enhancement' }] })).toBe(true);
    expect(context.weaponManager.pickupWeapon).toHaveBeenCalledOnce();
    expect(context.events.emit).not.toHaveBeenCalled();
    const notice = context.pendingWaveRewardNotice;
    selected.call(context, 'sample');
    expect(context.events.emit).toHaveBeenLastCalledWith(EVENTS.pickupCollected, notice);
    expect(context.pendingWaveRewardNotice).toBeNull();
    expect(context.waveManager.continueAfterReward).toHaveBeenCalledOnce();
    context.flushPendingWaveRewardNotice();
    expect(context.events.emit.mock.calls.filter(call => call[1] === notice)).toHaveLength(1);
  });

  it('后面仍有排队抽卡时保留汇总，跳过最后一包也能显示', () => {
    const { context, reward, selected } = createContext();
    reward.call(context, { rewards: [{ type: 'weapon', weaponId: 'shotgun', ammo: 12 }, { type: 'enhancement' }] });
    const notice = context.pendingWaveRewardNotice;
    context.drainPendingEnhancementPacks.mockImplementationOnce(() => { context.pauseReason = 'cardSelection'; });
    selected.call(context, null);
    expect(context.events.emit).not.toHaveBeenCalled();
    expect(context.pendingWaveRewardNotice).toBe(notice);
    selected.call(context, null);
    expect(context.events.emit).toHaveBeenCalledExactlyOnceWith(EVENTS.pickupCollected, notice);
  });

  it('没有强化或未成功打开抽卡时不吞提示', () => {
    for (const enhancement of [false, true]) {
      const { context, reward } = createContext(false);
      const rewards = [{ type: 'weapon', weaponId: 'smg', ammo: 20 }, ...(enhancement ? [{ type: 'enhancement' }] : [])];
      expect(reward.call(context, { rewards })).toBe(false);
      expect(context.events.emit).toHaveBeenCalledOnce();
      expect(context.pendingWaveRewardNotice).toBeNull();
      expect(context.rewardContinuationPending).toBe(false);
    }
  });
});
