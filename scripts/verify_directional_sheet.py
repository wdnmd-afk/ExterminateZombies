"""方向表成品的朝向与稳定性校验。

存在的原因：候选级检视（inspect_runner_candidates.py）无法发现"多行画成同一朝向"，
因为那需要跨文件比较行与行。2026-08-20 的 Runner v04/v06 就是这样漏过去的——
键控、连通域、四帧一致性、中缝全部通过，实机却只有一个朝向。

核心判据是行间归一化轮廓 IoU：把每格主体按外接框裁出来缩放到同一尺寸再比对，
消除位置和大小差异，只比形状。已验收的 Walker 实测为
down-left 0.411、down-up 0.697、left-up 0.397，
即 left 必须明显远离 down 和 up，而 down/up 同为对称视图所以彼此更接近。

注意自镜像对称度不足以判定朝向：冲刺时一臂前一臂后，正面视图本身就左右不对称，
会被误判成侧面。必须用行间比对。

用法：
    python scripts/verify_directional_sheet.py src/assets/processed/zombies/runner-directional-custom.png 512
"""

from __future__ import annotations

import argparse
import itertools
import sys
from pathlib import Path

from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parents[1]

ROW_ORDER = ["down", "left", "right", "up"]
COMPARE_SIZE = 256
ALPHA_THRESHOLD = 32

# 判据阈值，基线取自已验收的 Walker 方向表。
# 侧向必须与正/背面明显不同；两者过于接近说明画成了同一朝向。
SIDE_VS_FACING_MAX = 0.55
# down 与 up 同为左右对称视图，形状天然接近，但仍必须可区分，不能是同一张图。
FACING_PAIR_MAX = 0.80
# 同一行内四帧的主体尺寸波动上限，超过说明帧间身份或体型漂移。
SIZE_SPREAD_MAX = 0.20


def load_rows(path: Path, frame_size: int) -> dict[str, list[Image.Image]]:
    sheet = Image.open(path).convert("RGBA")
    expected = frame_size * 4
    if sheet.size != (expected, expected):
        raise SystemExit(f"方向表尺寸应为 {expected}x{expected}，实际 {sheet.size}")
    rows: dict[str, list[Image.Image]] = {}
    for index, name in enumerate(ROW_ORDER):
        rows[name] = [
            sheet.crop((
                column * frame_size,
                index * frame_size,
                (column + 1) * frame_size,
                (index + 1) * frame_size,
            ))
            for column in range(4)
        ]
    return rows


def silhouette(cell: Image.Image) -> Image.Image | None:
    mask = cell.getchannel("A").point(lambda v: 255 if v > ALPHA_THRESHOLD else 0)
    bbox = mask.getbbox()
    if bbox is None:
        return None
    # 按外接框裁剪后统一缩放：只比形状，不受位置和尺寸影响。
    return mask.crop(bbox).resize((COMPARE_SIZE, COMPARE_SIZE), Image.Resampling.NEAREST)


def shape_iou(a: Image.Image, b: Image.Image) -> float:
    intersection = ImageChops.darker(a, b).histogram()[255]
    union = ImageChops.lighter(a, b).histogram()[255]
    return intersection / union if union else 0.0


def row_pair_iou(rows: dict[str, list[Image.Image]], first: str, second: str) -> float:
    values = []
    for column in range(4):
        left = silhouette(rows[first][column])
        right = silhouette(rows[second][column])
        if left is None or right is None:
            raise SystemExit(f"{first}/{second} 第 {column} 帧为空")
        values.append(shape_iou(left, right))
    return sum(values) / len(values)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("sheet", help="方向表 PNG 路径")
    parser.add_argument("frame_size", type=int, help="单帧边长，如 512")
    args = parser.parse_args()

    path = Path(args.sheet)
    if not path.is_absolute():
        path = ROOT / path
    rows = load_rows(path, args.frame_size)
    failures: list[str] = []

    print(f"=== {path.name} ===")

    print("行间归一化轮廓 IoU（Walker 基线 down-left 0.411 / down-up 0.697 / left-up 0.397）")
    for first, second in itertools.combinations(["down", "left", "up"], 2):
        value = row_pair_iou(rows, first, second)
        is_facing_pair = {first, second} == {"down", "up"}
        limit = FACING_PAIR_MAX if is_facing_pair else SIDE_VS_FACING_MAX
        verdict = "OK" if value <= limit else "失败"
        if value > limit:
            failures.append(
                f"{first} 与 {second} 轮廓 IoU {value:.3f} 超过上限 {limit}，两行可能是同一朝向"
            )
        print(f"  {first:5s} vs {second:5s}: {value:.3f}  上限 {limit}  {verdict}")

    print("右向必须是左向的精确水平镜像")
    mirrored = all(
        rows["left"][column].transpose(Image.Transpose.FLIP_LEFT_RIGHT).tobytes()
        == rows["right"][column].tobytes()
        for column in range(4)
    )
    print(f"  {'OK' if mirrored else '失败'}")
    if not mirrored:
        failures.append("右向行不是左向行的精确镜像")

    print("行内四帧主体尺寸稳定性")
    for name in ROW_ORDER:
        extents = []
        for cell in rows[name]:
            mask = cell.getchannel("A").point(lambda v: 255 if v > ALPHA_THRESHOLD else 0)
            bbox = mask.getbbox()
            if bbox is None:
                raise SystemExit(f"{name} 行存在空帧")
            extents.append(max(bbox[2] - bbox[0], bbox[3] - bbox[1]))
        spread = (max(extents) - min(extents)) / max(extents)
        verdict = "OK" if spread <= SIZE_SPREAD_MAX else "失败"
        print(f"  {name:5s}: 较长边 {min(extents)}~{max(extents)} 波动 {spread * 100:.1f}%  {verdict}")
        if spread > SIZE_SPREAD_MAX:
            failures.append(f"{name} 行四帧尺寸波动 {spread * 100:.1f}% 过大")

    print("方向形态预期：侧向应横向铺开，正/背面应竖向")
    for name in ROW_ORDER:
        aspects = []
        for cell in rows[name]:
            mask = cell.getchannel("A").point(lambda v: 255 if v > ALPHA_THRESHOLD else 0)
            bbox = mask.getbbox()
            aspects.append((bbox[2] - bbox[0]) / (bbox[3] - bbox[1]))
        average = sum(aspects) / len(aspects)
        print(f"  {name:5s}: 平均宽高比 {average:.2f}")

    print()
    if failures:
        print("校验失败:")
        for item in failures:
            print(f"  - {item}")
        sys.exit(1)
    print("全部通过。注意：本脚本只能证明四行朝向彼此不同且几何稳定，")
    print("不能证明每一行画的是正确的那个方向，也不能替代人工目视确认。")


if __name__ == "__main__":
    main()
