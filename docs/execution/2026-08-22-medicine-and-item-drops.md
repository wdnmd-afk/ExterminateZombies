# 2026-08-22 药品真实掉落与战术道具掉落扩展

> 状态：已实施，已通过 Chrome 实机验收
> 关联：`2026-08-19-medicine-and-fixed-sidebar.md`（药品系统落地，掉落表被显式推迟）、
> `docs/playDesign/药品与固定侧栏HUD.md` §5（本轮推翻其中一条结论，见第 2 节）

## 1. 本轮解决什么

两个用户直接指出的缺口：

1. **药品配了但从来不掉。** `DropDef` 的 `'medicine'` 分支、`Pickup` 图标、`applyPickup`
   入库、`validate.ts` 校验和怪物图鉴文案在上一轮就全部就位，但
   `zombies.ts` 里**一条药品掉落都没有**——上一轮执行文档 §3.2 把
   「药品概率与投放到哪些感染体」列为需要和波次节奏一起调的平衡工作而推迟了。
   结果是药品只有开局配额（绷带 2 / 急救 1 / 饮料 1），打完这一局就再也没有治疗资源。
2. **道具只有地雷能掉。** `ITEMS` 里三件道具中两件是桶，都是 `category: 'prop'`，
   而 `ItemManager` 三处硬过滤 `category === 'deployable'`，所以桶既掉不出来也拿不起来。

## 2. 与既有设计结论的冲突（已经用户确认后推翻）

`docs/playDesign/药品与固定侧栏HUD.md` §5 当初特意**保留**了即时回血掉落，理由是：

> 如果把即时回血改成掉落绷带，玩家在残血被围时捡到的东西从「立刻 +15」
> 变成「需要停下来读条 1.5 秒」，实际是把一个救命道具改成了负担。

本轮向用户明确复述了这条理由，用户仍选择**用药品替换生命掉落**。因此：

- 13 条 `type: 'health'` 掉落全部删除，`'health'` 掉落类型连同运行时分支一起移除。
- 换取的补偿是**单次治疗量更大、且入库不浪费**：旧生命包 10~24 点、满血踩上去直接白给；
  绷带 30 点、急救 80 点、饮料 60 点持续 + 1.2 倍移速，捡到就进背包，等需要时再用。
- 代价明确记在这里：**战场上不再有任何即时回血**，残血被围时唯一的解法是先脱离再读条。
  如果实战证明这个窗口太紧，回退办法是把 `pickup-health.png`
  与 `ENVIRONMENT_TEXTURE_KEYS.pickupHealth` 接回（素材与处理脚本都保留了，见第 6 节）。

## 3. 药品掉落设计

### 3.1 概率换算口径

一个绷带（30 点）≈ 2.5 个旧生命包（12 点）的治疗量，但要付 1.5 秒半速读条；
反过来它入库后不会像满血踩生命包那样浪费。两项相抵，按 **旧概率 × 0.45** 换算绷带概率，
硬目标再额外拆出一条低概率急救——集火一只坦克的回报要能看见，
但一只不能就把 2 格急救上限填满。

### 3.2 按感染体角色分工

| 药品 | 掉落来源 | 为什么是这批 |
| --- | --- | --- |
| 绷带（30 点 / 1.5s / 上限 4） | walker、lurker、headless、tank、bloodied、bloater、oddity + 四个 Boss | 杂兵的主力补给，保证基础续航 |
| 急救（80 点 / 3s / 上限 2） | tank、bloodied、bloater + 四个 Boss | 只从「必须集火」的硬目标出，稀缺性绑定难度 |
| 饮料（60 点持续 20s + 1.2 倍移速 / 1s / 上限 2） | runner、feral、crawler、stalker、hunter_boss、matriarch_boss | 高速感染体逼玩家一直动，补给就该是移速这一路 |

具体数值（旧 EV = 旧概率 × 回血量，新 EV 同理）：

