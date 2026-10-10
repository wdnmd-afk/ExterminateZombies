import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { campaignPreparationAction, isAwaitingCardChoice } from '../scripts/cdp-menu-navigation.mjs';

describe('真实菜单整备入口', () => {
  it('无挂起战局时选择完整文案', () => {
    const action = { text: '进入战前整备', x: 640, y: 404 };
    assert.equal(campaignPreparationAction([action, { text: '无尽模式' }]), action);
  });
  it('挂起战局时选择短文案而不是继续游戏', () => {
    const action = { text: '进入整备', x: 880, y: 438 };
    assert.equal(campaignPreparationAction([{ text: '继续游戏' }, action]), action);
  });
  it('文案缺失时明确失败，不猜测其它按钮', () => {
    assert.throws(() => campaignPreparationAction([{ text: '进入整备  →' }]), /found 0/);
  });
  it('匹配不唯一时拒绝随意点击', () => {
    assert.throws(() => campaignPreparationAction([{ text: '进入战前整备' }, { text: '进入整备' }]), /found 2/);
  });
  it('只有仍打开且冻结战场的抽卡界面才接收选择输入', () => {
    assert.equal(isAwaitingCardChoice({ active: ['GameScene', 'CardSelectionScene'], diagnostics: { pauseReason: 'cardSelection' } }), true);
    assert.equal(isAwaitingCardChoice({ active: ['GameScene', 'CardSelectionScene'], diagnostics: { pauseReason: null } }), false);
  });
  it('旧快照过期后不能把跳过ESC发给战场暂停菜单', () => {
    assert.equal(isAwaitingCardChoice({ active: ['GameScene', 'HUDScene'], diagnostics: { pauseReason: null } }), false);
    assert.equal(isAwaitingCardChoice({ active: ['GameScene', 'HUDScene'], diagnostics: { pauseReason: 'menu' } }), false);
  });
});
