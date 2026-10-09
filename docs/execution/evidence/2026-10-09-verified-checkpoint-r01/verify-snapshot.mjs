import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFile, readFile, readdir, writeFile } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { preview } from 'vite';

const workspace = resolve('.');
const snapshot = resolve(process.argv[2]);
const directory = fileURLToPath(new URL('.', import.meta.url));
assert.ok(relative(workspace, snapshot).startsWith('.debug-verified-checkpoint-'));
const allowed = ['src/scenes/GameScene.ts', 'src/scenes/SettingsScene.ts', 'src/systems/BattlefieldRenderer.ts', 'src/ui/components.ts', 'tests/action-button.test.ts', 'tests/battlefield-render-order.test.ts', 'tests/settings-accessibility.test.ts', 'tests/wave-reward-rules.test.ts'].sort();
const git = args => execFileSync('git', args, { cwd: workspace, encoding: 'utf8', windowsHide: true }).trim();
const save = (name, value) => writeFile(join(directory, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
const commands = [];
const manifest = { baseCommit: git(['rev-parse', 'HEAD']), sourceTree: git(['write-tree']), snapshot, startedAt: new Date().toISOString(), files: [] };
const run = async (name, args) => {
  const startedAt = new Date().toISOString();
  const started = Date.now();
  const child = spawn(process.execPath, args, { cwd: snapshot, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk.toString(); });
  child.stderr.on('data', chunk => { output += chunk.toString(); });
  const exitCode = await new Promise((accept, reject) => { child.once('error', reject); child.once('exit', accept); });
  const result = { name, command: process.execPath, args, cwd: snapshot, startedAt, durationMs: Date.now() - started, exitCode };
  commands.push(result);
  await writeFile(join(directory, `${name}-output.txt`), output, { flag: 'wx' });
  console.log(JSON.stringify(result));
  assert.equal(exitCode, 0, `${name} failed`);
};
const collect = async folder => {
  const files = [];
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    assert.equal(entry.isSymbolicLink(), false);
    const path = join(folder, entry.name);
    if (entry.isDirectory()) files.push(...await collect(path));
    else files.push(path);
  }
  return files.sort();
};
try {
  assert.deepEqual(git(['diff', '--cached', '--name-only']).split(/\r?\n/).sort(), allowed);
  for (const path of [...allowed, 'src/ui/debrief.ts', 'package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts']) {
    const stagedBlob = git(['rev-parse', `:${path}`]);
    const snapshotBlob = git(['hash-object', `--path=${path}`, join(snapshot, path)]);
    assert.equal(snapshotBlob, stagedBlob, path);
    manifest.files.push({ path, stagedBlob, snapshotBlob });
  }
  assert.equal(git(['rev-parse', ':src/ui/debrief.ts']), git(['rev-parse', 'HEAD:src/ui/debrief.ts']));
  await save('snapshot-manifest.json', manifest);
  await run('vitest', [join(workspace, 'node_modules/vitest/vitest.mjs'), 'run', '--reporter=json', `--outputFile=${join(directory, 'vitest.json')}`]);
  await run('image-api', ['--test', 'tests/image-api.test.mjs']);
  await run('typecheck', [join(workspace, 'node_modules/typescript/bin/tsc'), '--noEmit']);
  await run('build', [join(workspace, 'node_modules/vite/bin/vite.js'), 'build']);
  git(['diff', '--cached', '--check']);
  const http = { files: [], serverClosed: false, passed: false };
  let server;
  try {
    server = await preview({ root: snapshot, logLevel: 'silent', preview: { host: '127.0.0.1', port: 0, strictPort: true, open: false } });
    const address = server.httpServer.address();
    assert.equal(address.address, '127.0.0.1');
    const origin = `http://127.0.0.1:${address.port}/`;
    const mimeTypes = { '.html': ['text/html'], '.js': ['text/javascript', 'application/javascript'], '.png': ['image/png'], '.woff2': ['font/woff2'], '.wav': ['audio/wav', 'audio/wave', 'audio/x-wav'], '.ogg': ['audio/ogg'], '.mp3': ['audio/mpeg'] };
    const dist = join(snapshot, 'dist');
    for (const path of await collect(dist)) {
      const name = relative(dist, path).replaceAll('\\', '/');
      const bytes = await readFile(path);
      const response = await fetch(new URL(name.split('/').map(encodeURIComponent).join('/'), origin), { redirect: 'error', signal: AbortSignal.timeout(15000) });
      const served = Buffer.from(await response.arrayBuffer());
      const mime = (response.headers.get('content-type') ?? '').split(';')[0];
      const entry = { path: name, status: response.status, mime, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), bytesMatch: bytes.equals(served), mimeMatches: mimeTypes[extname(path)]?.includes(mime) === true };
      if (extname(path) === '.js') entry.gzipBytes = gzipSync(bytes).length;
      http.files.push(entry);
      assert.ok(entry.status === 200 && entry.bytesMatch && entry.mimeMatches, name);
    }
    const index = await readFile(join(dist, 'index.html'));
    const rootResponse = await fetch(origin, { signal: AbortSignal.timeout(15000) });
    assert.equal(rootResponse.status, 200);
    assert.ok(Buffer.from(await rootResponse.arrayBuffer()).equals(index));
    const names = new Set(http.files.map(entry => entry.path));
    const references = [...index.toString().matchAll(/(?:src|href)="([^"]+)"/g)].map(match => match[1]);
    assert.ok(references.length > 0);
    assert.ok(references.every(reference => { const url = new URL(reference, origin); return url.origin === new URL(origin).origin && names.has(decodeURIComponent(url.pathname.slice(1))); }));
    http.passed = true;
  } finally {
    if (server) {
      await new Promise((accept, reject) => { server.httpServer.close(error => error ? reject(error) : accept()); server.httpServer.closeIdleConnections(); });
      http.serverClosed = !server.httpServer.listening;
    }
    await save('dist-http.json', http);
  }
  const tests = JSON.parse(await readFile(join(directory, 'vitest.json'), 'utf8'));
  assert.equal(tests.success, true);
  assert.equal(tests.numFailedTests, 0);
  const result = { passed: true, finishedAt: new Date().toISOString(), baseCommit: manifest.baseCommit, sourceTree: manifest.sourceTree, tests: { files: tests.testResults.length, passed: tests.numPassedTests, failed: tests.numFailedTests }, commands, artifacts: { files: http.files.length, bytes: http.files.reduce((total, entry) => total + entry.bytes, 0), javascript: http.files.filter(entry => entry.path.endsWith('.js')) }, excludesUnacceptedDebriefChange: true };
  await save('result.json', result);
  console.log(JSON.stringify({ passed: true, tests: result.tests, files: result.artifacts.files }));
} catch (error) {
  await save('failure.json', { message: error.message, stack: error.stack, commands });
  throw error;
} finally { await save('command-results.json', commands); }
