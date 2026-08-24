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
      description: '每局一次，致命伤害后保留 1 点生命并获得 1.5 秒无敌。',
      invulnerabilityMs: 1500,
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
    passive: {
      kind: 'stationaryCalibration',
      name: '静态校准',
      description: '静止 0.6 秒后爆头率提高 10 个百分点，移动即失效。',
      durationMs: 600,
      headshotChanceBonus: 0.1,
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
      description: '来自感染体接触、投射物和特殊技能的伤害降低 15%。',
      incomingDamageMultiplier: 0.85,
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
      description: '移动造成的额外散射惩罚降低 50%。',
      movementPenaltyMultiplier: 0.5,
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
      description: '弹匣剩余 25% 或更少时，武器伤害提高 15%。',
      magazineThreshold: 0.25,
      damageMultiplier: 1.15,
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

