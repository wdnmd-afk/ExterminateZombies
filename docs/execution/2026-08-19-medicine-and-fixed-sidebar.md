# 药品系统与固定侧栏 HUD 执行文档

> 状态：批次 A-C 已实施，V0-V5 客观验证通过，V6 真人验收待完成
> 建立日期：2026-08-19
> 所属层级：`docs/execution/` — 实施与追踪
> 设计依据：`docs/playDesign/药品与固定侧栏HUD.md`
> 事实来源：`src/ui/displayLayout.ts`、`src/systems/DisplayManager.ts`、`src/scenes/HUDScene.ts`、`src/scenes/GameScene.ts`、`src/systems/GameState.ts`、`src/systems/InputManager.ts`、`src/config/keybinds.ts`、`src/config/types.ts`、`tests/display-layout.test.ts`
> 验证约束：按项目规则，未经用户明确批准不运行 `lint` / `tsc` / `test` / `build`

---

## 1. 目标

1. 让左右侧栏 HUD 在任何视口尺寸下都存在，消除「算出侧栏空间又丢掉、只剩两条 `#111111` 纯色边」的现状。
2. 新增三种主动消耗型药品（绷带 / 急救包 / 能量饮料），使用需读条，形成「什么时候敢停下来治疗」的战术决策。
3. 侧栏分工改为**左＝武器与自身状态，右＝药品与道具信息**，道具区从左侧栏移到右侧栏。
4. 全程不改动中央战场世界尺寸，关卡与敌人坐标零改动。

## 2. 前置未决项（不阻塞实施）

以下两项已在规划文档提出但用户尚未逐项确认。**按下列假设推进**，若用户后续否决，改动面已被限制在单点：

| 项 | 采用假设 | 若被否决的改动面 |
| --- | --- | --- |
| 规划文档 2.1 的 7 项提议值（携带上限、初始配额、移速幅度、取消规则等） | 按提议值实施 | 全部集中在 `src/config/medicine.ts` 与 `createInitialState()` 两处常量 |
| 真全屏 16:9 出现 194px 上下信箱边 | 接受（几何必然，见规划 6.4） | 只需改 `MIN_FIXED_SIDEBAR_WIDTH` 一个常量值 |

## 2.1 决策变更记录（2026-08-19，实施前拍板）

用户逐项拍板，以下 4 项与规划文档原文不同，**实施以本节为准**：

| 项 | 规划原值 | 最终决策 | 连带影响 |
| --- | --- | --- | --- |
| `MIN_FIXED_SIDEBAR_WIDTH` | 140 | **120** | 逻辑宽 1560→1520；面板宽 134→114；内容宽 110→90；真全屏损失 18.0%→15.8%、信箱边 194→171px；窗口化损失 3.5%→0.9%；小视口可读下限 1120×520→**1267×600（反而更严格）** |
| `USE_NARROW_SIDE_HUD` 边界 | 140 → 130 | **取消改动，维持 140** | 114px 面板下宽形态的弹药文本区只剩 34px，窄形态有 42px，宽形态反而更挤 |
| 药品名称 | 绷带 / 急救包 / 能量饮料 | **压到 2 字**：绷带 / 急救 / 饮料 | 90px 内容宽下名称预算仅 31px，四字需缩到 8px 字号已不可读。批次 C 按 2 字名落地 |
| 饮料移速 buff 与濒死叠乘 | 记为待观测 | **先按乘算实施** | 与规划一致，无额外影响 |

规划 2.1 的 7 项提议值（移速 +20%/20s、携带上限 4/2/2、初始配额 2/1/1、满血按键无效、重复饮用不叠加只刷新、读条中同键取消并回滚）**全部照原值采纳**。

各视口重算落点（`MIN_FIXED_SIDEBAR_WIDTH = 120`，逻辑宽 1520）：

| 视口 | 自然侧栏 | 战场屏宽（改前 → 改后） | 变化 | 侧栏物理宽 |
| --- | ---: | --- | ---: | ---: |
| 1920×1080 真全屏 | 0 | 1920 → 1617 | −15.8% | 152px |
| 1920×919 窗口化（最常见） | 113 | 1632 → 1617 | **−0.9%** | 152px |
| 1366×700 小窗口 | 63 | 1244 → 1150 | −7.5% | 108px |
| 2560×1080 全屏 21:9 | 214 | 1919 → 1919 | **0%** | 321px |
| 5120×1440 全屏 32:9 | 640 | 2560 → 2560 | **0%** | 1280px |

真全屏 16:9 上下信箱边各 **85px**（合计 171px）。

## 2.2 实施中发现的规划错误：规划 7.2 垂直预算漏两项

实读 `HUDScene.ts` 后发现右侧栏 `RIGHT_SUMMARY` 底边 306 之下并非空白，规划 7.2 的表漏了两个区块：

| 漏掉的区块 | 顶边 | 底边 | 来源 |
| --- | ---: | ---: | --- |
| 连杀区（`killStreakText` 34px 字号） | 318 | ~376 | `createKillStreak()` |
| `controlHintText` 开局提示（临时显示） | ~674 | 698 | `createPanels()` |

按规划原顺序把药品/道具接在 306 之后会**直接压住连杀区**；若改排到连杀区之后（388 起），272px 的药品+道具顶到 660，与提示文字只差 14px，余量从规划宣称的 134px 塌到 **6px**。

**处置**：药品区与道具区接在分数强化区之后（314 起），连杀区下移到道具区之后。语义依据——药品与道具是常驻资源，与分数强化同族；连杀是按需出现的战斗反馈，下沉到底部更符合阅读顺序。

新落点（压缩档，面板 114px，斜杠前为批次 A 当前值 / 斜杠后为批次 C 药品区落地后的值）：

