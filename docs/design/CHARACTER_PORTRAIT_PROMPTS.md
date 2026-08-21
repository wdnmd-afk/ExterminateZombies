# 角色美术生成规格与提示词总表

> 用途：五名可玩角色的战前档案立绘与关卡内实机精灵的全部生成提示词、命名与路径约定  
> 关联：`docs/execution/2026-08-18-character-art-upgrade.md`、`docs/playDesign/角色与战前整备系统.md`  
> 推进方式：**一个角色定稿后再做下一个**。守望者是母版，其余四人复用同一画风段与技术规格段。  
> 本文件是提示词与命名的唯一来源，新增或修改提示词都写在这里。

---

## 1. 两套图的用途区分

两处用途视角完全不同，**不能共用一张图**。

| | 图 A 战前档案立绘 | 图 B 关卡内实机精灵 |
| --- | --- | --- |
| 用途 | 战前整备页角色主视觉 | 战斗中的玩家角色 |
| 视角 | 完整全身，身体朝画面右前方 25° | **正俯视**（相机垂直向下），人物朝画面正右 |
| 比例 | `4:5` 竖图 | `1:1` 正方形 |
| 生成尺寸 | `1024 x 1280` 或 `1638 x 2048` | `1024 x 1024` 或 `2048 x 2048` |
| 运行显示尺寸 | 约 `188 x 230` 逻辑像素 | 源图归一到 `48 x 48`，显示约 `40 x 46` |
| 是否画武器 | 画，是造型的一部分 | **绝对不画**，武器是独立贴图 |
| 每角色张数 | 1 | 1 |

### 1.1 关卡内不需要多角度精灵图

`Player.update()` 用 `this.sprite.setRotation(this.aimAngle)` 让人物**按鼠标瞄准角连续旋转 360°**
（`src/entities/Player.ts:108`）。容器、阴影和圆形物理体都不旋转。

因此**一张朝右的正俯视图覆盖全部朝向**，做 4 向或 8 向方向图反而会与程序旋转冲突。
唯一可能需要多帧的是行走动画（当前实机是静态单图），等静态图验收后再单独评估。

### 1.2 图 B 的现实限制

实机最终只有约 `43` 像素高。`2048 x 2048` 的精细图降采样到这个尺寸后，
**面部、装备细节和纹理全部会丢失**，只剩体型轮廓和配色。

这是最终显示的像素预算问题，不应倒推成“源图也要粗糙”。图 B 仍以高分辨率和与图 A
一致的精细像素插画语言生成，材质、服装与装备要看得清，不能模糊或变成大像素色块。
同时，缩小后的个人特色仍必须靠**轮廓与配色**承载：肩宽、头顶装备形状、背挂装备和肩带颜色。

---

## 2. 资产命名与路径总表

### 2.1 你交付的原图（AI 直出，不做任何处理）

目录：`src/assets/generated/characters/`

| 角色 | 图 A 文件名 | 图 B 文件名 |
| --- | --- | --- |
| 守望者 | `portrait-watcher-raw.png` | `sprite-watcher-raw.png` |
| 鹰眼 | `portrait-eagle-eye-raw.png` | `sprite-eagle-eye-raw.png` |
| 堡垒 | `portrait-bastion-raw.png` | `sprite-bastion-raw.png` |
| 疾行者 | `portrait-runner-raw.png` | `sprite-runner-raw.png` |
| 破阵者 | `portrait-breacher-raw.png` | `sprite-breacher-raw.png` |

同目录需要一个 `SOURCE.md`，写明生成工具、模型版本、生成日期、是否使用参考图。
资产台账据此把这批图登记为「项目内生成」，也是发布前判断许可边界的依据。

### 2.2 我生成的运行时产物（抠图、去色溢、归一画幅后）

目录：`src/assets/processed/characters/`

| 角色 | 图 A 产物 | 图 B 产物 |
| --- | --- | --- |
| 守望者 | `portrait-watcher.png` | `sprite-watcher.png` |
| 鹰眼 | `portrait-eagle-eye.png` | `sprite-eagle-eye.png` |
| 堡垒 | `portrait-bastion.png` | `sprite-bastion.png` |
| 疾行者 | `portrait-runner.png` | `sprite-runner.png` |
| 破阵者 | `portrait-breacher.png` | `sprite-breacher.png` |

现有 `portrait-*.svg`（Kenney 矢量切片）保留为占位与回退，直到同名 PNG 通过验收。

### 2.3 纹理 key 与代码对应

纹理 key 已在 `src/config/characters.ts` 登记，替换图不改 key。

| 角色 ID | 图 A 纹理 key | 图 B 纹理 key |
| --- | --- | --- |
| `watcher` | `character-portrait-watcher` | `character-watcher` |
| `eagle_eye` | `character-portrait-eagle-eye` | `character-eagle-eye` |
| `bastion` | `character-portrait-bastion` | `character-bastion` |
| `runner` | `character-portrait-runner` | `character-runner` |
| `breacher` | `character-portrait-breacher` | `character-breacher` |

注意角色 ID 用下划线（`eagle_eye`），文件名用连字符（`eagle-eye`），两者不要混。

