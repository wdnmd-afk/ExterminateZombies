"""武器贴图的像素绘制原语，俯视与侧视两条管线共用。

拆成独立模块的原因：`process_weapon_topdown_assets.py`（俯视，11 把）与
`process_heavy_weapon_profiles.py`（侧视，3 把重火力）用的是同一套部件语法与
同一套光影规则，只有构图数据不同。两边各写一份必然逐渐分叉，
到时候同一把枪的俯视图和图标会看着像两个人画的。

坐标约定：x 沿枪身向前；y 相对画幅中心的 `axisY`，负值朝画面上方。
俯视图里 y=0 就是枪膛中线；侧视图里 y=0 只是画幅中线，枪膛在它上方一些。
"""

import json
from pathlib import Path

from PIL import Image


# 描边留边。1px 描边 + 1px 余量，保证描边不会被画幅切掉。
PAD = 2

# 光影强度。光源沿用项目约定的左上方：顶缘提亮、底缘压暗。
HIGHLIGHT_STRENGTH = (0.42, 0.20)
SHADOW_STRENGTH = (0.34, 0.16)


def parse_hex(value: str) -> tuple[int, int, int, int]:
    text = value.lstrip("#")
    return (int(text[0:2], 16), int(text[2:4], 16), int(text[4:6], 16), 255)


def mix(color: tuple[int, int, int, int], target: int, amount: float) -> tuple[int, int, int, int]:
    return (
        round(color[0] + (target - color[0]) * amount),
        round(color[1] + (target - color[1]) * amount),
        round(color[2] + (target - color[2]) * amount),
        color[3],
    )


def draw_part(pixels, width: int, height: int, origin_x: int, axis_y: int, part: dict, palette: dict) -> None:
    color = palette[part["color"]]
    kind = part["kind"]

    def put(x: int, y: int) -> None:
        px = origin_x + x
        py = axis_y + y
        if 0 <= px < width and 0 <= py < height:
            pixels[px, py] = color

    if kind == "taper":
        x0, x1 = part["x0"], part["x1"]
        h0, h1 = part["h0"], part["h1"]
        offset = part.get("offset", 0)
        span = max(1, x1 - x0)
        for x in range(x0, x1 + 1):
            t = (x - x0) / span
            half = h0 + (h1 - h0) * t
            bound = int(round(half))
            for y in range(-bound, bound + 1):
                put(x, y + offset)
    elif kind == "ellipse":
        x0, x1 = part["x0"], part["x1"]
        half_h = part["h"]
        offset = part.get("offset", 0)
        cx = (x0 + x1) / 2
        rx = max(0.5, (x1 - x0) / 2)
        for x in range(x0, x1 + 1):
            dx = (x - cx) / rx
            inner = max(0.0, 1.0 - dx * dx)
            bound = int(round(half_h * (inner ** 0.5)))
            for y in range(-bound, bound + 1):
                put(x, y + offset)
    elif kind == "box":
        for x in range(part["x0"], part["x1"] + 1):
            for y in range(part["y0"], part["y1"] + 1):
                put(x, y)
    elif kind == "quad":
        # 任意四边形按 y 逐行求交填充。
        #
        # 不能按 x 逐列在上下边之间插值：那种写法只在上下边的 x 跨度相同时成立，
        # 而握把、枪托、脚架这些斜四边形的上下边跨度本来就不同，
        # 逐列插值会把超出跨度的列整列丢掉，斜面被削成直块（2026-08-22 实测）。
        points = [(float(px), float(py)) for px, py in part["points"]]
        min_y = int(round(min(p[1] for p in points)))
        max_y = int(round(max(p[1] for p in points)))
        for y in range(min_y, max_y + 1):
            sample = y + 0.5
            crossings = []
            for index in range(len(points)):
                x_a, y_a = points[index]
                x_b, y_b = points[(index + 1) % len(points)]
                if y_a == y_b:
                    continue
                lo, hi = (y_a, y_b) if y_a < y_b else (y_b, y_a)
                if not (lo <= sample < hi):
                    continue
                t = (sample - y_a) / (y_b - y_a)
                crossings.append(x_a + (x_b - x_a) * t)
            crossings.sort()
            for pair in range(0, len(crossings) - 1, 2):
                x_start = int(round(crossings[pair]))
                x_end = int(round(crossings[pair + 1]))
                for x in range(x_start, x_end + 1):
                    put(x, y)
    elif kind == "ribs":
        x0, x1 = part["x0"], part["x1"]
        step = max(1, part["step"])
        offset = part.get("offset", 0)
        bound = int(round(part["h"]))
        for x in range(x0, x1 + 1, step):
            for y in range(-bound, bound + 1):
                put(x, y + offset)
    else:
        raise SystemExit(f"未知部件类型 {kind}")


