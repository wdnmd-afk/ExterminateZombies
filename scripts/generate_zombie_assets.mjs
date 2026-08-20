/**
 * 感染体生图脚本（按 id 取配置的共用管线）。
 *
 * 与 Walker 同一条路径：先生成四视图身份参考图，再以它作为 I2I 参考生成左/下/上三个
 * 方向的 2×2 四帧，以及一张独立图鉴立绘。右向不生成，由后处理镜像左向得到。
 *
 * 角色专属内容全部在 scripts/zombie_asset_specs.json，本文件只负责构图骨架与上游交互。
 *
 * 三个必须处理的上游现实（2026-08-20 实测）：
 * 1. 内容审核会拒绝 zombie / corpse / undead 等直白措辞，返回 502
 *    upstream_generation_failed。因此每个请求带一条降级词表：先试 ZOMBIE_PROMPTS.md
 *    原文，失败后逐级换成语义等价但可通过的措辞，全部失败才判该项不可生成。
 * 2. 输出尺寸恒为 1254×1254，size 与 imageSize 参数均被忽略，不要依赖它们。
 * 3. 参考图必须是四视图转身图。用单个朝右姿态当参考会持续强化同一朝向，
 *    是 Runner v04 "四行同朝向" 的两个根因之一。
 *
 * 候选一律写入 TmpGenerate/ 且不覆盖已有文件；采用与后处理由
 * scripts/process_zombie_sprites.py 负责。
 *
 * 用法：
 *   node scripts/generate_zombie_assets.mjs bomber
 *   node scripts/generate_zombie_assets.mjs bomber --version v02
 */

