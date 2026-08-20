# Lurker 裂颅感染体美术资源执行文档

> 建立日期：2026-08-20
>
> 目标对象：`src/config/zombies.ts` 中的感染体 `lurker`（裂颅感染体）
>
> 参考基线：`docs/execution/WALKER_SPRITE_PIPELINE.md`、`docs/execution/2026-08-20-runner-art-resource-rework.md`
>
> 状态：资源与接线已完成，三道门控全过，等待真人目视验收（见 §8）

## 1. 目标

把当前复用 Curt `31×36` 三帧方向表的 `lurker`，重整为与 Walker / Runner 同等级的项目生成资源链：

1. 生成与 Walker、Runner 同画风、同机位、同键控底约束的四方向移动表。
2. 生成独立图鉴立绘，不从动画表截图放大。
3. 接入 Phaser 预加载、视觉布局、图鉴与资源台账。
4. 不改动 `lurker` 的任何玩法数值（生命 80、速度 27、伤害 13、攻击间隔 950、半径 15、
   `ranged` 能力 10 伤害、掉落表）。

## 2. 本轮范围

沿用 Bomber 那轮确定的两项范围决定：脚本走按 id 取配置的共用管线而非专属副本；
资源只做移动方向表 + 图鉴立绘，不做攻击/死亡动作表（普通感染体当前没有动作素材契约）。

不包含：修改 lurker 玩法/AI/远程弹体参数、修改其它感染体素材、生产构建。

## 3. 管线补齐

Bomber 计划里点名但当时并不存在的 `scripts/inspect_zombie_candidates.py` 由本轮建立，
按 id 取配置，键控判据与对称度阈值全部读 `zombie_asset_specs.json` 的 `shared` 段，
与后处理共用同一套数字。相比已删除的 `inspect_runner_candidates.py` 有三处实质改动：

1. **发现失败项时以退出码 1 结束**，可以真正当门控用；原脚本只打印警告，退出码恒为 0。
2. **四视图转身参考图单独走一条判据**。它本身就是 2×2 的四视图拼图，按单帧图检视会把
   "4 个连通域" 误报成 "画了多个角色"（实测拿 Runner 归档图验证，原判据确实误报）；
   而四格分属侧面与正/背面两类，任何单一对称度档位都不适用。改为只检查四视图齐全完整，
   并新增一条 "四视图对称度跨度" ——若四格对称度全挤在一起，说明模型没有真正转身，
   后续四张大概率会同朝向。Runner 归档图实测跨度 0.548（0.195~0.743），Lurker v01 为 0.512。
3. **阈值从硬编码移入 spec 的 `shared` 段**，与键控参数同源。

### 3.1 回归门控

`process_zombie_sprites.py runner --from-archive` 的产物与已提交产物逐字节一致，
两个 sha256 与 Bomber 计划 §4.1 要求的值完全吻合：

| 产物 | 要求的 sha256 | 实测 | 结果 |
| --- | --- | --- | --- |
| `runner-directional-custom.png` | `c12793b9…73ba20` | `c12793b9f7ee6cb1fd42f1152eeab1d02200ba0ecd8bb4d497ca71da9073ba20` | 一致 |
| `runner-portrait.png` | `f4e5b45b…9be2ae` | `f4e5b45bd92295266c4be1cae2a250cc9994bf91fba667ecdad3cc8baf9e2eae` | 一致 |

`git status` 对 `src/assets/processed/zombies/` 无输出，确认没有字节变化。

## 4. 上游实测：一条已记录的约束失效了

**`docs/execution/WALKER_SPRITE_PIPELINE.md` §8 第 1 条写的"上游恒定返回 `1254×1254`"已不成立。**
输出尺寸取决于模型：

| 模型 | 输出尺寸 | 2×2 单帧 | 对应源图 |
| --- | --- | --- | --- |
| `gpt-image-2` | `1254×1254` | `627` | Runner |
| `gpt-image-2-vip`（当前 `.env` 配置） | `1024×1024` | `512` | Bomber、Lurker |

`size` 与 `imageSize` 参数在两种模型下都被忽略。

