"""第二关（废车站）正式位图环境的派生脚本。

G5-2。产出三张运行时贴图：地面基底瓦片、铁轨带、边界带。

为什么不扩展 `process_environment_assets.py`：
它的 `save_image()` 强制"四角必须透明"，那条校验对**可无缝平铺的地面瓦片**是反向
约束——地面瓦片必须四角有像素。同一输出目录已有两个写入方
（`process_environment_assets.py` 与 `process_prop_item_assets.py`），本脚本是第三个，
输出名统一带 `battlefield-level2-` 前缀，避免与既有 16 张碰撞。

选格依据：`scripts/inspect_battlefield_tile_candidates.py` 的量化探查。本机无法目视图像
（Read 工具对所有 PNG 返回空），因此每个索引都由"指标 + ASCII 轮廓"两步确认，
不靠肉眼挑图。索引不要手改，改了必须重跑探查脚本复核。

色板归一锚点是 `src/systems/BattlefieldRenderer.ts:15` 的 `level_2` 五值。
三个来源包原色明显偏亮（源 value 0.41~0.47，目标 ground value 0.16），
因此归一的主要动作是压暗 + 去饱和，满足 ART_BIBLE §3「场景底色保持低对比，
为角色、弹体、掉落和警报留出明度差」。
"""

from __future__ import annotations

import argparse
import hashlib
from dataclasses import dataclass
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
DOWNLOADED = ROOT / "src" / "assets" / "downloaded" / "environment"
OUTPUT_DIR = ROOT / "src" / "assets" / "processed" / "environment"

KENNEY_SHEET = DOWNLOADED / "kenney-rpg-urban-pack" / "Tilemap" / "tilemap_packed.png"
CITY_SHEET = DOWNLOADED / "modern-city-extension" / "city_extension.png"
RAILWAY_SHEET = DOWNLOADED / "railway-line-terrain" / "railway_line_with_terrian.png"

TILE = 16

# 目标画布尺寸。逻辑画布 1280x720（src/constants.ts:3-4）。
GAME_WIDTH = 1280
# 铁轨带高度与 drawAbandonedStation() 的 y=92..208 一致（BattlefieldRenderer.ts:145）。
RAIL_BAND_HEIGHT = 116
# 边界厚度与 drawWorldBoundary() 一致（BattlefieldRenderer.ts:464-467）。
BOUNDARY_THICKNESS = 20

# level_2 调色板，来自 BattlefieldRenderer.ts:15。归一目标，不是建议值。
PALETTE_GROUND = (0x25, 0x28, 0x2A)
PALETTE_GROUND_ALT = (0x30, 0x34, 0x37)
PALETTE_EDGE = (0x17, 0x19, 0x1B)
PALETTE_DETAIL = (0x59, 0x65, 0x6C)

# 放大倍数：源瓦片 16x16，三包一致。2 倍到 32x32 落在 ART_BIBLE §2「场景物源尺寸
# 16-64px」区间内，且 1280/32=40 整除，横向不留残列。
UPSCALE = 2


@dataclass(frozen=True)
class TilePick:
    """一个已由探查脚本确认的源格。"""

    sheet: Path
    index: int
    note: str

    def crop(self) -> Image.Image:
        sheet = Image.open(self.sheet).convert("RGBA")
        cols = sheet.width // TILE
        row, col = divmod(self.index, cols)
        x, y = col * TILE, row * TILE
        if x + TILE > sheet.width or y + TILE > sheet.height:
            raise ValueError(f"{self.sheet.name} 索引 {self.index} 越界")
        return sheet.crop((x, y, x + TILE, y + TILE))


# 地面基底：Kenney c9r16。探查实测行方差 0.4 / 列方差 0.1，是全部候选里最平坦的满格，
# 只带极稀疏噪点，平铺后不会出现可辨认的重复图案。
# 明确排除相邻的 c8r16（440）：它左下角有 `*+=` 亮块，平铺后会形成规律脏点阵。
GROUND_TILE = TilePick(KENNEY_SHEET, 441, "Kenney c9r16 平坦工业地面，行/列方差 0.4/0.1")

