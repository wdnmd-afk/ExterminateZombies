import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';

const evidenceDirectory = dirname(fileURLToPath(import.meta.url));
const workspace = resolve(evidenceDirectory, '../../../..');
const distDirectory = join(workspace, 'dist');
const evidencePath = join(evidenceDirectory, 'dist-http-run-01.json');
const mimeTypes = {
  '.html': ['text/html'],
  '.js': ['text/javascript', 'application/javascript'],
  '.png': ['image/png'],
  '.woff2': ['font/woff2'],
  '.wav': ['audio/wav', 'audio/wave', 'audio/x-wav'],
  '.ogg': ['audio/ogg'],
  '.mp3': ['audio/mpeg'],
};

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

async function listFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    // 不跟随链接，避免产物检查读到工作区外的用户文件。
    if (entry.isSymbolicLink()) throw new Error(`Unexpected symlink: ${path}`);
    if (entry.isDirectory()) files.push(...await listFiles(path));
    else if (entry.isFile()) files.push(path);
  }
  return files.sort();
}

if (existsSync(evidencePath)) throw new Error('Evidence already exists; use a new run filename');
if (await realpath(distDirectory) !== distDirectory) throw new Error('Unexpected resolved dist directory');

const result = {
  startedAt: new Date().toISOString(),
  command: 'node docs/execution/evidence/2026-10-08-full-acceptance/verify-dist-http.mjs',
  scope: 'Loopback HTTP and byte/MIME integrity only; no browser rendering or gameplay',
  browserRun: false,
  passed: false,
  serverClosed: false,
  files: [],
};
let server;
try {
  server = await preview({
    root: workspace,
    logLevel: 'silent',
    preview: { host: '127.0.0.1', port: 0, strictPort: true, open: false },
  });
  const address = server.httpServer.address();
  if (!address || typeof address === 'string' || address.address !== '127.0.0.1') {
    throw new Error('Preview is not listening exclusively on IPv4 loopback');
  }
  const base = `http://127.0.0.1:${address.port}/`;
  result.origin = base;
  const files = await listFiles(distDirectory);
  const index = await readFile(join(distDirectory, 'index.html'));
  const rootResponse = await fetch(base, { redirect: 'error', signal: AbortSignal.timeout(15000) });
  const rootBytes = Buffer.from(await rootResponse.arrayBuffer());
  result.root = { status: rootResponse.status, sha256: sha256(rootBytes) };
  if (rootResponse.status !== 200 || !rootBytes.equals(index)) throw new Error('Root HTML differs from built index');

  const fileNames = new Set(files.map((path) => relative(distDirectory, path).split(sep).join('/')));
  result.htmlReferences = [...index.toString('utf8').matchAll(/(?:src|href)="([^"]+)"/g)].map((match) => match[1]);
  if (result.htmlReferences.length === 0) throw new Error('No entry resources found in HTML');
  for (const reference of result.htmlReferences) {
    const url = new URL(reference, base);
    if (url.origin !== new URL(base).origin || !fileNames.has(decodeURIComponent(url.pathname.slice(1)))) {
      throw new Error(`Missing or non-local entry resource: ${reference}`);
    }
  }

  for (const path of files) {
    const name = relative(distDirectory, path).split(sep).join('/');
    const localBytes = await readFile(path);
    const resourceUrl = new URL(name.split('/').map(encodeURIComponent).join('/'), base);
    const response = await fetch(resourceUrl, { redirect: 'error', signal: AbortSignal.timeout(15000) });
    const servedBytes = Buffer.from(await response.arrayBuffer());
    const mime = (response.headers.get('content-type') ?? '').split(';')[0];
    const entry = {
      path: name,
      status: response.status,
      mime,
      bytes: localBytes.length,
      sha256: sha256(localBytes),
      bytesMatch: localBytes.equals(servedBytes),
      mimeMatches: mimeTypes[extname(path)]?.includes(mime) === true,
    };
    result.files.push(entry);
    if (entry.status !== 200 || !entry.bytesMatch || !entry.mimeMatches) {
      throw new Error(`Resource validation failed: ${name}`);
    }
  }
  result.fileCount = result.files.length;
  result.totalBytes = result.files.reduce((total, entry) => total + entry.bytes, 0);
  result.passed = true;
} catch (error) {
  result.error = error instanceof Error ? error.message : String(error);
  process.exitCode = 1;
} finally {
  if (server) {
    await new Promise((resolveClose, rejectClose) => {
      server.httpServer.close((error) => error ? rejectClose(error) : resolveClose());
      server.httpServer.closeIdleConnections();
    });
    result.serverClosed = !server.httpServer.listening;
  }
  result.finishedAt = new Date().toISOString();
  await writeFile(evidencePath, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
}

console.log(JSON.stringify({ ...result, files: undefined }, null, 2));
