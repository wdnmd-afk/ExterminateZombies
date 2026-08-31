"""把四种新增战术道具的**俯视**图标候选处理成运行时产物。

存在理由见 scripts/prop_item_specs.json 的 _note：燃烧瓶 / 粉尘罐 / 高爆包 / 冷冻罐
四件道具此前只有 items.ts 里的数据与一个 `color` 占位，没有贴图；而
config/environmentTextures.ts 已经把四个纹理键登记进 PROP_TEXTURE_KEYS，
entities/Prop.ts 也已经在 setTexture 它们。缺的就是这一步产物。

与 process_weapon_side_assets.py 的分工差异（有意为之，不是漏写）：
武器管线拆成 inspect_ + process_ 两个脚本，因为侧视枪有一条「朝向可能画反」的判据，
那需要在采用前反复看单张候选的诊断数字。道具没有朝向问题（严格俯视，没有左右），
判据只剩宽高比 / 填充率 / 洋红残留 / 连通域四条纯几何量，一次跑完就能定论。
所以这里合成一个脚本，用 --inspect-only 提供「只检视不落盘」的等价能力。

管线五步，前四步与武器侧视同源（复用同一批函数，避免两套判据漂移），第五步是本文件独有：

  1. 键控     复用 inspect_weapon_side_candidates.key_out。上游偶尔直接返回带 alpha
              的图而不是洋红底，所以先判后键。
  2. 中和残留 复用 process_weapon_side_assets.neutralize_residual_magenta。四种道具的
              配色里没有任何合法的紫（琥珀 / 灰白 / 暗红 / 青蓝），可以无条件钳。
  3. 门控     四条几何判据，全部通过才允许落盘。任一不过就报告并跳过该道具，
              不写半成品到运行时目录。
  4. 降采样   复用 process_weapon_side_assets.downsample_premultiplied。预乘后再
              LANCZOS，否则透明区的 RGB 会按权重混进边缘，产出一圈脏边。
  5. 落幅     **按原宽高比 letterbox 进共用的 46x38**，不是拉伸填满。这一步是本文件
              最容易写错的地方：entities/Prop.ts 的 applyVisual 是直接 setDisplaySize
              (radius * 2.6, radius * 2.15)，比值恒为 46/38。若四张产物画幅不一致、
              或主体被拉伸到铺满画幅，实机表现是贴图被拉扁——而且不报任何错。
              画幅与 prop-mine.png 一致（46x38，主体 32x32 居中留白），
              这样四件新道具与既有地雷在同一张战场上体量口径一致。

用法（Pillow 装在 D:\\py\\python.exe；仓库没有 .venv）：
  npm run assets:props -- all                       # 落盘
  npm run assets:props-inspect -- all               # 只检视
  python scripts/process_prop_item_assets.py demo_charge --version v01 --inspect-only

经 npm 只能传位置参数：npm 会吞掉 `--` 之后的全部 flag（理由见 main 里的注释），
所以 --inspect-only 由 assets:props-inspect 这个独立入口写死，--version 只能直接调 python。
"""

import argparse
import json
import sys
import warnings
from pathlib import Path

from PIL import Image

warnings.filterwarnings("ignore", message=r".*getdata is deprecated.*", category=DeprecationWarning)

# Windows 控制台默认按 GBK 编码 stdout，遇到诊断里的 `px²`（U+00B2）会直接抛
# UnicodeEncodeError，把整个处理流程在打印阶段中断——图已经算完了，却一张都没落盘。
# 兄弟脚本（inspect_weapon_side_candidates.py 等）也打印同样的字符，同样会崩，
# 只是此前一直在能编码的终端里跑，没暴露出来。这里就地重配，不依赖外部 PYTHONIOENCODING。
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

sys.path.insert(0, str(Path(__file__).resolve().parent))

from inspect_weapon_side_candidates import (  # noqa: E402
    count_components,
    count_magenta_residue,
    key_out,
)
from process_weapon_side_assets import (  # noqa: E402
    downsample_premultiplied,
    neutralize_residual_magenta,
)
from process_zombie_sprites import alpha_bbox  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
TEMP_DIR = ROOT / "TmpGenerate"
SPEC_PATH = ROOT / "scripts" / "prop_item_specs.json"
OUTPUT_DIR = ROOT / "src" / "assets" / "processed" / "environment"


