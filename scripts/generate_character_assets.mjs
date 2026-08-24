/**
 * 可玩角色生图脚本。两类产物用 `--kind` 区分，共用同一套上游交互与重试阶梯。
 *
 * `--kind sprite`（默认）关卡内实机精灵（图 B）
 *   与 generate_zombie_assets.mjs 同一条路径与同一套上游约定，但产物形态取 Boss 那一路：
 *   单朝向朝右，四方向由运行时 sprite.setRotation 表达。必须如此的原因见
 *   character_asset_specs.json 的 _note——Player.ts:108 按瞄准角连续旋转 360°，
 *   做方向表会与程序旋转冲突。
 *   出两张：身份参考图 + 实机精灵。角色不需要动画帧条（当前实机是静态单图）。
 *
 * `--kind portrait`（2026-08-23 新增）战前档案立绘（图 A）
 *   每角色只出一张，且**不出per角色身份参考图**——图 A 已经有母版了：
 *   守望者那张 2026-08-18 直出图是五人共同的风格锚点，直接当 I2I 参考带上。
 *   这正是 CHARACTER_PORTRAIT_PROMPTS.md 第 9 节对 DALL·E / GPT 图像一路的处方
 *   （无 seed，改为上传定稿当参考图，要求"同一画风、同一机位、同一光源，只换角色"），
 *   而本仓库用的 gpt-image-2 就属于这一路。
 *   参考图取**直出原图**而不是 processed 产物：产物是透明底的，拿它当参考模型不会
 *   再画出可键控的洋红底。
 *
 * 角色专属内容全部在 scripts/character_asset_specs.json，本文件只负责构图骨架与上游交互。
 *
 * 三个必须处理的上游现实：
 * 1. 输出尺寸恒定，size 与 imageSize 参数均被忽略，不要依赖它们。图 A 因此也是方图
 *    （母版实测 2048x2048），4:5 构图靠提示词表达、靠后处理裁切归一。
 *    顺带一条：本地代理的 validateSize 只接受 1:1 / 16:9 / 9:16 / 4:3 / WxH，
 *    `4:5` 会被 400 拒掉，所以两类都传 1:1。
 * 2. 参考图必须作为 I2I 参考带上。感染体管线实测（generate_zombie_assets.mjs:14）
 *    用单个姿态当参考会持续强化同一朝向，是 Runner v04 "四行同朝向" 的根因之一。
 * 3. **模型会无视 "straight 90 degree bird's eye"**。2026-08-18 的守望者图 B 就是这么
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
 *   node scripts/generate_character_assets.mjs eagle-eye --kind portrait --version v01
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
 * 上游提示词字符上限（实测，2026-08-23）。
 *
 * 超出时上游返回 `invalid_request: prompt must not exceed 8000 characters`，
 * 而本脚本的重试逻辑是为**概率性的内容审核拒绝**设计的，对长度问题一次都不该重试。
 * 撞上限那次的表现是同一条 invalid_request 连刷 15 行，看日志像被审核拦了。
 */
const PROMPT_MAX_CHARS = 8000;

/**
 * 图 A 的风格母版。守望者 2026-08-18 的直出原图，五人图 A 的共同锚点。
 *
 * 取直出原图而不是 `processed/characters/portrait-watcher.png`：产物是透明底的，
 * 拿它当参考图模型不会再画出可键控的洋红底，而键控底是整条后处理管线的前提。
 *
 * 注意它沿用旧命名（`portrait-watcher-raw.png`），不是脚本期的 `<Prefix>_portrait.png`；
 * 理由见 spec 里 watcher.portrait._note。
 */
const PORTRAIT_MASTER = resolve(
  ROOT, 'src', 'assets', 'generated', 'characters', 'portrait-watcher-raw.png',
);

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
 * 5. 体轴方向与手臂收拢程度必须单独说（2026-08-22 追加，对后续所有角色生效）：
 *    只说"朝右"会让体格越壮的角色越容易被画成横躺的椭圆——breacher v01 宽高比 1.34、
 *    bastion v02 1.07，都被宽高比判据拦下；而 bastion v01 更进一步，把"左右对称"
 *    执行得比"朝右"还彻底，整个人朝下（朝向判据因此才补上）。
 *    与之相对的是手臂过度前伸：bastion v02 为了朝右把手臂完全伸直，宽度又顶穿判据。
 *    所以这里三件事分开写——体轴竖直、拳头贴近胸前、左右两半不对称。
 *    措辞刻意不带比例数字：watcher v02 写了"4 单位高比 3 单位宽"，
 *    "站着的人"这个概念被带回来，机位直接退回斜视。
 */
