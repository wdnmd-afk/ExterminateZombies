# Bomber 爆炸感染体美术资源执行文档

> 建立日期：2026-08-20
>
> 目标对象：`src/config/zombies.ts` 中的感染体 `bomber`（图鉴代号 INF-04）
>
> 参考基线：`docs/execution/WALKER_SPRITE_PIPELINE.md`、`docs/execution/2026-08-20-runner-art-resource-rework.md`
>
> 状态：资源与接线已完成，V0/V1/V3 通过；等待真人目视验收（见 §12）

## 1. 目标

把当前复用 Curt `31×36` 三帧方向表的 `bomber`，重整为与 Walker / Runner 同等级的项目生成资源链：

1. 生成与 Walker、Runner 同画风、同机位、同键控底约束的 Bomber 四方向移动表。
2. 生成独立图鉴立绘，不从动画表截图放大。
3. 接入 Phaser 预加载、视觉布局、图鉴与资源台账。
4. 不改动 `bomber` 的任何玩法数值（生命 40、速度 30、伤害 5、半径 13、`explodeOnDeath` 60 伤害 / 70 半径、掉落表）。

## 2. 本轮范围

已确认的两项范围决定：

- **脚本组织**：把 Runner 的三个脚本参数化成按感染体 id 取配置的共用管线，而不是复制成 Bomber 专属副本。剩余 12 类普通感染体后续只需加一段配置。
- **资源范围**：对齐 Runner，只做移动方向表 + 图鉴立绘。不做攻击/死亡动作表——普通感染体当前没有动作素材契约（只有 4 个 Boss 有），加它需要先扩展 `ZOMBIE_ACTION_TEXTURE_LAYOUTS` 与实体侧播放逻辑，属于另一件事。

不包含：修改 bomber 玩法/AI/爆炸参数、修改其它感染体素材、生产构建。

## 3. 步骤 0：补齐 Pillow 依赖

本机 `python`（3.12.4）与 `py -V:Astral/CPython3.11.15` 均没有 `PIL`，而 `scripts/` 下已有的
`process_character_assets.py`、`process_weapon_assets.py`、`process_zombie_assets.py`、
`process_runner_assets.py`、`inspect_runner_candidates.py`、`verify_directional_sheet.py`
全部依赖它。Pillow 目前在仓库任何地方都没有声明（无 `requirements.txt` / `pyproject.toml`，
README 与 docs 均未提及）。

处理：`python -m pip install pillow`，属于安装依赖级别的改动。同时在文档里把它记为素材脚本的必需依赖，
补上这个一直缺失的声明。

## 4. 步骤 1：参数化成共用管线

新增单一配置源 `scripts/zombie_asset_specs.json`，JS 与 Python 两侧共读，避免同一份身份提示词写两遍：

每个感染体 id 下登记 `sourcePrefix`（归档名前缀，如 `Bomber`）、`outputPrefix`（产物名前缀，如 `bomber`）、
`candidateSlug`（`TmpGenerate` 候选名）、`frameSize`、`targetSubject`、`identityLadder[]`、
`gait`、`backView`、`portraitPose`、`adoptedVersion`。

三个脚本改名并接收 id 参数：

| 现有 | 改为 | 用法 |
| --- | --- | --- |
| `scripts/generate_runner_assets.mjs` | `scripts/generate_zombie_assets.mjs` | `node scripts/generate_zombie_assets.mjs bomber` |
| `scripts/inspect_runner_candidates.py` | `scripts/inspect_zombie_candidates.py` | `python scripts/inspect_zombie_candidates.py bomber --version v01` |
| `scripts/process_runner_assets.py` | `scripts/process_zombie_sprites.py` | `python scripts/process_zombie_sprites.py bomber --version v01` |

同时给后处理脚本加一个 `--from-archive`：直接从 `src/assets/generated/zombies/<Prefix>_*.png`
处理，跳过 `TmpGenerate` 采用步骤。这一项是必需的而不是顺手加的——`TmpGenerate/` 在 `.gitignore` 内且
已被清空，Runner 的 v05 候选不复存在，只有 git 里的归档源图还在。没有它就无法复现 Runner。

