/** 首版可玩角色配置。角色全部开放，顺序同时用于战前整备列表。 */

export const CHARACTER_IDS = [
  'watcher',
  'eagle_eye',
  'bastion',
  'runner',
  'breacher',
] as const;

export type CharacterId = typeof CHARACTER_IDS[number];

export const DEFAULT_CHARACTER_ID: CharacterId = 'watcher';

export const CHARACTER_TEXTURE_KEYS = {
  watcher: 'character-watcher',
  eagle_eye: 'character-eagle-eye',
  bastion: 'character-bastion',
  runner: 'character-runner',
  breacher: 'character-breacher',
} satisfies Record<CharacterId, string>;

/**
 * 战前档案立绘纹理 key。
 *
 * 与实机纹理分开登记：实机用 Kenney 的 35-38 x 43 位图，战前整备要在约
 * 188 x 230 的展示区显示，直接放大位图必然粗糙。档案立绘改用同一 Kenney 素材包
 * 的矢量源切片（见 `scripts/process_character_assets.py`），运行时按显示倍率
 * 矢量栅格化，因此两层素材同源、画风一致，但可以分别迭代。
 */
export const CHARACTER_PORTRAIT_TEXTURE_KEYS = {
  watcher: 'character-portrait-watcher',
  eagle_eye: 'character-portrait-eagle-eye',
  bastion: 'character-portrait-bastion',
  runner: 'character-portrait-runner',
  breacher: 'character-portrait-breacher',
} satisfies Record<CharacterId, string>;

/**
 * 持枪手层纹理 key。
 *
 * 这一层压在武器之上，让手真正盖住握把。它不是新画的美术，而是从 Kenney 自带的
 * `*_gun.png` 里减去躯干层与武器层抽出来的（见 `scripts/process_character_hand_layers.py`），
 * 因此与躯干贴图同源、同画风、同锚点。
 *
 * 只登记 Kenney 素材的四名角色：守望者用的是自生成实机精灵，拳头已经画在贴图里，
 * 再叠一层手会出现两双手，所以它的 `handTextureKey` 是 `null`。
 */
export const CHARACTER_HAND_TEXTURE_KEYS = {
  eagle_eye: 'character-hand-eagle-eye',
  bastion: 'character-hand-bastion',
  runner: 'character-hand-runner',
  breacher: 'character-hand-breacher',
} satisfies Partial<Record<CharacterId, string>>;

/**
 * 实机贴图内的握枪锚点，单位是贴图源像素、相对贴图几何中心
 * （也就是 origin 0.5/0.5 的旋转轴）。
 *
 * 两个分量各自标定一件事，不能合成一个点：
 * - `forward` 是拳心沿瞄准方向的位置，决定武器握把前后落在哪里；
 * - `boreSide` 是持枪中线的侧向位置，决定枪膛与出弹线落在人物的哪一侧。
 *
 * 必须按角色分别给值，不能用一个全局常量：Kenney 的持枪姿态把枪端在人物的
 * 右手侧（`boreSide` 为正），而自生成的守望者精灵是双拳抬在瞄准中线偏上
 * （`boreSide` 为负）。2026-08-18 换人物素材时把这一项按下为 0，武器于是从
 * 两只空手之间穿过，这是「武器不像握在手里」的直接原因。
 */
export interface CharacterGripAnchor {
  forward: number;
  boreSide: number;
}

/**
 * 人物层显示缩放。
 *
 * 两类实机素材的源画幅不同，必须分开标定，否则体型不一致：
 * Kenney 位图主体 43px（画幅 35~38 x 43），x 1.08 得到约 46 逻辑像素；
 * 自生成精灵主体约 40px（画幅 48 x 48），要得到同样的 46 逻辑像素需要 46/40 ≈ 1.15。
 *
 * 放在角色配置里而不是 `Player` 的模块常量里：握枪锚点 `gripAnchor` 也量在人物贴图上、
 * 也要乘这个倍率（见 `resolveWeaponMount`），两者必须同源，否则换素材时改了一处
 * 忘了另一处，武器会整体偏移而且没人看得出为什么。
 */
