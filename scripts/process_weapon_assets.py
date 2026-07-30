from collections import Counter, deque
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "src" / "assets" / "processed" / "weapons"
GUN_SHEET = (
    ROOT
    / "src"
    / "assets"
    / "downloaded"
    / "weapons"
    / "pixel-art-guns-128x128"
    / "spritesheet-guns.png"
)
DESERT_EAGLE_SOURCE = (
    ROOT
    / "src"
    / "assets"
    / "downloaded"
    / "weapons"
    / "486-shotgun-desert-eagle"
    / "486_parallelo.png"
)

GUN_CROPS = {
    "shotgun.png": (8, (2, 18, 124, 78)),
    "smg.png": (9, (0, 18, 128, 80)),
    "rifle.png": (15, (0, 16, 128, 72)),
    "ak47.png": (16, (0, 16, 128, 74)),
    "barrett.png": (22, (0, 16, 128, 70)),
    "rpg.png": (23, (0, 18, 128, 76)),
    "m79.png": (24, (0, 12, 128, 94)),
}


def close_to(color: tuple[int, int, int, int], background: tuple[int, int, int], tolerance: int = 6) -> bool:
    return all(abs(color[channel] - background[channel]) <= tolerance for channel in range(3))


def remove_connected_background(image: Image.Image) -> Image.Image:
    """删除裁剪单元格的纯色背景。

    背景色取整块裁剪区域的最高频不透明色——裁剪框可能切到枪体，
    所以不能改用边界采样，否则会把枪身灰误判成背景整片抹掉。

    先按边界洪泛清除枪体外部背景，再清除扳机护圈、提把下方、准星缺口
    等被枪体围住、洪泛到不了的同色像素：这些同样是镂空，必须透出地面。
    """
    rgba = image.convert("RGBA")
    pixels = rgba.load()
    width, height = rgba.size
    opaque_colors = Counter(
        pixels[x, y][:3]
        for y in range(height)
        for x in range(width)
        if pixels[x, y][3] > 0
    )
    if not opaque_colors:
        raise ValueError("裁剪区域没有不透明像素")
    background = opaque_colors.most_common(1)[0][0]
    queue: deque[tuple[int, int]] = deque()
    visited: set[tuple[int, int]] = set()

    for x in range(width):
        queue.append((x, 0))
        queue.append((x, height - 1))
    for y in range(height):
        queue.append((0, y))
        queue.append((width - 1, y))

    while queue:
        x, y = queue.popleft()
        if (x, y) in visited:
            continue
        visited.add((x, y))
        pixel = pixels[x, y]
        if pixel[3] > 0 and not close_to(pixel, background):
            continue
        red, green, blue, _alpha = pixel
        pixels[x, y] = (red, green, blue, 0)
        if x > 0:
            queue.append((x - 1, y))
        if x + 1 < width:
            queue.append((x + 1, y))
        if y > 0:
            queue.append((x, y - 1))
        if y + 1 < height:
            queue.append((x, y + 1))

    enclosed = 0
    for y in range(height):
        for x in range(width):
            pixel = pixels[x, y]
            if pixel[3] > 0 and close_to(pixel, background):
                pixels[x, y] = (pixel[0], pixel[1], pixel[2], 0)
                enclosed += 1
    if enclosed:
        print(f"  enclosed holes cleared: {enclosed}")

    return trim_with_padding(rgba)


def trim_with_padding(image: Image.Image, padding: int = 2) -> Image.Image:
    bbox = image.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("处理后图片没有可见像素")
    content = image.crop(bbox)
    result = Image.new(
        "RGBA",
        (content.width + padding * 2, content.height + padding * 2),
        (0, 0, 0, 0),
    )
    result.paste(content, (padding, padding), content)
    return result


def save_image(image: Image.Image, target: Path) -> None:
    alpha = image.getchannel("A")
    corners = [
        alpha.getpixel((0, 0)),
        alpha.getpixel((image.width - 1, 0)),
        alpha.getpixel((0, image.height - 1)),
        alpha.getpixel((image.width - 1, image.height - 1)),
    ]
    if any(corners):
        raise ValueError(f"透明边角校验失败：{target.name}")
    if alpha.getbbox() is None:
        raise ValueError(f"武器没有可见像素：{target.name}")

    target.parent.mkdir(parents=True, exist_ok=True)
    image.save(target, format="PNG", optimize=True)
    print(f"{target.name}: {image.width}x{image.height}")


def main() -> None:
    if not GUN_SHEET.exists():
        raise FileNotFoundError(f"缺少枪械表：{GUN_SHEET}")
    if not DESERT_EAGLE_SOURCE.exists():
        raise FileNotFoundError(f"缺少沙漠之鹰素材：{DESERT_EAGLE_SOURCE}")

    with Image.open(GUN_SHEET) as sheet_source:
        sheet = sheet_source.convert("RGBA")
        for output_name, (frame_index, crop) in GUN_CROPS.items():
            column = frame_index % 5
            row = frame_index // 5
            x, y, width, height = crop
            frame = sheet.crop(
                (
                    column * 128 + x,
                    row * 128 + y,
                    column * 128 + x + width,
                    row * 128 + y + height,
                )
            )
            save_image(remove_connected_background(frame), OUTPUT_DIR / output_name)

    with Image.open(DESERT_EAGLE_SOURCE) as pistol_source:
        pistol = pistol_source.convert("RGBA").crop((62, 2, 98, 30))
        save_image(trim_with_padding(pistol), OUTPUT_DIR / "pistol.png")


if __name__ == "__main__":
    main()
