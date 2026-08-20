# 运行时实际使用资源清单

> 生成日期：2026-08-13
>
> 范围：当前 `PreloadScene`、`src/config/audio.ts` 与 `src/ui/fonts.ts` 实际加载的外部资源。
>
> 维护原则：只登记运行时实际加载资源；候选未下载、已下载未接入、仅保留归档但未被代码加载的资源不进入本清单。

## 1. 强制署名资源

| 运行时用途 | 资源包 | 作者 / 署名主体 | 许可证 | 本地来源记录 |
| --- | --- | --- | --- | --- |
| `crawler`、`stalker` 派生动画 | Top down shooter animated 64x64 | CornerLord | CC-BY 3.0 | `src/assets/downloaded/characters/topdown-shooter-animated-64x64/SOURCE.md` |
| `rotting` 感染体（`feral`、`bloodied`、`headless` 已改用项目生成素材，见第 4 节） | Zombies 1.1 | Svetlana Kushnariova (Cabbit) 与 Jordan Irwin (AntumDeluge) | OGA-BY 3.0+ 或 CC-BY 3.0+ | `src/assets/zombie-1.1/SOURCE.md` |
| 四个固定关卡 Boss 移动、攻击、死亡动作 | Warlock's Gauntlet Boss assets | Warlock's Gauntlet artists - rAum, jackFlower, DrZoliparia, Neil2D | CC-BY 3.0 | `src/assets/downloaded/zombies/warlocks-gauntlet-bosses/SOURCE.md` |
| 八把武器枪声裁切 | Gunshot Sounds | Vincent Sevedge / Tabasco | CC-BY 3.0 | `src/assets/downloaded/audio/gunshot-sounds/SOURCE.md` |
| UI 字体 | 阿里巴巴普惠体 3.0 `55 Regular` | 阿里巴巴（中国）有限公司；Alibaba Design；汉仪字库 | 免费商用授权，禁止修改字形/内部名称 | `src/assets/downloaded/fonts/alibaba-puhuiti-3/SOURCE.md` |

## 2. CC0 视觉资源

