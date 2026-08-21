# 实机武器握枪对位修复执行文档

> 建立日期：2026-08-21
>
> 目标对象：`src/entities/Player.ts` 的武器覆盖层、`src/systems/WeaponAssetManager.ts`
> 的武器标定点、`src/config/characters.ts` 的握枪锚点
>
> 参考基线：`docs/execution/2026-07-30-real-weapon-models.md`（本轮修复的是那一轮
> 在 2026-08-18 换人物素材时丢掉的东西）、`docs/execution/2026-08-18-character-art-upgrade.md`
>
> 状态：几何已实测验收（§6），等待真人在实机中目视复核

## 1. 问题

用户报告「游戏内武器贴图不像握枪」。实测三条独立原因叠在一起，前两条是回归：

1. **人物躯干用的是 `*_hold.png`，那是空手姿态。** 实测该姿态两只手分别落在瞄准
   中线上下约 `±12.5` 源像素处，手里没有任何东西；武器画在中线上，正好从两手之间
   穿过，谁都没握住它。
2. **`sideOffset` 全部为 0。** Kenney 自己的持枪合成图 `*_gun.png` 实测构成为
   `*_stand.png`（落在 `(0,0)`）+ `weapon_gun.png`（落在 `(stand.width - 4, 26)`，
   枪膛中线在人物中心下方 `+9.5`）+ 一层压在枪上的前臂与拳头。也就是说这套素材的
   持枪中线本来就**不在**瞄准中线上。2026-08-18 的换素材记录把它写成
   「Kenney 双手位于人物朝向中线，因此当前均为 0」，这个判断与素材实际不符。
3. **持枪手层在 2026-08-18 一并消失了。** 2026-07-30 那轮曾专门补过手臂层
   （层序 阴影 → 身体 → 手臂 → 武器），但它用的是 ghostbyte 素材包的帧表；
   换成 Kenney 人物后该层被删除，层序退化为 阴影 → 武器 → 人物，握把之上再无遮挡。

此外 `originX` / `originY` 是 0~1 的贴图比例（`0.26`~`0.32`、`0.52`），既不对应任何
可核对的位置，也在贴图尺寸变化时静默错位；`muzzleDistance` 由「显示宽度 × (1 - originX)」
反推，同样不可核对。

## 2. 本轮范围

只修对位与层序，不重做武器美术：

1. 躯干换 `*_stand.png`，补回持枪手层，层序改为 阴影 → 武器 → 躯干 → 持枪手。
2. 武器标定点从 origin 比例改为**贴图内像素坐标**，逐把实测。
3. 握枪锚点改为**按角色**配置，因为 Kenney 素材与自生成守望者的持枪侧相反。

不包含：

1. 重画 11 张武器贴图。它们是**侧视**素材，用在俯视游戏里本身就有视角差
   （下垂的弹匣与握把在俯视下读起来是横向支出），本轮靠握把对位与手层遮挡把它
   压到可接受，没有换成俯视新画。
2. `gatling` / `golden_m249` / `flamethrower` 三张由 `process_heavy_weapon_assets.ps1`
   用 GDI+ 图元现画的贴图，辨识度明显低于另外八张（金色 M249 基本是一团色块）。
   本轮只修了它们的握把落点，没动画面。
3. `sprite-watcher.png` 残留 164 个品红/紫描边像素（键控没抠净），紧贴拳头位置。
   属于角色素材缺陷，未处理。

## 3. 数据来源

全部数值来自对素材的逐像素实测，不是估值：

| 量 | 值 | 测法 |
| --- | --- | --- |
| Kenney 躯干层在 `*_gun.png` 中的落点 | `(0,0)`，平均色差 `0.0`~`0.1` | 模板匹配，五名角色一致 |
| `weapon_gun.png` 落点 | `(stand.width - 4, 26)` | 模板匹配，五名角色一致 |
| Kenney 持枪中线 `boreSide` | `+9.5` | 由上一行换算（`26 + 10/2 - 43/2`） |
| Kenney 握把锚点 `forward` | `11.5`（堡垒 `13`） | 见 §3.1 |
| 守望者握枪锚点 | `forward 13.7`、`boreSide -8.1` | `sprite-watcher.png` 右半皮肤像素质心 |
| 各枪握把 / 枪膛 / 枪口 | 见 `WEAPON_GAMEPLAY_VISUALS` | 逐把放大目视 + 逐列不透明像素分布 |

