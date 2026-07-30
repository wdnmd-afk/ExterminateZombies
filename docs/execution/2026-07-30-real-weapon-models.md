# 2026-07-30 真实武器模型接入

## 目标

把玩家手中的枪从「原始素材表整格 / 缺手臂的贴图覆盖层」推进为逐把对应真实型号的像素武器模型，并让实机持枪、枪口出弹点与武器库预览三处共用同一套透明贴图，通过浏览器实测确认表现正确。

## 背景与已确认决策

1. `[事实]` `docs/execution/2026-07-30-unlock-all-weapons-testing.md` 已把 8 把武器改为测试初始配发，战斗数值与爆炸弹链路已接通。
2. `[事实]` 本轮开始前仓库已存在 `src/systems/WeaponAssetManager.ts`、`scripts/process_weapon_assets.py` 和 `src/assets/processed/weapons/` 下 8 张贴图，`PreloadScene` 与 `Player` 已完成基础接线；本轮是在该半成品基础上补齐正确性与一致性。
3. `[事实]` 素材来源为 `src/assets/downloaded/weapons/pixel-art-guns-128x128/spritesheet-guns.png`（5×5 共 25 格，每格 128×128，格内烘有型号名文字与浅灰底）以及 `486-shotgun-desert-eagle/486_parallelo.png`。
4. `[已确认]` 用户本轮明确要求：完成后不执行 TypeScript 类型校验。
5. `[事实]` `PROJECT_MASTER_PLAN.md` §5.10 把「玩家与当前武器表现」列为美术资源优先级第 1 项，本轮属于该项。

## 范围

1. 核对 8 把武器与素材表内真实型号的对应关系。
2. 修正处理脚本遗留的封闭镂空背景像素。
3. 为玩家补持枪手臂层，使武器看起来握在手里而非贴在胸前。
4. 校正每把武器的握把落点与枪口出弹距离。
5. 武器库预览改用与实机相同的透明 PNG，并移除随之变为无用的原始素材表运行时加载。
6. 用 headless 浏览器完成实机持枪、开火、走动与武器库逐项截图验收。
7. 同步 `docs/ART_ASSET_REGISTRY.md`、`PROJECT_MASTER_PLAN.md` 与 `README.md` 中受影响的记录。

## 不做项

1. 不新增武器，不调整任何战斗数值：伤害、射速、弹匣、换弹、贯穿、射程和爆炸参数本轮均未改动。
2. 不制作四套完整持枪角色动画；只接入素材包自带的一层通用持枪手臂。
3. 不把测试配发武器写入正式敌人掉落表。
4. 不执行 `npm run typecheck`（用户明确要求）与 `npm run build`（遵循总纲第 5.16 节构建约束）。
5. 不修复既有的 `tests/weapon-loadout.test.ts` 缺 `@types/node` 问题；该缺陷与本轮无关，单列后续项。

## 影响文件与调用链

| 文件 | 改动 |
| --- | --- |
| `scripts/process_weapon_assets.py` | 背景清除增加封闭镂空区域处理，并写明背景判据不可改为边界采样 |
| `src/assets/processed/weapons/*.png` | 8 张贴图按新脚本重新生成 |
| `src/systems/WeaponAssetManager.ts` | 8 把武器的 `sideOffset` / `forwardOffset` / `muzzleDistance` 重算，字段补注释 |
| `src/systems/GameAssetManager.ts` | 新增 `playerArm` 纹理键、`PLAYER_ARM_WALK_ANIMATION`，手臂纹理纳入最近邻过滤 |
| `src/scenes/PreloadScene.ts` | 加载持枪手臂帧表 |
| `src/entities/Player.ts` | 新增 `armSprite` 层，受击闪红与开火挤压同步作用于身体与手臂 |
| `src/config/weaponLibrary.ts` | 图鉴美术改为只声明 `weaponId` + 缩放，移除 `WEAPON_TEXTURE_KEYS` 与两种旧美术类型 |
| `src/scenes/WeaponLibraryScene.ts` | 预览按 `weaponId` 直接取实机贴图，占位纹理同步 |
| `docs/ART_ASSET_REGISTRY.md` | 同步玩家手臂层与两个武器素材包的状态（改为「仅作处理源」） |

调用链：

```text
process_weapon_assets.py  ->  src/assets/processed/weapons/*.png
                                        |
                     PreloadScene.load.image(GAME_WEAPON_TEXTURE_KEYS)
                                        |
                +-----------------------+------------------------+
                v                                                v
    Player.sprite / armSprite / weaponSprite        WeaponLibraryScene.previewImage
    (WeaponAssetManager 提供锚点、偏移与枪口)          (resolvePreviewTexture)
                |
        Player.getMuzzle()  ->  WeaponManager 在枪口生成子弹
```

## 操作步骤