| 区块 | 顶边 | 底边 | 归属批次 |
| --- | ---: | ---: | --- |
| 关卡情报 `RIGHT_PANEL_HEIGHT` | 18 | 146 | 既有 |
| BOSS 槽（常驻预留） | 146 | 254 | 既有 |
| 分数与强化 `RIGHT_SUMMARY_HEIGHT` | 254 | 306 | 既有 |
| 药品区（批次 A 高度为 0） | 314 | 314 / 494 | C |
| 道具区 `RIGHT_ITEM_PANEL_HEIGHT` | 314 / 502 | 398 / 586 | **A** |
| 连杀区 | 410 / 598 | 468 / 656 | A（下移） |
| 开局提示（临时） | ~674 | 698 | 既有 |

批次 C 只需把 `RIGHT_MEDICINE_PANEL_HEIGHT` 从 0 改为 180，道具区与连杀区由链式依赖自动下移，**不产生返工**。

## 2.3 与原步骤 4 的偏离：容器归属无需手工改

规划与本文原步骤 4 写「`itemIcon` / `itemText` / `itemDetailText` 改挂 `rightHudRoot`」。实读发现这些对象本就不在 `leftHudRoot` 里——`createHudRoots()` 是**按 x 坐标自动分拣**的：

```ts
if (gameObject.x < 0) leftObjects.push(gameObject);
if (gameObject.x > GAME_WIDTH) rightObjects.push(gameObject);
```

因此道具区搬迁只需改坐标常量，容器归属自动跟随。核对：`RIGHT_PANEL_TEXT_LEFT = 1397 − 114 + 12 = 1295 > GAME_WIDTH(1280)`，所有道具区对象都会落入 `rightHudRoot`。

## 2.4 实施偏离：补齐联合类型与输入链路的实际消费点

实施前再次检索调用链，发现原文件清单漏掉 6 个必须同步的消费点。若不纳入，会出现类型联合已扩展但运行时/界面不认识新成员的问题：

1. `ItemManager.ts`：不能为封锁布置输入而停掉整个 `update()`，否则读条期间已放置地雷也停止感应；改为 `update(allowInput)`，仅跳过输入分支。
2. `SettingsScene.ts`：`ACTION_LABELS` 是 `Record<GameAction, string>`，必须补三个动作；18 项动作在原 34px 行距下会压住音频区，因此同步压为 30px 行距、28px 行高。
3. `Pickup.ts`：`resolveVisual()` 对 `DropDef.type` 做穷举，必须补 `medicine` 视觉；本轮不新增美术，复用医疗补给图并使用药品色值和名称区分。
4. `validate.ts`：补药品配置值域、掉落引用和数量校验，避免未来错误掉落静默进入运行时。
5. `monsterLibrary.ts`：怪物图鉴必须能格式化未来药品掉落，不能显示“未知掉落类型”。
6. `WeaponManager.ts`：若玩家先开始换弹再使用药品，旧计时会在读条中完成；新增显式中断入口，保证“读条期间禁止换弹”包含已经开始的换弹。

以上修改只补全既定数据链路，不新增感染体药品掉率、不改变关卡和平衡范围。

浏览器实景首轮另发现两项既有显示问题并纳入修复：`#game` Flex 居中与 Phaser `CENTER_BOTH` 重复偏移 Canvas；波次公告标题/副标题纵向叠字。前者删除父容器 Flex 居中，后者增加公告高度和行距；最窄侧栏顶部标签同步缩为 `OPERATIVE` / `MISSION`。

## 3. 范围

### 3.1 本轮包含

| # | 文件 | 改动 |
| --: | --- | --- |
| 1 | `src/ui/displayLayout.ts` | `MIN_FIXED_SIDEBAR_WIDTH = 120`、取大运算、返回 `naturalLogicalWidth`、`fallback` 不可达注释 |
| 2 | `src/systems/DisplayManager.ts` | `resolveRenderScale()` 水平项分母改用 `naturalLogicalWidth` |
| 3 | `tests/display-layout.test.ts` | 按规划 9.1 清单逐条改写断言 |
| 4 | `src/scenes/HUDScene.ts` | `USE_NARROW_SIDE_HUD` 边界 140→130；道具区左移右；新增右侧药品区与四态槽位；读条与倒数 |
| 5 | `src/config/medicine.ts` | **新增**：`MedicineId`、`MedicineDef`、`MEDICINES` |
| 6 | `src/config/types.ts` | `DropDef` 新增 `type: 'medicine'` 变体 |
| 7 | `src/config/keybinds.ts` | `GameAction` 增 3 项、绑定 `Z/X/C` |
| 8 | `src/systems/InputManager.ts` | 仅补 `repairUnsupportedBindings()` 对 `undefined` 的守卫 |
| 9 | `src/constants.ts` | `EVENTS.medicineChanged` |
| 10 | `src/systems/GameState.ts` | `PlayerState` 三字段 + 初始配额 |
| 11 | `src/systems/MedicineManager.ts` | **新增**：读条状态机、HoT、移速倍率、拾取入库 |
| 12 | `src/scenes/GameScene.ts` | 实例化与 `update`、移速合成、封锁开火/换弹/切枪、死亡清理、`applyPickup` 分支、脚下读条 |
| 13 | `src/systems/ItemManager.ts` | 读条期间只封锁道具输入，保留已放置地雷的近距检测 |
| 14 | `src/scenes/SettingsScene.ts` | 三个药品动作标签与 18 项键位网格压缩 |
| 15 | `src/entities/Pickup.ts` | `medicine` 掉落视觉穷举分支 |
| 16 | `src/config/validate.ts` | 药品配置和掉落引用校验 |
| 17 | `src/config/monsterLibrary.ts` | 怪物图鉴药品掉落文案 |
| 18 | `src/systems/WeaponManager.ts` | 药品读条开始时中断已经进行的换弹并刷新 HUD |

### 3.2 本轮不包含

