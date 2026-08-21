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
# 第 4 项按 (左, 上, 右, 下) 标出该格哪几条边是整图外边界——内部中缝与外边界的
# 贴边后果完全不同，见 describe_cell 的 outer_sides 文档串。
GRID_CELLS = (
    ("左上", 0, 0, (True, True, False, False)),
    ("右上", 1, 0, (False, True, True, False)),
    ("左下", 0, 1, (True, False, False, True)),
    ("右下", 1, 1, (False, False, True, True)),
)

# 转身参考图的双指标判据阈值，标定说明见 inspect_turnaround()。
# 只有两项同时不足才判转身未生效；对称度对厚重体型会饱和，宽高比不会。
TURNAROUND_SYMMETRY_SPREAD_MIN = 0.15
TURNAROUND_ASPECT_SPREAD_MIN = 0.25

SINGLE_KEYS = ("reference", "portrait")
GRID_KEYS = ("left", "down", "up")

# Boss 走单朝向 + 运行时旋转，检视形态因此与普通感染体不同（理由见
# zombie_asset_specs.json 的 tank_boss._bossNote）：
#   - 身份参考图是单张朝右全身图，不是四视图转身图，按单帧图检视；
#   - move / attack / death 三类都是 2×2，但四格是同朝向的动画帧，
#     所以不套用 expected_orientation 的侧向/正背面对称度判据，也没有跨文件落差判据。
BOSS_SINGLE_KEYS = ("reference", "portrait")
BOSS_GRID_KEYS = ("move", "attack", "death_a", "death_b")

CANDIDATE_SUFFIX = {
    "reference": "direction-reference",
    "left": "left-4",
    "down": "down-4",
    "up": "up-4",
    "portrait": "portrait",
    "move": "move-4",
    "attack": "attack-4",
    "death_a": "death-4a",
    "death_b": "death-4b",
}

ARCHIVE_SUFFIX = {
    "reference": "direction_reference",
    "left": "left_4",
    "down": "down_4",
    "up": "up_4",
    "portrait": "portrait",
    "move": "move_4",
    "attack": "attack_4",
    "death_a": "death_4a",
    "death_b": "death_4b",
}


