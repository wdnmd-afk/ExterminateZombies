# 感染体美术生成规格与提示词总表

> 为当前 14 类普通感染体与 4 类 Boss 重新建立统一的真正僵尸视觉母版。
> 目标是腐烂、尸变、非人化姿态和清晰战斗轮廓，不再生成普通人、玩具或彩色圆形敌人。
> 第一阶段每类只生成一张正俯视基准图；风格验收后再扩展四方向和动画帧。

## 1. 统一运行约束

- 正俯视 90 度，能看到头顶、肩膀和身体轮廓；基准方向朝画面右侧。
- `1:1` 方图，主体完整入画，头、手、脚和身体不能裁切。
- 纯洋红 `#FF00FF` 背景，无地面、投影、场景、文字和水印。
- 使用高分辨率精细像素插画，不要先画成 `48 x 48` 再放大；运行时再处理缩小。
- 普通感染体最终显示约 `28-48px` 高，重装/精英约 `48-64px`，Boss 约 `68-96px`。
- 轮廓、体型、姿态和危险部位必须在缩小后仍能区分，不能只靠颜色换皮。

## 2. 通用画风段

每条提示词都以此段开头，再接专属段和技术规格段：

```text
High-resolution detailed pixel art zombie character sprite, detailed 2D game asset,
clean readable pixel clusters with deliberate dithering, crisp hand-placed shading,
limited but rich dirty color palette, strong value separation, controlled material texture,
dark gritty post-apocalyptic survival horror game art, professional production sprite quality,
sharp silhouette readability, anatomically disturbing but believable undead anatomy,
rotting skin, torn flesh, exposed wounds, dead cloudy eyes, broken posture,
clearly visible hands and feet, no cute cartoon expression, no clean living human appearance,
no smooth 3D render, no blurry painterly texture,
```

通用技术规格段：

```text
single isolated character viewed from directly overhead at a straight 90 degree bird's eye
angle, character facing exactly to the right side of the frame, body centered and fully inside
the square canvas, head, limbs, hands and feet never cropped, subject filling 72 to 84 percent
of the canvas height, flat solid pure magenta #FF00FF background, no gradient, no ground,
no cast shadow, no environment, no text, no border, no logo, no watermark, single character
```

通用负面提示词：

```text
human survivor, healthy skin, clean clothes, military soldier, police uniform, hero pose,
zombie mascot, cute, chibi, cartoon, toy, rubber skin, skeleton-only, vampire, demon horns,
alien, robot, cyborg, fantasy armor, sci-fi armor, weapon, gun, rifle, pistol, vehicle,
multiple characters, crowd, duplicate limbs, extra arms, extra legs, malformed hands,
cropped head, cropped feet, cut off limbs, body outside frame, side view, isometric view,
45 degree view, visible horizon, perspective distortion, ground shadow, cast shadow,
environment, buildings, rubble, fog, particles, text, logo, watermark, low resolution,
blurry, soft focus, motion blur, smooth gradient, airbrush, photorealistic 3D render
```

## 3. 普通感染体专属段

将以下段落接在通用画风段之后，再接通用技术规格段。

