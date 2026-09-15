# 2026-09-07 后续 Goal 统一验收入口

> 状态：验收清单更新至 2026-09-08；G6-6 历史 83 个定向门禁用例及类型检查通过，但不覆盖后续 G4-6 UI 修改。当前档案页仅 V0 静态核对，全量回归、构建、浏览器操作与真人实听未执行。
>
> 关联：`2026-09-07-followup-goals.md`、`2026-09-07-g6-6-batch-template.md`、`2026-09-07-g4-6-archive-components.md`、根级 `TESTING_RULES.md`。
>
> 基线：`06e2d4d` 加当前未提交工作区。此前记录的 34 文件 / 417 用例不覆盖本轮新增配置门禁。

2026-09-07 实际执行范围仅为 `npm test -- tests/level-batch-validation.test.ts` 与 `npm run typecheck`；首轮类型检查发现测试夹具断言问题，修正并重跑后两项均通过。完整过程见 `2026-09-07-g6-6-batch-template.md` §14。2026-09-08 档案页改动后没有再执行命令验证，以下命令和实景矩阵均需另行授权。

## 1. 目标与范围

集中验证首次整备、武器奖励、对象池生命周期、粒子/UI/环境接线、武器库/图鉴布局与键盘操作、教学节奏、Boss 和危墙，补齐 G3-4 的真人混音验收入口。

本清单只复用已有配置与诊断方法，不新增测试后门、不修改玩家真实存档、不通过改血量或跳结算替代完整玩法验证。G6-6 五关最终数值与新增剧本仍是后续生产任务，不因这份清单而视为完成。

## 2. 执行前提与顺序

1. 记录提交号、未提交文件、Node/npm 版本、浏览器版本、视口/DPR、渲染器与系统音量。现有 `node_modules` 已在工作区，无需安装新依赖。
2. 按本次用户规则，先取得测试、类型检查与浏览器验证的明确授权；构建单独授权。不得把历史常设授权表述为本轮已经执行。
3. 先跑下列定向用例，再统一回归；不把测试通过与可玩性通过混为一谈。

```text
npm test -- tests/level-batch-validation.test.ts tests/config-integrity.test.ts tests/scripted-moments.test.ts tests/levels.test.ts tests/endless-director.test.ts tests/kill-streak.test.ts tests/character-skill-rules.test.ts tests/enhancements.test.ts tests/enhancement-archetypes.test.ts tests/environment-chain-rules.test.ts
npm test -- tests/archive-layout.test.ts tests/row-grid-layout.test.ts tests/monster-library.test.ts tests/weapon-loadout.test.ts
npm test
npm run typecheck
```

命令层预计 1-3 分钟，具体以实际执行记录为准。`npm run build` 不包含在以上批次中。

4. 浏览器阶段优先复用用户认可的本地服务；确需启动时建议 `npm run dev -- --host 127.0.0.1 --port 5173 --strictPort`，先确认端口。需后台启动时隐藏窗口并记录进程，结束只停止本轮启动的进程。
5. 新存档验证使用隔离浏览器配置或用户明确授权的测试存档，不清空用户当前 `localStorage`。保持 `TESTING_FLAGS` 默认关闭，正式流程中不启用无敌、解锁、跳关或概率覆盖。
6. 先完成首次流程与场景关停，再验证第二关/第三关；最后做 Boss、无尽和长时间音画验收。浏览器客观批次预计 30-60 分钟，完整关卡与真人听感另计。
7. 证据放入 `docs/execution/evidence/2026-09-07-followup/`，仅在实际执行时创建；按用例保存截图、操作、控制台异常和读数，不将空目录当证据。

## 3. 已确认的只读诊断接口

| 入口 | 可记录的实际字段 | 使用限制 |
| --- | --- | --- |
| `GameScene.getCombatDiagnostics()` | `player.currentWeaponId`、`player.ownedWeapons`、`player.ammoInMag`、`player.ammoReserve`、`wave`、`objects`、`activeEnemies`、`damageEvents`、`pauseReason` | 场景未就绪返回 `null`；结束后返回冻结副本，可留作结算证据 |
| `GameScene.getPerformanceStats()` | `fps`、`zombies`、`bullets`、`enemyProjectiles`、`props`、`damageNumbers`、`corpses`、`wave` | 只在活跃战场采样，不在 shutdown 后访问 |
| `wave` 进度快照 | `waveIndex`、`segmentIndex`、`segmentCount`、`concurrentCap`、`pendingInSegment`、`state`、`endless` | 阶段/段落索引从零开始，不能与 HUD 的显示序号混用 |
| `GameScene.getBreakableObstacleSnapshots()` | `id`、`health`、`maxHealth`、`stage`、`collisionTileCount` | 只读检查墙体状态；不直接改健康值或删除物理砖 |
| `SoundManager.getSettings()` / `isEnabled()` | `enabled`、`masterVolume`、`effectsVolume`、`musicVolume` | 只能证明设置，不能证明声音已经解码或听感合格 |
| `SaveManager.getUnlockedWeapons()` / `getWeaponLoadout()` | 许可列表、已保存编队 | 要结合奖励前后画面与局内快照，不能仅看存档声称武器已交付 |

