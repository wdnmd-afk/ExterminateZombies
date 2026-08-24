"""武器贴图的像素绘制原语，俯视与侧视两条管线共用。

拆成独立模块的原因：`process_weapon_topdown_assets.py`（俯视，11 把）与
`process_heavy_weapon_profiles.py`（侧视，3 把重火力）用的是同一套部件语法与
同一套光影规则，只有构图数据不同。两边各写一份必然逐渐分叉，
到时候同一把枪的俯视图和图标会看着像两个人画的。

坐标约定：x 沿枪身向前；y 相对画幅中心的 `axisY`，负值朝画面上方。
俯视图里 y=0 就是枪膛中线；侧视图里 y=0 只是画幅中线，枪膛在它上方一些。

--------------------------------------------------------------------------------
两套明暗模型，由 spec 根上的 `shadeModel` 选择。

`rim`（默认，原有行为）：填完所有部件后，按列把最顶 2 行向白混合、最底 2 行向黑混合。
它的隐含假设是「整把枪是一个圆柱体」。对手枪、MP5 这类近似成立。

`perPart`（2026-08-23 新增，俯视管线在用）：每个部件按**自己那一列**的上下边界算明暗，
再叠一层很轻的整体轮缘。存在理由是 rim 模型对重武器不成立——加特林的机匣、转子、
枪管束是三个直径完全不同的体，rim 只给整体轮廓的最外两行上色，内部所有部件边界
都没有明暗差，整把枪读成一块被刻了几道线的平板（旧 gatling 俯视图正是如此）。
逐部件着色后相邻部件天然出现明度断差，各自读成独立的体。

为什么这是正确的着色而不是风格化：俯视图里枪管、燃料罐、转子都是横放的圆柱，
光从画面左上来时照亮的是 -y 那一侧、阴影落在 +y 那一侧，沿 y 做柱面渐变正是
这个视角下的物理结果。

新模型只对显式声明 `shadeModel: "perPart"` 的 spec 生效，侧视管线的产物逐字节不变。
"""

import json
from pathlib import Path

from PIL import Image


# 描边留边。1px 描边 + 1px 余量，保证描边不会被画幅切掉。
PAD = 2

# `rim` 模型的光影强度。光源沿用项目约定的左上方：顶缘提亮、底缘压暗。
HIGHLIGHT_STRENGTH = (0.42, 0.20)
SHADOW_STRENGTH = (0.34, 0.16)

# `perPart` 模型的逐部件柱面强度。顶比底强：迎光面的高光比背光面的阴影更抢眼。
PART_HIGHLIGHT = 0.38
PART_SHADOW = 0.34
# 柱面剖面里「本色带」的位置，0 为顶、1 为底。取 0.42 而不是 0.5：
# 迎光面窄、背光面宽，是圆柱在斜上方光源下的实际明度分布。
PART_NEUTRAL = 0.42

# `perPart` 模型的整体轮缘。逐部件明暗已承担体积，这里只补一行，
# 强度远低于 rim 模型——用 rim 的 0.42 会把顶缘烧成纯白。
RIM_HIGHLIGHT = 0.22
RIM_SHADOW = 0.22

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


def shade_amount(y: int, top: int, bottom: int, mode: str) -> float:
    """部件内某一行的明暗系数。正数向白混合，负数向黑混合，0 为本色。

    `cylinder` 是默认剖面：把 top~bottom 归一化到 0~1，在 PART_NEUTRAL 处为本色，
    两侧分别向 PART_HIGHLIGHT / PART_SHADOW 线性趋近。线性而不是余弦——部件在这个
    尺度上往往只有 4~8 行高，余弦的平滑段落在亚像素里看不出来，反而让本色带吃掉
    一半行数，明度断差变糊。

    `dome` 供燃料罐这类又圆又胖的部件：明暗峰值更靠边，中间大片本色，
    读起来是球面而不是管面。
    `flat` 供瞄具、供弹箱这类真正的平面盖板，以及需要保住纯色的警示条与火焰。
    """
    if mode == "flat":
        return 0.0
    span = bottom - top
    if span <= 0:
        # 单行部件（弹链链节、铆钉）没有可着色的厚度，给一点提亮当作顶面反光。
        return PART_HIGHLIGHT * 0.5
    t = (y - top) / span
    if mode == "dome":
        if t < 0.22:
            return PART_HIGHLIGHT * (1.0 - t / 0.22)
        if t > 0.72:
            return -PART_SHADOW * ((t - 0.72) / 0.28)
        return 0.0
    if t < PART_NEUTRAL:
        return PART_HIGHLIGHT * (1.0 - t / PART_NEUTRAL)
    return -PART_SHADOW * ((t - PART_NEUTRAL) / (1.0 - PART_NEUTRAL))


