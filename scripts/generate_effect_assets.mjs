/**
 * 武器攻击特效生图脚本。
 *
 * 与 generate_weapon_assets.mjs 共用同一条上游路径、同一套降级词表与"不覆盖已有候选"
 * 的约定，但产物形态不同：武器图标是一张静态图，特效是 2x2 网格的四帧动画，
 * 因此网格约束（每格留边、禁止分隔线、四帧同参考系）直接沿用 generate_zombie_assets.mjs
 * 里已被八类感染体验收过的措辞——那些约束不是文风，是踩过的坑：
 *   - 不写"每格"留边，模型会按整图理解占比，把单格主体画到贴边（Drifter v01 边距 0px）；
 *   - 不显式禁止分隔线，模型会画出画格边框，切帧后每帧带一条黑边。
 *
 * 与感染体脚本的两处刻意差异：
 * 1. **不做身份参考图 I2I**。感染体必须靠参考图钉住"同一个角色"，特效没有身份可漂移，
 *    跨图一致性只靠提示词里的十六进制配色（与 src/config/weapons.ts 的武器色同源）。
 *    省掉参考图让 8 种特效只需 8 次生成而不是 16 次。
 * 2. **火焰与烟必须分成两张图**。运行时枪焰走 ADD 混合（火焰自发光，叠加才不会在深色
 *    地面上糊成暗斑），而 ADD 会把灰烟也变成提亮，所以烟必须单独一张、走 NORMAL 混合
 *    并在运行时染色。因此所有 flash 类特效的 extraNegative 都显式排除 smoke。
 *
 * 三个上游现实（与另两条管线同源）：
 * 1. 输出尺寸恒定 1254x1254，size / imageSize 参数均被忽略。2x2 单格 627x627，
 *    降采样由后处理负责，spec 的 frame 任一边都不得超过 627。
 * 2. 生成是异步长任务，单张可能几十秒。顺序跑不并发——上游 max_concurrent 是 2，
 *    并发失败时无法分辨额度问题与措辞问题。
 * 3. 特效不含人形主体，几乎不触发内容审核；identityLadder 主要用来兜住"军械型号措辞"
 *    这一类偶发拒绝，阶梯层数比感染体少。
 *
 * 候选一律写入 TmpGenerate/ 且不覆盖已有文件；检视与后处理由
 * scripts/process_effect_assets.py 承担（--inspect 只打印判据不落地）。
 *
 * 用法：
 *   node scripts/generate_effect_assets.mjs flame_jet
 *   node scripts/generate_effect_assets.mjs all --version v01
 */

import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const TEMP_DIR = resolve(ROOT, 'TmpGenerate');
const SPEC_PATH = resolve(ROOT, 'scripts', 'effect_asset_specs.json');
const API_URL = process.env.EFFECT_IMAGE_API_URL ?? 'http://127.0.0.1:8787/api/images/generate';
const HEALTH_URL = process.env.EFFECT_IMAGE_API_HEALTH_URL ?? 'http://127.0.0.1:8787/api/health';

/**
 * 画风段。
 *
 * 「hard-edged ... no soft glow」是本段唯一不可删的一句：上游对 "VFX" 的默认理解是
 * 3D 渲染风的柔光爆炸，而本项目全部素材按 ART_BIBLE 第 2 节走最近邻采样，
 * 柔光源图降采样后只会变成一团糊，在深色战场上连轮廓都读不出来。
 *
 * 其余修饰（"professional game asset quality" 之类）已全部删掉：它们对产物没有可观测影响，
 * 但每一句都在推高提示词长度，而长度会直接把请求推过上游超时（见 spec 文件头的实测记录）。
 */
const STYLE = [
  'Pixel art VFX sprite sheet for a dark top-down shooter.',
  'Hard-edged pixel clusters and banded gradients, no soft glow, no blur, no 3D render.',
].join(' ');

/**
 * 机位段。三类特效的机位要求不同，但共同点是「正俯视」与「不画产生特效的物体」。
 *
 * anchored（枪口焰、喷口火舌）朝右是硬要求：运行时按瞄准角 setRotation，
 * 基准方向是 0 弧度即朝右，画反了整条帧条都得镜像重跑。
 *
 * 「no gun, no barrel」必须写在机位段而不是只放负面词表里：模型对 "muzzle flash" 的
 * 默认理解包含枪管，负面词表的权重不足以单独压掉一个提示词里点名的主体。
 */
const ORIENTATION = {
  anchored: [
    'Seen from directly above. Draw only the effect: no gun, no barrel, no hand, no character, no ground.',
    'It erupts from a point near the LEFT edge of its own frame, on that frame\'s horizontal centre line,',
    'and reaches toward the RIGHT edge. Its long axis is exactly horizontal, not tilted.',
  ].join(' '),
  traveling: [
    'Seen from directly above. Draw only the effect: no gun, no character, no ground.',
    'It is centred in its own frame and travels toward the RIGHT edge, so its long axis is exactly horizontal.',
  ].join(' '),
  ground: [
    'Seen from directly above. Draw only the effect: no gun, no character, no props, no crater, no ground texture.',
    'It is centred in its own frame and radiates outward from that centre.',
  ].join(' '),
};

