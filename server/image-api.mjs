import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 8787;
const DEFAULT_TIMEOUT_MS = 150_000;
const DEFAULT_POLL_INTERVAL_MS = 1_000;
const DEFAULT_MAX_CONCURRENT = 2;
const DEFAULT_MAX_REQUEST_MB = 16;
const DEFAULT_MAX_RESPONSE_MB = 32;
const MAX_PROMPT_LENGTH = 8_000;
const MAX_REFERENCE_IMAGES = 10;
const REQUEST_TIMEOUT_MS = 15_000;
const PENDING_TASK_STATUSES = new Set(['processing', 'queued', 'in_progress']);
const RIGHTAPI_SIZE_RATIOS = new Set(['1:1', '16:9', '9:16', '4:3']);
const UNSUPPORTED_RIGHTAPI_FIELDS = [
  'quality',
  'background',
  'output_format',
  'output_compression',
  'moderation',
  'response_format',
];

class ApiError extends Error {
  constructor(status, code, message, details = undefined) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

class UpstreamError extends Error {
  constructor(status, requestId, providerCode) {
    super('The image provider rejected the request.');
    this.status = status;
    this.requestId = requestId;
    this.providerCode = providerCode;
  }
}

export async function loadEnvFile(filePath = '.env', target = process.env) {
  let source;
  try {
    source = await readFile(filePath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return target;
    throw error;
  }

  for (const line of source.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)?\s*$/);
    if (!match || target[match[1]] !== undefined) continue;

    let value = match[2] ?? '';
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1).replace(/\\n/g, '\n').replace(/\\r/g, '\r');
    } else if (value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, '').trim();
    }
    target[match[1]] = value;
  }

  return target;
}

export function resolveImageEndpoint(baseUrl, endpointOverride = '') {
  const explicitEndpoint = endpointOverride.trim();
  const configuredUrl = explicitEndpoint || baseUrl?.trim();
  if (!configuredUrl) {
    throw new Error('IMAGE_BASEURL is required.');
  }

  const endpoint = new URL(configuredUrl);
  if (!['http:', 'https:'].includes(endpoint.protocol)) {
    throw new Error('The image endpoint must use HTTP or HTTPS.');
  }
  if (endpoint.username || endpoint.password) {
    throw new Error('Credentials must not be embedded in IMAGE_BASEURL.');
  }

  if (!explicitEndpoint) {
    const pathname = endpoint.pathname.replace(/\/+$/, '');
    if (!pathname) {
      endpoint.pathname = '/v1/images/generations';
    } else if (/\/v1$/i.test(pathname)) {
      endpoint.pathname = `${pathname}/images/generations`;
    } else if (/\/images\/generations$/i.test(pathname)) {
      endpoint.pathname = pathname;
    } else {
      endpoint.pathname = `${pathname}/v1/images/generations`;
    }
  }

  return endpoint;
}

export function resolveTaskEndpoint(generationEndpoint, taskId) {
  const endpoint = new URL(generationEndpoint);
  endpoint.pathname = `/v1/tasks/${encodeURIComponent(taskId)}`;
  endpoint.search = '';
  endpoint.hash = '';
  return endpoint;
}

