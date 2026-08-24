"""重型武器**侧视**图标的候选检视。

存在理由与感染体 / 角色管线的检视脚本相同：生图是概率性的，采用前必须先用可复算的
判据把明显报废的候选拦下来，而不是靠目视记忆。但侧视枪的失败模式与角色完全不同，
所以判据也完全不同——角色管线的核心判据是「相机在不在正上方」，那一条对侧视枪
毫无意义（侧视是上游最擅长的构图，机位根本不需要争）。

本脚本判五件事，每一条都对应一种真实会发生、且目视不一定当场看出来的缺陷：

  aspect       主体宽高比。拦「画成竖着的枪」或「画成方块」。逐把给区间，不是全局常量。
  fill         主体占其外框的面积比。太低说明枪画小了或太镂空，降到 132px 会糊；
               太高说明画成了实心方块。
  facingBias   左半 / 右半的不透明像素质量比。侧视枪的机匣、弹箱、燃料罐都在后半，
               枪管在前半，所以朝右的枪必然左重右轻。这是本脚本最重要的一条：
               运行时不翻转这套贴图（HUDScene / PreparationScene / Pickup 都是直接
               setTexture 后等比缩放），画反了就是画反了，而「哪边是枪口」在一张
               陌生的枪图上并不总是一眼可辨。
  residue      键控后仍偏洋红的像素占主体面积的比例。按比例而不是绝对像素数——
               标定与两级门控的分工见 weapon_side_specs.json 的 _residueNote。
  components   主体的连通域数量（4 邻域，忽略 componentDebrisMinArea 以下的碎屑）。
               拦「画了一整个军械架」或「枪 + 一堆散落配件」——那种图裁不出单件图标。

用法（仓库自带 uv 虚拟环境已装 Pillow）：
  .venv/Scripts/python.exe scripts/inspect_weapon_side_candidates.py gatling --version v01
  .venv/Scripts/python.exe scripts/inspect_weapon_side_candidates.py all --version v01
"""

import argparse
import json
import sys
import warnings
from collections import deque
from pathlib import Path

from PIL import Image

# Pillow 12 对 getdata 标了弃用；这里只做只读像素遍历，噪声警告会淹没检视结论。
# 必须按 message 过滤而不是按 module="PIL"：警告在本文件的调用栈帧上抛出。
warnings.filterwarnings("ignore", message=r".*getdata is deprecated.*", category=DeprecationWarning)

sys.path.insert(0, str(Path(__file__).resolve().parent))

# 键控与主体定位复用感染体管线，避免两套判据漂移（理由见 weapon_side_specs.json 的 _keyingNote）。
from process_zombie_sprites import alpha_bbox, remove_magenta_background  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
TEMP_DIR = ROOT / "TmpGenerate"
SPEC_PATH = ROOT / "scripts" / "weapon_side_specs.json"

# 判定「这张图已经是键控好的 RGBA」的透明像素占比门槛。
# 上游偶尔直接返回带 alpha 的图而不是洋红底（golden_m249 v01 实测如此），
# 对这种图再跑一遍洋红键控是空转，且会把「找不到洋红」误报成缺陷。
ALREADY_KEYED_ALPHA_RATIO = 0.2


def load_specs() -> dict:
    return json.loads(SPEC_PATH.read_text(encoding="utf-8"))


def candidate_path(spec: dict, version: str) -> Path:
    return TEMP_DIR / f"{spec['candidateSlug']}-icon-{version}.png"


def key_out(source: Image.Image, shared: dict) -> tuple[Image.Image, bool]:
    """返回 (键控后的图, 是否本来就已键控)。"""
    rgba = source.convert("RGBA")
    # 用 histogram 而不是 getcolors：后者返回的是 (count, value) 而不是 (value, count)，
    # 顺序反了不会报错、只会静默把判断结果反过来。
    transparent = sum(rgba.getchannel("A").histogram()[:8])
    if transparent >= rgba.width * rgba.height * ALREADY_KEYED_ALPHA_RATIO:
        return rgba, True
    return remove_magenta_background(rgba, shared), False


def count_magenta_residue(image: Image.Image, shared: dict) -> int:
    """键控后仍然「偏洋红」的不透明像素数。

    判据与 remove_magenta_background 的第一步同源：红蓝两通道的下界减去绿通道即 chroma，
    且红蓝需大致平衡。chroma 门槛与阈值标定见 weapon_side_specs.json 的 _residueNote。
    """
    threshold = shared["residueMinChroma"]
    max_skew = shared["magentaMaxRbSkew"]
    pixels = image.load()
    residue = 0
    for y in range(image.height):
        for x in range(image.width):
            red, green, blue, alpha = pixels[x, y]
            if alpha < 32:
                continue
            floor = red if red < blue else blue
            if floor - green >= threshold and abs(red - blue) <= max_skew:
                residue += 1
    return residue


def count_components(image: Image.Image, min_area: int) -> tuple[int, int]:
    """主体的连通域数量与最大域面积。4 邻域洪泛，忽略 min_area 以下的碎屑。

    下采样到最长边 256 再数：原图 1254² 逐像素洪泛在 Python 里要几秒，而「有几团东西」
    这个问题在 256px 下的答案与原分辨率一致（真正的独立配件不会只有几个像素宽）。
    """
    scale = 256 / max(image.size)
    if scale < 1.0:
        image = image.resize(
            (max(1, round(image.width * scale)), max(1, round(image.height * scale))),
            Image.Resampling.LANCZOS,
        )
        min_area = max(1, round(min_area * scale * scale))

    width, height = image.size
    alpha = image.getchannel("A").load()
    seen = [[False] * height for _ in range(width)]
    counted = 0
    largest = 0
    for x0 in range(width):
        for y0 in range(height):
            if seen[x0][y0] or alpha[x0, y0] < 32:
                continue
            area = 0
            queue = deque([(x0, y0)])
            seen[x0][y0] = True
            while queue:
                x, y = queue.popleft()
                area += 1
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < width and 0 <= ny < height \
                            and not seen[nx][ny] and alpha[nx, ny] >= 32:
                        seen[nx][ny] = True
                        queue.append((nx, ny))
            largest = max(largest, area)
            if area >= min_area:
                counted += 1
    return counted, largest


