# Drifter 苍白行者美术资源执行文档

> 建立日期：2026-08-20
>
> 目标对象：`src/config/zombies.ts` 中的感染体 `drifter`（苍白行者）
>
> 参考基线：`docs/execution/2026-08-20-lurker-art-resource-rework.md`、`WALKER_SPRITE_PIPELINE.md`
>
> 状态：资源与接线已完成，三道门控全过，实机探针通过，等待真人目视验收（见 §9.4）

## 1. 目标

把当前复用 Curt `31×36` 三帧方向表的 `drifter`，重整为与 Walker / Runner / Bomber / Lurker
同等级的项目生成资源链：

1. 生成同画风、同机位、同键控底约束的四方向移动表。
2. 生成独立图鉴立绘，不从动画表截图放大。
3. 接入 Phaser 预加载、视觉布局、图鉴与资源台账。
4. 不改动 `drifter` 的任何玩法数值（生命 45、速度 38、伤害 11、攻击间隔 900、半径 13、
   得分 16、掉落表 3 项、无 ability、无死亡爆炸）。

## 2. 本轮范围

沿用 Bomber / Lurker 那两轮的范围决定：脚本走按 id 取配置的共用管线而非专属副本；
资源只做移动方向表 + 图鉴立绘，不做攻击/死亡动作表。

不包含：修改 drifter 玩法/AI、修改其它感染体素材、生产构建、修复既有的 Vitest 依赖冲突。

## 3. Drifter 特有的两处约束

### 3.1 键控冲突：惨白皮肤的紫调阴影

与 Bomber 的感染囊、Lurker 的颅内组织同源，但**成因相反**：前两者是"饱和暖色被误判"，
本类是"阴影被画成紫调"。键控判据是 `floor = min(r,b)`、`chroma = floor - g`、`|r-b| <= 96`：

| 颜色 | floor | chroma | \|r-b\| | 是否被抠 |
| --- | --- | --- | --- | --- |
| 蓝白高光 `(225,232,240)` | 225 | -7 | 15 | 否（chroma 远低于 38） |
| 冷蓝灰阴影 `(150,160,175)` | 150 | -10 | 25 | 否 |
| 淡紫阴影 `(210,170,220)` | 210 | 40 | 10 | **是，三条全部命中** |

风险等级高于前两类：惨白尸体的阴影在美术上**最常见的画法恰好就是淡紫/薰衣草色**，
这是高发风险而非理论风险。处理是把阴影压向冷蓝灰与青灰（要求绿通道介于红蓝之间或更高），
并在负面词加上 `lavender skin`、`violet skin`、`purple shadows`、`pink skin`、`magenta highlights`。

### 3.2 轮廓风险：垂落绷带

绷带是细长附属物，有两个已知风险：与主体断开的绷带段会被检视脚本算成额外连通域
（误报"一格里画了多个角色"）；过长的绷带会撑大主体外接框，让共用缩放系数被一条绷带绑架。
处理是在身份阶梯里要求绷带"短、贴身、与前臂相连"（`short bandages clinging to the forearms`），
而不是自由飘落的长条。

实测结果：**全 17 帧连通域均为 1 个**，绷带未造成额外连通域；最大主体边长 426px，
未被绷带撑爆（`targetSubject` 上限 435）。

## 4. 生成结果

采用版本 `v02`，**全部走阶梯 0**，即 `docs/design/ZOMBIE_PROMPTS.md` §6.6 原文措辞，
六张请求零次被内容审核拒绝。

| 产物 | 版本 | 生效阶梯 | 字节 |
| --- | --- | --- | --- |
| `Drifter_direction_reference.png` | v01 复用 | 0 | 1255216 |
| `Drifter_left_4.png` | v01 复用 | 0 | 1275827 |
| `Drifter_down_4.png` | v01 复用 | 0 | 1305145 |
| `Drifter_up_4.png` | v02 重生成 | 0 | 1195677 |
| `Drifter_portrait.png` | v01 复用 | 0 | 1140390 |

按感染体登记的三段专属措辞：

- `gait`：步幅长而节奏均匀的游荡步，长腿一步跨得远，手臂松垂微摆，病袍与绷带滞后于动作。
  速度 38 恰在 Walker 22 与 Runner 52 正中间，但角色概念是"冷漠空洞的游荡"，
  所以靠**步幅**而不是步频体现速度，既不能画成冲刺也不能画成 Walker 式踉跄。
- `backView`：后脑与稀疏白发、从病袍敞开的后背透出的肩胛骨、自手臂垂落的绷带，无脸。
- `portraitPose`：静立直立而松垮，细长手臂自然下垂，绷带松松挂着。

