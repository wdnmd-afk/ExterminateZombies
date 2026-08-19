/** 局内主动药品配置。药品是纯局内资源，不进入局外存档。 */

export const MEDICINE_IDS = ['bandage', 'medkit', 'energy_drink'] as const;

export type MedicineId = typeof MEDICINE_IDS[number];

export interface MedicineDef {
  id: MedicineId;
  name: string;
  /** 读条时长（毫秒）。 */
  useDurationMs: number;
  /** 读条完成时一次性回复的生命；能量饮料为 0。 */
  instantHeal: number;
  /** 持续回复总量与持续时长；非持续型两者为 0。 */
  overTimeHeal: number;
  overTimeDurationMs: number;
  /** 持续期间的移速倍率；无加成为 1。 */
  overTimeMoveSpeedMultiplier: number;
  carryMax: number;
  color: number;
}

export const MEDICINES = {
  bandage: {
    id: 'bandage',
    name: '绷带',
    useDurationMs: 1500,
    instantHeal: 30,
    overTimeHeal: 0,
    overTimeDurationMs: 0,
    overTimeMoveSpeedMultiplier: 1,
    carryMax: 4,
    color: 0xd8d2c2,
  },
  medkit: {
    id: 'medkit',
    name: '急救',
    useDurationMs: 3000,
    instantHeal: 80,
    overTimeHeal: 0,
    overTimeDurationMs: 0,
    overTimeMoveSpeedMultiplier: 1,
    carryMax: 2,
    color: 0xff7482,
  },
  energy_drink: {
    id: 'energy_drink',
    name: '饮料',
    useDurationMs: 1000,
    instantHeal: 0,
    overTimeHeal: 60,
    overTimeDurationMs: 20000,
    overTimeMoveSpeedMultiplier: 1.2,
    carryMax: 2,
    color: 0xfbc02d,
  },
} satisfies Record<MedicineId, MedicineDef>;

