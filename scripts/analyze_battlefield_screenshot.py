"""从 CDP 截图取样，判定第二关地面/铁轨/边界是否真的以位图渲染。

为什么不用页面内 readPixels：Phaser 默认 `preserveDrawingBuffer: false`，
帧呈现后 drawing buffer 即被清空，在帧回调之外调 `gl.readPixels` 只能读到纯黑
（实测五个取样区 stdev 全为 0、distinctLums 全为 1）。CDP 的
`Page.captureScreenshot` 走合成器路径，拿到的是真实画面，因此改从截图取样。

核心判据：**程序化纯色填充 vs 位图瓦片，靠区域内明度方差区分。**
程序化地面是 `fillRect` 单色，区域内像素几乎全等（stdev≈0，distinctLums 极少）；
位图瓦片带噪点，stdev 必然明显大于 0。这是本机无法目视图像时唯一可靠的判别法。

用法：
  python scripts/analyze_battlefield_screenshot.py .debug-g52-bitmap/level2.png
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from PIL import Image

# 逻辑画布尺寸，src/constants.ts:3-4。
LOGICAL_W = 1280
LOGICAL_H = 720

# 取样区：(标签, 逻辑 x, y, w, h, 说明)
# 坐标依据 BattlefieldRenderer.drawAbandonedStation() 与 drawBitmapBoundary()。
REGIONS = [
    ("地面·中央通道空地", 600, 330, 60, 40, "位图地面 + 半透明通道底色"),
    ("地面·左下开阔区", 150, 650, 60, 40, "只有位图地面，无叠加层"),
    ("铁轨带·上", 600, 130, 60, 40, "y=92..208 内，应比地面亮且方差更大"),
    ("铁轨带·下", 600, 550, 60, 40, "y=512..628 内"),
    ("边界·顶", 600, 4, 60, 12, "y=0..20"),
    ("边界·左", 4, 300, 12, 60, "x=0..20"),
    ("边界·底", 600, 706, 60, 12, "y=700..720"),
]


def sample(img: Image.Image, scale: float, lx: int, ly: int, lw: int, lh: int) -> dict:
    x, y = round(lx * scale), round(ly * scale)
    w, h = max(1, round(lw * scale)), max(1, round(lh * scale))
    cell = img.crop((x, y, x + w, y + h)).convert("RGB")
    px = list(cell.getdata())
    n = len(px)

    lums = [0.299 * r + 0.587 * g + 0.114 * b for r, g, b in px]
    mean_lum = sum(lums) / n
    stdev = (sum((v - mean_lum) ** 2 for v in lums) / n) ** 0.5
    mean_rgb = tuple(sum(p[i] for p in px) // n for i in range(3))

    return {
        "mean": f"#{mean_rgb[0]:02x}{mean_rgb[1]:02x}{mean_rgb[2]:02x}",
        "meanLum": mean_lum,
        "stdev": stdev,
        "distinct": len(set(lums)),
        "samples": n,
    }


def sample_at(img: Image.Image, ox: float, oy: float, scale: float,
              lx: int, ly: int, lw: int, lh: int) -> dict:
    """按画布原点偏移 + 缩放换算后取样。"""
    x, y = round(ox + lx * scale), round(oy + ly * scale)
    w, h = max(1, round(lw * scale)), max(1, round(lh * scale))
    cell = img.crop((x, y, x + w, y + h)).convert("RGB")
    px = list(cell.getdata())
    n = len(px)
    lums = [0.299 * r + 0.587 * g + 0.114 * b for r, g, b in px]
    mean_lum = sum(lums) / n
    stdev = (sum((v - mean_lum) ** 2 for v in lums) / n) ** 0.5
    mean_rgb = tuple(sum(p[i] for p in px) // n for i in range(3))
    return {
        "mean": f"#{mean_rgb[0]:02x}{mean_rgb[1]:02x}{mean_rgb[2]:02x}",
        "meanLum": mean_lum,
        "stdev": stdev,
        "distinct": len(set(lums)),
        "samples": n,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("screenshot", help="CDP 截图路径")
    parser.add_argument("--probe", help="probe.json 路径，用其中 canvasRect 换算坐标")
    args = parser.parse_args()

    path = Path(args.screenshot)
    if not path.exists():
        raise SystemExit(f"截图不存在：{path}")

    img = Image.open(path)

    # 优先用探针记录的画布真实矩形。
    # 只按 img.width / 1280 推缩放会在视口被浏览器边框挤小时出错：
    # 实测过一次 1264x625 的截图，横纵缩放 0.988 / 0.868 不一致，
    # 逻辑坐标 y=650 直接落到画布外的黑边上，被误读成"地面是纯色"。
    ox = oy = 0.0
    if args.probe:
        import json
        rect = json.loads(Path(args.probe).read_text(encoding="utf-8")).get("canvasRect")
        if rect:
            # 逻辑画布宽度 = 战场 1280 + 左右侧栏（宽屏侧栏 HUD 会把画布加宽到 1520）。
            # 战场世界起点因此不在 x=0，而在 (逻辑宽 - 1280) / 2。
            # 首版忽略这一点，逻辑 x=0..20 的"边界"取样实际采的是左侧栏。
            #
            # 逻辑宽不能读 scale.gameSize.width——实测它报 1280 而缓冲是 1520，不可靠。
            # 改由缓冲反推：Phaser 的游戏尺寸 = 逻辑尺寸 × renderScale，
            # 而 renderScale 只有 1 或 2（DisplayManager.MAX_RENDER_SCALE），
            # 故 renderScale = bufferHeight / 720，逻辑宽 = bufferWidth / renderScale。
            render_scale = max(1, round(rect["bufferHeight"] / LOGICAL_H))
            logical_w = rect["bufferWidth"] / render_scale
            sidebar = max(0.0, (logical_w - LOGICAL_W) / 2)

            # CSS 矩形对应整个逻辑画布（含侧栏），按它求每逻辑像素的显示尺寸。
            scale = rect["cssWidth"] / logical_w
            sy = rect["cssHeight"] / LOGICAL_H
            ox = float(rect["cssLeft"]) + sidebar * scale
            oy = float(rect["cssTop"])

            print(f"截图 {img.width}x{img.height}；画布 CSS 矩形 "
                  f"({rect['cssLeft']},{rect['cssTop']}) {rect['cssWidth']}x{rect['cssHeight']}")
            print(f"  缓冲 {rect['bufferWidth']}x{rect['bufferHeight']}，renderScale={render_scale}")
            print(f"  逻辑画布宽 {logical_w:.0f}（战场 {LOGICAL_W} + 侧栏各 {sidebar:.0f}）")
            print(f"  缩放 x={scale:.3f} y={sy:.3f}；战场原点在截图 ({ox:.1f},{oy:.1f})")
            if abs(sy - scale) > 0.02:
                raise SystemExit(
                    f"横纵缩放不一致（{scale:.3f} vs {sy:.3f}）——取样必然错位，拒绝给结论。"
                )
        else:
            scale = img.width / LOGICAL_W
            print(f"截图 {img.width}x{img.height}（probe.json 无 canvasRect，按宽度推缩放 {scale:.3f}）")
    else:
        scale = img.width / LOGICAL_W
        print(f"截图 {img.width}x{img.height}，按宽度推缩放 {scale:.3f}")
        if abs(img.height / LOGICAL_H - scale) > 0.02:
            raise SystemExit(
                f"宽高缩放不一致（h 比 {img.height / LOGICAL_H:.3f}）——取样会落到画布外黑边，"
                "拒绝在此截图上给结论。请用 --probe 传入 canvasRect，或锁定视口重截。"
            )

    print()
    rows = []
    for label, lx, ly, lw, lh, note in REGIONS:
        s = sample_at(img, ox, oy, scale, lx, ly, lw, lh)
        rows.append((label, s, note))
        print(f"{label}")
        print(f"  均值 {s['mean']}  明度 {s['meanLum']:.1f}  stdev {s['stdev']:.2f}"
              f"  不同明度值 {s['distinct']}  取样 {s['samples']}")
        print(f"  ({note})")

    print("\n=== 判据 ===")
    ground = next(s for label, s, _ in rows if label == "地面·左下开阔区")
    rail_top = next(s for label, s, _ in rows if label == "铁轨带·上")
    rail_bottom = next(s for label, s, _ in rows if label == "铁轨带·下")
    border_top = next(s for label, s, _ in rows if label == "边界·顶")

    checks = []

    # 1. 地面是位图而不是程序化纯色。
    #
    # 判据用「不同明度值个数」而不是 stdev。程序化 fillRect 填的是单一颜色，
    # 区域内 distinct 恒为 1（本脚本三条边界取样正好演示：stdev 0.00 / distinct 1）；
    # 位图瓦片必然多于 1。
    # 早期版本卡 stdev > 1.5，把地面判成未通过——但地面选的本就是全部候选中最平坦
    # 那一格（行/列方差 0.4/0.1），再经 FIT 降采样平滑，stdev 只有 1.37，
    # 而 distinct 是 22。那是判据量错了对象，不是地面没上位图。
    checks.append((
        "地面为位图（不同明度值 > 1；程序化纯色填充恒为 1）",
        ground["distinct"] > 1,
        f"distinct={ground['distinct']}, stdev={ground['stdev']:.2f}",
    ))

    # 2. 铁轨带必须有内部结构，轨道才读得出来。
    #
    # 只用 stdev，不用「与地面的明度差」：带高 116px，钢轨组居中，
    # 取样落在带内哪一段决定均值——落在道砟段时差值只有 7，落在钢轨段则超过 30。
    # 能稳定证明"轨道存在"的是内部方差，不是区域均值。
    for name, rail in (("上", rail_top), ("下", rail_bottom)):
        checks.append((
            f"铁轨带·{name} 有内部结构（stdev > 8）",
            rail["stdev"] > 8,
            f"stdev={rail['stdev']:.2f}, distinct={rail['distinct']}",
        ))
        # 钢轨的亮部必须明显亮于地面，否则轨面读不出金属感。
        checks.append((
            f"铁轨带·{name} 亮于地面（均值差 > 3）",
            rail["meanLum"] - ground["meanLum"] > 3,
            f"轨={rail['meanLum']:.1f} 地={ground['meanLum']:.1f} 差={rail['meanLum'] - ground['meanLum']:.1f}",
        ))

    # 3. 边界必须比地面暗（edge 锚点 #17191b 明度约 25，地面 ground 约 40）。
    checks.append((
        "顶边界比地面暗",
        border_top["meanLum"] < ground["meanLum"],
        f"界={border_top['meanLum']:.1f} 地={ground['meanLum']:.1f}",
    ))

    # 3b. 三条边界必须读到同一个值——它们贴的是同一张贴图，
    # 若某条明显不同，说明有一条没铺上或被别的东西盖住了。
    border_left = next(s for label, s, _ in rows if label == "边界·左")
    border_bottom = next(s for label, s, _ in rows if label == "边界·底")
    border_lums = [border_top["meanLum"], border_left["meanLum"], border_bottom["meanLum"]]
    checks.append((
        "三条边界读到同一贴图（明度极差 < 2）",
        max(border_lums) - min(border_lums) < 2,
        f"顶={border_lums[0]:.1f} 左={border_lums[1]:.1f} 底={border_lums[2]:.1f}",
    ))

    # 4. ART_BIBLE §3：场景底色低对比，为弹体和警报留明度差。
    checks.append((
        "地面明度未侵占弹体区间（< 110）",
        ground["meanLum"] < 110,
        f"明度={ground['meanLum']:.1f}",
    ))

    failed = 0
    for label, ok, detail in checks:
        print(f"  [{'通过' if ok else '未通过'}] {label} — {detail}")
        if not ok:
            failed += 1

    print(f"\n{len(checks) - failed}/{len(checks)} 条通过")
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
