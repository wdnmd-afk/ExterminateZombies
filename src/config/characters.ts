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

