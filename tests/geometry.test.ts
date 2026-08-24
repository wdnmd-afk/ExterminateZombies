import { describe, expect, it } from 'vitest';
import {
  buildRotatedRectTiles,
  getRotatedAabbSize,
  segmentIntersectsAabb,
  type AabbTile,
} from '../src/utils/geometry';

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

/** 点是否落在以 (cx,cy) 为心、旋转 deg 的 w×h 矩形内。 */
function insideRotatedRect(
  px: number,
  py: number,
  cx: number,
  cy: number,
  width: number,
  height: number,
  degrees: number,
): boolean {
  const rad = -degrees * Math.PI / 180;
  const dx = px - cx;
  const dy = py - cy;
  const localX = dx * Math.cos(rad) - dy * Math.sin(rad);
  const localY = dx * Math.sin(rad) + dy * Math.cos(rad);
  return Math.abs(localX) <= width / 2 && Math.abs(localY) <= height / 2;
}

function insideAnyTile(px: number, py: number, tiles: AabbTile[]): boolean {
  return tiles.some((tile) => (
    Math.abs(px - tile.x) <= tile.width / 2 && Math.abs(py - tile.y) <= tile.height / 2
  ));
}

/**
 * 在包住两者的范围内均匀采样，统计矩形面积、砖并集面积、漏覆盖面积，
 * 以及**最大探出距离**——砖覆盖到、矩形却没有的点，离矩形最远多少。
 * 最后这一项是玩家的体感判据：碰撞区探出贴图多少像素。
 */
function measureCoverage(
  width: number,
  height: number,
  degrees: number,
  tiles: AabbTile[],
  samples = 480,
): { rectArea: number; tileArea: number; missed: number; maxProtrusion: number } {
  const half = (Math.max(width, height) * 0.75) + 6;
  const cell = (half * 2 / samples) ** 2;
  const rad = -degrees * Math.PI / 180;
  let rectArea = 0;
  let tileArea = 0;
  let missed = 0;
  let maxProtrusion = 0;
  for (let i = 0; i < samples; i += 1) {
    for (let j = 0; j < samples; j += 1) {
      const px = -half + (half * 2 * (i + 0.5)) / samples;
      const py = -half + (half * 2 * (j + 0.5)) / samples;
      const inRect = insideRotatedRect(px, py, 0, 0, width, height, degrees);
      const inTile = insideAnyTile(px, py, tiles);
      if (inRect) rectArea += cell;
      if (inTile) tileArea += cell;
      if (inRect && !inTile) missed += cell;
      if (inTile && !inRect) {
        // 到矩形的距离在矩形自身的局部坐标里算，两轴各取超出量。
        const localX = px * Math.cos(rad) - py * Math.sin(rad);
        const localY = px * Math.sin(rad) + py * Math.cos(rad);
        const overX = Math.max(0, Math.abs(localX) - width / 2);
        const overY = Math.max(0, Math.abs(localY) - height / 2);
        maxProtrusion = Math.max(maxProtrusion, Math.hypot(overX, overY));
      }
    }
  }
  return { rectArea, tileArea, missed, maxProtrusion };
}

