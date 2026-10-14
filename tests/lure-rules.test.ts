import { describe, expect, it } from 'vitest';
import {
  activateLure,
  createLureState,
  findNearbyLure,
  getLurePhase,
  resolveLureTarget,
  shiftLureTimers,
  type LureState,
} from '../src/systems/LureRules';
import { LURE_SETTINGS } from '../src/config/tacticalDevices';

/** 按第二关实际摆位建两台装置，间距远大于交互半径，避免用例互相干扰。 */
function createPair(): LureState[] {
  return [
    createLureState({ id: 'station-west-broadcast', x: 350, y: 300 }),
    createLureState({ id: 'station-east-broadcast', x: 930, y: 420 }),
  ];
}

describe('广播装置相位与次数', () => {
  it('初始为 ready 且带满使用次数', () => {
    const [west] = createPair();
    expect(west.chargesLeft).toBe(LURE_SETTINGS.charges);
    expect(getLurePhase(west, 0)).toBe('ready');
  });

  it('单台装置按 ready → broadcasting → cooldown → ready 推进，两次用尽后 exhausted', () => {
    const states = createPair();
    const [west] = states;

    expect(activateLure(states, west.id, 1000)).toBe(true);
    expect(west.chargesLeft).toBe(1);
    expect(getLurePhase(west, 1000)).toBe('broadcasting');

    // 广播持续 9 秒，结束瞬间即离开 broadcasting。
    expect(getLurePhase(west, 1000 + LURE_SETTINGS.durationMs - 1)).toBe('broadcasting');
    expect(getLurePhase(west, 1000 + LURE_SETTINGS.durationMs)).toBe('cooldown');

    // 冷却从广播结束起算 18 秒。
    const readyAgain = 1000 + LURE_SETTINGS.durationMs + LURE_SETTINGS.cooldownMs;
    expect(getLurePhase(west, readyAgain - 1)).toBe('cooldown');
    expect(getLurePhase(west, readyAgain)).toBe('ready');

    expect(activateLure(states, west.id, readyAgain)).toBe(true);
    expect(west.chargesLeft).toBe(0);

    // 次数耗尽后即便冷却已过也不能再启动。
    const afterSecond = readyAgain + LURE_SETTINGS.durationMs + LURE_SETTINGS.cooldownMs;
    expect(getLurePhase(west, afterSecond)).toBe('exhausted');
    expect(activateLure(states, west.id, afterSecond)).toBe(false);
    expect(west.chargesLeft).toBe(0);
  });

  it('冷却中和广播中都不能重复启动，也不额外扣次数', () => {
    const states = createPair();
    const [west] = states;
    activateLure(states, west.id, 0);

    expect(activateLure(states, west.id, 500)).toBe(false);
    expect(activateLure(states, west.id, LURE_SETTINGS.durationMs + 10)).toBe(false);
    expect(west.chargesLeft).toBe(1);
  });

  it('未知 id 与非法时间不改变任何状态', () => {
    const states = createPair();
    expect(activateLure(states, 'not-a-station', 0)).toBe(false);
    for (const now of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(activateLure(states, states[0].id, now)).toBe(false);
    }
    expect(states.every((state) => state.chargesLeft === LURE_SETTINGS.charges)).toBe(true);
  });

  it('切换装置终止旧广播，但不返还次数也不跳过旧装置冷却', () => {
    const states = createPair();
    const [west, east] = states;

    activateLure(states, west.id, 0);
    const switchAt = 3000;
    expect(activateLure(states, east.id, switchAt)).toBe(true);

    // 旧声源立即失效，且从切换时刻起重新计冷却；次数不退还。
    expect(getLurePhase(west, switchAt)).toBe('cooldown');
    expect(west.chargesLeft).toBe(1);
    expect(west.readyAt).toBe(switchAt + LURE_SETTINGS.cooldownMs);

    // 同时只有一个声源有效。
    expect(getLurePhase(east, switchAt)).toBe('broadcasting');
  });
});

