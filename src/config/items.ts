import type { ItemDef } from './types';

export const ITEMS = {
  barrel_oil: {
    id:'barrel_oil', name:'油桶', scenePlaceable:true, trigger:'onDamage', health:1, chainable:true,
    color:0xcc7722, carryMax:2, radius:16,
    // 携带形态是「自己布置的定时炸弹」：放下后要自己补一枪才炸，
    // 换来的是可选时机 + 3 秒火焰封路，与地雷的自动触发形成两种节奏。
    effect:{ kind:'explosion', damage:120, radius:90,
             lingering:{ kind:'fire', duration:3000, radius:70, tickDamage:15, tickRate:400, color:0xff6622 } },
  },
  barrel_flour: {
    id:'barrel_flour', name:'面粉桶', scenePlaceable:true, trigger:'onDamage', health:1, chainable:true,
    color:0xeeeecc, carryMax:2, radius:16,
    // 粉尘爆炸 + 残留粉尘云阻挡僵尸几秒(战术脱身)
    effect:{ kind:'explosion', damage:80, radius:100,
             lingering:{ kind:'dust', duration:4000, radius:90, blocksEnemies:true, slowFactor:0, color:0xdddddd } },
  },
  mine: {
    id:'mine', name:'地雷', scenePlaceable:false, trigger:'onProximity', proximity:40, chainable:true,
    color:0x999999, carryMax:5, radius:10,
    effect:{ kind:'explosion', damage:150, radius:80 },
  },
} satisfies Record<string, ItemDef>;

export type ItemId = keyof typeof ITEMS;

/**
 * 玩家能否携带并布置。判据只有 `carryMax`，与「关卡能否摆放」无关，
 * 这样新增一件可携带道具时只要给出上限，掉落表与 HUD 自动接纳它。
 */
export function isCarryableItem(itemId: string): itemId is ItemId {
  const def = (ITEMS as Record<string, ItemDef | undefined>)[itemId];
  return (def?.carryMax ?? 0) > 0;
}

/** 全部可携带道具。掉落表覆盖校验与道具循环顺序都以此为准。 */
export const CARRYABLE_ITEM_IDS = (Object.keys(ITEMS) as ItemId[]).filter(isCarryableItem);