def candidate_path(spec: dict, version: str) -> Path:
    """候选文件名。

    注意与武器管线**不同**：那边是 `{slug}-icon-{version}.png`，这里没有 `-icon-` 段，
    因为 generate_prop_item_assets.mjs 写出的是 `{slug}-v01.png`。命名对不上的表现是
    「候选明明在 TmpGenerate 里却报缺少文件」。
    """
    return TEMP_DIR / f"{spec['candidateSlug']}-{version}.png"


def output_name(item_id: str) -> str:
    """运行时产物文件名。

    与 PROP_TEXTURE_KEYS 的键同源但不同形：纹理键是 snake_case 的 itemId
    （firebomb / dust_canister），产物沿用既有三张 prop-*.png 的 kebab-case 命名，
    因为 PreloadScene 的 import 路径要和 prop-oil-barrel.png 那批看起来是一家。
    """
    return f"prop-{item_id.replace('_', '-')}.png"


def gate(item_id: str, spec: dict, shared: dict, keyed: Image.Image,
         bbox: tuple[int, int, int, int]) -> list[str]:
    """四条几何判据。返回失败原因列表，空列表表示可采用。

    每条都对应一种真实会发生、且目视不一定当场看出来的缺陷；判据本身的取值理由
    写在 prop_item_specs.json 的 _aspectNote / _fillNote 里，不在这里重复。
    """
    left, top, right, bottom = bbox
    subject_w = right - left
    subject_h = bottom - top
    failures = []

    aspect = subject_w / max(1, subject_h)
    ok = spec["aspectMin"] <= aspect <= spec["aspectMax"]
    print(f"    主体 {subject_w}x{subject_h}  宽高比 {aspect:.3f}"
          f"  区间 {spec['aspectMin']}~{spec['aspectMax']}  {'ok' if ok else '失败'}")
    if not ok:
        failures.append(f"宽高比 {aspect:.3f} 越界")

    # 填充率按主体外框算而不是按画幅：模型对「主体占画幅百分之多少」的服从度一般，
    # 但外框内的填充率反映的是造型实不实，那才是降到 42px 后能否读清的决定因素。
    alpha_hist = keyed.crop(bbox).getchannel("A").histogram()
    opaque = sum(alpha_hist[32:])
    fill = opaque / max(1, subject_w * subject_h)
    ok = shared["fillMin"] <= fill <= shared["fillMax"]
    print(f"    外框填充率 {fill:.3f}  区间 {shared['fillMin']}~{shared['fillMax']}"
          f"  {'ok' if ok else '失败'}")
    if not ok:
        failures.append(f"填充率 {fill:.3f} 越界")

    residue = count_magenta_residue(keyed, shared)
    ratio = residue / max(1, opaque)
    ok = ratio <= shared["sourceResidueRatioMax"]
    print(f"    洋红残留 {residue} px = 主体 {ratio:.5f}"
          f"  上限 {shared['sourceResidueRatioMax']}  {'ok' if ok else '失败'}")
    if not ok:
        failures.append(f"洋红残留占比 {ratio:.5f} 超限")

    components, largest = count_components(keyed, shared["componentDebrisMinArea"])
    ok = components <= shared["componentsMax"]
    print(f"    连通域 {components} 个（最大 {largest} px²）  上限 {shared['componentsMax']}"
          f"  {'ok' if ok else '失败'}")
    if not ok:
        failures.append(f"连通域 {components} 个，图里不止一件东西")

    return failures


