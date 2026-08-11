import { describe, expect, it } from 'vitest';
import { MONSTER_LIBRARY, getMonsterDropLines } from '../src/config/monsterLibrary';
import { ZOMBIES, type ZombieId } from '../src/config/zombies';
import {
  ZOMBIE_ACTION_TEXTURE_LAYOUTS,
  ZOMBIE_VISUALS,
  getZombieFrameSize,
} from '../src/config/zombieVisuals';
import {
  MONSTER_PREVIEW_CENTER,
  MONSTER_PREVIEW_BOX,
  MONSTER_PREVIEW_PLANE,
  MONSTER_PREVIEW_SCALE,
  getMonsterPreviewBounds,
  resolveMonsterPreviewScale,
} from '../src/systems/MonsterPreviewLayout';

const ALL_ZOMBIE_IDS = Object.keys(ZOMBIES) as ZombieId[];

const SAFE_PREVIEW_BOUNDS = {
  top: MONSTER_PREVIEW_CENTER.y - MONSTER_PREVIEW_BOX.height / 2,
  bottom: MONSTER_PREVIEW_CENTER.y + MONSTER_PREVIEW_BOX.height / 2,
  left: MONSTER_PREVIEW_CENTER.x - MONSTER_PREVIEW_BOX.width / 2,
  right: MONSTER_PREVIEW_CENTER.x + MONSTER_PREVIEW_BOX.width / 2,
};

/** 从移动条全部帧的 alpha 通道核实；坐标为右/下边界不包含的并集像素框。 */
const INDEPENDENT_BOSS_ALPHA_BOUNDS = {
  tank_boss: { left: 12, top: 8, right: 68, bottom: 72 },
  hunter_boss: { left: 4, top: 8, right: 60, bottom: 64 },
  matriarch_boss: { left: 1, top: 6, right: 63, bottom: 59 },
} as const;