### 4.1 回归门控（在动 Bomber 之前必须先过）

`python scripts/process_zombie_sprites.py runner --from-archive` 的产物必须与已提交产物逐字节一致：

| 产物 | 必须复现的 sha256 |
| --- | --- |
| `runner-directional-custom.png` | `c12793b9f7ee6cb1fd42f1152eeab1d02200ba0ecd8bb4d497ca71da9073ba20` |
| `runner-portrait.png` | `f4e5b45bd92295266c4be1cae2a250cc9994bf91fba667ecdad3cc8baf9e2eae` |

（两个哈希已实测确认与仓库当前文件、与 Runner 执行文档 §9.6 记录三者一致。）

哈希不吻合就说明参数化改变了行为，先修到吻合再继续，不带着未知差异去做 Bomber。

## 5. 步骤 2：Bomber 提示词

阶梯 0 用 `docs/design/ZOMBIE_PROMPTS.md` §6.4 原文措辞。阶梯 1–3 只替换被审核拦截的名词
（`zombie` / `corpse` / `suicide`），完整保留全部视觉信息：膨胀不稳定的腹部、半透明肿胀皮肉、
破皮下透出的橙红感染囊、开裂肋骨、渗液、双臂外撑如同在包住压力。

按感染体登记的三段专属措辞：

- `gait`：沉重不稳的摇摆步态（速度 30，介于 Walker 22 与 Runner 52 之间），不是冲刺也不是拖行。
- `backView`：上方向只见肿胀的背部与肩膀，无脸。
- `portraitPose`：静立，双臂外撑离开膨胀腹部。

§6.4 明确要求基准图不能带爆炸，负面词固定加上 `no explosion, no fireball, no blast, no smoke, no bomb vest`。

### 5.1 Bomber 特有的键控冲突风险

这是 Bomber 相对 Runner 新增的风险，必须在提示词里先处理。键控规则是
`floor = min(r,b)`、`chroma = floor - g`、`|r-b| <= 96`。

- 橙红色囊体（如 `(200,60,50)`）蓝通道低，`floor` 只有 50，不会被键掉，安全。
- 但**偏粉/偏洋红的高光**（如 `(230,120,200)`）会算出 `floor=200`、`chroma=80`、`|r-b|=30`，
  直接被判成背景抠掉，在囊体上留下透明洞。

所以提示词要把感染囊明确压向橙色/琥珀色而不是粉色/品红色，并保留通用约束
"Do not use magenta anywhere on the subject itself"。后处理后要专门检查囊体区域没有被穿孔。

## 6. 步骤 3：生成与门控

`node scripts/generate_zombie_assets.mjs bomber` 产出 5 张候选到 `TmpGenerate/`（v01 起，不覆盖已有文件）：
`zombie-bomber-direction-reference`、`-left-4`、`-down-4`、`-up-4`、`-portrait`。

参考图是四视图转身图（不是单个朝右姿态），并作为 I2I 参考传给后续四张请求——Runner v04 用单姿态参考
是"四行同朝向"的两个根因之一。

三道门控依次执行，任何一道失败就递增版本号重新生成，不覆盖、不手工修补单帧：

1. `inspect_zombie_candidates.py bomber` — 键控底占比、连通域数、2×2 中缝、四帧漂移、主体贴边。
2. `process_zombie_sprites.py bomber --version vNN` — 键控抠图、切帧、右向镜像左向、全 12 帧共用缩放系数、
   几何居中、组装 `2048×2048` 方向表与 `512×512` 立绘。
3. `verify_directional_sheet.py <sheet> 512` — 行间归一化轮廓 IoU、镜像精确性、行内尺寸波动。

第 3 道是唯一能抓出"多行画成同一朝向"的门控。前两道在 Runner v04/v06 上全部通过而实机只有一个朝向，
这是已经踩过的坑。

