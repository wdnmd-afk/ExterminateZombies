"""程序化绘制侧视武器图标（原为三把重火力，现兼作新增武器的侧视产线）。

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

2026-08-26 追加：第二批六把武器（M16A4 / AA-12 / 双持乌兹 / 特斯拉 / 磁轨炮 / 冷冻喷射器）
同样在素材库里没有可用侧视原图，因此复用本脚本的部件语法产出。它们与那三把的处境相同，
不必再开第三条管线。

用法（仓库自带 uv 虚拟环境已装 Pillow）：
  # 只产出指定武器（新增武器用这条，不会碰到已有文件）
  .venv/Scripts/python.exe scripts/process_heavy_weapon_profiles.py m16a4 aa12
  # 产出全部（会覆盖三把重火力的 AI 生成图标，必须显式 --force）
  .venv/Scripts/python.exe scripts/process_heavy_weapon_profiles.py --force
"""

import sys
from pathlib import Path

from lib_weapon_draw import build_weapon, load_specs


ROOT = Path(__file__).resolve().parents[1]
SPEC_PATH = ROOT / "scripts" / "weapon_profile_specs.json"
OUTPUT_DIR = ROOT / "src" / "assets" / "processed" / "weapons"

# 图标画幅必须与上一版一致，否则武器库、HUD 槽位与掉落物的显示大小会跟着变。
EXPECTED_SIZE = (132, 48)


# 由 AI 生图管线接管的武器。整体重跑会把它们的生成图标覆盖回程序化版本，
# 因此只有显式 --force 才允许写这三个文件（历史上静默覆盖过一次）。
AI_PIPELINE_OWNED = {"gatling", "golden_m249", "flamethrower"}


def main() -> None:
    args = sys.argv[1:]
    force = "--force" in args
    requested = [arg for arg in args if not arg.startswith("--")]

    specs = load_specs(SPEC_PATH)
    if requested:
        unknown = [weapon_id for weapon_id in requested if weapon_id not in specs]
        if unknown:
            raise SystemExit(f"未知武器 id：{', '.join(unknown)}")
        # 指定了 id 就只画这些。落在 AI 管线名下的仍需 --force，
        # 否则「只重画加特林」这种命令会绕过上面那道闸门。
        guarded = [weapon_id for weapon_id in requested if weapon_id in AI_PIPELINE_OWNED]
        if guarded and not force:
            raise SystemExit(
                f"{', '.join(guarded)} 的侧视图标由 AI 生图管线产出"
                "（npm run assets:weapons-side-generate / -inspect / assets:weapons-side，"
                "规格见 scripts/weapon_side_specs.json）。"
                "程序化重画会覆盖生成图标，确认要这么做请加 --force。"
            )
        targets = requested
    elif force:
        targets = list(specs)
    else:
        print(
            "未指定武器 id。三把重火力（gatling / golden_m249 / flamethrower）的侧视图标\n"
            "自 2026-08-23 改由 AI 生图管线产出，整体重跑会把它们覆盖回程序化版本。\n"
            "  只画新增武器：  process_heavy_weapon_profiles.py m16a4 aa12 ...\n"
            "  确实要全量重画：process_heavy_weapon_profiles.py --force",
        )
        return

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    for weapon_id in targets:
        spec = specs[weapon_id]
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
