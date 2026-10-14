import { describe, expect, it } from 'vitest';
import { CountershotFlight, isCountershotSourceCurrent } from '../src/systems/CountershotRules';

describe('炮弹反打阵营状态机', () => {
  it('未发射的弹体没有阵营，也不能被反打', () => {
    const flight = new CountershotFlight();
    expect(flight.side).toBeNull();
    expect(flight.reflect()).toBe(false);
    expect(flight.side).toBeNull();
  });

  it('发射后为敌方弹，首次反打成功并转为返弹', () => {
    const flight = new CountershotFlight();
    flight.launch();
    expect(flight.side).toBe('hostile');
    expect(flight.reflect()).toBe(true);
    expect(flight.side).toBe('returned');
  });

  it('同一弹体只能反打一次，防止同帧多弹丸重复收益', () => {
    const flight = new CountershotFlight();
    flight.launch();
    expect(flight.reflect()).toBe(true);
    // 散弹同帧多命中或多碰撞入口会重复调用 reflect，第二次起必须失败。
    expect(flight.reflect()).toBe(false);
    expect(flight.reflect()).toBe(false);
    expect(flight.side).toBe('returned');
  });

  it('consume 返回当前阵营并清空，重复消费只得到 null', () => {
    const flight = new CountershotFlight();
    flight.launch();
    expect(flight.consume()).toBe('hostile');
    expect(flight.side).toBeNull();
    expect(flight.consume()).toBeNull();
  });

  it('已消费的弹体不能再被反打，避免回池后残留结算', () => {
    const flight = new CountershotFlight();
    flight.launch();
    expect(flight.consume()).toBe('hostile');
    expect(flight.reflect()).toBe(false);
    expect(flight.side).toBeNull();
  });

  it('返弹命中后消费得到 returned，用于区分伤害归属', () => {
    const flight = new CountershotFlight();
    flight.launch();
    flight.reflect();
    expect(flight.consume()).toBe('returned');
    expect(flight.side).toBeNull();
  });

  it('重新发射会重置为敌方弹，可再次被反打', () => {
    const flight = new CountershotFlight();
    flight.launch();
    flight.reflect();
    flight.consume();

    flight.launch();
    expect(flight.side).toBe('hostile');
    expect(flight.reflect()).toBe(true);
  });
});

describe('反打发射者生命周期令牌', () => {
  it('发射者仍存活且令牌一致时判定为当前发射者', () => {
    expect(isCountershotSourceCurrent(true, 7, 7)).toBe(true);
  });

  it('对象池复用导致令牌变化时不再认作原发射者', () => {
    // 令牌用于区分「同一个对象被回池后复用」与「原发射者仍在场」。
    expect(isCountershotSourceCurrent(true, 8, 7)).toBe(false);
  });

  it('发射者已死亡或回池时无论令牌都不追踪', () => {
    expect(isCountershotSourceCurrent(false, 7, 7)).toBe(false);
    expect(isCountershotSourceCurrent(false, 8, 7)).toBe(false);
  });
});
