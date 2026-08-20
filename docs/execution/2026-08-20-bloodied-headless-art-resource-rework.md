# Bloodied 血污屠夫 / Headless 无头感染体美术资源执行文档

> 建立日期：2026-08-20
>
> 目标对象：`src/config/zombies.ts` 中的 `bloodied`（血污屠夫）与 `headless`（无头感染体）
>
> 参考基线：`docs/execution/2026-08-20-drifter-art-resource-rework.md`、`WALKER_SPRITE_PIPELINE.md`
>
> 状态：两类资源与接线均已完成，三道门控全过，实机探针通过，等待真人目视验收（见 §10）
>
> 合并成一份文档的原因：两类在同一会话内完成，触发并共用同样三处管线改动（§4），
> 拆成两份会把同一段推理写两遍。逐类差异集中在 §5 与 §6。

## 1. 目标

把 `bloodied`、`headless` 从复用 Zombies 1.1 的 `48×64` 三帧方向表，重整为与
Walker / Runner / Bomber / Lurker / Drifter 同等级的项目生成资源链：四方向移动表 +
独立图鉴立绘 + 运行时接线 + 台账登记，不改动两类的任何玩法数值。

两类的玩法数值均逐项未变，已由 §9.2 断言：

| 感染体 | 生命 | 速度 | 伤害 | 攻击间隔 | 半径 | 得分 | 掉落 | 能力 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `bloodied` | 120 | 25 | 19 | 1100 | 17 | 30 | 5 项 | 无 |
| `headless` | 165 | 20 | 22 | 1250 | 17 | 36 | 4 项 | 无 |

## 2. 本轮范围

沿用既有范围决定：走按 id 取配置的共用管线；只做移动方向表 + 图鉴立绘，不做攻击/死亡动作表。

不包含：修改两类玩法/AI、修改其它感染体素材、生产构建、修复既有的 Vitest 依赖冲突。
本轮期间 `feral` 由并行会话接入，本文件未代其收尾（其立绘登记已由那一轮补上）。

## 3. 两类各自的键控风险

三类风险同源于同一组判据 `floor = min(r,b)`、`chroma = floor - g`、`|r-b| <= 96`：

### 3.1 Bloodied：血污

血污既是核心识别特征也是风险来源，但实测结论与直觉相反——**纯红色血是安全的**：

| 颜色 | floor | chroma | 是否被抠 |
| --- | --- | --- | --- |
| 干涸暗血 `(105,35,30)` | 30 | -5 | 否 |
| 鲜红血 `(190,25,30)` | 30 | 5 | 否 |
| 粉红血高光 `(230,110,190)` | 190 | 80 | **是，三条全部命中** |

红色的蓝通道低，`min(r,b)` 就低，所以红血不会命中 `floor >= 110`。真正危险的只有被画成
粉红/洋红的血高光。处理：把血压向暗红褐与铁锈红，负面词加 `bright pink blood`、`magenta blood`。

### 3.2 Headless：颈部断面

与 Lurker 的颅内组织完全同源。粉红色肉 `(235,150,190)` 会算出 `floor=190`、`chroma=40`、
`|r-b|=45`，三条全部命中——而颈部断面正是本类唯一的识别特征，穿孔等于素材报废。
处理：断面组织压向暗红褐 `(90,45,40)`（`floor` 仅 40）与苍白椎骨 `(205,200,185)`（`chroma` 为 -15）。

**两类实测均为零误抠像素**，见 §7.2。

## 4. 三处管线改动

本轮触发的三处改动都是通用的，对后续所有感染体生效，且都不影响任何已归档源图与既有产物
（已由 §7.1 逐字节回归确认）。

### 4.1 新增 `frontView` 钩子

共用骨架的 `down` 请求原先硬编码"头顶和脸可见"。对无头感染体这是**自相矛盾的指令**，
会直接和它唯一的识别特征打架。改为可按感染体登记的 `frontView`，默认值就是原先那句原文，
所以已归档的四类感染体提示词**逐字不变**（已核对默认值字符串与原硬编码一致）。

`headless` 覆盖为"头的位置只有敞开的颈部断面与暴露的颈椎，从正上方看位于两肩之间；
外套正面、胸口与靴尖标明这是正面"。

