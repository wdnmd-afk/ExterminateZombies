import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { UI_ASSET_KEYS } from '../src/config/uiVisuals';
import { createBitmapFrame } from '../src/ui/bitmapFrame';

function createScene(exists = true) {
  const frames = new Map<string, number[]>();
  const pieces: Array<{ x: number; y: number; width: number; height: number; frame: string }> = [];
  const scene = {
    textures: {
      exists: () => exists,
      get: () => ({ has: (key: string) => frames.has(key), add: (key: string, ...args: number[]) => frames.set(key, args) }),
    },
    add: {
      image: (x: number, y: number, _key: string, frame: string) => {
        const image = {
          x, y, width: 0, height: 0, frame,
          setOrigin: () => image,
          setDisplaySize: (width: number, height: number) => { image.width = width; image.height = height; return image; },
          setTint: () => image,
        };
        pieces.push(image);
        return image;
      },
      container: (x: number, y: number, list: unknown[]) => {
        const container = { x, y, list, setAlpha: () => container };
        return container;
      },
    },
  } as unknown as Parameters<typeof createBitmapFrame>[0];
  return { scene, frames, pieces };
}

describe('共享 UI 位图', () => {
  it('八块边框保留固定角尺寸，不覆盖中心，也不创建额外命中区', () => {
    const { scene, frames, pieces } = createScene();
    const frame = createBitmapFrame(scene, 120, 90, 276, 52, 0xffffff);
    expect(frame).toMatchObject({ x: 120, y: 90 });
    expect(frame?.input).toBeUndefined();
    expect(pieces).toHaveLength(8);
    expect(frames.has('border-1-1')).toBe(false);
    expect(pieces[0]).toMatchObject({ x: -138, y: -26, width: 8, height: 8 });
    expect(pieces.at(-1)).toMatchObject({ x: 130, y: 18, width: 8, height: 8 });
    expect([...frames.values()][0]).toEqual([0, 0, 0, 8, 8]);
    createBitmapFrame(scene, 0, 0, 300, 60, 0xffffff);
    expect(frames.size).toBe(8);
  });

  it('小尺寸没有负宽高，纹理丢失只回退到调用者底框', () => {
    const { scene, pieces } = createScene();
    createBitmapFrame(scene, 0, 0, 10, 6, 0xffffff);
    expect(pieces.every(piece => piece.width > 0 && piece.height > 0)).toBe(true);
    const missing = createScene(false);
    expect(createBitmapFrame(missing.scene, 0, 0, 100, 50, 0xffffff)).toBeNull();
    expect(missing.pieces).toHaveLength(0);
  });

  it.each(Object.entries(UI_ASSET_KEYS))('%s 的实际 PNG 存在且关键图尺寸正确', (name, key) => {
    const filename = key.replace(/^ui-/, '') + '.png';
    const bytes = readFileSync(new URL(`../src/assets/processed/ui/${filename}`, import.meta.url));
    expect(bytes.subarray(1, 4).toString()).toBe('PNG');
    expect(bytes.readUInt32BE(16)).toBeGreaterThan(0);
    expect(bytes.readUInt32BE(20)).toBeGreaterThan(0);
    if (name === 'panelFrame') expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([48, 48]);
    if (name.startsWith('icon')) expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([24, 24]);
  });
});
