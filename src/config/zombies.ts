import type { ZombieDef } from './types';

export const ZOMBIES = {
  walker: {
    id: 'walker', name: '普通', health: 50, speed: 22, damage: 10, attackRate: 1000,
    radius: 14, color: 0x88aa88, scoreValue: 10,
    // 50 生命刻意与手枪 50 伤害对齐：脆皮敌人一枪一个是爽感设计，不是失衡。
    drops: [
      { type: 'ammo', ammoType: 'light', chance: 0.4, amount: 14 },
      { type: 'health', chance: 0.06, amount: 12 },
      { type: 'enhancement_pack', chance: 0.03 },
    ],
  },
  runner: {
    id: 'runner', name: '快速', health: 30, speed: 52, damage: 8, attackRate: 800,
    radius: 11, color: 0xccaa44, scoreValue: 15,
    drops: [
      { type: 'ammo', ammoType: 'light', chance: 0.35, amount: 12 },
      { type: 'weapon', itemId: 'smg', chance: 0.08, amount: 1 },
      { type: 'enhancement_pack', chance: 0.03 },
    ],
    ability: {
      kind: 'dash', cooldown: 3400, windup: 420, recovery: 460, minRange: 120, maxRange: 360,
      dashSpeed: 150, dashDuration: 360,
    },
  },
  tank: {
    // 火力税档位：M4A1 穿透 2→6 且单体 DPS 上升后，300 生命会在 1s 内融化，
    // 上调到 420 才能继续承担「必须集火」的职责。依据见 G2 执行文档 §4.5。
    id: 'tank', name: '坦克', health: 420, speed: 13, damage: 25, attackRate: 1500,
    radius: 24, color: 0x556655, scoreValue: 40,
    drops: [
      { type: 'ammo', ammoType: 'heavy', chance: 0.7, amount: 22 },
      { type: 'weapon', itemId: 'rifle', chance: 0.14, amount: 1 },
      { type: 'health', chance: 0.2, amount: 24 },
      { type: 'enhancement_pack', chance: 0.05 },
    ],
  },
  bomber: {
    id: 'bomber', name: '爆炸', health: 40, speed: 30, damage: 5, attackRate: 1000,
    radius: 13, color: 0xdd5533, scoreValue: 25,
    drops: [
      { type: 'ammo', ammoType: 'explosive', chance: 0.3, amount: 1 },
      { type: 'item', itemId: 'mine', chance: 0.45, amount: 1 },
      { type: 'weapon', itemId: 'shotgun', chance: 0.12, amount: 1 },
      { type: 'weapon', itemId: 'm79', chance: 0.08, amount: 1 },
      { type: 'enhancement_pack', chance: 0.03 },
    ],
    explodeOnDeath: { kind: 'explosion', damage: 60, radius: 70 },
  },
  lurker: {
    id: 'lurker', name: '裂颅感染体', health: 80, speed: 27, damage: 13, attackRate: 950,
    radius: 15, color: 0x8f9d73, scoreValue: 18,
    drops: [
      { type: 'ammo', ammoType: 'light', chance: 0.35, amount: 14 },
      { type: 'health', chance: 0.08, amount: 14 },
      { type: 'enhancement_pack', chance: 0.03 },
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
      { type: 'enhancement_pack', chance: 0.03 },
    ],
  },
  feral: {
    id: 'feral', name: '狂乱者', health: 34, speed: 62, damage: 9, attackRate: 680,
    radius: 11, color: 0xd7c0a5, scoreValue: 22,
    drops: [
      { type: 'ammo', ammoType: 'light', chance: 0.22, amount: 7 },
      { type: 'health', chance: 0.06, amount: 10 },
      { type: 'enhancement_pack', chance: 0.03 },
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
      { type: 'weapon', itemId: 'ak47', chance: 0.08, amount: 1 },
      { type: 'health', chance: 0.14, amount: 18 },
      { type: 'enhancement_pack', chance: 0.05 },
    ],
  },
  headless: {
    id: 'headless', name: '无头感染体', health: 165, speed: 20, damage: 22, attackRate: 1250,
    radius: 17, color: 0x8f796b, scoreValue: 36,
    drops: [
      { type: 'ammo', ammoType: 'heavy', chance: 0.34, amount: 10 },
      { type: 'weapon', itemId: 'barrett', chance: 0.06, amount: 1 },
      { type: 'health', chance: 0.1, amount: 18 },
      { type: 'enhancement_pack', chance: 0.05 },
    ],
  },
  rotting: {
    id: 'rotting', name: '腐烂感染体', health: 95, speed: 16, damage: 15, attackRate: 1050,
    radius: 16, color: 0xb9aa86, scoreValue: 24,
    drops: [
      { type: 'ammo', ammoType: 'light', chance: 0.24, amount: 10 },
      { type: 'item', itemId: 'mine', chance: 0.16, amount: 1 },
      { type: 'enhancement_pack', chance: 0.03 },
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
      { type: 'ammo', ammoType: 'explosive', chance: 0.4, amount: 2 },
      { type: 'weapon', itemId: 'rpg', chance: 0.06, amount: 1 },
      { type: 'health', chance: 0.18, amount: 22 },
      { type: 'enhancement_pack', chance: 0.05 },
    ],
    explodeOnDeath: { kind: 'explosion', damage: 80, radius: 72 },
  },
  crawler: {
    id: 'crawler', name: '伏地感染体', health: 28, speed: 59, damage: 7, attackRate: 620,
    radius: 10, color: 0xc8b9aa, scoreValue: 20,
    drops: [
      { type: 'ammo', ammoType: 'light', chance: 0.16, amount: 6 },
      { type: 'health', chance: 0.05, amount: 10 },
      { type: 'enhancement_pack', chance: 0.03 },
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
      { type: 'enhancement_pack', chance: 0.03 },
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
      { type: 'enhancement_pack', chance: 0.05 },
    ],
    ability: {
      kind: 'ranged', cooldown: 2400, windup: 520, recovery: 360, minRange: 150, maxRange: 500,
      damage: 18, projectileSpeed: 150, projectileRange: 620, projectileRadius: 9,
    },
  },
  tank_boss: {
    // 两阶段机制战需要足够的输出窗口：新武器数值下 560 生命不足 2s 纯输出时间，
    // 上调到 900（×1.6）与武器强化幅度对齐。依据见 G2 执行文档 §4.5。
    id: 'tank_boss', name: '巨型坦克', health: 900, speed: 18, damage: 32, attackRate: 1200,
    // 独立装甲爬行体在 0.93 倍下可见范围约 52×60px，全部移动帧落在半径 30 内。
    radius: 30, color: 0x334d33, scoreValue: 140,
    drops: [
      { type: 'ammo', ammoType: 'heavy', chance: 1, amount: 28 },
      { type: 'health', chance: 0.55, amount: 35 },
      { type: 'weapon', itemId: 'rifle', chance: 0.22, amount: 1 },
      { type: 'enhancement_pack', chance: 1 },
    ],
    ability: {
      kind: 'shockwave', cooldown: 4800, windup: 820, recovery: 720, minRange: 0, maxRange: 150,
      damage: 24, radius: 126, triggerProps: true,
    },
    bossPhaseLabel: '装甲压制',
    bossPhases: [
      {
        healthRatio: 0.55,
        label: '装甲过载',
        speedMultiplier: 1.28,
        baseAbilityCooldownMultiplier: 0.82,
        baseAbilityRecoveryMultiplier: 0.75,
        unlockAbilities: [
          {
            kind: 'dash', cooldown: 4500, windup: 650, recovery: 900, minRange: 175, maxRange: 440,
            dashSpeed: 270, dashDuration: 760,
          },
        ],
      },
    ],
  },
  bomber_boss: {
    id: 'bomber_boss', name: '毁灭爆破者', health: 180, speed: 40, damage: 12, attackRate: 850,
    radius: 18, color: 0xff6633, scoreValue: 180,
    drops: [
      { type: 'ammo', ammoType: 'explosive', chance: 1, amount: 4 },
      { type: 'item', itemId: 'mine', chance: 0.9, amount: 2 },
      { type: 'weapon', itemId: 'shotgun', chance: 0.28, amount: 1 },
      { type: 'health', chance: 0.4, amount: 28 },
      { type: 'enhancement_pack', chance: 1 },
    ],
    explodeOnDeath: { kind: 'explosion', damage: 120, radius: 120 },
    ability: {
      kind: 'bombard', cooldown: 4000, windup: 980, recovery: 620, minRange: 150, maxRange: 560,
      damage: 30, radius: 100,
    },
    bossPhaseLabel: '爆破封锁',
    bossPhases: [
      {
        healthRatio: 0.5,
        label: '爆燃过载',
        speedMultiplier: 1.15,
        baseAbilityCooldownMultiplier: 0.78,
        baseAbilityRecoveryMultiplier: 0.8,
        unlockAbilities: [
          {
            kind: 'shockwave', cooldown: 5200, windup: 700, recovery: 760, minRange: 0, maxRange: 140,
            damage: 22, radius: 112, triggerProps: true,
          },
        ],
      },
    ],
  },
  hunter_boss: {
    id: 'hunter_boss', name: '猩红猎杀者', health: 620, speed: 44, damage: 26, attackRate: 900,
    // 独立蝎型帧条在 1.25 倍下可见范围约 70×70px，半径 40 覆盖完整主体与冲刺前肢。
    radius: 40, color: 0xb02a3c, scoreValue: 220,
    drops: [
      { type: 'ammo', ammoType: 'heavy', chance: 1, amount: 24 },
      { type: 'health', chance: 0.5, amount: 30 },
      { type: 'weapon', itemId: 'smg', chance: 0.25, amount: 1 },
      { type: 'enhancement_pack', chance: 1 },
    ],
    // 冲刺型 Boss：射程内反复突进，专门破解「绕圈放风筝」这种通用解法。
    // windup 给足反应窗口，recovery 是玩家的输出期。
    ability: {
      kind: 'dash', cooldown: 3000, windup: 520, recovery: 540, minRange: 140, maxRange: 520,
      dashSpeed: 260, dashDuration: 420,
    },
    bossPhaseLabel: '血色追猎',
    bossPhases: [
      {
        healthRatio: 0.5,
        label: '猎杀狂热',
        speedMultiplier: 1.18,
        baseAbilityCooldownMultiplier: 0.78,
        baseAbilityRecoveryMultiplier: 0.75,
        unlockAbilities: [
          {
            kind: 'shockwave', cooldown: 4200, windup: 560, recovery: 620, minRange: 0, maxRange: 120,
            damage: 20, radius: 105,
          },
        ],
      },
    ],
  },
  matriarch_boss: {
    id: 'matriarch_boss', name: '腐化母体', health: 1350, speed: 17, damage: 34, attackRate: 1300,
    // 独立 Gargant 帧条在 1.35 倍下可见范围约 84×72px，半径 43 与主体宽度基本一致。
    radius: 43, color: 0x7a2f6b, scoreValue: 420,
    drops: [
      { type: 'ammo', ammoType: 'heavy', chance: 1, amount: 36 },
      { type: 'ammo', ammoType: 'explosive', chance: 1, amount: 6 },
      { type: 'health', chance: 0.7, amount: 45 },
      { type: 'weapon', itemId: 'rifle', chance: 0.35, amount: 1 },
      { type: 'enhancement_pack', chance: 1 },
    ],
    // 终局炮台：血厚、移动慢，靠高频远程投射逼玩家用障碍物做掩体。
    // 死亡爆炸范围很大但可预判(血条见底就该拉开)，奖励远程收尾。
    explodeOnDeath: { kind: 'explosion', damage: 100, radius: 160 },
    ability: {
      kind: 'ranged', cooldown: 2000, windup: 620, recovery: 380, minRange: 120, maxRange: 640,
      damage: 24, projectileSpeed: 170, projectileRange: 760, projectileRadius: 11,
    },
    bossPhaseLabel: '腐化炮台',
    bossPhases: [
      {
        healthRatio: 0.6,
        label: '母巢苏醒',
        speedMultiplier: 1.08,
        baseAbilityCooldownMultiplier: 0.82,
        baseAbilityRecoveryMultiplier: 0.8,
        unlockAbilities: [
          {
            kind: 'bombard', cooldown: 5000, windup: 1050, recovery: 700, minRange: 180, maxRange: 650,
            damage: 30, radius: 110,
          },
        ],
      },
    ],
  },
} satisfies Record<string, ZombieDef>;

export type ZombieId = keyof typeof ZOMBIES;

/**
 * Boss 以「id 含 boss」为约定。类型层与运行时判定共用这一条规则，
 * 新增 Boss 就不会漏同步下游（例如忘记从无尽模式敌人池里排除）。
 */
export type BossZombieId = Extract<ZombieId, `${string}boss${string}`>;
export type NormalZombieId = Exclude<ZombieId, BossZombieId>;

export function isBossZombie(id: string): boolean {
  return id.includes('boss');
}
