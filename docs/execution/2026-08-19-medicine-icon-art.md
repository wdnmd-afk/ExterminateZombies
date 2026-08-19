# 药品图标美术接入执行文档

> 状态：已实施；Chrome 151 headless 客观验证通过；命令验证被仓库既有环境问题阻断（见第 6 节）
> 建立日期：2026-08-19
> 所属层级：`docs/execution/` — 实施与追踪
> 上游：`docs/playDesign/药品与固定侧栏HUD.md` §7.3（该节「颜色竖条」方案已被本轮替换）
> 前序执行文档：`docs/execution/2026-08-19-medicine-and-fixed-sidebar.md`（§3.2 第 5 项把药品美术划在范围外）
> 事实来源：`src/config/medicine.ts`、`src/systems/EnvironmentAssetManager.ts`、`src/scenes/PreloadScene.ts`、`src/scenes/HUDScene.ts`、`src/entities/Pickup.ts`

---

## 1. 目标

给绷带、急救、饮料三种药品各配一张独立图标，替换前一轮的「6px 颜色竖条 + 中文名」占位方案，
使 HUD 药品槽和药品掉落物都能不读文字就分辨是哪一种药。

## 2. 素材选型

### 2.1 先核对已归档素材，不够才下载

仓库已有 `medicine-pack-16x16`（Kipperfalcon，CC0，64×64 表内 9 个 16×16 图标）。逐格核对结论：

| 需求 | 已归档包内最接近的格子 | 判断 |
| --- | --- | --- |
| 急救 | `(2,0)` 绿色急救箱 | 可用，但**已被 `pickup-health` 占用**（`create_health_pickup()` 裁的就是这一格），药品与生命包会同图 |
| 绷带 | `(1,1)` 白紫圆角敷料片 | 放到 24-32px 后读成香皂或药片，辨识度不合格 |
| 饮料 | 无 | 包内没有任何饮料类图标；`(1,3)` 青色罐更像药膏盒 |

`freeart-topdown-extras`（桶/车/沙袋）、`endless-midnight-zombie-swarm-assets`（成就与血条 UI）、
`ammo-pack`、`cc0-explosive-icons` 均无可用图标。因此按 `LONG_TERM_OPTIMIZATION_GOALS.md` §9 C-6
的既有下载授权新增外部资源。

### 2.2 选定素材

两个包同一作者（Airos）、同一规格（32×32）、同一画风，因此三个图标放在一起没有拼贴感：