import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { basename, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const TEMP_DIR = resolve(ROOT, 'TmpGenerate');
const SPEC_PATH = resolve(ROOT, 'scripts', 'zombie_asset_specs.json');
const API_URL = process.env.ZOMBIE_IMAGE_API_URL ?? 'http://127.0.0.1:8787/api/images/generate';
const HEALTH_URL = process.env.ZOMBIE_IMAGE_API_HEALTH_URL ?? 'http://127.0.0.1:8787/api/health';

/** 画风段，所有请求共用，对应 ZOMBIE_PROMPTS.md 第 2 节。 */
const STYLE = [
  'High-resolution detailed pixel art game enemy sprite, dark gritty post-apocalyptic survival horror art,',
  'crisp hand-placed pixel shading, readable fine pixel clusters, limited dirty color palette,',
  'strong value separation and a strong readable silhouette at small in-game size.',
].join(' ');

/**
 * 构图约束。
 *
 * 注意这里不能写 "taller than wide" 之类的比例硬约束：Runner v04 因为带了这一条，
 * 模型在四个方向上都画成同一个直立姿态，方向指令被压过去，实机表现为"只有一个朝向"。
 * 比例由后处理的归一化负责，提示词只负责机位、完整性和键控底。
 */
const FRAMING = [
  'Strict 90-degree top-down bird\'s-eye view, camera directly overhead looking straight down.',
  'Body centered and completely inside the square canvas, head, hands and feet never cropped,',
  'subject filling 70 to 84 percent of the canvas.',
  'Flat solid pure magenta #FF00FF background covering every pixel around the subject,',
  'no gradient, no ground plane, no cast shadow, no environment, no text, no border, no logo,',
  'no watermark, no weapon. Do not use magenta, pink or violet anywhere on the subject itself.',
].join(' ');

const BASE_NEGATIVE = [
  'clean clothes', 'soldier', 'cute cartoon', 'chibi', 'toy', 'robot', 'cyborg', 'fantasy armor',
  'weapon', 'gun', 'multiple characters', 'crowd', 'duplicate limbs', 'extra arms', 'extra legs',
  'malformed hands', 'cropped head', 'cropped feet', 'body outside frame', 'side view',
  'isometric view', '45 degree view', 'visible horizon', 'ground shadow', 'environment', 'text',
  'logo', 'watermark', 'low resolution', 'blurry', 'soft focus', 'motion blur', 'smooth gradient',
  'photorealistic 3D render',
];

function negativeFor(spec) {
  return `Avoid ${[...(spec.extraNegative ?? []), ...BASE_NEGATIVE].join(', ')}.`;
}

/**
 * 正面视图的识别特征，与 backView 对称。
 *
 * 默认值就是原先硬编码在 down 请求里的那一句，所以已归档的四类感染体提示词逐字不变。
 * 存在这个钩子的原因：headless 没有头也没有脸，"头顶和脸可见" 对它是自相矛盾的指令，
 * 会直接和它唯一的识别特征打架。这类"正面靠什么认"的差异只能按感染体登记。
 */
function frontViewOf(spec) {
  return spec.frontView ?? 'the top of the head and the face are visible below the shoulders';
}

/** 四帧网格的共用约束，避免各方向请求里重复描述。 */
function gridFor(spec) {
  return [
    `The four frames form ${spec.gait},`,
    'but all four frames keep the same orientation, same identity, same clothing, same palette, same size',
    'and the same distance from the bottom of their own frame.',
    // 每格留边必须单独说：FRAMING 的 "占画布 70-84%" 对 2×2 网格是歧义的（整图还是每格），
    // 模型会按整图理解，把单格主体画到 94% 而四边贴死。瘦长体型的背面视图是最高的一张，
    // 最先踩中（Drifter v01 的 up 四帧边距全为 0px，被检视门控拦下）。
    'Within its own frame each character occupies at most 84 percent of that frame\'s height and width,',
    'leaving a clearly visible margin of flat magenta background on all four sides of every frame,',
    'so no head, hand, foot or hem ever touches a frame edge.',
    'Each frame contains exactly one character.',
    // 跨文件体长一致性。left/down/up 是三次独立请求，本函数原先只约束"同一张图内四帧
    // 同尺寸"，三张之间从不对齐，实测侧向的身体长度会比正面短 20-25%
    // （Bloodied v01 侧向长边 302-324 对正面 400-405，直接把成品判据顶穿）。
    // 后处理的共用缩放系数按最大帧标定，所以偏小的方向会在实机里显得转身就缩水。
    // 参考图是每次方向请求都会带上的 I2I 参考，所以这条有可锚定的对象。
    'IMPORTANT SIZE CONSISTENCY: draw the character at the same overall body length as in the',
    'supplied reference image, measured from the top of the head to the feet along the body.',
    'Turning to face a different direction must not make the body shorter or smaller;',
    'a side view has the same body length as a front view, it is only oriented differently.',
    'Do not draw grid lines, panel borders, numbers or captions between the four frames;',
    'the gaps between frames must be the same flat magenta background.',
  ].join(' ');
}

/** 每个产物的构图指令；identity 由降级阶梯注入，角色专属措辞由 spec 注入。 */
function buildRequests(spec) {
  const GRID = gridFor(spec);
  const NEGATIVE = negativeFor(spec);
  return [
    {
      // 四视图转身参考，与 Walker 的 Walker_direction_reference.png 同性质。
      key: `${spec.candidateSlug}-direction-reference`,
      isReference: true,
      composition: (identity) => [
        STYLE,
        `Create one character turnaround reference sheet of ${identity}, drawn as a 2 by 2 grid of four views of the SAME character, all seen from a strict 90-degree top-down bird's-eye view.`,
        'Top-left view: the character travels toward the BOTTOM edge, moving at the viewer, face and both shoulders visible, bilaterally symmetric.',
        'Top-right view: the character travels toward the LEFT edge, a pure side profile from overhead, head pointing at the left edge, only one arm and one leg on the near side, distinctly asymmetric.',
        'Bottom-left view: the character travels toward the RIGHT edge, a pure side profile from overhead, head pointing at the right edge, the exact mirror of the top-right view.',
        `Bottom-right view: the character travels toward the TOP edge, moving away from the viewer, only ${spec.backView} visible, no face.`,
        'The four views must be the same character at the same size with the same clothing and palette.',
        'Do not draw grid lines, panel borders, labels, arrows or captions; the gaps between views must be the same flat magenta background.',
        FRAMING,
        NEGATIVE,
      ].join(' '),
    },
    {
      key: `${spec.candidateSlug}-left-4`,
      composition: (identity) => [
        STYLE,
        `Create a 2 by 2 grid of exactly four animation frames showing ${identity}.`,
        'ORIENTATION, this is the most important requirement: seen from directly above, the character travels toward the LEFT edge of the frame.',
        'This is a pure side profile from overhead: the head points at the left edge, the shoulders form a line running left to right, only ONE arm and ONE leg are clearly on the near side of the body while the far arm and far leg are partly hidden behind the torso.',
        'The body is distinctly asymmetric left-to-right. Do not draw the character standing upright facing the viewer, and do not show both shoulders symmetrically.',
        // 侧向是最容易画错的一张：体型越圆，模型越容易退回正面。
        // sideEmphasis 让单个感染体补强这一条，不必改共用骨架。
        ...(spec.sideEmphasis ? [spec.sideEmphasis] : []),
        GRID,
        FRAMING,
        NEGATIVE,
      ].join(' '),
    },
    {
      key: `${spec.candidateSlug}-down-4`,
      composition: (identity) => [
        STYLE,
        `Create a 2 by 2 grid of exactly four animation frames showing ${identity}.`,
        'ORIENTATION, this is the most important requirement: seen from directly above, the character travels toward the BOTTOM edge of the frame, moving at the viewer.',
        `Both shoulders are visible and symmetric, ${frontViewOf(spec)}, both arms are visible on either side of the torso, and both feet point toward the bottom edge.`,
        'The pose is close to bilaterally symmetric about a vertical line. Do not draw a side profile.',
        GRID,
        FRAMING,
        NEGATIVE,
      ].join(' '),
    },
    {
      key: `${spec.candidateSlug}-up-4`,
      composition: (identity) => [
        STYLE,
        `Create a 2 by 2 grid of exactly four animation frames showing ${identity}.`,
        'ORIENTATION, this is the most important requirement: seen from directly above, the character travels toward the TOP edge of the frame, moving away from the viewer.',
        `Only ${spec.backView} are visible. NO face, NO eyes, NO mouth in any frame. Both shoulders are visible and symmetric, both arms are visible on either side of the torso, and the heels are toward the bottom edge.`,
        'The pose is close to bilaterally symmetric about a vertical line. Do not draw a side profile.',
        GRID,
        FRAMING,
        NEGATIVE,
      ].join(' '),
    },
    {
      key: `${spec.candidateSlug}-portrait`,
      composition: (identity) => [
        STYLE,
        `Create one single full-body dossier portrait of ${identity}, facing the viewer, ${spec.portraitPose}.`,
        'One single character only, a static reading pose for an encyclopedia entry, not an animation frame and not a grid of frames.',
        'Match the identity, palette, clothing, anatomy and pixel rendering of the supplied reference image exactly.',
        FRAMING,
        NEGATIVE,
      ].join(' '),
    },
  ];
}

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
async function generateWithLadder(request, references, spec, shared) {
  for (let tier = 0; tier < spec.identityLadder.length; tier += 1) {
    const prompt = request.composition(spec.identityLadder[tier]);
    for (let attempt = 1; attempt <= shared.attemptsPerWording; attempt += 1) {
      try {
        const result = await requestImage(prompt, references);
        return { bytes: await downloadResult(result), tier };
      } catch (error) {
        console.log(`    tier${tier} try${attempt} 失败: ${error.code ?? 'unknown'} ${error.message}`);
        if (attempt < shared.attemptsPerWording) await sleep(shared.retryDelayMs);
      }
    }
  }
  throw new Error(`${request.key}: 所有措辞阶梯均被上游拒绝`);
}

function parseArgs(argv) {
  const positional = [];
  let version = null;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--version') {
      version = argv[index + 1];
      index += 1;
    } else {
      positional.push(argv[index]);
    }
  }
  return { id: positional[0], version };
}

