import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { assertCandidatePath, fingerprintDirectory, licenseMaterialPaths, verifyBuildFiles } from '../scripts/prepare-local-release.mjs';
import { parseInventory } from '../scripts/audit-runtime-assets.mjs';

describe('本地候选包门禁', () => {
  it('所有真实运行时来源均有非空交付材料，未登记来源不能放行', () => {
    const rows = parseInventory(readFileSync('docs/RUNTIME_ASSET_INVENTORY.csv', 'utf8'));
    const paths = licenseMaterialPaths([...new Set(rows.map(row => row.source_id))]);
    assert.ok(paths.length > 50);
    for (const path of paths) assert.ok(existsSync(path) && readFileSync(path).length > 0, path);
    assert.ok(paths.includes('node_modules/phaser/src/physics/matter-js/lib/license.js'));
    assert.ok(paths.includes('src/assets/downloaded/fonts/alibaba-puhuiti-3/LEGAL-STATEMENT.txt'));
    assert.throws(() => licenseMaterialPaths(['unregistered']), /未登记/);
  });
  it('输出拒绝工作区外、目录本身及覆盖已有内容', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'ez-release-path-'));
    const existing = join(workspace, '.release-candidates', 'existing');
    mkdirSync(existing, { recursive: true });
    writeFileSync(join(existing, 'keep.txt'), 'untouched');
    assert.throws(() => assertCandidatePath(workspace, '../elsewhere'), /新子目录/);
    assert.throws(() => assertCandidatePath(workspace, '.release-candidates'), /新子目录/);
    assert.throws(() => assertCandidatePath(workspace, '.release-candidates/../elsewhere'), /新子目录/);
    assert.throws(() => assertCandidatePath(workspace, existing), /拒绝覆盖/);
    assert.equal(assertCandidatePath(workspace, '.release-candidates/new'), resolve(workspace, '.release-candidates/new'));
    assert.equal(readFileSync(join(existing, 'keep.txt'), 'utf8'), 'untouched');
  });
  it('生产指纹覆盖所有文件、总字节和内容，变动后必须补验', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ez-release-build-'));
    writeFileSync(join(directory, 'index.html'), '<h1>fixture</h1>');
    writeFileSync(join(directory, 'app.js'), 'console.log(1)');
    const evidence = fingerprintDirectory(directory);
    assert.deepEqual(verifyBuildFiles(directory, evidence), evidence);
    assert.throws(() => verifyBuildFiles(directory, { ...evidence, totalBytes: 0 }), /指纹不一致/);
    writeFileSync(join(directory, 'app.js'), 'console.log(2)');
    assert.throws(() => verifyBuildFiles(directory, evidence), /指纹不一致/);
  });
  it('只有脚本文件、没有生产入口的目录不能通过', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ez-release-no-index-'));
    writeFileSync(join(directory, 'app.js'), '');
    assert.throws(() => verifyBuildFiles(directory, fingerprintDirectory(directory)), /index.html/);
  });
});
