import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { preview } from 'vite';

const workspace = resolve('.');
const runId = process.argv[2] ?? 'commands-r01';
if (!/^[a-z0-9-]+$/.test(runId)) throw new Error('Invalid run id');
const directory = join(workspace, 'docs/execution/evidence/2026-10-08-scene-acceptance', runId);
if (existsSync(directory)) throw new Error('Preserve existing evidence; choose a new run id');
await mkdir(directory);
const results = [];
const save = (name, value) => writeFile(join(directory, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
const run = async (name, command, args) => {
  const startedAt = new Date().toISOString();
  const started = Date.now();
  const output = [];
  const child = spawn(command, args, { cwd: workspace, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0', CI: '1', GIT_TERMINAL_PROMPT: '0' } });
  child.stdout.on('data', chunk => output.push(chunk)); child.stderr.on('data', chunk => output.push(chunk));
  const exitCode = await new Promise((accept, reject) => { child.once('error', reject); child.once('close', accept); });
  await writeFile(join(directory, `${name}.txt`), Buffer.concat(output), { flag: 'wx' });
  const result = { name, command, args, startedAt, exitCode, durationMs: Date.now() - started };
  results.push(result);
  console.log(JSON.stringify(result));
  if (exitCode !== 0) throw new Error(`${name} failed with ${exitCode}`);
};
const filesUnder = async directory => {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error('Unexpected symlink in dist');
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await filesUnder(path));
    else if (entry.isFile()) result.push(path);
  }
  return result.sort();
};

try {
  await run('vitest', process.execPath, ['node_modules/vitest/vitest.mjs', 'run', '--reporter=json', `--outputFile=${join(directory, 'vitest.json')}`]);
  await run('image-api', process.execPath, ['--test', 'tests/image-api.test.mjs']);
  await run('cdp-driver', process.execPath, ['--test', 'tests/cdp-combat-policy.test.mjs', 'tests/cdp-boss-observer.test.mjs', 'tests/cdp-menu-navigation.test.mjs', 'tests/cdp-boss-hud-layout.test.mjs']);
  await run('typecheck', process.execPath, ['node_modules/typescript/bin/tsc', '--noEmit']);
  await run('build', process.execPath, ['node_modules/vite/bin/vite.js', 'build']);
  await run('diff-check', 'git', ['diff', '--check']);
  for (const name of (await readdir(join(workspace, 'scripts'))).filter(name => /^cdp-.*\.mjs$/.test(name))) {
    await run(`syntax-${name}`, process.execPath, ['--check', `scripts/${name}`]);
  }
  const mimeTypes = { '.html': ['text/html'], '.js': ['text/javascript', 'application/javascript'], '.png': ['image/png'], '.woff2': ['font/woff2'], '.wav': ['audio/wav', 'audio/wave', 'audio/x-wav'], '.ogg': ['audio/ogg'], '.mp3': ['audio/mpeg'] };
  const http = { startedAt: new Date().toISOString(), passed: false, files: [], serverClosed: false, browserRun: false };
  let server;
  try {
    server = await preview({ root: workspace, logLevel: 'silent', preview: { host: '127.0.0.1', port: 0, strictPort: true, open: false } });
    const address = server.httpServer.address();
    if (!address || typeof address === 'string' || address.address !== '127.0.0.1') throw new Error('Non-loopback preview');
    const origin = `http://127.0.0.1:${address.port}/`;
    http.origin = origin;
    const dist = join(workspace, 'dist');
    const index = await readFile(join(dist, 'index.html'));
    const root = await fetch(origin, { redirect: 'error', signal: AbortSignal.timeout(15000) });
    if (root.status !== 200 || !Buffer.from(await root.arrayBuffer()).equals(index)) throw new Error('Root HTML differs from index');
    for (const path of await filesUnder(dist)) {
      const name = relative(dist, path).replaceAll('\\', '/');
      const bytes = await readFile(path);
      const response = await fetch(new URL(name.split('/').map(encodeURIComponent).join('/'), origin), { redirect: 'error', signal: AbortSignal.timeout(15000) });
      const served = Buffer.from(await response.arrayBuffer());
      const mime = (response.headers.get('content-type') ?? '').split(';')[0];
      const entry = { path: name, status: response.status, mime, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), bytesMatch: bytes.equals(served), mimeMatches: mimeTypes[extname(path)]?.includes(mime) === true };
      if (extname(path) === '.js') entry.gzipBytes = gzipSync(bytes).length;
      http.files.push(entry);
      if (entry.status !== 200 || !entry.bytesMatch || !entry.mimeMatches) throw new Error(`Bad artifact response: ${name}`);
    }
    const names = new Set(http.files.map(entry => entry.path));
    http.references = [...index.toString('utf8').matchAll(/(?:src|href)="([^"]+)"/g)].map(match => match[1]);
    if (!http.references.length || http.references.some(reference => { const url = new URL(reference, origin); return url.origin !== new URL(origin).origin || !names.has(decodeURIComponent(url.pathname.slice(1))); })) throw new Error('Missing/non-local entry references');
    http.fileCount = http.files.length;
    http.totalBytes = http.files.reduce((total, entry) => total + entry.bytes, 0);
    http.passed = true;
  } finally {
    if (server) {
      await new Promise((accept, reject) => { server.httpServer.close(error => error ? reject(error) : accept()); server.httpServer.closeIdleConnections(); });
      http.serverClosed = !server.httpServer.listening;
    }
    http.finishedAt = new Date().toISOString();
    await save('dist-http.json', http);
  }
  const tests = JSON.parse(await readFile(join(directory, 'vitest.json'), 'utf8'));
  await save('result.json', { passed: true, tests: { success: tests.success, files: tests.testResults.length, passed: tests.numPassedTests, failed: tests.numFailedTests }, artifacts: { files: http.fileCount, bytes: http.totalBytes, javascript: http.files.filter(entry => entry.path.endsWith('.js')) }, commands: results });
} catch (error) {
  process.exitCode = 1;
  await save('failure.json', { message: error.message, stack: error.stack, commands: results });
  console.error(error);
} finally { await save('command-results.json', results); }
