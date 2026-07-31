from io import BytesIO
from pathlib import Path
from zipfile import ZipFile

from PIL import Image, ImageDraw, ImageEnhance, ImageOps


ROOT = Path(__file__).resolve().parents[1]
SOURCE_ROOT = ROOT / "src" / "assets" / "downloaded" / "environment"
OUTPUT_DIR = ROOT / "src" / "assets" / "processed" / "environment"

FREEART_ZIP = SOURCE_ROOT / "freeart-topdown-extras" / "freeart-topdown-extras.zip"
MEDICINE_SHEET = SOURCE_ROOT / "medicine-pack-16x16" / "medicine-pack.png"
AMMO_SOURCE = SOURCE_ROOT / "ammo-pack" / "ammo-pack.png"
EXPLOSIVE_SHEET = SOURCE_ROOT / "cc0-explosive-icons" / "explosive-icons.png"
ENDLESS_ZIP = (
    SOURCE_ROOT
    / "endless-midnight-zombie-swarm-assets"
    / "endless-midnight-images.zip"
)


def load_image(path: Path) -> Image.Image:
    if not path.exists():
        raise FileNotFoundError(f"缺少原始美术资源：{path}")
    with Image.open(path) as source:
        return source.convert("RGBA")


def load_zip_image(path: Path, member: str) -> Image.Image:
    if not path.exists():
        raise FileNotFoundError(f"缺少原始美术资源：{path}")
    with ZipFile(path) as archive:
        try:
            data = archive.read(member)
        except KeyError as error:
            raise FileNotFoundError(f"原始 ZIP 缺少文件：{member}") from error
    with Image.open(BytesIO(data)) as source:
        return source.convert("RGBA")


def trim_with_padding(image: Image.Image, padding: int = 2) -> Image.Image:
    rgba = image.convert("RGBA")
    bbox = rgba.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("处理后图片没有可见像素")
    content = rgba.crop(bbox)
    result = Image.new(
        "RGBA",
        (content.width + padding * 2, content.height + padding * 2),
        (0, 0, 0, 0),
    )
    result.paste(content, (padding, padding), content)
    return result


