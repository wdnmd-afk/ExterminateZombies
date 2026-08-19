import Phaser from 'phaser';
import type { AmmoType, WeaponDef } from '../config/types';
import { type WeaponId } from '../config/weapons';
import { MAX_WEAPON_LOADOUT_SIZE } from '../config/loadout';
import type { GameState } from './GameState';
import type { Bullet } from '../entities/Bullet';
import type { ObjectPool } from '../utils/ObjectPool';
import type { Player } from '../entities/Player';
import { degToRad, randRange } from '../utils/math';
import { EVENTS } from '../constants';
import { EnhancementManager } from './EnhancementManager';
import { WEAPON_RELOAD_EVENTS } from '../config/audio';
import { createEmptyAmmoAlert } from '../config/combatAlerts';
import { SoundManager } from './SoundManager';
import { isWeaponUsable as resolveWeaponUsable } from './AmmoSupplyRules';
import { resolveSpinUpFireRate, resolveSpreadMultiplier } from './WeaponCombatRules';
import { resolveWeaponVolley } from './EnhancementCombatRules';
import { isDeveloperCheatEnabled } from './DeveloperCheats';
import { getCharacterDef } from '../config/characters';
import {
  resolveHeadshotChance,
  resolveMovementPenalty,
  resolveWeaponDamageMultiplier,
  scalePlayerEffect,
} from './CharacterCombatRules';

export interface WeaponFireFeedback {
  x: number;
  y: number;
  angle: number;
  color: number;
  pellets: number;
  burstCount: number;
  ammoChainTriggered: boolean;
}

export interface WeaponReloadStatus {
  weaponId: WeaponId;
  remaining: number;
  total: number;
  progress: number;
}

export interface WeaponStatus {
  weaponId: WeaponId;
  ammoInMag: number;
  ammoReserve: number;
  infiniteAmmo: boolean;
  usable: boolean;
  reloading: boolean;
  reloadProgress: number;
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
  private reloadStartedAt = 0;
  private reloadDuration = 0;
  /** 同一轮空弹状态只提示一次，避免自动武器持续按住时每帧刷新警报。 */
  private emptyAlertWeaponId: WeaponId | null = null;
  /** Trigger hold start for spin-up weapons. Null means the barrels are at rest. */
  private triggerHeldSince: number | null = null;
  /** 弹链按武器独立计数；未激活弹链时归零，保证拿卡后从第 1 发开始计算。 */
  private readonly shotCounters: Partial<Record<WeaponId, number>> = {};

  constructor(scene: Phaser.Scene, state: GameState, bulletPool: ObjectPool<Bullet>) {
    this.scene = scene;
    this.state = state;
    this.bulletPool = bulletPool;
  }

  private getEffectiveWeaponDef(weaponId: WeaponId): WeaponDef {
    return EnhancementManager.resolveWeaponDef(weaponId, this.state.player.activeEnhancements);
  }

  private get current(): WeaponDef {
    return this.getEffectiveWeaponDef(this.state.player.currentWeaponId);
  }

  get isReloading(): boolean {
    return this.reloadingWeaponId !== null && this.scene.time.now < this.reloadingUntil;
  }

  getReloadStatus(): WeaponReloadStatus | null {
    if (!this.isReloading || !this.reloadingWeaponId || this.reloadDuration <= 0) return null;
    const remaining = Math.max(0, this.reloadingUntil - this.scene.time.now);
    return {
      weaponId: this.reloadingWeaponId,
      remaining,
      total: this.reloadDuration,
      progress: Phaser.Math.Clamp((this.scene.time.now - this.reloadStartedAt) / this.reloadDuration, 0, 1),
    };
  }

