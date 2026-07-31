import Phaser from 'phaser';
import { ENHANCEMENTS } from '../config/enhancements';
import type { EnhancementDef, EnhancementExclusionKey } from '../config/types';
import type { WeaponId } from '../config/weapons';

const DRAW_COUNT = 4; // 每次抽几张卡

/**
 * 负责从总卡池中，为玩家当前状态抽取有效、不冲突的增强选项。
 */
export class EnhancementManager {
  /**
   * @param ownedWeapons 玩家当前拥有的武器ID列表
   * @param activeEnhancements 玩家已激活的增强ID集合
   * @returns N张不冲突的增强选项
   */
  public static drawEnhancements(
    ownedWeapons: readonly WeaponId[],
    activeEnhancements: Readonly<Set<string>>,
  ): EnhancementDef[] {
    const availablePool = Object.values(ENHANCEMENTS).filter(
      (enhancement) => (
        ownedWeapons.includes(enhancement.weaponId as WeaponId)
        && !activeEnhancements.has(enhancement.id)
      ),
    );

    const drawn: EnhancementDef[] = [];
    const usedExclusionKeys = new Set<EnhancementExclusionKey>();
    const shuffledPool = Phaser.Utils.Array.Shuffle([...availablePool]);

    for (const enhancement of shuffledPool) {
      if (drawn.length >= DRAW_COUNT) {
        break;
      }

      if (enhancement.exclusionKey && usedExclusionKeys.has(enhancement.exclusionKey)) {
        continue;
      }
      
      drawn.push(enhancement);
      if (enhancement.exclusionKey) {
        usedExclusionKeys.add(enhancement.exclusionKey);
      }
    }

    return drawn;
  }
}
