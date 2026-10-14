# 2026-09-03 第三关危墙坍塌清群试用

> 状态：代码已实施，V0 静态复核完成；V1-V6 未执行
>
> 上游设计：`docs/design/BREAKABLE_GATE_GAMEPLAY.md`
>
> 用户决策：先在第三关试用；需要时允许通过项目图片 API 与提示词生成美术资源；敌群需有与玩法匹配的数量
>
> 验证约束：本轮默认只完成 V0 静态审阅。未经用户另行确认，不执行 `npm test`、`npm run typecheck`、`npm run build` 或浏览器完整试玩。

## 1. 目标

把第三关「封锁城区」改造成危墙坍塌玩法试用关：玩家可以用枪械、爆炸武器或诱导爆破者轰炸摧毁两面危墙；危墙坍塌会打开原本被切割的路线，并对附近密集感染体造成一次高额范围伤害，形成明确的“聚怪 -> 轰墙 -> 压倒一片 -> 穿过缺口”爽感。

第三关普通敌人从当前 46 只调整为 120 只，按 35 / 42 / 43 分到三个阶段。数量提升服务于危墙压群，不靠提高单体生命制造时长。

## 2. 范围

### 2.1 包含

1. 为关卡障碍增加准确的可破坏配置，不按坐标或类型猜测。
2. 为 `Obstacle` 增加完整、裂损、坍塌三态以及碰撞体移除。
3. 玩家子弹与玩家爆炸（含压制脉冲）可以损伤危墙。
4. `bomber_boss` 的轰炸与饱和轰炸可以造成结构伤害。
5. 危墙坍塌时对附近感染体造成范围伤害、产生碎片反馈并打开路线。
6. 第三关两面纵向路障改为危墙，其余障碍保持不可破坏。
7. 第三关三阶段改为分段生成，共 120 只普通敌人。
8. 增加纯规则测试与配置不变量测试，但本轮不执行测试命令。
9. 同步设计文档、README 和 Goal 状态说明。

### 2.2 不包含

1. 不改第二关或其它关卡。
2. 不修改 Boss 基础血量、玩家武器数值、掉落率或存档结构。
3. 不新增敌人 ID、武器、货币或成长条。
4. 不让普通敌人主动攻击障碍。
5. 不把所有障碍改成可破坏。
6. 不调用图片 API，除非现有位图加裂纹/碎片表现无法清楚表达状态。
7. 不在本轮修复既存 `EffectSpritePool` 关停缺陷。

## 3. 已确认调用链

```text
levels.ts / ObstaclePlacement.breakable
  -> GameScene.loadObstacles()
  -> Obstacle（位图、裂纹、碰撞砖、坍塌状态）

玩家子弹
  -> GameScene 障碍碰撞
  -> Obstacle.applyDamage()

玩家爆炸 / Boss 轰炸
  -> AreaEffectFactory
  -> GameScene.damageBreakableObstaclesInRadius()
  -> Obstacle.applyDamage()

Obstacle 坍塌
  -> GameScene.handleObstacleDamage()
  -> 重建 obstacleTiles
  -> 对附近 Zombie 结算坍塌伤害
  -> HUD 战斗警报 + 震屏 + 慢动作 + 碎片表现
```

当前碰撞组中保存的是 `Obstacle` 创建的轴对齐碰撞砖，不是障碍容器。碰撞砖必须持有准确的 `ownerObstacle` 引用，才能把子弹命中归属到真实障碍；不能靠遍历坐标猜最近障碍。

## 4. 第三关内容设计

### 4.1 危墙

两面现有纵向路障改成危墙：

| id | 位置 | 耐久 | 坍塌伤害 | 半径 | 作用 |
| --- | --- | ---: | ---: | ---: | --- |
| `level3-west-wall` | `(360,300)`，旋转 90° | 260 | 220 | 126 | 打开左侧横向穿行线 |
| `level3-east-wall` | `(920,300)`，旋转 90° | 260 | 220 | 126 | 打开右侧横向穿行线 |

