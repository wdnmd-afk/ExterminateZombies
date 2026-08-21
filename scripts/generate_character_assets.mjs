/**
 * 可玩角色关卡内实机精灵（图 B）生图脚本。
 *
 * 与 generate_zombie_assets.mjs 同一条路径与同一套上游约定，但产物形态取 Boss 那一路：
 * 单朝向朝右，四方向由运行时 sprite.setRotation 表达。必须如此的原因见
 * character_asset_specs.json 的 _note——Player.ts:108 按瞄准角连续旋转 360°，
 * 做方向表会与程序旋转冲突。
 *
 * 只生成两张：身份参考图 + 实机精灵。角色不需要动画帧条（当前实机是静态单图），
 * 也不需要图鉴立绘（战前档案立绘走图 A，已单独验收）。
 *
 * 角色专属内容全部在 scripts/character_asset_specs.json，本文件只负责构图骨架与上游交互。
 *
 * 三个必须处理的上游现实：
 * 1. 输出尺寸恒定，size 与 imageSize 参数均被忽略，不要依赖它们。
 * 2. 参考图必须作为 I2I 参考带上。感染体管线实测（generate_zombie_assets.mjs:14）
 *    用单个姿态当参考会持续强化同一朝向，是 Runner v04 "四行同朝向" 的根因之一。
 * 3. **模型会无视 "straight 90 degree bird's eye"**。2026-08-18 的守望者图就是这么
 *    画成斜视图的：提示词写了正俯视，出来能看到脸、腿和整只靴子。因此本脚本对机位
 *    采取正反双向约束——正面说"能看到什么"，负面说"不能看到什么"，而不是只声明角度。
 *    这也是为什么必须跑 inspect_character_candidates.py 而不能凭提示词相信结果。
 *
 * 候选一律写入 TmpGenerate/ 且不覆盖已有文件；采用与后处理由
 * scripts/process_character_assets.py 负责。
 *
 * 用法：
 *   node scripts/generate_character_assets.mjs watcher
 *   node scripts/generate_character_assets.mjs watcher --version v02
 */

