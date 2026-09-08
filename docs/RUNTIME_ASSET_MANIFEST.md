# 运行时实际加载资源清单

> 最后核对：2026-09-08；固定审计基线：`bc75e374cb7b2e1c7fb004d128ac389fe7c3dbf6`（已推送的 `main`）。
>
> 范围：`PreloadScene`、`src/config/audio.ts`、`src/ui/fonts.ts` 实际加载的文件；只做 V0 静态核对，不代表解码、显示、试听或发布验收通过。
>
> 逐文件路径、加载键、字节数、PNG 尺寸、SHA-256、来源编号和加载状态见 [`RUNTIME_ASSET_INVENTORY.csv`](RUNTIME_ASSET_INVENTORY.csv)。来源编号与下列表格一一对应。

## 1. 统计口径与加载链

| 类别 | 文件数 | 原文件总字节数 | 加载入口 |
| --- | ---: | ---: | --- |
| PNG 图片 | 164 | 70,146,915 | `PreloadScene`：134 个显式 `load.image` + 30 个环境调色派生 |
| 音频 | 52 | 15,400,467 | `AUDIO_ASSETS` 全部由 `PreloadScene` 加载；49 个音效文件 + 3 个音乐文件 |
| 字体 | 1 | 5,256,740 | `BootScene` → `loadUiFont()` → `FontFace` |
| 合计 | 217 | 90,804,122 | 去重后的文件，不是纹理帧数、声音事件数或构建包体 |

- 图片为：10 张角色、48 张项目生成感染体 / Boss、8 张遗留感染体预载、34 张武器、51 张环境 / 交互物 / 药品、11 张特效 / 粒子、2 张 UI。
- `GameAssetManager` 按 `zombieVisuals.ts` / `effectVisuals.ts` 在内存切帧建动画；`WeaponAssetManager`、`EnvironmentAssetManager` 管理纹理映射，不额外下载图像。系统兜底字体与程序绘制图元不计为分发文件。
- `loaded` 表示进入加载集合；`legacy-preload` 表示仍加载并登记旧切帧，但当前实体 / 图鉴映射已不用它。后者仍计入许可管理，不能因画面没显示就删除署名。
- CSV 的 `loader_key` 保留显式加载调用中的配置键表达式；动态环境记录最终纹理键，字体记录 `UI_FONT_NAME`。它是静态追溯入口，不是执行 TypeScript 后采样的运行时结果。
- 同仓库并发的尸潮调度 / 炮弹反打不在本基线内。`prop-lure-station.png` 等新增资源待该批接线和来源确认后单独登记，不纳入本批数量。

## 2. 当前加载集合中的署名许可资源

| 来源编号 | 文件数 | 当前用途与状态 | 作者 / 许可 | 来源与原文 |
| --- | ---: | --- | --- | --- |
| `zombies-1.1` | 3 | `zombie-NESW.png`、`bloody_zombie-NESW.png`、`headless_zombie-NESW.png` 仍预载；实体已改用项目生成视觉。`rotting_zombie-NESW.png` 不再加载 | Svetlana Kushnariova (Cabbit)、Jordan Irwin (AntumDeluge)；OGA-BY 3.0+ 或 CC-BY 3.0+，现有署名沿用 CC-BY 路径 | [`SOURCE.md`](../src/assets/zombie-1.1/SOURCE.md)、同目录 `LICENSE-*`、[署名](../src/assets/downloaded/zombies/ATTRIBUTION.md) |
| `gunshot-sounds` | 12 | CZ / SKS / Mosin / Shotty 连续录音裁成单发；17 把武器中 15 把复用这些枪声，RPG / M79 使用 CC0 发射声 | Vincent Sevedge / Tabasco；CC-BY 3.0 | [`SOURCE.md`](../src/assets/downloaded/audio/gunshot-sounds/SOURCE.md)、同目录 `LICENSE-CC-BY-3.0.txt` |