1. 删除 `fallback` 档位（C 档战场内 HUD）代码路径——20 余处分支的纯风险重构，与本轮目标无关，只加注释标明不可达。
2. 多槽道具区——右侧栏余量 134px 不足，需先压缩 BOSS 槽或分页。
3. 药品掉落概率与投放到哪些僵尸的 `drops` 表——属平衡工作，需与波次节奏一起调。
4. 战前整备页编辑药品配额、药品局外解锁与成长。
5. 药品美术资产——本轮用颜色竖条 + 中文名。（**已由 `docs/execution/2026-08-19-medicine-icon-art.md` 补齐**：三种药品接入独立 CC0 图标，竖条已移除。）
6. 命令验证（`lint` / `tsc` / `test` / `build`）与浏览器实景验收。

---

## 4. 操作步骤

分三批推进，每批结束是一个可独立回退的提交点。**批次 A 与批次 B 之间没有代码依赖**，A 出问题不影响药品，B 出问题不影响侧栏。

### 批次 A · 固定侧栏（步骤 1–4）

#### 步骤 1 · `src/ui/displayLayout.ts` 公式改动

1. 新增导出常量：

```ts
/**
 * 侧栏 HUD 的固定最小宽度。
 * 用户要求任何视口尺寸下左右侧栏都必须存在，因此自然黑边不足时主动加宽逻辑画布换取空间。
 */
export const MIN_FIXED_SIDEBAR_WIDTH = MIN_HUD_SIDEBAR_WIDTH; // 当前为 120
```

2. `resolveDisplayLayout()` 内把原来的一步计算拆成「自然值」与「取大后的值」两个量：

```ts
const naturalSidebarWidth = Math.max(0, Math.ceil((aspectWidth - GAME_WIDTH) / 2));
// 自然黑边够用时直接白拿；不足时加宽逻辑画布，让 FIT 整体等比缩小换出侧栏空间。
const sidebarWidth = Math.max(naturalSidebarWidth, MIN_FIXED_SIDEBAR_WIDTH);
const logicalWidth = GAME_WIDTH + sidebarWidth * 2;
// 仅供渲染倍率使用：不含强制加宽的那部分，避免倍率因加宽而掉档，见 DisplayManager.resolveRenderScale。
const naturalLogicalWidth = GAME_WIDTH + naturalSidebarWidth * 2;
```

3. `DisplayLayout` 接口新增 `naturalLogicalWidth: number`，返回值带上该字段。
4. 在 `HudSidebarTier` 的 `'fallback'` 上补注释：说明取大运算后该档不可达、保留原因（C 档战场内 HUD 分支尚未删除）、删除前置条件（另开执行文档）。

**验收**：`resolveDisplayLayout()` 对任何输入（含 `(0, NaN)` 退化输入）返回的 `sidebarWidth >= 140`、`hudSidebarTier !== 'fallback'`；`2560×1080` 仍返回 214，`3200×1280` 仍返回 260/`full`。

#### 步骤 2 · `src/systems/DisplayManager.ts` 渲染倍率防回归

`resolveRenderScale()` 的水平项分母从 `layout.logicalWidth` 改为 `layout.naturalLogicalWidth`：

```ts
const physicalFit = Math.min(
  // 分母用自然逻辑宽而非实际逻辑宽：强制加宽只影响布局，不应把文字精度从 2 倍压到 1 倍。
  (window.innerWidth * devicePixelRatio) / layout.naturalLogicalWidth,
  (window.innerHeight * devicePixelRatio) / GAME_HEIGHT,
);
```

**验收**（手工代入，逐案与改动前一致）：

| 视口 | dpr | 改前倍率 | 改后倍率 |
| --- | ---: | ---: | ---: |
| 1440×810 全屏 16:9 | 1 | 2 | 2 |
| 1920×1080 全屏 | 1 | 2 | 2 |
| 800×1400 窄高窗口 | 1 | 1 | 1 |
| 5120×1440 | 1 | 2 | 2 |

不得改成「只保留垂直项」：`800×1400` 会因此拿到 2 倍率，白白分配 3120px 宽缓冲。

#### 步骤 3 · `tests/display-layout.test.ts` 断言改写

现有 11 处断言全部依赖旧公式，改公式后会全红。**逐条改写，不得靠删除断言修绿。** 新期望值见规划文档 9.1 表，要点：

| 断言 | 新期望 |
| --- | --- |
| `resolveDisplayLayout(1920, 1080)` | `sidebarWidth: 140`、`logicalWidth: 1560`、`naturalLogicalWidth: 1280`、`compact` |
| 16:9 / 16:10 批量用例 | 140 / `compact`（原断言为 0 / `fallback`） |
| `resolveDisplayLayout(1920, 910)` | 140（自然值 120 被下限顶上去） |
| `resolveDisplayLayout(1680, 900)` | 语义已消失，改为验证「取大生效」：`naturalSidebarWidth < 140` 但 `sidebarWidth === 140` |
| `GAME_WIDTH + 119 * 2` → `fallback` | 语义已消失，改为验证 `MIN_FIXED_SIDEBAR_WIDTH` 下限 |
| `resolveDisplayLayout(0, NaN)` | 140 / `compact`（退化输入同样受下限保护） |
| `2560×1080` / `3200×1280` / `3440×1440` / `3840×1600` | **不变**，取大不生效 |

新增两条正向断言：任意用例 `sidebarWidth >= MIN_FIXED_SIDEBAR_WIDTH`；16:9 视口下 `naturalLogicalWidth === GAME_WIDTH`。

**验收**：断言总数不少于改动前；`MIN_HUD_SIDEBAR_WIDTH` 相关的档位边界用例保留（阈值本身未删，只是不再被触发）。

#### 步骤 4 · `src/scenes/HUDScene.ts` 压缩形态与道具区搬迁

