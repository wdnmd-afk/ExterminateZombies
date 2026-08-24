# 其余四名英雄的关卡内实机精灵（图 B）补齐

> 日期：2026-08-22
> 关联：`docs/design/CHARACTER_PORTRAIT_PROMPTS.md` §11.3、`2026-08-21-watcher-gameplay-sprite-rework.md`、
> `src/assets/generated/characters/SOURCE.md`
> 后续：图 A 战前档案立绘的补齐见 `2026-08-23-remaining-heroes-portraits.md`

## 目标

守望者的图 B 在 2026-08-21 重做并落地（v03）之后，其余四人仍在用 Kenney 的
`*_stand.png` 位图加单独抽出的持枪手层。本轮把鹰眼、堡垒、疾行者、破阵者四人
也换成项目自生成的 48x48 正俯视精灵，五人形态统一。

管线沿用守望者那一轮建立的三段：

```bash
npm run image-api                                                     # 先起本地生图代理
node scripts/generate_character_assets.mjs <id> --version vNN          # 生成候选
python scripts/inspect_character_candidates.py <id> --version vNN      # 量化门控，不过就换版本重生成
python scripts/process_character_assets.py sprite <id> --version vNN   # 采用 + 后处理 + 量取拳心
```

角色专属措辞在 `scripts/character_asset_specs.json`，构图骨架在生成脚本里。

## 采用结果

| 角色 | 采用版本 | 被拦下的版本与实测原因 |
| --- | --- | --- |
| 鹰眼 | **v01** | 无，一版通过 |
| 堡垒 | **v05** | v01 朝下、v02 过宽、v03 过窄、v04 朝下 |
| 疾行者 | **v02** | v01 下三分之一质量不足 |
| 破阵者 | **v02** | v01 宽高比 `1.34`；v03 试图恢复撬棍对角线但朝向回退，未采用 |

废版不归档（留在 gitignored 的 `TmpGenerate/`）。采用版本可一条命令复核：

```bash
python scripts/inspect_character_candidates.py <id> --from-archive
python scripts/process_character_assets.py sprite <id> --from-archive
```

## 本轮新增的两条门控判据

守望者那一轮的门控有两个盲区，都是被本轮的废图逼出来的。两条判据的完整标定实测与
阈值理由写在 `scripts/character_asset_specs.json` 的 `_aspectNote` 与 `_facingNote`，
这里只记它们为什么必须存在。

### 1. 朝向判据（`facingGapMin`，由堡垒 v01 逼出）

**这是此前门控最大的一个盲区：完全没有朝向判据。** 堡垒 v01 机位、体型、留边、
连通域、拳心五项全过，但人物朝的是画面**下方**而不是右方——护肩左右完全对称
（左右镜像 IoU `0.986`）、头盔居中、双拳并在正下方、靴子在最下缘。

运行时 `Player` 按 `setRotation(aimAngle)` 旋转，前提是贴图朝右；朝下的贴图会恒定
偏 90°，人物永远侧着身子走路和瞄准。这个缺陷与 2026-08-18 那张斜视废图属于同一类：
提示词写了、模型没遵守、而当时没有任何一条判据能读出来。

**几何前缘带量法抓不住它**，这一点必须记住：左右对称图形的最右侧窄带质心必然落在
中间高度，所以堡垒 v01 的前缘拳心读作 `0.895 / 0.455`，一个完美的「对齐」。

判据取「上下镜像对称度 − 左右镜像对称度」，判别力在**正负号**上：

| | 实测落差 |
| --- | --- |
| 朝右正确（Kenney 五张 + 守望者产物 + 鹰眼 v01 + 疾行者 v01） | `+0.125 ~ +0.480` |
| 朝下错误（堡垒 v01，及其身份参考图） | `−0.127 / −0.128` |

阈值取 `0.06`，落在那条 `0.25` 宽空带的中间。

### 2. 主体宽高比判据（`aspectMin` / `aspectMax`）

守望者 v01 暴露的是另一个侧面：机位判据管的是「相机在哪」，管不了「身体有没有长度」。
那张图机位完全正确（下三分之一 `0.343`、头部质心 `0.534`）但宽高比 `1.26`——人物被
画成一个球。本轮破阵者 v01（`1.34`）与堡垒 v02（`1.07`）都由这条拦下。

区间 `0.62–1.02` 按在用五张 Kenney 精灵实测的 `0.74–0.84` 两侧各留约 `0.15`。
**上限刻意不压到 1.0 以下**：真正的 90° 俯视看直立的人，身体沿视线方向被前缩，
接近 `1.0` 是合理的；Kenney 偏瘦长是那套素材的风格取向，不是俯视的物理必然。
拦的是「球」，不是「不够瘦长」。

## 提示词侧的对应改动