---

## 3. 通用提示词组件（参考用，不必手动拼接）

每条提示词由 `画风段 + 角色专属段 + 技术规格段` 组成。**画风段与技术规格段逐字不变**，
只替换角色专属段——这是五张图能像一套的唯一保证。

本节只解释这三段各自的作用与技术依据。**第 4 到 8 节已经给出每个角色两张图的完整提示词，
可以直接整段复制，不需要自己拼。** 修改提示词时请同时改本节与对应角色节，避免两处不一致。

### 3.1 画风段（图 A 与图 B 共用，五角色逐字相同）

```
High-resolution pixel art character portrait, detailed 2D game character illustration,
clean readable pixel clusters with deliberate dithering, limited but rich color palette,
crisp hand-placed shading, dark gritty post-apocalyptic survival game art style,
professional game asset quality, sharp silhouette readability,
```

图 B 使用同等精度的专用俯视段。它是高分辨率源图，不是先画成 `48 x 48`
再放大的粗像素稿；运行时缩小由处理脚本完成：

```
High-resolution detailed pixel art game sprite, detailed 2D game character illustration,
viewed from directly overhead at a straight 90 degree bird's eye angle looking down at
the top of the head, shoulders and body, clean readable fine pixel clusters with deliberate
dithering, limited but rich color palette, crisp hand-placed shading, controlled material
texture, strong value separation, dark gritty post-apocalyptic survival game art style,
professional game asset quality matching the full-body character portrait, sharp silhouette
readability, crisp at source resolution and suitable for clean downsampling to gameplay size,
```

### 3.2 图 A 技术规格段（五角色逐字相同）

```
full-body character portrait shown completely from head to boots, both legs, ankles, feet
and complete boots clearly visible, the entire character and weapon fully contained inside
the canvas, leave clear magenta margin above the head, below both boots and around the weapon,
do not crop the head, weapon, arms, hands, legs, ankles, feet or boots,
body angled 25 degrees toward the viewer's right, head turned slightly right,
single consistent light source from upper left, flat solid pure magenta #FF00FF
background with no gradient and no cast shadow, subject centered and filling approximately
82 percent of the frame height, natural stable standing pose with both feet on one baseline,
4:5 vertical portrait, no text, no border, no logo, no watermark, no UI, single character
```

### 3.3 图 B 技术规格段（五角色逐字相同）

> **2026-08-21 起图 B 不再手工拼提示词。** 生成、检视、后处理已脚本化：
> 机位与画幅约束的唯一来源是 `scripts/generate_character_assets.mjs` 的构图骨架，
> 角色专属措辞在 `scripts/character_asset_specs.json`。
> 本节保留作为**技术依据说明**，改约束请改那两个文件，不要只改本节。
>
> ```bash
> npm run image-api                                          # 先起本地生图代理
> node scripts/generate_character_assets.mjs watcher --version v01
> python scripts/inspect_character_candidates.py watcher --version v01   # 不过就换版本重生成
> python scripts/process_character_assets.py sprite watcher --version v01
> ```

```
character facing exactly to the right side of the frame, body perfectly centered in the
canvas, subject filling 70 to 84 percent of the canvas while fully inside the frame,
both fists closed together as if gripping a weapon, fists positioned at 80 percent of the
canvas width and 50 percent of the canvas height, no weapon, no gun, no firearm of any kind,
flat solid pure magenta #FF00FF background, no ground shadow, no cast shadow, 1:1 square,
no text, no border, no watermark, single character
```

技术依据，改动会导致运行时错位：

1. **不画武器，但必须画出握拳的双手**：11 把枪是独立贴图，绘制在人物**下层**
   （`Player.ts` 层序为 阴影 → 武器 → 躯干 → 持枪手）。自生成精灵没有独立的持枪手层，
   压住握把这件事只能靠贴图里自带的拳头完成——手画开、画平或干脆没画，
   枪就会变成「浮在人物旁边」，这正是 2026-08-21 修掉的那个缺陷。
   Kenney 素材的四名角色走另一条路：躯干取 `*_stand.png`，持枪手层由
   `scripts/process_character_hand_layers.py` 从 `*_gun.png` 抽出来单独叠在武器之上。
2. **拳心在水平 80%、垂直 50%**：与 `CharacterDef.gripAnchor` 对应。锚点有两个分量，
   分别标定不同的事，不要只盯一个：`forward` 是拳心沿瞄准方向的位置（源像素、相对画幅中心），
   `boreSide` 是持枪中线的侧向位置。
   百分比按**在用五张 Kenney 精灵**用检视脚本同一个检测器实测标定：
   水平 `0.807–0.905`、垂直 `0.510–0.515`。
   **提示词只是让模型尽量画到位，不是运行时依据**：图出来之后必须实测拳心，
   把实测值写回 `characters.ts` 的 `gripAnchor`。守望者 v03 实测为
   `{forward: 13, boreSide: -1}`——它的拳头实际画在中线**略上方**，
   锚点按图纠正而不是反过来改图。
3. **人物居中且上下对称**：人物层 origin 为 `0.5 / 0.5`，旋转轴就是图像几何中心，
   重心偏离中心会让旋转时出现甩头。
