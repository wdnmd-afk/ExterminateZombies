/**
 * 重型武器**侧视**图标生图脚本。
 *
 * 与 generate_character_assets.mjs 走同一条上游路径与同一套降级词表机制，但取向相反：
 * 角色脚本的绝大部分复杂度用来对抗「模型无视正俯视要求」这一失败模式（见该文件第 18 行），
 * 而侧视枪是上游训练分布里最密的构图之一，机位根本不需要争。省下来的约束预算全部
 * 花在**辨识度**上：每把武器的机制签名（加特林的枪管束、M249 的黄铜弹链、喷火器的
 * 燃料罐与点火焰）必须在 132px 宽的画幅里还能看出来。
 *
 * 为什么要重出这三张：它们原先由 process_heavy_weapon_assets.ps1 用 GDI+ 图元现画，
 * 与另外八张裁自真实像素美术素材包的图摆在同一个 HUD 槽位里差距刺眼。
 * 详见 scripts/weapon_side_specs.json 的文件头 _note。
 *
 * 三个必须处理的上游现实（与角色脚本同源，此处只记与本脚本相关的）：
 * 1. 输出尺寸恒定，size 与 imageSize 参数均被忽略，不要依赖它们。降采样由后处理负责。
 * 2. 真实军械型号（GAU-8、M249）比角色更容易触发内容审核，所以每把备了四级措辞：
 *    指名型号 → 通用机械描述 → 工业器械描述 → 完全不提用途的几何描述。
 * 3. 生成是异步长任务，单张可能几十秒。三把顺序跑，不并发——上游 max_concurrent 是 2，
 *    且并发失败时无法分辨是额度问题还是措辞问题。
 *
 * 候选一律写入 TmpGenerate/ 且不覆盖已有文件；检视与后处理分别由
 * scripts/inspect_weapon_side_candidates.py 与 scripts/process_weapon_side_assets.py 负责。
 *
 * 用法：
 *   node scripts/generate_weapon_assets.mjs gatling
 *   node scripts/generate_weapon_assets.mjs all --version v02
 */

import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const TEMP_DIR = resolve(ROOT, 'TmpGenerate');
const SPEC_PATH = resolve(ROOT, 'scripts', 'weapon_side_specs.json');
const API_URL = process.env.WEAPON_IMAGE_API_URL ?? 'http://127.0.0.1:8787/api/images/generate';
const HEALTH_URL = process.env.WEAPON_IMAGE_API_HEALTH_URL ?? 'http://127.0.0.1:8787/api/health';

/**
 * 画风段。与角色管线的图 B 专用段同源，但去掉了人物专属措辞、加上金属材质要求。
 *
 * 保留「crisp at source resolution」：最终显示只有约 132px 宽，但这是显示端的像素预算
 * 问题，不应倒推成源图也要粗糙。缩小由后处理的 LANCZOS 降采样负责。
 *
 * 「readable at icon size」这一句是本脚本最重要的画风约束：这三张图的主要使用位置是
 * HUD 军械槽（约 46x26）与战前整备（约 56x27），比武器库预览小一个数量级。
 */
const STYLE = [
  'High-resolution detailed pixel art game asset, detailed 2D game weapon illustration,',
  'clean readable fine pixel clusters with deliberate dithering, limited but rich color palette,',
  'crisp hand-placed shading, convincing metal material rendering with distinct specular',
  'highlights along upper edges and deep shadow along lower edges,',
  'strong value separation between adjacent parts so every component reads as its own volume,',
  'dark gritty post-apocalyptic survival game art style, professional game asset quality,',
  'sharp silhouette readability that survives being scaled down to a small inventory icon,',
  'crisp at source resolution and suitable for clean downsampling.',
].join(' ');