def fit_to_canvas(
    image: Image.Image,
    size: tuple[int, int],
    *,
    padding: int = 2,
    resample: Image.Resampling = Image.Resampling.LANCZOS,
) -> Image.Image:
    content = trim_with_padding(image, 0)
    content.thumbnail(
        (size[0] - padding * 2, size[1] - padding * 2),
        resample,
    )
    result = Image.new("RGBA", size, (0, 0, 0, 0))
    result.paste(
        content,
        ((size[0] - content.width) // 2, (size[1] - content.height) // 2),
        content,
    )
    return result


def colorize_with_alpha(
    image: Image.Image,
    black: tuple[int, int, int],
    white: tuple[int, int, int],
    *,
    original_blend: float = 0,
) -> Image.Image:
    rgba = image.convert("RGBA")
    alpha = rgba.getchannel("A")
    gray = ImageOps.autocontrast(ImageOps.grayscale(rgba))
    colored = ImageOps.colorize(gray, black, white).convert("RGBA")
    colored.putalpha(alpha)
    if original_blend <= 0:
        return colored
    return Image.blend(colored, rgba, original_blend)


def boost_alpha(image: Image.Image, factor: float) -> Image.Image:
    rgba = image.convert("RGBA")
    alpha = rgba.getchannel("A").point(lambda value: min(255, round(value * factor)))
    rgba.putalpha(alpha)
    return rgba


def create_oil_barrel() -> Image.Image:
    source = load_zip_image(FREEART_ZIP, "obj_barrel2.png")
    colored = colorize_with_alpha(
        source,
        (36, 19, 17),
        (188, 79, 43),
        original_blend=0.18,
    )
    return fit_to_canvas(ImageEnhance.Brightness(colored).enhance(0.8), (52, 48))


def create_flour_barrel() -> Image.Image:
    # 与油桶使用同一俯视桶体轮廓，只通过材质色区分，避免缩小后像独立圆形图标。
    source = load_zip_image(FREEART_ZIP, "obj_barrel2.png")
    colored = colorize_with_alpha(
        source,
        (45, 42, 35),
        (223, 216, 185),
        original_blend=0.04,
    )
    return fit_to_canvas(ImageEnhance.Brightness(colored).enhance(0.9), (52, 48))


def create_mine() -> Image.Image:
    sheet = load_image(EXPLOSIVE_SHEET)
    source = sheet.crop((96, 32, 128, 64))
    colored = colorize_with_alpha(source, (17, 24, 20), (132, 147, 112))
    flattened = colored.resize((40, 32), Image.Resampling.NEAREST)
    result = fit_to_canvas(
        flattened,
        (46, 38),
        padding=3,
        resample=Image.Resampling.NEAREST,
    )
    # 状态灯是地雷与普通灰色杂物的关键区分，不改变原始轮廓。
    ImageDraw.Draw(result).ellipse((20, 16, 25, 21), fill=(211, 60, 41, 255))
    return result


def create_ammo_pickup() -> Image.Image:
    source = load_image(AMMO_SOURCE).resize((64, 64), Image.Resampling.NEAREST)
    colored = ImageEnhance.Color(source).enhance(0.7)
    colored = ImageEnhance.Brightness(colored).enhance(0.82)
    return fit_to_canvas(
        colored,
        (42, 42),
        padding=3,
        resample=Image.Resampling.NEAREST,
    )


def create_health_pickup() -> Image.Image:
    source = load_image(MEDICINE_SHEET).crop((32, 0, 48, 16))
    source = source.resize((32, 32), Image.Resampling.NEAREST)
    return fit_to_canvas(
        source,
        (38, 38),
        padding=3,
        resample=Image.Resampling.NEAREST,
    )


def create_enhancement_pickup() -> Image.Image:
    source = load_image(MEDICINE_SHEET).crop((32, 32, 48, 48))
    source = source.resize((32, 32), Image.Resampling.NEAREST)
    pixels = source.load()
    for y in range(source.height):
        for x in range(source.width):
            red, green, blue, alpha = pixels[x, y]
            if alpha and red > 130 and red > green * 1.35:
                luminance = (red + green + blue) // 3
                pixels[x, y] = (
                    45,
                    130 + luminance // 3,
                    178 + luminance // 4,
                    alpha,
                )
    return fit_to_canvas(
        source,
        (38, 38),
        padding=3,
        resample=Image.Resampling.NEAREST,
    )


def create_friendly_bullet() -> Image.Image:
    source = load_zip_image(ENDLESS_ZIP, "Images/Guns/BulletTrail.png")
    colored = colorize_with_alpha(source, (99, 55, 8), (255, 244, 176))
    return fit_to_canvas(boost_alpha(colored, 2.2), (32, 16))


def create_explosive_bullet() -> Image.Image:
    source = load_zip_image(ENDLESS_ZIP, "Images/Guns/Rocket.png")
    colored = ImageEnhance.Color(source).enhance(0.65)
    return fit_to_canvas(colored, (56, 24))


def create_enemy_bullet() -> Image.Image:
    source = load_zip_image(ENDLESS_ZIP, "Images/Guns/BulletTrail.png")
    colored = colorize_with_alpha(source, (13, 60, 48), (142, 255, 202))
    return fit_to_canvas(boost_alpha(colored, 2), (28, 18))


def upscale_pixel_art(image: Image.Image, scale: int = 2) -> Image.Image:
    return image.resize(
        (image.width * scale, image.height * scale),
        Image.Resampling.NEAREST,
    )


def create_container() -> Image.Image:
    image = Image.new("RGBA", (82, 34), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.rectangle((3, 5, 80, 32), fill=(13, 16, 18, 90))
    draw.rectangle((1, 2, 78, 29), fill=(55, 37, 29, 255))
    draw.rectangle((3, 4, 76, 27), fill=(188, 76, 43, 255))
    draw.rectangle((3, 4, 76, 7), fill=(224, 113, 63, 255))
    draw.rectangle((3, 25, 76, 27), fill=(121, 48, 31, 255))
    for x in range(8, 75, 7):
        draw.rectangle((x, 8, x + 1, 24), fill=(139, 53, 34, 255))
        draw.point((x + 2, 10), fill=(235, 127, 73, 190))
    draw.rectangle((1, 2, 78, 29), outline=(24, 22, 23, 255), width=2)
    return upscale_pixel_art(image)


def create_truck() -> Image.Image:
    image = Image.new("RGBA", (88, 42), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    for x in (10, 62):
        draw.rectangle((x, 1, x + 12, 5), fill=(20, 22, 23, 255))
        draw.rectangle((x, 36, x + 12, 40), fill=(20, 22, 23, 255))
    draw.rectangle((4, 6, 84, 37), fill=(10, 12, 13, 90))
    draw.rectangle((2, 4, 58, 34), fill=(66, 74, 76, 255))
    draw.rectangle((5, 7, 54, 31), fill=(92, 99, 99, 255))
    draw.rectangle((10, 10, 50, 28), fill=(52, 59, 61, 255))
    for x in range(14, 49, 8):
        draw.line((x, 11, x, 27), fill=(109, 115, 113, 255), width=1)
    draw.polygon(
        [(58, 6), (77, 8), (85, 15), (85, 29), (77, 34), (58, 35)],
        fill=(84, 98, 101, 255),
    )
    draw.polygon(
        [(63, 10), (76, 11), (81, 16), (63, 16)],
        fill=(125, 162, 170, 255),
    )
    draw.polygon(
        [(63, 23), (81, 23), (76, 31), (63, 31)],
        fill=(44, 58, 62, 255),
    )
    draw.rectangle((84, 16, 87, 27), fill=(35, 39, 40, 255))
    draw.rectangle((2, 4, 58, 34), outline=(24, 24, 25, 255), width=2)
    draw.point((25, 8), fill=(162, 85, 44, 255))
    draw.rectangle((45, 27, 50, 30), fill=(135, 70, 40, 255))
    return upscale_pixel_art(image)


def create_wall() -> Image.Image:
    image = Image.new("RGBA", (82, 25), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.rectangle((3, 5, 80, 23), fill=(10, 12, 13, 90))
    draw.rectangle((1, 2, 78, 20), fill=(95, 102, 104, 255))
    draw.rectangle((2, 3, 77, 7), fill=(144, 151, 151, 255))
    draw.line((2, 12, 77, 12), fill=(63, 68, 70, 255), width=1)
    for x in range(12, 78, 16):
        draw.line((x, 3, x, 11), fill=(70, 76, 78, 255), width=1)
    for x in range(5, 78, 16):
        draw.line((x, 13, x, 19), fill=(70, 76, 78, 255), width=1)
    draw.line((55, 8, 51, 13, 56, 18), fill=(48, 53, 55, 255), width=1)
    draw.rectangle((1, 2, 78, 20), outline=(24, 25, 26, 255), width=2)
    return upscale_pixel_art(image)


def save_image(image: Image.Image, target: Path) -> None:
    rgba = image.convert("RGBA")
    if rgba.getchannel("A").getbbox() is None:
        raise ValueError(f"运行时素材没有可见像素：{target.name}")
    corners = [
        rgba.getpixel((0, 0))[3],
        rgba.getpixel((rgba.width - 1, 0))[3],
        rgba.getpixel((0, rgba.height - 1))[3],
        rgba.getpixel((rgba.width - 1, rgba.height - 1))[3],
    ]
    if any(corners):
        raise ValueError(f"透明边角校验失败：{target.name}")

    target.parent.mkdir(parents=True, exist_ok=True)
    rgba.save(target, format="PNG", optimize=True)
    print(f"{target.name}: {rgba.width}x{rgba.height}")


def main() -> None:
    generated = {
        "obstacle-container.png": create_container(),
        "obstacle-truck.png": create_truck(),
        "obstacle-wall.png": create_wall(),
        "prop-oil-barrel.png": create_oil_barrel(),
        "prop-flour-barrel.png": create_flour_barrel(),
        "prop-mine.png": create_mine(),
        "pickup-ammo.png": create_ammo_pickup(),
        "pickup-health.png": create_health_pickup(),
        "pickup-enhancement.png": create_enhancement_pickup(),
        "bullet-friendly.png": create_friendly_bullet(),
        "bullet-explosive.png": create_explosive_bullet(),
        "bullet-enemy.png": create_enemy_bullet(),
    }
    for output_name, image in generated.items():
        save_image(image, OUTPUT_DIR / output_name)


if __name__ == "__main__":
    main()
