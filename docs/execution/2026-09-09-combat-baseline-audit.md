# 2026-09-09 战斗爽感基线审计

> 文档类型：执行记录（路线图第一批交付物）
> 上位规划：`docs/execution/2026-09-09-combat-fun-roadmap.md` §5 R0 全部五步，及 R1-3 的静态部分
> 上位约束：`PROJECT_MASTER_PLAN.md` D-002、D-009；`docs/design/FUN_FIRST_DESIGN.md`
> 验收入口：并入 `docs/execution/2026-09-07-unified-acceptance.md`，本轮不另开测试批次
> 状态：V0 静态审阅 + V1 命令层用例 + V2 类型检查已通过（2026-09-09，见 §10）。
> 未执行 `npm run build`、浏览器实景（V3/V4）与真人体验（V6）

## 1. 本轮定位

路线图 §62 已把 R0/R1 定性为「审计、补缺、定向调参和验证」。本文件交付其中的纯静态工作：

- R0-1 调用链审计，区分「已实现 / 已接线未验证 / 确实缺失」（§2）
- R0-2 权威入口确认与重复计数排查（§3）
- R0-3 连杀奖励、里程碑、火力过载与 HUD 一致性核对（§3.2、§6.3）
- R0-4 代表武器与 §4.5 六环反馈链逐环核对（§5、§5.1）
- R0-5 并发上限与池化实测值记录（§4）
- R1-3 波次目标可读性的静态部分（§6.5）

**不含任何代码修改。** 所有结论均由源码阅读得出，行号对应当前工作区（基线 `4621d2a` 加未提交改动）。

### 1.1 术语说明

路线图原文的 P0-P3 与项目既有全局阶段号（P0 客观基线验证、P1 方向锁定、P2 垂直切片、P3/P4 扩展批次）撞名。
本文件统一改用 **R0-R3** 指代路线图内部阶段，避免与 `verticalSlice.ts` 注释、Goal 表中的「（P3）」「（P4）」混淆。

## 2. 系统基线矩阵（交付物 1）

状态判定口径：**已验证**＝有命令层或实景证据；**已接线未验证**＝代码完整但缺 V3/V4/V6；**缺失**＝无实现。

| 系统 | 路径 | 关联 Goal | 状态 |
| --- | --- | --- | --- |
| 连杀规则 | `systems/KillStreakRules.ts` | G1-3 | 已验证（`tests/kill-streak.test.ts` 5 例） |
| 分级反馈 | `systems/FeedbackRules.ts` | G1-1/G1-5 | 已验证（`tests/feedback-rules.test.ts`） |
| 慢动作 | `systems/SlowMotionManager.ts` | G1-4 | 已验证（`tests/slow-motion-manager.test.ts`） |
| 伤害数字 | `systems/DamageNumberManager.ts` | G1-1 | 已接线未验证（表现层无用例） |
| 尸体残影 | `systems/CorpseLayer.ts` | G1-2 | 已接线未验证 |
| 无尽火力过载 | `systems/EndlessModePolicy.ts` | G6-5 | 已验证 V0-V5，过载 II/III 实机未触发 |
| 波次分段 | `systems/WaveManager.ts` + `config/waveShape.ts` | G6-1 | 已验证（`tests/levels.test.ts`、`level-batch-validation`） |
| 剧本时刻 | `systems/ScriptedMomentSystem.ts` | G6-2 | 已验证（`tests/scripted-moments.test.ts`） |
| 敌方技能 | `systems/EnemyAbilitySystem.ts` | G6-7 | 已接线未验证（Boss 三阶段缺实景） |
| 区域效果 | `systems/AreaEffectFactory.ts` | G1-2/G2-10 | 已接线未验证（四道具区域效果未实机确认） |
| 武器特效 | `systems/WeaponEffectManager.ts` | G2-1~G2-6 | 已接线未验证 |
| 强化卡 | `systems/EnhancementManager.ts` | G2-7 | 已验证 V0-V5，V6 待真人 |
| 音频优先级 | `systems/SoundManager.ts` | G3-1 | 已验证（`tests/audio-priority.test.ts`），V6 混音待真人 |
| 战斗诊断 | `systems/CombatDiagnostics.ts` | G6-5 | 已验证（`tests/combat-diagnostics.test.ts`） |
| 危墙 | `systems/BreakableObstacleRules.ts` | G6-8 | 已接线未验证（V1-V6 全缺） |
| **尸潮调度** | `systems/LureSystem.ts` / `LureRules.ts` | 未立 Goal | **已接线未验证**（`4621d2a`，仅静态核对） |
| **炮弹反打** | `systems/CountershotSystem.ts` / `CountershotRules.ts` | 未立 Goal | **已接线未验证**（同上） |
| 角色技能 | `systems/CharacterSkillManager.ts` | D-010 | 已验证规则层（`tests/character-skill-rules.test.ts`） |
| 对象池 | `utils/ObjectPool.ts` | G1-2 | 已验证关停幂等（`tests/scene-lifecycle.test.ts`） |