| ID | 专属提示词 |
| --- | --- |
| `walker` 普通 | `an emaciated recently turned adult corpse, grey-green decomposing skin, slack jaw, cloudy white eyes, torn everyday shirt and trousers, dried blood around the mouth, one shoulder hanging lower, thin arms reaching forward, slow shambling zombie silhouette` |
| `runner` 快速 | `a fresh feral zombie with a lean athletic corpse, stretched tendons, elongated forearms, ragged hoodie and torn running shoes, predatory open mouth, body pitched forward in a spring-loaded sprinting posture` |
| `tank` 坦克 | `a massive bloated undead brute, extremely wide shoulders and thick torso, swollen grey-green skin split across the back, filthy heavy work jacket fused with grime, oversized hands and knees, dense slow silhouette` |
| `bomber` 爆炸 | `a diseased corpse with a distended unstable abdomen, translucent swollen flesh, orange-red infection sacs visible through torn skin, cracked ribs and leaking fluid, arms held away from the body, volatile suicide-zombie silhouette, no explosion in the base sprite` |
| `lurker` 裂颅 | `a hunched long-armed zombie with its skull split open along the crown, exposed dark infected tissue, narrow torso, long reaching fingers, torn medical coat, unsettling cracked-head silhouette for a ranged attacker` |
| `drifter` 苍白行者 | `a corpse drained almost completely pale, waxy blue-white skin, sunken cheeks, sparse white hair, loose hospital gown and trailing bandages, thin elongated limbs, cold empty silhouette` |
| `feral` 狂乱者 | `a starved animalistic zombie with exposed ribs, long dirty claws, torn jaw muscles, matted hair, shredded clothing, limbs folded into a low spring-loaded crouch, arched spine, compact violent silhouette` |
| `bloodied` 血污屠夫 | `a heavy butcher-like undead corpse covered in dried blood, thick forearms, torn apron-like work clothes, butcher scars and missing skin, swollen eye, large hunched shoulders, bulky melee-threat silhouette, no weapon` |
| `headless` 无头 | `an upright headless corpse with the neck torn open, exposed cervical spine and ragged flesh, long rigid arms, stained coat and heavy boots, missing head as the primary silhouette, no replacement face or floating head` |
| `rotting` 腐烂 | `a severely decomposed corpse with sagging green-brown skin, visible ribs and joint bones, large rot patches, hanging strips of flesh, torn raincoat, one swollen infected arm, older and more decayed than a walker` |
| `bloater` 肿胀者 | `a gigantic corpse swollen by gas and decomposition, round distended abdomen, stretched skin with purple veins and leaking pustules, tiny head buried between huge shoulders, short legs under the weight, biological-bomb silhouette` |
| `crawler` 伏地 | `a low crawling corpse moving on both hands and knees, twisted torso, raw elbows and knees, head lifted with cloudy eyes and broken teeth, elongated fingers splayed forward, compact low silhouette` |
| `stalker` 俯行猎手 | `a predatory quadrupedal infected corpse, raised shoulders and hips, long arms reaching farther than the legs, narrow skull, torn dark coat, compressed stalking crouch, bent-spine silhouette` |
| `oddity` 畸变 | `a grotesquely asymmetrical mutant corpse with one oversized shoulder, one arm split into two partial forearms, irregular rib cage, stretched skin and mismatched swollen joints, biological asymmetrical silhouette, no fantasy horns` |

## 4. Boss 专属段

Boss 源图建议使用 `2048 x 2048`，运行时按 `68-96px` 高度归一；必须是真实生物感染体，不能是机甲或奇幻恶魔。

| ID | 专属提示词 |
| --- | --- |
| `tank_boss` 巨型坦克 | `a colossal armored crawler zombie, enormous decayed torso carried by four thick infected limbs, natural keratin plates and torn industrial padding fused into flesh, recessed head, exposed tendons, broad claws, heavy asymmetrical biological silhouette, no machine parts` |
| `bomber_boss` 爆破者 | `a huge unstable siege zombie with a split swollen torso, multiple translucent infection sacs, open abdominal cavities glowing with sick orange bacteria, long bracing arms, thick legs, leaking biological fluid, organic flesh only` |
| `hunter_boss` 猩红猎杀者 | `a giant scorpion-like hunting zombie, elongated segmented infected body, four powerful legs, oversized grasping forelimbs, long curved organic tail with swollen venom sac, dark red scar tissue and pale bone plates, no mechanical parts` |
| `matriarch_boss` 腐化母体 | `a gigantic matriarch zombie with a broad swollen torso, multiple fused limbs buried under rotting flesh, cracked rib cage protecting a pulsing infected core, long dragging arms, dark red vascular growths, grotesque believable anatomy, no fantasy tentacles` |

## 5. 生成与验收

1. 先生成 `walker`、`runner`、`tank`、`bomber` 四张基准图，确认同一画风和尺寸。
2. 通过后再生成其余普通感染体，最后生成四个 Boss，避免批量生成造成风格漂移。
3. 每张图必须能在正俯视下看到完整轮廓，脚、手和头部不能出画。
4. 图中不能有枪械、爆炸、投射物、地面阴影或场景背景；这些由游戏运行时绘制。
5. 原图放入 `src/assets/generated/zombies/`，产物放入 `src/assets/processed/zombies/`，并保留 `SOURCE.md`。
6. 先验收静态基准图，再扩展四方向行走、攻击和死亡帧，最后替换 `PreloadScene` 当前来源。