### 4.2 新增跨文件体长一致性约束

`left`/`down`/`up` 是三次独立请求，`gridFor()` 只约束"同一张图内四帧同尺寸"，
**三张之间从来没有任何约束**。实测侧向体长只有正面的 75-80%——俯视下人转身，
头到脚的长度不该变，所以这是生成不一致，而不是合法的方向差异。

后果是硬的：`bloodied` v01 的 `left` 行第 1 帧主体 292×304，两轴都低于 `validate_frame` 的
"较长边 ≥ 帧高 60%"（307px），后处理直接抛错。而共用缩放系数按最大帧标定，
偏小的方向会在实机里表现为"转身就缩水"。

同一压缩在已验收资源上也存在，`bloodied` 只是第一个越线的：

| 感染体 | 侧向长边 / 正面长边 |
| --- | --- |
| `lurker`（已验收） | 316–335 / 379–386 ≈ 82–87% |
| `drifter`（已验收） | 360–365 / 401–426 ≈ 85–90% |
| `bloodied` v01 | 302–324 / 400–405 ≈ **75–80%** |

补的约束锚定 I2I 参考图（它本来就随每次方向请求一起传上去，此前没有任何一句话让模型对齐它）：

```text
IMPORTANT SIZE CONSISTENCY: draw the character at the same overall body length as in the
supplied reference image, measured from the top of the head to the feet along the body.
Turning to face a different direction must not make the body shorter or smaller;
a side view has the same body length as a front view, it is only oriented differently.
```

### 4.3 检视门控的侧向判据改为体型自归一化

**这一条是本轮最重要的改动，因为它修的是一个已经在空转的门控。**

`symmetrySideMax: 0.45` 是按 Walker / Runner 这类瘦削体型标定的（Walker 侧向 0.216），
对厚重体型系统性误报。实测四例：

| 感染体 | 侧向自镜像对称度 | 该门控结论 |
| --- | --- | --- |
| `bomber` v01（**已采用、已接线**） | 0.535 | 失败 |
| `bloodied` v01 | 0.550 | 失败 |
| `headless` v01 | 0.600 | 失败 |

即：**Bomber 作为已验收已上线的感染体，今天仍然过不了这道门控**。一个对已验收素材报错的
门控会被绕过，也就失去了门控的意义——而这个脚本自己的设计目标写的是"检视通过等价于处理可用"。

改法不是抬阈值。成品级 `verify_directional_sheet.py` 早就解决过同一问题，用的是
**侧向相对本角色自己正/背面的落差**，它对体型自归一化。把这条判据下移到候选阶段
（新增 `shared.symmetryGapMin = 0.15`），好处是生成后立刻拦下，不必等后处理完才发现。
`symmetrySideMax` 保留为参考打印，不再单独判定失败；`symmetryFacingMin` 仍是硬判据
（正/背面画成侧面是真实报废，且不受体型影响）。

改门控就必须证明它仍拦得住原本要拦的东西。Runner v04（已知报废的"四行同朝向"）候选
已不在 `TmpGenerate`，无法用真图复现，因此用该版已记录的实测值直接测判据函数，**10 项全过**：

| 用例 | 期望 | 实际 |
| --- | --- | --- |
| Runner v04（四行全约 0.60，落差≈0） | 拦下 | 拦下 |
| Runner v04 变体（0.62/0.60/0.61） | 拦下 | 拦下 |
| Walker / Runner v05 / Bomber v01 / Drifter v02（已验收） | 放过 | 放过 |
| Bloodied v01 / Headless v01（本轮） | 放过 | 放过 |
| 边界：落差恰好 0.15 | 放过 | 放过 |
| 边界：落差 0.149 | 拦下 | 拦下 |

四个已验收感染体用 `--from-archive` 实跑该门控，现在全部退出码 0（含此前失败的 Bomber）。

## 5. 一条被三次实测否证的做法：侧向补强措辞

两类的 v01 都只栽在侧向对称度这一项，于是各试了一版补强（v02），用的是**遮挡**这个
真正产生不对称的几何信号，而不是照抄 Bomber 那条泛泛的措辞。结果两类都更差：

