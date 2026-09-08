"""从已登记的第二关位图母版生成其余主题的调色派生背景。"""

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
ENV_DIR = ROOT / "src" / "assets" / "processed" / "environment"

SOURCE_FILES = {
    "ground": "battlefield-level2-ground.png",
    "rail": "battlefield-level2-rail.png",
    "boundary": "battlefield-level2-boundary.png",
}
BASE_COLORS = {
    "ground": (37, 40, 42),
    "rail": (36, 38, 41),
    "boundary": (26, 27, 29),
}

PALETTES = {
    "level_1": ((32, 37, 31), (103, 112, 90), (20, 24, 18)),
    "level_3": ((34, 35, 38), (201, 173, 101), (21, 21, 24)),
    "level_4": ((27, 34, 38), (78, 125, 132), (15, 20, 22)),
    "level_5": ((35, 38, 40), (214, 224, 220), (20, 22, 23)),
    "level_6": ((39, 37, 34), (176, 138, 68), (24, 22, 15)),
    "level_7": ((33, 32, 35), (156, 143, 124), (20, 19, 21)),
    "level_8": ((30, 36, 39), (127, 196, 205), (17, 22, 24)),
    "level_9": ((38, 29, 27), (210, 118, 47), (23, 15, 13)),
    "level_10": ((34, 26, 38), (178, 101, 196), (20, 14, 23)),
    "endless": ((32, 30, 34), (165, 77, 63), (18, 17, 21)),
}


def hex_color(value: int) -> tuple[int, int, int]:
    return ((value >> 16) & 0xFF, (value >> 8) & 0xFF, value & 0xFF)


def recolor(image: Image.Image, source: tuple[int, int, int], target: tuple[int, int, int]) -> Image.Image:
    out = image.convert("RGBA")
    pixels = out.load()
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = pixels[x, y]
            if a == 0:
                continue
            pixels[x, y] = (
                max(0, min(255, round(target[0] + (r - source[0]) * 0.82))),
                max(0, min(255, round(target[1] + (g - source[1]) * 0.82))),
                max(0, min(255, round(target[2] + (b - source[2]) * 0.82))),
                a,
            )
    return out


def main() -> None:
    masters = {
        layer: Image.open(ENV_DIR / filename).convert("RGBA")
        for layer, filename in SOURCE_FILES.items()
    }
    for theme, (ground, line, edge) in PALETTES.items():
        targets = {"ground": ground, "rail": line, "boundary": edge}
        for layer, image in masters.items():
            output = recolor(image, BASE_COLORS[layer], targets[layer])
            output.save(ENV_DIR / f"battlefield-{theme}-{layer}.png")


if __name__ == "__main__":
    main()
