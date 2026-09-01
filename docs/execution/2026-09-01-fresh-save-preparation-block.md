# 2026-09-01 阻断级缺陷：全新存档玩家无法离开战前整备

> 状态：**已修复并实景复验通过**。
>
> 严重级别：**阻断**。全新存档的玩家（即所有首次打开游戏的人）无法进入任何关卡。
>
> 发现场合：为 G2-9 做 V3 实景验证时，探针清档后卡在 `PreparationScene`，
> 连按三次 Enter 无任何反应。最初以为是探针按键发错，实为产品缺陷。
>
> 归因：`G2-9`（武器获取改关卡奖励，`7270f2b`）的连带回归。

## 1. 现象

全新存档（或设置页清除战役后）进入战前整备，按 Enter 或点击「确认行动」
**完全没有反应**：无音效、无提示、无场景切换。玩家没有任何线索说明为什么不能出击。

实测记录：

```
清档后场景: ["MainMenuScene"]
存档状态: {"unlockedWeapons":"[\"pistol\"]","weaponLoadout":"[\"pistol\"]"}
按 1 后场景: ["PreparationScene"]
整备界面编队: {"loadoutLength":1,"loadout":["pistol"]}
第 1 次 Enter 后场景: ["PreparationScene"]
第 2 次 Enter 后场景: ["PreparationScene"]
第 3 次 Enter 后场景: ["PreparationScene"]
exceptions: []
consoleErrors: []
```

零异常、零日志——与 G2-9 修复的那个「20 条 `type:'weapon'` 死掉落静默失效」
是同一种失败形态：**配置各自自洽，交付链断裂，运行时静默**。

## 2. 根因：两处对同一个不变量的理解不一致

| 位置 | 逻辑 |
| --- | --- |
| `src/config/loadout.ts` 的 `normalizeWeaponLoadout()` | 产出编队长度 = `min(已解锁武器数, 6)` |
| `src/scenes/PreparationScene.ts` 的 `confirmSelection()` | 要求编队长度 **`=== 6`**，否则静默 `return` |

`SaveManager.getUnlockedWeapons()` 对新存档返回 `['pistol']`
（`SaveManager.ts:283`，重置路径 `:367`/`:383` 同样回到 `['pistol']`），
因此 `normalizeWeaponLoadout` 只能产出 `['pistol']`（长度 1），
永远不可能等于 6 —— 确认键必然静默失败。

调用链无中间补齐：
`PreparationScene.ts:115` 直接取 `SaveManager.getWeaponLoadout()`，
`:830` 直接判 `length !== MAX_WEAPON_LOADOUT_SIZE`。

### 2.1 为什么 G2-9 之后才暴露

G2-9 之前，武器靠敌人掉落获取，玩家在整备界面时已解锁多把武器，
编队自然能凑满 6 把，`=== 6` 这个判据"看起来是对的"。

G2-9 把武器改为关卡阶段奖励确定性交付后，**新玩家开局只有手枪**，
这个判据立刻从"通常成立"变成"永不成立"。
G2-9 本身的改动是正确的，问题在于它改变了一个被别处硬编码的前提。

## 3. 修复：把不变量收进 loadout.ts，两处共用

`MAX_WEAPON_LOADOUT_SIZE`（= 6）是**容量**，不是**完成条件**。
两者被混用是缺陷的本质。因此在 `src/config/loadout.ts` 新增：

```ts
/** 编队应当填满的槽位数。不是恒定 6：新存档只解锁手枪，可用槽位只有 1。 */
export function getRequiredLoadoutSize(unlockedWeapons: readonly WeaponId[]): number

/** 编队是否已填满可用槽位，可以出击。 */
export function isLoadoutComplete(
  loadout: readonly WeaponId[],
  unlockedWeapons: readonly WeaponId[],
): boolean
```

`PreparationScene.ts` 三处切换到共用判定：

| 位置 | 改动 |
| --- | --- |
| `confirmSelection()` | `length !== MAX` → `!isLoadoutComplete(...)` |
| `applyLoadoutEditor()` | 同上；剩余数量改用 `getRequiredLoadoutSize()` 计算 |
| 槽位计数文字 | `1 / 6` → `1 / 1`，用 `getRequiredLoadoutSize()` |

