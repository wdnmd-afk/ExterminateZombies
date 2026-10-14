import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { describe, it } from 'node:test';
import { canShootCombatTarget, chooseCombatMovement, chooseCombatSkillAim, projectilePressure, segmentDistance, selectCombatTarget, selectCombatWeapon, shouldUseCombatSkill, weaponExplosionRadius } from '../scripts/cdp-combat-policy.mjs';
import { analyzePauseProgress, assertResumeOrigin, getRendererConfiguration } from '../scripts/cdp-acceptance-session.mjs';
import { chooseCombatAim } from '../scripts/cdp-combat-policy.mjs';

describe('验收渲染器选择', () => {
  it('默认软件、系统自动、Canvas 回退互不混淆', () => {
    assert.ok(getRendererConfiguration().args.includes('--use-angle=swiftshader'));
    assert.deepEqual(getRendererConfiguration('auto').args, []);
    assert.deepEqual(getRendererConfiguration('canvas').args, ['--disable-webgl', '--disable-webgl2']);
    assert.throws(() => getRendererConfiguration('unknown'), /未知验收渲染模式/);
  });
});

describe('慢速爆炸弹的提前量与截弹安全', () => {
  const shot = () => ({ diagnostics: { player: { x: 100, y: 360 } }, weapon: { bulletSpeed: 390, range: 820, spread: 2, projectileRadius: 9, impactEffect: { radius: 170 } }, enemies: [] });
  const target = { x: 600, y: 360, vx: 0, vy: 0, radius: 32 };
  it('静止目标不提前，横移目标按交会时间而非半秒上限瞄准', () => {
    const data = shot();
    assert.deepEqual(chooseCombatAim(data, target), { x: 600, y: 360 });
    const moving = { ...target, vy: 60 };
    const aim = chooseCombatAim(data, moving);
    const travel = (aim.y - moving.y) / moving.vy;
    assert.ok(travel > 1);
    assert.ok(Math.abs(Math.hypot(aim.x - 100, aim.y - 360) / 390 - travel) < 0.000001);
  });
  it('不可追及目标不产生 NaN 或反向提前量', () => {
    const aim = chooseCombatAim(shot(), { ...target, vx: 800 });
    assert.deepEqual(aim, { x: 600, y: 360 });
  });
  it('普通敌人在枪后不会被固定宽走廊误判截弹', () => {
    const data = shot(); data.enemies = [{ x: 50, y: 360, vx: 0, vy: 0, radius: 14 }];
    assert.equal(canShootCombatTarget(data, target), true);
  });
  it('近处沿射线或正在横穿的敌人仍禁止开火', () => {
    const data = shot();
    for (const enemy of [{ x: 220, y: 360, vx: 0, vy: 0, radius: 14 }, { x: 220, y: 440, vx: 0, vy: -180, radius: 14 }]) {
      data.enemies = [enemy]; assert.equal(canShootCombatTarget(data, target), false);
    }
  });
  it('横向远离射线可开火，但枪后死亡爆炸仍保留安全禁火', () => {
    const data = shot(); data.enemies = [{ x: 220, y: 490, vx: 0, vy: 180, radius: 14 }];
    assert.equal(canShootCombatTarget(data, target), true);
    data.enemies = [{ x: 50, y: 360, vx: 0, vy: 0, radius: 14, deathExplosionRadius: 100 }];
    assert.equal(canShootCombatTarget(data, target), false);
  });
});

const scenario = () => ({
  state: { player: { weapon: 'pistol', characterId: 'watcher' } },
  diagnostics: { player: { x: 640, y: 360 } },
  weapon: { id: 'pistol', range: 700 },
  weaponStatuses: [{ weaponId: 'pistol', usable: true, ammoInMag: 7 }, { weaponId: 'rifle', usable: true, ammoInMag: 0 }],
  skill: { ready: true }, reloading: false, enemies: [], projectiles: [], tiles: [], cores: [], blastWarnings: [],
});

