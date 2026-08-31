import type { BossPhaseDef, DropDef, ZombieDef } from './types';

/**
 * Boss 每次进入新阶段时额外掉落的补给。
 *
 * 为什么必须有这一份：Boss 血量重定标到 3200–6400 之后，一场 Boss 战要打出的伤害是
 * 原来的十几倍，而 heavy 弹一次补给只给 12 发。不补给的话后半场会稳定退化成
 * 「六把枪全部打空，用无限弹的沙漠之鹰磨完剩下的血」——那不是难度，是节奏崩塌。
 *
 * 挂在阶段转换而不是定时刷：阶段转换是玩家**看得见**的节点（HUD 会播 PHASE x/y），
 * 补给因此读作"把它打进下一阶段"的直接回报，而不是天上掉东西。
 * 弹种交给自适应补给按当前军械缺口决定，这里不写死。
 */
export const BOSS_PHASE_TRANSITION_DROPS: DropDef[] = [
  { type: 'ammo', ammoMode: 'adaptive', chance: 1 },
  { type: 'medicine', medicineId: 'bandage', chance: 0.35, amount: 1 },
];

export const ZOMBIES = {
  walker: {
    id: 'walker', name: '普通', health: 50, speed: 22, damage: 10, attackRate: 1000,
    radius: 14, color: 0x88aa88, scoreValue: 10,
    // 50 生命刻意与手枪 50 伤害对齐：脆皮敌人一枪一个是爽感设计，不是失衡。
    drops: [
      { type: 'ammo', ammoMode: 'adaptive', chance: 0.4 },
      // 0.03 → 0.06：击杀不再回血后，普通感染体是全场最大的击杀量来源，
      // 这一条决定了中段几关的回血基线，因此把绷带掉率翻倍。
      // 关卡 1/4/8 另有固定药品阶段奖励兜底，避免完全依赖随机掉落。
      { type: 'medicine', medicineId: 'bandage', chance: 0.06, amount: 1 },
      { type: 'enhancement_pack', chance: 0.03 },
    ],
  },
  runner: {
    id: 'runner', name: '快速', health: 30, speed: 52, damage: 8, attackRate: 800,
    radius: 11, color: 0xccaa44, scoreValue: 15,
    drops: [
      { type: 'ammo', ammoMode: 'adaptive', chance: 0.35 },
      // 高速感染体掉饮料：持续治疗 + 移速加成正好是「继续跑」这条解法的补给。
      { type: 'medicine', medicineId: 'energy_drink', chance: 0.03, amount: 1 },
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
      { type: 'ammo', ammoMode: 'adaptive', chance: 0.7 },
      // 硬目标拆成「绷带保底 + 急救小概率」：集火一只坦克的回报要能看见，
      // 但不能一只就填满 2 格急救上限。
      { type: 'medicine', medicineId: 'bandage', chance: 0.06, amount: 1 },
      { type: 'medicine', medicineId: 'medkit', chance: 0.03, amount: 1 },
      // 高爆包挂在坦克上：260 伤害 / 60 半径的定点爆发，正是用来拆这种必须集火的
      // 硬目标的。掉落方即是它要解决的问题，与双持乌兹挂狂乱者同一条对应关系。
      // 0.1 比地雷类低一档：carryMax 只有 2，给多了溢出反而浪费。
      { type: 'item', itemId: 'demo_charge', chance: 0.1, amount: 1 },
      { type: 'enhancement_pack', chance: 0.05 },
    ],
  },
  bomber: {
    id: 'bomber', name: '爆炸', health: 40, speed: 30, damage: 5, attackRate: 1000,
    radius: 13, color: 0xdd5533, scoreValue: 25,
    drops: [
      { type: 'ammo', ammoMode: 'adaptive', chance: 0.3 },
      // 爆炸感染体的道具产出改为「地雷 + 油桶」两条：总量与原来单条 0.45 接近，
      // 但玩家拿到的是两种不同触发方式，而不是第五第六颗地雷。
      { type: 'item', itemId: 'mine', chance: 0.3, amount: 1 },
      { type: 'item', itemId: 'barrel_oil', chance: 0.2, amount: 1 },
      // 燃烧瓶挂在爆炸感染体上，与油桶同一条火焰语义：这只怪本身就是「死了会炸」的
      // 教学单位，玩家从它身上拿到的两件道具都是「用火封住一条路」。
      { type: 'item', itemId: 'firebomb', chance: 0.14, amount: 1 },
      { type: 'enhancement_pack', chance: 0.03 },
    ],
    explodeOnDeath: { kind: 'explosion', damage: 60, radius: 70 },
  },
  lurker: {
    id: 'lurker', name: '裂颅感染体', health: 80, speed: 27, damage: 13, attackRate: 950,
    radius: 15, color: 0x8f9d73, scoreValue: 18,
    drops: [
      { type: 'ammo', ammoMode: 'adaptive', chance: 0.35 },
      { type: 'medicine', medicineId: 'bandage', chance: 0.04, amount: 1 },
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
      { type: 'ammo', ammoMode: 'adaptive', chance: 0.18 },
      { type: 'item', itemId: 'mine', chance: 0.1, amount: 1 },
      { type: 'item', itemId: 'barrel_flour', chance: 0.12, amount: 1 },
      // 冷冻罐与冷冻喷射器同源挂在苍白行者上：一把武器 + 一件道具共用同一套冷色语义，
      // 玩家对「冷冻来自这只怪」形成一条完整印象。
      { type: 'item', itemId: 'cryo_canister', chance: 0.12, amount: 1 },
      { type: 'enhancement_pack', chance: 0.03 },
    ],
  },
  feral: {
    id: 'feral', name: '狂乱者', health: 34, speed: 62, damage: 9, attackRate: 680,
    radius: 11, color: 0xd7c0a5, scoreValue: 22,
    drops: [
      { type: 'ammo', ammoMode: 'adaptive', chance: 0.22 },
      { type: 'medicine', medicineId: 'energy_drink', chance: 0.02, amount: 1 },
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
      { type: 'ammo', ammoMode: 'adaptive', chance: 0.3 },
      { type: 'medicine', medicineId: 'bandage', chance: 0.06, amount: 1 },
      { type: 'medicine', medicineId: 'medkit', chance: 0.02, amount: 1 },
      { type: 'enhancement_pack', chance: 0.05 },
    ],
  },
  headless: {
    id: 'headless', name: '无头感染体', health: 165, speed: 20, damage: 22, attackRate: 1250,
    radius: 17, color: 0x8f796b, scoreValue: 36,
    drops: [
      { type: 'ammo', ammoMode: 'adaptive', chance: 0.34 },
      { type: 'medicine', medicineId: 'bandage', chance: 0.05, amount: 1 },
      { type: 'enhancement_pack', chance: 0.05 },
    ],
  },
  rotting: {
    id: 'rotting', name: '腐烂感染体', health: 95, speed: 16, damage: 15, attackRate: 1050,
    radius: 16, color: 0xb9aa86, scoreValue: 24,
    drops: [
      { type: 'ammo', ammoMode: 'adaptive', chance: 0.24 },
      { type: 'item', itemId: 'mine', chance: 0.16, amount: 1 },
      { type: 'item', itemId: 'barrel_flour', chance: 0.14, amount: 1 },
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
      // 同一击杀只提供一次补给机会，最终弹种由当前军械缺口决定。
      { type: 'ammo', ammoMode: 'adaptive', chance: 0.65 },
      { type: 'item', itemId: 'barrel_oil', chance: 0.12, amount: 1 },
      { type: 'medicine', medicineId: 'bandage', chance: 0.06, amount: 1 },
      { type: 'medicine', medicineId: 'medkit', chance: 0.03, amount: 1 },
      { type: 'enhancement_pack', chance: 0.05 },
    ],
    explodeOnDeath: { kind: 'explosion', damage: 80, radius: 72 },
  },
  crawler: {
    id: 'crawler', name: '伏地感染体', health: 28, speed: 59, damage: 7, attackRate: 620,
    radius: 10, color: 0xc8b9aa, scoreValue: 20,
    drops: [
      { type: 'ammo', ammoMode: 'adaptive', chance: 0.16 },
      { type: 'medicine', medicineId: 'energy_drink', chance: 0.02, amount: 1 },
      // 粉尘罐挂在伏地感染体上：速度 59 的贴脸群体是「需要脱身」这个问题的来源，
      // 而粉尘罐零伤害、可以贴着自己脚下扔，正是对应的解法。
      { type: 'item', itemId: 'dust_canister', chance: 0.16, amount: 1 },
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
      { type: 'ammo', ammoMode: 'adaptive', chance: 0.22 },
      { type: 'item', itemId: 'mine', chance: 0.12, amount: 1 },
      { type: 'medicine', medicineId: 'energy_drink', chance: 0.02, amount: 1 },
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
      { type: 'item', itemId: 'mine', chance: 0.24, amount: 1 },
      { type: 'item', itemId: 'barrel_oil', chance: 0.12, amount: 1 },
      { type: 'medicine', medicineId: 'bandage', chance: 0.06, amount: 1 },
      { type: 'enhancement_pack', chance: 0.05 },
    ],
    ability: {
      kind: 'ranged', cooldown: 2400, windup: 520, recovery: 360, minRange: 150, maxRange: 500,
      damage: 18, projectileSpeed: 150, projectileRange: 620, projectileRadius: 9,
    },
  },
  tank_boss: {
    // 血量按 0.65 倍统一下调（5200 → 3400）。
    //
    // 原值 5200 是按「有效 DPS ~400」反推 13s 得出的，但
    // `docs/execution/2026-08-27-boss-three-phase-rework.md` §8.1 用加特林满弹连续开火
    // 跨 6 次运行实测 TTK 40.7–50.6s，是设计目标 12–18s 的约 3 倍——反推假设本身偏乐观
    // （§8.1 第 2 点：加特林纸面上限只有 333 DPS，还要扣掉护卫挡枪、spinUp 与换弹）。
    //
    // 为什么是 0.65 而不是该文档 §10.1 建议的 1700–2300：那个区间依赖「约 40% 实战效率」
    // 这个系数，而文档自己声明该系数未测出、不宜直接采信。0.65 是四个 Boss 的统一比例，
    // 保住了「最难命中的最脆、最好命中的最厚」这条分档顺序，也不假装知道没测到的数字。
    // 预期 TTK 落到约 26–33s：比原来短得多，但仍高于 12–18s，最终档位要靠真人试玩定。
    id: 'tank_boss', name: '巨型坦克', health: 3400, speed: 18, damage: 32, attackRate: 1200,
    // 独立装甲爬行体在 0.93 倍下可见范围约 52×60px，全部移动帧落在半径 30 内。
    radius: 30, color: 0x334d33, scoreValue: 140,
    drops: [
      { type: 'ammo', ammoMode: 'adaptive', chance: 1 },
      // Boss 是设计好的喘息点：药品按「接近补满携带上限」给，
      // 无尽模式靠这一次补给撑到下一个 Boss；关卡模式打完就结算，给多也不失衡。
      { type: 'medicine', medicineId: 'bandage', chance: 0.7, amount: 2 },
      { type: 'medicine', medicineId: 'medkit', chance: 0.4, amount: 1 },
      { type: 'enhancement_pack', chance: 1 },
    ],
    ability: {
      kind: 'shockwave', cooldown: 4800, windup: 820, recovery: 720, minRange: 0, maxRange: 150,
      damage: 24, radius: 126, triggerProps: true, recoveryDamageMultiplier: 1.2,
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
            dashSpeed: 270, dashDuration: 760, recoveryDamageMultiplier: 1.45,
          },
        ],
      },
      {
        // 专属技能阶段：震荡管近身、冲锋管中距，环射补的是它原本完全空缺的远距覆盖。
        // 14 发均分整圈、弹速压到 190，玩家要找的是弹幕缺口而不是横移躲一发。
        healthRatio: 0.28,
        label: '破片风暴',
        speedMultiplier: 1.34,
        baseAbilityCooldownMultiplier: 0.7,
        baseAbilityRecoveryMultiplier: 0.7,
        unlockAbilities: [
          {
            kind: 'volley', cooldown: 5400, windup: 880, recovery: 820, minRange: 0, maxRange: 720,
            damage: 16, projectileSpeed: 190, projectileRange: 620, projectileRadius: 8,
            projectileCount: 14, spreadAngle: 360, recoveryDamageMultiplier: 1.3,
          },
        ],
      },
    ],
  },
  bomber_boss: {
    // 3200 → 2100（与 tank_boss 同为 0.65 倍，理由见上）。速度 40、半径 18 是四个 Boss
    // 里最难命中的，因此仍是四场里最短的一场，保住「脆但会炸」的定位。
    id: 'bomber_boss', name: '毁灭爆破者', health: 2100, speed: 40, damage: 12, attackRate: 850,
    radius: 18, color: 0xff6633, scoreValue: 180,
    drops: [
      { type: 'ammo', ammoMode: 'adaptive', chance: 1 },
      { type: 'item', itemId: 'mine', chance: 0.9, amount: 2 },
      { type: 'item', itemId: 'barrel_oil', chance: 0.55, amount: 2 },
      { type: 'medicine', medicineId: 'bandage', chance: 0.7, amount: 2 },
      { type: 'medicine', medicineId: 'medkit', chance: 0.4, amount: 1 },
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
      {
        // 专属技能阶段：区域封锁本来就是它的身份，饱和轰炸是这条身份的终点形态。
        // 5 个爆点在玩家周围逐个引爆，躲开第一个之后还得继续挪，单点伤害压到 20
        // 而不是靠一发打死人。
        healthRatio: 0.25,
        label: '饱和轰炸',
        speedMultiplier: 1.24,
        baseAbilityCooldownMultiplier: 0.7,
        baseAbilityRecoveryMultiplier: 0.72,
        unlockAbilities: [
          {
            kind: 'barrage', cooldown: 6000, windup: 1000, recovery: 900, minRange: 120, maxRange: 620,
            damage: 20, radius: 86, blastCount: 5, spread: 132, stagger: 260,
            recoveryDamageMultiplier: 1.35,
          },
        ],
      },
    ],
  },
  hunter_boss: {
    // 速度 44 且反复突进，命中率明显低于站桩目标，是四个 Boss 里第二难命中的。
    // 4200 → 2730（同为 0.65 倍）。
    id: 'hunter_boss', name: '猩红猎杀者', health: 2730, speed: 44, damage: 26, attackRate: 900,
    // 独立蝎型帧条在 1.25 倍下可见范围约 70×70px，半径 40 覆盖完整主体与冲刺前肢。
    radius: 40, color: 0xb02a3c, scoreValue: 220,
    drops: [
      { type: 'ammo', ammoMode: 'adaptive', chance: 1 },
      { type: 'medicine', medicineId: 'bandage', chance: 0.7, amount: 2 },
      { type: 'medicine', medicineId: 'medkit', chance: 0.45, amount: 1 },
      // 冲刺 Boss 掉饮料：它逼玩家一直动，补给也就该是移速这一路。
      { type: 'medicine', medicineId: 'energy_drink', chance: 0.5, amount: 1 },
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
      {
        // 专属技能阶段：与坦克的环射同为 volley，但取向完全相反——70° 窄扇、弹速 320、
        // 只在近距离放。它是冲刺 Boss，冲到脸上之后原本没有任何后续手段，玩家学会
        // 「等冲刺结束就贴上去输出」以后这场就没有威胁了。窄扇填的正是这个空档：
        // 贴脸位置反而是弹幕最密的地方，逼玩家在冲刺落地后往侧面拉开。
        healthRatio: 0.25,
        label: '尾刺散射',
        speedMultiplier: 1.26,
        baseAbilityCooldownMultiplier: 0.7,
        baseAbilityRecoveryMultiplier: 0.7,
        unlockAbilities: [
          {
            kind: 'volley', cooldown: 4600, windup: 620, recovery: 780, minRange: 0, maxRange: 300,
            damage: 14, projectileSpeed: 320, projectileRange: 340, projectileRadius: 7,
            projectileCount: 7, spreadAngle: 70, recoveryDamageMultiplier: 1.4,
          },
        ],
      },
    ],
  },
  matriarch_boss: {
    // 全表最慢最大的目标，命中最容易，因此仍是四场里最厚的一场，与终局定位相称。
    // 6400 → 4160（同为 0.65 倍）。
    id: 'matriarch_boss', name: '腐化母体', health: 4160, speed: 17, damage: 34, attackRate: 1300,
    // 独立 Gargant 帧条在 1.35 倍下可见范围约 84×72px，半径 43 与主体宽度基本一致。
    radius: 43, color: 0x7a2f6b, scoreValue: 420,
    drops: [
      { type: 'ammo', ammoMode: 'adaptive', chance: 1 },
      { type: 'item', itemId: 'barrel_flour', chance: 0.5, amount: 2 },
      { type: 'medicine', medicineId: 'bandage', chance: 0.8, amount: 2 },
      { type: 'medicine', medicineId: 'medkit', chance: 0.6, amount: 1 },
      { type: 'medicine', medicineId: 'energy_drink', chance: 0.45, amount: 1 },
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
      {
        // 专属技能阶段：它叫「腐化母体」，产卵是这个名字唯一该有的终局形态。
        // 召唤伏地感染体与狂乱者（两种最快的杂兵）而不是硬目标：母体本身是站桩炮台，
        // 玩家的通用解法是躲在障碍后与它对射，而快速杂兵专门破解这条静态解法。
        // maxAlive 6 是硬上限，波次结算要等召唤物一起清完，没有上限它能把结算无限拖住。
        healthRatio: 0.3,
        label: '母巢产卵',
        speedMultiplier: 1.14,
        baseAbilityCooldownMultiplier: 0.72,
        baseAbilityRecoveryMultiplier: 0.72,
        unlockAbilities: [
          {
            kind: 'summon', cooldown: 7000, windup: 1100, recovery: 800, minRange: 0, maxRange: 900,
            summonTypes: ['crawler', 'feral'], count: 3, maxAlive: 6, spawnRadius: 96,
            recoveryDamageMultiplier: 1.3,
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

/**
 * 运行期把任意字符串收窄成"存在且不是 Boss"的感染体 id。
 *
 * 存在的理由是 `SummonZombieAbility.summonTypes` 只能声明成 `string[]`（类型循环，
 * 见该接口的注释）。有了这条守卫，召唤路径就不需要 `as` 断言——配置写错时是静默跳过
 * 一只杂兵，而不是把非法 id 塞进生成器；同一份约束由 `validate.ts` 在 Boot 阶段报错。
 */
export function isNormalZombieId(id: string): id is NormalZombieId {
  return id in ZOMBIES && !isBossZombie(id);
}

/**
 * 按生命比例选出当前应该生效的 Boss 阶段索引；`-1` 表示仍在初始阶段。
 *
 * 阶段只前进不回退：`currentIndex` 之前的阈值不再复查，被治疗或被缩放推回高血量
 * 也不会把已经播过的阶段公告倒放一遍。
 *
 * 抽成纯函数是为了让「阈值必须按**实例生命上限**判定」这条约束可测。无尽章节缩放会让
 * `Zombie.maxHealth` 偏离 `def.health`，分母用错的话第 5 章的坦克永远进不了半血阶段。
 * 这里只做选择，分母对不对由调用方（`Zombie.updateBossPhase`）负责。
 */
export function resolveBossPhaseIndex(
  phases: readonly BossPhaseDef[],
  healthRatio: number,
  currentIndex = -1,
): number {
  let nextIndex = currentIndex;
  for (let index = currentIndex + 1; index < phases.length; index++) {
    if (healthRatio <= phases[index].healthRatio) nextIndex = index;
  }
  return nextIndex;
}