这直接产生一个必须处理的后果：单帧恰好 `512` 时，主体最大边（Lurker 实测 `418`、
Bomber 实测 `417`）已接近 `targetSubject 435`，`resolve_shared_scale` 会算出 `1.043`
的**放大**系数，把生成噪声一起放大，违背该管线"全程降采样"的前提。

处理：`resolve_shared_scale` 的返回值夹到 `1.0`。`targetSubject` 的语义因此明确为
"上限"而不是"要铺满的目标"。源精度本就远超需要（`418px` 主体最终只显示约 `66px`），
少填几个像素没有代价。Runner 不受影响（其系数 `0.7740 < 1.0`），已由逐字节回归门控确认。
Bomber 的产物最大主体为 `417`（native），说明它也走在夹住之后，同样没有被放大。

`ZOMBIE_TEXTURE_LAYOUTS` 里 `CUSTOM_512_TEXTURE_KEYS` 的注释已按实测改写。

## 5. 生成结果

采用版本 `v01`，五张候选一次全部生成成功，**全部走阶梯 0**，即
`docs/design/ZOMBIE_PROMPTS.md` §6.5 原文措辞，零次被审核拒绝：

| 产物 | 生效阶梯 | 字节 |
| --- | --- | --- |
| `zombie-lurker-direction-reference-v01.png` | 0 | 1248606 |
| `zombie-lurker-left-4-v01.png` | 0 | 1292725 |
| `zombie-lurker-down-4-v01.png` | 0 | 1324016 |
| `zombie-lurker-up-4-v01.png` | 0 | 1275555 |
| `zombie-lurker-portrait-v01.png` | 0 | 1216775 |

明显好于 Runner（阶梯 0 常被拒，四张要降级到 1–2 级）。§6.5 原文本身不含
`corpse`、`suicide` 等高风险词，`zombie` 一词在本次未被拦截——但审核有随机性，
四级阶梯仍需保留。

按感染体登记的三段专属措辞：

- `gait`：佝偻潜行的拖步，长臂低垂反向摆动，头部保持低位。速度 27 仅略高于 Walker 22，
  不是冲刺也不是直立行走。
- `backView`：裂开的颅顶与颅内组织、佝偻的上背、外套背面，无脸。正俯视下颅顶朝着镜头，
  这是本类在任何方向都成立的识别特征。
- `portraitPose`：静立前倾，长臂低垂，手指张开。

### 5.1 Lurker 特有的键控冲突：颅顶穿孔

与 Bomber 的感染囊同源，但后果更严重。键控判据是 `floor = min(r,b)`、
`chroma = floor - g`、`|r-b| <= 96`：

- 粉红色脑组织如 `(235,150,190)` 会算出 `floor=190`、`chroma=40`、`|r-b|=45`，
  三条全部命中，直接被当成背景抠掉。
- 而颅顶正是这一类**唯一**的识别特征，穿孔等于素材报废。

处理：提示词把颅内组织压向暗红褐/近黑的干涸色（深红褐 `(90,45,40)` 的 `floor` 仅 40，
远低于阈值 110，安全），负面词加上 `pink brain`、`magenta brain`、`bright pink flesh`。

**实测结果：全 17 帧（16 移动帧 + 立绘）零封闭空洞**，颅顶组织完整保留。
核查方式是从帧边界对透明像素做洪泛，未被到达的透明像素即为被主体封闭的空洞，
并按空洞在主体外接框内的纵向相对位置报出（颅顶在俯视下位于框的上半部）。

## 6. 后处理产物

| 产物 | 规格 | sha256 |
| --- | --- | --- |
| `src/assets/processed/zombies/lurker-directional-custom.png` | `2048×2048 RGBA` | `3f4da00b3c3688d325d0e9ea4fcdc846e7a2035b619e1f94aee4c4c6aaa0b388` |
| `src/assets/processed/zombies/lurker-portrait.png` | `512×512 RGBA` | `8386349d470aad8def330aa203710f40fecc2ed053b9945ae9a8e33f9dd340cb` |

共用缩放系数 `1.0000`（被夹住，即原尺寸，无放大也无缩小）。逐行实测主体尺寸：

| 行 | 宽 | 高 | 平均宽高比 |
| --- | --- | --- | --- |
| `down` | 311–320 | 379–386 | 0.83 |
| `left` / `right` | 381–418 | 316–335 | 1.24 |
| `up` | 283–289 | 399–407 | 0.71 |

