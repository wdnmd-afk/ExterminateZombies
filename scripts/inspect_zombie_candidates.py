"""感染体生图候选的量化检视门控（按 id 取配置的共用管线）。

用途：本机图片查看不可用时，用可量化指标替代目检，先筛掉明显不可用的候选，
避免把废图带进正式资源目录。检查项覆盖真实出现过的失败模式：
键控底被画成渐变、要求四帧却只画一个人、主体贴边裁切、四帧之间身份/尺寸漂移、
2×2 中缝被画上分隔线、以及一格里混进多个角色。

键控判据与对称度阈值全部读 scripts/zombie_asset_specs.json 的 shared 段，与
process_zombie_sprites.py 共用同一套数字。一旦检视与后处理的判据脱钩，
"检视通过" 就不再等价于 "处理可用"。

本脚本只读候选文件，不做任何写入或修改；发现失败项时以退出码 1 结束，
可直接作为生成→处理之间的门控。

注意本脚本无法证明"每一行画的是它该画的那个方向"：自镜像对称度只能区分
"对称视图 vs 侧面"，而冲刺/长臂摆动姿态本身就会破坏正面的左右对称。
成品级朝向门控是 verify_directional_sheet.py 的行间轮廓 IoU。

用法：
    python scripts/inspect_zombie_candidates.py lurker --version v01
    python scripts/inspect_zombie_candidates.py lurker --version v01 --from-archive
    python scripts/inspect_zombie_candidates.py --paths TmpGenerate/foo.png --single
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import warnings
from collections import deque
from pathlib import Path

from PIL import Image, ImageChops

# Pillow 12 对 getdata 标了弃用；这里只做只读像素遍历，噪声警告会淹没检视结论。
# 必须按 message 过滤而不是按 module="PIL"：警告是在本文件的调用栈帧上抛出的，
# 按模块过滤匹配的是调用方而不是 Pillow，实测过滤不掉。
warnings.filterwarnings("ignore", message=r".*getdata is deprecated.*", category=DeprecationWarning)

ROOT = Path(__file__).resolve().parents[1]
SPEC_PATH = ROOT / "scripts" / "zombie_asset_specs.json"
TEMP_DIR = ROOT / "TmpGenerate"
GENERATED_DIR = ROOT / "src" / "assets" / "generated" / "zombies"

# 连通域分析用的降采样边长。形态判定不需要全分辨率，纯 Python BFS 在此规模下足够快。
ANALYSIS_SIZE = 300
# 低于此像素占比的连通域视为噪点碎屑，不计入角色计数。
COMPONENT_NOISE_RATIO = 0.004

# 2×2 图的检视顺序，与 process_zombie_sprites.py 的切帧顺序一致。
GRID_CELLS = (("左上", 0, 0), ("右上", 1, 0), ("左下", 0, 1), ("右下", 1, 1))

# 转身参考图的双指标判据阈值，标定说明见 inspect_turnaround()。
# 只有两项同时不足才判转身未生效；对称度对厚重体型会饱和，宽高比不会。
TURNAROUND_SYMMETRY_SPREAD_MIN = 0.15
TURNAROUND_ASPECT_SPREAD_MIN = 0.25

SINGLE_KEYS = ("reference", "portrait")
GRID_KEYS = ("left", "down", "up")

CANDIDATE_SUFFIX = {
    "reference": "direction-reference",
    "left": "left-4",
    "down": "down-4",
    "up": "up-4",
    "portrait": "portrait",
}

ARCHIVE_SUFFIX = {
    "reference": "direction_reference",
    "left": "left_4",
    "down": "down_4",
    "up": "up_4",
    "portrait": "portrait",
}


class Keying:
    """共享键控判据。数字来自 spec 的 shared 段，不在本文件里硬编码。"""

    def __init__(self, shared: dict) -> None:
        self.min_floor = shared["magentaMinFloor"]
        self.min_chroma = shared["magentaMinChroma"]
        self.max_skew = shared["magentaMaxRbSkew"]
        self.side_max = shared["symmetrySideMax"]
        self.facing_min = shared["symmetryFacingMin"]

    def is_key_pixel(self, red: int, green: int, blue: int) -> bool:
        floor = red if red < blue else blue
        return (
            floor >= self.min_floor
            and (floor - green) >= self.min_chroma
            and abs(red - blue) <= self.max_skew
        )

    def mask(self, image: Image.Image) -> Image.Image:
        """返回 L 模式掩码：255 = 键控底，0 = 主体。"""
        rgb = image.convert("RGB")
        mask = Image.new("L", rgb.size)
        mask.putdata([255 if self.is_key_pixel(r, g, b) else 0 for r, g, b in rgb.getdata()])
        return mask


def load_spec(zombie_id: str) -> tuple[dict, dict]:
    specs = json.loads(SPEC_PATH.read_text(encoding="utf-8"))
    if zombie_id not in specs["zombies"]:
        known = ", ".join(sorted(specs["zombies"]))
        raise SystemExit(f"未登记的感染体 id: {zombie_id}。已登记: {known}")
    return specs["zombies"][zombie_id], specs["shared"]


def sha256_short(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()[:16]


def subject_bbox(mask: Image.Image) -> tuple[int, int, int, int] | None:
    return mask.point(lambda v: 0 if v == 255 else 255).getbbox()


def key_ratio(mask: Image.Image) -> float:
    return mask.histogram()[255] / (mask.size[0] * mask.size[1])


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
        min_x, max_x, min_y, max_y = width, -1, height, -1
        while queue:
            index = queue.popleft()
            x = index % width
            y = index // width
            area += 1
            min_x = min(min_x, x)
            max_x = max(max_x, x)
            min_y = min(min_y, y)
            max_y = max(max_y, y)
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


def self_mirror_iou(mask: Image.Image) -> float:
    """主体轮廓与自身水平镜像的 IoU，用于判定这一格画的是正/背面还是侧面。

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


