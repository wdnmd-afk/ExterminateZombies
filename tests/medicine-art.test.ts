import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MEDICINES, MEDICINE_IDS, type MedicineId } from '../src/config/medicine';
// 从纯数据键表导入，而不是 systems 下的 Phaser 运行时模块：后者一被 import 就会
// 触碰 window，在 node 环境下整个测试文件加载失败。
import { MEDICINE_TEXTURE_KEYS } from '../src/config/environmentTextures';

/**
 * 药品图标走「原始文件直接加载」而不是 `scripts/` 派生管线：三张源图本身就是 32×32
 * 单图标，HUD 与掉落物都按 1:1 原生尺寸显示。因此没有派生产物可校验，必须直接盯住
 * 原始文件的存在性与尺寸——一旦有人挪动或替换成非 32×32 的图，1:1 的前提就失效，
 * 表现是 HUD 图标被非整数缩放糊掉，而不会报错。
 */
const MEDICINE_ICON_SOURCES = {
  bandage: 'downloaded/environment/airos-medical-items-32x32/bandage_32x32.png',
  medkit: 'downloaded/environment/airos-medical-items-32x32/first_aid_kit_32x32.png',
  energy_drink: 'downloaded/environment/airos-food-items-32x32/purple_drink_32x32.png',
} satisfies Record<MedicineId, string>;

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function readPngSize(buffer: Buffer): { width: number; height: number } {
  // IHDR 必须是第一个块：8 字节签名 + 4 长度 + 4 类型，宽高各 4 字节大端。
  expect(buffer.subarray(12, 16).toString('ascii')).toBe('IHDR');
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

describe('药品图标资产', () => {
  it('三种药品各有独立图标纹理键，互不复用', () => {
    const keys = MEDICINE_IDS.map((id) => MEDICINE_TEXTURE_KEYS[id]);
    expect(keys).toHaveLength(3);
    expect(new Set(keys).size).toBe(3);
  });

  it('三张 32×32 源图存在且是真实 PNG', () => {
    for (const medicineId of MEDICINE_IDS) {
      const assetUrl = new URL(
        `../src/assets/${MEDICINE_ICON_SOURCES[medicineId]}`,
        import.meta.url,
      );
      const assetPath = fileURLToPath(assetUrl);
      expect(existsSync(assetPath)).toBe(true);

      const buffer = readFileSync(assetPath);
      expect(buffer.subarray(0, 8)).toEqual(PNG_MAGIC);
      // 32×32 是 HUD `MEDICINE_ICON_SIZE` 与掉落物 32×32 显示尺寸的共同前提。
      expect(readPngSize(buffer)).toEqual({ width: 32, height: 32 });
    }
  });

  it('每个药品的强调色仍是有效 24 位色值', () => {
    for (const medicineId of MEDICINE_IDS) {
      const { color } = MEDICINES[medicineId];
      expect(Number.isInteger(color)).toBe(true);
      expect(color).toBeGreaterThanOrEqual(0);
      expect(color).toBeLessThanOrEqual(0xffffff);
    }
  });
});