/**
 * 机位与朝向段。
 *
 * 「flat orthographic side elevation」而不是「side view」：后者常被理解成带一点透视的
 * 四分之三视角，画出来的枪身有梯形收分，与另外八张正侧视素材摆在一起会看出机位不齐。
 *
 * 朝右是硬要求。运行时不翻转这套贴图（HUDScene / PreparationScene / Pickup 都是直接
 * setTexture 后等比缩放），画反了就是画反了。后处理侧另有 facingBias 判据兜住这一条。
 */
const ORIENTATION = [
  'CAMERA: a flat orthographic side elevation of the weapon, viewed from exactly 90 degrees',
  'to its long axis, with no perspective convergence and no three-quarter rotation.',
  'The weapon lies horizontally across the canvas with its muzzle pointing at the RIGHT edge',
  'and its stock or rear end at the LEFT edge. The long axis is exactly horizontal, not tilted.',
  'One single weapon only, shown as an isolated inventory item.',
].join(' ');

/**
 * 键控底与画幅约束。
 *
 * 主体占比给 82-92%：比角色管线的 70-84% 高，因为武器是细长物体，画幅是正方形，
 * 按宽度填到 82% 以上时上下自然剩下大片留白，alpha_bbox 找边界不成问题；
 * 而占比再低会让降采样到 132px 后细节糊掉（这三张图的存在理由就是细节）。
 */
const FRAMING = [
  'The weapon is centered in the square canvas and completely inside the frame,',
  'spanning 82 to 92 percent of the canvas width, with a clearly visible margin of flat',
  'magenta background on all four sides so no part of the weapon touches a canvas edge.',
  'Flat solid pure magenta #FF00FF background covering every pixel around the weapon,',
  'no gradient, no ground plane, no cast shadow, no environment, no table, no text,',
  'no border, no logo, no watermark, no measurement callouts.',
  'Do not use magenta, pink or violet anywhere on the weapon itself.',
].join(' ');

/** 共用负面词表。武器专属追加项在 spec.extraNegative。 */
const BASE_NEGATIVE = [
  'multiple weapons', 'weapon rack', 'weapon collection', 'exploded parts diagram',
  'ammunition scattered around', 'accessories laid out', 'magazines beside the weapon',
  'three-quarter view', 'isometric view', 'front view', 'top-down view', 'tilted at an angle',
  'muzzle pointing left', 'muzzle pointing up', 'muzzle pointing down',
  'perspective distortion', 'foreshortening', 'vanishing point',
  'ground shadow', 'cast shadow', 'reflection on a surface', 'environment', 'rubble', 'crate',
  'text', 'letters', 'numbers', 'labels', 'logo', 'watermark', 'signature', 'border', 'frame',
  'UI', 'HUD', 'inventory slot background',
  'low resolution', 'blurry', 'soft focus', 'motion blur', 'depth of field',
  'smooth gradient', 'airbrushed shading', 'painterly rendering', 'photorealistic 3D render',
  'oversized pixel blocks', 'nearest-neighbor enlarged source',
  'real military insignia', 'national flags', 'brand logos', 'serial numbers',
  'cartoon outline', 'cel shaded', 'glossy plastic toy', 'nerf toy', 'sci-fi energy weapon',
  'glowing energy core', 'neon accents',
];

function negativeFor(spec) {
  const dropped = new Set(spec.dropBaseNegative ?? []);
  const base = BASE_NEGATIVE.filter((term) => !dropped.has(term));
  return `Avoid ${[...(spec.extraNegative ?? []), ...base].join(', ')}.`;
}

/**
 * 两张产物：身份参考图 + 图标图。
 *
 * 与角色管线同构，且理由相同：参考图先把身份与配色钉死，图标图带着它做 I2I。
 * 单独生成图标图时，同一把武器两次的配色与部件构成会明显漂移——这三张要和另外八张
 * 摆在同一个 HUD 里，把「同一把枪」画成两个样子比画得糙更糟。
 *
 * 参考图不带 FRAMING 的严格占比要求：它只用来锚定身份，构图差一点无所谓，
 * 但必须带键控底，否则它作为 I2I 参考会把白底或环境一起传染给图标图。
 */
