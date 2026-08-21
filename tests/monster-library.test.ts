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

/**
 * 全部 14 类普通感染体共用的「帧尺寸 × 缩放 / 碰撞直径」区间。
 *
 * 这一条取代了原先只针对三个 Boss 的「非透明像素必须落在碰撞圆内」断言。
 * 那条断言钉的是第三方 Boss 素材的性质（精灵大小≈碰撞圆），而自生成素材统一遵循
 * 「可见长边 / 碰撞半径 ≈ 4.43」的既有约定——该约定下精灵长边约等于碰撞直径的
 * 2.2 倍，精灵刻意外溢于碰撞圆。两者不可能同时成立，而 8 类已验收的普通感染体
 * 早就在用后者，所以按后者统一。
 *
 * Boss 不套用这条区间：它们另有下限与外溢上限（见 zombieVisuals 的
 * resolveBossVisibleLongEdge），比值可以高到 5.0。Boss 的尺寸由同文件内
 * 「三个大体型 Boss 明显大于全部普通感染体，且外溢受上限约束」那条校验。
 *
 * 换成按帧尺寸算是为了让断言只依赖配置、不依赖离线量出的 alpha 像素框，代价是引入了
 * 一点松弛：主体在 512 帧里占 78%~85%（取决于体型是瘦长还是宽扁——oddity 最大主体
 * 只有 399px，stalker/bloater 等为 435px），所以同样遵循 4.43 约定的类型算出来的比值
 * 会落在 2.49~2.85 这个区间而不是一个点。取 [2.4, 2.9]：漏改缩放会差出成倍的量级，
 * 一定会被抓住，而体型带来的这点占比差异不会误报。
 */
const SPRITE_TO_HITBOX_RATIO = { min: 2.4, max: 2.9 };

