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

`--kind portrait` 检视图 A 战前档案立绘，判据与图 B **完全不共用**（两者失败模式不同：
图 B 怕相机不在正上方，图 A 怕主体跑出画幅）。图 A 的主判据是四边留边——半身像、
膝上取景与切脚三种废图在键控底上一律表现为主体贴边。详见 inspect_portrait 与
character_asset_specs.json 的 _portraitNote。

本脚本只读候选文件，不做任何写入；发现失败项时以退出码 1 结束，
可直接作为生成→处理之间的门控。

用法：
    python scripts/inspect_character_candidates.py watcher --version v01
    python scripts/inspect_character_candidates.py watcher --from-archive
    python scripts/inspect_character_candidates.py --paths TmpGenerate/foo.png
    python scripts/inspect_character_candidates.py eagle-eye --kind portrait --version v01
    python scripts/inspect_character_candidates.py --kind portrait --calibrate
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

# —— 门控标定与双向验证的参照样本 ——
#
# 阈值必须按**实际在用的素材**标定，不能按提示词的名义值：2026-08-21 起初按名义值
# 0.80 给了 fistXMax=0.88，实测直接把 survivor1 判失败，而那正是当时游戏在用的
# 守望者精灵。一个对在用素材报错的门控会被绕过，也就失去了门控的意义。
#
# 这批样本原先是手工合成在 TmpGenerate/ 里的（gitignored），标定过程因此无法复现。
# 改成从仓库内的 Kenney 源图现场合成，`--calibrate` 一条命令就能重跑整个标定与
# 双向验证。合成是必须的：Kenney PNG 是透明底，convert("RGB") 会把透明区变成黑色
# 而黑色不是键控色，主体 bbox 会直接变成整张画布。
KENNEY_ROOT = (
    ROOT / "src" / "assets" / "downloaded" / "characters" / "kenney-topdown-shooter" / "PNG"
)
KENNEY_IN_USE = {
    "survivor1": "Survivor 1/survivor1_stand.png",
    "hitman1": "Hitman 1/hitman1_stand.png",
    "soldier1": "Soldier 1/soldier1_stand.png",
    "manBlue": "Man Blue/manBlue_stand.png",
    "manBrown": "Man Brown/manBrown_stand.png",
}
# 2026-08-18 的斜视废图。必须被拦下，否则门控形同虚设。
KNOWN_BAD = GENERATED_DIR / "sprite-watcher-raw.png"
# 已验收产物。必须被放行。
ADOPTED = ROOT / "src" / "assets" / "processed" / "characters" / "sprite-watcher.png"


def on_magenta(path: Path) -> Image.Image:
    """把带 alpha 的源图合成到纯洋红底，得到与生图候选同构的输入。"""
    image = Image.open(path).convert("RGBA")
    canvas = Image.new("RGBA", image.size, (255, 0, 255, 255))
    canvas.alpha_composite(image)
    return canvas.convert("RGB")



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


