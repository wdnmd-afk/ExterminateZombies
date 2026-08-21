"""从 Kenney Topdown Shooter 的自带持枪合成图里抽出"持枪手层"。

存在理由：实机武器是独立贴图，画在人物下层。人物底图如果用 `*_hold.png`
（双手张开、手里没有东西），两只手会分别落在瞄准中线上下约 12.5px 处，武器从
两手之间穿过，谁都没握住它——这就是「武器贴图不像握枪」的直接原因。

Kenney 自己的持枪姿态不是这么搭的。实测 `*_gun.png` / `*_machine.png` 的构成是：

    `*_stand.png`（躯干，落在合成图 (0,0)）
  + `weapon_gun.png`（画在躯干下层，落在 (stand.width - 4, 26)）
  + 一层压在枪上的前臂与拳头

因此本脚本把第三层单独抽出来，运行时按 阴影 → 武器 → 躯干 → 持枪手 的顺序叠加，
让手真正压在握把上。抽取方式是"合成图减去另外两层"而不是按颜色抠手：
躯干与武器两层都能逐像素精确对齐（见 main() 里的断言），相减的残差就只剩手层。

画幅约定：产物宽度为 `stand.width + 2 * PAD`、高度与 `stand.height` 相同，
手层按 (PAD, 0) 贴入。这样产物的几何中心与躯干贴图的几何中心是同一点，
运行时两层都用 origin 0.5/0.5、同一缩放、同一旋转角即可对齐，代码里不需要偏移量。
PAD 必须与躯干宽度同时决定画幅奇偶，否则中心会落在半像素上。

用法（仓库自带 uv 虚拟环境已装 Pillow）：
  .venv/Scripts/python.exe scripts/process_character_hand_layers.py
"""

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
KENNEY_PNG = (
    ROOT
    / "src"
    / "assets"
    / "downloaded"
    / "characters"
    / "kenney-topdown-shooter"
    / "PNG"
)
OUTPUT_DIR = ROOT / "src" / "assets" / "processed" / "characters"

# 角色 id -> 素材包内的姿态文件前缀。与 src/config/characters.ts 的
# CHARACTER_HAND_TEXTURE_KEYS 一一对应。
#
# 守望者不在表内：它的实机精灵是自生成的（sprite-watcher.png），拳头已经画在贴图里，
# 再叠一层 Kenney 的手会出现两双手。它的握枪锚点按自生成图实测，见 characters.ts。
# 守望者若哪天退回 Kenney 素材，在这里补一行 "watcher": "Survivor 1/survivor1" 即可。
CHARACTER_STEMS = {
    "eagle-eye": "Hitman 1/hitman1",
    "bastion": "Soldier 1/soldier1",
    "runner": "Man Blue/manBlue",
    "breacher": "Man Brown/manBrown",
}

# 手层向躯干贴图右侧的最大溢出实测为 15px（堡垒 36px 宽、手层伸到 x=51），取 16 留 1px 余量。
PAD = 16

# 颜色相等判据。素材是无损 PNG，理论上应当逐位相同；给 12 的容差是为了兼容
# 抗锯齿边上 ±1 的差异，避免把躯干轮廓误判成手层。
COLOR_TOLERANCE = 12

ALPHA_THRESHOLD = 8


def same_color(a: tuple[int, int, int, int], b: tuple[int, int, int, int]) -> bool:
    return all(abs(a[channel] - b[channel]) <= COLOR_TOLERANCE for channel in range(3))


def locate(haystack: Image.Image, needle: Image.Image) -> tuple[int, int, float]:
    """在 haystack 里找 needle 的最佳落点，返回 (x, y, 平均色差)。

    只统计 needle 的不透明像素：躯干与武器都可能被上层遮挡，
    但没被遮挡的部分必须逐像素吻合，平均色差因此是可信的对齐判据。
    """
    hay = haystack.convert("RGBA").load()
    nee = needle.convert("RGBA").load()
    best = (0, 0, float("inf"))
    for offset_y in range(-needle.height, haystack.height + 1):
        for offset_x in range(-needle.width, haystack.width + 1):
            total = 0
            count = 0
            for y in range(needle.height):
                for x in range(needle.width):
                    source = nee[x, y]
                    if source[3] < 200:
                        continue
                    count += 1
                    hx = offset_x + x
                    hy = offset_y + y
                    if not (0 <= hx < haystack.width and 0 <= hy < haystack.height):
                        total += 765
                        continue
                    target = hay[hx, hy]
                    total += sum(abs(source[c] - target[c]) for c in range(3))
            if count == 0:
                continue
            average = total / count
            if average < best[2]:
                best = (offset_x, offset_y, average)
    return best