4. **不画地面阴影**：`Player` 已在人物下方画了椭圆阴影，再带一层会双重阴影。
5. **产物画幅是 `48 x 48`，主体约 `40px`**：`targetSubject` 不能提到 `44`——
   后处理复用的 `place_subject` 硬编码要求四边各留 `4px`。

### 3.3.1 机位约束：只声明角度是不够的

这是图 B 唯一真正容易报废的一项，单独列出来因为它已经发生过一次。

2026-08-18 的守望者图 B 提示词里写了 `straight 90 degree bird's eye`，模型给出的却是
**高角度斜视图**：能看到脸、鼻、下巴、大腿和一整只从侧面看的靴子。实机 `Player`
按瞄准角绕几何中心连续旋转 360°，这张图转起来读作「一具躺平的身体在打转」。
战前页不旋转，所以同一张图在那里看不出问题——这正是「立绘可以、关卡内过差」的来源。

有效的写法是三重约束，而不是声明角度：

1. **用相机的物理位置描述**：`a camera mounted on the ceiling pointing straight down`。
2. **正面枚举能看到什么**：头顶发旋、双肩顶面、拳顶面。
3. **负面枚举不能看到什么**：脸、眼、鼻、下巴、腿的正面、靴底。

同时必须**单独约束体型**，它和机位是两件事：

- 只说机位 → 模型可能把人压成一个球（v01 实测宽高比 `1.26`，躯干与前缩的腿消失）。
- 用比例数字说长度（「4 单位高比 3 单位宽」）→ 把「站着的人」这个概念带回来，
  机位退回斜视（v02 实测下三分之一质量掉到 `0.236`，腿和整只靴子又出现）。
- 有效写法是**按解剖顺序枚举轮廓**：从轮廓上缘到下缘依次是肩线与天线、头顶、
  背部 X 形黄带、腰带、臀、最下缘两只极度前缩成短桩的靴尖（v03 通过）。

### 3.3.2 验收不能靠肉眼，也不能靠几何比例

**纯几何判据拦不住斜视图**：2026-08-18 废图的质量细长比是 `1.47`，而已验收的 Kenney
`hitman1` 也是 `1.47`；宽高比同样区分不开（`0.75` 对 `0.77`）。

有判别力的是质量沿身体轴的分布与头部在主体里的相对位置——相机不在正上方时，
透视会同时把头推离主体中心、把质量堆到上半部。判据与阈值由
`scripts/inspect_character_candidates.py` 实施，标定实测见
`scripts/character_asset_specs.json` 的 `_topDownNote`：

| 判据 | 正俯视基准 | 斜视废图 | 阈值 |
| --- | --- | --- | --- |
| 下三分之一质量占比 | `0.279–0.343` | `0.163` | `>= 0.26` |
| 头部质心相对高度 | `0.489–0.515` | `0.333` | `0.42–0.58` |
| 拳心垂直位置 | `0.510–0.515` | `0.321` | `0.42–0.60` |
| 主体宽高比 | `0.74–0.87` | `1.26`（v01） | `0.62–1.02` |

阈值必须按**在用素材**标定而不是按名义值：起初按名义值 `0.80` 给的拳心水平上限
`0.88` 会把 `survivor1` 判失败，而那正是当时游戏在用的守望者精灵。
一个对在用素材报错的门控会被绕过，也就失去了门控的意义。

### 3.4 负面提示词（图 A 与图 B 共用）

```
text, letters, watermark, signature, logo, border, frame, UI, HUD, health bar,
multiple characters, crowd, cropped head, cropped feet, cropped boots, cut off limbs,
feet outside frame, body outside frame, close-up, bust portrait, waist-up portrait,
above-knee framing, half body, complex background,
environment, rubble, buildings, ground shadow, cast shadow, real military insignia,
national flags, brand logos, copyrighted characters, chibi, cute, super-deformed,
anime moe style, glossy plastic skin, power armor, sci-fi mecha, exosuit, ninja,
superhero spandex, cape, exposed muscles beefcake, sexualized pose, gore, blood spatter,
low resolution, blurry, out of focus, jpeg artifacts, extra limbs, extra fingers,
deformed hands, malformed face, asymmetrical eyes, floating limbs
```

### 3.5 负面提示词（仅图 B 追加）

```
weapon, gun, rifle, pistol, firearm, side view, isometric view, 45 degree angle,
three quarter view, visible face, tilted camera, perspective distortion,
oversized pixel blocks, exact 48 x 48 source grid, nearest-neighbor enlarged source,
low-detail placeholder sprite, soft focus, blur, Gaussian blur, motion blur,
depth of field, airbrushed shading, painterly rendering, muddied low-contrast texture,
photorealistic rendering, uncontrolled noisy fabric texture
```

### 3.6 一致性优先于比例修正

守望者旧图 A 实际直出曾出现方形画幅、人物偏左和双脚被底边切断。新母版以
“全身从头到靴子完整入画、上下左右留背景边距”为硬约束。后续四名角色必须保持同一
工具、模型、画风、光源、像素颗粒密度和构图比例；只替换角色的体型、服装、装备与标志色。