规则：

1. 耐久降到 55% 以下进入裂损态。
2. 普通子弹按实际弹丸伤害削减耐久。
3. 玩家爆炸按 `EffectDef.damage` 结算结构伤害。
4. `bomber_boss` 基础轰炸每个爆点造成 180 结构伤害；第三阶段饱和轰炸每个爆点造成 110 结构伤害。
5. 坍塌只触发一次；碰撞砖立即销毁，障碍 AABB 缓存同步重建。
6. 坍塌伤害可以击杀普通感染体；Boss 只受到 25% 坍塌伤害，避免两面墙直接跳过 Boss 阶段。
7. 玩家不承受额外坍塌伤害；触发它的爆炸本身仍按现有误伤规则结算。

### 4.2 怪物数量

三阶段合计 120 只，常规生命预算为 5292，仍低于第四关当前 5328，保持原型关卡生命预算不倒退。

| 阶段 | walker | runner | bomber | crawler | lurker | 合计 | 生命预算 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1：识别危墙 | 20 | 8 | 5 | 0 | 2 | 35 | 1600 |
| 2：聚群爆破 | 20 | 8 | 8 | 4 | 2 | 42 | 1832 |
| 3：双侧封锁 | 20 | 8 | 8 | 5 | 2 | 43 | 1860 |
| 总计 | 60 | 24 | 21 | 9 | 6 | 120 | 5292 |

数量设计理由：

1. `walker` 占 50%，负责在危墙附近形成可压倒的密集主体。
2. `runner` 与 `crawler` 共 33 只，迫使玩家不能长期原地磨墙。
3. `bomber` 共 21 只，使本关的爆破身份在 Boss 前已经成立，并能与油桶形成连锁风险。
4. `lurker` 只放 6 只，负责驱赶站位，不让远程弹幕盖过危墙读数。
5. 不放 `tank`、`bloodied`、`headless` 等高耐久单位，避免数量提升后生命预算失控。

### 4.3 分段节奏

每阶段拆为三个段落：

1. 第一段建立方向，让玩家看见敌群被墙体切流。
2. 第二段增加爆炸感染体，在危墙一侧形成聚群。
3. 第三段加入远程或低矮高速单位，迫使玩家决定立即打塌墙还是继续保留掩体。

同屏上限建议为 16 / 22 / 28。危墙玩法需要密集，但第三关仍是试用关，不越过第二关已验证的 40 同屏上限。

## 5. 美术方案

首轮不需要调用图片 API：

1. 完整态复用现有 `obstacle-wall.png` 位图。
2. 裂损态在位图上叠加固定裂纹线和橙色危险角标。
3. 坍塌态把原位图压成低矮废墟带，并生成短生命周期像素碎片。
4. 这条方案仍以现有位图为视觉主体，程序图形只表达运行时状态，适合玩法试用。

若 V4/V6 判断裂损与坍塌不够可读，再调用项目本地图片 API。候选提示词：

```text
Use case: stylized-concept
Asset type: top-down pixel-art destructible concrete barricade state sheet for a browser zombie shooter
Primary request: create three matching states of the same concrete road barricade: intact, deeply cracked, collapsed rubble
Style/medium: crisp top-down pixel art, nearest-neighbor friendly, low-color industrial palette
Composition/framing: one horizontal barricade per row, identical camera angle and footprint, transparent-safe magenta key background #ff00ff
Lighting/mood: neutral overhead lighting, readable in a dark asphalt battlefield
Color palette: charcoal concrete, muted steel, small hazard-yellow paint marks
Constraints: no text, no logo, no characters, no weapons, no perspective change, no cast shadow outside the footprint, each state fully visible with padding
Avoid: photorealism, isometric view, gradients, smoke obscuring the silhouette, UI frame, watermark
```