全表最大主体边长 `418px`。

键控残留（同一把尺子对比已验收的 Runner）：

| 产物 | 洋红倾向残留（alpha≥96, floor≥110） | 内部合法紫调 | 四角 alpha |
| --- | --- | --- | --- |
| `lurker-directional-custom.png` | 18 | 46 | 0,0,0,0 |
| `lurker-portrait.png` | 0 | 0 | 0,0,0,0 |
| `runner-directional-custom.png`（已验收基线） | 192 | 359 | 0,0,0,0 |

Lurker 比已验收的 Runner 干净约 10 倍。

## 7. 三道门控

| 门控 | 结果 |
| --- | --- |
| `inspect_zombie_candidates.py lurker --version v01` | 退出码 0，全部通过 |
| `process_zombie_sprites.py lurker --version v01` | 成功，`validate_outputs` 全过 |
| `verify_directional_sheet.py …lurker-directional-custom.png 512` | 退出码 0，全部通过 |

朝向门控实测（含 Bomber 那轮新增的体型无关判据）：

| 判据 | Lurker v01 | 上限/下限 | Walker 基线 | Runner（已验收） |
| --- | --- | --- | --- | --- |
| `down` vs `left` 轮廓 IoU | 0.461 | ≤0.55 | 0.411 | 0.364 |
| `down` vs `up` 轮廓 IoU | 0.637 | ≤0.80 | 0.697 | 0.623 |
| `left` vs `up` 轮廓 IoU | 0.460 | ≤0.55 | 0.397 | 0.423 |
| 侧向自镜像 vs `down` 落差 | 0.460 | ≥0.15 | 0.662 | 0.469 |
| 侧向自镜像 vs `up` 落差 | 0.415 | ≥0.15 | — | — |
| 右向为左向精确镜像 | 逐字节一致 | — | — | — |
| 行内四帧尺寸波动 | down 1.8% / left 8.9% / up 2.0% | ≤20% | — | — |

形态符合"侧向横躺、正背面竖向"：`left/right` 宽高比 1.24，`down` 0.83，`up` 0.71。
注意 Lurker 的侧向宽高比 1.24 介于 Runner 的 1.50（真俯视横躺）与 Walker 的
0.64–0.76（高角度俯视身体竖立）之间，机位一致性见 §8。

## 8. 运行时接线

`src/config/zombieVisuals.ts`：

- 新增 `zombieLurkerDirectional`、`zombieLurkerPortrait` 纹理键。
- 把 `zombieLurkerDirectional` 加入 `CUSTOM_512_TEXTURE_KEYS`（Bomber 那轮抽出的共用 512 布局）。
- 在 `ZOMBIE_PORTRAIT_TEXTURE_KEYS` 登记 lurker 立绘。
- `lurker` 视觉改为新方向表。

| 参数 | 取值 | 依据 |
| --- | --- | --- |
| `scale` | `0.159` | 已验收的"可见高度 / 碰撞半径"比值：Walker `62.3/14 = 4.450`、Runner `48.7/11 = 4.429`。lurker 半径 15 → 目标可见约 `66.5px`；最大帧主体 `418px` → `66.5/418 ≈ 0.159`。实测反推 `418×0.159 = 66.5px`，`66.5/15 = 4.431` |
| `frameRate` | `7` | 速度 27 在 Walker `6@22` 与 Runner `10@52` 之间线性插值得 6.67；与旧值一致，未改 |
| `originY` | `0.5` | 方向表几何居中放置，原点即主体质心，转向时视觉位置稳定 |
| `tint` | `0xffffff` | 生成素材自带确定色板（旧值本就是默认白，无叠加需要去掉） |

`src/scenes/PreloadScene.ts`：注册两张新 PNG。Curt 的 `zombieLurker` 键继续保留注册，
`drifter`、`tank` 仍在用同一张表。

`src/config/zombies.ts` 与 `MonsterLibraryScene.ts` 均未改动。

### 8.1 需要你定的一处规格偏离

`66.5px` 会让 lurker 超出 `ZOMBIE_PROMPTS.md` §1 写的"重装/精英 48–64px"档，
更远离"普通感染体 28–48px"档。