describe('buildRotatedRectTiles', () => {
  it('轴对齐时退化为单块砖，与旧的包围盒行为一致', () => {
    for (const degrees of [0, 90, 180, 270, -90]) {
      const tiles = buildRotatedRectTiles(400, 300, 130, 56, degrees);
      const expected = getRotatedAabbSize(130, 56, degrees);
      expect(tiles).toHaveLength(1);
      expect(tiles[0].x).toBeCloseTo(400, 8);
      expect(tiles[0].y).toBeCloseTo(300, 8);
      expect(tiles[0].width).toBeCloseTo(expected.width, 6);
      expect(tiles[0].height).toBeCloseTo(expected.height, 6);
    }
  });

  it('斜放时铺多块等宽带，且每块砖都贴着矩形在该带内的真实上下界', () => {
    const width = 130;
    const height = 56;
    const degrees = 45;
    const tiles = buildRotatedRectTiles(400, 300, width, height, degrees);
    expect(tiles.length).toBeGreaterThan(1);
    // 分带方向上带宽一致；这是"等宽扫描线"的定义，也保证没有重叠或空隙。
    const widths = tiles.map((tile) => tile.width);
    for (const value of widths) expect(value).toBeCloseTo(widths[0], 6);
    // 每块砖的上下界都必须是矩形在该带内的**真实**上下界：沿这一带横扫，
    // 砖的上边缘与下边缘各自都要能碰到矩形。只在带中心取样是不够的——
    // 带内上下界取的是整带的极值，带中心那一列本来就比它窄。
    for (const tile of tiles) {
      const left = tile.x - tile.width / 2;
      const step = tile.width / 24;
      let topTouches = false;
      let bottomTouches = false;
      for (let k = 0; k <= 24; k += 1) {
        const x = left + step * k;
        if (insideRotatedRect(x, tile.y - tile.height / 2 + 0.5, 400, 300, width, height, degrees)) {
          topTouches = true;
        }
        if (insideRotatedRect(x, tile.y + tile.height / 2 - 0.5, 400, 300, width, height, degrees)) {
          bottomTouches = true;
        }
      }
      expect(topTouches).toBe(true);
      expect(bottomTouches).toBe(true);
    }
  });

  it('沿包围盒较长的一维分带：竖长的矩形改成横向分带', () => {
    const tiles = buildRotatedRectTiles(0, 0, 40, 200, 10);
    expect(tiles.length).toBeGreaterThan(1);
    // 竖长 => 沿 y 分带 => 每块砖的高度相同，宽度随矩形轮廓变化。
    const heights = tiles.map((tile) => tile.height);
    for (const value of heights) expect(value).toBeCloseTo(heights[0], 6);
    expect(new Set(tiles.map((tile) => Math.round(tile.width))).size).toBeGreaterThan(1);
  });

  // 不漏是最重要的性质：并集必须完整覆盖旋转矩形，否则子弹或僵尸能从中间穿过去。
  it.each([
    [130, 56, 45],
    [152, 74, 34],
    [150, 40, 20],
    [150, 60, 8],
    [118, 40, 61],
    [200, 38, 12],
  ])('%ix%i 旋转 %i 度时完整覆盖矩形，不留缝', (width, height, degrees) => {
    const tiles = buildRotatedRectTiles(0, 0, width, height, degrees);
    const { rectArea, missed } = measureCoverage(width, height, degrees, tiles);
    expect(rectArea).toBeGreaterThan(0);
    // 采样格边长约 0.5px，边界处的离散误差允许千分之一。
    expect(missed / rectArea).toBeLessThan(0.001);
  });

  // 最大探出距离才是玩家的体感判据：「子弹在空地上被挡住了」说的就是这个量。
  // 面积比是辅助指标——它可以看着不错，同时把误差全堆在长条两端形成一段空气墙。
  // 上限按实测值加余量，标定表见 src/utils/geometry.ts 的 TARGET_BAND_PX。
  it.each([
    [130, 56, 45, 7],
    [152, 74, 34, 8],
    [150, 40, 40, 7],
    [150, 40, 20, 8],
    [150, 60, 8, 8],
    [118, 40, 61, 7],
  ])('%ix%i 旋转 %i 度时碰撞区探出贴图不超过 %ipx', (width, height, degrees, limit) => {
    const tiles = buildRotatedRectTiles(0, 0, width, height, degrees);
    const { maxProtrusion } = measureCoverage(width, height, degrees, tiles);
    expect(maxProtrusion).toBeLessThan(limit);

    // 同时必须显著优于旧的整体单包围盒，否则这次改动没有意义。
    const single = getRotatedAabbSize(width, height, degrees);
    const singleTile = [{ x: 0, y: 0, width: single.width, height: single.height }];
    const before = measureCoverage(width, height, degrees, singleTile);
    expect(maxProtrusion).toBeLessThan(before.maxProtrusion / 2);
  });

  // 贴合度：辅助指标。上限按实测值加余量给定。
  it.each([
    [130, 56, 45, 1.15],
    [152, 74, 34, 1.13],
    [150, 40, 40, 1.16],
    [150, 60, 8, 1.09],
  ])('%ix%i 旋转 %i 度时并集面积不超过矩形的 %f 倍', (width, height, degrees, limit) => {
    const tiles = buildRotatedRectTiles(0, 0, width, height, degrees);
    const { rectArea, tileArea } = measureCoverage(width, height, degrees, tiles);
    const single = getRotatedAabbSize(width, height, degrees);
    expect(tileArea / rectArea).toBeLessThan(limit);
    expect(tileArea / rectArea).toBeLessThan((single.width * single.height) / rectArea);
  });

  it('砖数受上限约束，长墙不会铺出几十块刚体', () => {
    const tiles = buildRotatedRectTiles(0, 0, 2000, 12, 30);
    expect(tiles.length).toBeLessThanOrEqual(24);
  });
});




describe('segmentIntersectsAabb', () => {
  const wall: AabbTile = { x: 100, y: 100, width: 40, height: 20 };

  it('穿过砖体的线段判定为相交', () => {
    expect(segmentIntersectsAabb(0, 100, 200, 100, wall)).toBe(true);
  });

  it('起点落在砖内也算相交', () => {
    expect(segmentIntersectsAabb(100, 100, 300, 300, wall)).toBe(true);
  });

  it('完全在砖外的线段不相交', () => {
    expect(segmentIntersectsAabb(0, 0, 200, 0, wall)).toBe(false);
  });

  it('线段在砖前就结束时不相交', () => {
    expect(segmentIntersectsAabb(0, 100, 60, 100, wall)).toBe(false);
  });

  it('轴平行且错开的线段不相交', () => {
    expect(segmentIntersectsAabb(200, 0, 200, 300, wall)).toBe(false);
  });

  it('紧贴砖边缘的竖直线段算相交', () => {
    expect(segmentIntersectsAabb(120, 0, 120, 300, wall)).toBe(true);
  });
});
