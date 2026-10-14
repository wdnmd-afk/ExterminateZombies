import type { WeaponId } from '../config/weapons';
import type { WeaponMountOffsets } from './WeaponAssetManager';

export interface WeaponPoseProfile {
  stanceForward: number;
  stanceSide: number;
  recoilPx: number;
  recoveryMs: number;
  reloadDegrees: number;
  reloadPullback: number;
  switchMs: number;
}

// 完整人体原图已经带双手，姿态同时驱动人体与枪层，不另叠手掌或改动武器标定点。
export const WEAPON_POSE_PROFILES: Readonly<Record<WeaponId, Readonly<WeaponPoseProfile>>> = {
  pistol: { stanceForward: 0, stanceSide: 0, recoilPx: 1.6, recoveryMs: 130, reloadDegrees: 28, reloadPullback: 2.4, switchMs: 130 },
  shotgun: { stanceForward: -0.6, stanceSide: 0, recoilPx: 3.8, recoveryMs: 290, reloadDegrees: 18, reloadPullback: 3.2, switchMs: 210 },
  rifle: { stanceForward: 0.5, stanceSide: 0, recoilPx: 3.2, recoveryMs: 240, reloadDegrees: 24, reloadPullback: 3.5, switchMs: 190 },
  smg: { stanceForward: 0.6, stanceSide: -0.2, recoilPx: 1.1, recoveryMs: 100, reloadDegrees: 32, reloadPullback: 2.2, switchMs: 140 },
  ak47: { stanceForward: -0.2, stanceSide: 0.2, recoilPx: 2.3, recoveryMs: 150, reloadDegrees: 23, reloadPullback: 3.4, switchMs: 190 },
  barrett: { stanceForward: -1.5, stanceSide: 0.3, recoilPx: 4.4, recoveryMs: 380, reloadDegrees: 14, reloadPullback: 4.2, switchMs: 290 },
  rpg: { stanceForward: -1.2, stanceSide: 0.7, recoilPx: 3.1, recoveryMs: 340, reloadDegrees: 34, reloadPullback: 4.8, switchMs: 310 },
  m79: { stanceForward: -0.4, stanceSide: 0.1, recoilPx: 3.5, recoveryMs: 310, reloadDegrees: 38, reloadPullback: 3.1, switchMs: 210 },
  gatling: { stanceForward: -1.8, stanceSide: 0.4, recoilPx: 0.9, recoveryMs: 100, reloadDegrees: 12, reloadPullback: 4.6, switchMs: 340 },
  golden_m249: { stanceForward: -1.3, stanceSide: 0.2, recoilPx: 1.6, recoveryMs: 140, reloadDegrees: 17, reloadPullback: 4.4, switchMs: 300 },
  flamethrower: { stanceForward: -1.1, stanceSide: 0.4, recoilPx: 0.3, recoveryMs: 180, reloadDegrees: 20, reloadPullback: 4.0, switchMs: 270 },
  m16a4: { stanceForward: 0.2, stanceSide: -0.1, recoilPx: 1.8, recoveryMs: 180, reloadDegrees: 25, reloadPullback: 3.0, switchMs: 180 },
  aa12: { stanceForward: -1.0, stanceSide: 0.2, recoilPx: 2.7, recoveryMs: 220, reloadDegrees: 21, reloadPullback: 3.7, switchMs: 230 },
  dual_uzi: { stanceForward: 0.7, stanceSide: -0.3, recoilPx: 1.3, recoveryMs: 115, reloadDegrees: -30, reloadPullback: 2.6, switchMs: 160 },
  tesla: { stanceForward: -0.7, stanceSide: 0.4, recoilPx: 0.8, recoveryMs: 190, reloadDegrees: -24, reloadPullback: 3.8, switchMs: 250 },
  railgun: { stanceForward: -1.4, stanceSide: 0.1, recoilPx: 4.0, recoveryMs: 350, reloadDegrees: -18, reloadPullback: 4.3, switchMs: 290 },
  cryo_sprayer: { stanceForward: -0.9, stanceSide: 0.3, recoilPx: 0.4, recoveryMs: 170, reloadDegrees: -22, reloadPullback: 3.6, switchMs: 260 },
};

