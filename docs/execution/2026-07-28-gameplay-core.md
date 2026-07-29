# ExterminateZombies 当前卡点续建执行文档

## 目标

基于现有 `src/config`、`entities`、`systems` 草稿，补齐最小可玩的 Phaser 主链路，使项目从“配置与局部逻辑已存在”推进到“可以进入游戏、刷怪、射击、受伤、失败/过关、使用基础场景道具与地雷、推进波次”。

## 范围

本轮实施仅覆盖以下内容：

1. 补齐项目入口与场景链路：
   - `src/main.ts`
   - `src/scenes/BootScene.ts`
   - `src/scenes/PreloadScene.ts`
   - `src/scenes/MainMenuScene.ts`
   - `src/scenes/GameScene.ts`
   - `src/scenes/HUDScene.ts`
   - `src/scenes/GameOverScene.ts`
   - `src/scenes/LevelClearScene.ts`
   - `src/scenes/SettingsScene.ts`
2. 补齐当前卡住的玩法系统：
   - `Prop`
   - `AreaEffectFactory`
   - `ItemManager`
   - `WaveManager`
3. 连接现有系统：
   - `InputManager`
   - `WeaponManager`
   - `GameState`
   - `Player`
   - `Zombie`
   - `Bullet`
4. 修复当前已知类型问题，确保 `npm run typecheck` 通过。

本轮不覆盖以下内容：

1. 正式美术资源替换，仅使用占位几何图形。
2. 武器/血包/道具掉落拾取系统完整实现。
3. 多关卡完整流程与关卡选择 UI，仅保证 `level_1` 可跑通。
4. 高成本验证，如 `npm run build`、全量发布验证。

## 范围调整记录

### 第二阶段扩展(本次继续开发)

由于最小可玩闭环已经完成，当前阻塞点从“无法进入游戏”转为“战斗奖励循环和设置页不可操作”。因此本轮在不改变总体架构的前提下，扩展以下范围：

1. 新增 `Pickup` 掉落实体，打通僵尸死亡 → 掉落 → 玩家拾取 → 数值更新闭环。
2. 补足实战资源流：
   - 弹药拾取
   - 武器拾取
   - 道具补给
   - 生命恢复
3. 将 `SettingsScene` 从只读展示改为真实改键界面，并继续持久化到 `SaveManager`。

偏离原因：

1. 如果没有掉落/拾取，当前 `WeaponManager` 只能消费初始资源，长局手感和多武器切换价值不足。
2. 如果设置页仍是静态展示，计划中的“可自定义键位”还没有真正落地。

影响范围：

1. 新增 `src/entities/Pickup.ts`。
2. 修改 `GameScene`、`WeaponManager`、`ItemManager`、`SettingsScene`。
3. 调整 `zombies` 配置中的部分掉落表，使新链路有实际触发机会。

调整后的验证重点：

1. 僵尸死亡后可按配置掉落。
2. 玩家接触后能正确获得弹药、武器、道具或生命。
3. 设置页可点击动作并录入新的键盘/鼠标/滚轮绑定。
4. `npm run typecheck` 继续通过。

### 第三阶段扩展(继续计划任务)

在掉落与改键闭环完成后，当前最明显未完成的计划节点是“完整关卡模式”。因此本轮继续扩展以下范围：

1. 增加多关卡内容，至少补齐 `level_2` 与 `level_3`。
2. 为关卡模式补充 Boss 单独波次，满足“通关解锁 + Boss”这一步的原计划要求。
3. 将主菜单从“固定启动第一关”升级为“展示已解锁关卡并允许选择指定关卡开始”。
4. 完善 `LevelClear` 界面，使其展示更明确的关卡名称与下一关信息。

偏离原因：

1. 现有实现已经有最小可玩闭环，但计划中的第 8 步“关卡模式”只完成了半套。
2. `LEVELS` 只有 `level_1`，无法满足“打完第一关解锁下一关”的验收标准。

影响范围：

1. 修改 `src/config/levels.ts`。
2. 修改 `src/config/zombies.ts`，补充 Boss 类型。
3. 修改 `src/scenes/MainMenuScene.ts`。
4. 修改 `src/scenes/LevelClearScene.ts`。

调整后的验证重点：

1. `LEVELS` 至少存在连续多关。
2. 主菜单可选择已解锁关卡，未解锁关卡不可直接开始。
3. 关卡结束后能解锁下一关并在 `LevelClear` 中展示。
4. `npm run typecheck` 继续通过。

### 第四阶段精修(计划第 11 步落地)

在关卡模式补齐后，当前最缺的是“成品感”。因此本轮不再扩玩法面，而是精修以下部分：

1. HUD 从纯文本升级为更明确的漫画战报式界面。
2. 增加波次提示、拾取提示与暂停覆盖层。
3. 增强战斗反馈：
   - 开火枪口闪光
   - 命中火花
   - 爆炸冲击与拟声词
   - 死亡反馈
   - 低血量危险提示