三处改动都写在 `generate_character_assets.mjs` 的 `ORIENTATION` 段与各角色的
`topDownEmphasis`，理由记在那里，这里只列改了什么：

1. **体轴方向、拳头收拢程度、左右不对称三件事分开写。** 只说「朝右」会让体格越壮的
   角色越容易被画成横躺的椭圆；而堡垒 v02 为了朝右把手臂完全伸直，宽度又顶穿宽高比。
2. **措辞里不带比例数字。** 守望者 v02 写了「4 单位高比 3 单位宽」，把「站着的人」
   这个概念带回来，机位直接退回斜视。有效写法是按解剖顺序枚举轮廓。
3. **破阵者摘掉 `BASE_NEGATIVE` 的 `weapon`。** `weapon` 与「背上绑一根铁撬棍」是
   自相矛盾的指令，会把他唯一可靠的身份标记抹掉。摘掉后用 `held weapon`、
   `weapon in the hands` 精确补回，`gun / rifle / pistol / firearm` 全部留在原表里
   没动——这是改写而不是放开。

## 落地与拳心锚点

四人的产物都是 `48x48` RGBA、主体约 `35x40`、洋红残留 0，与守望者同规格。
`gripAnchor` 按各自产物用 `process_character_assets.py grip <id>` 实测后写回
`src/config/characters.ts`：

| 角色 | `gripAnchor` | 量法说明 |
| --- | --- | --- |
| 鹰眼 | `{ forward: 12.5, boreSide: 0 }` | 实测 `12.36 / -0.09`。戴黑色射击手套，皮肤仅占主体 1%，取几何法 |
| 堡垒 | `{ forward: 12, boreSide: -0.5 }` | 实测 `12.18 / -0.49`。**必须取几何法**——厚手甲无裸露皮肤，皮肤判据命中暖褐色皮带（假阳性），质心偏到 `5.50 / -6.50` |
| 疾行者 | `{ forward: 11, boreSide: -2.5 }` | 实测 `11.07 / -2.61`。皮肤色交叉校验 `10.88 / -3.25`，两法相差 0.6px 内 |
| 破阵者 | `{ forward: 12, boreSide: -0.5 }` | 实测 `12.24 / -0.70`。**必须取几何法**——两条上臂裸露，皮肤簇同时包含上下两条手臂，质心被拉到 `-12.00` |

四人的 `handTextureKey` 全部改为 `null`：自生成精灵自带并拢的双拳，再叠一层
Kenney 手层会出现两双手。`spriteScale` 全部取 `GENERATED_SPRITE_SCALE`（1.15），
让 48px 画幅内约 40px 的主体得到与 Kenney `43px x 1.08 ≈ 46` 相当的逻辑尺寸。

`CHARACTER_HAND_TEXTURE_KEYS` 与 `processed/characters/hand-*.png` 保留但不再加载，
`PreloadScene` 已停止 `load.image` 它们。

## 拳心判据在本轮的降级

原先的皮肤色拳心判据（`fistX*` / `fistY*`）在本轮从**硬判据降为只作提示**，
换成颜色无关的几何前缘带法（`gripX*` / `gripY*`）。三条实测理由记在
`character_asset_specs.json` 的 `_gripNote` 与 `_fistNote`，要点：

1. 那组阈值是按**孤立的持枪手层**标定的，用在整张精灵上会把在用素材判失败
   （`--calibrate` 实测 survivor1 `x=0.615`、manBrown `0.779`，均低于下限 `0.78`）。
2. 五名角色里三名戴手套或全副装具：堡垒厚手甲与破阵者全装具检不出皮肤，鹰眼黑色
   射击手套只露指缝一小片（v01 皮肤仅占主体 `0.35%`），质心被拉到 `x=0.958` 误判失败
   ——而那张图的机位、体型、留边、连通域全部合格。
3. 判别力没有损失：2026-08-18 斜视废图的几何 `y=0.336` 同样被拦下。

**一个对在用素材报错的门控会被绕过，也就失去了门控的意义**——这条教训在本仓库
已经出现三次（`_fistNote`、`_gripNote`，以及图 A 的宽高比降级），值得单独记住。

## 门控自检

阈值改动后可一条命令重跑双向验证，不依赖任何临时文件：

```bash
python scripts/inspect_character_candidates.py --calibrate
```

在用五张 Kenney 精灵与已验收的守望者产物应放行，2026-08-18 的斜视废图应拦下。

## 遗留

1. **五人图 B 均未做实景复核。** 门控证明的是机位、拳心与画幅合规，不能替代在游戏里
   转满 360° 确认观感。§11.3 的进度表把这一项记为「已落地，待实景复核」。
2. 行走动画仍未评估：当前实机是静态单图（`Player` 只旋转不换帧）。