Gunshot Sounds 的 OpenGameArt 页面写 CC0，但包内原文写 CC-BY 3.0，沿用更严格的包内许可，不改成 CC0。发布材料保留作品名、作者、来源、许可链接与裁切说明：

> Gunshot recordings by Vincent Sevedge, submitted by Tabasco on OpenGameArt, licensed under CC BY 3.0. Recordings trimmed into single-shot samples by this project.

原始来源：<https://opengameart.org/content/gunshot-sounds>；许可：<https://creativecommons.org/licenses/by/3.0/>。

## 3. CC0 视觉资源

| 来源编号 | 文件数 | 当前用途与来源 | 本地来源记录 |
| --- | ---: | --- | --- |
| `zombie-rpg-sprites` | 5 | Curt；`1/2/3/4/6ZombieSpriteSheet.png` 仅遗留预载和旧切帧，14 类普通感染体已全部改用项目生成图 | [`SOURCE.md`](../src/assets/downloaded/zombies/zombie-rpg-sprites/SOURCE.md) |
| `pixel-art-guns` | 7 | aron137；SPAS-12、MP5、M4A1、AK-47、Barrett、RPG-7、M79 **侧视图标** | [`SOURCE.md`](../src/assets/downloaded/weapons/pixel-art-guns-128x128/SOURCE.md) |
| `desert-eagle-486` | 1 | Leozlk；沙漠之鹰**侧视图标** | [`SOURCE.md`](../src/assets/downloaded/weapons/486-shotgun-desert-eagle/SOURCE.md) |
| `freeart-topdown-extras` | 2 | SpriteAttack；油桶、面粉桶派生图，供场景物、携带道具掉落与 HUD 使用 | [`SOURCE.md`](../src/assets/downloaded/environment/freeart-topdown-extras/SOURCE.md) |
| `ammo-pack` | 1 | NiceGraphic；弹药拾取物 | [`SOURCE.md`](../src/assets/downloaded/environment/ammo-pack/SOURCE.md) |
| `medicine-pack` | 1 | Kipperfalcon；强化包；旧生命包已退出加载 | [`SOURCE.md`](../src/assets/downloaded/environment/medicine-pack-16x16/SOURCE.md) |
| `airos-medical-items` | 2 | Airos；绷带、急救图标，直接加载原始 32×32 PNG | [`SOURCE.md`](../src/assets/downloaded/environment/airos-medical-items-32x32/SOURCE.md) |
| `airos-food-items` | 1 | Airos；能量饮料，直接加载原始 32×32 PNG | [`SOURCE.md`](../src/assets/downloaded/environment/airos-food-items-32x32/SOURCE.md) |
| `cc0-explosive-icons` | 1 | AntumDeluge；地雷场景物 / 掉落图标 | [`SOURCE.md`](../src/assets/downloaded/environment/cc0-explosive-icons/SOURCE.md) |
| `endless-midnight` | 3 | quantumelle；玩家普通弹、爆炸弹、敌方投射物 | [`SOURCE.md`](../src/assets/downloaded/environment/endless-midnight-zombie-swarm-assets/SOURCE.md) |
| `kenney-rpg-urban-pack` | 11 | Kenney；第二关地面母版 + 十个主题地面调色派生 | [`SOURCE.md`](../src/assets/downloaded/environment/kenney-rpg-urban-pack/SOURCE.md) |
| `modern-city-extension` | 11 | rubberduck；第二关边界母版 + 十个主题边界调色派生 | [`SOURCE.md`](../src/assets/downloaded/environment/modern-city-extension/SOURCE.md) |
| `railway-line-terrain` | 11 | titmouse001；第二关铁轨母版 + 十个主题铁轨调色派生 | [`SOURCE.md`](../src/assets/downloaded/environment/railway-line-terrain/SOURCE.md) |