  /**
   * 把射击冷却与换弹截止时间整体后移 `offset` 毫秒，供战场解除冻结时调用。
   * 换弹的 `delayedCall` 用累计 elapsed 计时、已被 `timeScale = 0` 冻住，
   * 但 `reloadingUntil` 是绝对时间点，不平移就会出现「HUD 显示已换好、回调其实还没跑」。
   * `lastFireAt` 初值是 -Infinity，加法后仍是 -Infinity，无需额外判断。
   */
  shiftTimers(offset: number): void {
    this.lastFireAt += offset;
    if (this.triggerHeldSince !== null) this.triggerHeldSince += offset;
    if (this.reloadingWeaponId) {
      this.reloadStartedAt += offset;
      this.reloadingUntil += offset;
    }
  }

  update(now: number, player: Player, fireHeld: boolean, fireJustPressed: boolean): WeaponFireFeedback | null {
    const w = this.current;
    const wantFire = w.auto ? fireHeld : fireJustPressed;
    if (!wantFire || this.isReloading || !w.spinUp) {
      this.triggerHeldSince = null;
    } else if (this.triggerHeldSince === null) {
      this.triggerHeldSince = now;
    }
    if (this.isReloading) {
      // 逐发填装可以被开火打断并保留已装的弹：这正是它相对整弹匣换弹的取舍空间。
      // 整弹匣换弹保持原行为，必须装完才能开火。
      if (!wantFire || w.reloadMode !== 'shell') return null;
      if ((this.state.player.ammoInMag[this.state.player.currentWeaponId] ?? 0) <= 0) return null;
      this.cancelReload();
      this.emitAmmo();
    }
    return wantFire ? this.tryFire(now, player) : null;
  }

  private tryFire(now: number, player: Player): WeaponFireFeedback | null {
    const w = this.current;
    const heldMs = this.triggerHeldSince === null ? 0 : now - this.triggerHeldSince;
    const fireRate = resolveSpinUpFireRate(w.fireRate, w.spinUp, heldMs);
    if (now - this.lastFireAt < fireRate) return null;

    const mag = this.state.player.ammoInMag[this.state.player.currentWeaponId] ?? 0;
    if (mag <= 0) {
      if (this.emptyAlertWeaponId !== this.state.player.currentWeaponId) {
        this.emptyAlertWeaponId = this.state.player.currentWeaponId;
        const emptyEvents = this.state.stats.weaponEmptyEvents;
        const currentId = this.state.player.currentWeaponId;
        emptyEvents[currentId] = (emptyEvents[currentId] ?? 0) + 1;
        SoundManager.play('empty');
        this.scene.events.emit(
          EVENTS.combatAlert,
          createEmptyAmmoAlert(this.reserveForWeapon(w) > 0),
        );
      }
      this.reload();
      return null;
    }

    this.emptyAlertWeaponId = null;
    this.lastFireAt = now;
    const muzzle = player.getMuzzle();
    const character = getCharacterDef(this.state.player.characterId);
    // 武器移动适性与角色被动共同决定承受比例，疾行者只削减额外散射，不改基础散射。
    const movementPenalty = resolveMovementPenalty(character, w.movementPenalty);
    const spreadMultiplier = resolveSpreadMultiplier(movementPenalty, player.isMoving());
    const effectiveSpread = w.spread * spreadMultiplier;
    const weaponId = this.state.player.currentWeaponId;
    const shotNumber = w.ammoChain ? (this.shotCounters[weaponId] ?? 0) + 1 : 1;
    this.shotCounters[weaponId] = w.ammoChain ? shotNumber : 0;
    const volley = resolveWeaponVolley(w, shotNumber);
    const burstSpread = effectiveSpread / volley.burstCount;
    const playerDamageMultiplier = resolveWeaponDamageMultiplier(
      this.state.player.damageMultiplier,
      character,
      mag,
      w.magazineSize,
    );
    const headshotChance = resolveHeadshotChance(
      this.state.player.headshotChance,
      character,
      w,
      this.state.player.characterPassive.calibrated,
    );
    const impactEffect = scalePlayerEffect(w.impactEffect, playerDamageMultiplier);
    const impactLinger = w.impactLinger
      ? {
          ...w.impactLinger,
          tickDamage: w.impactLinger.tickDamage === undefined
            ? undefined
            : w.impactLinger.tickDamage * playerDamageMultiplier,
        }
      : undefined;
    const killExplosion = scalePlayerEffect(w.killExplosion, playerDamageMultiplier);

    for (let burstIndex = 0; burstIndex < volley.burstCount; burstIndex++) {
      const burstCenter = volley.burstCount === 1
        ? 0
        : -effectiveSpread / 2 + burstSpread * (burstIndex + 0.5);
      for (let pelletIndex = 0; pelletIndex < volley.pelletsPerBurst; pelletIndex++) {
        const spreadRad = degToRad(burstCenter + randRange(-burstSpread / 2, burstSpread / 2));
        const b = this.bulletPool.acquire();
        b.fire({
          x: muzzle.x,
          y: muzzle.y,
          angle: muzzle.angle + spreadRad,
          speed: w.bulletSpeed,
          damage: w.damage * playerDamageMultiplier * volley.damageFactor,
          penetration: w.penetration,
          range: w.range,
          color: w.color,
          radius: w.projectileRadius ?? 4,
          impactEffect,
          impactLinger,
          projectileStyle: w.projectileStyle,
          headshotChance,
          headshotMultiplier: w.headshotMultiplier,
          chainBonus: w.chainBonus,
          killSlowMotionTier: w.killSlowMotionTier,
          bounceCount: w.bounceCount,
          knockback: w.knockback,
          executeThreshold: w.executeThreshold,
          damageDropoff: w.damageDropoff,
          markOnHit: w.markOnHit,
          killExplosion,
          impactFragments: w.impactFragments,
        });
      }
    }

    this.state.player.ammoInMag[this.state.player.currentWeaponId] = mag - 1;
    this.emitAmmo();

    if (mag - 1 <= 0 && this.reserveForWeapon(w) > 0) this.reload();

    return {
      x: muzzle.x,
      y: muzzle.y,
      angle: muzzle.angle,
      color: w.color,
      pellets: volley.totalProjectiles,
      burstCount: volley.burstCount,
      ammoChainTriggered: volley.ammoChainTriggered,
    };
  }