## 4. 真实玩家路径矩阵

所有用例均需真实键鼠操作、前后画面和只读状态共同取证。若前置失败，停止其依赖项并记录原因，不用直接跳场景掩盖。

| 编号 / Goal | 操作 | 通过判据与证据 | 当前状态 |
| --- | --- | --- | --- |
| U-01 首次整备 | 隔离新存档 → 主菜单 → 第一关 → 完成首次六武器选择 → 出战 | 编队有可见入口、可保存并真正进入战场；第一关首发仍为 `pistol` | 待执行 |
| U-02 首发传递 | 已解锁非教学关，选择编队内非手枪首发后出战，再重开 | `player.currentWeaponId` 与整备选择一致，存档偏好与场景入参不丢失；第一关强制手枪是例外 | 待执行 |
| U-03 G2-9 / G6-4 | 第一关从手枪开局，自然清完前两阶段，再走到第二关 | 阶段一 MP5（`smg`）、阶段二 SPAS-12（`shotgun`）、绷带与强化按顺序交付；抽卡期间波次冻结，恢复后不重复领奖；第二关可实际使用 MP5 | 待执行 |
| U-04 G2-9 满编队分支 | 已满编队且未持有目标奖励武器时完成对应阶段 | 许可正常解锁，提示编队已满且可在武器库调整；不要求突破六武器上限，不把仅解锁误报为当局装备 | 待执行 |
| U-05 对象池与暂停 | 连续开火/爆炸时暂停恢复、回菜单、重开、死亡重试；重复三轮 | 无 shutdown 异常、旧粒子或声音残留，无暂停后成批补发子弹；结束后的诊断副本仍可读取 | 待执行 |
| U-06 G2-10 | 通过合法掉落获得并使用 `firebomb`、`dust_canister`、`demo_charge`、`cryo_canister` | 四张贴图可见，库存按次消耗；地火、粉尘硬停、高爆、低温减速分别按配置生效 | 待执行 |
| U-07 G5-3 / G5-4 / G4-6 | 检查菜单/结算按钮、设置按键帽、战斗准星；切换血液和闪光设置后攻击 | 按钮点击与键盘功能保留；粒子/准星非缺图；关闭血液不出血粒子，关闭闪光不出火花/爆炸闪光，低档效果不反增 | 待执行 |
| U-08 G5-2 / G5-5 | 第二关完整运行，再逐主题检查 11 组位图与主题叠加 | 地面/铁轨/边界加载完整、接缝可接受、边界与碰撞不漂移；缺图回退须另列获准的故障模拟，不能修改生产资源后忘记恢复 | 待执行 |
| U-09 G6-8 | 从主菜单进入第三关，聚怪后分别用子弹、玩家爆炸与 Boss 轰炸损伤危墙 | 两面墙 `intact → cracked → collapsed`；坍塌后 `collisionTileCount = 0`，玩家可穿过缺口；敌群被压伤，爆炸不重复结算；三阶段 35/42/43 与同屏上限 28 符合配置 | 待执行 |
| U-10 G6-7 | 四个 Boss 的自然战斗，分别记录三阶段转换、专属技能和死亡；无尽前四章节记录缩放 | 不跳过机制、不改血；阶段补给一次性交付；母体召唤达到上限后停止，召唤物死亡后可补充；实测 TTK，不沿用 ×0.65 的推算值 | 待执行 |
| U-11 G6-5 遗留项 | 无尽自然推进至章节 Boss 并击杀，触发过载 II/III | 奖励后进入下一波，强化冻结/恢复正确；过载层级、持续时间和暂停行为有读数与画面 | 待执行 |
| U-12 G4-6 档案布局 | 从主菜单进入武器库/图鉴，在宽窄视口与 1×/2× 渲染下逐项浏览 | 武器行优先、图鉴列优先；盒体不叠行或越过各自页脚，长文案不压快捷键，Boss 标记与预览无层级/缩放漂移，原入场与详情动效保留 | 待执行 |
| U-13 G4-6 档案输入 | 在获准的隔离存档中用方向键/WASD/Home/End 浏览；武器库用 Enter/空格编入与移出并长按；用 ESC/返回按钮退出，连续重进三次 | 选中状态与详情一致；未解锁、满编队、必带手枪提示保留；确认键长按不重复切换；鼠标行为保留，重进无重复监听，图鉴不写编队存档 | 待执行 |

