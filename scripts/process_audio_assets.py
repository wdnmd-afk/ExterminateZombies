"""从已归档的开放授权音频中生成运行时文件。"""

from __future__ import annotations

import io
import hashlib
import shutil
import wave
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE_ROOT = ROOT / "src" / "assets" / "downloaded" / "audio"
OUTPUT_ROOT = ROOT / "src" / "assets" / "processed" / "audio"


def ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def copy_file(source: Path, destination: Path) -> None:
    if not source.is_file():
        raise FileNotFoundError(f"缺少音频源文件：{source}")
    ensure_parent(destination)
    shutil.copyfile(source, destination)


def extract_file(archive: Path, member: str, destination: Path) -> None:
    if not archive.is_file():
        raise FileNotFoundError(f"缺少音频源压缩包：{archive}")
    ensure_parent(destination)
    with zipfile.ZipFile(archive) as package:
        try:
            data = package.read(member)
        except KeyError as error:
            raise FileNotFoundError(f"压缩包 {archive.name} 中缺少 {member}") from error
    destination.write_bytes(data)


def slice_wav_from_zip(
    archive: Path,
    member: str,
    segments: list[tuple[str, float, float]],
    destination_dir: Path,
) -> None:
    """按固定秒数裁切连续枪声，保证每次游戏开火只播放一发。"""

    if not archive.is_file():
        raise FileNotFoundError(f"缺少音频源压缩包：{archive}")
    with zipfile.ZipFile(archive) as package:
        try:
            source_bytes = package.read(member)
        except KeyError as error:
            raise FileNotFoundError(f"压缩包 {archive.name} 中缺少 {member}") from error

    with wave.open(io.BytesIO(source_bytes), "rb") as source:
        channels = source.getnchannels()
        sample_width = source.getsampwidth()
        frame_rate = source.getframerate()
        compression_type = source.getcomptype()
        compression_name = source.getcompname()
        frame_count = source.getnframes()
        frames = source.readframes(frame_count)

    bytes_per_frame = channels * sample_width
    duration = frame_count / frame_rate
    destination_dir.mkdir(parents=True, exist_ok=True)

    for filename, start_seconds, end_seconds in segments:
        if start_seconds < 0 or end_seconds <= start_seconds or end_seconds > duration + 0.01:
            raise ValueError(
                f"{member} 的裁切区间无效：{start_seconds:.3f}-{end_seconds:.3f}，"
                f"源时长 {duration:.3f}",
            )
        start_frame = round(start_seconds * frame_rate)
        end_frame = min(frame_count, round(end_seconds * frame_rate))
        clip = frames[start_frame * bytes_per_frame : end_frame * bytes_per_frame]
        destination = destination_dir / filename
        with wave.open(str(destination), "wb") as output:
            output.setnchannels(channels)
            output.setsampwidth(sample_width)
            output.setframerate(frame_rate)
            output.setcomptype(compression_type, compression_name)
            output.writeframes(clip)


def process_firearms() -> None:
    archive = SOURCE_ROOT / "gunshot-sounds" / "original.zip"

    slice_wav_from_zip(
        archive,
        "sounds/cz.wav",
        [
            ("firearm-cz-01.wav", 0.15, 1.45),
            ("firearm-cz-02.wav", 2.75, 3.85),
            ("firearm-cz-03.wav", 3.98, 4.78),
            ("firearm-cz-04.wav", 5.47, 6.35),
        ],
        OUTPUT_ROOT / "weapons",
    )
    slice_wav_from_zip(
        archive,
        "sounds/sks.wav",
        [
            ("firearm-sks-01.wav", 0.27, 1.50),
            ("firearm-sks-02.wav", 2.22, 3.22),
            ("firearm-sks-03.wav", 5.93, 6.96),
            ("firearm-sks-04.wav", 7.63, 8.83),
        ],
        OUTPUT_ROOT / "weapons",
    )
    slice_wav_from_zip(
        archive,
        "sounds/mosin.wav",
        [
            ("firearm-mosin-01.wav", 0.36, 1.95),
            ("firearm-mosin-02.wav", 3.49, 5.05),
            ("firearm-mosin-03.wav", 5.91, 7.45),
        ],
        OUTPUT_ROOT / "weapons",
    )
    slice_wav_from_zip(
        archive,
        "sounds/shotty.wav",
        [("firearm-shotgun-01.wav", 0.00, 0.69)],
        OUTPUT_ROOT / "weapons",
    )


