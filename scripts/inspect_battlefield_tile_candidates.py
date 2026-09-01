"""第二关地面/铁轨候选瓦片的量化探查。

存在理由：本机 Read 工具读这三张图集返回空内容（与
`docs/execution/2026-08-31-dust-zone-bitmap.md` §6 记录的预览图读取失败同源），
无法目视挑瓦片。因此不猜索引，改为把每个 16×16 单格的客观指标打印出来，
按指标选格。

只读不写，不产出任何运行时资源。挑选结论落在
`scripts/process_battlefield_environment_assets.py` 内。
"""

from __future__ import annotations

import argparse
import colorsys
from dataclasses import dataclass
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
DOWNLOADED = ROOT / "src" / "assets" / "downloaded" / "environment"

# 第二关现有程序化调色板，来自 src/systems/BattlefieldRenderer.ts:15。
# 色板归一的锚点：候选瓦片要向这五个值靠，而不是反过来。
LEVEL2_PALETTE = {
    "ground": (0x25, 0x28, 0x2A),
    "groundAlt": (0x30, 0x34, 0x37),
    "edge": (0x17, 0x19, 0x1B),
    "line": (0xA7, 0x7B, 0x3F),
    "detail": (0x59, 0x65, 0x6C),
}

SHEETS = {
    "kenney": (DOWNLOADED / "kenney-rpg-urban-pack" / "Tilemap" / "tilemap_packed.png", 16, 0),
    "city": (DOWNLOADED / "modern-city-extension" / "city_extension.png", 16, 0),
    "railway": (DOWNLOADED / "railway-line-terrain" / "railway_line_with_terrian.png", 16, 0),
}


@dataclass
class TileStat:
    col: int
    row: int
    index: int
    opaque_ratio: float
    mean: tuple[int, int, int]
    stdev: float
    saturation: float
    value: float
    nearest_palette: str
    palette_distance: float

    def line(self) -> str:
        r, g, b = self.mean
        return (
            f"  [{self.index:4d}] c{self.col:2d}r{self.row:2d} "
            f"opaque={self.opaque_ratio:5.2f} "
            f"mean=#{r:02x}{g:02x}{b:02x} "
            f"stdev={self.stdev:6.2f} sat={self.saturation:4.2f} val={self.value:4.2f} "
            f"near={self.nearest_palette}({self.palette_distance:6.1f})"
        )


def palette_distance(mean: tuple[int, int, int]) -> tuple[str, float]:
    """返回与 LEVEL2_PALETTE 中最近一项的名字与欧氏距离。"""
    best_name = ""
    best_dist = float("inf")
    for name, target in LEVEL2_PALETTE.items():
        dist = sum((a - b) ** 2 for a, b in zip(mean, target)) ** 0.5
        if dist < best_dist:
            best_dist = dist
            best_name = name
    return best_name, best_dist