def measure_facing_bias(image: Image.Image, bbox: tuple[int, int, int, int]) -> float:
    """主体左半 / 右半的不透明像素数之比。> 1 表示后半（机匣一侧）更重，即朝右。"""
    left, top, right, bottom = bbox
    middle = (left + right) // 2
    alpha = image.getchannel("A").load()
    rear = 0
    front = 0
    for y in range(top, bottom):
        for x in range(left, right):
            if alpha[x, y] < 32:
                continue
            if x < middle:
                rear += 1
            else:
                front += 1
    return rear / max(1, front)


def inspect(weapon_id: str, spec: dict, shared: dict, version: str) -> bool:
    path = candidate_path(spec, version)
    print(f"\n=== {spec['displayName']} ({weapon_id}) {path.name} ===")
    if not path.exists():
        print("  缺少候选文件，先跑 node scripts/generate_weapon_assets.mjs")
        return False

    keyed, already = key_out(Image.open(path), shared)
    print(f"  来源背景: {'已带 alpha' if already else '洋红键控底'}  画幅 {keyed.width}x{keyed.height}")

    bbox = alpha_bbox(keyed)
    if bbox is None:
        print("  失败: 键控后没有剩下任何主体")
        return False
    left, top, right, bottom = bbox
    subject_w = right - left
    subject_h = bottom - top

    failures = []

    aspect = subject_w / max(1, subject_h)
    ok = spec["aspectMin"] <= aspect <= spec["aspectMax"]
    print(f"  主体 {subject_w}x{subject_h}  宽高比 {aspect:.2f}"
          f"  区间 {spec['aspectMin']}~{spec['aspectMax']}  {'ok' if ok else '失败'}")
    if not ok:
        failures.append(f"宽高比 {aspect:.2f} 越界")

    # 面积比按主体外框算，不按画幅：模型对「主体占画幅百分之多少」的指令服从度一般，
    # 但外框内的填充率反映的是「枪本身画得实不实」，那才是降采样质量的决定因素。
    alpha_hist = keyed.crop(bbox).getchannel("A").histogram()
    opaque = sum(alpha_hist[32:])
    fill = opaque / max(1, subject_w * subject_h)
    ok = shared["fillMin"] <= fill <= shared["fillMax"]
    print(f"  外框填充率 {fill:.3f}  区间 {shared['fillMin']}~{shared['fillMax']}  {'ok' if ok else '失败'}")
    if not ok:
        failures.append(f"填充率 {fill:.3f} 越界")

    bias = measure_facing_bias(keyed, bbox)
    ok = bias >= shared["facingBiasMin"]
    print(f"  后半/前半质量比 {bias:.2f}  下限 {shared['facingBiasMin']}  {'ok' if ok else '失败（可能画反了）'}")
    if not ok:
        failures.append(f"朝向质量比 {bias:.2f} 低于下限，枪口可能不在右侧")

    residue = count_magenta_residue(keyed, shared)
    ratio = residue / max(1, opaque)
    ok = ratio <= shared["sourceResidueRatioMax"]
    print(f"  洋红残留 {residue} 像素 = 主体 {ratio:.5f}"
          f"  上限 {shared['sourceResidueRatioMax']}  {'ok' if ok else '失败'}")
    if not ok:
        failures.append(f"洋红残留占比 {ratio:.5f} 超限")

    components, largest = count_components(keyed, shared["componentDebrisMinArea"])
    ok = components <= shared["componentsMax"]
    print(f"  连通域 {components} 个（最大 {largest} px²）  上限 {shared['componentsMax']}"
          f"  {'ok' if ok else '失败'}")
    if not ok:
        failures.append(f"连通域 {components} 个，图里不止一件东西")

    if failures:
        print("  判定: 不采用 —— " + "；".join(failures))
        return False
    print("  判定: 可采用")
    return True


def main() -> None:
    parser = argparse.ArgumentParser(description="检视重型武器侧视图标候选")
    parser.add_argument("ids", nargs="+", help="武器 id，或 all")
    parser.add_argument("--version", default="v01")
    args = parser.parse_args()

    specs = load_specs()
    known = list(specs["weapons"])
    targets = known if "all" in args.ids else args.ids
    unknown = [item for item in targets if item not in specs["weapons"]]
    if unknown:
        raise SystemExit(f"未登记的 id: {', '.join(unknown)}。已登记: {', '.join(known)}")

    results = {
        weapon_id: inspect(weapon_id, specs["weapons"][weapon_id], specs["shared"], args.version)
        for weapon_id in targets
    }

    print("\n--- 检视汇总 ---")
    for weapon_id, passed in results.items():
        print(f"{weapon_id}: {'可采用' if passed else '不采用'}")
    passed_ids = [weapon_id for weapon_id, passed in results.items() if passed]
    if passed_ids:
        print(
            f"\n下一步: .venv/Scripts/python.exe scripts/process_weapon_side_assets.py"
            f" {' '.join(passed_ids)} --version {args.version}"
        )
    if len(passed_ids) != len(targets):
        # 非零退出码，便于把检视挂进脚本链：有一把不达标就不该继续往运行时目录写。
        raise SystemExit(1)


if __name__ == "__main__":
    main()