### 3.7 图 B 清晰度修订（2026-08-18）

图 B 不再要求“原生 `48 x 48` 像素网格后最近邻放大”，因为这会让原图过度粗糙、
细节丢失，与图 A 不像同一套美术。新规格要求图 B 与图 A 共享精细像素插画语言和材质质感，
但严格保留关卡内的正俯视、朝右、人物居中、不画武器、握拳的拳心锚点和无地面阴影要求。
原图以高分辨率交付，再由处理阶段生成运行时尺寸；缩小后的可读性靠强轮廓、明确色块和职业标志物保证，
不靠降低源图精度保证。

---

## 4. 守望者 Watcher

角色设定：均衡生存，105 生命，120 移速，伤害 100%，基础爆头 10%。
被动「绝境余生」——每局一次，致命伤害后保留 1 点生命并获得 1.5 秒无敌。

形象命题：**靠得住的老练城市幸存者**。不是英雄，不是重甲兵，是能带队活下来的人。
主色：警戒黄 `#FBC02D` + 深灰。俯视识别特征：**交叉的黄色反光肩带**。

### 4.1 图 A 完整提示词（可直接粘贴）

比例 `4:5`，生成尺寸 `1638 x 2048`。负面提示词用 3.4。

```
High-resolution pixel art character portrait, detailed 2D game character illustration,
clean readable pixel clusters with deliberate dithering, limited but rich color palette,
crisp hand-placed shading, dark gritty post-apocalyptic survival game art style,
professional game asset quality, sharp silhouette readability,

a weathered middle-aged male urban survivor, medium sturdy build, calm dependable
presence, short salt-and-pepper stubble beard, an old healed scar across one eyebrow,
alert watchful eyes looking off-frame to the right, light practical body armor over a
multi-pocket utility vest, hazard-yellow reflective strips across the shoulder straps,
tape-wrapped forearm guards, worn dark grey work trousers, a compact rifle held low
and steady across the chest, warning-yellow and dark grey color scheme,

full-body character portrait shown completely from head to boots, both legs, ankles, feet
and complete boots clearly visible, the entire character and weapon fully contained inside
the canvas, leave clear magenta margin above the head, below both boots and around the weapon,
do not crop the head, weapon, arms, hands, legs, ankles, feet or boots,
body angled 25 degrees toward the viewer's right, head turned slightly right,
single consistent light source from upper left, flat solid pure magenta #FF00FF
background with no gradient and no cast shadow, subject centered and filling approximately
82 percent of the frame height, natural stable standing pose with both feet on one baseline,
4:5 vertical portrait, no text, no border, no logo, no watermark, no UI, single character
```

输出文件名：`src/assets/generated/characters/portrait-watcher-raw.png`

### 4.2 图 A 旧生成结果核对（已淘汰）

原图 `portrait-watcher-raw.png` 实测：

| 项目 | 实测值 | 结论 |
| --- | --- | --- |
| 尺寸与模式 | `2048 x 2048`，RGB 无 alpha | 非 4:5，处理阶段裁切归一 |
| 背景色 | 约 `#FA03F6`，±2 噪声，全图 218572 唯一色 | 不是纯 `#FF00FF`，需容差键控而非精确匹配 |
| 主体边界 | x `425..1506`、y `64..2047`，宽高比 `0.545` | 腿和双脚在画布底边被切断，不符合新全身规格 |
| 水平位置 | 主体中心偏左 `59px` | 处理阶段裁到主体后居中 |
| 边缘洋红色溢 | 边缘像素 8350 中 3703 带洋红染色，占 `44.35%` | **需要去色溢**，否则深色 UI 上会出现紫边 |
| 角色塑造 | 中年、胡须、眉骨疤痕、黄反光肩带、缠带前臂、胸前横持步枪 | 与提示词一致，个人特色成立 |

**结论：旧图不再作为最终产物**。角色塑造与画风仍作为后续四人的参考，但守望者图 A
必须按 4.1 的新全身构图重新生成；双脚缺失无法在抠图或布局阶段修复。

### 4.3 图 B 完整提示词（可直接粘贴）

比例 `1:1`，生成尺寸 `2048 x 2048`。负面提示词用 3.4 加 3.5。

```
High-resolution detailed pixel art game sprite, detailed 2D game character illustration,
viewed from directly overhead at a straight 90 degree bird's eye angle looking down at
the top of the head, shoulders and body, clean readable fine pixel clusters with deliberate
dithering, limited but rich color palette, crisp hand-placed shading, controlled material
texture, strong value separation, dark gritty post-apocalyptic survival game art style,
professional game asset quality matching the full-body character portrait, sharp silhouette
readability, crisp at source resolution and suitable for clean downsampling to gameplay size,

a middle-aged male urban survivor seen from directly above, medium sturdy build with
clearly visible shoulder width, short dark grey hair on the crown of the head,
light body armor plate across the upper back, two hazard-yellow reflective shoulder
straps crossing over the back in an X shape, dark grey clothing, a small radio antenna
on the left shoulder, both empty hands clasped together directly in front of the body
in a two-handed grip stance holding nothing, warning-yellow and dark grey color scheme,

character facing exactly to the right side of the frame, body perfectly centered in the
canvas, subject filling 78 to 84 percent of the canvas height while fully inside the frame,
clasped hands positioned at 80 percent of the canvas width and 50 percent of the
canvas height, no weapon, no gun, no firearm of any kind, flat solid pure magenta #FF00FF
background, no ground shadow, no cast shadow, 1:1 square, no text, no border, no watermark,
single character
```