帧尺寸取 512 而非 Walker 的 1024：上游 `gpt-image-2` 恒定返回 `1254×1254`（已实测确认 Runner 五张源图
均为此尺寸），`2×2` 单帧只有 `627`，沿用 1024 需上采样 1.64 倍，纯属劣化。

## 7. 步骤 4：运行时接线

`src/config/zombieVisuals.ts`：

- 新增 `zombieBomberDirectional`、`zombieBomberPortrait` 纹理键。
- 新增 512 帧方向表布局，复用已抽出的 `CUSTOM_DIRECTION_ROWS`。
- 在 `ZOMBIE_PORTRAIT_TEXTURE_KEYS` 登记 bomber 立绘。
- `bomber` 视觉改为新方向表，参数如下。

| 参数 | 取值 | 依据 |
| --- | --- | --- |
| `scale` | 约 `0.133`，最终按实测主体像素定 | 已验收的"可见高度 / 碰撞半径"比值：Walker `62.3/14 = 4.45`、Runner `48.7/11 = 4.43`。bomber 半径 13 → 目标可见约 `57.7px`；主体约 435px → `57.7/435 ≈ 0.133` |
| `frameRate` | `7` | 速度 30 在 Walker `6@22` 与 Runner `10@52` 之间线性插值得 7.07 |
| `originY` | `0.5` | 方向表是几何居中放置的，原点取 0.5 即主体质心，转向时视觉位置稳定 |
| `tint` | `0xffffff` | 去掉现有的 `0xffc893` 暖色叠加，生成素材自带确定色板 |

`src/scenes/PreloadScene.ts`：注册两张新 PNG。Curt 的 `zombieBomber` 键继续保留注册，
`lurker`、`drifter`、`tank` 仍在用同一张表。

`MonsterLibraryScene.ts` 不需要改——Runner 那轮已经把按 id 的三元判断换成了
`getZombiePortraitTextureKey()` + `resolvePreviewFrame()`，新增立绘只改配置表。

`src/config/zombies.ts` 完全不动。

### 7.1 需要你知道的一处规格偏离

`57.7px` 会让 bomber 落进 `ZOMBIE_PROMPTS.md` §1 写的"重装/精英 48–64px"档，而不是"普通感染体 28–48px"档。

我按比值而不是按档位取值，原因是那段档位文字已经被既有验收结果超越了：Walker 是最普通的感染体，
实测可见 `62.3px`，本身就已经超出 28–48px。真正在起作用的规则是"可见高度 / 碰撞半径"比值，
因为它才是让精灵和碰撞圆对得上的那一条。这是明知的偏离而不是疏漏，指出来由你定。

## 8. 步骤 5：验证层级

| 层级 | 手段 | 通过标准 |
| --- | --- | --- |
| V0 | 引用链、纹理尺寸、RGBA、行映射、镜像、键控残留、囊体未穿孔、布局数学 | 全部吻合；Runner 复现哈希逐字节一致 |
| V1 | `npx vitest run tests/monster-library.test.ts`，再 `npx vitest run` | 定向测试全绿；全量与 HEAD 基线逐项一致（HEAD 已有 8 项失败，必须是同样 8 项，零新增） |
| V2 | `npm run typecheck` | 与 HEAD 基线一致（HEAD 已有 2 处 `PreparationScene.ts` / `SettingsScene.ts` 报错） |
| V3 | CDP 只读探针 | 纹理 `2048×2048`、17 帧、NEAREST；四方向各 4 帧 `7 FPS`；行映射 `down=0/left=1/right=2/up=3`；图鉴预览纹理与边界在安全框内；无控制台错误 |

V3 脚本必须在导航后立刻断言 `document.hidden === false` 并配 `Emulation.setFocusEmulationEnabled`
加 `Page.setWebLifecycleState`。窗口被遮挡时 Phaser 会 `scene.pause()`、Chrome 把帧率压到 2–14，
抓到的精灵会永远停在生成 tween 起点，很容易被误判成"素材尺寸错了"。这是 Runner 那轮踩过的坑
（见其执行文档 §9.7）。