def describe_cell(
    cell: Image.Image,
    label: str,
    keying: Keying,
    failures: list[str],
    context: str,
    indent: str = "  ",
) -> dict | None:
    mask = keying.mask(cell)
    ratio = key_ratio(mask)
    bbox = subject_bbox(mask)
    if bbox is None:
        print(f"{indent}{label}: 整格没有主体（全部判为键控底）")
        failures.append(f"{context} {label} 为空格")
        return None

    left, top, right, bottom = bbox
    width = right - left
    height = bottom - top
    cell_w, cell_h = cell.size
    edge_gap = min(left, top, cell_w - right, cell_h - bottom)

    significant = [
        component for component in analyze_components(mask)
        if component["area_ratio"] >= COMPONENT_NOISE_RATIO
    ]
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
        "width": width,
        "height": height,
        "aspect": aspect,
        "key_ratio": ratio,
        "edge_gap": edge_gap,
        "bottom_gap": cell_h - bottom,
        "components": len(significant),
        "symmetry": symmetry,
    }


def check_grid_lines(image: Image.Image, keying: Keying, failures: list[str], context: str) -> None:
    """检测 2×2 中缝是否被画上分隔线：中缝几乎不含键控底即为可疑。"""
    mask = keying.mask(image)
    width, height = image.size
    mid_x = width // 2
    mid_y = height // 2
    column = key_ratio(mask.crop((mid_x - 1, 0, mid_x + 2, height)))
    row = key_ratio(mask.crop((0, mid_y - 1, width, mid_y + 2)))
    print(f"  中缝键控底: 竖 {column * 100:.1f}%  横 {row * 100:.1f}%")
    if column < 0.35 or row < 0.35:
        print("  警告: 中缝键控底偏低，可能画了分隔线或四帧粘连")
        failures.append(f"{context} 中缝键控底偏低（竖 {column:.2f} / 横 {row:.2f}）")


def expected_orientation(key: str) -> str | None:
    """这张 2×2 图应该画哪个方向，用于选择对称度判据。"""
    if key in ("left", "right"):
        return "side"
    if key in ("down", "up"):
        return "facing"
    return None


def inspect_single(path: Path, keying: Keying, failures: list[str]) -> None:
    image = Image.open(path)
    print(f"\n=== {path.name} ===")
    print(f"  尺寸 {image.size[0]}x{image.size[1]} {image.mode} sha256={sha256_short(path)}")
    result = describe_cell(image, "整图", keying, failures, path.name)
    if result and result["components"] > 1:
        print("  警告: 单帧图出现多个连通域，可能画了多个角色或残留碎屑")
        failures.append(f"{path.name} 单帧图有 {result['components']} 个连通域")