def tile_stats(sheet: Image.Image, tile: int, spacing: int) -> list[TileStat]:
    step = tile + spacing
    cols = (sheet.width + spacing) // step
    rows = (sheet.height + spacing) // step
    stats: list[TileStat] = []

    for row in range(rows):
        for col in range(cols):
            x = col * step
            y = row * step
            if x + tile > sheet.width or y + tile > sheet.height:
                continue
            cell = sheet.crop((x, y, x + tile, y + tile))
            pixels = list(cell.getdata())
            opaque = [p for p in pixels if p[3] > 200]
            if not opaque:
                continue

            n = len(opaque)
            mean = tuple(sum(p[i] for p in opaque) // n for i in range(3))
            # stdev 用三通道各自方差的均值开根：低 stdev = 平坦，适合做可平铺基底；
            # 高 stdev = 有明显图案（窗户、轨枕），适合做结构件。
            var = sum(
                sum((p[i] - mean[i]) ** 2 for p in opaque) / n for i in range(3)
            ) / 3
            h, s, v = colorsys.rgb_to_hsv(*(c / 255 for c in mean))
            near, dist = palette_distance(mean)  # type: ignore[arg-type]

            stats.append(
                TileStat(
                    col=col,
                    row=row,
                    index=row * cols + col,
                    opaque_ratio=n / len(pixels),
                    mean=mean,  # type: ignore[arg-type]
                    stdev=var**0.5,
                    saturation=s,
                    value=v,
                    nearest_palette=near,
                    palette_distance=dist,
                )
            )
    return stats


ASCII_RAMP = " .:-=+*#%@"


def directional_structure(cell: Image.Image) -> tuple[float, float]:
    """返回（行间方差, 列间方差）。

    俯视铁轨的判据就在这两个数的比值上：钢轨是两条平行横线、轨枕是垂直短线，
    因此"逐行均值"的起伏远大于"逐列均值"的起伏。纯平坦地面两者都接近 0。
    这是在无法目视图像的前提下识别方向性结构的唯一可靠手段。
    """
    gray = cell.convert("LA")
    w, h = gray.size
    px = gray.load()

    row_means = []
    for y in range(h):
        vals = [px[x, y][0] for x in range(w) if px[x, y][1] > 200]
        if vals:
            row_means.append(sum(vals) / len(vals))
    col_means = []
    for x in range(w):
        vals = [px[x, y][0] for y in range(h) if px[x, y][1] > 200]
        if vals:
            col_means.append(sum(vals) / len(vals))

    def var(seq: list[float]) -> float:
        if len(seq) < 2:
            return 0.0
        m = sum(seq) / len(seq)
        return sum((v - m) ** 2 for v in seq) / len(seq)

    return var(row_means), var(col_means)


def ascii_preview(cell: Image.Image) -> list[str]:
    """把一格渲染成 16 行 ASCII 灰阶。无法看图时用它读出轮廓。"""
    gray = cell.convert("LA")
    w, h = gray.size
    px = gray.load()
    lines = []
    for y in range(h):
        row = ""
        for x in range(w):
            lum, alpha = px[x, y]
            if alpha <= 200:
                row += " "
            else:
                row += ASCII_RAMP[min(len(ASCII_RAMP) - 1, lum * len(ASCII_RAMP) // 256)]
        lines.append(row)
    return lines


def show_cells(name: str, indices: list[int]) -> None:
    """按索引打印指定格的 ASCII 预览与方向性指标。"""
    path, tile, spacing = SHEETS[name]
    sheet = Image.open(path).convert("RGBA")
    step = tile + spacing
    cols = (sheet.width + spacing) // step

    for index in indices:
        row, col = divmod(index, cols)
        x, y = col * step, row * step
        if x + tile > sheet.width or y + tile > sheet.height:
            print(f"  [{index}] 越界")
            continue
        cell = sheet.crop((x, y, x + tile, y + tile))
        rv, cv = directional_structure(cell)
        print(f"\n  --- {name} [{index}] c{col}r{row}  行方差={rv:8.1f} 列方差={cv:8.1f} ---")
        for line in ascii_preview(cell):
            print(f"    |{line}|")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sheet", choices=sorted(SHEETS), help="只看某一张图集")
    parser.add_argument(
        "--mode",
        choices=["flat", "structured", "all", "rails", "show"],
        default="flat",
        help=(
            "flat=平坦满格候选（地面基底）；structured=高方差满格；all=全部；"
            "rails=按行方差/列方差比找横向结构（铁轨）；show=打印 --cells 指定格的 ASCII"
        ),
    )
    parser.add_argument("--limit", type=int, default=24, help="每张图集打印条数")
    parser.add_argument("--cells", help="配合 --mode show，逗号分隔的格索引")
    args = parser.parse_args()

    if args.mode == "show":
        if not args.sheet or not args.cells:
            parser.error("--mode show 需要同时给 --sheet 与 --cells")
        show_cells(args.sheet, [int(c) for c in args.cells.split(",")])
        return

    names = [args.sheet] if args.sheet else sorted(SHEETS)

    for name in names:
        path, tile, spacing = SHEETS[name]
        if not path.exists():
            print(f"{name}: 缺失 {path}")
            continue

        sheet = Image.open(path).convert("RGBA")
        step = tile + spacing
        cols = (sheet.width + spacing) // step
        rows = (sheet.height + spacing) // step
        stats = tile_stats(sheet, tile, spacing)

        print(f"\n=== {name} :: {path.name} ===")
        print(f"  尺寸 {sheet.width}x{sheet.height}  网格 {cols}x{rows}  非空格 {len(stats)}")

        # 地面基底必须近乎满格不透明，否则平铺会露底。
        full = [s for s in stats if s.opaque_ratio > 0.99]
        print(f"  满格(opaque>0.99) {len(full)} 格")

        if args.mode == "flat":
            # 平坦 + 低饱和 + 暗：第二关是工业废站，锚点 ground 是 #25282a。
            picked = sorted(
                (s for s in full if s.stdev < 30 and s.saturation < 0.35),
                key=lambda s: s.palette_distance,
            )
            print(f"  -- 平坦低饱和满格，按与 level_2 色板距离升序 --")
        elif args.mode == "structured":
            picked = sorted(
                (s for s in full if s.stdev >= 30),
                key=lambda s: -s.stdev,
            )
            print(f"  -- 高方差满格（结构件候选），按 stdev 降序 --")
        elif args.mode == "rails":
            # 横向结构判据：行方差显著高于列方差。钢轨+轨枕的俯视图必然命中这一条。
            scored = []
            for s in full:
                x, y = s.col * step, s.row * step
                cell = sheet.crop((x, y, x + tile, y + tile))
                rv, cv = directional_structure(cell)
                if rv > 120 and rv > cv * 2.0:
                    scored.append((rv / max(cv, 1.0), rv, cv, s))
            scored.sort(key=lambda t: -t[0])
            print("  -- 横向结构候选（行方差 > 120 且 > 列方差×2），按比值降序 --")
            for ratio, rv, cv, s in scored[: args.limit]:
                print(f"{s.line()}  行/列={ratio:6.2f} 行={rv:7.1f} 列={cv:7.1f}")
            if not scored:
                print("  （无命中）")
            if len(scored) > args.limit:
                print(f"  … 另有 {len(scored) - args.limit} 格未列出")
            continue
        else:
            picked = sorted(stats, key=lambda s: s.index)
            print(f"  -- 全部非空格 --")

        for s in picked[: args.limit]:
            print(s.line())
        if len(picked) > args.limit:
            print(f"  … 另有 {len(picked) - args.limit} 格未列出")


if __name__ == "__main__":
    main()