前两行的匹配结果由 `scripts/process_character_hand_layers.py` 在每次生成时重新
验证；不符就直接失败退出，而不是继续产出一张混进躯干像素的手层。

### 3.1 `forward` 是解出来的，不是目测的

第一版按「手层皮肤色质心」取 `forward`，得到 `14.2 ~ 17.1`。实测这是错的：
手层前缘（指尖）在枪膛线以下只有 4px 高，握把对到那里，握把区有 52%~86% 的像素
落在手的前方露出来——虽然单看预览图还算能接受，但等于没利用手层。

改成对遮挡关系求解。约束是「握把区（握把列前后各 4 列、枪膛线以下）露在手层外面的
像素占比 ≤ 15%」，在满足约束的区间里取**最大**的 `forward`：

| 角色 | 满足约束的区间 | 取值 | 最差一把 |
| --- | --- | --- | --- |
| 鹰眼 | `9 ~ 11.5` | `11.5` | `barrett` 13% |
| 堡垒 | `10 ~ 13` | `13` | `barrett` 13% |
| 疾行者 | `8.5 ~ 11.5` | `11.5` | `barrett` 13% |
| 破阵者 | `8.5 ~ 11.5` | `11.5` | `barrett` 13% |

取上界而不是取遮挡最厚的那一列（`8 ~ 10`）：`forward` 越小武器越往身体里缩，
枪口越不容易探出人物轮廓，手枪会整支埋进躯干。取上界能在握把仍被压住的前提下
把枪身尽量推出轮廓。堡垒解出的 `13` 与 Kenney 自己的落点
（`stand.width / 2 - 4 = 14`）基本重合，是个独立的交叉验证。

## 4. 实现

| 文件 | 改动 |
| --- | --- |
| `scripts/process_character_hand_layers.py` | 新增。从 `*_gun.png` 减去躯干层与 `weapon_gun.png`，抽出四名 Kenney 角色的持枪手层；画幅与躯干贴图共用几何中心，运行时不需要偏移量 |
| `src/config/characters.ts` | 新增 `CHARACTER_HAND_TEXTURE_KEYS`、`CharacterGripAnchor`；`CharacterDef` 增加 `handTextureKey` 与 `gripAnchor` |
| `src/systems/WeaponAssetManager.ts` | `originX/originY/sideOffset/forwardOffset/muzzleDistance` 换成 `gripX/boreY/muzzleX`（贴图像素）；新增纯函数 `resolveWeaponMount` 合成两侧锚点 |
| `src/entities/Player.ts` | 构造改收角色视觉数据；新增持枪手层；层序改为 阴影 → 武器 → 躯干 → 持枪手；`getMuzzle` 改用 `resolveWeaponMount`；锚点改用 `setDisplayOrigin`（像素）；受击闪红与开火挤压同时作用于躯干与手层 |
| `src/scenes/PreloadScene.ts` | 四名角色躯干由 `*_hold.png` 改 `*_stand.png`；加载四张手层；删掉已无引用的 `game-player-base` |
| `src/scenes/GameScene.ts` | `new Player` 传整个 `CharacterDef` 而不是单个 `textureKey` |
| `src/config/zombieVisuals.ts` | 删掉 `GAME_ASSET_KEYS.player`（已无任何引用） |
| `src/systems/GameAssetManager.ts` | 手层纹理纳入最近邻过滤 |
| `src/config/validate.ts` | 校验握枪锚点在贴图半幅内、`forward` 为正、手层 key 不是空串 |
| `docs/design/CHARACTER_PORTRAIT_PROMPTS.md` | §3.3 图 B 规格由「空手、拳心 80%/50%」改为「握拳、拳心 73%/65%」，并写明提示词只是让模型画到位、运行时依据必须实测回填 |
| `docs/ART_ASSET_REGISTRY.md`、`docs/RUNTIME_ASSET_MANIFEST.md` | 登记持枪手层，标注躯干不能退回 `*_hold.png` 及其原因 |

### 4.1 为什么锚点分成两个分量

`gripAnchor` 是 `{ forward, boreSide }` 而不是一个点：

- `forward` 决定武器握把前后落在哪里，对齐的是**拳心**；
- `boreSide` 决定枪膛落在人物的哪一侧，对齐的是**持枪中线**。