function buildRequests(spec) {
  const NEGATIVE = negativeFor(spec);
  const SILHOUETTE = (spec.silhouette ?? []).join(' ');
  return [
    {
      key: `${spec.candidateSlug}-identity-reference`,
      isReference: true,
      composition: (identity) => [
        STYLE,
        `Create one single reference illustration of ${identity}.`,
        ORIENTATION,
        SILHOUETTE,
        'Draw it as a clean readable reference with every component clearly separated.',
        FRAMING,
        NEGATIVE,
      ].join(' '),
    },
    {
      key: `${spec.candidateSlug}-icon`,
      composition: (identity) => [
        STYLE,
        `Create one single game inventory icon of ${identity}.`,
        ORIENTATION,
        SILHOUETTE,
        'Match the identity, palette, materials, component layout and pixel rendering of the',
        'supplied reference image exactly, and keep the same camera angle and the same',
        'left-to-right orientation as the reference image.',
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
  const buffer = await readFile(filePath);
  return `data:image/png;base64,${buffer.toString('base64')}`;
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

async function generateWeapon(weaponId, spec, shared, version) {
  console.log(`\n=== ${spec.displayName} (${weaponId}) 版本 ${version} ===`);
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
    const { bytes, tier } = await generateWithLadder(request, references, spec, shared);
    await writeFile(outputPath, bytes);
    console.log(`  写入 ${basename(outputPath)} (${bytes.length} 字节, 措辞阶梯 ${tier})`);
    summary.push({ key: request.key, tier, bytes: bytes.length });

    if (request.isReference) identityReference = await fileToDataUrl(outputPath);
  }
  return summary;
}

async function main() {
  const { id, version: versionFlag } = parseArgs(process.argv.slice(2));
  const specs = JSON.parse(await readFile(SPEC_PATH, 'utf8'));
  const known = Object.keys(specs.weapons);
  if (!id || (id !== 'all' && !specs.weapons[id])) {
    throw new Error(
      `用法: node scripts/generate_weapon_assets.mjs <id|all> [--version vNN]\n`
      + `已登记的 id: ${known.join(', ')}`,
    );
  }
  const targets = id === 'all' ? known : [id];
  const version = versionFlag ?? process.env.WEAPON_ASSET_VERSION ?? 'v01';

  await mkdir(TEMP_DIR, { recursive: true });

  const health = await fetch(HEALTH_URL).catch(() => null);
  const healthPayload = health ? await health.json().catch(() => null) : null;
  if (!health?.ok || healthPayload?.status !== 'ok') {
    throw new Error(
      `image API 健康检查失败，请先运行 npm run image-api。返回: ${JSON.stringify(healthPayload)}`,
    );
  }
  console.log(`image-api ok: model=${healthPayload.model}`);

  // 顺序跑不并发：上游 max_concurrent 是 2，并发失败时无法分辨额度问题与措辞问题。
  const summary = [];
  const failed = [];
  for (const weaponId of targets) {
    try {
      const items = await generateWeapon(weaponId, specs.weapons[weaponId], specs.shared, version);
      summary.push(...items.map((item) => ({ weaponId, ...item })));
    } catch (error) {
      // 一把失败不能带走另外两把：额度与审核都是按请求判的，后面的可能照样能过。
      console.error(`  ${weaponId} 失败: ${error instanceof Error ? error.message : error}`);
      failed.push(weaponId);
    }
  }

  console.log('\n--- 生成汇总 ---');
  for (const item of summary) {
    console.log(`${item.weaponId} / ${item.key}: 阶梯=${item.tier} 字节=${item.bytes}`);
  }
  if (failed.length > 0) {
    console.log(`失败: ${failed.join(', ')}`);
    process.exitCode = 1;
  }
  console.log(
    `\n下一步: .venv/Scripts/python.exe scripts/inspect_weapon_side_candidates.py`
    + ` ${targets.join(' ')} --version ${version}`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