| 感染体 | 不补强 | 补强后 |
| --- | --- | --- |
| `bomber`（2026-08-20 前轮实测） | 0.535 | 0.716 |
| `bloodied` v01 → v02 | 0.550 | **0.704** |
| `headless` v01 → v02 | 0.600 | **0.619** |

三个同向数据点，可以当规律用了：**对厚重体型追加侧向补强段落会拉高对称度。**
合理解释是 `ORIENTATION` 那条本身被标为"最重要要求"，后面再挂一大段点名胸、背、双肩的
文字，模型倾向于把点到的都画出来，结果更对称。

因此两类都不登记 `sideEmphasis`，只把这条规律写进 spec 注释（`_sideEmphasisNote`）。
v02 保留在 `TmpGenerate` 内作为实验记录，未采用。

## 6. 生成结果

两类各五张请求**全部走阶梯 0**（`ZOMBIE_PROMPTS.md` §6.8 / §6.9 原文措辞），
零次被内容审核拒绝——包括 `bloodied` 提示词里的 `butcher`、`blood` 与 `headless` 的
`corpse`、`torn open neck`。

采用版本均为 **v03**：v01 五张里四张直接沿用，v02 是 §5 的侧向实验（未采用），
v03 只重生成 `left` 以取用 §4.2 的体长约束。

| 感染体 | 版本演进 | 侧向体长 / 正面 | 侧向对称度 | 落差判据 |
| --- | --- | --- | --- | --- |
| `bloodied` | v01 后处理失败 → v03 | 75–80% → **82–88%** | 0.551 → 0.610 | 0.216 ≥ 0.15 OK |
| `headless` | v01 三门全过 → v03 | 83–89% → 84–86% | 0.602 → **0.572** | 0.267 ≥ 0.15 OK |

`bloodied` 的 v03 是必需的（v01 后处理直接抛错），代价是侧向对称度略升但落差仍充足。
`headless` 的 v03 体长持平而对称度反而改善，故一并采用。

按感染体登记的专属措辞：

- `bloodied` `gait`：沉稳有目的的潜行步，重心在宽阔的落脚之间转移，粗壮小臂横过身体反向摆动，
  佝偻的肩膀领着动作。速度 25 略高于 Walker 22，靠体重前压而不是步频。
- `bloodied` `backView`：宽大佝偻的肩、浸血工作服背面、交叉过背的围裙系带，无脸。
- `headless` `gait`：缓慢僵直的直立行走，沉重而克制的靴步，长而僵硬的手臂只在肩部微摆，
  躯干保持直立方正。
- `headless` `backView`：从外套背面顶出的肩胛骨、外套下摆、靴跟，以及从背后看到的同一个
  颈部断面与暴露颈椎，无脸无头。

## 7. 后处理产物

| 产物 | 规格 | sha256 |
| --- | --- | --- |
| `src/assets/processed/zombies/bloodied-directional-custom.png` | `2048×2048 RGBA` | `435419bb3a78d1622b23bd25e29ea5d1f0b502c50f1c2c01c8819ae223cc1b94` |
| `src/assets/processed/zombies/bloodied-portrait.png` | `512×512 RGBA` | `6dea1eae3131a6ef90c9a81eb1ae01a5ac8553831e9595884e5f8d5861ba4b74` |
| `src/assets/processed/zombies/headless-directional-custom.png` | `2048×2048 RGBA` | `c6ff7b581651ed46aeefc3fa6f55b0659e42033de0e1a9e328cec4983c29d9b7` |
| `src/assets/processed/zombies/headless-portrait.png` | `512×512 RGBA` | `7995d22f23c39392dc3b7767063773ce0e008bbcf29fe721f54ea8cd7ff411ec` |

逐行实测主体尺寸：

| 感染体 | 共用系数 | `down` | `left`/`right` | `up` | 最大主体边长 |
| --- | --- | --- | --- | --- | --- |
| `bloodied` | `0.9932` | 327–338 × 397–402（0.83） | 297–326 × 329–355（0.89） | 313–318 × 416–435（0.74） | `435px` |
| `headless` | `1.0000` | 273–278 × 408–415（0.67） | 181–221 × 348–355（0.56） | 250–255 × 387–406（0.64） | `415px` |

### 7.1 回归门控

