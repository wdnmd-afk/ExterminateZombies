# 美术资源维护台账

> 最后核对：2026-08-13
>
> 维护范围：外部原始素材、运行时派生素材、项目内程序化视觉、场景环境候选资源
>
> 状态依据：以当前代码导入和运行时映射为准，不以旧 README 中的历史描述为准

## 1. 文档用途

本文件是项目美术资源的统一维护入口，用于回答：

1. 项目当前有哪些美术资源。
2. 每套资源用于什么内容、在什么位置使用。
3. 原始文件存放在哪里，从哪个网站下载。
4. 资源是否已经接入运行时，是否需要署名。
5. 处理后文件由哪个脚本生成，能否复现。
6. 哪些场景资源只是候选，尚未进入项目。

### 状态定义

| 状态 | 含义 |
| --- | --- |
| 已接入 | 当前运行时或正式资料页正在加载和使用 |
| 部分接入 | 同一资源包只有部分文件进入运行时 |
| 已下载未接入 | 原始资源已在仓库归档，但当前代码未加载 |
| 仅作处理源 | 原始资源只被处理脚本读取以生成派生文件，运行时不加载原图；署名义务仍在 |
| 候选未下载 | 已核对来源、预览和授权，但尚未写入仓库 |
| 项目内生成 | 由 Phaser、Canvas 或项目脚本生成，没有外部下载来源 |

## 2. 角色与感染体资源

