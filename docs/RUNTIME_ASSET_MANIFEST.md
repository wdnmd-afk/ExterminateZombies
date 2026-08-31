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
| 五名可玩角色战前档案立绘 | 项目内 AI 生成（`gpt-image-2`），产物 `src/assets/processed/characters/portrait-{watcher,eagle-eye,bastion,runner,breacher}.png`（统一高 `480`，宽 `191`~`319` 随体型；守望者为母版，其余四人 2026-08-23 补齐） | 本项目 | 项目内生成资产 | `src/assets/generated/characters/SOURCE.md` |
| 五名可玩角色实机精灵 | 项目内 AI 生成（`gpt-image-2`），产物 `src/assets/processed/characters/sprite-{watcher,eagle-eye,bastion,runner,breacher}.png` | 本项目 | 项目内生成资产 | `src/assets/generated/characters/SOURCE.md` |
| `tank` 感染体（`walker`、`runner`、`lurker`、`bomber`、`drifter` 已改用项目生成素材，见第 4 节） | Zombie RPG sprites | Curt | CC0 1.0 | `src/assets/downloaded/zombies/zombie-rpg-sprites/SOURCE.md` |
| `bloater` 感染体 | Zombie and Skeleton 32x48 | Reemax | CC0 1.0 | `src/assets/downloaded/zombies/zombie-and-skeleton-32x48/SOURCE.md` |
| `oddity` 派生动画 | FreeArt - Topdown Zombies | SpriteAttack | CC0 1.0 | `src/assets/downloaded/zombies/freeart-topdown-zombies/SOURCE.md` |
| SPAS-12、MP5、M4A1、AK-47、Barrett、RPG-7、M79 战场武器**侧视图标** | Pixel Art Guns - 128x128 | aron137 | CC0 1.0 | `src/assets/downloaded/weapons/pixel-art-guns-128x128/SOURCE.md` |
| 沙漠之鹰战场武器**侧视图标** | 486 Shotgun + Desert Eagle | Leozlk | CC0 1.0 | `src/assets/downloaded/weapons/486-shotgun-desert-eagle/SOURCE.md` |
| 加特林 / 黄金 M249 / 火焰喷射器**侧视图标** | 项目内 AI 生成（`gpt-image-2`），管线见 `scripts/generate_weapon_assets.mjs` | 本项目 | 项目内生成资产 | `docs/ART_ASSET_REGISTRY.md` §10.1 |
| 11 把武器的**俯视实机贴图** | 项目自绘（`scripts/process_weapon_topdown_assets.py`） | 本项目 | 项目自绘 | `docs/ART_ASSET_REGISTRY.md` §10.1 |
| Minigun（Tiamalt，**CC-BY 3.0**）、Flamethrower（TheJosh，CC0）、Kenney `weapon_machine.png`（CC0） | 仅归档留存，**不再进入运行时产物** | Tiamalt / TheJosh / Kenney | CC-BY 3.0 / CC0 1.0 | 三份 `SOURCE.md` 均已注明 2026-08-22 起产物不含其像素 |
| 油桶、面粉桶派生图（关卡场景物 + 可携带道具掉落物） | FreeArt - Topdown extras | SpriteAttack | CC0 1.0 | `src/assets/downloaded/environment/freeart-topdown-extras/SOURCE.md` |
| 弹药拾取物 | Ammo Pack | NiceGraphic | CC0 1.0 | `src/assets/downloaded/environment/ammo-pack/SOURCE.md` |
| 强化包（生命包派生图已随生命掉落于 2026-08-22 退役，运行时不再加载） | Medicine Pack 16x16 | Kipperfalcon | CC0 1.0 | `src/assets/downloaded/environment/medicine-pack-16x16/SOURCE.md` |
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
| 爆炸冲击环、危险区预警、命中粒子、死亡反馈与残留区边界圆 | `src/systems/AreaEffectFactory.ts`、`src/scenes/GameScene.ts` |
| 枪口焰、喷火火舌与飞行火团、地面燃烧区、爆炸火球、余烟、粉尘/寒雾阻挡区共九张四帧位图 | `scripts/generate_effect_assets.mjs` + `scripts/process_effect_assets.py`（配置 `scripts/effect_asset_specs.json`），产物 `src/assets/processed/effects/*.png`；帧布局登记在 `src/config/effectVisuals.ts`，交付不变量由 `tests/effect-strip-assets.test.ts` 锁住 |
| HUD、菜单、图鉴、结算、Credits、波次横幅和战斗文字 | `src/scenes/` |

## 5. 发布前待核查

1. 阿里巴巴普惠体 3.0 官方许可协议全文尚未本地留存，正式公开发布前需补齐并复核条款。
2. 2026-08-13 新增的 5 个爽感音效派生文件与 `music/boss.ogg` 尚未做浏览器资源解码回归。
3. 若后续接入 G5 场景候选包或 UI 位图资产，必须先更新对应台账，再更新本清单和 Credits 页面。特效位图已于 2026-08-31 补齐台账与本清单条目（第 4 节），九张均为项目内生成、不引入外部授权主体。
