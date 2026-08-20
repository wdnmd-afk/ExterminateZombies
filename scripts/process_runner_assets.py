"""将 Runner 生图候选处理为四方向移动表与独立图鉴立绘。

输入首先来自仓库根目录 TmpGenerate，采用后复制到 generated 归档目录；运行时只加载
processed 产物。右向帧由左向帧镜像，避免模型分别生成左右方向造成身份和动作漂移。

帧尺寸取 512 而非 Walker 的 1024：上游 gpt-image-2 恒定输出 1254×1254，2×2 源图
单帧只有 627×627，主体约 500px。降采样到 512 帧内的 435px 全程不放大；若沿用 1024
帧就必须把 627 上采样 1.64 倍，只会放大生成噪声。Runner 实机可见高度约 47px，
435px 的源精度已远超需要。
"""

from __future__ import annotations

import argparse
import hashlib
import shutil
from collections import deque
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]

# 键控判定阈值。与 scripts/inspect_runner_candidates.py 保持一致，
# 否则"检视通过"与"处理可用"会脱钩。
MAGENTA_MIN_FLOOR = 110
MAGENTA_MIN_CHROMA = 38
TEMP_DIR = ROOT / "TmpGenerate"
GENERATED_DIR = ROOT / "src" / "assets" / "generated" / "zombies"
PROCESSED_DIR = ROOT / "src" / "assets" / "processed" / "zombies"

FRAME_SIZE = 512
# 目标框。主体按共用系数缩放后，最大的那一帧刚好装进这个框；
# 435/512 ≈ 85%，与 Walker 的 870/1024 同比例。
TARGET_SUBJECT_HEIGHT = 435
TARGET_SUBJECT_WIDTH = 435

SOURCE_NAMES = {
    "reference": "Runner_direction_reference.png",
    "left": "Runner_left_4.png",
    "down": "Runner_down_4.png",
    "up": "Runner_up_4.png",
    "portrait": "Runner_portrait.png",
}


def candidate_path(key: str, version: str) -> Path:
    slug = {
        "reference": "zombie-runner-direction-reference",
        "left": "zombie-runner-left-4",
        "down": "zombie-runner-down-4",
        "up": "zombie-runner-up-4",
        "portrait": "zombie-runner-portrait",
    }[key]
    return TEMP_DIR / f"{slug}-{version}.png"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


# 去色溢作用带宽（像素）。洋红污染只可能发生在主体与背景相接处，
# 超出这个带宽的像素一律不动，保护主体内部合法的冷紫色阴影。
DESPILL_BAND = 3


def remove_magenta_background(source: Image.Image) -> Image.Image:
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
    image = source.convert("RGBA")
    width, height = image.size
    data = bytearray(image.tobytes())

    def magenta_metrics(red: int, green: int, blue: int) -> tuple[int, int, bool]:
        floor = red if red < blue else blue
        return floor, floor - green, abs(red - blue) <= 96

    # 第一步：键控出 alpha，并标记"确定是背景"的像素位置。
    keyed_out = bytearray(width * height)
    for index in range(width * height):
        offset = index * 4
        red, green, blue = data[offset], data[offset + 1], data[offset + 2]
        floor, chroma, balanced = magenta_metrics(red, green, blue)
        if floor >= MAGENTA_MIN_FLOOR and chroma >= MAGENTA_MIN_CHROMA and balanced:
            confidence = min(1.0, max(0.0, (chroma - MAGENTA_MIN_CHROMA) / 80.0))
            brightness = min(1.0, max(0.0, (floor - MAGENTA_MIN_FLOOR) / 60.0))
            alpha = round(255 * (1.0 - confidence * brightness))
            data[offset + 3] = min(data[offset + 3], alpha)
            if data[offset + 3] <= 8:
                keyed_out[index] = 1

    # 第二步：从已键出的背景向内做 BFS，得到 DESPILL_BAND 宽的边缘带。
    distance = bytearray([255]) * (width * height)
    queue = deque()
    for index in range(width * height):
        if keyed_out[index]:
            distance[index] = 0
            queue.append(index)
    while queue:
        index = queue.popleft()
        step = distance[index] + 1
        if step > DESPILL_BAND:
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
        if band_distance == 0 or band_distance > DESPILL_BAND:
            continue
        offset = index * 4
        if data[offset + 3] == 0:
            continue
        red, green, blue = data[offset], data[offset + 1], data[offset + 2]
        _, chroma, balanced = magenta_metrics(red, green, blue)
        if chroma <= 0 or not balanced:
            continue
        # 距背景越近，污染越重，压制越强；带宽外沿保留 1/(BAND+1) 的轻微修正。
        strength = 1.0 - (band_distance - 1) / (DESPILL_BAND + 1)
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


def resolve_shared_scale(frames: list[Image.Image]) -> float:
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
    return min(TARGET_SUBJECT_HEIGHT / tallest, TARGET_SUBJECT_WIDTH / widest)


def place_subject(image: Image.Image, scale: float) -> Image.Image:
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

    target = Image.new("RGBA", (FRAME_SIZE, FRAME_SIZE), (0, 0, 0, 0))
    left = round((FRAME_SIZE - width) / 2)
    top = round((FRAME_SIZE - height) / 2)
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