1. 渲染带帧号的素材表索引图，逐格核对 8 把武器与表内型号名的对应关系。
2. 统计 8 张贴图中残留的浅色不透明像素，按连通域定位并逐处确认是否为镂空。
3. 修改处理脚本，在边界洪泛之后增加一次封闭镂空清除，重新生成 8 张贴图并复检尺寸未变。
4. 测量持枪手臂帧表的手部位置，换算为瞄准方向上的握把落点。
5. 接入手臂层，把握把移到拳心，`muzzleDistance` 改为按贴图显示宽度推算。
6. 新增 `processed` 图鉴美术类型，切换 7 项条目并按贴图长宽设定各自缩放。
7. headless Chrome + CDP 驱动：进第一关、逐把切枪、真实鼠标锁定瞄准、开火、走动、逐项悬停武器库，采集运行时异常与截图。

## 实施建议

1. 背景判据必须沿用「整块裁剪区最高频不透明色」。裁剪框会切到枪身，改成裁剪边界采样会把枪体灰误判为背景。
2. 手臂层的帧序与 `frameRate` 必须与身体完全一致，否则走动时手臂与躯干错位。
3. `muzzleDistance` 与 `forwardOffset` 是相加关系（`枪口 = 中心 + 瞄准方向 × muzzleDistance + 偏移向量`），改一处必须复算另一处。
4. AK-47 贴图右端是刺刀而不是枪口，枪口需从右边缘回退。
5. 图鉴缩放按各自贴图长宽单独设定，沿用「每把枪填满预览框」的既有约定，同时保证不溢出面板。

## 潜在风险

| 风险 | 控制措施 |
| --- | --- |
| 封闭镂空清除误删枪体像素 | 只清除与「最高频背景色」在容差内的像素；清除前先用红色标记逐把目视确认全部为镂空；清除后复检 8 张贴图尺寸与原值一致 |
| 手臂层与身体动画错位 | 复用同一帧数与 `frameRate`，实测比对 `armSprite.frame.name` 与 `sprite.frame.name` |
| 握把落点改动使长枪脱离身体 | 手部位置由帧表实测推算，长枪握把回拉到躯干前沿，保证枪身压在手臂上 |
| 枪口前移导致子弹穿过自身或穿墙起点异常 | 枪口取枪管末端而非更远处，实测子弹首帧坐标成线且贴合枪管 |
| 图鉴换贴图后溢出预览面板 | 按贴图长宽分别限高限宽计算缩放，逐项悬停截图确认 |
| 素材授权遗漏 | 本轮未引入新素材来源，仅复用已记录的两个武器素材包与角色素材包 |

## 优化方案

1. 处理脚本把「背景判据不可改为边界采样」写进函数注释，避免后续重复踩同一个坑。
2. `WeaponGameplayVisual` 的 `sideOffset` / `forwardOffset` / `muzzleDistance` 补充语义注释与推算公式，新增武器时可直接照算。
3. 图鉴美术改为声明 `weaponId` 而非纹理键，武器贴图换源时图鉴自动跟随，不需要两处同步。
4. 图鉴预览占位纹理换成实机贴图，消除首帧闪出带标签素材格的可能。

## 验证方式

1. 素材层：素材表索引图逐格比对型号名；处理后 8 张贴图残留浅色像素计数应为 0，尺寸与处理前一致。
2. 自动化：`npm test`。
3. 实机冒烟：headless Chrome + CDP 进入第一关，`GameScene` 与 `HUDScene` 均活跃，运行时异常为 0。
4. 实机持枪：8 把武器逐把切换，纹理键解析成功，`getMuzzle()` 落点与枪管末端偏差应在 1px 内（AK-47 因刺刀故意留负偏差）。
5. 实机开火：按住移动键与左键连发，确认手臂与身体同帧、子弹自枪口成线飞出；RPG-7 单发爆炸弹正常。
6. 武器库：逐项悬停截图，确认无浅灰底、无素材表标签文字、无溢出。

## 执行结果

### 素材对应关系（已核对）

素材表为 5×5 共 25 格，格内自带型号名。8 把武器全部对上同名真实型号：

| 游戏武器 | 素材帧 | 表内型号 | 处理后尺寸 |
| --- | ---: | --- | --- |
| `pistol` 沙漠之鹰 | 独立素材 | `486_parallelo` 沙漠之鹰侧视 | 30×22 |
| `smg` MP5 | 9 | MP5 | 127×69 |
| `rifle` M4A1 | 15 | M4A1 | 124×47 |
| `shotgun` SPAS-12 | 8 | SPAS-12 | 128×43 |
| `ak47` | 16 | AK-47 | 117×36 |
| `barrett` | 22 | BARRETT M82 | 130×32 |
| `rpg` | 23 | RPG-7 | 131×27 |
| `m79` | 24 | M79 | 127×45 |

### 已实施

