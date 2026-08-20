"""将感染体生图候选处理为四方向移动表与独立图鉴立绘（按 id 取配置的共用管线）。

输入首先来自仓库根目录 TmpGenerate，采用后复制到 generated 归档目录；运行时只加载
processed 产物。右向帧由左向帧镜像，避免模型分别生成左右方向造成身份和动作漂移。

角色专属参数全部在 scripts/zombie_asset_specs.json，本文件只负责像素处理。

帧尺寸取 512 而非 Walker 的 1024：上游 gpt-image-2 恒定输出 1254×1254，2×2 源图
单帧只有 627×627，主体约 500px。降采样到 512 帧内的 435px 全程不放大；若沿用 1024
帧就必须把 627 上采样 1.64 倍，只会放大生成噪声。实机可见高度约 47-58px，
435px 的源精度已远超需要。

用法：
    python scripts/process_zombie_sprites.py bomber --version v01
    python scripts/process_zombie_sprites.py runner --from-archive

--from-archive 直接从 generated 归档源图处理，跳过 TmpGenerate 采用步骤。
TmpGenerate 在 .gitignore 内且会被清理，归档源图才是长期可复现的输入；
回归核对（确认改动没有改变既有产物）只能走这条路。
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from collections import deque
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SPEC_PATH = ROOT / "scripts" / "zombie_asset_specs.json"
TEMP_DIR = ROOT / "TmpGenerate"
GENERATED_DIR = ROOT / "src" / "assets" / "generated" / "zombies"
PROCESSED_DIR = ROOT / "src" / "assets" / "processed" / "zombies"

DIRECTION_KEYS = ("left", "down", "up")
ALL_SOURCE_KEYS = ("reference", "left", "down", "up", "portrait")


def load_spec(zombie_id: str) -> tuple[dict, dict]:
    specs = json.loads(SPEC_PATH.read_text(encoding="utf-8"))
    if zombie_id not in specs["zombies"]:
        known = ", ".join(sorted(specs["zombies"]))
        raise SystemExit(f"未登记的感染体 id: {zombie_id}。已登记: {known}")
    return specs["zombies"][zombie_id], specs["shared"]


def source_name(spec: dict, key: str) -> str:
    suffix = {
        "reference": "direction_reference",
        "left": "left_4",
        "down": "down_4",
        "up": "up_4",
        "portrait": "portrait",
    }[key]
    return f"{spec['sourcePrefix']}_{suffix}.png"


def candidate_path(spec: dict, key: str, version: str) -> Path:
    suffix = {
        "reference": "direction-reference",
        "left": "left-4",
        "down": "down-4",
        "up": "up-4",
        "portrait": "portrait",
    }[key]
    return TEMP_DIR / f"{spec['candidateSlug']}-{suffix}-{version}.png"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def remove_magenta_background(source: Image.Image, shared: dict) -> Image.Image:
    """移除洋红键控底，并清除主体边缘的紫色溢出。

    分两步做，且去色溢按"到背景的距离"限制作用范围：

    1. 按通道关系计算 alpha。纯背景 chroma 通常 > 200，38~118 视作抗锯齿软边，
       用渐变 alpha 而不是硬切，避免切出锯齿。
    2. 只对紧邻已键出背景的像素做去色溢。这一步必须按空间位置限制，不能按 alpha
       判定：约 25% 洋红混合的边缘像素 chroma 只有 ~49，算出的 alpha 高达 251，
       但肉眼仍是明显紫边。早期版本把去色溢挂在 `alpha < 250` 下，这类像素会被整批
       漏掉，在深色战场上表现为紫边。反过来，主体内部的灰紫色阴影（绿通道明显不为 0，
       如 (154,129,157)）是生成素材的合法配色，必须原样保留。
    """
    min_floor = shared["magentaMinFloor"]
    min_chroma = shared["magentaMinChroma"]
    max_skew = shared["magentaMaxRbSkew"]
    band = shared["despillBand"]

    image = source.convert("RGBA")
    width, height = image.size
    data = bytearray(image.tobytes())

    def magenta_metrics(red: int, green: int, blue: int) -> tuple[int, int, bool]:
        floor = red if red < blue else blue
        return floor, floor - green, abs(red - blue) <= max_skew

    # 第一步：键控出 alpha，并标记"确定是背景"的像素位置。
    keyed_out = bytearray(width * height)
    for index in range(width * height):
        offset = index * 4
        red, green, blue = data[offset], data[offset + 1], data[offset + 2]
        floor, chroma, balanced = magenta_metrics(red, green, blue)
        if floor >= min_floor and chroma >= min_chroma and balanced:
            confidence = min(1.0, max(0.0, (chroma - min_chroma) / 80.0))
            brightness = min(1.0, max(0.0, (floor - min_floor) / 60.0))
            alpha = round(255 * (1.0 - confidence * brightness))
            data[offset + 3] = min(data[offset + 3], alpha)
            if data[offset + 3] <= 8:
                keyed_out[index] = 1

    # 第二步：从已键出的背景向内做 BFS，得到 despillBand 宽的边缘带。
    distance = bytearray([255]) * (width * height)
    queue = deque()
    for index in range(width * height):
        if keyed_out[index]:
            distance[index] = 0
            queue.append(index)
    while queue:
        index = queue.popleft()
        step = distance[index] + 1
        if step > band:
            continue
        x = index % width
        y = index // width
        for neighbor_x, neighbor_y in (
            (x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1),
        ):
            if not (0 <= neighbor_x < width and 0 <= neighbor_y < height):
                continue
            neighbor = neighbor_y * width + neighbor_x
            if distance[neighbor] > step:
                distance[neighbor] = step
                queue.append(neighbor)

    # 第三步：在边缘带内按洋红超出量压低 R、B，强度随距背景变远而衰减。
    for index in range(width * height):
        band_distance = distance[index]
        if band_distance == 0 or band_distance > band:
            continue
        offset = index * 4
        if data[offset + 3] == 0:
            continue
        red, green, blue = data[offset], data[offset + 1], data[offset + 2]
        _, chroma, balanced = magenta_metrics(red, green, blue)
        if chroma <= 0 or not balanced:
            continue
        # 距背景越近，污染越重，压制越强；带宽外沿保留 1/(band+1) 的轻微修正。
        strength = 1.0 - (band_distance - 1) / (band + 1)
        allowance = round(chroma * (1.0 - strength))
        limit = green + allowance
        if red > limit:
            data[offset] = limit
        if blue > limit:
            data[offset + 2] = limit

    return Image.frombytes("RGBA", image.size, bytes(data))


def alpha_bbox(image: Image.Image, threshold: int = 18) -> tuple[int, int, int, int] | None:
    alpha = image.getchannel("A").point(lambda value: 255 if value > threshold else 0)
    return alpha.getbbox()


def resolve_shared_scale(frames: list[Image.Image], target: int) -> float:
    """为全部方向帧求一个共用缩放系数。

    必须共用，不能逐帧 box-fit：不同方向的主体尺寸本来就不同（俯视侧面横躺、
    正面竖立），各自铺满自己的框会破坏方向之间的相对比例，实机表现为角色转向时
    忽大忽小。取"能让最大的那一帧刚好装进目标框"的系数，其余帧按同一系数缩放。
    """
    widest = 0
    tallest = 0
    for frame in frames:
        bbox = alpha_bbox(frame)
        if bbox is None:
            raise ValueError("候选帧没有检测到非透明主体")
        widest = max(widest, bbox[2] - bbox[0])
        tallest = max(tallest, bbox[3] - bbox[1])
    # 夹到 1.0：targetSubject 是上限而不是要铺满的目标，绝不为了贴到它而放大。
    # 2026-08-20 实测上游模型换成 gpt-image-2-vip 后输出由 1254 变为 1024，
    # 2×2 单帧恰好 512，主体最大边可能已接近 targetSubject（Lurker 实测 417/435），
    # 不夹就会算出 1.04 的放大系数，把生成噪声一起放大。源精度本就远超需要
    # （417px 主体最终只显示约 66px），少填几个像素没有任何代价。
    return min(1.0, target / tallest, target / widest)


def place_subject(image: Image.Image, scale: float, frame_size: int) -> Image.Image:
    """按给定系数缩放主体并居中放入正方形帧。

    纵向取几何居中而不是脚底基线对齐：真正的俯视没有"脚踩地面"的基线，侧向帧
    高度远小于正面帧，若统一底部对齐，转向时角色会明显上下跳动。居中后精灵原点
    取 0.5 即等于主体质心，转向时视觉位置稳定。
    """
    bbox = alpha_bbox(image)
    if bbox is None:
        raise ValueError("候选帧没有检测到非透明主体")

    subject = image.crop(bbox)
    width = max(1, round(subject.width * scale))
    height = max(1, round(subject.height * scale))
    # 生成图是模仿像素画的高分辨率渲染而非真正的像素网格，降采样用 LANCZOS 才能
    # 保住簇状明暗；NEAREST 会直接丢采样点。
    resample = Image.Resampling.LANCZOS if scale < 1.0 else Image.Resampling.NEAREST
    subject = subject.resize((width, height), resample)

    target = Image.new("RGBA", (frame_size, frame_size), (0, 0, 0, 0))
    left = round((frame_size - width) / 2)
    top = round((frame_size - height) / 2)
    margin = 4
    if left < margin or top < margin:
        raise ValueError(f"归一化主体越界：{width}x{height} at ({left}, {top})")
    target.alpha_composite(subject, (left, top))
    return target


def split_grid(source: Image.Image) -> list[Image.Image]:
    if source.width != source.height or source.width % 2 != 0:
        raise ValueError(f"2x2 源图必须是偶数边长正方形，实际为 {source.width}x{source.height}")
    cell = source.width // 2
    return [
        source.crop((0, 0, cell, cell)),
        source.crop((cell, 0, source.width, cell)),
        source.crop((0, cell, cell, source.height)),
        source.crop((cell, cell, source.width, source.height)),
    ]


def key_and_split(path: Path, shared: dict) -> list[Image.Image]:
    """抠掉键控底并切成四帧，暂不缩放：共用系数需要先看到全部方向的帧。"""
    return split_grid(remove_magenta_background(Image.open(path), shared))


def compose_directional_sheet(
    down: list[Image.Image],
    left: list[Image.Image],
    up: list[Image.Image],
    frame_size: int,
) -> Image.Image:
    if any(len(frames) != 4 for frames in (down, left, up)):
        raise ValueError("每个方向必须正好包含 4 帧")
    right = [frame.transpose(Image.Transpose.FLIP_LEFT_RIGHT) for frame in left]
    rows = [down, left, right, up]
    sheet = Image.new("RGBA", (frame_size * 4, frame_size * 4), (0, 0, 0, 0))
    for row_index, frames in enumerate(rows):
        for column_index, frame in enumerate(frames):
            sheet.alpha_composite(frame, (column_index * frame_size, row_index * frame_size))
    return sheet


def validate_frame(frame: Image.Image, label: str, frame_size: int) -> None:
    """帧完整性校验。

    不能按"高度 ≥ 帧高某比例"判完整：真正的俯视侧面是横躺的（宽高比可达 1.6），
    合法侧向帧的高度本来就远小于正面帧，按高度判会把正确素材判废。
    改为看较长边和非透明面积占比，两者都不预设角色是竖直的。
    """
    bbox = alpha_bbox(frame)
    if bbox is None:
        raise ValueError(f"{label} 为空帧")
    left, top, right, bottom = bbox
    if min(left, top, frame_size - right, frame_size - bottom) < 3:
        raise ValueError(f"{label} 主体贴边：{bbox}")

    width = right - left
    height = bottom - top
    if max(width, height) < round(frame_size * 0.6):
        raise ValueError(f"{label} 主体过小：{width}x{height}")
    if min(width, height) < round(frame_size * 0.17):
        raise ValueError(f"{label} 主体某一轴过窄：{width}x{height}")

    opaque = sum(frame.getchannel("A").point(lambda v: 255 if v > 18 else 0).histogram()[255:])
    if opaque < frame_size * frame_size * 0.04:
        raise ValueError(f"{label} 非透明面积过小：{opaque}px")


def validate_outputs(sheet: Image.Image, portrait: Image.Image, frame_size: int) -> None:
    expected = frame_size * 4
    if sheet.size != (expected, expected):
        raise ValueError(f"方向表尺寸异常：{sheet.size}")
    for row in range(4):
        for column in range(4):
            frame = sheet.crop((
                column * frame_size,
                row * frame_size,
                (column + 1) * frame_size,
                (row + 1) * frame_size,
            ))
            validate_frame(frame, f"row={row} col={column}", frame_size)
    validate_frame(portrait, "portrait", frame_size)
    if sheet.getpixel((0, 0))[3] != 0 or portrait.getpixel((0, 0))[3] != 0:
        raise ValueError("正式产物左上角不是透明像素")


def adopt_sources(spec: dict, version: str) -> dict[str, Path]:
    """把 TmpGenerate 候选复制到 generated 归档目录的稳定命名。"""
    GENERATED_DIR.mkdir(parents=True, exist_ok=True)
    adopted: dict[str, Path] = {}
    for key in ALL_SOURCE_KEYS:
        source = candidate_path(spec, key, version)
        if not source.exists():
            raise FileNotFoundError(f"缺少候选图：{source}")
        target = GENERATED_DIR / source_name(spec, key)
        shutil.copy2(source, target)
        adopted[key] = target
        print(f"adopted {source.name} -> {target.name} sha256={sha256(target)[:16]}")
    return adopted


def archive_sources(spec: dict) -> dict[str, Path]:
    """直接使用 generated 归档源图，不做采用步骤。"""
    resolved: dict[str, Path] = {}
    for key in ALL_SOURCE_KEYS:
        path = GENERATED_DIR / source_name(spec, key)
        if not path.exists():
            raise FileNotFoundError(f"缺少归档源图：{path}")
        resolved[key] = path
        print(f"archive {path.name} sha256={sha256(path)[:16]}")
    return resolved


def report_geometry(sheet: Image.Image, frame_size: int) -> None:
    """打印每行主体的实测像素尺寸，供反推显示缩放使用。

    zombieVisuals 的 scale 必须按"最大帧主体像素"反推，不能假设它等于 targetSubject：
    共用系数只保证最大的那一帧在某一个轴上贴到目标框，另一个轴通常更小。
    """
    print("行主体实测尺寸（用于反推 zombieVisuals.scale）")
    overall = 0
    for row_index, name in enumerate(("down", "left", "right", "up")):
        heights = []
        widths = []
        for column in range(4):
            frame = sheet.crop((
                column * frame_size,
                row_index * frame_size,
                (column + 1) * frame_size,
                (row_index + 1) * frame_size,
            ))
            bbox = alpha_bbox(frame)
            widths.append(bbox[2] - bbox[0])
            heights.append(bbox[3] - bbox[1])
        overall = max(overall, max(widths), max(heights))
        print(
            f"  {name:5s}: 宽 {min(widths)}-{max(widths)}  高 {min(heights)}-{max(heights)}"
            f"  平均宽高比 {sum(w / h for w, h in zip(widths, heights)) / 4:.2f}"
        )
    print(f"  全表最大主体边长 = {overall}px")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("zombie_id", help="感染体 id，如 bomber")
    parser.add_argument("--version", default=None, help="TmpGenerate 候选版本，如 v01")
    parser.add_argument(
        "--from-archive",
        action="store_true",
        help="直接用 generated 归档源图，跳过 TmpGenerate 采用步骤（回归核对用）",
    )
    args = parser.parse_args()

    spec, shared = load_spec(args.zombie_id)
    frame_size = spec["frameSize"]
    target = spec["targetSubject"]
    print(f"目标: {spec['displayName']}  帧 {frame_size}  目标主体 {target}")

    if args.from_archive:
        sources = archive_sources(spec)
    else:
        version = args.version or spec.get("adoptedVersion")
        if not version:
            raise SystemExit("需要 --version（该感染体尚未记录 adoptedVersion）")
        sources = adopt_sources(spec, version)

    # 先抠图切帧，再用全部 12 帧求共用缩放系数，最后统一缩放放置。
    raw = {name: key_and_split(sources[name], shared) for name in DIRECTION_KEYS}
    shared_scale = resolve_shared_scale([f for frames in raw.values() for f in frames], target)
    print(f"全方向共用缩放系数 = {shared_scale:.4f}")
    placed = {
        name: [place_subject(frame, shared_scale, frame_size) for frame in frames]
        for name, frames in raw.items()
    }
    sheet = compose_directional_sheet(placed["down"], placed["left"], placed["up"], frame_size)

    portrait_keyed = remove_magenta_background(Image.open(sources["portrait"]), shared)
    portrait_scale = resolve_shared_scale([portrait_keyed], target)
    portrait = place_subject(portrait_keyed, portrait_scale, frame_size)
    validate_outputs(sheet, portrait, frame_size)

    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    sheet_path = PROCESSED_DIR / f"{spec['outputPrefix']}-directional-custom.png"
    portrait_path = PROCESSED_DIR / f"{spec['outputPrefix']}-portrait.png"
    sheet.save(sheet_path, format="PNG", optimize=True)
    portrait.save(portrait_path, format="PNG", optimize=True)
    print(f"{sheet_path.name}: {sheet.size[0]}x{sheet.size[1]} RGBA sha256={sha256(sheet_path)}")
    print(f"{portrait_path.name}: {portrait.size[0]}x{portrait.size[1]} RGBA sha256={sha256(portrait_path)}")
    report_geometry(sheet, frame_size)
    print(
        f"\n下一步: python scripts/verify_directional_sheet.py "
        f"src/assets/processed/zombies/{sheet_path.name} {frame_size}"
    )


if __name__ == "__main__":
    main()