export const KENNEY_SPRITE_SCALE = 1.08;
export const GENERATED_SPRITE_SCALE = 1.15;

/**
 * 主动技能。
 *
 * 与被动分开而不是合成一个字段：被动是「一直在背景里生效的乘数」，主动是
 * 「玩家自己按下去、有冷却、有可读窗口的爆发」。两者的读取时机也完全不同——
 * 被动每帧参与结算，主动只在按键那一刻改变状态，之后由 `activeUntil` 驱动。
 *
 * 五个 kind 各自复用一条已经存在的战斗管线，不引入新的伤害来源：
 *   suppressionPulse → `AreaEffectFactory.explode` + `Zombie.applyKnockback`
 *   focusWindow      → `resolveHeadshotChance` / `Bullet.penetration`
 *   bulwark          → `resolveIncomingPlayerDamage` + 移速倍率
 *   phaseDash        → `Player.grantInvulnerability` + `AreaEffectFactory.linger`
 *   overload         → `WeaponManager` 的弹药扣除与射速
 *
 * `durationMs` 为 0 表示瞬发技能（按下即结算完毕，没有持续窗口）。
 */
export type CharacterActiveDef =
  | {
    kind: 'suppressionPulse';
    name: string;
    description: string;
    cooldownMs: number;
    durationMs: 0;
    /** 冲击波半径与中心伤害。 */
    radius: number;
    damage: number;
    /** 沿径向推开非 Boss 目标的基准距离。 */
    knockback: number;
    /** 释放瞬间给玩家的无敌窗口，让「被围住时按下去」真的能脱身。 */
    invulnerabilityMs: number;
  }
  | {
    kind: 'focusWindow';
    name: string;
    description: string;
    cooldownMs: number;
    durationMs: number;
    /** 窗口期内叠加的爆头率，仍受 `HEADSHOT_CHANCE_CAP` 约束。 */
    headshotChanceBonus: number;
    /** 窗口期内叠加到武器爆头倍率上的增量。 */
    headshotMultiplierBonus: number;
    /** 窗口期内额外穿透的目标数。 */
    penetrationBonus: number;
  }
  | {
    kind: 'bulwark';
    name: string;
    description: string;
    cooldownMs: number;
    durationMs: number;
    /** 窗口期内的受伤倍率，与装甲板被动相乘。 */
    incomingDamageMultiplier: number;
    /** 窗口期内的移速倍率，抵消重装角色的机动劣势。 */
    moveSpeedMultiplier: number;
    /** 窗口期内的伤害倍率，让「顶上去」同时是进攻窗口而不只是挨打。 */
    damageMultiplier: number;
  }
  | {
    kind: 'phaseDash';
    name: string;
    description: string;
    cooldownMs: number;
    durationMs: 0;
    /** 沿瞄准方向的位移距离（像素）。 */
    distance: number;
    /** 位移期间的无敌窗口。 */
    invulnerabilityMs: number;
    /** 起点留下的阻敌粉尘半径与时长；0 表示不留。 */
    trailRadius: number;
    trailDurationMs: number;
  }
  | {
    kind: 'overload';
    name: string;
    description: string;
    cooldownMs: number;
    durationMs: number;
    /** 窗口期内的射击间隔倍率，小于 1 表示更快。 */
    fireRateFactor: number;
    /** 窗口期内的伤害倍率。 */
    damageMultiplier: number;
  };

export type CharacterPassiveDef =
  | {
    kind: 'lastStand';
    name: string;
    description: string;
    invulnerabilityMs: number;
  }
  | {
    kind: 'stationaryCalibration';
    name: string;
    description: string;
    durationMs: number;
    headshotChanceBonus: number;
  }
  | {
    kind: 'armorPlate';
    name: string;
    description: string;
    incomingDamageMultiplier: number;
  }
  | {
    kind: 'movingFire';
    name: string;
    description: string;
    movementPenaltyMultiplier: number;
  }
  | {
    kind: 'lastMagazine';
    name: string;
    description: string;
    magazineThreshold: number;
    damageMultiplier: number;
  };

