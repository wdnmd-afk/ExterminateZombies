"""从 Kenney Topdown Shooter 矢量源提取五名角色的战前档案立绘。

战前整备页需要在约 188x230 的展示区显示角色，而实机精灵只有 35-38 x 43，
放大约 5 倍必然粗糙。Kenney 同一素材包内附带 `Vector/vector_characters.svg`
矢量源（CC0），本脚本从中切出五名已接入角色的 `hold` 姿态，各自生成一个独立
SVG。运行时由 Phaser 的 `load.svg` 按目标倍率矢量栅格化，因此档案立绘不存在
放大失真，且与实机精灵同源、画风完全一致。

矢量源布局（已核对）：`<defs>` 内每个 `Layer0_<N>_MEMBER_<M>_FILL` 是一个填充
层，`Layer0_<N>` 为一个独立姿态；54 个姿态排成 9 角色 x 6 姿态的规整网格，
所有姿态右边界对齐。每个姿态固定三层：MEMBER_0 为俯视投影阴影、MEMBER_1 为
手臂底层、MEMBER_2 为身体主体，三层全部保留以维持与实机一致的观感。
"""

import re
import xml.etree.ElementTree as ElementTree
from pathlib import Path

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


def main() -> None:
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


if __name__ == "__main__":
    main()
