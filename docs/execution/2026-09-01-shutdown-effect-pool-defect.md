# 2026-09-01 既存缺陷记录：场景关停期 EffectSpritePool 崩溃

> 状态：**已修复并实景复验通过**（2026-09-01 晚，见 §8）。
> 本文档 §1-§7 保留最初的定位记录，§8 记录修复与结论。
>
> 发现场合：执行 G5-2 的 V4 实景验证时（`docs/execution/2026-09-01-g5-2-level2-bitmap-environment.md`），
> `mgr.stop('GameScene')` 稳定抛异常。
>
> 基线提交：`3ac0a38`。
>
> §4 的关键疑问（真实玩法是否受影响）答案是 **A：受影响**。
> 在 G2-9 的 V3 验证中，真实通关走 `scene.start(SCENES.levelClear)` 时
> 抛出了完全相同的堆栈，因此这不是测试路径专有缺陷。

## 1. 现象

对处于 active 状态的 `GameScene` 调用 `scene.stop()`，页面抛未捕获异常：

```
TypeError: Cannot read properties of undefined (reading 'entries')
    at Group2.getChildren      (phaser.js)
    at ObjectPool.forEachActive (src/utils/ObjectPool.ts:52)
    at EffectSpritePool.destroy (src/systems/EffectSpritePool.ts)
    at GameScene.handleShutdown (src/scenes/GameScene.ts)
    at Systems2.shutdown       (phaser.js)
    at SceneManager2.stop      (phaser.js)
```

## 2. 机制

`ObjectPool.forEachActive()`（`src/utils/ObjectPool.ts:52`）调用 `this.group.getChildren()`，
Phaser 内部返回 `this.children.entries`。

`ObjectPool` 的 Group 由 `scene.add.group()` 创建（`ObjectPool.ts:18`），因此**属于场景**。
场景 shutdown 时 Phaser 先销毁场景内的 Group（`children` 置为 undefined），
`GameScene.handleShutdown` 随后才跑到 `EffectSpritePool.destroy()` → `forEachActive()`，
此时 Group 已死，`children` 是 undefined，于是 `.entries` 抛错。

即**清理顺序倒置**：业务层的池清理跑在 Phaser 的 Group 销毁之后。

## 3. 归因：与 G5-2 无关，属既存缺陷

判别法：`level_1` 与 `level_3` 完全不走 G5-2 的位图分支
（`BATTLEFIELD_TILE_SETS` 只登记 `level_2`），因此"进这两关再 stop"这条路径
一行 G5-2 代码都不碰。实测三关全崩：

| 关卡 | ground 层类型 | 用位图键 | `scene.stop()` 结果 |
| --- | --- | --- | --- |
| level_1 | `Graphics:1, Sprite:12, Rectangle:25` | false | **THREW** |
| level_3 | `Graphics:1, Sprite:12, Rectangle:53` | false | **THREW** |
| level_2 | `Graphics:1, TileSprite:3, Image:4, Sprite:12, Rectangle:51` | true | **THREW** |

崩溃与是否走位图分支无关。

旁证：仓库已有 `a665557 fix: guard scene pause lifecycle during shutdown`，
说明这一类生命周期清理问题在本项目此前真实出现过。

## 4. 尚未确定：真实玩法是否受影响

**这一条必须在修复前搞清楚，否则可能是在修一个只有测试探针才会碰到的路径。**

已知：

1. 探针走的是 `mgr.stop('GameScene')` 直接关停 active 场景。
2. 真实玩法的关卡结束走 `this.scene.start(SCENES.levelClear, ...)`
   （`GameScene.ts` 的 `handleLevelClear`），由 `scene.start` 切换而非显式 `stop`。
   两者触发的 shutdown 时序可能不同。
3. 暂停返回主菜单走的是挂起（sleep）而非 stop，按 `README` 的"继续游戏"设计。

因此有两种可能：

- **A**：`scene.start` 切换也走同一条 shutdown 链，真实玩法每次通关/失败都在静默抛异常
  （只是未捕获异常不阻断后续场景，玩家看不出来）。
- **B**：只有显式 `stop` 才命中，真实玩法不受影响，属测试路径专有。

判别方式：走一遍真实通关（或用开发者作弊直接结算），监听 `Runtime.exceptionThrown`，
看是否出现同一条堆栈。**本轮未做。**

## 5. 修复方向（待确认后执行）

倾向在 `ObjectPool` 内做防御，而不是在每个调用方补判断：

1. `forEachActive()` / `getActive()` 在 `this.group.children` 缺失时直接返回，
   而不是让 `getChildren()` 抛错。
2. 或者 `ObjectPool` 增加 `destroyed` 标记，`EffectSpritePool.destroy()` 幂等。

不建议改成"在 handleShutdown 里判断 Group 还活着"——那把时序知识散到调用方，
下一个新增池的人还会踩。