以上 57 张图片沿用 CC0 1.0；裁切或调色不改变原始来源。环境母版为 `battlefield-level2-{ground,rail,boundary}.png`；派生为 `battlefield-{level_1,level_3,…,level_10,endless}-{ground,rail,boundary}.png`，注意母版是 `level2`、其他关卡是 `level_`。

母版管线为 `scripts/process_battlefield_environment_assets.py`，调色管线为 `scripts/generate_battlefield_variants.py`。33 张共同对应 `BATTLEFIELD_TILE_SETS` 的 11 个主题，由 `BattlefieldRenderer` 消费；这不是 11 套独立原创场景。地面 / 铁轨 / 边界尺寸分别为 32×32、1280×116、1280×20。

## 4. CC0 音频资源

| 来源编号 | 文件数 | 来源包 / 作者 | 用途与来源记录 |
| --- | ---: | --- | --- |
| `gun-reload-sounds` | 3 | Gun reload sounds / SpringySpringo | 换弹；[`SOURCE.md`](../src/assets/downloaded/audio/gun-reload-sounds/SOURCE.md) |
| `zombies-sound-pack` | 6 | Zombies Sound Pack / artisticdude | 攻击与死亡变体；[`SOURCE.md`](../src/assets/downloaded/audio/zombies-sound-pack/SOURCE.md) |
| `100-cc0-sfx` | 18 | 100 CC0 SFX / rubberduck | 命中、爆炸、粉尘、暴击 / 处决 / 穿透 / 心跳、拾取、波次、RPG / M79 发射、空弹、切枪；[`SOURCE.md`](../src/assets/downloaded/audio/100-cc0-sfx/SOURCE.md) |
| `kenney-interface-sounds` | 6 | Interface Sounds / Kenney | UI、Boss 警报、连杀；[`SOURCE.md`](../src/assets/downloaded/audio/kenney-interface-sounds/SOURCE.md) |
| `hurt-sound-effects` | 3 | Hurt Sound Effects / EZduzziteh | 玩家受伤；[`SOURCE.md`](../src/assets/downloaded/audio/hurt-sound-effects/SOURCE.md) |
| `fire-crackling` | 1 | Fire Crackling / AntumDeluge | 火焰残留循环；[`SOURCE.md`](../src/assets/downloaded/audio/fire-crackling/SOURCE.md) |
| `empty-city` | 1 | EmptyCity / yd | 菜单等非战斗场景音乐；[`SOURCE.md`](../src/assets/downloaded/audio/empty-city/SOURCE.md) |
| `fast-fight-battle` | 1 | Fast fight / battle music / Ville Nousiainen (XCVG) | 普通战斗音乐；[`SOURCE.md`](../src/assets/downloaded/audio/fast-fight-battle/SOURCE.md) |
| `trance-boss-battle` | 1 | Trance Boss Battle / MintoDog | Boss 战音乐；[`SOURCE.md`](../src/assets/downloaded/audio/trance-boss-battle/SOURCE.md) |

共 40 个 CC0 音频，加第 2 节 12 个 CC-BY 枪声，合计 52 个文件、10 套来源。`scripts/process_audio_assets.py` 负责提取 / 裁切；[`processed/audio/SHA256SUMS`](../src/assets/processed/audio/SHA256SUMS) 的 52 条已逐项核对一致。17 把武器复用 8 个开火语义事件及 3 个换弹事件，不等于有 17 套独立音源。

## 5. 字体专项许可

| 来源编号 | 文件数 | 当前资源 | 许可与证据 |
| --- | ---: | --- | --- |
| `alibaba-puhuiti-3` | 1 | 阿里巴巴普惠体 3.0 `55 Regular`，内部版本 3.01；阿里巴巴（中国）有限公司 / Alibaba Design / 汉仪字库 | 免费、普通的商业 / 非商业使用许可，受官方法律声明约束；不是 CC0 / OFL。完整[来源记录](../src/assets/downloaded/fonts/alibaba-puhuiti-3/SOURCE.md)、[中英文全文](../src/assets/downloaded/fonts/alibaba-puhuiti-3/LEGAL-STATEMENT.txt)、[官方正文快照](../src/assets/downloaded/fonts/alibaba-puhuiti-3/LEGAL-STATEMENT.source.json)已归档 |