槽位计数文字必须一起改：否则新玩家看到 `1 / 6` 会以为编队没完成，
即使确认键已经可用，信息仍然是错的。

`MAX_WEAPON_LOADOUT_SIZE` 在该文件保留三处使用（槽位渲染上限、"已满"提示），
那些确实是容量语义，不应改动。

## 4. 验证

| 层级 | 结果 |
| --- | --- |
| V0 | 静态审阅：确认调用链无中间补齐，确认 `MAX` 的容量语义用法未被误改 |
| V1 `npm test` | 通过：34 文件 / 414 用例（含新增 2 个回归用例） |
| V2 `npm run typecheck` | 通过：退出码 0 |
| V4 实景 | **通过**：同一条探针脚本、同样的新存档，第 1 次 Enter 即进入 `GameScene`+`HUDScene`（修复前三次都停在 `PreparationScene`），零异常 |

### 4.1 回归测试

`tests/weapon-loadout.test.ts` 新增 2 个用例：

1. **出击完成条件跟随已解锁武器数** —— 锁住 `getRequiredLoadoutSize(['pistol']) === 1`
   与 `isLoadoutComplete(['pistol'], ['pistol']) === true`，
   以及三把解锁时需要正好三把。
2. **解锁数超过槽位上限时封顶** —— 锁住全部 17 把解锁时
   `getRequiredLoadoutSize()` 仍为 `MAX_WEAPON_LOADOUT_SIZE`。

第 2 个用例防止修复过头：把完成条件改成"等于已解锁数"会在解锁超过 6 把后再次断裂。

## 5. 教训

1. **这个缺陷被 414 个绿灯完整掩盖**，与 G2-9 修复的缺陷同因：
   `weapon-loadout.test.ts` 与 `config-integrity.test.ts` 都只断言配置自洽。
   配置确实自洽——`normalizeWeaponLoadout` 的产出完全正确，
   错的是**另一个文件对它产出范围的假设**。
   跨文件的不变量假设不会被单文件测试覆盖。

2. **静默 `return` 是阻断级缺陷的温床**。`confirmSelection()` 不满足条件时直接
   `return`，没有音效、没有提示、没有日志。相比之下
   `applyLoadoutEditor()` 至少给了「编队未完成，还需选择 N 把武器」的反馈文字。
   UI 的守卫分支应当总有可观测输出。

3. **改变全局前提的改动必须回头扫描硬编码假设**。G2-9 改了"玩家开局有多少武器"
   这个前提，而 `=== 6` 是别处对该前提的硬编码。
   这类连带回归无法靠改动文件自身的测试发现。

4. **首次体验路径必须有实景验证**。这条路径（清档 → 主菜单 → 整备 → 出击）
   是每个新玩家的必经之路，却在提交后近一天才被发现——
   因为开发者本机的 localStorage 里早已有解锁记录，永远走不到这个分支。

## 6. 变更文件

- `src/config/loadout.ts`：新增 `getRequiredLoadoutSize()`、`isLoadoutComplete()`
- `src/scenes/PreparationScene.ts`：三处改用共用判定
- `tests/weapon-loadout.test.ts`：新增 2 个回归用例

## 7. 剩余风险

§7.1/§7.2 已于同轮补验，实测记录：

```
[3把解锁]   loadout=["pistol","smg","rifle"] unlocked=3 -> entered GameScene: true
[清除许可后] loadout=["pistol"]               unlocked=1 -> entered GameScene: true
exceptions: []
```

1. ~~未验证中间态~~ —— **已验**：解锁 3 把时编队为 3 把且能正常出击。
2. ~~清除军械许可后的路径~~ —— **已验**：回到 `['pistol']` 后仍能出击。
3. **V6 真人验收未做**：`1 / 1` 这个显示对新玩家是否自然可懂，需要真人判断。
   当前只能确认它在客观上不再阻断，不能确认它易懂。
4. **未验证 6 把以上解锁的实机表现**。封顶逻辑只有单测覆盖，
   实机需要打到后期关卡才能自然到达，本轮未走。