def inspect_turnaround(path: Path, keying: Keying, failures: list[str]) -> None:
    """四视图转身参考图。

    这张图与其它四张的判据都不同，必须单独处理：它本身就是一张 2×2 的四视图拼图，
    所以整图看会有 4 个连通域（按单帧图判会误报"画了多个角色"），而四格之间又
    分属侧面与正/背面两类，对称度判据不适用于任何单一档位。这里只检查
    "四个视图都在且都完整"，朝向正确性交给成品级的 verify_directional_sheet.py。
    """
    image = Image.open(path)
    print(f"\n=== {path.name} ===（四视图转身参考）")
    print(f"  尺寸 {image.size[0]}x{image.size[1]} {image.mode} sha256={sha256_short(path)}")

    if image.width != image.height or image.width % 2 != 0:
        print("  错误: 不是偶数边长正方形，无法按 2×2 切分")
        failures.append(f"{path.name} 不是偶数边长正方形")
        return

    check_grid_lines(image, keying, failures, path.name)
    cell = image.width // 2
    symmetries = []
    aspects = []
    for label, column, row in GRID_CELLS:
        crop = image.crop((column * cell, row * cell, (column + 1) * cell, (row + 1) * cell))
        result = describe_cell(crop, label, keying, failures, path.name)
        if result is None:
            continue
        symmetries.append(result["symmetry"])
        aspects.append(result["aspect"])
        if result["components"] > 1:
            print(f"    警告: {label} 含多个连通域，可能一格里画了多个角色")
            failures.append(f"{path.name} {label} 含多个连通域")
        if result["edge_gap"] < 4:
            failures.append(f"{path.name} {label} 贴边（边距 {result['edge_gap']}px）")

    if len(symmetries) != 4:
        return

    # 参考图是四方向的第一道信号：若四个视图彼此无差别，说明模型没有真正转身，
    # 后续四张大概率也会同朝向。
    #
    # 判据必须双指标合议，不能只看对称度跨度。原因与 symmetryGapMin 的标定同源：
    # 厚重/宽体角色从任何角度看轮廓都高度重叠，四视图的自镜像对称度会一起挤高，
    # 跨度自然变小。Tank v03 实测跨度仅 0.111，但四格宽高比是 0.98/0.58/0.58/0.97，
    # 两两成对、区分明确，转身其实是生效的——只看对称度会把合法样本判废。
    #
    # 宽高比对体型不敏感（它比的是同一角色不同视角的自身形变），因此用它作为
    # 第二指标：只有"对称度跨度不足且宽高比跨度也塌了"才判转身未生效。
    symmetry_spread = max(symmetries) - min(symmetries)
    aspect_spread = max(aspects) - min(aspects)
    print(
        f"  四视图对称度 {min(symmetries):.3f}~{max(symmetries):.3f} 跨度 {symmetry_spread:.3f}"
        f"；宽高比 {min(aspects):.2f}~{max(aspects):.2f} 跨度 {aspect_spread:.2f}"
    )
    if symmetry_spread >= TURNAROUND_SYMMETRY_SPREAD_MIN:
        return
    if aspect_spread >= TURNAROUND_ASPECT_SPREAD_MIN:
        print(
            f"  说明: 对称度跨度 {symmetry_spread:.3f} 偏小，但宽高比跨度 {aspect_spread:.2f} 充足，"
            "判定为厚重体型下对称度饱和而非转身未生效。"
        )
        return
    print("  警告: 四视图对称度与宽高比跨度双双不足，转身图可能没有真正区分侧面与正/背面")
    failures.append(
        f"{path.name} 四视图对称度跨度 {symmetry_spread:.3f} 且宽高比跨度 {aspect_spread:.2f}"
        "，双指标同时不足，转身可能未生效"
    )


