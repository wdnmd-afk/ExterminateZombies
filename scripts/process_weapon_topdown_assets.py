"""生成实机武器的俯视贴图（11 把）。

存在理由：`src/assets/processed/weapons/*.png` 是**侧视**素材。侧视枪画进俯视游戏，
下垂的弹匣、扳机护圈与握把在俯视空间里等于朝人物侧面横向支出，怎么对位都读成
「贴了一张侧面图」；而且握把必须靠人物的手完全盖住，反过来把武器缩放锁死
（手枪一度被压到 0.74 才藏得住握把）。俯视图从上往下看不到握把与弹匣，
这两个约束同时消失。

侧视图不动，继续供 HUD、战前整备、武器库与掉落物使用——图标位置侧视才是对的。

构图数据在 `scripts/weapon_topdown_specs.json`，绘制原语在 `scripts/lib_weapon_draw.py`。
配色取自各枪侧视图的实测主色，保住原有辨识色。

用法（仓库自带 uv 虚拟环境已装 Pillow）：
  .venv/Scripts/python.exe scripts/process_weapon_topdown_assets.py
"""

from pathlib import Path

from lib_weapon_draw import build_weapon, load_specs


ROOT = Path(__file__).resolve().parents[1]
SPEC_PATH = ROOT / "scripts" / "weapon_topdown_specs.json"
OUTPUT_DIR = ROOT / "src" / "assets" / "processed" / "weapons" / "topdown"


def main() -> None:
    specs = load_specs(SPEC_PATH)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    print("粘贴到 src/systems/WeaponAssetManager.ts 的 WEAPON_GAMEPLAY_VISUALS：")
    for weapon_id, spec in specs.items():
        image, origin_x, axis_y = build_weapon(weapon_id, spec)
        image.save(OUTPUT_DIR / f"{weapon_id}.png")
        print(
            f"  {weapon_id:<13} {image.size[0]:>3}x{image.size[1]:<3}"
            f"  gripX: {origin_x + spec['gripX']}, boreY: {axis_y},"
            f" muzzleX: {origin_x + spec['muzzleX']}"
        )


if __name__ == "__main__":
    main()