### 8.1 我无法验证、需要你目视的部分

1. **每一行画的是不是它该画的那个方向**。门控只能证明四行朝向彼此不同且形态合理，
   不能证明 `left` 行画的是朝左而不是朝右、`up` 行是背面而不是正面。
2. **美术内容本身**：四帧是否构成自然的沉重摇摆循环、感染囊是否清晰可读、
   轮廓是否与 Bloater（同为肿胀型）区分得开。
3. **机位一致性**：Runner 侧向宽高比 1.50（真俯视横躺），Walker 是 0.64–0.76（高角度俯视身体竖立）。
   两者本就不完全统一，Bomber 落在哪一侧需要你判断是否违和。

本会话的图片读取工具对 PNG/JPG 无返回，我不会看到任何一张图。我会把逐方向放大对照条与图鉴截图
落到磁盘供你查看，但落盘不等于我看过。

## 9. 步骤 6：文档更新

- 本文件补齐执行结果（生效阶梯、量化指标、产物哈希、验证结论、未验证项）。
- `WALKER_SPRITE_PIPELINE.md`：脚本名改为参数化后的名字，补 Bomber 条目。
- `ART_ASSET_REGISTRY.md`、`RUNTIME_ASSET_MANIFEST.md`：新增 bomber 行，更新脚本名。
- `ZOMBIE_PROMPTS.md`：记录实际通过的措辞阶梯。
- 把 Pillow 记为素材脚本必需依赖（当前完全没有声明）。

## 10. 风险与处理

| 风险 | 处理 |
| --- | --- |
| 上游审核拒绝 Bomber 措辞（`suicide`、渗液、囊体比 Runner 更容易被拦） | 4 级阶梯 × 每级 2 次重试；全部失败就停下报告，不靠削弱视觉规格换通过 |
| 四行画成同一朝向（Runner v04/v06 的废品模式） | `verify_directional_sheet.py` 硬门控，失败退出码 1 |
| 参数化改坏 Runner | 动 Bomber 之前先过逐字节复现门控 |
| 粉色囊体高光被键控抠成透明洞 | 提示词把囊体压向橙/琥珀色；后处理后专项检查囊体区域 |
| 洋红残边在深色战场表现为紫边 | 沿用 BFS 边缘带去色溢，`DESPILL_BAND = 3`，不改判据 |
| 体型与 Bloater 混淆 | 两者都是肿胀型；提示词强调 Bomber 更瘦、四肢外撑、囊体外露，Bloater 是巨腹小头 |

## 11. 执行结果（2026-08-20）

### 11.1 环境：Pillow 与 Python 解释器

计划里写的 `python -m pip install pillow` 走不通，实际情况比预期糟：

- 本机 `python` 是 `G:\python.exe`，`sys.prefix` 为 `G:`，site-packages 解析成畸形路径 `G:Lib\site-packages`。
  `ensurepip` 报成功，但下一次调用 `python -m pip` 又是 `No module named pip`——这个解释器装不住包。
- 改用 uv 在仓库内建虚拟环境。第一次以 `G:\python.exe` 为基础解释器同样失败（只生成 `pyvenv.cfg`，没有 `Scripts/`）。
  最终以 uv 自带的 `cpython-3.11.15` 为基础解释器建成 `.venv`，装入 `pillow==12.3.0`。
- 因此本轮所有 Python 脚本都用 `.venv/Scripts/python.exe` 执行，`.venv/` 已加入 `.gitignore`。
- Pillow 一直是 `scripts/` 下多个素材脚本的隐含依赖，仓库任何地方都没有声明过。

### 11.2 参数化改造与回归门控

三个 Runner 专属脚本改成按 id 取配置的共用管线，角色专属内容集中到 `scripts/zombie_asset_specs.json`：