describe('暂停采样不把恢复后输入延迟当作泄漏', () => {
  it('续用浏览器 profile 仍须固定 localStorage 的协议、域名和端口', () => {
    assert.doesNotThrow(() => assertResumeOrigin('http://127.0.0.1:10337/', 'http://127.0.0.1:10337/'));
    assert.throws(() => assertResumeOrigin('http://127.0.0.1:10337/', 'http://127.0.0.1:10356/'), /原存档站点/);
    assert.throws(() => assertResumeOrigin('http://127.0.0.1:10337/', 'http://localhost:10337/'), /原存档站点/);
  });
  const snapshots = () => {
    const before = { sceneTime: 1000, state: { stats: { elapsedMs: 1000 }, player: { endlessOverdrive: { milestone: 20, expiresAt: 8000 } } } };
    const paused = structuredClone(before);
    const held = { elapsedMs: 1000 };
    const after = { sceneTime: 11500, state: { stats: { elapsedMs: 3500 }, player: { endlessOverdrive: { milestone: 20, expiresAt: 16000 } } } };
    return { before, paused, held, after };
  };
  it('恢复后2500ms才取到读数，只要暂停进度冻结且冷却守恒就通过', () => {
    const { before, paused, held, after } = snapshots();
    assert.equal(analyzePauseProgress(before, paused, held, after).passed, true);
  });
  it('暂停内部推进1ms也必须失败', () => {
    const { before, paused, held, after } = snapshots(); held.elapsedMs++;
    assert.equal(analyzePauseProgress(before, paused, held, after).passed, false);
  });
  it('过载错误消耗暂停时间必须失败，不放宽成只看游戏总时长', () => {
    const { before, paused, held, after } = snapshots(); after.state.player.endlessOverdrive.expiresAt = 8000;
    assert.equal(analyzePauseProgress(before, paused, held, after).passed, false);
  });
});