我按比值而不是按档位取值，理由与 Bomber 那轮相同且在本轮更明显：那段档位文字已经被
既有验收结果超越了——Walker 是最普通的感染体，实测可见 `62.3px`，本身就超出 28–48px。
真正在起作用的规则是"可见高度 / 碰撞半径"比值，因为它才是让精灵和碰撞圆对得上的那一条，
而 lurker 半径 15 是三者中最大的（Walker 14、Runner 11），比 Walker 更大是这条规则的
必然结果，也与"佝偻长臂"的体型描述一致。

这是明知的偏离而不是疏漏。若你要求压回 64px 以内，改 `scale` 到 `0.153` 即可
（`418×0.153 = 64.0px`），代价是可见/半径比值降到 4.27，精灵相对碰撞圆略小于 Walker/Runner。

## 9. 验证结论

| 层级 | 手段 | 结果 |
| --- | --- | --- |
| V0 | 三道门控、键控残留、颅顶穿孔核查、哈希、Runner 逐字节回归 | 全部通过，见 §3.1/§5.1/§6/§7 |
| V1 | **未能执行**，见 §9.1 | 以配置断言替代，见 §9.2 |
| V2 | `npm run typecheck` | 26 处报错，全部落在 5 个我未改动的场景文件；`zombieVisuals.ts`、`PreloadScene.ts` 零报错 |
| V3 | CDP 只读探针 | 通过，见 §9.3 |
| V4/V5 | 未执行 | 未做关卡内四方向移动的实机播放观察与远程攻击表现 |

### 9.1 V1 无法执行：Vitest 在本机启动即失败

`npx vitest run` 在**收集任何测试之前**就以
`ERR_PACKAGE_PATH_NOT_EXPORTED: Package subpath './module-runner' is not defined`
失败。原因是 `vitest 4.1.10` 需要 Vite 6+ 的 `./module-runner` 导出，而
`package.json` 声明的是 `vite ^5.4.2`；`node_modules` 还是 pnpm 结构而
lockfile 是 npm 的 `package-lock.json`。

这是依赖不兼容，不是测试失败，也不是本轮改动引入的——在我动任何文件之前就已如此。
修它需要 `npm install` 级别的操作，属于常设授权明确排除的动作，因此没有执行。
Runner 那轮记录的"216 通过 / 8 失败"基线在当前 `node_modules` 下无法复现。

**这项必须单独处理，不应随本轮一起视为通过。**

### 9.2 V1 的替代核对

用 Node 的 `--experimental-strip-types` 直接 import 纯数据配置做断言
（`zombieVisuals` 被拆成纯数据模块正是为了能在 Node 里读取）。34 项全部通过，覆盖：

- Lurker 纹理键、`facingMode`、`scale`、`frameRate`、`tint`、`originY`、`rotationOffset`。
- 帧布局 `512×512`、`frameXs` `0,512,1024,1536`、行映射 `down=0/left=1/right=2/up=3`。
- 立绘纹理键存在且与方向表键不同；四个方向的动画键。
- 玩法数值逐项未变：生命 80、速度 27、伤害 13、攻击间隔 950、半径 15、
  `ranged` 能力 10 伤害、掉落 3 项。
- 缩放反推：可见/半径 `4.431`，与 Walker `4.450` / Runner `4.429` 一致。
- 其它感染体未被本轮改动（walker、runner 各自纹理不变，drifter、tank 仍用 Curt 表）。

替代核对不等于 V1：它验证配置数据，不验证 `tests/` 下的业务断言。

### 9.3 V3 CDP 实机探针

导航后立刻断言 `document.hidden === false` 并配 `Emulation.setFocusEmulationEnabled`
加 `Page.setWebLifecycleState`（Runner 那轮踩过的坑，窗口被遮挡会让整个验证失效）。
实测 `hidden: false`、`visibilityState: visible`。

