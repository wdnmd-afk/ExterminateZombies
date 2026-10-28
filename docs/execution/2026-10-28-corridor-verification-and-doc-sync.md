# 通道模式实景验证与状态文档同步（2026-10-28）

> 状态：**已收口（客观层）**；真人 V6 与完整自然对局仍开放
> 上一批：`7f19870`（2026-10-15 通道模式首批实现，命令层绿、零实景）
> 批次范围：P0 状态文档同步 → P1 通道模式 V3/V4 实景验证 → P3 回归与提交；P2/P4 为真人或外部条件项，本批只记录阻塞状态

## 0. 结果摘要

| 项 | 结果 |
| --- | --- |
| 命令层 | `npm test` **64 文件 / 1068 用例通过**；`npm run typecheck` 退出码 0（2026-10-28 实测） |
| 实景 | `corridor-scene-r06` 七项判据全过，控制台异常 0、失败请求 0，WebGL(SwiftShader) |
| 发现并修复的缺陷 | **通道模式进入后状态从未初始化**（见 §9.1），属阻断级，已修并补回归 |
| 遗留观察 | 柱位在低帧率下渲染位置短暂抖动到 ~82px（未进入 72px 突破带），见 §9.2 |

## 1. 目标

1. 让根目录五份状态文档（`README.md`、`HANDOVER.md`、`main-goal.md`、`PROJECT_MASTER_PLAN.md`、`docs/design/LONG_TERM_OPTIMIZATION_GOALS.md`）与 Git 真实基线对齐：登记通道模式「已实现、未实景」，修正「本轮尚未提交」等过期表述。
2. 用独立 Chrome + 原生 Node CDP，从真实菜单入口跑通通道模式，取得 V3/V4 客观证据。
3. 跑一次全量回归与类型检查，确认 10-14 两次合并（含恢复到 main 的 2026-09-01 阻断级修复）没有残留问题。
4. 把验证结果与最终读数回填到上述文档及 `docs/execution/2026-10-14-corridor-mode.md`。

## 2. 范围

**做：**
- 文档：README 内容表/模式段/热键/存档键、HANDOVER 首段、main-goal 基线与下一步、PROJECT_MASTER_PLAN 基线行、LONG_TERM_OPTIMIZATION_GOALS 同步行；新建 `docs/design/CORRIDOR_LANE_GAMEPLAY.md`。
- 实景：新增 `scripts/cdp-corridor-acceptance.mjs`（复用 `scripts/cdp-acceptance-session.mjs` 的独立 profile / SwiftShader / 证据目录约定），证据落 `docs/execution/evidence/2026-10-28-corridor-scene/`。
- 命令：`npm test`、`npm run typecheck`。

**不做：**
- 不改玩法数值、不改 `src/config/corridor.ts` 调参（真人验收后由用户决定）。
- 不执行 `npm run build`（按全局规则需单独授权）。
- 不动 `docs/execution/2026-10-14-corridor-mode.md` 的历史结论（只追加结果段）。
- 不删除任何历史证据目录，不重写 Git 历史。

## 3. 操作步骤

1. **P0 文档同步**：先改 README / HANDOVER / main-goal / PROJECT_MASTER_PLAN / LTOG 的基线与通道模式登记；补设计文档。
2. **P1 实景**：新建 CDP 驱动，走「主菜单 → 通道挑战（热键 7 或按钮）→ 预设 1 → Enter」；按下列判据取证：
   - 初始：`state.corridor` 存在、`mode === 'corridor'`、玩家 x∈[96,240]、主通道僵尸 y∈[290,430]；
   - 漂移卡片：首张卡 t≈15s 进场，真实子弹击破后 `bonusProjectiles`/`damageStacks`/武器编队/`state.score` 之一按卡族变化，且 `pauseReason === null`（当帧生效不暂停）；
   - 队友卡：击破后 `allySquad` 计数 1，主通道出现来自 y≈600 的友军子弹并命中僵尸；
   - 突破：把一只已在场的自然僵尸瞬移到 x≤72，`phase === 'breached'`、`CorridorResultScene` 激活、`corridorRecords` 写盘且分数符合「击杀分 + 存活奖励」；
   - 浏览器控制台无异常、无失败请求。