俯视识别要点：黄色肩带的 X 形交叉是守望者在 48px 下唯一的身份标记，必须清晰。
输出文件名：`src/assets/generated/characters/sprite-watcher-raw.png`

---

## 5. 鹰眼 Eagle Eye

角色设定：精准射手，85 生命，112 移速，伤害 95%，基础爆头 22%（全角色最高）。
被动「静态校准」——静止 0.6 秒后爆头率提高 10 个百分点，移动即失效。

形象命题：**靠站定换精度的冷静侦察射手**。与守望者的对比锚点：年轻/中年、瘦高/中等结实、
竖持/横持、马尾加护目镜/短发加胡须。
主色：冷青 `#8FD3FF` + 黑。俯视识别特征：**头顶后方拖出的马尾 + 冷青臂环**。

### 5.1 图 A 完整提示词（可直接粘贴）

比例 `4:5`，生成尺寸 `1638 x 2048`。负面提示词用 3.4。

```
High-resolution pixel art character portrait, detailed 2D game character illustration,
clean readable pixel clusters with deliberate dithering, limited but rich color palette,
crisp hand-placed shading, dark gritty post-apocalyptic survival game art style,
professional game asset quality, sharp silhouette readability,

a young focused female reconnaissance marksman, lean tall slender build, sharp
concentrated expression with one eye slightly narrowed, dark hair pulled back into a
tight practical ponytail, tactical goggles pushed up onto her forehead leaving the face
fully visible, a compact rangefinder clipped behind one ear, dark fitted tactical
long-sleeve top with a cool-cyan armband, fingerless shooting gloves, slim thigh holster,
minimal lightweight gear, standing perfectly still and poised, a slender long-barreled
precision rifle held upright vertically at her side, cool cyan and black color scheme,

full-body character portrait shown completely from head to boots, both legs, ankles, feet
and complete boots clearly visible, the entire character and weapon fully contained inside
the canvas, leave clear magenta margin above the head, below both boots and around the weapon,
do not crop the head, weapon, arms, hands, legs, ankles, feet or boots,
body angled 25 degrees toward the viewer's right, head turned slightly right,
single consistent light source from upper left, flat solid pure magenta #FF00FF
background with no gradient and no cast shadow, subject centered and filling approximately
82 percent of the frame height, natural stable standing pose with both feet on one baseline,
4:5 vertical portrait, no text, no border, no logo, no watermark, no UI, single character
```

输出文件名：`src/assets/generated/characters/portrait-eagle-eye-raw.png`

### 5.2 图 B 完整提示词（可直接粘贴）

比例 `1:1`，生成尺寸 `2048 x 2048`。负面提示词用 3.4 加 3.5。

```
High-resolution detailed pixel art game sprite, detailed 2D game character illustration,
viewed from directly overhead at a straight 90 degree bird's eye angle looking down at
the top of the head, shoulders and body, clean readable fine pixel clusters with deliberate
dithering, limited but rich color palette, crisp hand-placed shading, controlled material
texture, strong value separation, dark gritty post-apocalyptic survival game art style,
professional game asset quality matching the full-body character portrait, sharp silhouette
readability, crisp at source resolution and suitable for clean downsampling to gameplay size,

a young female reconnaissance marksman seen from directly above, lean narrow slender
build with noticeably narrow shoulders, dark hair pulled into a tight ponytail trailing
back behind the crown of the head, tactical goggles resting on top of the head, slim
black fitted clothing with a bright cool-cyan armband on the upper arm, a thin
rangefinder pouch on the belt, minimal lightweight gear with a clean uncluttered
silhouette, both empty hands clasped together directly in front of the body in a
two-handed grip stance holding nothing, cool cyan and black color scheme,

character facing exactly to the right side of the frame, body perfectly centered in the
canvas, subject filling 78 to 84 percent of the canvas height while fully inside the frame,
clasped hands positioned at 80 percent of the canvas width and 50 percent of the
canvas height, no weapon, no gun, no firearm of any kind, flat solid pure magenta #FF00FF
background, no ground shadow, no cast shadow, 1:1 square, no text, no border, no watermark,
single character
```

俯视识别要点：肩宽必须明显窄于守望者与堡垒；马尾是最强的头顶识别符。
输出文件名：`src/assets/generated/characters/sprite-eagle-eye-raw.png`

---

## 6. 堡垒 Bastion

角色设定：重装突破，140 生命（最高），100 移速（最低），伤害 95%，基础爆头 5%。
被动「装甲板」——来自感染体接触、投射物和特殊技能的伤害降低 15%。

形象命题：**厚重、推不动的旧防爆装备使用者**。
主色：暗红 `#D9574E` + 钢灰。俯视识别特征：**主导轮廓的巨大护肩块**。