def quad_columns(points: list[tuple[float, float]]) -> dict[int, tuple[int, int]]:
    """任意四边形的逐列上下边界。

    按 y 逐行求交、再把结果转成逐列的 min/max，而不是按 x 逐列在上下边之间插值：
    那种写法只在上下边的 x 跨度相同时成立，而握把、枪托、脚架这些斜四边形的上下边
    跨度本来就不同，逐列插值会把超出跨度的列整列丢掉，斜面被削成直块（2026-08-22 实测）。

    对凸四边形，逐列的填充区间是连续的，所以 min/max 即精确解。
    """
    min_y = int(round(min(point[1] for point in points)))
    max_y = int(round(max(point[1] for point in points)))
    columns: dict[int, tuple[int, int]] = {}
    for y in range(min_y, max_y + 1):
        sample = y + 0.5
        crossings = []
        for index in range(len(points)):
            x_a, y_a = points[index]
            x_b, y_b = points[(index + 1) % len(points)]
            if y_a == y_b:
                continue
            low, high = (y_a, y_b) if y_a < y_b else (y_b, y_a)
            if not (low <= sample < high):
                continue
            t = (sample - y_a) / (y_b - y_a)
            crossings.append(x_a + (x_b - x_a) * t)
        crossings.sort()
        for pair in range(0, len(crossings) - 1, 2):
            for x in range(int(round(crossings[pair])), int(round(crossings[pair + 1])) + 1):
                existing = columns.get(x)
                if existing is None:
                    columns[x] = (y, y)
                else:
                    columns[x] = (min(existing[0], y), max(existing[1], y))
    return columns


def part_spans(part: dict, palette: dict):
    """把一个部件展开为 (x, top, bottom, color, shade) 竖向跨度。

    统一成跨度序列而不是各类型自己写像素循环：明暗必须按「该部件在该列的上下边界」
    计算，只有跨度这一层同时知道颜色和边界。新增图元只要产出跨度就自动获得柱面明暗。
    """
    kind = part["kind"]
    color = palette[part["color"]]
    shade = part.get("shade", "cylinder")
    offset = int(round(part.get("offset", 0)))

    if kind == "taper":
        x0, x1 = part["x0"], part["x1"]
        h0, h1 = part["h0"], part["h1"]
        span = max(1, x1 - x0)
        for x in range(x0, x1 + 1):
            half = int(round(h0 + (h1 - h0) * (x - x0) / span))
            yield x, offset - half, offset + half, color, shade

    elif kind == "ellipse":
        x0, x1 = part["x0"], part["x1"]
        half_h = part["h"]
        cx = (x0 + x1) / 2
        rx = max(0.5, (x1 - x0) / 2)
        for x in range(x0, x1 + 1):
            dx = (x - cx) / rx
            bound = int(round(half_h * (max(0.0, 1.0 - dx * dx) ** 0.5)))
            yield x, offset - bound, offset + bound, color, shade

    elif kind == "box":
        for x in range(part["x0"], part["x1"] + 1):
            yield x, part["y0"], part["y1"], color, shade

    elif kind == "quad":
        points = [(float(px), float(py)) for px, py in part["points"]]
        for x, (top, bottom) in quad_columns(points).items():
            yield x, top, bottom, color, shade

    elif kind == "ribs":
        # 可选 y0/y1 把细线限制在一段带内（护木散热槽只开在朝外那一侧，
        # 不该像初版那样贯穿整个枪身高度）。不给就沿用 ±h 全高。
        step = max(1, part["step"])
        if "y0" in part and "y1" in part:
            top, bottom = part["y0"], part["y1"]
        else:
            bound = int(round(part["h"]))
            top, bottom = -bound, bound
        for x in range(part["x0"], part["x1"] + 1, step):
            yield x, top + offset, bottom + offset, color, shade

    elif kind == "barrels":
        # 枪管束。先铺一条暗底填满整束的投影范围，再逐根画管，
        # 于是管与管之间自然留出一道暗缝——这正是「枪管可数」的来源。
        # 用 ribs 画竖线做不到：竖线画在一根粗管子上读作「刻了几道线」。
        count = int(part["count"])
        pitch = part["pitch"]
        tube_half = part["tubeHalf"]
        shadow = palette[part["shadowColor"]]
        centers = [offset + (index - (count - 1) / 2) * pitch for index in range(count)]
        inner = int(round(min(centers) - tube_half))
        outer = int(round(max(centers) + tube_half))
        for x in range(part["x0"], part["x1"] + 1):
            yield x, inner, outer, shadow, "flat"
            for center in centers:
                yield x, int(round(center - tube_half)), int(round(center + tube_half)), color, shade

    elif kind == "belt":
        # 供弹链。底带是链节间的暗腔，链节按 step 逐个压在上面。
        link = palette[part["linkColor"]]
        y0, y1 = part["y0"], part["y1"]
        step = max(2, part["step"])
        link_width = max(1, int(part.get("linkWidth", step - 1)))
        for x in range(part["x0"], part["x1"] + 1):
            yield x, y0, y1, color, "flat"
        for start in range(part["x0"], part["x1"] + 1, step):
            for x in range(start, min(start + link_width, part["x1"] + 1)):
                yield x, y0, y1, link, shade

    elif kind == "hose":
        # 软管。沿 x 从 (x0,y0) 走到 (x1,y1)，中途按 sag 向 +y 外凸——
        # 直线读作「又一根枪管」，外凸才读作「一根软的管子」。
        x0, x1 = part["x0"], part["x1"]
        y0, y1 = part["y0"], part["y1"]
        half = part["half"]
        sag = part.get("sag", 0.0)
        span = max(1, x1 - x0)
        for x in range(x0, x1 + 1):
            t = (x - x0) / span
            center = y0 + (y1 - y0) * t + sag * (4 * t * (1 - t))
            yield x, int(round(center - half)), int(round(center + half)), color, shade

    elif kind == "rivets":
        # 铆钉 / 螺栓。1px 的点，只为在大片同色钢面上给出机械感的尺度参照。
        y = int(round(part["y"]))
        step = max(1, part["step"])
        for x in range(part["x0"], part["x1"] + 1, step):
            yield x, y, y, color, part.get("shade", "flat")

    elif kind == "glow":
        # 点火焰。从边缘色向核心色径向过渡；shade 恒为 flat，
        # 因为火焰不是被外部光源照亮的固体，自己发光的东西不该有背光面。
        x0, x1 = part["x0"], part["x1"]
        half_h = part["h"]
        core = palette[part["coreColor"]]
        cx = (x0 + x1) / 2
        rx = max(0.5, (x1 - x0) / 2)
        for x in range(x0, x1 + 1):
            dx = (x - cx) / rx
            bound = int(round(half_h * (max(0.0, 1.0 - dx * dx) ** 0.5)))
            for y in range(offset - bound, offset + bound + 1):
                dy = (y - offset) / max(0.5, half_h)
                distance = min(1.0, (dx * dx + dy * dy) ** 0.5)
                blended = tuple(
                    round(color[channel] + (core[channel] - color[channel]) * (1.0 - distance))
                    for channel in range(3)
                ) + (255,)
                yield x, y, y, blended, "flat"

    else:
        raise SystemExit(f"未知部件类型 {kind}")