1. `HUDScene.ts:160` 的 `USE_NARROW_SIDE_HUD` 边界从 `< 140` 改为 `< 130`。依据：140 侧栏经 `resolveSidePanelWidth()` 得面板 `clamp(134,114,156)=134`，原边界会把它误判为窄形态。核对过宽形态在 134px 下可行：`ARSENAL_TEXT_LEFT=58`、`ARSENAL_SLOT_WIDTH=118`、`ARSENAL_SLOT_TEXT_WIDTH=54`，足够放 `30/30`，且 `fitTextWidth()` 只缩不溢出。
2. 左侧栏移除道具区：删除 `SIDE_ITEM_PANEL_TOP` 在左列的定位，`itemIcon` / `itemText` / `itemDetailText` 改挂 `rightHudRoot`。
3. 右侧栏新增道具区（标题行 24 + 单槽 44 + 内边距 16 = 84），标题右端标注 `[F] 切换`，槽内标注 `[Q]`，按键文案走 `formatKeybind()` 而非硬编码。
4. 在 `USE_SIDE_HUD` / `refreshHudLayoutConstants()` 处补注释：`fallback` 档已不可达，其分支保留原因与删除前置条件。

**验收**：左侧栏累计底边 = 18+155+8+276 = 457；右侧栏累计底边 = 306+8+84 = 398，均 ≤ 720。道具数量变化不引起横向位移。

> **提交点 A**：此时任何视口都有侧栏，道具信息已在右侧，药品尚未实现。

### 批次 B · 药品运行时（步骤 5–12）

#### 步骤 5 · `src/config/medicine.ts` 新增

按规划 8.1 的 `MedicineDef` 字段定义（`useDurationMs` / `instantHeal` / `overTimeHeal` / `overTimeDurationMs` / `overTimeMoveSpeedMultiplier` / `carryMax` / `color`）建表，三条数据：

| id | name | 读条 ms | instantHeal | HoT 总量 | HoT ms | 移速倍率 | carryMax | color |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `bandage` | 绷带 | 1500 | 30 | 0 | 0 | 1 | 4 | `0xd8d2c2` |
| `medkit` | 急救包 | 3000 | 80 | 0 | 0 | 1 | 2 | `0xff7482` |
| `energy_drink` | 能量饮料 | 1000 | 0 | 60 | 20000 | 1.2 | 2 | `0xfbc02d` |

**字段名以本表和规划 8.1 为准，不得改名或增补未确认字段。**

**验收**：三条配置的色值全部来自现有调色板，未引入新色系。

#### 步骤 6 · `src/config/types.ts` 掉落类型

`DropDef` 追加第三个联合分支（`medicineId` 与 `amount` 均为必填，不复用可选的 `itemId`）：

```ts
| (DropBase & {
  type: 'medicine';
  medicineId: MedicineId;
  amount: number;
})
```

**验收**：`validate.ts` 若存在对 `DropDef.type` 的穷举校验，须同步补 `'medicine'`；否则新掉落会被静默丢弃。

#### 步骤 7 · `src/config/keybinds.ts` 键位

1. `GameAction` 追加 `'useBandage' | 'useMedkit' | 'useEnergyDrink'`。
2. `DEFAULT_KEYBINDS` 追加 `useBandage: 'Z', useMedkit: 'X', useEnergyDrink: 'C'`。
3. `KEYBIND_LABELS` 无需改动：`Z/X/C` 单字母走 `formatKeybind()` 的默认返回分支。

`InputManager` 无需为新动作写特例——`registerKeyboardKeys()`(`:65`)、`repairUnsupportedBindings()`(`:76`)、`pulseForCode()`(`:134`)、`rebind()`(`:180`) 都是遍历 `Object.keys` 的通用实现。

**验收**：设置界面的改键流程能选中三个新动作，且与已占用键冲突时走既有的交换逻辑。

#### 步骤 8 · `src/systems/InputManager.ts` 旧存档守卫

`repairUnsupportedBindings()`(`:74-85`) 当前写法为：

```ts
const code = this.binds[action];
const supported = code.startsWith('MOUSE_') || ...
```

旧存档的 `keybinds` 对象缺少三个新动作，`code` 为 `undefined`，`code.startsWith(...)` 会抛 `TypeError`，**导致进入战局即崩**。补一个类型守卫：

```ts
const code = this.binds[action];
// 旧存档缺少新增动作时 code 为 undefined，必须先判类型再取方法，否则读档即崩。
const supported = typeof code === 'string' && (code.startsWith('MOUSE_') || code.startsWith('WHEEL_') || this.toKeyboardCode(code) !== null);
```

修好后旧存档会自动回填默认键位，**不需要写存档迁移**。

**验收**：手工构造一个缺少 `useBandage` 的 `keybinds` 存档，读取后该动作被回填为 `'Z'` 且不抛异常。

#### 步骤 9 · `src/constants.ts` 事件

`EVENTS` 只新增 `medicineChanged: 'medicineChanged'`，用于库存变化、读条开始/结束、HoT 开始/结束五种离散变化。

**读条进度与 HoT 倒数不走事件**：`HUDScene` 已有 `update(time)` 且持有 `gameScene` 引用，逐帧读状态即可。治疗结算复用现有 `EVENTS.healthChanged`。

**验收**：`HUD_STATE_EVENTS`(`HUDScene.ts:228`) 数组已包含 `medicineChanged`，否则休眠期变化不会补画。

#### 步骤 10 · `src/systems/GameState.ts` 状态字段

1. `PlayerState` 追加三字段（定义见规划 8.2）：`medicines`、`medicineUse`、`overTimeHeal`。
2. `createInitialState()` 在现有 `items: { mine: 3 }` 同一位置写入 `medicines: { bandage: 2, medkit: 1, energy_drink: 1 }`、`medicineUse: null`、`overTimeHeal: null`。

**不新增存档字段**，`CURRENT_SAVE_VERSION` 保持 5。

**验收**：`GameOverScene` / `LevelClearScene` 若遍历 `player` 字段做结算展示，新字段不得导致 `undefined` 渲染。

#### 步骤 11 · `src/systems/MedicineManager.ts` 新增

形态对齐现有 `ItemManager`（构造接 `scene / state / input`，对外 `update(delta)`）。七个方法见规划 8.3。实现要点：

