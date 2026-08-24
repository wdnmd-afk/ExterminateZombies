"""角色美术后处理：战前档案立绘（图 A 占位）与关卡内实机精灵（图 B）。

本脚本有两条互不相干的分支，用子命令区分：

`portraits`（默认，原有行为）
    从 Kenney Topdown Shooter 矢量源提取五名角色的战前档案立绘。
    战前整备页需要在约 188x230 的展示区显示角色，而 Kenney 实机精灵只有
    35-38 x 43，放大约 5 倍必然粗糙。Kenney 同一素材包内附带
    `Vector/vector_characters.svg` 矢量源（CC0），本分支从中切出五名已接入角色的
    `hold` 姿态，各自生成一个独立 SVG。运行时由 Phaser 的 `load.svg` 按目标倍率
    矢量栅格化，因此档案立绘不存在放大失真，且与实机精灵同源、画风完全一致。

    矢量源布局（已核对）：`<defs>` 内每个 `Layer0_<N>_MEMBER_<M>_FILL` 是一个填充
    层，`Layer0_<N>` 为一个独立姿态；54 个姿态排成 9 角色 x 6 姿态的规整网格，
    所有姿态右边界对齐。每个姿态固定三层：MEMBER_0 为俯视投影阴影、MEMBER_1 为
    手臂底层、MEMBER_2 为身体主体，三层全部保留以维持与实机一致的观感。

    守望者的图 A 已换成 AI 生成并处理后的 PNG，其矢量切片保留为其余四人的占位。

`sprite <id>`（2026-08-21 新增）
    把 AI 生成的关卡内实机精灵候选处理为运行时产物。

    这条分支存在的理由：原先的 `sprite-watcher.png` 不是任何脚本产出的——本文件
    此前**完全没有抠图与去色溢代码**，那张 PNG 因此无法复现，并且残留了 128 个
    洋红像素，在深色战场上表现为紫边。

    键控、去色溢与归一化**直接复用 `process_zombie_sprites.py` 的现成函数**，
    不在这里重写：那套 BFS 去色溢带是按真实紫边样本调过的，两处各写一份必然漂移。

`portrait-downsample <id>`（2026-08-22 新增）
    把已抠图的图 A 归档按运行时展示尺寸降采样。同样是为了让手工导入的产物
    重新变得可复现，理由见函数文档串。

`portrait <id>`（2026-08-23 新增）
    把 AI 生成的图 A 立绘候选处理为运行时产物：键控去色溢 -> 裁到主体 -> 补留边
    -> 按展示尺寸降采样。这是鹰眼 / 堡垒 / 疾行者 / 破阵者四人图 A 的正式管线，
    产物几何逐像素复现守望者母版（`228 x 480`、主体 `218 x 470`、四边 `5px`）。

    与 `portrait-downsample` 的分工：那一条的输入是**已抠图**的守望者归档，只解决
    体积，刻意不重新键控也不裁主体；这一条的输入是**洋红直出原图**，走完整条链。

用法：
    python scripts/process_character_assets.py
    python scripts/process_character_assets.py portraits
    python scripts/process_character_assets.py sprite watcher --version v03
    python scripts/process_character_assets.py sprite watcher --from-archive
    python scripts/process_character_assets.py portrait-downsample watcher
    python scripts/process_character_assets.py portrait eagle-eye --version v01
"""

import argparse
import hashlib
import json
import re
import shutil
import warnings
import xml.etree.ElementTree as ElementTree
from collections import deque
from pathlib import Path

from PIL import Image, ImageChops

# Pillow 12 对 getdata 标了弃用；这里只做只读像素遍历，噪声警告会淹没处理结论。
# 必须按 message 过滤而不是按 module="PIL"：警告在本文件的调用栈帧上抛出，
# 按模块过滤匹配的是调用方而不是 Pillow，实测过滤不掉。
warnings.filterwarnings("ignore", message=r".*getdata is deprecated.*", category=DeprecationWarning)

# 键控、去色溢与归一化复用感染体管线，避免两套判据漂移（见模块文档串）。
from process_zombie_sprites import (
    alpha_bbox,
    place_subject,
    remove_magenta_background,
    resolve_shared_scale,
)

ROOT = Path(__file__).resolve().parents[1]
VECTOR_SOURCE = (
    ROOT
    / "src"
    / "assets"
    / "downloaded"
    / "characters"
    / "kenney-topdown-shooter"
    / "Vector"
    / "vector_characters.svg"
)
OUTPUT_DIR = ROOT / "src" / "assets" / "processed" / "characters"

SPEC_PATH = ROOT / "scripts" / "character_asset_specs.json"
TEMP_DIR = ROOT / "TmpGenerate"
GENERATED_DIR = ROOT / "src" / "assets" / "generated" / "characters"

# 候选与归档的命名后缀，与 generate_character_assets.mjs 及
# inspect_character_candidates.py 保持一致。
CANDIDATE_SUFFIX = {"reference": "identity-reference", "sprite": "sprite"}
ARCHIVE_SUFFIX = {"reference": "identity_reference", "sprite": "sprite"}


# 角色 ID -> (矢量源姿态图层号, 素材包内人物名)。图层号已通过颜色签名与
# `Spritesheet/spritesheet_characters.xml` 的姿态宽度双向核对，不是推测值。
CHARACTER_PORTRAIT_LAYERS = {
    "watcher": (16, "survivor1"),
    "eagle-eye": (5, "hitman1"),
    "bastion": (22, "soldier1"),
    "runner": (43, "manBlue"),
    "breacher": (52, "manBrown"),
}

# 统一画幅。五名角色的几何边界最大为 37.4 x 43，统一到同一画幅并居中，
# 保证五张档案图画幅一致、主体占比一致、基线一致。
PORTRAIT_CANVAS_WIDTH = 44.0
PORTRAIT_CANVAS_HEIGHT = 48.0

