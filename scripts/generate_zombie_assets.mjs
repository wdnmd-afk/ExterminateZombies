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

/**
 * 负面词表。
 *
 * dropBaseNegative 让单个感染体摘掉 BASE_NEGATIVE 里的条目，理由与 frontView 钩子同源：
 * 有些通用否定对特定角色是自相矛盾的指令。已知两例——
 * oddity 的识别特征是"一臂分叉成两条不完整前臂"，撞 extra arms / duplicate limbs /
 * malformed hands；四足 Boss 本身就有四条腿，撞 extra legs。
 * 摘掉后必须在 extraNegative 里用精确措辞把真正要压的跑偏补回去
 * （"多于四条腿"、"随机散布的肢体"），否则是放开而不是改写。
 */
function negativeFor(spec) {
  const dropped = new Set(spec.dropBaseNegative ?? []);
  const base = BASE_NEGATIVE.filter((term) => !dropped.has(term));
  return `Avoid ${[...(spec.extraNegative ?? []), ...base].join(', ')}.`;
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

/**
 * 正/背面请求里的肢体分布。
 *
 * 默认值就是原先硬编码在 down / up 请求里的那两句，所以已归档的八类感染体提示词逐字不变。
 * 存在这个钩子的原因：默认措辞描述的是直立行走的肢体分布（双臂在躯干两侧、双脚朝下缘），
 * 对四肢着地的角色是错的，会把爬行姿态拉回直立。crawler、stalker 与四足 Boss 都要覆盖。
 */
function limbLayoutOf(spec, view) {
  const fallback = view === 'front'
    ? 'both arms are visible on either side of the torso, and both feet point toward the bottom edge'
    : 'both arms are visible on either side of the torso, and the heels are toward the bottom edge';
  return spec.limbLayout?.[view] ?? fallback;
}

/**
 * 正/背面请求里的「肢体分布 + 左右对称性」两句。
 *
 * 不登记 facingSymmetry 时，返回值与原先硬编码的措辞逐字节相同，
 * 所以已归档的八类感染体提示词不变（这是本函数刻意分成两个分支而不是拼接的原因）。
 *
 * 登记 facingSymmetry 的感染体走覆盖分支。存在这个钩子的原因与 frontView 同源：
 * 默认措辞要求「双肩对称、姿态沿竖轴近似对称」，而 oddity（一侧肩巨大、一臂分叉）与
 * tank_boss / matriarch_boss（§6.15/§6.18 原文明写 asymmetrical silhouette）的识别特征
 * 恰恰是刻意不对称，照默认写会把畸变抹平。
 * 覆盖措辞必须自己保留「竖轴居中、是正/背面而非侧面」，否则会退化成侧面；
 * 同时配套放宽 spec.symmetryFacingMin，见 inspect_zombie_candidates.py 的同名判据。
 */
function facingClausesOf(spec, view) {
  const detail = view === 'front'
    ? `${frontViewOf(spec)}, ${limbLayoutOf(spec, 'front')}`
    : limbLayoutOf(spec, 'back');
  if (spec.facingSymmetry) {
    return [`In every frame ${detail}.`, `${spec.facingSymmetry} Do not draw a side profile.`];
  }
  return [
    `Both shoulders are visible and symmetric, ${detail}.`,
    'The pose is close to bilaterally symmetric about a vertical line. Do not draw a side profile.',
  ];
}

/**
 * 每格留边与"一格一个角色"。普通感染体与 Boss 共用。
 *
 * 每格留边必须单独说：FRAMING 的 "占画布 70-84%" 对 2×2 网格是歧义的（整图还是每格），
 * 模型会按整图理解，把单格主体画到 94% 而四边贴死。瘦长体型的背面视图是最高的一张，
 * 最先踩中（Drifter v01 的 up 四帧边距全为 0px，被检视门控拦下）。
 */
const GRID_MARGIN = [
  'Within its own frame each character occupies at most 84 percent of that frame\'s height and width,',
  'leaving a clearly visible margin of flat magenta background on all four sides of every frame,',
  'so no head, hand, foot or hem ever touches a frame edge.',
  'Each frame contains exactly one character.',
];

/** 禁止分隔线。普通感染体与 Boss 共用。 */
const GRID_NO_LINES = [
  'Do not draw grid lines, panel borders, numbers or captions between the four frames;',
  'the gaps between frames must be the same flat magenta background.',
];

/** 四帧网格的共用约束，避免各方向请求里重复描述。 */
function gridFor(spec) {
  return [
    `The four frames form ${spec.gait},`,
    'but all four frames keep the same orientation, same identity, same clothing, same palette, same size',
    'and the same distance from the bottom of their own frame.',
    ...GRID_MARGIN,
    // 跨文件体长一致性。left/down/up 是三次独立请求，本函数原先只约束"同一张图内四帧
    // 同尺寸"，三张之间从不对齐，实测侧向的身体长度会比正面短 20-25%
    // （Bloodied v01 侧向长边 302-324 对正面 400-405，直接把成品判据顶穿）。
    // 后处理的共用缩放系数按最大帧标定，所以偏小的方向会在实机里显得转身就缩水。
    // 参考图是每次方向请求都会带上的 I2I 参考，所以这条有可锚定的对象。
    'IMPORTANT SIZE CONSISTENCY: draw the character at the same overall body length as in the',
    'supplied reference image, measured from the top of the head to the feet along the body.',
    'Turning to face a different direction must not make the body shorter or smaller;',
    'a side view has the same body length as a front view, it is only oriented differently.',
    ...GRID_NO_LINES,
  ].join(' ');
}

/**
 * Boss 的 2×2 网格约束。
 *
 * 与 gridFor 的差别有两处，都源于 Boss 走单朝向 + 运行时旋转（理由见
 * zombie_asset_specs.json 的 tank_boss._bossNote）：
 *
 * 1. 四帧朝向恒定朝右，不存在"转向不能变小"的问题，所以体长一致性只锚定参考图。
 * 2. 攻击与死亡不是循环步态而是递进动作，所以动作描述由调用方传入，
 *    不能像 gridFor 那样固定写 `The four frames form <gait>`。
 */
function bossGridFor(spec, { progression }) {
  return [
    progression
      ? 'The four frames are a progression read in order left-to-right then top-to-bottom, not a loop.'
      : 'The four frames are one continuous looping animation cycle read in order left-to-right then top-to-bottom.',
    'All four frames keep the same identity, same anatomy, same palette, same size and the same',
    'orientation: in every frame the character faces exactly the RIGHT edge of its own frame.',
    // 递进动作的留边必须比循环步态更严。GRID_MARGIN 的 84% 是按"四帧姿态相近"标定的，
    // 而攻击（抬起前肢再砸下）和死亡（整个摊开塌平）会让某一帧的外接框远大于其余三帧，
    // 模型按 84% 画最小的那帧、最大的那帧就顶穿画格。
    // 2026-08-21 实测 bomber_boss v01 的 attack 与两条 death 全部出现 0px 贴边帧，
    // hunter_boss v01 的 attack 为 2px。因此对递进动作把上限压到 74%，
    // 并明确"按动作幅度最大的那一帧定尺寸"。
    ...(progression
      ? [
          'IMPORTANT FRAMING FOR THIS ACTION: the pose changes a lot between these four frames,',
          'so size the character for the FRAME WITH THE LARGEST EXTENT: within its own frame each',
          'character occupies at most 74 percent of that frame\'s height and width, leaving a wide',
          'margin of flat magenta background on all four sides of every frame. Even the most',
          'extended or most sprawled frame must stay fully inside its own frame with visible margin;',
          'no limb, claw, tail, plate or hem may touch a frame edge in any frame.',
          'Each frame contains exactly one character with no detached pieces, no broken-off chunks,',
          'no flying debris and no separate blobs anywhere in the frame.',
        ]
      : GRID_MARGIN),
    'IMPORTANT SIZE CONSISTENCY: draw the character at the same overall body length as in the',
    'supplied reference image, measured from end to end along the long axis of the body.',
    'The pose changing between frames must not make the body shorter, smaller or larger.',
    ...GRID_NO_LINES,
  ].join(' ');
}

/**
 * Boss 的产物集：身份参考、移动 2×2、攻击 2×2、死亡 2×2 两张、图鉴立绘，共 6 张。
 *
 * 与普通感染体的差别是形态而非风格：Boss 只画一个朝向（朝右，ZOMBIE_PROMPTS.md §1
 * 的基准方向），四方向由运行时 sprite.setRotation 表达。必须如此的实测理由见
 * zombie_asset_specs.json 的 tank_boss._bossNote——动作素材是单朝向帧条，
 * 改成方向表会让攻击/死亡动画锁死在单一朝向。
 */
function buildBossRequests(spec) {
  const NEGATIVE = negativeFor(spec);
  const SIDE = spec.sideProfile;
  const ORIENT = [
    'ORIENTATION, this is the most important requirement: seen from directly above, the character',
    'faces exactly the RIGHT edge of the frame.',
    // spec 里的 sideProfile 按句中措辞书写（小写开头），这里作为独立句子接在后面，
    // 所以补首字母大写，避免出现 "... RIGHT edge of the frame. the narrow head ..."。
    SIDE ? `${SIDE[0].toUpperCase()}${SIDE.slice(1)}.` : '',
  ].filter(Boolean).join(' ');

  const actionRequest = (key, description, progression) => ({
    key: `${spec.candidateSlug}-${key}`,
    composition: (identity) => [
      STYLE,
      `Create a 2 by 2 grid of exactly four animation frames showing ${identity}.`,
      ORIENT,
      `The four frames show ${description}.`,
      bossGridFor(spec, { progression }),
      'Match the identity, palette, anatomy and pixel rendering of the supplied reference image exactly.',
      FRAMING,
      NEGATIVE,
    ].join(' '),
  });

  return [
    {
      // 身份锚点。Boss 只有一个朝向，所以不需要四视图转身图，一张朝右全身图即可。
      key: `${spec.candidateSlug}-identity-reference`,
      isReference: true,
      composition: (identity) => [
        STYLE,
        `Create one single full-body reference image of ${identity}.`,
        ORIENT,
        'One single character only, the whole body fully inside the frame, drawn as a clean readable reference.',
        FRAMING,
        NEGATIVE,
      ].join(' '),
    },
    actionRequest('move-4', spec.gait, false),
    actionRequest('attack-4', spec.attackAction, true),
    actionRequest('death-4a', spec.deathAction.first, true),
    actionRequest('death-4b', spec.deathAction.second, true),
    {
      key: `${spec.candidateSlug}-portrait`,
      composition: (identity) => [
        STYLE,
        `Create one single full-body dossier portrait of ${identity}, facing the viewer, ${spec.portraitPose}.`,
        'One single character only, a static reading pose for an encyclopedia entry, not an animation frame and not a grid of frames.',
        'Match the identity, palette, anatomy and pixel rendering of the supplied reference image exactly.',
        FRAMING,
        NEGATIVE,
      ].join(' '),
    },
  ];
}

/** 每个产物的构图指令；identity 由降级阶梯注入，角色专属措辞由 spec 注入。 */
function buildRequests(spec) {
  if (spec.isBoss) return buildBossRequests(spec);
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
        // 每格留边。这条与 gridFor 里的 GRID_MARGIN 同源，但转身图请求原先漏了它：
        // FRAMING 的 "占画布 70-84%" 对 2×2 是歧义的，模型按整图理解，把单格画到贴边。
        // 2026-08-21 实测 crawler 与 stalker 的转身图四格边距全为 0px 被门控拦下
        // ——伏地四足体的侧视格是全部视图里最宽的一张，最先踩中。
        // 与 Drifter v01 触发的 gridFor 同名修正一样，本条对后续所有感染体生效。
        // 措辞用 "view" 而不是复用 GRID_MARGIN 的 "frame"：转身图的四格是视图不是动画帧，
        // 沿用 frame 会和"四帧动画"混淆。
        'Within its own quarter of the image each view occupies at most 84 percent of that quarter\'s height and width,',
        'leaving a clearly visible margin of flat magenta background on all four sides of every view,',
        'so no head, hand, foot, paw, limb or hem ever touches the edge of the image or the centre lines.',
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
        ...facingClausesOf(spec, 'front'),
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
        `Only ${spec.backView} are visible. NO face, NO eyes, NO mouth in any frame.`,
        ...facingClausesOf(spec, 'back'),
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
