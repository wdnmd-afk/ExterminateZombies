from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "src" / "assets" / "processed" / "zombies"

SOURCES = {
    "crawler-strip.png": (
        ROOT
        / "src"
        / "assets"
        / "downloaded"
        / "characters"
        / "topdown-shooter-animated-64x64"
        / "topdown"
        / "zombie.gif"
    ),
    "stalker-strip.png": (
        ROOT
        / "src"
        / "assets"
        / "downloaded"
        / "zombies"
        / "freeart-topdown-zombies"
        / "ZombieWalk_normal_scaled_fast.gif"
    ),
    "oddity-strip.png": (
        ROOT
        / "src"
        / "assets"
        / "downloaded"
        / "zombies"
        / "freeart-topdown-zombies"
        / "ZombieWalk_odd_fast.gif"
    ),
}


def convert_gif_to_strip(source: Path, target: Path) -> tuple[int, int, int]:
    """按 GIF 原帧顺序生成透明横向帧条，不改变单帧像素。"""
    with Image.open(source) as image:
        frames: list[Image.Image] = []
        for frame_index in range(image.n_frames):
            image.seek(frame_index)
            frames.append(image.convert("RGBA"))

    frame_width, frame_height = frames[0].size
    if any(frame.size != (frame_width, frame_height) for frame in frames):
        raise ValueError(f"帧尺寸不一致：{source}")

    strip = Image.new("RGBA", (frame_width * len(frames), frame_height), (0, 0, 0, 0))
    for frame_index, frame in enumerate(frames):
        strip.paste(frame, (frame_index * frame_width, 0), frame)

    target.parent.mkdir(parents=True, exist_ok=True)
    strip.save(target, format="PNG", optimize=True)
    return frame_width, frame_height, len(frames)


def main() -> None:
    for output_name, source in SOURCES.items():
        if not source.exists():
            raise FileNotFoundError(f"缺少原始素材：{source}")
        width, height, frame_count = convert_gif_to_strip(source, OUTPUT_DIR / output_name)
        print(f"{output_name}: {frame_count} frames, {width}x{height}")


if __name__ == "__main__":
    main()
