# Image API Agent Guide

本目录提供一个只监听本机的 Node.js 图片生成代理。后续 agent 默认应调用本地代理，不要在浏览器或脚本中直接暴露 RightAPI key。

## 快速信息

| 项目 | 值 |
| --- | --- |
| 本地提交地址 | `http://127.0.0.1:8787/api/images/generate` |
| 健康检查 | `http://127.0.0.1:8787/api/health` |
| 上游提交地址 | `https://www.rightapi.ai/draw/v1/images/generations` |
| 上游任务查询 | `https://www.rightapi.ai/v1/tasks/{task_id}` |
| 当前默认模型 | `gpt-image-2` |
| 本地请求方法 | `POST` |
| 请求类型 | `application/json` |

本地代理会代替调用方完成上游异步任务轮询。调用方收到 `200` 时，通常已经拿到最终的 `data[].url`，不需要再次轮询本地接口。

## 临时图片工作流（强制）

所有通过本接口生成或编辑的图片，必须先保存到仓库根目录的 `TmpGenerate/`。该目录只用于候选图、预览图和待确认素材，不是运行时业务资产目录。

agent 必须遵守以下规则：

1. 生成结果先下载到 `TmpGenerate/`，不要直接写入 `src/assets/`、`public/` 或其他业务目录。
2. 文件名必须描述用途，使用 ASCII 小写 kebab-case，推荐格式为 `<对象>-<用途>-<变体>-vNN.<扩展名>`。
3. 不覆盖已有候选图；再次生成时递增版本号，如 `v01`、`v02`。
4. 示例：`zombie-soldier-pig-hybrid-concept-v01.png`、`weapon-flamethrower-icon-v02.webp`。
5. 业务代码、运行时清单和正式文档不得长期引用 `TmpGenerate/` 中的图片。
6. 图片确认采用后，再迁移到对应业务目录，并按该目录既有命名规则重命名。
7. 迁移后更新所有代码引用、资产清单、来源记录和必要测试；确认业务目录文件可正常加载后，才删除对应临时文件。
8. 未采用的候选图可以留在 `TmpGenerate/` 等待复核，也可以在用户明确要求后清理。

例如，本次生成的临时概念图应保存为：

```text
TmpGenerate/zombie-soldier-pig-hybrid-concept-v01.png
```

## 启动

在仓库根目录执行：

```bash
npm run image-api
```

服务读取仓库根目录的 `.env`。最小配置如下：

```dotenv
IMAGE_BASEURL=https://www.rightapi.ai/draw
IMAGE_APIKEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
IMAGE_MODEL=gpt-image-2
```

`IMAGE_BASEURL=https://www.rightapi.ai/draw` 会自动解析为：

```text
https://www.rightapi.ai/draw/v1/images/generations
```

可选配置：

```dotenv
IMAGE_API_PORT=8787
IMAGE_API_TIMEOUT_MS=150000
IMAGE_API_POLL_INTERVAL_MS=1000
IMAGE_API_MAX_CONCURRENT=2
IMAGE_API_MAX_REQUEST_MB=16
IMAGE_API_MAX_RESPONSE_MB=32
```

检查服务是否已启动：

```bash
curl http://127.0.0.1:8787/api/health
```

预期响应类似：

```json
{
  "status": "ok",
  "configured": true,
  "model": "gpt-image-2",
  "active_requests": 0,
  "max_concurrent": 2
}
```

如果 `8787` 已被本项目旧进程占用，先确认进程命令行是 `server/image-api.mjs`，再重启它。也可以临时改端口：

```powershell
$env:IMAGE_API_PORT = '8788'
npm run image-api
```

若 Vite 也要通过 `/api` 代理访问，Vite 的 `IMAGE_API_PORT` 必须与服务端端口一致。

## 本地接口

### 请求

```http
POST http://127.0.0.1:8787/api/images/generate
Content-Type: application/json
```

请求 JSON 字段：