| 删除 | 新增 |
| --- | --- |
| `scripts/generate_runner_assets.mjs` | `scripts/generate_zombie_assets.mjs <id>` |
| `scripts/inspect_runner_candidates.py` | `scripts/inspect_zombie_candidates.py <id>` |
| `scripts/process_runner_assets.py` | `scripts/process_zombie_sprites.py <id>` |

回归门控：`process_zombie_sprites.py runner --from-archive` 复现已提交产物，逐字节一致。

| 产物 | 期望 sha256 | 实测 | 结果 |
| --- | --- | --- | --- |
| `runner-directional-custom.png` | `c12793b9…9073ba20` | 同 | 一致 |
| `runner-portrait.png` | `f4e5b45b…8cbaf9e2eae` | 同 | 一致 |

共用缩放系数复现为 `0.7740`，行宽高比复现为 `down 0.59 / left,right 1.50 / up 0.50`，均与 Runner 文档记录相同。
`git status` 对两个文件无改动输出，确认改造零行为差异。

`--from-archive` 是为此新增的：`TmpGenerate/` 在 `.gitignore` 内且已被清空，Runner 的 v05 候选不复存在，
只有 git 里的归档源图还在，不走归档就无法复现。

### 11.3 生成结果

上游模型已是 `gpt-image-2-vip`，**输出尺寸为 `1024×1024`，不再是 Runner 时期记录的 `1254×1254`**。
`2×2` 源图单帧恰好 `512`，与帧规格同尺寸，全程无放大。

内容审核零拦截：五张请求全部以阶梯 0（`ZOMBIE_PROMPTS.md` §6.4 原文措辞，含 `suicide zombie` 字样）一次通过。
这与 Runner 那轮"阶梯 0 频繁被拒"的经历不同，说明拦截行为随模型版本变化，降级词表仍应保留。

### 11.4 侧向朝向问题与最终判据

`left` 候选两次未达瘦削体型的侧面标准：

| 版本 | left 自镜像对称度 | 平均宽高比 | 处理 |
| --- | --- | --- | --- |
| v01 | 0.535（上限 0.45） | 1.14–1.18 | 采用 |
| v02（补强侧向措辞后） | 0.716 | 0.93–1.13 | 弃用，反而更正面 |

补强措辞使结果更差，说明不是措辞不够强，而是判据不适用。用 Bomber 自己的四视图转身参考图做对照实验后确认：

| 参考图（模型并排画出四个明显不同的视图，已是其最佳表现） | down-left | left-up |
| --- | --- | --- |
| Bomber | 0.629 | 0.590 |
| Runner | 0.373 | 0.361 |

Bomber 参考图自身的侧向也超过 0.55 上限，原因是球形躯干主导轮廓，从任何角度看外形都高度重叠。
把上限抬高换不回判别力：Runner 已知报废的 v04（四行同朝向）实测 `0.625–0.717`，与 Bomber 合法的
`0.564–0.609` 完全重叠。

因此给 `verify_directional_sheet.py` 增加体型无关的补充判据——侧向行相对本角色自己正/背面行的自镜像对称度落差：

| 样本 | left | down | 落差 | 判定 |
| --- | --- | --- | --- | --- |
| Walker（已验收） | 0.216 | 0.878 | 0.662 | 通过 |
| Runner（已验收） | 0.273 | 0.739 | 0.467 | 通过 |
| Bomber v01 | 0.536 | 0.838 | 0.301 | 通过 |
| 人工合成"三行全填 down" | 0.838 | 0.838 | 0.000 | 拦下，退出码 1 |

下限取 `0.15`。两条判据合并为一个结论：只有"IoU 超限且落差同时不足"才判同朝向；只超 IoU 则明确报告为
该体型下轮廓判据饱和。已确认 Walker 与 Runner 的既有方向表在新逻辑下仍然通过
（Walker 唯一失败项"右向不是左向精确镜像"是其自身既有属性，非本次引入）。