### 6.1 图 A 完整提示词（可直接粘贴）

比例 `4:5`，生成尺寸 `1638 x 2048`。负面提示词用 3.4。

```
High-resolution pixel art character portrait, detailed 2D game character illustration,
clean readable pixel clusters with deliberate dithering, limited but rich color palette,
crisp hand-placed shading, dark gritty post-apocalyptic survival game art style,
professional game asset quality, sharp silhouette readability,

a tall heavily built male in improvised riot armor, broad thick shoulders dominating the
silhouette, buzz-cut hair and a square heavy jaw, a protective face visor flipped up
above the forehead, salvaged steel-grey armor plates over the chest with hand-painted
dark red unit numbering, oversized pauldrons, a reinforced neck collar, thick gauntlets,
a low centered heavy stance with one hand steadying the rim of a battered ballistic
shield, dark red and steel grey color scheme,

full-body character portrait shown completely from head to boots, both legs, ankles, feet
and complete boots clearly visible, the entire character and weapon fully contained inside
the canvas, leave clear magenta margin above the head, below both boots and around the weapon,
do not crop the head, weapon, arms, hands, legs, ankles, feet or boots,
body angled 25 degrees toward the viewer's right, head turned slightly right,
single consistent light source from upper left, flat solid pure magenta #FF00FF
background with no gradient and no cast shadow, subject centered and filling approximately
82 percent of the frame height, natural stable standing pose with both feet on one baseline,
4:5 vertical portrait, no text, no border, no logo, no watermark, no UI, single character
```

输出文件名：`src/assets/generated/characters/portrait-bastion-raw.png`

### 6.2 图 B 完整提示词（可直接粘贴）

比例 `1:1`，生成尺寸 `2048 x 2048`。负面提示词用 3.4 加 3.5。

```
High-resolution detailed pixel art game sprite, detailed 2D game character illustration,
viewed from directly overhead at a straight 90 degree bird's eye angle looking down at
the top of the head, shoulders and body, clean readable fine pixel clusters with deliberate
dithering, limited but rich color palette, crisp hand-placed shading, controlled material
texture, strong value separation, dark gritty post-apocalyptic survival game art style,
professional game asset quality matching the full-body character portrait, sharp silhouette
readability, crisp at source resolution and suitable for clean downsampling to gameplay size,

a tall heavily built armored male seen from directly above, extremely broad thick
shoulders forming the widest silhouette of the squad, oversized steel-grey pauldrons
dominating the shape of the body, a flipped-up visor on top of the helmet, heavy
steel-grey back armor plates with hand-painted dark red unit numbering, a reinforced
neck collar, bulky heavy build, both empty hands clasped together directly in front of
the body in a two-handed grip stance holding nothing, dark red and steel grey color scheme,

character facing exactly to the right side of the frame, body perfectly centered in the
canvas, subject filling 78 to 84 percent of the canvas height while fully inside the frame,
clasped hands positioned at 80 percent of the canvas width and 50 percent of the
canvas height, no weapon, no gun, no firearm of any kind, flat solid pure magenta #FF00FF
background, no ground shadow, no cast shadow, 1:1 square, no text, no border, no watermark,
single character
```

俯视识别要点：护肩必须夸张到让轮廓在 48px 下明显比其他四人宽。
输出文件名：`src/assets/generated/characters/sprite-bastion-raw.png`

---

## 7. 疾行者 Runner

角色设定：机动游击，85 生命，145 移速（最高），伤害 90%，基础爆头 10%。
被动「行进射击」——移动造成的额外散射惩罚降低 50%。

形象命题：**随时能起步的轻装机动者**。
主色：绿 `#65C694` + 炭黑。俯视识别特征：**绿色头巾 + 敞开外摆的炭黑短外套**。

### 7.1 图 A 完整提示词（可直接粘贴）

比例 `4:5`，生成尺寸 `1638 x 2048`。负面提示词用 3.4。

```
High-resolution pixel art character portrait, detailed 2D game character illustration,
clean readable pixel clusters with deliberate dithering, limited but rich color palette,
crisp hand-placed shading, dark gritty post-apocalyptic survival game art style,
professional game asset quality, sharp silhouette readability,

a wiry agile young runner with an athlete's lean physique, weight shifted forward onto
the front foot as if about to sprint, a quick confident half-smile, a green bandana tied
around the head with loose strands of hair escaping, an open charcoal-black short jacket
over a green moisture-wicking shirt, streamlined knee and elbow pads, thigh-strapped
magazine pouches, athletic tape wrapped around both hands, a lightweight submachine gun
held ready in one hand, green and charcoal black color scheme,

full-body character portrait shown completely from head to boots, both legs, ankles, feet
and complete boots clearly visible, the entire character and weapon fully contained inside
the canvas, leave clear magenta margin above the head, below both boots and around the weapon,
do not crop the head, weapon, arms, hands, legs, ankles, feet or boots,
body angled 25 degrees toward the viewer's right, head turned slightly right,
single consistent light source from upper left, flat solid pure magenta #FF00FF
background with no gradient and no cast shadow, subject centered and filling approximately
82 percent of the frame height, natural stable standing pose with both feet on one baseline,
4:5 vertical portrait, no text, no border, no logo, no watermark, no UI, single character
```