1. **库存在读条开始时扣减**，不是结算时扣减——防止连点导致同一件药品被结算多次。
2. **回滚只有一个出口**：`cancelUse()` 库存 +1；`clearOnDeath()` 明确不回滚。两条路径都要有中文注释说明差异。
3. HoT 用 `healCarry` 累加小数，写回 `health` 时取整。`3 HP/s` 除不尽帧时长，逐帧取整会累计丢血。
4. `getMoveSpeedMultiplier()` 返回 `(读条中 ? 0.5 : 1) * (HoT 中 ? 1.2 : 1)`。
5. 绷带/急救包在 `health >= maxHealth` 时按键无效，不扣库存、不进读条。

状态机完整定义见规划 4.1，不在此重复。

**验收**：读条时长、治疗量、上限拒收、取消回滚四项与规划 3、4 节逐条一致。

#### 步骤 12 · `src/scenes/GameScene.ts` 接线

六处改动：

1. 实例化 `medicineManager`，在 `update()` 中调用 `medicineManager.update(delta)`。
2. 移速合成——**只改 `GameScene.ts:361` 这一行**，不新增第二个移速来源：

```ts
this.player.update(
  this.inputManager,
  this.state.player.moveSpeed * (lowHealth ? 1.2 : 1) * this.medicineManager.getMoveSpeedMultiplier(),
);
```

3. `handleWeaponInput()` 开头用 `medicineManager.isChanneling()` 提前返回，封锁开火、换弹、切枪；同时封锁 `itemManager` 的布置。
4. 玩家死亡与战局结束路径调用 `medicineManager.clearOnDeath()`。
5. `applyPickup()` 在现有 `type === 'health'` 分支之后（`:1214` 之后）新增 `type === 'medicine'` 分支，形态对齐 `type === 'item'` 分支：库存满返回 `false` 让拾取物留在场上，成功则发 `pickupCollected` 并播 `pickup` 音效。
6. 角色脚下读条：宽 40 / 高 4 / 角色下方 22px 的短横条，读条结束立即销毁。归入战场内瞬时元素，深度取 `DEPTH.effect`。

**验收**：读条期间左键点击不出弹、`R` 无效、`1`–`5` 无效、滚轮无效；`Q` 无效。

> **提交点 B**：药品可用，但只有战场内脚下读条，右侧栏还看不到药品库存。

### 批次 C · 药品 HUD（步骤 13）

#### 步骤 13 · `src/scenes/HUDScene.ts` 药品区

1. 右侧栏在道具区之上插入药品区：标题 24 + 3×44 + 2×4 + 内边距 16 = 180。
2. 三槽单行三段布局（键位角标 20 / 颜色竖条 6 / 名称 ≤60 走 `fitTextWidth()` / 数量 24 右对齐），面板内容宽 `134-12×2=110`。
3. 四态互斥（见规划 7.3）：可用 / 数量为 0（35% 不透明，仍占位）/ 不可用（满血时绷带急救包名称转灰）/ 正在使用（外描强调色 + 槽内读条填充）。
4. 能量饮料 HoT 生效期间，数量位替换为剩余秒数倒数，色条缓慢呼吸。移速 buff 不做独立 UI。
5. 键位角标全部走 `formatKeybind()`，改键后同步。

**验收**：右侧栏累计底边 = 306+8+180+8+84 = 586 ≤ 720，余量 134px；三槽在库存为 0 时仍占位，位置不漂移。

> **提交点 C**：功能完整。

### 步骤 14 · 文档同步

1. 本文「实施记录」逐步骤填写。
2. 规划文档 `药品与固定侧栏HUD.md` 第 14 节状态从「规划稿，代码未改动」更新为实际状态。
3. `README.md` 操作说明补 `Z/X/C` 三键（若 README 列有键位表）。
4. `侧栏HUD空间利用.md` §2 的「无黑边时保持双套布局」决策行标注已被本轮推翻。

---

## 5. 实施建议

1. **严格按批次提交**。三个提交点各自可独立回退。最容易出问题的是批次 A 的步骤 2（渲染倍率），它的症状是「文字变模糊」而不是报错，如果和药品改动混在一个提交里，回退时会连带撤掉正确的代码。
2. **步骤 1 与步骤 3 必须同一次改完**。改公式不改测试会留下一片红色断言，后续任何人都无法判断是新引入的问题还是已知的待改项。
3. **先做步骤 8 的守卫再做步骤 7 的键位**。顺序颠倒会有一个中间状态：新键位已进 `DEFAULT_KEYBINDS`，但旧存档读取时 `code.startsWith` 抛异常，本机开发存档立刻不可用。
4. **不要顺手删 `fallback` 档位分支**。它变成死代码是本轮的已知结果，删除涉及 `HUDScene.ts:157-206` 二十余处布局常量的分支塌陷，属于独立重构。
5. **药品数值集中在 `MEDICINES` 表里**，不要把 `1500` / `3000` / `0.5` / `1.2` 这类数字散进 `MedicineManager` 或 `GameScene`。前置未决项一旦被用户否决，改动面必须仍然只有一张表。
6. **`getMoveSpeedMultiplier()` 是唯一移速出口**。规划已记录「饮料 buff 与濒死叠乘到 1.44 可能过强」这一待观测项，改为取最大值时只应动这一个函数。
7. 批次 C 的四态槽位建议先只做「可用 / 数量为 0」两态跑通布局，再补「不可用 / 正在使用」，避免布局与状态逻辑同时调试。

## 6. 潜在风险分析