| 感染体 | 旧生命掉落 | 新药品掉落 | 旧 EV → 新 EV |
| --- | --- | --- | --- |
| walker 普通 | 0.06 × 12 | 绷带 0.03 | 0.72 → 0.90 |
| runner 快速 | — | 饮料 0.03 | 0 → 1.80 |
| tank 坦克 | 0.20 × 24 | 绷带 0.06 + 急救 0.03 | 4.80 → 4.20 |
| lurker 裂颅 | 0.08 × 14 | 绷带 0.04 | 1.12 → 1.20 |
| feral 狂乱者 | 0.06 × 10 | 饮料 0.02 | 0.60 → 1.20 |
| bloodied 血污屠夫 | 0.14 × 18 | 绷带 0.06 + 急救 0.02 | 2.52 → 3.40 |
| headless 无头 | 0.10 × 18 | 绷带 0.05 | 1.80 → 1.50 |
| bloater 肿胀者 | 0.18 × 22 | 绷带 0.06 + 急救 0.03 | 3.96 → 4.20 |
| crawler 伏地 | 0.05 × 10 | 饮料 0.02 | 0.50 → 1.20 |
| stalker 俯行猎手 | — | 饮料 0.02 | 0 → 1.20 |
| oddity 畸变行者 | 0.14 × 18 | 绷带 0.06 | 2.52 → 1.80 |

Boss 单独一档：Boss 是设计好的喘息点，药品按「接近补满携带上限」给。

| Boss | 药品掉落 |
| --- | --- |
| tank_boss 巨型坦克 | 绷带 ×2 @0.70、急救 ×1 @0.40 |
| bomber_boss 毁灭爆破者 | 绷带 ×2 @0.70、急救 ×1 @0.40 |
| hunter_boss 猩红猎杀者 | 绷带 ×2 @0.70、急救 ×1 @0.45、饮料 ×1 @0.50 |
| matriarch_boss 腐化母体 | 绷带 ×2 @0.80、急救 ×1 @0.60、饮料 ×1 @0.45 |

**为什么 Boss 给这么多不会失衡**：药品是纯局内资源，结算时归零；关卡模式打完 Boss 就进结算，
给多给少几乎不影响。这批数值真正生效的地方是**无尽模式**——那里 Boss 周期性出现，
玩家靠这一次补给撑到下一个 Boss。真正的上限约束是 `carryMax`（4/2/2），不是掉落率。

## 4. 战术道具掉落扩展

### 4.1 `category` 拆成两个正交概念

原来 `ItemDef.category: 'prop' | 'deployable'` 一个字段同时表达了
「关卡能不能摆」和「玩家能不能带」，而油桶需要**两者都为真**。因此拆开：

```ts
scenePlaceable: boolean;   // 关卡与无尽模式能否作为地图场景物摆放
carryMax?: number;         // 玩家携带上限；缺省或 0 = 不能携带，也不能作为道具掉落
```

- `barrel_oil` / `barrel_flour`：`scenePlaceable: true` + `carryMax: 2`
- `mine`：`scenePlaceable: false` + `carryMax: 5`

携带资格统一由 `isCarryableItem()` 判定（判据只有 `carryMax`），
`ItemManager` 原来三处 `category === 'deployable'` 全部改走它。
新增一件可携带道具只要给出 `carryMax`，掉落表、HUD 与切换循环会自动接纳。

### 4.2 携带形态的玩法差异

三种道具刻意是三种节奏，不是「第五第六颗地雷」：

| 道具 | 触发 | 玩法 |
| --- | --- | --- |
| 地雷 | `onProximity` 40px 自动 | 放下即生效，封路不用管 |
| 油桶 | `onDamage` 血量 1 | 放下后要自己补一枪，换来可选时机 + 3 秒火焰封路 |
| 面粉桶 | `onDamage` 血量 1 | 同上，残留粉尘阻挡感染体几秒，是脱身工具而非杀伤工具 |

物理上桶不挡玩家也不挡感染体（`propGroup` 只与子弹 overlap），
所以在脚下放桶不会把自己卡住；敌方投射物不与 `propGroup` 相交，敌人也炸不掉你的桶。
自己的子弹能打爆它——那是设计好的风险与收益。

### 4.3 掉落来源

| 道具 | 掉落来源 | 调整 |
| --- | --- | --- |
| 地雷 | bomber、drifter、rotting、stalker、oddity、bomber_boss | bomber 0.45→**0.30**，oddity 0.32→**0.24** |
| 油桶 | bomber **0.20**、bloater **0.12**、oddity **0.12**、bomber_boss ×2 **@0.55** | 全新 |
| 面粉桶 | drifter **0.12**、rotting **0.14**、matriarch_boss ×2 **@0.50** | 全新 |

