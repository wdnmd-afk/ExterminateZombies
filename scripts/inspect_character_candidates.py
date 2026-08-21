"""可玩角色生图候选的量化检视门控（图 B 关卡内实机精灵）。

存在理由：2026-08-18 的 sprite-watcher-raw.png 提示词里写了
"straight 90 degree bird's eye"，模型给出的却是高角度斜视图——能看到脸、鼻、
下巴、腿和一只完整的靴子。这张图没有经过任何量化检查就被接进了游戏，而
src/entities/Player.ts:108 会让它绕几何中心连续旋转 360°，实机读作
"一具躺平的身体在打转"。本脚本的唯一目的是让这件事无法再发生。

**纯几何判据拦不住它**，这一点必须记住：坏图的质量细长比是 1.47，而已验收的
Kenney hitman1 也是 1.47，两者完全相同；宽高比同样区分不开（0.75 对 0.77）。
真正有判别力的是"质量沿身体轴怎么分布"和"头部在主体里的相对位置"——相机不在
正上方时，透视会同时把头推离主体中心、把质量堆到上半部。阈值标定与实测样本见
character_asset_specs.json 的 _topDownNote。

判据一览（全部读 spec 的 shared 段，与后处理共用同一套数字）：
    下三分之一质量占比   >= lowerThirdMassMin      拦斜视图与直立正面图
    头部质心相对高度     在 headCentroid 区间内     拦斜视图
    拳心落点             在 fistX/fistY 区间内      保证枪不脱手
    四边留边             >= 3px                     保证后处理能干净裁剪
    连通域数量           == 1                       拦多角色与碎屑
    键控底占比           在合理区间                 拦渐变背景与画满整图

本脚本只读候选文件，不做任何写入；发现失败项时以退出码 1 结束，
可直接作为生成→处理之间的门控。

用法：
    python scripts/inspect_character_candidates.py watcher --version v01
    python scripts/inspect_character_candidates.py watcher --from-archive
    python scripts/inspect_character_candidates.py --paths TmpGenerate/foo.png
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
SPEC_PATH = ROOT / "scripts" / "character_asset_specs.json"
TEMP_DIR = ROOT / "TmpGenerate"
GENERATED_DIR = ROOT / "src" / "assets" / "generated" / "characters"

# 连通域与质量分布分析用的降采样边长。形态判定不需要全分辨率，
# 纯 Python BFS 在此规模下足够快（与感染体检视脚本同一取值）。
ANALYSIS_SIZE = 300
# 低于此像素占比的连通域视为噪点碎屑，不计入角色计数。
COMPONENT_NOISE_RATIO = 0.004
# 后处理 place_subject 要求的四边最小留边，与 process_zombie_sprites.py:310 同源。
MIN_EDGE_GAP_RATIO = 0.02

CANDIDATE_SUFFIX = {
    "reference": "identity-reference",
    "sprite": "sprite",
}

ARCHIVE_SUFFIX = {
    "reference": "identity_reference",
    "sprite": "sprite",
}

SOURCE_KEYS = ("reference", "sprite")


class Keying:
    """共享键控判据。数字来自 spec 的 shared 段，不在本文件里硬编码。

    与 process_zombie_sprites.py 的 remove_magenta_background 使用同一组阈值——
    后处理直接复用那个函数，两处判据一旦脱钩，"检视通过" 就不再等价于 "处理可用"。
    """

    def __init__(self, shared: dict) -> None:
        self.min_floor = shared["magentaMinFloor"]
        self.min_chroma = shared["magentaMinChroma"]
        self.max_skew = shared["magentaMaxRbSkew"]

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


def load_spec(character_id: str) -> tuple[dict, dict]:
    specs = json.loads(SPEC_PATH.read_text(encoding="utf-8"))
    if character_id not in specs["characters"]:
        known = ", ".join(sorted(specs["characters"]))
        raise SystemExit(f"未登记的角色 id: {character_id}。已登记: {known}")
    return specs["characters"][character_id], specs["shared"]


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
        while queue:
            index = queue.popleft()
            x = index % width
            y = index // width
            area += 1
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
        components.append({"area_ratio": area / total})

    components.sort(key=lambda item: item["area_ratio"], reverse=True)
    return components


def lower_third_mass(mask: Image.Image) -> float:
    """主体质量落在自身下三分之一的占比——本脚本最有判别力的单条判据。

    为什么这条能work：正俯视看一个直立的人，身体沿视线方向被极度前缩，质量沿画面
    纵轴大致均匀铺开（头顶、肩、躯干、靴顶层层叠压），下三分之一自然拿到约 1/3。
    相机一旦压低成斜视，头肩被推向画面上方而腿脚向下延伸成细长的一截，
    下三分之一的质量占比随之塌掉。

    实测标定（见 character_asset_specs.json 的 _topDownNote）：
        正俯视     Kenney 五图 0.316-0.338、已验收 tank_boss 帧 0.279
        直立正面   walker down 0.190
        斜视图     坏守望者图 0.161-0.163

    注意这是按"主体自身的 bbox"分三段而不是按画布分，所以对主体在画布里的位置和
    占比都不敏感，只反映体态本身。
    """
    silhouette = mask.point(lambda v: 0 if v == 255 else 255)
    bbox = silhouette.getbbox()
    if bbox is None:
        return 0.0
    cropped = silhouette.crop(bbox)
    width, height = cropped.size
    # list() 而不是直接切片 getdata()：ImagingCore 不支持切片索引。
    pixels = list(cropped.getdata())

    rows = [0] * height
    for y in range(height):
        offset = y * width
        rows[y] = sum(1 for value in pixels[offset:offset + width] if value)
    total = sum(rows)
    if not total:
        return 0.0
    boundary = height * 2 // 3
    return sum(rows[boundary:]) / total


def head_centroid(image: Image.Image, keying: Keying) -> float | None:
    """头部（头发/皮肤色簇）质心在主体高度上的相对位置。

    正俯视时头顶位于身体的几何中心附近（因为沿视线方向前缩，头就压在躯干上），
    实测 Kenney 五图全部落在 0.493-0.494、tank_boss 0.489。斜视时头被推到上部，
    坏守望者图为 0.309-0.335。

    色簇判定用宽区间，因为这里只需要定位"头在哪"，不需要精确分割：
    头发取低饱和的灰/棕色带，皮肤取 R>G>B 且红蓝差明显的暖色带。
    两者都找不到时返回 None，由调用方降级为只用 lower_third_mass 判定
    ——例如戴全盔的角色可能既无头发也无裸露皮肤。
    """
    rgb = image.convert("RGB")
    small = rgb.resize((ANALYSIS_SIZE, ANALYSIS_SIZE), Image.Resampling.NEAREST)
    pixels = list(small.getdata())

    body: list[int] = []
    head: list[int] = []
    for index, (red, green, blue) in enumerate(pixels):
        if keying.is_key_pixel(red, green, blue):
            continue
        body.append(index)
        low_saturation_grey = abs(red - green) < 25 and abs(green - blue) < 25 and 60 < red < 180
        skin = red > 150 and 95 < green < 200 and 65 < blue < 170 and red > green > blue
        if low_saturation_grey or skin:
            head.append(index)

    if not body or not head:
        return None
    rows = [index // ANALYSIS_SIZE for index in body]
    top, bottom = min(rows), max(rows)
    if bottom == top:
        return None
    head_row = sum(index // ANALYSIS_SIZE for index in head) / len(head)
    return (head_row - top) / (bottom - top)


def fist_position(image: Image.Image, keying: Keying) -> tuple[float, float] | None:
    """双手拳心在主体 bbox 内的相对位置。

    武器贴图画在人物下层并按 forwardOffset 沿瞄准方向偏移（Player.ts:105），
    所以拳心必须落在主体前方约 80%、垂直居中。偏差过大枪会脱手或插进身体。

    取皮肤色簇里最靠右的那一团：角色朝右，拳头是全身最靠前的裸露皮肤。
    颈部和面部皮肤会干扰质心，因此只统计横坐标位于皮肤 bbox 右侧 40% 的像素。
    找不到皮肤（戴手套）时返回 None，由调用方降级为提示而不判失败。
    """
    rgb = image.convert("RGB")
    small = rgb.resize((ANALYSIS_SIZE, ANALYSIS_SIZE), Image.Resampling.NEAREST)
    pixels = list(small.getdata())

    body: list[tuple[int, int]] = []
    skin: list[tuple[int, int]] = []
    for index, (red, green, blue) in enumerate(pixels):
        if keying.is_key_pixel(red, green, blue):
            continue
        point = (index % ANALYSIS_SIZE, index // ANALYSIS_SIZE)
        body.append(point)
        if red > 150 and 95 < green < 200 and 65 < blue < 170 and red > green > blue:
            skin.append(point)

    if not body or not skin:
        return None
    body_x = [p[0] for p in body]
    body_y = [p[1] for p in body]
    left, right = min(body_x), max(body_x)
    top, bottom = min(body_y), max(body_y)
    if right == left or bottom == top:
        return None

    skin_x = [p[0] for p in skin]
    threshold = min(skin_x) + (max(skin_x) - min(skin_x)) * 0.6
    front = [p for p in skin if p[0] >= threshold] or skin
    fist_x = sum(p[0] for p in front) / len(front)
    fist_y = sum(p[1] for p in front) / len(front)
    return ((fist_x - left) / (right - left), (fist_y - top) / (bottom - top))


def inspect_image(
    path: Path,
    keying: Keying,
    shared: dict,
    failures: list[str],
    *,
    is_sprite: bool,
) -> None:
    """检视单张候选图。

    is_sprite 区分身份参考图与实机精灵：两者机位判据完全相同（参考图画对了机位，
    精灵图跟着对的概率显著更高，所以参考图也必须过同一道门），但只有精灵图的
    拳心落点会直接影响运行时武器对齐，因此拳心越界只在精灵图上判失败。
    """
    label = "实机精灵" if is_sprite else "身份参考图"
    print(f"\n=== {path.name} [{label}] ===")
    print(f"  sha256={sha256_short(path)}")

    image = Image.open(path)
    mask = keying.mask(image)
    width, height = image.size
    print(f"  尺寸 {width}x{height}")

    bbox = subject_bbox(mask)
    if bbox is None:
        print("  整图没有主体（全部判为键控底）")
        failures.append(f"{path.name} 没有主体")
        return

    left, top, right, bottom = bbox
    subject_w = right - left
    subject_h = bottom - top
    ratio = key_ratio(mask)
    gaps = (left, top, width - right, height - bottom)
    edge_gap = min(gaps)
    min_gap = round(min(width, height) * MIN_EDGE_GAP_RATIO)

    print(
        f"  主体 {subject_w}x{subject_h} (宽高比 {subject_w / subject_h:.2f}) "
        f"键控底 {ratio * 100:.1f}% 四边留边 {edge_gap}px (下限 {min_gap}px)"
    )

    # 体型判据。与机位判据互补，不可合并：机位管"相机在哪"，这条管"身体有没有长度"。
    # watcher v01 机位全对但宽高比 1.26（人物被画成球），就是漏掉这条的后果。
    aspect = subject_w / subject_h
    aspect_min = shared["aspectMin"]
    aspect_max = shared["aspectMax"]
    if not aspect_min <= aspect <= aspect_max:
        shape = "过于扁圆（人物被画成球，躯干与前缩的腿消失）" if aspect > aspect_max \
            else "过于瘦长（可能画成了直立侧视）"
        failures.append(
            f"{path.name} 主体宽高比 {aspect:.2f} 越出 {aspect_min}-{aspect_max}，{shape}"
            f"（对照：在用五张 Kenney 精灵 0.74-0.84，v01 废图 1.26）"
        )

    if edge_gap < min_gap:
        failures.append(f"{path.name} 主体贴边 {edge_gap}px < {min_gap}px，后处理无法干净裁剪")
    if ratio < 0.15:
        failures.append(f"{path.name} 键控底仅 {ratio * 100:.1f}%，主体几乎画满整图")
    if ratio > 0.92:
        failures.append(f"{path.name} 键控底高达 {ratio * 100:.1f}%，主体过小或几乎为空")

    significant = [
        component for component in analyze_components(mask)
        if component["area_ratio"] >= COMPONENT_NOISE_RATIO
    ]
    areas = ", ".join(f"{c['area_ratio'] * 100:.1f}%" for c in significant[:5])
    print(f"  连通域 {len(significant)} 个 (面积占比: {areas})")
    if len(significant) > 1:
        failures.append(
            f"{path.name} 检出 {len(significant)} 个连通域，"
            f"可能画了多个角色或有分离碎屑"
        )

    # —— 机位判据。本脚本的核心，标定见 _topDownNote。 ——
    lower = lower_third_mass(mask)
    lower_min = shared["lowerThirdMassMin"]
    verdict = "正俯视" if lower >= lower_min else "疑似斜视/直立"
    print(f"  下三分之一质量占比 {lower:.3f} (下限 {lower_min})  -> {verdict}")
    if lower < lower_min:
        failures.append(
            f"{path.name} 下三分之一质量占比 {lower:.3f} < {lower_min}，"
            f"不是正俯视（对照：Kenney 正俯视 0.316-0.338，2026-08-18 斜视废图 0.163）"
        )

    head = head_centroid(image, keying)
    head_min = shared["headCentroidMin"]
    head_max = shared["headCentroidMax"]
    if head is None:
        print("  头部质心: 未检出头发/皮肤色簇，跳过该判据（可能戴全盔）")
    else:
        inside = head_min <= head <= head_max
        print(
            f"  头部质心相对高度 {head:.3f} (区间 {head_min}-{head_max})"
            f"  -> {'居中' if inside else '偏离'}"
        )
        if not inside:
            failures.append(
                f"{path.name} 头部质心 {head:.3f} 越出 {head_min}-{head_max}，"
                f"相机不在正上方（对照：Kenney 0.493-0.494，斜视废图 0.309-0.335）"
            )

    fists = fist_position(image, keying)
    if fists is None:
        print("  拳心落点: 未检出皮肤色簇，跳过该判据（可能戴手套）")
    else:
        fist_x, fist_y = fists
        x_ok = shared["fistXMin"] <= fist_x <= shared["fistXMax"]
        y_ok = shared["fistYMin"] <= fist_y <= shared["fistYMax"]
        print(
            f"  拳心落点 x {fist_x:.3f} (区间 {shared['fistXMin']}-{shared['fistXMax']})"
            f"  y {fist_y:.3f} (区间 {shared['fistYMin']}-{shared['fistYMax']})"
            f"  -> {'对齐' if x_ok and y_ok else '偏移'}"
        )
        if not (x_ok and y_ok) and is_sprite:
            failures.append(
                f"{path.name} 拳心 ({fist_x:.3f}, {fist_y:.3f}) 越出目标区间，"
                f"运行时武器会脱手或插进身体"
                f"（对照：在用五张 Kenney 精灵 x 0.807-0.905 / y 0.510-0.515，"
                f"2026-08-18 斜视废图 y=0.321）"
            )
        elif not (x_ok and y_ok):
            print("    参考图的拳心偏移只作提示，不判失败（它不参与运行时对齐）")


def resolve_paths(spec: dict, version: str | None, from_archive: bool) -> list[tuple[str, Path]]:
    resolved: list[tuple[str, Path]] = []
    for key in SOURCE_KEYS:
        if from_archive:
            path = GENERATED_DIR / f"{spec['sourcePrefix']}_{ARCHIVE_SUFFIX[key]}.png"
        else:
            path = TEMP_DIR / f"{spec['candidateSlug']}-{CANDIDATE_SUFFIX[key]}-{version}.png"
        resolved.append((key, path))
    return resolved


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("character_id", nargs="?", help="角色 id，如 watcher")
    parser.add_argument("--version", default=None, help="TmpGenerate 候选版本，如 v01")
    parser.add_argument(
        "--from-archive",
        action="store_true",
        help="检视 generated 归档源图而不是 TmpGenerate 候选",
    )
    parser.add_argument("--paths", nargs="+", default=None, help="直接指定候选图路径，跳过按 id 解析")
    parser.add_argument(
        "--reference",
        action="store_true",
        help="配合 --paths：按身份参考图检视（拳心偏移只作提示），默认按实机精灵检视",
    )
    args = parser.parse_args()

    failures: list[str] = []
    specs = json.loads(SPEC_PATH.read_text(encoding="utf-8"))
    shared = specs["shared"]
    keying = Keying(shared)

    if args.paths:
        for raw in args.paths:
            path = Path(raw)
            if not path.is_absolute():
                path = ROOT / path
            if not path.exists():
                print(f"\n=== {raw} ===\n  错误: 文件不存在")
                failures.append(f"{raw} 不存在")
                continue
            inspect_image(path, keying, shared, failures, is_sprite=not args.reference)
    else:
        if not args.character_id:
            raise SystemExit("需要角色 id，或改用 --paths 指定文件")
        spec, shared = load_spec(args.character_id)
        keying = Keying(shared)
        version = args.version or spec.get("adoptedVersion")
        if not version and not args.from_archive:
            raise SystemExit("需要 --version（该角色尚未记录 adoptedVersion）")
        print(f"目标: {spec['displayName']}  版本 {version or 'archive'}")
        print("形态: 单朝向朝右 + 运行时旋转（与 Boss 同构，理由见 spec 的 _note）")
        for key, path in resolve_paths(spec, version, args.from_archive):
            if not path.exists():
                print(f"\n=== {path.name} ===\n  错误: 文件不存在")
                failures.append(f"{path.name} 不存在")
                continue
            inspect_image(path, keying, shared, failures, is_sprite=key == "sprite")

    print()
    if failures:
        print(f"检视失败（{len(failures)} 项）:")
        for item in failures:
            print(f"  - {item}")
        print("\n失败项应递增版本号重新生成，不要手工修补。")
        print("机位类失败尤其不要试图在后处理里修：斜视图的腿和靴子是画出来的内容，")
        print("抠图和归一化都无法把它变成正俯视。")
        sys.exit(1)
    print("检视全部通过。注意：本脚本证明的是机位、拳心与画幅合规，")
    print("不能替代实景复核——最终仍需在游戏里转满 360° 确认观感。")


if __name__ == "__main__":
    main()