export interface CharacterDef {
  id: CharacterId;
  codename: string;
  role: string;
  summary: string;
  maxHealth: number;
  moveSpeed: number;
  damageMultiplier: number;
  headshotChance: number;
  passive: CharacterPassiveDef;
  /** 玩家主动按键释放的技能。每名角色恰好一个，不做多技能栏。 */
  active: CharacterActiveDef;
  textureKey: string;
  portraitTextureKey: string;
  /** 压在武器之上的持枪手层；实机贴图自带拳头的角色为 null。 */
  handTextureKey: string | null;
  gripAnchor: CharacterGripAnchor;
  /** 实机贴图的显示缩放。取 `KENNEY_SPRITE_SCALE` 或 `GENERATED_SPRITE_SCALE`。 */
  spriteScale: number;
  accentColor: number;
}

export const CHARACTERS = {
  watcher: {
    id: 'watcher',
    codename: '守望者',
    role: '均衡生存',
    summary: '稳定处理每一种战况，在绝境中保留最后一次反击机会。',
    maxHealth: 105,
    moveSpeed: 120,
    damageMultiplier: 1,
    headshotChance: 0.1,
    passive: {
      kind: 'lastStand',
      name: '绝境余生',
      description: '每局一次，致命伤害后保留 1 点生命并获得 2 秒无敌。',
      invulnerabilityMs: 2000,
    },
    // 均衡角色的主动就该解决「被围住」这个所有武器都不擅长的场面：
    // 一次全向清场加短无敌，让站位失误有一次可挽回的机会。
    active: {
      kind: 'suppressionPulse',
      name: '压制脉冲',
      description: '向四周释放冲击波：230 伤害、推开周围感染体，并获得 1.2 秒无敌。',
      cooldownMs: 14000,
      durationMs: 0,
      radius: 190,
      damage: 230,
      knockback: 210,
      invulnerabilityMs: 1200,
    },
    textureKey: CHARACTER_TEXTURE_KEYS.watcher,
    portraitTextureKey: CHARACTER_PORTRAIT_TEXTURE_KEYS.watcher,
    // 自生成精灵（48x48 正俯视）已经画好握拳的手，不叠手层。
    // 锚点按 v03 产物实测：拳心在画幅中心右侧 13.04px、上方 1.00px。
    // 这张图的手基本抬在瞄准中线上，与 Kenney 那四名把枪端在右手侧（boreSide 为正）
    // 不同，所以锚点必须按角色分开给。
    handTextureKey: null,
    gripAnchor: { forward: 13, boreSide: -1 },
    spriteScale: GENERATED_SPRITE_SCALE,
    accentColor: 0xfbc02d,
  },
  eagle_eye: {
    id: 'eagle_eye',
    codename: '鹰眼',
    role: '精准射手',
    summary: '以站位换取高爆头收益，擅长快速削减高威胁目标。',
    maxHealth: 85,
    moveSpeed: 112,
    damageMultiplier: 0.95,
    headshotChance: 0.22,
    // 0.5 秒与 15 个百分点：0.6 秒 / 10 点的旧配置在实战里几乎读不出来——
    // 站定的收益要小于一次走位的代价，玩家就不会为它停下。
    passive: {
      kind: 'stationaryCalibration',
      name: '静态校准',
      description: '静止 0.5 秒后爆头率提高 15 个百分点，移动即失效。',
      durationMs: 500,
      headshotChanceBonus: 0.15,
    },
    // 精准射手的主动把「概率爆头」短时变成「必定爆头且穿透」：
    // 爆头率直接顶到上限，配合穿透形成一枪打穿一排头的高光窗口。
    active: {
      kind: 'focusWindow',
      name: '猎杀视界',
      description: '4 秒内爆头率提至上限、爆头倍率 +1.0，且子弹额外穿透 3 个目标。',
      cooldownMs: 16000,
      durationMs: 4000,
      headshotChanceBonus: 0.5,
      headshotMultiplierBonus: 1,
      penetrationBonus: 3,
    },
    textureKey: CHARACTER_TEXTURE_KEYS.eagle_eye,
    portraitTextureKey: CHARACTER_PORTRAIT_TEXTURE_KEYS.eagle_eye,
    // 自生成精灵（48x48 正俯视）已经画好握拳的手，不叠手层。
    // 锚点按 v01 产物用 `process_character_assets.py grip eagle-eye` 实测：
    // 拳心在画幅中心右侧 12.36px、下方 0.09px。她戴黑色射击手套，皮肤只占主体 1%，
    // 所以取几何法而不是皮肤色质心（理由见该脚本的 report_grip）。
    handTextureKey: null,
    gripAnchor: { forward: 12.5, boreSide: 0 },
    spriteScale: GENERATED_SPRITE_SCALE,
    accentColor: 0x8fd3ff,
  },
  bastion: {
    id: 'bastion',
    codename: '堡垒',
    role: '重装突破',
    summary: '依靠高生命和装甲承受感染体正面压力，但转场速度较慢。',
    maxHealth: 140,
    moveSpeed: 100,
    damageMultiplier: 0.95,
    headshotChance: 0.05,
    passive: {
      kind: 'armorPlate',
      name: '装甲板',
      description: '来自感染体接触、投射物和特殊技能的伤害降低 22%。',
      incomingDamageMultiplier: 0.78,
    },
    // 重装的主动不是「再减一点伤」，而是把他最大的短板——移速——临时抹平，
    // 于是这 5 秒是他唯一可以主动压上去打的窗口，而不只是站着挨打。
    active: {
      kind: 'bulwark',
      name: '装甲过载',
      description: '5 秒内受到伤害再降 50%、移速提升 35%、武器伤害提升 25%。',
      cooldownMs: 18000,
      durationMs: 5000,
      incomingDamageMultiplier: 0.5,
      moveSpeedMultiplier: 1.35,
      damageMultiplier: 1.25,
    },
    textureKey: CHARACTER_TEXTURE_KEYS.bastion,
    portraitTextureKey: CHARACTER_PORTRAIT_TEXTURE_KEYS.bastion,
    // 自生成精灵（48x48 正俯视）已经画好握拳的手甲，不叠手层。
    // 锚点按 v05 产物用 `process_character_assets.py grip bastion` 实测：
    // 拳心在画幅中心右侧 12.18px、上方 0.49px。这里**必须取几何法**——他戴厚手甲没有裸露皮肤，
    // 皮肤判据命中的是暖褐色皮带（R>G>B 的假阳性），质心偏到 5.50/-6.50，脚本的 2px 告警已点出。
    handTextureKey: null,
    gripAnchor: { forward: 12, boreSide: -0.5 },
    spriteScale: GENERATED_SPRITE_SCALE,
    accentColor: 0xd9574e,
  },
  runner: {
    id: 'runner',
    codename: '疾行者',
    role: '机动游击',
    summary: '持续移动拉开包围，在高速走位中保持武器可控。',
    maxHealth: 85,
    moveSpeed: 145,
    damageMultiplier: 0.9,
    headshotChance: 0.1,
    passive: {
      kind: 'movingFire',
      name: '行进射击',
      description: '移动造成的额外散射惩罚降低 65%。',
      movementPenaltyMultiplier: 0.35,
    },
    // 机动角色的主动是位移本身：穿过敌群而不是绕开它，并在起点留下一片阻敌粉尘，
    // 把「逃」变成「脱身顺手断后」。
    active: {
      kind: 'phaseDash',
      name: '相位疾冲',
      description: '沿瞄准方向瞬移 240 像素，期间无敌，并在起点留下 2 秒阻敌粉尘。',
      cooldownMs: 9000,
      durationMs: 0,
      distance: 240,
      invulnerabilityMs: 500,
      trailRadius: 74,
      trailDurationMs: 2000,
    },
    textureKey: CHARACTER_TEXTURE_KEYS.runner,
    portraitTextureKey: CHARACTER_PORTRAIT_TEXTURE_KEYS.runner,
    // 自生成精灵（48x48 正俯视）已经画好缠绷带的拳头，不叠手层。
    // 锚点按 v02 产物用 `process_character_assets.py grip runner` 实测：
    // 拳心在画幅中心右侧 11.07px、上方 2.61px。皮肤色交叉校验 10.88/-3.25，两法相差 0.6px 内。
    handTextureKey: null,
    gripAnchor: { forward: 11, boreSide: -2.5 },
    spriteScale: GENERATED_SPRITE_SCALE,
    accentColor: 0x65c694,
  },
  breacher: {
    id: 'breacher',
    codename: '破阵者',
    role: '高风险火力',
    summary: '用低容错换取最高基础火力，并把弹匣末段变成爆发窗口。',
    maxHealth: 80,
    moveSpeed: 115,
    damageMultiplier: 1.2,
    headshotChance: 0.08,
    passive: {
      kind: 'lastMagazine',
      name: '末段火力',
      description: '弹匣剩余 30% 或更少时，武器伤害提高 25%。',
      magazineThreshold: 0.3,
      damageMultiplier: 1.25,
    },
    // 高风险角色的主动直接取消这 4 秒的弹药与换弹约束：
    // 被动奖励「打空弹匣」，主动奖励「根本不用换弹」，两者是同一条爽感曲线的两段。
    active: {
      kind: 'overload',
      name: '弹药过载',
      description: '4 秒内不消耗弹药、射速提升 35%、伤害提升 20%。',
      cooldownMs: 20000,
      durationMs: 4000,
      fireRateFactor: 0.65,
      damageMultiplier: 1.2,
    },
    textureKey: CHARACTER_TEXTURE_KEYS.breacher,
    portraitTextureKey: CHARACTER_PORTRAIT_TEXTURE_KEYS.breacher,
    // 自生成精灵（48x48 正俯视）已经画好握拳的手，不叠手层。
    // 锚点按 **v04** 产物用 `process_character_assets.py grip breacher` 实测：
    // 拳心在画幅中心右侧 13.45px、下方 0.39px。
    //
    // v04 换掉了 v02，理由是实景复核（2026-08-23）：v02 五项量化判据全过，但画面里
    // 根本没有一只压住握把的拳头——前缘是护甲弧面，几何拳心判据量的是"前缘窄带质心"
    // 而不是"那里有没有手"，所以它照样读作对齐。实机放大看枪与身体之间有可见缝隙。
    // 修法是重生成而不是调锚点：产物没画拳头时，把锚点往里挪只会把枪塞进身体。
    // v04 的拳头是明确画出的团块，两种量法因此第一次收敛到 0.95px 内
    //（几何 13.45/+0.39 对皮肤色 12.50/+0.50），这本身就是"拳头真的在那里"的旁证。
    handTextureKey: null,
    gripAnchor: { forward: 13.5, boreSide: 0.5 },
    spriteScale: GENERATED_SPRITE_SCALE,
    accentColor: 0xff8a4c,
  },
} satisfies Record<CharacterId, CharacterDef>;

const CHARACTER_ID_SET = new Set<string>(CHARACTER_IDS);

export function isCharacterId(value: unknown): value is CharacterId {
  return typeof value === 'string' && CHARACTER_ID_SET.has(value);
}

export function getCharacterDef(characterId: CharacterId): CharacterDef {
  return CHARACTERS[characterId];
}