def build_icon(item_id: str, spec: dict, shared: dict, version: str) -> Image.Image | None:
    """返回落幅好的图标，或 None 表示该候选不合格。"""
    source_path = candidate_path(spec, version)
    print(f"\n=== {item_id} {source_path.name} ===")
    if not source_path.exists():
        print("    缺少候选，先跑 node scripts/generate_prop_item_assets.mjs")
        return None

    keyed, already = key_out(Image.open(source_path), shared)
    keyed, changed = neutralize_residual_magenta(keyed, shared)
    print(f"    来源背景 {'已带 alpha' if already else '洋红键控底'}"
          f"  画幅 {keyed.width}x{keyed.height}  中和 {changed} px")

    bbox = alpha_bbox(keyed)
    if bbox is None:
        print("    失败: 键控后没有剩下任何主体")
        return None

    failures = gate(item_id, spec, shared, keyed, bbox)
    if failures:
        print("    判定: 不采用 —— " + "；".join(failures))
        return None

    subject = keyed.crop(bbox)
    canvas_w = shared["canvas"]["width"]
    canvas_h = shared["canvas"]["height"]
    padding = shared["padding"]
    inner_w = canvas_w - padding * 2
    inner_h = canvas_h - padding * 2

    # letterbox：取两个方向里更紧的那个系数，保持原宽高比。夹到 1.0 绝不放大——
    # 源主体约 800px，目标 42px，永远是降采样。
    scale = min(1.0, inner_w / subject.width, inner_h / subject.height)
    width = max(1, round(subject.width * scale))
    height = max(1, round(subject.height * scale))
    resized = downsample_premultiplied(subject, width, height)

    icon = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
    icon.alpha_composite(resized, ((canvas_w - width) // 2, (canvas_h - height) // 2))

    residue = count_magenta_residue(icon, shared)
    if residue > shared["productResidueMax"]:
        print(f"    判定: 不采用 —— 成品仍有 {residue} 个洋红像素"
              f"（上限 {shared['productResidueMax']}），键控底混得太深，换一版候选")
        return None

    print(f"    落幅 {width}x{height} @ {canvas_w}x{canvas_h}  缩放 {scale:.4f}"
          f"  成品残留 {residue} px\n    判定: 可采用")
    return icon


def main() -> None:
    parser = argparse.ArgumentParser(description="处理战术道具俯视图标候选")
    parser.add_argument("ids", nargs="+", help="道具 id，或 all")
    parser.add_argument("--version", default="v01")
    # 任何 `--` 开头的参数都不要指望经 `npm run ... -- ` 传进来。
    # npm 10.9.2 实测会把 `--` 之后的**全部** flag 吃掉、只转发位置参数：
    # `npm run assets:props -- all --inspect-only` 到达本脚本时 argv 只剩 ['all']，
    # `--version v01` 同样丢失。表现是「只检视」静默变成「照常落盘」，不报任何错。
    # 所以 flag 只在直接用 python 调用时可靠；经 npm 走 assets:props-inspect
    # 这个把 flag 写死在脚本串里的入口（与 assets:weapons-side-inspect 同一路子）。
    parser.add_argument(
        "--inspect-only", "--dry-run",
        dest="inspect_only",
        action="store_true",
        help="只检视，不写运行时目录（经 npm 请用 npm run assets:props-inspect）",
    )
    args = parser.parse_args()

    spec_file = json.loads(SPEC_PATH.read_text(encoding="utf-8"))
    shared = spec_file["shared"]
    by_id = {entry["itemId"]: entry for entry in spec_file["props"]}

    targets = list(by_id) if "all" in args.ids else args.ids
    unknown = [item for item in targets if item not in by_id]
    if unknown:
        raise SystemExit(f"未登记的 id: {', '.join(unknown)}。已登记: {', '.join(by_id)}")

    icons = {item_id: build_icon(item_id, by_id[item_id], shared, args.version)
             for item_id in targets}

    print("\n--- 汇总 ---")
    for item_id, icon in icons.items():
        print(f"{item_id}: {'可采用' if icon else '不采用'}")

    passed = {item_id: icon for item_id, icon in icons.items() if icon is not None}
    if args.inspect_only:
        print("\n--inspect-only：未写入任何文件。")
    elif passed:
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        print(f"\n写入 {OUTPUT_DIR.relative_to(ROOT).as_posix()}/：")
        for item_id, icon in passed.items():
            name = output_name(item_id)
            icon.save(OUTPUT_DIR / name)
            print(f"  {name}")
        print("\n下一步：npm run typecheck && npm test，并在实机复核这四件道具"
              "部署到地面后的体量——画幅与 prop-mine.png 一致，"
              "所以它们应当与地雷看起来是同一个尺寸档。")

    # 非零退出码便于挂进脚本链：有一件不达标就不该当作全部完成。
    if len(passed) != len(targets):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