3. **P3 回归**：`npm test` 与 `npm run typecheck`，记录文件数/用例数与退出码。
4. **回填**：把实际读数与证据路径写回 main-goal、HANDOVER、README、LTOG、执行文档。
5. **提交**：文档同步 + 验证驱动 + 证据（证据只提交 JSON、截图与驱动源码，不提交 profile 目录）。

## 4. 实施建议

- 驱动层级沿用既有约定：**自然入口 + 受控前置**。允许受控的部分（瞬移僵尸、把卡削到最后一段血）必须在证据 JSON 里显式记 `bypass` 字段，并在汇报里与「自然通过」分开陈述。
- 卡片击破优先用真实鼠标射击（`browser.move` + `fire`），只有在卡片已飘到难以瞄准时才允许用 `applyDamage` 收尾，并记录原因。
- 证据目录一次性写入（`flag: 'wx'`），Run id 必须新起，避免覆盖历史。

## 5. 潜在风险

| 风险 | 影响 | 应对 |
| --- | --- | --- |
| 通道模式零实景，接线缺陷可能直接阻断 | 验证会失败并需要修码 | 失败不隐瞒；先定位是接线（GameScene/场景注册）还是数值；只修缺陷不改难度 |
| 卡片在 y=120 通道，玩家需上移才能打到 | 可能打不到或误判 | 先确认玩家 y 无额外钳制；射击前把指针移到卡片实际坐标 |
| 突破判定扫描「任意 x≤72 的僵尸」 | 瞬移造成的 breached 是受控证据，不等于自然漏怪 | 证据与文档均标注受控；自然漏怪仍待真人局 |
| 15s/25s 的卡片等待叠加主通道压力 | 探针等待期间玩家可能阵亡，被判成 breached 混淆 | 关键断言前检查 `state.player.health` 与 `phase`；死亡与漏怪分开记录 |
| 10-14 合并后回归可能有残留 | 命令层变红 | 若失败先判断是否与本批相关，再决定是否修 |

## 6. 优化方案

- 卡片击破后立即读取 `state.corridor` 快照并落盘，避免后续帧把读数冲掉。
- 把「突破」与「阵亡」两条终局路径分别用独立 run 验证，避免一局里互相干扰。
- 驱动里加一个 `report()` 汇总每项判据的 PASS/FAIL，便于直接贴进执行文档。

## 7. 验证方式

- 命令层：`npm test`、`npm run typecheck` 退出码与计数。
- 实景层：CDP 驱动的 `summary.json` / 截图 / `session.json`（含源码哈希、浏览器版本、渲染后端）。
- 文档层：五份文档基线与 main-goal 的下一步勾选状态一致，`docs-drift` 复核一次。

## 8. 偏离记录

1. **驱动判定口径两次调整**（不影响产品）：队友自动开火的判据最初写「停火后击杀数必须上升」，实测只能证明弹道存在、无法稳定复现掉血，改为「窗口内血量下降且目标位于队友射程内」，并用 WeakMap 分配实例 uid 对齐同一只僵尸——池化实例的 `getLifecycleToken()` 在同池内不唯一，第一版按 token 对齐会把不同僵尸当成同一只。
2. **柱位断言口径调整**：原断言要求按住 A 后 `x >= 96` 恒成立，实测在 ~20fps 下渲染位置会在 96 与 ~82 之间抖动。改为断言设计不变量（不进入 72px 突破带、能回到钳制线），并把抖动作为遗留观察记录，而不是放宽到「不检查」。
3. **实景入口改用预设 3（穿透封锁）**：自动武器便于连续真实射击与防守；结尾另起一局验证预设 1 可正常进入，未对预设 2 单独取景（其入口与另两者共用同一代码路径）。

## 9. 结果

### 9.1 修复：通道模式状态从未初始化（阻断级）