四个已完成感染体用 `--from-archive` 重跑，产物哈希与各自执行文档记录逐项吻合：

| 产物 | sha256 前 16 位 | 与文档记录 |
| --- | --- | --- |
| `runner-directional-custom.png` / `runner-portrait.png` | `c12793b9f7ee6cb1` / `f4e5b45bd9229526` | 吻合 |
| `bomber-directional-custom.png` / `bomber-portrait.png` | `a15b5ad8c54a002a` / `94a1675c8fff1948` | 吻合 |
| `lurker-directional-custom.png` / `lurker-portrait.png` | `3f4da00b3c3688d3` / `8386349d470aad8d` | 吻合 |
| `drifter-directional-custom.png` / `drifter-portrait.png` | `ecfac11deab651a8` / `bb68e51bcc433351` | 吻合 |

`git status src/assets/processed/zombies/` 对追踪文件无输出，确认零字节变化。

### 7.2 键控残留与穿孔回溯

穿孔核查方法与 Drifter 那轮相同：从帧边界洪泛找封闭空洞，再把每个空洞坐标回溯到键控前的
源候选图，判断原本是纯洋红背景（真实缝隙，合法）还是主体颜色（误抠，报废）。
方向表映射是纯整数平移，立绘映射必须过各自的缩放系数。

| 产物 | 洋红倾向残留 | 内部合法紫调 | 四角 alpha | 空洞总量 | 回溯为误抠 |
| --- | --- | --- | --- | --- | --- |
| `bloodied-directional-custom.png` | 16 | 11 | 0,0,0,0 | 237px（最大单帧 111px） | **0** |
| `bloodied-portrait.png` | 0 | 0 | 0,0,0,0 | 0px | **0** |
| `headless-directional-custom.png` | 13 | 14 | 0,0,0,0 | 254px（最大单帧 56px） | **0** |
| `headless-portrait.png` | 0 | 1 | 0,0,0,0 | 20px | **0** |
| `runner-directional-custom.png`（已验收基线） | 192 | 359 | 0,0,0,0 | — | — |
| `lurker-directional-custom.png`（已验收） | 18 | 46 | 0,0,0,0 | — | — |

两类的残留量与已验收的 Lurker 同级，比 Runner 干净十倍以上。血迹与颈部断面完整保留。

## 8. 三道门控

| 门控 | `bloodied` v03 | `headless` v03 |
| --- | --- | --- |
| `inspect_zombie_candidates.py` | 退出码 0 | 退出码 0 |
| `process_zombie_sprites.py` | 成功，`validate_outputs` 全过 | 成功，`validate_outputs` 全过 |
| `verify_directional_sheet.py … 512` | 退出码 0 | 退出码 0 |

朝向门控实测：

| 判据 | `bloodied` | `headless` | 上限/下限 | Walker 基线 |
| --- | --- | --- | --- | --- |
| `down` vs `left` 轮廓 IoU | 0.555 超限 | 0.543 OK | ≤0.55 | 0.411 |
| `down` vs `up` 轮廓 IoU | 0.769 OK | **0.851 超限** | ≤0.80 | 0.697 |
| `left` vs `up` 轮廓 IoU | 0.566 超限 | 0.568 超限 | ≤0.55 | 0.397 |
| 侧向自镜像 vs `down` 落差 | 0.212 OK | 0.264 OK | ≥0.15 | 0.662 |
| 侧向自镜像 vs `up` 落差 | 0.207 OK | 0.271 OK | ≥0.15 | — |
| 右向为左向精确镜像 | 逐字节一致 | 逐字节一致 | — | — |
| 行内四帧尺寸波动 | 1.2–7.1% | 1.7–4.7% | ≤20% | — |

两者的轮廓 IoU 都有超限项，但落差判据充足，脚本按"该体型下轮廓判据饱和"判过。

### 8.1 Headless 的 `down` vs `up` = 0.851：单独核查过

这一项超过上限 0.80，且是已生成七类里最高的（`walker` 0.697、`runner` 0.623、
`lurker` 0.637、`drifter` 0.683、`bloodied` 0.769）。脚本里那条"轮廓判据饱和"的说明是按
**圆胖体型**标定的，对无头感染体成因不同，所以不能直接套用它就算过。

