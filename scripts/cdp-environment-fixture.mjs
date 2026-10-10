import Phaser from 'phaser';
import { CHARACTERS } from '../src/config/characters.ts';
import { BATTLEFIELD_TILE_SETS } from '../src/config/environmentTextures.ts';
import { LEVELS } from '../src/config/levels.ts';
import { GAME_HEIGHT, GAME_WIDTH } from '../src/constants.ts';
import { Obstacle } from '../src/entities/Obstacle.ts';
import { Player } from '../src/entities/Player.ts';
import { renderBattlefield } from '../src/systems/BattlefieldRenderer.ts';
import { configureHighResolutionScene } from '../src/systems/DisplayManager.ts';
import { InputManager } from '../src/systems/InputManager.ts';

export class EnvironmentAcceptanceScene extends Phaser.Scene {
  constructor() { super('EnvironmentAcceptanceScene'); }

  create({ theme, fallback = false }) {
    configureHighResolutionScene(this);
    this.theme = theme;
    this.fallback = fallback;
    this.ready = false;
    this.physics.world.setBounds(0, 0, GAME_WIDTH, GAME_HEIGHT);
    const tileSet = BATTLEFIELD_TILE_SETS[theme];
    const hiddenKey = `fixture-hidden-${tileSet.rail.textureKey}`;
    this.textureBefore = Object.fromEntries(Object.entries(tileSet).map(([layer, definition]) => {
      const texture = this.textures.get(definition.textureKey);
      return [layer, { ...definition, exists: this.textures.exists(definition.textureKey), actualWidth: texture.source[0].width, actualHeight: texture.source[0].height }];
    }));
    if (fallback) this.textures.renameTexture(tileSet.rail.textureKey, hiddenKey);
    try { renderBattlefield(this, theme === 'endless' ? 'endless' : 'level', theme === 'endless' ? null : theme); }
    finally { if (fallback) this.textures.renameTexture(hiddenKey, tileSet.rail.textureKey); }
    this.background = this.children.list.map(object => ({ type: object.type, texture: object instanceof Phaser.GameObjects.TileSprite ? object.displayTexture.key : object.texture?.key ?? null, x: object.x, y: object.y, width: object.displayWidth, height: object.displayHeight, rotation: object.rotation, depth: object.depth }));
    const level = LEVELS.find(entry => entry.id === theme);
    this.placements = level?.obstacles ?? [];
    this.obstacles = this.placements.map(placement => new Obstacle(this, placement));
    this.group = this.physics.add.staticGroup();
    for (const obstacle of this.obstacles) for (const tile of obstacle.collisionTiles) this.group.add(tile);
    this.player = new Player(this, 640, 360, CHARACTERS.watcher);
    this.inputManager = new InputManager(this);
    this.physics.add.collider(this.player, this.group);
    this.add.text(32, 28, `环境隔离验收 / ${theme}${fallback ? ' / 缺铁轨纹理回退' : ''}`, { fontSize: '22px', color: '#fbc02d', backgroundColor: '#151515' }).setDepth(1000);
    this.add.text(32, 664, '正常预载与生产地图；碰撞由真实键盘推动。无敌群/波次/自然解锁。', { fontSize: '15px', color: '#ffffff', backgroundColor: '#151515' }).setDepth(1000);
    this.ready = true;
    window.__ENVIRONMENT__ = this;
    this.events.once('shutdown', () => { this.ready = false; });
  }

  prepareCollision() {
    const obstacle = this.obstacles[0];
    if (!obstacle) return null;
    const tiles = obstacle.collisionTiles;
    const center = [...tiles].sort((first, second) => second.width * second.height - first.width * first.height)[0];
    const radius = this.player.body.radius;
    const right = Math.max(...tiles.filter(tile => Math.abs(tile.y - center.y) < tile.height / 2 + radius).map(tile => tile.body.right));
    this.player.teleportTo(right + radius + 80, center.y);
    return { start: { x: this.player.x, y: this.player.y }, right, radius, placement: this.placements[0], tiles: tiles.map(tile => ({ x: tile.x, y: tile.y, width: tile.width, height: tile.height, body: { x: tile.body.x, y: tile.body.y, width: tile.body.width, height: tile.body.height } })) };
  }

  update() { if (this.ready) this.player.update(this.inputManager); }

  report() {
    return { theme: this.theme, fallback: this.fallback, textureBefore: this.textureBefore, restored: Object.values(BATTLEFIELD_TILE_SETS[this.theme]).every(entry => this.textures.exists(entry.textureKey)), background: this.background, placements: this.placements, collisions: this.obstacles.map(obstacle => ({ x: obstacle.x, y: obstacle.y, rotation: obstacle.rotation, tiles: obstacle.collisionTiles.length })), player: { x: this.player.x, y: this.player.y, radius: this.player.body.radius }, world: { x: this.physics.world.bounds.x, y: this.physics.world.bounds.y, width: this.physics.world.bounds.width, height: this.physics.world.bounds.height }, missing: this.children.list.filter(object => object.visible && object.texture?.key === '__MISSING').length };
  }
}

export function mountEnvironmentFixture(game, theme, fallback = false) {
  game.scene.getScenes(true).forEach(scene => game.scene.stop(scene.sys.settings.key));
  if (!game.scene.keys.EnvironmentAcceptanceScene) game.scene.add('EnvironmentAcceptanceScene', EnvironmentAcceptanceScene);
  game.scene.start('EnvironmentAcceptanceScene', { theme, fallback });
}
