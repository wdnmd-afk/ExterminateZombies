import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript';
import { assertBossHudLayout } from './cdp-boss-hud-layout.mjs';

const workspace = resolve('.');
const root = 'docs/execution/evidence/2026-10-08-scene-acceptance';
const runId = process.argv[2] ?? 'closure-audit-r02';
const commandRun = process.argv[3] ?? 'commands-r05';
assert.match(runId, /^[a-z0-9-]+$/); assert.match(commandRun, /^commands-[a-z0-9-]+$/);
const directory = join(root, runId);
assert.equal(existsSync(directory), false, 'Preserve earlier audit evidence');
mkdirSync(directory);
const sources = {};
const audit = { auditedAt: new Date().toISOString(), passed: false, allRequestedAcceptanceComplete: false, head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), commandRun, naturalCampaign: [], preservedCampaignFailures: [], bosses: [], remaining: [] };
const save = (name, data) => writeFileSync(join(directory, name), JSON.stringify(data, null, 2) + '\n', { flag: 'wx' });
const read = path => {
  const absolute = resolve(path);
  assert.ok(!relative(workspace, absolute).startsWith('..'), `Outside workspace: ${path}`);
  const bytes = readFileSync(absolute);
  sources[path] = { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  return bytes;
};
const load = path => JSON.parse(read(path));
const passed = path => { const data = load(path); assert.equal(data.passed, true, path); return data; };
const verifyHash = (path, expected) => { read(path); assert.equal(sources[path].sha256, expected, `Changed source: ${path}`); };
const assertNatural = (record, path) => {
  assert.equal(record.inputOnly, true, path); assert.equal(record.overrides, false, path);
  assert.deepEqual(record.errors, [], path); assert.deepEqual(record.failures, [], path);
};

async function resourceSamples(path, weapons) {
  read(path);
  const stream = createReadStream(path, { encoding: 'utf8' });
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  const stats = { totalSamples: 0, activeSamples: 0, emptyCurrentMagazineSamples: 0, reloadingSamples: 0, pistolSamples: 0, allFiniteAmmoEmptySamples: 0, minimumHealth: null, reserves: {} };
  let previousElapsed = -1;
  let previousReserve;
  try {
    for await (const line of lines) {
      const sample = JSON.parse(line);
      stats.totalSamples++;
      assert.ok(sample.state.player.magazines && sample.diagnostics.player.ammoReserve, `Unrecognized sample schema: ${path}`);
      const elapsed = sample.state.stats.elapsedMs;
      if (sample.diagnostics.pauseReason !== null || elapsed <= previousElapsed) continue;
      previousElapsed = elapsed;
      const player = sample.diagnostics.player;
      stats.activeSamples++;
      stats.minimumHealth = stats.minimumHealth === null ? player.health : Math.min(stats.minimumHealth, player.health);
      if (player.ammoInMag === 0) stats.emptyCurrentMagazineSamples++;
      if (sample.reloading) stats.reloadingSamples++;
      if (player.currentWeaponId === 'pistol') stats.pistolSamples++;
      const finiteWeapons = player.ownedWeapons.filter(id => { assert.ok(weapons[id], `Unknown weapon ${id}`); return !weapons[id].infiniteAmmo; });
      if (finiteWeapons.length && finiteWeapons.every(id => sample.state.player.magazines[id] === 0 && player.ammoReserve[weapons[id].ammoType] === 0)) stats.allFiniteAmmoEmptySamples++;
      for (const [type, amount] of Object.entries(player.ammoReserve)) {
        assert.ok(Number.isFinite(amount) && amount >= 0);
        const reserve = stats.reserves[type] ?? { minimum: amount, maximum: amount, observedNetIncreases: 0 };
        reserve.minimum = Math.min(reserve.minimum, amount); reserve.maximum = Math.max(reserve.maximum, amount);
        if (previousReserve && amount > previousReserve[type]) reserve.observedNetIncreases++;
        stats.reserves[type] = reserve;
      }
      previousReserve = player.ammoReserve;
    }
  } finally { lines.close(); stream.destroy(); }
  assert.ok(stats.activeSamples > 0, `Missing active samples: ${path}`);
  return stats;
}

try {
  const commands = passed(join(root, commandRun, 'result.json'));
  assert.equal(commands.tests.success, true); assert.equal(commands.tests.failed, 0);
  assert.ok(commands.commands.every(command => command.exitCode === 0));
  const http = passed(join(root, commandRun, 'dist-http.json'));
  assert.equal(http.serverClosed, true); assert.equal(http.fileCount, 125);
  assert.ok(http.files.every(file => file.status === 200 && file.bytesMatch && file.mimeMatches));
  const driverLog = read(join(root, commandRun, 'cdp-driver.txt')).toString('utf8');
  const imageLog = read(join(root, commandRun, 'image-api.txt')).toString('utf8');
  assert.match(driverLog, /^# fail 0$/m); assert.match(imageLog, /^# fail 0$/m);
  const commandSources = load(join(root, commandRun, 'source-hashes.json'));
  for (const [path, hash] of Object.entries(commandSources.sources)) verifyHash(path, hash);
  audit.latestCommands = { ...commands.tests, driverTests: Number(driverLog.match(/^# pass (\d+)$/m)[1]), imageTests: Number(imageLog.match(/^# pass (\d+)$/m)[1]), artifacts: commands.artifacts, sourceCount: Object.keys(commandSources.sources).length, sourceCapturedAfterCommands: commandSources.capturedAfterCommands };

  const weaponSource = read('src/config/weapons.ts').toString('utf8');
  const compiled = transpileModule(weaponSource, { compilerOptions: { module: ModuleKind.ESNext, target: ScriptTarget.ES2022 } }).outputText;
  const { WEAPONS } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
  for (const run of readdirSync(root).filter(name => /^campaign-r\d+$/.test(name)).sort()) {
    for (const name of readdirSync(join(root, run)).filter(name => /^level-\d+-attempt-\d+-result\.json$/.test(name)).sort()) {
      const file = join(root, run, name);
      const result = load(file);
      const level = Number(result.final.state.levelId.slice('level_'.length));
      if (result.outcome !== 'LevelClearScene') { audit.preservedCampaignFailures.push({ file, level, outcome: result.outcome, elapsedMs: result.final.state.stats.elapsedMs, kills: result.final.state.stats.kills, finalHealth: result.final.state.player.health }); continue; }
      assertNatural(result, file);
      for (let unlocked = 2; unlocked <= Math.min(level + 1, 30); unlocked++) assert.ok(result.save.levels.includes(`level_${unlocked}`), `${file}: missing natural unlock ${unlocked}`);
      read(file.replace('-result.json', '-result.png'));
      const resources = await resourceSamples(file.replace('-result.json', '-samples.jsonl'), WEAPONS);
      audit.naturalCampaign.push({ file, level, chapter: Math.floor((level - 1) / 5) + 1, elapsedMs: result.final.state.stats.elapsedMs, kills: result.final.state.stats.kills, finalHealth: result.final.state.player.health, finalReserve: result.final.state.player.ammoReserve, resources });
    }
  }
  audit.naturalCampaign.sort((first, second) => first.level - second.level);
  assert.deepEqual(audit.naturalCampaign.map(entry => entry.level), Array.from({ length: 30 }, (_, index) => index + 1));
  audit.campaignScope = '同一自然解锁存档的分批续跑，不是一次无中断通关；r07/r08外部中断及所有死亡/超时保留；样本统计不是逐帧压力或真人平衡验收。';
  audit.campaignChapters = Array.from({ length: 6 }, (_, index) => {
    const levels = audit.naturalCampaign.filter(entry => entry.chapter === index + 1);
    return { chapter: index + 1, levels: levels.map(entry => entry.level), clearTimeMs: levels.map(entry => entry.elapsedMs), activeSamples: levels.reduce((count, entry) => count + entry.resources.activeSamples, 0), minimumHealth: Math.min(...levels.map(entry => entry.resources.minimumHealth)), allFiniteAmmoEmptySamples: levels.reduce((count, entry) => count + entry.resources.allFiniteAmmoEmptySamples, 0), emptyCurrentMagazineSamples: levels.reduce((count, entry) => count + entry.resources.emptyCurrentMagazineSamples, 0), reloadingSamples: levels.reduce((count, entry) => count + entry.resources.reloadingSamples, 0), observedReserveNetIncreases: levels.reduce((count, entry) => count + Object.values(entry.resources.reserves).reduce((sum, reserve) => sum + reserve.observedNetIncreases, 0), 0) };
  });

  for (const name of ['boss-tour-r02/boss-level-2-result.json', 'boss-tour-r02/boss-level-5-result.json', 'boss-followup-r01/boss-level-10-result.json', 'boss-bomber-r02/boss-level-3-result.json']) {
    const file = join(root, name); const result = load(file);
    assertNatural(result, file); assert.equal(result.outcome, 'LevelClearScene'); assert.equal(result.bossMechanisms.length, 1);
    const boss = result.bossMechanisms[0];
    assert.equal(boss.allPhaseAbilitiesObserved, true); assert.deepEqual(boss.phases.map(phase => phase.number), [1, 2, 3]);
    for (const phase of boss.phases) for (const ability of phase.required) {
      assert.ok(phase.passed[ability.kind]);
      assert.ok(phase.windows.some(window => window.executed && window.ability.kind === ability.kind));
    }
    assert.ok(boss.observedTtkMs > 0); assert.equal(boss.includesIntentionalHoldFire, true);
    read(file.replace('-result.json', '-result.png'));
    audit.bosses.push({ file, id: boss.id, observedTtkMs: boss.observedTtkMs, includesIntentionalHoldFire: true, phases: boss.phases.map(phase => ({ number: phase.number, required: phase.required.map(ability => ability.kind), observed: Object.keys(phase.passed) })) });
  }
  audit.bossScope = '独立专项局沿用已自然获得的关卡许可，正常清普通波并手枪点射/停火观察；不改战斗数值，观测TTK不是最短击杀时间；布局和母体封顶另属受控证据。';
  passed(join(root, 'summon-r02/result.json'));

  const endless = passed(join(root, 'endless-audit-r01/result.json'));
  for (const [path, source] of Object.entries(endless.sources)) verifyHash(path, source.sha256);
  assert.deepEqual(endless.chapters.map(chapter => chapter.nextWave), [11, 21, 31, 41]);
  assert.deepEqual(endless.overdrives.map(overdrive => overdrive.milestone), [10, 20, 35]);
  assert.ok(endless.pauseChecks.every(check => check.passed));
  const scaling = passed(join(root, 'endless-scaling-r01/endless-scaling-result.json'));
  assert.equal(scaling.fixtureOnly, true); assert.equal(scaling.collisionDamageClaim, false);
  assert.equal(scaling.actualSpawnScaleVerified, true); assert.equal(scaling.results.length, 4); assert.ok(scaling.results.every(entry => entry.passed));
  passed(join(root, 'endless-return-r01/endless-return-result.json'));
  audit.endless = { naturalWave: 41, chapters: endless.chapters.map(chapter => ({ chapter: chapter.chapter, maxHealth: chapter.observedMaxHealth, phases: chapter.phases, nextWave: chapter.nextWave })), overdrives: [10, 20, 35], pauseChecks: endless.pauseChecks, controlledRuntimeScaling: scaling.results, collisionDamageClaim: false, freshCampaignReturnPassed: true, wholeOriginalBatchReclassified: false };

  const attribution = passed(join(root, 'attribution-audit-r01/result.json'));
  assert.equal(attribution.cells.length, 12); assert.ok(attribution.cells.every(cell => cell.passed && cell.count > 0));
  for (const entry of attribution.evidence) { verifyHash(entry.file, entry.sha256); verifyHash(entry.image, entry.imageSha256); }
  audit.attribution = { cells: attribution.cells, scope: attribution.scope };

  audit.frenzyNatural = [];
  for (const name of ['frenzy-tactical-r02/frenzy-1-result.json', 'frenzy-tactical-r02/frenzy-2-result.json', 'frenzy-explosive-r01/frenzy-3-result.json']) {
    const file = join(root, name); const result = load(file); assertNatural(result, file);
    const frenzy = result.final.state.frenzy; assert.equal(frenzy.recordEligible, true);
    assert.ok(Object.values(frenzy.targets).every(target => target === 'collected'));
    assert.equal(frenzy.phase, frenzy.presetId === 'explosive' ? 'timeout' : 'won');
    const record = result.save.frenzyRecords['hunt-v1']?.[frenzy.presetId];
    if (frenzy.phase === 'won') { assert.ok(record); assert.equal(record.elapsedMs, frenzy.elapsedMs); }
    else { assert.equal(frenzy.elapsedMs, 300000); assert.equal(record, undefined); }
    read(file.replace('-result.json', '-result.png'));
    audit.frenzyNatural.push({ file, preset: frenzy.presetId, outcome: frenzy.phase, elapsedMs: frenzy.elapsedMs, kills: frenzy.kills, finalHealth: result.final.state.player.health, finalReserve: result.final.state.player.ammoReserve, record: record ?? null });
  }
  const persistence = passed(join(root, 'frenzy-records-r01/record-persistence.json'));
  assert.deepEqual(persistence.afterReload, persistence.before);
  const recordSuite = load(join(root, 'frenzy-records-r01/summary.json'));
  assert.ok(recordSuite.results.every(entry => entry.passed)); assert.deepEqual(recordSuite.errors, []); assert.deepEqual(recordSuite.failedRequests, []);
  audit.formalFrenzyRecordsPassed = true;

  audit.layouts = [];
  for (const [run, expectedCount] of [['frenzy-layout-r04', 18], ['boss-hud-layout-r01', 24]]) {
    const result = passed(join(root, run, 'result.json')); assert.equal(result.results.length, expectedCount); assert.equal(result.fixtureOnly, true);
    for (const entry of result.results) {
      const data = load(join(root, run, `${entry.name}.json`)); assertBossHudLayout(data.layout, entry.name);
      read(join(root, run, `${entry.name}.png`));
    }
    const events = load(join(root, run, 'browser-events.json')); assert.deepEqual(events.errors, []); assert.deepEqual(events.failedRequests, []);
    audit.layouts.push({ run, passed: true, count: expectedCount, fixtureOnly: true });
  }
  const visual = passed(join(root, 'boss-hud-visual-review-r01/review.json'));
  assert.equal(visual.humanV6, false); assert.equal(visual.sourceCount, 42);
  const visualSources = load(join(root, 'boss-hud-visual-review-r01/source-manifest.json'));
  for (const entry of visualSources.entries) { verifyHash(entry.source, entry.sha256); verifyHash(entry.layoutSource, entry.layoutSha256); }
  for (const image of visual.contactSheets) read(join(root, 'boss-hud-visual-review-r01', image));
  audit.visualReview = visual;
  audit.cleanup = passed(join(root, 'boss-hud-visual-review-r01/cleanup.json'));
  const debrief = passed(join(root, 'debrief-layout-r01/result.json')); assert.equal(debrief.results.length, 54);
  audit.debrief = { passed: true, fixtureOnly: true, checks: 54, naturalSingleButtonEvidence: audit.naturalCampaign.at(-1).file };
  audit.remaining = [
    { item: 'F-08 爆破自然成功', status: '未通过', evidence: 'frenzy-explosive-r01/frenzy-3-result.json', boundary: '300秒超时，三核心已收齐但首领未击杀；不无界重刷、不调生产数值。' },
    { item: 'P2/V6 真人验收', status: '待真人', boundary: '外部独立一局、三个记忆点、手感/节奏/平衡/美术及耳机/扬声器跨浏览器实听，代理不代签。' },
    { item: '目标设备生产包性能', status: '待指定实机', boundary: '当前构建/HTTP和开发版CDP不等于低端设备或生产包性能认证，大包警告保留。' },
    { item: '发布外部依赖', status: '待用户材料或决策', boundary: '源码LICENSE、三张重火力采用原图、仓库减重与未知归属Git垃圾不自动处理。' },
  ];
  audit.preservedLimitations = ['frenzy-layout-r03自动边界假阳性保留，目视失败由本轮修复与新42格证据覆盖。', 'boss-tour-r02和boss-followup-r01只接纳明确通过的单局，不将含失败整批升级。', 'endless-tactical-r03后半菜单驱动失败保留，自然41波与新返回专项分列。'];
  read('scripts/audit-remaining-acceptance.mjs');
  audit.passed = true;
} catch (error) {
  audit.error = { message: error.message, stack: error.stack }; process.exitCode = 1;
} finally {
  save('sources.json', sources); save('summary.json', audit);
  console.log(JSON.stringify({ passed: audit.passed, allRequestedAcceptanceComplete: false, campaign: audit.naturalCampaign.length, bosses: audit.bosses.length, commandTests: audit.latestCommands?.passed, chapters: audit.campaignChapters, remaining: audit.remaining, error: audit.error?.message }));
}