# 图 A 运行时高度。战前整备页按 min(188/w, 230/h) 把立绘塞进 188x230 展示区
# （PreparationScene.updateCharacter），相机 zoom 上限是
# DisplayManager 的 MAX_RENDER_SCALE = 2，所以立绘的物理像素上限为 230 x 2 = 460。
# 取 480 而不是 460：与 Kenney 矢量分支栅格化后的 480
# （PreloadScene 的 PORTRAIT_BASE_SCALE 5 x 倍率 2 x 画幅 48）对齐，
# 两条分支的源精度因此一致，将来五人换成 AI 立绘时也不必再挑一个新数字。
PORTRAIT_RUNTIME_HEIGHT = 480

# 矢量源 body 中每个姿态组固定携带的平移，用于把 defs 内的绝对坐标搬到 viewBox。
SOURCE_TRANSLATE_X = -2784.85
SOURCE_TRANSLATE_Y = -362.0

_NUMBER = re.compile(r"-?\d+\.?\d*(?:[eE][-+]?\d+)?")
_COMMAND = re.compile(r"[A-Za-z]")


def parse_path_bounds(path_data: str) -> tuple[float, float, float, float]:
    """计算单条 path 的精确边界框。

    矢量源只使用 M/L/Q/Z 四个绝对命令（已校验），因此这里对二次贝塞尔按极值
    求解而不是退化成控制点包围盒，避免统一画幅时把角色算得偏大。
    """
    tokens = _COMMAND.split(path_data)
    commands = _COMMAND.findall(path_data)
    if len(tokens) != len(commands) + 1:
        raise ValueError("path 命令与参数段数量不匹配")

    min_x = min_y = float("inf")
    max_x = max_y = float("-inf")
    current = start = (0.0, 0.0)

    def include(x: float, y: float) -> None:
        nonlocal min_x, min_y, max_x, max_y
        min_x, max_x = min(min_x, x), max(max_x, x)
        min_y, max_y = min(min_y, y), max(max_y, y)

    def include_quadratic(p0: float, p1: float, p2: float, axis: str) -> None:
        """把二次贝塞尔在该轴上的极值纳入边界，只更新该轴，避免污染另一轴。"""
        nonlocal min_x, min_y, max_x, max_y
        denominator = p0 - 2.0 * p1 + p2
        if denominator == 0.0:
            return
        t = (p0 - p1) / denominator
        if not 0.0 < t < 1.0:
            return
        value = (1.0 - t) ** 2 * p0 + 2.0 * t * (1.0 - t) * p1 + t * t * p2
        if axis == "x":
            min_x, max_x = min(min_x, value), max(max_x, value)
        else:
            min_y, max_y = min(min_y, value), max(max_y, value)

    for command, segment in zip(commands, tokens[1:]):
        numbers = [float(value) for value in _NUMBER.findall(segment)]
        if command in {"Z", "z"}:
            if numbers:
                raise ValueError("Z 命令不应携带参数")
            current = start
            continue
        if command not in {"M", "L", "Q"}:
            raise ValueError(f"矢量源出现未支持的 path 命令：{command}")

        step = 2 if command in {"M", "L"} else 4
        if not numbers or len(numbers) % step != 0:
            raise ValueError(f"{command} 命令参数数量异常：{len(numbers)}")

        for offset in range(0, len(numbers), step):
            if command == "M":
                current = (numbers[offset], numbers[offset + 1])
                # M 只有首组是 moveto，后续组按 SVG 规范等价于 lineto，
                # 因此子路径起点只在首组记录，Z 才能回到正确位置。
                if offset == 0:
                    start = current
                include(*current)
            elif command == "L":
                current = (numbers[offset], numbers[offset + 1])
                include(*current)
            else:
                control = (numbers[offset], numbers[offset + 1])
                end = (numbers[offset + 2], numbers[offset + 3])
                include(*end)
                include_quadratic(current[0], control[0], end[0], "x")
                include_quadratic(current[1], control[1], end[1], "y")
                current = end

    if min_x > max_x:
        raise ValueError("path 未产生任何坐标")
    return min_x, min_y, max_x, max_y


def read_layer_blocks(source_text: str) -> dict[int, list[tuple[int, str]]]:
    """按姿态图层号收集 defs 内的填充层原文。"""
    defs_text = source_text.split("</defs>", 1)[0]
    blocks: dict[int, list[tuple[int, str]]] = {}
    pattern = re.compile(
        r'<g id="Layer0_(\d+)_MEMBER_(\d+)_FILL">(.*?)</g>',
        re.DOTALL,
    )
    for layer, member, body in pattern.findall(defs_text):
        blocks.setdefault(int(layer), []).append((int(member), body))
    for members in blocks.values():
        members.sort(key=lambda item: item[0])
    return blocks


def measure_layer(members: list[tuple[int, str]]) -> tuple[float, float, float, float]:
    """合并一个姿态全部填充层的边界框。"""
    min_x = min_y = float("inf")
    max_x = max_y = float("-inf")
    for _, body in members:
        for path_data in re.findall(r'\sd="([^"]*)"', body):
            x0, y0, x1, y1 = parse_path_bounds(path_data)
            min_x, min_y = min(min_x, x0), min(min_y, y0)
            max_x, max_y = max(max_x, x1), max(max_y, y1)
    if min_x > max_x:
        raise ValueError("姿态图层未产生任何坐标")
    return min_x, min_y, max_x, max_y


