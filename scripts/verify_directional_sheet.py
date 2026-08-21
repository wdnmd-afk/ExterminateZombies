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

# 侧向行与正/背面行的自镜像对称度最小落差。
#
# 为什么需要这一条：行间轮廓 IoU 对圆胖体型会饱和。2026-08-20 实测，Bomber 自己的
# 四视图转身参考图（模型在同一张图里并排画出四个明显不同的视图，已是它的最佳表现）
# 的 down-left IoU 仍有 0.629、left-up 0.590，双双超过 0.55；同一脚本量到 Runner 的
# 参考图只有 0.373 / 0.361。原因是球形躯干主导轮廓，从任何角度看外形都高度重叠。
# 把 0.55 抬高并不能获得判别力：Runner 已知报废的 v04（四行同朝向）实测 0.625-0.717，
# 与 Bomber 合法的 0.564-0.609 完全重叠，抬阈值只是不再报错而已。
#
# 有判别力的统计量是"与同一角色自己的正面比"，它对体型自归一化：
#   Walker（已验收）  side 0.216 vs down 0.878 → 落差 0.662
#   Runner（已验收）  side 0.262 vs down 0.731 → 落差 0.469
#   Bomber v01        side 0.535 vs down 0.839 → 落差 0.304
#   Runner v04（报废）四行全约 0.60          → 落差 约 0
# 取 0.15 能放过三个合法样本，同时拦下"四行同朝向"这个真实报废模式。
SIDE_FACING_SYMMETRY_GAP_MIN = 0.15

# 第二指标：侧向行相对正/背面行的平均宽高比落差。
#
# 2026-08-21 追加，与候选级 inspect_zombie_candidates.py 的 aspectGapMin 同源同值。
# 加它的原因是自镜像对称度落差本身也会饱和，圆胖体型上不够用——bloater v01 实测
# side 0.805 vs up 0.941 落差仅 0.136，卡在 0.15 下面，但它的朝向毫无疑问是对的：
#   bloater  left 1.26  vs  down 0.93  up 0.93   （落差 +0.33）
# 而宽高比落差在"四行同朝向"这个真实报废模式下必然一起塌到 0（同朝向意味着同形变）。
# 所以三条判据的合议关系是：轮廓 IoU 超限只是提示，只有"对称度落差与宽高比落差
# 同时不足"才判同朝向。
#
# 下限 0.30 的标定（侧向宽高比 − 正/背面宽高比）：
#   已验收  runner +0.91、lurker +0.41、drifter +0.26、bomber +0.22、tank +0.16
#   本轮    crawler +1.68、stalker +1.08、bloater +0.33、rotting +0.26
# tank / bomber / drifter / rotting 低于 0.30，它们靠对称度落差过关（0.198~0.304）——
# 合议只要求"不要两项同时不足"，不要求每项都达标。
SIDE_FACING_ASPECT_GAP_MIN = 0.30


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


def row_aspect(rows: dict[str, list[Image.Image]], name: str) -> float:
    """一行四帧主体外接框的平均宽高比。

    真正的俯视侧面是横躺的（宽高比 > 1），正/背面是竖立的（< 1），所以这个量是
    朝向判据的第二指标。它对体型自归一化的方向与自镜像对称度不同：比的是同一角色
    不同视角的自身形变，因此对圆胖体型不饱和。见 SIDE_FACING_ASPECT_GAP_MIN。
    """
    aspects = []
    for cell in rows[name]:
        mask = cell.getchannel("A").point(lambda v: 255 if v > ALPHA_THRESHOLD else 0)
        bbox = mask.getbbox()
        aspects.append((bbox[2] - bbox[0]) / (bbox[3] - bbox[1]))
    return sum(aspects) / len(aspects)


def self_mirror_symmetry(cell: Image.Image) -> float | None:
    """主体轮廓与自身水平镜像的 IoU。

    单独看这个值无法定论（动作幅度大时正面也会偏低），但"侧向行相对本角色正面行的
    落差"是体型无关的判据，见 SIDE_FACING_SYMMETRY_GAP_MIN 的标定说明。
    """
    shape = silhouette(cell)
    if shape is None:
        return None
    flipped = shape.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    return shape_iou(shape, flipped)