/**
 * 2x2 网格约束。
 *
 * 每格留边上限按 cycle 分档，理由与 generate_zombie_assets.mjs 的 bossGridFor 完全一致：
 * 循环闪烁（loop）四帧外接框相近，84% 安全；递进动作（progression）里"全绽"那一帧的
 * 外接框远大于"余烬"那一帧，模型会按最小的那帧定尺寸、最大的那帧顶穿画格，
 * 因此压到 74% 并显式要求"按幅度最大的那一帧定尺寸"。
 *
 * 后处理对四帧取**共用外接框**（不是逐帧裁剪），所以"四帧同参考系"是硬要求：
 * 逐帧裁剪会让枪口焰的根部在四帧间跳动，实机表现为枪焰在枪口前后抖动。
 */
function gridFor(spec) {
  const looping = spec.cycle !== 'progression';
  return [
    looping
      ? `The four frames are one looping cycle in which ${spec.motion}.`
      : `The four frames are a progression read left-to-right then top-to-bottom: ${spec.motion}.`,
    'All four frames share the same scale, the same palette and the same position for the origin of the',
    'effect inside their own frame, so they can be played back without the effect jumping.',
    looping
      ? 'Within its own frame the effect fills at most 84 percent of that frame and never touches a frame edge.'
      : [
          'Size the effect for the LARGEST frame: within its own frame the effect fills at most 74 percent',
          'of that frame, and in every frame no petal, ember, wisp or debris chunk touches a frame edge.',
        ].join(' '),
  ].join(' ');
}

/**
 * 键控底约束。
 *
 * 「every pixel around the effect」比武器管线的措辞更强：特效天然带雾状边缘，
 * 模型很容易在主体周围铺一层半透明烟霞当氛围，那层东西的 chroma 落在洋红判据的软边区间，
 * 键控后会变成一圈脏边。所以这里显式排除 haze / glow wash。
 */
const FRAMING = [
  'Background: flat solid pure magenta #FF00FF on every pixel around the effect, including the gaps',
  'between frames. No gradient, no haze, no glow wash, no shadow, no grid lines, no borders, no captions.',
  'No magenta, pink or purple anywhere inside the effect.',
].join(' ');

/**
 * 共用负面词表。特效专属追加项在 spec.extraNegative。
 *
 * 只留高价值项：实测长措辞会把请求推过上游 150s 超时，而 60 项的长词表里大部分
 * （'octane render'、'ray tracing' 之类）与 STYLE 的正向约束重复。
 */
const BASE_NEGATIVE = [
  'photorealistic 3D render', 'soft airbrushed glow', 'lens flare', 'motion blur', 'blurry',
  'three-quarter view', 'side view', 'horizon',
  'character', 'hand', 'weapon', 'building', 'floor tiles', 'grass',
  'text', 'numbers', 'logo', 'watermark', 'panel border', 'grid lines',
  'cartoon outline', 'thick black outline', 'more than four frames',
  'pink flames', 'purple flames', 'sci-fi energy effect',
];

function negativeFor(spec) {
  const dropped = new Set(spec.dropBaseNegative ?? []);
  const base = BASE_NEGATIVE.filter((term) => !dropped.has(term));
  return `Avoid ${[...(spec.extraNegative ?? []), ...base].join(', ')}.`;
}

/** 一种特效只有一张产物：2x2 四帧网格。 */
function buildRequest(spec) {
  const silhouette = (spec.silhouette ?? []).join(' ');
  return {
    key: `${spec.candidateSlug}-4`,
    composition: (identity) => [
      STYLE,
      `Create a 2 by 2 grid of exactly four animation frames of ${identity}.`,
      ORIENTATION[spec.orientation],
      silhouette,
      gridFor(spec),
      FRAMING,
      negativeFor(spec),
    ].join(' '),
  };
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

/** 单次生成请求。返回 URL 或内联字节；抛错时带上游错误码便于区分审核与网络问题。 */
async function requestImage(prompt) {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt, size: '1:1', n: 1, async: true }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload?.error?.message ?? `image API failed with HTTP ${response.status}`);
    error.code = payload?.error?.code ?? `http_${response.status}`;
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
async function generateWithLadder(request, spec, shared) {
  for (let tier = 0; tier < spec.identityLadder.length; tier += 1) {
    const prompt = request.composition(spec.identityLadder[tier]);
    for (let attempt = 1; attempt <= shared.attemptsPerWording; attempt += 1) {
      try {
        const result = await requestImage(prompt);
        return { bytes: await downloadResult(result), tier };
      } catch (error) {
        console.log(`    tier${tier} try${attempt} 失败: ${error.code ?? 'unknown'} ${error.message}`);
        // 超时几乎总是措辞过长而不是网络问题（实测见 effect_asset_specs.json 文件头），
        // 所以把长度打进失败行里：下一位读日志的人第一眼就能看到该缩措辞。
        if (error.code === 'upstream_timeout') {
          console.log(`      提示词长度 ${prompt.length} 字符；超时优先缩措辞，不要靠加重试次数`);
        }
        if (attempt < shared.attemptsPerWording) await sleep(shared.retryDelayMs);
      }
    }
  }
  throw new Error(`${request.key}: 所有措辞阶梯均被上游拒绝`);
}

