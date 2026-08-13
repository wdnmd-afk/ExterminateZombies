# 2026-08-13 G2-6 后四把武器爽感定位

> 状态：主实现完成（2026-08-13），V0 静态核对已完成；V1/V2 命令验证与 V4-V6 实景/真人验收待补。

## 1. 目标

按 `LONG_TERM_OPTIMIZATION_GOALS.md` G2-6 锁定后四把武器定位：

1. AK-47：泼洒压制。
2. Barrett M82：一击必杀慢动作。
3. RPG-7：大清屏。
4. M79：弹跳节奏爆破。

## 2. 范围

本轮覆盖：

1. `src/config/weapons.ts` 后四把武器字段与数值。
2. `src/config/types.ts` 增加 M79 需要的弹跳字段。
3. `WeaponManager` 和 `Bullet` 传递弹跳字段。
4. `GameScene` 障碍命中逻辑支持可反弹弹体，非反弹弹体保留命中即回收。
5. `tests/weapon-combat-rules.test.ts` 更新 G2-6 签名机制断言，`tests/config-integrity.test.ts` 覆盖 `bounceCount` 值域与启动期拒绝路径。
6. 长期目标文档与本执行文档状态同步。

不在本轮覆盖：

1. 后四把专属新贴图或持枪动画。
2. 新强化卡池变异，归 G2-7。
3. 实景试玩与 V6 爽感判断。

## 3. 操作步骤

1. 读取武器配置、类型、武器管理、弹体、命中和现有测试。
2. 新增 `WeaponDef.bounceCount?: number`，只用于弹体命中障碍后的剩余反弹次数；启动期限定为 `0` 或 `1`，不开放超出本轮单次弹跳范围的多次反弹。
3. 在 `Bullet` 中保存剩余反弹数并提供 `tryBounceFromObstacle()`。
4. 在 `GameScene` 障碍命中回调中，M79 等可反弹弹体先反弹并保留弹体；反弹耗尽后才爆炸。
5. 调整后四把配置：
   - AK-47：更高射速/弹匣、适度散射、少量穿透和移动惩罚优势。
   - Barrett：更高伤害、暴击或处决式高光、强穿透和击退，低弹匣/低射速。
   - RPG-7：显著扩大爆炸半径与伤害，保持单发慢装。
   - M79：中等爆炸、`bounceCount` 支撑一次弹跳节奏。
6. 更新测试断言，删除“后四把保持原状”的旧约束。
7. 同步 `LONG_TERM_OPTIMIZATION_GOALS.md`。

## 4. 实施建议

优先复用已经落地的爽感字段（`critChance`、`knockback`、`chainBonus`、`movementPenalty`、`impactEffect`），只为 M79 增加一个确有必要的新字段。M79 反弹先限制为障碍反弹，不做敌人/场景物反弹，避免碰撞链路变复杂。

## 5. 潜在风险

1. M79 反弹方向来自当前弹体与障碍中心的相对位置，只能近似判断碰撞面；实景需要确认手感。
2. Barrett 一击必杀爽感如果伤害过高，可能压缩 Boss 阶段；Boss 仍不受处决影响，数值需后续试玩收敛。
3. RPG 大半径爆炸可能提高自伤风险和性能压力；本轮只做配置，实景需补 V4/V5。

## 6. 验证方式

1. V0：静态核对字段传递、障碍反弹分支、后四把配置和测试断言。
2. V1/V2 建议命令：`npm test -- tests/weapon-combat-rules.test.ts tests/config-integrity.test.ts`、`npm run typecheck`。
3. V4/V5：浏览器中逐把验证 AK 连发压制、Barrett 单发高光、RPG 清屏、M79 障碍反弹爆破。
4. V6：真人判断后四把是否能明确说出各自最爽瞬间。

## 7. 实施结果

1. AK-47、Barrett M82、RPG-7、M79 已按各自定位完成配置调整，已有爽感字段均复用现有战斗链路。
2. M79 的 `bounceCount` 已从武器配置经 `WeaponManager` 传入 `Bullet`；障碍命中时最多反弹一次，次数耗尽后沿用原爆炸回收流程。
3. `validateGameConfig()` 已在 Boot 阶段限制 `bounceCount` 只能为整数 `0` 或 `1`，配置断言同时覆盖当前值域和非法值拒绝路径。
4. 已完成 V0：字段定义、传递、对象池复位、障碍分支、爆炸消费和配置状态已静态核对。按授权门禁，本轮尚未执行 V1/V2 命令，也未启动 V4-V6 验收。

## 8. 实景验收发现与方案调整

2026-08-13 首轮 V4 发现 Barrett 可以一枪击杀普通感染体，但既有慢动作入口只覆盖高连穿、Boss 死亡和连杀里程碑，`critChance`、`knockback`、`chainBonus` 均不会触发其定位要求的“一击必杀慢动作”。因此原“只复用既有爽感字段”的建议不足以完成目标，需要按以下方式调整：

1. 新增 `WeaponDef.killSlowMotionTier?: 'A' | 'S'`，明确表达“该武器对非 Boss 造成致死命中时请求哪一级慢动作”，禁止根据武器 id 或其它字段组合猜测。
2. 字段经 `WeaponManager` 传入池化 `Bullet`，每次 `fire()` 都显式复位，避免跨武器复用残留。
3. `GameScene` 只在本次伤害足以击杀非 Boss 时触发；Boss 保留原有 S 级死亡慢动作，避免同次命中重复请求。
4. 同步启动期值域校验、配置断言与 Barrett 签名机制断言，再重新执行 V1-V5。

复跑 M79 时又发现固定推离 `8px` 无法覆盖“弹体半径 + 单帧穿入深度”，同一真实输入会在“成功反弹”和“下一帧再次重叠后立即爆炸”之间波动。调整为由 `GameScene` 传入障碍物理 AABB，`Bullet` 按实际碰撞轴把弹体中心直接放到 AABB 外侧 `弹体半径 + 1px`，以此保证单次碰撞只扣除一次反弹。