## 5. v01 失败与由此触发的通用管线修正

**v01 的 `up` 四帧全部贴边**（最小边距 0px，主体高 479/512 ≈ 94%），被第一道门控拦下。
其余四张全部通过。

根因不在 Drifter 而在共用骨架：`FRAMING` 写的"主体占画布 70-84%"对 2×2 网格是**歧义的**
（是整图还是每格），模型按整图理解；而 `gridFor()` 只约束了"四帧到自己帧底部的距离一致"，
**从未要求每格四周留边**。瘦长体型的背面视图是四张里最高的一张，所以最先踩中这个缺口。

修正落在 `scripts/generate_zombie_assets.mjs` 的 `GRID` 段，是通用约束，对后续所有感染体生效：

```text
Within its own frame each character occupies at most 84 percent of that frame's height and width,
leaving a clearly visible margin of flat magenta background on all four sides of every frame,
so no head, hand, foot or hem ever touches a frame edge.
```

v02 只重生成 `up`，其余四张沿用 v01 候选（逐字节相同，靠生成脚本"不覆盖已有候选"的行为实现）。
效果：

| 判据 | v01 up | v02 up | 结果 |
| --- | --- | --- | --- |
| 四帧最小边距 | 0px | 27px | 修复 |
| 主体高占帧高 | 94% | 76% | 落回区间 |
| 四帧高度差 | 11.1% | 0.8% | 大幅改善 |
| 平均自镜像对称度 | 0.738 | 0.780 | 仍符合正/背面特征 |

这一项修正没有改动 `process_zombie_sprites.py`，所以既有产物不受影响，已由 §6.1 逐字节确认。

## 6. 后处理产物

| 产物 | 规格 | sha256 |
| --- | --- | --- |
| `src/assets/processed/zombies/drifter-directional-custom.png` | `2048×2048 RGBA` | `ecfac11deab651a86de5a022495638d0139061a65206a186a269a833cb4509bd` |
| `src/assets/processed/zombies/drifter-portrait.png` | `512×512 RGBA` | `bb68e51bcc4333511b52231191b11369cd35bdc510a9b146e21a1b84a89e35b0` |

共用缩放系数 `1.0000`（被夹到 1.0，即原尺寸，无放大也无缩小）。逐行实测主体尺寸：

| 行 | 宽 | 高 | 平均宽高比 |
| --- | --- | --- | --- |
| `down` | 284–294 | 401–426 | 0.70 |
| `left` / `right` | 344–352 | 360–365 | 0.96 |
| `up` | 211–218 | 389–394 | 0.55 |

全表最大主体边长 `426px`。

### 6.1 回归门控

三个已完成感染体用 `--from-archive` 重跑，产物与已提交/已生成产物逐字节一致：

| 产物 | sha256 | 与文档记录 |
| --- | --- | --- |
| `runner-directional-custom.png` | `c12793b9…73ba20` | 吻合 |
| `runner-portrait.png` | `f4e5b45b…9be2ae` | 吻合 |
| `lurker-directional-custom.png` | `3f4da00b…a0b388` | 吻合 |
| `lurker-portrait.png` | `83863494…d340cb` | 吻合 |

`git status src/assets/processed/zombies/` 对 runner 无输出，确认追踪文件零字节变化。

### 6.2 键控残留

同一把尺子对比已验收资源：

| 产物 | 洋红倾向残留（alpha≥96, floor≥110） | 内部合法紫调 | 四角 alpha |
| --- | --- | --- | --- |
| `drifter-directional-custom.png` | 237 | 473 | 0,0,0,0 |
| `drifter-portrait.png` | 3 | 7 | 0,0,0,0 |
| `runner-directional-custom.png`（已验收基线） | 192 | 359 | 0,0,0,0 |
| `lurker-directional-custom.png`（已验收） | 18 | 46 | 0,0,0,0 |

drifter 的 237 与已验收的 Runner 192 同一量级。惨白冷调皮肤天然比 Lurker 的暖褐色调
更靠近键控判据的边界，所以比 Lurker 高是预期的，不是缺陷。

### 6.3 穿孔专项核查：全 17 帧零误抠

方法：从帧边界对透明像素做洪泛，未被到达的透明像素即被主体封闭的空洞；再把每个空洞的
坐标**回溯到键控前的源候选图**，判断那里原本是纯洋红背景（模型画的真实缝隙，合法）
还是惨白皮肤（键控误抠，报废）。

| 产物 | 空洞总量 | 回溯为洋红背景/软边 | 回溯为非洋红（误抠） |
| --- | --- | --- | --- |
| 方向表 16 帧 | 9–88px/帧 | **100%** | **0** |
| 立绘 | 987px（1.878%） | **100%** | **0** |