## 6. 可单独复制的完整提示词

以下每一段都是独立提示词，不需要再拼接第 2、3 节。每次只复制一个代码块。

### 6.1 Walker 普通感染体

```text
High-resolution detailed pixel art zombie sprite, a recently turned emaciated adult corpse with grey-green decomposing skin, slack jaw, cloudy white eyes, torn everyday shirt and trousers, dried blood around the mouth, one shoulder hanging lower, thin arms reaching forward, slow shambling posture. Dark gritty post-apocalyptic survival horror art, crisp hand-placed pixel shading, readable fine pixel clusters, strong silhouette. Direct 90-degree top-down bird's-eye view, facing exactly right, complete body inside a 1:1 square, head hands and feet fully visible, subject 78% of canvas height, flat pure magenta #FF00FF background, no ground or shadow, no text or watermark, no weapon. Avoid human survivor, clean skin, soldier, cute cartoon, chibi, robot, armor, extra limbs, cropped body, blurry, soft focus, 3D render.
```

### 6.2 Runner 快速感染体

```text
High-resolution detailed pixel art zombie sprite, a fresh feral runner zombie with a lean athletic corpse, stretched tendons, elongated forearms, ragged hoodie, torn running shoes, predatory open mouth, head thrust forward and body pitched into a spring-loaded sprint. Dark gritty post-apocalyptic survival horror art, crisp hand-placed pixel shading, readable fine pixel clusters, strong silhouette. Direct 90-degree top-down bird's-eye view, facing exactly right, complete body inside a 1:1 square, limbs fully visible, subject 80% of canvas height, flat pure magenta #FF00FF background, no ground or shadow, no text or watermark, no weapon. Avoid healthy athlete, superhero, cute cartoon, robot, armor, extra limbs, cropped feet, blurry, soft focus, 3D render.
```

### 6.3 Tank 坦克感染体

```text
High-resolution detailed pixel art zombie sprite, a massive bloated undead brute with extremely wide shoulders, thick torso, swollen grey-green skin split across the back, filthy heavy work jacket fused with grime, oversized hands and knees, dense slow posture and a heavy durable silhouette. Dark gritty post-apocalyptic survival horror art, crisp hand-placed pixel shading, readable fine pixel clusters, strong value separation. Direct 90-degree top-down bird's-eye view, facing exactly right, complete body inside a 1:1 square, head hands and feet fully visible, subject 82% of canvas height, flat pure magenta #FF00FF background, no ground or shadow, no text or watermark, no weapon. Avoid armored soldier, superhero, robot, mecha, cute cartoon, extra limbs, cropped body, blurry, 3D render.
```

### 6.4 Bomber 爆炸感染体

> 2026-08-20 实测：本段原文措辞（阶梯 0）在 `gpt-image-2-vip` 下五张请求全部一次通过，
> 零次被内容审核拦截（含 `suicide zombie` 字样）。
> 生成与后处理见 `docs/execution/2026-08-20-bomber-art-resource-rework.md`。
>
> 两处必须叠加的约束：
>
> 1. 橙红感染囊必须压向**橙/琥珀色**，不能出现粉色或品红高光。偏粉高光会命中洋红键控判据
>    被抠成透明洞，而感染囊正是本类的核心识别特征。实测按此生成后，主体内部透明洞最差仅 `0.031%`。
> 2. 侧向（left）是本类最容易画错的一张。圆胖体型天生左右对称，模型会把侧向画回近似正面：
>    v01 的 left 自镜像对称度 `0.535`（瘦削体型上限 `0.45`）。补强措辞反而更差（v02 升到 `0.716`），
>    最终采用 v01，并改用体型无关的判据收尾，见 `WALKER_SPRITE_PIPELINE.md` 第 8 节第 4 条。

```text
High-resolution detailed pixel art zombie sprite, a diseased suicide zombie with a distended unstable abdomen, translucent swollen flesh, orange-red infection sacs visible through torn skin, cracked ribs, leaking fluid and arms held away from the body as if containing pressure. Dark gritty post-apocalyptic survival horror art, crisp detailed pixel clusters, strong readable volatile silhouette. Direct 90-degree top-down bird's-eye view, facing exactly right, complete body inside a 1:1 square, flat pure magenta #FF00FF background, no ground or shadow, no text or watermark, no weapon and no explosion in the base sprite. Avoid bomb suit, machine, fireball, cute cartoon, extra limbs, cropped body, blurry, 3D render.
```