bomber 与 oddity 的地雷概率下调是为了让它们的**道具总产出基本不变**，
玩家拿到的从「更多地雷」变成「两种不同触发方式」。

### 4.4 掉落物外观

`Pickup` 原来对道具掉落 `setDisplaySize(38, 32)` 硬拉伸。地雷源图 46×38（比例 1.211）
凑巧接近这个框，但桶是 52×48（比例 1.083），拉伸会被压扁。改为按容纳框 38×34 内接
（原 `fitWeapon` 字段一并改名为 `preserveAspect`，因为现在武器和道具都用它）：

- 地雷 46×38 → 38.00×31.39（与改动前的 38×32 实际一致，无可见变化）
- 两种桶 52×48 → 36.83×34.00（比例保持 1.083）

## 5. 新增的两条启动期不变量

`validate.ts` 增加，`tests/config-integrity.test.ts` 同步覆盖：

1. **`type: 'item'` 掉落必须指向可携带道具。** 否则拾取时 `addItem` 静默返回 0，
   `applyPickup` 返回 false，调用方不 despawn，掉落物会一直留在地上直到过期——
   正是 `questions/2026-08-22-强化卡拾取卡死.md` §8 记下的那个陷阱。
2. **每种药品、每种可携带道具都必须至少有一个感染体掉落来源。** 这一条直接把本轮修的
   bug（配了但永远拿不到）钉成启动期错误，而不是等玩家打半局才发现。

顺带补了「道具 `carryMax` 必须是正整数」和「道具至少有一条进场途径
（可摆放或可携带）」两条值域校验。

## 6. 改动清单

| # | 文件 | 改动 |
| --- | --- | --- |
| 1 | `src/config/types.ts` | `DropDef` 移除 `'health'`；`ItemDef.category` → `scenePlaceable` + `carryMax` 语义说明 |
| 2 | `src/config/items.ts` | 两种桶补 `carryMax: 2`；新增 `isCarryableItem()` 与 `CARRYABLE_ITEM_IDS` |
| 3 | `src/config/zombies.ts` | 13 条生命掉落改药品；新增 7 条桶掉落；bomber/oddity 地雷概率下调 |
| 4 | `src/systems/ItemManager.ts` | 三处 `category` 判定改走 `isCarryableItem`；切换顺序改按配置表而非拾取顺序 |
| 5 | `src/config/validate.ts` | 场景物校验改 `scenePlaceable`；新增第 5 节的四条规则 |
| 6 | `src/entities/Pickup.ts` | 移除 `health` 分支；`fitWeapon` → `preserveAspect`，道具掉落改内接 |
| 7 | `src/scenes/GameScene.ts` | `applyPickup` 移除 `health` 分支 |
| 8 | `src/config/monsterLibrary.ts` | 移除「生命补给」文案分支 |
| 9 | `src/systems/EnvironmentAssetManager.ts` | 移除 `pickupHealth` 纹理键 |
| 10 | `src/scenes/PreloadScene.ts` | 移除 `pickup-health.png` 的 import 与加载 |
| 11 | `tests/config-integrity.test.ts` | 类别断言改新字段；新增掉落来源覆盖测试 |
| 12 | `tests/enhancements.test.ts` | `resolveDropChance` 样例掉落从 `health` 换成 `item` |
| 13 | `README.md`、`docs/ART_ASSET_REGISTRY.md`、`docs/RUNTIME_ASSET_MANIFEST.md` | 掉落物清单、桶的新用途、`pickup-health.png` 标记为已退役 |

`src/assets/processed/environment/pickup-health.png` 与
`scripts/process_environment_assets.py` 的对应分支**都保留**，只是运行时不再加载。
第 2 节提到的回退只需补回纹理键与 `PreloadScene` 的一行加载。

## 7. 验证

`npm test` 仍然起不来：`vitest@4.1.10` 依赖的 vite 不导出 `./module-runner`，
启动即 `ERR_PACKAGE_PATH_NOT_EXPORTED`。这是既有环境问题、与本轮无关，
因此改用两条替代路径取得信号。

### 7.1 静态检查