def build_portrait_svg(members: list[tuple[int, str]], layer: int) -> str:
    """生成单角色档案立绘 SVG，人物在统一画幅内水平居中、垂直居中。

    填充层的 path 直接内联，不沿用矢量源的 `<defs>` + `<use xlink:href>` 间接引用：
    Phaser 的 SVG 加载器会把内容塞进 Blob 再交给 `<img>`，而 `<img>` 内嵌 SVG 属于
    受限上下文，内联 path 可以完全绕开引用解析差异，产物也更小。
    """
    min_x, min_y, max_x, max_y = measure_layer(members)
    width = max_x - min_x
    height = max_y - min_y
    if width > PORTRAIT_CANVAS_WIDTH or height > PORTRAIT_CANVAS_HEIGHT:
        raise ValueError(f"L{layer} 主体 {width:.1f}x{height:.1f} 超出统一画幅")

    # 矢量源 path 用的是绝对坐标，这里把平移量改成“搬到画幅居中位置”。
    translate_x = (PORTRAIT_CANVAS_WIDTH - width) / 2.0 - min_x
    translate_y = (PORTRAIT_CANVAS_HEIGHT - height) / 2.0 - min_y

    groups = []
    for member, body in members:
        paths = re.findall(r"<path\b[^>]*?/>", body, re.DOTALL)
        if not paths:
            raise ValueError(f"L{layer} MEMBER_{member} 没有可内联的 path")
        inlined = "\n".join(path.strip() for path in paths)
        groups.append(
            f'<g transform="matrix(1, 0, 0, 1, {translate_x:.4f}, {translate_y:.4f})">\n'
            f"{inlined}\n</g>"
        )

    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<svg xmlns="http://www.w3.org/2000/svg" version="1.1"'
        f' width="{PORTRAIT_CANVAS_WIDTH:g}px" height="{PORTRAIT_CANVAS_HEIGHT:g}px"'
        f' viewBox="0 0 {PORTRAIT_CANVAS_WIDTH:g} {PORTRAIT_CANVAS_HEIGHT:g}">\n'
        + "\n".join(groups)
        + "\n</svg>\n"
    )


def build_portraits() -> None:
    """原有行为：从 Kenney 矢量源切出五名角色的档案立绘 SVG。"""
    if not VECTOR_SOURCE.exists():
        raise FileNotFoundError(f"缺少 Kenney 矢量源：{VECTOR_SOURCE}")

    source_text = VECTOR_SOURCE.read_text(encoding="utf-8")
    blocks = read_layer_blocks(source_text)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    for character_id, (layer, source_name) in CHARACTER_PORTRAIT_LAYERS.items():
        members = blocks.get(layer)
        if not members:
            raise KeyError(f"矢量源缺少姿态图层 Layer0_{layer}（{source_name}）")

        markup = build_portrait_svg(members, layer)
        # 写盘前解析一次，确保产物是结构合法的 XML，而不是拼接出的坏字符串。
        ElementTree.fromstring(markup.split("?>", 1)[1])

        output_path = OUTPUT_DIR / f"portrait-{character_id}.svg"
        output_path.write_text(markup, encoding="utf-8", newline="\n")

        min_x, min_y, max_x, max_y = measure_layer(members)
        print(
            f"{character_id:10s} <- L{layer:<2d} {source_name:10s} "
            f"主体 {max_x - min_x:5.2f}x{max_y - min_y:5.2f} "
            f"-> {output_path.name} ({output_path.stat().st_size} 字节)"
        )


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


# 拳心量取时的前缘带宽比例从 spec 的 shared 段读，不在这里硬编码：
# inspect_character_candidates.py 的 front_band_centroid 用同一个数，
# 两处脱钩会让"检视通过"不再等价于"处理可用"。
def grip_front_band_ratio() -> float:
    return json.loads(SPEC_PATH.read_text(encoding="utf-8"))["shared"]["gripFrontBandRatio"]