### 6.5 Lurker 裂颅感染体

> 2026-08-20 实测：本段原文措辞（阶梯 0）在 `gpt-image-2-vip` 下五张请求全部一次通过，
> 零次被内容审核拦截。生成与后处理见 `docs/execution/2026-08-20-lurker-art-resource-rework.md`。
>
> 一处必须叠加的约束：颅内暴露组织必须压向暗红褐/近黑，**不能是粉色或洋红**。
> 偏粉高光会命中洋红键控判据被抠成透明洞，而颅顶正是本类唯一的识别特征。

```text
High-resolution detailed pixel art zombie sprite, a hunched long-armed ranged zombie with its skull split open along the crown, exposed dark infected tissue, narrow torso, long reaching fingers and a torn medical coat, unsettling cracked-head silhouette. Dark gritty post-apocalyptic survival horror art, crisp hand-placed shading, readable fine pixel clusters, disturbing believable anatomy. Direct 90-degree top-down bird's-eye view, facing exactly right, complete body inside a 1:1 square, head hands and feet fully visible, flat pure magenta #FF00FF background, no ground or shadow, no text or watermark, no weapon or projectile. Avoid alien, fantasy monster, robot, extra heads, cropped body, blurry, 3D render.
```

### 6.6 Drifter 苍白行者

> 2026-08-20 实测：本段原文措辞（阶梯 0）在 `gpt-image-2-vip` 下六张请求全部一次通过，
> 零次被内容审核拦截。生成与后处理见 `docs/execution/2026-08-20-drifter-art-resource-rework.md`。
>
> 两处必须叠加的约束：
>
> 1. 惨白皮肤的阴影必须压向**冷蓝灰/青灰**，不能是淡紫或薰衣草色。这与 Bomber 的感染囊、
>    Lurker 的颅内组织同源但成因相反：前两者是饱和暖色被误判，本类是阴影被画成紫调。
>    淡紫 `(210,170,220)` 会算出 `floor=210`、`chroma=40`、`|r-b|=10`，三条键控判据全部命中，
>    被当成背景抠掉。而惨白尸体的阴影在美术上最常见的画法恰好就是淡紫，属高发风险。
> 2. 垂落绷带必须**贴身、短、且与手臂相连**。与主体断开的绷带段会被检视脚本算成额外
>    连通域（误报"一格里画了多个角色"），过长的绷带会撑大主体外接框，让共用缩放系数
>    被一条绷带绑架。
>
> 另有一处通用管线修正由本轮触发：瘦长体型的背面视图是四张里最高的一张，v01 的 `up`
> 四帧主体高达帧高 94% 且四边贴死。根因是共用骨架从未要求 2×2 每格四周留边，已在
> `scripts/generate_zombie_assets.mjs` 的 `GRID` 段补上，对后续所有感染体生效。

```text
High-resolution detailed pixel art zombie sprite, a corpse drained almost completely pale with waxy blue-white skin, sunken cheeks, sparse white hair, loose hospital gown, trailing bandages and thin elongated limbs, a cold empty slow-moving silhouette. Dark gritty post-apocalyptic survival horror art, crisp detailed pixel clusters, controlled fabric texture and strong value separation. Direct 90-degree top-down bird's-eye view, facing exactly right, complete body inside a 1:1 square, flat pure magenta #FF00FF background, no ground or shadow, no text or watermark, no weapon. Avoid ghost, skeleton, angel, clean patient, cute cartoon, extra limbs, blurry, 3D render.
```

### 6.7 Feral 狂乱者

