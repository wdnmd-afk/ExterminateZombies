/**
 * 新增战术道具的**俯视**图标生图脚本。
 *
 * 与 generate_weapon_assets.mjs 同源（同一个本地代理、同一套降级词表与洋红键控底），
 * 但机位取向相反：武器走正侧视，道具必须严格俯视，因为它们要和 prop-oil-barrel /
 * prop-flour-barrel / prop-mine 三张既有图摆在同一张战场上。机位不齐会直接被看出来。
 *
 * 三个来自既有管线的教训，此处沿用：
 * 1. **只说 "90 degree top-down" 不够**（角色管线 2026-08-18 守望者图的实际失败）。
 *    所以每个道具的 spec 里都有 topDownEmphasis，正面枚举「俯视下能看到什么形状」，
 *    而不是只声明角度。
 * 2. **输出尺寸恒定**，size / imageSize 参数会被上游忽略，不要依赖它们做画幅控制。
 *    降采样到 42~46px 由 process_prop_item_assets.py 负责。
 * 3. **爆炸物措辞容易触发内容审核**，比武器更敏感。所以 identityLadder 备了四级：
 *    指名用途 → 通用机械描述 → 工业器械描述 → 纯几何描述。逐级退让。
 *
 * 候选一律写入 TmpGenerate/ 且不覆盖已有文件，后处理与检视由
 * scripts/process_prop_item_assets.py 负责。
 *
 * 用法：
 *   node scripts/generate_prop_item_assets.mjs firebomb
 *   node scripts/generate_prop_item_assets.mjs all
 */