| 项 | 结果 |
| --- | --- |
| `npx tsc --noEmit`（含 `tests/`） | **26 个错误，与改动前完全一致**，未新增。全部是既有的 `letterSpacing`、`setDepth`、`weapon6` |
| `npx vite build` | 成功，模块图完整；`pickup-health.png` 已不再进入产物 |

### 7.2 配置层与 `ItemManager` 断言（esbuild 转译后在 node 里跑，24 项全过）

| 组 | 内容 | 结果 |
| --- | --- | --- |
| 1 | `validateGameConfig()` 返回空数组 | 通过 |
| 2 | 掉落表中不存在 `type: 'health'` | 通过 |
| 3 | 道具掉落覆盖 3 种且全部可携带；两种桶 `carryMax=2` 且仍可摆放；地雷不可摆放 | 通过 |
| 4 | 掉落来源统计：绷带 11 个、急救 7 个、饮料 6 个；油桶 4 个、面粉桶 3 个、地雷 6 个 | 通过 |
| 5 | 18 类感染体的图鉴掉落文案全部可渲染，无「配置异常」「未知」 | 通过 |
| 6 | **负向**：把油桶 `carryMax` 改成 undefined → 报「掉落了不可携带的道具 barrel_oil」；抽掉全部绷带掉落 → 报「药品 bandage 没有敌人掉落来源」；两次还原后校验重新干净 | 通过 |
| 7 | `ItemManager`：桶可入库、受 `carryMax=2` 限制、切换按配置表循环、布置扣库存、读条封锁期间不布置 | 通过 |

### 7.3 Chrome 实机验收（headless + CDP，无尽模式真实战场，全部通过）

| 项 | 实测 |
| --- | --- |
| 战场与 HUD 启动、开局配额 | `items={mine:3}`、`medicines={绷带2,急救1,饮料1}` |
| 六件掉落物生成 | 三种道具各用自己的 `env-prop-*` 贴图，三种药品各用自己的 `env-medicine-*` 贴图 |
| 掉落物长宽比 | 油桶/面粉桶 52×48→36.83×34（1.083 保持）；地雷 46×38→38×31.39（1.211 保持） |
| 逐个走过去拾取 | 六件全部离场，`items={mine:4,barrel_oil:1,barrel_flour:1}`、`medicines={绷带4,急救2,饮料2}`（绷带撞上限 4） |
| HUD 道具槽 | 名称、数量、图标三者随切换同步：地雷 ×4 / 油桶 ×1 / 面粉桶 ×1 |
| 切换循环顺序 | `mine → barrel_oil → barrel_flour → mine`，与配置表一致 |
| 布置与引爆 | 布置油桶生成场景物并扣库存；`triggerProp` 后场景物离场且火焰残留区 0→1 |
| 运行期异常 | 0 条 |

## 8. 留给真人试玩判断的事

以下是本轮**没有**客观验证、需要连续试玩才能定的：

1. **「战场再无即时回血」是否过紧。** 客观链路全通，但残血被围时的容错只能靠手感判断。
   回退方案见第 2 节。
2. **绷带概率是否够。** 3%~6% 是按 ×0.45 换算出来的，不是试玩调出来的。
3. **Boss 尸体上的掉落物堆叠。** `spawnDrops` 的散布是固定 ±18px，母体现在有 7 条掉落，
   命中多条时掉落物会明显重叠。功能上没问题（走过去会逐个触发），但读图偏乱。
   属独立的表现问题，本轮未动。
4. **无尽模式的场景物回收会不会吃掉玩家的布置物。** `ENDLESS_PROP_LIMIT = 12`，
   携带容量现在是 5+2+2=9。`getOldestEndlessProp` 按 `spawnedAt` 取最早，
   刚布置的通常不是最早的，所以实际风险低；但携带上限继续加大时要重新看这条。
5. **单槽道具区够不够用。** HUD 道具区仍是一个当前槽 + `[F]` 循环（实机已验证三种道具
   都能正确显示和切换），但玩家现在最多同时持有三种道具，看不到另外两种的数量。
   `docs/playDesign/侧栏HUD空间利用.md` §11.4 记录的「多槽道具区」开放问题
   从此有了真实需求；右侧栏余量不足，要动就得先压缩 Boss 槽或分页，属另一轮改动。