def draw_part(
    pixels,
    width: int,
    height: int,
    origin_x: int,
    axis_y: int,
    part: dict,
    palette: dict,
    per_part_shading: bool,
) -> None:
    """把一个部件填进像素缓冲。`per_part_shading` 决定是否顺带上柱面明暗。"""
    for x, top, bottom, color, shade in part_spans(part, palette):
        px = origin_x + x
        if not 0 <= px < width:
            continue
        for y in range(top, bottom + 1):
            py = axis_y + y
            if not 0 <= py < height:
                continue
            if not per_part_shading:
                pixels[px, py] = color
                continue
            amount = shade_amount(y, top, bottom, shade)
            if amount > 0:
                pixels[px, py] = mix(color, 255, amount)
            elif amount < 0:
                pixels[px, py] = mix(color, 0, -amount)
            else:
                pixels[px, py] = color


def apply_shading(image: Image.Image, outline: tuple[int, int, int, int], per_part: bool) -> None:
    """整体轮缘明暗，再沿轮廓描一圈边。

    轮缘必须在所有部件填完之后算：部件互相覆盖，只有全部填完才知道哪一行真的是
    枪身的外缘。描边放最后，否则会被后画的部件盖掉；描边读的是快照，
    否则会自我扩散成两像素宽。

    `per_part` 为真时只补最外一行、强度很低（逐部件那一层已经承担了体积）；
    为假时走原有的两行渐变，即 `rim` 模型的全部明暗来源。
    """
    width, height = image.size
    pixels = image.load()

    for x in range(width):
        column = [y for y in range(height) if pixels[x, y][3] > 0]
        if not column:
            continue
        top, bottom = column[0], column[-1]
        if per_part:
            pixels[x, top] = mix(pixels[x, top], 255, RIM_HIGHLIGHT)
            if bottom > top:
                pixels[x, bottom] = mix(pixels[x, bottom], 0, RIM_SHADOW)
            continue
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

    明暗模型由 spec 根上的 `shadeModel` 选择，缺省 `rim`（见模块文档串）。
    """
    palette = {name: parse_hex(value) for name, value in spec["palette"].items()}
    per_part = spec.get("shadeModel", "rim") == "perPart"

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
        draw_part(pixels, width, height, origin_x, axis_y, part, palette, per_part)
    apply_shading(image, palette["outline"], per_part)

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







