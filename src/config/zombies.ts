import type { ZombieDef } from './types';

export const ZOMBIES = {
  walker: {
    id: 'walker', name: '普通', health: 50, speed: 22, damage: 10, attackRate: 1000,
    radius: 14, color: 0x88aa88, scoreValue: 10,
    drops: [
      { type: 'ammo', ammoType: 'light', chance: 0.25, amount: 8 },
      { type: 'health', chance: 0.06, amount: 12 },
    ],
  },
  runner: {
    id: 'runner', name: '快速', health: 30, speed: 52, damage: 8, attackRate: 800,
    radius: 11, color: 0xccaa44, scoreValue: 15,
    drops: [
      { type: 'ammo', ammoType: 'light', chance: 0.2, amount: 6 },
      { type: 'weapon', itemId: 'smg', chance: 0.08, amount: 1 },
    ],
    ability: {
      kind: 'dash', cooldown: 3400, windup: 420, recovery: 460, minRange: 120, maxRange: 360,
      dashSpeed: 150, dashDuration: 360,
    },
  },
  tank: {
    id: 'tank', name: '坦克', health: 300, speed: 13, damage: 25, attackRate: 1500,
    radius: 24, color: 0x556655, scoreValue: 40,
    drops: [
      { type: 'ammo', ammoType: 'heavy', chance: 0.6, amount: 15 },
      { type: 'weapon', itemId: 'rifle', chance: 0.14, amount: 1 },
      { type: 'health', chance: 0.2, amount: 24 },
    ],
  },
  bomber: {
    id: 'bomber', name: '爆炸', health: 40, speed: 30, damage: 5, attackRate: 1000,
    radius: 13, color: 0xdd5533, scoreValue: 25,
    drops: [
      { type: 'item', itemId: 'mine', chance: 0.45, amount: 1 },
      { type: 'weapon', itemId: 'shotgun', chance: 0.12, amount: 1 },
    ],
    explodeOnDeath: { kind: 'explosion', damage: 60, radius: 70 },
  },
  lurker: {
    id: 'lurker', name: '裂颅感染体', health: 80, speed: 27, damage: 13, attackRate: 950,
    radius: 15, color: 0x8f9d73, scoreValue: 18,
    drops: [
      { type: 'ammo', ammoType: 'light', chance: 0.22, amount: 8 },
      { type: 'health', chance: 0.08, amount: 14 },
    ],
    ability: {
      kind: 'ranged', cooldown: 2600, windup: 620, recovery: 360, minRange: 160, maxRange: 480,
      damage: 10, projectileSpeed: 130, projectileRange: 560, projectileRadius: 7,
    },
  },
  drifter: {
    id: 'drifter', name: '苍白行者', health: 45, speed: 38, damage: 11, attackRate: 900,
    radius: 13, color: 0xc9d3c7, scoreValue: 16,
    drops: [
      { type: 'ammo', ammoType: 'light', chance: 0.18, amount: 7 },
      { type: 'item', itemId: 'mine', chance: 0.1, amount: 1 },
    ],
  },
  feral: {
    id: 'feral', name: '狂乱者', health: 34, speed: 62, damage: 9, attackRate: 680,
    radius: 11, color: 0xd7c0a5, scoreValue: 22,
    drops: [
      { type: 'ammo', ammoType: 'light', chance: 0.22, amount: 7 },
      { type: 'health', chance: 0.06, amount: 10 },
    ],
    ability: {
      kind: 'dash', cooldown: 2600, windup: 320, recovery: 380, minRange: 110, maxRange: 400,
      dashSpeed: 170, dashDuration: 310,
    },
  },
  bloodied: {
    id: 'bloodied', name: '血污屠夫', health: 120, speed: 25, damage: 19, attackRate: 1100,
    radius: 17, color: 0xa93e38, scoreValue: 30,
    drops: [
      { type: 'ammo', ammoType: 'shell', chance: 0.3, amount: 4 },
      { type: 'health', chance: 0.14, amount: 18 },
    ],
  },
  headless: {
    id: 'headless', name: '无头感染体', health: 165, speed: 20, damage: 22, attackRate: 1250,
    radius: 17, color: 0x8f796b, scoreValue: 36,
    drops: [
      { type: 'ammo', ammoType: 'heavy', chance: 0.34, amount: 10 },
      { type: 'health', chance: 0.1, amount: 18 },
    ],
  },
  rotting: {
    id: 'rotting', name: '腐烂感染体', health: 95, speed: 16, damage: 15, attackRate: 1050,
    radius: 16, color: 0xb9aa86, scoreValue: 24,
    drops: [
      { type: 'ammo', ammoType: 'light', chance: 0.24, amount: 10 },
      { type: 'item', itemId: 'mine', chance: 0.16, amount: 1 },
    ],
    ability: {
      kind: 'ranged', cooldown: 3200, windup: 760, recovery: 420, minRange: 180, maxRange: 440,
      damage: 13, projectileSpeed: 110, projectileRange: 520, projectileRadius: 8,
    },
  },
  bloater: {
    id: 'bloater', name: '肿胀者', health: 230, speed: 14, damage: 24, attackRate: 1400,
    radius: 23, color: 0x6d8d61, scoreValue: 46,
    drops: [
      { type: 'ammo', ammoType: 'shell', chance: 0.42, amount: 5 },
      { type: 'health', chance: 0.18, amount: 22 },
    ],
    explodeOnDeath: { kind: 'explosion', damage: 80, radius: 72 },
  },
  crawler: {
    id: 'crawler', name: '伏地感染体', health: 28, speed: 59, damage: 7, attackRate: 620,
    radius: 10, color: 0xc8b9aa, scoreValue: 20,
    drops: [
      { type: 'ammo', ammoType: 'light', chance: 0.16, amount: 6 },
      { type: 'health', chance: 0.05, amount: 10 },
    ],
    ability: {
      kind: 'dash', cooldown: 2300, windup: 300, recovery: 340, minRange: 95, maxRange: 320,
      dashSpeed: 180, dashDuration: 260,
    },
  },
  stalker: {
    id: 'stalker', name: '俯行猎手', health: 62, speed: 46, damage: 14, attackRate: 780,
    radius: 13, color: 0x9d7860, scoreValue: 27,
    drops: [
      { type: 'ammo', ammoType: 'heavy', chance: 0.22, amount: 8 },
      { type: 'item', itemId: 'mine', chance: 0.12, amount: 1 },
    ],
    ability: {
      kind: 'dash', cooldown: 2900, windup: 460, recovery: 430, minRange: 130, maxRange: 420,
      dashSpeed: 160, dashDuration: 340,
    },
  },
  oddity: {
    id: 'oddity', name: '畸变行者', health: 140, speed: 34, damage: 20, attackRate: 920,
    radius: 18, color: 0xc9a154, scoreValue: 40,
    drops: [
      { type: 'item', itemId: 'mine', chance: 0.32, amount: 1 },
      { type: 'health', chance: 0.14, amount: 18 },
    ],
    ability: {
      kind: 'ranged', cooldown: 2400, windup: 520, recovery: 360, minRange: 150, maxRange: 500,
      damage: 18, projectileSpeed: 150, projectileRange: 620, projectileRadius: 9,
    },
  },
  tank_boss: {
    id: 'tank_boss', name: '巨型坦克', health: 560, speed: 18, damage: 32, attackRate: 1200,
    radius: 30, color: 0x334d33, scoreValue: 140,
    drops: [
      { type: 'ammo', ammoType: 'heavy', chance: 1, amount: 28 },
      { type: 'health', chance: 0.55, amount: 35 },
      { type: 'weapon', itemId: 'rifle', chance: 0.22, amount: 1 },
      { type: 'enhancement_pack', chance: 1 },
    ],
    ability: {
      kind: 'shockwave', cooldown: 4800, windup: 820, recovery: 720, minRange: 0, maxRange: 150,
      damage: 24, radius: 126,
    },
  },
  bomber_boss: {
    id: 'bomber_boss', name: '毁灭爆破者', health: 180, speed: 40, damage: 12, attackRate: 850,
    radius: 18, color: 0xff6633, scoreValue: 180,
    drops: [
      { type: 'item', itemId: 'mine', chance: 0.9, amount: 2 },
      { type: 'weapon', itemId: 'shotgun', chance: 0.28, amount: 1 },
      { type: 'health', chance: 0.4, amount: 28 },
    ],
    explodeOnDeath: { kind: 'explosion', damage: 120, radius: 120 },
    ability: {
      kind: 'bombard', cooldown: 4000, windup: 980, recovery: 620, minRange: 150, maxRange: 560,
      damage: 30, radius: 100,
    },
  },
} satisfies Record<string, ZombieDef>;

export type ZombieId = keyof typeof ZOMBIES;