def row_symmetry(rows: dict[str, list[Image.Image]], name: str) -> float:
    values = [self_mirror_symmetry(cell) for cell in rows[name]]
    present = [v for v in values if v is not None]
    if not present:
        raise SystemExit(f"{name} 行无法计算自镜像对称度")
    return sum(present) / len(present)


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
    iou_exceeded: list[str] = []
    for first, second in itertools.combinations(["down", "left", "up"], 2):
        value = row_pair_iou(rows, first, second)
        is_facing_pair = {first, second} == {"down", "up"}
        limit = FACING_PAIR_MAX if is_facing_pair else SIDE_VS_FACING_MAX
        verdict = "OK" if value <= limit else "超限"
        if value > limit:
            iou_exceeded.append(
                f"{first} 与 {second} 轮廓 IoU {value:.3f} 超过上限 {limit}"
            )
        print(f"  {first:5s} vs {second:5s}: {value:.3f}  上限 {limit}  {verdict}")

    # 侧向 vs 正/背面的自镜像对称度落差。
    # 这一条对体型自归一化，是圆胖体型下唯一仍有判别力的朝向判据；
    # 上面的轮廓 IoU 对球形躯干会饱和（标定见 SIDE_FACING_SYMMETRY_GAP_MIN）。
    print("侧向与正/背面的自镜像对称度落差（体型无关判据）")
    side_symmetry = row_symmetry(rows, "left")
    facing_symmetry = {name: row_symmetry(rows, name) for name in ("down", "up")}
    gaps = {name: value - side_symmetry for name, value in facing_symmetry.items()}
    print(
        f"  left {side_symmetry:.3f}  down {facing_symmetry['down']:.3f}"
        f"  up {facing_symmetry['up']:.3f}"
    )
    # 第二指标：宽高比落差。标定与合议关系见 SIDE_FACING_ASPECT_GAP_MIN。
    row_aspects = {name: row_aspect(rows, name) for name in ROW_ORDER}
    aspect_gaps = {
        name: row_aspects["left"] - row_aspects[name] for name in ("down", "up")
    }
    gap_ok = True
    for name, gap in gaps.items():
        aspect_gap = aspect_gaps[name]
        symmetry_ok = gap >= SIDE_FACING_SYMMETRY_GAP_MIN
        aspect_ok = aspect_gap >= SIDE_FACING_ASPECT_GAP_MIN
        print(
            f"  vs {name:4s}: 对称度落差 {gap:+.3f}（下限 {SIDE_FACING_SYMMETRY_GAP_MIN}）"
            f"{'OK' if symmetry_ok else '不足'}"
            f"；宽高比落差 {aspect_gap:+.2f}（下限 {SIDE_FACING_ASPECT_GAP_MIN}）"
            f"{'OK' if aspect_ok else '不足'}"
        )
        if symmetry_ok or aspect_ok:
            continue
        gap_ok = False
        failures.append(
            f"left 相对 {name} 的对称度落差仅 {gap:.3f}（下限 "
            f"{SIDE_FACING_SYMMETRY_GAP_MIN}）且宽高比落差仅 {aspect_gap:.2f}（下限 "
            f"{SIDE_FACING_ASPECT_GAP_MIN}），两项同时不足，侧向行很可能与 {name} 是同一朝向"
        )

    # 两条判据合并成一个结论：只有"IoU 超限且落差也塌了"才算同朝向。
    if iou_exceeded and not gap_ok:
        failures.extend(f"{item}，且对称度落差同时不足" for item in iou_exceeded)
    elif iou_exceeded:
        print(
            "  说明: 轮廓 IoU 超限但对称度落差充足，判定为该体型下轮廓判据饱和而非朝向错误。\n"
            "        超限项: " + "；".join(iou_exceeded)
        )

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
        print(f"  {name:5s}: 平均宽高比 {row_aspects[name]:.2f}")

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