| 风险 | 触发条件 | 症状 | 处置 |
| --- | --- | --- | --- |
| 旧存档读档崩溃 | 步骤 7 先于步骤 8 落地 | 进入战局即 `TypeError: code.startsWith is not a function` | 步骤 8 的类型守卫，顺序不可颠倒 |
| 渲染倍率静默掉档 | 漏做步骤 2 | 16:9 视口宽 1281–1560 时文字模糊，无报错 | 步骤 2；按该步验收表逐案代入确认 |
| 全屏出现 194px 上下信箱边 | 步骤 1 生效后的必然结果 | 全屏玩家觉得「画面变小了」 | 已在前置未决项记录。回退只需改 `MIN_FIXED_SIDEBAR_WIDTH` |
| 布局测试被删而非改写 | 步骤 3 图省事 | 侧栏公式失去回归保护 | 验收要求断言总数不少于改动前 |
| 药品凭空消失 | 取消或异常中断路径漏回滚 | 玩家按错取消后库存少一件 | 回滚只有 `cancelUse()` 一个出口；两条路径各写定向验证 |
| 生命值出现小数 | HoT 未用 `healCarry` 累加 | 结算显示 `99.7/100` | 写回 `health` 时取整，HUD 统一 `Math.ceil` |
| 急救包读条无实质代价 | 受伤不打断 + 可移动（用户已锁定） | 3 秒回 80 点形同免费 | 代价由「半速 + 禁止开火」承担。若试玩仍过强，先调 `carryMax` 与掉落率，不动读条规则 |
| 破阵者一个急救包满血 | 固定点数 + 80 最大生命（用户已锁定） | 高风险角色失去脆弱性 | 校准手段是按角色区分 `carryMax`，不改治疗量 |
| 新掉落被静默丢弃 | `validate.ts` 未补 `'medicine'` | 药品掉落配了但不出现 | 步骤 6 验收项 |
| 右侧栏后续无空间 | 本轮用掉 264px，余量仅 134px | 下次加右侧信息即溢出 | 已把余量写进规划 7.2；下次扩展必须先压 BOSS 槽或分页，不得缩字号硬塞 |
| 休眠期药品变化不补画 | `HUD_STATE_EVENTS` 漏 `medicineChanged` | 从暂停/卡片选择返回后库存显示是旧值 | 步骤 9 验收项 |

## 7. 优化方案

1. **两批解耦已是最小风险切法**。若批次 A 上线后用户对全屏信箱边不满，批次 B、C 不受影响，仍可继续推进药品系统。
2. **`MIN_FIXED_SIDEBAR_WIDTH` 作为唯一调节旋钮**：140 → 120 可把全屏损失从 18% 降到 15.6%（面板宽降到 114px，正好是 `COMPACT_SIDE_PANEL_MIN_WIDTH`，三槽药品区仍可放但名称需更短）。
3. **`naturalLogicalWidth` 是一次结构性修正**，此后任何改动 `logicalWidth` 的方案都不会再意外影响渲染倍率，值得单独保留。
4. **药品四态可退化为两态**先上线，把「正在使用」的读条只留在角色脚下。侧栏读条是可读性增益而非功能必需。
5. 若批次 C 的 44px 行高在 172px 物理宽度下证明偏挤，优先降到 40px（右侧栏可再省 12px），不要缩字号。

## 8. 验证方式

### 8.1 每批必做的静态核对

规划文档 11.1 的八项 L1 清单是本轮验证基线，不在此重复。按批次拆分归属：

| 批次 | 归属的 L1 项 | 补充的批次专属核对 |
| --- | --- | --- |
| A | 第 5、6、7、8 项 | 全仓库检索 `layout.logicalWidth`，确认渲染倍率处已换成 `naturalLogicalWidth`，其余消费点（HUD 画布、摄像机宽度）仍用 `logicalWidth`——两者不可混用 |
| B | 第 1、2、3、4 项 | 检索 `moveSpeed *`，确认只有 `GameScene.ts:361` 一处；检索 `medicines[` 的写操作，确认只有 `MedicineManager` 与 `applyPickup()` 两个来源 |
| C | 第 7 项（右侧栏累计底边复核） | 三槽在库存为 0 时的占位高度与有库存时逐像素相同 |

另有两项与本文步骤直接绑定、规划文档未列的静态核对：

1. `src/config/validate.ts` 若存在 `DropDef.type` 的穷举分支，已补 `'medicine'`（步骤 6）。
2. `HUD_STATE_EVENTS` 已含 `medicineChanged`（步骤 9）。

### 8.2 运行时与主观验证

规划文档 11.2 的 V-A ~ V-K 十一项、11.3 的四项主观项即本轮的运行时验收清单，本文不复制。按批次归属：

| 批次 | 运行时项 | 主观项 |
| --- | --- | --- |
| A | V-A、V-B、V-C | L3 第 4 项（全屏信箱边是否可接受） |
| B | V-D ~ V-K | L3 第 1、2 项 |
| C | V-A（药品区随侧栏重排不破版） | L3 第 3 项 |

### 8.3 命令验证的处理方式

用户于 2026-08-19 明确要求开始持续测试并允许浏览器工具。本轮据此补充 `tests/medicine-manager.test.ts` 六个状态机用例，执行全量 Vitest 与类型检查；未执行生产构建。

## 9. 实施记录

<!-- 每完成一个步骤填一行：实际改动、与本文的偏离、静态核对结果 -->