合成一个点会强迫「枪管高度」跟着「握把前后」一起动。分开之后枪膛高度对所有武器一致，
换枪不改变弹道的侧向偏移，玩家瞄准手感不变；而握把相对枪膛垂下多深由各枪自己的贴图
决定，长短枪自然不同。

### 4.2 为什么手枪与 MP5 的缩放降了

判据是「扳机护圈底缘到枪膛中线的显示距离必须落在手层覆盖范围内」（手层覆盖枪膛中线
以下约 12 世界像素）。手枪原缩放 `1.35`、MP5 原 `0.42` 会让握把分别探出约 19px 与 21px，
从手底下露出来，重新变成「枪浮在手边」。改为 `0.74` 与 `0.34` 后分别落在 10.4px 与 11.6px。
手枪改后显示长度约 22px，与 Kenney 自带 `weapon_gun.png` 的 20.5px 同级。

## 5. 风险与处理

| 风险 | 处理 |
| --- | --- |
| 换躯干姿态改变四名角色外观 | `stand` 与 `hold` 只差手臂，躯干、背包、头部完全相同；且这正是 Kenney 自己搭持枪姿态用的底图 |
| 手层与躯干错位 | 手层画幅按 `stand.width + 2 * PAD` 生成，几何中心与躯干贴图重合，运行时同 origin、同缩放、同旋转角，不存在可错位的自由度 |
| 抽手层时混进躯干或武器像素 | 抽取前先验证两层落点（躯干要求平均色差 ≤ 1.0），不符直接失败 |
| 枪口前移导致子弹起点脱离枪管 | 枪口改为贴图内实测的枪管末端像素，并在预览图上用十字标记逐把复核落点 |
| 负重下沉让枪脱手 | 武器 y 直接读躯干的 y，人沉多少枪沉多少 |

## 6. 验收

1. `npx tsc --noEmit`：本轮触及的 9 个文件零错误。仓库另有三类先行存在的错误
   （`letterSpacing`、`PreparationScene` 的 `setDepth`、`SettingsScene` 的 `weapon6`），
   全部落在本轮未修改的文件里，非本轮引入。
2. `npx vitest run` 无法启动（`vite` 子路径 `./module-runner` 未导出），是先行存在的
   工具链问题，非本轮引入。因此几何验收走离线合成而不是单测。
3. 遮挡判据（可复算）：`TmpGenerate/assert-grip.mjs` 从 TS 源码里读**实际提交的数值**，
   对 11 把武器 × 4 名有手层的角色逐像素算三件事，全部通过：
   - `muzzleX` 与贴图最右不透明列相差 ≤ 3px，且 `boreY` 在枪口列上是不透明像素
     （枪口确实落在枪管末端）；
   - `gripX` 处枪膛线以下有像素（那里确实是握把）；
   - 握把区露在手层外面的像素占比 ≤ 15%。堡垒实测各把为
     `smg`/`gatling` 0%、`rifle` 1%、`shotgun`/`flamethrower` 4%、`ak47` 5%、
     `golden_m249` 6%、`pistol`/`m79` 8%、`rpg` 11%，最深露出 ≤ 3.7 世界像素。
4. 离线合成复核：`TmpGenerate/verify-grip.mjs` 按 `Player` 的层序与变换合成预览图，
   并用十字标记枪口。已看过 11 把武器 × 3 名角色（Kenney 躯干 + 手层、自生成守望者）
   × 0°/90°/180°：手压在握把上，机匣与枪托被躯干压住，枪口十字落在枪管末端。
5. 未做：浏览器实机截图验收（`npm run dev` + 目视/CDP）。

## 7. 遗留

1. 11 张武器贴图仍是侧视素材。真正彻底的解法是出一套俯视实机贴图，
   把现有侧视图留给 HUD、战前整备、武器库与掉落物（那些位置侧视是对的、观感也好）。
2. `gatling` / `golden_m249` / `flamethrower` 三张 GDI+ 现画贴图辨识度不足。
3. `sprite-watcher.png` 的品红描边残留。
4. 守望者是唯一的自生成实机精灵，且它的持枪侧与另外四名相反（`boreSide` 为负）。
   另外四名换成自生成素材时，应按 `CHARACTER_PORTRAIT_PROMPTS.md` §3.3 的新规格
   把拳心画到中线**下方**，五名角色的锚点符号才能统一。