const ORIENTATION = [
  'The character faces exactly the RIGHT edge of the frame.',
  'Both empty hands are clasped together directly in front of the body in a two-handed grip',
  'stance holding nothing, with the clasped fists positioned at 80 percent of the canvas width',
  'and 50 percent of the canvas height.',
  'No weapon, no gun, no firearm of any kind anywhere in the image.',
  'The body is perfectly centered and vertically symmetric about the horizontal centre line.',
  'The long axis of the body runs from the top edge of the frame toward the bottom edge:',
  'the shoulder line lies across the upper part of the silhouette and the boot tips at the bottom',
  'of it, so the whole outline is taller than it is wide, never a horizontal oval lying on its side.',
  'The arms are bent and the clasped fists stay close to the chest: they are the part of the',
  'silhouette furthest to the right, but they do not reach far out into empty space.',
  'The left half and the right half of the silhouette are not mirror images of each other.',
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

// —— 以下是图 A（战前档案立绘）专用段。与上面图 B 的三段严格分开。 ——
//
// 两类图共用画风家族但**不共用任何一段措辞**，因为它们的机位与用途相反：
// 图 B 是正俯视、不画武器、只看轮廓；图 A 是全身侧身 25°、武器是造型的一部分、
// 要看得清脸。把其中一段抄给另一类，等于把对方的失败模式一起抄过来。

/** 图 A 画风段。与 CHARACTER_PORTRAIT_PROMPTS.md 3.1 的立绘段同源，五角色逐字相同。 */
const PORTRAIT_STYLE = [
  'High-resolution pixel art character portrait, detailed 2D game character illustration,',
  'clean readable pixel clusters with deliberate dithering, limited but rich color palette,',
  'crisp hand-placed shading, dark gritty post-apocalyptic survival game art style,',
  'professional game asset quality, sharp silhouette readability.',
].join(' ');

/**
 * 图 A 画风锁定段。**由鹰眼 v01 逼出来，对后续所有图 A 生效。**
 *
 * v01 的量化门控五项全过（留边 85px、键控底 85.1%、连通域 1、宽高比 0.383、
 * 主体高占比 0.851），但按验收清单 10.1 第 7 条与母版并排看，三处画风明显不同源：
 *   1. 像素颗粒明显更细、更平滑，几乎没有可见的手工点阵抖动，母版是粗颗粒重抖动；
 *   2. 脸是干净的动漫脸，母版是有皱纹、胡茬与疤痕的写实风化脸；
 *   3. 服装是光滑贴身的连体衣、崭新无磨损，母版是有厚度、有褶皱、有污渍的旧装具。
 * 三项都落在 3.1 那段"clean readable pixel clusters / dark gritty"没有明确约束的地带。
 *
 * 教训与图 B 的 3.3.1 完全同构：**只给风格形容词是不够的，必须把要与不要都枚举出来。**
 * 那边是机位（"90 degree bird's eye" 不管用，要写相机物理位置 + 正反枚举可见项），
 * 这边是画风（"pixel art / gritty" 不管用，要写颗粒粗细、饱和度、磨损程度、脸的画法）。
 *
 * 这一段刻意放在**共用段**而不是塞进某个角色的 emphasis：四名角色都会有同一个倾向
 * （模型对"漂亮干净"的先验远强于"脏旧粗颗粒"），逐个打补丁必然漏，而且会让
 * 五张图的画风锁定程度不一致——那正是 3.6"一致性优先"要防的事。
 */
const PORTRAIT_STYLE_LOCK = [
  'PIXEL RENDERING, match this precisely:',
  'the pixel clusters are COARSE and individually visible, with deliberate hand-placed dithering',
  'used for every gradient and every shadow.',
  'Do not render smooth gradients, airbrushed skin, soft blended shading or fine photographic detail.',
  'PALETTE: muted, desaturated, dirty earth tones throughout, low overall saturation.',
  'The character\'s single accent colour is the ONLY saturated colour in the image and it covers',
  'only a small part of the body.',
  'WEAR AND GRIME, this is not optional: every piece of clothing, armour and equipment is old,',
  'scuffed, faded, stained, patched and visibly used, with dirt worked into the creases.',
  'FACE AND BUILD: a grounded, realistically proportioned adult with a weathered, lived-in face',
  'rendered in coarse pixels, in exactly the same illustration language as the reference image.',
  'This is not an anime face, not a glamour illustration and not a fashion illustration.',
  'CLOTHING: practical layered fabric and webbing with real visible thickness, seams, folds and sag.',
  'Never a smooth skin-tight bodysuit and never shiny or brand-new material.',
].join(' ');

/**
 * 图 A 技术规格段。与 CHARACTER_PORTRAIT_PROMPTS.md 3.2 同源，五角色逐字相同。
 *
 * 「四边都留出洋红余量、什么都不许裁」这一条被刻意写了三遍（头顶、双脚、武器各一次，
 * 再加一句总括），因为**四边留边是图 A 的唯一硬判据**：半身像、膝上取景与切脚三种
 * 废图在键控底上一律表现为主体贴边，实测全部读作 0.00%，而母版是 3.81%
 * （标定见 spec 的 _portraitNote）。措辞冗余在这里是有意的，不要合并。
 *
 * 不写「主体占画布高度 82%」以外的比例数字：watcher 图 B 的 v02 就是因为提示词里出现
 * 了比例数字而把「站着的人」这个概念带回来、机位退回斜视（见 3.3.1）。图 A 本来就要
 * 站着的人，但同类的过度约束会挤掉姿态自由度，而 82% 是文档 3.2 已验证过的原文。
 */
const PORTRAIT_FRAMING = [
  'FRAMING, this is the requirement most likely to ruin the image:',
  'full-body character portrait shown completely from head to boots, with both legs, both ankles,',
  'both feet and both complete boots clearly visible and fully drawn.',
  'The entire character AND the entire weapon are contained inside the canvas.',
  'Leave a clear band of flat magenta background above the head, below both boots, to the left',
  'and to the right of the body, and around every part of the weapon.',
  'Nothing may touch or cross a canvas edge: do not crop the head, the weapon, the arms, the hands,',
  'the legs, the ankles, the feet or the boots.',
  'This is a whole standing figure, never a bust, never a waist-up portrait and never an',
  'above-the-knee crop.',
  'Body angled 25 degrees toward the viewer\'s right, head turned slightly right.',
  'Single consistent light source from upper left.',
  'Flat solid pure magenta #FF00FF background with no gradient and no cast shadow.',
  'Subject centered and filling approximately 82 percent of the frame height.',
  'Natural stable standing pose with both feet flat on one single ground line.',
  '4:5 vertical portrait composition, no text, no border, no logo, no watermark, no UI,',
  'single character.',
  'COLOUR SAFETY, this breaks the asset if you get it wrong: magenta is the chroma-key colour.',
  'Do not use magenta, pink, fuchsia or violet anywhere on the character, the clothing,',
  'the armour, the equipment or the weapon.',
  'Any transparent or glass part — a visor, goggle lenses, a shield viewport, a scope lens —',
  'must be drawn in dark smoked grey or amber, never in magenta or pink;',
  'anything magenta is treated as background and will be cut out of the character.',
].join(' ');

/**
 * 图 A 共用负面词表。与 CHARACTER_PORTRAIT_PROMPTS.md 3.4 同源。
 *
 * **注意这里没有任何武器类词条**，与图 B 的 BASE_NEGATIVE 正相反：图 A 要画武器，
 * 它是造型的一部分（该文档 1. 的对照表）。破阵者因此也不需要 dropBaseNegative——
 * 图 B 里他要摘掉 'weapon' 才能保住背上的撬棍，图 A 里本来就没有那一条。
 */
const PORTRAIT_BASE_NEGATIVE = [
  'text', 'letters', 'watermark', 'signature', 'logo', 'border', 'frame', 'UI', 'HUD',
  'health bar', 'multiple characters', 'crowd',
  'cropped head', 'cropped feet', 'cropped boots', 'cut off limbs',
  'feet outside frame', 'body outside frame', 'weapon outside frame',
  'close-up', 'bust portrait', 'waist-up portrait', 'above-knee framing', 'half body',
  'complex background', 'environment', 'rubble', 'buildings', 'ground shadow', 'cast shadow',
  'real military insignia', 'national flags', 'brand logos', 'copyrighted characters',
  'chibi', 'cute', 'super-deformed', 'anime moe style', 'glossy plastic skin',
  'power armor', 'sci-fi mecha', 'exosuit', 'ninja', 'superhero spandex', 'cape',
  'exposed muscles beefcake', 'sexualized pose', 'gore', 'blood spatter',
  'low resolution', 'blurry', 'out of focus', 'jpeg artifacts',
  'extra limbs', 'extra fingers', 'deformed hands', 'malformed face',
  'asymmetrical eyes', 'floating limbs',
  // 以下 2026-08-23 由鹰眼 v01 补入，与 PORTRAIT_STYLE_LOCK 成对生效（理由见那一段）。
  // 正面说"要粗颗粒、要脏旧"，负面把模型的默认倾向"干净漂亮光滑"逐条排除。
  'anime face', 'manga face', 'large glossy eyes', 'smooth airbrushed skin',
  'smooth gradient shading', 'soft blended shading', 'photographic detail',
  'skin-tight bodysuit', 'catsuit', 'latex', 'shiny fabric', 'glossy material',
  'brand-new clean clothing', 'unworn equipment', 'spotless gear',
  'fashion illustration', 'glamour illustration', 'idealized proportions',
  'high saturation', 'neon colors', 'vibrant colors',
  // 以下 2026-08-23 由堡垒 v01 补入。那张图把掀起的面罩和盾牌观察窗画成了洋红/粉色，
  // 键控判据一视同仁地当背景抠掉，人物头上会破洞。图 B 的五份 extraNegative 早就
  // 逐个带了 magenta/pink/violet clothing 三条，图 A 的共用表当初漏了——补齐并加上
  // 透明件的措辞，因为面罩与观察窗正是模型最容易用键控色去画"玻璃"的地方。
  'magenta clothing', 'pink clothing', 'violet clothing',
  'magenta equipment', 'pink equipment', 'magenta armour', 'pink armour',
  'magenta visor', 'pink visor', 'magenta lens', 'pink lens',
  'magenta glass', 'pink glass', 'magenta tinted glass', 'pink tinted glass',
  'magenta goggles', 'pink goggles', 'magenta window', 'pink window',
];

function portraitNegativeFor(portrait) {
  return `Avoid ${[...(portrait.extraNegative ?? []), ...PORTRAIT_BASE_NEGATIVE].join(', ')}.`;
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

/** 图 B 两张产物：身份参考图 + 实机精灵。 */
function buildSpriteRequests(spec) {
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

/**
 * 图 A 一张产物：战前档案立绘。
 *
 * **不出per角色身份参考图**，与图 B 不同：图 A 的风格锚点是守望者母版，全五人共用一张，
 * 所以这里只发一次请求。
 *
 * `withReference` 决定要不要写"照着参考图"那一段。母版自己重生成时没有参考图，
 * 那一段必须整段去掉而不是留着——指着一张不存在的图说"照它画"会让模型自由发挥。
 *
 * 参考图那段措辞是本函数最容易写错的地方，单独说明：图 B 的对应措辞是
 * "Match the identity, palette, clothing... exactly"，因为那条 I2I 链的参考图**就是同一个角色**。
 * 图 A 的参考图是**另一个人**（守望者），照抄那句话会直接把守望者再画一遍。
 * 所以这里必须把"要抄的"和"不要抄的"分开列清楚：抄渲染语言、抄机位、抄光源、抄画幅，
 * 不抄人。
 */
function buildPortraitRequests(spec, withReference) {
  const portrait = spec.portrait;
  const NEGATIVE = portraitNegativeFor(portrait);
  const EMPHASIS = (portrait.emphasis ?? []).join(' ');
  return [
    {
      key: `${spec.candidateSlug}-portrait`,
      composition: (identity) => [
        PORTRAIT_STYLE,
        `Create one single full-body character portrait of ${identity}.`,
        EMPHASIS,
        PORTRAIT_STYLE_LOCK,
        PORTRAIT_FRAMING,
        ...(withReference
          ? [
            'A reference image is supplied. Copy its ART STYLE ONLY:',
            'the same COARSE pixel granularity and the same visible dithering density,',
            'the same muted desaturated palette treatment, the same hand-placed shading,',
            'the same level of wear and grime on the gear,',
            'the same single light source from the upper left,',
            'the same 25-degree body angle, the same full-body head-to-boots framing,',
            'the same subject size within the canvas, and the same flat magenta background.',
            'Your output must look like it was drawn by the same artist, at the same pixel scale,',
            'for the same character set. If your rendering looks smoother, cleaner, more saturated',
            'or more finely detailed than the reference, it is wrong.',
            'The person in the reference image is a DIFFERENT character.',
            'Do NOT copy the reference character\'s face, age, sex, body type, clothing, equipment,',
            'colour scheme or weapon. Draw the character described above instead, as a clearly',
            'different individual who happens to be illustrated by the same artist in the same set.',
          ]
          : []),
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
 *
 * ladder 由调用方传入而不是从 spec 里取：图 A 与图 B 各有自己的一套措辞
 * （spec.portrait.identityLadder 对 spec.identityLadder），从这里读会绑死其中一类。
 */
async function generateWithLadder(request, references, ladder, shared) {
  for (let tier = 0; tier < ladder.length; tier += 1) {
    const prompt = request.composition(ladder[tier]);
    // 长度预检。上游有 8000 字符硬上限，超出时返回的是 invalid_request，
    // 与内容审核拒绝长得一模一样——2026-08-23 给破阵者补 CRITICAL FACING/GRIP 两段后
    // 撞上限，15 次重试全部失败，读日志时极易误判成"措辞被审核拦了"。
    // 重试对长度问题永远无效，所以这里直接跳到下一条（更短的）阶梯而不是白试 5 次。
    if (prompt.length > PROMPT_MAX_CHARS) {
      console.log(
        `    tier${tier} 跳过: 提示词 ${prompt.length} 字符 > 上限 ${PROMPT_MAX_CHARS}`
        + `（超出 ${prompt.length - PROMPT_MAX_CHARS}），重试无用，直接降级`,
      );
      continue;
    }
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
  const lengths = ladder.map((identity, tier) => `tier${tier}=${request.composition(identity).length}`);
  throw new Error(
    `${request.key}: 所有措辞阶梯均被上游拒绝或超长`
    + `（提示词长度 ${lengths.join(' ')}，上限 ${PROMPT_MAX_CHARS}）`,
  );
}

function parseArgs(argv) {
  const positional = [];
  let version = null;
  let kind = 'sprite';
  let dryRun = false;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--version') {
      version = argv[index + 1];
      index += 1;
    } else if (argv[index] === '--kind') {
      kind = argv[index + 1];
      index += 1;
    } else if (argv[index] === '--dry-run') {
      dryRun = true;
    } else {
      positional.push(argv[index]);
    }
  }
  return { id: positional[0], version, kind, dryRun };
}

const USAGE = 'node scripts/generate_character_assets.mjs <id> [--kind sprite|portrait] [--version vNN] [--dry-run]';

async function main() {
  const { id, version: versionFlag, kind, dryRun } = parseArgs(process.argv.slice(2));
  const specs = JSON.parse(await readFile(SPEC_PATH, 'utf8'));
  if (!id || !specs.characters[id]) {
    const known = Object.keys(specs.characters).join(', ');
    throw new Error(`用法: ${USAGE}\n已登记的 id: ${known}`);
  }
  if (kind !== 'sprite' && kind !== 'portrait') {
    throw new Error(`--kind 只能是 sprite 或 portrait，收到 ${kind}\n用法: ${USAGE}`);
  }
  const spec = specs.characters[id];
  const version = versionFlag ?? process.env.CHARACTER_ASSET_VERSION ?? 'v01';
  const isPortrait = kind === 'portrait';

  if (isPortrait && !spec.portrait) {
    throw new Error(`${spec.displayName} 的 spec 里没有 portrait 段，先补 character_asset_specs.json`);
  }

  const section = isPortrait ? spec.portraitPromptSection : spec.promptSection;
  const kindLabel = isPortrait ? '图 A 战前档案立绘' : '图 B 关卡内实机精灵';
  console.log(
    `目标: ${spec.displayName} ${kindLabel}`
    + `（提示词 CHARACTER_PORTRAIT_PROMPTS.md ${section}），版本 ${version}`,
  );

  await mkdir(TEMP_DIR, { recursive: true });

  // 图 A 的风格参考图是守望者母版，全五人共用一张。
  // 母版自己重生成时不带参考图（它就是参考图），此时 buildPortraitRequests 会把
  // "照着参考图"那一段整段去掉。
  const usePortraitReference = isPortrait && id !== 'watcher';
  if (usePortraitReference && !(await exists(PORTRAIT_MASTER))) {
    throw new Error(`缺少图 A 风格母版：${PORTRAIT_MASTER}`);
  }

  const requests = isPortrait
    ? buildPortraitRequests(spec, usePortraitReference)
    : buildSpriteRequests(spec);
  const ladder = isPortrait ? spec.portrait.identityLadder : spec.identityLadder;

  // --dry-run 把最终提示词打出来就结束，一个上游请求都不发。
  // 存在理由很实际：措辞是这条管线里最容易出错也最贵的部分（每次试错都要花生成额度），
  // 而阶梯 0 的完整提示词有 2000 字以上，光读 spec 片段看不出拼起来是什么样。
  if (dryRun) {
    console.log(
      usePortraitReference
        ? `风格母版: ${basename(PORTRAIT_MASTER)}（守望者，只抄画风不抄人）`
        : (isPortrait ? '风格母版: 无（本角色就是母版，不带 I2I 参考）' : ''),
    );
    for (const request of requests) {
      for (let tier = 0; tier < ladder.length; tier += 1) {
        const prompt = request.composition(ladder[tier]);
        console.log(`\n=== ${request.key} 阶梯 ${tier}（${prompt.length} 字符）===\n${prompt}`);
      }
    }
    console.log('\n--dry-run: 未发出任何上游请求，未写入任何文件。');
    return;
  }

  const health = await fetch(HEALTH_URL).catch(() => null);
  const healthPayload = health ? await health.json().catch(() => null) : null;
  if (!health?.ok || healthPayload?.status !== 'ok') {
    throw new Error(
      `image API 健康检查失败，请先运行 npm run image-api。返回: ${JSON.stringify(healthPayload)}`,
    );
  }
  console.log(`image-api ok: model=${healthPayload.model}`);

  let portraitReference = null;
  if (usePortraitReference) {
    portraitReference = await fileToDataUrl(PORTRAIT_MASTER);
    console.log(`风格母版: ${basename(PORTRAIT_MASTER)}（守望者，只抄画风不抄人）`);
  } else if (isPortrait) {
    console.log('风格母版: 无（本角色就是母版，不带 I2I 参考）');
  }

  let identityReference = null;
  const summary = [];

  for (const request of requests) {
    const outputPath = resolve(TEMP_DIR, `${request.key}-${version}.png`);
    if (await exists(outputPath)) {
      // 不覆盖已有候选：重跑时只补齐缺失项，避免重复消耗生成额度。
      console.log(`跳过 ${basename(outputPath)}（已存在）`);
      if (request.isReference) identityReference = await fileToDataUrl(outputPath);
      summary.push({ key: request.key, tier: 'skipped', bytes: 0 });
      continue;
    }

    console.log(`生成 ${request.key} ...`);
    const references = isPortrait
      ? (portraitReference ? [portraitReference] : [])
      : (identityReference ? [identityReference] : []);
    const { bytes, tier } = await generateWithLadder(request, references, ladder, specs.shared);
    await writeFile(outputPath, bytes);
    console.log(`  写入 ${basename(outputPath)} (${bytes.length} 字节, 措辞阶梯 ${tier})`);
    summary.push({ key: request.key, tier, bytes: bytes.length });

    if (request.isReference) identityReference = await fileToDataUrl(outputPath);
  }

  console.log('\n--- 生成汇总 ---');
  for (const item of summary) {
    console.log(`${item.key}: 阶梯=${item.tier} 字节=${item.bytes}`);
  }
  const inspectKind = isPortrait ? ' --kind portrait' : '';
  console.log(
    `\n下一步: python scripts/inspect_character_candidates.py ${id}${inspectKind} --version ${version}`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