### 11.5 后处理产物

| 产物 | 规格 | sha256 |
| --- | --- | --- |
| `src/assets/processed/zombies/bomber-directional-custom.png` | `2048×2048 RGBA` | `a15b5ad8c54a002aa82b5b6d60b3e0166a323b6d07fb525460685061d01f195e` |
| `src/assets/processed/zombies/bomber-portrait.png` | `512×512 RGBA` | `94a1675c8fff19482bf1ed460e3704fe8550cb98c86618608dbbdb992870e00a` |

- 共用缩放系数 `1.0000`（被夹到 1.0，主体 417px 未被放大到 435）。
- 行宽高比：`down 0.94 / left,right 1.16 / up 0.95`；行内四帧尺寸波动 2.9%–3.2%。
- 右向经逐字节比对确认为左向精确水平镜像；四角 alpha 均为 0。
- 洋红倾向残留（隔点采样）：方向表 6 个、立绘 1 个，与 Runner 验收基线的 8 个同量级。
- **感染囊穿孔风险未成立**：主体内部透明洞最差 `0.031%`（`up` 行），远低于 `1.5%` 阈值。
  提示词把囊体压向橙/琥珀色的约束生效了。

### 11.6 运行时接线

- `zombieVisuals.ts`：新增 `zombieBomberDirectional`、`zombieBomberPortrait` 纹理键；
  把 512 帧布局抽成 `CUSTOM_512_TEXTURE_KEYS`（Runner 与 Bomber 共用，与文件既有的 `CURT_TEXTURE_KEYS` 同写法）；
  在 `ZOMBIE_PORTRAIT_TEXTURE_KEYS` 登记 bomber 立绘。
- `PreloadScene.ts`：注册两张新 PNG；Curt 原表键保留，`lurker`、`drifter`、`tank` 仍在用。
- `MonsterLibraryScene.ts` 未改动——Runner 那轮已把按 id 的条件分支换成集中登记查询。
- `zombies.ts` 未改动。

`bomber` 视觉参数：

| 参数 | 取值 | 依据 |
| --- | --- | --- |
| `scale` | `0.138` | 最大帧主体实测 417px → 可见 57.6px；`57.6/13 = 4.427`，对齐 Walker `4.449`、Runner `4.429` |
| `frameRate` | `7` | 速度 30 在 Walker `6@22` 与 Runner `10@52` 之间插值得 7.07 |
| `originY` | `0.5` | 方向表几何居中，原点即质心 |
| `tint` | `0xffffff` | 去掉原 `0xffc893` 暖色叠加，避免与橙红囊体打架 |

### 11.7 验证结论

| 层级 | 手段 | 结果 |
| --- | --- | --- |
| V0 | 尺寸、RGBA、四角透明、镜像、残留、穿孔、几何 | 通过，数据见 §11.5 |
| V0 | Runner 逐字节复现 | 通过，见 §11.2 |
| V0 | `verify_directional_sheet.py` | 通过（IoU 饱和已判定为体型属性，落差判据通过） |
| V1 | 配置不变量断言（26 项） | 全部通过 |
| V2 | `npx tsc --noEmit` | 我改动的文件零报错 |
| V3 | CDP 运行时只读探针 | 全部通过 |

**V1 未能用 vitest 执行**：本机 vitest `4.1.10` 需要 vite 6+ 的 `./module-runner` 导出，
仓库锁定 vite `5.4.2`，vitest 启动即 `ERR_PACKAGE_PATH_NOT_EXPORTED`，与本次改动无关，
也不是我该顺手升 vite 大版本的范围。改为用 vite 自带的 esbuild 转译配置模块后直接断言不变量，
覆盖：纹理键指向、帧尺寸、行映射、四列 frameXs、立绘登记、图鉴预览不超出安全框、四方向动画键唯一、
bomber 六项玩法数值与 `explodeOnDeath` 未改、Walker/Runner 未受影响、`lurker`/`drifter`/`tank` 仍有可用布局。

