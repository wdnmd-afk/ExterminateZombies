"""Runner 生图候选的量化检视工具。

用途：本机图片查看不可用时，用可量化指标替代目检，先筛掉明显不可用的候选，
避免把废图带进正式资源目录。检查项覆盖真实出现过的失败模式：
键控底被画成渐变、要求四帧却只画一个人、主体贴边裁切、四帧之间身份/尺寸漂移、
2×2 中缝被画上分隔线、以及一格里混进多个角色。

本脚本只读候选文件，不做任何写入或修改。
"""

from __future__ import annotations

import argparse
import hashlib
import warnings
from collections import deque
from pathlib import Path

from PIL import Image, ImageChops

# Pillow 12 对 getdata 标了弃用；这里只做只读像素遍历，噪声警告会淹没检视结论。
warnings.filterwarnings("ignore", category=DeprecationWarning, module="PIL")

# 自镜像对称度判据。侧面必须明显不对称，正面/背面必须明显对称。
# 基准来自已验收的 Walker 方向表：left/right 0.216、down 0.878、up 0.761。
# 正/背面下限取 0.62 而不是贴着 Walker 的 0.761：Walker 是慢速拖行，Runner 是冲刺，
# 四肢伸展幅度更大，正/背面本身就会比拖行姿态更不对称。判据的作用是区分
# "正/背面 vs 侧面"，0.62 相对侧面档 0.216-0.26 仍有充足间距；是否为干净正/背面
# 还需配合 down-vs-up 轮廓 IoU 一起看，单一指标不足以定论。
SYMMETRY_SIDE_MAX = 0.45
SYMMETRY_FACING_MIN = 0.62

ROOT = Path(__file__).resolve().parents[1]

# 与 process_runner_assets.py 保持同一套键控判定，保证"检视通过"等价于"处理可用"。
MAGENTA_MIN_FLOOR = 110
MAGENTA_MIN_CHROMA = 38
MAGENTA_MAX_RB_SKEW = 96

# 连通域分析用的降采样边长。形态判定不需要全分辨率，纯 Python BFS 在此规模下足够快。
ANALYSIS_SIZE = 300
# 低于此像素占比的连通域视为噪点碎屑，不计入角色计数。
COMPONENT_NOISE_RATIO = 0.004


