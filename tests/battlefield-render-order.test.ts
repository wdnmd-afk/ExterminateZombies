import { describe, expect, it, vi } from 'vitest';
import { BATTLEFIELD_BITMAP_THEME_IDS, BATTLEFIELD_TILE_SETS } from '../src/config/environmentTextures';
import { DEPTH } from '../src/constants';
import { renderBattlefield } from '../src/systems/BattlefieldRenderer';

interface DisplayRecord {
  type: string;
  depth: number;
  texture?: string;
  operations: string[];
}

function createScene(missing: string | null = null) {
  const objects: DisplayRecord[] = [];
  const createObject = (type: string, texture?: string) => {
    const record: DisplayRecord = { type, texture, depth: 0, operations: [] };
    objects.push(record);
    const chain = new Proxy({}, {
      get: (_target, method) => (...arguments_: unknown[]) => {
        if (method === 'setDepth') record.depth = arguments_[0] as number;
        else record.operations.push(String(method));
        return chain;
      },
    });
    return chain;
  };
  const scene = {
    textures: { exists: (key: string) => key !== missing },
    add: {
      graphics: () => createObject('graphics'),
      tileSprite: (_x: number, _y: number, _width: number, _height: number, texture: string) => createObject('tile', texture),
      image: (_x: number, _y: number, texture: string) => createObject('image', texture),
    },
  } as unknown as Parameters<typeof renderBattlefield>[0];
  return { scene, objects };
}

describe('战场位图与战术叠加绘制层级', () => {
  it.each(BATTLEFIELD_BITMAP_THEME_IDS)('%s 的战术叠加高于环境位图，低于战斗对象', (theme) => {
    const { scene, objects } = createScene();
    renderBattlefield(scene, theme === 'endless' ? 'endless' : 'level', theme === 'endless' ? null : theme);
    const graphics = objects.find(object => object.type === 'graphics')!;
    const bitmaps = objects.filter(object => object.texture);
    expect(bitmaps.length).toBeGreaterThanOrEqual(5);
    expect(graphics.operations.length).toBeGreaterThan(0);
    expect(graphics.depth).toBeGreaterThan(Math.max(...bitmaps.map(object => object.depth)));
    expect(graphics.depth).toBeLessThan(DEPTH.lingerZone);
  });

  it.each(['ground', 'rail', 'boundary'] as const)('缺少 %s 时整组回退，不残留半套位图', (layer) => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { scene, objects } = createScene(BATTLEFIELD_TILE_SETS.level_2[layer].textureKey);
      renderBattlefield(scene, 'level', 'level_2');
      expect(objects).toHaveLength(1);
      expect(objects[0].depth).toBe(DEPTH.ground);
      expect(objects[0].operations.length).toBeGreaterThan(0);
      expect(warning).toHaveBeenCalledOnce();
    } finally {
      warning.mockRestore();
    }
  });
});