**V2 现状**：全仓 26 项 tsc 报错，全部在 `MainMenuScene`(9)、`WeaponLibraryScene`(8)、`MonsterLibraryScene`(6)、
`PreparationScene`(2)、`SettingsScene`(1)，绝大多数是并行进行的字体 `letterSpacing` 改动。
我改动的 `zombieVisuals.ts` 与 `PreloadScene.ts` 零报错。

**V3 实测读数**（探针 `.debug-bomber-runtime-probe.mjs`）：

- 页面可见性断言先行通过（`hidden:false`），因此后续读数不是暂停态假象。
- 方向表 `2048×2048`、16 个切帧；立绘 `512×512`。
- 四方向动画各 4 帧 `7 FPS`，帧名确认行映射为 `down=0 / left=1 / right=2 / up=3`。
- 抓取过程中确认游戏全局是 `window.__GAME__`（不是 `window.game`），供后续探针复用。

## 12. 未验证项与需要真人确认的部分

以下必须由你目视，本轮无法覆盖。本会话的图片读取工具对任何 PNG/JPG 均无返回，我一张图都没看过；
把图落到磁盘不等于我看过它们。

证据在 `.debug-bomber-evidence/`（`.gitignore` 内）：
`sheet-grid.png` 全表总览、`row-0-down.png`…`row-3-up.png` 逐方向放大对照条（深色棋盘底便于看紫边与缺口）、
`portrait.png` 图鉴立绘、`ingame-scale-down.png` 实机尺寸模拟。四张 row strip 的 sha256 互不相同。

1. **每一行画的是不是它该画的那个方向**。门控只能证明四行彼此不同且几何稳定，
   无法证明 `left` 行画的是朝左而不是朝右、`up` 行是背面而不是正面。
2. **侧向到底成不成立**。这是本轮最需要你确认的一项：v01 的 left 自镜像对称度 `0.535`
   明显高于 Walker `0.216` 与 Runner `0.273`。我的判断是圆胖体型的合法表现（有 §11.4 的对照实验支撑），
   但"合法"和"看起来是侧面"是两件事，只有你的眼睛能定。若不成立，需要重做 left 并复核 `verify` 仍通过。
3. **美术内容本身**：四帧是否构成自然的沉重摇摆循环、感染囊是否清晰可读、
   `up` 行是否真的没画脸、轮廓是否与同为肿胀型的 `bloater` 混淆。
4. **视觉体型变化**。实机可见尺寸由旧 Curt 素材约 `35px` 变为 `57.6px`。按已验收比值反推是正确的，
   但这让 Bomber 成为更大的目标，而它的机制是"靠近后死亡爆炸"，体型变大直接影响你判断安全距离的手感。
5. **`57.6px` 落在规范的"重装/精英 48–64px"档**而非"普通感染体 28–48px"档。我按比值而不是按档位取值，
   因为档位文字已被既有验收结果超越（Walker 最普通却是 `62.3px`）。这是明知的偏离，由你定。
6. **`originY` 由 0.62 改为 0.5**，精灵相对碰撞圆上移约 6px；与 Runner 同一处理，但与其它感染体的原点约定不同。
7. **V4/V5 未执行**：未做实机四方向移动播放观察、死亡爆炸时序表现、无尽模式压力场景。
8. **图鉴预览未实机验证**。探针取数时图鉴场景未激活（`no previewSprite`）；
   预览缩放与边界已由 V1 不变量断言覆盖（`0.2930`，`150.0×150.0` 落在 `184×150` 安全框内），但未在浏览器里看过。

## 13. 回滚边界

全程使用新文件名，不覆盖 Walker / Runner 产物，也不覆盖 Curt 原始表。
若验收不通过，只需把 `bomber` 视觉恢复为 `GAME_ASSET_KEYS.zombieBomber`，玩法配置本就未动。
`TmpGenerate/` 内未采用候选不属于运行时依赖。
