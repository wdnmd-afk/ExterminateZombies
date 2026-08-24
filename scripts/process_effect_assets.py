"""将武器攻击特效生图候选处理为四帧横排帧条（按 id 取配置的共用管线）。

输入首先来自仓库根目录 TmpGenerate，采用后复制到 src/assets/generated/effects 归档目录；
运行时只加载 src/assets/processed/effects 产物。

特效专属参数全部在 scripts/effect_asset_specs.json，本文件只负责像素处理。

与感染体管线最重要的一处差异：**四帧取共用外接框，不逐帧裁剪**。
感染体逐帧裁剪后居中是对的（俯视没有脚踩地面的基线，居中让转向时位置稳定），
但特效不同——枪口焰的根部必须始终落在枪口那一点上。逐帧裁剪会让"全绽"那一帧
比"余烬"那一帧向左多出十几像素，实机表现为每一枪的火焰在枪口前后抖动。
共用外接框 + 共用缩放系数 + 共用落点，四帧才在同一个参考系里。

键控函数直接从 process_zombie_sprites 导入而不是复制：
effect_asset_specs.json 的 shared 段与 zombie_asset_specs.json 用同一组阈值，
一旦两处各留一份实现，其中一份的去色溢修正就会静默漂移。
键控本身按图自适应，理由见 is_pre_keyed 的文档串。

用法：
    .venv/Scripts/python.exe scripts/process_effect_assets.py all --version v01 --inspect
    .venv/Scripts/python.exe scripts/process_effect_assets.py flame_jet --version v01
    .venv/Scripts/python.exe scripts/process_effect_assets.py all --from-archive

--inspect 只打印判据并在 TmpGenerate 写一张深底预览图，不写 processed 产物。
预览图必须看：本管线的自动判据只能拦下"贴边/空帧/紫边残留"这类形式错误，
"火舌画成了圆球"这类形式正确但内容报废的情况只有人眼能判。

--from-archive 直接从 generated 归档源图处理，跳过 TmpGenerate 采用步骤。
TmpGenerate 在 .gitignore 内且会被清理，归档源图才是长期可复现的输入。
"""

from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path

from PIL import Image

from process_zombie_sprites import alpha_bbox, remove_magenta_background, sha256, split_grid


ROOT = Path(__file__).resolve().parents[1]
SPEC_PATH = ROOT / "scripts" / "effect_asset_specs.json"
TEMP_DIR = ROOT / "TmpGenerate"
GENERATED_DIR = ROOT / "src" / "assets" / "generated" / "effects"
PROCESSED_DIR = ROOT / "src" / "assets" / "processed" / "effects"

FRAME_COUNT = 4
PREVIEW_BACKDROP = (20, 17, 24, 255)  # 战场地面基调，用于判断素材在实机底色上的可读性


def load_specs() -> dict:
    return json.loads(SPEC_PATH.read_text(encoding="utf-8"))


def candidate_path(spec: dict, version: str) -> Path:
    return TEMP_DIR / f"{spec['candidateSlug']}-4-{version}.png"


def archive_path(spec: dict) -> Path:
    return GENERATED_DIR / f"{spec['sourcePrefix']}_4.png"


def cell_metrics(cell: Image.Image) -> dict:
    """单格判据。在**未裁剪的源格**上量，这是唯一能发现"主体溢出到邻格"的时机。

    共用外接框一旦算出来就把四格合成一个参考系，那之后再看边距只能看到合并后的结果，
    某一格向邻格溢出 20px 会被平摊成"整体略偏"，判据失效。
    """
    size = cell.width
    bbox = alpha_bbox(cell)
    opaque = sum(cell.getchannel("A").point(lambda v: 255 if v > 18 else 0).histogram()[255:])
    coverage = opaque / (size * size)
    if bbox is None:
        return {"bbox": None, "coverage": coverage, "margin": 0}
    left, top, right, bottom = bbox
    return {
        "bbox": bbox,
        "coverage": coverage,
        "margin": min(left, top, size - right, size - bottom),
    }


