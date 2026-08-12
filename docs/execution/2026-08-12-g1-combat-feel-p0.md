# 2026-08-12 G1 手感优化（P0 批次）

> 状态：P0 四项已实施，V1/V2 通过；V3-V6 未执行
>
> 依据：`PROJECT_MASTER_PLAN.md` D-009、`docs/design/FUN_FIRST_DESIGN.md` §1/§5、`docs/design/LONG_TERM_OPTIMIZATION_GOALS.md` G1、`TESTING_RULES.md`
>
> 前置授权：2026-08-12 用户确认 C-3（爽感机制随 P2 一起实施）、C-9（各 Goal 收口自动执行 `npm test` + `npm run typecheck`）

## 1. 目标

补齐"开火 → 命中 → 击杀"链路上缺失的即时反馈，使玩家不看 HUD 也能感知战斗结果，并为后续 G2 武器爽感（暴击/处决/穿透）提供可复用的反馈基础设施。

本批次交付 G1 的 P0 四项：伤害数字、击杀表现、连杀计数器、慢动作系统。

## 2. 背景与真实基线

预读 `GameScene`、`HUDScene`、`Zombie`、`Bullet`、`ObjectPool`、`GameState`、`constants`、`audio` 后确认：

1. 现有反馈只有枪口闪光（`spawnMuzzleFlash`）、命中火花（`spawnImpactBurst`）、死亡光环（`spawnDeathBurst`）、受击闪白（`Zombie.hurt`）和 `cameras.main.shake`，全部为同一强度，无分层。
2. 没有任何伤害数值可视化，玩家无法判断武器强弱与敌人耐久。
3. `finalizeZombieDeath` 直接 `zombie.despawn()`，尸体瞬间消失，击杀缺少重量感。
4. 无连杀概念，`GameState.stats` 只有 `elapsedMs / kills / bossDefeated`。
5. 战场冻结依赖 `setPause` + `shiftBattleTimers`，注释明确说明 `time.now` 在冻结期间仍按真实时间前进，因此任何新计时都必须避开"绝对时间点"陷阱。
6. `WaveManager.hasAliveEnemies` 读 `getActiveZombies().length > 0`，因此**尸体表现绝不能延长 Zombie 的 active 生命周期**，否则会卡住波次推进。

## 3. 范围

### 3.1 做

1. 慢动作系统（统一入口、分级、冷却、暂停与关闭时复位）。
2. 伤害数字系统（分色分级、对象池、并发上限、高密度自动降级）。
3. 击杀表现（尸体残影击退滑出 + 血液粒子 + 分级震屏）。
4. 连杀计数器（窗口累计、里程碑播报、HUD 显示、最高纪录入 stats）。
5. 上述四项的纯逻辑单元测试。

### 3.2 不做

1. 不改武器数值、不加暴击/处决/击退字段（属于 G2）。
2. 不新增音频素材，里程碑音效临时复用既有事件（专属 stinger 属于 G3-2）。
3. 不做位图特效替换（属于 G5-3）。
4. 不改结算页 UI（属于 G4-2），只把 `bestKillStreak` 透传到结算数据。
5. 不改波次数量与关卡配置（属于 G6-1）。
6. 不执行 `npm run build`（仍需单独授权）。

## 4. 关键设计决策

### 4.1 慢动作只缩放物理与动画，不缩放场景时钟

`GameScene` 已有的冻结机制说明：`time.timeScale` 不影响 `time.now`，而武器冷却、敌人能力、波次全部基于 `time.now` 的绝对时间点。若慢动作去动 `time.timeScale`，会出现"画面慢了但技能照常结算"的错配，且需要再写一套平移补偿。

因此慢动作实现为：

```
physics.world.timeScale  ← 除数语义，值越大越慢
anims.globalTimeScale    ← 乘数语义，值越小越慢
```

不动 `time.*` 与 `tweens.*`。带来的取舍：

- **优点**：完全不触碰既有计时链路，无需任何平移补偿；特效 tween 按真实速度播放，不会在慢动作期间堆积。
- **代价**：慢动作期间敌人技能冷却与波次计时仍按真实时间前进。单次慢动作时长 0.2-1.0 秒，影响可忽略；若后续 S 级慢动作延长到 2 秒以上，需要重新评估。

恢复用 `scene.time.delayedCall`：战场冻结时 `time.timeScale = 0` 会自动挂起该回调，暂停期间不消耗慢动作时长，与既有暂停语义一致。

### 4.2 尸体残影必须与 Zombie 实体解耦