describe('广播装置交互与吸引判定', () => {
  it('按交互半径取最近装置，超出半径返回 null', () => {
    const states = createPair();
    const [west] = states;

    expect(findNearbyLure(states, { x: west.x, y: west.y })?.id).toBe(west.id);
    expect(findNearbyLure(states, { x: west.x + LURE_SETTINGS.interactionRadius, y: west.y })?.id)
      .toBe(west.id);
    expect(findNearbyLure(states, { x: west.x + LURE_SETTINGS.interactionRadius + 1, y: west.y }))
      .toBeNull();
  });

  it('两台装置都在范围内时取距离更近的一台', () => {
    const states = [
      createLureState({ id: 'near', x: 100, y: 100 }),
      createLureState({ id: 'far', x: 100, y: 160 }),
    ];
    expect(findNearbyLure(states, { x: 100, y: 110 })?.id).toBe('near');
    expect(findNearbyLure(states, { x: 100, y: 150 })?.id).toBe('far');
  });

  it('只吸引白名单基础感染体，重装与远程免疫', () => {
    const states = createPair();
    const [west] = states;
    activateLure(states, west.id, 0);
    const at = { x: west.x + 100, y: west.y };
    const player = { x: 0, y: 0 };

    for (const typeId of LURE_SETTINGS.affectedTypes) {
      expect(resolveLureTarget(states, 0, { typeId, ...at }, player)?.id).toBe(west.id);
    }
    for (const typeId of ['tank', 'bomber', 'lurker', 'tank_boss']) {
      expect(resolveLureTarget(states, 0, { typeId, ...at }, player)).toBeNull();
    }
  });

  it('吸引半径按 340px 生效，超出不接管移动目标', () => {
    const states = createPair();
    const [west] = states;
    activateLure(states, west.id, 0);
    const player = { x: 0, y: 0 };

    const inside = { typeId: 'walker', x: west.x + LURE_SETTINGS.attractionRadius, y: west.y };
    const outside = { typeId: 'walker', x: west.x + LURE_SETTINGS.attractionRadius + 1, y: west.y };
    expect(resolveLureTarget(states, 0, inside, player)?.id).toBe(west.id);
    expect(resolveLureTarget(states, 0, outside, player)).toBeNull();
  });

  it('贴近玩家的感染体优先威胁玩家，装置不是无敌安全区', () => {
    const states = createPair();
    const [west] = states;
    activateLure(states, west.id, 0);

    const zombie = { typeId: 'walker', x: west.x + 100, y: west.y };
    const farPlayer = { x: 0, y: 0 };
    const closePlayer = { x: zombie.x + LURE_SETTINGS.playerPriorityRadius, y: zombie.y };
    const edgePlayer = { x: zombie.x + LURE_SETTINGS.playerPriorityRadius + 1, y: zombie.y };

    expect(resolveLureTarget(states, 0, zombie, farPlayer)?.id).toBe(west.id);
    expect(resolveLureTarget(states, 0, zombie, closePlayer)).toBeNull();
    expect(resolveLureTarget(states, 0, zombie, edgePlayer)?.id).toBe(west.id);
  });

  it('只有 broadcasting 相位的装置会接管移动目标', () => {
    const states = createPair();
    const [west] = states;
    const zombie = { typeId: 'walker', x: west.x + 100, y: west.y };
    const player = { x: 0, y: 0 };

    // 未启动时不吸引。
    expect(resolveLureTarget(states, 0, zombie, player)).toBeNull();

    activateLure(states, west.id, 0);
    expect(resolveLureTarget(states, 0, zombie, player)?.id).toBe(west.id);

    // 广播结束进入冷却后立即停止吸引。
    expect(resolveLureTarget(states, LURE_SETTINGS.durationMs, zombie, player)).toBeNull();
  });
});

describe('广播装置计时平移', () => {
  it('暂停平移同时推移广播与冷却，不凭空消耗时间', () => {
    const states = createPair();
    const [west] = states;
    activateLure(states, west.id, 1000);

    const activeUntil = west.activeUntil;
    const readyAt = west.readyAt;
    const offset = 5000;
    shiftLureTimers(states, offset);

    expect(west.activeUntil).toBe(activeUntil + offset);
    expect(west.readyAt).toBe(readyAt + offset);
    // 平移后剩余广播时长不变。
    expect(getLurePhase(west, 1000 + offset)).toBe('broadcasting');
  });

  it('从未使用过的装置不会因平移产生虚假冷却', () => {
    const states = createPair();
    shiftLureTimers(states, 5000);
    for (const state of states) {
      expect(state.readyAt).toBe(0);
      expect(getLurePhase(state, 5000)).toBe('ready');
    }
  });

  it('非正数与非有限偏移被忽略', () => {
    const states = createPair();
    const [west] = states;
    activateLure(states, west.id, 1000);
    const activeUntil = west.activeUntil;
    const readyAt = west.readyAt;

    for (const offset of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      shiftLureTimers(states, offset);
      expect(west.activeUntil).toBe(activeUntil);
      expect(west.readyAt).toBe(readyAt);
    }
  });
});
