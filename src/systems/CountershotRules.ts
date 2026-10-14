export type CountershotAllegiance = 'hostile' | 'returned';

/** 消费在伤害回调之前发生，避免同帧多弹丸/多碰撞入口重复反打与爆炸。 */
export class CountershotFlight {
  private allegiance: CountershotAllegiance | null = null;

  launch(): void {
    this.allegiance = 'hostile';
  }

  get side(): CountershotAllegiance | null {
    return this.allegiance;
  }

  reflect(): boolean {
    if (this.allegiance !== 'hostile') return false;
    this.allegiance = 'returned';
    return true;
  }

  consume(): CountershotAllegiance | null {
    const allegiance = this.allegiance;
    this.allegiance = null;
    return allegiance;
  }
}

export function isCountershotSourceCurrent(active: boolean, currentToken: number, launchToken: number): boolean {
  return active && currentToken === launchToken;
}
