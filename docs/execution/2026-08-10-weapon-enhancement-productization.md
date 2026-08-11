# 2026-08-10 武器强化系统产品化收尾

> 状态：已实施，待浏览器实机与平衡验收
> 关联：`docs/design/weapon-enhancement-system.md`、`PROJECT_MASTER_PLAN.md`

## 1. 目标

收尾已经完成主要代码接线的武器强化系统，使掉落概率回到正式配置、怪物图鉴正确展示强化包，并让设计文档、README 与项目总规划反映当前真实行为。

## 2. 范围

本轮修改：

1. 修复怪物图鉴把 `enhancement_pack` 误判为无效武器的问题。
2. 关闭强化包 50% 测试掉率覆盖，恢复 `zombies.ts` 中普通感染体 3%-5%、Boss 100% 的正式配置。
3. 为图鉴掉落文案和正式掉率路径补充聚焦测试。
4. 同步武器强化设计文档的当前实现：四选一、同武器强化可叠加、覆盖全部 8 把武器。
5. 同步 README 与项目总规划中的功能清单、场景流、配置入口、当前状态和剩余风险。

本轮不做：

1. 不修改任何强化卡效果、倍率、卡片数量或卡片文案。
2. 不修改武器伤害、弹药、掉落经济或 Boss 数值。
3. 不关闭 `unlockAllWeapons`；四把后备武器的正式入池属于独立任务。
4. 不新增局外成长、强化存档或卡片图鉴。
5. 不执行测试、类型检查或构建；需要用户明确同意后另行执行。

## 3. 调用链与影响文件

```text
zombies.ts 正式掉落概率
  -> resolveDropChance
  -> GameScene.spawnDrops
  -> Pickup / CardSelectionScene
  -> EnhancementManager
  -> WeaponManager + HUD

zombies.ts 掉落配置
  -> monsterLibrary.formatDropLine
  -> MonsterLibraryScene
```

主要影响文件：

1. `src/config/testing.ts`
2. `src/config/monsterLibrary.ts`
3. `tests/monster-library.test.ts`
4. `tests/enhancements.test.ts`
5. `docs/design/weapon-enhancement-system.md`
6. `README.md`
7. `PROJECT_MASTER_PLAN.md`

## 4. 操作步骤

1. 在图鉴掉落格式化中显式处理 `enhancement_pack`，输出稳定的“武器强化包 · 概率”文案。
2. 将 `TESTING_FLAGS.enhancementDropChance` 恢复为 `null`，让运行时直接读取每条敌人配置。
3. 增加测试，确认图鉴不再出现“配置异常”，并确认关闭覆盖后实际概率等于配置概率。
4. 更新设计文档中已经过时的“3-6 张”“互斥组”“仅示例卡”等描述。
5. 更新 README 和项目总规划，登记 24 张强化卡、四选一流程及尚未完成的平衡/浏览器验收。
6. 执行代码审阅、调用链检查、`git diff --check` 和 Vite 模块转换请求。

## 5. 实施建议

1. 正式概率的唯一事实来源保持为 `zombies.ts`，测试配置只允许显式覆盖，不复制掉落表。
2. `monsterLibrary` 必须穷举所有 `DropDef.type`，新增类型不能继续落入武器分支。
3. 文档只记录已经存在的行为，不把尚未完成的平衡试玩写成已验收。
4. 全武器测试配发与强化掉率分开收尾，避免一次修改同时改变武器可达性和成长节奏。

## 6. 潜在风险

1. **可达频率下降**：关闭 50% 覆盖后，普通敌人的强化包明显减少；这是恢复正式配置的预期结果，但仍需完整试玩确认节奏。
2. **测试便利性下降**：开发时不再能频繁触发抽卡，需要后续建立显式调试入口，而不是长期污染正式掉率。
3. **文档再次漂移**：当前强化系统已经偏离早期互斥设计，必须以现有代码和测试为事实来源同步描述。
4. **未验收组合**：24 张卡可叠加产生大量组合，本轮不声称平衡完成。

## 7. 优化方案

1. 后续若仍需高频测试，增加仅开发环境可触发的明确调试操作，不恢复常开掉率覆盖。
2. 数值平衡阶段记录每局强化出现次数、选择分布和各武器强化层数。
3. 卡池继续由配置和纯逻辑管理，避免在 `CardSelectionScene` 中增加武器 ID 分支。

## 8. 验证方式

默认执行：

1. 代码审阅：掉落配置、概率解析、拾取、抽卡、强化生效和图鉴展示链路一致。
2. 静态检查：图鉴对五种 `DropDef.type` 都有明确分支。
3. `git diff --check`。
4. Vite 对受影响模块执行开发态转换请求。

待浏览器可连接后完成：

1. 进入怪物图鉴，确认普通感染体和 Boss 的掉落列表显示“武器强化包”而非“配置异常”。
2. 完整打一局，确认普通感染体不再以 50% 概率大量掉落强化包。
3. 拾取强化包并选择一张卡，确认战斗恢复且强化立即生效。
4. 连续取得同一武器的多张卡，确认卡面层数和实际数值持续叠加。

经用户明确同意后建议执行：

```bash
npm test
npm run typecheck
```

## 9. 执行结果

1. `TESTING_FLAGS.enhancementDropChance` 已恢复为 `null`，运行时重新以 `zombies.ts` 的普通感染体 3%-5%、Boss 100% 为唯一正式概率来源。
2. `monsterLibrary.formatDropLine` 已显式处理 `enhancement_pack`，输出“武器强化包 · 概率”；武器分支不再承担未知类型兜底。
3. `tests/monster-library.test.ts` 已增加图鉴文案回归，确认强化包不会显示“配置异常”。
4. `tests/enhancements.test.ts` 已同时覆盖正式配置路径和可选测试覆盖路径，不再在覆盖为 `null` 时跳过断言。
5. `docs/design/weapon-enhancement-system.md` 已按当前 24 张卡、四选一、无互斥叠加、顺序无关解析和本局状态规则重写。
6. README 已同步 10 关、18 类感染体、4 个 Boss、24 张强化卡、抽卡场景与正式掉率；过时的 `@types/node` 缺依赖说明已改为待重新命令验证。
7. 项目总规划已同步当前关卡、怪物、Boss、强化系统、测试文件数量和剩余验收风险；现有十关仍只按原型内容池登记。
8. 已完成调用链审阅和 `git diff --check`；Vite 对 testing、monsterLibrary、enhancements、EnhancementManager、CardSelectionScene 及相关测试模块的转换请求均返回 200。
9. 当前会话没有可用浏览器，未完成图鉴、正式掉率、拾取选卡和叠加效果的实机验收；按项目规则未执行 `npm test`、`npm run typecheck` 或构建。

本轮未偏离既定范围；`unlockAllWeapons` 继续保持开启，留待独立武器经济任务处理。