export interface WeaponPose {
  weaponId: WeaponId;
  phase: 'idle' | 'recoil' | 'reload' | 'switch';
  forward: number;
  side: number;
  rotation: number;
  recoil: number;
  reloadProgress: number | null;
  switchProgress: number;
  reducedMotion: boolean;
}

export class WeaponPoseController {
  private weaponId: WeaponId = 'pistol';
  private recoilRemainingMs = 0;
  private switchRemainingMs = 0;
  private reloadProgress: number | null = null;
  private reducedMotion = false;

  setWeapon(weaponId: WeaponId): void {
    if (weaponId === this.weaponId) return;
    this.weaponId = weaponId;
    this.recoilRemainingMs = 0;
    this.switchRemainingMs = WEAPON_POSE_PROFILES[weaponId].switchMs;
    this.reloadProgress = null;
  }

  setReducedMotion(reducedMotion: boolean): void {
    this.reducedMotion = reducedMotion;
  }

  // 只消耗战场活跃帧的 delta；暂停与选卡不调用，因此不会在恢复时跳过后坐过程。
  advance(deltaMs: number, reloadProgress: number | null): void {
    const activeDelta = Number.isFinite(deltaMs) ? Math.max(0, deltaMs) : 0;
    this.recoilRemainingMs = Math.max(0, this.recoilRemainingMs - activeDelta);
    this.switchRemainingMs = Math.max(0, this.switchRemainingMs - activeDelta);
    this.reloadProgress = reloadProgress !== null && Number.isFinite(reloadProgress)
      ? Math.max(0, Math.min(1, reloadProgress))
      : null;
  }

  prepareForShot(): void {
    // 单发装填可被射击打断；发弹之前归正，而非等下一帧再让弹道回到准星方向。
    this.reloadProgress = null;
    this.switchRemainingMs = 0;
  }

  fire(): void {
    this.prepareForShot();
    this.recoilRemainingMs = WEAPON_POSE_PROFILES[this.weaponId].recoveryMs;
  }

  getPose(): WeaponPose {
    const profile = WEAPON_POSE_PROFILES[this.weaponId];
    const recoil = this.recoilRemainingMs / profile.recoveryMs;
    const settling = this.switchRemainingMs / profile.switchMs;
    const reload = this.reloadProgress === null ? 0 : Math.sin(this.reloadProgress * Math.PI);
    const motion = this.reducedMotion ? 0 : 1;
    return {
      weaponId: this.weaponId,
      phase: this.reloadProgress !== null ? 'reload' : recoil > 0 ? 'recoil' : settling > 0 ? 'switch' : 'idle',
      forward: profile.stanceForward - motion * (profile.recoilPx * recoil * recoil + profile.reloadPullback * reload + 2.5 * settling),
      side: profile.stanceSide,
      rotation: motion * (profile.reloadDegrees * Math.PI / 180 * reload + 0.12 * settling),
      recoil,
      reloadProgress: this.reloadProgress,
      switchProgress: 1 - settling,
      reducedMotion: this.reducedMotion,
    };
  }
}

export function resolveWeaponPoseTransform(pose: WeaponPose, aimAngle: number, sag: number, mount: WeaponMountOffsets) {
  const angle = aimAngle + pose.rotation;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const body = {
    x: cosine * pose.forward - sine * pose.side,
    y: sine * pose.forward + cosine * pose.side + sag,
    angle,
  };
  return {
    body,
    weapon: {
      x: body.x + cosine * mount.gripForward - sine * mount.gripSide,
      y: body.y + sine * mount.gripForward + cosine * mount.gripSide,
      angle,
    },
  };
}