import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { basename, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const TEMP_DIR = resolve(ROOT, 'TmpGenerate');
const SPEC_PATH = resolve(ROOT, 'scripts', 'character_asset_specs.json');
const API_URL = process.env.CHARACTER_IMAGE_API_URL ?? 'http://127.0.0.1:8787/api/images/generate';
const HEALTH_URL = process.env.CHARACTER_IMAGE_API_HEALTH_URL ?? 'http://127.0.0.1:8787/api/health';

/**
 * 画风段。与 CHARACTER_PORTRAIT_PROMPTS.md 3.1 的图 B 专用段同源。
 *
 * 刻意保留 "high-resolution / crisp at source resolution"：图 B 的最终显示只有约
 * 46px，但这是显示端的像素预算问题，不应倒推成源图也要粗糙（见该文档 3.7）。
 * 缩小由后处理的 LANCZOS 降采样负责。
 */
const STYLE = [
  'High-resolution detailed pixel art game sprite, detailed 2D game character illustration,',
  'clean readable fine pixel clusters with deliberate dithering, limited but rich color palette,',
  'crisp hand-placed shading, controlled material texture, strong value separation,',
  'dark gritty post-apocalyptic survival game art style, professional game asset quality,',
  'sharp silhouette readability, crisp at source resolution and suitable for clean',
  'downsampling to gameplay size.',
].join(' ');

/**
 * 键控底与画幅约束。
 *
 * 主体占比给 70-84% 而不是更高：后处理会按主体裁剪再归一化到 48px 画幅，
 * 留边是为了让 alpha_bbox 能干净地找到边界，也满足 validate_frame 的 3px 留边判据。
 */
const FRAMING = [
  'Body centered in the square canvas, the whole character completely inside the frame,',
  'subject filling 70 to 84 percent of the canvas, leaving a clearly visible margin of flat',
  'magenta background on all four sides so no part of the character touches a canvas edge.',
  'Flat solid pure magenta #FF00FF background covering every pixel around the subject,',
  'no gradient, no ground plane, no cast shadow, no environment, no text, no border,',
  'no logo, no watermark. Do not use magenta, pink or violet anywhere on the subject itself.',
].join(' ');

/**
 * 朝向与武器约束。技术依据见 CHARACTER_PORTRAIT_PROMPTS.md 3.3，改动会导致运行时错位。
 *
 * 1. 不画武器：8 把枪是独立贴图，绘制在人物下层（Player.ts:42 顺序为 阴影→武器→人物），
 *    靠人物的手和身体压住枪托与握把。
 * 2. 拳心在水平 80%、垂直 50%：从武器锚点反算（forwardOffset 12 逻辑像素、sideOffset 0）。
 * 3. 人物居中且上下对称：人物层 origin 为 0.5/0.5，旋转轴就是图像几何中心，
 *    重心偏离中心会让旋转时出现甩头。
 * 4. 不画地面阴影：Player.ts:37 已在人物下方画了椭圆阴影，再带一层会双重阴影。
 */
const ORIENTATION = [
  'The character faces exactly the RIGHT edge of the frame.',
  'Both empty hands are clasped together directly in front of the body in a two-handed grip',
  'stance holding nothing, with the clasped fists positioned at 80 percent of the canvas width',
  'and 50 percent of the canvas height.',
  'No weapon, no gun, no firearm of any kind anywhere in the image.',
  'The body is perfectly centered and vertically symmetric about the horizontal centre line.',
  'No ground shadow, no cast shadow.',
].join(' ');

/** 共用负面词表。角色专属追加项在 spec.extraNegative。 */
const BASE_NEGATIVE = [
  'weapon', 'gun', 'rifle', 'pistol', 'firearm', 'holding an object',
  'multiple characters', 'crowd', 'duplicate limbs', 'extra arms', 'extra legs',
  'malformed hands', 'extra fingers', 'cropped head', 'cropped hands',
  'body outside frame', 'side view', 'isometric view', 'visible horizon',
  'ground shadow', 'cast shadow', 'environment', 'rubble', 'buildings',
  'text', 'letters', 'logo', 'watermark', 'signature', 'border', 'frame', 'UI', 'HUD',
  'low resolution', 'blurry', 'soft focus', 'motion blur', 'depth of field',
  'smooth gradient', 'airbrushed shading', 'painterly rendering',
  'photorealistic 3D render', 'oversized pixel blocks', 'nearest-neighbor enlarged source',
  'real military insignia', 'national flags', 'brand logos', 'copyrighted characters',
  'chibi', 'cute', 'super-deformed', 'anime moe style', 'glossy plastic skin',
  'power armor', 'sci-fi mecha', 'exosuit', 'ninja', 'superhero spandex', 'cape',
];

function negativeFor(spec) {
  const dropped = new Set(spec.dropBaseNegative ?? []);
  const base = BASE_NEGATIVE.filter((term) => !dropped.has(term));
  return `Avoid ${[...(spec.extraNegative ?? []), ...base].join(', ')}.`;
}

/**
 * 机位段。本脚本最重要的一段，因为它针对的正是已经发生过的失败。
 *
 * 只声明 "90 degree top-down" 已被证明不够（2026-08-18 守望者图）。这里改成三重约束：
 *   a. 用相机物理位置描述，而不是抽象角度；
 *   b. 正面枚举"能看到什么"（头顶、肩顶、拳顶、被极度前缩的靴顶）；
 *   c. 负面枚举"不能看到什么"（脸、鼻、下巴、腿、靴侧）。
 * spec.topDownEmphasis 提供角色专属的 b/c 措辞，因为不同体型的可见特征不同。
 *
 * v02 追加体型约束。v01 的机位完全正确（检视四项全过），但模型把人物压成了一个球
 * ——主体宽高比 1.26，比高还宽，躯干和被前缩的腿全部消失。
 * 教训是"把相机搬到头顶"和"身体还有长度"是两件事，提示词和检视门都要分开说。
 */
function topDownFor(spec) {
  return [
    'ORIENTATION AND CAMERA, this is the single most important requirement:',
    'strict 90-degree top-down bird\'s-eye view.',
    ...(spec.topDownEmphasis ?? []),
    'This is a floor plan view of a person, not a portrait of a standing person,',
    'and not a view of a curled-up or compressed body.',
  ].join(' ');
}

/** 两张产物：身份参考图 + 实机精灵。 */
function buildRequests(spec) {
  const NEGATIVE = negativeFor(spec);
  const TOP_DOWN = topDownFor(spec);
  return [
    {
      // 身份锚点。与 Boss 的 identity-reference 同性质：单朝向，所以不需要四视图转身图。
      // 它同时也是机位锚点——参考图画对了，精灵图跟着对的概率显著更高。
      key: `${spec.candidateSlug}-identity-reference`,
      isReference: true,
      composition: (identity) => [
        STYLE,
        `Create one single top-down reference image of ${identity}.`,
        TOP_DOWN,
        ORIENTATION,
        'One single character only, the whole body fully inside the frame,',
        'drawn as a clean readable reference.',
        FRAMING,
        NEGATIVE,
      ].join(' '),
    },
    {
      key: `${spec.candidateSlug}-sprite`,
      composition: (identity) => [
        STYLE,
        `Create one single gameplay sprite of ${identity}.`,
        TOP_DOWN,
        ORIENTATION,
        'One single character only, a single static pose, not a grid of frames',
        'and not an animation sheet.',
        'Match the identity, palette, clothing, anatomy and pixel rendering of the supplied',
        'reference image exactly, and keep the same camera angle as the reference image.',
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
  if (!id || !specs.characters[id]) {
    const known = Object.keys(specs.characters).join(', ');
    throw new Error(`用法: node scripts/generate_character_assets.mjs <id> [--version vNN]\n已登记的 id: ${known}`);
  }
  const spec = specs.characters[id];
  const version = versionFlag ?? process.env.CHARACTER_ASSET_VERSION ?? 'v01';
  console.log(`目标: ${spec.displayName}（提示词 CHARACTER_PORTRAIT_PROMPTS.md ${spec.promptSection}），版本 ${version}`);

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
  console.log(`\n下一步: python scripts/inspect_character_candidates.py ${id} --version ${version}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
