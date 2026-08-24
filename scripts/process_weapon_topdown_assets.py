"""生成实机武器的俯视贴图（11 把）。

存在理由：`src/assets/processed/weapons/*.png` 是**侧视**素材。侧视枪画进俯视游戏，
下垂的弹匣、扳机护圈与握把在俯视空间里等于朝人物侧面横向支出，怎么对位都读成
「贴了一张侧面图」；而且握把必须靠人物的手完全盖住，反过来把武器缩放锁死
（手枪一度被压到 0.74 才藏得住握把）。俯视图从上往下看不到握把与弹匣，
这两个约束同时消失。

侧视图不动，继续供 HUD、战前整备、武器库与掉落物使用——图标位置侧视才是对的。

构图数据在 `scripts/weapon_topdown_specs.json`，绘制原语在 `scripts/lib_weapon_draw.py`。
配色取自各枪侧视图的实测主色，保住原有辨识色。

本管线的 spec 声明 `shadeModel: "perPart"`：重武器由直径不同的多个体串成，
逐部件柱面明暗才能让它们各自读成独立的体（取舍见 lib_weapon_draw 的模块文档串）。

用法（仓库自带 uv 虚拟环境已装 Pillow）：
  .venv/Scripts/python.exe scripts/process_weapon_topdown_assets.py
"""

from pathlib import Path

from PIL import Image

from lib_weapon_draw import build_weapon, load_specs


ROOT = Path(__file__).resolve().parents[1]
SPEC_PATH = ROOT / "scripts" / "weapon_topdown_specs.json"
OUTPUT_DIR = ROOT / "src" / "assets" / "processed" / "weapons" / "topdown"


def verify_anchors(weapon_id: str, image: Image.Image, grip_x: int, bore_y: int, muzzle_x: int) -> None:
    """复核三个标定点确实落在枪身上。

    这三件事原先只在 `TmpGenerate/assert-grip.mjs` 里一次性验过
    （见 docs/execution/2026-08-21-weapon-grip-alignment.md §6.3）。那份脚本是临时产物，
    而 spec 是会被继续改的——判据必须留在生成器里，否则下一次改 spec 时静默失效。

    `muzzleX` 只要求「枪膛线上是不透明像素」，不要求它等于最右列：喷火器的点火焰
    画在喷嘴之外，最右列是火焰而不是枪口。
    """
    pixels = image.load()
    width, height = image.size

    if not (0 <= muzzle_x < width and pixels[muzzle_x, bore_y][3] > 0):
        raise SystemExit(f"{weapon_id}: muzzleX={muzzle_x} 在枪膛线上不是枪身像素，子弹会凭空出现")
    if not 0 <= grip_x < width:
        raise SystemExit(f"{weapon_id}: gripX={grip_x} 超出画幅")
    if not any(pixels[grip_x, y][3] > 0 for y in range(bore_y, height)):
        raise SystemExit(f"{weapon_id}: gripX={grip_x} 在枪膛线以下没有枪身像素，那里不是握把")


def main() -> None:
    specs = load_specs(SPEC_PATH)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    print("粘贴到 src/systems/WeaponAssetManager.ts 的 WEAPON_GAMEPLAY_VISUALS：")
    for weapon_id, spec in specs.items():
        image, origin_x, axis_y = build_weapon(weapon_id, spec)
        grip_x = origin_x + spec["gripX"]
        muzzle_x = origin_x + spec["muzzleX"]
        verify_anchors(weapon_id, image, grip_x, axis_y, muzzle_x)
        image.save(OUTPUT_DIR / f"{weapon_id}.png")
        print(
            f"  {weapon_id:<13} {image.size[0]:>3}x{image.size[1]:<3}"
            f"  gripX: {grip_x}, boreY: {axis_y}, muzzleX: {muzzle_x}"
        )


if __name__ == "__main__":
    main()
