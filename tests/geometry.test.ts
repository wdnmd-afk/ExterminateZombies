import { describe, expect, it } from 'vitest';
import { getRotatedAabbSize } from '../src/utils/geometry';

describe('getRotatedAabbSize', () => {
  it('保持未旋转矩形尺寸', () => {
    expect(getRotatedAabbSize(118, 40, 0)).toEqual({ width: 118, height: 40 });
  });

  it('90 度旋转时交换宽高', () => {
    const result = getRotatedAabbSize(118, 40, 90);
    expect(result.width).toBeCloseTo(40, 8);
    expect(result.height).toBeCloseTo(118, 8);
  });

  it('小角度旋转时覆盖完整视觉边界', () => {
    const result = getRotatedAabbSize(150, 60, 18);
    expect(result.width).toBeGreaterThan(150);
    expect(result.height).toBeGreaterThan(60);
  });
});
