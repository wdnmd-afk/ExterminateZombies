"""重画三把重火力的侧视图标（加特林 / 金色 M249 / 火焰喷射器）。

存在理由：另外八把武器的侧视图是从 CC0 像素枪械表裁下来的真实美术
（`scripts/process_weapon_assets.py`），这三把在素材库里找不到可用的侧视原图，
必须自己画。上一版是 `scripts/process_heavy_weapon_assets.ps1` 用 GDI+ 的十来个
图元堆出来的，辨识度明显不足：加特林是一个黑箱子加几条横线，金色 M249 基本是
一团金色色块，火焰喷射器是圆圈加三角。武器库预览按 2.35 倍放大显示，这些缺陷
在那里最刺眼。

本脚本改用与俯视管线相同的部件语法与光影规则（`scripts/lib_weapon_draw.py`），
把三把枪画出枪托、握把、扳机护圈、供弹与枪管分节，与另外八把的信息密度对齐。

画幅锁定 132x48：`weaponLibrary.ts` 的预览缩放按枪写死，换画幅会改变显示大小。

素材署名不变：加特林仍取 Tiamalt 的 CC-BY 3.0 素材作型号参考，
火焰喷射器仍取 TheJosh 的 CC0 贴图作配色参考，金色 M249 仍为项目自绘。

用法（仓库自带 uv 虚拟环境已装 Pillow）：
  .venv/Scripts/python.exe scripts/process_heavy_weapon_profiles.py
"""

from pathlib import Path

from lib_weapon_draw import build_weapon, load_specs


ROOT = Path(__file__).resolve().parents[1]
SPEC_PATH = ROOT / "scripts" / "weapon_profile_specs.json"
OUTPUT_DIR = ROOT / "src" / "assets" / "processed" / "weapons"

# 图标画幅必须与上一版一致，否则武器库、HUD 槽位与掉落物的显示大小会跟着变。
EXPECTED_SIZE = (132, 48)


def main() -> None:
    specs = load_specs(SPEC_PATH)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    for weapon_id, spec in specs.items():
        image, _origin_x, _axis_y = build_weapon(weapon_id, spec)
        if image.size != EXPECTED_SIZE:
            raise SystemExit(
                f"{weapon_id}: 画幅 {image.size} 与既有图标尺寸 {EXPECTED_SIZE} 不一致，"
                "会改变武器库与 HUD 的显示大小"
            )
        image.save(OUTPUT_DIR / f"{weapon_id}.png")
        bbox = image.getbbox()
        print(f"  {weapon_id:<13} {image.size[0]}x{image.size[1]}  内容 bbox {bbox}")


if __name__ == "__main__":
    main()
