import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GAME_HEIGHT, GAME_WIDTH } from '../src/constants';
import {
  BATTLEFIELD_TILE_SETS,
  ENVIRONMENT_TEXTURE_KEYS,
  getBattlefieldTileSet,
  getBitmapBattlefieldIds,
} from '../src/config/environmentTextures';

/**
 * 战场位图环境的**交付**不变量，而不是配置自洽性。
 *
 * 与 `tests/effect-strip-assets.test.ts` 同源同因：`BattlefieldRenderer` 在纹理缺失时
 * 只 `console.warn` 然后回退程序化绘制。那条回退是刻意设计的（其余九关本来就没有位图），
 * 但副作用是"第二关贴图没生成 / 尺寸不对 / 忘了在 PreloadScene 注册"这三类失效在运行时
 * 完全静默——屏幕上照样有画面，只是又变回程序化的那一版，而配置校验、类型检查和既有
 * 测试全部通过，因为数据表自己始终自洽。
 *
 * 所以这里读磁盘上 PNG 的真实像素尺寸去比对数据表，把只在控制台留一行 warn 的失效
 * 前移成 `npm test` 的红。
 */

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** 纹理键 -> `src/assets/processed/environment` 下的文件名，与 PreloadScene 的 import 一一对应。 */
const BATTLEFIELD_TILE_FILES: Record<string, string> = {
  [ENVIRONMENT_TEXTURE_KEYS.battlefieldLevel2Ground]: 'battlefield-level2-ground.png',
  [ENVIRONMENT_TEXTURE_KEYS.battlefieldLevel2Rail]: 'battlefield-level2-rail.png',
  [ENVIRONMENT_TEXTURE_KEYS.battlefieldLevel2Boundary]: 'battlefield-level2-boundary.png',
};

function readPngSize(buffer: Buffer): { width: number; height: number } {
  expect(buffer.subarray(12, 16).toString('ascii')).toBe('IHDR');
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function tilePath(fileName: string): string {
  return fileURLToPath(new URL(`../src/assets/processed/environment/${fileName}`, import.meta.url));
}

/** 把一个贴图集摊平成 [用途, 条目] 对，便于逐项断言。 */
function entriesOf(themeId: string) {
  const tileSet = getBattlefieldTileSet(themeId);
  expect(tileSet, `${themeId} 应有位图贴图集`).not.toBeNull();
  return Object.entries(tileSet!) as [string, { textureKey: string; width: number; height: number }][];
}

describe('战场位图环境资产交付', () => {
  it('第二关已登记位图环境', () => {
    expect(getBitmapBattlefieldIds()).toContain('level_2');
  });

  it('未登记位图的主题返回 null，渲染层据此回退程序化绘制', () => {
    // 这条锁住"其余九关不受影响"这个范围约束：G5-2 只做第二关。
    for (const themeId of ['level_1', 'level_3', 'level_10', 'endless']) {
      expect(getBattlefieldTileSet(themeId), `${themeId} 不应有位图贴图集`).toBeNull();
    }
  });

  it('每个登记的纹理键都有对应文件，且登记尺寸等于磁盘真实尺寸', () => {
    for (const themeId of getBitmapBattlefieldIds()) {
      for (const [role, entry] of entriesOf(themeId)) {
        const fileName = BATTLEFIELD_TILE_FILES[entry.textureKey];
        expect(fileName, `${themeId}.${role} 的纹理键未登记文件名`).toBeDefined();

        const path = tilePath(fileName);
        expect(existsSync(path), `缺少 ${fileName}`).toBe(true);

        const buffer = readFileSync(path);
        expect(buffer.subarray(0, 8)).toEqual(PNG_MAGIC);
        expect(readPngSize(buffer), `${themeId}.${role} 尺寸与登记不符`).toEqual({
          width: entry.width,
          height: entry.height,
        });
      }
    }
  });

  it('铁轨带与边界带横向覆盖整个画布，不留未铺满的缝', () => {
    for (const themeId of getBitmapBattlefieldIds()) {
      const tileSet = getBattlefieldTileSet(themeId)!;
      // 这两张在渲染层是按 1:1 直接贴的（不缩放），宽度小于画布就会在右侧露出底色。
      expect(tileSet.rail.width, `${themeId} 铁轨带宽度不足`).toBeGreaterThanOrEqual(GAME_WIDTH);
      expect(tileSet.boundary.width, `${themeId} 边界带宽度不足`).toBeGreaterThanOrEqual(
        GAME_WIDTH,
      );
    }
  });

  it('边界厚度与 drawWorldBoundary 的 20px 一致', () => {
    // 程序化回退版的边界是四边各 20px。位图版若厚度不同，
    // 两条路径切换时可玩区域的视觉宽度会跳变。
    for (const themeId of getBitmapBattlefieldIds()) {
      expect(getBattlefieldTileSet(themeId)!.boundary.height).toBe(20);
    }
  });

  it('第二关铁轨带高度与程序化版的 y=92..208 轨道带一致', () => {
    expect(BATTLEFIELD_TILE_SETS.level_2.rail.height).toBe(116);
  });

  it('地面基底是可平铺单元而不是整屏图', () => {
    // 地面由 TileSprite 铺满，只需一个单元。误把整屏图登记进来会让文件大几百倍，
    // 且 720 不被瓦片边长整除的残行问题会从运行时搬到磁盘上。
    for (const themeId of getBitmapBattlefieldIds()) {
      const ground = getBattlefieldTileSet(themeId)!.ground;
      expect(ground.width).toBeLessThan(GAME_WIDTH);
      expect(ground.height).toBeLessThan(GAME_HEIGHT);
      // 整数倍瓦片：ART_BIBLE §2 要求运行时缩放优先整数倍，源瓦片 16px 放大整数倍。
      expect(ground.width % 16).toBe(0);
      expect(ground.height % 16).toBe(0);
    }
  });

  it('贴图文件互不复用，三种用途各是独立素材', () => {
    const files = Object.values(BATTLEFIELD_TILE_FILES);
    expect(new Set(files).size).toBe(files.length);
  });
});