| 步骤 | 状态 | 实际改动与偏离说明 |
| --: | --- | --- |
| 1 · `displayLayout.ts` 公式 | **已完成** | 新增 `MIN_FIXED_SIDEBAR_WIDTH`，但**写作 `= MIN_HUD_SIDEBAR_WIDTH` 而非写死 120**：两个常量数值相等时余量为零，任何人把压缩档下界调到 121 就会让 `sidebarWidth` 掉回 `fallback`、黑边复现，且症状是视觉回归不是报错。直接引用可从语法上防止失去同步。另新增 `naturalLogicalWidth` 字段、拆出 `naturalSidebarWidth`，并更正 `MIN_HUD_SIDEBAR_WIDTH` 原注释中「全部 16:9/16:10 侧栏宽度都是 0」的错误陈述，补 `'fallback'` 不可达说明 |
| 2 · `DisplayManager.ts` 渲染倍率 | **已完成** | `resolveRenderScale()` 水平项分母改用 `layout.naturalLogicalWidth`，注释写明为何不能只保留垂直项 |
| 3 · 布局测试断言改写 | **已完成** | 原 9 个 `it` 改写并扩充为 **11 个**，无删除断言。新增：①`MIN_FIXED_SIDEBAR_WIDTH === MIN_HUD_SIDEBAR_WIDTH` 同步断言（防步骤 1 的零余量边界回归）②16 个视口的全量不变量「`sidebarWidth >= 下限` 且 `tier !== 'fallback'`」③窗口化 1920×919 自然黑边 113 的定向用例。原「较窄黑边回退」与「119 → fallback」两个语义已消失的用例改为验证取大生效 |
| 4 · `HUDScene.ts` 窄形态边界与道具区搬迁 | **已完成** | 按 2.1 **取消**边界改动（维持 `< 140`），改为写注释说明 114px 下窄形态反而更宽松。道具区搬迁按 2.3 只改坐标常量：`SIDE_ITEM_PANEL_HEIGHT/TOP` 删除，新增 `RIGHT_ITEM_PANEL_HEIGHT = 84`、`RIGHT_ITEM_HEADING_HEIGHT = 24`、`RIGHT_MEDICINE_PANEL_HEIGHT/TOP`、`RIGHT_ITEM_PANEL_TOP` 链式依赖；`ITEM_COLUMN_LEFT/MAX_WIDTH` 移到右侧栏段落之后重算（原位置早于 `RIGHT_PANEL_TEXT_LEFT` 赋值，不移会读到上一帧值）。新增 `itemUseKeyText` / `itemSwitchHintText` 两个字段走 `formatKeybind(keybinds.deployItem/nextItem)`。图标 32→24px、数量改槽内第二行右对齐（90px 单行装不下四段）。连杀区 `streakTop` 改依赖道具区底边 |
| — 提交点 A | **已验证** | 固定侧栏在 1920×1080、1920×919、1366×700 均常驻；动态重排、Canvas 居中和设置页布局已有截图与探针证据 |
| 5 · `medicine.ts` 新增 | **已完成** | 三条配置使用锁定字段；显示名按 2.1 最终决策压为“绷带 / 急救 / 饮料”，数值为 30/80/60、1.5s/3.0s/1.0s、饮料 20s 与 1.2 倍移速 |
| 6 · `types.ts` 掉落类型 | **已完成** | 新增独立 `medicine` 联合分支，`medicineId` 与 `amount` 必填；未复用可选 `itemId` |
| 7 · `keybinds.ts` 键位 | **已完成** | 新增 `useBandage/useMedkit/useEnergyDrink`，默认 `Z/X/C`；动作顺序让三种药品在设置页同列连续显示 |
| 8 · `InputManager.ts` 旧存档守卫 | **已完成** | `repairUnsupportedBindings()` 先判 `typeof code === 'string'` 再调用字符串方法；存档归一化仍由 `SaveManager` 统一完成 |
| 9 · `constants.ts` 事件 | **已完成** | 新增 `medicineChanged`，HUD 事件集合已接入；逐帧进度与倒数直接读 `GameState` |
| 10 · `GameState.ts` 状态字段 | **已完成** | 新增库存、读条与 HoT 三个字段，初始配额 2/1/1；未新增存档键，版本保持 5 |
| 11 · `MedicineManager.ts` 新增 | **已完成** | 完成同键取消、预扣/回滚、即时治疗、20s HoT、移速倍率、携带上限和死亡清理；读条中同类拾取会为正在使用的药预留 1 个携带名额，避免取消后超上限 |
| 12 · `GameScene.ts` 接线 | **已完成** | 唯一移速点乘算读条/饮料倍率；开火、换弹、切枪和道具输入封锁；读条开始会中断已在进行的换弹；拾取分支、结算清理与角色脚下 40×4 读条已接入 |
| — 提交点 B | **已验证** | 读条、取消、固定治疗、HoT、输入封锁、暂停/挂起、拾取上限、受伤与死亡边界均客观通过；未配置感染体药品掉落，符合 3.2 平衡范围 |
| 13 · `HUDScene.ts` 药品区 | **已完成** | 右侧栏新增 180px 三槽区；0 库存常驻、满血不可用、读条描边/填充、饮料倒数/呼吸均接入；首次连杀会收起临时控制提示，避免全量档底部重叠 |
| — 提交点 C | **已验证** | 三槽四态、读条、饮料倒数、0 库存占位和多视口重排均已有截图与探针证据 |
| 14 · 文档同步 | **已完成** | README、玩法规划、侧栏规划与本文已同步；新增消费点偏离记录见 2.4 |

### 静态验证结果

批次 A 的归属项（8.1 表：L1 第 5、6、7、8 项 + 批次专属核对），逐项回填：

| 核对项 | 结论 | 依据 |
| --- | --- | --- |
| L1-5 `resolveDisplayLayout()` 全部消费点已适配 `naturalLogicalWidth` | **通过** | 全仓库检索 `naturalLogicalWidth`：仅 `DisplayManager.ts:29` 一处消费；无其它位置构造 `DisplayLayout` 对象字面量，新增必填字段不引发类型错误 |
| L1-6 `USE_NARROW_SIDE_HUD` 分支不产生负宽度或负偏移 | **通过（且边界未改）** | 边界维持 `< 140`，114px 面板走窄形态：`ARSENAL_SLOT_WIDTH = 114 − 16 = 98`、`ARSENAL_TEXT_LEFT = 50`、`ARSENAL_SLOT_TEXT_WIDTH = 98 − 50 − 6 = 42`，全为正 |
| L1-7 左右侧栏垂直累计底边不超过 720 | **通过** | 左侧栏 18+155+8+276 = 457（道具区移出后）；右侧栏批次 A 最深至连杀区底边 468，批次 C 至 656，均 < 674 的提示文字顶边。落点表见 2.2 |
| L1-8 测试按 9.1 逐条改写，未靠删断言修绿 | **通过** | `it` 数量 9 → 11，无删除；两个语义消失的用例改为验证取大生效而非移除 |
| A-专属 `layout.logicalWidth` 与 `naturalLogicalWidth` 未混用 | **通过** | 检索 `logicalWidth`：`DisplayManager.ts:49/73/79` 三处（`DISPLAY_LOGICAL_WIDTH` 赋值与变更比较）仍用 `logicalWidth`，属布局用途，正确；渲染倍率是唯一改用自然值的地方 |
| A-补充 `SIDE_ITEM_PANEL_TOP/HEIGHT` 无残留引用 | **通过** | 全 `src` 检索无命中 |
| A-补充 道具区对象自动归入 `rightHudRoot` | **通过** | `RIGHT_PANEL_TEXT_LEFT = 1295 > GAME_WIDTH(1280)`，满足 `createHudRoots()` 的 `x > GAME_WIDTH` 分拣条件 |
| A-补充 `scene.restart()` 后局部量 `itemSlotTop` 重算 | **通过** | 档位或面板宽变化走 `restartForDisplayLayout()` → `refreshHudLayoutConstants()` + `scene.restart()`，`create()` 重跑；同档位内只平移容器 x，垂直坐标不依赖 `sidebarWidth` |

