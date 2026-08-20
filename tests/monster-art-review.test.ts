import { describe, expect, it } from 'vitest';
import { GAME_HEIGHT, GAME_WIDTH } from '../src/constants';
import {
  REVIEW_COLUMNS,
  REVIEW_DIRECTIONS,
  REVIEW_PER_DIRECTION,
  REVIEW_PER_TYPE,
  REVIEW_ROWS,
  buildMonsterReviewEnemies,
  buildMonsterReviewPlacements,
  getMonsterReviewTypeOrder,
} from '../src/config/monsterArtReview';
import { ZOMBIES, isBossZombie } from '../src/config/zombies';

describe('美术检阅波摆位', () => {
  const order = getMonsterReviewTypeOrder();
  const placements = buildMonsterReviewPlacements();

  it('覆盖全部感染体类型，不重不漏', () => {
    expect(order).toHaveLength(Object.keys(ZOMBIES).length);
    expect(new Set(order).size).toBe(order.length);
  });

  it('普通感染体排在全部 Boss 之前', () => {
    const firstBoss = order.findIndex((id) => isBossZombie(id));
    const lastNormal = order.reduce(
      (last, id, index) => (isBossZombie(id) ? last : index),
      -1,
    );
    expect(firstBoss).toBeGreaterThan(lastNormal);
  });

  it('网格恰好被填满，没有空格也没有溢出', () => {
    expect(REVIEW_COLUMNS * REVIEW_ROWS).toBe(order.length * REVIEW_PER_TYPE);
    expect(placements).toHaveLength(order.length * REVIEW_PER_TYPE);
  });

  it('每类每个朝向各两只', () => {
    for (const typeId of order) {
      const mine = placements.filter((entry) => entry.typeId === typeId);
      expect(mine).toHaveLength(REVIEW_PER_TYPE);
      for (const direction of REVIEW_DIRECTIONS) {
        expect(mine.filter((entry) => entry.facing === direction))
          .toHaveLength(REVIEW_PER_DIRECTION);
      }
    }
  });

  it('同类内序号连续且唯一', () => {
    for (const typeId of order) {
      const indexes = placements
        .filter((entry) => entry.typeId === typeId)
        .map((entry) => entry.indexInType)
        .sort((a, b) => a - b);
      expect(indexes).toEqual([...Array(REVIEW_PER_TYPE).keys()]);
    }
  });

  it('全部落在战场内，且互不同格', () => {
    const seen = new Set<string>();
    for (const entry of placements) {
      expect(entry.x).toBeGreaterThan(0);
      expect(entry.x).toBeLessThan(GAME_WIDTH);
      expect(entry.y).toBeGreaterThan(0);
      expect(entry.y).toBeLessThan(GAME_HEIGHT);
      const cell = `${entry.x},${entry.y}`;
      expect(seen.has(cell)).toBe(false);
      seen.add(cell);
    }
  });

  it('同朝向的两只相邻，便于逐帧比对', () => {
    for (const typeId of order) {
      const mine = placements
        .filter((entry) => entry.typeId === typeId)
        .sort((a, b) => a.indexInType - b.indexInType);
      for (let i = 0; i < mine.length; i += REVIEW_PER_DIRECTION) {
        const group = mine.slice(i, i + REVIEW_PER_DIRECTION);
        expect(new Set(group.map((entry) => entry.facing)).size).toBe(1);
      }
    }
  });

  it('敌群条目总只数与摆位表一致', () => {
    const enemies = buildMonsterReviewEnemies();
    expect(enemies).toHaveLength(order.length);
    expect(enemies.reduce((sum, entry) => sum + entry.count, 0)).toBe(placements.length);
    for (const entry of enemies) {
      expect(entry.count).toBe(REVIEW_PER_TYPE);
    }
  });
});
