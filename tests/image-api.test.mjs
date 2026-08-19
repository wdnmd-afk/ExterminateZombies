import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import test from 'node:test';
import {
  buildUpstreamPayload,
  createImageApiServer,
  resolveImageEndpoint,
  resolveTaskEndpoint,
} from '../server/image-api.mjs';

async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  return `http://127.0.0.1:${address.port}`;
}

async function close(server) {
  if (!server.listening) return;
  server.close();
  await once(server, 'close');
}

function config(endpoint) {
  return {
    apiKey: 'test-key',
    endpoint: new URL(endpoint),
    model: 'test-image-model',
    host: '127.0.0.1',
    port: 0,
    timeoutMs: 5_000,
    pollIntervalMs: 5,
    maxConcurrent: 2,
    maxRequestBytes: 16 * 1024 * 1024,
    maxResponseBytes: 1024 * 1024,
  };
}

test('resolves standard base URLs and preserves custom paths', () => {
  assert.equal(resolveImageEndpoint('https://example.test').href, 'https://example.test/v1/images/generations');
  assert.equal(resolveImageEndpoint('https://example.test/v1/').href, 'https://example.test/v1/images/generations');
  assert.equal(
    resolveImageEndpoint('https://example.test/draw').href,
    'https://example.test/draw/v1/images/generations',
  );
  assert.equal(
    resolveImageEndpoint('https://ignored.test', 'https://example.test/custom/generate').href,
    'https://example.test/custom/generate',
  );
  assert.equal(
    resolveTaskEndpoint(new URL('https://www.rightapi.ai/draw/v1/images/generations'), 'task/a').href,
    'https://www.rightapi.ai/v1/tasks/task%2Fa',
  );
});

test('validates and maps supported generation options', () => {
  assert.deepEqual(
    buildUpstreamPayload(
      {
        prompt: '  pixel art survivor  ',
        size: '16:9',
        n: 2,
        imageSize: '2K',
        image: ['data:image/png;base64,ZmFrZQ=='],
      },
      'test-image-model',
    ),
    {
      model: 'test-image-model',
      prompt: 'pixel art survivor',
      async: true,
      size: '16:9',
      n: 2,
      imageSize: '2K',
      image: ['data:image/png;base64,ZmFrZQ=='],
    },
  );
  assert.throws(() => buildUpstreamPayload({ prompt: '' }, 'test-image-model'), /prompt is required/);
  assert.throws(() => buildUpstreamPayload({ prompt: 'test', size: 'square' }, 'test-image-model'), /size must be/);
  assert.throws(() => buildUpstreamPayload({ prompt: 'test', size: '00x00' }, 'test-image-model'), /positive/);
  assert.throws(() => buildUpstreamPayload({ prompt: 'test', async: false }, 'test-image-model'), /async must be true/);
  assert.throws(() => buildUpstreamPayload({ prompt: 'test', response_format: 'url' }, 'test-image-model'), /not documented/);
  assert.throws(() => buildUpstreamPayload({ prompt: 'test', image: ['https://example.test/a.png'] }, 'test-image-model'), /data URL/);
});

test('proxies a generation request without exposing the API key', async (context) => {
  let upstreamBody;
  let authorization;
  const requestPaths = [];
  let pollCount = 0;
  const upstream = createServer(async (request, response) => {
    authorization = request.headers.authorization;
    requestPaths.push(request.url);
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    if (request.method === 'POST') upstreamBody = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    response.writeHead(200, { 'content-type': 'application/json' });
    if (request.method === 'POST') {
      response.end(JSON.stringify({ task_id: 'task_123', status: 'processing', progress: 0 }));
    } else {
      pollCount += 1;
      response.end(pollCount === 1
        ? JSON.stringify({ id: 'task_123', task_id: 'task_123', object: 'image', model: 'test-image-model', status: 'in_progress', progress: 50, created_at: 123 })
        : JSON.stringify({ created: 123, data: [{ url: 'https://cdn.example.test/fake.png' }] }));
    }
  });
  const upstreamUrl = await listen(upstream);
  const api = createImageApiServer(config(`${upstreamUrl}/draw/v1/images/generations`));
  const apiUrl = await listen(api);
  context.after(async () => {
    await close(api);
    await close(upstream);
  });

  const response = await fetch(`${apiUrl}/api/images/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: 'pixel zombie', size: '1:1' }),
  });
  const result = await response.json();

  assert.equal(response.status, 200);
  assert.equal(authorization, 'Bearer test-key');
  assert.deepEqual(requestPaths, ['/draw/v1/images/generations', '/v1/tasks/task_123', '/v1/tasks/task_123']);
  assert.deepEqual(upstreamBody, {
    model: 'test-image-model',
    prompt: 'pixel zombie',
    async: true,
    size: '1:1',
  });
  assert.deepEqual(result, {
    created: 123,
    model: 'test-image-model',
    data: [{ url: 'https://cdn.example.test/fake.png' }],
  });
  assert.equal(JSON.stringify(result).includes('test-key'), false);
});

test('normalizes direct image responses', async (context) => {
  const upstream = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'image/png' });
    response.end(Buffer.from('fake-png'));
  });
  const upstreamUrl = await listen(upstream);
  const api = createImageApiServer(config(`${upstreamUrl}/draw`));
  const apiUrl = await listen(api);
  context.after(async () => {
    await close(api);
    await close(upstream);
  });

  const response = await fetch(`${apiUrl}/api/images/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: 'test image' }),
  });
  const result = await response.json();

  assert.equal(response.status, 200);
  assert.equal(result.data[0].b64_json, Buffer.from('fake-png').toString('base64'));
});

