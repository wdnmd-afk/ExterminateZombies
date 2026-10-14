import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BossAcceptanceTracker, bossObservationRange, canFireForBossObservation, requiredBossAbilities } from '../scripts/cdp-boss-observer.mjs';

const scenario = ability => ({
  state: { wave: 1, stats: { elapsedMs: 0 } },
  bossDefinition: { ability, bossPhases: [] },
  enemies: [{ id: 'tank_boss', token: 1, x: 640, y: 200, vx: 0, vy: 0, health: 3400, maxHealth: 3400, phase: { phase: 1 } }],
  blastWarnings: [], projectiles: [],
  events: [{ type: 'boss-ability', combatAt: 0, payload: { key: `boss-ability-${ability.kind}` }, boss: { id: 'tank_boss', token: 1, x: 640, y: 200, phase: 1 }, player: { x: 640, y: 340 }, otherEnemyCount: 0 }],
});

describe('Boss实景只读观察的通过边界', () => {
  it('爆破阶段观测期间不向仍在飞行的击返弹开火，以免真实反伤跨过整个阶段', () => {
    const control = { holdFire: false, boss: { id: 'bomber_boss' } };
    const data = { state: { stats: { elapsedMs: 1500 } }, projectiles: [] };
    assert.equal(canFireForBossObservation({ ...data, projectiles: [{ kind: 'countershot', sourceId: 'bomber_boss' }] }, control), false);
    assert.equal(canFireForBossObservation(data, control), true);
    assert.equal(canFireForBossObservation(data, { ...control, holdFire: true }), false);
  });
  it('没有弹体但已在前摇时仍须停火，避免子弹撞上刚出生的击返弹', () => {
    const tracker = new BossAcceptanceTracker();
    const data = scenario({ kind: 'countershot', windup: 980, minRange: 150, maxRange: 560 });
    data.enemies[0].id = 'bomber_boss'; data.events[0].boss.id = 'bomber_boss';
    const control = tracker.observe(data);
    data.events = []; data.state.stats.elapsedMs = 1000;
    assert.equal(canFireForBossObservation(data, { ...control, holdFire: false }), false);
    data.state.stats.elapsedMs = 1300;
    assert.equal(canFireForBossObservation(data, { ...control, holdFire: false }), true);
  });
  it('只出现预警文字不能宣称技能实际执行', () => {
    const tracker = new BossAcceptanceTracker();
    const data = scenario({ kind: 'shockwave', radius: 126, windup: 820, maxRange: 150, minRange: 0 });
    assert.equal(tracker.observe(data).holdFire, true);
    data.state.stats.elapsedMs = 3000; data.events = [];
    assert.equal(tracker.observe(data).holdFire, true);
  });
  it('真实红圈出现后到期消退，且Boss仍活跃，才算震荡执行', () => {
    const tracker = new BossAcceptanceTracker();
    const data = scenario({ kind: 'shockwave', radius: 126, windup: 820, maxRange: 150, minRange: 0 });
    data.blastWarnings = [{ x: 640, y: 200, radius: 126 }];
    tracker.observe(data);
    data.events = []; data.state.stats.elapsedMs = 1000; data.blastWarnings = [];
    assert.equal(tracker.observe(data).holdFire, false);
    assert.equal(tracker.captures[0].proof.warningPeak, 1);
  });
  it('环射必须采到对应速度和出生位置的全部14弹', () => {
    const tracker = new BossAcceptanceTracker();
    const data = scenario({ kind: 'volley', windup: 800, projectileSpeed: 190, projectileCount: 14, maxRange: 720, minRange: 0 });
    tracker.observe(data); data.events = []; data.state.stats.elapsedMs = 900;
    data.projectiles = Array.from({ length: 13 }, (_, index) => { const angle = index * Math.PI / 7; return { kind: 'normal', x: 640 + Math.cos(angle) * 19, y: 200 + Math.sin(angle) * 19, vx: Math.cos(angle) * 190, vy: Math.sin(angle) * 190 }; });
    assert.equal(tracker.observe(data).holdFire, true);
    data.projectiles.push({ kind: 'normal', x: 659, y: 200, vx: 190, vy: 0 });
    assert.equal(tracker.observe(data).holdFire, false);
  });
  it('第二阶段逐项检查新增技能，不能只验其中一个', () => {
    const abilities = [{ kind: 'shockwave', radius: 112, maxRange: 140 }, { kind: 'bombard', minRange: 150, maxRange: 560 }];
    assert.deepEqual(requiredBossAbilities({ bossPhases: [{ unlockAbilities: abilities }] }, 2), abilities);
    assert.ok(bossObservationRange(abilities[0]) > 112 && bossObservationRange(abilities[0]) < 140);
  });
  it('TTK使用冻结后的战斗时间，单阶段不冒称三阶段全过', () => {
    const tracker = new BossAcceptanceTracker();
    const data = scenario({ kind: 'dash', windup: 600, dashSpeed: 270, minRange: 175, maxRange: 440 });
    tracker.observe(data); data.events = []; data.sceneTime = 500000; data.state.stats.elapsedMs = 700; data.enemies[0].vx = 270;
    assert.equal(tracker.observe(data).holdFire, false);
    data.state.stats.elapsedMs = 1000; data.enemies = []; tracker.observe(data);
    assert.equal(tracker.result()[0].observedTtkMs, 1000);
    assert.equal(tracker.result()[0].allPhaseAbilitiesObserved, false);
  });
});