立绘那两个较大空洞（530px 与 367px）位于主体框纵向 48% 处、左右对称，正是手臂与躯干之间的
缝隙——立绘姿态是细长手臂自然下垂，手臂在肩与髋处与躯干相连形成闭合环，缝隙被算成"封闭空洞"
是几何必然，不是键控损伤。

注意方向表映射是纯整数平移（共用系数 1.0），立绘映射必须过缩放（立绘系数 `0.4966`）——
第一次核查我误用了平移假设，得出 53.3% 疑似误抠的错误结论，按正确系数重算后为 0。

### 6.4 色温核查：色板约束是否真的生效

按 alpha 只取主体像素，逐行统计（这一项不能用实机截图代替：80×80 检阅格内含偏暖的战场背景，
会污染结论）：

| 行 | 主体均色 | 冷调占比 `b>r` | 暖调占比 `r>b` |
| --- | --- | --- | --- |
| `down` | `(116,117,127)` | 52.5% | 5.7% |
| `left` | `(126,127,136)` | 48.9% | 6.7% |
| `right` | `(125,125,135)` | 49.6% | 6.5% |
| `up` | `(117,115,125)` | 46.7% | 9.3% |
| 立绘 | `(126,127,134)` | 47.9% | 12.2% |
| `lurker` 四行（已验收，对照） | `(95..117,82..106,68..89)` | 5.2–10.6% | 71.7–82.6% |

四行全部蓝通道高于红通道且行间一致，与 Lurker 的暖褐色调形成明确反差。
§3.1 的冷蓝灰色板约束按预期生效。

## 7. 三道门控

| 门控 | 结果 |
| --- | --- |
| `inspect_zombie_candidates.py drifter --version v02` | 退出码 0，全部通过 |
| `process_zombie_sprites.py drifter --version v02` | 成功，`validate_outputs` 全过 |
| `verify_directional_sheet.py …drifter-directional-custom.png 512` | 退出码 0，全部通过 |

朝向门控实测：

| 判据 | Drifter v02 | 上限/下限 | Walker 基线 | Runner（已验收） | Lurker（已验收） |
| --- | --- | --- | --- | --- | --- |
| `down` vs `left` 轮廓 IoU | 0.395 | ≤0.55 | 0.411 | 0.364 | 0.461 |
| `down` vs `up` 轮廓 IoU | 0.683 | ≤0.80 | 0.697 | 0.623 | 0.637 |
| `left` vs `up` 轮廓 IoU | 0.374 | ≤0.55 | 0.397 | 0.423 | 0.460 |
| 侧向自镜像 vs `down` 落差 | 0.314 | ≥0.15 | 0.662 | 0.469 | 0.460 |
| 侧向自镜像 vs `up` 落差 | 0.455 | ≥0.15 | — | — | 0.415 |
| 右向为左向精确镜像 | 逐字节一致 | — | — | — | — |
| 行内四帧尺寸波动 | down 5.9% / left 1.4% / up 1.3% | ≤20% | — | — | — |

三项轮廓 IoU 与 Walker 基线几乎重合（0.395/0.683/0.374 对 0.411/0.697/0.397），
是五个感染体里与基线最贴近的一组。

## 8. 运行时接线

`src/config/zombieVisuals.ts`：

- 新增 `zombieDrifterDirectional`、`zombieDrifterPortrait` 纹理键。
- 把 `zombieDrifterDirectional` 加入 `CUSTOM_512_TEXTURE_KEYS`（共用 512 布局）。
- 在 `ZOMBIE_PORTRAIT_TEXTURE_KEYS` 登记 drifter 立绘（第 5 个登记项）。
- `drifter` 视觉由 `directionalVisual(zombieDrifter, 1, 8)` 改为新方向表。

| 参数 | 取值 | 依据 |
| --- | --- | --- |
| `scale` | `0.135` | 已验收的"可见高度 / 碰撞半径"比值：Walker `62.3/14 = 4.450`、Runner `48.7/11 = 4.429`、Bomber `57.6/13 = 4.427`。drifter 半径 13 → 目标可见约 `57.6px`；最大帧主体 `426px` → `57.6/426 ≈ 0.135`。实测反推 `426×0.135 = 57.5px`，`57.5/13 = 4.424` |
| `frameRate` | `8` | 速度 38 在 Walker `6@22` 与 Runner `10@52` 之间线性插值得 8.13；与旧值一致，未改 |
| `originY` | `0.5` | 方向表几何居中放置，原点即主体质心，转向时视觉位置稳定 |
| `tint` | `0xffffff` | 生成素材自带确定色板（旧值本就是默认白） |