矩阵结论：**19 个系统中无一项「缺失」**。爽感主链（击杀→连杀→分级反馈→特效→池化）在架构层完整。
真实欠口集中在实景与真人验收，与路线图 §62 的定位一致，不需要重建任何系统。

需要强调的是「零缺失」只针对系统层。玩法层仍有确认缺口（§6），其中连杀收益、构筑摘要和环境连锁仍需实景收口，
而阶段目标已经在当前工作区的 P2 `level_2` 切片接入；系统存在不等于所有关卡都已经使用它。

最后两行是路线图 §3 原本遗漏的系统。它们是最新落地且验证最薄的部分，而路线图 R1-4 要「重点验证尸潮」——
必须先补进基线才能被审计覆盖。本文件已纳入。

## 3. 连杀事件链检查表（交付物 2）

### 3.1 实际调用链

```text
子弹命中        resolveBulletHit()          GameScene.ts:1478
爆炸/残留/连锁  AreaEffectFactory           注入 damageZombie 回调（:346）
喷火/冷冻扇形   FlameConeSystem             注入 damageZombie 回调（:374）
危墙坍塌        damageBreakableObstacles…   :1288，kind:'explosion'
链式闪电        resolveChainLightning       :1621，kind:'normal'
        └──────────────┬──────────────┘
                       ▼
            damageZombie()                 :1687   ← 唯一伤害入口
              ├─ zombie.hurt()             Zombie.ts:608
              ├─ damageNumbers.show()      :1692
              └─ handleZombieDeath()       :1700（dead 时）
                       ▼
            handleZombieDeath()            :1700
              ├─ Boss：beginDeathAnimation(→ 延迟回调)  :1704
              └─ 普通：直接 finalizeZombieDeath          :1713
                       ▼
            finalizeZombieDeath()          :1716   ← 唯一结算入口
              ├─ stats.kills += 1          :1725
              ├─ spawnDrops / DeathBurst / BloodBurst / corpseLayer
              ├─ zombie.despawn()          :1752
              └─ registerKill(isBoss)      :1754
                       ▼
            registerKill()                 :1765   ← 唯一连杀入口
              ├─ advanceKillStreak()       KillStreakRules.ts:33
              ├─ emit killStreakChanged    :1771
              ├─ resolveKillStreakMilestone→ emit milestone / 音频 / 震屏 / 慢动作
              └─ activateEndlessOverdrive  :1788（仅 endless）
```

### 3.2 逐项核对结论

| 检查项 | 结论 | 证据 |
| --- | --- | --- |
| 连杀是否只有一个权威入口 | **是** | 全仓 `advanceKillStreak` 仅 `registerKill` 一处调用 |
| 伤害是否只有一个权威入口 | **是** | 无任何系统直接调 `hurt`/`handleZombieDeath`，全部经注入回调 |
| 同帧多弹丸能否重复计数 | **否** | `beginDeathAnimation():408` 遇 `dying` 返回 false，注释明写幂等保护 |
| Boss 动画期间再受伤能否二次结算 | **否** | `hurt():609` 遇 `dying` 直接返回 false，不再触发死亡分支 |
| 穿透/爆炸/环境命中同一目标 | **只计一次** | 三者共用 `damageZombie`，`finalizeZombieDeath:1717` 有 `!active` 守卫 |
| 结算顺序是否安全 | **是** | `despawn()`（:1752）先于 `registerKill`（:1754），杜绝回池后重入 |
| 尸体是否延长 active 生命周期 | **否** | 快照 `getCorpseSnapshot()` 在 despawn 前取，残影走独立 `CorpseLayer` |
| 里程碑是否重复播报 | **否** | `resolveKillStreakMilestone` 精确等值匹配，仅恰好达到时返回 |
| Boss 震屏是否叠加 | **否** | `registerKill:1776` 显式跳过 isBoss 的 B 级震屏，避免与 S 级重叠 |

**路线图 §9.2 前两条逻辑用例在架构层已成立，无需新增防重复机制。**

## 4. 特效并发上限记录（交付物 3）