> 2026-08-20 实测：本段原文措辞（阶梯 0）在 `gpt-image-2-vip` 下七次请求全部一次通过，
> 零次被内容审核拦截。生成与后处理见 `docs/execution/2026-08-20-feral-art-resource-rework.md`。
>
> 两处必须叠加的约束：
>
> 1. 裸露血肉（肋骨间隙、撕裂下颌）必须压向**暗红褐/干涸血色**，不能是亮粉或洋红。
>    本类的裸露面是全部感染体中最大的。亮粉肌肉 `(235,150,190)` 会算出 `floor=190`、
>    `chroma=40`、`|r-b|=45`，三条键控判据全部命中，会在肋骨与下颌处被抠成透明洞——
>    而这两处正是本类的识别特征。暗红褐 `(90,45,40)` 的 `floor` 仅 40，远低于阈值 110，安全。
>    实测按此生成后，16 帧中仅 4 帧有 8–14px 的微小缝隙，最差单帧 `0.0182%`，立绘零空洞。
> 2. 必须明写**双足**。低伏蜷缩姿态极易被画成四足爬行，而 `crawler`（伏地）与
>    `stalker`（俯行猎手）已各自占了四足生态位，撞形态会让三者在实机里无法区分。
>    `gait` 与四级降级词表里统一写 `on TWO legs`，负面词加 `quadruped`、
>    `four legs on the ground`、`crawling on all fours`。
>
> 另有一处判据冲突需要知情：弹跳步态本身伴随身体高度起伏，与候选级"四帧高度差 ≤18%"
> 判据天然抵触（该判据按直立行走标定）。v01 实测 18.4% 被拦，重抽后降到 11.7%；
> 成品级 `verify_directional_sheet.py` 的 20% 上限才是对本类有效的门控。

```text
High-resolution detailed pixel art zombie sprite, a starved animalistic zombie with exposed ribs, long dirty claws, torn jaw muscles, matted hair, shredded clothing, limbs folded into a low spring-loaded crouch, arched spine and compact violent dash silhouette. Dark gritty post-apocalyptic survival horror art, crisp hand-placed shading, readable fine pixel clusters. Direct 90-degree top-down bird's-eye view, facing exactly right, complete body inside a 1:1 square, hands and feet fully visible, flat pure magenta #FF00FF background, no ground or shadow, no text or watermark, no weapon. Avoid werewolf, animal, demon, superhero, extra limbs, cropped body, blurry, 3D render.
```

### 6.8 Bloodied 血污屠夫

> 2026-08-20 实测：本段原文措辞（阶梯 0）在 `gpt-image-2-vip` 下五张请求全部一次通过，
> 零次被内容审核拦截（含 `butcher`、`covered in dried blood` 字样）。
> 生成与后处理见 `docs/execution/2026-08-20-bloodied-headless-art-resource-rework.md`。
>
> 两处必须叠加的约束：
>
> 1. 血污压向**暗红褐与铁锈红**。注意与直觉相反：纯红血是安全的——红色的蓝通道低，
>    键控判据的 `floor = min(r,b)` 就低，`(190,25,30)` 的 `floor` 仅 30，远低于阈值 110。
>    真正会被抠成透明洞的只有被画成粉红/洋红的血高光，`(230,110,190)` 三条判据全部命中。
> 2. `butcher` 一词会强烈牵引模型画出刀具，而 §6.8 与通用规格都要求基准图不带武器。
>    负面词需压掉九种具体屠宰器械名称，不能只写 `no weapon`。
>
> 侧向是本类最难的一张：厚重宽肩使自镜像对称度天然偏高（v01 实测 0.550，瘦削体型上限 0.45）。
> **不要试图用补强措辞解决**——实测 0.550→0.704，反而更差，见 `WALKER_SPRITE_PIPELINE.md`
> 与该执行文档 §5 的三点实测。朝向以体型无关的落差判据收尾。

```text
High-resolution detailed pixel art zombie sprite, a heavy butcher-like undead corpse covered in dried blood, thick forearms, torn apron-like work clothes, butcher scars, missing skin, one swollen eye and large hunched shoulders, a bulky melee-threat silhouette with no weapon. Dark gritty post-apocalyptic survival horror art, crisp detailed pixel clusters, dark red and brown blood-stained palette. Direct 90-degree top-down bird's-eye view, facing exactly right, complete body inside a 1:1 square, flat pure magenta #FF00FF background, no ground or shadow, no text or watermark. Avoid carrying cleaver, living butcher, cartoon gore, extra limbs, cropped body, blurry, 3D render.
```

### 6.9 Headless 无头感染体