describe('怪物图鉴预览布局', () => {
  it('每个感染体都有可查的源帧尺寸', () => {
    for (const id of ALL_ZOMBIE_IDS) {
      const frame = getZombieFrameSize(id);
      expect(frame.width, `${id} 帧宽异常`).toBeGreaterThan(0);
      expect(frame.height, `${id} 帧高异常`).toBeGreaterThan(0);
    }
  });

  it('任何感染体的预览精灵都不会溢出内部安全框', () => {
    // 溢出不会报错，只会静默盖住上方的档案名称、代号行和简介——
    // 精灵在这些文字之后创建，会直接压在它们上面。
    for (const id of ALL_ZOMBIE_IDS) {
      const bounds = getMonsterPreviewBounds(id);
      expect(bounds.top, `${id} 预览精灵从上沿溢出`).toBeGreaterThanOrEqual(SAFE_PREVIEW_BOUNDS.top);
      expect(bounds.bottom, `${id} 预览精灵从下沿溢出`).toBeLessThanOrEqual(SAFE_PREVIEW_BOUNDS.bottom);
      expect(bounds.left, `${id} 预览精灵从左沿溢出`).toBeGreaterThanOrEqual(SAFE_PREVIEW_BOUNDS.left);
      expect(bounds.right, `${id} 预览精灵从右沿溢出`).toBeLessThanOrEqual(SAFE_PREVIEW_BOUNDS.right);
    }
  });

  it('内部安全框始终位于预览底板内', () => {
    expect(MONSTER_PREVIEW_BOX.width).toBeLessThan(MONSTER_PREVIEW_PLANE.width);
    expect(MONSTER_PREVIEW_BOX.height).toBeLessThan(MONSTER_PREVIEW_PLANE.height);
  });

  it('小体型感染体保持期望倍率，只有会超框的才被压回', () => {
    for (const id of ['walker', 'runner', 'feral', 'crawler', 'oddity'] as const) {
      expect(resolveMonsterPreviewScale(id), `${id} 不该被压缩`)
        .toBeCloseTo(ZOMBIE_VISUALS[id].scale * MONSTER_PREVIEW_SCALE);
    }

    // 三个大体型独立 Boss 的战斗缩放远超底板容量，必须被压回。
    for (const id of ['tank_boss', 'hunter_boss', 'matriarch_boss'] as const) {
      expect(resolveMonsterPreviewScale(id), `${id} 应当被压回底板内`)
        .toBeLessThan(ZOMBIE_VISUALS[id].scale * MONSTER_PREVIEW_SCALE);
    }
  });

  it('三个大体型独立 Boss 的非透明轴向范围都落在碰撞圆内', () => {
    for (const id of Object.keys(INDEPENDENT_BOSS_ALPHA_BOUNDS) as Array<keyof typeof INDEPENDENT_BOSS_ALPHA_BOUNDS>) {
      const visual = ZOMBIE_VISUALS[id];
      const frame = getZombieFrameSize(id);
      const source = INDEPENDENT_BOSS_ALPHA_BOUNDS[id];
      const bounds = {
        left: (source.left - frame.width / 2) * visual.scale,
        right: (source.right - frame.width / 2) * visual.scale,
        top: (source.top - frame.height * visual.originY) * visual.scale,
        bottom: (source.bottom - frame.height * visual.originY) * visual.scale,
      };
      const radius = ZOMBIES[id].radius;
      const centerY = visual.collisionOffsetY;

      expect(bounds.left, `${id} 左侧可见像素超出碰撞圆`).toBeGreaterThanOrEqual(-radius);
      expect(bounds.right, `${id} 右侧可见像素超出碰撞圆`).toBeLessThanOrEqual(radius);
      expect(bounds.top, `${id} 上侧可见像素超出碰撞圆`).toBeGreaterThanOrEqual(centerY - radius);
      expect(bounds.bottom, `${id} 下侧可见像素超出碰撞圆`).toBeLessThanOrEqual(centerY + radius);
    }
  });

  it('碰撞圆宽度不显著超过精灵可见宽度', () => {
    // 反向约束：radius 过大会让圆覆盖到精灵之外的空白，形成「打空气也算命中」。
    //
    // 肿胀者是全表唯一的历史离群项：帧 32×64 偏窄高，scale 0.9 只有 14.4px 可见半宽，
    // 而 radius 23 让两侧各约 8.6px 空白也算命中。它带死亡爆炸，调 radius 会动到平衡，
    // 因此这里只按当前值钉住——允许存在，但不允许继续变差。
    const LEGACY_WIDE_HITBOX: Partial<Record<ZombieId, number>> = { bloater: 1.6 };

    for (const id of ALL_ZOMBIE_IDS) {
      const visual = ZOMBIE_VISUALS[id];
      const frame = getZombieFrameSize(id);
      const displayHalfWidth = (frame.width * visual.scale) / 2;
      const allowedRatio = LEGACY_WIDE_HITBOX[id] ?? 1.35;
      expect(ZOMBIES[id].radius, `${id} 碰撞圆比精灵宽出太多`)
        .toBeLessThanOrEqual(displayHalfWidth * allowedRatio);
    }
  });

  it('四个 Boss 均使用互不重复的独立纹理', () => {
    const replacements = {
      tank_boss: 'tank',
      bomber_boss: 'bomber',
      hunter_boss: 'feral',
      matriarch_boss: 'bloater',
    } as const;
    const bossTextureKeys = Object.keys(replacements).map(
      (id) => ZOMBIE_VISUALS[id as keyof typeof replacements].textureKey,
    );

    expect(new Set(bossTextureKeys).size).toBe(bossTextureKeys.length);
    for (const [bossId, oldSourceId] of Object.entries(replacements)) {
      expect(ZOMBIE_VISUALS[bossId as keyof typeof replacements].textureKey)
        .not.toBe(ZOMBIE_VISUALS[oldSourceId as ZombieId].textureKey);
    }
  });

  it('已完成机制切片的 Boss 按原图网格登记攻击与死亡动作', () => {
    const tankActions = ZOMBIE_ACTION_TEXTURE_LAYOUTS.filter((layout) => layout.typeId === 'tank_boss');
    expect(tankActions).toHaveLength(2);
    expect(tankActions.find((layout) => layout.action === 'attack'))
      .toMatchObject({ frameCount: 7, sources: [{ frameWidth: 80, frameHeight: 80, columns: 7, frameCount: 7 }] });
    expect(tankActions.find((layout) => layout.action === 'death'))
      .toMatchObject({ frameCount: 15, sources: [{ frameWidth: 80, frameHeight: 80, columns: 3, frameCount: 15 }] });

    const bomberActions = ZOMBIE_ACTION_TEXTURE_LAYOUTS.filter((layout) => layout.typeId === 'bomber_boss');
    expect(bomberActions).toHaveLength(2);
    expect(bomberActions.find((layout) => layout.action === 'attack'))
      .toMatchObject({ frameCount: 8, sources: [{ frameWidth: 64, frameHeight: 64, columns: 8, frameCount: 8 }] });
    expect(bomberActions.find((layout) => layout.action === 'death'))
      .toMatchObject({ frameCount: 16, sources: [{ frameWidth: 64, frameHeight: 64, columns: 8, frameCount: 16 }] });

    const hunterActions = ZOMBIE_ACTION_TEXTURE_LAYOUTS.filter((layout) => layout.typeId === 'hunter_boss');
    expect(hunterActions).toHaveLength(2);
    expect(hunterActions.find((layout) => layout.action === 'attack'))
      .toMatchObject({ frameCount: 8, sources: [{ frameWidth: 64, frameHeight: 64, columns: 8, frameCount: 8 }] });
    expect(hunterActions.find((layout) => layout.action === 'death'))
      .toMatchObject({ frameCount: 16, sources: [{ frameCount: 8 }, { frameCount: 8 }] });

    const matriarchActions = ZOMBIE_ACTION_TEXTURE_LAYOUTS.filter((layout) => layout.typeId === 'matriarch_boss');
    expect(matriarchActions).toHaveLength(2);
    expect(matriarchActions.find((layout) => layout.action === 'attack'))
      .toMatchObject({ frameCount: 5, sources: [{ frameWidth: 64, frameHeight: 64, columns: 5, frameCount: 5 }] });
    expect(matriarchActions.find((layout) => layout.action === 'death'))
      .toMatchObject({ frameCount: 16, sources: [{ frameCount: 8 }, { frameCount: 8 }] });

    for (const layout of ZOMBIE_ACTION_TEXTURE_LAYOUTS) {
      expect(layout.sources.reduce((sum, source) => sum + source.frameCount, 0))
        .toBe(layout.frameCount);
    }
  });

  it('图鉴条目与感染体配置一一对应', () => {
    expect(MONSTER_LIBRARY.map((entry) => entry.id).sort())
      .toEqual([...ALL_ZOMBIE_IDS].sort());
  });

  it('档案代号不重复', () => {
    const codes = MONSTER_LIBRARY.map((entry) => entry.dossierCode);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('强化包掉落显示正式名称和概率，不会误报为无效武器', () => {
    const lines = getMonsterDropLines('walker');
    expect(lines).toContain('武器强化包 · 3%');
    expect(lines.some((line) => line.includes('配置异常'))).toBe(false);
  });
});