本类的成因是结构性的：**没有头，正面与背面的外轮廓天生几乎相同**，而 IoU 只比轮廓。
真正要回答的是"模型是不是把两行画成了同一张图"，这一条轮廓 IoU 回答不了，所以补了一项
内容差异判据——把 `down`/`up` 主体按外接框归一化到同尺寸后比实际像素：

| 感染体 | `down` vs `up` 平均通道差 | 同一行自比（对照） |
| --- | --- | --- |
| `headless`（本轮） | **34.0** | 0.0 |
| `bloodied`（本轮） | 50.1 | 0.0 |
| `walker`（已验收） | 41.3 | 0.0 |
| `drifter`（已验收） | 56.3 | 0.0 |
| `lurker`（已验收） | 71.6 | 0.0 |

`headless` 的 34.0 远不是 0（同行自比对照精确为 0.0），确认两行是不同画面而不是同一张图
画了两遍。但它同时低于全部已验收资源，与"没有头导致正背最难区分"的预判一致。
**所以"正面与背面是否分得清"这一条必须由人目视确认**，量化只能证明不是同一张图，
不能证明看得出正反。已列入 §10 必须确认项。

## 9. 运行时接线

`src/config/zombieVisuals.ts`：新增四个纹理键，两张方向表加入 `CUSTOM_512_TEXTURE_KEYS`，
两张立绘登记进 `ZOMBIE_PORTRAIT_TEXTURE_KEYS`。

| 感染体 | `scale` | 依据 | `frameRate` | 依据 |
| --- | --- | --- | --- | --- |
| `bloodied` | `0.173` | 半径 17 → 目标可见 `17×4.43 = 75.3px`；最大帧主体 `435px` → `75.3/435 ≈ 0.173`，反推 `75.3px`，比值 `4.427` | `6` | 速度 25 在 Walker `6@22` 与 Runner `10@52` 间插值得 6.4，**与旧值一致，未改** |
| `headless` | `0.181` | 半径 17 同上；最大帧主体 `415px` → `75.3/415 ≈ 0.181`，反推 `75.1px`，比值 `4.419` | `6` | 速度 20 插值得 5.73；**旧值 5 改为 6**，见下 |

两者 `originY` 均为 `0.5`（方向表几何居中放置，原点即主体质心），`tint` 均为 `0xffffff`。

`headless` 帧率由 5 改为 6 是明知的改动而非疏漏：旧值 5 是按 Curt/Zombies 1.1 的三帧表
标定的，新表是四帧循环，按其余五类共用的同一条速度插值规则重新取值。若你要求保持 5，
改回即可，代价是与其余六类的取值规则不一致。

`src/scenes/PreloadScene.ts`：注册四张新 PNG，两类的旧纹理键继续保留注册。
`src/config/zombies.ts` 与 `MonsterLibraryScene.ts` 均未改动。

### 9.1 一处规格偏离

两类可见高度均为约 `75px`，超出 `ZOMBIE_PROMPTS.md` §1 的"重装/精英 48–64px"档。
这与 Lurker 那轮同因：半径 17 是普通感染体里最大的一档，按"可见高度 / 碰撞半径"比值
反推必然更大。取比值而不取档位，是因为比值才是让精灵与碰撞圆对得上的那一条，
而 §1 的档位文字已被五轮验收结果超越（Walker 最普通，实测 62.3px 就已超出 28–48px 档）。

这是明知的偏离。若要求压回 64px 以内，`bloodied` 改 `scale` 到 `0.147`、`headless` 改到
`0.154` 即可，代价是可见/半径比值降到约 3.76，精灵相对碰撞圆明显小于其余六类。

## 10. 验证结论

| 层级 | 手段 | 结果 |
| --- | --- | --- |
| V0 | 三道门控、回归、键控残留、穿孔回溯、内容差异、门控改动的判据单测 | 全部通过，见 §4.3/§7/§8 |
| V1 | **未能执行**，见 §10.1 | 以配置断言替代，见 §10.2 |
| V2 | `npx tsc --noEmit` | 26 处报错，全部落在 5 个我未改动的场景文件；`zombieVisuals.ts`、`PreloadScene.ts` 零报错 |
| V3 | CDP 只读探针 + 检阅波逐格取证 | 通过，见 §10.3 |
| V4/V5 | 未执行 | 未做长时间实机游玩观察 |