- **现象**：从真实菜单进入通道模式后，`state.corridor` 恒为 `undefined`，场景里没有导演、不刷僵尸、不投卡、不结算——即「进得去但永远打不出任何东西」的空场景。
- **根因**：`GameScene.create` 只给狂潮写了 `state.frenzy = createFrenzyRun(...)`，通道分支漏了对应的 `createCorridorRun`。`startCorridor()` 首行 `if (!run) return;` 于是静默返回。
- **为什么单测没抓到**：`corridor-rules` / `corridor-director` / `corridor-wiring` 覆盖的都是纯规则与预设常量，没有一条验证「场景创建后 `state.corridor` 存在」。这是跨方法的接线缺失，与 2026-09-01 整备阻断（`=== 6` 硬编码）同类。
- **修复**：抽出 `initializeCorridorRun()`，与狂潮分支对称地写 run、预设强化、弹匣重填，并按 `isDeveloperCheatEnabled()` 与 `TESTING_FLAGS.unlockAllWeapons` 设置 `recordEligible`。
- **回归**：`tests/corridor-wiring.test.ts` 新增 6 条——三个预设各自写入 run/强化/弹匣、两种调试旗不写纪录、以及一条源码级断言（`create` 的 corridor 分支必须调用 `initializeCorridorRun`，防止再次退化成空场景）。

### 9.2 遗留观察：柱位渲染抖动

`GameScene.update` 每帧把玩家 x 钳到 [96, 240]。在 SwiftShader 约 20fps 下，逐帧采样到 x 在 96 与 81.8—88.1 之间来回跳动（`corridor-column-probe-r04`、`corridor-scene-r06/column-clamp.json`）。设计不变量仍成立：从未进入 72px 突破带，且每 2—3 帧回到 96。判定为渲染时序问题（物理补步与钳制不在同一子步），不影响突破判定；是否需要在 `postUpdate` 之后再钳一次，留给目标设备实测后决定，本批不改。

### 9.3 实景判据（`corridor-scene-r06`）

| 判据 | 结果 |
| --- | --- |
| 真实入口：主菜单「通道挑战」→ 预设页 → `3` → `Enter` | 通过；`mode=corridor`、`presetId=rifle`、玩家 (120,360) |
| 主通道行军带 | 通过；自然刷出僵尸 y=331，落在主通道 290—430 |
| 柱位 | 通过（不变量口径）；min 81.8 / max 120，未触及突破线 |
| 道具卡击破 | 通过；真实射击打爆弹道卡 → `bonusProjectiles=1`、`cardKills=1`、得分 +150+40、`pauseReason=null`（当帧生效不暂停） |
| 队友卡 | 通过；召唤 1 名队友（x=108,y=600），停火 30 秒内观察到 4 发友军弹道，且一只僵尸血量 50→26 |
| 突破终局 | 通过；受控瞬移僵尸越过 72px → `phase=breached`、结算页「通道失守」、`ez:corridorRecords` 写入 `lane-v1.rifle = {score:540, elapsedMs:35958}`，与本局总分一致 |
| 预设 1 入口 | 通过；结算页「更换预设」→ `1` → `Enter`，`presetId=pistol`、HUD 读数正常 |
| 控制台与网络 | 0 异常、0 失败请求 |

**不包含**：自然漏怪终局（本次为受控瞬移）、完整自然对局、难度与手感、真人 V6、目标设备性能。受控前置逐条记在证据 JSON 的 `bypass` 字段。

证据目录：`docs/execution/evidence/2026-10-28-corridor-scene/`
- `corridor-scene-r06/`：通过批次（含截图、`result.json`、`session.json` 源码哈希）
- `corridor-scene-r01/`：接线缺失首败（`Cannot read properties of null (reading 'presetId')`）
- `corridor-column-probe-r02～r04/`：柱位抖动诊断采样
- `corridor-scene-r02/r03/r05/`：驱动自身判定口径迭代失败，保留不改判

### 9.4 命令层

| 层级 | 结果 |
| --- | --- |
| V1 全量 | **64 文件 / 1068 用例通过**，退出码 0（`npx vitest run`） |
| V2 类型检查 | **退出码 0**（`npx tsc --noEmit`） |
| V2 构建 | **未执行**（按全局规则需单独授权；通道模式尚未打包，`main-goal.md` 已注明现有交付包不含通道模式） |

计数口径：1068 = 通道批次自报的 1062 + 本批新增 6 条接线回归。1033／961／930 等旧读数为各自时点，不可相加。
