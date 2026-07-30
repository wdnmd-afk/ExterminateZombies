import { describe, expect, it } from 'vitest';
import { SpatialHash } from '../src/utils/SpatialHash';

describe('SpatialHash', () => {
  it('只返回查询覆盖格中的对象', () => {
    const hash = new SpatialHash<{ id: string; x: number; y: number }>(50);
    hash.rebuild([
      { id: 'near-a', x: 12, y: 16 },
      { id: 'near-b', x: 62, y: 18 },
      { id: 'far', x: 420, y: 360 },
    ]);

    const ids = hash.queryRadius(30, 20, 70).map((entry) => entry.id);
    expect(ids).toContain('near-a');
    expect(ids).toContain('near-b');
    expect(ids).not.toContain('far');
  });

  it('重建时清除上一帧对象', () => {
    const hash = new SpatialHash<{ id: string; x: number; y: number }>(64);
    hash.rebuild([{ id: 'old', x: 10, y: 10 }]);
    hash.rebuild([{ id: 'new', x: 10, y: 10 }]);
    expect(hash.queryRadius(10, 10, 20).map((entry) => entry.id)).toEqual(['new']);
  });
});
