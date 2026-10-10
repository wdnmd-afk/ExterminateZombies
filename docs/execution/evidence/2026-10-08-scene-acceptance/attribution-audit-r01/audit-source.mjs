import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = 'docs/execution/evidence/2026-10-08-scene-acceptance';
const runId = process.argv[2] ?? 'attribution-audit-r01';
assert.match(runId, /^[a-z0-9-]+$/);
const directory = join(root, runId);
const labels = { direct: '直接', headshot: '爆头', execute: '处决', pierce: '穿透', explosion: '爆炸', unknown: '其他' };
const sources = Object.keys(labels);
const records = [
  { id: 'clear-primary', file: `${root}/campaign-r01/level-1-attempt-1-result.json`, outcome: 'LevelClearScene', covers: ['direct', 'headshot', 'execute'] },
  { id: 'clear-explosion', file: `${root}/campaign-r01/level-2-attempt-1-result.json`, outcome: 'LevelClearScene', covers: ['explosion'] },
  { id: 'clear-pierce', file: `${root}/campaign-r01/level-3-attempt-1-result.json`, outcome: 'LevelClearScene', covers: ['pierce'] },
  { id: 'clear-unknown', file: `${root}/attribution-r01/natural-unknown-clear-result.json`, outcome: 'LevelClearScene', covers: ['unknown'] },
  { id: 'death-primary', file: `${root}/campaign-r03/level-16-attempt-1-result.json`, outcome: 'GameOverScene', covers: ['direct', 'headshot', 'execute', 'explosion'] },
  { id: 'death-unknown', file: `${root}/mode-isolation-r02/natural-unknown-death.json`, outcome: 'GameOverScene', covers: ['unknown'], schema: 'isolated-death', scope: `${root}/mode-isolation-r02/scope.json`, note: '该批整体跨模式续跑未通过；这里只使用已完成的自然火焰击杀和死亡结算，不把整批改判通过。' },
  { id: 'death-pierce', file: 'docs/execution/evidence/2026-09-30-campaign-browser/standalone-level30-result.json', image: 'docs/execution/evidence/2026-09-30-campaign-browser/standalone-level30-game-over.png', outcome: 'GameOverScene', covers: ['pierce'], schema: 'historical', note: '9月30日历史实景有第30关解锁前置；战斗输入真实、无血量或弹药覆盖。不是本轮自然逐关解锁链。' },
];
const read = file => JSON.parse(readFileSync(file, 'utf8'));
const fingerprint = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const evidence = [];
const cells = [];
await mkdir(directory);
await copyFile(resolve(process.argv[1]), join(directory, 'audit-source.mjs'));
try {
  for (const spec of records) {
    const record = read(spec.file);
    const snapshot = spec.schema === 'isolated-death' ? record.snapshot : record.final;
    const texts = spec.schema === 'historical' ? record.debrief : record.texts;
    if (spec.schema === 'isolated-death') {
      const scope = read(spec.scope);
      assert.equal(scope.inputOnly, true);
      assert.equal(scope.overrides, false);
    } else {
      assert.equal(record.inputOnly, true);
      if (spec.schema === 'historical') {
        assert.equal(record.healthOrAmmoOverrides, false);
        assert.equal(record.outcome, 'game-over');
      } else {
        assert.equal(record.overrides, false);
        assert.equal(record.outcome, spec.outcome);
      }
    }
    assert.ok(snapshot.active.includes(spec.outcome));
    const stats = snapshot.state.stats;
    const ledger = stats.killsBySource;
    assert.deepEqual(Object.keys(ledger).sort(), [...sources].sort());
    assert.ok(sources.every(source => Number.isSafeInteger(ledger[source]) && ledger[source] >= 0));
    assert.equal(sources.reduce((total, source) => total + ledger[source], 0), stats.kills);
    const expected = sources.filter(source => ledger[source] > 0)
      .sort((first, second) => ledger[second] - ledger[first] || sources.indexOf(first) - sources.indexOf(second))
      .map(source => `${labels[source]} ${ledger[source]}`).join('  /  ');
    assert.ok(texts.some(entry => entry.text === '击杀归因'));
    assert.ok(texts.some(entry => entry.text === expected), `${spec.id}: 结算文案必须匹配完整非零账本`);
    const image = spec.image ?? spec.file.replace(/\.json$/, '.png');
    assert.equal(readFileSync(image).subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    evidence.push({ id: spec.id, outcome: spec.outcome, file: spec.file, sha256: fingerprint(spec.file), image, imageSha256: fingerprint(image), kills: stats.kills, ledger, text: expected, note: spec.note ?? '真实键鼠、无战斗数值覆盖的自然结算。' });
    for (const source of spec.covers) {
      assert.ok(ledger[source] > 0);
      cells.push({ outcome: spec.outcome, source, count: ledger[source], evidence: spec.id, passed: true });
    }
  }
  assert.equal(cells.length, 12);
  assert.equal(new Set(cells.map(cell => `${cell.outcome}/${cell.source}`)).size, 12);
  const result = { passed: true, auditedAt: new Date().toISOString(), scope: 'M-01 两类实际结算×六来源；复核账本总和、非零显示、自然输入边界及截图。历史解锁前置不作为最新自然链。', currentFormatterSource: { path: 'src/ui/debrief.ts', sha256: fingerprint('src/ui/debrief.ts') }, cells, evidence };
  await writeFile(join(directory, 'result.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ passed: true, cells: cells.length, evidence: evidence.length, directory }));
} catch (error) {
  await writeFile(join(directory, 'failure.json'), JSON.stringify({ message: error.message, evidence, cells }, null, 2) + '\n', { flag: 'wx' });
  throw error;
}