2026-09-08 经有效 HTTPS 取得官方声明与官方 WOFF2，仓库文件与官方文件字节数、SHA-256 完全一致；无需替换、转换或子集化。官方来源链与取得时间见 `SOURCE.md`，不再保留“仅凭字体名称判断原版”的结论。

免费使用不等于可以任意转换、独立分发或再授权。发布时保留完整声明和产权信息；额外分发安排以权利人授权为准。本次只补证据，不代表用户接受协议或作出全面法律合规结论。

## 6. 项目生成视觉

项目 AI 生成与程序绘制必须分开登记；都不能因为“由脚本产出”就自动标成 CC0。本仓库尚未为这些产物指定独立对外许可证，来源登记也不等同于确认排他版权。

| 来源编号 | 文件数 | 运行时用途 / 路径 | 来源与处理链 |
| --- | ---: | --- | --- |
| `project-characters` | 10 | 五名角色的 `sprite-*.png` 与 `portrait-*.png`，位于 `processed/characters/` | AI 原图及版本见 [`generated/characters/SOURCE.md`](../src/assets/generated/characters/SOURCE.md)；`generate_character_assets.mjs` → `process_character_assets.py`；`Player` / `PreparationScene` 消费 |
| `project-zombies` | 48 | 14 类普通感染体各一张方向表 + 一张立绘；4 个 Boss 各移动、攻击、死亡×2、立绘共 5 张 | 原图在 `generated/zombies/`；Walker 见 [`WALKER_SPRITE_PIPELINE.md`](execution/WALKER_SPRITE_PIPELINE.md)，其余由 `zombie_asset_specs.json`、`generate_zombie_assets.mjs`、`process_zombie_sprites.py` 管理；`zombieVisuals.ts` / `Zombie` / `MonsterLibraryScene` 消费 |
| `project-weapon-side-ai` | 3 | 加特林、黄金 M249、火焰喷射器侧视图标 | `weapon_side_specs.json`、`generate_weapon_assets.mjs`、`inspect_weapon_side_candidates.py`、`process_weapon_side_assets.py`；候选输入位于 `TmpGenerate/` |
| `project-weapon-side-drawn` | 6 | M16A4、AA-12、双持乌兹、特斯拉、磁轨炮、冷冻喷射器侧视图标 | 程序绘制：`weapon_profile_specs.json` + `lib_weapon_draw.py` + `process_heavy_weapon_profiles.py`；不可全量覆盖上一行 AI 图标 |
| `project-weapon-topdown` | 17 | `processed/weapons/topdown/*.png`，玩家手中武器层 | 程序绘制：`weapon_topdown_specs.json` + `lib_weapon_draw.py` + `process_weapon_topdown_assets.py`；侧视图仍用于 HUD / 整备 / 武器库 / 掉落 |
| `project-tactical-props` | 4 | `prop-{firebomb,dust-canister,demo-charge,cryo-canister}.png` | AI 候选输入位于 `TmpGenerate/`；`prop_item_specs.json`、`generate_prop_item_assets.mjs`、`process_prop_item_assets.py`；均为 46×38，供 `Prop` / `Pickup` / HUD 使用 |
| `project-obstacles` | 3 | `obstacle-{container,truck,wall}.png` | `process_environment_assets.py` 程序绘制；`Obstacle` 显示并对应碰撞体 |
| `project-effects` | 9 | 火舌、火团、地面火焰、三类枪口焰、烟尘、爆炸、粉尘 / 寒雾四帧条 | AI 原图在 `generated/effects/`；`effect_asset_specs.json`、`generate_effect_assets.mjs`、`process_effect_assets.py`；`EffectSpritePool` / `WeaponEffectManager` / `AreaEffectFactory` 消费 |
| `project-particles` | 2 | `effects/blood-particle.png`、`effects/spark-particle.png`，均 16×16 | Pillow 确定性绘制：`scripts/generate_particle_assets.py` → `PARTICLE_ASSET_KEYS` → `ParticleSpritePool`；血液和命中火花由 `GameScene` 使用，爆炸火花由 `AreaEffectFactory` 使用 |
| `project-ui` | 2 | `ui/keycap.png` 80×32、`ui/crosshair.png` 32×32 | Pillow 确定性绘制：`scripts/generate_ui_assets.py` → `UI_ASSET_KEYS` → 设置页按键帽 / 战斗准星；不是 Kenney 下载素材 |

