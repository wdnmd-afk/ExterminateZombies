# 2026-08-25 无尽模式爽感导演改造

> 状态：代码已实施并提交；V0-V2 命令层与 V3-V5 浏览器实景客观验收通过（2026-08-25，见 §9）。
> 仍未完成：Boss 波章节奖励结算、过载 II/III 实机触发、长局压测、V6 真人主观验收（见 §10）。
> 按 TESTING_RULES §13 口径，本轮结论只能写「客观通过，主观待验」。
>
> 依据：`PROJECT_MASTER_PLAN.md` D-009、`docs/design/FUN_FIRST_DESIGN.md`、`docs/design/LONG_TERM_OPTIMIZATION_GOALS.md` G6-5
>
> 用户要求：完成代码修改，并使用 Playwright 或 CDP 进行真实无尽模式实战测试

## 1. 目标

把无尽模式从单纯的线性数量增长，改造成持续循环的「预告 → 准备 → 爆发 → 奖励」结构，让玩家能感知波次主题、火力成长、连杀高光与 Boss 章节收束。

## 2. 范围

1. 为无尽波次增加可读类型：蜂群、突袭、重装、军械补给、Boss。
2. 使用段落和同屏上限控制密度，避免后期只靠堆积活跃实体制造难度。
3. 每 3 波提供一次保证强化；Boss 波额外提供弹药、药品与战术道具补给。
4. 无尽 Boss 接入独立公告、Boss 音乐和章节奖励闭环。
5. 10/20/35 连杀在无尽模式触发递进式临时火力过载，并在 HUD 中显示剩余时间。
6. 扩充只读诊断信息，供浏览器实战核对波次类型、过载与奖励状态。

## 3. 不在范围

1. 不新增武器、感染体、Boss、强化卡或外部资源。
2. 不修改固定关卡波次和既有剧本时刻。
3. 不引入新依赖，不修改 `package.json` 与 lockfile。
4. 不把 Agent 客观实战替代真人对爽感、难度和混音的 V6 判断。

## 4. 操作步骤

1. 新建无尽导演纯规则模块，集中定义波次类型、Boss 轮换、段落、奖励与播报。
2. 扩展 `WaveManager`，让无尽波次由导演规则生成，并在进度快照中暴露类型。
3. 扩展阶段奖励类型，复用现有管理器发放弹药、药品、道具与强化。
4. 在 `GameScene` 中接入无尽 Boss 音乐、章节奖励和连杀火力过载。
5. 在 `HUDScene` 中显示无尽波次类型和火力过载倒计时。
6. 增加纯规则测试并静态核对固定关卡不受影响。
7. 启动开发服务器，从主菜单走真实路径进入无尽模式，以真实键鼠持续战斗；保存截图、状态探针、控制台与网络错误摘要。

## 5. 实施建议

1. 无尽导演保持纯函数，随机性只用于同一类型内部的敌群分配，核心节奏节点必须确定。
2. 连杀过载只改变玩家伤害倍率，避免同时修改射速、换弹和弹药造成多系统耦合；持续时间短且后档覆盖前档。
3. Boss 奖励在清场后结算，强化选择继续沿用现有冻结与计时器平移链路。
4. 波次密度通过 `concurrentCap` 限制，后期压力主要来自组合与刷新速度，避免实体数无限增长。

## 6. 潜在风险

1. 保证强化叠加随机掉落，长局可能提前抽空卡池；抽空时沿用现有“暂无可用增强”降级。
2. 连杀过载与角色低血量 1.5 倍伤害会相乘，极端组合可能过强；首版以短持续时间控制，V6 再调。
3. Boss 波混入护卫后可能增加技能可读性压力，需浏览器画面与实战验证。
4. 自动代理能证明流程和客观反馈，不能证明玩家主观上是否足够爽。

## 7. 优化方案

1. 若强化过密，后续把节点从每 3 波调整为每章 2 次或加入已持有卡池容量判断。
2. 若后期压力不足，优先提高同屏上限与特殊敌人占比，不直接增加生命倍率。
3. 若 HUD 信息过多，只保留当前波次类型和过载倒计时，不新增永久说明文字。
4. 若 Boss 波过乱，减少护卫数量并增加 Boss 入场前静默，而不是削弱 Boss 技能本身。