输出文件名：`src/assets/generated/characters/portrait-runner-raw.png`

### 7.2 图 B 完整提示词（可直接粘贴）

比例 `1:1`，生成尺寸 `2048 x 2048`。负面提示词用 3.4 加 3.5。

```
High-resolution detailed pixel art game sprite, detailed 2D game character illustration,
viewed from directly overhead at a straight 90 degree bird's eye angle looking down at
the top of the head, shoulders and body, clean readable fine pixel clusters with deliberate
dithering, limited but rich color palette, crisp hand-placed shading, controlled material
texture, strong value separation, dark gritty post-apocalyptic survival game art style,
professional game asset quality matching the full-body character portrait, sharp silhouette
readability, crisp at source resolution and suitable for clean downsampling to gameplay size,

a wiry agile young runner seen from directly above, lean athletic build with a compact
narrow frame, a bright green bandana covering the crown of the head, an open
charcoal-black short jacket with the hem flaring outward from motion, a green shirt
visible down the centre of the back, streamlined shoulder and elbow pads, a light
uncluttered silhouette, both empty hands clasped together directly in front of the body
in a two-handed grip stance holding nothing, green and charcoal black color scheme,

character facing exactly to the right side of the frame, body perfectly centered in the
canvas, subject filling 78 to 84 percent of the canvas height while fully inside the frame,
clasped hands positioned at 80 percent of the canvas width and 50 percent of the
canvas height, no weapon, no gun, no firearm of any kind, flat solid pure magenta #FF00FF
background, no ground shadow, no cast shadow, 1:1 square, no text, no border, no watermark,
single character
```

俯视识别要点：绿头巾是头顶唯一亮色；外套下摆外翻能在静态图里暗示速度感。
输出文件名：`src/assets/generated/characters/sprite-runner-raw.png`

---

## 8. 破阵者 Breacher

角色设定：高风险火力，80 生命（最低），115 移速，伤害 120%（最高），基础爆头 8%。
被动「末段火力」——弹匣剩余 25% 或更少时，武器伤害提高 15%。

形象命题：**拿命换输出的高风险突击手**。
主色：焦橙 `#FF8A4C` + 深褐。俯视识别特征：**斜跨背部的撬棍 + 焦橙喷漆标记**。

### 8.1 图 A 完整提示词（可直接粘贴）

比例 `4:5`，生成尺寸 `1638 x 2048`。负面提示词用 3.4。

```
High-resolution pixel art character portrait, detailed 2D game character illustration,
clean readable pixel clusters with deliberate dithering, limited but rich color palette,
crisp hand-placed shading, dark gritty post-apocalyptic survival game art style,
professional game asset quality, sharp silhouette readability,

an aggressive muscular middle-aged male assault breacher, a powerful compact frame fully
covered by gear, a soot-smudged face with clenched teeth in a grim aggressive grin,
scratched scorched goggles worn over the eyes, heavily worn dark brown protective gear,
crossed ammunition bandoliers over the chest, a breaching crowbar and demolition charges
strapped diagonally across his back, burnt-orange spray-painted markings and scuffed
reflective tape on the armor, a forward-pressing combat-ready posture with a
short-barreled shotgun, burnt orange and dark brown color scheme,

full-body character portrait shown completely from head to boots, both legs, ankles, feet
and complete boots clearly visible, the entire character and weapon fully contained inside
the canvas, leave clear magenta margin above the head, below both boots and around the weapon,
do not crop the head, weapon, arms, hands, legs, ankles, feet or boots,
body angled 25 degrees toward the viewer's right, head turned slightly right,
single consistent light source from upper left, flat solid pure magenta #FF00FF
background with no gradient and no cast shadow, subject centered and filling approximately
82 percent of the frame height, natural stable standing pose with both feet on one baseline,
4:5 vertical portrait, no text, no border, no logo, no watermark, no UI, single character
```

输出文件名：`src/assets/generated/characters/portrait-breacher-raw.png`

### 8.2 图 B 完整提示词（可直接粘贴）

比例 `1:1`，生成尺寸 `2048 x 2048`。负面提示词用 3.4 加 3.5。

```
High-resolution detailed pixel art game sprite, detailed 2D game character illustration,
viewed from directly overhead at a straight 90 degree bird's eye angle looking down at
the top of the head, shoulders and body, clean readable fine pixel clusters with deliberate
dithering, limited but rich color palette, crisp hand-placed shading, controlled material
texture, strong value separation, dark gritty post-apocalyptic survival game art style,
professional game asset quality matching the full-body character portrait, sharp silhouette
readability, crisp at source resolution and suitable for clean downsampling to gameplay size,

an aggressive muscular male assault breacher seen from directly above, a powerful compact
thickset build, a dark brown hood or cap covering the crown of the head, a heavy iron
breaching crowbar strapped diagonally across the upper back, blocky demolition charge
pouches on the back, dark brown protective gear with bold burnt-orange spray-painted
markings, crossed ammunition bandoliers visible over the shoulders, both empty hands
clasped together directly in front of the body in a two-handed grip stance holding
nothing, burnt orange and dark brown color scheme,

character facing exactly to the right side of the frame, body perfectly centered in the
canvas, subject filling 78 to 84 percent of the canvas height while fully inside the frame,
clasped hands positioned at 80 percent of the canvas width and 50 percent of the
canvas height, no weapon, no gun, no firearm of any kind, flat solid pure magenta #FF00FF
background, no ground shadow, no cast shadow, 1:1 square, no text, no border, no watermark,
single character
```

