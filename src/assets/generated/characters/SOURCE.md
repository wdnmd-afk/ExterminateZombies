# 角色 AI 生成原图来源

本目录存放五名可玩角色的 AI 直出原图，**不做任何处理**。运行时产物在
`src/assets/processed/characters/`，由 `scripts/process_character_assets.py` 派生。

资产台账据此把这批图登记为「项目内生成」，也是发布前判断许可边界的依据。

## 生成环境

| 项目 | 值 |
| --- | --- |
| 生成工具 | 本仓库的本地生图代理 `server/image-api.mjs`（见 `docs/IMAGE_GENERATION_API.md`） |
| 上游服务 | RightAPI（`IMAGE_BASEURL=https://www.rightapi.ai/draw`） |
| 模型 | `gpt-image-2` |
| 参考图 | 是，但两类图的用法不同。**图 B**：每个角色先出一张身份参考图，精灵图以它作 I2I 参考，保证同一角色两张图的身份、配色与机位一致。**图 A**：五人共用守望者的直出原图作 I2I 风格参考，提示词明确只抄画风与机位、不抄人 |
| 提示词来源 | `scripts/character_asset_specs.json` + `scripts/generate_character_assets.mjs` 的构图骨架 |
| 人工绘制 | 无。全部像素由模型生成，仓库侧只做键控、去色溢与归一化 |

## 文件清单

### 图 B 关卡内实机精灵（正俯视，朝右，不画武器）

每名角色两张：身份参考图 + 实机精灵。参考图必须一并归档，它是精灵能复现的前提——
只留精灵的话，下次想微调就得从零重开一条 I2I 链。

| 文件 | 角色 | 采用版本 | 生成日期 | 直出尺寸 |
| --- | --- | --- | --- | --- |
| `Watcher_identity_reference.png` | 守望者 | v03 | 2026-08-21 | `1254 x 1254` |
| `Watcher_sprite.png` | 守望者 | v03 | 2026-08-21 | `1254 x 1254` |
| `EagleEye_identity_reference.png` | 鹰眼 | v01 | 2026-08-22 | `1254 x 1254` |
| `EagleEye_sprite.png` | 鹰眼 | v01 | 2026-08-22 | `1254 x 1254` |
| `Bastion_identity_reference.png` | 堡垒 | v05 | 2026-08-22 | `1254 x 1254` |
| `Bastion_sprite.png` | 堡垒 | v05 | 2026-08-22 | `1254 x 1254` |
| `Runner_identity_reference.png` | 疾行者 | v02 | 2026-08-22 | `1254 x 1254` |
| `Runner_sprite.png` | 疾行者 | v02 | 2026-08-22 | `1254 x 1254` |
| `Breacher_identity_reference.png` | 破阵者 | v04 | 2026-08-23 | `1254 x 1254` |
| `Breacher_sprite.png` | 破阵者 | v04 | 2026-08-23 | `1254 x 1254` |

破阵者 2026-08-23 从 v02 换到 v04。v02 五项量化判据全过并已落地，但实景复核发现
画面里没有压住握把的拳头（前缘是护甲弧面，几何拳心判据量的是"前缘窄带质心"而不是
"那里有没有手"，因此照样读作对齐），实机放大看枪与身体之间有可见缝隙。
v04 的措辞补了 CRITICAL FACING 与 CRITICAL GRIP 两段，拳头是明确画出的团块，
撬棍对角线也一并恢复。详见 `docs/execution/2026-08-23-remaining-heroes-portraits.md`。

五名角色的图 B 已全部生成并落地。被量化门控拦下的废版不归档（留在 gitignored 的
`TmpGenerate/` 内），拦下的原因与实测值记录在
`docs/execution/2026-08-22-remaining-heroes-gameplay-sprites.md`。

本目录另有一个 `sprite-watcher-raw.png`，是 2026-08-18 的斜视废图，**只作反例保留**，
不要用它生成产物（原因见本文末）。

采用版本可用一条命令复核，不依赖任何临时文件：

```
python scripts/inspect_character_candidates.py <id> --from-archive
python scripts/process_character_assets.py sprite <id> --from-archive
```


### 图 A 战前档案立绘

五人图 A 已于 2026-08-23 全部落地。守望者是母版（2026-08-18 直出、人手抠图，
沿用旧命名），其余四人走 `generate_character_assets.mjs --kind portrait` 生成、
`inspect_character_candidates.py --kind portrait` 门控、
`process_character_assets.py portrait` 后处理，并以守望者直出原图作 I2I 风格参考。

| 文件 | 角色 | 采用版本 | 生成日期 | 直出尺寸 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `portrait-watcher-raw.png` | 守望者 | 母版 | 2026-08-18 | `2048 x 2048` | 直出原图，洋红键控底、RGB。四人图 A 的 I2I 风格参考 |
| `Watcher_portrait_keyed.png` | 守望者 | 母版 | 2026-08-18 | `920 x 1933` | **已抠图**中间件，运行时产物的直接输入 |
| `EagleEye_portrait.png` | 鹰眼 | v02 | 2026-08-23 | `1254 x 1254` | 直出原图 |
| `Bastion_portrait.png` | 堡垒 | v03 | 2026-08-23 | `1254 x 1254` | 直出原图 |
| `Runner_portrait.png` | 疾行者 | v01 | 2026-08-23 | `1254 x 1254` | 直出原图 |
| `Breacher_portrait.png` | 破阵者 | v01 | 2026-08-23 | `1254 x 1254` | 直出原图 |