> 2026-08-20 实测：本段原文措辞（阶梯 0）在 `gpt-image-2-vip` 下五张请求全部一次通过，
> 零次被内容审核拦截。生成与后处理见
> `docs/execution/2026-08-20-bloodied-headless-art-resource-rework.md`。
>
> 三处必须叠加的约束：
>
> 1. 颈部断面组织压向**暗红褐 + 苍白椎骨**，不能是粉色。与 §6.5 裂颅同源：偏粉会命中
>    洋红键控判据被抠成透明洞，而断面正是本类唯一的识别特征，穿孔等于素材报废。
> 2. 措辞上**不能只写 `no head`**——模型容易理解成"把头藏起来"或"戴头盔"。必须同时压掉
>    替代头部的一切形式：头盔、面罩、漂浮的头、脖子上的第二个头、拿在手里的头。
> 3. 本类是唯一需要覆盖共用骨架 `frontView` 的感染体。骨架的正面请求默认写"头顶和脸可见"，
>    对无头感染体是自相矛盾的指令，会直接和它唯一的识别特征打架。
>
> 本类特有的一项结构性困难：**没有头就没有指向朝向的凸起**，正面与背面的外轮廓天生几乎相同
> （`down` vs `up` 轮廓 IoU 实测 0.851，是已生成七类里最高的）。可用的区分线索只有衣物细节
> 与脚的朝向，而轮廓 IoU 看不到这些，必须用内容差异判据交叉核对（实测 34.0，同行自比 0.0，
> 确认不是同一张图画两遍），并最终由人目视确认。
> 侧向对称度同样天然偏高（0.600），与 §6.8 同样不要试图用补强措辞解决（实测 0.600→0.619）。

```text
High-resolution detailed pixel art zombie sprite, an upright headless corpse with the neck torn open, exposed cervical spine and ragged dark flesh, long rigid arms, stained coat and heavy boots, the missing head as the primary readable silhouette, no replacement face and no floating head. Dark gritty post-apocalyptic survival horror art, crisp detailed pixel clusters and believable anatomy. Direct 90-degree top-down bird's-eye view, facing exactly right, complete body inside a 1:1 square, flat pure magenta #FF00FF background, no ground or shadow, no text or watermark, no weapon. Avoid skull mask, replacement head, ghost, extra limbs, cropped feet, blurry, 3D render.
```

### 6.10 Rotting 腐烂感染体

```text
High-resolution detailed pixel art zombie sprite, a severely decomposed corpse with sagging green-brown skin, visible ribs and joint bones, large rot patches, hanging strips of flesh, torn raincoat and one swollen infected arm, clearly older and more decayed than a basic walker. Dark gritty post-apocalyptic survival horror art, crisp hand-placed shading, readable fine pixel clusters. Direct 90-degree top-down bird's-eye view, facing exactly right, complete body inside a 1:1 square, flat pure magenta #FF00FF background, no ground or shadow, no text or watermark, no weapon. Avoid skeleton-only, plant monster, clean human, extra limbs, cropped body, blurry, 3D render.
```

### 6.11 Bloater 肿胀者

```text
High-resolution detailed pixel art zombie sprite, a gigantic corpse swollen by gas and decomposition, round distended abdomen, stretched skin with purple veins and leaking pustules, tiny head buried between huge shoulders, short legs struggling under the weight, a biological-bomb silhouette. Dark gritty post-apocalyptic survival horror art, crisp detailed pixel clusters, controlled organic texture. Direct 90-degree top-down bird's-eye view, facing exactly right, complete body inside a 1:1 square, flat pure magenta #FF00FF background, no ground or shadow, no text or watermark, no weapon. Avoid balloon, cartoon, armor, machine, explosion effect, extra limbs, cropped body, blurry, 3D render.
```

### 6.12 Crawler 伏地感染体

```text
High-resolution detailed pixel art zombie sprite, a low crawling corpse moving on both hands and knees, twisted torso, raw elbows and knees, head lifted with cloudy eyes and broken teeth, elongated fingers splayed forward, torn hospital clothing and a compact low silhouette. Dark gritty post-apocalyptic survival horror art, crisp hand-placed shading and readable fine pixel clusters. Direct 90-degree top-down bird's-eye view, facing exactly right, complete body inside a 1:1 square, flat pure magenta #FF00FF background, no ground or shadow, no text or watermark, no weapon. Avoid animal, quadruped skeleton, cute crawler, extra limbs, cropped body, blurry, 3D render.
```

