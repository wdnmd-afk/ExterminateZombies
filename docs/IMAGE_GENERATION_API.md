# Local image generation API

This project includes a local-only Node.js proxy for the RightAPI asynchronous image provider. It keeps `IMAGE_APIKEY` out of the Vite bundle and exposes a small API at `127.0.0.1:8787`.

For copy-ready instructions intended for automation agents, see [server/README.md](../server/README.md).

## Configuration

The service reads the repository root `.env` file:

```dotenv
IMAGE_BASEURL=https://www.rightapi.ai/draw
IMAGE_APIKEY=replace-with-your-api-key
IMAGE_MODEL=gpt-image-2
```

Endpoint resolution works as follows:

- A host-only URL becomes `/v1/images/generations`.
- A URL ending in `/v1` gets `/images/generations` appended.
- Any other custom path gets `/v1/images/generations` appended. For example, `/draw` becomes `/draw/v1/images/generations`.
- `IMAGE_ENDPOINT` always overrides the resolved endpoint and is treated as exact.

For RightAPI, `IMAGE_BASEURL=https://www.rightapi.ai/draw` resolves to the documented submission endpoint `https://www.rightapi.ai/draw/v1/images/generations`. Task polling is automatically sent to the site-level `https://www.rightapi.ai/v1/tasks/{task_id}` endpoint, without the `/draw` prefix.

## Run

```bash
npm run image-api
```

The service binds only to `127.0.0.1`. The Vite development server proxies `/api` to it, so browser code running through Vite can use the same relative URLs after both processes are running.

Check health:

```bash
curl http://127.0.0.1:8787/api/health
```

Generate an image (the local proxy waits for the asynchronous task to complete):

```bash
curl -X POST http://127.0.0.1:8787/api/images/generate \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "top-down pixel art zombie survivor, transparent game sprite style",
    "size": "1:1",
    "n": 1,
    "async": true
  }'
```

The upstream request always includes `model`, `prompt`, and boolean `async: true`. Supported optional fields are `n` (1-10), `size`, `imageSize`, and `image` (up to 10 references). `size` accepts `1:1`, `16:9`, `9:16`, `4:3`, or a positive pixel string such as `1024x1024`; `imageSize` accepts `1K`, `2K`, or `4K` only for the provider's nano-banana and gpt-image VIP models; `image` must be an array of base64 image data URLs. The proxy intentionally rejects OpenAI-only options that are not listed in the RightAPI contract, including `response_format`.

RightAPI first returns a task such as `{ "task_id": "...", "status": "processing" }`. The proxy polls `queued` and `in_progress` states and returns the completed Images response, normally containing `data[].url`.

On Windows PowerShell, the equivalent request is:

```powershell
$body = @{
  prompt = 'top-down pixel art zombie survivor, transparent game sprite style'
  size = '1:1'
  async = $true
} | ConvertTo-Json

Invoke-RestMethod `
  -Method Post `
  -Uri 'http://127.0.0.1:8787/api/images/generate' `
  -ContentType 'application/json' `
  -Body $body
```

## Security and limits

- The API key is read only by Node.js and is never returned to the client.
- The service has no permissive CORS headers, rejects non-local `Host`/`Origin` values, and does not listen on LAN interfaces.
- Request bodies are limited to 16 MiB, prompts to 8,000 characters, and generation concurrency to two by default.
- Buffered provider responses are capped at 32 MiB by default; `IMAGE_API_MAX_RESPONSE_MB` can adjust the total response budget.
- Client disconnects cancel the upstream request, and incomplete request bodies time out after 15 seconds.
- Provider errors are normalized without returning the provider's raw response body.
- Network failures are returned as `502 upstream_unreachable`; they do not look like successful image responses.
- The default total upstream wait timeout is 150 seconds. Polling defaults to once per second and can be adjusted with `IMAGE_API_POLL_INTERVAL_MS`.

Run the isolated API tests without the project's currently blocked Vitest setup:

```bash
npm run test:image-api
```