| 资源 | 上限 | 超限策略 | 定义位置 |
| --- | --- | --- | --- |
| 伤害数字（软） | 18 | 普通伤害不再新增；强调类不受限 | `FeedbackRules.ts:82` |
| 伤害数字（硬） | 30 | 强调类回收队首复用，普通类丢弃 | 同上，`resolveDamageNumberAdmission:111` |
| 尸体残影 | 24 | 立即回收最早一具 | `CorpseLayer.ts:15` |
| 慢动作 | 冷却 5000ms | 同级及以下等冷却；高优先级可抢占 | `SlowMotionManager.ts:12`、`canTriggerSlowMotion:65` |
| 慢动作档位 | 仅 S/A | B/C 不触发，防高密度连续慢放 | `FeedbackRules.ts:48-53` |
| 震屏档位 | S/A/B | C 级为 null；按可访问性系数缩放 | `FeedbackRules.ts:18-31` |
| 特效精灵池 | **无硬上限** | 初始 12，`getFirstDead` 取不到即新建 | `EffectSpritePool.ts:47`、`ObjectPool.ts:37-41` |
| 粒子精灵池 | **无硬上限** | 同上（共用 `ObjectPool`） | `ParticleSpritePool.ts` |

强调类免降级白名单：`critical`、`execute`、`pierce`、`explosion`（`FeedbackRules.ts:87-92`）。
这正是路线图 §4.5 第 4 条「高价值命中需要更强反馈」和 §8「达到上限后仍保留关键反馈」的现有实现。

## 5. 代表武器反馈规范（交付物 4）

路线图 R0-4 选定的五把代表武器实配（`config/weapons.ts`）：

| 武器 | 配置名 | 爽感签名 | 关键字段 |
| --- | --- | --- | --- |
| 手枪 | 沙漠之鹰 `pistol` | 暴击/爆头 | `headshotChanceBonus:0.1`、`headshotMultiplier:2.5`、`infiniteAmmo:true` |
| MP5 | `smg` | 移动扫射压制 | `fireRate:50`、`magazineSize:50`、`movementPenalty` |
| SPAS-12 | `shotgun` | 处决/击退 | `knockback:150`、`executeThreshold:0.3`、`reloadMode:'shell'`、`damageDropoff` |
| M4A1 | `rifle` | 穿透连杀 | `penetration:6`、`chainBonus:1.2` |
| 爆炸武器 | RPG-7 `rpg` | 大清屏 | `ammoType:'explosive'`、`projectileRadius:9`、`bulletSpeed:390` |

**「爆炸武器」明确落到 `rpg`**（G2-6 定位「大清屏」），而非 `m79`（弹跳节奏爆破，机制侧重不同）。
路线图原文未点名，此处收口。

补充发现：`barrett` 与 `railgun` 已有 `killSlowMotionTier:'A'` 字段，即武器级击杀慢动作已可配置。
R0-4 补齐代表武器反馈时应优先复用该字段，而不是新增机制。

### 5.1 §4.5 六环反馈链逐环核对

| 环节 | 状态 | 现有实现 |
| --- | --- | --- |
| 1 开火 | **齐备** | `WeaponEffectManager`：位图帧枪口焰（按档位）、抛壳（弹链触发 +2 枚）、概率余烟、喷火火舌（跨帧）、加特林积热；素材缺失回落图元 |
| 2 飞行 | **齐备** | `Bullet` 按武器 `color`／`projectileRadius`／`bulletSpeed` 表达；RPG/M79/Railgun 有独立弹体半径 |
| 3 命中 | **齐备** | `resolveBulletHit:1513-1526`：命中音、`spawnImpactBurst`（穿透武器降为 3 粒）、按 kind 变色、按武器 `knockback` 击退 |
| 4 高价值命中 | **齐备** | 处决/爆头/穿透各有独立音效（:1509-1511）、`×N PIERCE!` 标签（:1529）、穿透 4+ 触发 A 级震屏与慢动作（:1535-1538）、处决 A 级震屏（:1541） |
| 5 击杀 | **齐备** | `finalizeZombieDeath`：`spawnDeathBurst`＋`spawnBloodBurst`＋`corpseLayer`（含弹道方向击退滑出）＋`enemyDeath` 音；Boss 走 S 级慢动作＋专属死亡前导 |
| 6 连锁 | **齐备** | `AreaEffectFactory` 爆炸／残留／连锁；`resolveChainLightning` 链式闪电；`killExplosion` 击杀爆炸（强化卡） |