import { mkdir, writeFile, access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const TEMP_DIR = resolve(ROOT, 'TmpGenerate');
const SPEC_PATH = resolve(ROOT, 'scripts', 'prop_item_specs.json');
const API_URL = process.env.PROP_IMAGE_API_URL ?? 'http://127.0.0.1:8787/api/images/generate';
const HEALTH_URL = process.env.PROP_IMAGE_API_HEALTH_URL ?? 'http://127.0.0.1:8787/api/health';

/**
 * 画风段。与武器管线同源，去掉金属材质专属措辞，保留「缩小后仍可读」这一条。
 *
 * 这四张图的最终显示尺寸只有约 42×42，比武器 HUD 槽还小。所以「survives being scaled
 * down」是最重要的画风约束——细节再多，缩到 42px 糊成一团就等于没有。
 */
const STYLE = [
  'High-resolution detailed pixel art game asset, detailed 2D game item illustration,',
  'clean readable fine pixel clusters with deliberate dithering, limited but rich color palette,',
  'crisp hand-placed shading with distinct specular highlights on upper surfaces',
  'and deep shadow along lower edges,',
  'strong value separation between adjacent parts so every component reads as its own volume,',
  'dark gritty post-apocalyptic survival game art style, professional game asset quality,',
  'sharp silhouette readability that survives being scaled down to a small 42 pixel icon,',
  'crisp at source resolution and suitable for clean downsampling.',
].join(' ');

/**
 * 键控底与画幅约束。
 *
 * 主体占比给 74-88%：道具是紧凑物体（不像细长的枪），正方形画幅里可以填得比武器满一些，
 * 但必须留出四边余量供 alpha_bbox 找边界。
 */
const FRAMING = [
  'The item is centered in the square canvas and completely inside the frame,',
  'spanning 74 to 88 percent of the canvas width, with a clearly visible margin of flat',
  'magenta background on all four sides so no part of the item touches a canvas edge.',
  'Flat solid pure magenta #FF00FF background covering every pixel around the item,',
  'no gradient, no ground plane, no cast shadow, no environment, no table, no text,',
  'no border, no logo, no watermark, no measurement callouts, no inventory slot frame.',
  'Do not use magenta, pink or violet anywhere on the item itself.',
].join(' ');

const BASE_NEGATIVE = [
  'photorealism',
  'blurry soft airbrush rendering',
  'three-quarter perspective view',
  'side elevation view',
  'isometric view',
  'tilted camera',
  'human figure',
  'character',
  'multiple items',
  'item collection sheet',
  'UI',
  'HUD',
  'inventory slot background',
  'drop shadow',
  'motion blur',
  'lens flare',
];

/**
 * 机位段。本脚本最重要的一段。
 *
 * 沿用角色管线的三重约束结构：用相机物理位置描述（而不是抽象角度）+ 正面枚举可见项
 * （spec.topDownEmphasis）+ 负面枚举不可见项。只写角度已被证明不够。
 *
 * 末句「floor plan view of an object lying on the ground」是对齐既有三张图的关键：
 * 那三张读起来都是「地上的东西」，而不是「悬空展示的道具」。
 */
function topDownFor(spec) {
  return [
    'ORIENTATION AND CAMERA, this is the single most important requirement:',
    'strict 90-degree top-down bird\'s-eye view, as if the camera were mounted on the ceiling',
    'directly above the item and pointing straight down at the floor.',
    ...(spec.topDownEmphasis ?? []),
    'You must not show the item from the side and must not show any vertical face of it.',
    'This is a floor plan view of a single object resting on the ground,',
    'not a product photo of an object standing upright.',
  ].join(' ');
}

function negativeFor(spec) {
  return `Avoid ${[...(spec.extraNegative ?? []), ...BASE_NEGATIVE].join(', ')}.`;
}

function buildPrompt(spec, identity) {
  return [
    STYLE,
    `Create one single top-down game item icon of ${identity}.`,
    topDownFor(spec),
    'One single item only, shown as an isolated pickup lying on the ground.',
    FRAMING,
    negativeFor(spec),
  ].join(' ');
}

async function checkHealth() {
  const response = await fetch(HEALTH_URL);
  if (!response.ok) {
    throw new Error(`本地生图代理不健康：HTTP ${response.status}。请先运行 npm run image-api`);
  }
  const payload = await response.json();
  if (!payload.configured) {
    throw new Error('本地生图代理未配置 API key（.env 的 IMAGE_APIKEY）');
  }
  return payload;
}

async function requestImage(prompt) {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, size: '1:1', n: 1, async: true }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 400)}`);
  }

  const payload = JSON.parse(text);
  const entry = payload?.data?.[0];
  if (!entry) throw new Error(`响应中没有图片数据：${text.slice(0, 400)}`);

  if (entry.b64_json) return Buffer.from(entry.b64_json, 'base64');

  if (entry.url) {
    const imageResponse = await fetch(entry.url);
    if (!imageResponse.ok) {
      throw new Error(`下载图片失败：HTTP ${imageResponse.status}`);
    }
    return Buffer.from(await imageResponse.arrayBuffer());
  }

  throw new Error('响应既没有 b64_json 也没有 url');
}

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

async function generateOne(spec, shared) {
  const attempts = shared.attemptsPerWording ?? 4;
  const ladder = spec.identityLadder;

  for (let tier = 0; tier < ladder.length; tier++) {
    const prompt = buildPrompt(spec, ladder[tier]);
    for (let attempt = 1; attempt <= attempts; attempt++) {
      const label = `${spec.candidateSlug} 措辞${tier + 1}/${ladder.length} 第${attempt}次`;
      try {
        process.stdout.write(`[${label}] 提交中...\n`);
        const buffer = await requestImage(prompt);

        // 候选不覆盖：同一个道具允许多轮生成后人工挑选，覆盖会丢掉上一轮的可用结果。
        let index = 1;
        let target;
        do {
          target = resolve(TEMP_DIR, `${spec.candidateSlug}-v${String(index).padStart(2, '0')}.png`);
          index += 1;
        } while (await fileExists(target));

        await writeFile(target, buffer);
        process.stdout.write(`[${label}] 已保存 ${target} (${buffer.length} 字节)\n`);
        return { itemId: spec.itemId, path: target, tier: tier + 1 };
      } catch (error) {
        process.stdout.write(`[${label}] 失败：${error.message}\n`);
        if (attempt < attempts) await sleep(shared.retryDelayMs ?? 3000);
      }
    }
    process.stdout.write(`[${spec.candidateSlug}] 措辞${tier + 1} 全部失败，降级到下一级措辞\n`);
  }

  return { itemId: spec.itemId, path: null, tier: null };
}

async function main() {
  const requested = process.argv[2] ?? 'all';
  const specFile = JSON.parse(await readFile(SPEC_PATH, 'utf8'));
  const shared = specFile.shared ?? {};
  const all = specFile.props ?? [];

  const targets = requested === 'all'
    ? all
    : all.filter((spec) => spec.itemId === requested);

  if (targets.length === 0) {
    throw new Error(`未找到道具规格：${requested}。可用：${all.map((s) => s.itemId).join(', ')}`);
  }

  const health = await checkHealth();
  process.stdout.write(`代理就绪，模型 ${health.model}\n`);
  await mkdir(TEMP_DIR, { recursive: true });

  // 顺序执行不并发：上游 max_concurrent 只有 2，并发失败时无法分辨
  // 是额度问题还是措辞问题（与武器管线同一判断）。
  const results = [];
  for (const spec of targets) {
    results.push(await generateOne(spec, shared));
  }

  process.stdout.write('\n=== 汇总 ===\n');
  for (const result of results) {
    process.stdout.write(
      result.path
        ? `${result.itemId}: 成功（措辞${result.tier}） ${result.path}\n`
        : `${result.itemId}: 全部措辞失败\n`,
    );
  }

  if (results.some((result) => !result.path)) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error.message}\n`);
  process.exitCode = 1;
});
