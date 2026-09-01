# 2026-09-01 既存缺陷记录：场景关停期 EffectSpritePool 崩溃

> 状态：**已定位并归因，未修复**。本文档只做记录，修复另立执行文档。
>
> 发现场合：执行 G5-2 的 V4 实景验证时（`docs/execution/2026-09-01-g5-2-level2-bitmap-environment.md`），
> `mgr.stop('GameScene')` 稳定抛异常。
>
> 基线提交：`3ac0a38`。

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

## 7. 未做的事

1. 未修复。
2. 未确认真实玩法是否受影响（§4）。
3. 未核查 `ObjectPool` 其它使用方（§6）。
4. 未写回归测试。这类缺陷属于 Phaser 生命周期时序，`npm test` 的 Node 环境覆盖不到，
   需要 V3/V4 层的探针断言"stop 后无未捕获异常"。