### 4.1 R2 战斗爽感切片增量

以下用例只针对当前冻结的 `level_2` 和现有强化卡，不扩展其他关卡，也不改变无尽模式规则：

| 编号 / Goal | 操作 | 通过判据与证据 | 当前状态 |
| --- | --- | --- | --- |
| U-14 R2-2 固定关卡连杀收益 | 隔离存档进入 `level_2`，自然达到 5/10 连杀；在技能冷却中观察 HUD 和提示，再暂停、抽卡、恢复与重开 | 里程碑只触发一次对应返还；`readyAt` 缩短但不早于当前时间，`activeUntil` 不变；技能已就绪时不误播报；暂停/抽卡不消耗冷却 | **V3/V4 客观通过（2026-09-14）**，见 §8 |
| U-15 R2-2 模式隔离 | 无尽模式自然达到 10/20/35 连杀，再返回固定关卡 | 无尽只出现既有火力过载；不出现“技能充能”返还；固定关卡不写入过载状态 | **V3/V4 客观通过（2026-09-15）**，见 §10；仅 10 连杀档位取到实景证据，20/35 档仍只有单测 |
| U-16 R2-1/R2-3 构筑可见性 | 在两次及以上抽卡之间观察卡面流派徽标、`当前构筑` 摘要和武器层数；用空构筑与脏 id 路径各检查一次 | 流派徽标与卡的真实 `effects` 一致；层数与已激活卡一致且排序稳定；首次强化不显示空摘要；长文案不压卡片或底部跳过按钮 | 待执行 |
| U-17 R2-4 环境连锁 | `level_2` 先用广播站聚集基础感染体，再引爆一侧油桶；记录另一油桶、敌群伤害和场景物状态，重复尝试并暂停/重开 | 成对油桶在实际距离内可互相引爆；每个场景物只结算一次；连锁不重复伤害或遗留回调；广播调度与连锁组合不阻塞阶段推进 | **V3/V4 客观通过（2026-09-14）**，见 §9 |

G6-6 批次生产前，另行记录每关常规生命预算、剧本追加敌人、Boss 预算、奖励阶段、无上限段落与完整通关时长。配置门禁不能证明难度曲线合理，也不能证明脚本追加敌人没有突破实际性能预算。

## 5. G3-4 音频事件与实听入口

当前默认 `enabled = false`。必须先通过真实设置 UI 开启音频并完成用户手势解锁，再判断有无声音；不能把默认静音或浏览器自动播放限制记为解码失败。

已核对的配置与调用链：`src/config/audio.ts` → `SoundManager` → 武器/战斗/HUD/场景事件。音效优先级会压低低级音效，当前并不对背景音乐应用同一 duck 逻辑。

| 听感场景 | 已确认事件 / 映射 | 人工判据 |
| --- | --- | --- |
| 主菜单与设置 | `uiMove`、`uiConfirm`，优先级 4；音乐模式 `menu` | 移动和确认可辨，不刺耳、不连发抢占 |
| 四把切片武器 | `pistol`、`smg`、`rifle`、`shotgun`，优先级 2；换弹分别对应 `reloadPistol` / `reloadRifle` / `reloadShotgun` | 手枪、连射、霰弹可区分；持续开火不过分疲劳，换弹仍能识别 |
| 高密度战斗 | `impact`、`metalImpact`、`enemyAttack`、`enemyDeath`、`explosion`，音乐模式 `battle` | 不产生明显爆音；左右声像随实际相对位置变化；低级声不淹没关键提示 |
| 受伤与首领 | `hurt`、`bossWave`、`bossPhase`，优先级 1；音乐模式 `boss` | 密集枪声中仍可辨受伤和首领提示，阶段播报不重复重叠 |
| 火焰与恢复 | 循环 `fire`；暂停、失焦恢复与回菜单 | 循环点不突兀，场景关停后不残留，恢复不重复播放积压声音 |

实听按同一流程分别使用耳机、扬声器；逐次记录设备、系统音量、三个游戏音量值、场景和不适时点。Chrome/Edge/Firefox 分别记录加载/解码异常和播放结果，不假定本机已安装全部浏览器。

注意：部分武器仍复用既有事件，例如 `gatling → smg`、`tesla → smg`、`railgun → barrett`。这不是本轮新增独立音色，验收结果不得写成十七把武器都有专属录音。听感不合格时先记录差异，再确定是否调整音量、映射或另行采购素材。

## 6. 风险与优化建议