俯视识别要点：斜跨背部的撬棍是一条明确的对角线，是 48px 下最可靠的身份标记。
注意撬棍是**背在背上的装备**，不是手持武器，不违反「不画武器」。
输出文件名：`src/assets/generated/characters/sprite-breacher-raw.png`

---

## 9. 生成工具要点

| 工具 | 要点 |
| --- | --- |
| Midjourney | 图 A 加 `--ar 4:5 --style raw`，图 B 加 `--ar 1:1 --style raw`；记下守望者的 `--seed`，后续全部复用，并用 `--sref` 指向守望者定稿锁风格 |
| Stable Diffusion / ComfyUI | 固定 seed、采样器、步数、CFG、checkpoint 与 LoRA；像素艺术 LoRA 对两张图都有帮助 |
| DALL·E / GPT 图像 | 无 seed，改为上传守望者定稿作为参考图，要求「同一画风、同一机位、同一光源，只换角色」 |
| 即梦 / 通义万相 / 可灵 | 提示词保留英文，中文补充「4:5 竖图 / 1:1 方图、纯洋红背景、不要文字水印」；用参考图或风格保持功能锁母版 |

## 10. 验收清单

### 10.1 图 A

1. 人物从头到靴子完整入画，头、手、武器、双腿、脚踝、双脚和完整靴子均未被裁切。
2. 背景是均匀洋红，无渐变、无杂色块、无投影。允许轻微色偏与噪声，处理阶段用容差键控。
3. 手指数量、眼睛对称、肢体数量正常。
4. 没有现实军队徽标、品牌 logo、可识别的版权角色特征。
5. 身体确实朝画面右前方，不是正面平视。
6. 主体约占画布高度 82%，头顶、双脚下方、身体两侧和武器外缘都有明确背景留白。
7. 与守望者新母版并排看：画风、全身构图、机位、光源方向、像素颗粒密度是否一致。

### 10.2 图 B

1. 是**正俯视**（能看到头顶，看不到脸），不是斜 45°。
2. **画面里没有任何手持武器**。背挂装备（撬棍、炸药包）不算武器。
3. 人物朝画面正右方。
4. 双手并拢在身体正前方，位置接近画布水平 80%。
5. 人物在画布内居中、上下对称。
6. 高分辨率原图与对应图 A 的像素颗粒密度、材质细节、配色和光影语言一致，不模糊、不是粗糙大像素稿。
7. 缩到 48px 高预览时，该角色的俯视识别特征仍然可辨（见各角色节末尾）。
8. 五张图并排缩到 48px：肩宽差异是否明显？只靠颜色区分说明轮廓差异不够。

## 11. 落地流程与分工

### 11.1 你做的

1. 按第 3 节拼接提示词生成，按 2.1 的文件名放入 `src/assets/generated/characters/`。
2. 补 `SOURCE.md`：生成工具、模型版本、生成日期、是否使用参考图。
3. 按第 10 节自查，不合格的重新生成比后期修补便宜。

### 11.2 我做的

图 A：容差键控抠图、去色溢、边缘收缩、裁到主体后按统一规则归一画幅与基线，
输出 2.2 的 `portrait-*.png`；`PreloadScene` 从 `load.svg` 改回 `load.image`。

图 B：抠图去色溢后按主体居中到正方形画布、降采样到 `48 x 48`、复核旋转中心与拳心落点，
把实测拳心写回 `characters.ts` 的 `CharacterDef.gripAnchor` 重新对齐枪械。
`WEAPON_GAMEPLAY_VISUALS` 是每把枪自己的标定点，与角色无关，不要为了对齐某个角色去改它。
触及枪口锚点前会先说明影响范围。

两者共用一个处理脚本 `scripts/process_character_assets.py`（现有 Kenney 矢量切片逻辑保留），
新增 `npm run assets:characters` 已可调用。

### 11.3 进度

| 角色 | 图 A 生成 | 图 A 落地 | 图 B 生成 | 图 B 落地 |
| --- | --- | --- | --- | --- |
| 守望者 | 旧图缺脚已淘汰，新提示词待重生成 | 待新图交付 | **v03 已采用**（v01 球体、v02 退回斜视，均被门控拦下） | **已落地，待实景复核** |
| 鹰眼 | 提示词已交付 | — | 提示词已交付 | — |
| 堡垒 | 提示词已交付 | — | 提示词已交付 | — |
| 疾行者 | 提示词已交付 | — | 提示词已交付 | — |
| 破阵者 | 提示词已交付 | — | 提示词已交付 | — |