  reload(): void {
    if (this.isReloading) return;
    const id = this.state.player.currentWeaponId;
    const w = this.getEffectiveWeaponDef(id); // 使用增强后的武器定义

    const mag = this.state.player.ammoInMag[id] ?? 0;
    const need = w.magazineSize - mag;
    if (need <= 0) return;

    const reserve = this.reserveForWeapon(w);
    if (reserve <= 0) return;

    this.triggerHeldSince = null;

    if (w.reloadMode === 'shell') {
      this.startShellReload(id);
      return;
    }

    const reloadToken = ++this.reloadToken;
    this.reloadStartedAt = this.scene.time.now;
    this.reloadDuration = w.reloadTime;
    this.reloadingUntil = this.scene.time.now + w.reloadTime;
    this.reloadingWeaponId = id;
    SoundManager.play(WEAPON_RELOAD_EVENTS[id]);
    this.reloadEvent = this.scene.time.delayedCall(w.reloadTime, () => {
      if (reloadToken !== this.reloadToken || this.state.player.currentWeaponId !== id) return;

      const currentW = this.getEffectiveWeaponDef(id); // 再次获取定义，以防中途变化
      const canLoad = Math.min(need, this.reserveForWeapon(currentW));
      this.state.player.ammoInMag[id] = (this.state.player.ammoInMag[id] ?? 0) + canLoad;

      if (!this.hasInfiniteReserve(currentW)) {
        this.state.player.ammoReserve[currentW.ammoType] -= canLoad;
      }
      this.finishReloadState();
      SoundManager.play('weaponSwitch');
      this.emitAmmo();
    });
    this.emitAmmo();
  }