以上共 104 张图片。`*_specs.json` 及生成 / 处理 / 检视脚本位于 `scripts/`，运行时配置位于 `src/config/`；`processed/` 与 `generated/` 相对 `src/assets/`，`TmpGenerate/` 位于仓库根目录。两张粒子、两张 UI 与 30 张环境调色派生共 34 张、38,268 字节，逐文件指纹均已纳入 CSV。

程序化视觉仍包括环境可读性叠层与纹理缺失回退、警报 / 冲击环、残留区轮廓、UI 面板和文字；它们不是额外的图片文件。序列帧特效、静态粒子、背景位图分别登记，不混用数量。

## 7. 排除的归档与候选

以下不计入 217 个加载文件，但只要随源码仓库分发，仍保留各自来源与适用的许可 / 署名文件：

- Ghostbyte 角色；CornerLord 的 `crawler-strip.png` / `stalker-strip.png`；Warlock's Gauntlet 四 Boss 原图；Reemax 合图；FreeArt `oddity-strip.png`。当前角色和全部感染体视觉均已改用项目生成产物。
- Kenney 旧角色实机图、持枪手层、SVG 立绘；Tiamalt Minigun、TheJosh Flamethrower 与 Kenney `weapon_machine.png` 等旧武器来源。不把归档用途写成当前产物包含其像素。
- Ark Pixel Font（仍保留 OFL 原文）、旧 `pickup-health.png`、尚未接入的场景候选包。

CornerLord / Warlock's Gauntlet 不再属于当前游戏加载集合的强制署名主体；仓库历史署名不删除。Zombies 1.1 三张遗留预载不同，仍按第 2 节保留游戏内署名。

## 8. 验证边界与维护

1. 本批静态核对加载 / 消费链、来源分类、文件存在性、PNG 元数据、217 个文件 SHA-256、音频既有 52 条指纹与改动范围；不运行测试、类型检查、构建、浏览器或音频解码。
2. 第二关历史 V3/V4 证据不扩展到 G5-5 十组新调色；新 UI / 粒子、52 文件完整音频解码、Credits 文案布局、长时视觉与真人试听均未在本轮验证。旧音频 46 文件记录与当前 52 文件口径分开。
3. 基线中的三张 AI 重火力侧视图与四张 AI 战术道具，其处理脚本输入来自 `TmpGenerate/`，受版本控制的 `generated/` 中没有对应原图。已登记产物指纹和管线，但不声称干净检出可重建这些产物；原图与采用版本的稳定归档仍需收口，不能靠重生成冒充原图。
4. 发布时须把适用的署名、原始许可和字体完整声明随发布物提供；源码目录中的 Markdown 路径不等于部署后可访问。发布包、根级源码 LICENSE、独立分发 / 再授权安排属于 P6，不由本次台账核对代替。
5. 后续每次新增、替换或退役资源，同步加载入口、来源记录、ART / AUDIO 台账、本清单、CSV 与必要的 Credits；更新基线和统计日期。G7-3 是持续维护机制，不是一次性永久完成的任务。
6. 本批执行与剩余风险见 [`2026-09-08-g7-asset-governance.md`](execution/2026-09-08-g7-asset-governance.md)。并发资源不得混进这份固定基线快照。