### 10.1 V1 无法执行：Vitest 在本机启动即失败

`npx vitest run` 在收集任何测试之前就以
`ERR_PACKAGE_PATH_NOT_EXPORTED: Package subpath './module-runner' is not defined` 失败
（`vitest 4.1.10` 需要 Vite 6+ 的该导出，`package.json` 声明的是 `vite ^5.4.2`）。

这是既有依赖不兼容，Lurker 与 Drifter 两轮均已记录，不是本轮引入。修它需要
`npm install` 级别的操作。**这项必须单独处理，不应随本轮一起视为通过。**

本轮 §4.3 改了门控脚本，按理最该由 V1 覆盖，因此额外补了判据函数的 10 项单测
（见 §4.3 表格）——那是本轮唯一有测试覆盖的逻辑改动。

### 10.2 V1 的替代核对

用 Node 的 `--experimental-strip-types` 直接 import 纯数据配置做断言，**66 项全部通过**，覆盖：

- 两类的纹理键、`facingMode`、`scale`、`frameRate`、`tint`、`originY`、`rotationOffset`、`collisionOffsetY`。
- 帧布局 `512×512`、`frameXs` `0,512,1024,1536`、行映射 `down=0/left=1/right=2/up=3`。
- 立绘键存在且与方向表键不同；四方向动画键。
- 玩法数值逐项未变（见 §1 表格）、无 `ability`、无 `explodeOnDeath`、名称未变。
- 缩放反推：`bloodied` 比值 `4.427`、`headless` `4.419`，与 Walker `4.449` / Runner `4.429` /
  Bomber `4.427` / Lurker `4.431` / Drifter `4.424` 一致。
- 已验收六类未被本轮改动；两类立绘均已登记且未动他人登记。

替代核对不等于 V1：它验证配置数据，不验证 `tests/` 下的业务断言。

### 10.3 V3 CDP 实机探针

导航后立刻断言 `document.hidden === false`，并配 `Emulation.setFocusEmulationEnabled` 与
`Page.setWebLifecycleState`。实测 `hidden: false`、`visibilityState: visible`。

| 项 | `bloodied` | `headless` |
| --- | --- | --- |
| 方向表纹理 | `2048×2048`，17 帧，NEAREST | `2048×2048`，17 帧，NEAREST |
| 立绘纹理 | `512×512`，1 帧，LINEAR | `512×512`，1 帧，LINEAR |
| 四方向动画 | 各 4 帧、`6 FPS`，帧名 `0-*`/`1-*`/`2-*`/`3-*` | 同左 |
| 图鉴 | 第 8 位 `08 / 18`，`血污屠夫`，`INF-08 // 高伤耐久型` | 第 9 位 `09 / 18`，`无头感染体`，`INF-09 // 重型耐久型` |
| 图鉴立绘 | `__BASE` 帧，缩放 `0.293`，边界 `303–453` | 同左 |
| 检阅波 | 8 只，四朝向各 2 只，`scale 0.173`、`originY 0.5`、`tint 0xffffff` | 8 只，四朝向各 2 只，`scale 0.181` |
| 控制台 | 无错误、无警告 | 无错误、无警告 |

帧名 `0-*`/`1-*`/`2-*`/`3-*` 直接证明行映射，不依赖对配置的信任。

### 10.4 我无法验证、需要你目视的部分

本会话的图片读取工具对 PNG 无返回，**我没有看到任何一张图**。证据已落到
`.debug-bloodied-evidence/` 与 `.debug-headless-evidence/`（均在 `.gitignore` 内），
落盘不等于我看过：

| 文件 | 内容 |
| --- | --- |
| `row-0-down.png` … `row-3-up.png` | 逐方向放大对照条，每张含该方向 4 帧、单帧 300px |
| `sheet-grid.png` | 16 帧总览，按行标注方向 |
| `down-vs-up.png` | 正面/背面逐帧上下并排 —— 专为 §8.1 那条疑点准备 |
| `portrait.png` | 图鉴立绘 600px |
| `ingame-scale-compare.png` | 实机尺寸对照，叠加半径 17 的碰撞圆 |
| `ingame-review.png` / `ingame-review-1x.png` | 检阅波实机 8 只逐格裁出（放大 / 原尺寸） |
| `review-wave-2x.png` | 检阅波整屏 |
| `library.png` | 图鉴选中该类的实机截图 |
| `runtime-report.json`、`positions.json`、`mapping.json`、`camera.json` | 探针原始输出与坐标映射 |