def magenta_residue(cell: Image.Image) -> int:
    """键控后仍偏洋红的可见像素数。

    去色溢按空间距离限制作用范围（见 remove_magenta_background 的文档串），带宽之外的
    污染不会被处理。特效的雾状边缘比人形主体宽得多，是最可能突破带宽的一类素材，
    所以这条判据必须单独打印而不是依赖角色管线的既有门控。

    注意它只覆盖"接近纯洋红"的残留（|R-B| <= 96）。偏红的粉色（如 255,80,120，skew 135）
    落在判据之外，由 neutralize_pink 负责——只看这个数字会误以为素材已经干净。
    """
    data = cell.tobytes()
    count = 0
    for offset in range(0, len(data), 4):
        if data[offset + 3] <= 18:
            continue
        red, green, blue = data[offset], data[offset + 1], data[offset + 2]
        floor = min(red, blue)
        if floor >= 90 and floor - green >= 30 and abs(red - blue) <= 96:
            count += 1
    return count


# 蓝通道相对绿通道的允许超出量。24 是"暖色系里蓝能高出多少而仍读作暖色"的经验值：
# 更小会把黄白核心 (255,242,186) 之外的浅橙也压暗，更大压不掉 (255,80,120) 这类粉红。
PINK_BLUE_ALLOWANCE = 24


def neutralize_pink(cell: Image.Image) -> tuple[Image.Image, int]:
    """把偏粉、偏紫的可见像素拉回暖色系，返回处理后的图与被改动的像素数。

    两种来源，处理方式相同：

    1. 上游把火花画成了亮粉色。爆炸的后三帧外围与飞行火团的拖尾都有，这是像素画 VFX
       的常见约定，但与 ART_BIBLE 第 4 节「危险用红、橙和斜纹」不符：实机上会在一片
       橙色里跳出几点荧光粉，读起来像是别的机制在生效。
    2. 洋红键控的软边残留中 R 明显大于 B 的那部分，magenta_residue 的 skew 判据管不到。

    判据只看「蓝显著超过绿」，因此对本批素材的合法配色是恒等变换：
    橙色火焰是 R>G>B，灰烟是 R=G=B，焦黑碎片三通道同低，三者都不满足条件。
    `red > green` 这一条守住冷色：万一以后加冷色系特效（电击、冰冻），它不会被压成暖色。
    """
    data = bytearray(cell.tobytes())
    touched = 0
    for offset in range(0, len(data), 4):
        if data[offset + 3] <= 18:
            continue
        red, green, blue = data[offset], data[offset + 1], data[offset + 2]
        limit = green + PINK_BLUE_ALLOWANCE
        if blue > limit and red > green:
            data[offset + 2] = limit
            touched += 1
    return Image.frombytes("RGBA", cell.size, bytes(data)), touched