**R0-4 核心结论：六环全部已实现，无一环缺失。**
路线图 R0-4 原文假设"补齐现有链路中缺失的命中、击杀和高价值命中特效"——
静态核对表明这三环恰恰是实现最完整的部分。真实待办不是补特效，而是 V3/V4 实景确认这些反馈的观感与可读性。

因此 R0-4 不产生代码改动。**若后续实景发现观感不足，属于调参而非补功能**，须按 §8「可调性」记录旧值/新值。

## 6. 已确认缺口清单（交付物 5）

按路线图 §3 约束「只有在确认现有接口无法承载需求后才新增系统或字段」，以下缺口均有源码证据。

### 6.1 缺口 A：击杀来源未传入连杀链

- **现状**：`DamageImpact.kind` 有五个取值（`FeedbackRules.ts:85`），但只喂给 `damageNumbers.show()`。
  `registerKill(isBoss)`（`GameScene.ts:1765`）只接收布尔量，`finalizeZombieDeath` 手上有 `impact` 却没往下传。
- **影响**：路线图 §4.3「击杀、穿透击杀、爆炸连锁击杀和环境击杀都要明确记录来源」无法成立；
  §4.5 第 4 条按来源分级反馈也拿不到判据。
- **最小修法**：`registerKill(isBoss, impact?.kind)`，仅扩参不新增系统。`KillStreakRules` 保持纯逻辑不动。
- **判定**：真实缺口，可实施。

### 6.2 缺口 B：特效与粒子池无硬上限

- **现状**：`ObjectPool.acquire()`（`utils/ObjectPool.ts:37-41`）拿不到空闲对象就 `factory()` 新建，无 `maxSize`；
  `EffectSpritePool` 也未定义上限常量。
- **影响**：与路线图 §4.5 第 5 条「必须受池容量限制」、§8「特效池峰值」直接冲突。
  伤害数字（30）和尸体（24）都有硬上限，特效与粒子是唯一例外。
- **风险边界**：稳态下开火频率有 `fireRate` 约束，池会收敛；极端密度（150 敌 + 连锁爆炸）才可能失控。
  当前无实测数据证明会失控，**不建议先改数值，应先在 R1-5 观测峰值再决定上限值**。
- **判定**：真实缺口，但需先有观测数据，不宜凭空设常量。

### 6.3 缺口 C：固定关卡连杀奖励尚未完成验证

- **现状**：`activateEndlessOverdrive()` 仍只处理无尽模式；当前工作区已经新增
  `LEVEL_STREAK_SKILL_REFUNDS`、`refundSkillCooldown()` 和 `applyLevelStreakReward()`，
  固定关卡在 5/10/20/35 里程碑尝试退还主动技能冷却。
- **影响**：代码已有首版战斗收益，但仍未通过命令、浏览器和真人验收；不能把未提交实现写成已完成 Goal。
- **判定**：从“确实缺失”转为“已接线未验证”。奖励方向与首版数值记录在
  `docs/execution/2026-09-09-mainline-streak-reward-goal.md`。
- **决策状态**（2026-09-09）：奖励轴向（技能冷却返还，不走伤害倍率）与数值口径（绝对毫秒四档）
  已经用户确认，见该文档 §3.2；确认时另记录了绝对毫秒对五个角色价值差 2.2 倍的已接受代价（§3.3）。
  轴向已锁定，但缺口 C 的判定仍是「已接线未验证」——确认产品方向不等于通过 V1/V2 与实景验收。
- **已实施**（2026-09-09，见 §9）：按 §4.3 列表首项「技能充能」落地，退还角色主动技能冷却。
  刻意不用伤害倍率，满足 R2-2「避免所有奖励折算为伤害倍率」；退冷却由 `refundSkillCooldown` 夹在
  「立刻可用」，天然有上限，不会滚雪球。数值为首版初稿，待实机调。

### 6.4 缺口 D：观测档位与切片上限矛盾

- **现状**：路线图 §8 要求建立 50/100/150 活跃敌人观测档位，但 `config/verticalSlice.ts:17`
  把切片 `maxConcurrentEnemies` 锁为 40，注释明写「在完成实测前不让切片越过该档位」。
- **判定**：文档内部矛盾。50/100/150 只能在无尽模式压测（对应 G6-3 已完成的档位），
  切片内跑不到。需在路线图 §8 补一句区分，属文档修订而非代码问题。

### 6.5 缺口 E：固定关卡波次目标仅在 P2 切片接入

- **现状**：无尽模式有 8 种波次类型，每种都带 `label`/`title`/`subtitle` 明确告诉玩家该做什么
  （`config/endless.ts:136-143`）。当前工作区已为冻结的 P2 `level_2` 三个阶段新增
  `WaveObjectiveDef`、HUD 常驻短标签和播报文案，并由 `validate.ts` 校验；测试还明确约束其余九关保持缺省。