def apply_shading(image: Image.Image, outline: tuple[int, int, int, int]) -> None:
    """先按列加顶缘提亮 / 底缘压暗，再沿轮廓描一圈边。

    分两步而不是画的时候顺手做：部件互相覆盖，只有全部填完才知道哪一行真的是
    枪身的顶缘。描边放最后，否则会被后画的部件盖掉；描边读的是快照，
    否则会自我扩散成两像素宽。
    """
    width, height = image.size
    pixels = image.load()

    for x in range(width):
        column = [y for y in range(height) if pixels[x, y][3] > 0]
        if not column:
            continue
        top, bottom = column[0], column[-1]
        for index, amount in enumerate(HIGHLIGHT_STRENGTH):
            y = top + index
            if y <= bottom and pixels[x, y][3] > 0:
                pixels[x, y] = mix(pixels[x, y], 255, amount)
        for index, amount in enumerate(SHADOW_STRENGTH):
            y = bottom - index
            if y >= top and pixels[x, y][3] > 0 and y > top + len(HIGHLIGHT_STRENGTH) - 1:
                pixels[x, y] = mix(pixels[x, y], 0, amount)

    opaque = [[pixels[x, y][3] > 0 for y in range(height)] for x in range(width)]
    for x in range(width):
        for y in range(height):
            if opaque[x][y]:
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < width and 0 <= ny < height and opaque[nx][ny]:
                    pixels[x, y] = outline
                    break


def build_weapon(weapon_id: str, spec: dict) -> tuple[Image.Image, int, int]:
    """按 spec 画出一把枪。返回 (图, 内容原点 x, 枪膛/画幅中线 y)。

    画幅有两种给法：
    - 俯视：给 `length` 与 `halfHeight`，画幅按内容加 PAD 推出来；
    - 侧视：给 `canvasWidth` / `canvasHeight` / `axisY`，画幅锁定成图标既有尺寸，
      因为 `weaponLibrary.ts` 的预览缩放是按枪逐个写死的，换画幅会改变显示大小。
    """
    palette = {name: parse_hex(value) for name, value in spec["palette"].items()}

    if "canvasWidth" in spec:
        width = spec["canvasWidth"]
        height = spec["canvasHeight"]
        origin_x = 0
        axis_y = spec["axisY"]
    else:
        width = spec["length"] + 2 * PAD + 1
        height = 2 * spec["halfHeight"] + 2 * PAD + 1
        origin_x = PAD
        axis_y = PAD + spec["halfHeight"]

    image = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    pixels = image.load()
    for part in spec["parts"]:
        draw_part(pixels, width, height, origin_x, axis_y, part, palette)
    apply_shading(image, palette["outline"])

    bbox = image.getbbox()
    if bbox is None:
        raise SystemExit(f"{weapon_id}: 产物是空图")
    if bbox[0] < 1 or bbox[1] < 1 or bbox[2] > width - 1 or bbox[3] > height - 1:
        raise SystemExit(
            f"{weapon_id}: 内容 bbox {bbox} 顶到画幅 {width}x{height} 边界，"
            "描边会被切掉，需要缩小构图或加大画幅"
        )
    return image, origin_x, axis_y


def load_specs(path: Path) -> dict:
    specs = json.loads(path.read_text(encoding="utf-8"))
    return {key: value for key, value in specs.items() if not key.startswith("_")}