图 A 每角色只归档一张——风格锚点是守望者母版、全五人共用，不存在 per 角色的 I2I 链
需要复现（图 B 则必须连身份参考图一起归档）。

废版不归档（留在 gitignored 的 `TmpGenerate/`），拦下原因与实测值记录在
`docs/execution/2026-08-23-remaining-heroes-portraits.md`。

采用版本可用一条命令复核：

```
python scripts/inspect_character_candidates.py <id> --kind portrait --from-archive
python scripts/process_character_assets.py portrait <id> --from-archive
```

`portrait-{eagle-eye,bastion,runner,breacher}.svg`（Kenney CC0 矢量切片）保留在
`processed/characters/` 作为回退，但 `PreloadScene` 已不再加载它们。

#### 守望者母版的两条历史记录，都要更正

**第一条：它没有缺脚。** `CHARACTER_PORTRAIT_PROMPTS.md` 4.2 曾称
「腿和双脚在画布底边被切断」「旧图缺脚已淘汰」并记主体边界为 `y 64..2047`，
本文件此前也据此写了「五人图 A 正式补齐时会走新管线整体重做」。
2026-08-23 用生产键控判据实测：主体 bbox 为 `587,78..1459,1963`，**下边留边 85px，
两只靴子完整在画面内**。那组旧数字是用一个漏判背景的键控量出来的（把 ±2 噪声的洋红
算成了主体）。母版合格，本轮一个像素都没有改动它，反而正是靠它锁住了四人的画风。

**第二条：`Watcher_portrait_keyed.png` 是本目录唯一一个不是直出的文件。**
它原本就是运行时产物本身（`processed/characters/portrait-watcher.png`），
2026-08-18 由人手完成抠图后直接落到 processed 目录，不经任何脚本。两个实测缺陷：

1. **过采样。** `920 x 1933` 在战前整备页最多只占 `219 x 460` 物理像素
   （展示区 `188 x 230`、相机 zoom 上限 2），约 4.2 倍线性过采样，
   单文件 2.9MB 首屏带宽。
2. **键控残留。** 2840 个可见洋红像素（含 alpha 255 的不透明边缘），
   与 `sprite-watcher.png` 当年那 128 个残留同类。

2026-08-22 把它移到本目录当归档源，运行时产物改由脚本派生：

```
python scripts/process_character_assets.py portrait-downsample watcher
```

该分支跑 `remove_magenta_background` 去色溢，再按预乘 alpha 降采样到高 480，
产物 `228 x 480` / 140KB，可见洋红 0，展示尺寸与降采样前逐像素一致。
**不从 `portrait-watcher-raw.png` 重新键控**：那会连带改变边缘与去色溢结果，
等于在「只解决体积」之外改观感。

2026-08-23 新增的 `portrait` 分支（洋红直出 → 完整链）**可以**处理母版，
实测产物与在用的 `portrait-watcher.png` 在 109440 像素中仅 22 像素不同（`0.02%`，
最大通道差 26，超过 8 的只有 3 像素），等价性因此是可核对的。
但**在用产物仍走 `portrait-downsample`**：既然已经实景验收过，就不为了统一管线去换一张
0.02% 不同的图。

## `sprite-watcher-raw.png` 淘汰原因

保留该文件仅作为反例记录，**不要再用它生成产物**。

提示词要求 `straight 90 degree bird's eye`，但模型给出的是高角度斜视图：画面里
能看到脸、鼻、下巴、大腿和一整只从侧面看的靴子。实机 `Player` 会让人物按瞄准角
绕几何中心连续旋转 360°，这张图转起来读作「一具躺平的身体在打转」。

实测判据（对照 Kenney 正俯视素材与已验收的 tank_boss 帧）：

| 判据 | 正俯视基准 | 本图 |
| --- | --- | --- |
| 下三分之一质量占比 | `0.279–0.338` | `0.163` |
| 头部质心相对高度 | `0.489–0.512` | `0.333` |
| 拳心垂直位置 | `0.510–0.515` | `0.321` |

机位缺陷无法在后处理修复——斜视图的腿和靴子是画出来的内容，抠图与归一化都不能
把它变成正俯视。因此重新生成，并新增
`scripts/inspect_character_candidates.py` 作为量化门控，避免同类废图再次进入运行时。

## 许可与边界

1. 这批图是项目内生成资产，不伪装成来源明确的第三方游戏素材。
2. 提示词内明确排除现实军队徽标、国旗、品牌 logo 与可识别的版权角色特征。
3. 与仓库内 Kenney（CC0）素材分开存放，不混淆两者的许可归属。
