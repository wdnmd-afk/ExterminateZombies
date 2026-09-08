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


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    keycap().save(OUTPUT / "keycap.png")
    crosshair().save(OUTPUT / "crosshair.png")


if __name__ == "__main__":
    main()
