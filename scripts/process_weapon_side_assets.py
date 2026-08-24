"""把重型武器侧视图标候选处理成运行时产物。

存在理由与检视脚本同源，见 scripts/weapon_side_specs.json 的文件头 _note：
gatling / golden_m249 / flamethrower 三张原先由 process_heavy_weapon_assets.ps1 用 GDI+
图元现画，与另外八张裁自真实像素美术素材包的图摆在同一个 HUD 槽位里差距刺眼。

管线四步，每一步都有一个不能省的理由：

  1. 键控     复用 process_zombie_sprites.remove_magenta_background。上游偶尔直接返回
              带 alpha 的图而不是洋红底（golden_m249 v01 实测如此），所以先判后键。
  2. 中和残留 把仍偏洋红的像素钳回中性。键控自带的去色溢只作用于「紧邻已键出背景」的
              像素，够不到被金属包住的深色缝隙——加特林枪管之间、机匣面板线里都有，
              实测 243 个（详见 _residueNote）。这三把枪的配色没有任何合法的紫，
              所以可以无条件钳，不需要按位置限制。
  3. 降采样   预乘 alpha 后再 LANCZOS。**这一步的顺序是本文件唯一容易写错的地方**：
              直接对非预乘 RGBA 做 resize，透明区的 RGB（对 golden_m249 是纯黑）会按
              权重混进边缘像素，产出一圈深色脏边。预乘后透明像素的贡献是 0，缩完再还原。
  4. 落幅     居中放入 132x48。画幅必须与被替换的旧产物一致，运行时侧
              （weaponLibrary.ts 的 scale 2.35、HUD 与整备的等比适配）才不用跟着改。

用法（仓库自带 uv 虚拟环境已装 Pillow）：
  .venv/Scripts/python.exe scripts/process_weapon_side_assets.py all --version v01
"""

import argparse
import json
import sys
import warnings
from pathlib import Path

from PIL import Image

warnings.filterwarnings("ignore", message=r".*getdata is deprecated.*", category=DeprecationWarning)

sys.path.insert(0, str(Path(__file__).resolve().parent))

from inspect_weapon_side_candidates import (  # noqa: E402
    candidate_path,
    count_magenta_residue,
    key_out,
)
from process_zombie_sprites import alpha_bbox  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
SPEC_PATH = ROOT / "scripts" / "weapon_side_specs.json"
OUTPUT_DIR = ROOT / "src" / "assets" / "processed" / "weapons"


def neutralize_residual_magenta(image: Image.Image, shared: dict) -> tuple[Image.Image, int]:
    """把仍偏洋红的像素钳回中性，返回 (处理后的图, 被改的像素数)。

    做法是把红与蓝各自压到不超过 `green + 允差`，允差取 chroma 门槛的一半：
    完全压到 green 会把这些像素变成纯灰、在彩色缝隙里反而突出，留一半允差后
    它们退回成「暗一点的本色」，与周围金属连成一片。
    """
    threshold = shared["residueMinChroma"]
    max_skew = shared["magentaMaxRbSkew"]
    allowance = threshold // 2

    rgba = image.convert("RGBA")
    data = bytearray(rgba.tobytes())
    changed = 0
    for index in range(rgba.width * rgba.height):
        offset = index * 4
        if data[offset + 3] < 32:
            continue
        red, green, blue = data[offset], data[offset + 1], data[offset + 2]
        floor = red if red < blue else blue
        if floor - green < threshold or abs(red - blue) > max_skew:
            continue
        limit = min(255, green + allowance)
        if red > limit:
            data[offset] = limit
        if blue > limit:
            data[offset + 2] = limit
        changed += 1
    return Image.frombytes("RGBA", rgba.size, bytes(data)), changed