渲染倍率逐案手工代入（dpr = 1），与改动前一致：

| 视口 | `naturalLogicalWidth` | `physicalFit` | 倍率 | 改前倍率 |
| --- | ---: | ---: | ---: | ---: |
| 1440×810 全屏 16:9 | 1280 | min(1.125, 1.125) | 2 | 2 |
| 1920×1080 全屏 | 1280 | min(1.500, 1.500) | 2 | 2 |
| 800×1400 窄高窗口 | 1280 | min(0.625, 1.944) | 1 | 1 |
| 5120×1440 | 2560 | min(2.000, 2.000) | 2 | 2 |

反证该修正的必要性：若分母仍用 `logicalWidth(1520)`，1440×810 得 `min(0.947, 1.125) → ceil = 1`，倍率从 2 掉到 1，文字精度减半且无任何报错。

批次 B、C 静态核对结果：

| 核对项 | 结论 | 依据 |
| --- | --- | --- |
| 药品字段全链路一致 | **通过** | `MedicineId`、`MEDICINES`、`PlayerState`、`MedicineManager`、`DropDef`、`GameScene`、`Pickup`、图鉴与 HUD 均只使用 `bandage/medkit/energy_drink` 及文档锁定字段 |
| 移速合成只有一个出口 | **通过** | `GameScene.update()` 仍是角色配置移速、濒死倍率、读条减速和饮料加速的唯一乘算点 |
| 库存预扣与取消回滚成对 | **通过** | `startUse()` 唯一预扣，`cancelUse()` 唯一主动回滚，`clearOnDeath()` 明确不回滚；同类拾取为读条中药品预留携带名额 |
| 输入封锁不破坏既有系统 | **通过** | 武器输入和开火参数按 `isChanneling()` 封锁，读条开始显式中断既有换弹；`ItemManager.update(false)` 只跳过切换/布置，仍执行 `checkProximityDeployables()` |
| `medicineChanged` 事件完整 | **通过** | 库存变化、读条开始/取消/完成、HoT 开始/结束和死亡清理均发事件；HUD 逐帧只读进度与剩余时间 |
| 掉落联合类型消费完整 | **通过** | `GameScene.applyPickup()`、`Pickup.resolveVisual()`、`validateGameConfig()`、`monsterLibrary.formatDropLine()` 均处理 `medicine` |
| 设置页 18 项不压住下方区域 | **通过（公式核对）** | 两列各 9 行，最后一行中心 y=478、28px 行高底边=492；音频区标题 y=506，保留 14px 间隔 |
| 右侧栏垂直预算 | **通过（公式核对）** | 压缩档：药品 314-494、道具 502-586、连杀自 598；全量档最深至连杀约 708，小于 720，连杀出现时临时提示立即隐藏 |
| 三槽在 0 库存时位置稳定 | **通过** | 三个 `MedicineSlotRefs` 在创建时固定生成；0 库存仅降到 35% 透明度，不改变可见性、尺寸或行位 |

以上 V0 结论已由后续 V1-V5 验证补证，详细结果见第 10 节。

## 10. 命令执行记录

| 时间 | 命令 | 退出码 | 结论 |
| --- | --- | --- | --- |
| 2026-08-19 | `npm test`（首轮） | 1 | 209/210；发现 Walker 新 1024px 素材后图鉴旧断言过时，产品安全框约束已通过 |
| 2026-08-19 | `npm test`（修正断言后） | 0 | 23 个文件、210 个用例全部通过；药品新增 6 个状态机用例通过 |
| 2026-08-19 | `npm run typecheck` | 0 | TypeScript 检查通过 |
| 2026-08-19 | `npm run build` | — | 未执行 |

### 10.1 Chrome 客观验收

- 环境：Chrome 147、CDP、1920×1080 / 1920×919 / 1366×700、DPR 1；测试开关保持正式默认值。
- V3-V4：10 项基础用例全部通过，包括固定侧栏、读条半速、开火/换弹封锁、取消回滚、三种治疗、满血拒绝、多视口和设置页 18 项键位。
- V4 长链路：7 项全部通过，包括暂停/挂起冻结、饮料完整 20 秒 60 点治疗、五角色固定 30 点绷带、拾取上限、真实敌人伤害不中断和死亡不回滚。
- V5 实战样本：正式无尽模式连续 26 秒，真实移动/瞄准/射击推进至第 3 波，击杀 16、得分 196，饮料读条与持续效果正常，未出现控制台异常、页面异常或失败请求。
- 实景修复：移除 `#game` 与 Phaser 的重复居中，修复 Canvas 上下偏移；增加波次公告行距；最窄侧栏标题缩短，截图复核无叠字。
- 证据：`.debug-medicine-20260819-pass6-evidence/`、`.debug-medicine-20260819-extended2-evidence/`、`.debug-medicine-20260819-real-play-evidence/`。
- 结论：V1-V5 客观通过；全屏留边观感、药品节奏、按键误触与主观手感仍属于 V6，未由 Agent 代替用户结论。