| 项 | 结果 |
| --- | --- |
| `game-zombie-lurker-directional-src` | `2048×2048`，17 帧（16 + `__BASE`），NEAREST |
| `game-zombie-lurker-portrait` | `512×512`，1 帧，LINEAR（与 Walker/Runner 立绘同一策略，降采样下正确） |
| 四方向动画 | 各 4 帧、`7 FPS`；帧名 `0-*`/`1-*`/`2-*`/`3-*` 直接证明行映射 `down=0/left=1/right=2/up=3` |
| 图鉴预览 | 名册第 5 位（walker→runner→tank→bomber→lurker）纹理为 `game-zombie-lurker-portrait`、帧 `__BASE`、缩放 `0.293`、边界 `303–453` 落在安全框内，与 Bomber 的 512 立绘处理一致 |
| 控制台 | 无错误、无未捕获异常 |

图鉴探针的 `id` 字段取名猜错（`scene.entries[].typeId` 不是实际字段），
所以逐条循环没有在 lurker 处停下而是走到了名册末尾；但纹理证据本身是结论性的。

### 9.4 我无法验证、需要你目视的部分

本会话的图片读取工具对 PNG/JPG 无返回，**我没有看到任何一张图**。
下列证据已落到 `.debug-lurker-evidence/`（在 `.gitignore` 内），落盘不等于我看过：

| 文件 | 内容 |
| --- | --- |
| `row-0-down.png`、`row-1-left.png`、`row-2-right.png`、`row-3-up.png` | 逐方向放大对照条，每张含该方向 4 帧、单帧 300px、深灰底 |
| `sheet-grid.png` | 16 帧总览，按行标注方向 |
| `portrait.png` | 图鉴立绘 600px |
| `ingame-scale-compare.png` | 实机尺寸对照：精灵缩到 `55×66px` 并叠加半径 15 的碰撞圆 |
| `library-lurker.png`、`library-default.png` | 图鉴实机截图 |
| `runtime-report.json` | §9.3 探针原始输出 |

四张 row strip 的 sha256 互不相同，确认不是同一行重复导出。

必须由你确认的四件事：

1. **每一行画的是不是它该画的那个方向**。门控只能证明四行朝向彼此不同且形态合理，
   不能证明 `left` 行画的是朝左而不是朝右、`up` 行是背面而不是正面。
2. **裂开的颅顶是否清晰可读**，是否真正成为可识别的轮廓特征。这是本类的立身之本，
   量化上我只能证明"没有被抠出透明洞"，证明不了"看得出是裂颅"。
3. **四帧是否构成自然的佝偻潜行循环**，以及轮廓是否与 `drifter`（同为瘦长型、
   同样穿医疗类服装）和 `stalker`（同为佝偻长臂）区分得开。
4. **机位一致性**。Lurker 侧向宽高比 1.24，介于 Runner 的 1.50 与 Walker 的 0.64–0.76 之间。
   三者机位并不统一，同场景并列时是否违和需要你判断。

## 10. 回滚边界

全程使用新文件名，不覆盖 Walker / Runner / Bomber 产物，也不覆盖 Curt 原始表。
若验收不通过，只需把 `lurker` 视觉恢复为
`directionalVisual(GAME_ASSET_KEYS.zombieLurker, 1.04, 7)`，玩法配置本就未动。
`TmpGenerate/` 内未采用候选不属于运行时依赖。

## 10.1 附带交付：美术检阅波

为了目视验收本轮与后续所有感染体素材，新增 `TESTING_FLAGS.monsterArtReviewWave`：
开启后无尽模式第 1 波改为一次摆出全部 18 类，每类 8 只（四个朝向各 2 只），共 144 只。

**为什么必须钉死姿态**：感染体 AI 每帧把速度改向玩家，`updateFacing` 随即改回动画行，
所以"从四条边各刷 2 只"看不到四个朝向——出生后它们会全部转向玩家。这与 Runner 那轮
§9.7 记录的"从控制台单次写入朝向会被 AI 下一帧覆盖"是同一个机制。

新增 `Zombie.poseLock`，在 `seek`、`updateAbility`、`tryAttack` 三条路径上生效：

- 不复用 `blocked`：`blocked` 只停移动，技能路径仍会调 `playAbilityWindup → updateFacing`，
  远程感染体（lurker、rotting、oddity、matriarch_boss）会照常转向玩家读条放弹，朝向立刻丢失。
- `tryAttack` 也要停：摆位铺满整屏，玩家出生点必然压在某只身上，展品不应该咬人。
- `spawn()` 里清零：对象池复用，不清会把锁定带给下一波的正常敌人。