| 药品 | 文件 | 资源包 | 许可证 |
| --- | --- | --- | --- |
| 绷带 | `bandage_32x32.png` | [32px Medical Items](https://opengameart.org/content/32px-medical-items) | CC0 1.0 |
| 急救 | `first_aid_kit_32x32.png` | 同上 | CC0 1.0 |
| 饮料 | `purple_drink_32x32.png` | [32px Food Items](https://opengameart.org/content/32px-food-items) | CC0 1.0 |

饮料这张不是我们自己“认定”成饮料的：来源页作者原文写的就是「a can of energy drink/soda」。
两个来源页的署名要求均为「None required, but you're welcome to add a thanks in your credits」，
CC0 不强制署名，因此**没有**加进 Credits 强制署名清单（`ART_ASSET_REGISTRY.md` §9 的口径），
但两份 `SOURCE.md` 已把这句原文记下来。

### 2.3 落库位置与校验

| 目录 | 内容 |
| --- | --- |
| `src/assets/downloaded/environment/airos-medical-items-32x32/` | 原始 zip、页面预览图、解压出的 2 张运行时 PNG、`LICENSE.txt`、`SOURCE.md` |
| `src/assets/downloaded/environment/airos-food-items-32x32/` | 原始 zip、页面预览图、解压出的 1 张运行时 PNG、`LICENSE.txt`、`SOURCE.md` |

SHA-256 与文件大小逐条记在两份 `SOURCE.md` 里。包内未使用的图（口罩、药片、咖啡、外卖盒、
弹珠汽水）保留在 zip 内不单独解压，避免仓库里出现「解压了但没接线」的孤立文件。

## 3. 关键决策：不走 `scripts/` 派生管线

`ART_ASSET_REGISTRY.md` §8 要求派生文件由 `scripts/` 生成并进 `src/assets/processed/`。本轮**没有派生**：

1. 三张源图本身就是 32×32 单图标，不需要从图表里裁切，也不需要归一化画布。
2. HUD 槽（`MEDICINE_ICON_SIZE = 32`）与掉落物（32×32）都按 1:1 原生尺寸显示，符合
   `ART_BIBLE.md` §2「运行时缩放优先使用整数倍」，任何缩放处理反而会引入非整数重采样。
3. 由 `PreloadScene` 直接加载 `downloaded/` 下原始文件——这与 Kenney 角色主体、
   `zombie-rpg-sprites`、`zombie-and-skeleton-32x48` 的既有做法一致，不是新开的例外。

附带好处：本机 Python 缺 `PIL`，`npm run assets:environment` 目前根本跑不起来（见第 6 节），
本轮因此完全不依赖它，也没有触碰已有 12 个派生 PNG 的字节。

## 4. 改动清单

| # | 文件 | 改动 |
| --: | --- | --- |
| 1 | `src/systems/EnvironmentAssetManager.ts` | `ENVIRONMENT_TEXTURE_KEYS` 新增 3 个键（自动获得 `prepareEnvironmentAssets()` 的 NEAREST 过滤）；新增 `MEDICINE_TEXTURE_KEYS satisfies Record<MedicineId, string>`，与 `PROP_TEXTURE_KEYS` 同形态，新增药品时编译期即暴露缺图 |
| 2 | `src/scenes/PreloadScene.ts` | 3 个原始文件 import + 3 个 `load.image` |
| 3 | `src/config/medicine.ts` | `energy_drink.color` 由 `0xfbc02d` 改为 `0xbd73d7`（采样自罐体中间调），使强调色与图标同色；`MedicineDef.color` 补注释说明它的三个消费点 |
| 4 | `src/scenes/HUDScene.ts` | `MedicineSlotRefs.stripe: Rectangle` → `icon: Image`；槽内改两行排布；新增 `MEDICINE_ICON_SIZE`、`MEDICINE_TEXT_LEFT` 与 `resolveMedicineNameMaxWidth()`；不可用态图标转灰、持续治疗呼吸通道从竖条搬到图标 |
| 5 | `src/entities/Pickup.ts` | `medicine` 分支改用 `MEDICINE_TEXTURE_KEYS[drop.medicineId]`，尺寸 30→32 |
| 6 | `tests/medicine-art.test.ts` | **新增**：纹理键互不复用、三张源图存在且是 32×32 真实 PNG、强调色值域 |
| 7 | 文档 | 台账、运行时清单、README、上游规划与前序执行文档同步 |

### 4.1 槽内排布（内容宽 90px 的压缩档为下界）

```text
0        32   38      60          88  90
├─ 图标 ─┤    [Z]     绷带              ← 上行 y = -11
│  32×32 │                        ×2   ← 下行 y = +11，右对齐
```

单行放不下「图标 + 键位 + 名称 + 数量」四段（90px 内容宽），因此数量下沉到第二行——与右侧栏
道具槽已经采用的排布一致（`itemDetailText` 同样是槽内第二行右对齐）。名称在 90px 档实测占 26px、
可用 28px，**不触发 `fitTextWidth()` 缩字号**，仍是 13px。

## 5. 验证记录

### 5.1 静态核对

| 核对项 | 结论 | 依据 |
| --- | --- | --- |
| 三个纹理键无重复、无复用 `pickup-health` | 通过 | `MEDICINE_TEXTURE_KEYS` 三值互不相同；`Pickup` 的 `medicine` 分支不再引用 `pickupHealth` |
| 新键进入 NEAREST 过滤集合 | 通过 | 三键写在 `ENVIRONMENT_TEXTURE_KEYS` 内，`prepareEnvironmentAssets()` 遍历该对象 |
| 竖条无残留引用 | 通过 | 全 `src` 检索 `stripe` 在药品链路无命中 |
| 垂直预算未变 | 通过 | 面板高 180、槽高 44、槽距 4 全部沿用，右侧栏累计底边与前一轮一致 |
| 名称在最窄档不缩字号 | 通过 | `resolveMedicineNameMaxWidth()` 在 90px 档得 28px ≥ 名称实测 26px |

### 5.2 Chrome 151 headless 实景（正式第一关，1920×1080，DPR 1，逻辑 1520×720 @2×）

| 项 | 结果 |
| --- | --- |
| 三个纹理加载 | 全部 `exists`，源尺寸 32×32，`scaleMode = 1`（NEAREST） |
| 槽内排布 | 图标 1:1 32×32；键位 x=36 宽 13；名称 x=60 宽 26 且仍为 13px；数量右对齐 x=90；右边界 86 ≤ 90 |
| 可用态 | 饮料满色可用 |
| 不可用态 | 满血下绷带/急救图标与名称同步转灰（`isTinted = true`） |
| 正在使用 | 库存预扣 1→0；进度填充 5→45px；倒数 0.9s→0.5s；描边切到 `0xbd73d7` 且加粗到 2px |
| 持续治疗 | 数量位显示 `20s`；图标 alpha 在 0.62–0.97 之间呼吸（呼吸通道搬迁成功） |
| 掉落物 | 三种药品各自图标、32×32、标签 `绷带` / `急救` / `饮料 ×2`、辉光色分别为 `0xd8d2c2` / `0xff7482` / `0xbd73d7` |
| 控制台 | 无运行时异常、无 `console.error` |

药品掉落表尚未配置（属前一轮明确的平衡范围外事项），掉落物是从 `pickupPool` 直接生成来验证
`Pickup.resolveVisual()` 的 `medicine` 分支的。

证据：`.debug-medicine-art/`（`probe.json`、`probe3.json`、`probe4.json`、`shot-2-ingame.png`、
`shot-3-pickups.png`、`shot-4-channeling.png`、`shot-5-overtime.png`、`crop-*.png`）。

### 5.3 未做

1. `npm run build` 未执行（本轮不申请）。
2. V6 真人验收：图标在真实战斗节奏下是否够醒目、满血转灰是否会被误读成「没有」、
   紫色罐与仓库既有色板（补给金黄 / 强化青 / 生命红）是否协调。

## 6. 本轮暴露的两个仓库既有环境问题（非本轮引入，未修）

1. **`npm test` 无法启动**：`vitest@4.1.10` 的 peer 要求是 `vite ^6 || ^7 || ^8`，`package.json`
   钉的是 `vite@^5.4.2`，报 `ERR_PACKAGE_PATH_NOT_EXPORTED: ./module-runner`。
   `docs/execution/2026-08-18-five-weapon-sidebar-hud.md` 已记录过同一现象，至今未修。
   因此 `tests/medicine-art.test.ts` **写了但没跑过**，不得据此声称测试通过。
2. **`npm run typecheck` 退出码 2**：28 个错误全是 `letterSpacing` 不在 Phaser 3.80.1 的
   `Phaser.Types.GameObjects.Text.TextStyle` 类型里，分布在 `MainMenuScene`(9)、
   `MonsterLibraryScene`(9)、`WeaponLibraryScene`(9)、`PreparationScene`(1)。
   本轮改动的 5 个源文件零错误。修法是加一个类型增补声明，属独立改动。
3. **`npm run assets:environment` 无法运行**：本机 `python` 无 `PIL`，且 `python -m pip` 不可用
   （`ensurepip` 可用）。本轮不依赖该脚本，但它意味着任何需要重跑派生管线的任务都要先补环境。

以上三条与 `2026-08-19-medicine-and-fixed-sidebar.md` §10 记录的「`npm test` 退出码 0、
`npm run typecheck` 退出码 0」冲突。按 `PROJECT_MASTER_PLAN.md` §1.3 事实优先级，以当前工作区
的实际命令结果为准，README「验证与测试」一节已据此更正。