| 资源类型 | 资源包 | 状态 | 用途 | 使用位置 | 本地路径 | 来源网站及页面 | 原始下载 | 许可证 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 玩家备选 | Ghostbyte Action/Horror TopDownCharacter 48x48 | 已下载未接入 | 历史玩家主体与持枪手臂候选；当前运行时已改用 Kenney `Survivor 1` | 当前无运行时使用位置 | `src/assets/downloaded/characters/ghostbyte-action-horror-topdown-48x48/` | [OpenGameArt](https://opengameart.org/content/ghostbyte-dev-actionhorror-topdowncharacter-48x48) | [原始 ZIP](https://opengameart.org/sites/default/files/ghostbyte_dev_horror-action_topdowncharacter_male.zip) | CC-BY 3.0；重新接入时必须恢复 Ghostbyte_dev 署名 |
| 玩家/感染体备选 | Top down shooter animated 64x64 | 部分接入 | `zombie.gif` 生成 `crawler` 帧条，`zombie 2.gif` 生成 `stalker` 帧条；玩家手枪、机枪、匕首造型仍为备选 | `process_zombie_assets.py`、`PreloadScene`、`GameAssetManager` | `src/assets/downloaded/characters/topdown-shooter-animated-64x64/` | [OpenGameArt](https://opengameart.org/content/top-down-shooter-animated) | [原始 ZIP](https://opengameart.org/sites/default/files/topdown.zip) | CC-BY 3.0，发布时必须署名 CornerLord |
| 玩家/人物 | Kenney Topdown Shooter | 已接入五名角色 | `Survivor 1`、`Hitman 1`、`Soldier 1`、`Man Blue`、`Man Brown` 的 `*_hold.png` 分别用于守望者、鹰眼、堡垒、疾行者、破阵者的实机精灵；同包 `Vector/vector_characters.svg` 的对应 `hold` 姿态切出五张战前档案立绘；其余人物、僵尸、瓦片与对象仍为备选 | `PreloadScene`、`PreparationScene`、`GameAssetManager`、`Player`、`process_character_assets.py` | `src/assets/downloaded/characters/kenney-topdown-shooter/` | [OpenGameArt](https://opengameart.org/content/topdown-shooter) | [原始 ZIP](https://opengameart.org/sites/default/files/topdown-shooter.zip) | CC0 1.0 |
| 战前档案立绘 | Kenney Topdown Shooter 矢量派生 | 已接入 | 从上一行矢量源切出的五张 `44 x 48` 单角色 SVG，运行时按渲染倍率矢量栅格化，替代放大实机位图 | `PreloadScene`、`PreparationScene` | `src/assets/processed/characters/portrait-*.svg` | 派生自上一行 Kenney 来源 | 由 `scripts/process_character_assets.py` 生成 | CC0 1.0（继承 Kenney 原始许可） |
| 基础感染体 | Zombie RPG sprites | 已接入 | `walker`、`lurker`、`runner`、`drifter`、`tank`、`bomber` 六类四方向动画 | 全部战斗模式；`PreloadScene`、`GameAssetManager`、`Zombie` | `src/assets/downloaded/zombies/zombie-rpg-sprites/` | [OpenGameArt](https://opengameart.org/content/zombie-rpg-sprites) | [原始 ZIP](https://opengameart.org/sites/default/files/Zombies.zip) | CC0 1.0 |
| 感染体扩展 | Zombies 1.1 | 已接入 | `feral`、`bloodied`、`headless`、`rotting` 四类四方向动画 | 全部战斗模式；`PreloadScene`、`GameAssetManager`、`Zombie` | `src/assets/zombie-1.1/`；原始归档 `src/assets/zombie-1.1.zip` | [OpenGameArt](https://opengameart.org/node/82939) | 来源页归档；仓库保留原始 ZIP | OGA-BY 3.0+ 或 CC-BY 3.0+，发布时需要署名 |
| 重型感染体 | Zombie and Skeleton 32x48 | 已接入 | 使用合图前三列僵尸作为 `bloater` | 全部战斗模式；`PreloadScene`、`GameAssetManager`、`Zombie` | `src/assets/downloaded/zombies/zombie-and-skeleton-32x48/` | [OpenGameArt](https://opengameart.org/content/zombie-and-skeleton-32x48) | [原始 PNG](https://opengameart.org/sites/default/files/zombie_n_skeleton2.png) | CC0 1.0 |
| 独立 Boss | Warlock's Gauntlet Armored Crawler / Kliver / Scorpion / Gargant Boss | 已接入 | 四张移动帧条分别用于 `tank_boss`、`bomber_boss`、`hunter_boss`、`matriarch_boss`；四套攻击与死亡动作均已接入对应 Boss 机制和延迟死亡结算，Scorpion/Gargant 的两张死亡图通过多纹理动作协议连续播放 | 第 2、3、5、10 关与怪物图鉴；`PreloadScene`、`GameAssetManager`、`Zombie` | `src/assets/downloaded/zombies/warlocks-gauntlet-bosses/` | [Armored Crawler](https://opengameart.org/content/top-down-armored-crawler-animations)；[Kliver](https://opengameart.org/content/top-down-pigeared-monster-animated)；[Scorpion](https://opengameart.org/content/top-down-scorpion-animated)；[Gargant](https://opengameart.org/content/top-down-gargant-monster-animated) | 各来源页原始 PNG，精确链接与哈希见本地 `SOURCE.md` | CC-BY 3.0，发布时必须署名 rAum、jackFlower、DrZoliparia、Neil2D |
| 俯视感染体 | FreeArt - Topdown Zombies | 部分接入 | `ZombieWalk_odd_fast.gif` 生成 `oddity` 的 PNG 横向帧条；normal 套 2026-08-05 起被 CornerLord 深色爬行僵尸替换，退回备选 | `process_zombie_assets.py`、`PreloadScene`、`GameAssetManager` | `src/assets/downloaded/zombies/freeart-topdown-zombies/` | [OpenGameArt](https://opengameart.org/content/freeart-topdown-zombies) | [原始 ZIP](https://opengameart.org/sites/default/files/FreeArt_Topdown_Zombies_0.zip) | CC0 1.0 |
| 3D 人物备选 | Kenney Animated Characters Retro | 已下载未接入 | FBX 人类和僵尸模型、idle/run/jump 动画；当前 2D Phaser 战场不加载 | 当前无运行时使用位置 | `src/assets/kenney_animated-characters-retro/`；原始归档 `src/assets/kenney_animated-characters-retro.zip` | [Kenney](https://kenney.nl/assets/animated-characters-retro) | [原始 ZIP](https://kenney.nl/media/pages/assets/animated-characters-retro/93305a3c49-1774772819/kenney_animated-characters-retro.zip) | CC0 1.0 |

### 图鉴肖像候选：Mini Zombie Pack（ODDBLOT）

| 状态 | 用途结论 | 本地路径 | 来源页面 | 许可证 |
| --- | --- | --- | --- | --- |
| 候选未接入 | 仅适合作为档案肖像候选；本轮不生成或提交派生文件 | `.asset-candidates/oddblot-mini-zombie-pack/`（Git 忽略） | [itch.io](https://oddblot.itch.io/mini-zombie-pack) | 允许商业/非商业使用和修改；禁止单独售卖素材；禁止用于训练 AI；署名非强制，可署名 Rebecca H / ODDBLOT |

2026-08-04 已完成以下核对：

1. 候选目录已有 `SOURCE.md`、原始 ZIP SHA-256、包内授权原文和四组预览图。
2. 四张 512px PNG 均为透明背景，但属于正面/三分之四视角手绘静态插画，与俯视像素战斗资产不一致。
3. 四个角色不足以覆盖 18 类感染体；翻转、染色和局部裁切会造成档案身份与战斗外观脱节。
4. 未接线的 `monsterPortraits.ts` 与只做原样解压的处理脚本已删除，仓库内没有 ODDBLOT 派生文件。
5. 因本轮没有接入或提交素材，项目 Credits 暂不增加 ODDBLOT；未来重新接入时必须同步署名/许可页面与实际使用清单。

四个固定关卡 Boss 已改用同一来源、同一作者组的独立战斗视觉。静态肖像不作为 Boss 战斗视觉替代方案。

## 3. 武器与军械资源

| 资源类型 | 资源包 | 状态 | 用途 | 使用位置 | 本地路径 | 来源网站及页面 | 原始下载 | 许可证 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 枪械精灵表 | Pixel Art Guns - 128x128 | 仅作处理源 | 生成 SPAS-12、MP5、M4A1、AK-47、Barrett M82、RPG-7、M79 七张战场透明图。单元格烘有型号名文字与浅灰底，运行时不再直接加载 | 仅 `process_weapon_assets.py` | `src/assets/downloaded/weapons/pixel-art-guns-128x128/` | [OpenGameArt](https://opengameart.org/content/pixel-art-guns-128x128) | [原始 PNG](https://opengameart.org/sites/default/files/spritesheet-guns.png) | CC0 1.0 |
| 手枪/霰弹枪素材 | 486 Shotgun + Desert Eagle | 仅作处理源 | 生成战场 `pistol.png`（沙漠之鹰）。运行时不再直接加载 | 仅 `process_weapon_assets.py` | `src/assets/downloaded/weapons/486-shotgun-desert-eagle/` | [OpenGameArt](https://opengameart.org/content/486-shotgun-desert-eagle) | [原始 PNG](https://opengameart.org/sites/default/files/486_parallelo_3.png) | CC0 1.0 |

## 4. 运行时派生资源

派生资源不单独改变许可证，必须同时保留原始资源、来源记录和生成脚本。

| 派生资源 | 原始来源 | 生成方式 | 用途与使用位置 | 维护要求 |
| --- | --- | --- | --- | --- |
| `src/assets/processed/zombies/crawler-strip.png` | Top down shooter animated 64x64 的 `zombie.gif` | `scripts/process_zombie_assets.py` 按原帧顺序转换为 PNG 横向帧条 | `crawler`；`PreloadScene`、`GameAssetManager` | 保留 CornerLord 署名；禁止手工覆盖后失去可复现性 |
| `src/assets/processed/zombies/stalker-strip.png` | Top down shooter animated 64x64 的 `zombie 2.gif` | `scripts/process_zombie_assets.py` 按原帧顺序转换为 PNG 横向帧条 | `stalker`；`PreloadScene`、`GameAssetManager` | 保留 CornerLord 署名；禁止手工覆盖后失去可复现性 |
| `src/assets/processed/zombies/oddity-strip.png` | FreeArt 的 `ZombieWalk_odd_fast.gif` | `scripts/process_zombie_assets.py` | `oddity`；`PreloadScene`、`GameAssetManager` | 原始 GIF 与脚本必须同时保留 |
| `src/assets/processed/weapons/pistol.png` | 486 Shotgun + Desert Eagle | `scripts/process_weapon_assets.py` 精确裁切并保留透明边距 | 沙漠之鹰战场持枪和掉落图 | 修改裁切区域时同时验证枪口锚点和透明边角 |
| `src/assets/processed/weapons/{shotgun,smg,rifle,ak47,barrett,rpg,m79}.png` | Pixel Art Guns - 128x128 | `scripts/process_weapon_assets.py` 按已确认帧号裁切并清除背景 | 七把武器的战场持枪和掉落图 | 修改帧号或背景算法时重新核对全部武器 |
| `src/assets/processed/environment/prop-{oil-barrel,flour-barrel}.png` | FreeArt - Topdown extras | `scripts/process_environment_assets.py` 从原始 ZIP 读取桶体，统一调色、缩放和透明边距 | 固定关卡与无尽模式的油桶、面粉桶 | 两类桶保持同一轮廓，只通过材质色区分；不得直接引用原始大图 |
| `src/assets/processed/environment/prop-mine.png` | CC0 Explosive Icons | 处理脚本精确裁切灰色爆炸物图标，压低高度并加入状态灯 | 地雷场景物与地雷掉落 | 保持红色状态灯可见，显示尺寸不得小于实机验收基线 |
| `src/assets/processed/environment/pickup-ammo.png` | Ammo Pack | 处理脚本降饱和、压暗并补齐透明边距 | 全部弹药掉落 | 数量标签由 `Pickup` 叠加，原图不烘焙文字 |
| `src/assets/processed/environment/pickup-{health,enhancement}.png` | Medicine Pack 16x16 | 精确裁切医疗包和血袋；强化包对血袋做青色调色 | 生命与强化包掉落 | 保持最近邻采样，不直接加载原始图标表 |
| `src/assets/processed/environment/bullet-{friendly,explosive,enemy}.png` | Endless Midnight: Zombie Swarm assets | 从原始 ZIP 提取弹迹和火箭，统一透明画布、功能色与 alpha | 玩家普通弹、爆炸弹和敌方投射物 | 小弹体允许运行时辉光与武器色着色，但位图主体必须保留 |

## 5. 项目内程序化美术

| 资源类型 | 状态 | 用途 | 使用位置 | 来源网站及链接 |
| --- | --- | --- | --- | --- |
| 战场地面与边界 | 项目内生成 | 为 10 个固定关卡与无尽模式绘制各自的地面、道路、铁轨、水道、炉栅、菌毯、边界与非碰撞细节 | [`src/systems/BattlefieldRenderer.ts`](../src/systems/BattlefieldRenderer.ts)；`GameScene` | 项目源码，无外部来源 |
| 障碍物外观 | 项目内生成 | `process_environment_assets.py` 生成 `container`、`wreck`、`barricade` 位图；`Obstacle` 负责显示并与静态碰撞体对应 | [`scripts/process_environment_assets.py`](../scripts/process_environment_assets.py)、[`src/entities/Obstacle.ts`](../src/entities/Obstacle.ts)；10 个固定关卡 | 项目源码，无外部来源 |
| 爆炸与区域效果 | 项目内生成 | 爆炸、火焰、粉尘、危险区、命中和死亡反馈 | [`src/systems/AreaEffectFactory.ts`](../src/systems/AreaEffectFactory.ts)、[`src/scenes/GameScene.ts`](../src/scenes/GameScene.ts) | 项目源码，无外部来源 |
| UI 与拟声词 | 项目内生成 | 菜单、HUD、图鉴、结算、波次横幅及 `SMASH!` 等文字反馈 | `src/scenes/` 下各 UI 场景 | 项目源码，无外部来源 |

## 6. 环境与交互物外部资源

| 资源类型 | 资源包 | 状态 | 用途 | 本地路径 | 来源页面 | 许可证 |
| --- | --- | --- | --- | --- | --- | --- |
| 桶类场景物 | FreeArt - Topdown extras | 仅作处理源 | 油桶、面粉桶 | `src/assets/downloaded/environment/freeart-topdown-extras/` | [OpenGameArt](https://opengameart.org/content/freeart-topdown-extras) | CC0 1.0 |
| 医疗与强化拾取物 | Medicine Pack 16x16 | 仅作处理源 | 医疗包、强化包 | `src/assets/downloaded/environment/medicine-pack-16x16/` | [OpenGameArt](https://opengameart.org/content/medicine-pack-16x16) | CC0 1.0 |
| 弹药拾取物 | Ammo Pack | 仅作处理源 | 弹药箱 | `src/assets/downloaded/environment/ammo-pack/` | [OpenGameArt](https://opengameart.org/content/ammo-pack) | CC0 1.0 |
| 地雷 | CC0 Explosive Icons | 仅作处理源 | 场景地雷与地雷掉落 | `src/assets/downloaded/environment/cc0-explosive-icons/` | [OpenGameArt](https://opengameart.org/content/cc0-explosive-icons) | CC0 1.0 |
| 投射物 | Endless Midnight: Zombie Swarm assets | 仅作处理源 | 玩家弹迹、火箭、敌方弹迹 | `src/assets/downloaded/environment/endless-midnight-zombie-swarm-assets/` | [OpenGameArt](https://opengameart.org/content/endless-midnight-zombie-swarm-assets) | CC0 1.0 |

### 未接入场景候选资源

以下资源已在 2026-07-30 核对来源页面、预览和许可证，但尚未下载到仓库，也未接入运行时。
2026-08-12 更新：经用户确认（`docs/design/LONG_TERM_OPTIMIZATION_GOALS.md` §9 C-2），第二关将改用正式位图瓦片，程序化实现保留为其余关卡回退；下表候选将按 G5-2 计划分批下载接入，未下载前状态仍为候选。

| 资源类型 | 资源包 | 状态 | 计划用途 | 计划使用位置 | 来源网站 | 来源页面 | 许可证与注意事项 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 城市综合瓦片 | Kenney Roguelike Modern City | 候选未下载 | 道路、建筑、车辆、路灯、垃圾桶和城市地面；作为正式场景核心包 | 第三关封锁城区、无尽模式城市主题 | Kenney | [资源页面](https://kenney.nl/assets/roguelike-modern-city) | CC0；1036 项，优先级最高 |
| 城市与郊外补充 | Kenney RPG Urban Pack | 候选未下载 | 草地、道路、围栏、植被、车辆、路障和街道杂物 | 第一关郊外、第二关废车站、第三关补充 | Kenney | [资源页面](https://kenney.nl/assets/rpg-urban-pack) | CC0；480 项，16x16 像素瓦片 |
| 工业区扩展 | Modern City Extension | 候选未下载 | 工厂、仓库、工业地面、暗色窗户和建筑变化 | 第二关废车站、第三关封锁城区 | OpenGameArt | [资源页面](https://opengameart.org/content/modern-city-extension) | CC0；基于 Kenney Modern City 扩展，风格兼容 |
| 铁路地面 | Railway line including grass, sand and dirt terrain | 候选未下载 | 铁轨以及草地、泥地和沙地过渡 | 第二关废车站 | OpenGameArt | [资源页面](https://opengameart.org/content/railway-line-inclusing-grasssand-and-dirt-terrain) | CC0；16x16，需要最近邻整数放大 |
| 荒地与掩体 | Kenney Desert Shooter Pack | 候选未下载 | 土地、墙体、箱子、残骸、骨骸和战术标识 | 第一关郊外、无尽模式封锁区 | Kenney | [资源页面](https://kenney.nl/assets/desert-shooter-pack) | CC0；500 项，原色偏亮，接入前需统一色板 |
| 城市废墟 | Ruined Modern City Tileset | 候选未下载 | 破损建筑、裂纹道路、藤蔓和废墟边界 | 第三关封锁城区 | OpenGameArt | [资源页面](https://opengameart.org/content/ruined-modern-city-tileset) | CC-BY 4.0；32x32，使用时必须新增署名 |
| 道路与交通细节 | Street Tiles | 候选未下载 | 简单 32x32 道路、路口、标线和人行道 | 第三关或场景原型 | OpenGameArt | [资源页面](https://opengameart.org/content/street-tiles) | CC0；内容较少，适合作为补充而非主包 |
| 高细节城市道路 | LPC Streets | 候选未下载 | 道路标线、路口、交通灯和城市道路组合 | 第三关封锁城区 | OpenGameArt | [资源页面](https://opengameart.org/content/lpc-streets) | CC-BY-SA 3.0 / GPL 3.0；署名和派生约束较重，不建议首批引入 |
| 高细节车辆与街景 | Skorpio's SciFi Sprite Pack | 候选未下载 | 俯视车辆、路灯、护栏、路面和反乌托邦街景 | 第三关封锁城区 | OpenGameArt | [资源页面](https://opengameart.org/content/lpc-skorpios-scifi-sprite-pack) | CC-BY-SA 3.0 / GPL 3.0；需与 LPC Streets 一并管理署名 |

### 历史候选组合（当前不接入）

若未来明确重做位图关卡，可重新评估以下纯 CC0 组合；当前版本不执行该方案：

| 关卡 | 推荐资源组合 | 主要用途 |
| --- | --- | --- |
| 第一关：郊外 | RPG Urban Pack；按需补充 Desert Shooter Pack | 草地、泥地、围栏、植被、箱子和外围废弃物 |
| 第二关：废车站 | Modern City Extension + Railway Line + RPG Urban Pack | 铁轨、工业仓库、车辆、交通锥、集装箱和废料 |
| 第三关：封锁城区 | Roguelike Modern City + Modern City Extension | 城市道路、建筑边界、车辆、路障和封锁设施 |
| 无尽模式 | 从已接入场景包建立独立白名单 | 避免无尽模式成为多个素材包的无规则混用区 |

## 7. 场景资源规格与缺口

| 资源类型 | 用途 | 预期使用位置 | 优先规格 |
| --- | --- | --- | --- |
| 主地面瓦片 | 草地、泥地、沥青、混凝土、铁轨和人行道 | `BattlefieldRenderer` 的正式位图替代或补充层 | 正交俯视；16x16 或 32x32；可无缝拼接 |
| 边界资源 | 围栏、墙体、建筑边缘、废墟和封锁线 | 世界四周及不可进入区域 | 轮廓清楚；不遮挡出生预警和 HUD |
| 可碰撞障碍 | 集装箱、废车、路障、沙包和木箱 | `Obstacle` | 外观尺寸必须能与矩形碰撞体对齐 |
| 非碰撞细节 | 垃圾、碎石、血迹、轮胎印、线缆和杂草 | 地面装饰层 | 低对比度；不得干扰子弹、掉落和危险区识别 |
| 环境动态 | 烟尘、火星、闪灯和风动细节 | 场景动态层 | 短循环、低粒子数量、可统一关闭 |
| 危险与出生标识 | 敌人入口、Boss 入场、爆炸与区域技能预警 | 战斗提示层 | 不只依赖颜色；必须高于场景装饰层 |

## 8. 维护规则

### 新增外部资源

1. 原始文件存入 `src/assets/downloaded/<类型>/<资源包>/`，不得覆盖来源文件。
2. 每个资源包必须包含 `SOURCE.md`，记录标题、作者、来源页面、下载链接、许可证、下载日期和文件说明。
3. 仓库中必须保留对应 `LICENSE*`；CC-BY、OGA-BY、CC-BY-SA 还要更新 `ATTRIBUTION.md`。
4. 在本台账中新增记录，初始状态只能是“已下载未接入”。
5. 完成 `PreloadScene` 和运行时映射后，才能改为“已接入”或“部分接入”。

### 新增派生资源

1. 输出存入 `src/assets/processed/<类型>/`。
2. 优先通过脚本生成，脚本放入 `scripts/`。
3. 台账必须记录原始来源、生成脚本、用途和运行时使用位置。
4. 派生文件沿用原始资源许可证，不因裁切、转帧或调色自动变为项目自有资源。

### 替换或停用资源

1. 先确认所有导入、纹理 key、动画和实体引用已迁移。
2. 不直接删除原始来源、许可证和署名记录。
3. 停用资源改为“已下载未接入”，并在用途栏说明替代资源。
4. 发布前根据实际运行时资源生成最终 Credits，不对未使用候选资源做无意义署名。

## 9. 发布前授权检查

当前必须进入游戏 Credits 或发布说明的资源：

1. CornerLord：`crawler` 与 `stalker` 原始动画，CC-BY 3.0。
2. Svetlana Kushnariova 与 Jordan Irwin：Zombies 1.1，采用 OGA-BY 或 CC-BY 路径。
3. Warlock's Gauntlet artists rAum、jackFlower、DrZoliparia、Neil2D：四个独立 Boss 动画，CC-BY 3.0。
4. Alibaba Design 与汉仪字库：阿里巴巴普惠体 3.0，免费商用；版权归阿里巴巴（中国）有限公司，禁止修改与单独再分发。
5. TakWolf：Ark Pixel Font 12px Proportional，SIL OFL 1.1；已退出运行时，文件仍在仓库内分发，随字体保留许可证原文。

CC0 资源不强制署名，但仍保留作者和来源记录，便于追溯。

## 10. 关联文档

1. [`src/assets/downloaded/characters/ATTRIBUTION.md`](../src/assets/downloaded/characters/ATTRIBUTION.md)
2. [`src/assets/downloaded/zombies/ATTRIBUTION.md`](../src/assets/downloaded/zombies/ATTRIBUTION.md)
3. [`src/assets/downloaded/characters/README.md`](../src/assets/downloaded/characters/README.md)
4. [`src/assets/downloaded/zombies/README.md`](../src/assets/downloaded/zombies/README.md)
5. [`src/assets/downloaded/weapons/README.md`](../src/assets/downloaded/weapons/README.md)
6. [`docs/execution/2026-07-28-runtime-art-assets.md`](execution/2026-07-28-runtime-art-assets.md)

## 11. 字体资源

| 资源 | 状态 | 用途 | 使用位置 | 本地路径 | 来源与版本 | 许可证 |
| --- | --- | --- | --- | --- | --- | --- |
| 阿里巴巴普惠体 3.0 `55 Regular` | 已接入 | 全部 Phaser Text 的简体中文、西文、数字与符号 | `src/ui/fonts.ts`、`BootScene`、全部场景/实体/系统文字 | `src/assets/downloaded/fonts/alibaba-puhuiti-3/` | [fonts.alibabagroup.com](https://fonts.alibabagroup.com/)，字体版本 `3.01` | 免费商用；禁止修改字形与内部名称、禁止单独再分发；版权归阿里巴巴（中国）有限公司；哈希与获取方式见本地 `SOURCE.md` |
| 方舟像素字体 12px Proportional `zh_cn` | 已退出运行时（文件保留） | 2026-08-12 前的 UI 字体，现不再被加载 | 无 | `src/assets/downloaded/fonts/ark-pixel-font-12px-proportional/` | [TakWolf/ark-pixel-font](https://github.com/TakWolf/ark-pixel-font)，官方发布 `2026.08.11` | SIL OFL 1.1；作者 TakWolf；仓库仍分发该文件，须继续保留许可证原文 |

字体署名汇总见 [`src/assets/downloaded/fonts/ATTRIBUTION.md`](../src/assets/downloaded/fonts/ATTRIBUTION.md)。

普惠体的许可与本仓库其他字体资源不同，需特别注意：它允许免费商用，但**禁止修改**，因此运行时分发完整原始 WOFF2，不做子集化裁剪。官方站点当前无法直连，许可协议原文尚未在本地留存，正式对外发布前须补齐并复核条款，详见 `alibaba-puhuiti-3/SOURCE.md`。