- 保留每轮原始读数和截图，不以历史截图覆盖当前实现；首次整备失败时先修前置，不继续声称后续链路通过。
- 武器奖励要区分许可、当局持有和弹药补给；随机掉落未出现只能记为未覆盖，不能改成已通过。
- 粒子/UI/环境派生资源的来源与运行时资产清单仍需对照当前新增文件复核，未登记完毕不得声称 G7-3 收口。
- Boss TTK、混音疲劳、危墙爽感和环境长时观感留给真人，不由 Agent 静态结论替代。
- 出现启动错误、持续对象泄漏、无法推进阶段、控制台异常或危墙坍塌后仍阻挡通路时，立即停止依赖项并保留现场。
- 优先复用一次真实通关产生的奖励、音画和性能证据，减少重复游玩；不能为了省时省掉新存档和完整流程。

## 7. 实际结果记录格式

每个用例独立填写，未执行项保持空白并标记待执行：

```text
用例编号 / Goal：
版本与未提交改动：
环境 / 浏览器 / 视口 / DPR / 音频设备：
测试存档来源与前置：
真实操作步骤：
是否使用跳关、注入或测试开关：
预期 / 实际状态：
运行时读数 / 异常：
截图或录音路径：
V0-V6 结论与未覆盖范围：
遗留问题与下次动作：
```

清单建立时仅做静态核对（当时的口径是「83 个定向用例 + 类型检查，未启动服务、未开浏览器」）。
该口径已被后续几轮取代：截至 2026-09-15，全量 `npm test` 为 41 文件 / 673 用例通过、`npm run typecheck` 退出码 0，
并已在浏览器实景跑过 U-14 / U-17 / U-15 三条用例（各自记录见 §8 / §9 / §10）。
仍未执行的是：`npm run build` 全量构建、任何音频试听、以及全部 V6 真人验收。

## 8. U-14 实际执行记录（2026-09-14）

- 用例编号 / Goal：U-14 / R2-2 固定关卡连杀收益
- 代码状态：`d28cf43`（分支 `test/lure-countershot-v1`），工作区仅本次文档改动
- 执行者：Agent（CDP 驱动，零新依赖：Node 22 内建 `WebSocket` + `fetch`）
- 环境：Windows、Node `v22.16.0`、HeadlessChrome `151.0.7922.174`、dev `127.0.0.1:5173`、CDP `9333`
- 画布：逻辑 `1520×720`（非 1280，见下方口径修正）、渲染倍率 1、截图 `1264×625`
- 测试开关：`unlockAllWeapons=false`、`enhancementDropChance=null`、`monsterArtReviewWave=false`（三项全默认）
- 测试存档与前置：Chrome 独立 `--user-data-dir`，全新存档（`unlockedLevels: []`）；
  十关解锁使用项目 DEV 秘籍 `wykq`**真实键盘输入**触发，属显式标记的测试前置，绕过逐关通关解锁流程
- 是否使用跳关 / 注入 / 测试开关：未跳关、未注入击杀、未改血量、未改掉率；仅上述解锁前置

### 8.1 层级与结果

| 层级 | 内容 | 结果 |
| --- | --- | --- |
| V1 | `npm test` | 40 文件 / 670 用例通过 |
| V2 | `npm run typecheck` | 退出码 0 |
| V3 | 冷启动 → 主菜单，帧推进与资源 | 通过：2.2s 内 `loop.frame` 85→，`document.hidden=false`，异常 / `console.error` / 失败请求均 0；主菜单画面 124 色桶、95.68% 非暗像素 |
| V4 | 真实键鼠走完 主菜单 → 选第二关 → 战前整备 → 确认行动 → `level_2` 战斗 | 通过，四条判据见 8.2 |
| V5 | 完整通关 | 未执行（本轮只验连杀收益机制，未打到结算） |
| V6 | 真人手感 | 未执行 |

### 8.2 四条判据实测

| 判据 | 实测证据 | 结论 |
| --- | --- | --- |
| 里程碑触发对应返还 | 5 连杀 `cooldownRemaining` 14000→13200（`技能充能 +0.8s`）两次；10 连杀 9697→8197（`技能充能 +1.5s`） | 通过，与 §3.1 的 800 / 1500ms 逐毫秒吻合 |
| `readyAt` 缩短但不早于当前时间 | 三次返还后 `cooldownRemaining` 均 > 0，全程未出现负值 | 通过 |
| `activeUntil` 不变 | 返还前后 `activeRemaining` 恒为 0（压制脉冲 `durationMs=0`） | 通过 |
| 技能已就绪时不误播报 | 六轮实测中前五轮里程碑落在技能已就绪时，均无返还播报 | 通过（反向验证 §3.1 规则 4） |
| 里程碑不重复消费 | 两次 5 连杀（t=43010、t=56588）各只播报一次，无同刻重复 | 通过 |
| 暂停不消耗冷却 | 暂停 2000ms 残差 83ms、8000ms 残差 100ms（残差/暂停 = 0.013） | 通过，见 8.3 |

