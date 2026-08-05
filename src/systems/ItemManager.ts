import Phaser from 'phaser';
import { ITEMS, type ItemId } from '../config/items';
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
 * 玩家可携带道具管理。当前主要覆盖地雷布置与近距离触发。
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

  update(): void {
    if (this.input.justPressed('nextItem')) {
      this.cycleItem();
    }
    if (this.input.justPressed('deployItem')) {
      this.deploy();
    }
    this.checkProximityDeployables();
  }

  addItem(itemId: ItemId, amount: number): number {
    const def = ITEMS[itemId];
    if (!def || def.category !== 'deployable' || amount <= 0) return 0;

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
    if (!currentId) return;

    const def = ITEMS[currentId];
    if (!def || def.category !== 'deployable') return;

    const count = this.state.player.items[currentId] ?? 0;
    if (count <= 0) return;

    this.spawnDeployable(currentId, this.player.x, this.player.y);
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
    return (Object.keys(this.state.player.items) as ItemId[]).filter((itemId) => {
      if ((this.state.player.items[itemId] ?? 0) <= 0) return false;
      return ITEMS[itemId]?.category === 'deployable';
    });
  }

  private emitChanged(): void {
    this.scene.events.emit(EVENTS.itemChanged);
  }
}
