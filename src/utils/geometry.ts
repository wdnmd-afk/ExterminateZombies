/** 旋转矩形的轴对齐包围盒尺寸，rotationDegrees 使用角度制。 */
export function getRotatedAabbSize(
  width: number,
  height: number,
  rotationDegrees = 0,
): { width: number; height: number } {
  const rotation = (rotationDegrees % 360) * Math.PI / 180;
  const cos = Math.abs(Math.cos(rotation));
  const sin = Math.abs(Math.sin(rotation));
  return {
    width: width * cos + height * sin,
    height: width * sin + height * cos,
  };
}

/** 一块轴对齐碰撞砖。x / y 是世界坐标中心。 */
export interface AabbTile {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 认定角度已经轴对齐的容差（度）。到这个程度时单块砖就是精确解。 */
const AXIS_ALIGNED_EPSILON_DEG = 0.01;

/**
 * 扫描线分带的目标带宽（世界像素）。
 *
 * 取值是实测扫参得来的，不是估的。关键指标是**最大探出距离**——碰撞区超出贴图轮廓
 * 最远多少像素，因为那正是玩家的体感：「子弹在空地上被挡住了」。面积比是辅助指标。
 *
 * | 方案 | 130x56 @45° | 152x74 @34° | 150x40 @40° | 150x60 @8° | 砖数 |
 * | --- | --- | --- | --- | --- | --- |
 * | 旧：整体单包围盒 | 探出 55px / 2.38x | 探出 62px / 2.18x | 探出 60px / 2.29x | 探出 20px / 1.40x | 1 |
 * | 旧：沿长轴切片 0.25 | 探出 27.9px / 1.34x | 探出 34.0px / 1.33x | 探出 19.5px / 1.26x | 探出 8.2px / 1.09x | 9~15 |
 * | 分带 10px | 探出 6.5px / 1.17x | 探出 8.1px / 1.13x | 探出 7.0px / 1.19x | 探出 8.2px / 1.08x | 14~17 |
 * | **分带 6px（采用）** | **4.0px / 1.11x** | **5.5px / 1.09x** | **4.3px / 1.12x** | **6.4px / 1.05x** | 21~24 |
 *
 * 为什么换掉「沿长轴切片」：那个做法的残余误差全部堆在长条**两端**，端头那块砖的包围盒
 * 必然探出矩形的短边，实测最远探出 34px——面积比看着已经不错（1.33x），但玩家在长条
 * 延长线上仍然会被一大片空气挡住，也就是 2026-08-24 用户第二次报的那张截图。
 * 扫描线分带没有这个结构性缺陷：每一带的上下界就是旋转矩形在该带内的真实上下界，
 * 端头自然收成尖角，残余误差只剩带内的阶梯锯齿，量级是带宽本身。
 *
 * 6px 与更小的带宽在当前尺寸下结果相同，因为砖数先撞上 MAX_TILES。
 */
const TARGET_BAND_PX = 6;

/**
 * 单个障碍的砖数上限。
 * 静态刚体很便宜（Phaser 对静态体走 RTree 查询），一关 8 个掩体 × 24 块约 190 个静态体，
 * 对 Arcade 完全无压力。上限的作用是给超长墙体一个确定的成本天花板。
 */
const MAX_TILES = 24;

/** 旋转矩形的四个世界坐标角点，顺时针。 */
function rotatedCorners(
  centerX: number,
  centerY: number,
  width: number,
  height: number,
  rotationRad: number,
): Array<[number, number]> {
  const cos = Math.cos(rotationRad);
  const sin = Math.sin(rotationRad);
  const half: Array<[number, number]> = [
    [-width / 2, -height / 2],
    [width / 2, -height / 2],
    [width / 2, height / 2],
    [-width / 2, height / 2],
  ];
  return half.map(([lx, ly]) => [
    centerX + lx * cos - ly * sin,
    centerY + lx * sin + ly * cos,
  ]);
}

/**
 * 用一条半平面裁剪凸多边形（Sutherland–Hodgman）。
 * `signedDistance` 返回正数表示该点保留。
 */
function clipConvex(
  polygon: Array<[number, number]>,
  signedDistance: (point: [number, number]) => number,
): Array<[number, number]> {
  const output: Array<[number, number]> = [];
  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index];
    const next = polygon[(index + 1) % polygon.length];
    const currentInside = signedDistance(current) >= 0;
    const nextInside = signedDistance(next) >= 0;
    if (currentInside) output.push(current);
    if (currentInside !== nextInside) {
      const a = signedDistance(current);
      const b = signedDistance(next);
      const t = a / (a - b);
      output.push([
        current[0] + (next[0] - current[0]) * t,
        current[1] + (next[1] - current[1]) * t,
      ]);
    }
  }
  return output;
}

