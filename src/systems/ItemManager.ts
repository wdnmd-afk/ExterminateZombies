import Phaser from 'phaser';
import { CARRYABLE_ITEM_IDS, ITEMS, isCarryableItem, type ItemId } from '../config/items';
import { EVENTS } from '../constants';
import type { Prop } from '../entities/Prop';
import type { Player } from '../entities/Player';
import type { Zombie } from '../entities/Zombie';
import type { GameState } from './GameState';
import type { InputManager } from './InputManager';
import { SoundManager } from './SoundManager';

interface ItemManagerOptions {
  scene: Phaser.Scene;
  state: GameState;
  input: InputManager;
  player: Player;
  spawnDeployable: (itemId: ItemId, x: number, y: number) => Prop;
  detonateProp: (prop: Prop) => void;
  getProps: () => Prop[];
  getZombies: () => Zombie[];
}

/**
 * 玩家可携带道具管理。覆盖地雷的近距离自动触发，以及油桶/面粉桶这类
 * 放下后需要玩家自己引爆的携带物。携带资格统一由 `isCarryableItem` 判定。
 */
export class ItemManager {
  private scene: Phaser.Scene;
  private state: GameState;
  private input: InputManager;
  private player: Player;
  private spawnDeployable: (itemId: ItemId, x: number, y: number) => Prop;
  private detonateProp: (prop: Prop) => void;
  private getProps: () => Prop[];
  private getZombies: () => Zombie[];

  constructor(options: ItemManagerOptions) {
    this.scene = options.scene;
    this.state = options.state;
    this.input = options.input;
    this.player = options.player;
    this.spawnDeployable = options.spawnDeployable;
    this.detonateProp = options.detonateProp;
    this.getProps = options.getProps;
    this.getZombies = options.getZombies;

    this.ensureCurrentItem();
  }

  update(allowInput = true): void {
    if (allowInput) {
      if (this.input.justPressed('nextItem')) {
        this.cycleItem();
      }
      if (this.input.justPressed('deployItem')) {
        this.deploy();
      }
    }
    // 药品读条只封锁玩家布置输入，已经放下的地雷仍必须正常感应敌人。
    this.checkProximityDeployables();
  }

  addItem(itemId: ItemId, amount: number): number {
    if (!isCarryableItem(itemId) || amount <= 0) return 0;
    const def = ITEMS[itemId];

    const current = this.state.player.items[itemId] ?? 0;
    const carryMax = def.carryMax ?? Number.MAX_SAFE_INTEGER;
    const next = Math.min(carryMax, current + amount);
    const added = next - current;
    if (added <= 0) return 0;

    this.state.player.items[itemId] = next;
    if (!this.state.player.currentItemId || (this.state.player.items[this.state.player.currentItemId] ?? 0) <= 0) {
      this.state.player.currentItemId = itemId;
    }
    this.emitChanged();
    return added;
  }

  private deploy(): void {
    const currentId = this.state.player.currentItemId as ItemId | null;
    if (!currentId || !isCarryableItem(currentId)) return;

    const count = this.state.player.items[currentId] ?? 0;
    if (count <= 0) return;

    this.spawnDeployable(currentId, this.player.x, this.player.y);
    // `mineDeploy` 是通用的「放下重物」提示音，三种携带物共用；不是地雷专属线索。
    SoundManager.playAt('mineDeploy', this.player.x, this.player.y);
    this.state.player.items[currentId] = count - 1;
    if (this.state.player.items[currentId] <= 0) {
      this.ensureCurrentItem();
    }
    this.emitChanged();
  }

  private cycleItem(): void {
    const owned = this.getOwnedItemIds();
    if (owned.length === 0) {
      this.state.player.currentItemId = null;
      this.emitChanged();
      return;
    }

    const currentId = this.state.player.currentItemId;
    const currentIndex = currentId ? owned.indexOf(currentId as ItemId) : -1;
    const nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % owned.length;
    this.state.player.currentItemId = owned[nextIndex];
    this.emitChanged();
  }

  private checkProximityDeployables(): void {
    const zombies = this.getZombies();
    if (zombies.length === 0) return;

    for (const prop of this.getProps()) {
      if (!prop.active || prop.def.trigger !== 'onProximity') continue;
      const triggered = zombies.some((zombie) => zombie.active && prop.isWithinProximity(zombie.x, zombie.y));
      if (triggered) {
        this.detonateProp(prop);
      }
    }
  }

  private ensureCurrentItem(): void {
    const owned = this.getOwnedItemIds();
    this.state.player.currentItemId = owned[0] ?? null;
    this.emitChanged();
  }

  private getOwnedItemIds(): ItemId[] {
    // 按配置表顺序而不是拾取顺序遍历：多种道具同时在手时，
    // 切换键的循环次序必须稳定，否则玩家先捡到什么就决定了肌肉记忆。
    return CARRYABLE_ITEM_IDS.filter((itemId) => (this.state.player.items[itemId] ?? 0) > 0);
  }

  private emitChanged(): void {
    this.scene.events.emit(EVENTS.itemChanged);
  }
}