## 8. 验证方式

1. V0：核对类型、配置、波次、奖励、状态、HUD、音频和暂停恢复调用链。
2. V1：定向运行无尽导演、连杀、配置完整性及受影响测试。
3. V2：执行 TypeScript 类型检查。
4. V3：冷启动、进入无尽、资源加载、控制台与失败请求检查。
5. V4：真实移动、瞄准、射击、换弹、切枪、波次推进、过载显示、强化冻结/恢复。
6. V5：连续打到至少一次成长节点；Boss 节点使用同一正式波次规则的定向长链路验证，明确记录任何测试前置。
7. V6：由真人复核波次节奏、火力强度、Boss 混战可读性和听感。

## 9. 实施结果

代码已按 §4 全部落地并提交（`004dc27`）。接线点如下，供复核时定位：

| 关注点 | 位置 |
| --- | --- |
| 导演规则（波次类型/Boss 轮换/段落/奖励/播报） | `src/config/endless.ts`（336 行，纯函数：`getEndlessWaveKind`、`getEndlessBossId`、`getEndlessWaveMeta`、`createEndlessWave`） |
| 连杀过载档位与场景物回收 | `src/systems/EndlessModePolicy.ts`（`ENDLESS_OVERDRIVE_TIERS` 10/20/35 → ×1.25/1.5/1.8，持续 6/8/10 秒） |
| 波次类型进入进度快照 | `src/systems/WaveManager.ts:166-181`（`getEndlessWaveMeta()`） |
| 过载状态与暂停平移 | `src/systems/GameState.ts:57`、`src/scenes/GameScene.ts:1328-1351`、`:1905-1906` |
| 过载乘入实际伤害 | `src/systems/WeaponManager.ts:651` |
| HUD 波次类型与过载倒计时 | `src/scenes/HUDScene.ts:323`、`:1426` |
| 五种阶段奖励发放 | `src/scenes/GameScene.ts:1553-1598`（`weapon` / `resupply` / `medicine` / `item` / `enhancement` 五类均有实现） |
| 章节战利品播报 | `src/scenes/GameScene.ts:1592-1593` |

### 9.1 已通过的验证层级

| 层级 | 命令 / 方式 | 结果 |
| --- | --- | --- |
| V0 | 静态核对上表全部接线点 | 通过：五种奖励类型都有发放分支，过载在 GameState → WeaponManager → HUD 三处闭环，暂停期有截止时间平移 |
| V1 | `npm test` | 通过：27 文件、322 用例，其中 `tests/endless-director.test.ts` 5 个用例覆盖章节节奏、Boss 轮换、强化/补给节点、段落同屏上限、过载档位递增 |
| V1 定向 | `tests/weapon-manager.test.ts` | 通过：含「无尽火力过载乘入实际弹丸伤害，过期后恢复基础伤害」 |
| V2 | `npm run typecheck` | 通过：退出码 0 |
| V2 | `npm run build` | 通过：约 8 秒 |

### 9.2 V3-V5 浏览器实景验收（2026-08-25 执行）

环境：Chrome `151.0.7922.170` headful + CDP（端口 9444，调试 profile `.chrome-debug-endless`）、
`npm run dev` on 5173、逻辑 1280×720 渲染到 3040×1440、canvas 实测 1384×655。
证据目录 `.debug-endless-20260825-evidence/`（16 张截图 + `probe.json` / `probe-phase2.json` /
`probe-card.json` / `probe-boss.json`），探针 `.debug-endless-probe.mjs`、`-phase2`、`-card`、`-boss`。

全程走真实用户路径：主菜单 → **真实鼠标点击**「无尽模式」→ 战前整备 → Enter 开战。
没有用 `scene.start` 跳场景，所以贴图正常渲染、截图可用于判读 HUD。

