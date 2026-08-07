# 音频资源维护台账

> 最后核对：2026-08-07
> 维护范围：外部原始音频、运行时派生音频、事件映射、许可证和署名要求
> 状态依据：以 `src/config/audio.ts`、`PreloadScene` 和实际关卡调用为准

## 1. 目录与生成入口

```text
src/assets/downloaded/audio/   外部原始包、原始文件、来源和许可证
src/assets/processed/audio/    游戏实际加载的派生文件与 SHA256SUMS
scripts/process_audio_assets.py
src/config/audio.ts            运行时 key、事件、音量、变体和武器映射
src/systems/SoundManager.ts    播放、限频、声像、循环和音乐生命周期
```

重新生成运行时文件：

```bash
npm run assets:audio
```

处理脚本只读取仓库内已经归档的原始资源，不访问网络。枪声裁切时间、ZIP 成员和输出路径都在脚本中固定，生成结果由 `src/assets/processed/audio/SHA256SUMS` 校验。

## 2. 外部资源

| 资源 | 作者 | 本地原始目录 | 许可证 | 运行时用途 |
| --- | --- | --- | --- | --- |
| Gunshot Sounds | Vincent Sevedge / Tabasco | `gunshot-sounds/` | CC-BY 3.0 | CZ、SKS、Mosin、Shotty 连续录音裁成单发，塑造八把武器 |
| Gun reload sounds | SpringySpringo | `gun-reload-sounds/` | CC0 1.0 | 手枪、步枪族、霰弹/发射器换弹 |
| Zombies Sound Pack | artisticdude | `zombies-sound-pack/` | CC0 1.0 | 感染体攻击前摇和死亡变体 |
| 100 CC0 SFX | rubberduck | `100-cc0-sfx/` | CC0 1.0 | 肉体/金属命中、爆炸、粉尘、拾取、波次、空弹和机械声 |
| Interface Sounds | Kenney | `kenney-interface-sounds/` | CC0 1.0 | UI 移动、确认和 Boss 警报 |
| Hurt Sound Effects | EZduzziteh | `hurt-sound-effects/` | CC0 1.0 | 玩家受伤人声变体 |
| Fire Crackling | AntumDeluge | `fire-crackling/` | CC0 1.0 | 油桶火焰残留区循环 |
| EmptyCity: Background Music | yd | `empty-city/` | CC0 1.0 | 菜单、设置和图鉴音乐 |
| Fast fight / battle music (looped) | Ville Nousiainen / XCVG | `fast-fight-battle/` | CC0 1.0 | 固定关卡与无尽模式战斗音乐 |

每个目录内的 `SOURCE.md` 记录原始下载地址、下载日期和 SHA-256；许可证原文与原始文件同目录保存。

### 枪声许可证冲突处理

OpenGameArt 条目将 Gunshot Sounds 标记为 CC0，但原始压缩包内 `sounds/creativecommons.txt` 明确声明 CC-BY 3.0。项目不采用页面上的宽松标记，统一按包内 CC-BY 3.0 执行。发布 Credits 必须包含：

```text
Gunshot recordings by Vincent Sevedge, licensed under CC BY 3.0.
```

## 3. 运行时映射

| 事件组 | 运行时文件 | 调用位置 | 规则 |
| --- | --- | --- | --- |
| 八把武器开火 | `weapons/firearm-*`、`launcher-*` | `GameScene` | 按武器映射不同源、速率和音量；多变体不连续重复 |
| 空弹、换弹、切枪、地雷布置 | `weapons/empty-*`、`reload-*`、`switch-*`、金属声 | `WeaponManager`、`ItemManager` | 只在状态实际变化后触发；取消换弹时停止过程声 |
| 肉体/金属命中 | `combat/flesh-hit-*`、`metal-hit-*` | `GameScene` | 分材质、空间化、按位置网格限频 |
| 爆炸与粉尘 | `combat/explosion-*`、`dust-burst-*` | `AreaEffectFactory` | 不同位置的连锁爆炸不会被全局冷却吞掉 |
| 火焰残留 | `world/fire-loop.ogg` | `AreaEffectFactory` | 区域生成时创建空间循环，过期/销毁/暂停时同步处理 |
| 感染体 | `characters/zombie-attack-*`、`zombie-death-*` | `EnemyAbilitySystem`、`GameScene` | 近战和特殊前摇共用受控变体，死亡独立分组 |
| Boss 阶段与死亡 | `ui/boss-alert-01.ogg`、`combat/explosion-01.ogg` | `GameScene` | 阶段切换使用高音警报；Boss 死亡使用低速空间爆炸，复用既有授权资源但保持独立语义事件 |
| 玩家受伤 | `characters/player-hurt-*` | `GameScene` | 受玩家无敌帧约束，不按碰撞帧重复播放 |
| UI、拾取、波次、结算 | `ui/*` | 各场景、HUD、`GameScene` | 非空间化，优先保持信息清楚 |
| 菜单/战斗音乐 | `music/menu.ogg`、`music/battle.wav` | 各场景通过 `SoundManager.setMusic` | 循环播放，使用音乐音量，首次用户手势后启动 |

## 4. 混音与生命周期规则

1. Phaser 管理唯一音频上下文和浏览器解锁，项目不再额外创建第二个 `AudioContext`。
2. 总音量由 Phaser 全局音量控制；音效与音乐在各自事件/循环上乘以用户设置。
3. 玩家武器、UI 和音乐居中；敌人、命中、爆炸、地雷和火焰按玩家位置计算声像与距离音量。
4. 高频事件按事件类型限制最大并发，按位置网格限频；同一位置的霰弹命中不会叠出多个峰值。
5. 暂停和抽卡会暂停音乐与世界循环，UI 音效仍可播放；恢复战斗时继续原循环。
6. 火焰区域和换弹声必须持有可停止引用，场景关闭或状态取消时显式销毁。

## 5. 维护规则

1. 新增外部音频前必须先确认作者、来源页、直接下载地址和许可证，不接受来源不明的单文件。
2. 原始文件进入 `downloaded/audio/<资源包>/`，派生文件只能进入 `processed/audio/`。
3. 修改裁切区间、ZIP 成员或输出名称时必须同步处理脚本、事件配置、台账和 SHA256SUMS。
4. 玩法代码只调用语义事件，不直接使用 Phaser 音频 key。
5. 新增高频事件必须同时定义最小间隔和最大并发；新增世界循环必须定义停止条件。
6. CC-BY、OGA-BY、CC-BY-SA 等资源必须同步更新最终 Credits；CC0 资源仍保留来源记录。

## 6. 当前验收状态

- 已归档 9 套开放授权来源。
- 已由处理脚本生成 46 个运行时音频文件。
- 已建立八把武器、战斗、感染体、世界、UI 和音乐事件映射。
- Chrome 147 已确认 46 个资源全部解码、关卡事件实际触发、空间声像和暂停/恢复/销毁正常。
- 耳机/扬声器主观混音与其他目标浏览器兼容仍需后续人工验收。
