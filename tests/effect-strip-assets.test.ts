import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  EFFECT_ASSET_KEYS,
  EFFECT_TEXTURE_LAYOUTS,
  getEffectLayout,
  type EffectAssetKey,
} from '../src/config/effectVisuals';

/**
 * 特效帧条的**交付**不变量，而不是配置自洽性。
 *
 * 存在理由是一次真实的静默失效：`GameAssetManager.prepareEffectFrames` 在帧条宽度与
 * 登记值不符时只 `console.warn` 然后 `continue`，`prepareEffectAnimations` 随即因为
 * 缺末帧而跳过建动画，`EffectSpritePool.has` 于是返回 false，调用方自动退回图元路径。
 * 整条链每一环都"正确地"降级了，结果是屏幕上出现一块纯色圆——而配置校验、类型检查
 * 和既有测试全部通过，因为数据表自己始终是自洽的。
 *
 * 所以这里必须读磁盘上 PNG 的真实像素尺寸去比对数据表，把那条只在浏览器控制台里
 * 出现一行 warn 的失效，前移成 `npm test` 的红。
 */

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** 纹理键 -> `src/assets/processed/effects` 下的文件名，与 PreloadScene 的 import 一一对应。 */
const EFFECT_STRIP_FILES = {
  [EFFECT_ASSET_KEYS.flameJet]: 'flame-jet.png',
  [EFFECT_ASSET_KEYS.flameBlob]: 'flame-blob.png',
  [EFFECT_ASSET_KEYS.firePatch]: 'fire-patch.png',
  [EFFECT_ASSET_KEYS.muzzleHeavy]: 'muzzle-heavy.png',
  [EFFECT_ASSET_KEYS.muzzleRifle]: 'muzzle-rifle.png',
  [EFFECT_ASSET_KEYS.muzzleShotgun]: 'muzzle-shotgun.png',
  [EFFECT_ASSET_KEYS.smokePuff]: 'smoke-puff.png',
  [EFFECT_ASSET_KEYS.explosion]: 'explosion.png',
  [EFFECT_ASSET_KEYS.dustCloud]: 'dust-cloud.png',
} satisfies Record<EffectAssetKey, string>;

function readPngSize(buffer: Buffer): { width: number; height: number } {
  expect(buffer.subarray(12, 16).toString('ascii')).toBe('IHDR');
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function stripPath(fileName: string): string {
  return fileURLToPath(new URL(`../src/assets/processed/effects/${fileName}`, import.meta.url));
}

describe('特效帧条资产交付', () => {
  it('每个登记的纹理键都有对应的帧条文件', () => {
    // satisfies 已保证编译期全覆盖；这条在运行时再确认一次数量，
    // 防止有人用 `as` 绕过类型检查往表里塞键。
    expect(Object.keys(EFFECT_STRIP_FILES)).toHaveLength(EFFECT_TEXTURE_LAYOUTS.length);
  });

  it.each(EFFECT_TEXTURE_LAYOUTS.map((layout) => [layout.textureKey] as const))(
    '%s 的帧条尺寸正好是 frameWidth×frameCount，切帧不会被静默跳过',
    (textureKey) => {
      const layout = getEffectLayout(textureKey);
      const path = stripPath(EFFECT_STRIP_FILES[textureKey]);
      expect(existsSync(path)).toBe(true);

      const buffer = readFileSync(path);
      expect(buffer.subarray(0, 8)).toEqual(PNG_MAGIC);

      // 这两条正是 prepareEffectFrames 的切帧前提：宽度必须整除成 frameCount 帧，
      // 高度必须等于 frameHeight，否则末帧缺失、动画不建、表现退回图元。
      expect(readPngSize(buffer)).toEqual({
        width: layout.frameWidth * layout.frameCount,
        height: layout.frameHeight,
      });
    },
  );

  it('帧条文件互不复用，每种特效都是独立素材', () => {
    const files = Object.values(EFFECT_STRIP_FILES);
    expect(new Set(files).size).toBe(files.length);
  });
});