### 8.3 暂停读数的判别过程（避免误报缺陷）

首轮读到「暂停 6000ms 期间 `cooldownRemaining` 减少 6189ms」，形似冷却泄漏。但恢复后只比暂停瞬间少 217ms。

用 2000 / 8000ms 两档暂停做判别：若冷却真在暂停期间流逝，残差应随暂停时长同比增长；实测残差
83ms → 100ms，暂停时长翻 4 倍而残差只多 17ms，**与暂停时长无关**。

源码解释一致：`resumePhysicsAfterPause` 在**恢复时**按 `game.loop.time - frozenAtLoopTime`
（精确冻结时长）调用 `shiftBattleTimers` 平移，而 `getSkillStatus()` 读的是 `scene.time.now`，
暂停期间 `timeScale=0`。两个时钟基准不同，所以暂停期间的读数是中间态而非最终结果。
残差 100ms 来自探针在暂停与恢复瞬间各采样一次的间隔。

结论：**设计行为，非缺陷。** 后续同类验收应读恢复后的值，不要用暂停期间的瞬时读数下结论。

### 8.4 本轮发现的文档口径错误

`TESTING_RULES.md` §10.1 规则 3 写「逻辑坐标固定为 `1280 x 720`」，与当前实现不符：
`DisplayManager` 会为固定侧栏动态加宽逻辑画布，实测 `game.scale.gameSize.width = 1520`。
按 1280 换算点击坐标会落到错误的行——首次实测点「第二关」实际选中了「第十关」。

正确换算必须从 `game.scale.gameSize` 读实际逻辑尺寸。另一处坑：关卡行带入场 tween，
`tweens.killAll()` 会把补间**冻结在中途值**而非跳到终点（实测冻结在 y=422，稳定值 406），
应轮询坐标至连续两次一致再点击。两点均已在 `TESTING_RULES.md` §10.1 补正。

### 8.5 证据

`docs/execution/evidence/2026-09-14-u14-streak-reward/`：
`u14.log` / `u14-result.json`（主流程与三次返还）、`u14-pause.log` / `u14-pause-result.json`（暂停与幂等）、
`u14-pause2.log` / `u14-pause2-result.json`（残差判别）、`smoke.log` / `smoke-runtime.json`（V3 冒烟），
及 `05-level2-entry` / `06-milestone-5` / `06-milestone-10` / `08-paused` / `09-resumed` / `07-final` 六张 PNG。

临时驱动 `.debug-u14-*.mjs` 与 `.debug-u14-evidence/` 留在工作区，受 `.gitignore` 的 `.debug-*` 保护，
按 §12.5 汇报后保留，由用户决定清理。Chrome 使用独立 `--user-data-dir=.chrome-debug-u14`，未触碰用户浏览器资料。

### 8.6 未覆盖范围

1. 抽卡冻结期间的返还行为未验证（本轮未自然触发强化掉落）。
2. 失败重开后返还状态是否残留未验证。
3. 20 / 35 连杀两档未达成，返还值 2500 / 3500ms 仍只有单测证据。
4. U-16（构筑可见性）未执行；U-17（环境连锁）已于同日通过，见 §9；
   U-15（模式隔离）已于 2026-09-15 通过，见 §10。
5. V6 真人判断未执行：返还是否「值得保持连杀」、是否造成技能无脑连放，以及
   §3.3 记录的低档在长冷却角色（`breacher` 20000ms，5 连杀仅占 4%）上的可感知性。

## 9. U-17 实际执行记录（2026-09-14）

- 用例编号 / Goal：U-17 / R2-4 环境连锁
- 版本：`371bd30`（`main`），无未提交源码改动；仅新增被 `.gitignore` 忽略的临时驱动
- 环境：Windows NT 10.0，Node `v22.16.0`，headless Chrome `151.0.7922.174`，
  逻辑画布 `1520 x 720`（非 1280，见 `TESTING_RULES.md` §10.1 注），dev `http://127.0.0.1:5173/`
- 测试开关：`unlockAllWeapons=false`、`enhancementDropChance=null`、`monsterArtReviewWave=false`（全默认）
- 测试前置（显式标记）：十关解锁来自项目 DEV 秘籍 `wykq`，经真实键盘输入触发，
  绕过的只是逐关解锁流程。未注入击杀、未改血量、未跳波、未改掉率
- 授权：用户于本轮明确授予命令与浏览器权限

### 9.1 层级与结果

| 层级 | 内容 | 结果 |
| --- | --- | --- |
| V0 | `LureRules` / `LureSystem` / `AreaEffectFactory.explode` / `level_2` 配置与连锁阈值核对 | 完成 |
| V3 | 页面加载、场景启动、运行时异常监听 | 通过 |
| V4 | 真实键鼠走位、`G` 键启动广播、射击引爆油桶、暂停/恢复 | **通过** |
| V5 | 完整通关 | 未执行（本用例只需连锁与阶段推进，未打到结算） |
| V6 | 真人主观 | 未执行 |