def inspect_grid(path: Path, key: str | None, keying: Keying, failures: list[str]) -> None:
    image = Image.open(path)
    print(f"\n=== {path.name} ===")
    print(f"  尺寸 {image.size[0]}x{image.size[1]} {image.mode} sha256={sha256_short(path)}")

    if image.width != image.height or image.width % 2 != 0:
        print("  错误: 不是偶数边长正方形，无法按 2×2 切分")
        failures.append(f"{path.name} 不是偶数边长正方形")
        return

    check_grid_lines(image, keying, failures, path.name)
    cell = image.width // 2
    stats = []
    for label, column, row in GRID_CELLS:
        crop = image.crop((column * cell, row * cell, (column + 1) * cell, (row + 1) * cell))
        result = describe_cell(crop, label, keying, failures, path.name)
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
        failures.append(f"{path.name} 四帧高度差 {height_spread * 100:.1f}% 过大")
    if min(s["edge_gap"] for s in stats) < 4:
        print("  警告: 存在贴边帧，可能已被裁切")
        failures.append(f"{path.name} 存在贴边帧（最小边距 {min(s['edge_gap'] for s in stats)}px）")
    if any(s["components"] > 1 for s in stats):
        print("  警告: 某帧含多个连通域，可能一格里画了多个角色")
        failures.append(f"{path.name} 某帧含多个连通域")

    # 方向判定：绝对阈值只作为参考打印，判定交给 main() 的跨文件落差判据。
    # 见 check_orientation_gap() 的标定说明。
    orientation = expected_orientation(key) if key else None
    average = sum(s["symmetry"] for s in stats) / len(stats)
    print(f"  平均自镜像对称度 {average:.3f}")
    if orientation == "side":
        verdict = "在瘦削体型区间内" if average <= keying.side_max else (
            f"高于瘦削体型上限 {keying.side_max}，厚重体型下属预期，交由落差判据裁定"
        )
        print(f"  参考: {verdict}（Walker 侧向实测 0.216）")
    elif orientation == "facing":
        if average < keying.facing_min:
            print(
                f"  失败: 正/背面对称度 {average:.3f} 低于下限 {keying.facing_min}，"
                "这不是干净的俯视正面或背面（Walker 实测 down 0.878 / up 0.761）"
            )
            failures.append(f"{path.name} 正/背面对称度 {average:.3f} 低于下限 {keying.facing_min}")
        else:
            print("  通过: 左右对称程度符合俯视正面或背面特征")
    return {"key": key, "symmetry": average}


def check_orientation_gap(
    measured: dict[str, float],
    shared: dict,
    failures: list[str],
) -> None:
    """侧向与正/背面的自镜像对称度落差，是体型自归一化的朝向判据。

    为什么不用侧向的绝对值判定：`symmetrySideMax 0.45` 是按 Walker / Runner 这类
    瘦削体型标定的（Walker 侧向 0.216），对厚重体型系统性误报。实测三例：

        Bomber   v01（已采用、已接线）  侧向 0.535
        Bloodied v01                    侧向 0.550
        Headless v01                    侧向 0.600

    Bomber 至今仍过不了那条绝对阈值——一个对已验收素材报错的门控会被绕过，
    也就失去了门控的意义，而本脚本的设计目标是"检视通过等价于处理可用"。

    有判别力的统计量是"与同一角色自己的正/背面比"，它对体型自归一化。
    这与成品级 verify_directional_sheet.py 的 SIDE_FACING_SYMMETRY_GAP_MIN 同一条判据，
    此处把它下移到候选阶段，以便在生成后立刻拦下，而不是等到后处理完才发现。

        Walker（已验收）    侧向 0.216 vs down 0.878 → 落差 0.662
        Runner（已验收）    侧向 0.262 vs down 0.731 → 落差 0.469
        Bomber（已采用）    侧向 0.535 vs down 0.839 → 落差 0.304
        Bloodied v01        侧向 0.550 vs down 0.825 → 落差 0.275
        Headless v01        侧向 0.600 vs down 0.836 → 落差 0.236
        Runner v04（报废）  四张全约 0.60           → 落差 约 0

    取 0.15 能放过全部合法样本，同时拦下"四张同朝向"这个真实报废模式。
    """
    if "left" not in measured:
        return
    side = measured["left"]
    minimum = shared["symmetryGapMin"]
    print("\n=== 朝向落差判据（体型无关）===")
    print(f"  侧向自镜像对称度 {side:.3f}")
    for name in ("down", "up"):
        if name not in measured:
            continue
        gap = measured[name] - side
        ok = gap >= minimum
        print(
            f"  vs {name:4s} {measured[name]:.3f} → 落差 {gap:.3f}  下限 {minimum}  "
            f"{'OK' if ok else '失败'}"
        )
        if not ok:
            failures.append(
                f"侧向相对 {name} 的自镜像对称度落差仅 {gap:.3f}，低于下限 {minimum}，"
                f"侧向很可能与 {name} 画成了同一朝向"
            )