各类四张 row strip 的 sha256 互不相同，确认不是同一行重复导出。检阅波 8 格逐格与空战场
格子比过内容差异（19.6–30.4 平均通道差），确认裁框真的框到了角色而不是空地。

必须由你确认的五件事：

1. **每一行画的是不是它该画的那个方向**。门控只能证明四行朝向彼此不同且形态合理，
   不能证明 `left` 行画的是朝左而不是朝右。
2. **`headless` 的正面与背面是否分得清**（§8.1）。这是本轮最需要人眼的一条：量化上我只能
   证明两行不是同一张图（内容差 34.0，同行自比 0.0），证明不了"看得出哪个是正面"。
   请重点看 `down-vs-up.png`：正面应能看到外套正面、胸口、靴尖，背面应能看到肩胛骨、
   外套下摆、靴跟。
3. **`headless` 的"没有头"是否被正确表达**——是敞开的颈部断面，而不是藏起来的头、
   低头、戴头盔或缩进衣领。这是本类的立身之本。
4. **`bloodied` 的血污与围裙是否可读**，以及有没有画出刀具（§6.8 与通用规格都要求基准图不带武器；
   负面词已压掉九种屠宰器械名称，但审核与遵循都有随机性）。
5. **两类轮廓是否互相区分、也与 `tank` 区分得开**。三者都是宽肩厚躯干的重型轮廓，
   小尺寸下最容易混；`bloodied` 与 `headless` 的半径还完全相同（17），实机可见尺寸也相同。

## 11. 回滚边界

全程使用新文件名，不覆盖任何既有产物，也不覆盖 Zombies 1.1 原始表。若验收不通过，
把两类视觉恢复为 `directionalVisual(GAME_ASSET_KEYS.zombieBloodied, 0.78, 6)` 与
`directionalVisual(GAME_ASSET_KEYS.zombieHeadless, 0.78, 5)`，并从
`CUSTOM_512_TEXTURE_KEYS`、`ZOMBIE_PORTRAIT_TEXTURE_KEYS` 移除即可，玩法配置本就未动。

§4 的三处管线改动是生成/检视侧改动，不影响任何已归档源图与既有产物（§7.1 已逐字节确认），
回滚这两类不需要回滚它们。其中 §4.3 的门控改动**不应**随两类一起回滚——它修的是一个
对已验收素材报错的门控，与本轮两类是否验收无关。

## 12. 遗留事项

1. **Vitest 不可用**（§10.1）。本轮改了门控脚本逻辑，这项的缺失比前几轮更值得优先处理。需你授权。
2. **`ZOMBIE_PROMPTS.md` §1 的显示尺寸档位文字已被六轮验收结果全面超越**。真正在起作用的
   规则是"可见高度 / 碰撞半径 ≈ 4.43"，建议把这条比值写进 §1 取代档位文字。
   本轮两类是第二、第三次因此产生"明知的偏离"记录（§9.1），再往下走只会重复。
3. **`WALKER_SPRITE_PIPELINE.md` §8 第 1 条仍写"恒定 1254×1254"**，Lurker 那轮已指出过时，
   至今未同步修正。
4. **Curt / Zombies 1.1 的空转纹理键继续增加**。`zombieBloodied`、`zombieHeadless` 加入
   空转行列，连同 `zombieWalker`、`zombieRunner`、`zombieBomber`、`zombieLurker`、
   `zombieDrifter`、`zombieFeral`，现已有八个纹理键无人使用。清理属本轮范围外。
5. 仓库仍无 `requirements.txt` / `pyproject.toml` 声明 Pillow 是素材脚本的必需依赖。
6. `tank` 的 `adoptedVersion` 仍为 `null`，其视觉仍指向 Curt 表——它是 `CURT_TEXTURE_KEYS`
   里唯一还在实际使用的一项。