- **影响**：P2 切片已有可读目标，但第 1、3-10 关仍回落到 `${getLevelLabel()} 推进中`，
  不能把单个切片的接线写成全主线完成。
- **实施边界**：本阶段不批量扩展十关。先完成 `level_2` 的 V1-V6 验收；只有 P2 通过后，
  才为下一批正式关卡逐关设计目标文案，并沿用 `WaveDef.objective` 与现有校验入口。
- **判定**：从“固定关卡完全缺失”修正为“P2 已接入、主线覆盖待后续批次”。

### 6.6 已在本文件收口的两处文档缺口

- 路线图 §3 遗漏 `LureSystem`/`LureRules`/`CountershotSystem`/`CountershotRules` → 已补入 §2 矩阵。
- 路线图 §9 未交叉引用统一验收入口 → 本文件头部已声明并入 `2026-09-07-unified-acceptance.md`。

## 7. 验证声明

- **已执行**：V0 静态代码审阅。逐一打开 `GameScene`、`Zombie`、`KillStreakRules`、`FeedbackRules`、
  `SlowMotionManager`、`CorpseLayer`、`DamageNumberManager`、`EffectSpritePool`、`ObjectPool`、
  `AreaEffectFactory`、`FlameConeSystem`、`EndlessModePolicy`、`weapons.ts`、`verticalSlice.ts`、`validate.ts`
  及 36 个测试文件清单，全部结论标注了行号。
- **未执行**：`npm test`、`npm run typecheck`、`npm run build`、浏览器实景、真人体验。
  §2 矩阵中「已验证」一列引用的是既有执行文档记录的历史结论，**本轮没有重跑任何用例**。
- **剩余风险**：缺口 B 的失控边界、缺口 C 的奖励强度、§2 中 8 项「已接线未验证」的真实表现，
  都无法由静态阅读证明，必须留到获授权的命令与实景批次。

## 8. 执行记录

| 日期 | 阶段 | 结果 | 证据 |
| --- | --- | --- | --- |
| 2026-09-09 | R0-1/R0-2/R0-5 | 五项交付物完成；初次记录 5 个玩法缺口，19 个系统零缺失；后续已按当前工作区改动校正状态；仅 V0 | 本文件 |
| 2026-09-09 | R0-4 | 六环反馈链核对完成，全部已实现，不产生代码改动；仅 V0 | 本文件 §5.1 |
| 2026-09-09 | R1-3 静态部分 | 校正缺口 E：P2 `level_2` 已接入可读波次目标，其余关卡按切片约束保持缺省；仅 V0 | 本文件 §6.5 |
| 2026-09-09 | 路线图回写 | 修订 §3 基线、§3.1 编号、§4.2 Boss 口径、§5 阶段号与 R1 门槛、§8 档位适用范围、§9.4 验收入口、§10 记录表 | `2026-09-09-combat-fun-roadmap.md` |
| 2026-09-09 | 缺口 C 实施 | 固定关卡连杀奖励落地（技能充能）；V1/V2 通过（2026-09-09） | 本文件 §9.1 |
| 2026-09-09 | 缺口 E 实施 | `level_2` 三阶段可读目标落地；V1/V2 通过（2026-09-09） | 本文件 §9.2 |
| 2026-09-09 | R2-3 | 抽卡界面构筑摘要落地；V1/V2 通过（2026-09-09） | 本文件 §9.3 |
| 2026-09-09 | R2-4 | 发现十关场景桶全都超出连锁阈值；切片补连锁对并加门禁；仅 V0 | 本文件 §9.4 |
| 2026-09-09 | R2-1 | 确认卡池已具备三个互斥流派，不需重做卡；补流派可见性与门禁；仅 V0 | 本文件 §9.5 |

## 9. 本轮实施明细

本轮新增能力均按 §3 约束 5「新字段先补 `types.ts` 与 `validate.ts`，再接入运行时」的顺序落地。
**全部改动只做过静态审阅，未执行 `npm test` 或 `npm run typecheck`。**

### 9.1 缺口 C：固定关卡连杀奖励（技能充能）