`exceptions=0`、`consoleErrors=0`、`failedRequests=0`。

### 9.2 四条判据实测

**判据 1 — 成对油桶在实际距离内可互相引爆：通过**

配置层与运行时一致，两对油桶间距均为 `90px`，在连锁阈值内：

```text
(270,360) ↔ (270,450)   dist 90
(1010,360) ↔ (1010,450) dist 90
```

阈值来源：`AreaEffectFactory.explode` 用 `effect.radius + prop.def.radius` 判定，
油桶为 `90 + 16 = 106px`。90 < 106，因此成对可连锁。

实测射击 `(270,360)` 一个油桶：

```text
目标油桶 active: true → false
配对油桶 active: true → false     ← 未被直接射击
活跃油桶 4 → 2
lingerZones 0 → 2
```

打一个、两个都灭，连锁成立。改造前四桶两两相距 ≥256px，全部超过 106px 阈值，
`briefing` 写的「把基础尸群引向油桶」在配置层从未成立过。

**判据 2 — 每个场景物只结算一次：通过**

活跃油桶净减 **恰好 2**（即一对）。若幂等失效或连锁越界，
另一侧那对（`1010,360` / `1010,450`）也会被波及，净减会是 4。

代码依据：`AreaEffectFactory.ts:220-228` 在调用 `detonateProp` **之前**
就把该 prop 加入 `chainSet`，并沿递归传递，因此同一 prop 不会被二次引爆。

**判据 3 — 连锁不遗留回调：通过**

```text
爆炸后 lingerZones = 2
4.2s 后 lingerZones = 0
```

油桶 `lingering.duration = 3000`，两个残留区按时回收，无泄漏。

**判据 4 — 广播调度与连锁组合不阻塞阶段推进：通过**

分三段验证：

```text
4a  G 键启动广播    phase ready→broadcasting，次数 2→1
                    播报「广播开启 · 尸群转向」（t=11121）
4b  暂停 4s 后恢复  phase 仍为 broadcasting
4c  广播+连锁之后    波次 seg 1→2，state=segment_pending
```

4b 值得单独说明：`getTacticalMechanicSnapshot()` 在暂停时传入 `frozenAtLoopTime`
而非 `time.now`（`GameScene.ts:939`），所以广播剩余时长在暂停期间读到的就是冻结值，
不像技能冷却那样需要区分中间态（对比 §8.3）。这是两套计时读数口径不同的地方。

终局状态：西站 `phase=cooldown` / 余 1 次，东站 `phase=ready` / 余 2 次——
切换与冷却互不干扰，与 `tests/lure-rules.test.ts` 的纯规则用例一致。

### 9.3 证据

`docs/execution/evidence/2026-09-14-u17-lure-chain/`：
`u17.log` / `u17-result.json`，及六张 PNG——
`u17-01-entry`（入场）、`u17-02-at-station`（走到广播站）、`u17-03-broadcasting`（广播中）、
`u17-04-before-chain`（引爆前四桶）、`u17-05-after-chain`（连锁后）、`u17-06-final`（终局）。

临时驱动 `.debug-u17-chain.mjs` 与截图原始目录 `.debug-u14-evidence/`
受 `.gitignore` 的 `.debug-*` 保护，按 §12.5 汇报后保留，由用户决定清理。

### 9.4 未覆盖范围

1. **连锁对敌群的伤害未单独取证**。本轮 `kills=3`，但未把击杀归因到连锁爆炸——
   聚群时机与爆炸位置未能让敌群正好站在连锁范围内。用例原文要求「记录敌群伤害」，
   这一条只能记为未覆盖，不能用「油桶确实炸了」代替。
2. **第二次使用与 `exhausted` 相位未实机验证**。西站用掉 1 次后进入冷却，
   本轮未等满 18s 冷却去用第二次，因此「两次用尽后 `exhausted`」只有单测证据。
3. **东站未启动**，切换广播时「旧声源立即失效」的实机表现未取证（纯规则已覆盖）。
4. **面粉桶连锁未验证**：`level_2` 两个面粉桶相距远，本轮只验证了油桶对。
5. **V6 真人未执行**：诱敌 + 连锁是否真的构成一个顺手的战术动作、
   广播 9s 是否够用、聚群后引爆是否有清场爽感，均需真人判断。

## 10. U-15 实际执行记录（2026-09-15）