| 字段 | 必需 | 说明 |
| --- | --- | --- |
| `prompt` | 是 | 非空字符串，最多 8000 个字符 |
| `n` | 否 | 整数 `1` 到 `10`，默认由上游处理为 1 |
| `size` | 否 | `1:1`、`16:9`、`9:16`、`4:3`，或正数像素格式如 `1024x1024` |
| `imageSize` | 否 | `1K`、`2K`、`4K`；只在对应的 nano-banana / gpt-image VIP 模型上使用 |
| `image` | 否 | 参考图数组；每项必须是 base64 图片 Data URL，最多 10 项 |
| `async` | 否 | 如果传入，必须是 JSON 布尔值 `true`；代理始终向上游发送 `true` |

`model` 不从本地请求体读取，而是使用 `.env` 的 `IMAGE_MODEL`，避免 agent 绕过服务端配置。

以下字段不是当前 RightAPI 文档契约的一部分，代理会返回 `400 unsupported_option`，不要发送：

```text
quality
background
output_format
output_compression
moderation
response_format
image_size   (错误的 snake_case 写法，应为 imageSize)
```

### 纯文生图

`async` 可以省略，代理会自动补成 `true`：

```bash
curl -X POST http://127.0.0.1:8787/api/images/generate \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "top-down pixel art zombie survivor, transparent game sprite style",
    "size": "1:1",
    "n": 1
  }'
```

也可以显式传入：

```json
{
  "prompt": "top-down pixel art zombie survivor",
  "size": "16:9",
  "n": 1,
  "async": true
}
```

PowerShell：

```powershell
$body = @{
  prompt = 'top-down pixel art zombie survivor, transparent game sprite style'
  size = '1:1'
  n = 1
  async = $true
} | ConvertTo-Json

Invoke-RestMethod `
  -Method Post `
  -Uri 'http://127.0.0.1:8787/api/images/generate' `
  -ContentType 'application/json' `
  -Body $body
```

### 带参考图

`image` 不能传本地路径、普通图片 URL 或单个字符串。必须先转换为 Data URL 数组：

```json
{
  "prompt": "参考这张图，生成同一角色的俯视角像素风游戏素材",
  "size": "1:1",
  "n": 1,
  "image": [
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg..."
  ]
}
```

Node.js agent 示例：

```js
import { readFile } from 'node:fs/promises';

function mimeFromPath(filePath) {
  if (/\.jpe?g$/i.test(filePath)) return 'image/jpeg';
  if (/\.webp$/i.test(filePath)) return 'image/webp';
  return 'image/png';
}

async function toImageDataUrl(filePath) {
  const mime = mimeFromPath(filePath);
  const base64 = (await readFile(filePath)).toString('base64');
  return `data:${mime};base64,${base64}`;
}

const image = await toImageDataUrl('./reference.png');
const response = await fetch('http://127.0.0.1:8787/api/images/generate', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    prompt: '参考图片生成同风格的角色立绘',
    size: '1:1',
    image: [image],
  }),
});

const result = await response.json();
if (!response.ok) throw new Error(result.error?.message ?? `HTTP ${response.status}`);
console.log(result.data.map((item) => item.url));
```

PowerShell 转换图片：

```powershell
$path = '.\reference.png'
$base64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($path))
$body = @{
  prompt = '参考图片生成同风格的角色立绘'
  size = '1:1'
  image = @("data:image/png;base64,$base64")
} | ConvertTo-Json -Compress

Invoke-RestMethod `
  -Method Post `
  -Uri 'http://127.0.0.1:8787/api/images/generate' `
  -ContentType 'application/json' `
  -Body $body
```

参考图会显著增大 JSON 请求体。默认上限是 16 MiB，可用 `IMAGE_API_MAX_REQUEST_MB` 调高，但不要把 API 暴露到局域网。

### `imageSize` 注意事项

RightAPI 文档只保证 nano-banana 和 gpt-image VIP 模型支持 `imageSize`。当前仓库 `.env` 使用 `gpt-image-2`，默认示例不发送 `imageSize`。如果账号和模型确实支持，可以这样传：

```json
{
  "prompt": "pixel art survivor",
  "imageSize": "2K",
  "async": true
}
```

不要把 `imageSize` 写成 `image_size`，也不要传 `"2k"`。

## 返回值和异步流程