class Keying:
    """共享键控判据。数字来自 spec 的 shared 段，不在本文件里硬编码。"""

    def __init__(self, shared: dict, spec: dict | None = None) -> None:
        self.min_floor = shared["magentaMinFloor"]
        self.min_chroma = shared["magentaMinChroma"]
        self.max_skew = shared["magentaMaxRbSkew"]
        self.side_max = shared["symmetrySideMax"]
        # 正/背面对称度下限允许按感染体覆盖。共享的 0.62 是按左右对称的直立体型标定的
        # （Walker down 0.878 / up 0.761），对刻意不对称的角色是系统性误报：
        # oddity 的识别特征就是一侧肩巨大、一臂分叉。放宽后仍由体型无关的
        # symmetryGapMin 落差判据收尾，所以不是把门控拆掉。
        self.facing_min = (spec or {}).get("symmetryFacingMin", shared["symmetryFacingMin"])

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
    outer_sides: tuple[bool, bool, bool, bool] = (True, True, True, True),
) -> dict | None:
    """打印单格统计并返回度量值。

    outer_sides 按 (左, 上, 右, 下) 标出这一格的哪几条边是整图的外边界。
    2×2 网格里每格只有两条边是外边界，另两条是内部中缝，两者的后果完全不同：

      外边界贴边  = 模型把主体画出了画布，肢体被裁掉，信息不可恢复 → 真实报废
      内部中缝贴边 = 相邻两格的姿态互相挨上，主体本身完整 → 可恢复

    必须分开的实测依据（2026-08-21）：matriarch_boss move 的"贴边"只有 1px，
    bomber_boss death 为 8-13px，且全部出现在左列格的右边或右列格的左边——
    也就是同一条中缝的两侧，外边界一个像素都没碰。
    早先的判据把两者一律按 4px 阈值判死，会为了几个像素的中缝相触报废整套素材。
    中缝相触真正的危害是切帧时把邻格的几个像素当成碎屑带进来，而那由"多连通域"
    判据独立负责；后处理的 validate_frame 还会在归一化后的输出帧上再查一次贴边。
    """
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
    gaps = (left, top, cell_w - right, cell_h - bottom)
    outer_gap = min((g for g, is_outer in zip(gaps, outer_sides) if is_outer), default=cell_w)
    seam_gap = min((g for g, is_outer in zip(gaps, outer_sides) if not is_outer), default=cell_w)
    edge_gap = min(gaps)

    significant = [
        component for component in analyze_components(mask)
        if component["area_ratio"] >= COMPONENT_NOISE_RATIO
    ]
    aspect = width / height if height else 0
    symmetry = self_mirror_iou(mask)

    print(
        f"{indent}{label}: 主体 {width}x{height} (宽高比 {aspect:.2f}) "
        f"键控底 {ratio * 100:.1f}% 外边距 {outer_gap}px 中缝余量 {seam_gap}px "
        f"底部余量 {cell_h - bottom}px"
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
        "outer_gap": outer_gap,
        "seam_gap": seam_gap,
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


def inspect_turnaround(
    path: Path,
    keying: Keying,
    failures: list[str],
    advisories: list[str] | None = None,
) -> None:
    """四视图转身参考图。

    这张图与其它四张的判据都不同，必须单独处理：它本身就是一张 2×2 的四视图拼图，
    所以整图看会有 4 个连通域（按单帧图判会误报"画了多个角色"），而四格之间又
    分属侧面与正/背面两类，对称度判据不适用于任何单一档位。这里只检查
    "四个视图都在且都完整"，朝向正确性交给成品级的 verify_directional_sheet.py。
    """
    # --paths --turnaround 单独复核时不传 advisories，此时退化为硬失败（没有后续
    # 方向图可以推翻它，人工缺陷样本的复核也依赖这条退化路径继续以退出码 1 拦下）。
    if advisories is None:
        advisories = failures

    image = Image.open(path)
    print(f"\n=== {path.name} ===（四视图转身参考）")
    print(f"  尺寸 {image.size[0]}x{image.size[1]} {image.mode} sha256={sha256_short(path)}")

    if image.width != image.height or image.width % 2 != 0:
        print("  错误: 不是偶数边长正方形，无法按 2×2 切分")
        failures.append(f"{path.name} 不是偶数边长正方形")
        return

    check_grid_lines(image, keying, advisories, path.name)
    cell = image.width // 2
    symmetries = []
    aspects = []
    for label, column, row, outer in GRID_CELLS:
        crop = image.crop((column * cell, row * cell, (column + 1) * cell, (row + 1) * cell))
        # describe_cell 自己也会追加发现（键控底占比、主体内部空洞），同样走 advisories。
        result = describe_cell(crop, label, keying, advisories, path.name, outer_sides=outer)
        if result is None:
            continue
        symmetries.append(result["symmetry"])
        aspects.append(result["aspect"])
        # 转身图的缺陷一律写入 advisories，理由与本函数末尾的跨度判据相同，
        # 但适用范围更广：转身图不是交付物，它唯一的作用是当 I2I 身份锚点。
        # 它可能损害的每一项性质，在交付物（left/down/up 三张与后处理产物）上都有
        # 各自独立的门控——贴边有 edge_gap < 4、主体完整性有 validate_frame、
        # 多连通域有同名判据。所以"锚点有瑕疵"本身是风险提示，而交付物干净就是证据。
        # 2026-08-21 实测 stalker v01 转身图四格边距全为 0px，但它的三张方向图
        # 边距 18-84px 全部合格：锚点的裁切并没有传导下去。
        # 根因（转身图请求漏了每格留边约束）已在 generate_zombie_assets.mjs 修掉，
        # 所以这里放过的是历史候选，而不是放过一类缺陷。
        if result["components"] > 1:
            print(f"    警告: {label} 含多个连通域，可能一格里画了多个角色")
            advisories.append(f"{path.name} {label} 含多个连通域")
        if result["outer_gap"] < 4:
            print(f"    警告: {label} 外边界贴边（外边距 {result['outer_gap']}px）")
            advisories.append(f"{path.name} {label} 外边界贴边（{result['outer_gap']}px）")

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
    # 转身图的结论是"第一道信号"，可被后续三张方向图的实测推翻，所以写入 advisories
    # 而不是 failures：真正权威的证据是 left / down / up 三张自己的朝向分离度。
    # bloater v01 是实测反例——转身图四视图跨度双双不足（对称度 0.128、宽高比 0.14，
    # 气胀球形躯干从任何角度看都高度重叠，与 Bomber 记录过的轮廓饱和同源），
    # 但它的三张方向图分离得很干净（left 宽高比 1.26 对 down 0.93、up 0.93）。
    # 若把转身图判成硬失败，就会为了一张只作身份锚点的参考图报废一整套可用素材。
    # main() 在跨文件判据也失败时才把它提升为失败项，那种情况下两者互相印证。
    print("  警告: 四视图对称度与宽高比跨度双双不足，转身图可能没有真正区分侧面与正/背面")
    advisories.append(
        f"{path.name} 四视图对称度跨度 {symmetry_spread:.3f} 且宽高比跨度 {aspect_spread:.2f}"
        "，双指标同时不足，转身可能未生效"
    )


def inspect_grid(
    path: Path,
    key: str | None,
    keying: Keying,
    failures: list[str],
    progression: bool = False,
) -> None:
    """2×2 四帧图检视。

    progression=True 表示这张图是递进动作（Boss 的攻击与死亡）而不是循环步态。
    差别只在尺寸稳定性判据：那条 "四帧高度差 ≤18%" 是按循环步态标定的，用来抓
    身份漂移与缺脚，前提是四帧body 尺寸本应基本相同。递进动作恰恰相反——
    抬起前肢再砸下、或整个塌到地上，主体高度必须大幅变化。
    tank_boss 攻击帧实测高度差 27.5%，那是动作生效的证据而不是缺陷
    （与 feral 弹跳步态触发同一条判据是同一性质的误报）。
    贴边、连通域、中缝这些真实缺陷判据对递进动作照常适用，不放过。
    """
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
    for label, column, row, outer in GRID_CELLS:
        crop = image.crop((column * cell, row * cell, (column + 1) * cell, (row + 1) * cell))
        result = describe_cell(crop, label, keying, failures, path.name, outer_sides=outer)
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
    if progression:
        print("  说明: 递进动作，不套用按循环步态标定的四帧尺寸稳定性判据")
    elif height_spread > 0.18:
        print("  警告: 四帧高度差过大，可能身份漂移或某帧缺脚")
        failures.append(f"{path.name} 四帧高度差 {height_spread * 100:.1f}% 过大")
    # 外边界贴边是真实报废（主体被画出画布、肢体被裁掉），保持硬失败。
    # 内部中缝相触只是相邻两格挨上，主体本身完整，降为提示——分开的实测依据见
    # describe_cell 的 outer_sides 文档串。中缝相触带来的碎屑由下面的多连通域判据兜底，
    # 后处理的 validate_frame 还会在归一化后的输出帧上再查一次贴边。
    worst_outer = min(s["outer_gap"] for s in stats)
    worst_seam = min(s["seam_gap"] for s in stats)
    if worst_outer < 4:
        print("  警告: 存在外边界贴边帧，主体可能已被裁切")
        failures.append(f"{path.name} 存在外边界贴边帧（最小外边距 {worst_outer}px）")
    if worst_seam < 4:
        print(f"  提示: 存在中缝相触帧（最小中缝余量 {worst_seam}px），主体完整，不判失败")
    if any(s["components"] > 1 for s in stats):
        print("  警告: 某帧含多个连通域，可能一格里画了多个角色")
        failures.append(f"{path.name} 某帧含多个连通域")

    # 方向判定：两条绝对阈值都只作为参考打印，判定统一交给 main() 的跨文件判据。
    #
    # 侧向的绝对阈值早先就已降为参考（厚重体型系统性误报，见 check_orientation_gap）。
    # 2026-08-21 起正/背面的绝对阈值同样降为参考，原因同源：facing_min 0.62 是按直立
    # 双足体型标定的，对伏地四足体型系统性误报——crawler up 实测 0.585、stalker down
    # 0.599，而两者的宽高比证明朝向完全正确（crawler left 2.34 对 up 0.49，
    # stalker left 1.64 对 down 0.56）。四足角色前肢前伸、交替步态本身就打破左右对称，
    # 与 Runner 冲刺姿态的正面偏不对称（实测 0.315）同一性质。
    #
    # 判据放在跨文件阶段才有判别力：单文件看不到"侧向与正/背面是否真的分开"，
    # 而这正是要防的报废模式。见 check_orientation_gap 的双指标合议。
    orientation = expected_orientation(key) if key else None
    average = sum(s["symmetry"] for s in stats) / len(stats)
    aspect = sum(s["aspect"] for s in stats) / len(stats)
    print(f"  平均自镜像对称度 {average:.3f}  平均宽高比 {aspect:.2f}")
    if orientation == "side":
        verdict = "在瘦削体型区间内" if average <= keying.side_max else (
            f"高于瘦削体型上限 {keying.side_max}，厚重体型下属预期，交由跨文件判据裁定"
        )
        print(f"  参考: {verdict}（Walker 侧向实测 0.216）")
    elif orientation == "facing":
        verdict = "在直立体型区间内" if average >= keying.facing_min else (
            f"低于直立体型下限 {keying.facing_min}，四足或不对称体型下属预期，"
            "交由跨文件判据裁定"
        )
        print(f"  参考: {verdict}（Walker 实测 down 0.878 / up 0.761）")
    return {"key": key, "symmetry": average, "aspect": aspect}


def check_orientation_gap(
    measured: dict[str, dict],
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

    2026-08-21 追加第二指标（宽高比落差），改为双指标合议。原因与本文件
    inspect_turnaround 的同名改动同源：自镜像对称度对某些体型会饱和，单用它会误杀。
    两类实测反例——

        crawler v01（伏地四足）  侧向 0.611 vs down 0.737 落差 0.126（低于 0.15）
        stalker v01（俯行四足）  侧向 0.481 vs down 0.599 落差 0.118（低于 0.15）
        bloater v01（圆胖）      侧向 0.806 vs up   0.941 落差 0.135（低于 0.15）

    这三例的朝向其实都是对的，宽高比证据毫不含糊（真正的俯视侧面横躺、正/背面竖立）：

        crawler  left 1.98~2.50  vs  down 0.51~0.57  up 0.45~0.53
        stalker  left 1.59~1.67  vs  down 0.52~0.60  up 0.44~0.49
        bloater  left 1.25~1.28  vs  down 0.92~0.93  up 0.91~0.96

    伏地四足的对称度落差偏小有结构性原因：前肢前伸 + 交替步态本身打破左右对称，
    正面视图的对称度被压低（与 Runner 冲刺姿态正面实测 0.315 同一性质），
    落差因此被两头挤扁。圆胖体型则是侧向对称度被顶高。

    宽高比对体型自归一化的方向不同：它比的是同一角色不同视角的自身形变，
    而"四行同朝向"这个报废模式必然让宽高比落差一起塌到 0（Runner v04 报废样本
    四行同姿态，宽高比几乎相同）。所以只有两项同时不足才判同朝向。
    下限取 0.30：已验收各类的侧向-正面宽高比差为 runner +0.91、lurker +0.41、
    tank +0.16、drifter +0.26、bomber +0.22，而上面三例分别为 +1.55、+1.08、+0.34。
    注意 tank 与 bomber 低于 0.30——它们本来就靠对称度落差过关（0.198 / 0.304），
    双指标合议只要求"不要两项同时不足"，不要求每项都达标。
    """
    if "left" not in measured:
        return
    side = measured["left"]["symmetry"]
    side_aspect = measured["left"]["aspect"]
    minimum = shared["symmetryGapMin"]
    aspect_minimum = shared["aspectGapMin"]
    print("\n=== 朝向判据（体型无关，双指标合议）===")
    print(f"  侧向自镜像对称度 {side:.3f}  侧向宽高比 {side_aspect:.2f}")
    for name in ("down", "up"):
        if name not in measured:
            continue
        gap = measured[name]["symmetry"] - side
        aspect_gap = side_aspect - measured[name]["aspect"]
        symmetry_ok = gap >= minimum
        aspect_ok = aspect_gap >= aspect_minimum
        print(
            f"  vs {name:4s} 对称度 {measured[name]['symmetry']:.3f} → 落差 {gap:+.3f}"
            f"（下限 {minimum}）{'OK' if symmetry_ok else '不足'}"
            f"；宽高比 {measured[name]['aspect']:.2f} → 落差 {aspect_gap:+.2f}"
            f"（下限 {aspect_minimum}）{'OK' if aspect_ok else '不足'}"
        )
        if symmetry_ok or aspect_ok:
            print(f"        判定: 侧向与 {name} 已分开")
            continue
        failures.append(
            f"侧向相对 {name} 的对称度落差仅 {gap:.3f}（下限 {minimum}）"
            f"且宽高比落差仅 {aspect_gap:.2f}（下限 {aspect_minimum}），两项同时不足，"
            f"侧向很可能与 {name} 画成了同一朝向"
        )


def resolve_by_id(spec: dict, version: str | None, from_archive: bool) -> list[tuple[str, Path]]:
    is_boss = bool(spec.get("isBoss"))
    keys = (BOSS_SINGLE_KEYS + BOSS_GRID_KEYS) if is_boss else (SINGLE_KEYS + GRID_KEYS)
    resolved: list[tuple[str, Path]] = []
    for key in keys:
        if from_archive:
            path = GENERATED_DIR / f"{spec['sourcePrefix']}_{ARCHIVE_SUFFIX[key]}.png"
        else:
            suffix = "identity-reference" if (is_boss and key == "reference") \
                else CANDIDATE_SUFFIX[key]
            path = TEMP_DIR / f"{spec['candidateSlug']}-{suffix}-{version}.png"
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
        keying = Keying(shared, spec)
        is_boss = bool(spec.get("isBoss"))
        version = args.version or spec.get("adoptedVersion")
        if not version and not args.from_archive:
            raise SystemExit("需要 --version（该感染体尚未记录 adoptedVersion）")
        print(f"目标: {spec['displayName']}  版本 {version or 'archive'}")
        if keying.facing_min != shared["symmetryFacingMin"]:
            print(
                f"注意: 本类覆盖了正/背面对称度下限 {shared['symmetryFacingMin']} → "
                f"{keying.facing_min}（刻意不对称体型，见 spec 的 _asymmetryNote）"
            )
        if is_boss:
            print("形态: Boss 单朝向帧条（移动/攻击/死亡），不套用朝向对称度与落差判据")
        measured: dict[str, dict] = {}
        advisories: list[str] = []
        for key, path in resolve_by_id(spec, version, args.from_archive):
            if not path.exists():
                print(f"\n=== {path.name} ===\n  错误: 文件不存在")
                failures.append(f"{path.name} 不存在")
                continue
            if key == "reference" and not is_boss:
                inspect_turnaround(path, keying, failures, advisories)
            elif key in (BOSS_SINGLE_KEYS if is_boss else SINGLE_KEYS):
                inspect_single(path, keying, failures)
            else:
                # Boss 的四格是同朝向动画帧，传 key=None 让 inspect_grid 跳过
                # 侧向/正背面的对称度判据（expected_orientation 只认 left/down/up）。
                # attack / death 还要额外声明是递进动作，见 inspect_grid 的 progression。
                result = inspect_grid(
                    path,
                    None if is_boss else key,
                    keying,
                    failures,
                    progression=key in ("attack", "death_a", "death_b"),
                )
                if result and not is_boss:
                    measured[key] = result
        if not is_boss:
            orientation_failures = len(failures)
            check_orientation_gap(measured, shared, failures)
            orientation_ok = len(failures) == orientation_failures
            if advisories:
                # 转身图的疑虑由权威证据裁定：三张方向图分离干净就只作提示，
                # 两者都失败则互相印证，提升为失败项。
                if orientation_ok:
                    print("\n=== 转身参考图提示（已被方向图实测推翻，不判失败）===")
                    for item in advisories:
                        print(f"  - {item}")
                else:
                    failures.extend(advisories)

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