视觉基调（visual thesis）：

- 以“黑稿战报 + 旧纸面板 + 黄红警报色”为核心，让 HUD 像贴在战场上的漫画信息条，而不是普通调试文字。

内容结构（content plan）：

1. 左上：生命、武器、弹药、道具的核心状态面板。
2. 右上：关卡/模式、波次、得分摘要。
3. 顶部中央：波次与 Boss 提示横幅。
4. 中央覆盖：暂停状态与恢复指引。
5. 下方短暂区域：拾取与关键动作提示。

交互基调（interaction thesis）：

1. 波次横幅快速拍入并淡出，形成战报切换感。
2. 低血量时边缘出现克制但明确的危险脉冲。
3. 爆炸、击杀、拾取均给出短促明确的视觉反馈，而不是长时间滞留的噪声动画。

偏离原因：

1. 当前逻辑链路已基本闭合，再继续加系统价值下降，应该转向“看得见、摸得着”的体验质量。
2. 现有 HUD 和反馈仍偏工程草稿，离“不要粗制滥造”的目标差距最大。

影响范围：

1. 修改 `src/constants.ts`，增加 HUD/提示相关事件。
2. 修改 `src/scenes/GameScene.ts` 与 `src/scenes/HUDScene.ts`。
3. 修改 `src/entities/Player.ts`、`src/entities/Zombie.ts`、`src/systems/WeaponManager.ts`、`src/systems/AreaEffectFactory.ts`。

调整后的验证重点：

1. 暂停键可正常暂停/恢复，HUD 有明确覆盖反馈。
2. 波次切换时会出现可见横幅提示。
3. 开火、命中、爆炸、死亡都有增强后的反馈表现。
4. HUD 信息完整且 `npm run typecheck` 继续通过。

## 操作步骤

1. 新增执行文档并冻结本轮边界，避免偏离需求。
2. 修正配置和类型定义，使关卡 `boss`、玩家受伤接口与现有实现一致。
3. 新增 `Prop` 实体，统一承接：
   - 地图场景爆炸物
   - 玩家布置的地雷
4. 新增 `AreaEffectFactory`：
   - 处理爆炸即时伤害
   - 处理连锁引爆
   - 处理火焰/粉尘残留区
5. 新增 `ItemManager`：
   - 管理当前携带道具
   - 处理 `Q` 布置地雷
   - 处理 `F` 切换道具
6. 新增 `WaveManager`：
   - 处理关卡模式固定波次
   - 处理无尽模式程序化波次
   - 处理清波进入下一波与全部完成
7. 新增场景层，建立从启动到结算的最小流程：
   - `Boot -> Preload -> MainMenu -> Game + HUD -> GameOver/LevelClear`
8. 在 `GameScene` 中接入现有玩家、武器、子弹、僵尸、道具、爆炸、波次。
9. 执行 `npm run typecheck`，根据报错继续修正。

## 实施建议

1. 以“最小闭环”优先，不先做掉落与复杂 UI，避免把当前卡点扩大。
2. 继续沿用现有数据驱动结构，所有玩法数值仍从 `src/config` 读取。
3. 尽量让新增系统只依赖 `GameScene` 提供的明确数据与回调，避免跨模块隐式耦合。
4. HUD 先做最小文本信息展示，确认事件链和状态链正确后再扩展样式。

## 潜在风险分析

1. Phaser `Scene` 与 `HUD` 并行时，事件监听和场景关闭顺序容易遗漏清理，可能造成重复监听。
2. `AreaEffectFactory` 连锁引爆如果没有“本次爆炸已处理集合”，容易出现递归或重复引爆。
3. `Container`/`Arc` 挂载 Arcade Physics 时，碰撞体大小与显示大小可能不一致，需要显式设置。
4. 现有 `WeaponManager`、`Player`、`Zombie` 是局部草稿，实现接入后可能暴露额外类型或生命周期问题。

## 优化方案

1. 爆炸和残留区先采用简单圆形判定，后续再根据手感决定是否做距离衰减。
2. `WaveManager` 先维护最简单状态机，若后续需求增加再抽象更强的 provider 接口。
3. HUD 优先通过事件触发刷新，减少后续每帧重绘改造成本。
4. 预留 `SaveManager` 的调用点，但只落最小必要持久化，避免本轮横向扩展。

## 验证方式

1. 运行 `npm run typecheck`，确保 TypeScript 静态检查通过。
2. 人工检查以下链路在代码层已经闭合：
   - 可进入游戏
   - 玩家可移动、瞄准、射击
   - 僵尸按波次刷出并追击
   - 玩家与僵尸能互相造成伤害
   - 地雷、油桶、面粉桶能触发爆炸或残留区
   - 波次清空后进入下一波
   - 死亡进入 `GameOver`
   - 关卡完成进入 `LevelClear`
3. 本轮不执行 `npm run build`。若需要进一步验证运行表现，再单独增加验证步骤。
