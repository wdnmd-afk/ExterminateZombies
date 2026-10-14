import { describe, expect, it } from 'vitest';
import { WEAPONS, type WeaponId } from '../src/config/weapons';
import { WEAPON_POSE_PROFILES, WeaponPoseController, resolveWeaponPoseTransform } from '../src/systems/WeaponPoseRules';

const weaponIds = Object.keys(WEAPONS) as WeaponId[];

describe('分武器姿态', () => {
  it('覆盖全部真实武器，参数有限且不复用同一组动画', () => {
    expect(Object.keys(WEAPON_POSE_PROFILES).sort()).toEqual([...weaponIds].sort());
    expect(new Set(Object.values(WEAPON_POSE_PROFILES).map(profile => JSON.stringify(profile))).size).toBe(17);
    for (const profile of Object.values(WEAPON_POSE_PROFILES)) {
      expect(Object.values(profile).every(Number.isFinite)).toBe(true);
      expect(profile.recoveryMs).toBeGreaterThan(0);
      expect(profile.switchMs).toBeGreaterThan(0);
      expect(profile.recoilPx).toBeGreaterThan(0);
    }
  });

  it.each(weaponIds)('%s 后坐按活跃帧恢复，不修改武器定义', (weaponId) => {
    const before = JSON.stringify(WEAPONS[weaponId]);
    const controller = new WeaponPoseController();
    controller.setWeapon(weaponId);
    controller.advance(1000, null);
    const idle = controller.getPose();
    controller.fire();
    const fired = controller.getPose();
    expect(fired.phase).toBe('recoil');
    expect(fired.forward).toBeLessThan(idle.forward);
    expect(fired.rotation).toBe(0);
    controller.advance(0, null);
    expect(controller.getPose()).toEqual(fired);
    controller.advance(WEAPON_POSE_PROFILES[weaponId].recoveryMs, null);
    expect(controller.getPose()).toEqual(idle);
    expect(JSON.stringify(WEAPONS[weaponId])).toBe(before);
  });

  it.each(weaponIds)('%s 换弹中枪手一体，取消后的首发归正', (weaponId) => {
    const controller = new WeaponPoseController();
    controller.setWeapon(weaponId);
    controller.advance(1000, 0.5);
    expect(controller.getPose().phase).toBe('reload');
    expect(Math.abs(controller.getPose().rotation)).toBeGreaterThan(0.1);
    controller.prepareForShot();
    expect(controller.getPose().reloadProgress).toBeNull();
    expect(controller.getPose().rotation).toBe(0);
  });

  it('切枪清理旧后坐/换弹，同枪重复同步不会重启动画', () => {
    const controller = new WeaponPoseController();
    controller.fire();
    controller.advance(20, 0.4);
    controller.setWeapon('rpg');
    const switched = controller.getPose();
    expect(switched.phase).toBe('switch');
    expect(switched.recoil).toBe(0);
    expect(switched.reloadProgress).toBeNull();
    controller.advance(100, null);
    const progressed = controller.getPose();
    controller.setWeapon('rpg');
    expect(controller.getPose()).toEqual(progressed);
    expect(progressed.switchProgress).toBeGreaterThan(switched.switchProgress);
  });

  it('减弱动态保留武器待机识别，但关闭后坐、倾斜与切换位移', () => {
    const controller = new WeaponPoseController();
    controller.setWeapon('barrett');
    controller.setReducedMotion(true);
    controller.fire();
    controller.advance(0, 0.5);
    const pose = controller.getPose();
    expect(pose.forward).toBe(WEAPON_POSE_PROFILES.barrett.stanceForward);
    expect(pose.side).toBe(WEAPON_POSE_PROFILES.barrett.stanceSide);
    expect(pose.rotation).toBe(0);
    expect(pose.reducedMotion).toBe(true);
  });

  it('诊断副本不可污染状态，无效 delta 不推进', () => {
    const controller = new WeaponPoseController();
    controller.fire();
    const pose = controller.getPose();
    const original = { ...pose };
    pose.forward = 100;
    expect(controller.getPose()).toEqual(original);
    controller.advance(Number.NaN, null);
    controller.advance(-100, null);
    expect(controller.getPose()).toEqual(original);
  });

  it.each([0, Math.PI / 2, Math.PI, -Math.PI / 2])('朝向 %s 的负重、换弹保持枪握把与双手同源', (aimAngle) => {
    const controller = new WeaponPoseController();
    controller.setWeapon('rpg');
    controller.advance(1000, 0.5);
    const mount = { gripForward: 7, gripSide: 3, muzzleForward: 34, muzzleSide: 3 };
    const transform = resolveWeaponPoseTransform(controller.getPose(), aimAngle, 2.4, mount);
    expect(transform.body.angle).toBe(transform.weapon.angle);
    const offsetX = transform.weapon.x - transform.body.x;
    const offsetY = transform.weapon.y - transform.body.y;
    expect(offsetX * Math.cos(transform.weapon.angle) + offsetY * Math.sin(transform.weapon.angle)).toBeCloseTo(7);
    expect(-offsetX * Math.sin(transform.weapon.angle) + offsetY * Math.cos(transform.weapon.angle)).toBeCloseTo(3);
    const noSag = resolveWeaponPoseTransform(controller.getPose(), aimAngle, 0, mount);
    expect(transform.body.y - noSag.body.y).toBeCloseTo(2.4);
    expect(transform.weapon.y - noSag.weapon.y).toBeCloseTo(2.4);
  });
});