本地代理会先向 RightAPI 提交：

```text
POST https://www.rightapi.ai/draw/v1/images/generations
```

上游提交响应通常是：

```json
{
  "task_id": "task_0123456789abcdef0123456789abcdef",
  "status": "processing",
  "progress": 0,
  "message": "..."
}
```

代理随后使用同一个 API key 轮询：

```text
GET https://www.rightapi.ai/v1/tasks/{task_id}
```

注意查询地址是站点级路径，没有 `/draw`。`queued`、`processing`、`in_progress` 会继续等待；完成体通常是：

```json
{
  "created": 1782800000,
  "data": [
    { "url": "https://cdn.example.com/results/task.png" }
  ]
}
```

本地成功响应会保持统一的 Images 形状：

```json
{
  "created": 1782800000,
  "model": "gpt-image-2",
  "data": [
    { "url": "https://cdn.example.com/results/task.png" }
  ]
}
```

agent 应读取 `data[].url`。不要等待 `b64_json`，RightAPI 当前文档只保证 URL 结果。需要本地文件时，再由 agent 下载该 URL。

## 错误处理

所有错误都是 JSON：

```json
{
  "error": {
    "code": "invalid_request",
    "message": "..."
  }
}
```

常见错误：

| HTTP | `error.code` | 处理方式 |
| --- | --- | --- |
| `400` | `invalid_request` | 修正 JSON、提示词、尺寸或 Data URL |
| `400` | `unsupported_option` | 删除未列入 RightAPI 契约的字段 |
| `401`/`403` | `upstream_error` | 检查 API key、账号权限和模型权限 |
| `415` | `unsupported_media_type` | 使用 `Content-Type: application/json` |
| `429` | `busy` | 等待本地并发请求完成后重试 |
| `502` | `upstream_unreachable` | 检查网络、DNS 或上游服务状态 |
| `502` | `upstream_generation_failed` | 查看错误码，调整提示词/模型后重试 |
| `504` | `upstream_timeout` | 任务可能仍在上游运行，稍后重新发起请求 |

不要把 API key、完整 Data URL 或上游原始错误体写入日志。代理不会把 key 返回给客户端，也不会透传上游错误正文。

## Agent 调用清单

1. 先调用 `/api/health`，确认 `status` 为 `ok`。
2. 使用 `POST /api/images/generate`，请求体必须是 JSON 对象。
3. 带图时，先把每张图片转换成 `data:image/...;base64,...`，放入 `image` 数组。
4. 不发送 `response_format`、`quality` 或其他未记录字段。
5. 成功后读取 `data[].url`，并把图片下载到 `TmpGenerate/`，不要自行调用上游任务接口。
6. 使用能表达业务用途的版本化文件名，不覆盖已有临时图片。
7. 图片确认采用后才迁移到具体业务目录，并同步代码引用和资产记录。
8. 失败时根据 `error.code` 处理，不要把同一个失败请求高速重试。

## 直连 RightAPI（仅在确实需要时）

直连会把 API key 暴露给调用脚本，优先使用本地代理。若必须直连，提交和查询必须分成两步：

```text
POST https://www.rightapi.ai/draw/v1/images/generations
Authorization: Bearer sk-...
Content-Type: application/json
{
  "model": "gpt-image-2",
  "prompt": "pixel art survivor",
  "n": 1,
  "size": "1:1",
  "async": true
}
```

从提交响应取出 `task_id`，然后用同一个 key 请求：

```text
GET https://www.rightapi.ai/v1/tasks/{task_id}
Authorization: Bearer sk-...
```

轮询状态为 `queued` 或 `in_progress` 时等待后重试；`completed` 读取 `data[].url`；`failed` 停止并处理 `error.message`。不要把 `/draw` 加到任务查询地址。

## 相关文件

- 实现：[image-api.mjs](./image-api.mjs)
- 项目级说明：[../docs/IMAGE_GENERATION_API.md](../docs/IMAGE_GENERATION_API.md)
- 隔离测试：[../tests/image-api.test.mjs](../tests/image-api.test.mjs)

运行接口测试：

```bash
npm run test:image-api
```
