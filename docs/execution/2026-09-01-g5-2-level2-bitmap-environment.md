# 2026-09-01 G5-2：第二关正式位图环境

> 状态：实施中。
>
> 依据：`docs/design/LONG_TERM_OPTIMIZATION_GOALS.md` §5.2 G5-2 与 §9 C-2（2026-08-12 用户确认）、
> `docs/ART_ASSET_REGISTRY.md` §6 候选表 / §7 规格缺口 / §8 维护规则、`docs/design/ART_BIBLE.md` §2/§3/§7/§8。
>
> 前置基线：`d987419`（该轮已修复 `npm test` 阻塞并修正四处文档漂移，见 `HANDOVER.md` §4）。

## 1. 目标

把第二关「废车站」的**地面与边界**从程序化 `Graphics` 绘制替换为正式位图瓦片，作为其余九关批量化（G5-5）的样板；程序化实现保留为其余关卡与无尽模式的回退路径。

## 2. 范围界定：比原描述小

G5-2 原文写「替换第二关程序化地面/边界/**障碍外观**」。经代码核对，障碍部分**已于 2026-08-24 完成**：

- `src/entities/Obstacle.ts:48` 已用 `OBSTACLE_TEXTURE_KEYS` 加载位图，不再程序绘制。
- 碰撞与外观对齐已由 `buildRotatedRectTiles` 解决（斜放包围盒问题，成因见 `Obstacle.ts:13-27`）。

因此本轮实际范围**只有地面与边界两项**，不重做障碍。

### 2.1 在范围内

1. 下载并入库三个 CC0 环境包（见 §4）。
2. 新增派生脚本，产出第二关地面瓦片与边界贴图。
3. `BattlefieldRenderer` 增加位图分支，仅 `level_2` 生效。
4. `environmentTextures.ts` 新增地面/边界纹理键；`PreloadScene` 加载。
5. 新增瓦片交付不变量测试。
6. 同步台账、运行时清单、G 目标表。

### 2.2 不在范围内

1. 不改任何关卡的玩法配置（`levels.ts` 的 props / obstacles / waves 一律不动）。
2. 不改其余九关与无尽模式的外观（保持程序化）。
3. 不做 G5-3 剩余项（血液与火花仍为程序 `add.circle`）。
4. 不做 G5-5 批量化。
5. 不引入任何非 CC0 素材。

## 3. 当前实现的准确现状

| 项 | 位置 | 现状 |
| --- | --- | --- |
| 渲染入口 | `BattlefieldRenderer.renderBattlefield()` | 唯一入口，仅 `GameScene.ts:290` 调用一次 |
| 第二关布局 | `BattlefieldRenderer.ts:139-175` `drawAbandonedStation()` | 纯 `Graphics` |
| 边界 | `BattlefieldRenderer.ts:462-470` `drawWorldBoundary()` | 四边各 20px 纯色 + 内描边 |
| 调色板 | `BattlefieldRenderer.ts:15` | `level_2: ground 0x25282a, groundAlt 0x303437, edge 0x17191b, line 0xa77b3f, detail 0x59656c` |
| 地面深度 | `constants.ts:8` | `DEPTH.ground = 0`，其上 `lingerZone:5` / `corpse:8` / `prop:10` |
| 纹理键 | `config/environmentTextures.ts:12-31` | **无任何 ground / 边界键** |
| 派生产物 | `src/assets/processed/environment/` | 16 张，全为障碍/道具/弹体，**无地面** |

### 3.1 必须对齐的既有几何

位图不能改变第二关的可读结构，以下坐标来自 `drawAbandonedStation()`，是硬约束：

- 上下铁轨带：`y = 92..208` 与 `y = 512..628`；轨线中心 `y = 118` / `538`（`drawRailLine` 在中心线上下各 54px 铺枕木）。
- 中央维修通道：`x = 96..1184`，`y = 246..474`；内描边 `x = 112..1168`，`y = 262..458`。
- 出生标识：画布中心 `(640, 360)` 半径 48 圆 + 十字。
- 两侧危险区：`(204, 298)` 与 `(944, 298)`，各 `132 × 124`。
- 边界：四边各 20px。

## 4. 素材路线：走 C-2 已锁定的三包组合

| 包 | 来源 | 许可 | 用途 | 规格注意 |
| --- | --- | --- | --- | --- |
| Kenney RPG Urban Pack | https://kenney.nl/assets/rpg-urban-pack | CC0 | 沥青/混凝土地面、路障、街道杂物 | 480 项，16×16 |
| Modern City Extension | https://opengameart.org/content/modern-city-extension | CC0 | 工业地面、仓库边缘 | 基于 Kenney Modern City，风格兼容 |
| Railway line (grass/sand/dirt) | https://opengameart.org/content/railway-line-inclusing-grasssand-and-dirt-terrain | CC0 | 铁轨与地面过渡 | 16×16，需最近邻整数放大 |

三包全 CC0，**不触发署名义务**。

### 4.1 为什么不走 AI 生成管线

项目已有成熟的 AI 生成管线（`generate_effect_assets.mjs` + 洋红键控），粉尘位图就是这么产出的，且能天然规避多作者混用问题。但**不选它**，理由：

1. C-2 已由用户确认锁定为「候选包位图瓦片」，改路线属于偏离既有决策。
2. 无缝平铺瓦片对生成模型是弱项——`explosion` 这类独立主体容易，四边严格无缝接缝极难稳定命中，而接缝错位在平铺后是全屏可见的。
3. 三包为现成 CC0 成品，接缝已由原作者保证。

若后续实测三包色板归一成本过高，可再评估回退到生成管线，但需另立决策记录。

## 5. 操作步骤

### 步骤 1：素材入库（§8 五步 + ART_BIBLE §7 哈希）

对三个包各执行：

1. 下载到 `src/assets/downloaded/environment/<pack-slug>/`，保留原始文件不改名、不覆盖。
2. 写 `SOURCE.md`：标题、作者、来源页面、下载链接、许可证、下载日期、文件说明。
3. 保留包内 `LICENSE*` 原文；三包为 CC0，不需更新 `ATTRIBUTION.md`。
4. 记录 SHA-256（ART_BIBLE `:56` 要求，§8 未复述但同样生效）。
5. 台账 §6 新增记录，状态**只能先写「已下载未接入」**。

目标 slug：`kenney-rpg-urban-pack/`、`modern-city-extension/`、`railway-line-terrain/`。

### 步骤 2：新增派生脚本 `scripts/process_battlefield_environment_assets.py`

**不扩展** `process_environment_assets.py`，理由是它的 `save_image()`（`:274-289`）强制四角透明，而无缝地面瓦片必须四角有像素——这条校验对瓦片是反向约束。同目录已有两个写入方（`process_environment_assets.py` 与 `process_prop_item_assets.py`），再加第三个需避免输出名冲突。

脚本职责：

1. 从三个下载包裁出所需瓦片。
2. **色板归一**：按 `BATTLEFIELD_PALETTES.level_2` 五个值（§3 表）把三包向同一色板收敛，满足 ART_BIBLE `:65`「正式关卡不直接混用未经调色和比例归一的多作者资产」。
3. **像素密度归一**：三包均按最近邻整数倍放大到统一密度，Railway 台账已标注此项要求。
4. 合成三张产物（命名避开既有 16 张）：
   - `battlefield-level2-ground.png`：可平铺的工业地面基底瓦片。
   - `battlefield-level2-rail.png`：铁轨带，宽度对齐 `GAME_WIDTH`，高度 116（对齐 `y=92..208`）。
   - `battlefield-level2-boundary.png`：边界带，20px 厚。
5. 打印每张的真实尺寸与 SHA-256，供台账与测试登记。

**瓦片尺寸约束**：逻辑画布 `1280 × 720`。`1280 / 64 = 20` 整除，但 `720 / 64 = 11.25` 不整除。因此地面基底采用 **`TileSprite`**（Phaser 自带裁切，不产生残行），而非手工循环贴图。

### 步骤 3：新增纹理键与布局登记

1. `config/environmentTextures.ts`：`ENVIRONMENT_TEXTURE_KEYS` 增加 `battlefieldLevel2Ground` / `battlefieldLevel2Rail` / `battlefieldLevel2Boundary`。
2. 新增 `BATTLEFIELD_TILE_LAYOUTS` 纯数据表，登记每张的 `textureKey` + 真实像素尺寸，供步骤 5 的测试读取。放在 `config/` 而非 `systems/`，理由与 `effectVisuals.ts:4-7` 同源：测试跑在 Node，链路上不能出现 `import Phaser`。

### 步骤 4：`BattlefieldRenderer` 增加位图分支

`renderBattlefield()` 内，`level_2` 分支改为：

1. 若三张纹理**全部存在**（`scene.textures.exists()`），走位图路径：`TileSprite` 铺地面 → 铁轨带 → 危险区与出生标识仍用 `Graphics`（低对比度线条，本轮不位图化）→ 边界带。
2. 若任一缺失，**回退到现有 `drawAbandonedStation()`**，并 `console.warn` 指明缺失键。

回退分支必须保留：`levels.test.ts:223` 有现存不变量「每关都必须有专属战场主题，漏配会静默退回第一关外观」，且 §2.2 要求其余九关不受影响。

> 失效形状与 `e3df971` 记录的完全同源：纹理缺失时每一环都「正确地」降级，屏幕上只剩纯色，而配置校验与类型检查全绿。因此步骤 5 的测试是必需项。

### 步骤 5：新增交付不变量测试 `tests/battlefield-tile-assets.test.ts`

复刻 `tests/effect-strip-assets.test.ts` 的模式（读磁盘真实 IHDR 尺寸比对数据表）：

1. 每个登记键都有对应文件存在，且 PNG magic 正确。
2. 真实像素尺寸等于 `BATTLEFIELD_TILE_LAYOUTS` 登记值。
3. 铁轨带宽度 ≥ `GAME_WIDTH`、高度等于 116；边界带厚度等于 20。
4. 三张文件互不复用。
5. 变异验证：故意改一个登记值，确认测试变红，再恢复。

### 步骤 6：`PreloadScene` 加载

按既有模式：静态 `import ... from '../assets/processed/environment/...'` + `this.load.image(ENVIRONMENT_TEXTURE_KEYS.xxx, url)`。`prepareEnvironmentAssets()` 已对 `ENVIRONMENT_TEXTURE_KEYS` 全量设 `NEAREST`（`EnvironmentAssetManager.ts:17-23`），新键自动被覆盖，无需改动该函数。

### 步骤 7：文档同步（G7-3 强制）

1. `ART_ASSET_REGISTRY.md`：§6 三包状态改「已接入」；§4 新增派生条目。
2. `RUNTIME_ASSET_MANIFEST.md`：新增三张产物与来源/许可对照；`:69` 的「战场地面与边界 = 项目内生成」条目需按第二关已位图化改写。
3. `LONG_TERM_OPTIMIZATION_GOALS.md`：G5-2 状态改「已完成」并注明验证层级；§0.3 美术行同步。
4. `README.md`：第二关环境描述。

## 6. 实施建议

1. **严格串行**：步骤 1 未完成不进步骤 2。素材未入库就写脚本会得到一堆路径不存在的死代码。
2. **先出一张再出三张**：先只做 `ground` 一张走通「脚本 → 键 → 测试 → PreloadScene → 位图分支」全链，确认屏幕上真的变了，再补 rail 与 boundary。
3. **色板归一先做量化判据**：把归一后瓦片的主色均值与 `level_2` 五值的欧氏距离打印出来，不靠肉眼判断「像不像」。
4. **不动 `levels.ts`**：本轮任何视觉问题都不通过改玩法坐标解决。

## 7. 潜在风险

| 风险 | 影响 | 对策 |
| --- | --- | --- |
| 三包混用视觉拼贴 | ART_BIBLE `:65` 明文限制 | 步骤 2 的色板 + 像素密度双归一；量化判据而非目视 |
| 地面对比度过高 | ART_BIBLE `:35` 要求场景底色低对比，高对比会让子弹和掉落读不出来 | 归一目标锚定 `level_2` 现有五值（本身已通过 V1-V5） |
| 纹理缺失静默降级 | 屏幕退回纯色，全绿测试无感 | 步骤 5 的交付测试 + 步骤 4 的 `console.warn` |
| `720` 不被 64 整除 | 手工循环贴图留残边 | 用 `TileSprite` 交给 Phaser 裁切 |
| 平铺接缝可见 | 全屏规律性接缝比纯色更难看 | 优先取原包已保证无缝的地形瓦片；V3 目视确认 |
| 遮挡战斗层级 | 地面误设深度会盖住掉落或危险区 | 地面固定 `DEPTH.ground = 0`；危险区与出生标识保持 `Graphics` |
| 仓库继续膨胀 | 已 919 MB | 只入库实际使用的瓦片子集 |
| 影响其余九关 | 回归风险 | 位图分支仅 `level_2` 命中；其余走原 `switch` 分支 |

## 8. 优化方案

1. **`BATTLEFIELD_TILE_LAYOUTS` 设计成可扩展表**：G5-5 要铺到另外九关，本轮按 `Record<themeId, tiles>` 设计，G5-5 只加数据不改渲染逻辑。
2. **位图分支写成通用函数**：`renderBitmapBattlefield(scene, themeId)`，`level_2` 只是第一个调用方。
3. **回退逻辑集中一处**：`hasCompleteTileSet(scene, themeId)`，而不是散在分支里。

## 9. 验证方式

| 层级 | 内容 | 授权 |
| --- | --- | --- |
| V0 | 静态审阅：纹理键链路、深度层级、坐标对齐、许可证与哈希齐备 | 无需 |
| V1 | `npm test`（含新增 `battlefield-tile-assets.test.ts` 及其变异验证） | C-9 长期授权 |
| V2 | `npm run typecheck` | C-9 长期授权 |
| V3 | 浏览器冷启动：进第二关，确认地面/铁轨/边界为位图且无控制台告警 | 需申请 |
| V4 | Agent 实景：CDP 探针确认三张纹理 `textureExists`；核对 §3.1 七处几何对齐；确认其余九关外观未变 | 需申请 |
| V5 | 第二关完整试玩：掉落、危险区、Boss 冲锋在新地面上的可读性 | 需申请 |
| V6 | 真人目视：拼贴感、接缝、对比度是否舒适 | Agent 不可替代 |

`npm run build` 按 C-9 仍需单独申请，本轮默认不执行。

## 10. 执行结果

> 待实施后回填。未回填前，本文档不得被引用为「已完成」证据。

### 10.1 步骤 1 素材入库：已完成（2026-09-01）

三包已下载入库，总增量约 478 KB，远低于 §7 预估的"数 MB 级"。

| 包 | 目录 | 原始文件 | SHA-256 |
| --- | --- | --- | --- |
| Kenney RPG Urban Pack | `kenney-rpg-urban-pack/` | `kenney_rpg-urban-pack.zip`（299.4 KB） | `4541d89d639fc7d1e905dd925e55b1c4977a41d983516228db1d57173bb9afaf` |
| Modern City Extension | `modern-city-extension/` | `city_extension.png`（84.2 KB） | `558d3c65248971e977832d4cc364ecf3e8cc7f758e928cb8080777ce7dd26667` |
| 同上（预览图） | 同上 | `city_extension_prev.png`（57 KB） | `a7b472f99818d0993cfcd23978de02a8e4b2bfaa21a5c7111cc6344d00cf05ce` |
| Railway line terrain | `railway-line-terrain/` | `railway_line_with_terrian.png`（37 KB） | `5da9cfbdca1ad90594351cce7710b2af11e18ae664fb5a24acb1e7d4b224f0e4` |

§8 五步执行情况：

1. ✅ 原始文件入 `src/assets/downloaded/environment/<slug>/`，未改名未覆盖。Kenney zip 已解压且**保留 zip 本体**。
2. ✅ 三个 `SOURCE.md` 已写（标题、作者、来源页、下载链接、许可证、下载日期、逐文件说明）。
3. ✅ 许可证：Kenney 包内自带 `License.txt`；两个 OpenGameArt 包是裸 PNG 附件、不随包提供许可文件，已按来源页面声明补录 `LICENSE.txt`，格式沿用本目录既有环境包（如 `freeart-topdown-extras/LICENSE.txt`）的同名约定。三包全 CC0，未触发 `ATTRIBUTION.md`。
4. ✅ SHA-256 已记入各 `SOURCE.md` 与上表。
5. ✅ 台账 §6 已接入表新增三行，状态按 §8 要求先写「已下载未接入」；同时把候选表中这三行标为「已于 2026-09-01 下载，见上表」，避免同一包在两处状态矛盾。

#### 与计划的三处差异

1. **许可文件名**：§5 步骤 1 写「保留包内 `LICENSE*`」，但两个 OpenGameArt 包根本没有包内许可文件。已按来源页面声明补录，并在 `SOURCE.md` 与 `LICENSE.txt` 内都注明补录来由，不伪装成原包自带。
2. **Kenney 项数**：台账原写 480 项，实测 `Tiles/` 下 486 张，已在台账修正。
3. **像素密度风险下降**：三包源瓦片实测**均为 16×16**（Kenney `tilemap.txt` 官方声明 16×16；city_extension 896×736 = 56×46 格；railway 256×256 = 16×16 格）。§7 风险表「多作者像素密度未归一」中的密度项因此只需统一整数放大倍数，不需逐包换算比例；**色板归一仍是必做项**，未被此发现豁免。

#### 切图源选择

Kenney 采用 `Tilemap/tilemap_packed.png`（432×288，无间距）而非 `tilemap.png`（458×305，1px 间距）：无间距版切图不需跳格偏移，少一处 off-by-one 来源。

### 10.2 步骤 2-6：已完成（2026-09-01）

#### 先决问题：本机无法目视图像

`Read` 工具对本仓库**所有** PNG 返回空内容（已用已知完好的 `prop-mine.png` 复核），
与 `2026-08-31-dust-zone-bitmap.md` §6 记录的预览图读取失败同源。

因此不能靠肉眼挑瓦片。新增只读探查脚本 `scripts/inspect_battlefield_tile_candidates.py`，
把选格从"看图"改成两步量化判断：

1. **指标筛**：每个 16×16 单格打印不透明占比、主色均值、stdev、饱和度、明度，
   以及与 `level_2` 五值的最近距离。
2. **ASCII 轮廓确认**：`--mode show` 把指定格渲染成 16 行 ASCII 灰阶，逐格确认结构。

铁轨的识别另加一条方向性判据（`--mode rails`）：钢轨是平行横线、轨枕是垂直短线，
因此"逐行均值方差"必然显著高于"逐列均值方差"。这条把三张图集共 2543 个非空格
收敛到十几个候选，再由 ASCII 确认。

#### 选定的源格（每格都经指标 + ASCII 两步确认）

| 用途 | 来源 | 索引 | 判据 |
| --- | --- | --- | --- |
| 地面基底 | Kenney `tilemap_packed.png` | 441（c9r16） | 行/列方差 0.4/0.1，全部候选中最平坦的满格，仅极稀疏噪点 |
| 铁轨（上） | Railway `railway_line_with_terrian.png` | 9（c9r0） | 行/列方差 3779/101，ASCII 确认道砟 + 第一条钢轨 |
| 铁轨（下） | 同上 | 25（c9r1） | 行/列方差 3626/91，ASCII 确认第二条钢轨 + 轨枕 |
| 边界 | Modern City `city_extension.png` | 146（c34r2） | 行/列方差 179.7/0.0，上下双硬边水平构件 |

**明确排除** Kenney 440（c8r16）：ASCII 显示左下角有 `*+=` 亮块，平铺后会形成规律脏点阵。
这正是纯指标筛不出、必须靠 ASCII 才能发现的问题——它的 stdev 只有 8.68，指标上看很平坦。

#### 产物

| 文件 | 尺寸 | 大小 | SHA-256 |
| --- | --- | --- | --- |
| `battlefield-level2-ground.png` | 32×32 | 0.2 KB | `6210463ce8335f76abea3933ab57c7488a9325675edaf24d79fb91be70f98f43` |
| `battlefield-level2-rail.png` | 1280×116 | 3.3 KB | `623b485259844a47c79a762009c8658d7cfd63f57520eddc77c7c48d3d88d703` |
| `battlefield-level2-boundary.png` | 1280×20 | 0.2 KB | `6121ff6ea8ab2be0ed2231794fca12023c501d9c1e6b747eaa012b2125636607` |

三张合计 3.7 KB。地面刻意只产 32×32 单元而不是整屏图：运行时由 `TileSprite` 铺满，
输出整屏会让 `720/32 = 22.5` 的残行问题从运行时搬到磁盘上，且文件大几百倍。

#### 色板归一结果

| 产物 | 主色均值 | 目标 | 距离 |
| --- | --- | --- | --- |
| ground | `#2b2e31` | `ground #25282a` | 11.0 |
| boundary | `#1a1b1d` | `edge #17191b` | 4.1 |

铁轨带**不用单一色板距离作判据**：带内主体面积是道砟（归一到 `edge`），
钢轨只占少数行，拿整带均值比 `detail` 量的是错的东西。它的判据改为双侧明度：

- 道砟（暗十分位）明度 22.5，钢轨（亮十分位）明度 136.4，差 113.8。
- 判据一 轨道可辨（差 > 25）：通过。
- 判据二 不抢弹体读数（亮十分位 ≤ 145）：通过。

#### 本轮引入并修掉的两个缺陷

1. **色板归一把源色偏带了过来。** 首版在去饱和**之后**才用**原始像素**求格均值，
   于是"像素相对均值的偏移"仍携带源包原生色偏，归一后 ground 读成 `#302f23` 黄绿、
   boundary 读成 `#271712` 红棕，都不是目标的中性灰。改为先去饱和再据此求均值后，
   ground 距离从 14.8 降到 11.0，boundary 从 18.5 降到 4.1。
2. **钢轨过亮，违反 ART_BIBLE §3。** 修好色偏后钢轨亮十分位冲到 196.8（近纯白）。
   `normalize_to_palette` 为留住纹理而保留像素偏移，而 railway 源格道砟本身极亮
   （stdev 约 67），偏移被原样带过。新增 `compress_highlights()` 按 sqrt 衰减压回
   上限 128，亮十分位降到 136.4。首版判据只设了下限（差 > 25），会放过近白钢轨，
   已补成双侧。

#### 渲染接线

`BattlefieldRenderer` 新增三个函数，均按 §8 优化方案设计成主题无关，G5-5 只加数据：

- `resolveCompleteTileSet(scene, themeId)`：整组检查纹理是否就位，任一缺失返回 null
  并 `console.warn`。**刻意整组回退**而不是逐张——混用"位图地面 + 程序化铁轨"会得到
  两种画风叠加的半成品，比整组回退更难看也更难诊断。
- `renderBitmapBattlefield()`：`TileSprite` 铺地面 → 两条铁轨带（y=92 / y=512，与程序化版
  同坐标）→ 边界。
- `drawBitmapBoundary()`：上下贴整张横带；左右改用 `TileSprite` 而非旋转 90°——
  旋转后带长仍是 1280，会超出 720 高画布 560px，且左上原点的旋转偏移补正易算错。

**中央维修通道、出生标识、两侧危险区仍走 `Graphics`**（新函数 `drawStationReadability()`，
坐标与 `drawAbandonedStation()` 逐项一致）。它们属于战术读数而非环境装饰，位图化会让其
混进地面纹理，违反 ART_BIBLE §3「为警报留出明度差」。程序化的 `drawAbandonedStation()`
完整保留，作为纹理缺失时的回退路径。

#### 一次自伤事故（已修复）

做变异验证时用 PowerShell `Get-Content -Raw` + `Set-Content -NoNewline` 改
`environmentTextures.ts`，把该文件的 UTF-8 中文注释变成乱码、并把 CRLF 压平，
导致第 28 行注释吞掉了紧随其后的 `battlefieldLevel2Ground` 声明，`tsc` 报三处
"Property does not exist"。**此时 `npm test` 仍是全绿**（vitest 走模块缓存），
只有 typecheck 抓到——这也说明命令层各条并非等价。

已 `git checkout --` 还原后用 Edit 工具重做两处修改，并改用 Edit 工具完成变异验证。
**教训**：本仓库含中文注释的源文件不要用 PowerShell 文本管道改写。

#### 变异验证（确认测试真的会红）

把 `BATTLEFIELD_TILE_SETS.level_2.rail.height` 从 116 改成 100：

```
× 每个登记的纹理键都有对应文件，且登记尺寸等于磁盘真实尺寸
  AssertionError: level_2.rail 尺寸与登记不符:
  expected { width: 1280, height: 116 } to deeply equal { width: 1280, height: 100 }
× 第二关铁轨带高度与程序化版的 y=92..208 轨道带一致
  AssertionError: expected 100 to be 116
Tests  2 failed | 6 passed (8)
```

恢复后 8 passed。

### 10.3 验证结论（2026-09-01）

| 层级 | 命令 / 方式 | 结果 |
| --- | --- | --- |
| V0 | 静态审阅：纹理键链路、深度层级、坐标对齐、许可与哈希齐备 | 通过 |
| V1 | `npm test` | **通过：33 文件 / 408 用例**（本轮新增 1 文件 8 用例） |
| V1 变异 | 故意改登记值 | **通过：2 条转红，恢复后全绿** |
| V2 | `npm run typecheck` | **通过：退出码 0** |
| V2 | `npm run build` | 未执行（按 C-9 需单独申请） |
| V3 | 浏览器冷启动冒烟 | **未执行** |
| V4 | Agent 实景（含 §3.1 七处几何对齐、其余九关未变） | **未执行** |
| V5 | 第二关完整试玩 | **未执行** |
| V6 | 真人目视（拼贴感、接缝、对比度） | **未执行** |

### 10.4 剩余风险

1. **屏幕上到底什么样，完全未验证。** 本轮所有视觉结论都是像素统计与 ASCII 轮廓推得的，
   没有任何一帧实机画面被确认过。平铺接缝、地面与角色/弹体的明度关系、铁轨带与掩体的
   相对位置，全部属于 V3/V4 才能回答的问题。
2. **地面基底只有一种瓦片。** 整个可玩区铺同一个 32×32 单元，规律性接缝的风险高于
   多瓦片随机铺法。若 V6 觉得"太规律"，可在 `build_ground()` 产出 2×2 变体拼版。
3. **铁轨复线组居中于带内，与程序化版轨线中心 y=118 不同**（位图版落在 y=150）。
   两条路径切换时轨道视觉位置会跳，但掩体与油桶坐标未动，不影响玩法。
4. **`drawStationReadability()` 与 `drawAbandonedStation()` 存在重复坐标**。刻意保留双份
   （后者是回退路径），但今后改动其中一处必须同步另一处，否则两条路径会漂移。

### 10.5 步骤 7 文档同步：已完成（2026-09-01）

| 文档 | 改动 |
| --- | --- |
| `ART_ASSET_REGISTRY.md` | §6 已接入表三包状态改「部分接入」并注明各自只取了哪几格；候选表对应三行标为已下载；§5 拆分"战场地面与边界"条目（其余九关程序化 / 第二关位图 / 第二关战术读数层三行） |
| `RUNTIME_ASSET_MANIFEST.md` | §2 授权表新增三个 CC0 外部包；§4 拆分战场地面条目并新增位图与战术读数两行；§5 新增第 4、5 条（首次引入外部场景素材的 Credits 口径、实景未验提示） |
| `LONG_TERM_OPTIMIZATION_GOALS.md` | §0.3 美术行改写；§5.2 G5-2 状态改「命令层完成、实景未验」；G5-5 补注依赖 G5-2 实景验收，并记录本轮已把表结构做成主题索引 |
| `README.md` | 新增第二关位图环境与回退行为的说明 |
| `HANDOVER.md` | §7 第 1 条同步 G5-2 状态 |

#### 状态口径

G5-2 **未标记「已完成」**。按 `PROJECT_MASTER_PLAN.md`「未完成必要验证前禁止声称已完成」，
本轮只有 V0-V2 证据，屏幕上到底什么样没有任何一帧被确认过，因此统一写
「命令层完成、实景未验」。G5-5 的前置条件也相应写成「依赖 G5-2 **实景**验收」，
避免下一轮把命令层绿灯当成样板已通过。

### 10.6 下一轮建议

优先做 V3/V4，且**第一条必须是"进第二关，确认地面是位图而不是纯色"**——
本轮改的正是这条链，而它的失效形状（纹理缺失 → 静默回退程序化）在命令层完全不可见。
建议同时确认：

1. §3.1 七处几何是否对齐（尤其铁轨带与四组掩体的相对位置）。
2. 其余九关外观是否完全未变（回归项）。
3. 平铺接缝是否可见（§10.4 风险 2）。
4. 地面与子弹、掉落、危险区预警的明度是否仍分得开（ART_BIBLE §3）。