def downsample_premultiplied(subject: Image.Image, width: int, height: int) -> Image.Image:
    """预乘 alpha 后降采样再还原，避免透明区颜色渗进边缘。

    不预乘的话，PIL 会把透明像素的 RGB 按同样权重算进结果。对洋红底键控出来的图，
    残留的洋红会沿边缘渗出一圈紫；对上游直接返回的 alpha 图（透明区是纯黑），
    渗出来的是一圈深色脏边，在 HUD 的浅色槽位上尤其明显。
    """
    red, green, blue, alpha = subject.split()
    premultiplied = Image.merge("RGBA", (
        Image.composite(red, Image.new("L", subject.size, 0), alpha),
        Image.composite(green, Image.new("L", subject.size, 0), alpha),
        Image.composite(blue, Image.new("L", subject.size, 0), alpha),
        alpha,
    ))
    resized = premultiplied.resize((width, height), Image.Resampling.LANCZOS)

    # 还原：逐像素除以 alpha。alpha 为 0 的像素没有可还原的颜色，保持全 0。
    data = bytearray(resized.tobytes())
    for index in range(width * height):
        offset = index * 4
        a = data[offset + 3]
        if a == 0:
            data[offset] = data[offset + 1] = data[offset + 2] = 0
            continue
        for channel in range(3):
            value = data[offset + channel] * 255 // a
            data[offset + channel] = 255 if value > 255 else value
    return Image.frombytes("RGBA", (width, height), bytes(data))


def build_icon(weapon_id: str, spec: dict, shared: dict, version: str) -> Image.Image:
    source_path = candidate_path(spec, version)
    if not source_path.exists():
        raise SystemExit(f"{weapon_id}: 缺少候选 {source_path.name}，先跑生图脚本")

    keyed, already = key_out(Image.open(source_path), shared)
    keyed, changed = neutralize_residual_magenta(keyed, shared)

    bbox = alpha_bbox(keyed)
    if bbox is None:
        raise SystemExit(f"{weapon_id}: 键控后没有剩下任何主体")
    subject = keyed.crop(bbox)

    canvas_w = shared["canvas"]["width"]
    canvas_h = shared["canvas"]["height"]
    fill = shared["targetFill"]
    # 夹到 1.0：绝不放大。源图主体约 1200px 宽，最终只有 132px，永远是降采样。
    scale = min(
        1.0,
        canvas_w * fill / subject.width,
        canvas_h * fill / subject.height,
    )
    width = max(1, round(subject.width * scale))
    height = max(1, round(subject.height * scale))
    resized = downsample_premultiplied(subject, width, height)

    icon = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
    icon.alpha_composite(resized, ((canvas_w - width) // 2, (canvas_h - height) // 2))

    residue = count_magenta_residue(icon, shared)
    if residue > shared["productResidueMax"]:
        raise SystemExit(
            f"{weapon_id}: 成品仍有 {residue} 个洋红像素（上限 {shared['productResidueMax']}），"
            f"该候选的键控底混得太深，换一版候选"
        )

    print(
        f"  {weapon_id:<13} 源 {'alpha' if already else '洋红':<5} 主体 {subject.width}x{subject.height}"
        f" -> {width}x{height} @ {canvas_w}x{canvas_h}"
        f"  缩放 {scale:.4f}  中和 {changed} px  成品残留 {residue} px"
    )
    return icon


def main() -> None:
    parser = argparse.ArgumentParser(description="处理重型武器侧视图标候选")
    parser.add_argument("ids", nargs="+", help="武器 id，或 all")
    parser.add_argument("--version", default="v01")
    args = parser.parse_args()

    specs = json.loads(SPEC_PATH.read_text(encoding="utf-8"))
    known = list(specs["weapons"])
    targets = known if "all" in args.ids else args.ids
    unknown = [item for item in targets if item not in specs["weapons"]]
    if unknown:
        raise SystemExit(f"未登记的 id: {', '.join(unknown)}。已登记: {', '.join(known)}")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"写入 {OUTPUT_DIR.relative_to(ROOT)}：")
    for weapon_id in targets:
        spec = specs["weapons"][weapon_id]
        icon = build_icon(weapon_id, spec, specs["shared"], args.version)
        icon.save(OUTPUT_DIR / spec["outputName"])

    print("\n侧视图标画幅与旧产物一致，运行时无需改动。"
          "\n下一步：npm run typecheck，并在实机复核 HUD 军械槽与战前整备的缩略图。")


if __name__ == "__main__":
    main()
