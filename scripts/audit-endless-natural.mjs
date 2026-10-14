import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createServer } from 'vite';

const root = 'docs/execution/evidence/2026-10-08-scene-acceptance';
const runId = process.argv[2] ?? 'endless-audit-r01';
assert.match(runId, /^[a-z0-9-]+$/);
const directory = join(root, runId);
await mkdir(directory);
const sources = {};
const read = async path => {
  const bytes = await readFile(path);
  sources[path] = { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  return bytes.toString('utf8');
};
const sourceDirectory = join(root, 'endless-tactical-r03');
const result = JSON.parse(await read(join(sourceDirectory, 'endless-natural-result.json')));
const samples = (await read(join(sourceDirectory, 'endless-natural-samples.jsonl'))).trim().split('\n').map(JSON.parse);
const server = await createServer({ configFile: false, server: { middlewareMode: true, watch: null }, logLevel: 'error' });
const audit = { passed: false, auditedAt: new Date().toISOString(), sourceRun: 'endless-tactical-r03', inputOnly: true, overrides: false, chapters: [], sources };
try {
  assert.equal(result.outcome, 'objective-reached');
  assert.equal(result.inputOnly, true); assert.equal(result.overrides, false);
  assert.equal(result.final.state.mode, 'endless'); assert.equal(result.final.state.wave, 41);
  assert.deepEqual(result.errors, []); assert.deepEqual(result.failures, []);
  const { ZOMBIES } = await server.ssrLoadModule('/src/config/zombies.ts');
  const { getEndlessBossId, getEndlessBossScaling } = await server.ssrLoadModule('/src/config/endless.ts');
  for (const path of ['src/config/zombies.ts', 'src/config/endless.ts', 'src/scenes/GameScene.ts', 'src/systems/WaveManager.ts', 'src/entities/Zombie.ts']) await read(path);
  for (const chapter of [1, 2, 3, 4]) {
    const id = getEndlessBossId(chapter);
    const scaling = getEndlessBossScaling(chapter);
    const expectedMaxHealth = Math.round(ZOMBIES[id].health * scaling.healthMultiplier);
    const observations = samples.filter(sample => sample.state.wave === chapter * 10)
      .flatMap(sample => sample.tactical.enemies.filter(enemy => enemy.id === id).map(enemy => ({ elapsedMs: sample.state.stats.elapsedMs, enemy, hud: sample.boss })));
    assert.ok(observations.length > 0, `Missing chapter ${chapter} boss instance`);
    for (const observation of observations) {
      assert.equal(observation.enemy.maxHealth, expectedMaxHealth);
      assert.equal(observation.hud.maxHealth, expectedMaxHealth);
    }
    const phases = [...new Set(observations.map(observation => observation.enemy.phase.phase))].sort();
    assert.deepEqual(phases, [1, 2, 3]);
    const nextWave = [...samples, result.final].find(sample => sample.state.wave === chapter * 10 + 1);
    assert.ok(nextWave, `No real progress after chapter ${chapter}`);
    audit.chapters.push({ chapter, id, expectedMaxHealth, observedMaxHealth: [...new Set(observations.map(observation => observation.enemy.maxHealth))], phases, observationCount: observations.length, firstObservedMs: observations[0].elapsedMs, lastObservedMs: observations.at(-1).elapsedMs, nextWave: nextWave.state.wave, nextWaveElapsedMs: nextWave.state.stats.elapsedMs, configuredScaling: scaling, damageCollisionVerified: false, observedTelegraphs: result.events.filter(event => event.type === 'boss-ability' && event.boss.id === id).map(event => ({ phase: event.boss.phase, kind: event.payload.key, elapsedMs: event.combatAt })) });
  }
  assert.deepEqual(result.overdrives.map(overdrive => overdrive.milestone), [10, 20, 35]);
  audit.overdrives = result.overdrives;
  audit.pauseChecks = [];
  for (const name of ['endless-natural-menu-pause.json', 'endless-natural-overdrive-20-pause.json', 'endless-natural-overdrive-35-pause.json']) {
    const pause = JSON.parse(await read(join(sourceDirectory, name)));
    assert.equal(pause.passed, true);
    audit.pauseChecks.push({ name, passed: true, frozenElapsed: pause.frozenElapsed, frozenFrenzyElapsed: pause.frozenFrenzyElapsed, overdriveResidual: pause.overdriveResidual });
  }
  audit.naturalStats = result.final.state.stats;
  audit.finalHealth = result.final.state.player.health;
  audit.scope = {
    actual: '无尽自然41波、四种首领实际血量与三阶段、击杀后进入下一章、过载I/II/III及菜单和II/III暂停',
    notClaimed: '伤害倍率仅核对配置与应用链；历史采样没有实例damageScale，不冒称每章实际碰撞伤害验证。技能事件只证明预警，完整执行另见Boss专项。',
    preservedFailure: 'endless-tactical-r03后续返回菜单导航失败仍保留；本审计只评价已经结束的自然战斗段，整批不改判。',
  };
  audit.passed = true;
} catch (error) {
  audit.error = { message: error.message, stack: error.stack };
  process.exitCode = 1;
} finally {
  await server.close();
  await writeFile(join(directory, 'result.json'), JSON.stringify(audit, null, 2) + '\n', { flag: 'wx' });
}
console.log(JSON.stringify({ passed: audit.passed, chapters: audit.chapters.map(chapter => ({ chapter: chapter.chapter, id: chapter.id, health: chapter.observedMaxHealth, phases: chapter.phases, nextWave: chapter.nextWave })), error: audit.error?.message }));