# 铁轨：Railway c9r0 + c9r1 上下相接构成一组完整复线。
# c9r0 上半为道砟、下半出现第一条钢轨（ASCII 第 10 行 `====`）；
# c9r1 上半为轨枕、第 4 行是第二条钢轨，两轨中心相距约 10px。
RAIL_TILE_TOP = TilePick(RAILWAY_SHEET, 9, "Railway c9r0 道砟 + 第一条钢轨")
RAIL_TILE_BOTTOM = TilePick(RAILWAY_SHEET, 25, "Railway c9r1 第二条钢轨 + 轨枕")

# 边界：Modern City c34r2。探查显示上下各有一条横向硬边（行方差 179.7 / 列方差 0.0），
# 正是"带明确上下边缘的水平构件"，适合作边界带的横向单元。
BOUNDARY_TILE = TilePick(CITY_SHEET, 146, "Modern City c34r2 上下双硬边水平构件")


def normalize_to_palette(
    image: Image.Image,
    target: tuple[int, int, int],
    strength: float,
    desaturate: float,
) -> Image.Image:
    """把整格向 target 收敛。

    strength 是向目标色的插值权重，desaturate 是先行去饱和的权重。
    保留原始像素间的相对明暗差（纹理），只搬移整体色相与亮度——
    直接整格替换成纯色会把瓦片变回"程序化纯色块"，那就失去位图化的意义了。
    """
    out = image.convert("RGBA")
    px = out.load()
    w, h = out.size

    def desaturated(pixel: tuple[int, int, int, int]) -> tuple[float, float, float]:
        r, g, b, _ = pixel
        gray = 0.299 * r + 0.587 * g + 0.114 * b
        return (
            r + (gray - r) * desaturate,
            g + (gray - g) * desaturate,
            b + (gray - b) * desaturate,
        )

    # 均值必须在**去饱和之后**统计。早期版本用原始像素求均值，导致"像素相对均值的偏移"
    # 仍带着源包的原生色偏（railway 的棕、city 的青），归一后 ground 读成 #302f23 黄绿、
    # boundary 读成 #271712 红棕，而不是目标的中性灰。
    opaque = [desaturated(px[x, y]) for y in range(h) for x in range(w) if px[x, y][3] > 0]
    if not opaque:
        return out
    mean = tuple(sum(p[i] for p in opaque) / len(opaque) for i in range(3))

    for y in range(h):
        for x in range(w):
            pixel = px[x, y]
            if pixel[3] == 0:
                continue
            r, g, b = desaturated(pixel)
            # 把"该像素相对本格均值的偏移"叠加到目标色上：搬移整体色相与亮度，保住纹理。
            nr = target[0] + (r - mean[0])
            ng = target[1] + (g - mean[1])
            nb = target[2] + (b - mean[2])
            px[x, y] = (
                max(0, min(255, round(r + (nr - r) * strength))),
                max(0, min(255, round(g + (ng - g) * strength))),
                max(0, min(255, round(b + (nb - b) * strength))),
                pixel[3],
            )
    return out


def compress_highlights(image: Image.Image, ceiling: float) -> Image.Image:
    """把超过 ceiling 的明度按比例压回，保留相对次序。

    存在理由：`normalize_to_palette` 保留"像素相对本格均值的偏移"以留住纹理，
    但 railway 源格的道砟本身极亮（stdev 约 67），偏移被原样带过来后钢轨会冲到
    明度 196，接近纯白。ART_BIBLE §3 要求场景底色保持低对比、为弹体和警报留明度差——
    近白钢轨会直接和子弹抢读数，因此必须设上限。

    压缩而不是硬截断：硬截断会把钢轨顶面压成一片死白，反而丢掉轨面高光的形状。
    """
    out = image.convert("RGBA")
    px = out.load()
    w, h = out.size

    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            lum = 0.299 * r + 0.587 * g + 0.114 * b
            if lum <= ceiling:
                continue
            # 超出部分按 sqrt 衰减：越亮压得越狠，但仍单调递增。
            excess = lum - ceiling
            target_lum = ceiling + excess**0.5
            scale = target_lum / lum
            px[x, y] = (
                max(0, min(255, round(r * scale))),
                max(0, min(255, round(g * scale))),
                max(0, min(255, round(b * scale))),
                a,
            )
    return out