| 文件 | 改动 |
| --- | --- |
| `systems/CharacterSkillRules.ts` | 新增纯逻辑 `refundSkillCooldown(state, refundMs, now)`，`readyAt` 夹在 `now`，不动 `activeUntil` |
| `systems/KillStreakRules.ts` | 新增 `LEVEL_STREAK_SKILL_REFUNDS` 四档与 `resolveLevelStreakRefund`，门槛沿用 5/10/20/35 |
| `systems/CharacterSkillManager.ts` | 新增 `refundCooldown(refundMs, now)`，返回实际退还量供调用方决定是否播报 |
| `scenes/GameScene.ts` | `registerKill` 末尾新增 `applyLevelStreakReward(now)`，`mode !== 'level'` 直接返回 |
| `tests/kill-streak.test.ts` | 新增 5 例：门槛对齐、精确匹配、递增、累计上限、文案非空 |
| `tests/character-skill-rules.test.ts` | 新增 4 例：按量退还、夹在立刻可用、非正原样返回、不延长窗口 |

首版数值与定值依据：

| 连杀 | 退还 | 依据 |
| --- | --- | --- |
| 5 | 800ms | 最轻一档，给一次早期正反馈 |
| 10 | 1500ms | 与无尽火力过载 I 同门槛，但不同轴 |
| 20 | 2500ms | — |
| 35 | 3500ms | — |
| 累计 | **8300ms** | **硬约束：必须低于最短技能冷却 9000ms（相位疾冲），否则一条 35 连杀链会让该技能全程可用** |

累计上限这条约束是写用例时才发现的：初稿定 1000/2000/3500/5000（累计 11500ms）已超过 9000ms，
随即下调为现值并把该约束固化成用例，避免后续调参再次越界。

### 9.2 缺口 E：固定关卡可读波次目标

| 文件 | 改动 |
| --- | --- |
| `config/types.ts` | 新增 `WaveObjectiveDef`（label/title/subtitle/accent?），`WaveDef` 增可选 `objective` |
| `config/validate.ts` | 校验文案非空、`label` ≤ 4 字、`accent` 合法、与 `endless` 互斥 |
| `config/levels.ts` | `level_2` 三阶段配置目标：清群「逐类适应敌群，建立连杀节奏」／压制「密度爆发，喘息期优先集火坦克」／备战「远程与重装同场，为首领战保留弹药」 |
| `scenes/GameScene.ts` | `announceWave` 播报优先级改为 `endless > objective > 兜底`；新增 `getWaveObjective()` |
| `scenes/HUDScene.ts` | `waveText` 固定关卡显示 `WAVE N/total · <label>`，与无尽的 `WAVE N · <label>` 格式统一 |
| `tests/levels.test.ts` | 新增 2 例：切片三阶段目标完整且文案互不重复；其余九关保持缺省 |

配色沿用 `config/endless.ts:136-141` 既有色板（0xfbc02d／0xff9236／0xd65b47），三阶段递进升温。
未配置目标的九关走原兜底文案，行为不变。

### 9.3 R2-3：强化选择的构筑摘要

| 文件 | 改动 |
| --- | --- |
| `systems/EnhancementManager.ts` | 新增纯静态 `summarizeBuild(activeEnhancements)` 与 `BuildSummaryEntry`；按武器汇总层数，层数降序、同层按武器名稳定排序，未知 id 跳过不抛错 |
| `scenes/CardSelectionScene.ts` | 新增 `createBuildSummary()`，在字幕下方（y=174，卡片上沿 190）渲染「当前构筑 沙漠之鹰 ×2 MP5 ×1」；首次强化无已激活项时整行不渲染 |
| `tests/enhancements.test.ts` | 新增 5 例：空构筑、按武器汇总、排序稳定、脏 id 跳过、总层数与 `countActiveForWeapon` 一致 |

缺这层信息时卡面只讲「这张卡对这把枪的涨幅」，玩家看不到整局已往哪几把枪投资，
第 2 次以后的选择只能靠记忆，容易把强化摊平而形成不了流派。

### 9.4 R2-4：环境连锁机会

**这是本轮第二个「配置与设计意图脱节」的发现。** `level_2` 的 briefing 写着
「把基础尸群引向油桶」，两座广播站也确实紧邻油桶（西侧诱饵 350,300 ↔ 油桶 270,360，相距 100px），
但四个场景桶两两相距 **256px 以上**，而油桶的连锁触发距离只有 **106px**（爆炸半径 90 + 碰撞半径 16）。
结果是场景桶永远各自独立引爆，「环境连锁」只在玩家自己把携带桶放到一起时才发生。

十关全部如此：都摆了 4-7 个爆炸桶，但没有任何一对在连锁阈值内。

