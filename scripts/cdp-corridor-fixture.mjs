import { CORRIDOR_BREACH_X, CORRIDOR_LANE } from '../src/config/corridor.ts';
import { EVENTS } from '../src/constants.ts';
import { Bullet } from '../src/entities/Bullet.ts';
import { CorridorCard } from '../src/entities/CorridorCard.ts';
import { Player } from '../src/entities/Player.ts';
import { Zombie } from '../src/entities/Zombie.ts';

/**
 * 通道模式实景夹具。
 *
 * 只做三件受控的事：玩家定位、把一只已自然生成的僵尸移到突破线前、录样本。
 * 卡片伤害全部来自真实玩家射击；本文件不含任何直接改血量或直接结算的入口，
 * 以免把受控结果伪装成自然通过。
 */
export function attachCorridorFixture(game) {
  const scene = game.scene.getScene('GameScene');
  const state = () => scene.getState();
  const entities = () => (scene.physics?.world?.bodies?.entries ?? []).map(body => body.gameObject);
  const zombies = () => entities().filter(object => object instanceof Zombie && object.isCombatActive());
  const cards = () => scene.children.list.filter(object => object instanceof CorridorCard && object.active);
  const player = entities().find(object => object instanceof Player) ?? scene.children.list.find(object => object instanceof Player);

  // 池化实例会复用同一个对象，`getLifecycleToken()` 在同池内并不唯一；
  // 用 WeakMap 给「这一只僵尸」分配稳定 uid，才能跨采样对齐同一实例。
  const uidMap = new WeakMap();
  let uidSequence = 0;
  const uidOf = object => {
    if (!uidMap.has(object)) uidMap.set(object, ++uidSequence);
    return uidMap.get(object);
  };
  const allyPositions = () => scene.children.list
    .filter(object => object.type === 'Container' && object.list?.some?.(child => child.type === 'Arc' && child.radius === 11))
    .map(object => ({ x: Math.round(object.x), y: Math.round(object.y) }));

  const records = [];
  const allyBullets = [];
  const record = (name, data) => records.push({ name, data, frame: game.loop.frame, at: Date.now() });
  const observe = () => {
    for (const object of entities()) {
      if (!(object instanceof Bullet) || !object.active) continue;
      // 队友站在 y=600，向主通道（y≈360）仰射；玩家在本夹具里只会被放到 y≤600 的固定点。
      if (object.y > 530 && allyBullets.length < 1000) allyBullets.push({ x: Math.round(object.x), y: Math.round(object.y), frame: game.loop.frame });
    }
  };
  const onPickup = payload => record('pickup', payload);
  const onAnnounce = payload => record('announce', payload);
  scene.events.on('postupdate', observe);
  scene.events.on(EVENTS.pickupCollected, onPickup);
  scene.events.on(EVENTS.waveAnnounced, onAnnounce);
  scene.events.once('shutdown', () => {
    scene.events.off('postupdate', observe);
    scene.events.off(EVENTS.pickupCollected, onPickup);
    scene.events.off(EVENTS.waveAnnounced, onAnnounce);
  });

  const snapshot = () => {
    const current = state();
    const corridor = current?.corridor ?? null;
    return {
      active: game.scene.getScenes(true).map(entry => entry.sys.settings.key),
      frame: game.loop.frame,
      fps: game.loop.actualFps,
      score: current?.score ?? null,
      stats: current?.stats ? { kills: current.stats.kills, elapsedMs: current.stats.elapsedMs } : null,
      mode: current?.mode ?? null,
      corridor: corridor ? { ...corridor } : null,
      status: scene.getCorridorStatus ? scene.getCorridorStatus() : null,
      player: current ? {
        x: player?.x ?? null,
        y: player?.y ?? null,
        health: current.player.health,
        maxHealth: current.player.maxHealth,
        // 容器坐标与物理体中心可能不同步；柱位钳制问题需要分开看。
        bodyX: player?.body ? Math.round(player.body.center.x * 100) / 100 : null,
        velocityX: player?.body ? player.body.velocity.x : null,
      } : null,
      diagnostics: scene.getCombatDiagnostics ? scene.getCombatDiagnostics() : null,
      zombies: zombies().map(zombie => ({
        uid: uidOf(zombie),
        id: zombie.def.id,
        x: Math.round(zombie.x),
        y: Math.round(zombie.y),
        health: zombie.health,
        maxHealth: zombie.maxHealth,
      })),
      cards: cards().map(card => ({ kind: card.kind, x: Math.round(card.x), y: Math.round(card.y), hp: card.hp, maxHp: card.maxHp })),
      allies: allyPositions(),
      lanes: { item: CORRIDOR_LANE.item.centerY, main: CORRIDOR_LANE.main.centerY, ally: CORRIDOR_LANE.ally.centerY, breach: CORRIDOR_BREACH_X },
      allyBullets: allyBullets.length,
      records: records.length,
    };
  };

  const fixture = {
    records,
    allyBullets,
    snapshot,
    parkPlayer: (x, y) => {
      player.teleportTo(x, y);
      record('player-park', { x, y, bypass: '把玩家瞬移到指定柱位/通道用于瞄准，移动与射击仍走真实输入。' });
      return { x: player.x, y: player.y };
    },
    /** 把一只已在场的自然僵尸移到突破线前(受控终局前置，不做任何伤害操作)。 */
    breach: (x = CORRIDOR_BREACH_X - 2, y = CORRIDOR_LANE.main.centerY) => {
      const target = zombies()[0];
      if (!target) throw new Error('没有可用的自然僵尸实例');
      const before = { id: target.def.id, x: target.x, y: target.y, health: target.health };
      target.body.reset(x, y);
      record('breach-fixture', { before, after: { x: target.x, y: target.y }, bypass: '把已在场僵尸瞬移到突破线内，用于验证突破判定与终局链路；不代表自然漏怪。' });
      return { id: target.def.id, x: target.x, y: target.y };
    },
    resetAllySamples: () => { allyBullets.length = 0; },
    report: () => ({ records, allyBullets: allyBullets.slice(), frame: game.loop.frame }),
  };
  window.__CORRIDOR_FIXTURE__ = fixture;
  record('attached', { preset: state()?.corridor?.presetId ?? null });
  return { attached: true, preset: state()?.corridor?.presetId ?? null };
}