describe('怪物图鉴预览布局', () => {
  it('每个感染体都有可查的源帧尺寸', () => {
    for (const id of ALL_ZOMBIE_IDS) {
      const frame = getZombieFrameSize(id);
      expect(frame.width, `${id} 帧宽异常`).toBeGreaterThan(0);
      expect(frame.height, `${id} 帧高异常`).toBeGreaterThan(0);
    }
  });

  it('任何感染体的预览精灵都不会溢出内部安全框', () => {
    // 溢出不会报错，只会静默盖住上方的档案名称和代号行——
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

  it('能容纳的小体型保持期望倍率，超框素材会被压回', () => {
    for (const id of ['runner', 'feral', 'crawler'] as const) {
      expect(resolveMonsterPreviewScale(id), `${id} 不该被压缩`)
        .toBeCloseTo(ZOMBIE_VISUALS[id].scale * MONSTER_PREVIEW_SCALE);
    }

    // 新 Walker 使用 1024×1024 高分辨率帧且 originY=0.62；按期望倍率预览会从
    // 150px 安全框上沿溢出，因此必须和大体型 Boss 一样受统一 fitScale 约束。
    expect(resolveMonsterPreviewScale('walker'))
      .toBeLessThan(ZOMBIE_VISUALS.walker.scale * MONSTER_PREVIEW_SCALE);

    // 重型普通感染体与大体型 Boss 的战斗缩放都超出底板容量，必须被压回。
    for (const id of ['tank', 'bloater', 'tank_boss', 'hunter_boss', 'matriarch_boss'] as const) {
      expect(resolveMonsterPreviewScale(id), `${id} 应当被压回底板内`)
        .toBeLessThan(ZOMBIE_VISUALS[id].scale * MONSTER_PREVIEW_SCALE);
    }
  });

  it('全部 14 类普通感染体都遵循同一条精灵与碰撞圆比例约定', () => {
    // 双向约束：比值过小说明精灵被画小了或漏改缩放，碰撞圆会覆盖精灵之外的空白，
    // 形成「打空气也算命中」；比值过大说明精灵远远盖过碰撞圆，玩家会以为被判定命中。
    // 关键价值是「同一条」——14 类共用一个区间，任何一类被单独调歪都会被抓出来。
    // Boss 另有下限与外溢上限，理由见 SPRITE_TO_HITBOX_RATIO。
    const normals = ALL_ZOMBIE_IDS.filter((id) => !id.includes('boss'));
    expect(normals.length, '普通感染体数量异常').toBe(14);

    for (const id of normals) {
      const visual = ZOMBIE_VISUALS[id];
      const frame = getZombieFrameSize(id);
      const ratio = (frame.width * visual.scale) / (ZOMBIES[id].radius * 2);
      expect(ratio, `${id} 精灵与碰撞圆的比例偏离全表约定`)
        .toBeGreaterThanOrEqual(SPRITE_TO_HITBOX_RATIO.min);
      expect(ratio, `${id} 精灵与碰撞圆的比例偏离全表约定`)
        .toBeLessThanOrEqual(SPRITE_TO_HITBOX_RATIO.max);
    }
  });

  it('三个大体型 Boss 明显大于全部普通感染体，且外溢受上限约束', () => {
    // 「Boss 要有压迫感」的可执行判据，与 zombieVisuals 的 resolveBossVisibleLongEdge 同源：
    //   可见长边 = clamp(半径 × 4.43, 下限 137px, 半径 × 5.0)
    // bomber_boss 不在此列：它的半径 18 是四个 Boss 最小的，被上限收口到 90px，
    // 刻意小于最大的普通感染体（tank 106px），理由见 BOSS_MAX_SPRITE_TO_RADIUS_RATIO。
    const visibleLongEdge = (id: ZombieId) =>
      getZombieFrameSize(id).width * ZOMBIE_VISUALS[id].scale;
    const largestNormal = Math.max(
      ...ALL_ZOMBIE_IDS.filter((id) => !id.includes('boss')).map(visibleLongEdge),
    );

    for (const id of ['tank_boss', 'hunter_boss', 'matriarch_boss'] as const) {
      expect(visibleLongEdge(id), `${id} 没有明显大于最大的普通感染体`)
        .toBeGreaterThan(largestNormal);
    }
    expect(visibleLongEdge('matriarch_boss'), 'matriarch_boss 应为全表最大')
      .toBe(Math.max(...ALL_ZOMBIE_IDS.map(visibleLongEdge)));

    // 外溢上限。与上面的 SPRITE_TO_HITBOX_RATIO 同一个按帧尺寸算的口径，所以也带
    // 同样的松弛：主体在帧里占 78%~85%，subject 级的 5.0 上限（= 精灵长边为碰撞直径
    // 的 2.5 倍）折算到帧口径是 2.5 / 0.78 ≈ 3.2。
    // 这条抓的是"为了显大而把精灵无限放大"——bomber_boss 在加上限前实测 subject 级
    // 比值 8.30、帧口径 5.24，远超此处的 3.25。
    for (const id of ALL_ZOMBIE_IDS.filter((z) => z.includes('boss'))) {
      const ratio = visibleLongEdge(id) / (ZOMBIES[id].radius * 2);
      expect(ratio, `${id} 精灵相对碰撞圆外溢过多，会让玩家看到大目标却打不中`)
        .toBeLessThanOrEqual(3.25);
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

  it('四个 Boss 的攻击与死亡动作都按自生成帧条登记', () => {
    // 自生成动作素材：攻击一条 4 帧，死亡两条各 4 帧，帧尺寸统一 512。
    // 帧数比第三方素材少是因为一次生成请求是一张 2×2 网格；帧率按「保持原有动作
    // 时长不变」反推，见 zombieVisuals 的 bossActionSources 注释。
    const BOSS_IDS = ['tank_boss', 'bomber_boss', 'hunter_boss', 'matriarch_boss'] as const;

    for (const id of BOSS_IDS) {
      const actions = ZOMBIE_ACTION_TEXTURE_LAYOUTS.filter((l) => l.typeId === id);
      expect(actions, `${id} 应登记攻击与死亡两项动作`).toHaveLength(2);
      expect(actions.find((l) => l.action === 'attack'), `${id} 攻击动作`).toMatchObject({
        frameCount: 4,
        sources: [{ frameWidth: 512, frameHeight: 512, columns: 4, frameCount: 4 }],
      });
      expect(actions.find((l) => l.action === 'death'), `${id} 死亡动作`).toMatchObject({
        frameCount: 8,
        sources: [
          { frameWidth: 512, frameHeight: 512, columns: 4, frameCount: 4 },
          { frameWidth: 512, frameHeight: 512, columns: 4, frameCount: 4 },
        ],
      });
    }

    // 死亡时长是 beginDeathAnimation 的实际等待时间，换素材不得改变它，
    // 否则 Boss 的死亡结算节奏会变。原值：tank 1250ms、bomber/hunter 1333ms、
    // matriarch 1600ms。
    const EXPECTED_DEATH_MS: Record<string, number> = {
      tank_boss: 1333, bomber_boss: 1333, hunter_boss: 1333, matriarch_boss: 1600,
    };
    for (const id of BOSS_IDS) {
      const death = ZOMBIE_ACTION_TEXTURE_LAYOUTS
        .find((l) => l.typeId === id && l.action === 'death')!;
      expect((death.frameCount / death.frameRate) * 1000, `${id} 死亡动画时长偏离换素材前`)
        .toBeCloseTo(EXPECTED_DEATH_MS[id], -2);
    }

    for (const layout of ZOMBIE_ACTION_TEXTURE_LAYOUTS) {
      expect(layout.sources.reduce((sum, source) => sum + source.frameCount, 0))
        .toBe(layout.frameCount);
    }
  });

  it('四个 Boss 的素材朝向修正统一为 0（自生成素材本就朝右）', () => {
    for (const id of ['tank_boss', 'bomber_boss', 'hunter_boss', 'matriarch_boss'] as const) {
      expect(ZOMBIE_VISUALS[id].rotationOffset, `${id} 不该再带第三方素材时期的朝向修正`)
        .toBe(0);
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

  it('每个档案都提供介绍与处置建议', () => {
    for (const entry of MONSTER_LIBRARY) {
      expect(entry.summary.trim(), `${entry.id} 缺少档案介绍`).not.toBe('');
      expect(entry.tactic.trim(), `${entry.id} 缺少处置建议`).not.toBe('');
    }
  });

  it('强化包掉落显示正式名称和概率，不会误报为无效武器', () => {
    const lines = getMonsterDropLines('walker');
    expect(lines).toContain('武器强化包 · 3%');
    expect(lines.some((line) => line.includes('配置异常'))).toBe(false);
  });
});