describe('自然实景驱动的真实资源与危险决策', () => {
  it('有储备的空匣步枪可正常选中再按R，不退回无限手枪', () => {
    assert.equal(selectCombatWeapon(scenario()), 'rifle');
  });
  it('无弹不可用武器不被选择', () => {
    const data = scenario(); data.weaponStatuses[1].usable = false;
    assert.equal(selectCombatWeapon(data), 'pistol');
  });
  it('不取消正在进行的有限武器换弹', () => {
    const data = scenario(); data.state.player.weapon = 'rifle'; data.reloading = true;
    assert.equal(selectCombatWeapon(data), 'rifle');
  });
  it('狂潮爆破已有储备且正在换弹时，不因瞬时禁火反复切手枪取消装填', () => {
    const data = scenario();
    data.state.frenzy = { phase: 'boss' }; data.state.player.weapon = 'rpg'; data.reloading = true;
    data.weaponStatuses[1].weaponId = 'rpg';
    data.weaponDefinitions = { rpg: { id: 'rpg', impactEffect: { radius: 170 } } };
    data.enemies = [{ id: 'walker', x: 680, y: 360, radius: 14 }];
    assert.equal(selectCombatWeapon(data), 'rpg');
  });
  it('技能使用真实就绪状态而非固定20秒，贴身敌人不被远处目标遮蔽', () => {
    const data = scenario(); data.enemies.push({ x: 690, y: 360 });
    assert.equal(shouldUseCombatSkill(data), true);
    data.skill.ready = false;
    assert.equal(shouldUseCombatSkill(data), false);
  });
  it('检测穿过玩家的弹道，而不是只看预测末端', () => {
    const player = { x: 640, y: 360 };
    assert.equal(segmentDistance(player, { x: 500, y: 360 }, { x: 800, y: 360 }), 0);
    assert.ok(projectilePressure(player, [{ x: 500, y: 360, vx: 400, vy: 0, radius: 7 }]) > 5000);
    assert.equal(projectilePressure(player, [{ x: 500, y: 100, vx: 400, vy: 0, radius: 7 }]), 0);
  });
  it('狂潮优先真实猎杀目标，不停在中场刷最近杂兵', () => {
    const data = scenario(); data.state.frenzy = { phase: 'hunting' };
    const target = { id: 'bloodied', x: 180, y: 190, radius: 17 };
    data.enemies = [{ id: 'walker', x: 640, y: 560, radius: 12 }, target];
    data.frenzyTargets = [{ status: 'alive', enemy: target }];
    assert.equal(selectCombatTarget(data), target);
  });
  it('导航主动接近可见核心但不越过世界边界', () => {
    const data = scenario(); data.cores = [{ x: 800, y: 360 }];
    const destination = chooseCombatMovement(data, null, []);
    assert.ok(destination.x > 640 && destination.x < 1280);
    assert.ok(destination.y > 0 && destination.y < 720);
  });
  it('当前位置处于红圈时向外移动', () => {
    const data = scenario(); data.blastWarnings = [{ x: 640, y: 360, radius: 100 }];
    const destination = chooseCombatMovement(data, null, []);
    assert.ok(Math.hypot(destination.x - 640, destination.y - 360) > 30);
  });
  it('爆破安全距离包含二次破片的偏移和半径', () => {
    assert.equal(weaponExplosionRadius({ impactEffect: { radius: 170 }, impactFragments: { offset: 140, radiusFactor: 0.32 } }), 194.4);
  });
  it('70px死亡爆炸范围内不开火，退开后才允许击杀', () => {
    const data = scenario();
    const bomber = { id: 'bomber', x: 690, y: 360, radius: 13, deathExplosionRadius: 70 };
    data.enemies = [bomber];
    assert.equal(canShootCombatTarget(data, bomber), false);
    bomber.x = 820;
    assert.equal(canShootCombatTarget(data, bomber), true);
  });
  it('电链死亡爆炸不能因目标在远处而忽略身边可被连锁的敌人', () => {
    const data = scenario(); data.weapon.killExplosion = { radius: 84 };
    const target = { id: 'walker', x: 940, y: 360, radius: 14 };
    data.enemies = [target, { id: 'walker', x: 710, y: 360, radius: 14 }];
    assert.equal(canShootCombatTarget(data, target), false);
  });
  it('RPG前方近敌会提前引爆，即使瞄准远处也禁火', () => {
    const data = scenario(); data.weapon.impactEffect = { radius: 170 }; data.weapon.projectileRadius = 9;
    const target = { id: 'tank', x: 1040, y: 360, radius: 24 };
    data.enemies = [target, { id: 'walker', x: 730, y: 370, radius: 14 }];
    assert.equal(canShootCombatTarget(data, target), false);
    data.enemies[1].y = 510;
    assert.equal(canShootCombatTarget(data, target), true);
  });
  it('狂潮没有安全火箭目标时正常切回已装备手枪', () => {
    const data = scenario(); data.state.frenzy = { phase: 'hunting' };
    data.weaponStatuses[1].weaponId = 'rpg';
    data.weaponDefinitions = { rpg: { id: 'rpg', impactEffect: { radius: 170 } } };
    data.enemies = [{ id: 'walker', x: 680, y: 360, radius: 14 }];
    assert.equal(selectCombatWeapon(data), 'pistol');
  });
  it('三个核心收齐后优先首领而不是中距离杂兵', () => {
    const data = scenario(); data.state.frenzy = { phase: 'boss' };
    const boss = { id: 'tank_boss', x: 640, y: 84, radius: 40 };
    data.enemies = [{ id: 'walker', x: 640, y: 560, radius: 14 }, boss];
    assert.equal(selectCombatTarget(data), boss);
  });
  it('爆破首领期不能因为远处杂兵可射就切回无法射首领的火箭', () => {
    const data = scenario(); data.state.frenzy = { phase: 'boss' };
    data.weaponStatuses[1].weaponId = 'rpg';
    data.weaponDefinitions = { rpg: { id: 'rpg', range: 820, impactEffect: { radius: 170 } } };
    data.enemies = [{ id: 'tank_boss', x: 760, y: 360, radius: 40 }, { id: 'walker', x: 300, y: 620, radius: 14 }];
    assert.equal(selectCombatWeapon(data), 'pistol');
    data.enemies[0].x = 1040;
    assert.equal(selectCombatWeapon(data), 'rpg');
  });
  it('爆破清近敌时不把导航目标从首领切换成杂兵', () => {
    const data = scenario(); data.state.frenzy = { phase: 'boss' };
    data.weaponStatuses[1].weaponId = 'rpg';
    data.weaponDefinitions = { rpg: { id: 'rpg', range: 820, impactEffect: { radius: 170 } } };
    const boss = { id: 'tank_boss', x: 1100, y: 360, radius: 40 };
    const walker = { id: 'walker', x: 240, y: 360, radius: 14 };
    data.enemies = [boss, walker];
    const next = chooseCombatMovement(data, walker, []);
    assert.ok(next.x > data.diagnostics.player.x);
  });
  it('爆破手枪防身时仍先退到主武器的安全距离', () => {
    const data = scenario(); data.state.frenzy = { phase: 'boss' };
    data.weaponStatuses[1].weaponId = 'rpg';
    data.weaponDefinitions = { rpg: { id: 'rpg', range: 820, impactEffect: { radius: 170 } } };
    const boss = { id: 'tank_boss', x: 900, y: 360, radius: 40 };
    data.enemies = [boss];
    const next = chooseCombatMovement(data, boss, []);
    assert.ok(Math.hypot(next.x - boss.x, next.y - boss.y) > 260);
  });
  it('相位疾冲评估完整240px落点，不能只看40px局部航点', () => {
    const data = scenario(); data.state.player.characterId = 'runner'; data.character = { active: { distance: 240 } };
    data.enemies = [{ id: 'bomber', x: 880, y: 360, radius: 13, deathExplosionRadius: 70 }];
    const aim = chooseCombatSkillAim(data, { x: 680, y: 360 }, data.enemies[0], []);
    assert.ok(aim && Math.abs(Math.hypot(aim.x - 640, aim.y - 360) - 240) < 0.001);
    assert.ok(Math.hypot(aim.x - 880, aim.y - 360) > 170);
  });
  it('导航远离会死亡爆炸的贴身敌人', () => {
    const data = scenario(); const enemy = { id: 'bomber', x: 690, y: 360, radius: 13, deathExplosionRadius: 70 };
    data.enemies = [enemy];
    const destination = chooseCombatMovement(data, enemy, []);
    assert.ok(Math.hypot(destination.x - enemy.x, destination.y - enemy.y) > 50);
  });
  it('第30关障碍后两敌的真实坐标不能让导航持续四步循环', async () => {
    const server = await createServer({ configFile: false, server: { middlewareMode: true, watch: null }, logLevel: 'error' });
    try {
      const { LEVELS } = await server.ssrLoadModule('/src/config/levels.ts');
      const { buildRotatedRectTiles } = await server.ssrLoadModule('/src/utils/geometry.ts');
      const { lineIsClear } = await import('../scripts/cdp-combat-policy.mjs');
      const data = scenario();
      data.pursue = true;
      data.weapon = { id: 'rifle', range: 1200 };
      data.diagnostics.player = { x: 959.3498285488165, y: 368.70562214626216 };
      data.enemies = [
        { id: 'drifter', token: 5, x: 1163, y: 389.37357353706676, radius: 13 },
        { id: 'walker', token: 3, x: 1164, y: 352.24621274123456, radius: 14 },
      ];
      data.tiles = LEVELS.find(level => level.id === 'level_30').obstacles.flatMap(obstacle => buildRotatedRectTiles(obstacle.x, obstacle.y, obstacle.width, obstacle.height, obstacle.rotation));
      const hazards = [{ x: 1080, y: 520, radius: 90 }, { x: 1080, y: 200, radius: 100 }];
      const navigation = {};
      let reached = false;
      for (let index = 0; index < 160; index++) {
        const player = data.diagnostics.player;
        const target = selectCombatTarget(data);
        if (lineIsClear(player, target, data.tiles)) { reached = true; break; }
        const destination = chooseCombatMovement(data, target, hazards, navigation);
        const distance = Math.hypot(destination.x - player.x, destination.y - player.y);
        if (distance === 0) continue;
        const fraction = Math.min(1, 10 / distance);
        const next = { x: player.x + (destination.x - player.x) * fraction, y: player.y + (destination.y - player.y) * fraction };
        assert.ok(lineIsClear(player, next, data.tiles, 16), '不能穿过障碍求通过');
        player.x = next.x; player.y = next.y;
      }
      assert.equal(reached, true, '160个正常移动步长内应绕到可射击位置，而不是原地循环');
    } finally { await server.close(); }
  });
  it('遮挡目标未变时沿缓存路线走，不每帧重选两侧', () => {
    const data = scenario(); data.pursue = true;
    const target = { id: 'walker', token: 3, x: 1000, y: 360, radius: 14 };
    data.enemies = [target]; data.tiles = [{ x: 800, y: 360, width: 40, height: 140 }];
    const waypoint = { x: 640, y: 320 };
    const navigation = { goal: { ...target }, path: [waypoint] };
    assert.equal(chooseCombatMovement(data, target, [], navigation), waypoint);
  });
  it('缓存航点进入新红圈时必须废弃旧路线', () => {
    const data = scenario(); data.pursue = true;
    const target = { id: 'walker', token: 3, x: 1000, y: 360, radius: 14 };
    data.enemies = [target]; data.tiles = [{ x: 800, y: 360, width: 40, height: 140 }];
    data.blastWarnings = [{ x: 640, y: 310, radius: 40 }];
    const waypoint = { x: 640, y: 320 };
    const navigation = { goal: { ...target }, path: [waypoint] };
    assert.notEqual(chooseCombatMovement(data, target, [], navigation), waypoint);
  });
  it('视线打开后释放绕障路径，不继续走过时航点', () => {
    const data = scenario(); data.pursue = true;
    const target = { id: 'walker', token: 3, x: 1000, y: 360, radius: 14 };
    data.enemies = [target];
    const navigation = { goal: { ...target }, path: [{ x: 640, y: 320 }] };
    chooseCombatMovement(data, target, [], navigation);
    assert.deepEqual(navigation.path, []);
  });
});
