import type { EnhancementDef } from './types';
import { WEAPONS, type WeaponId } from './weapons';

/**
 * 武器强化卡池。每把武器 3 张，覆盖全部 8 把武器。
 *
 * 约定：
 * 1. 键名与 `id` 必须一致，`weaponId` 必须指向 `WEAPONS` 中的真实武器。
 * 2. `effects` 不能为空对象，否则会出现「抽到但没有任何作用」的空卡。
 * 3. 同一武器的多张卡可以同时持有并继续叠加，不存在互斥组。写新卡时
 *    要假定它会和同武器的其它卡共存：倍率相乘、加法相加、改造类取最强档。
 * 4. `addExplosionRadius` / `explosionDamageFactor` / `setImpactLingering`
 *    只对配置了 `impactEffect` 的爆炸武器有意义。
 */
export const ENHANCEMENTS: Record<string, EnhancementDef> = {
  // ——— 沙漠之鹰 ———
  pistol_auto: {
    id: 'pistol_auto',
    weaponId: WEAPONS.pistol.id,
    cardTitle: '连射改造',
    cardDescription: '你的手枪变为全自动，按住即可连续开火。射速略微提升。',
    effects: { setToAuto: true, fireRateFactor: 0.8 },
  },
  pistol_magnum: {
    id: 'pistol_magnum',
    weaponId: WEAPONS.pistol.id,
    cardTitle: '处决回响',
    cardDescription: '伤害提升 55%、射速略降；击杀普通感染体时触发 50 伤害的小型爆炸。',
    effects: {
      damageFactor: 1.55,
      fireRateFactor: 1.2,
      setKillExplosion: { kind: 'explosion', damage: 50, radius: 62 },
    },
  },
  pistol_ap_round: {
    id: 'pistol_ap_round',
    weaponId: WEAPONS.pistol.id,
    cardTitle: '双发扳机',
    cardDescription: '一次弹药打出两发穿透弹；单颗伤害降至 55%，总火力略升且散射增大。',
    effects: { setBurstCount: 2, setPenetration: 1, damageFactor: 0.55, spreadFactor: 1.2 },
  },

  // ——— MP5 ———
  smg_penetration: {
    id: 'smg_penetration',
    weaponId: WEAPONS.smg.id,
    cardTitle: '弹链地狱',
    cardDescription: '每第 5 次击发触发额外两组齐射，弹链子弹伤害提升 25%，不额外消耗弹药。',
    effects: {
      setAmmoChain: { interval: 5, bonusBurstCount: 2, damageFactor: 1.25 },
    },
  },
  smg_extended_mag: {
    id: 'smg_extended_mag',
    weaponId: WEAPONS.smg.id,
    cardTitle: '追猎曳光',
    cardDescription: '弹匣提升 25%；命中标记目标 1.8 秒，后续玩家命中伤害提升 18%。',
    effects: {
      magazineFactor: 1.25,
      setMarkOnHit: { duration: 1800, damageFactor: 1.18 },
    },
  },
  smg_hollow_point: {
    id: 'smg_hollow_point',
    weaponId: WEAPONS.smg.id,
    cardTitle: '碎裂弹雨',
    cardDescription: '伤害提升 25%、散射增大；击杀普通感染体时触发 35 伤害碎裂爆炸。',
    effects: {
      damageFactor: 1.25,
      spreadFactor: 1.3,
      setKillExplosion: { kind: 'explosion', damage: 35, radius: 48 },
    },
  },

  // ——— M4A1 ———
  rifle_less_spread: {
    id: 'rifle_less_spread',
    weaponId: WEAPONS.rifle.id,
    cardTitle: '连锁标记',
    cardDescription: '命中后标记目标 3 秒；标记期间后续玩家命中伤害提升 35%，命中会刷新标记。',
    effects: {
      setMarkOnHit: { duration: 3000, damageFactor: 1.35 },
    },
  },
  rifle_heavy_barrel: {
    id: 'rifle_heavy_barrel',
    weaponId: WEAPONS.rifle.id,
    cardTitle: '双点爆发',
    cardDescription: '一次弹药形成两发点射；单颗伤害降至 58%，总火力提升 16%，射速略降。',
    effects: { setBurstCount: 2, damageFactor: 0.58, fireRateFactor: 1.15 },
  },
  rifle_tactical_reload: {
    id: 'rifle_tactical_reload',
    weaponId: WEAPONS.rifle.id,
    cardTitle: '三连脉冲',
    cardDescription: '换弹缩短 25%；每第 3 次击发追加两组齐射，脉冲伤害提升 10%。',
    effects: {
      reloadTimeFactor: 0.75,
      setAmmoChain: { interval: 3, bonusBurstCount: 2, damageFactor: 1.1 },
    },
  },

  // ——— SPAS-12 ———
  shotgun_double_pellets: {
    id: 'shotgun_double_pellets',
    weaponId: WEAPONS.shotgun.id,
    cardTitle: '四管齐射',
    cardDescription: '一次射击形成 4 组弹道，总弹量提升约 33%，但散射略增；仍只消耗 1 发弹药。',
    effects: { setBurstCount: 4, pelletsFactor: 1 / 3, spreadFactor: 1.15 },
  },
  shotgun_slug: {
    id: 'shotgun_slug',
    weaponId: WEAPONS.shotgun.id,
    cardTitle: '独头鹿弹',
    cardDescription: '霰弹枪变为发射单发高伤害独头弹，伤害变为 3 倍，且拥有 1 次穿透。',
    effects: { setPellets: 1, damageFactor: 3, setPenetration: 1, spreadFactor: 0.1 },
  },
  shotgun_drum_mag: {
    id: 'shotgun_drum_mag',
    weaponId: WEAPONS.shotgun.id,
    cardTitle: '街扫模式',
    cardDescription: '霰弹枪改为按住连射，弹匣提升 50%、射击间隔缩短 20%，但装填略慢。',
    effects: { setToAuto: true, magazineFactor: 1.5, fireRateFactor: 0.8, reloadTimeFactor: 1.15 },
  },

  // ——— AK-47 ———
  ak47_muzzle_brake: {
    id: 'ak47_muzzle_brake',
    weaponId: WEAPONS.ak47.id,
    cardTitle: '双流压制',
    cardDescription: '每发弹药形成两条压制弹道；单颗伤害降至 60%，总火力提升 20%，散射略增。',
    effects: { setBurstCount: 2, damageFactor: 0.6, spreadFactor: 1.1 },
  },
  ak47_steel_core: {
    id: 'ak47_steel_core',
    weaponId: WEAPONS.ak47.id,
    cardTitle: '破阵标记',
    cardDescription: '额外获得 2 次穿透；命中标记目标 2.2 秒，后续玩家命中伤害提升 20%。',
    effects: {
      addPenetration: 2,
      setMarkOnHit: { duration: 2200, damageFactor: 1.2 },
    },
  },
  ak47_high_cycle: {
    id: 'ak47_high_cycle',
    weaponId: WEAPONS.ak47.id,
    cardTitle: '过热齐射',
    cardDescription: '射速提升 20%、散射增大；每第 8 次击发追加两组 15% 增伤的过热弹。',
    effects: {
      fireRateFactor: 0.8,
      spreadFactor: 1.25,
      setAmmoChain: { interval: 8, bonusBurstCount: 2, damageFactor: 1.15 },
    },
  },

  // ——— Barrett M82 ———
  barrett_rapid_bolt: {
    id: 'barrett_rapid_bolt',
    weaponId: WEAPONS.barrett.id,
    cardTitle: '自动反器材',
    cardDescription: '巴雷特改为按住连射，射击间隔缩短 30%，单发伤害降低 20%。',
    effects: { setToAuto: true, fireRateFactor: 0.7, damageFactor: 0.8 },
  },
  barrett_apex_round: {
    id: 'barrett_apex_round',
    weaponId: WEAPONS.barrett.id,
    cardTitle: '双芯穿刺',
    cardDescription: '一次弹药发射两枚穿刺弹；单颗伤害降至 55%，总火力提升 10%，额外穿透 2 次。',
    effects: { setBurstCount: 2, damageFactor: 0.55, addPenetration: 2 },
  },
  barrett_extended_mag: {
    id: 'barrett_extended_mag',
    weaponId: WEAPONS.barrett.id,
    cardTitle: '超杀震荡',
    cardDescription: '巴雷特击杀普通感染体时，在目标位置触发 80 伤害、78 半径的震荡爆炸。',
    effects: {
      setKillExplosion: { kind: 'explosion', damage: 80, radius: 78 },
    },
  },

  // ——— RPG-7 ———
  rpg_wider_explosion: {
    id: 'rpg_wider_explosion',
    weaponId: WEAPONS.rpg.id,
    cardTitle: '子母弹头',
    cardDescription: '主爆炸后在外围生成 4 枚子爆破，每枚继承 20% 伤害与 32% 半径。',
    effects: {
      setImpactFragments: { count: 4, offset: 140, damageFactor: 0.2, radiusFactor: 0.32 },
    },
  },
  rpg_thermobaric: {
    id: 'rpg_thermobaric',
    weaponId: WEAPONS.rpg.id,
    cardTitle: '燃烧风暴',
    cardDescription: '主爆炸伤害提升 35%、半径略缩，并留下持续 3.5 秒的燃烧区。',
    effects: {
      explosionDamageFactor: 1.35,
      addExplosionRadius: -20,
      setImpactLingering: {
        kind: 'fire', duration: 3500, radius: 110, tickDamage: 15, tickRate: 400, color: 0xff6622,
      },
    },
  },
  rpg_quick_load: {
    id: 'rpg_quick_load',
    weaponId: WEAPONS.rpg.id,
    cardTitle: '双火箭巢',
    cardDescription: '一次弹药齐射两枚火箭；每枚爆炸伤害降至 55%，换弹缩短 25%。',
    effects: { setBurstCount: 2, explosionDamageFactor: 0.55, reloadTimeFactor: 0.75 },
  },

  // ——— M79 ———
  m79_fire_linger: {
    id: 'm79_fire_linger',
    weaponId: WEAPONS.m79.id,
    cardTitle: '燃烧榴弹',
    cardDescription: '榴弹爆炸后会留下一片燃烧区域，持续造成伤害。火焰同样会烧伤你自己。',
    effects: {
      setImpactLingering: {
        kind: 'fire', duration: 3200, radius: 72, tickDamage: 14, tickRate: 400, color: 0xff6622,
      },
    },
  },
  m79_heavy_charge: {
    id: 'm79_heavy_charge',
    weaponId: WEAPONS.m79.id,
    cardTitle: '蜂群榴弹',
    cardDescription: '主爆炸伤害提升 20%，并在近外围生成 6 枚小型子爆破。',
    effects: {
      explosionDamageFactor: 1.2,
      setImpactFragments: { count: 6, offset: 85, damageFactor: 0.16, radiusFactor: 0.28 },
    },
  },
  m79_double_tube: {
    id: 'm79_double_tube',
    weaponId: WEAPONS.m79.id,
    cardTitle: '双管齐发',
    cardDescription: '一次弹药同时发射两枚榴弹；每枚爆炸伤害降至 58%，换弹时间增加 10%。',
    effects: { setBurstCount: 2, explosionDamageFactor: 0.58, reloadTimeFactor: 1.1 },
  },

  // —— GAU-8 GATLING ——
  gatling_overdrive: {
    id: 'gatling_overdrive',
    weaponId: WEAPONS.gatling.id,
    cardTitle: '过载弹链',
    cardDescription: '每第 8 次击发追加两组 15% 增伤弹幕，不额外消耗弹药。',
    effects: { setAmmoChain: { interval: 8, bonusBurstCount: 2, damageFactor: 1.15 } },
  },
  gatling_twin_barrel: {
    id: 'gatling_twin_barrel',
    weaponId: WEAPONS.gatling.id,
    cardTitle: '双列枪管',
    cardDescription: '每份弹药形成两列弹道，单颗伤害降至 55%，散射略微扩大。',
    effects: { setBurstCount: 2, damageFactor: 0.55, spreadFactor: 1.12 },
  },
  gatling_target_lock: {
    id: 'gatling_target_lock',
    weaponId: WEAPONS.gatling.id,
    cardTitle: '压制锁定',
    cardDescription: '命中标记目标 1.6 秒，后续玩家伤害提高 16%，弹箱容量提升 15%。',
    effects: { setMarkOnHit: { duration: 1600, damageFactor: 1.16 }, magazineFactor: 1.15 },
  },

  // —— GOLDEN M249 ——
  golden_m249_royal_chain: {
    id: 'golden_m249_royal_chain',
    weaponId: WEAPONS.golden_m249.id,
    cardTitle: '王室弹链',
    cardDescription: '每第 6 次击发追加一组 45% 增伤黄金弹。',
    effects: { setAmmoChain: { interval: 6, bonusBurstCount: 1, damageFactor: 1.45 } },
  },
  golden_m249_steel_core: {
    id: 'golden_m249_steel_core',
    weaponId: WEAPONS.golden_m249.id,
    cardTitle: '鎏金钢芯',
    cardDescription: '额外穿透 2 个目标，并将命中目标标记 2 秒。',
    effects: { addPenetration: 2, setMarkOnHit: { duration: 2000, damageFactor: 1.18 } },
  },
  golden_m249_duplex: {
    id: 'golden_m249_duplex',
    weaponId: WEAPONS.golden_m249.id,
    cardTitle: '双芯弹',
    cardDescription: '每份弹药打出两发并行弹丸，单颗伤害降至 56%。',
    effects: { setBurstCount: 2, damageFactor: 0.56, spreadFactor: 1.08 },
  },

  // —— FLAMETHROWER ——
  // 喷火器打的是枪口前方的扇形火焰，弹丸数/齐射组数对它没有意义，
  // 三张卡分别改「烧得更远」「烧得更宽」「烧得更狠」。
  flamethrower_pressure_nozzle: {
    id: 'flamethrower_pressure_nozzle',
    weaponId: WEAPONS.flamethrower.id,
    cardTitle: '增压喷嘴',
    cardDescription: '火焰喷得更远，扇形射程增加 30%，张角收窄 12%。',
    effects: { coneRangeFactor: 1.3, coneAngleFactor: 0.88 },
  },
  flamethrower_dual_jet: {
    id: 'flamethrower_dual_jet',
    weaponId: WEAPONS.flamethrower.id,
    cardTitle: '双路火流',
    cardDescription: '扇形张角扩大 45%，覆盖面大增，每秒伤害降至 82%。',
    effects: { coneAngleFactor: 1.45, coneDamageFactor: 0.82 },
  },
  flamethrower_afterburner: {
    id: 'flamethrower_afterburner',
    weaponId: WEAPONS.flamethrower.id,
    cardTitle: '余烬蔓延',
    cardDescription: '火焰扫过的地面留下更久更大的余烬，每秒伤害提升 20%。',
    effects: {
      coneDamageFactor: 1.2,
      setConeLinger: {
        kind: 'fire',
        duration: 1600,
        radius: 52,
        tickDamage: 9,
        tickRate: 220,
        color: 0xff642e,
        stackMode: 'refresh-nearby',
        refreshDistance: 58,
        damagesPlayer: false,
        playLoop: false,
      },
    },
  },

  // ——— M16A4（三连发步枪） ———
  m16a4_wide_burst: {
    id: 'm16a4_wide_burst',
    weaponId: WEAPONS.m16a4.id,
    cardTitle: '五连爆发',
    cardDescription: '点射从 3 发变 5 发，散射增大 30%；一次扣扳机覆盖更宽的一片。',
    effects: { setBurstCount: 5, spreadFactor: 1.3 },
  },
  m16a4_marksman: {
    id: 'm16a4_marksman',
    weaponId: WEAPONS.m16a4.id,
    cardTitle: '精确枪管',
    cardDescription: '散射降至 40%、伤害提升 30%、穿透 +3；每 3 次点射追加一发 1.6 倍补射。',
    effects: {
      spreadFactor: 0.4,
      damageFactor: 1.3,
      addPenetration: 3,
      // 补射是这张卡的行为部分：纯数值卡（只有散射/伤害/穿透倍率）会被卡池不变量拦下，
      // 而且玩家用起来只会觉得"数字变了"。追加补射把"精确"变成一个能听出来的节奏。
      setAmmoChain: { interval: 3, bonusBurstCount: 1, damageFactor: 1.6 },
    },
  },
  m16a4_designator: {
    id: 'm16a4_designator',
    weaponId: WEAPONS.m16a4.id,
    cardTitle: '战术标记',
    cardDescription: '命中后标记目标 2.5 秒，标记期间你对它的全部伤害提升 45%。',
    effects: { setMarkOnHit: { duration: 2500, damageFactor: 1.45 } },
  },

  // ——— AA-12（全自动霰弹枪） ———
  aa12_drum: {
    id: 'aa12_drum',
    weaponId: WEAPONS.aa12.id,
    cardTitle: '扩容弹鼓',
    cardDescription: '弹鼓容量翻倍，换弹时间增加 25%；每 6 发追加一次 1.3 倍齐射。',
    effects: {
      magazineFactor: 2,
      reloadTimeFactor: 1.25,
      // 光是"弹鼓更大"只是让玩家少按一次 R，打起来毫无区别。
      // 追加齐射让长弹鼓在射击过程中有可听见的节奏点。
      setAmmoChain: { interval: 6, bonusBurstCount: 1, damageFactor: 1.3 },
    },
  },
  aa12_slug: {
    id: 'aa12_slug',
    weaponId: WEAPONS.aa12.id,
    cardTitle: '独头弹链',
    cardDescription: '改为单颗独头弹，单发伤害提升 4.2 倍并穿透 4 个目标，散射大幅收紧。',
    effects: { setPellets: 1, damageFactor: 4.2, setPenetration: 4, spreadFactor: 0.35 },
  },
  aa12_dragon: {
    id: 'aa12_dragon',
    weaponId: WEAPONS.aa12.id,
    cardTitle: '龙息弹',
    cardDescription: '击杀普通感染体时触发 90 伤害的燃烧爆炸，射速略降。',
    effects: {
      fireRateFactor: 1.15,
      setKillExplosion: {
        kind: 'explosion',
        damage: 90,
        radius: 78,
        lingering: {
          kind: 'fire',
          duration: 1400,
          radius: 52,
          tickDamage: 8,
          tickRate: 240,
          color: 0xff8a3a,
          stackMode: 'refresh-nearby',
          refreshDistance: 46,
          damagesPlayer: false,
          playLoop: false,
        },
      },
    },
  },

  // ——— DUAL UZI（双持冲锋枪） ———
  dual_uzi_quad: {
    id: 'dual_uzi_quad',
    weaponId: WEAPONS.dual_uzi.id,
    cardTitle: '四管改造',
    cardDescription: '一次击发从 2 管变 4 管，单发伤害降至 70%；总火力显著上升。',
    effects: { setBurstCount: 4, damageFactor: 0.7 },
  },
  dual_uzi_machined: {
    id: 'dual_uzi_machined',
    weaponId: WEAPONS.dual_uzi.id,
    cardTitle: '精工枪机',
    cardDescription: '散射降至 45%、穿透 +2；命中后标记目标 2 秒，标记期间伤害提升 35%。',
    effects: {
      spreadFactor: 0.45,
      addPenetration: 2,
      // 双持的每秒命中次数是全库最高，标记因此几乎总能立刻吃到——
      // 这张卡把"泼弹"从铺伤害改造成"先糊一层标记再集火"，是打法层面的改变。
      setMarkOnHit: { duration: 2000, damageFactor: 1.35 },
    },
  },
  dual_uzi_hail: {
    id: 'dual_uzi_hail',
    weaponId: WEAPONS.dual_uzi.id,
    cardTitle: '弹雨过载',
    cardDescription: '每管改为一次吐 2 发，单发伤害降至 65%；弹匣 +60%，散射增大 20%。',
    effects: {
      // 每管吐 2 发（配合基础的 2 管 = 一次 4 颗弹丸）才是"弹雨"该有的画面，
      // 纯粹加弹匣与射速只是把同一条弹线拉长。
      setPellets: 2,
      damageFactor: 0.65,
      magazineFactor: 1.6,
      spreadFactor: 1.2,
    },
  },

  // ——— TESLA COIL（链式电磁枪） ———
  tesla_overcharge: {
    id: 'tesla_overcharge',
    weaponId: WEAPONS.tesla.id,
    cardTitle: '过载线圈',
    cardDescription: '伤害提升 70%、射速提升 20%、弹匣降至 70%；击杀普通感染体时放电 70 伤害。',
    effects: {
      damageFactor: 1.7,
      fireRateFactor: 0.8,
      magazineFactor: 0.7,
      // 「过载」必须有过载的样子：击杀时把积蓄的电荷放出去，
      // 与链式闪电叠起来形成"跳完还炸一下"的连锁收尾。
      setKillExplosion: { kind: 'explosion', damage: 70, radius: 84 },
    },
  },
  tesla_arc_split: {
    id: 'tesla_arc_split',
    weaponId: WEAPONS.tesla.id,
    cardTitle: '双弧放电',
    cardDescription: '一次击发放出 2 道电弧（仍只消耗 1 发），单道伤害降至 65%。',
    effects: { setBurstCount: 2, damageFactor: 0.65 },
  },
  tesla_conductive: {
    id: 'tesla_conductive',
    weaponId: WEAPONS.tesla.id,
    cardTitle: '导电标记',
    cardDescription: '命中后标记目标 3 秒，标记期间你对它的全部伤害提升 40%。',
    effects: { setMarkOnHit: { duration: 3000, damageFactor: 1.4 } },
  },

  // ——— RAILGUN（蓄力磁轨炮） ———
  railgun_capacitor: {
    id: 'railgun_capacitor',
    weaponId: WEAPONS.railgun.id,
    cardTitle: '超导电容',
    cardDescription: '改为双轨并发（一次两道弹体），单发伤害降至 60%；弹匣 +80%，换弹 +20%。',
    effects: {
      // 双轨是这张卡的行为：一次开火打出两道并行弹体，覆盖宽度翻倍。
      // 纯粹"伤害 +45% / 弹匣 +80%"只是把同一发子弹的数字改大，玩家没有新的打法。
      setPellets: 2,
      damageFactor: 0.6,
      magazineFactor: 1.8,
      reloadTimeFactor: 1.2,
    },
  },
  railgun_lance: {
    id: 'railgun_lance',
    weaponId: WEAPONS.railgun.id,
    cardTitle: '贯穿长矛',
    cardDescription: '穿透提升到 14 个目标、伤害 +10%；每 2 发追加一道 1.8 倍的贯穿弹。',
    effects: {
      setPenetration: 14,
      damageFactor: 1.1,
      // `setPenetration` 不算行为键（它只是把一个数字改大）。追加贯穿弹才是行为：
      // 隔一发就有一次明显更重的射击，玩家会开始数着节奏留那一发给硬目标。
      setAmmoChain: { interval: 2, bonusBurstCount: 1, damageFactor: 1.8 },
    },
  },
  railgun_detonator: {
    id: 'railgun_detonator',
    weaponId: WEAPONS.railgun.id,
    cardTitle: '动能引爆',
    cardDescription: '击杀普通感染体时触发 160 伤害的动能爆炸，射速略降。',
    effects: {
      fireRateFactor: 1.1,
      setKillExplosion: { kind: 'explosion', damage: 160, radius: 96 },
    },
  },

  // ——— CRYO SPRAYER（低温喷射器） ———
  cryo_wide_cone: {
    id: 'cryo_wide_cone',
    weaponId: WEAPONS.cryo_sprayer.id,
    cardTitle: '广域低温',
    cardDescription: '扇形张角增大 45%、射程增加 25%；一次覆盖整个正面。',
    effects: { coneAngleFactor: 1.45, coneRangeFactor: 1.25 },
  },
  cryo_deep_freeze: {
    id: 'cryo_deep_freeze',
    weaponId: WEAPONS.cryo_sprayer.id,
    cardTitle: '深度冷冻',
    cardDescription: '扇形收窄 30% 但射程增加 40%、每秒伤害提升 90%；从喷雾变成一道冷冻束。',
    effects: {
      // 收窄 + 加长把扇形从"面"改成"束"：这是几何行为的改变，
      // 与「广域低温」正好相反，两张卡叠起来会互相抵消一部分，玩家需要选边。
      coneAngleFactor: 0.7,
      coneRangeFactor: 1.4,
      coneDamageFactor: 1.9,
      magazineFactor: 0.75,
    },
  },
  cryo_frost_field: {
    id: 'cryo_frost_field',
    weaponId: WEAPONS.cryo_sprayer.id,
    cardTitle: '霜结残留',
    cardDescription: '扇形内周期性留下阻挡感染体的霜雾区，持续 1.6 秒。',
    effects: {
      setConeLinger: {
        kind: 'dust',
        duration: 1600,
        radius: 46,
        blocksEnemies: true,
        color: 0x8fe8ff,
        stackMode: 'refresh-nearby',
        refreshDistance: 52,
      },
    },
  },
};

/** 强化卡只允许引用已注册武器；配置错误应在进入抽卡界面时立即暴露。 */
export function getEnhancementWeaponLabel(weaponId: string): string {
  const weapon = Object.values(WEAPONS).find((candidate) => candidate.id === weaponId);
  if (!weapon) {
    throw new Error(`强化配置引用了未知武器：${weaponId}`);
  }
  return weapon.name;
}

/** 返回某把武器的全部强化卡，供校验和图鉴类界面复用。 */
export function getEnhancementsForWeapon(weaponId: WeaponId): EnhancementDef[] {
  return Object.values(ENHANCEMENTS).filter((entry) => entry.weaponId === weaponId);
}