`WaveManager` 用活跃僵尸数判断本波是否清空，所以 Zombie 必须在死亡结算时立即 `despawn()` 回池。尸体表现改为独立的 `CorpseLayer`：从 Zombie 取一份视觉快照（纹理、帧、缩放、旋转、色调、原点），在独立池化的 Sprite 上播放击退滑出与淡出，与实体生命周期无关。

### 4.3 高密度自动降级

第二关目标敌人量将提升到 150-200（G6-1），伤害数字与粒子必须能自我收敛：

- 活跃数字 ≥ 软上限：普通伤害数字跳过，暴击/处决/穿透等强调类永远显示。
- 活跃数字 ≥ 硬上限：回收最早的一个再复用。
- 尸体残影同样设并发上限，超出时立即回收最早的。

## 5. 影响文件与调用链

| 文件 | 改动 |
| --- | --- |
| `src/constants.ts` | 新增 `DEPTH.damageNumber`、`DEPTH.corpse`；新增连杀事件名 |
| `src/systems/SlowMotionManager.ts` | 新建：慢动作统一入口、分级、冷却、复位 |
| `src/systems/DamageNumberManager.ts` | 新建：伤害数字池、分色分级、降级策略 |
| `src/systems/CorpseLayer.ts` | 新建：尸体残影池与击退滑出 |
| `src/systems/KillStreakRules.ts` | 新建：连杀纯逻辑（窗口判定、里程碑档位） |
| `src/entities/Zombie.ts` | 新增 `getCorpseSnapshot()` 暴露视觉快照 |
| `src/systems/GameState.ts` | `stats` 新增 `bestKillStreak` |
| `src/scenes/GameScene.ts` | 接线四套系统；`damageZombie` 增加命中来源参数；死亡结算改为走 CorpseLayer |
| `src/scenes/HUDScene.ts` | 连杀计数显示与里程碑弹窗 |
| `tests/kill-streak.test.ts` | 新建：连杀规则用例 |
| `tests/feedback-rules.test.ts` | 新建：慢动作分级与伤害数字降级用例 |

## 6. 操作步骤

1. 扩展 `constants.ts` 的深度层级与事件名。
2. 实现 `KillStreakRules`（纯函数优先，便于测试）。
3. 实现 `SlowMotionManager`、`DamageNumberManager`、`CorpseLayer`。
4. `Zombie` 暴露视觉快照。
5. `GameScene` 接线：命中 → 伤害数字；击杀 → 尸体 + 连杀 + 分级震屏；里程碑 → 慢动作 + 事件。
6. `HUDScene` 增加连杀显示与里程碑弹窗。
7. 补单元测试。
8. 执行 `npm test` 与 `npm run typecheck`（已获长期授权）。

## 7. 潜在风险

| 风险 | 对策 |
| --- | --- |
| 尸体残影拖住波次推进 | 残影与 Zombie 实体完全解耦，Zombie 仍立即 `despawn()` |
| 慢动作破坏既有计时 | 只缩放 physics/anims，不动 `time.*`，无需平移补偿 |
| 慢动作跨局残留 | `GameScene.handleShutdown` 与 `create` 双向复位 |
| 高密度糊屏/掉帧 | 数字与残影均设软硬上限并自动降级 |
| Boss 死亡收束被打断 | Boss 走既有 `beginDeathAnimation` 路径，残影只在 `finalizeZombieDeath` 生成 |
| 里程碑音效语义错位 | 临时复用既有 UI 事件并在文档标注，G3-2 替换为专属 stinger |

## 8. 验证方式

1. `npm test`：全部用例通过，新增连杀与反馈规则用例通过。
2. `npm run typecheck`：零错误。
3. 代码审阅：确认 `hasAliveEnemies`、`shiftBattleTimers`、`setPause` 三条既有链路未被破坏。
4. 浏览器实景验收（V3-V6）在本批次不执行，留待 G1 全批次完成后按 `TESTING_RULES.md` 单独申请。

## 9. 执行结果

### 9.1 交付内容

