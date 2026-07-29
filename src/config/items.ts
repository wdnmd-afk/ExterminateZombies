import type { ItemDef } from './types';

export const ITEMS = {
  barrel_oil: {
    id:'barrel_oil', name:'油桶', category:'prop', trigger:'onDamage', health:1, chainable:true,
    color:0xcc7722, radius:16,
    effect:{ kind:'explosion', damage:120, radius:90,
             lingering:{ kind:'fire', duration:3000, radius:70, tickDamage:15, tickRate:400, color:0xff6622 } },
  },
  barrel_flour: {
    id:'barrel_flour', name:'面粉桶', category:'prop', trigger:'onDamage', health:1, chainable:true,
    color:0xeeeecc, radius:16,
    // 粉尘爆炸 + 残留粉尘云阻挡僵尸几秒(战术脱身)
    effect:{ kind:'explosion', damage:80, radius:100,
             lingering:{ kind:'dust', duration:4000, radius:90, blocksEnemies:true, slowFactor:0, color:0xdddddd } },
  },
  mine: {
    id:'mine', name:'地雷', category:'deployable', trigger:'onProximity', proximity:40, chainable:true,
    color:0x999999, carryMax:5, radius:10,
    effect:{ kind:'explosion', damage:150, radius:80 },
  },
} satisfies Record<string, ItemDef>;

export type ItemId = keyof typeof ITEMS;
