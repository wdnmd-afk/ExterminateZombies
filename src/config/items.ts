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
  firebomb: {
    id:'firebomb', name:'燃烧瓶', scenePlaceable:false, trigger:'onProximity', proximity:38, chainable:true,
    color:0xff8c3a, carryMax:3, radius:11,
    // 与地雷相反的一头：直伤只有 40，价值全在半径 110、6 秒的大片地火。
    // 定位是封路消耗而不是爆发击杀，所以 tickDamage 给到 18（高于油桶的 15）。
    effect:{ kind:'explosion', damage:40, radius:70,
             lingering:{ kind:'fire', duration:6000, radius:110, tickDamage:18, tickRate:400, color:0xff7a2a } },
  },
  dust_canister: {
    id:'dust_canister', name:'粉尘罐', scenePlaceable:false, trigger:'onProximity', proximity:38, chainable:false,
    color:0xdcdcd2, carryMax:3, radius:11,
    // 零伤害的纯脱身道具：不炸伤自己，只把 120 半径内的僵尸硬停 5 秒。
    // 与面粉桶的区别是没有那 80 点爆炸伤害，因此可以贴着自己脚下扔。
    // chainable 为 false：它没有爆炸产出，被连锁引爆只会白白浪费一次阻挡。
    effect:{ kind:'explosion', damage:0, radius:0,
             lingering:{ kind:'dust', duration:5000, radius:120, blocksEnemies:true, color:0xdddddd } },
  },
  demo_charge: {
    id:'demo_charge', name:'高爆包', scenePlaceable:false, trigger:'onDamage', health:1, chainable:true,
    color:0xd23f31, carryMax:2, radius:12,
    // Boss 战的爆发窗口：260 伤害是全库最高，但半径只有 60 且要自己补一枪引爆。
    // 高伤 + 小半径 + 手动时机三者绑定，避免它变成无脑清场道具。
    effect:{ kind:'explosion', damage:260, radius:60 },
  },
  cryo_canister: {
    id:'cryo_canister', name:'冷冻罐', scenePlaceable:false, trigger:'onProximity', proximity:38, chainable:false,
    color:0x6fd3e8, carryMax:3, radius:11,
    // 控场道具：零伤害，靠 slowFactor 把区域内僵尸压到 35% 移速 5 秒。
    // 比粉尘罐的硬停更好用——硬停会让僵尸在边缘堆积，减速允许边打边撤。
    effect:{ kind:'explosion', damage:0, radius:0,
             lingering:{ kind:'dust', duration:5000, radius:105, slowFactor:0.35, color:0x8fdcec } },
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