生成产物必须先进入 `TmpGenerate/`，经检视后才能进入 `src/assets/`，并同步台账与运行时清单。

## 6. 操作步骤

1. 扩展 `ObstaclePlacement` 和敌方轰炸类型的结构伤害字段。
2. 新增 `BreakableObstacleRules.ts`，集中处理伤害、裂损阈值、坍塌幂等和 Boss 伤害衰减。
3. 改造 `Obstacle`：准确保存 id、耐久和状态；碰撞砖登记 owner；裂损/坍塌表现；销毁碰撞砖。
4. `GameScene` 接入子弹命中、爆炸范围结构伤害、坍塌伤害和障碍 AABB 重建。
5. `AreaEffectFactory` 为玩家爆炸与敌方爆点增加可选结构伤害回调。
6. `bomber_boss` 基础轰炸与饱和轰炸配置结构伤害。
7. 把第三关改为 120 只、三阶段九段落，并标记两面危墙。
8. 增加纯规则、配置和数量预算测试。
9. 完成 V0 静态检查与文档同步。

## 7. 实施建议

1. 危墙状态计算必须是纯函数，Phaser 实体只负责应用结果。
2. 碰撞砖的 owner 必须在创建时显式设置，避免命中后遍历坐标反查。
3. 坍塌后重建 `obstacleTiles`，保证角色相位疾冲与扇形武器立刻看到新路线。
4. 坍塌范围伤害只结算一次，不能由多块碰撞砖重复触发。
5. 数量扩展只调整第三关，不连带修改第四至第十关。
6. 不把危墙状态写入存档；重开本关恢复完整态。

## 8. 潜在风险

| 风险 | 影响 | 处理 |
| --- | --- | --- |
| 一颗子弹同时命中同墙多块砖 | 耐久被重复扣除 | `bullet.hitSet` 同时登记 owner，按障碍去重 |
| 爆炸同时覆盖多块砖 | 同墙重复坍塌 | 范围处理遍历障碍对象，不遍历碰撞砖 |
| 坍塌后 AABB 缓存仍在 | 相位疾冲与扇形火力仍把缺口当墙 | 坍塌事件同步重建 `obstacleTiles` |
| 120 只敌人造成糊屏 | 爽感退化为噪声 | 同屏上限最高 28，靠清杀速度释放后续数量 |
| Boss 轰炸轻易拆完两墙 | 玩家没有决策 | 基础爆点两次才能拆墙，饱和爆点需三次有效命中 |
| 墙压伤害直接跳过 Boss 阶段 | Boss 机制失效 | Boss 只承受 25% 坍塌伤害 |
| 程序裂纹观感不足 | 状态难辨 | V4/V6 不通过后再走图片 API，不提前生成资产 |
| 场景 shutdown 既存异常 | 完整试玩退出时报错 | 明确列为既存风险，不与本玩法状态混淆 |

## 9. 优化方案

1. 首轮只用两面墙，避免创建通用破坏地图系统。
2. 结构伤害作为可选字段，仅爆破 Boss 使用；其它技能不受影响。
3. 危墙规则可复用，但不在本轮注册其它关卡。
4. 后续若正式化，再用 API 生成三态位图替换裂纹叠层，规则层无需改动。
5. 坍塌统计先进入只读诊断，不新增存档或成就系统。

## 10. 验证方式

### V0 静态审阅

1. 两面危墙 id 唯一，字段准确，数值为正。
2. 第三关普通敌人恰好 120 只，三阶段分别 35 / 42 / 43。
3. 第三关生命预算低于第四关，且仍高于第一关。
4. 子弹、玩家爆炸、Boss 爆点三条结构伤害链均到达同一 `Obstacle.applyDamage()`。
5. 坍塌后碰撞砖与 `obstacleTiles` 同步移除。
6. 其它九关没有 `breakable` 配置，运行时行为保持原状。

