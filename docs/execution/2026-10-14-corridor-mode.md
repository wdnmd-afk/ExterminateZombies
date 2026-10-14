# 通道模式执行批次（2026-10-14 深夜开工，未完待续）

> 状态：**实施中，批次 1-3 已完成并全绿，批次 4 场景/入口层已落码但未做实景验证**。
> 明天从这里继续（见文末"下一步"）。

## 需求（用户 2026-10-14 口述 + 四问确认）

- 狂潮好玩但太难 → 新增**通道模式**：三横道、得分制、漏怪即失败
- 上=道具卡通道（弹道+1/解锁武器/火力强化/补给），中=主通道（僵尸右→左推进），下=队友卡通道
- 玩家固定左侧 x∈[96,240]，上下跨道移动，鼠标自由瞄准
- **卡片有血量，打死才获取，当帧生效不暂停**；队员卡打死召唤队友（上限 3）
- 入口复用狂潮式预设选择（主菜单热键 7 / 通道挑战按钮）
- 全部数值集中在 `src/config/corridor.ts`，真人验收后按手感调参

## 已完成

### 批次 1：配置 + 纯规则（命令层绿）
- `src/config/corridor.ts`：几何（LANE 120/360/600、COLUNN 96-240、BREACH_X=72）、
  三预设（pistol/shotgun/rifle）、五类卡片、六阶段刷怪表、涌浪、血量缩放、队友属性
- `src/systems/CorridorRules.ts`：CorridorRun 状态机 + 叠加上限（弹道3/火力2/队友3）+
  `resolveCorridorVolleyBonus` + 存活奖励 + 纪录 normalize/update（breached 与 dead 都记分）
- `GameMode` 加 `'corridor'`（GameState.ts）；`createInitialState` 对 frenzy/corridor 都
  屏蔽 TESTING_FLAGS 注入
- `SAVE_KEYS.corridorRecords` + normalize + 双 reset（SaveManager.ts）
- `SCENES` 加 corridorPreparation/corridorResult（constants.ts）

### 批次 2：导演 + GameScene 接线（命令层绿）
- `src/systems/CorridorDirector.ts`（镜像 FrenzyDirector）：阶段刷怪（确定性加权轮转）、
  涌浪（t=120s 起每 60s 八只）、卡片投放节奏、**突破扫描**（zombie.x<=72 → finish+onBreach）
- `getSeekTarget`/ability 目标全钉在 `(72, 360)`：僵尸直线向左行军不离开通道；
  `updateZombies` 链条 corridor 最优先，arrivalRadius=0（GameScene.ts updateZombies）
- 玩家出生点 (120,360) + 每帧 `Phaser.Math.Clamp` 柱位钳制（dash 后也生效）
- `startCorridor()`：resupply 4 弹匣、AllySquad、Director 组装
- `spawnCorridorCard`/`resolveCorridorCard`（击破当帧结算：projectile/damage/weapon/supply/ally
  五族，满层转补给；卡片分进 state.score）
- bullet↔cardPool overlap（setupPhysics 内，`bullet.hitSet` 去重）
- `handleCorridorEnd()` 镜像 handleFrenzyEnd：存 corridorRecords、进 CorridorResultScene
- handleGameOver/suspend/toggleMenu/handleShutdown 的 corridor 分支已接
- WeaponManager：`resolveCorridorVolleyBonus().damageFactor` 乘进伤害、`.extraBursts`
  加进 burst 循环与 feedback
- BattlefieldRenderer：corridor palette + `drawCorridorBattlefield`（分道线/突破条纹/右缘传送门）

### 批次 3：实体（命令层绿）
- `src/entities/CorridorCard.ts`：池化容器、程序绘制圆角卡面+HP条、
  `applyDamage`（镜像 Prop）、`tick` 越线 cull（x<-70）
- `src/entities/Ally.ts`（Ally + AllySquad）：无物理体炮台，站柱位 y=600，
  索敌扫最近僵尸，**子弹走 bulletPool**（命中/得分/连杀全复用既有 overlap）

### 批次 4：场景与入口（代码已落，未实景验）
- `src/scenes/CorridorPreparationScene.ts`（克隆 FrenzyPreparationScene）
- `src/scenes/CorridorResultScene.ts`（debriefLayout，同预设再来一局/换预设/主页）
- main.ts 注册两场景；MainMenuScene 7 键 + 「通道挑战」按钮 + footer 文案
- HUDScene `refreshCorridorPresentation()`：模式行=通道 mm:ss、阶段行、构筑行

### 测试与验证状态
- **`npm test`：65 文件 / 1062 用例全部通过**（新增 corridor-rules 14 例、
  corridor-director 4 例、corridor-wiring 5 例，夹带一条手枪预设 normalize 特例）
- **`npm run typecheck`：退出码 0**（2026-10-15 00:08 读数）
- ⚠️ **V3/V4 浏览器实景探针未执行**（走真实菜单入口验证以下各条）

## 下一步（明天继续）

1. **V3/V4 实景验证（CDP，走真实入口，Page.bringToFront 先行）**：
   - 主菜单 → 通道挑战 → 选预设 1 → Enter 进战斗
   - 探针：`state.corridor` 存在；僵尸 y∈[290,430]（主带 ±jitter）；玩家 x≤240
   - 传送一只僵尸到 x<72 → breached + CorridorResultScene 激活 + corridorRecords 写盘
   - 卡片：等首张卡（t≈15s）进场，`applyDamage(999)` 直接击破 → bonusProjectiles/武器
     编队变化、无 pauseReason、score 增加
   - 队友：击破队友卡 → allySquad.count=1 且自动开火命中主通道僵尸
2. **V5/V6 真人验收**（用户亲手玩）：难度手感、卡片漂移速度、涌浪密度——
   调参只动 `src/config/corridor.ts`
3. **文档登记**：design 文档 `docs/design/CORRIDOR_LANE_GAMEPLAY.md`（照
   BREAKABLE_GATE_GAMEPLAY.md 结构）、README 模式表+热键 7+存档键、main-goal.md 登记
4. **收尾**：回归全量 `npm test` + typecheck → 提交

## 已知实现注记

- CorridorDirector `getActiveZombies` hooks 在 GameScene 用 `this.getActiveZombies()` 闭环
- 卡片池 `maxSize=4`，满时 tryAcquire 返回 null → 投放静默跳过（刻意的表现降级）
- 突破只可能发生在主通道；击退方向=向右，只会延误不会加速突破（bomber 死亡爆炸
  把幸存者往左推是已接受的罕见边角，设计文档里注明）
- 记录按 `lane-v1` 版本 + 预设独立；`updateCorridorRecord` 对 breached/dead 一视同仁
- 预设手枪特例：pistol 预设 loadout normalize 后是单格 `['pistol']`