def measure_grip(sprite: Image.Image) -> dict:
    """在最终产物上量取拳心，给出可直接写进 `characters.ts` 的 `gripAnchor`。

    为什么用几何法而不是皮肤色质心：五名角色里只有守望者与疾行者露着手或缠着绷带，
    堡垒戴厚手甲、破阵者全副装具，皮肤簇根本不存在——`inspect_character_candidates.py`
    的 `fist_position` 对他们会返回 `None` 并跳过该判据。而 `gripAnchor` 是每个角色都
    必须给的值，量法不能只对一半角色成立。

    几何法的依据就是构图本身：提示词要求双拳并拢在身体正前方且角色朝右，所以拳头
    必然是主体最靠右的那一团，取主体前缘一条窄带的质心即可，只读 alpha 不读颜色。

    偏移相对**画幅几何中心**算而不是相对主体 bbox 中心：人物层 origin 是 0.5/0.5，
    运行时旋转轴就是画幅中心（`Player` 按瞄准角旋转人物层），而主体在画幅内并不保证
    完全居中。量错这个基准，武器会在旋转时绕着一个偏心点甩。

    返回值的符号与 `CharacterGripAnchor` 一致：`forward` 沿瞄准方向（朝右为正），
    `boreSide` 为持枪中线的侧向偏移（画面下方 / 人物右手侧为正）。
    """
    width, height = sprite.size
    pixels = list(sprite.getdata())
    solid = [
        (index % width, index // width)
        for index, pixel in enumerate(pixels)
        if pixel[3] > 8
    ]
    if not solid:
        raise ValueError("产物没有检测到非透明主体，无法量取拳心")

    xs = [point[0] for point in solid]
    left, right = min(xs), max(xs)
    band = max(1, round((right - left + 1) * grip_front_band_ratio()))
    front = [point for point in solid if point[0] > right - band]
    fist_x = sum(point[0] for point in front) / len(front)
    fist_y = sum(point[1] for point in front) / len(front)

    # 皮肤色质心作为交叉校验，不作为取值依据：守望者的 gripAnchor 当初是按皮肤色量的，
    # 两种量法在有皮肤时必须同解，否则说明前缘带宽选错了。判据与
    # inspect_character_candidates.py 的 fist_position 逐字相同。
    skin = [
        (index % width, index // width)
        for index, (red, green, blue, alpha) in enumerate(pixels)
        if alpha > 8 and red > 150 and 95 < green < 200 and 65 < blue < 170 and red > green > blue
    ]
    skin_offset = None
    if skin:
        skin_xs = [point[0] for point in skin]
        threshold = min(skin_xs) + (max(skin_xs) - min(skin_xs)) * 0.6
        tip = [point for point in skin if point[0] >= threshold] or skin
        skin_offset = (
            sum(point[0] for point in tip) / len(tip),
            sum(point[1] for point in tip) / len(tip),
        )

    center_x = (width - 1) / 2
    center_y = (height - 1) / 2
    return {
        "forward": fist_x - center_x,
        "boreSide": fist_y - center_y,
        "band": band,
        "samples": len(front),
        "skinForward": None if skin_offset is None else skin_offset[0] - center_x,
        "skinBoreSide": None if skin_offset is None else skin_offset[1] - center_y,
    }


def report_grip(sprite: Image.Image, character_id: str) -> None:
    """打印拳心量取结果与可直接粘贴的 `gripAnchor` 字面量。

    **以几何法为准**，皮肤色质心只作交叉校验。理由是量法必须对五名角色都成立：
    堡垒的厚手甲与破阵者的全副装具根本检不出皮肤，鹰眼的黑色射击手套只露指缝一小片
    （产物实测皮肤仅占主体 1%），那一小片必然位于拳头最前端，其质心被系统性地推向
    轮廓前缘。守望者是唯一皮肤簇足够大的角色，拿它一个人的量法去定五个人的锚点，
    换来的是四个角色各自偏一点点、而且没人看得出为什么。

    两种量法在有皮肤时是同解的，这是可以核对的：守望者产物 `13.65/+0.05`（几何）对
    `13.04/-1.00`（皮肤），相差 `0.61/1.05px`；鹰眼产物相差 `1.14/0.59px`。
    都在 1px 量级以内，乘 `GENERATED_SPRITE_SCALE 1.15` 也就 1 逻辑像素出头。
    因此守望者已落地的 `{forward: 13, boreSide: -1}`（当初按皮肤色量的）保持不动，
    不为了对齐量法去改一个已经实景验收过的值。

    delta 超过 2px 时会告警：那说明前缘窄带里进来的不是手，而是袖口、肘部或背挂装备，
    此时两种量法都不可信，应当回去看图而不是照抄数字。
    """
    grip = measure_grip(sprite)
    print(
        f"\n拳心量取（几何法，采用）：前缘带 {grip['band']}px，{grip['samples']} 个采样点  "
        f"forward {grip['forward']:+.2f}px  boreSide {grip['boreSide']:+.2f}px"
    )
    if grip["skinForward"] is None:
        print("  皮肤色交叉校验: 未检出皮肤簇（戴手套或全副装具），无法校验")
    else:
        delta_forward = abs(grip["skinForward"] - grip["forward"])
        delta_bore = abs(grip["skinBoreSide"] - grip["boreSide"])
        print(
            f"  皮肤色交叉校验: forward {grip['skinForward']:+.2f}px "
            f"boreSide {grip['skinBoreSide']:+.2f}px"
            f"（相差 {delta_forward:.2f} / {delta_bore:.2f}px）"
        )
        if max(delta_forward, delta_bore) > 2:
            print(
                "  !! 两种量法相差超过 2px：前缘窄带里很可能不是手而是袖口/肘部/背挂装备，"
                "回去看图再定锚点，不要照抄"
            )
    print(
        f"\n写回 src/config/characters.ts 的 {character_id}：\n"
        f"  gripAnchor: {{ forward: {round(grip['forward'] * 2) / 2:g},"
        f" boreSide: {round(grip['boreSide'] * 2) / 2:g} }},\n"
        "  spriteScale: GENERATED_SPRITE_SCALE,\n"
        "  handTextureKey: null,  // 自生成精灵自带握拳的手，不叠手层"
    )


def load_character_spec(character_id: str) -> tuple[dict, dict]:
    specs = json.loads(SPEC_PATH.read_text(encoding="utf-8"))
    if character_id not in specs["characters"]:
        known = ", ".join(sorted(specs["characters"]))
        raise SystemExit(f"未登记的角色 id: {character_id}。已登记: {known}")
    return specs["characters"][character_id], specs["shared"]


def adopt_sprite_source(spec: dict, version: str) -> Path:
    """把 TmpGenerate 候选复制到 generated 归档目录的稳定命名。

    两张都归档（身份参考图 + 精灵）：参考图是精灵能复现的前提，只留精灵的话
    下次想微调就得从零重开一条 I2I 链。
    """
    GENERATED_DIR.mkdir(parents=True, exist_ok=True)
    adopted: dict[str, Path] = {}
    for key in ("reference", "sprite"):
        source = TEMP_DIR / f"{spec['candidateSlug']}-{CANDIDATE_SUFFIX[key]}-{version}.png"
        if not source.exists():
            raise FileNotFoundError(f"缺少候选图：{source}")
        target = GENERATED_DIR / f"{spec['sourcePrefix']}_{ARCHIVE_SUFFIX[key]}.png"
        shutil.copy2(source, target)
        adopted[key] = target
        print(f"adopted {source.name} -> {target.name} sha256={sha256(target)[:16]}")
    return adopted["sprite"]


def archive_sprite_source(spec: dict) -> Path:
    path = GENERATED_DIR / f"{spec['sourcePrefix']}_{ARCHIVE_SUFFIX['sprite']}.png"
    if not path.exists():
        raise FileNotFoundError(f"缺少归档源图：{path}")
    print(f"archive {path.name} sha256={sha256(path)[:16]}")
    return path


def build_sprite(character_id: str, version: str | None, from_archive: bool) -> None:
    """把实机精灵候选处理为运行时产物。

    与感染体的差别只有一点：角色是单张静态图，没有帧条也没有方向表，所以
    resolve_shared_scale 只对这一张求系数。键控、去色溢、LANCZOS 降采样与
    居中放置全部走感染体管线的现成函数。
    """
    spec, shared = load_character_spec(character_id)
    frame_size = shared["frameSize"]
    target = shared["targetSubject"]
    print(f"目标: {spec['displayName']}  帧 {frame_size}  目标主体 {target}")

    source = archive_sprite_source(spec) if from_archive else adopt_sprite_source(spec, version)

    keyed = remove_magenta_background(Image.open(source), shared)
    scale = resolve_shared_scale([keyed], target)
    print(f"缩放系数 = {scale:.4f}（降采样，绝不放大）")
    sprite = place_subject(keyed, scale, frame_size)

    bbox = alpha_bbox(sprite)
    if bbox is None:
        raise ValueError("产物没有检测到非透明主体")
    left, top, right, bottom = bbox
    if min(left, top, frame_size - right, frame_size - bottom) < 3:
        raise ValueError(f"产物主体贴边：{bbox}")
    if sprite.getpixel((0, 0))[3] != 0:
        raise ValueError("产物左上角不是透明像素")

    # 残留洋红核查。原产物有 128 个洋红像素导致深色 UI 上出现紫边，
    # 这里在写盘前把它变成硬失败而不是留给肉眼发现。
    width, height = sprite.size
    pixels = list(sprite.getdata())
    spill = sum(
        1 for red, green, blue, alpha in pixels
        if alpha > 8 and red > 90 and blue > 90 and green < min(red, blue) - 25
    )
    opaque = sum(1 for pixel in pixels if pixel[3] > 8)
    if spill:
        raise ValueError(f"产物仍残留 {spill}/{opaque} 个洋红像素，去色溢未生效")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    output_path = OUTPUT_DIR / f"sprite-{spec['outputPrefix']}.png"
    sprite.save(output_path, format="PNG", optimize=True)
    print(f"{output_path.name}: {width}x{height} RGBA sha256={sha256(output_path)}")

    subject_w = right - left
    subject_h = bottom - top
    print(
        f"产物主体实测 {subject_w}x{subject_h}"
        f"（宽高比 {subject_w / subject_h:.2f}，洋红残留 0/{opaque}）"
    )
    # 缩放核对指向 characters.ts 的 GENERATED_SPRITE_SCALE，不是 Player.ts：
    # 人物层倍率已经按角色搬进配置（理由见 CharacterDef.spriteScale），
    # Player.ts 上早就没有 PLAYER_SPRITE_SCALE 这个常量了。
    print(
        f"\n体量核对: 主体高 {subject_h}px x GENERATED_SPRITE_SCALE 1.15 = "
        f"{subject_h * 1.15:.1f} 逻辑像素"
        f"（其余四人 Kenney 43px x 1.08 ≈ 46，偏差 {subject_h * 1.15 - 46:+.1f}px）"
    )
    report_grip(sprite, character_id)


def resize_rgba_premultiplied(image: Image.Image, height: int) -> Image.Image:
    """按目标高度等比降采样 RGBA 图，走预乘 alpha。

    **必须预乘。** 归档立绘透明区的 RGB 仍然是洋红（实测 `(250, 5, 246)`，
    键控只压了 alpha 没有改 RGB）。直接对 RGBA 做 LANCZOS 会把这些洋红按权重
    混进主体边缘像素，等于重新制造 `remove_magenta_background` 文档串里
    记的那条紫边——那次是"深色战场上的紫边"，这次会是深色侧栏上的紫边。

    预乘后透明像素对加权和的贡献是 0，边缘只会与真实的半透明主体像素混合。
    """
    source = image.convert("RGBA")
    red, green, blue, alpha = source.split()
    # ImageChops.multiply 算的是 a * b / 255，正好是预乘。
    premultiplied = [ImageChops.multiply(channel, alpha) for channel in (red, green, blue)]

    width = max(1, round(source.width * height / source.height))
    box = (width, height)
    resized = [channel.resize(box, Image.LANCZOS) for channel in premultiplied]
    resized_alpha = alpha.resize(box, Image.LANCZOS)

    # 还原预乘。纯 Python 循环足够：目标只有约 11 万像素。
    channels = [channel.load() for channel in resized]
    alpha_pixels = resized_alpha.load()
    for y in range(height):
        for x in range(width):
            a = alpha_pixels[x, y]
            if a == 0:
                # 全透明像素的 RGB 清成黑色而不是留洋红，避免下游再被同一问题咬。
                for channel in channels:
                    channel[x, y] = 0
                continue
            if a == 255:
                continue
            for channel in channels:
                channel[x, y] = min(255, round(channel[x, y] * 255 / a))

    return Image.merge("RGBA", (*resized, resized_alpha))


def count_visible_magenta(image: Image.Image, shared: dict) -> int:
    """统计仍然可见的洋红像素。判据与 remove_magenta_background 逐字一致。"""
    min_floor = shared["magentaMinFloor"]
    min_chroma = shared["magentaMinChroma"]
    max_skew = shared["magentaMaxRbSkew"]

    total = 0
    for red, green, blue, alpha in image.convert("RGBA").getdata():
        if alpha <= 8:
            continue
        floor = red if red < blue else blue
        if floor >= min_floor and floor - green >= min_chroma and abs(red - blue) <= max_skew:
            total += 1
    return total


def portrait_archive_path(spec: dict) -> Path:
    """图 A 归档源图路径。

    命名默认是脚本期的 `<Prefix>_portrait.png`，与 `<Prefix>_sprite.png` 同构。
    守望者母版沿用 2026-08-18 的旧命名，由 spec 的 `portraitArchiveName` 声明覆盖。
    判读逻辑与 `inspect_character_candidates.py` 的同名函数逐字相同——两处各写一个
    `if character_id == "watcher"` 必然漂移。
    """
    return GENERATED_DIR / spec.get("portraitArchiveName", f"{spec['sourcePrefix']}_portrait.png")


def adopt_portrait_source(spec: dict, version: str) -> Path:
    """把 TmpGenerate 的图 A 候选复制到 generated 归档目录的稳定命名。

    图 A 只有一张，没有身份参考图要一起归档——与图 B 不同，图 A 的风格锚点是
    守望者母版本身，全五人共用，不存在per角色的 I2I 链需要复现。
    """
    GENERATED_DIR.mkdir(parents=True, exist_ok=True)
    source = TEMP_DIR / f"{spec['candidateSlug']}-portrait-{version}.png"
    if not source.exists():
        raise FileNotFoundError(f"缺少候选图：{source}")
    target = portrait_archive_path(spec)
    shutil.copy2(source, target)
    print(f"adopted {source.name} -> {target.name} sha256={sha256(target)[:16]}")
    return target


def build_portrait(character_id: str, version: str | None, from_archive: bool) -> None:
    """把图 A 候选处理为运行时产物：键控去色溢 -> 裁到主体 -> 补留边 -> 降采样。

    与 `portrait-downsample` 分支的分工：那一条的输入是**已抠图**的守望者归档，
    只解决体积，刻意不重新键控也不裁主体（理由见该函数文档串）。本分支的输入是
    **洋红直出原图**，走完整条链，是其余四人图 A 的正式管线。

    四步都不是可选的，各自解决一个实测过的缺陷：

    1. `remove_magenta_background` 复用感染体管线，不在这里重写。那套 BFS 去色溢带
       是按真实紫边样本调过的，两处各写一份必然漂移。
    2. **裁到主体**。生图候选是方图（母版实测 2048x2048），主体只占宽度的 43%，
       不裁就等于把大半张透明画布打进包体，而且战前整备页按 `min(188/w, 230/h)`
       装框——画幅越宽，人物被算得越小，五个人会一会儿大一会儿小。
    3. **按主体高补一圈留边**。比例取 `portraitMarginRatio`，按**主体高**而不是按画幅算，
       理由见 spec 的 _portraitOutputNote：候选的画幅与主体占比每张都不同。
    4. `resize_rgba_premultiplied` 必须预乘（函数文档串记了那条紫边），
       且必须在去色溢**之后**做（先降采样等于先把污染摊开再擦）。

    产物几何是"逐像素复现守望者已落地产物"：母版走这条链得到 228x480、主体 218x470、
    四边 5px，与在用的 `portrait-watcher.png` 一致。这不是巧合，是 `portraitMarginRatio`
    按母版反算出来的，也正是五张立绘能在展示区里体量一致的原因。
    """
    spec, shared = load_character_spec(character_id)
    runtime_height = shared["portraitRuntimeHeight"]
    margin_ratio = shared["portraitMarginRatio"]
    print(f"目标: {spec['displayName']}  图 A 战前档案立绘  运行时高 {runtime_height}")

    source_path = portrait_archive_path(spec) if from_archive else adopt_portrait_source(spec, version)
    source = Image.open(source_path)
    print(f"  源图 {source.width}x{source.height}  {source_path.stat().st_size / 1024:.0f} KB  {source_path.name}")

    keyed = remove_magenta_background(source, shared)
    print(f"  键控后可见洋红 {count_visible_magenta(keyed, shared)} 像素")

    bbox = alpha_bbox(keyed)
    if bbox is None:
        raise SystemExit("键控后没有检测到非透明主体，源图可能整张都是键控色")
    left, top, right, bottom = bbox
    subject_w = right - left
    subject_h = bottom - top
    print(f"  主体 {subject_w}x{subject_h}（宽高比 {subject_w / subject_h:.3f}）")

    margin = max(1, round(subject_h * margin_ratio))
    canvas = Image.new("RGBA", (subject_w + margin * 2, subject_h + margin * 2), (0, 0, 0, 0))
    canvas.alpha_composite(keyed.crop(bbox), (margin, margin))
    print(f"  裁到主体并补留边 {margin}px -> {canvas.width}x{canvas.height}")

    resized = resize_rgba_premultiplied(canvas, runtime_height)

    # 门禁必须在写盘**之前**跑。sprite 分支就是这个顺序（先校验再 save），
    # 先写后校验会让一张不合格的产物留在运行时目录里，而报错信息在下一次
    # `npm run build` 之前没人会再看到——等于门禁形同虚设。
    #
    # 判据作用域是「去色溢够得到的那一圈」，不是整张图：理由与实测见
    # magenta_by_edge_distance 的文档串（堡垒的暗红标志色与键控色色相相邻）。
    fringe, interior = magenta_by_edge_distance(resized, shared)
    print(
        f"  可见洋红像素: 边缘 {len(fringe)}（门禁，必须为 0，作用域 <= despillBand"
        f" {shared['despillBand']}px）  主体内部 {len(interior)}（仅提示）"
    )
    if interior:
        print(
            f"    内部像素到透明区距离 {sorted(set(interior))}，"
            f"这些是画在人物身上、色相落进键控带的颜料（堡垒的暗红 #D9574E 就是一例），"
            f"\n    去色溢本来就够不到、也不该动它们；它们会拿到偏低的 alpha 而不是被抠成洞。"
        )
    if fringe:
        raise SystemExit(
            f"产物边缘仍有 {len(fringe)} 个可见洋红像素（距离 {sorted(fringe)}），"
            f"深色侧栏上会是紫边，未写盘。\n"
            f"这是键控没做干净的边缘残留——真残留实测 154/155 集中在距离 1、"
            f"亮洋红且 alpha 很低。\n"
            f"递增版本重新生成，不要手工改图。"
        )
    magenta = len(fringe)

    product_bbox = alpha_bbox(resized)
    if product_bbox is None:
        raise SystemExit("产物没有检测到非透明主体")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    output_path = OUTPUT_DIR / f"portrait-{spec['outputPrefix']}.png"
    resized.save(output_path, optimize=True)

    pl, pt, pr, pb = product_bbox
    display_scale = min(188 / resized.width, 230 / resized.height)
    print(
        f"  产物 {resized.width}x{resized.height}  {output_path.stat().st_size / 1024:.0f} KB"
        f"  {output_path.name}  sha256={sha256(output_path)[:16]}"
    )
    print(
        f"  产物主体 {pr - pl}x{pb - pt}"
        f"  留边 左{pl} 上{pt} 右{resized.width - pr} 下{resized.height - pb}"
    )
    print(
        f"  展示 {resized.width * display_scale:.1f}x{resized.height * display_scale:.1f} 逻辑像素"
        f"（物理上限 x2 = {resized.width * display_scale * 2:.0f}x{resized.height * display_scale * 2:.0f}）"
    )
    print(f"  可见洋红像素 {magenta}（边缘，门禁，必须为 0）")
    print(
        "\n下一步: 把 PreloadScene 里该角色的 load.svg 换成 load.image，"
        "再按 CHARACTER_PORTRAIT_PROMPTS.md 10.1 肉眼过一遍"
    )


def magenta_by_edge_distance(image: Image.Image, shared: dict) -> tuple[list[int], list[int]]:
    """把可见洋红像素按「到透明区的距离」分成边缘残留与主体内部两组。

    **为什么必须分开看，而不是一个总数判死，由堡垒图 A 逼出来。**

    这条门禁的目的写在 build_portrait_downsample 里：防止深色侧栏上出现**紫边**——
    那是键控没做干净留下的**边缘**artifact。`remove_magenta_background` 的去色溢也正是
    按「到背景的距离」限制作用范围的，上限就是 shared 的 `despillBand`（3px）。
    所以判据的作用域本来就该是「去色溢够得到的那一圈」。

    堡垒的问题是他的标志色暗红 `#D9574E` 与键控色**在色相上相邻**：键控判据是
    `min(R,B) >= 110 且 min(R,B) - G >= 38 且 |R-B| <= 96`，而暗红压暗后的像素
    （实测 `(160,14,112)`：floor 112、chroma 98、skew 48）三条全中。这些像素并不会被
    抠成洞——`remove_magenta_background` 对 chroma 38~118 的像素给的是**渐变 alpha**，
    所以它们变成了半透明（实测 alpha 194 / 206 / 255 不等），而不是 alpha 0。

    实测数据（同一条降采样链，距离单位是产物像素）：
        真边缘残留（守望者归档不跑去色溢）  155 px，其中 **154 px 距离为 1**，
                                            颜色是亮洋红 `(163~210, 0~13, 184~228)`，alpha 17~26
        堡垒 v03                            1 px，距离 **7**，`(160,14,112,194)`
        堡垒 v04                            6 px，距离 **3 / 10 / 10 / 10 / 10 / 11**

    两组在距离上分得很干净，而且**颜色与 alpha 也分得开**（亮洋红低 alpha 对暗红高 alpha）。
    但颜色本身不能当判据：实测真残留的 floor 落在 110~182，与堡垒那颗 112 完全重叠，
    这一点试过并否掉了。距离才是可用的那一维，而它的阈值不用另挑——直接用 `despillBand`。

    **递增版本重新生成解决不了这个问题**，这也是必须改判据而不是再抽一张的理由：
    v03 是 1 px、v04 反而是 6 px，波动方向是随机的，而暗红是该角色设定要求的主色
    （CHARACTER_PORTRAIT_PROMPTS.md 第 6 节），不可能让他不用暗红。

    返回 (边缘残留距离列表, 内部像素距离列表)。调用方对前者判失败、对后者只作提示。
    """
    band = shared["despillBand"]
    width, height = image.size
    pixels = image.convert("RGBA").load()

    min_floor = shared["magentaMinFloor"]
    min_chroma = shared["magentaMinChroma"]
    max_skew = shared["magentaMaxRbSkew"]

    # 从透明区向内做四邻域 BFS，得到每个像素到透明区的距离。
    unreached = width * height + 1
    distance = [unreached] * (width * height)
    queue: deque[int] = deque()
    for y in range(height):
        row = y * width
        for x in range(width):
            if pixels[x, y][3] <= 8:
                distance[row + x] = 0
                queue.append(row + x)
    while queue:
        index = queue.popleft()
        x, y = index % width, index // width
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= nx < width and 0 <= ny < height:
                neighbour = ny * width + nx
                if distance[neighbour] == unreached:
                    distance[neighbour] = distance[index] + 1
                    queue.append(neighbour)

    fringe: list[int] = []
    interior: list[int] = []
    for y in range(height):
        for x in range(width):
            red, green, blue, alpha = pixels[x, y]
            if alpha <= 8:
                continue
            floor = red if red < blue else blue
            if floor >= min_floor and floor - green >= min_chroma and abs(red - blue) <= max_skew:
                (fringe if distance[y * width + x] <= band else interior).append(
                    distance[y * width + x]
                )
    return fringe, interior


def build_portrait_downsample(character_id: str) -> None:
    """把已抠图的图 A 归档降采样成运行时产物。

    这条分支存在的理由与 `sprite` 分支完全同类：`portrait-watcher.png` 原本是
    2026-08-18 手工导入的 920x1933 / 2.9MB 文件，不由任何脚本产出，因此既无法
    复现也没人拦得住它的体积。而它在战前整备页最多只占 219x460 物理像素
    （展示区 188x230、相机 zoom 上限 2），约 4.2 倍线性过采样——
    一张立绘就占掉近 3MB 首屏带宽。

    输入是**已抠图**的归档（`*_portrait_keyed.png`），不是洋红直出原图
    （`portrait-watcher-raw.png`，2048x2048 RGB）。刻意不从直出原图重新键控：
    那会连带改变边缘与去色溢结果，等于在"只解决体积"之外偷偷改观感，
    而且直出原图按 CHARACTER_PORTRAIT_PROMPTS.md 4.2 已因双脚缺失被淘汰。
    五人图 A 正式补齐时会走新管线整体重做，那时再从直出原图起算。

    同理**不裁到主体**：归档图带 24px 透明边距，裁掉会让人物在展示区从
    224px 长到 230px。本轮只改分辨率，展示观感逐像素等价。

    降采样前会补跑一遍 `remove_magenta_background`。这不是多余步骤：手工导入的
    归档图实测有 2840 个可见洋红像素（含 alpha=255 的不透明边缘），
    与 `sprite` 分支文档串里记的 128 个残留是同一类缺陷——那张图也从没过去色溢。
    必须在降采样**之前**做：这些洋红在不透明像素上，LANCZOS 会把它们摊到邻居上，
    先降采样再去色溢等于先把污染抹开再擦。
    """
    spec, shared = load_character_spec(character_id)
    source_path = GENERATED_DIR / f"{spec['sourcePrefix']}_portrait_keyed.png"
    if not source_path.exists():
        raise SystemExit(
            f"缺少已抠图归档：{source_path}\n"
            f"（{spec['displayName']} 的图 A 可能还是 Kenney 矢量占位，走 portraits 分支）"
        )

    source = Image.open(source_path).convert("RGBA")
    output_path = OUTPUT_DIR / f"portrait-{spec['outputPrefix']}.png"
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    print(f"目标: {spec['displayName']}  图 A 运行时降采样")
    source_magenta = count_visible_magenta(source, shared)
    print(f"  源图 {source.width}x{source.height}  {source_path.stat().st_size / 1024:.0f} KB  {source_path.name}")
    print(f"  源图可见洋红 {source_magenta} 像素，去色溢中...")
    despilled = remove_magenta_background(source, shared)
    print(f"  去色溢后可见洋红 {count_visible_magenta(despilled, shared)} 像素")

    resized = resize_rgba_premultiplied(despilled, PORTRAIT_RUNTIME_HEIGHT)
    resized.save(output_path, optimize=True)

    source_kb = source_path.stat().st_size / 1024
    output_kb = output_path.stat().st_size / 1024
    magenta = count_visible_magenta(resized, shared)

    print(f"  产物 {resized.width}x{resized.height}  {output_kb:.0f} KB  {output_path.name}")
    print(f"  体积 {(1 - output_kb / source_kb) * 100:.1f}% 降幅")
    # 展示尺寸必须与降采样前逐像素一致：等比缩放不改变 min(188/w, 230/h) 的结果。
    display_scale = min(188 / resized.width, 230 / resized.height)
    print(
        f"  展示 {resized.width * display_scale:.1f}x{resized.height * display_scale:.1f} 逻辑像素"
        f"（物理上限 x2 = {resized.width * display_scale * 2:.0f}x{resized.height * display_scale * 2:.0f}）"
    )
    print(f"  可见洋红像素 {magenta}（门禁，必须为 0）")
    if magenta > 0:
        raise SystemExit(f"降采样后仍有 {magenta} 个可见洋红像素，深色侧栏上会是紫边")


def main() -> None:
    parser = argparse.ArgumentParser(description="角色美术后处理")
    subparsers = parser.add_subparsers(dest="command")
    subparsers.add_parser("portraits", help="从 Kenney 矢量源生成档案立绘 SVG（默认）")
    sprite_parser = subparsers.add_parser("sprite", help="处理关卡内实机精灵候选")
    sprite_parser.add_argument("character_id", help="角色 id，如 watcher")
    sprite_parser.add_argument("--version", default=None, help="TmpGenerate 候选版本，如 v03")
    sprite_parser.add_argument(
        "--from-archive",
        action="store_true",
        help="直接用 generated 归档源图，跳过采用步骤（回归核对用）",
    )
    grip_parser = subparsers.add_parser(
        "grip",
        help="只量取已落地产物的拳心，不重新处理（写回 gripAnchor 与回归核对用）",
    )
    grip_parser.add_argument("character_id", help="角色 id，如 watcher")
    downsample_parser = subparsers.add_parser(
        "portrait-downsample",
        help="把已抠图的图 A 归档按展示尺寸降采样成运行时产物",
    )
    downsample_parser.add_argument("character_id", help="角色 id，如 watcher")
    portrait_parser = subparsers.add_parser(
        "portrait",
        help="处理图 A 战前档案立绘候选（洋红直出原图 -> 运行时 PNG）",
    )
    portrait_parser.add_argument("character_id", help="角色 id，如 eagle-eye")
    portrait_parser.add_argument("--version", default=None, help="TmpGenerate 候选版本，如 v01")
    portrait_parser.add_argument(
        "--from-archive",
        action="store_true",
        help="直接用 generated 归档源图，跳过采用步骤（回归核对用）",
    )
    args = parser.parse_args()

    if args.command == "portrait":
        version = args.version
        if not version and not args.from_archive:
            raise SystemExit("需要 --version，或改用 --from-archive")
        build_portrait(args.character_id, version, args.from_archive)
        return

    if args.command == "portrait-downsample":
        build_portrait_downsample(args.character_id)
        return

    if args.command == "sprite":
        version = args.version
        if not version and not args.from_archive:
            raise SystemExit("需要 --version，或改用 --from-archive")
        build_sprite(args.character_id, version, args.from_archive)
        return

    if args.command == "grip":
        spec, _ = load_character_spec(args.character_id)
        path = OUTPUT_DIR / f"sprite-{spec['outputPrefix']}.png"
        if not path.exists():
            raise SystemExit(f"缺少产物：{path}")
        print(f"目标: {spec['displayName']}  产物 {path.name}")
        report_grip(Image.open(path).convert("RGBA"), args.character_id)
        return

    # 无子命令时保持原有行为，既有 `npm run assets:characters` 不受影响。
    build_portraits()


if __name__ == "__main__":
    main()