  /**
   * 逐发填装的一次装填周期。
   *
   * 每发独立结算并重新排下一发，因此开火打断时已装的弹全部保留。
   * 单发耗时由 `reloadTime / magazineSize` 推导，装满一个空弹匣的总时长与整弹匣换弹一致，
   * 不需要再为它单独配一个时间字段。
   */
  private startShellReload(id: WeaponId): void {
    const w = this.getEffectiveWeaponDef(id);
    const mag = this.state.player.ammoInMag[id] ?? 0;
    // `reload()` 已经拦掉「弹匣已满」和「没有备用弹」，所以这里只可能是递归收尾。
    if (mag >= w.magazineSize || this.reserveForWeapon(w) <= 0) {
      this.finishReloadState();
      SoundManager.play('weaponSwitch');
      this.emitAmmo();
      return;
    }

    const shellInterval = Math.max(1, w.reloadTime / Math.max(1, w.magazineSize));
    const reloadToken = ++this.reloadToken;
    this.reloadStartedAt = this.scene.time.now;
    this.reloadDuration = shellInterval;
    this.reloadingUntil = this.scene.time.now + shellInterval;
    this.reloadingWeaponId = id;
    SoundManager.play(WEAPON_RELOAD_EVENTS[id]);
    this.reloadEvent = this.scene.time.delayedCall(shellInterval, () => {
      if (reloadToken !== this.reloadToken || this.state.player.currentWeaponId !== id) return;

      const currentW = this.getEffectiveWeaponDef(id);
      const loaded = this.state.player.ammoInMag[id] ?? 0;
      if (loaded >= currentW.magazineSize || this.reserveForWeapon(currentW) <= 0) {
        this.finishReloadState();
        SoundManager.play('weaponSwitch');
        this.emitAmmo();
        return;
      }

      this.state.player.ammoInMag[id] = loaded + 1;
      if (!this.hasInfiniteReserve(currentW)) {
        this.state.player.ammoReserve[currentW.ammoType] -= 1;
      }
      this.emptyAlertWeaponId = null;
      this.emitAmmo();
      // 继续排下一发；装满或备用弹耗尽时上面的分支会收尾。
      this.startShellReload(id);
    });
    this.emitAmmo();
  }

  /**
   * 清掉换弹状态字段。取消与正常收尾共用，避免两处各写一遍漏字段。
   * 同时递增 token 让仍在排队的旧回调失效 —— 逐发填装每发都会重新排一次回调，
   * 不作废的话收尾后残留的那次回调会再补装一发。
   */
  private finishReloadState(): void {
    this.reloadToken += 1;
    this.reloadEvent = null;
    this.reloadingWeaponId = null;
    this.reloadStartedAt = 0;
    this.reloadDuration = 0;
    this.reloadingUntil = 0;
    this.emptyAlertWeaponId = null;
  }

  private reserveForWeapon(weapon: WeaponDef): number {
    if (this.hasInfiniteReserve(weapon)) return Infinity;
    return this.state.player.ammoReserve[weapon.ammoType] ?? 0;
  }

  private hasInfiniteReserve(weapon: WeaponDef): boolean {
    return Boolean(weapon.infiniteAmmo || isDeveloperCheatEnabled());
  }

  private cancelReload(): void {
    const cancelledWeaponId = this.reloadingWeaponId;
    this.reloadEvent?.remove(false);
    this.finishReloadState();
    if (cancelledWeaponId) SoundManager.stop(WEAPON_RELOAD_EVENTS[cancelledWeaponId]);
  }

  /** 药品读条等外部动作开始时中断当前换弹，并立即刷新 HUD 状态。 */
  interruptReload(): void {
    if (!this.reloadingWeaponId) return;
    this.cancelReload();
    this.emitAmmo();
  }

  switchTo(id: WeaponId): boolean {
    if (!this.state.player.ownedWeapons.includes(id)) return false;
    if (!this.isWeaponUsable(id)) {
      this.scene.events.emit(EVENTS.combatAlert, createEmptyAmmoAlert(false));
      return false;
    }
    if (id === this.state.player.currentWeaponId) return true;
    this.cancelReload();
    this.triggerHeldSince = null;
    this.state.player.currentWeaponId = id;
    this.emptyAlertWeaponId = null;
    this.lastFireAt = -Infinity;
    SoundManager.play('weaponSwitch');
    if (this.state.player.ammoInMag[id] === undefined) {
      this.state.player.ammoInMag[id] = 0;
    }
    this.scene.events.emit(EVENTS.weaponChanged);
    this.emitAmmo();
    return true;
  }