def process_zip_selections() -> None:
    common_archive = SOURCE_ROOT / "100-cc0-sfx" / "original.zip"
    common_files = {
        "hit_01.ogg": "combat/flesh-hit-01.ogg",
        "hit_02.ogg": "combat/flesh-hit-02.ogg",
        "hit_03.ogg": "combat/flesh-hit-03.ogg",
        "metal_01.ogg": "combat/metal-hit-01.ogg",
        "metal_04.ogg": "combat/metal-hit-02.ogg",
        "metal_07.ogg": "combat/metal-hit-03.ogg",
        "explosion.ogg": "combat/explosion-01.ogg",
        "noise_01.ogg": "combat/dust-burst-01.ogg",
        "bell_01.ogg": "ui/pickup-01.ogg",
        "gong_01.ogg": "ui/wave-01.ogg",
        "shot_01.ogg": "weapons/launcher-rpg-01.ogg",
        "plop_01.ogg": "weapons/launcher-m79-01.ogg",
        "switch_01.ogg": "weapons/empty-01.ogg",
        "switch_02.ogg": "weapons/switch-01.ogg",
    }
    for member, relative_destination in common_files.items():
        extract_file(common_archive, member, OUTPUT_ROOT / relative_destination)

    interface_archive = SOURCE_ROOT / "kenney-interface-sounds" / "original.zip"
    interface_files = {
        "Audio/select_001.ogg": "ui/move-01.ogg",
        "Audio/select_002.ogg": "ui/move-02.ogg",
        "Audio/confirmation_001.ogg": "ui/confirm-01.ogg",
        "Audio/confirmation_002.ogg": "ui/confirm-02.ogg",
        "Audio/error_007.ogg": "ui/boss-alert-01.ogg",
    }
    for member, relative_destination in interface_files.items():
        extract_file(interface_archive, member, OUTPUT_ROOT / relative_destination)

    zombie_archive = SOURCE_ROOT / "zombies-sound-pack" / "original.zip"
    zombie_files = {
        "zombies/zombie-1.wav": "characters/zombie-attack-01.wav",
        "zombies/zombie-5.wav": "characters/zombie-attack-02.wav",
        "zombies/zombie-10.wav": "characters/zombie-attack-03.wav",
        "zombies/zombie-16.wav": "characters/zombie-death-01.wav",
        "zombies/zombie-17.wav": "characters/zombie-death-02.wav",
        "zombies/zombie-18.wav": "characters/zombie-death-03.wav",
    }
    for member, relative_destination in zombie_files.items():
        extract_file(zombie_archive, member, OUTPUT_ROOT / relative_destination)


def process_direct_files() -> None:
    direct_files = {
        "gun-reload-sounds/gunreload1.wav": "weapons/reload-pistol.wav",
        "gun-reload-sounds/assaultriflereload1.wav": "weapons/reload-rifle.wav",
        "gun-reload-sounds/shotguncock.wav": "weapons/reload-shotgun.wav",
        "hurt-sound-effects/hurt_01.mp3": "characters/player-hurt-01.mp3",
        "hurt-sound-effects/hurt_02.mp3": "characters/player-hurt-02.mp3",
        "hurt-sound-effects/hurt_03.mp3": "characters/player-hurt-03.mp3",
        "fire-crackling/fire-1.ogg": "world/fire-loop.ogg",
        "empty-city/EmptyCity.ogg": "music/menu.ogg",
        "fast-fight-battle/fight_looped.wav": "music/battle.wav",
    }
    for relative_source, relative_destination in direct_files.items():
        copy_file(SOURCE_ROOT / relative_source, OUTPUT_ROOT / relative_destination)


def main() -> None:
    process_firearms()
    process_zip_selections()
    process_direct_files()
    audio_outputs = sorted(
        path for path in OUTPUT_ROOT.rglob("*")
        if path.is_file() and path.name != "SHA256SUMS"
    )
    checksum_lines = [
        f"{hashlib.sha256(path.read_bytes()).hexdigest()}  {path.relative_to(OUTPUT_ROOT).as_posix()}"
        for path in audio_outputs
    ]
    with (OUTPUT_ROOT / "SHA256SUMS").open("w", encoding="utf-8", newline="\n") as checksum_file:
        checksum_file.write("\n".join(checksum_lines) + "\n")
    outputs = sorted(path.relative_to(ROOT).as_posix() for path in OUTPUT_ROOT.rglob("*") if path.is_file())
    print(f"已生成 {len(outputs)} 个运行时音频文件：")
    for output in outputs:
        print(f"- {output}")


if __name__ == "__main__":
    main()