| 项 | 层级 | 结果 |
| --- | --- | --- |
| 冷启动、资源加载、控制台与失败请求 | V3 | 通过：四轮运行运行时异常 / console error / 失败请求**均为 0** |
| 真实鼠标点击进入整备 → Enter 进入无尽第 1 波 | V3 | 通过：`mode:endless`、编队 6/6、`characterId` 生效 |
| 真实 WASD 移动 | V4 | 通过：(640,360) → (724,300) |
| 真实鼠标瞄准 + 按住左键开火 | V4 | 通过：弹匣 50→25，产生尸体与击杀 |
| 真实换弹（R） | V4 | 通过：`isReloading` 转真，弹匣 11→50 |
| 真实切枪（3 / 2） | V4 | 通过：smg → rifle → smg |
| **HUD 显示波次主题** | V4 | 通过：屏上同时出现 `CLEANUP WAVE`、`W1 · 脆弱感染体正在聚集`、`WAVE 1 · 清扫` |
| 真实 ESC 暂停 / 恢复 | V4 | 通过：`pauseReason` `null`→`'menu'`→`null`，物理同步冻结与解冻 |
| **连杀火力过载（10 档）** | V5 | 通过：真实加特林扫射，连杀 1→10，第 10 杀触发 `火力过载 I ×1.25` |
| **过载倒计时在 HUD 可见** | V5 | 通过：中央 `火力过载 I · ×1.25 · 6s`、侧栏 `×1.25 · 5.9s`，秒数在走 |
| **强化冻结 / 恢复** | V4/V5 | 通过：真实走位踩包 → `pauseReason:'cardSelection'` + 物理冻结 → 卡面 12 个子对象四张卡全文渲染 → 真实按 `1` → 解冻，HUD `强化 1` |
| 波次类型随波推进 | V4 | 通过：W1 `warmup` cap 10 → W2 `assault` cap 14（runner×3 / drifter×2 / walker×2） |
| **Boss 波入场与切轨** | V5 | 通过：见 9.3 |
| 帧率 | V4/V5 | 52-61 FPS；14-16 只活跃感染体时稳定 60+ |

### 9.3 Boss 章节节点（V5）

用本轮新增的 `WaveManager.debugJumpToWave(10)`（仅 `import.meta.env.DEV`，生产恒为 no-op）
跳到第 10 波。它走 `scheduleWave → getWave → createEndlessWave` 正式链路，拿到的是配置表里
真正的 Boss 波：`kind:'boss'`、`bossId:'tank_boss'`、`chapter:1`。

| 项 | 结果 |
| --- | --- |
| Boss 生成 | 通过：`tank_boss` ×1 + 12 只护卫（段落 2，`leadIn` 1400ms） |
| **BGM 切轨** | 通过：`battleMusicMode` 由 `'battle'` 切到 `'boss'` |
| Boss 公告与 HUD | 通过：`CHAPTER 1 · BOSS`、`巨型坦克 已进入战场`、`WAVE 10 · 首领`、`BOSS // 巨型坦克 // P1/2 装甲压制` |
| Boss 真实击杀 | 通过：900 HP 由真实左键扫射打空 |
| 章节奖励结算 | **未验证**，见 §10 第 1 条 |

### 9.4 显式测试前置（原则 6：以下任一项都不能当作对应正式流程的验收）

1. **预置存档**：默认存档只解锁手枪、编队 1 把，而整备页确认要求恰好 6 把，Enter 会静默无效。
   因此用 localStorage 预置 `unlockedWeapons` / `weaponLoadout` / `preferredCharacterId`。
   **不构成正式解锁与整备流程的验收。**
2. **生命与火力**：把生命提到 900-4000、补满加特林。第一次运行就是因为探针只会站着开火、
   在第 2 波 29 秒阵亡，导致过载/暂停/抽卡三项全部没测到。**不构成难度或耐久的验收。**
3. **感染体密度**：用 `GameScene.spawnZombie` 正式生成入口补摆 walker，凑出 3 秒内 10 连杀。
   伤害与击杀判定全部走正式战斗链路（真实鼠标左键），**没有调用 `damageZombie`**。
4. **强化掉率**：运行时把 `TESTING_FLAGS.enhancementDropChance` 覆盖为 1，收尾已恢复 `null`。
   拾取靠真实碰撞（真实 WASD 走过去），**没有调用 `applyPickup`**。**不构成正式掉率的验收。**
5. **跳波**：`debugJumpToWave(10)`。跳过的 9 波里本该积累的武器、强化、弹药和伤害压力都不存在，
   **不构成 Boss 战难度或章节节奏的验收。**

### 9.5 排查记录：两次把工具问题误当产品现象

留在这里避免下一轮重复踩。