def key_and_split(path: Path) -> list[Image.Image]:
    """抠掉键控底并切成四帧，暂不缩放：共用系数需要先看到全部方向的帧。"""
    return split_grid(remove_magenta_background(Image.open(path)))


def compose_directional_sheet(
    down: list[Image.Image],
    left: list[Image.Image],
    up: list[Image.Image],
) -> Image.Image:
    if any(len(frames) != 4 for frames in (down, left, up)):
        raise ValueError("每个方向必须正好包含 4 帧")
    right = [frame.transpose(Image.Transpose.FLIP_LEFT_RIGHT) for frame in left]
    rows = [down, left, right, up]
    sheet = Image.new("RGBA", (FRAME_SIZE * 4, FRAME_SIZE * 4), (0, 0, 0, 0))
    for row_index, frames in enumerate(rows):
        for column_index, frame in enumerate(frames):
            sheet.alpha_composite(frame, (column_index * FRAME_SIZE, row_index * FRAME_SIZE))
    return sheet


SHEET_SIZE = FRAME_SIZE * 4


def validate_frame(frame: Image.Image, label: str) -> None:
    """帧完整性校验。

    不能按"高度 ≥ 帧高某比例"判完整：真正的俯视侧面是横躺的（宽高比可达 1.6），
    合法侧向帧的高度本来就远小于正面帧，按高度判会把正确素材判废。
    改为看较长边和非透明面积占比，两者都不预设角色是竖直的。
    """
    bbox = alpha_bbox(frame)
    if bbox is None:
        raise ValueError(f"{label} 为空帧")
    left, top, right, bottom = bbox
    if min(left, top, FRAME_SIZE - right, FRAME_SIZE - bottom) < 3:
        raise ValueError(f"{label} 主体贴边：{bbox}")

    width = right - left
    height = bottom - top
    if max(width, height) < round(FRAME_SIZE * 0.6):
        raise ValueError(f"{label} 主体过小：{width}x{height}")
    if min(width, height) < round(FRAME_SIZE * 0.17):
        raise ValueError(f"{label} 主体某一轴过窄：{width}x{height}")

    opaque = sum(frame.getchannel("A").point(lambda v: 255 if v > 18 else 0).histogram()[255:])
    if opaque < FRAME_SIZE * FRAME_SIZE * 0.04:
        raise ValueError(f"{label} 非透明面积过小：{opaque}px")


def validate_outputs(sheet: Image.Image, portrait: Image.Image) -> None:
    if sheet.size != (SHEET_SIZE, SHEET_SIZE):
        raise ValueError(f"方向表尺寸异常：{sheet.size}")
    for row in range(4):
        for column in range(4):
            frame = sheet.crop((
                column * FRAME_SIZE,
                row * FRAME_SIZE,
                (column + 1) * FRAME_SIZE,
                (row + 1) * FRAME_SIZE,
            ))
            validate_frame(frame, f"row={row} col={column}")
    validate_frame(portrait, "portrait")
    if sheet.getpixel((0, 0))[3] != 0 or portrait.getpixel((0, 0))[3] != 0:
        raise ValueError("正式产物左上角不是透明像素")


def adopt_sources(version: str) -> dict[str, Path]:
    GENERATED_DIR.mkdir(parents=True, exist_ok=True)
    adopted: dict[str, Path] = {}
    for key, target_name in SOURCE_NAMES.items():
        source = candidate_path(key, version)
        if not source.exists():
            raise FileNotFoundError(f"缺少候选图：{source}")
        target = GENERATED_DIR / target_name
        shutil.copy2(source, target)
        adopted[key] = target
        print(f"adopted {source.name} -> {target.name} sha256={sha256(target)[:16]}")
    return adopted


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--version", default="v01", help="TmpGenerate 候选版本，如 v01")
    args = parser.parse_args()

    sources = adopt_sources(args.version)

    # 先抠图切帧，再用全部 12 帧求共用缩放系数，最后统一缩放放置。
    raw = {name: key_and_split(sources[name]) for name in ("down", "left", "up")}
    shared_scale = resolve_shared_scale([f for frames in raw.values() for f in frames])
    print(f"全方向共用缩放系数 = {shared_scale:.4f}")
    placed = {
        name: [place_subject(frame, shared_scale) for frame in frames]
        for name, frames in raw.items()
    }
    sheet = compose_directional_sheet(placed["down"], placed["left"], placed["up"])

    portrait_keyed = remove_magenta_background(Image.open(sources["portrait"]))
    portrait_scale = resolve_shared_scale([portrait_keyed])
    portrait = place_subject(portrait_keyed, portrait_scale)
    validate_outputs(sheet, portrait)

    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    sheet_path = PROCESSED_DIR / "runner-directional-custom.png"
    portrait_path = PROCESSED_DIR / "runner-portrait.png"
    sheet.save(sheet_path, format="PNG", optimize=True)
    portrait.save(portrait_path, format="PNG", optimize=True)
    print(f"{sheet_path.name}: {sheet.size[0]}x{sheet.size[1]} RGBA sha256={sha256(sheet_path)}")
    print(f"{portrait_path.name}: {portrait.size[0]}x{portrait.size[1]} RGBA sha256={sha256(portrait_path)}")


if __name__ == "__main__":
    main()