def upscale(image: Image.Image, factor: int = UPSCALE) -> Image.Image:
    """最近邻整数放大。ART_BIBLE §2 禁止双线性缩放。"""
    return image.resize((image.width * factor, image.height * factor), Image.NEAREST)


def tile_horizontally(unit: Image.Image, width: int) -> Image.Image:
    """把一个单元横向平铺到指定宽度，右端裁齐。"""
    out = Image.new("RGBA", (width, unit.height), (0, 0, 0, 0))
    for x in range(0, width, unit.width):
        out.paste(unit, (x, 0))
    return out.crop((0, 0, width, unit.height))


def build_ground() -> Image.Image:
    """地面基底瓦片：单块可平铺单元，运行时由 TileSprite 铺满。

    不在这里铺成 1280x720：TileSprite 只需要一个单元，
    输出整屏图会让 720/32=22.5 的残行问题从运行时搬到磁盘上，且文件大 900 倍。
    """
    tile = GROUND_TILE.crop()
    tile = normalize_to_palette(tile, PALETTE_GROUND, strength=0.88, desaturate=0.75)
    return upscale(tile)


def build_rail_band() -> Image.Image:
    """铁轨带：1280 x 116，钢轨居中，上下用地面色道砟填充。

    116 的来源是 drawAbandonedStation() 的 y=92..208。两块源瓦片放大后共 64px，
    因此上下各需补 26px 道砟，钢轨组中心落在带内 y=58，
    对应画布 y=92+58=150。注意程序化版本的轨线中心在 y=118，
    两者不同是刻意的：程序化版把 y=118 当"第一条轨线"，
    位图版把复线组居中于带内，视觉重心与带一致。
    """
    top = normalize_to_palette(
        RAIL_TILE_TOP.crop(), PALETTE_DETAIL, strength=0.62, desaturate=0.85
    )
    bottom = normalize_to_palette(
        RAIL_TILE_BOTTOM.crop(), PALETTE_DETAIL, strength=0.62, desaturate=0.85
    )

    rail_unit = Image.new("RGBA", (TILE, TILE * 2), (0, 0, 0, 0))
    rail_unit.paste(top, (0, 0))
    rail_unit.paste(bottom, (0, TILE))
    # 上限 128：detail 锚点 #59656c 的明度约 98，钢轨允许比它亮一档以读出金属感，
    # 但不能进入子弹与警报占用的高明度区。
    rail_unit = compress_highlights(rail_unit, ceiling=128.0)
    rail_scaled = upscale(rail_unit)

    band = Image.new("RGBA", (GAME_WIDTH, RAIL_BAND_HEIGHT), (0, 0, 0, 0))

    # 道砟底：用地面色压暗版铺满整带，作为钢轨的承托。
    ballast = normalize_to_palette(
        GROUND_TILE.crop(), PALETTE_EDGE, strength=0.82, desaturate=0.8
    )
    ballast_row = tile_horizontally(upscale(ballast), GAME_WIDTH)
    for y in range(0, RAIL_BAND_HEIGHT, ballast_row.height):
        band.paste(ballast_row, (0, y))

    rails = tile_horizontally(rail_scaled, GAME_WIDTH)
    band.paste(rails, (0, (RAIL_BAND_HEIGHT - rails.height) // 2), rails)
    return band.crop((0, 0, GAME_WIDTH, RAIL_BAND_HEIGHT))


def build_boundary() -> Image.Image:
    """边界带：1280 x 20，横向平铺。

    20 的来源是 drawWorldBoundary()。源格放大后 32px 高，需裁到 20px；
    取中间 20 行而不是顶部 20 行，保住上下两条硬边中的结构感。
    """
    tile = normalize_to_palette(
        BOUNDARY_TILE.crop(), PALETTE_EDGE, strength=0.9, desaturate=0.9
    )
    scaled = upscale(tile)
    row = tile_horizontally(scaled, GAME_WIDTH)
    top = (row.height - BOUNDARY_THICKNESS) // 2
    return row.crop((0, top, GAME_WIDTH, top + BOUNDARY_THICKNESS))


OUTPUTS = {
    "battlefield-level2-ground.png": build_ground,
    "battlefield-level2-rail.png": build_rail_band,
    "battlefield-level2-boundary.png": build_boundary,
}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def mean_color(image: Image.Image) -> tuple[int, int, int]:
    px = image.convert("RGBA").load()
    w, h = image.size
    vals = [px[x, y] for y in range(h) for x in range(w) if px[x, y][3] > 0]
    if not vals:
        return (0, 0, 0)
    return tuple(sum(p[i] for p in vals) // len(vals) for i in range(3))  # type: ignore[return-value]


def palette_distance(mean: tuple[int, int, int], target: tuple[int, int, int]) -> float:
    return sum((a - b) ** 2 for a, b in zip(mean, target)) ** 0.5


def luminance_deciles(image: Image.Image) -> tuple[float, float]:
    """返回（暗十分位均值, 亮十分位均值）的明度。

    用于铁轨带：钢轨与道砟的明度差必须够大，轨道才读得出来。
    取十分位而不是极值，避免单个噪点决定结论。
    """
    px = image.convert("RGBA").load()
    w, h = image.size
    lums = [
        0.299 * px[x, y][0] + 0.587 * px[x, y][1] + 0.114 * px[x, y][2]
        for y in range(h)
        for x in range(w)
        if px[x, y][3] > 0
    ]
    if not lums:
        return (0.0, 0.0)
    lums.sort()
    cut = max(1, len(lums) // 10)
    dark = sum(lums[:cut]) / cut
    bright = sum(lums[-cut:]) / cut
    return (dark, bright)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--inspect-only",
        action="store_true",
        help="只打印判据，不写文件（与 process_prop_item_assets.py 的同名参数一致）",
    )
    args = parser.parse_args()

    for source in (KENNEY_SHEET, CITY_SHEET, RAILWAY_SHEET):
        if not source.exists():
            raise SystemExit(f"缺少来源图集：{source}")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # 每张产物的归一目标，用于打印量化判据（§6 建议 3：不靠肉眼判断"像不像"）。
    #
    # 铁轨带刻意不用 detail 作整带目标：带内主体面积是道砟（归一到 edge），
    # 钢轨只占少数行。拿整带均值去比 detail measures 的是错的东西——
    # 早期版本这么做，报出 52.1 的"偏差"，而实际图像并无问题。
    # 铁轨带的真实要求是**钢轨必须比道砟亮**，否则轨道读不出来，
    # 因此它的判据是"亮十分位 vs 暗十分位的明度差"，不是与单一色板值的距离。
    targets = {
        "battlefield-level2-ground.png": ("ground", PALETTE_GROUND),
        "battlefield-level2-boundary.png": ("edge", PALETTE_EDGE),
    }

    for name, build in OUTPUTS.items():
        image = build()
        print(f"{name}")
        print(f"  尺寸 {image.width}x{image.height}")
        mean = mean_color(image)
        print(f"  主色均值 #{mean[0]:02x}{mean[1]:02x}{mean[2]:02x}")

        if name in targets:
            label, target = targets[name]
            dist = palette_distance(mean, target)
            print(f"  归一目标 {label} #{target[0]:02x}{target[1]:02x}{target[2]:02x}")
            print(f"  色板距离 {dist:.1f}")
        else:
            dark, bright = luminance_deciles(image)
            print(f"  道砟（暗十分位）明度 {dark:.1f}")
            print(f"  钢轨（亮十分位）明度 {bright:.1f}")
            print(f"  轨/砟明度差 {bright - dark:.1f}")
            # 双侧判据。只设下限会放过"近白钢轨"，那样违反 ART_BIBLE §3 的低对比要求
            # 并与子弹抢读数；只设上限会放过"轨道糊在道砟里"。
            ok_low = bright - dark > 25
            ok_high = bright <= 145
            print(f"  判据 轨道可辨（差 > 25）：{'通过' if ok_low else '未通过'}")
            print(f"  判据 不抢弹体读数（亮十分位 <= 145）：{'通过' if ok_high else '未通过'}")

        if args.inspect_only:
            print("  （inspect-only，未写入）")
            continue

        path = OUTPUT_DIR / name
        image.save(path)
        print(f"  写入 {path.relative_to(ROOT)}")
        print(f"  SHA-256 {sha256(path)}")


if __name__ == "__main__":
    main()