  switchByIndex(index: number): void {
    const owned = this.state.player.ownedWeapons;
    if (index >= 0 && index < owned.length) this.switchTo(owned[index]);
  }

  cycle(dir: 1 | -1): void {
    const owned = this.state.player.ownedWeapons;
    if (owned.length <= 1) return;
    const cur = owned.indexOf(this.state.player.currentWeaponId);
    for (let offset = 1; offset <= owned.length; offset++) {
      const next = (cur + dir * offset + owned.length * 2) % owned.length;
      if (this.isWeaponUsable(owned[next])) {
        this.switchTo(owned[next]);
        return;
      }
    }
  }

  addAmmo(ammoType: AmmoType, amount: number): void {
    if (amount <= 0) return;
    this.state.player.ammoReserve[ammoType] += amount;
    this.emitAmmo();
  }

  pickupWeapon(id: WeaponId, autoEquip = true, reserveAmount?: number): boolean {
    const def = this.getEffectiveWeaponDef(id);
    const alreadyOwned = this.state.player.ownedWeapons.includes(id);
    if (!alreadyOwned && this.state.player.ownedWeapons.length >= MAX_WEAPON_LOADOUT_SIZE) {
      return false;
    }
    const reserve = Math.max(0, reserveAmount ?? def.magazineSize);
    if (!alreadyOwned) {
      this.state.player.ownedWeapons.push(id);
      this.state.player.ammoInMag[id] = def.magazineSize;
      if (!def.infiniteAmmo) this.state.player.ammoReserve[def.ammoType] += reserve;
    } else {
      if (!def.infiniteAmmo) this.state.player.ammoReserve[def.ammoType] += reserve;
    }

    if (!alreadyOwned && autoEquip) {
      this.switchTo(id);
      return true;
    }

    this.scene.events.emit(EVENTS.weaponChanged);
    this.emitAmmo();
    return !alreadyOwned;
  }

  isWeaponUsable(id: WeaponId): boolean {
    if (this.state.player.ownedWeapons.includes(id) && isDeveloperCheatEnabled()) return true;
    return resolveWeaponUsable({
      currentWeaponId: this.state.player.currentWeaponId,
      ownedWeapons: this.state.player.ownedWeapons,
      ammoInMag: this.state.player.ammoInMag,
      ammoReserve: this.state.player.ammoReserve,
    }, id);
  }

  getWeaponStatus(id: WeaponId): WeaponStatus {
    const weapon = this.getEffectiveWeaponDef(id);
    const ammoInMag = this.state.player.ammoInMag[id] ?? 0;
    const infiniteAmmo = this.hasInfiniteReserve(weapon);
    const ammoReserve = infiniteAmmo ? Infinity : this.state.player.ammoReserve[weapon.ammoType] ?? 0;
    const reload = this.getReloadStatus();
    return {
      weaponId: id,
      ammoInMag,
      ammoReserve,
      infiniteAmmo,
      usable: this.isWeaponUsable(id),
      reloading: reload?.weaponId === id,
      reloadProgress: reload?.weaponId === id ? reload.progress : 0,
    };
  }

  getWeaponStatuses(): WeaponStatus[] {
    return this.state.player.ownedWeapons.map((weaponId) => this.getWeaponStatus(weaponId));
  }

  private emitAmmo(): void {
    this.scene.events.emit(EVENTS.ammoChanged);
  }

  destroy(): void {
    this.cancelReload();
    this.triggerHeldSince = null;
    for (const weaponId of Object.keys(this.shotCounters) as WeaponId[]) {
      delete this.shotCounters[weaponId];
    }
  }
}
