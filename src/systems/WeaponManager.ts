import Phaser from 'phaser';
import type { AmmoType } from '../config/types';
import { WEAPONS, type WeaponId } from '../config/weapons';
import type { WeaponDef } from '../config/types';
import type { GameState } from './GameState';
import type { Bullet } from '../entities/Bullet';
import type { ObjectPool } from '../utils/ObjectPool';
import type { Player } from '../entities/Player';
import { degToRad, randRange } from '../utils/math';
import { EVENTS } from '../constants';

export interface WeaponFireFeedback {
  x: number;
  y: number;
  angle: number;
  color: number;
  pellets: number;
}

/**
 * 武器系统。管当前武器的射速冷却、弹匣、换弹、切枪。
 * 开火时按 pellets 循环、以 spread 随机散射,从枪口生成子弹(走子弹池)。
 * 弹药/弹匣状态都写在 GameState.player,HUD 通过事件同步。
 */
export class WeaponManager {
  private scene: Phaser.Scene;
  private state: GameState;
  private bulletPool: ObjectPool<Bullet>;

  private lastFireAt = -Infinity;
  private reloadingUntil = 0;
  private reloadEvent: Phaser.Time.TimerEvent | null = null;
  private reloadToken = 0;
  private reloadingWeaponId: WeaponId | null = null;

  constructor(scene: Phaser.Scene, state: GameState, bulletPool: ObjectPool<Bullet>) {
    this.scene = scene;
    this.state = state;
    this.bulletPool = bulletPool;
  }

  private get current(): WeaponDef {
    return WEAPONS[this.state.player.currentWeaponId];
  }

  get isReloading(): boolean {
    return this.reloadingWeaponId !== null && this.scene.time.now < this.reloadingUntil;
  }

  /** 由 Player/GameScene 每帧调用。fireHeld=开火键是否按住,fireJustPressed=本帧刚按下。 */
  update(now: number, player: Player, fireHeld: boolean, fireJustPressed: boolean): WeaponFireFeedback | null {
    if (this.isReloading) return null;
    const w = this.current;
    const wantFire = w.auto ? fireHeld : fireJustPressed;
    return wantFire ? this.tryFire(now, player) : null;
  }

  private tryFire(now: number, player: Player): WeaponFireFeedback | null {
    const w = this.current;
    if (now - this.lastFireAt < w.fireRate) return null;

    const mag = this.state.player.ammoInMag[this.state.player.currentWeaponId] ?? 0;
    if (mag <= 0) {
      this.reload();
      return null;
    }

    this.lastFireAt = now;
    const muzzle = player.getMuzzle();
    for (let i = 0; i < w.pellets; i++) {
      const spreadRad = degToRad(randRange(-w.spread / 2, w.spread / 2));
      const b = this.bulletPool.acquire();
      b.fire(
        muzzle.x,
        muzzle.y,
        muzzle.angle + spreadRad,
        w.bulletSpeed,
        w.damage,
        w.penetration,
        w.range,
        w.color,
        w.projectileRadius ?? 4,
        w.impactEffect,
      );
    }

    this.state.player.ammoInMag[this.state.player.currentWeaponId] = mag - 1;
    this.emitAmmo();

    // 自动换弹:打空且有备用弹
    if (mag - 1 <= 0 && this.reserveForWeapon(w) > 0) this.reload();

    return {
      x: muzzle.x,
      y: muzzle.y,
      angle: muzzle.angle,
      color: w.color,
      pellets: w.pellets,
    };
  }

  reload(): void {
    if (this.isReloading) return;
    const w = this.current;
    const id = this.state.player.currentWeaponId;
    const mag = this.state.player.ammoInMag[id] ?? 0;
    const need = w.magazineSize - mag;
    if (need <= 0) return;
    const reserve = this.reserveForWeapon(w);
    if (reserve <= 0) return;

    const reloadToken = ++this.reloadToken;
    this.reloadingUntil = this.scene.time.now + w.reloadTime;
    this.reloadingWeaponId = id;
    this.reloadEvent = this.scene.time.delayedCall(w.reloadTime, () => {
      // 切枪、场景退出或新一轮换弹会使旧回调失效，绝不能修改当前局弹药。
      if (reloadToken !== this.reloadToken || this.state.player.currentWeaponId !== id) return;

      const canLoad = Math.min(need, this.reserveForWeapon(w));
      this.state.player.ammoInMag[id] = (this.state.player.ammoInMag[id] ?? 0) + canLoad;
      // 无限弹药武器(手枪)填装弹匣但不扣备用弹,保留换弹节奏又不会打空软锁死。
      if (!w.infiniteAmmo) {
        this.state.player.ammoReserve[w.ammoType] -= canLoad;
      }
      this.reloadEvent = null;
      this.reloadingWeaponId = null;
      this.reloadingUntil = 0;
      this.emitAmmo();
    });
    this.emitAmmo();
  }

  private reserveForWeapon(weapon: WeaponDef): number {
    // 必须以正在换弹的武器判断无限备用弹，不能读取切枪后的 current。
    if (weapon.infiniteAmmo) return Infinity;
    return this.state.player.ammoReserve[weapon.ammoType] ?? 0;
  }

  private cancelReload(): void {
    this.reloadToken += 1;
    this.reloadEvent?.remove(false);
    this.reloadEvent = null;
    this.reloadingWeaponId = null;
    this.reloadingUntil = 0;
  }

  switchTo(id: WeaponId): void {
    if (!this.state.player.ownedWeapons.includes(id)) return;
    if (id === this.state.player.currentWeaponId) return;
    this.cancelReload();
    this.state.player.currentWeaponId = id;
    this.lastFireAt = -Infinity;
    if (this.state.player.ammoInMag[id] === undefined) {
      this.state.player.ammoInMag[id] = 0;
    }
    this.scene.events.emit(EVENTS.weaponChanged);
    this.emitAmmo();
  }

  switchByIndex(index: number): void {
    const owned = this.state.player.ownedWeapons;
    if (index >= 0 && index < owned.length) this.switchTo(owned[index]);
  }

  cycle(dir: 1 | -1): void {
    const owned = this.state.player.ownedWeapons;
    if (owned.length <= 1) return;
    const cur = owned.indexOf(this.state.player.currentWeaponId);
    const next = (cur + dir + owned.length) % owned.length;
    this.switchTo(owned[next]);
  }

  addAmmo(ammoType: AmmoType, amount: number): void {
    if (amount <= 0) return;
    this.state.player.ammoReserve[ammoType] += amount;
    this.emitAmmo();
  }

  /** 拾取武器:加入拥有列表,补一个满弹匣;若已拥有则补备用弹。 */
  pickupWeapon(id: WeaponId, autoEquip = true): void {
    const alreadyOwned = this.state.player.ownedWeapons.includes(id);
    if (!alreadyOwned) {
      this.state.player.ownedWeapons.push(id);
      this.state.player.ammoInMag[id] = WEAPONS[id].magazineSize;
    } else {
      this.state.player.ammoReserve[WEAPONS[id].ammoType] += WEAPONS[id].magazineSize;
    }

    if (!alreadyOwned && autoEquip) {
      this.switchTo(id);
      return;
    }

    this.scene.events.emit(EVENTS.weaponChanged);
    this.emitAmmo();
  }

  private emitAmmo(): void {
    this.scene.events.emit(EVENTS.ammoChanged);
  }

  destroy(): void {
    this.cancelReload();
  }
}