def front_band_centroid(mask: Image.Image, ratio: float) -> tuple[float, float] | None:
    """主体前缘窄带的质心在主体 bbox 内的相对位置——不依赖颜色的拳心量法。

    存在理由：`fist_position` 靠皮肤色簇定位拳头，而这个前提对五名角色只有一半成立。
    鹰眼戴黑色射击手套（皮肤只剩指缝一小片）、堡垒戴厚手甲、破阵者全副装具。
    前者会把质心拉到轮廓最前缘（鹰眼 v01 实测 `x=0.958`，判失败，而那张图的机位、
    体型、留边、连通域全部合格，拳头位置肉眼看也正常）；后者让判据直接跳过。
    **一个对三名角色失效的判据保护不了运行时武器对齐**，所以补一条颜色无关的。

    几何法只读键控掩码：提示词要求双拳并拢在身体正前方且角色朝右，所以拳头必然是
    主体最靠前的那一团，取前缘一条窄带的质心即可。

    带宽比例与 `process_character_assets.py` 的 `measure_grip` 共用 spec 的
    `gripFrontBandRatio`——两处脱钩的话"检视通过"就不再等价于"处理可用"。
    """
    silhouette = mask.point(lambda v: 0 if v == 255 else 255)
    small = silhouette.resize((ANALYSIS_SIZE, ANALYSIS_SIZE), Image.Resampling.NEAREST)
    solid = [
        (index % ANALYSIS_SIZE, index // ANALYSIS_SIZE)
        for index, value in enumerate(small.getdata())
        if value
    ]
    if not solid:
        return None
    xs = [point[0] for point in solid]
    ys = [point[1] for point in solid]
    left, right = min(xs), max(xs)
    top, bottom = min(ys), max(ys)
    if right == left or bottom == top:
        return None
    band = max(1, round((right - left + 1) * ratio))
    front = [point for point in solid if point[0] > right - band]
    band_x = sum(point[0] for point in front) / len(front)
    band_y = sum(point[1] for point in front) / len(front)
    return ((band_x - left) / (right - left), (band_y - top) / (bottom - top))


def mirror_iou(mask: Image.Image, transpose: Image.Transpose) -> float:
    """主体轮廓与自身镜像的 IoU。

    量法与 `inspect_zombie_candidates.py` 的 `self_mirror_iou` 逐字相同（先按主体裁剪
    再镜像，排除主体在画幅内不居中带来的假性不对称），只是把翻转轴变成参数——
    朝向判据要同时看两个轴，那边只需要左右一个轴。
    """
    silhouette = mask.point(lambda v: 0 if v == 255 else 255)
    bbox = silhouette.getbbox()
    if bbox is None:
        return 0.0
    cropped = silhouette.crop(bbox)
    flipped = cropped.transpose(transpose)
    intersection = ImageChops.darker(cropped, flipped).histogram()[255]
    union = ImageChops.lighter(cropped, flipped).histogram()[255]
    return intersection / union if union else 0.0


def facing_gap(mask: Image.Image) -> tuple[float, float, float]:
    """朝向判据：上下镜像对称度减左右镜像对称度。

    **这条判据是 bastion v01 逼出来的，它暴露了此前门控最大的盲区：完全没有朝向判据。**
    那张图机位、体型、留边、连通域、拳心五项全过，但人物朝的是画面**下方**而不是右方
    ——护肩左右对称、头盔居中、双拳并在正下方、靴子在最下缘。运行时 `Player` 按
    `setRotation(aimAngle)` 旋转，前提是贴图朝右；朝下的贴图会恒定偏 90°，
    人物永远侧着身子走路和瞄准。

    几何前缘带量法抓不住它：左右对称的图形，其最右侧窄带的质心必然落在中间高度，
    所以 bastion v01 的前缘拳心读作 `0.895 / 0.455`，一个完美的"对齐"。

    判据本身就是提示词里已经写明的要求（ORIENTATION 段：
    "The body is perfectly centered and vertically symmetric about the horizontal centre line"）：
        朝右的俯视人物  —— 关于**水平中线**近似对称（上下镜像 IoU 高），
                          而双臂与拳头向右伸出使其关于竖直中线明显不对称（左右镜像 IoU 低）。
        朝下的俯视人物  —— 恰好相反。
    所以取两者之差，正值越大越确定是朝右，负值说明朝的是上或下。
    """
    top_bottom = mirror_iou(mask, Image.Transpose.FLIP_TOP_BOTTOM)
    left_right = mirror_iou(mask, Image.Transpose.FLIP_LEFT_RIGHT)
    return top_bottom, left_right, top_bottom - left_right


def skin_ratio(image: Image.Image, keying: Keying) -> float:
    """皮肤簇占主体的比例，用来判断 `fist_position` 的前提是否成立。

    判据与 `fist_position` 的皮肤判定逐字相同，只是改成统计占比。
    比例过低说明检出的不是一只手而是手套缝里露出的一小片，
    此时它的质心会被拉到轮廓最前缘，不能再当作拳心判失败的依据。
    """
    rgb = image.convert("RGB")
    small = rgb.resize((ANALYSIS_SIZE, ANALYSIS_SIZE), Image.Resampling.NEAREST)
    body = 0
    skin = 0
    for red, green, blue in small.getdata():
        if keying.is_key_pixel(red, green, blue):
            continue
        body += 1
        if red > 150 and 95 < green < 200 and 65 < blue < 170 and red > green > blue:
            skin += 1
    return 0.0 if not body else skin / body


def inspect_image(
    path: Path,
    keying: Keying,
    shared: dict,
    failures: list[str],
    *,
    is_sprite: bool,
    loaded: Image.Image | None = None,
    framing: bool = True,
) -> None:
    """检视单张候选图。

    is_sprite 区分身份参考图与实机精灵：两者机位判据完全相同（参考图画对了机位，
    精灵图跟着对的概率显著更高，所以参考图也必须过同一道门），但只有精灵图的
    拳心落点会直接影响运行时武器对齐，因此拳心越界只在精灵图上判失败。

    loaded 让调用方传入已在内存里合成好的图（`--calibrate` 把透明底的 Kenney 源图
    合成到洋红底上）。标定必须走**同一个** inspect_image，否则标定用的检测器与
    门控用的检测器会漂移，标出来的阈值就不再是这道门的阈值。

    framing 区分**画幅类判据**（四边留边、键控底占比）与**内容类判据**（机位、体型、
    连通域、拳心）。画幅类判据问的是"这张 1254px 生图候选能不能被后处理干净裁剪"，
    对已经裁好的成品资产没有意义：`--calibrate` 实测五张 Kenney 在用精灵的四边留边
    全是 `0px`，因为它们本来就是紧贴主体切好的游戏素材。拿画幅判据去卡它们只会得到
    五个假失败，而假失败会让人绕过整道门（`_fistNote` 记过同一个教训）。
    真正的生图候选一律走 `framing=True`，一条画幅判据都没少。
    """
    label = "实机精灵" if is_sprite else "身份参考图"
    print(f"\n=== {path.name} [{label}] ===")
    if loaded is None:
        print(f"  sha256={sha256_short(path)}")

    image = Image.open(path) if loaded is None else loaded

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

    if framing:
        if edge_gap < min_gap:
            failures.append(f"{path.name} 主体贴边 {edge_gap}px < {min_gap}px，后处理无法干净裁剪")
        if ratio < 0.15:
            failures.append(f"{path.name} 键控底仅 {ratio * 100:.1f}%，主体几乎画满整图")
        if ratio > 0.92:
            failures.append(f"{path.name} 键控底高达 {ratio * 100:.1f}%，主体过小或几乎为空")
    else:
        print("    画幅类判据（留边、键控底占比）跳过：成品资产本来就是紧贴主体切好的")


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

    # —— 朝向判据。理由与标定见 facing_gap 的文档串（bastion v01 触发）。 ——
    top_bottom, left_right, gap = facing_gap(mask)
    gap_min = shared["facingGapMin"]
    print(
        f"  朝向 上下镜像 {top_bottom:.3f} 左右镜像 {left_right:.3f} 落差 {gap:+.3f}"
        f" (下限 {gap_min})  -> {'朝右' if gap >= gap_min else '疑似朝上/朝下'}"
    )
    if gap < gap_min:
        failures.append(
            f"{path.name} 朝向落差 {gap:+.3f} < {gap_min}，人物不是朝画面右方"
            f"（上下镜像 {top_bottom:.3f} 左右镜像 {left_right:.3f}）。"
            f"运行时 Player 按瞄准角旋转的前提是贴图朝右，朝下的贴图会恒定偏 90°"
        )

    # —— 拳心判据。保证运行时武器不脱手、不插进身体。 ——
    #
    # 主判据是几何法（颜色无关，五名角色都成立），皮肤色质心退为副判据并带前提检查。
    # 原先只有皮肤法，对戴手套/披挂装具的三名角色要么失效要么误判，
    # 理由与实测见 front_band_centroid 的文档串。
    grip = front_band_centroid(mask, shared["gripFrontBandRatio"])
    if grip is None:
        failures.append(f"{path.name} 无法量取前缘拳心，主体可能为空")
    else:
        grip_x, grip_y = grip
        x_ok = shared["gripXMin"] <= grip_x <= shared["gripXMax"]
        y_ok = shared["gripYMin"] <= grip_y <= shared["gripYMax"]
        print(
            f"  前缘拳心（几何）x {grip_x:.3f} (区间 {shared['gripXMin']}-{shared['gripXMax']})"
            f"  y {grip_y:.3f} (区间 {shared['gripYMin']}-{shared['gripYMax']})"
            f"  -> {'对齐' if x_ok and y_ok else '偏移'}"
        )
        if not (x_ok and y_ok) and is_sprite:
            failures.append(
                f"{path.name} 前缘拳心 ({grip_x:.3f}, {grip_y:.3f}) 越出目标区间，"
                f"运行时武器会脱手或插进身体"
                f"（对照：在用五张 Kenney 精灵与已验收守望者产物见 --calibrate）"
            )
        elif not (x_ok and y_ok):
            print("    参考图的拳心偏移只作提示，不判失败（它不参与运行时对齐）")

    fists = fist_position(image, keying)
    ratio_skin = skin_ratio(image, keying)
    if fists is None:
        print(f"  皮肤色拳心: 未检出皮肤簇（皮肤占主体 {ratio_skin * 100:.2f}%），跳过")
    else:
        fist_x, fist_y = fists
        x_ok = shared["fistXMin"] <= fist_x <= shared["fistXMax"]
        y_ok = shared["fistYMin"] <= fist_y <= shared["fistYMax"]
        # 皮肤色拳心**只作提示，不判失败**。三条实测理由：
        # 1. spec 里那组阈值（x 0.807-0.905）是按**孤立的持枪手层**标定的，不是按整张
        #    精灵。整张图里脸也是皮肤，--calibrate 实测 survivor1 因此得到 x=0.615、
        #    manBrown 0.779，两张在用素材被判失败——正是 _fistNote 警告过的那种
        #    "对在用素材报错的门控"。
        # 2. 五名角色里三名戴手套或全副装具，判据要么跳过要么只捕到指缝一小片
        #    （鹰眼 v01：皮肤占主体 0.35%，质心被拉到 x=0.958 误判失败）。
        # 3. 它的判别力已被几何法覆盖：2026-08-18 废图的 y=0.336 同样被几何法拦下。
        # 保留打印是因为守望者在用的 gripAnchor 就是按皮肤色质心量的，
        # 有皮肤时它比几何法更贴近真手，是量取 gripAnchor 时的首选（见 measure_grip）。
        print(
            f"  皮肤色拳心（仅提示）x {fist_x:.3f} y {fist_y:.3f}"
            f"  皮肤占主体 {ratio_skin * 100:.2f}%"
            f"  -> {'落在手层标定区间内' if x_ok and y_ok else '偏离手层标定区间'}"
            f"（参考区间 x {shared['fistXMin']}-{shared['fistXMax']}"
            f" y {shared['fistYMin']}-{shared['fistYMax']}，按孤立手层标定）"
        )




def resolve_paths(spec: dict, version: str | None, from_archive: bool) -> list[tuple[str, Path]]:
    resolved: list[tuple[str, Path]] = []
    for key in SOURCE_KEYS:
        if from_archive:
            path = GENERATED_DIR / f"{spec['sourcePrefix']}_{ARCHIVE_SUFFIX[key]}.png"
        else:
            path = TEMP_DIR / f"{spec['candidateSlug']}-{CANDIDATE_SUFFIX[key]}-{version}.png"
        resolved.append((key, path))
    return resolved


# ——————————————————— 图 A 战前档案立绘的门控 ———————————————————
#
# 与图 B 的判据**完全不共用**，因为两者的失败模式不同：图 B 怕相机不在正上方，
# 图 A 怕主体跑出画幅。标定实测与阈值理由见 character_asset_specs.json 的 _portraitNote。


def portrait_archive_path(spec: dict) -> Path:
    """图 A 归档源图路径。

    命名默认是脚本期的 `<Prefix>_portrait.png`，与 `<Prefix>_sprite.png` 同构。
    守望者母版沿用 2026-08-18 的旧命名，用 spec 的 `portraitArchiveName` 声明覆盖，
    而不是在脚本里写 `if character_id == "watcher"`——后处理脚本也要解析同一个路径，
    两处各写一个特例必然漂移。
    """
    return GENERATED_DIR / spec.get("portraitArchiveName", f"{spec['sourcePrefix']}_portrait.png")


def enclosed_key_regions(image: Image.Image, keying: Keying) -> tuple[list[tuple[float, float]], int]:
    """主体内部被完全包住的键控色区域，按面积降序返回 (占主体比例%, 与背景色最大通道差)。

    存在理由是 bastion v01：模型把**掀起的面罩和盾牌观察窗画成了洋红/粉色**。
    键控判据一视同仁地把它们当背景抠掉，人物头上于是会破一个洞。
    这类缺陷此前没有任何一条判据能读出来——连通域判据也读不出来，因为内部空洞
    不会把轮廓切成两块（v01 实测连通域仍是 1 个）。

    **为什么只作提示、不判失败**，两条实测理由，都是"判别力不够"：
    1. 单看面积没用：鹰眼 v02 的合法空洞（步枪与身体之间那块三角区）占主体 5.35%，
       而 bastion 那两块洋红只占 1.32%——**合法的比缺陷的大四倍**。
    2. 加上颜色差之后能分出轻重，但分不开边界：bastion 的可疑区是
       0.47% @ 偏差 52.9 与 0.21% @ 103.4，鹰眼 v02 的最强可疑区是 0.14% @ 39.7，
       疾行者 v01 是 0.18% @ 17.6。要同时放行后两者又拦下前者，阈值得卡在
       "面积 >= 0.20% 且偏差 >= 40"——距离两侧样本各只有 5% 的余量。
       按四个样本去拟合这么窄的门，正是 _fistNote 与 _gripNote 反复警告的那种门控：
       迟早对一张好图报错，然后被整体绕过。

    所以这里只把可疑区列出来，把判断交给肉眼（验收清单 10.1 第 2、4 条）。
    颜色差的量法：合法空洞露出的是那张平背景本身，颜色与外圈背景几乎相同（实测偏差
    个位数）；画上去的洋红是另一个洋红，带自己的明暗，偏差是几十到上百。
    """
    small = image.resize((ANALYSIS_SIZE, ANALYSIS_SIZE), Image.Resampling.NEAREST).convert("RGB")
    pixels = list(small.getdata())
    size = ANALYSIS_SIZE
    is_key = [keying.is_key_pixel(*pixel) for pixel in pixels]

    # 从画幅四边泛洪，标出"外圈背景"。
    outer = [False] * (size * size)
    queue: deque[int] = deque()
    border = (
        list(range(size))
        + [x + (size - 1) * size for x in range(size)]
        + [y * size for y in range(size)]
        + [y * size + size - 1 for y in range(size)]
    )
    for index in border:
        if is_key[index] and not outer[index]:
            outer[index] = True
            queue.append(index)
    outer_cells: list[int] = []
    while queue:
        index = queue.popleft()
        outer_cells.append(index)
        x, y = index % size, index // size
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= nx < size and 0 <= ny < size:
                neighbour = ny * size + nx
                if is_key[neighbour] and not outer[neighbour]:
                    outer[neighbour] = True
                    queue.append(neighbour)

    body = sum(1 for value in is_key if not value)
    if not body or not outer_cells:
        return [], body
    background = [sum(pixels[i][c] for i in outer_cells) / len(outer_cells) for c in range(3)]

    regions: list[tuple[float, float]] = []
    visited = [False] * (size * size)
    for start in range(size * size):
        if not is_key[start] or outer[start] or visited[start]:
            continue
        visited[start] = True
        group = deque([start])
        cells: list[int] = []
        while group:
            index = group.popleft()
            cells.append(index)
            x, y = index % size, index // size
            for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                if 0 <= nx < size and 0 <= ny < size:
                    neighbour = ny * size + nx
                    if is_key[neighbour] and not outer[neighbour] and not visited[neighbour]:
                        visited[neighbour] = True
                        group.append(neighbour)
        # 8 格以下是抗锯齿碎屑，不是可判读的区域。
        if len(cells) < 8:
            continue
        mean = [sum(pixels[i][c] for i in cells) / len(cells) for c in range(3)]
        deviation = max(abs(mean[c] - background[c]) for c in range(3))
        regions.append((len(cells) / body * 100, deviation))

    regions.sort(reverse=True)
    return regions, body


def inspect_portrait(
    path: Path,
    keying: Keying,
    shared: dict,
    failures: list[str],
    *,
    loaded: Image.Image | None = None,
) -> None:
    """检视单张图 A 候选。

    **硬判据**（越界即失败），按判别力从强到弱：

    1. **四边留边**——本门控的主判据。半身像、膝上取景、切脚三种废图在键控底上
       一律表现为主体贴边（实测全部 0.00%），而母版是 3.81%。它同时覆盖验收清单
       10.1 的第 1 条（什么都不许裁）与第 6 条（四周都要有留白）——这两条其实是
       同一件可测的事。
    2. **键控底占比**——母版 78.6%，两种半身废图 44.8% / 49.0%。取景越紧背景越少。
    3. **连通域数量**——多角色、脱离身体的碎布片、浮在身侧的撬棍。
       注意它**读不出内部空洞**（空洞不会把轮廓切成两块），见 enclosed_key_regions。
    4. **主体高占比**——只抓"画得太小"。三种废图实测 0.960-0.963，比母版 0.920 还高，
       所以它对取景失败毫无判别力，不要指望它。

    **只作提示、不判失败的两项**，各自的降级理由都是实测的判别力不足：

    - **主体宽高比**。原为兜底硬判据，2026-08-23 由 bastion v01 降级：那张图是合格的
      全身像（留边 51px、键控底 59.9%、连通域 1，肉眼过），因为盾牌立在身侧，宽高比
      读作 **0.804**，而合成的腰部以上半身废图是 **0.809**——两者只差 0.005，
      判别力归零。硬卡下去就是对一张好图报错，而那种门控会被整体绕过
      （_fistNote 记过同一个教训）。三张废图另有留边与键控底两条各自拦得住，
      降级不留缺口。**代价要说清楚**：如果模型把半身像居中画在画幅里、四边留边又正常，
      这条降级后就没有量化判据能拦它了，只能靠肉眼过 10.1 第 1 条。
    - **内部键控色区域**。理由见 enclosed_key_regions 的文档串。

    **本门控证明不了的事**（必须肉眼过，见验收清单 10.1）：25° 侧身角度、与母版的画风
    与像素颗粒密度一致性、手指与五官解剖、脸是否朝右、武器造型是否正确、
    以及人物身上有没有被画上键控色。
    """
    print(f"\n=== {path.name} [图 A 战前档案立绘] ===")
    if loaded is None:
        print(f"  sha256={sha256_short(path)}")

    image = Image.open(path) if loaded is None else loaded
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
    min_gap = round(min(width, height) * shared["portraitEdgeGapRatio"])
    aspect = subject_w / subject_h
    fill = subject_h / height

    print(
        f"  主体 {subject_w}x{subject_h}  bbox {left},{top}..{right},{bottom}\n"
        f"  留边 左{gaps[0]} 上{gaps[1]} 右{gaps[2]} 下{gaps[3]}"
        f"  最小 {edge_gap}px (下限 {min_gap}px)"
    )

    # 1. 四边留边：主判据。
    if edge_gap < min_gap:
        side = ("左", "上", "右", "下")[gaps.index(edge_gap)]
        failures.append(
            f"{path.name} 主体在{side}边贴边 {edge_gap}px < {min_gap}px，"
            f"说明人物或武器跑出了画幅（切脚 / 半身像 / 膝上取景都是这一种）"
            f"（对照：母版留边 3.81%，三种废图全部 0.00%）"
        )

    # 2. 键控底占比。
    key_min = shared["portraitKeyRatioMin"]
    key_max = shared["portraitKeyRatioMax"]
    print(f"  键控底 {ratio * 100:.1f}% (区间 {key_min * 100:.0f}-{key_max * 100:.0f}%)")
    if ratio < key_min:
        failures.append(
            f"{path.name} 键控底仅 {ratio * 100:.1f}% < {key_min * 100:.0f}%，"
            f"取景过紧或主体画满整图（对照：母版 78.6%，半身废图 44.8-49.0%）"
        )
    if ratio > key_max:
        failures.append(
            f"{path.name} 键控底高达 {ratio * 100:.1f}% > {key_max * 100:.0f}%，主体过小或几乎为空"
        )

    # 3. 连通域。
    significant = [
        component for component in analyze_components(mask)
        if component["area_ratio"] >= COMPONENT_NOISE_RATIO
    ]
    areas = ", ".join(f"{c['area_ratio'] * 100:.1f}%" for c in significant[:5])
    print(f"  连通域 {len(significant)} 个 (面积占比: {areas})")
    if len(significant) > 1:
        failures.append(
            f"{path.name} 检出 {len(significant)} 个连通域，"
            f"可能画了多个角色，或有脱离身体的布片 / 浮在身侧的装备"
        )

    # 4. 宽高比：**只作提示**。2026-08-23 由 bastion v01 从硬判据降级，理由见函数文档串
    #    （合格的举盾全身像 0.804 对合成半身废图 0.809，判别力归零）。
    aspect_min = shared["portraitAspectMin"]
    aspect_max = shared["portraitAspectMax"]
    inside = aspect_min <= aspect <= aspect_max
    print(
        f"  主体宽高比（仅提示）{aspect:.3f}"
        f"  参考区间 {aspect_min}-{aspect_max}  -> {'区间内' if inside else '偏宽/偏窄'}"
    )
    if not inside:
        print(
            "    偏离参考区间不判失败：举盾的堡垒实测 0.804，与半身废图 0.809 只差 0.005。"
            "\n    请按验收清单 10.1 第 1 条肉眼确认这是全身像而不是半身像。"
        )

    # 5. 主体高占比：只抓"画得太小"。
    fill_min = shared["portraitFillMin"]
    fill_max = shared["portraitFillMax"]
    print(f"  主体高占画幅 {fill:.3f} (区间 {fill_min}-{fill_max}，只抓画得太小)")
    if not fill_min <= fill <= fill_max:
        failures.append(
            f"{path.name} 主体高占画幅 {fill:.3f} 越出 {fill_min}-{fill_max}"
            f"（对照：母版 0.920。注意这一条对取景失败没有判别力，"
            f"三种废图实测 0.960-0.963 反而更高）"
        )

    # 6. 内部键控色区域：**只作提示**。理由见 enclosed_key_regions 的文档串。
    regions, _ = enclosed_key_regions(image, keying)
    suspicious = [(area, dev) for area, dev in regions if dev > 12]
    print(f"  内部键控色区域（仅提示）{len(regions)} 块，其中颜色与背景不同的 {len(suspicious)} 块")
    for area, dev in regions[:4]:
        mark = "  <- 颜色与背景不同，可能是画在人物身上的洋红" if dev > 12 else ""
        print(f"    占主体 {area:5.2f}%  与背景最大通道差 {dev:5.1f}{mark}")
    if suspicious:
        print(
            "    这些区域会被键控当背景抠掉，人物身上会破洞。"
            "\n    合法空洞（如枪与身体之间的缝）露出的是背景本身，颜色差是个位数；"
            "\n    颜色差几十以上的基本是画上去的洋红，应当递增版本重新生成。"
        )


def synthesize_portrait_samples(master: Image.Image, keying: Keying) -> list[tuple[str, bool, Image.Image]]:
    """从母版现场合成图 A 门控的双向验证样本。

    与图 B 的 `on_magenta` 同一个用意：标定样本必须能从仓库内文件一条命令重算，
    而不是躺在 gitignored 的 TmpGenerate/ 里（那样标定过程无法复现，见模块内
    KENNEY_IN_USE 上方那段注释）。

    返回 (名称, 期望放行, 图) 三元组。三张废图分别对应三种真实的取景失败：
    腰部以上半身像、膝上取景、双脚被底边切断；另加一张"合格但很宽的全身"，
    用来证明门控没有把宽体格的堡垒一并误伤。
    """
    width, height = master.size
    mask = keying.mask(master)
    left, top, right, bottom = subject_bbox(mask)
    subject_h = bottom - top
    # 母版的留边比例，用来给裁出来的废图配上"看起来正常"的边距——
    # 废图必须因为取景被拦下，而不是因为我把它裁得没有边距。
    margin_ratio = top / subject_h

    samples: list[tuple[str, bool, Image.Image]] = [("母版 守望者图 A", True, master)]

    for label, frac in (("废图 腰部以上半身像", 0.55), ("废图 膝上取景", 0.75)):
        keep = int(subject_h * frac)
        pad = int(keep * margin_ratio)
        samples.append((label, False, master.crop((
            max(0, left - pad), max(0, top - pad),
            min(width, right + pad), top + keep + pad,
        ))))

    # 切脚：画幅裁到主体下缘，双脚正好贴住底边。
    samples.append(("废图 双脚被底边切断", False, master.crop((0, 0, width, bottom))))

    # 宽体格：堡垒举盾会落在这一档，必须放行。
    samples.append((
        "临界 合格全身 x1.40 宽", True,
        master.resize((int(width * 1.4), height), Image.Resampling.LANCZOS),
    ))
    return samples


def run_portrait_calibration(keying: Keying, shared: dict) -> int:
    """图 A 门控的双向验证。

    与图 B 的 `run_calibration` 同一条纪律：**先用已知样本验证门控本身，再去消耗
    生成额度**。图 A 这边只有一张在用素材（守望者母版），所以三张废图靠现场合成，
    合成方式见 `synthesize_portrait_samples`。
    """
    specs = json.loads(SPEC_PATH.read_text(encoding="utf-8"))
    master_path = portrait_archive_path(specs["characters"]["watcher"])
    if not master_path.exists():
        print(f"缺少图 A 母版 {master_path}，无法标定")
        return 1

    print("=== 图 A 门控双向验证 ===")
    print(f"母版: {master_path.name}")
    print("应放行: 守望者母版 + 合格但很宽的全身（堡垒举盾会落在这一档）")
    print("应拦下: 腰部以上半身像 / 膝上取景 / 双脚被底边切断\n")

    master = Image.open(master_path).convert("RGB")
    verdicts: list[tuple[str, bool, bool]] = []
    for label, expected, sample in synthesize_portrait_samples(master, keying):
        local: list[str] = []
        # 传 Path(label) 而不是 master_path：五张样本全是从母版现场合成的，
        # 打真实文件名会让五段报告看起来像同一张图被检了五遍。
        inspect_portrait(Path(label), keying, shared, local, loaded=sample)
        for item in local:
            print(f"  !! {item}")
        verdicts.append((label, expected, not local))

    print("\n--- 双向验证结论 ---")
    broken = 0
    for name, expected, actual in verdicts:
        ok = expected == actual
        broken += 0 if ok else 1
        print(
            f"  {'OK  ' if ok else 'FAIL'} {name}: "
            f"期望{'放行' if expected else '拦下'}，实测{'放行' if actual else '拦下'}"
        )
    if broken:
        print(f"\n图 A 门控本身有问题（{broken} 项不符），先修阈值再去生成。")
        return 1
    print("\n图 A 门控双向验证通过，可以用它把关新候选。")
    print("注意它证明不了 25° 侧身角度、与母版的画风一致性和五官/手指解剖——")
    print("那几项只能按验收清单 10.1 肉眼过。")
    return 0


def run_calibration(keying: Keying, shared: dict) -> int:
    """门控双向验证：放行在用素材，拦下已知废图。

    标定完成后必须先用已知样本验证门控本身，**再**去消耗生成额度
    （2026-08-21 的做法，见执行文档 2.2）。本函数把当时手工做的那一步固化下来，
    所以每次调阈值都能一条命令重跑，而不是重新手工合成一批临时文件。

    返回值是退出码：任一"应放行"样本被拦下，或"应拦下"样本被放行，都算门控失效。
    """
    print("=== 门控双向验证 ===")
    print("应放行: 在用五张 Kenney 精灵 + 已验收的守望者产物")
    print("应拦下: 2026-08-18 的斜视废图\n")

    verdicts: list[tuple[str, bool, bool]] = []  # (名称, 期望放行, 实际放行)

    for name, relative in KENNEY_IN_USE.items():
        path = KENNEY_ROOT / relative
        if not path.exists():
            print(f"跳过 {name}: 缺少源图 {path}")
            continue
        local: list[str] = []
        # framing=False：Kenney 是紧贴主体切好的成品，四边留边本来就是 0px。
        inspect_image(
            path, keying, shared, local,
            is_sprite=True, loaded=on_magenta(path), framing=False,
        )
        for item in local:
            print(f"  !! {item}")
        verdicts.append((f"Kenney {name}", True, not local))

    for label, path, framing in (
        ("已验收产物 sprite-watcher.png", ADOPTED, False),
        ("斜视废图 sprite-watcher-raw.png", KNOWN_BAD, True),
    ):
        if not path.exists():
            print(f"\n跳过 {label}: 缺少文件 {path}")
            continue
        local = []
        inspect_image(
            path, keying, shared, local,
            is_sprite=True, loaded=on_magenta(path), framing=framing,
        )
        for item in local:
            print(f"  !! {item}")
        verdicts.append((label, path is ADOPTED, not local))


    print("\n--- 双向验证结论 ---")
    broken = 0
    for name, expected, actual in verdicts:
        ok = expected == actual
        broken += 0 if ok else 1
        print(
            f"  {'OK  ' if ok else 'FAIL'} {name}: "
            f"期望{'放行' if expected else '拦下'}，实测{'放行' if actual else '拦下'}"
        )
    if broken:
        print(f"\n门控本身有问题（{broken} 项不符），先修阈值再去生成。")
        return 1
    print("\n门控双向验证通过，可以用它把关新候选。")
    return 0


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("character_id", nargs="?", help="角色 id，如 watcher")
    parser.add_argument(
        "--kind",
        choices=("sprite", "portrait"),
        default="sprite",
        help="sprite=图 B 关卡内实机精灵（默认），portrait=图 A 战前档案立绘",
    )
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
    parser.add_argument(
        "--calibrate",
        action="store_true",
        help="跑门控双向验证。图 B：在用五张 Kenney 精灵与已验收产物应放行，2026-08-18 废图应拦下。"
             "图 A（--kind portrait）：母版与宽体格应放行，三种取景废图应拦下",
    )
    args = parser.parse_args()

    failures: list[str] = []
    specs = json.loads(SPEC_PATH.read_text(encoding="utf-8"))
    shared = specs["shared"]
    keying = Keying(shared)
    portrait = args.kind == "portrait"

    if args.calibrate:
        sys.exit(run_portrait_calibration(keying, shared) if portrait
                 else run_calibration(keying, shared))

    if args.paths:
        for raw in args.paths:
            path = Path(raw)
            if not path.is_absolute():
                path = ROOT / path
            if not path.exists():
                print(f"\n=== {raw} ===\n  错误: 文件不存在")
                failures.append(f"{raw} 不存在")
                continue
            if portrait:
                inspect_portrait(path, keying, shared, failures)
            else:
                inspect_image(path, keying, shared, failures, is_sprite=not args.reference)
    else:
        if not args.character_id:
            raise SystemExit("需要角色 id，或改用 --paths 指定文件")
        spec, shared = load_spec(args.character_id)
        keying = Keying(shared)

        if portrait:
            if "portrait" not in spec:
                raise SystemExit(
                    f"{spec['displayName']} 的 spec 里没有 portrait 段，"
                    f"先补 scripts/character_asset_specs.json"
                )
            version = args.version or spec.get("portraitAdoptedVersion")
            if not version and not args.from_archive:
                raise SystemExit("需要 --version（该角色尚未记录 portraitAdoptedVersion）")
            print(f"目标: {spec['displayName']}  图 A 战前档案立绘  版本 {version or 'archive'}")
            print("形态: 全身侧身 25°，画武器，4:5 竖构图（与图 B 的判据完全不共用）")
            path = (
                portrait_archive_path(spec) if args.from_archive
                else TEMP_DIR / f"{spec['candidateSlug']}-portrait-{version}.png"
            )
            if not path.exists():
                print(f"\n=== {path.name} ===\n  错误: 文件不存在")
                failures.append(f"{path.name} 不存在")
            else:
                inspect_portrait(path, keying, shared, failures)
        else:
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
        if portrait:
            print("取景类失败尤其不要试图在后处理里补：被裁掉的腿和靴子是没有画出来的内容，")
            print("抠图和归一化都无法把它变回全身像。")
        else:
            print("机位类失败尤其不要试图在后处理里修：斜视图的腿和靴子是画出来的内容，")
            print("抠图和归一化都无法把它变成正俯视。")
        sys.exit(1)
    if portrait:
        print("检视全部通过。注意：本脚本证明的是取景、留边与连通域合规，")
        print("不能替代肉眼验收——25° 侧身角度、与母版的画风一致性、五官与手指解剖")
        print("仍需按 CHARACTER_PORTRAIT_PROMPTS.md 10.1 逐条过目。")
    else:
        print("检视全部通过。注意：本脚本证明的是机位、拳心与画幅合规，")
        print("不能替代实景复核——最终仍需在游戏里转满 360° 确认观感。")


if __name__ == "__main__":
    main()