def sha256_short(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()[:16]


def is_key_pixel(r: int, g: int, b: int) -> bool:
    floor = r if r < b else b
    return (
        floor >= MAGENTA_MIN_FLOOR
        and (floor - g) >= MAGENTA_MIN_CHROMA
        and abs(r - b) <= MAGENTA_MAX_RB_SKEW
    )


def magenta_mask(image: Image.Image) -> Image.Image:
    """返回 L 模式掩码：255 = 键控底，0 = 主体。"""
    rgb = image.convert("RGB")
    pixels = list(rgb.getdata())
    mask = Image.new("L", rgb.size)
    mask.putdata([255 if is_key_pixel(r, g, b) else 0 for r, g, b in pixels])
    return mask


def subject_bbox(mask: Image.Image) -> tuple[int, int, int, int] | None:
    return mask.point(lambda v: 0 if v == 255 else 255).getbbox()


def key_ratio(mask: Image.Image) -> float:
    histogram = mask.histogram()
    return histogram[255] / (mask.size[0] * mask.size[1])


def analyze_components(mask: Image.Image) -> list[dict]:
    """在降采样掩码上做四邻域连通域标记，返回按面积降序的主体块。"""
    small = mask.resize((ANALYSIS_SIZE, ANALYSIS_SIZE), Image.Resampling.NEAREST)
    width, height = small.size
    # 主体像素为 0；转成布尔列表便于索引。
    solid = [value != 255 for value in small.getdata()]
    seen = [False] * (width * height)
    total = width * height
    components: list[dict] = []

    for start in range(total):
        if not solid[start] or seen[start]:
            continue
        queue = deque([start])
        seen[start] = True
        area = 0
        min_x = width
        max_x = -1
        min_y = height
        max_y = -1
        while queue:
            index = queue.popleft()
            x = index % width
            y = index // width
            area += 1
            if x < min_x:
                min_x = x
            if x > max_x:
                max_x = x
            if y < min_y:
                min_y = y
            if y > max_y:
                max_y = y
            if x > 0 and solid[index - 1] and not seen[index - 1]:
                seen[index - 1] = True
                queue.append(index - 1)
            if x + 1 < width and solid[index + 1] and not seen[index + 1]:
                seen[index + 1] = True
                queue.append(index + 1)
            if y > 0 and solid[index - width] and not seen[index - width]:
                seen[index - width] = True
                queue.append(index - width)
            if y + 1 < height and solid[index + width] and not seen[index + width]:
                seen[index + width] = True
                queue.append(index + width)
        components.append({
            "area_ratio": area / total,
            "bbox": (min_x, min_y, max_x + 1, max_y + 1),
            "width": max_x + 1 - min_x,
            "height": max_y + 1 - min_y,
        })

    components.sort(key=lambda item: item["area_ratio"], reverse=True)
    return components


def mass_profile(mask: Image.Image, buckets: int = 8) -> list[float]:
    """按行分桶统计主体像素占比，用于粗略判断质量分布（头重脚轻/横向铺开）。"""
    small = mask.resize((ANALYSIS_SIZE, ANALYSIS_SIZE), Image.Resampling.NEAREST)
    solid = [value != 255 for value in small.getdata()]
    rows_per_bucket = ANALYSIS_SIZE / buckets
    sums = [0] * buckets
    for y in range(ANALYSIS_SIZE):
        bucket = min(buckets - 1, int(y / rows_per_bucket))
        offset = y * ANALYSIS_SIZE
        sums[bucket] += sum(solid[offset:offset + ANALYSIS_SIZE])
    per_bucket_pixels = ANALYSIS_SIZE * ANALYSIS_SIZE / buckets
    return [value / per_bucket_pixels for value in sums]


def describe_cell(cell: Image.Image, label: str, indent: str = "  ") -> dict | None:
    mask = magenta_mask(cell)
    ratio = key_ratio(mask)
    bbox = subject_bbox(mask)
    if bbox is None:
        print(f"{indent}{label}: 整格没有主体（全部判为键控底）")
        return None

    left, top, right, bottom = bbox
    width = right - left
    height = bottom - top
    cell_w, cell_h = cell.size
    edge_gap = min(left, top, cell_w - right, cell_h - bottom)

    components = analyze_components(mask)
    significant = [c for c in components if c["area_ratio"] >= COMPONENT_NOISE_RATIO]
    aspect = width / height if height else 0
    symmetry = self_mirror_iou(mask)

    print(
        f"{indent}{label}: 主体 {width}x{height} (宽高比 {aspect:.2f}) "
        f"键控底 {ratio * 100:.1f}% 最小边距 {edge_gap}px 底部余量 {cell_h - bottom}px"
    )
    areas = ", ".join(f"{c['area_ratio'] * 100:.1f}%" for c in significant[:5])
    print(f"{indent}  连通域 {len(significant)} 个 (面积占比: {areas}) 自镜像对称度 {symmetry:.3f}")
    profile = " ".join(f"{v * 100:04.1f}" for v in mass_profile(mask))
    print(f"{indent}  纵向质量分布(上→下,%): {profile}")

    return {
        "bbox": bbox,
        "width": width,
        "height": height,
        "aspect": aspect,
        "key_ratio": ratio,
        "edge_gap": edge_gap,
        "bottom_gap": cell_h - bottom,
        "components": len(significant),
        "symmetry": symmetry,
    }


def self_mirror_iou(mask: Image.Image) -> float:
    """主体轮廓与自身水平镜像的 IoU，用于判定这一格画的是正/背面还是侧面。

    这是判断"方向到底画对了没有"的核心指标，别的指标都测不出来：
    俯视正面/背面左右大致对称，自镜像 IoU 高；俯视侧面强不对称，IoU 低。
    已验收的 Walker 实测为 down 0.878 / up 0.761 / left-right 0.216，
    v04 版 Runner 四行全是约 0.60，即四个方向画成了同一个朝向。
    """
    silhouette = mask.point(lambda v: 0 if v == 255 else 255)
    bbox = silhouette.getbbox()
    if bbox is None:
        return 0.0
    # 先按主体裁剪再镜像，排除主体在格内不居中带来的假性不对称。
    cropped = silhouette.crop(bbox)
    flipped = cropped.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    intersection = ImageChops.darker(cropped, flipped).histogram()[255]
    union = ImageChops.lighter(cropped, flipped).histogram()[255]
    return intersection / union if union else 0.0


def check_grid_lines(image: Image.Image) -> None:
    """检测 2×2 中缝是否被画上分隔线：中缝几乎不含键控底即为可疑。"""
    mask = magenta_mask(image)
    width, height = image.size
    mid_x = width // 2
    mid_y = height // 2
    column = mask.crop((mid_x - 1, 0, mid_x + 2, height))
    row = mask.crop((0, mid_y - 1, width, mid_y + 2))
    print(
        f"  中缝键控底: 竖 {key_ratio(column) * 100:.1f}%  横 {key_ratio(row) * 100:.1f}%"
    )
    if key_ratio(column) < 0.35 or key_ratio(row) < 0.35:
        print("  警告: 中缝键控底偏低，可能画了分隔线或四帧粘连")


def infer_orientation(name: str) -> str | None:
    """从文件名推断这张 2×2 图应该画哪个方向，用于选择对称度判据。"""
    lowered = name.lower()
    if "left" in lowered or "right" in lowered:
        return "side"
    if "down" in lowered or "up" in lowered:
        return "facing"
    return None


def inspect(path: Path, expect_grid: bool) -> None:
    image = Image.open(path)
    print(f"\n=== {path.name} ===")
    print(f"  尺寸 {image.size[0]}x{image.size[1]} {image.mode} sha256={sha256_short(path)}")

    if not expect_grid:
        result = describe_cell(image, "整图")
        if result and result["components"] > 1:
            print("  警告: 单帧图出现多个连通域，可能画了多个角色或残留碎屑")
        return

    expected_orientation = infer_orientation(path.name)

    if image.width != image.height or image.width % 2 != 0:
        print("  错误: 不是偶数边长正方形，无法按 2×2 切分")
        return

    check_grid_lines(image)
    cell = image.width // 2
    stats = []
    for label, x, y in [("左上", 0, 0), ("右上", cell, 0), ("左下", 0, cell), ("右下", cell, cell)]:
        result = describe_cell(image.crop((x, y, x + cell, y + cell)), label)
        if result:
            stats.append(result)

    if len(stats) != 4:
        print("  错误: 四格中存在空帧，候选不可用")
        return

    heights = [s["height"] for s in stats]
    widths = [s["width"] for s in stats]
    bottoms = [s["bottom_gap"] for s in stats]
    height_spread = (max(heights) - min(heights)) / max(heights)
    width_spread = (max(widths) - min(widths)) / max(widths)
    print(
        f"  四帧一致性: 高度差 {height_spread * 100:.1f}% 宽度差 {width_spread * 100:.1f}% "
        f"底部余量 {min(bottoms)}~{max(bottoms)}px"
    )
    if height_spread > 0.18:
        print("  警告: 四帧高度差过大，可能身份漂移或某帧缺脚")
    if min(s["edge_gap"] for s in stats) < 4:
        print("  警告: 存在贴边帧，可能已被裁切")
    if any(s["components"] > 1 for s in stats):
        print("  警告: 某帧含多个连通域，可能一格里画了多个角色")

    # 方向判定：按文件名推断这张图应该是哪个方向，再用对称度核对画得对不对。
    average_symmetry = sum(s["symmetry"] for s in stats) / len(stats)
    print(f"  平均自镜像对称度 {average_symmetry:.3f}")
    if expected_orientation == "side":
        if average_symmetry > SYMMETRY_SIDE_MAX:
            print(
                f"  失败: 侧向图对称度 {average_symmetry:.3f} 高于上限 {SYMMETRY_SIDE_MAX}，"
                "这不是俯视侧面（Walker 侧向实测 0.216）"
            )
        else:
            print("  通过: 侧向不对称程度符合俯视侧面特征")
    elif expected_orientation == "facing":
        if average_symmetry < SYMMETRY_FACING_MIN:
            print(
                f"  失败: 正/背面对称度 {average_symmetry:.3f} 低于下限 {SYMMETRY_FACING_MIN}，"
                "这不是干净的俯视正面或背面（Walker 实测 down 0.878 / up 0.761）"
            )
        else:
            print("  通过: 左右对称程度符合俯视正面或背面特征")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("paths", nargs="+", help="候选图路径")
    parser.add_argument(
        "--single",
        action="store_true",
        help="按单帧图检视（参考图、图鉴立绘用），默认按 2×2 四帧图检视",
    )
    args = parser.parse_args()

    for raw in args.paths:
        path = Path(raw)
        if not path.is_absolute():
            path = ROOT / path
        if not path.exists():
            print(f"\n=== {raw} ===\n  错误: 文件不存在")
            continue
        inspect(path, expect_grid=not args.single)


if __name__ == "__main__":
    main()