`rotating` 素材（crawler、stalker、oddity 与 4 个 Boss）没有方向行，`applyPoseLock`
按逻辑朝向换算旋转角（0 = 朝右，与 `updateFacing` 的 `atan2(vy, vx)` 同约定）并叠加
各自的 `rotationOffset`。实测 7 类各得 4 个互不相同的角度。

摆位表在 `src/config/monsterArtReview.ts`，纯数据可在 Node 里断言。网格 16×9 = 144 格，
恰好等于 18 类 × 8 只，无空格无溢出。单元格 80×80 不是设计选择而是除法结果：战场是固定
单屏（无跟随、无滚动），且 `BattlefieldRenderer` 把背景按 `GAME_WIDTH/HEIGHT` 烘死，
扩大世界会露出未绘制区域，所以 144 只必须落进 1280×720。

行分配（每行两类，Boss 集中在最后两行，让越格重叠只发生在 Boss 之间）：

| 行 | 左半 | 右半 |
| --- | --- | --- |
| 0 | walker | runner |
| 1 | tank | bomber |
| 2 | **lurker** | drifter |
| 3 | feral | bloodied |
| 4 | headless | rotting |
| 5 | bloater | crawler |
| 6 | stalker | oddity |
| 7 | tank_boss | bomber_boss |
| 8 | hunter_boss | matriarch_boss |

同类 8 只的朝向序为 `down,down,left,left,right,right,up,up`，同朝向两只相邻便于比对。

验证结果：

| 项 | 结果 |
| --- | --- |
| 布局断言（`tests/monster-art-review.test.ts` 的同批断言） | 8 组全过：类型覆盖、网格填满、每类每朝向 2 只、序号连续、边界内、互不同格、同朝向相邻、敌群总数一致 |
| 实机摆放 | 144 只，7.7s 摆完（间隔 40ms） |
| 每类分布 | 18 类全部 `down×2 left×2 right×2 up×2` |
| 姿态锁定 | 移动中 0、未锁定 0、动画未播 0 |
| 动画行 | lurker 8 只帧名为 `0-*`/`1-*`/`2-*`/`3-*`，与 down/left/right/up 逐一对应 |
| rotating 类旋转 | 7 类各 4 个不同角度，`rotationOffset` 生效 |
| 帧率 / 控制台 | 60 FPS，无错误 |
| 第 2 波回归 | `wave2 = walker×3 runner×2 drifter×2`、间隔 750ms，确认检阅波只替换第 1 波 |
| 类型检查 | 新增文件零报错 |

**已知限制**：`hunter_boss` 实机可见约 88px、`matriarch_boss` 约 84px，越过 80px 格界与
邻格轻微重叠；这是单屏容量的必然结果，已通过把 Boss 排在最后两行把影响隔离。

**未实测**：没有真正打完这 144 只完成第 1→2 波的实机过渡。检阅波总生命值 36712
（含 32 只 Boss），清空不现实也无必要；波次定义层面的回归已按上表确认。

证据在 `.debug-art-review-evidence/`（`.gitignore` 内）：`full-grid.png` 全局排布，
`row-0-*.png` ~ `row-8-*.png` 逐行 3 倍截图（每张 3495×216，九张 sha256 互不相同）。
同样地，**我没有看到这些图**，逐类素材是否合格仍需你目视。

**开关当前为 `true`**，方便你直接进无尽模式查看。看完改回 `false` 即恢复正常无尽曲线。

## 11. 遗留事项

1. **Vitest 不可用**（§9.1）。需要一次依赖修复才能恢复 V1 能力，需你授权。
2. **`WALKER_SPRITE_PIPELINE.md` §8 第 1 条已过时**（§4）。本文件已记录实测，
   但那份共用流程文档里的"恒定 1254×1254"仍是旧结论，建议同步修正。
3. **Bomber 的 `adoptedVersion` 仍为 `null`**，其视觉也仍指向 Curt 表——
   Bomber 那轮由另一个会话并行执行，本轮未代其收尾。
4. Pillow 已在 `.venv` 内（12.3.0），但仓库仍无 `requirements.txt` / `pyproject.toml`
   声明它是素材脚本的必需依赖，这一项 Bomber 计划 §3 提出过，至今未落地。
