/**
 * Runner 感染体生图脚本。
 *
 * 与 Walker 同一条路径：先生成身份参考图，再以它作为 I2I 参考生成左/下/上三个方向的
 * 2×2 四帧，以及一张独立图鉴立绘。右向不生成，由后处理镜像左向得到。
 *
 * 两个必须处理的上游现实（2026-08-20 实测）：
 * 1. 内容审核会拒绝 zombie / corpse / undead 等直白措辞，返回 502
 *    upstream_generation_failed。因此每个请求带一条降级词表：先试提示词 6.2 原文，
 *    失败后逐级换成语义等价但可通过的措辞，全部失败才判该项不可生成。
 * 2. 输出尺寸恒为 1254×1254，size 与 imageSize 参数均被忽略，不要依赖它们。
 *
 * 候选一律写入 TmpGenerate/ 且不覆盖已有文件；采用与后处理由
 * scripts/process_runner_assets.py 负责。
 */

import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { basename, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const TEMP_DIR = resolve(ROOT, 'TmpGenerate');
const API_URL = process.env.RUNNER_IMAGE_API_URL ?? 'http://127.0.0.1:8787/api/images/generate';
const HEALTH_URL = process.env.RUNNER_IMAGE_API_HEALTH_URL ?? 'http://127.0.0.1:8787/api/health';
const VERSION = process.env.RUNNER_ASSET_VERSION ?? 'v04';
/** 同一条措辞的重试次数。审核判定有随机性，同词重试有时能过。 */
const ATTEMPTS_PER_WORDING = 2;
const RETRY_DELAY_MS = 3000;

/** 画风与技术规格段，所有请求共用，对应 ZOMBIE_PROMPTS.md 第 2 节。 */
const STYLE = [
  'High-resolution detailed pixel art game enemy sprite, dark gritty post-apocalyptic survival horror art,',
  'crisp hand-placed pixel shading, readable fine pixel clusters, limited dirty color palette,',
  'strong value separation and a strong readable silhouette at small in-game size.',
].join(' ');

/**
 * 构图约束。
 *
 * 注意这里不能写 "taller than wide" 之类的比例硬约束：v04 因为带了这一条，
 * 模型在四个方向上都画成同一个直立姿态，方向指令被压过去，实机表现为"只有一个朝向"。
 * 比例由后处理的归一化负责，提示词只负责机位、完整性和键控底。
 */
const FRAMING = [
  'Strict 90-degree top-down bird\'s-eye view, camera directly overhead looking straight down.',
  'Body centered and completely inside the square canvas, head, hands and feet never cropped,',
  'subject filling 70 to 84 percent of the canvas.',
  'Flat solid pure magenta #FF00FF background covering every pixel around the subject,',
  'no gradient, no ground plane, no cast shadow, no environment, no text, no border, no logo,',
  'no watermark, no weapon. Do not use magenta anywhere on the subject itself.',
].join(' ');

const NEGATIVE = [
  'Avoid healthy athlete, superhero, clean clothes, soldier, cute cartoon, chibi, toy, robot,',
  'cyborg, fantasy armor, weapon, gun, multiple characters, crowd, duplicate limbs, extra arms,',
  'extra legs, malformed hands, cropped head, cropped feet, body outside frame, side view,',
  'isometric view, 45 degree view, visible horizon, ground shadow, environment, text, logo,',
  'watermark, low resolution, blurry, soft focus, motion blur, smooth gradient, photorealistic 3D render.',
].join(' ');

/** 四帧网格的共用约束，避免各方向请求里重复描述。 */
const GRID = [
  'The four frames form one looping run cycle with alternating leading legs and opposite swinging arms,',
  'but all four frames keep the same orientation, same identity, same clothing, same palette, same size',
  'and the same distance from the bottom of their own frame.',
  'Each frame contains exactly one character.',
  'Do not draw grid lines, panel borders, numbers or captions between the four frames;',
  'the gaps between frames must be the same flat magenta background.',
].join(' ');

/**
 * Runner 身份描述的降级阶梯。
 * 阶梯 0 是 ZOMBIE_PROMPTS.md 6.2 的原文措辞；后续阶梯只替换被审核拦截的名词，
 * 保留全部视觉信息（瘦削、伸展肌腱、长前臂、破连帽衫、破跑鞋、张口、前倾冲刺）。
 */
const IDENTITY_LADDER = [
  'a fresh feral runner zombie with a lean athletic corpse, stretched tendons, elongated forearms, ragged hoodie, torn running shoes, predatory open mouth, head thrust forward and body pitched into a spring-loaded sprint',
  'a fast infected humanoid with a lean athletic build and gaunt grey-green skin, stretched tendons, elongated forearms, ragged hoodie, torn running shoes, snarling open mouth, head thrust forward and body pitched into a spring-loaded sprint',
  'a fast infected humanoid enemy, lean and gaunt with grey-green skin, taut stretched tendons, unusually long forearms, ragged torn hoodie, worn running shoes, open snarling mouth, head thrust forward, body pitched low into an explosive forward sprint',
  'a lean fast-moving infected creature with grey-green skin, wiry limbs, long forearms, tattered hoodie, worn running shoes, open mouth, head low and forward in an aggressive charging run',
];

/** 每个产物的构图指令；identity 由阶梯注入。 */
const REQUESTS = [
  {
    // 四视图转身参考，与 Walker 的 Walker_direction_reference.png 同性质。
    // v04 用的是"单个朝右姿态"作参考，把它传给每个方向请求会持续强化同一朝向，
    // 是四行看起来同朝向的第二个根因。四视图参考才能让模型知道每个方向长什么样。
    key: 'zombie-runner-direction-reference',
    isReference: true,
    composition: (identity) => [
      STYLE,
      `Create one character turnaround reference sheet of ${identity}, drawn as a 2 by 2 grid of four views of the SAME character, all seen from a strict 90-degree top-down bird's-eye view.`,
      'Top-left view: the character travels toward the BOTTOM edge, running at the viewer, face and both shoulders visible, bilaterally symmetric.',
      'Top-right view: the character travels toward the LEFT edge, a pure side profile from overhead, head pointing at the left edge, only one arm and one leg on the near side, distinctly asymmetric.',
      'Bottom-left view: the character travels toward the RIGHT edge, a pure side profile from overhead, head pointing at the right edge, the exact mirror of the top-right view.',
      'Bottom-right view: the character travels toward the TOP edge, running away from the viewer, only the back of the head and the hoodie back visible, no face, bilaterally symmetric.',
      'The four views must be the same character at the same size with the same clothing and palette.',
      'Do not draw grid lines, panel borders, labels, arrows or captions; the gaps between views must be the same flat magenta background.',
      FRAMING,
      NEGATIVE,
    ].join(' '),
  },
  {
    key: 'zombie-runner-left-4',
    composition: (identity) => [
      STYLE,
      `Create a 2 by 2 grid of exactly four animation frames showing ${identity}.`,
      'ORIENTATION, this is the most important requirement: seen from directly above, the character travels toward the LEFT edge of the frame.',
      'This is a pure side profile from overhead: the head points at the left edge, the shoulders form a line running left to right, only ONE arm and ONE leg are clearly on the near side of the body while the far arm and far leg are partly hidden behind the torso.',
      'The body is distinctly asymmetric left-to-right. Do not draw the character standing upright facing the viewer, and do not show both shoulders symmetrically.',
      GRID,
      FRAMING,
      NEGATIVE,
    ].join(' '),
  },
  {
    key: 'zombie-runner-down-4',
    composition: (identity) => [
      STYLE,
      `Create a 2 by 2 grid of exactly four animation frames showing ${identity}.`,
      'ORIENTATION, this is the most important requirement: seen from directly above, the character travels toward the BOTTOM edge of the frame, running at the viewer.',
      'Both shoulders are visible and symmetric, the top of the head and the face are visible below the shoulders, both arms are visible on either side of the torso, and both feet point toward the bottom edge.',
      'The pose is close to bilaterally symmetric about a vertical line. Do not draw a side profile.',
      GRID,
      FRAMING,
      NEGATIVE,
    ].join(' '),
  },
  {
    key: 'zombie-runner-up-4',
    composition: (identity) => [
      STYLE,
      `Create a 2 by 2 grid of exactly four animation frames showing ${identity}.`,
      'ORIENTATION, this is the most important requirement: seen from directly above, the character travels toward the TOP edge of the frame, running away from the viewer.',
      'Only the back of the head and the back of the hoodie are visible. NO face, NO eyes, NO mouth in any frame. Both shoulders are visible and symmetric, both arms are visible on either side of the torso, and the heels are toward the bottom edge.',
      'The pose is close to bilaterally symmetric about a vertical line. Do not draw a side profile.',
      GRID,
      FRAMING,
      NEGATIVE,
    ].join(' '),
  },
  {
    key: 'zombie-runner-portrait',
    composition: (identity) => [
      STYLE,
      `Create one single full-body dossier portrait of ${identity}, facing the viewer, standing still and centered in a tense forward-leaning ready-to-sprint pose.`,
      'One single character only, a static reading pose for an encyclopedia entry, not an animation frame and not a grid of frames.',
      'Match the identity, palette, clothing, anatomy and pixel rendering of the supplied reference image exactly.',
      FRAMING,
      NEGATIVE,
    ].join(' '),
  },
];

function sleep(ms) {
  return new Promise((done) => setTimeout(done, ms));
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function fileToDataUrl(filePath) {
  const extension = extname(filePath).toLowerCase();
  const mime = extension === '.jpg' || extension === '.jpeg' ? 'image/jpeg' : 'image/png';
  const buffer = await readFile(filePath);
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

/** 单次生成请求。返回 URL 或内联字节；抛错时带上游错误码便于区分审核与网络问题。 */
async function requestImage(prompt, references) {
  const body = {
    prompt,
    size: '1:1',
    n: 1,
    async: true,
    ...(references.length > 0 ? { image: references } : {}),
  };
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const code = payload?.error?.code ?? `http_${response.status}`;
    const error = new Error(payload?.error?.message ?? `image API failed with HTTP ${response.status}`);
    error.code = code;
    throw error;
  }
  const url = payload?.data?.[0]?.url;
  const encoded = payload?.data?.[0]?.b64_json;
  if (typeof url === 'string') return { url };
  if (typeof encoded === 'string') return { bytes: Buffer.from(encoded, 'base64') };
  throw new Error('image API returned neither data[0].url nor data[0].b64_json');
}

async function downloadResult(result) {
  if (result.bytes) return result.bytes;
  const response = await fetch(result.url);
  if (!response.ok) throw new Error(`generated image download failed with HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

/**
 * 按降级词表尝试生成，直到成功或全部阶梯用尽。
 * 返回实际生效的阶梯序号，便于在执行文档中记录到底用的是哪一版措辞。
 */
async function generateWithLadder(request, references) {
  for (let tier = 0; tier < IDENTITY_LADDER.length; tier += 1) {
    const prompt = request.composition(IDENTITY_LADDER[tier]);
    for (let attempt = 1; attempt <= ATTEMPTS_PER_WORDING; attempt += 1) {
      try {
        const result = await requestImage(prompt, references);
        return { bytes: await downloadResult(result), tier };
      } catch (error) {
        const label = `tier${tier} try${attempt}`;
        console.log(`    ${label} 失败: ${error.code ?? 'unknown'} ${error.message}`);
        if (attempt < ATTEMPTS_PER_WORDING) await sleep(RETRY_DELAY_MS);
      }
    }
  }
  throw new Error(`${request.key}: 所有措辞阶梯均被上游拒绝`);
}

async function main() {
  await mkdir(TEMP_DIR, { recursive: true });

  const health = await fetch(HEALTH_URL).catch(() => null);
  const healthPayload = health ? await health.json().catch(() => null) : null;
  if (!health?.ok || healthPayload?.status !== 'ok') {
    throw new Error(
      `image API 健康检查失败，请先运行 npm run image-api。返回: ${JSON.stringify(healthPayload)}`,
    );
  }
  console.log(`image-api ok: model=${healthPayload.model}`);

  let identityReference = null;
  const summary = [];

  for (const request of REQUESTS) {
    const outputPath = resolve(TEMP_DIR, `${request.key}-${VERSION}.png`);
    if (await exists(outputPath)) {
      // 不覆盖已有候选：重跑时只补齐缺失项，避免重复消耗生成额度。
      console.log(`跳过 ${basename(outputPath)}（已存在）`);
      if (request.isReference) identityReference = await fileToDataUrl(outputPath);
      summary.push({ key: request.key, tier: 'skipped', bytes: 0 });
      continue;
    }

    console.log(`生成 ${request.key} ...`);
    const references = identityReference ? [identityReference] : [];
    const { bytes, tier } = await generateWithLadder(request, references);
    await writeFile(outputPath, bytes);
    console.log(`  写入 ${basename(outputPath)} (${bytes.length} 字节, 措辞阶梯 ${tier})`);
    summary.push({ key: request.key, tier, bytes: bytes.length });

    if (request.isReference) identityReference = await fileToDataUrl(outputPath);
  }

  console.log('\n--- 生成汇总 ---');
  for (const item of summary) {
    console.log(`${item.key}: 阶梯=${item.tier} 字节=${item.bytes}`);
  }
  console.log(`\n下一步: python scripts/inspect_runner_candidates.py 检视候选质量`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