| 运行时用途 | 资源包 | 作者 / 整理者 | 许可证 | 本地来源记录 |
| --- | --- | --- | --- | --- |
| 五名可玩角色双手持枪主体 | Kenney Topdown Shooter `Survivor 1`、`Hitman 1`、`Soldier 1`、`Man Blue`、`Man Brown` | Kenney | CC0 1.0 | `src/assets/downloaded/characters/kenney-topdown-shooter/SOURCE.md` |
| 五名可玩角色战前档案立绘 | Kenney Topdown Shooter `Vector/vector_characters.svg` 派生，产物 `src/assets/processed/characters/portrait-*.svg` | Kenney | CC0 1.0 | `src/assets/downloaded/characters/kenney-topdown-shooter/SOURCE.md` |
| `tank` 感染体（`walker`、`runner`、`lurker`、`bomber`、`drifter` 已改用项目生成素材，见第 4 节） | Zombie RPG sprites | Curt | CC0 1.0 | `src/assets/downloaded/zombies/zombie-rpg-sprites/SOURCE.md` |
| `bloater` 感染体 | Zombie and Skeleton 32x48 | Reemax | CC0 1.0 | `src/assets/downloaded/zombies/zombie-and-skeleton-32x48/SOURCE.md` |
| `oddity` 派生动画 | FreeArt - Topdown Zombies | SpriteAttack | CC0 1.0 | `src/assets/downloaded/zombies/freeart-topdown-zombies/SOURCE.md` |
| SPAS-12、MP5、M4A1、AK-47、Barrett、RPG-7、M79 战场武器贴图 | Pixel Art Guns - 128x128 | aron137 | CC0 1.0 | `src/assets/downloaded/weapons/pixel-art-guns-128x128/SOURCE.md` |
| 沙漠之鹰战场武器贴图 | 486 Shotgun + Desert Eagle | Leozlk | CC0 1.0 | `src/assets/downloaded/weapons/486-shotgun-desert-eagle/SOURCE.md` |
| GAU-8 Gatling 战场武器贴图 | Minigun 派生 | Tiamalt | CC-BY 3.0 | `src/assets/downloaded/weapons/tiamalt-minigun/SOURCE.md` |
| Golden M249 战场武器贴图 | Kenney Topdown Shooter `weapon_machine.png` 派生 | Kenney | CC0 1.0 | `src/assets/downloaded/characters/kenney-topdown-shooter/SOURCE.md` |
| Flamethrower 战场武器贴图 | Flamethrower 配色派生 | TheJosh | CC0 1.0 | `src/assets/downloaded/weapons/thejosh-flamethrower/SOURCE.md` |
| 油桶、面粉桶派生图 | FreeArt - Topdown extras | SpriteAttack | CC0 1.0 | `src/assets/downloaded/environment/freeart-topdown-extras/SOURCE.md` |
| 弹药拾取物 | Ammo Pack | NiceGraphic | CC0 1.0 | `src/assets/downloaded/environment/ammo-pack/SOURCE.md` |
| 生命包与强化包 | Medicine Pack 16x16 | Kipperfalcon | CC0 1.0 | `src/assets/downloaded/environment/medicine-pack-16x16/SOURCE.md` |
| 绷带与急救图标（HUD 药品槽、药品掉落物） | 32px Medical Items | Airos | CC0 1.0 | `src/assets/downloaded/environment/airos-medical-items-32x32/SOURCE.md` |
| 能量饮料图标（HUD 药品槽、药品掉落物） | 32px Food Items | Airos | CC0 1.0 | `src/assets/downloaded/environment/airos-food-items-32x32/SOURCE.md` |
| 地雷场景物与掉落物 | CC0 Explosive Icons | AntumDeluge | CC0 1.0 | `src/assets/downloaded/environment/cc0-explosive-icons/SOURCE.md` |
| 玩家普通弹、爆炸弹、敌方投射物 | Endless Midnight: Zombie Swarm assets | quantumelle | CC0 1.0 | `src/assets/downloaded/environment/endless-midnight-zombie-swarm-assets/SOURCE.md` |

## 3. CC0 音频资源

| 运行时用途 | 资源包 | 作者 / 整理者 | 许可证 | 本地来源记录 |
| --- | --- | --- | --- | --- |
| 换弹音效 | Gun reload sounds | SpringySpringo | CC0 1.0 | `src/assets/downloaded/audio/gun-reload-sounds/SOURCE.md` |
| 感染体攻击与死亡音效 | Zombies Sound Pack | artisticdude | CC0 1.0 | `src/assets/downloaded/audio/zombies-sound-pack/SOURCE.md` |
| 命中、爆炸、粉尘、爽感 stinger、心跳、拾取、波次、空弹和机械声 | 100 CC0 SFX | rubberduck | CC0 1.0 | `src/assets/downloaded/audio/100-cc0-sfx/SOURCE.md` |
| UI、Boss 警报、连杀 stinger | Interface Sounds | Kenney | CC0 1.0 | `src/assets/downloaded/audio/kenney-interface-sounds/SOURCE.md` |
| 玩家受伤音效 | Hurt Sound Effects | EZduzziteh | CC0 1.0 | `src/assets/downloaded/audio/hurt-sound-effects/SOURCE.md` |
| 油桶火焰残留循环 | Fire Crackling | AntumDeluge | CC0 1.0 | `src/assets/downloaded/audio/fire-crackling/SOURCE.md` |
| 菜单、设置、图鉴、结算音乐 | EmptyCity: Background Music | yd | CC0 1.0 | `src/assets/downloaded/audio/empty-city/SOURCE.md` |
| 普通战斗音乐 | Fast fight / battle music (looped) | Ville Nousiainen / XCVG | CC0 1.0 | `src/assets/downloaded/audio/fast-fight-battle/SOURCE.md` |
| Boss 战音乐 | Trance Boss Battle | MintoDog | CC0 1.0 | `src/assets/downloaded/audio/trance-boss-battle/SOURCE.md` |

## 4. 项目内生成视觉

