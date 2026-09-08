"""生成战斗静态粒子位图；只使用确定性像素绘制，不依赖外部素材或网络。"""

from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "src" / "assets" / "processed" / "effects"


def blood_particle() -> Image.Image:
    image = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.polygon(
        [(3, 7), (5, 4), (10, 3), (13, 6), (12, 10), (8, 12), (4, 11)],
        fill=(142, 27, 24, 245),
    )
    draw.rectangle((6, 5, 9, 9), fill=(190, 45, 30, 245))
    draw.point((4, 8), fill=(236, 92, 54, 230))
    draw.point((11, 6), fill=(91, 18, 20, 245))
    return image


def spark_particle() -> Image.Image:
    image = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.rectangle((7, 1, 8, 14), fill=(255, 242, 186, 250))
    draw.rectangle((1, 7, 14, 8), fill=(255, 173, 62, 240))
    draw.point((4, 4), fill=(255, 210, 92, 235))
    draw.point((11, 11), fill=(255, 119, 38, 225))
    draw.point((3, 12), fill=(255, 242, 186, 220))
    draw.point((12, 3), fill=(255, 119, 38, 220))
    return image


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    blood_particle().save(OUTPUT / "blood-particle.png")
    spark_particle().save(OUTPUT / "spark-particle.png")


if __name__ == "__main__":
    main()