1. **真实点击全部落空**。第一版用 `canvasRect.width / scale.gameSize.width` 算缩放，
   而 `gameSize` 是 **3040×1440 渲染空间**、不是逻辑 1280×720；且
   `configureHighResolutionScene`（`DisplayManager.ts:126`）给每个场景相机加了 viewport 偏移和
   zoom。正确链路是「逻辑 → 相机（`cam.x + (v - cam.worldView.x) * cam.zoom`）→ 渲染 →
   除 `scale.displayScale` + 加 `scale.canvasBounds` → 页面」。实测逻辑 (913,494) → 渲染
   (2066,988) → 页面 (941,524)。探针现在在点击前用 `scene.input.hitTestPointer` 断言命中，
   落空即抛错，不再静默。
2. **`cardActive:false / cardChildren:0` 不是卡死**。这正是
   `questions/2026-08-22-强化卡拾取卡死.md` §2 的判据，所以专门写了 `.debug-endless-card.mjs`
   连续采样 14 次复核：**第 0 次采样卡面就已完整存在**（frame 884、12 个子对象、四张卡的标题
   描述与数值增减、`跳过本次强化 [ESC]` 全在）。原因是 `waitFor` 在 `pauseReason` 翻转的同一刻
   返回，而 `scene.launch` 是入队、要等下一帧才被 SceneManager 处理。
   **判定冻结后必须多等一两帧再读抽卡场景**，否则会把时序当成卡死。
3. **`R` 在死亡后是「重开本局」**。`GameOverScene.ts:146` 把 `keydown-R` 绑成 restart，
   而探针用 R 换弹。第三次运行里玩家阵亡后探针继续按 R，于是直接重开了一局
   （表现为生命从 11 跳回 140、波次回到 1）。这是探针行为，不是产品异常。

## 10. 未完成

1. **Boss 波的章节奖励结算未验证**（§9.3 最后一行）。Boss 本身能被真实击杀，但第 10 波是
   1 Boss + 12 护卫（含 runner / feral / stalker / crawler 等高机动类），波次要清完场才进
   `waiting_reward` 结算章节战利品。探针不会走位拉扯，站着扫射三轮都没清完，第三轮反而被护卫
   从 4000 血啃到阵亡。按 TESTING_RULES 12.4 这属于**工具能力不足导致的「未执行/受阻」，
   不是产品缺陷**。
   注意奖励发放链路本身已在非 Boss 波验过（拾取 → 冻结 → 卡面 → 真实按 1 → 生效），
   Boss 波复用同一个 `handleWaveRewards`，差异只在奖励清单内容，而清单已在配置层核对
   （`resupply` / `medicine`×3 / `item` / `enhancement`）。补验需要会拉扯的驱动，或由真人打。
2. **过载 II（20 连杀）与 III（35 连杀）只验了配置与单测，未实机触发**。本轮实机只到 I 档。
3. **V6 真人主观验收未执行**：波次节奏、火力强度是否够爽、Boss 混战可读性、听感。
   Agent 不得代替（TESTING_RULES 原则 8）。
4. **长局压测未做**：50/100/150 活跃敌人档位的 FPS 与同屏上限联测仍属 G6-3 的后续，
   本轮最高只观察到 16 只活跃感染体（稳定 60+ FPS）。

补验时注意 `docs/execution/` 既有的一条教训（见 `2026-08-24-obstacle-collision-footprint.md` §5）：
用 CDP 直接跳场景会让所有贴图渲染成 Phaser 的 `__MISSING` 占位，那种截图只能验几何与布局，
验不了美术与可读性。要验 HUD 与 Boss 混战观感必须从主菜单走真实路径进入——本轮 §9.2 即按此执行。

## 11. 本轮对生产代码的唯一改动

`src/systems/WaveManager.ts` 新增 `debugJumpToWave(waveNumber)`：

1. `import.meta.env.DEV` 门禁，生产构建恒返回 false、不给正式玩法留跳关面（沿用
   `DeveloperCheats.ts` 既有形态）。
2. 走 `scheduleWave` 正式链路而不是自拼波次，避免引入只有测试才走的平行规则。
3. 存在理由：Boss 波在每章第 10 波，自然推进代价过高，此前只能停在配置层验证。
4. 文档注释里写明了它**能证明什么、不能证明什么**，调用方必须随结论记录前置。