function parseArgs(argv) {
  const positional = [];
  let version = null;
  let dryRun = false;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--version') {
      version = argv[index + 1];
      index += 1;
    } else if (argv[index] === '--dry-run') {
      dryRun = true;
    } else {
      positional.push(argv[index]);
    }
  }
  return { ids: positional, version, dryRun };
}

async function generateEffect(effectId, spec, shared, version) {
  console.log(`\n=== ${spec.displayName} (${effectId}) 版本 ${version} ===`);
  const request = buildRequest(spec);
  const outputPath = resolve(TEMP_DIR, `${request.key}-${version}.png`);
  if (await exists(outputPath)) {
    // 不覆盖已有候选：重跑时只补齐缺失项，避免重复消耗生成额度。
    console.log(`跳过 ${basename(outputPath)}（已存在）`);
    return { key: request.key, tier: 'skipped', bytes: 0 };
  }

  console.log(`生成 ${request.key}（提示词 ${request.composition(spec.identityLadder[0]).length} 字符）...`);
  const { bytes, tier } = await generateWithLadder(request, spec, shared);
  await writeFile(outputPath, bytes);
  console.log(`  写入 ${basename(outputPath)} (${bytes.length} 字节, 措辞阶梯 ${tier})`);
  return { key: request.key, tier, bytes: bytes.length };
}

async function main() {
  const { ids, version: versionFlag, dryRun } = parseArgs(process.argv.slice(2));
  const specs = JSON.parse(await readFile(SPEC_PATH, 'utf8'));
  const known = Object.keys(specs.effects);
  const unknown = ids.filter((id) => id !== 'all' && !specs.effects[id]);
  if (ids.length === 0 || unknown.length > 0) {
    throw new Error(
      `用法: node scripts/generate_effect_assets.mjs <id...|all> [--version vNN] [--dry-run]\n`
      + `已登记的 id: ${known.join(', ')}`,
    );
  }
  const targets = ids.includes('all') ? known : ids;
  const version = versionFlag ?? process.env.EFFECT_ASSET_VERSION ?? 'v01';

  // --dry-run 只组装并打印提示词，不发请求。存在理由是长度：上游超时按 150s 计，
  // 一次全量误发的最坏代价是 8 x 3 x 150s，而检查长度只要一秒。
  if (dryRun) {
    for (const effectId of targets) {
      const spec = specs.effects[effectId];
      const prompt = buildRequest(spec).composition(spec.identityLadder[0]);
      console.log(`\n=== ${effectId} (${prompt.length} 字符) ===\n${prompt}`);
    }
    return;
  }

  await mkdir(TEMP_DIR, { recursive: true });

  const health = await fetch(HEALTH_URL).catch(() => null);
  const healthPayload = health ? await health.json().catch(() => null) : null;
  if (!health?.ok || healthPayload?.status !== 'ok') {
    throw new Error(
      `image API 健康检查失败，请先运行 npm run image-api。返回: ${JSON.stringify(healthPayload)}`,
    );
  }
  console.log(`image-api ok: model=${healthPayload.model}`);

  const summary = [];
  const failed = [];
  for (const effectId of targets) {
    try {
      summary.push({ effectId, ...await generateEffect(effectId, specs.effects[effectId], specs.shared, version) });
    } catch (error) {
      // 一种特效失败不能带走其余的：额度与审核都是按请求判的，后面的可能照样能过。
      console.error(`  ${effectId} 失败: ${error instanceof Error ? error.message : error}`);
      failed.push(effectId);
    }
  }

  console.log('\n--- 生成汇总 ---');
  for (const item of summary) {
    console.log(`${item.effectId} / ${item.key}: 阶梯=${item.tier} 字节=${item.bytes}`);
  }
  if (failed.length > 0) {
    console.log(`失败: ${failed.join(', ')}`);
    process.exitCode = 1;
  }
  console.log(
    `\n下一步: .venv/Scripts/python.exe scripts/process_effect_assets.py`
    + ` ${targets.join(' ')} --version ${version} --inspect`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