async function main() {
  const { id, version: versionFlag } = parseArgs(process.argv.slice(2));
  const specs = JSON.parse(await readFile(SPEC_PATH, 'utf8'));
  if (!id || !specs.zombies[id]) {
    const known = Object.keys(specs.zombies).join(', ');
    throw new Error(`用法: node scripts/generate_zombie_assets.mjs <id> [--version vNN]\n已登记的 id: ${known}`);
  }
  const spec = specs.zombies[id];
  const version = versionFlag ?? process.env.ZOMBIE_ASSET_VERSION ?? 'v01';
  console.log(`目标: ${spec.displayName}（提示词 ZOMBIE_PROMPTS.md ${spec.promptSection}），版本 ${version}`);

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

  for (const request of buildRequests(spec)) {
    const outputPath = resolve(TEMP_DIR, `${request.key}-${version}.png`);
    if (await exists(outputPath)) {
      // 不覆盖已有候选：重跑时只补齐缺失项，避免重复消耗生成额度。
      console.log(`跳过 ${basename(outputPath)}（已存在）`);
      if (request.isReference) identityReference = await fileToDataUrl(outputPath);
      summary.push({ key: request.key, tier: 'skipped', bytes: 0 });
      continue;
    }

    console.log(`生成 ${request.key} ...`);
    const references = identityReference ? [identityReference] : [];
    const { bytes, tier } = await generateWithLadder(request, references, spec, specs.shared);
    await writeFile(outputPath, bytes);
    console.log(`  写入 ${basename(outputPath)} (${bytes.length} 字节, 措辞阶梯 ${tier})`);
    summary.push({ key: request.key, tier, bytes: bytes.length });

    if (request.isReference) identityReference = await fileToDataUrl(outputPath);
  }

  console.log('\n--- 生成汇总 ---');
  for (const item of summary) {
    console.log(`${item.key}: 阶梯=${item.tier} 字节=${item.bytes}`);
  }
  console.log(`\n下一步: python scripts/inspect_zombie_candidates.py ${id} --version ${version}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