| 文件 | 改动 |
| --- | --- |
| `config/environmentChain.ts` | 新建纯逻辑模块：`findEnvironmentChainPairs` / `hasEnvironmentChainOpportunity`，判定式复刻 `AreaEffectFactory.explode` 的 `A.爆炸半径 + B.碰撞半径`，方向敏感 |
| `config/levels.ts` | `level_2` 两侧各补一个油桶（270,450 / 1010,450），与既有桶相距 90px 成立连锁；保持该关左右对称，不移动 G6-1 已调过的既有摆位 |
| `config/validate.ts` | 切片门禁新增连锁机会校验，防止后续改坐标时静默退回一次性摆设 |
| `tests/environment-chain-rules.test.ts` | 新建 6 例：阈值闭区间、超一像素不连锁、非 chainable 排除、单物不成立、方向敏感、切片有连锁对且十关都有可连锁物 |

放在 `config/` 而不是 `systems/`：`validate.ts` 需要引用它，而 config 层此前不依赖 systems 层，
反向依赖会把分层倒过来。该模块只读 `ITEMS` 与 `PropPlacement`，本质是配置分析。

其余九关的摆位调整**未做**：§6 要求先冻结切片再按模板扩展，
用例只锁「每关都有可连锁物」这条下界，具体坐标属后续批次。

### 9.5 R2-1：三个可辨识流派

静态盘点卡池后确认 **R2-1 不需要重做卡**：24+ 张行为化卡（G2-7）在机制上早已分成互斥的几组，
按签名效果统计为 `setBurstCount` 12 张、`setMarkOnHit` 8 张、`setAmmoChain` 8 张、
`setKillExplosion` 6 张、`setImpactLingering` 3 张。真实缺口是**流派对玩家完全不可见**：
卡面只讲自己那一张的数值，从不提示"你已经在走爆炸连锁流，这张能接上"。

取支撑最充分且机制互不重叠的三组立为首批流派：

| 流派 | 签名效果 | 卡数 | 打法 |
| --- | --- | --- | --- |
| 爆炸连锁 | `setKillExplosion` | 6 | 击杀本身触发爆炸，把密集敌群变成连环引爆 |
| 标记猎杀 | `setMarkOnHit` | 8 | 先标记再集火，奖励持续咬住同一高价值目标 |
| 弹链爆发 | `setAmmoChain` | 8 | 固定间隔追加齐射，奖励不松扳机的持续压制 |

| 文件 | 改动 |
| --- | --- |
| `config/enhancementArchetypes.ts` | 新建：三个流派定义 + `resolveCardArchetypes` / `countActiveInArchetype` / `countCardsInArchetype` |
| `scenes/CardSelectionScene.ts` | 卡面 y=-halfHeight+158 加流派徽标，显示「取下这张之后」的进度（如「爆炸连锁 3/3」）；构筑摘要行追加流派进度段 |
| `tests/enhancement-archetypes.test.ts` | 新建 11 例：定义唯一性、每流派 ≥3 张（R2-1 门禁）、推导正确、纯数值卡不属任何流派、签名互斥、进度统计、脏 id 跳过 |

**流派从 `effects` 推导而非手工打标**：手工标签在新增卡时必然漏标，机制字段才是卡的真实行为来源。
新增一张带 `setKillExplosion` 的卡会自动进入爆炸连锁流。

三个签名效果当前**互斥**（已验证无任何一张卡同时携带两个），这是流派可辨识的前提——
一张卡若同时给击杀爆炸和标记，玩家就无法从卡面读出它属于哪条路线。该性质已固化为用例。

### 9.6 当前统一验证边界

R2-1、R2-2、R2-3、R2-4 目前都是**已接线未验证**：

1. R2-1 流派徽标和 R2-3 构筑摘要只证明了数据能够从真实 `ENHANCEMENTS` 推导，未证明抽卡界面在宽窄视口不重叠。
2. R2-2 连杀奖励只证明了纯规则和场景门禁存在，未证明自然击杀时提示、冷却条和暂停/抽卡时间平移正确。
3. R2-4 只证明 `level_2` 的油桶摆位通过配置几何判定，未证明实机引爆顺序、重复结算和尸潮调度组合成立。
4. ~~新增测试文件和断言尚未执行，不能写成 V1/V2 通过。~~
   **已于 2026-09-09 执行并通过，见 §10。** 第 1-3 条仍然成立：V1/V2 只覆盖纯规则与配置几何，
   实机表现（提示、冷却条、引爆顺序、时间平移）仍待 V3/V4。

### 9.7 未实施的缺口

- **缺口 A**（击杀来源未入连杀链）：`registerKill` 扩参本身简单，但没有现成消费方——
  `stats.headshots/executions/pierceHits` 记的是命中而非击杀。加消费方需新增 stats 字段并同步结算页，
  属独立改动，不与本轮两项混批。