同时应确认 `ObjectPool` 的其它使用方（子弹、掉落物等）是否有同样的关停期路径。

## 6. 影响面

`ObjectPool` 的使用方需要逐一核查。已知 `EffectSpritePool` 命中；
子弹与掉落物池是否也在 `handleShutdown` 里被清理、清理顺序如何，本轮未查。

## 7. 未做的事（截至最初记录时）

1. 未修复。
2. 未确认真实玩法是否受影响（§4）。
3. 未核查 `ObjectPool` 其它使用方（§6）。
4. 未写回归测试。这类缺陷属于 Phaser 生命周期时序，`npm test` 的 Node 环境覆盖不到，
   需要 V3/V4 层的探针断言"stop 后无未捕获异常"。

以上四项均已在 §8 完成。

## 8. 修复记录（2026-09-01 晚）

### 8.1 §4 的答案：A，真实玩法受影响

在 G2-9 的 V3 实景验证中（第一关第 1 波通关，走真实的
`scene.start(SCENES.levelClear)` 而非探针的显式 `stop`），
抛出了与 §1 完全一致的堆栈。因此这不是测试路径专有缺陷——
每次通关/失败都在静默抛未捕获异常，玩家看不出来但异常真实存在。

### 8.2 修复：按 §5 的倾向做在 ObjectPool 层

`src/utils/ObjectPool.ts` 新增私有 `alive` getter（判据 `this.group.children !== undefined`），
三个公开入口据此分流：

| 入口 | group 已死时的行为 | 理由 |
| --- | --- | --- |
| `getActive()` | 返回 `[]` | 只读查询，空结果是正确答案 |
| `forEachActive()` | 空操作 | 同上 |
| `acquire()` | **抛错** | 调用方紧接着就要 spawn 并使用返回值，给游离对象只会把崩溃推迟到更难定位处 |

`acquire()` 选择抛错而非静默返回，是因为正常游玩不会走到——
只有场景 shutdown 之后仍在生成实体才会，那本身就是调用时序错误。

### 8.3 同族漏项：三处，不是一处

最初只发现 `forEachActive`。实景验证中又暴露两处同源路径：

1. `ObjectPool.acquire()` → `getFirstDead()` → 同样的 `.entries` 抛错。
2. `EffectSpritePool.release()` → `sprite.stop()`，在精灵已被 Phaser 销毁
   （`scene`/`anims` 置空）后调用，抛
   `Cannot read properties of undefined (reading 'stop')`。
   触发方：`AreaEffectFactory.destroy()` 的 `releaseZoneSprite`——
   它与 GameScene 共享同一个池实例，两边都会走 destroy。
   修复：`release()` 先判 `sprite.scene && sprite.anims`。

`EffectSpritePool.destroy()` 另加 `destroyed` 幂等标记（§5 的方案 2），
以及销毁前判 `phaserGroup.children !== undefined`。

> 过程记录（值得留给下一个人）：我最初把根因判成"destroy 不幂等"，
> 加了 `destroyed` 标记后单测通过、实机照旧抛。真实根因是
> **Phaser 先销毁 group，才派发 shutdown 事件**，
> 所以首次调用就已经撞上失效的 children——幂等标记根本没打中。
> 这也是 §5 判断正确的原因：防御必须在池子层，不在调用方。

### 8.4 回归测试

新增 `tests/effect-sprite-pool.test.ts`（4 个用例）。
按 §7.4 的判断，Node 环境加载不了完整 Phaser，因此用 `vi.mock('phaser')`
只桩出 `BlendModes`、`Animations.Events` 与 `GameObjects.GameObject`，
并用一个复刻 Phaser 真实行为的 group 桩（`destroy()` 把 `children` 置为 undefined）：

| 用例 | 锁住的路径 |
| --- | --- |
| 重复 destroy 不抛异常，group 只销毁一次 | 幂等 |
| Phaser 先销毁 group 时首次 destroy 也不抛 | **真实崩溃路径** |
| 精灵已被销毁时 release 不抛异常 | §8.3 第 2 项 |
| 精灵可用时 release 正常复位状态 | 防止防御过度导致清理失效 |

第 4 个用例是必要的对照：只测"不抛异常"的话，
把 `release()` 写成直接 `return` 也能过。

### 8.5 验证

| 层级 | 结果 |
| --- | --- |
| V1 `npm test` | 通过：34 文件 / 414 用例 |
| V2 `npm run typecheck` | 通过：退出码 0 |
| V4 实景 | 通过：GameScene 活着且特效池装载过精灵，`scene.stop` 后场景清空，`exceptions: []` |

> 复验口径：单测绿不算复验——本缺陷最初就是被绿测掩盖的。
> 实景复验中有两次无效尝试（GameScene 已不在，`stop` 成了空操作），
> 已重跑到"场景确实活着 + 特效池确实装载过精灵"才取结论。
