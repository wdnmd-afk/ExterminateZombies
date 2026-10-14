"""生成无第三方依赖的 UI 位图资产，供按键提示和战斗准星使用。"""

from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "src" / "assets" / "processed" / "ui"


def keycap() -> Image.Image:
    image = Image.new("RGBA", (80, 32), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((1, 1, 78, 30), radius=4, fill=(24, 31, 39, 245), outline=(251, 192, 45, 235), width=2)
    draw.line((6, 25, 73, 25), fill=(8, 12, 16, 220), width=2)
    return image


def crosshair() -> Image.Image:
    image = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    color = (251, 192, 45, 235)
    draw.ellipse((8, 8, 23, 23), outline=color, width=2)
    draw.line((15, 1, 15, 7), fill=color, width=2)
    draw.line((15, 24, 15, 30), fill=color, width=2)
    draw.line((1, 15, 7, 15), fill=color, width=2)
    draw.line((24, 15, 30, 15), fill=color, width=2)
    return image


def panel_frame() -> Image.Image:
    image = Image.new("RGBA", (48, 48), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.line([(7, 1), (40, 1), (46, 7), (46, 40), (40, 46), (7, 46), (1, 40), (1, 7), (7, 1)], fill=(255, 255, 255, 210), width=1)
    for position in [(4, 4), (41, 4), (4, 41), (41, 41)]:
        draw.rectangle((*position, position[0] + 2, position[1] + 2), fill=(255, 255, 255, 160))
    return image


def icon(name: str) -> Image.Image:
    image = Image.new("RGBA", (24, 24), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    color = (255, 255, 255, 255)
    if name == "back":
        draw.line([(10, 5), (3, 12), (10, 19)], fill=color, width=2)
        draw.line((4, 12, 21, 12), fill=color, width=2)
    elif name == "confirm":
        draw.line([(4, 12), (9, 17), (20, 6)], fill=color, width=3)
    elif name == "settings":
        for vertical, knob in [(6, 8), (12, 16), (18, 10)]:
            draw.line((3, vertical, 21, vertical), fill=color, width=2)
            draw.rectangle((knob - 2, vertical - 2, knob + 2, vertical + 2), fill=color)
    elif name == "loadout":
        draw.rectangle((3, 7, 21, 20), outline=color, width=2)
        draw.rectangle((8, 3, 16, 7), outline=color, width=2)
        draw.line((4, 12, 20, 12), fill=color, width=2)
        draw.rectangle((10, 10, 14, 14), fill=color)
    elif name == "volume":
        draw.polygon([(3, 9), (7, 9), (12, 5), (12, 19), (7, 15), (3, 15)], fill=color)
        draw.arc((10, 5, 21, 19), -70, 70, fill=color, width=2)
        draw.arc((12, 8, 17, 16), -70, 70, fill=color, width=2)
    elif name == "accessibility":
        draw.ellipse((9, 2, 15, 8), fill=color)
        draw.line((3, 10, 21, 10), fill=color, width=2)
        draw.line((12, 9, 12, 15), fill=color, width=3)
        draw.line([(6, 22), (12, 14), (18, 22)], fill=color, width=2)
    else:
        raise ValueError(name)
    return image


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    keycap().save(OUTPUT / "keycap.png")
    crosshair().save(OUTPUT / "crosshair.png")
    panel_frame().save(OUTPUT / "panel-frame.png")
    for name in ["back", "confirm", "settings", "loadout", "volume", "accessibility"]:
        icon(name).save(OUTPUT / f"icon-{name}.png")


if __name__ == "__main__":
    main()