def resolve_by_id(spec: dict, version: str | None, from_archive: bool) -> list[tuple[str, Path]]:
    resolved: list[tuple[str, Path]] = []
    for key in SINGLE_KEYS + GRID_KEYS:
        if from_archive:
            path = GENERATED_DIR / f"{spec['sourcePrefix']}_{ARCHIVE_SUFFIX[key]}.png"
        else:
            path = TEMP_DIR / f"{spec['candidateSlug']}-{CANDIDATE_SUFFIX[key]}-{version}.png"
        resolved.append((key, path))
    return resolved


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("zombie_id", nargs="?", help="感染体 id，如 lurker")
    parser.add_argument("--version", default=None, help="TmpGenerate 候选版本，如 v01")
    parser.add_argument(
        "--from-archive",
        action="store_true",
        help="检视 generated 归档源图而不是 TmpGenerate 候选",
    )
    parser.add_argument("--paths", nargs="+", default=None, help="直接指定候选图路径，跳过按 id 解析")
    parser.add_argument(
        "--single",
        action="store_true",
        help="配合 --paths：按单帧图检视（参考图、图鉴立绘用），默认按 2×2 四帧图检视",
    )
    parser.add_argument(
        "--turnaround",
        action="store_true",
        help="配合 --paths：按四视图转身参考图检视。用于单独复核转身判据（含人工缺陷样本）",
    )
    args = parser.parse_args()

    failures: list[str] = []

    if args.paths:
        # 手工指定路径时读 shared 段即可，不需要具体感染体配置。
        shared = json.loads(SPEC_PATH.read_text(encoding="utf-8"))["shared"]
        keying = Keying(shared)
        for raw in args.paths:
            path = Path(raw)
            if not path.is_absolute():
                path = ROOT / path
            if not path.exists():
                print(f"\n=== {raw} ===\n  错误: 文件不存在")
                failures.append(f"{raw} 不存在")
                continue
            if args.turnaround:
                inspect_turnaround(path, keying, failures)
            elif args.single:
                inspect_single(path, keying, failures)
            else:
                inspect_grid(path, None, keying, failures)
    else:
        if not args.zombie_id:
            raise SystemExit("需要感染体 id，或改用 --paths 指定文件")
        spec, shared = load_spec(args.zombie_id)
        keying = Keying(shared)
        version = args.version or spec.get("adoptedVersion")
        if not version and not args.from_archive:
            raise SystemExit("需要 --version（该感染体尚未记录 adoptedVersion）")
        print(f"目标: {spec['displayName']}  版本 {version or 'archive'}")
        measured: dict[str, float] = {}
        for key, path in resolve_by_id(spec, version, args.from_archive):
            if not path.exists():
                print(f"\n=== {path.name} ===\n  错误: 文件不存在")
                failures.append(f"{path.name} 不存在")
                continue
            if key == "reference":
                inspect_turnaround(path, keying, failures)
            elif key in SINGLE_KEYS:
                inspect_single(path, keying, failures)
            else:
                result = inspect_grid(path, key, keying, failures)
                if result:
                    measured[key] = result["symmetry"]
        check_orientation_gap(measured, shared, failures)

    print()
    if failures:
        print(f"检视失败（{len(failures)} 项）:")
        for item in failures:
            print(f"  - {item}")
        print("\n失败项应递增版本号重新生成，不要手工修补单帧。")
        sys.exit(1)
    print("检视全部通过。注意：本脚本不能证明每一行画的是正确的那个方向，")
    print("成品级朝向门控是 verify_directional_sheet.py 的行间轮廓 IoU。")


if __name__ == "__main__":
    main()
