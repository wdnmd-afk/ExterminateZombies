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

用法：
    python scripts/process_character_assets.py
    python scripts/process_character_assets.py portraits
    python scripts/process_character_assets.py sprite watcher --version v03
    python scripts/process_character_assets.py sprite watcher --from-archive
"""

import argparse
import hashlib
import json
import re
import shutil
import warnings
import xml.etree.ElementTree as ElementTree
from pathlib import Path

from PIL import Image

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
    print(
        "\n下一步: 按下面的实测值核对 Player.ts 的 PLAYER_SPRITE_SCALE，"
        f"使可见高度与其余四人（Kenney 43px x 1.08 ≈ 46 逻辑像素）一致：\n"
        f"  建议 PLAYER_SPRITE_SCALE = 46 / {subject_h} = {46 / subject_h:.3f}"
    )


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
    args = parser.parse_args()

    if args.command == "sprite":
        version = args.version
        if not version and not args.from_archive:
            raise SystemExit("需要 --version，或改用 --from-archive")
        build_sprite(args.character_id, version, args.from_archive)
        return

    # 无子命令时保持原有行为，既有 `npm run assets:characters` 不受影响。
    build_portraits()


if __name__ == "__main__":
    main()