test('returns a safe error when an asynchronous task fails', async (context) => {
  const upstream = createServer((request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(request.method === 'POST'
      ? JSON.stringify({ task_id: 'task_failed', status: 'processing' })
      : JSON.stringify({ task_id: 'task_failed', status: 'failed', error: { code: 'provider_error', message: 'secret' } }));
  });
  const upstreamUrl = await listen(upstream);
  const api = createImageApiServer(config(`${upstreamUrl}/draw`));
  const apiUrl = await listen(api);
  context.after(async () => {
    await close(api);
    await close(upstream);
  });

  const response = await fetch(`${apiUrl}/api/images/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: 'test' }),
  });
  const result = await response.json();
  assert.equal(response.status, 502);
  assert.deepEqual(result, {
    error: {
      code: 'upstream_generation_failed',
      message: 'The image provider failed to generate an image.',
      details: { upstream_code: 'provider_error' },
    },
  });
  assert.equal(JSON.stringify(result).includes('secret'), false);
});

test('returns safe validation and upstream errors', async (context) => {
  let upstreamCalls = 0;
  const upstream = createServer((_request, response) => {
    upstreamCalls += 1;
    response.writeHead(401, {
      'content-type': 'application/json',
      'x-request-id': 'request-123',
    });
    response.end(JSON.stringify({ error: { message: 'secret provider detail' } }));
  });
  const upstreamUrl = await listen(upstream);
  const api = createImageApiServer(config(`${upstreamUrl}/draw`));
  const apiUrl = await listen(api);
  context.after(async () => {
    await close(api);
    await close(upstream);
  });

  const invalidResponse = await fetch(`${apiUrl}/api/images/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: '' }),
  });
  assert.equal(invalidResponse.status, 400);
  assert.equal(upstreamCalls, 0);

  const failedResponse = await fetch(`${apiUrl}/api/images/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: 'test' }),
  });
  const failure = await failedResponse.json();
  assert.equal(failedResponse.status, 401);
  assert.deepEqual(failure, {
    error: {
      code: 'upstream_error',
      message: 'The image provider rejected the request.',
      upstream_status: 401,
      request_id: 'request-123',
    },
  });
  assert.equal(JSON.stringify(failure).includes('secret provider detail'), false);
});

test('rejects non-local browser origins before calling the provider', async (context) => {
  let upstreamCalls = 0;
  const upstream = createServer((_request, response) => {
    upstreamCalls += 1;
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ data: [{ b64_json: 'ZmFrZQ==' }] }));
  });
  const upstreamUrl = await listen(upstream);
  const api = createImageApiServer(config(`${upstreamUrl}/draw`));
  const apiUrl = await listen(api);
  context.after(async () => {
    await close(api);
    await close(upstream);
  });

  const response = await fetch(`${apiUrl}/api/images/generate`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://example.test',
    },
    body: JSON.stringify({ prompt: 'test' }),
  });
  assert.equal(response.status, 403);
  assert.equal(upstreamCalls, 0);
});

test('caps the buffered provider response', async (context) => {
  const upstream = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'image/png' });
    response.end(Buffer.alloc(1_025, 1));
  });
  const upstreamUrl = await listen(upstream);
  const limitedConfig = { ...config(`${upstreamUrl}/draw`), maxResponseBytes: 1_024 };
  const api = createImageApiServer(limitedConfig);
  const apiUrl = await listen(api);
  context.after(async () => {
    await close(api);
    await close(upstream);
  });

  const response = await fetch(`${apiUrl}/api/images/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: 'test' }),
  });
  const result = await response.json();
  assert.equal(response.status, 502);
  assert.equal(result.error.code, 'upstream_response_too_large');
});

test('normalizes provider connection failures', async (context) => {
  const api = createImageApiServer(config('https://provider.example/draw'), {
    fetchImpl: async () => {
      const error = new TypeError('fetch failed');
      error.cause = { code: 'UND_ERR_CONNECT_TIMEOUT' };
      throw error;
    },
  });
  const apiUrl = await listen(api);
  context.after(() => close(api));

  const response = await fetch(`${apiUrl}/api/images/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: 'test' }),
  });
  const result = await response.json();
  assert.equal(response.status, 502);
  assert.deepEqual(result, {
    error: {
      code: 'upstream_unreachable',
      message: 'The image provider could not be reached.',
    },
  });
});