- **缺口 B**（特效／粒子池无硬上限）：必须先有 R1 实景峰值才能定常量，否则是凭空设值。

## 10. V1/V2 验证记录（2026-09-09）

用户明确授权后执行。命令、结果与暴露的缺陷如下。

### 10.1 执行结果

| 命令 | 结果 |
| --- | --- |
| `npm run typecheck`（`tsc --noEmit`） | **通过，零错误** |
| `npm test`（`vitest run`） | **38 文件 / 646 用例全部通过** |

首轮 `npm test` 为 **645 通过 / 1 失败**，`npm run typecheck` 报 **1 个错误**，两者指向同一处；
修复后重跑两项均通过。用例数由改造前的 36 文件增至 38 文件。

### 10.2 首轮暴露的既有缺陷（非本轮改动引入）

```text
tests/config-integrity.test.ts(167,26): error TS2339:
  Property 'radius' does not exist on type 'CountershotZombieAbility | ...'
```

- **成因**：`4621d2a`（炮弹反打，提交信息自述「仅静态核对，未验证」）新增了 `CountershotZombieAbility`，
  该 kind 用 `blastRadius` + 投射物字段（与 `ranged` 同族），没有 `radius`。
  但 `config-integrity.test.ts` 的 `else` 分支假设「非 dash/volley/summon 就一定有 `radius` 和 `damage`」，
  未为新 kind 开分支，于是 `expect(undefined).toBeGreaterThan(0)` 直接抛错。
- **取证**：`git status --short` 确认 `tests/config-integrity.test.ts` 不在本轮改动清单内；
  `git log -S "CountershotZombieAbility" -- src/config/types.ts` 指向 `4621d2a`。
- **修复方向**：配置本身合法，缺的是测试分支。为 `countershot` 补独立分支，
  并断言其真正的设计不变量而非只求编译通过：

| 断言 | 实配值 | 设计含义 |
| --- | --- | --- |
| `projectileRange > maxRange` | 880 > 560 | 炮弹能飞出索敌距离 |
| `blastRadius > 0` | 82 | 落点有爆炸范围 |
| `returnDamage > damage` | 260 > 30 | 反打是读招收益，必须重于来袭炮弹 |
| `returnSpeed > projectileSpeed` | 520 > 160 | 打回去比飞过来快 |
| `exposureMultiplier > 1` | 1.25 | 破绽窗口真的放大伤害 |
| `exposureDuration > 0` | 1200 | 窗口时长为正 |
| `structureDamage > 0` | 180 | 能拆结构 |

**这条缺陷是本次授权跑测试的直接产出**：它在 `4621d2a` 合入后一直存在，
静态审阅无法发现（类型窄化错误只有编译器能抓），也说明该批次「仅静态核对」的自述是准确的。

### 10.3 本批新增用例的定向确认

逐条 verbose 确认已执行且通过，不依赖汇总数字：

| 用例组 | 数量 | 覆盖 |
| --- | --- | --- |
| 固定关卡连杀奖励 | 5 | 门槛对齐里程碑、精确匹配、递增、累计上限 <9000ms、文案非空 |
| 冷却退还 | 4 | 按量退还、夹在立刻可用、非正原样返回、不延长生效窗口 |
| 强化流派 | 11 | 定义唯一性、每流派 ≥3 张、推导正确、纯数值卡无流派、签名互斥、进度统计、脏 id 跳过 |
| 环境连锁 | 6 | 阈值闭区间、超一像素不连锁、非 chainable 排除、单物不成立、方向敏感、切片有连锁对 |
| 构筑摘要 | 5 | 空构筑、按武器汇总、排序稳定、脏 id 跳过、与 `countActiveForWeapon` 一致 |
| 阶段目标 | 2 | 切片三阶段文案互不重复且 label ≤4 字；其余九关保持缺省 |

其中「累计退还量不超过最短技能冷却」这条在**编写阶段**就抓出一个真实数值错误：
初稿 1000/2000/3500/5000 累计 11500ms 超过相位疾冲的 9000ms 冷却，
一条 35 连杀链会让该技能全程可用；下调为 800/1500/2500/3500（累计 8300ms）后通过。

### 10.4 仍未执行

- `npm run build`：未授权，单独申请。
- V3/V4 浏览器实景：R1 的五项量化门槛（时长／帧率／空窗／断连／峰值）全部依赖它。
- V6 真人体验：爽感、难度与混音结论只能由真人回填。

按 `TESTING_RULES.md` §13，本轮结论为**客观通过，主观待验**。