### 6.13 Stalker 俯行猎手

```text
High-resolution detailed pixel art zombie sprite, a predatory quadrupedal infected corpse with raised shoulders and hips, long arms reaching farther than the legs, narrow skull, torn dark coat, blunt black nails, compressed stalking crouch and a distinctive bent spine. Dark gritty post-apocalyptic survival horror art, crisp detailed pixel clusters and strong low profile. Direct 90-degree top-down bird's-eye view, facing exactly right, complete body inside a 1:1 square, flat pure magenta #FF00FF background, no ground or shadow, no text or watermark, no weapon. Avoid wolf, animal, alien, fantasy creature, extra limbs, cropped body, blurry, 3D render.
```

### 6.14 Oddity 畸变行者

```text
High-resolution detailed pixel art zombie sprite, a grotesquely asymmetrical mutant corpse with one oversized shoulder, one arm split into two partial forearms, irregular rib cage, stretched skin and mismatched swollen joints, yellowed infection patches, biological asymmetrical silhouette with no fantasy horns. Dark gritty post-apocalyptic survival horror art, crisp hand-placed shading and readable fine pixel clusters. Direct 90-degree top-down bird's-eye view, facing exactly right, complete body inside a 1:1 square, flat pure magenta #FF00FF background, no ground or shadow, no text or watermark, no weapon. Avoid tentacle monster, alien, robot, extra random limbs, cropped body, blurry, 3D render.
```

### 6.15 Tank Boss 巨型坦克

```text
High-resolution detailed pixel art zombie boss sprite, a colossal armored crawler zombie with an enormous decayed torso carried by four thick infected limbs, natural keratin plates and torn industrial padding fused into flesh, recessed head, exposed tendons and broad front claws, heavy asymmetrical biological silhouette. Direct 90-degree top-down bird's-eye view, facing exactly right, complete boss body inside a 1:1 square, subject 84% of canvas height, flat pure magenta #FF00FF background, no ground or shadow, no text or watermark, no weapon, no machine parts, no mecha armor. Dark gritty survival horror, crisp detailed pixel clusters, believable undead anatomy, no blurry 3D render.
```

### 6.16 Bomber Boss 爆破者

```text
High-resolution detailed pixel art zombie boss sprite, a huge unstable siege zombie with a split swollen torso, multiple translucent infection sacs, open abdominal cavities glowing with sick orange bacteria, long bracing arms, thick legs and leaking biological fluid, terrifying organic volatile silhouette. Direct 90-degree top-down bird's-eye view, facing exactly right, complete body inside a 1:1 square, flat pure magenta #FF00FF background, no ground or shadow, no text or watermark, no weapon, no bomb, no explosion effect, no machinery. Dark gritty survival horror, crisp detailed pixel clusters, no blurry 3D render.
```

### 6.17 Hunter Boss 猩红猎杀者

```text
High-resolution detailed pixel art zombie boss sprite, a giant scorpion-like hunting zombie with an elongated segmented infected body, four powerful legs, oversized grasping forelimbs, a long curved organic tail ending in a swollen venom sac, dark red scar tissue and pale exposed bone plates, predatory low silhouette. Direct 90-degree top-down bird's-eye view, facing exactly right, complete body inside a 1:1 square, flat pure magenta #FF00FF background, no ground or shadow, no text or watermark, no weapon, no mechanical tail. Dark gritty survival horror, crisp detailed pixel clusters, believable corpse-derived biology, no blurry 3D render.
```

### 6.18 Matriarch Boss 腐化母体

```text
High-resolution detailed pixel art zombie boss sprite, a gigantic matriarch zombie with a broad swollen torso, multiple fused limbs buried under rotting flesh, cracked maternal rib cage protecting a pulsing infected core, long dragging arms, heavy decayed skin and dark red vascular growths, grotesque but believable organic boss silhouette. Direct 90-degree top-down bird's-eye view, facing exactly right, complete body inside a 1:1 square, flat pure magenta #FF00FF background, no ground or shadow, no text or watermark, no weapon, no fantasy tentacles, no sci-fi armor. Dark gritty survival horror, crisp detailed pixel clusters, no blurry 3D render.
```