### 建议的后续命令（本轮未经授权不执行）

1. `npm test`
2. `npm run typecheck`
3. `npm run build` 仅在用户单独授权后执行

### V3/V4 浏览器

1. 从主菜单真实进入第三关。
2. 普通子弹把危墙打到裂损态；M79 爆炸可以显著削减耐久。
3. 危墙坍塌后玩家、僵尸和子弹均可穿过缺口。
4. 坍塌范围内的密集普通感染体受到一次伤害并产生连杀反馈。
5. `bomber_boss` 的轰炸可以拆墙，且不会重复触发坍塌。
6. 暂停、抽卡、挂起恢复后危墙状态一致。
7. 运行时异常、console error 和失败请求为 0。

### V5/V6

1. 完整打通第三关，记录墙体破坏时机、压倒数量、各阶段耗时、弹药与死亡原因。
2. 至少一次主动把 8 只以上感染体引到危墙附近再坍塌。
3. 真人能明确说出“打塌墙压倒一群”是本关最爽时刻。
4. 如果玩家只把墙当普通障碍、或拆墙不改变走位，玩法判定失败。

## 11. 完成定义

本轮代码实施完成且 V0 调用链审阅无缺口后，只能标记为“代码已实施，命令与实景待验”。只有 V3/V4 证明碰撞与画面、V5 完成整关、V6 确认爽感后，才能标记玩法通过。

## 12. 实施结果（2026-09-03）

### 已完成

1. `BreakableObstacleRules.ts` 已新增，负责三态、耐久扣减、幂等坍塌和 Boss 伤害衰减。
2. `Obstacle` 已保存危墙 owner、耐久和状态；碰撞砖显式持有 `ownerObstacle`。
3. 子弹命中、玩家爆炸、玩家冲击波和 `bomber_boss` 的基础/饱和轰炸均已接入结构伤害回调。
4. 危墙坍塌会移除碰撞砖、重建 `obstacleTiles`、生成碎片、触发慢动作/震屏，并对半径内感染体结算一次范围伤害。
5. 第三关两面危墙已配置；普通敌人改为 120 只，三个阶段为 35 / 42 / 43，九个段落最高同屏 28。
6. 已新增规则、关卡数量和配置完整性测试文件/断言；本轮未执行测试命令。
7. 试用版未调用图片 API，继续使用现有障碍位图和程序化裂纹/碎片表现。

### V0 静态复核结论（完成）

1. 配置字段均有明确类型和唯一来源，没有按坐标猜测危墙的逻辑。
2. 破坏路径按障碍对象去重，避免同一面墙的阶梯碰撞砖重复扣血。
3. 坍塌后同时更新 Phaser 碰撞组与扇形/相位疾冲几何缓存。
4. 非危墙保持原有反弹和阻挡逻辑；其它关卡没有新增 `breakable` 配置。
5. 第三关生命预算为 5292，低于第四关当前 5328。
6. 变更文件已通过 `git diff --check`，受影响 TypeScript 文件已完成语法级解析；这两项不等同于类型检查或测试通过。

### 尚未执行

1. `npm test`、`npm run typecheck`、`npm run build`。
2. 第三关 V3/V4 浏览器纹理、碰撞、坍塌和 Boss 轰炸实景验证；`getBreakableObstacleSnapshots()` 已额外暴露 `collisionTileCount`，便于确认坍塌后碰撞砖确实归零。
3. 第三关 V5 完整通关、重开与 120 只敌群长链路试玩。
4. V6 真人爽感、可理解性、难度和画面验收。

### 当前风险

1. 程序化裂纹和低矮废墟是否足够像“墙倒了”，需要浏览器画面确认；必要时再按 §5 提示词生成三态位图。
2. 120 只敌群的实际清杀时长和掉落经济尚未实测。
3. `EffectSpritePool` 既存关停异常仍未修复，可能影响重开/离开场景时的浏览器验收。