- 用例编号 / Goal：U-15 / R2-2 模式隔离
- 代码状态：`42e64cd`（分支 `main`）加本轮未提交改动（`src/systems/EffectSpritePool.ts` 关停防御 + 新增 `tests/effect-sprite-pool-shutdown.test.ts`）
- 执行者：Agent（CDP 驱动，零新依赖：Node 22 内建 `WebSocket` + `fetch`）
- 环境：Windows、Node `v22.16.0`、HeadlessChrome `151.0.7922.174`、dev `127.0.0.1:5173`、CDP `9333`
- 画布：逻辑宽 **1734**（相机视口 1280，`camera.x = 227`），随窗口尺寸变化，非 U-14 记录的 1520
- 测试开关：`unlockAllWeapons=false`、`enhancementDropChance=null`、`monsterArtReviewWave=false`（三项全默认）
- 测试存档与前置：Chrome 独立 `--user-data-dir`；十关解锁使用项目 DEV 秘籍 `wykq` **真实键盘输入**，属显式标记的测试前置
- 是否使用跳关 / 注入 / 测试开关：未跳关、未注入击杀、未改血量、未改掉率、未改掉率覆盖；仅上述解锁前置
- 角色：守望者（`watcher`，压制脉冲）；无尽编队 `["pistol","smg","rifle","shotgun","ak47","barrett"]`，实战用 `shotgun`（槽 4）

### 10.1 层级与结果

| 层级 | 内容 | 结果 |
| --- | --- | --- |
| V1 | `npm test` | **41 文件 / 673 用例通过**（含本轮新增 3 例关停用例） |
| V2 | `npm run typecheck` | 退出码 0 |
| V3 | 冷启动 → 主菜单 → 无尽模式战场 | 通过：全程 `exceptions=0`、`console.error=0`、失败请求 0 |
| V4 | 真实键鼠走完 无尽模式 → 10 连杀 → ESC 暂停 → 返回主页 → `level_2` → 5 连杀 | 通过，九条判据见 10.2 |
| V5 | 完整通关 | 未执行（本轮只验模式隔离，未打到结算） |
| V6 | 真人手感 | 未执行 |

### 10.2 九条判据实测

| 判据 | 实测证据 | 结论 |
| --- | --- | --- |
| 1 无尽 10 连杀触发火力过载 I | `t=203953` `UNSTOPPABLE!` → `overdriveEvents` 写入 `火力过载 I ×1.25 / 6000ms` | 通过，与 `ENDLESS_OVERDRIVE_TIERS` 首档逐值吻合 |
| 1b 播报文案含档位 / 倍率 / 时长 | `火力过载 I · ×1.25 · 6s` | 通过 |
| 2 无尽全程不出现「技能充能」 | 技能充能播报 **0** 次；火力过载播报 1 次 | 通过 |
| 3 无尽 5 连杀不给奖励 | 5 连杀里程碑 **5** 次（`t=20968 / 88941 / 95630 / 185020 / 199299`），其后至 10 连杀前奖励播报 **0** 次 | 通过，无尽奖励确实从 10 起跳 |
| 4a 无尽入场 `overdrive` 为空 | `overdrive=null` | 通过 |
| 4b 固定关卡入场未泄漏过载 | 挂起时过载仍在生效（`remaining=4286.1ms`），`level_2` 入场 `overdrive=null` | 通过，见 10.3 |
| 4c 固定关卡不出现「火力过载」 | 火力过载播报 **0** 次 | 通过 |
| 4d 固定关卡 5 连杀给「技能充能 +0.8s」 | `t=224069` `RAMPAGE!` → 同刻 1 次 `技能充能 +0.8s` | 通过，与 `LEVEL_STREAK_SKILL_REFUNDS` 首档 800ms 吻合 |
| 4e 固定关卡 `overdriveEvents` 为空 | 事件数 **0** | 通过 |

两个模式的奖励轴确实互斥：无尽 59 杀 / 最高 10 连杀期间技能充能 0 次，
固定关卡 7 杀 / 最高 5 连杀期间火力过载 0 次，且各自的里程碑都正常触发了本模式的奖励。

### 10.3 泄漏判据的取证方式

4b 是这条用例的核心，必须让泄漏**有机会发生**才算验到：

```text
无尽 t=203953  10 连杀 → 火力过载 I 生效（6000ms 窗口）
无尽 t=204236  终局读数 kills=59 bestStreak=10 hp=65/105 overdrive remaining=5716.7
ESC 第 1 次 → pause="menu"
挂起态          overdrive {multiplier:1.25, remaining:4286.1, milestone:10}
Digit2 返回主页 → 主菜单
level_2 入场    overdrive=null，wave.endless=null
```

即在过载 6s 窗口**尚余 4.3s** 时离场，而不是等它自然过期。
`level_2` 入场读到 `overdrive=null`，说明清空发生在新局初始化而非依赖过期。