`src/scenes/PreloadScene.ts`：注册两张新 PNG。Curt 的 `zombieDrifter` 键继续保留注册。

`src/config/zombies.ts` 与 `MonsterLibraryScene.ts` 均未改动。

### 8.1 与 Lurker 不同：本轮没有规格偏离

`57.5px` 落在 `ZOMBIE_PROMPTS.md` §1 的"重装/精英 48–64px"档内，不像 Lurker 的 `66.5px`
那样需要专门说明偏离。半径 13 与 Bomber 相同，因此可见尺寸也与 Bomber 的 `57.5px` 一致。

## 9. 验证结论

| 层级 | 手段 | 结果 |
| --- | --- | --- |
| V0 | 三道门控、键控残留、穿孔回溯、色温核查、哈希、回归 | 全部通过，见 §6/§7 |
| V1 | **未能执行**，见 §9.1 | 以配置断言替代，见 §9.2 |
| V2 | `npx tsc --noEmit` | 26 处报错，全部落在 5 个我未改动的场景文件；`zombieVisuals.ts`、`PreloadScene.ts` 零报错 |
| V3 | CDP 只读探针 + 检阅波截图 | 通过，见 §9.3 |
| V4/V5 | 未执行 | 未做长时间实机游玩观察 |

### 9.1 V1 无法执行：Vitest 在本机启动即失败

`npx vitest run` 在收集任何测试之前就以
`ERR_PACKAGE_PATH_NOT_EXPORTED: Package subpath './module-runner' is not defined` 失败。
`vitest 4.1.10` 需要 Vite 6+ 的 `./module-runner` 导出，而 `package.json` 声明的是 `vite ^5.4.2`。

这是既有的依赖不兼容，不是本轮改动引入的，Lurker 那轮已记录同一现象。修它需要
`npm install` 级别的操作。**这项必须单独处理，不应随本轮一起视为通过。**

### 9.2 V1 的替代核对

用 Node 的 `--experimental-strip-types` 直接 import 纯数据配置做断言，**35 项全部通过**，覆盖：

- Drifter 纹理键、`facingMode`、`scale`、`frameRate`、`tint`、`originY`、`rotationOffset`、`collisionOffsetY`。
- 帧布局 `512×512`、`frameXs` `0,512,1024,1536`、行映射 `down=0/left=1/right=2/up=3`。
- 立绘纹理键存在且与方向表键不同；四个方向的动画键。
- 玩法数值逐项未变：生命 45、速度 38、伤害 11、攻击间隔 900、半径 13、得分 16、
  掉落 3 项、无 `ability`、无 `explodeOnDeath`、名称仍为 `苍白行者`。
- 缩放反推：可见/半径 `4.424`，与 Walker `4.449` / Runner `4.429` / Bomber `4.427` / Lurker `4.431` 一致。
- 其它感染体未被本轮改动；立绘登记数为 5。

替代核对不等于 V1：它验证配置数据，不验证 `tests/` 下的业务断言。

### 9.3 V3 CDP 实机探针

导航后立刻断言 `document.hidden === false` 并配 `Emulation.setFocusEmulationEnabled`
加 `Page.setWebLifecycleState`（Runner 那轮踩过的坑）。实测 `hidden: false`、
`visibilityState: visible`。

| 项 | 结果 |
| --- | --- |
| `game-zombie-drifter-directional-src` | `2048×2048`，17 帧（16 + `__BASE`），NEAREST |
| `game-zombie-drifter-portrait` | `512×512`，1 帧，LINEAR（与其它立绘同一策略） |
| 四方向动画 | 各 4 帧、`8 FPS`；帧名 `0-*`/`1-*`/`2-*`/`3-*` 直接证明行映射 `down=0/left=1/right=2/up=3` |
| 图鉴 | 名册第 6 位（`06 / 18`），名称 `苍白行者`，档案号 `INF-06`，纹理 `game-zombie-drifter-portrait`、帧 `__BASE`、缩放 `0.293`、边界 `303–453` 落在安全框内 |
| 检阅波 | 8 只 drifter，四朝向各 2 只；实测 `scale 0.135`、`originY 0.5`、`tint 0xffffff` |
| 控制台 | 无错误、无警告 |

本轮借用了 `TESTING_FLAGS.monsterArtReviewWave` 这个已存在的检阅波开关取证——
它把 18 类各 8 只钉死在网格里并锁死朝向，正是四方向素材的目视手段。

### 9.4 我无法验证、需要你目视的部分

