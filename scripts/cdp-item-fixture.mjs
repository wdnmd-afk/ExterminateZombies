import { ITEMS } from '../src/config/items.ts';
import { EVENTS } from '../src/constants.ts';
import { Player } from '../src/entities/Player.ts';
import { Prop } from '../src/entities/Prop.ts';
import { Zombie } from '../src/entities/Zombie.ts';

export function attachItemFixture(game, itemId) {
  const scene = game.scene.getScene('GameScene');
  const entities = () => scene.physics.world.bodies.entries.map(body => body.gameObject);
  const enemies = () => entities().filter(object => object instanceof Zombie && object.isCombatActive());
  const player = entities().find(object => object instanceof Player);
  const target = enemies().find(enemy => enemy.def.id === 'tank');
  if (!target) throw new Error('Expected the naturally spawned frenzy tank');
  const state = scene.getState();
  state.frenzy.recordEligible = false;
  const inventoryBefore = { ...state.player.items };
  state.player.items[itemId] = 1;
  state.player.currentItemId = itemId;
  scene.events.emit(EVENTS.itemChanged);
  player.teleportTo(640, 360);
  const initialTarget = { id: target.def.id, token: target.getLifecycleToken(), health: target.health, speed: target.def.speed };
  const positions = { x: 640, y: 180 };
  const originalMoves = new Map();
  const frames = [];
  let moving = false;
  let deployed = null;
  const control = () => {
    for (const enemy of enemies()) {
      if (!originalMoves.has(enemy)) originalMoves.set(enemy, enemy.body.moves);
      if (enemy === target && moving) { enemy.body.moves = true; continue; }
      enemy.body.moves = false;
      enemy.body.reset(enemy === target ? positions.x : 60, enemy === target ? positions.y : 670);
    }
  };
  const observe = () => {
    const props = entities().filter(object => object instanceof Prop && object.active);
    const prop = props.find(object => object.itemId === itemId);
    if (prop && !deployed) deployed = { x: prop.x, y: prop.y, multiplier: prop.playerDamageMultiplier, textures: prop.list.filter(child => child.type === 'Image').map(child => child.texture.key), frame: game.loop.frame, time: scene.time.now };
    frames.push({ frame: game.loop.frame, time: scene.time.now, target: { x: target.x, y: target.y, health: target.health, speed: Math.hypot(target.body.velocity.x, target.body.velocity.y), active: target.isCombatActive() }, stock: state.player.items[itemId], deployed: Boolean(prop), lingerZones: scene.getCombatDiagnostics().objects.lingerZones });
  };
  scene.events.on('preupdate', control);
  scene.events.on('postupdate', observe);
  scene.events.once('shutdown', () => {
    scene.events.off('preupdate', control); scene.events.off('postupdate', observe);
    for (const [enemy, moves] of originalMoves) if (enemy.body) enemy.body.moves = moves;
  });
  const fixture = {
    itemId,
    trigger: () => {
      if (!deployed) throw new Error('Deploy through Q before positioning the natural target');
      player.teleportTo(640, 560);
      positions.x = itemId === 'demo_charge' ? 690 : 670;
      positions.y = 360;
      target.body.reset(positions.x, positions.y);
      moving = itemId === 'dust_canister' || itemId === 'cryo_canister';
      target.body.moves = moving;
      return { prop: deployed, target: { x: target.x, y: target.y } };
    },
    moveTarget: (x, y) => { positions.x = x; positions.y = y; target.body.reset(x, y); },
    reveal: () => player.teleportTo(640, 560),
    report: () => ({ itemId, inventoryBefore, fixtureInventory: '只给本隔离局当前道具1份；合法掉落另用自然战役证据。其余敌人隔离；火焰/高爆目标固定位置但不改血，粉尘/低温目标保留真实移动。', definition: ITEMS[itemId], initialTarget, deployed, frames, current: frames.at(-1) }),
  };
  window.__ITEM_FIXTURE__ = fixture;
  control();
  return { initialTarget, inventoryBefore };
}