1. **封闭镂空清除**：原脚本只清除与裁剪边界连通的背景，扳机护圈、M4A1 提把下方、SPAS-12 弹带环、Barrett 镜桥、AK-47 刺刀间隙等被枪体包围的背景像素被保留，在深色地面上表现为浅灰斑块。6 把枪共 414 个像素（`shotgun` 89、`rifle` 92、`smg` 65、`ak47` 63、`barrett` 58、`m79` 41、`rpg` 6）。脚本在边界洪泛后增加一次同色清除，重新生成后 8 张贴图残留浅色像素为 0，尺寸全部与处理前一致。
2. **持枪手臂层**：新增 `GAME_ASSET_KEYS.playerArm` 与 `PLAYER_ARM_WALK_ANIMATION`，加载素材包自带的 `Personnage_vue_dessous_bras.png`（576×48，12 帧）。`Player` 层序改为 阴影 → 身体 → 手臂 → 武器；受击闪红与开火挤压同时作用于身体与手臂。
3. **握把与枪口校正**：由帧表实测手部位于帧内 `(37, 1~4)`，换算到瞄准方向后握把落点为前向约 19px、侧向约 12px。8 把武器 `sideOffset` 由 6~7 调整为 10~12，`forwardOffset` 由 -1~1 调整为 7~13。`muzzleDistance` 改为按 `显示宽度 × (1 - originX)` 取值，原值比枪管末端多出 7~15px。
4. **武器库统一贴图**：原 8 项中有 7 项直接取原始 128×128 单元格，把素材表烘进去的型号名文字与浅灰底一并显示。图鉴美术声明简化为只写 `weaponId` 与缩放，8 项全部复用实机透明贴图（含沙漠之鹰）。
5. **移除原始素材表的运行时加载**：图鉴不再需要原图后，`PreloadScene` 删掉 640×640 枪械表与沙漠之鹰原图两次加载，`weaponLibrary.ts` 删掉 `WEAPON_TEXTURE_KEYS` 与 `frame` / `crop` 两种旧美术类型，`WeaponAssetManager` 删掉 `DESERT_EAGLE_FRAME` 与手工切帧逻辑。两个素材包在台账中降级为「仅作处理源」，署名义务不变。

### 验证结果

1. `npm test`：通过，7 个测试文件、26 项用例全部成功。
2. 实机冒烟（headless Chrome 147 + CDP，第一关）：`GameScene` 与 `HUDScene` 均活跃，场上 112 个对象，8 把武器全部在初始配发列表内，**运行时异常 0**。
3. 枪口对齐（瞄准正右方，逐把实测 `getMuzzle()` 与枪管末端的 x 偏差）：

   | 武器 | 偏差 | 判定 |
   | --- | ---: | --- |
   | `pistol` | -1px | 通过 |
   | `smg` / `rifle` / `shotgun` / `barrett` / `rpg` / `m79` | 0px | 通过 |
   | `ak47` | -6px | 符合预期，让子弹自枪口而非刺刀尖射出 |

4. 开火与走动：按住 `D` + 左键连发 M4A1，`armSprite.frame.name` 与 `sprite.frame.name` 同为第 6 帧（手臂与身体同步），场上 5 发子弹坐标成线且起点贴合枪管；切换 RPG-7 单发爆炸弹正常，无异常。
5. 武器库：8 项逐项悬停截图，全部为透明贴图，准星底纹可从扳机护圈透出，无浅灰底、无标签文字、无溢出面板。
6. 清理后复验（`textures.exists` 实测）：`weapon-guns-128` 与 `weapon-desert-eagle-source` 均为 `false`，8 张 `game-weapon-*` 与 `game-player-arm` 均已加载；`Player` 容器为 4 层（阴影、身体、手臂、武器）；第一关双场景活跃、113 个对象、运行时异常 0。
7. 未执行 `npm run typecheck` 与 `npm run build`，符合本轮用户要求与总纲构建约束。

### 未完成的验收

1. 只在 headless Chrome 中验收，未在有头 Chrome/Edge/Firefox 中确认实际观感与缩放表现。
2. 未做长时间连续战斗下的手臂层性能与叠加绘制开销测量。
3. 未验收非正右方向（斜向、正上、正下）持枪时手臂与枪身的贴合度，仅验证了瞄准角连续旋转生效。
4. 未做外部试玩，武器辨识度是否足够仍缺真人反馈。

## 剩余风险与后续项

| 项 | 说明 |
| --- | --- |
| `npm run typecheck` / `npm run build` 当前失败 | `tests/weapon-loadout.test.ts` 使用 `node:fs`、`node:url`、`Buffer`，但未安装 `@types/node`，且 `tsconfig.json` 包含 `tests`。3 个错误，连带 `npm run build` 断开。与本轮改动无关的既有缺陷，属 P0 完成门槛第 1 条，需单独立项修复 |
| 玩家仍只有一层通用持枪手臂 | 8 把武器共用同一手臂姿势，长枪缺少支撑手；正式方案需按 `PROJECT_MASTER_PLAN.md` §5.10 决定是否制作分武器持枪动画 |
| 斜向持枪贴合度未验收 | 需在有头浏览器中逐方向目视确认 |
| 测试配发仍非正式内容 | 8 把武器的贴图已就位，但 AK-47、Barrett、RPG-7、M79 仍为测试配发，数值与入池决定未变 |
| 素材授权 | 本轮未引入新来源；发布前仍需按总纲 §5.17 建立运行时实际使用资源清单与游戏内 Credits |

当前状态：素材、实机持枪、枪口对齐与武器库一致性已完成并通过自动化与 headless 实机验收；有头浏览器观感、多方向贴合度和真人试玩仍待补齐，因此不将「武器表现」整体标记为完整验收通过。