本会话的图片读取工具对 PNG 无返回，**我没有看到任何一张图**。下列证据已落到
`.debug-drifter-evidence/`（在 `.gitignore` 内），落盘不等于我看过：

| 文件 | 内容 |
| --- | --- |
| `row-0-down.png`、`row-1-left.png`、`row-2-right.png`、`row-3-up.png` | 逐方向放大对照条，每张含该方向 4 帧、单帧 300px、深灰底 |
| `sheet-grid.png` | 16 帧总览，按行标注方向 |
| `portrait.png` | 图鉴立绘 600px |
| `camera-consistency.png` | walker/runner/lurker/drifter 的 `left[1]` 并排，附各自宽高比 |
| `ingame-scale-compare.png` | 实机尺寸对照：精灵缩到 `scale 0.135` 并叠加半径 13 的碰撞圆 |
| `ingame-review-drifter.png` | 检阅波实机 8 只逐格裁出放大到 220px，标注朝向与帧号 |
| `ingame-review-drifter-1x.png` | 同上未放大，实机真实观感 |
| `review-wave-full.png`、`review-wave-2x.png` | 检阅波整屏（18 类 × 8 只） |
| `library-drifter.png` | 图鉴选中 drifter 的实机截图 |
| `runtime-report.json`、`positions.json`、`canvas-geo.json` | 探针原始输出 |

四张 row strip 的 sha256 互不相同，确认不是同一行重复导出。检阅波 8 格逐格量过
"惨白冷调像素占比"，七格 1.1%–5.2%，空战场对照 0.0%，确认裁框真的框到了角色。

必须由你确认的四件事：

1. **每一行画的是不是它该画的那个方向**。门控只能证明四行朝向彼此不同且形态合理，
   不能证明 `left` 行画的是朝左而不是朝右、`up` 行是背面而不是正面。
2. **"苍白"这个识别特征是否成立**。量化上我只能证明主体是冷调、蓝通道高于红通道、
   与 Lurker 的暖褐形成反差，证明不了"看起来像一具被抽干血的惨白尸体"。
   尤其要看病袍、绷带、稀疏白发这三件是否可读。
3. **四帧是否构成自然的匀速游荡循环**，以及轮廓是否与 `walker`（同为瘦削普通型）
   和 `lurker`（同样穿医疗类服装、同为细长四肢）区分得开。这三类在小尺寸下最容易混。
4. **机位一致性**。drifter 侧向宽高比 0.96，与 Runner 1.50、Lurker 1.24、Walker 0.64–0.76
   都不同——五个感染体的机位并不统一，同场景并列时是否违和需要你判断。
   `camera-consistency.png` 就是为这一条准备的。

## 10. 回滚边界

全程使用新文件名，不覆盖任何既有产物，也不覆盖 Curt 原始表。若验收不通过，只需把
`drifter` 视觉恢复为 `directionalVisual(GAME_ASSET_KEYS.zombieDrifter, 1, 8)` 并从
`CUSTOM_512_TEXTURE_KEYS`、`ZOMBIE_PORTRAIT_TEXTURE_KEYS` 移除，玩法配置本就未动。
`TmpGenerate/` 内未采用候选不属于运行时依赖。

§5 的 `GRID` 留边约束是生成侧改动，不影响任何已归档源图与既有产物（已由 §6.1 逐字节确认），
回滚 drifter 不需要回滚它。

## 11. 遗留事项

1. **Vitest 不可用**（§9.1）。需要一次依赖修复才能恢复 V1 能力，需你授权。
2. **`zombieLurker` 与 `zombieDrifter` 两个 Curt 纹理键现已无人使用**。
   `lurker` 与 `drifter` 都已改用自生成方向表，`CURT_TEXTURE_KEYS` 里只剩 `tank` 仍在用
   （`zombieWalker`、`zombieRunner`、`zombieBomber` 同样已空转）。清理这几个键属于本轮范围外，
   保留注册无运行时代价，但值得单独收一次。
3. **`WALKER_SPRITE_PIPELINE.md` §8 第 1 条仍写"恒定 1254×1254"**，Lurker 那轮已指出过时，
   至今未同步修正。
4. Pillow 已在 `.venv` 内（12.3.0），但仓库仍无 `requirements.txt` / `pyproject.toml`
   声明它是素材脚本的必需依赖，Bomber 计划 §3 提出过，至今未落地。
5. `docs/design/ZOMBIE_PROMPTS.md` §1 的显示尺寸档位文字已被四轮验收结果超越
   （Walker 实测 62.3px 就超出"普通感染体 28–48px"）。真正在起作用的规则是
   "可见高度 / 碰撞半径 ≈ 4.43"，建议把这条比值写进 §1 取代档位文字。
