import { describe, expect, it } from 'vitest';
import { ENHANCEMENTS } from '../src/config/enhancements';
import {
  ARCHETYPE_MIN_CARDS,
  ENHANCEMENT_ARCHETYPES,
  countActiveInArchetype,
  countCardsInArchetype,
  getArchetypeDef,
  resolveCardArchetypes,
} from '../src/config/enhancementArchetypes';

describe('强化流派定义', () => {
  it('三个流派 id、名称与配色互不重复', () => {
    const ids = ENHANCEMENT_ARCHETYPES.map((def) => def.id);
    const labels = ENHANCEMENT_ARCHETYPES.map((def) => def.label);
    const accents = ENHANCEMENT_ARCHETYPES.map((def) => def.accent);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(labels).size).toBe(labels.length);
    expect(new Set(accents).size).toBe(accents.length);
  });

  it('每个流派都有名称与打法说明', () => {
    for (const def of ENHANCEMENT_ARCHETYPES) {
      expect(def.label.trim().length).toBeGreaterThan(0);
      expect(def.playstyle.trim().length).toBeGreaterThan(0);
    }
  });

  it('每个流派在卡池里都有足够卡支撑，能真正凑成一套', () => {
    // R2-1 要求「每个流派至少包含 3 张相互支持的卡」。
    // 这条用例是该要求的门禁：删卡或改机制字段导致某流派凑不满时立即失败。
    for (const def of ENHANCEMENT_ARCHETYPES) {
      expect(
        countCardsInArchetype(def.id),
        `${def.label} 流派卡数不足 ${ARCHETYPE_MIN_CARDS} 张，玩家无法凑成这一套`,
      ).toBeGreaterThanOrEqual(ARCHETYPE_MIN_CARDS);
    }
  });

  it('getArchetypeDef 对未知 id 抛错而不是静默返回空值', () => {
    // @ts-expect-error 故意传入非法 id，验证配置错误会立即暴露。
    expect(() => getArchetypeDef('not_a_real_archetype')).toThrow();
  });
});

describe('流派从 effects 推导', () => {
  it('按机制字段归类，不依赖手工标签', () => {
    // 处决回响带 setKillExplosion → 爆炸连锁。
    expect(resolveCardArchetypes(ENHANCEMENTS.pistol_magnum)).toContain('killChain');
    // 弹链地狱带 setAmmoChain → 弹链爆发。
    expect(resolveCardArchetypes(ENHANCEMENTS.smg_penetration)).toContain('ammoChain');
  });

  it('纯数值/纯改造卡不属于任何流派', () => {
    // 连射改造只有 setToAuto + fireRateFactor，没有任何流派机制字段。
    expect(resolveCardArchetypes(ENHANCEMENTS.pistol_auto)).toEqual([]);
  });

  it('没有卡同时携带两个签名效果，三个流派池因此天然不重叠', () => {
    // 这是流派可辨识的前提：一张卡若同时给击杀爆炸和标记，玩家就无法从卡面读出它属于哪条路线。
    // 当前卡池恰好满足；新增卡若破坏该性质会在此暴露，而不是让卡面徽标显示两个流派。
    const signatures = ['setKillExplosion', 'setMarkOnHit', 'setAmmoChain'] as const;
    for (const [id, def] of Object.entries(ENHANCEMENTS)) {
      const carried = signatures.filter((key) => def.effects[key] !== undefined);
      expect(carried.length, `${id} 同时携带签名效果 ${carried.join('/')}`).toBeLessThanOrEqual(1);
      expect(resolveCardArchetypes(def).length).toBe(carried.length);
    }
  });

  it('推导结果只包含已登记的流派 id', () => {
    const known = new Set(ENHANCEMENT_ARCHETYPES.map((def) => def.id));
    for (const def of Object.values(ENHANCEMENTS)) {
      for (const id of resolveCardArchetypes(def)) {
        expect(known.has(id), `${def.id} 推导出未登记流派 ${id}`).toBe(true);
      }
    }
  });
});

describe('流派进度统计', () => {
  it('空构筑时各流派进度为 0', () => {
    for (const def of ENHANCEMENT_ARCHETYPES) {
      expect(countActiveInArchetype(def.id, new Set())).toBe(0);
    }
  });

  it('只数属于该流派的已激活卡', () => {
    const active = new Set(['pistol_magnum', 'pistol_auto', 'smg_penetration']);
    // pistol_magnum 属爆炸连锁，pistol_auto 不属任何流派。
    expect(countActiveInArchetype('killChain', active)).toBe(1);
    expect(countActiveInArchetype('ammoChain', active)).toBe(1);
  });

  it('未知强化 id 被跳过，脏数据不影响进度统计', () => {
    const active = new Set(['pistol_magnum', 'not_a_real_enhancement']);
    expect(countActiveInArchetype('killChain', active)).toBe(1);
  });

  it('单流派进度不超过卡池里该流派的总卡数', () => {
    for (const def of ENHANCEMENT_ARCHETYPES) {
      const all = new Set(Object.keys(ENHANCEMENTS));
      expect(countActiveInArchetype(def.id, all)).toBe(countCardsInArchetype(def.id));
    }
  });
});