| # | 任务 | 实现 |
| --- | --- | --- |
| G1-1 | 伤害数字 | `DamageNumberManager`：Text 对象池复用，五类分色分级（普通白 1×／暴击金 2×／处决红 2×／穿透橙 1.35×／爆炸橙 1.2×），强调类先弹出再飘走，普通类直接飘走；横向随机抖开避免同点重叠 |
| G1-2 | 击杀表现 | `CorpseLayer`：独立池化 Sprite 播放残影，沿伤害方向击退 38-64px 并轻微翻转，压暗 45% 与活体区分，停留 1.5s 后 420ms 淡出；同屏上限 24 具。新增 `spawnBloodBurst` 暗红粒子（普通 8 枚／Boss 14 枚），与白色命中火花在颜色上分开 |
| G1-3 | 连杀计数器 | `KillStreakRules` 承担窗口与档位判定；HUD 右侧状态板下方显示 `×N` 并随连杀升温换色；4 档里程碑（5 RAMPAGE／10 UNSTOPPABLE／20 GODLIKE／35 EXTERMINATION）在画布中线偏上播报；玩家受伤立即清零 |
| G1-4 | 慢动作 | `SlowMotionManager`：S 档 0.28×/900ms、A 档 0.45×/280ms，5 秒全局冷却，高优先级可打断低优先级；Boss 击杀与 A/S 档里程碑触发 |
| 附加 | 震屏分层 | `FeedbackRules.resolveShake` 统一 S/A/B 三档；Boss 击杀改 S 档、Boss 阶段转换改 A 档、普通击杀 B 档，替换原先散落的魔法数字 |

### 9.2 既有链路保护

1. **波次推进**：Zombie 仍在 `finalizeZombieDeath` 内立即 `despawn()`，`WaveManager.hasAliveEnemies` 行为完全不变；尸体表现只走 `CorpseLayer`。
2. **计时平移**：慢动作只改 `physics.world.timeScale` 与 `anims.globalTimeScale`，不动 `time.*`／`tweens.*`，因此 `shiftBattleTimers` 无需为它增加补偿。已核对 Phaser 源码 `physics/arcade/World.js:212-224`，`timeScale` 为除数语义（2.0 = 半速），且 `fixedStep` 默认 `true`、项目未覆写，缩放实际生效。
3. **连杀窗口**：`lastKillAt` 已加入 `shiftBattleTimers`，抽卡冻结不会白清玩家攒下的连杀。
4. **跨局复位**：`create` 重置 `killStreak`／`lastKillAt`；`handleShutdown` 调用 `slowMotion.reset()`、`damageNumbers.destroy()`、`corpseLayer.destroy()`，慢动作缩放不会被下一局继承。
5. **暂停同步**：HUD 新增的连杀与里程碑 tween 已接入 `syncPauseOverlay` 的暂停／恢复分支，与既有 combatAlert／pickupToast 处理一致。

### 9.3 高密度收敛

- 伤害数字：软上限 18（普通类丢弃）／硬上限 30（强调类回收队首后复用）。
- 尸体残影：同屏上限 24，超出立即回收最早一具。
- 慢动作：5 秒全局冷却 + 仅 S/A 档配置，B/C 档事件不触发。

### 9.4 验证记录

| 项 | 命令 | 结果 |
| --- | --- | --- |
| 类型检查 | `npm run typecheck` | 退出码 `0`，TypeScript 零错误 |
| 自动化测试 | `npm test` | 退出码 `0`，`13` 个测试文件、`95` 个用例全部通过（基线 11 文件／80 用例，本轮新增 2 文件／15 用例） |

新增用例：

- `tests/kill-streak.test.ts`（6 例）：窗口内累加、超窗归零、边界值累加、里程碑精确匹配、档位升序与递进、计数颜色升温。
- `tests/feedback-rules.test.ts`（8 例）：震屏分档递减、仅 S/A 配置慢动作、S 强于 A、冷却与优先级打断、强调类判定、高密度降级、软硬上限关系、四档无漏配。

未执行：`npm run build`（需单独授权）；浏览器 V3-V6 实景验收留待 G1 全批次完成后按 `TESTING_RULES.md` 申请。

## 10. 剩余风险与后续项

1. **未经真人验收**：伤害数字字号、连杀播报频率、慢动作时长与震屏强度均未在有头浏览器确认，可能偏强或偏弱，属 V6 范围。
2. **性能未压测**：软硬上限与残影上限是设计值，尚未在 50/100/150 活跃敌人下实测帧率（G6-3）。
3. **里程碑音效为临时映射**：当前复用 `pickup`／`wave`／`bossPhase`，语义不精确，G3-2 替换为专属 stinger。
4. **慢动作期间敌人冷却按真实时间前进**：单次 ≤900ms 影响可忽略；若后续 S 档延长到 2 秒以上需重新评估。
5. **`bestKillStreak` 已入 `GameState.stats` 并透传结算数据，但结算页尚未展示**：属 G4-2 范围。
6. **G1 剩余项未做**：震屏强度可访问性设置（G1-5，依赖 G4-3）、通用击退字段（G1-6，依赖 G2-2）、濒死机制（G1-7，依赖 G3-2 心跳音效）。