### 10.4 连杀窗口的实际来源

10 连杀不是在第 4 波拿到的，这一点与预期不同，值得记录：

```text
C1/4 swarm  最高连杀 6（kills 19→31）
C1/7 swarm  最高连杀 10（kills 56→59，t=202835→204236 四杀连推）
```

第 4 波（swarm，约 14 只 / cap 20）密度只够堆到 6；真正凑齐 10 连杀的是
第 7 波（swarm，约 20 只 / cap 23）。`KILL_STREAK_WINDOW` 是 3000ms，
最后四杀间隔分别为 467 / 467 / 467ms，全部落在窗口内。
**预算必须够跑到第 7 波**：本轮无尽段耗时约 204s 游戏内时间。

### 10.5 证据

`docs/execution/evidence/2026-09-14-u15-mode-isolation/`：
`u15.log`（110 行全程读数）/ `u15-result.json`（九条判据 + 两段完整快照），及六张 PNG——
`u15-01-endless-entry`、`u15-02-endless-streak`（10 连杀瞬间）、`u15-02b-paused`（挂起态）、
`u15-03-level-entry`（`level_2` 入场）、`u15-04-level-streak`、`u15-05-final`。

临时驱动 `.debug-u15-mode-isolation.mjs`、`.debug-u15-esc-probe.mjs` 与截图原始目录
`.debug-u15-evidence/` 受 `.gitignore` 的 `.debug-*` 保护，按 §12.5 汇报后保留，由用户决定清理。

### 10.6 本轮顺带定位并修复的两个问题

**1. 关停期 `EffectSpritePool.release` 抛异常（真实玩家路径可触发）**

`2026-09-01-shutdown-effect-pool-defect.md` §4 原本把「是否影响真实玩法」列为待定，
本轮给出了答案：**影响**，且比原记录更严重。纯真实操作路径（无尽 → ESC → 返回主页 → 选 `level_2`）
稳定复现，异常链为：

```text
TypeError: Cannot read properties of undefined (reading 'stop')
  Sprite.stop → EffectSpritePool.release → AreaEffectFactory.releaseZoneSprite
  → AreaEffectFactory.destroy → GameScene.handleShutdown → SceneManager.start
```

异常从 `handleShutdown` 上抛会**中断整个关停流程**，导致 `level_2` 的 GameScene 永远不启动——
不是画面残留，是下一关进不去。已在 `EffectSpritePool.release` 单点加关停防御并补 3 条用例
（`tests/effect-sprite-pool-shutdown.test.ts`）。修复后同一路径 `exceptions=0`，`level_2` 正常入场。

**2. 抽卡界面会吃掉 ESC（产品行为正确，驱动此前误判）**

`CardSelectionScene` 的 ESC 是「跳过本次强化」（`CardSelectionScene.ts:210` →
`handleSkipKey`，且 `stopImmediatePropagation`），而 `pendingEnhancementPacks` 会在跳过后
立刻弹下一包。因此抽卡队列非空时连按 ESC 只是一路跳卡，永远进不了暂停菜单。
三轮实测所需 ESC 次数（1 / 2 / 4+）正好等于残留的未收口抽卡界面数。
**这是产品的正确行为**，缺陷在驱动：已改为进暂停前先显式用 `Digit1` 收口抽卡队列。

另一次 ESC 失效的真因是**玩家已阵亡**（`handleMenuKey` 首行 `if (event.repeat || this.gameEnded) return`）。
两种情况在日志里都只留下 `pause=null`，无法区分，已给驱动补上失败诊断（活跃场景 / 血量 / 结算场景）
与低血自动吃药（`Z/X/C`），避免再把死亡误报成暂停键故障。

### 10.7 未覆盖范围

1. **20 / 35 连杀档位未实景验证**。本轮只到 10 连杀（`火力过载 I`）。
   `火力过载 II ×1.5 / 8s`（20 连杀）与 `III ×1.8 / 10s`（35 连杀）仍只有单测证据——
   自然玩法下 20 连杀需要连续 20 次击杀间隔均 < 3000ms，本轮第 7 波未能做到。
2. **过载对实际伤害的加成未取证**。判据只验证了状态写入与播报文案，
   没有测量 `×1.25` 是否真的作用在伤害计算上。这一条需要单独的伤害对照实验。
3. **返回固定关卡后未验证第二次进入无尽**。本轮方向是「无尽 → 固定关卡」，
   反向（固定关卡的技能充能状态是否会带进无尽）未取证。
4. **V5 完整通关未执行**：两段都在达到目标连杀后即离场，未打到结算。
5. **V6 真人未执行**：火力过载 6s 是否形成可感知的爆发窗口、
   为维持连杀而改变打法是否值得、两个模式的奖励差异是否被玩家察觉，均需真人判断。