function readInteger(value, fallback, { min, max, name }) {
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}.`);
  }
  return parsed;
}

export function readImageApiConfig(env = process.env) {
  const apiKey = env.IMAGE_APIKEY?.trim();
  const model = env.IMAGE_MODEL?.trim();
  if (!apiKey) throw new Error('IMAGE_APIKEY is required.');
  if (!model) throw new Error('IMAGE_MODEL is required.');

  return {
    apiKey,
    endpoint: resolveImageEndpoint(env.IMAGE_BASEURL, env.IMAGE_ENDPOINT),
    model,
    host: DEFAULT_HOST,
    port: readInteger(env.IMAGE_API_PORT, DEFAULT_PORT, {
      min: 1,
      max: 65_535,
      name: 'IMAGE_API_PORT',
    }),
    timeoutMs: readInteger(env.IMAGE_API_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, {
      min: 1_000,
      max: 600_000,
      name: 'IMAGE_API_TIMEOUT_MS',
    }),
    pollIntervalMs: readInteger(env.IMAGE_API_POLL_INTERVAL_MS, DEFAULT_POLL_INTERVAL_MS, {
      min: 250,
      max: 10_000,
      name: 'IMAGE_API_POLL_INTERVAL_MS',
    }),
    maxConcurrent: readInteger(env.IMAGE_API_MAX_CONCURRENT, DEFAULT_MAX_CONCURRENT, {
      min: 1,
      max: 8,
      name: 'IMAGE_API_MAX_CONCURRENT',
    }),
    maxRequestBytes: readInteger(env.IMAGE_API_MAX_REQUEST_MB, DEFAULT_MAX_REQUEST_MB, {
      min: 1,
      max: 64,
      name: 'IMAGE_API_MAX_REQUEST_MB',
    }) * 1024 * 1024,
    maxResponseBytes: readInteger(env.IMAGE_API_MAX_RESPONSE_MB, DEFAULT_MAX_RESPONSE_MB, {
      min: 1,
      max: 256,
      name: 'IMAGE_API_MAX_RESPONSE_MB',
    }) * 1024 * 1024,
  };
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateEnum(value, allowed, field) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw new ApiError(400, 'invalid_request', `${field} must be one of: ${allowed.join(', ')}.`);
  }
  return value;
}

function validateSize(value) {
  if (value === undefined) return undefined;
  const isPixelSize = typeof value === 'string' && /^\d{2,4}x\d{2,4}$/.test(value);
  if (
    typeof value !== 'string'
    || (!RIGHTAPI_SIZE_RATIOS.has(value) && !isPixelSize)
  ) {
    throw new ApiError(
      400,
      'invalid_request',
      'size must be 1:1, 16:9, 9:16, 4:3, or WIDTHxHEIGHT.',
    );
  }
  if (isPixelSize) {
    const [width, height] = value.split('x').map(Number);
    if (width < 1 || height < 1) {
      throw new ApiError(400, 'invalid_request', 'WIDTH and HEIGHT in size must be positive.');
    }
  }
  return value;
}

function validateReferenceImages(value) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_REFERENCE_IMAGES) {
    throw new ApiError(
      400,
      'invalid_request',
      `image must be an array containing 1 to ${MAX_REFERENCE_IMAGES} data URLs.`,
    );
  }
  if (
    value.some((item) => (
      typeof item !== 'string'
      || !/^data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/]+={0,2}$/i.test(item)
    ))
  ) {
    throw new ApiError(400, 'invalid_request', 'Every image item must be a base64 image data URL.');
  }
  return [...value];
}

export function buildUpstreamPayload(value, model) {
  if (!isPlainObject(value)) {
    throw new ApiError(400, 'invalid_request', 'The request body must be a JSON object.');
  }

  if (typeof value.prompt !== 'string' || value.prompt.trim().length === 0) {
    throw new ApiError(400, 'invalid_request', 'prompt is required.');
  }
  const prompt = value.prompt.trim();
  if (prompt.length > MAX_PROMPT_LENGTH) {
    throw new ApiError(400, 'invalid_request', `prompt must not exceed ${MAX_PROMPT_LENGTH} characters.`);
  }

  for (const field of UNSUPPORTED_RIGHTAPI_FIELDS) {
    if (value[field] !== undefined) {
      throw new ApiError(
        400,
        'unsupported_option',
        `${field} is not documented for the RightAPI image generation endpoint.`,
      );
    }
  }
  if (value.image_size !== undefined) {
    throw new ApiError(400, 'unsupported_option', 'Use the case-sensitive field name imageSize.');
  }
  if (value.async !== undefined && value.async !== true) {
    throw new ApiError(400, 'invalid_request', 'async must be true for RightAPI image generation.');
  }

  const payload = { model, prompt, async: true };
  const size = validateSize(value.size);
  const imageSize = validateEnum(value.imageSize, ['1K', '2K', '4K'], 'imageSize');
  const images = validateReferenceImages(value.image);

  if (value.n !== undefined && (!Number.isInteger(value.n) || value.n < 1 || value.n > 10)) {
    throw new ApiError(400, 'invalid_request', 'n must be an integer between 1 and 10.');
  }

  if (size !== undefined) payload.size = size;
  if (value.n !== undefined) payload.n = value.n;
  if (imageSize !== undefined) payload.imageSize = imageSize;
  if (images !== undefined) payload.image = images;
  return payload;
}

async function readJsonBody(request, maxBodyBytes) {
  const declaredLength = Number(request.headers['content-length'] ?? 0);
  if (declaredLength > maxBodyBytes) {
    throw new ApiError(413, 'request_too_large', `The JSON body must not exceed ${maxBodyBytes} bytes.`);
  }

  const chunks = [];
  let byteLength = 0;
  for await (const chunk of request) {
    byteLength += chunk.length;
    if (byteLength > maxBodyBytes) {
      throw new ApiError(413, 'request_too_large', `The JSON body must not exceed ${maxBodyBytes} bytes.`);
    }
    chunks.push(chunk);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new ApiError(400, 'invalid_json', 'The request body is not valid JSON.');
  }
}

function imageItem(value) {
  if (typeof value === 'string') {
    return /^https?:\/\//i.test(value) ? { url: value } : { b64_json: value };
  }
  if (!isPlainObject(value)) return undefined;
  if (typeof value.b64_json === 'string') {
    return {
      b64_json: value.b64_json,
      ...(typeof value.revised_prompt === 'string' ? { revised_prompt: value.revised_prompt } : {}),
    };
  }
  if (typeof value.url === 'string') {
    return {
      url: value.url,
      ...(typeof value.revised_prompt === 'string' ? { revised_prompt: value.revised_prompt } : {}),
    };
  }
  return undefined;
}

function tryNormalizeJsonResponse(value, model) {
  const candidates = Array.isArray(value?.data)
    ? value.data
    : Array.isArray(value?.images)
      ? value.images
      : [value?.data, value?.image, value];
  const data = candidates.map(imageItem).filter(Boolean);
  if (data.length === 0) return undefined;

  return {
    created: Number.isFinite(value?.created) ? value.created : Math.floor(Date.now() / 1_000),
    model: typeof value?.model === 'string' ? value.model : model,
    data,
  };
}

async function readResponseBytes(response, maxBytes) {
  if (!response.body) return Buffer.alloc(0);

  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new ApiError(
          502,
          'upstream_response_too_large',
          `The image provider response exceeded the ${Math.floor(maxBytes / 1024 / 1024)} MiB limit.`,
        );
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, totalBytes);
}

function readProviderErrorCode(bytes) {
  try {
    const body = JSON.parse(bytes.toString('utf8'));
    const code = body?.error?.code;
    return typeof code === 'string' && /^[A-Za-z0-9_.-]{1,80}$/.test(code) ? code : undefined;
  } catch {
    return undefined;
  }
}

function readTaskErrorCode(value) {
  const code = value?.error?.code;
  return typeof code === 'string' && /^[A-Za-z0-9_.-]{1,80}$/.test(code) ? code : undefined;
}

function readTaskStatus(value) {
  return typeof value?.status === 'string' ? value.status.toLowerCase() : undefined;
}

function throwTaskFailure(value) {
  const providerCode = readTaskErrorCode(value);
  throw new ApiError(
    502,
    'upstream_generation_failed',
    'The image provider failed to generate an image.',
    providerCode ? { upstream_code: providerCode } : undefined,
  );
}

function parseProviderJson(bytes) {
  try {
    return JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new ApiError(502, 'invalid_upstream_response', 'The image provider returned invalid JSON.');
  }
}

function waitForPoll(milliseconds, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason ?? new DOMException('The operation was aborted.', 'AbortError'));
      return;
    }

    const handleAbort = () => {
      clearTimeout(timer);
      reject(signal.reason ?? new DOMException('The operation was aborted.', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', handleAbort);
      resolve();
    }, milliseconds);
    timer.unref?.();
    signal.addEventListener('abort', handleAbort, { once: true });
  });
}

async function fetchProviderResponse(config, url, init, fetchImpl, signal) {
  const response = await fetchImpl(url, { ...init, signal });
  const requestId = response.headers.get('x-request-id') ?? undefined;
  const bytes = await readResponseBytes(response, config.maxResponseBytes);
  if (!response.ok) {
    throw new UpstreamError(response.status, requestId, readProviderErrorCode(bytes));
  }
  return { bytes, contentType: response.headers.get('content-type')?.toLowerCase() ?? '' };
}

async function callImageProvider(config, payload, fetchImpl, externalSignal) {
  const controller = new AbortController();
  let timedOut = false;
  const abortFromClient = () => controller.abort();
  if (externalSignal?.aborted) {
    controller.abort();
  } else {
    externalSignal?.addEventListener('abort', abortFromClient, { once: true });
  }
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, config.timeoutMs);
  timeout.unref?.();

  try {
    const submission = await fetchProviderResponse(config, config.endpoint, {
      method: 'POST',
      headers: {
        accept: 'application/json, image/*',
        authorization: `Bearer ${config.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    }, fetchImpl, controller.signal);

    if (submission.contentType.startsWith('image/')) {
      return {
        created: Math.floor(Date.now() / 1_000),
        model: config.model,
        data: [{ b64_json: submission.bytes.toString('base64') }],
      };
    }

    const submittedTask = parseProviderJson(submission.bytes);
    const submissionStatus = readTaskStatus(submittedTask);
    if (submissionStatus === 'failed') throwTaskFailure(submittedTask);
    const immediateResult = tryNormalizeJsonResponse(submittedTask, config.model);
    if (immediateResult) return immediateResult;

    const taskId = typeof submittedTask?.task_id === 'string' ? submittedTask.task_id.trim() : '';
    if (!taskId || !PENDING_TASK_STATUSES.has(submissionStatus)) {
      throw new ApiError(
        502,
        'invalid_upstream_response',
        'The image provider returned neither an image nor a valid asynchronous task.',
      );
    }

    const pollIntervalMs = config.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    const taskEndpoint = resolveTaskEndpoint(config.endpoint, taskId);
    while (true) {
      await waitForPoll(pollIntervalMs, controller.signal);
      const polled = await fetchProviderResponse(config, taskEndpoint, {
        method: 'GET',
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${config.apiKey}`,
        },
      }, fetchImpl, controller.signal);
      const task = parseProviderJson(polled.bytes);
      const status = readTaskStatus(task);
      if (status === 'failed') throwTaskFailure(task);
      const result = tryNormalizeJsonResponse(task, config.model);
      if (result) return result;

      if (!PENDING_TASK_STATUSES.has(status)) {
        throw new ApiError(
          502,
          'invalid_upstream_response',
          'The image provider returned an invalid task status or completed without an image.',
        );
      }
    }
  } catch (error) {
    if (error?.name === 'AbortError') {
      if (externalSignal?.aborted && !timedOut) {
        throw new ApiError(499, 'client_closed_request', 'The client disconnected before generation completed.');
      }
      throw new ApiError(504, 'upstream_timeout', 'The image provider timed out.');
    }
    if (
      error?.name === 'TypeError'
      && error?.message === 'fetch failed'
      && ['ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT']
        .includes(error?.cause?.code)
    ) {
      throw new ApiError(502, 'upstream_unreachable', 'The image provider could not be reached.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener('abort', abortFromClient);
  }
}

function writeJson(response, status, value) {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
    'content-type': 'application/json; charset=utf-8',
  });
  response.end(body);
}

function writeError(response, error) {
  if (response.destroyed || response.writableEnded) return;

  if (error instanceof UpstreamError) {
    writeJson(response, error.status, {
      error: {
        code: error.providerCode === 'moderation_blocked' ? 'moderation_blocked' : 'upstream_error',
        message: error.providerCode === 'moderation_blocked'
          ? 'Image generation was blocked by provider safety checks.'
          : 'The image provider rejected the request.',
        upstream_status: error.status,
        ...(error.providerCode ? { upstream_code: error.providerCode } : {}),
        ...(error.requestId ? { request_id: error.requestId } : {}),
      },
    });
    return;
  }

  if (error instanceof ApiError) {
    writeJson(response, error.status, {
      error: {
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      },
    });
    return;
  }

  console.error('[image-api] unexpected error:', error instanceof Error ? error.message : 'unknown error');
  writeJson(response, 500, {
    error: { code: 'internal_error', message: 'The image API encountered an unexpected error.' },
  });
}

function isLocalHostname(hostname) {
  return hostname === '127.0.0.1' || hostname === 'localhost';
}

function validateLocalRequest(request) {
  const host = request.headers.host;
  let hostUrl;
  try {
    hostUrl = new URL(`http://${host}`);
  } catch {
    throw new ApiError(403, 'forbidden_host', 'The image API accepts only local requests.');
  }
  if (!isLocalHostname(hostUrl.hostname)) {
    throw new ApiError(403, 'forbidden_host', 'The image API accepts only local requests.');
  }

  const origin = request.headers.origin;
  if (!origin) return;

  let originUrl;
  try {
    originUrl = new URL(origin);
  } catch {
    throw new ApiError(403, 'forbidden_origin', 'The request origin is not allowed.');
  }
  if (
    originUrl.protocol !== 'http:'
    || !isLocalHostname(originUrl.hostname)
    || originUrl.port !== '5173'
  ) {
    throw new ApiError(403, 'forbidden_origin', 'The request origin is not allowed.');
  }
}

export function createImageApiServer(config, { fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('This service requires Node.js 18 or newer with global fetch support.');
  }

  let activeRequests = 0;
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');

    try {
      validateLocalRequest(request);
    } catch (error) {
      writeError(response, error);
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/health') {
      writeJson(response, 200, {
        status: 'ok',
        configured: true,
        model: config.model,
        active_requests: activeRequests,
        max_concurrent: config.maxConcurrent,
      });
      return;
    }

    if (request.method !== 'POST' || url.pathname !== '/api/images/generate') {
      writeJson(response, 404, {
        error: { code: 'not_found', message: 'Route not found.' },
      });
      return;
    }

    if (!request.headers['content-type']?.toLowerCase().startsWith('application/json')) {
      writeJson(response, 415, {
        error: { code: 'unsupported_media_type', message: 'Content-Type must be application/json.' },
      });
      return;
    }

    try {
      const body = await readJsonBody(request, config.maxRequestBytes ?? DEFAULT_MAX_REQUEST_MB * 1024 * 1024);
      const payload = buildUpstreamPayload(body, config.model);
      if (activeRequests >= config.maxConcurrent) {
        throw new ApiError(429, 'busy', 'The local image API is at its concurrency limit.');
      }

      activeRequests += 1;
      const clientAbort = new AbortController();
      const handleDisconnect = () => {
        if (!response.writableEnded) clientAbort.abort();
      };
      request.once('aborted', handleDisconnect);
      response.once('close', handleDisconnect);
      let result;
      try {
        result = await callImageProvider(config, payload, fetchImpl, clientAbort.signal);
      } finally {
        request.removeListener('aborted', handleDisconnect);
        response.removeListener('close', handleDisconnect);
        activeRequests -= 1;
      }
      writeJson(response, 200, result);
    } catch (error) {
      writeError(response, error);
    }
  });
  server.requestTimeout = REQUEST_TIMEOUT_MS;
  server.headersTimeout = Math.min(REQUEST_TIMEOUT_MS, 10_000);
  server.keepAliveTimeout = 5_000;
  return server;
}

export async function startImageApi() {
  await loadEnvFile();
  const config = readImageApiConfig();
  const server = createImageApiServer(config);

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.port, config.host, resolve);
  });

  console.log(`[image-api] listening on http://${config.host}:${config.port}`);
  console.log(`[image-api] model: ${config.model}`);

  const shutdown = () => server.close(() => process.exit(0));
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  return server;
}

const entryPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (entryPath === import.meta.url) {
  startImageApi().catch((error) => {
    console.error(`[image-api] failed to start: ${error instanceof Error ? error.message : 'unknown error'}`);
    process.exitCode = 1;
  });
}