以下资源由项目源码或处理脚本生成，不引入额外外部授权主体；若生成源来自外部资源，已在上方对应资源包列出。

| 运行时用途 | 生成位置 |
| --- | --- |
| `walker` 四方向移动表与图鉴立绘 | 本地图片代理按 `docs/design/ZOMBIE_PROMPTS.md` 6.1 生成，产物 `src/assets/processed/zombies/walker-directional-custom.png`、`walker-portrait.png`；流程 `docs/execution/WALKER_SPRITE_PIPELINE.md` |
| `runner` 四方向移动表与图鉴立绘 | `scripts/generate_zombie_assets.mjs runner` + `scripts/process_zombie_sprites.py runner`，产物 `src/assets/processed/zombies/runner-directional-custom.png`、`runner-portrait.png`；流程 `docs/execution/2026-08-20-runner-art-resource-rework.md` |
| `lurker` 四方向移动表与图鉴立绘 | 同一管线按 id 取配置（`scripts/zombie_asset_specs.json`，采用版本 `v01`），产物 `src/assets/processed/zombies/lurker-directional-custom.png`、`lurker-portrait.png`；流程 `docs/execution/2026-08-20-lurker-art-resource-rework.md` |
| `bomber` 四方向移动表与图鉴立绘 | `scripts/generate_zombie_assets.mjs bomber` + `scripts/process_zombie_sprites.py bomber`，产物 `src/assets/processed/zombies/bomber-directional-custom.png`、`bomber-portrait.png`；流程 `docs/execution/2026-08-20-bomber-art-resource-rework.md` |
| `drifter` 四方向移动表与图鉴立绘 | 同一管线按 id 取配置（`scripts/zombie_asset_specs.json`，采用版本 `v02`），产物 `src/assets/processed/zombies/drifter-directional-custom.png`、`drifter-portrait.png`；流程 `docs/execution/2026-08-20-drifter-art-resource-rework.md` |
| `feral` 四方向移动表与图鉴立绘 | 同一管线按 id 取配置（`scripts/zombie_asset_specs.json`，采用版本 `v02`），产物 `src/assets/processed/zombies/feral-directional-custom.png`、`feral-portrait.png`；流程 `docs/execution/2026-08-20-feral-art-resource-rework.md` |
| `bloodied` 四方向移动表与图鉴立绘 | 同一管线按 id 取配置（`scripts/zombie_asset_specs.json`，采用版本 `v03`），产物 `src/assets/processed/zombies/bloodied-directional-custom.png`、`bloodied-portrait.png`；流程 `docs/execution/2026-08-20-bloodied-headless-art-resource-rework.md` |
| `headless` 四方向移动表与图鉴立绘 | 同一管线按 id 取配置（`scripts/zombie_asset_specs.json`，采用版本 `v03`），产物 `src/assets/processed/zombies/headless-directional-custom.png`、`headless-portrait.png`；流程 `docs/execution/2026-08-20-bloodied-headless-art-resource-rework.md` |
| 战场地面、边界、道路、铁轨、水道、炉栅、菌毯与非碰撞装饰 | `src/systems/BattlefieldRenderer.ts` |
| 程序化障碍物外观 | `scripts/process_environment_assets.py`（运行时由 `PreloadScene` 加载，`Obstacle` 负责显示与碰撞） |
| 爆炸、区域效果、危险区预警、命中粒子、死亡反馈 | `src/systems/AreaEffectFactory.ts`、`src/scenes/GameScene.ts` |
| HUD、菜单、图鉴、结算、Credits、波次横幅和战斗文字 | `src/scenes/` |

## 5. 发布前待核查

1. 阿里巴巴普惠体 3.0 官方许可协议全文尚未本地留存，正式公开发布前需补齐并复核条款。
2. 2026-08-13 新增的 5 个爽感音效派生文件与 `music/boss.ogg` 尚未做浏览器资源解码回归。
3. 若后续接入 G5 场景候选包、特效位图或 UI 位图资产，必须先更新对应台账，再更新本清单和 Credits 页面。