def is_pre_keyed(image: Image.Image) -> bool:
    """上游是否已经返回带 alpha 的透明底。

    同一次全量生成里上游会混用两种底，这不是可以按管线约定统一掉的东西：
    2026-08-23 实测八张请求中 muzzle_heavy 与 muzzle_rifle 返回四角 alpha=0 的透明底，
    其余六张返回不透明洋红底 (250,3,250)。提示词两者完全同构，只有主体描述不同。

    因此键控必须按图自适应。方向不对称：对透明底跑一遍洋红键控是无害空转
    （透明像素的 RGB 是 0，不满足 floor>=110），但把洋红底当成透明底会留下一整块洋红。
    所以判据取"六个边缘探针全部 alpha=0"这个保守条件，宁可多跑一次键控。
    """
    width, height = image.size
    probes = (
        (1, 1),
        (width - 2, 1),
        (1, height - 2),
        (width - 2, height - 2),
        (width // 2, 1),
        (width // 2, height - 2),
    )
    return all(image.getpixel(point)[3] == 0 for point in probes)


def key_source(source: Path, shared: dict) -> Image.Image:
    image = Image.open(source).convert("RGBA")
    if is_pre_keyed(image):
        print("  上游已返回透明底，跳过洋红键控")
        return image
    return remove_magenta_background(image, shared)


def union_bbox(cells: list[Image.Image]) -> tuple[int, int, int, int]:
    boxes = [alpha_bbox(cell) for cell in cells]
    if any(box is None for box in boxes):
        raise ValueError("存在空帧，无法求共用外接框")
    return (
        min(box[0] for box in boxes),
        min(box[1] for box in boxes),
        max(box[2] for box in boxes),
        max(box[3] for box in boxes),
    )


def place_frames(
    cells: list[Image.Image],
    box: tuple[int, int, int, int],
    frame: tuple[int, int],
    anchor: str,
) -> tuple[list[Image.Image], float, tuple[int, int]]:
    """按共用外接框、共用系数与共用落点把四格铺进目标帧尺寸。

    系数夹到 1.0：frame 是上限而不是要铺满的目标。上游单格 627px 的源精度远超实机需要
    （枪口焰实机只有 40-80px 宽），为了贴到 frame 而放大只会放大生成噪声。
    """
    left, top, right, bottom = box
    source_width = right - left
    source_height = bottom - top
    scale = min(1.0, frame[0] / source_width, frame[1] / source_height)
    width = max(1, round(source_width * scale))
    height = max(1, round(source_height * scale))

    if anchor == "left-center":
        # 运行时 setOrigin(0, 0.5)：内容左边缘就是枪口那一点，必须贴到 x=0。
        offset = (0, round((frame[1] - height) / 2))
    elif anchor == "center":
        offset = (round((frame[0] - width) / 2), round((frame[1] - height) / 2))
    else:
        raise ValueError(f"未知 anchor: {anchor}")

    placed = []
    for cell in cells:
        # 生成图是模仿像素画的高分辨率渲染而非真正的像素网格，降采样用 LANCZOS 才能
        # 保住簇状明暗；NEAREST 会直接丢采样点。
        resample = Image.Resampling.LANCZOS if scale < 1.0 else Image.Resampling.NEAREST
        subject = cell.crop(box).resize((width, height), resample)
        canvas = Image.new("RGBA", frame, (0, 0, 0, 0))
        canvas.alpha_composite(subject, offset)
        placed.append(canvas)
    return placed, scale, (width, height)


def compose_strip(frames: list[Image.Image], frame: tuple[int, int]) -> Image.Image:
    if len(frames) != FRAME_COUNT:
        raise ValueError(f"帧条必须正好包含 {FRAME_COUNT} 帧")
    strip = Image.new("RGBA", (frame[0] * FRAME_COUNT, frame[1]), (0, 0, 0, 0))
    for index, single in enumerate(frames):
        strip.alpha_composite(single, (index * frame[0], 0))
    return strip


def build_preview(frames: list[Image.Image], frame: tuple[int, int]) -> Image.Image:
    """深底 2 倍预览。判断素材在实机底色上是否读得出来，最近邻放大保持像素颗粒。"""
    gap = 8
    width = (frame[0] * FRAME_COUNT + gap * (FRAME_COUNT + 1)) * 2
    height = (frame[1] + gap * 2) * 2
    preview = Image.new("RGBA", (width, height), PREVIEW_BACKDROP)
    for index, single in enumerate(frames):
        doubled = single.resize((frame[0] * 2, frame[1] * 2), Image.Resampling.NEAREST)
        preview.alpha_composite(doubled, ((gap + index * (frame[0] + gap)) * 2, gap * 2))
    return preview


def validate_strip(strip: Image.Image, frame: tuple[int, int], label: str) -> None:
    expected = (frame[0] * FRAME_COUNT, frame[1])
    if strip.size != expected:
        raise ValueError(f"{label} 帧条尺寸异常：{strip.size}，应为 {expected}")
    for index in range(FRAME_COUNT):
        single = strip.crop((index * frame[0], 0, (index + 1) * frame[0], frame[1]))
        if alpha_bbox(single) is None:
            raise ValueError(f"{label} frame={index} 为空帧")
    if strip.getpixel((strip.width - 1, strip.height - 1))[3] != 0:
        # 右下角是最后一帧的角点。left-center 锚点的内容贴在 x=0，所以左上角可能有内容，
        # 不能像感染体管线那样用左上角判透明。
        raise ValueError(f"{label} 右下角不是透明像素")


def resolve_source(spec: dict, version: str | None, from_archive: bool) -> Path:
    if from_archive:
        path = archive_path(spec)
        if not path.exists():
            raise FileNotFoundError(f"缺少归档源图：{path}")
        print(f"  archive {path.name} sha256={sha256(path)[:16]}")
        return path

    resolved = version or spec.get("adoptedVersion")
    if not resolved:
        raise SystemExit("需要 --version（该特效尚未记录 adoptedVersion）")
    source = candidate_path(spec, resolved)
    if not source.exists():
        raise FileNotFoundError(f"缺少候选图：{source}")
    return source


def adopt_source(spec: dict, source: Path) -> Path:
    GENERATED_DIR.mkdir(parents=True, exist_ok=True)
    target = archive_path(spec)
    shutil.copy2(source, target)
    print(f"  adopted {source.name} -> {target.name} sha256={sha256(target)[:16]}")
    return target


def process_effect(
    effect_id: str,
    spec: dict,
    shared: dict,
    version: str | None,
    *,
    inspect: bool,
    from_archive: bool,
) -> None:
    frame = (spec["frame"][0], spec["frame"][1])
    print(f"\n=== {spec['displayName']} ({effect_id}) 帧 {frame[0]}x{frame[1]} anchor={spec['anchor']} ===")
    source = resolve_source(spec, version, from_archive)

    cells = split_grid(key_source(source, shared))
    if len(cells) != FRAME_COUNT:
        raise ValueError(f"2x2 源图必须切出 {FRAME_COUNT} 格，实际 {len(cells)}")

    failures: list[str] = []
    for index, cell in enumerate(cells):
        metrics = cell_metrics(cell)
        residue = magenta_residue(cell)
        cells[index], pink = neutralize_pink(cell)
        print(
            f"  cell{index}: 覆盖率 {metrics['coverage'] * 100:5.2f}%  边距 {metrics['margin']:3d}px"
            f"  外接框 {metrics['bbox']}  洋红残留 {residue}px  粉色回暖 {pink}px"
        )
        if metrics["bbox"] is None:
            failures.append(f"cell{index} 为空帧")
            continue
        if metrics["coverage"] < shared["minCellCoverage"]:
            failures.append(f"cell{index} 覆盖率 {metrics['coverage']:.4f} 低于 {shared['minCellCoverage']}")
        if metrics["margin"] < shared["minCellMargin"]:
            failures.append(f"cell{index} 边距 {metrics['margin']}px 低于 {shared['minCellMargin']}px（溢出到邻格）")
    if failures:
        raise ValueError("候选未通过单格判据：" + "；".join(failures))

    box = union_bbox(cells)
    frames, scale, content = place_frames(cells, box, frame, spec["anchor"])
    print(
        f"  共用外接框 {box}（{box[2] - box[0]}x{box[3] - box[1]}）"
        f" 共用缩放系数 {scale:.4f} -> 内容 {content[0]}x{content[1]}"
    )

    strip = compose_strip(frames, frame)
    validate_strip(strip, frame, effect_id)

    if inspect:
        TEMP_DIR.mkdir(parents=True, exist_ok=True)
        preview_path = TEMP_DIR / f"{spec['outputName']}-preview-{version or spec.get('adoptedVersion')}.png"
        build_preview(frames, frame).save(preview_path, format="PNG", optimize=True)
        print(f"  预览 {preview_path.name}（深底 2 倍，人眼复核用）")
        return

    if not from_archive:
        adopt_source(spec, source)

    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    output = PROCESSED_DIR / f"{spec['outputName']}.png"
    strip.save(output, format="PNG", optimize=True)
    print(f"  {output.name}: {strip.size[0]}x{strip.size[1]} RGBA sha256={sha256(output)}")
    print(
        f"  运行时登记: frameWidth={frame[0]} frameHeight={frame[1]}"
        f" frameCount={FRAME_COUNT} anchor={spec['anchor']}"
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("effect_ids", nargs="+", help="特效 id，或 all")
    parser.add_argument("--version", default=None, help="TmpGenerate 候选版本，如 v01")
    parser.add_argument("--inspect", action="store_true", help="只打印判据并写深底预览，不落地产物")
    parser.add_argument(
        "--from-archive",
        action="store_true",
        help="直接用 generated 归档源图，跳过 TmpGenerate 采用步骤（回归核对用）",
    )
    args = parser.parse_args()

    specs = load_specs()
    known = list(specs["effects"])
    targets = known if "all" in args.effect_ids else args.effect_ids
    unknown = [name for name in targets if name not in specs["effects"]]
    if unknown:
        raise SystemExit(f"未登记的特效 id: {', '.join(unknown)}。已登记: {', '.join(known)}")

    failed: list[str] = []
    for effect_id in targets:
        try:
            process_effect(
                effect_id,
                specs["effects"][effect_id],
                specs["shared"],
                args.version,
                inspect=args.inspect,
                from_archive=args.from_archive,
            )
        except (ValueError, FileNotFoundError) as error:
            # 一种特效失败不能带走其余的：每种特效是独立的一次生成，判据也各自独立。
            print(f"  失败: {error}")
            failed.append(effect_id)

    if failed:
        raise SystemExit(f"\n未通过: {', '.join(failed)}")
    print(f"\n全部通过: {', '.join(targets)}")


if __name__ == "__main__":
    main()