/**
 * 把一个旋转矩形铺成一串轴对齐碰撞砖。
 *
 * 存在理由：Arcade Physics 的静态刚体**不能旋转**。原先的做法是取整个旋转矩形的
 * 包围盒当刚体，于是斜放的掩体占位显著大于贴图——45 度时包围盒面积是矩形本身的
 * 2.38 倍，子弹和玩家会在离墙半个身位的空地上被挡住。
 *
 * 做法是**扫描线分带**：沿包围盒较长的那一维切成等宽带，每一带取旋转矩形在该带内的
 * 真实上下界当砖。三条性质按重要性排列：
 *
 * 1. **不漏**。每一带的砖恰好包住「旋转矩形 ∩ 该带」，所以并集必然覆盖整个旋转矩形，
 *    不会出现子弹或僵尸从中间穿过去的缝。因此砖只会取大不取小，不做任何向内取整。
 * 2. **端头收尖**。这是它相对「沿长轴切片」的关键优势：长条两端的砖跟着矩形收成尖角，
 *    而不是留下一整块方形的空气墙（实测最大探出从 34px 降到 4~6px）。
 * 3. **轴对齐时退化为精确解**。0 / 90 / 180 / 270 度只出一块砖，与最初的行为逐值一致，
 *    因此关卡里那些正交摆放的掩体碰撞完全没变。
 */
export function buildRotatedRectTiles(
  centerX: number,
  centerY: number,
  width: number,
  height: number,
  rotationDegrees = 0,
): AabbTile[] {
  const normalized = ((rotationDegrees % 180) + 180) % 180;
  const nearAxis = Math.min(
    normalized,
    Math.abs(normalized - 90),
    Math.abs(normalized - 180),
  ) <= AXIS_ALIGNED_EPSILON_DEG;
  if (nearAxis) {
    const size = getRotatedAabbSize(width, height, rotationDegrees);
    return [{ x: centerX, y: centerY, width: size.width, height: size.height }];
  }

  const polygon = rotatedCorners(centerX, centerY, width, height, rotationDegrees * Math.PI / 180);
  const xs = polygon.map((point) => point[0]);
  const ys = polygon.map((point) => point[1]);
  const spanX = Math.max(...xs) - Math.min(...xs);
  const spanY = Math.max(...ys) - Math.min(...ys);
  // 沿较长的那一维分带：阶梯锯齿留在较短的一维上，砖数与误差都更小。
  const vertical = spanX >= spanY;
  const low = vertical ? Math.min(...xs) : Math.min(...ys);
  const span = vertical ? spanX : spanY;
  const count = Math.max(1, Math.min(MAX_TILES, Math.ceil(span / TARGET_BAND_PX)));
  const bandWidth = span / count;

  const tiles: AabbTile[] = [];
  for (let index = 0; index < count; index += 1) {
    const start = low + bandWidth * index;
    const end = start + bandWidth;
    const axisOf = (point: [number, number]) => (vertical ? point[0] : point[1]);
    let band = clipConvex(polygon, (point) => axisOf(point) - start);
    if (band.length > 0) band = clipConvex(band, (point) => end - axisOf(point));
    if (band.length < 3) continue;

    const cross = band.map((point) => (vertical ? point[1] : point[0]));
    const crossLow = Math.min(...cross);
    const crossHigh = Math.max(...cross);
    if (crossHigh <= crossLow) continue;

    tiles.push(vertical
      ? {
        x: (start + end) / 2,
        y: (crossLow + crossHigh) / 2,
        width: bandWidth,
        height: crossHigh - crossLow,
      }
      : {
        x: (crossLow + crossHigh) / 2,
        y: (start + end) / 2,
        width: crossHigh - crossLow,
        height: bandWidth,
      });
  }
  return tiles;
}


/**
 * 线段是否与轴对齐碰撞砖相交（slab 法）。
 *
 * 扇形火焰用它做遮挡判定：弹丸时代玩家躲在掩体后就淋不到火，
 * 扇形如果只判角度和距离就会隔墙烧人，掩体直接失效。
 */
export function segmentIntersectsAabb(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  tile: AabbTile,
): boolean {
  const left = tile.x - tile.width / 2;
  const right = tile.x + tile.width / 2;
  const top = tile.y - tile.height / 2;
  const bottom = tile.y + tile.height / 2;

  let enter = 0;
  let exit = 1;
  const dx = x2 - x1;
  const dy = y2 - y1;

  // 每个轴各裁一次：平行于该轴时只需判断起点是否已在带内。
  const axes: Array<[number, number, number, number]> = [
    [dx, x1, left, right],
    [dy, y1, top, bottom],
  ];
  for (const [delta, origin, low, high] of axes) {
    if (delta === 0) {
      if (origin < low || origin > high) return false;
      continue;
    }
    let near = (low - origin) / delta;
    let far = (high - origin) / delta;
    if (near > far) [near, far] = [far, near];
    if (near > enter) enter = near;
    if (far < exit) exit = far;
    if (enter > exit) return false;
  }
  return true;
}