def extract_hand_layer(
    stand: Image.Image,
    composite: Image.Image,
    weapon: Image.Image,
    weapon_at: tuple[int, int],
) -> Image.Image:
    """合成图减去躯干层与武器层，剩下的就是压在枪上的前臂与拳头。"""
    comp = composite.convert("RGBA").load()
    body = stand.convert("RGBA").load()
    gun = weapon.convert("RGBA").load()
    layer = Image.new("RGBA", (stand.width + 2 * PAD, stand.height), (0, 0, 0, 0))
    out = layer.load()

    for y in range(composite.height):
        for x in range(composite.width):
            pixel = comp[x, y]
            if pixel[3] < ALPHA_THRESHOLD:
                continue
            if 0 <= x < stand.width and 0 <= y < stand.height:
                candidate = body[x, y]
                if candidate[3] >= ALPHA_THRESHOLD and same_color(candidate, pixel):
                    continue
            gx = x - weapon_at[0]
            gy = y - weapon_at[1]
            if 0 <= gx < weapon.width and 0 <= gy < weapon.height:
                candidate = gun[gx, gy]
                if candidate[3] >= ALPHA_THRESHOLD and same_color(candidate, pixel):
                    continue
            target_x = x + PAD
            if not (0 <= target_x < layer.width and 0 <= y < layer.height):
                raise SystemExit(
                    f"手层像素 ({x},{y}) 落在画幅之外，PAD={PAD} 不够，请调大后重跑"
                )
            out[target_x, y] = pixel
    return layer


def measure_grip_anchor(layer: Image.Image, stand: Image.Image, bore_side: float) -> tuple[float, int]:
    """量出握把锚点的 `forward` 分量（源像素，相对躯干几何中心），以及该处的遮挡厚度。

    判据不是"皮肤色质心"而是**手层在枪膛线以下的遮挡最厚的位置**。
    质心会落到指尖：手层前缘只有 4px 高，把握把对到那里，握把的大部分会掉在手的前方
    露出来。取遮挡最厚的一列，握把才真正落进掌心。

    返回 (forward, 该列在枪膛线以下的遮挡像素数)。
    """
    pixels = layer.convert("RGBA").load()
    center_x = stand.width / 2 + PAD
    center_y = stand.height / 2
    bore_y = bore_side + center_y

    best_columns: list[int] = []
    best_depth = -1
    for x in range(layer.width):
        depth = sum(
            1
            for y in range(layer.height)
            if y > bore_y and pixels[x, y][3] >= 40
        )
        if depth > best_depth:
            best_depth = depth
            best_columns = [x]
        elif depth == best_depth:
            best_columns.append(x)
    if best_depth <= 0:
        raise SystemExit("手层在枪膛线以下没有任何遮挡，抽取结果不可信")
    # 最厚的一段通常是连续几列，取中点，避免锚点贴在平台边缘
    forward = (best_columns[0] + best_columns[-1]) / 2 - center_x
    return forward, best_depth


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    weapon = Image.open(KENNEY_PNG / "weapon_gun.png").convert("RGBA")

    for character_id, stem in CHARACTER_STEMS.items():
        stand = Image.open(KENNEY_PNG / f"{stem}_stand.png").convert("RGBA")
        composite = Image.open(KENNEY_PNG / f"{stem}_gun.png").convert("RGBA")

        # 两层的落点是抽取的前提，必须验证而不是假定：
        # 躯干要求逐像素吻合，武器允许被躯干遮挡后残留少量差异。
        stand_x, stand_y, stand_error = locate(composite, stand)
        if (stand_x, stand_y) != (0, 0) or stand_error > 1.0:
            raise SystemExit(
                f"{character_id}: 躯干层落点 ({stand_x},{stand_y}) 色差 {stand_error:.2f}，"
                "与 (0,0) 精确吻合的前提不成立，抽取会把躯干像素混进手层"
            )
        weapon_x, weapon_y, weapon_error = locate(composite, weapon)
        expected = (stand.width - 4, 26)
        if (weapon_x, weapon_y) != expected or weapon_error > 12.0:
            raise SystemExit(
                f"{character_id}: 武器层落点 ({weapon_x},{weapon_y}) 色差 {weapon_error:.2f}，"
                f"与预期 {expected} 不符"
            )

        layer = extract_hand_layer(stand, composite, weapon, (weapon_x, weapon_y))
        target = OUTPUT_DIR / f"hand-{character_id}.png"
        layer.save(target)
        bore_side = weapon_y + weapon.height / 2 - stand.height / 2
        forward, depth = measure_grip_anchor(layer, stand, bore_side)
        print(
            f"hand-{character_id}.png: {layer.width}x{layer.height}"
            f"  躯干 {stand.width}x{stand.height}"
            f"  => characters.ts 应写 gripAnchor: {{ forward: {forward}, boreSide: {bore_side} }}"
            f"  （该处枪膛线以下遮挡 {depth}px）"
        )


if __name__ == "__main__":
    main()
