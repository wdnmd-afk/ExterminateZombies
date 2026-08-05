# 开源音频资源接入执行文档

> 日期：2026-08-05
> 状态：已完成代码接入与 Chrome 运行时验收
> 关联总纲：`PROJECT_MASTER_PLAN.md` 5.11 音效与音乐

## 1. 目标

将当前基于 Web Audio 振荡器的占位声音替换为可追溯、可再处理、可在桌面浏览器稳定播放的开放授权音频，并把音频实际接入菜单、战斗关卡、武器、敌人能力、场景物、拾取、波次和结算流程。

完成后应满足：

1. 运行时加载真实音频文件，不再以振荡器作为正式声音来源。
2. 八把武器具备可区分的开火声音；换弹、空弹和切枪具备操作反馈。
3. 命中、感染体攻击与死亡、爆炸、火焰、玩家受伤、拾取、波次和 UI 具备对应声音。
4. 菜单与战斗使用开放授权音乐循环，并继续受现有音量设置控制。
5. 高频事件具备限频、变体和基础空间声像，不因敌群或连锁爆炸造成失真与不可读叠音。
6. 所有外部资源均保留来源、作者、许可证、原始下载地址和运行时映射记录。

## 2. 范围

### 2.1 本轮包含

1. 开放授权音频资源的来源核对、归档和许可证记录。
2. 枪声 WAV 的可复现裁切，以及 ZIP 内选定 OGG/WAV 的可复现提取。
3. Phaser 音频预加载、统一事件表、变体选择、音量、限频、声像和循环管理。
4. 菜单、设置、图鉴、HUD、关卡、武器、感染体能力、场景物、结算场景的现有音频调用迁移。
5. 换弹、空弹、切枪、感染体死亡、Boss 警报和火焰循环等缺失事件接入。
6. 音频资源台账和 README/测试清单同步。

### 2.2 本轮不包含

1. 录音棚级重新录制或付费素材采购。
2. 为每一种感染体制作完全独立的配音组。
3. 多轨自适应音乐、混响区域或复杂遮挡声学。
4. 移动端音频兼容专项。
5. 未经用户明确同意的 `test`、`typecheck`、`lint` 或 `build` 命令。

## 3. 已确认资源

| 用途 | 资源 | 作者/提交者 | 许可证结论 | 来源 |
| --- | --- | --- | --- | --- |
| 枪械开火 | Gunshot Sounds | Vincent Sevedge / Tabasco | 包内文件明确为 CC-BY 3.0；即使 OpenGameArt 页面显示 CC0，也按更严格的包内许可证署名 | <https://opengameart.org/content/gunshot-sounds> |
| 换弹与枪机 | Gun reload sounds | SpringySpringo | CC0 | <https://opengameart.org/content/gun-reload-sounds> |
| 感染体声音 | Zombies Sound Pack | artisticdude | CC0 | <https://opengameart.org/content/zombies-sound-pack> |
| 命中、爆炸、金属与提示 | 100 CC0 SFX | rubberduck | CC0 | <https://opengameart.org/content/100-cc0-sfx> |
| UI | Interface Sounds | Kenney | CC0 | <https://opengameart.org/content/interface-sounds> |
| 玩家受伤 | Hurt Sound Effects | EZduzziteh | CC0 | <https://opengameart.org/content/hurt-sound-effects> |
| 火焰循环 | Fire Crackling | AntumDeluge | CC0 | <https://opengameart.org/content/fire-crackling> |
| 菜单音乐 | EmptyCity: Background Music | yd | CC0 | <https://opengameart.org/content/emptycity-background-music> |
| 战斗音乐 | Fast fight / battle music (looped) | Ville Nousiainen / XCVG | CC0 | <https://opengameart.org/content/fast-fight-battle-music-looped> |

## 4. 操作步骤

1. 在 `src/assets/downloaded/audio/` 按资源包建立原始资源目录，保存原始下载文件、`SOURCE.md` 和许可证文本。
2. 新增 `scripts/process_audio_assets.py`，从原始 ZIP 中提取选定文件，并按固定时间段裁切枪声 WAV，生成 `src/assets/processed/audio/` 运行时文件。
3. 新增音频资产与事件配置，明确每个事件的候选文件、默认音量、播放速率、随机范围、限频、并发和是否允许空间声像。
4. 在 `PreloadScene` 注册全部运行时音频；加载失败时让 Phaser 显式报告资源 key，而不是静默回退到不明声音。
5. 重构 `SoundManager`：使用 Phaser 的唯一音频上下文，保存现有主/音效/音乐设置，管理音乐和世界循环，支持 `play`、`playAt`、`startLoopAt`、`stopLoop`。
6. 在 `WeaponManager` 接入开火之外的空弹、换弹开始/完成和切枪事件；切枪取消换弹时同步停止对应过程反馈。
7. 在 `GameScene`、`EnemyAbilitySystem`、`AreaEffectFactory` 接入空间化命中、感染体能力、死亡、爆炸、火焰循环、Boss 波次和场景事件。
8. 保持所有菜单与 HUD 通过统一 `SoundManager` 播放 UI 声音，禁止场景直接使用裸音频 key。
9. 建立 `docs/AUDIO_ASSET_REGISTRY.md`，记录原始文件、处理输出、使用事件和署名要求，并同步 README 与人工验收清单。
10. 启动开发服务器，通过浏览器检查音频缓存、解码状态、场景切换、音量设置、关卡事件和暂停恢复。

## 5. 实施建议

1. 对玩家开火采用预裁切单发样本，在运行时通过音量和播放速率塑造八把武器的差异，避免每次播放包含多发录音。
2. 射击、命中和感染体声音使用多个变体轮换；同一事件避免连续重复同一文件。
3. 玩家武器、UI 和音乐保持居中；敌人、爆炸、场景物和火焰按世界横坐标计算左右声像。
4. 霰弹一次开火只播放一个开火声；同帧多弹丸命中继续受命中限频保护。
5. 音效限频按事件组处理，Boss 警告、玩家受伤和空弹优先于普通感染体声音。
6. 对循环声音保存句柄并在区域过期、场景关闭、暂停和返回主菜单时显式停止或暂停。
7. 设置页仍只暴露总音量、音效和音乐，内部事件音量由配置管理，避免增加不必要的设置复杂度。

## 6. 潜在风险分析

| 风险 | 影响 | 处理方式 |
| --- | --- | --- |
| 枪声页面许可证与包内许可证不一致 | 错误宣称 CC0 会遗漏署名义务 | 按包内 CC-BY 3.0 执行，保留原文并在台账和 Credits 中署名 Vincent Sevedge |
| 原枪声录音包含多个连续击发 | 直接播放会与武器射速脱节 | 用固定时间段裁切为独立单发，处理脚本保存全部参数 |
| WAV 文件增加下载体积 | 首次进入时间变长 | 只输出被实际使用的裁切文件；复用样本和速率塑造测试武器 |
| 浏览器自动播放限制 | 菜单音乐首次进入可能无声 | 统一使用 Phaser 解锁流程，并在 `unlocked` 事件后启动已请求音乐 |
| 高频自动武器与敌群叠音 | 削波、听觉疲劳、危险提示被遮盖 | 设置限频、并发上限、音量层级和事件优先级 |
| OGG 在个别环境无法解码 | 部分事件无声 | 保留 WAV/MP3 来源并在目标桌面浏览器做解码检查；必要时再补统一备用格式 |
| 暂停后循环继续播放 | 状态与听感不一致 | 将音乐和世界循环纳入统一暂停/恢复与场景清理 |
| 资源来源不可复现 | 后续无法确认合法性和生成过程 | 保存原始下载、SHA-256、来源页、许可证和确定性处理脚本 |

## 7. 优化方案

1. 首轮以事件辨识度和稳定播放为优先，完成听感验收后再决定是否压缩 WAV 或增加备用编码。
2. 若运行时内存明显上升，再把多段短音效打包为音频精灵；本轮不提前增加音频精灵复杂度。
3. 若无尽模式后期感染体声音仍拥挤，按玩家距离保留最近声音，并降低远处普通感染体的并发上限。
4. 后续可把 Boss 音乐和特殊能力独立成更高优先级总线，但不改变本轮公开事件接口。
5. 后续若制作正式录音，可只替换事件表中的资源映射，不改玩法调用链。

## 8. 验证方式

### 8.1 静态与调用链检查

1. 核对每个运行时音频 key 都有预加载项和实际事件引用。
2. 核对所有外部文件均能追溯到来源、许可证和处理步骤。
3. 核对音乐、世界循环在场景关闭时释放，短音效不持有无界引用。
4. 核对音量设置仍经 `SaveManager` 归一化并持久化。
5. 核对枪声、命中、爆炸和感染体事件的限频不会屏蔽玩家受伤或 Boss 警告。

### 8.2 浏览器运行时检查

1. 首次用户输入后菜单音乐开始播放，音频缓存中不存在失败项。
2. 进入第一关后战斗音乐切换，四把正式武器和四把测试武器均能产生不同听感。
3. 空弹、手动换弹、自动换弹、切枪和换弹取消与实际武器状态一致。
4. 命中感染体、命中障碍、击杀感染体、玩家受伤和拾取分别触发对应声音。
5. 冲刺、远程、震荡与轰炸前摇具备可听提示，Boss 波次具备独立警报。
6. 油桶、面粉桶、地雷和爆炸武器触发空间化爆炸；火焰区域存在时循环播放并在消失时停止。
7. 暂停、抽卡、返回主页、继续游戏和场景结算不会遗留战斗循环。
8. 三条音量滑杆即时影响对应声音并在刷新后保持。

### 8.3 命令限制

本轮默认不运行 `npm test`、`npm run typecheck`、`npm run build` 或其他全量检查。若需要这些命令作为追加证据，先说明原因、预计耗时并取得用户明确同意。

## 9. 可追溯结果记录

### 9.1 实际交付

1. 在 `src/assets/downloaded/audio/` 归档 9 套开放授权来源，每套均包含 `SOURCE.md` 和许可证原文。
2. 新增 `scripts/process_audio_assets.py` 与 `npm run assets:audio`，从原始 ZIP 提取选定资源并把连续枪声裁成独立单发。
3. 在 `src/assets/processed/audio/` 生成 46 个运行时音频文件，覆盖武器、角色、战斗、世界、UI 和音乐。
4. 新增 `src/config/audio.ts`，集中维护 46 个 Phaser key、事件变体、音量、速率、限频、并发、空间化、音乐和武器映射。
5. 重构 `SoundManager` 使用 Phaser 的唯一音频上下文，接入用户音量、浏览器解锁、事件变体、按位置限频、空间声像、循环句柄和暂停/恢复。
6. 修改 `BootScene`、`PreloadScene`、`GameScene`、`WeaponManager`、`ItemManager`、`EnemyAbilitySystem`、`AreaEffectFactory`，把真实声音接入菜单和关卡调用链。
7. 新增 `docs/AUDIO_ASSET_REGISTRY.md`，并同步 README、总规划和人工测试清单。

### 9.2 资源校验

1. 四个原始 ZIP 均通过 `unzip -t` 完整性检查。
2. 直接下载的 WAV、MP3、OGG 均由文件头识别为对应音频格式。
3. `scripts/process_audio_assets.py` 生成 `src/assets/processed/audio/SHA256SUMS`。
4. 在运行时音频根目录执行 `sha256sum -c SHA256SUMS`，46 项全部返回 `OK`。
5. 原始下载 SHA-256 分别记录在各资源包的 `SOURCE.md` 中。

### 9.3 浏览器运行时验收

验收环境：Windows，Chrome 147.0.7727.56 Headless，Vite 开发服务器 `http://127.0.0.1:5181/`。

1. 干净页面加载后音频缓存包含 46 个 key，全部解码为 `AudioBuffer` 且时长大于零。
2. 初始 `game.sound.locked === true`；发送真实鼠标输入后变为 `false`，菜单音乐开始循环。
3. 从 `MainMenuScene.launchRun` 正常进入第一关后，仅 `GameScene + HUDScene` 活跃，战斗音乐与第一波提示实际播放。
4. 八把武器逐项触发到 CZ、SKS、Shotty、Mosin、RPG 和 M79 对应资源，没有回退到合成音。
5. 空弹触发 `empty` 和手枪换弹；换弹中切枪后 `isReloading` 由 `true` 变为 `false`，换弹声音立即收到 `destroy`。
6. 子弹与感染体真实物理重叠后触发肉体命中和感染体死亡，双方对象按原逻辑回收。
7. 子弹与障碍真实物理重叠后触发金属命中。
8. 地雷布置触发机械声，并在敌群靠近后继续触发爆炸和感染体死亡声音。
9. 油桶爆炸后同时播放空间化爆炸和火焰循环；位于玩家左侧时两者 `pan = -0.259`。暂停后音乐/火焰均进入 `isPaused`，恢复后继续，区域销毁后火焰声音对象消失。
10. 面粉桶位于玩家右侧时播放独立粉尘声音，`pan = 0.281`。
11. 第二关 Boss 波次实际触发 `audio.ui.boss-alert.01`。
12. 临时调整音量后 Phaser 总音量、音乐实例和 UI 实例分别即时更新为预期乘积，随后恢复原设置。
13. 干净启动未捕获应用运行时异常；仅有项目现存的 `/favicon.ico` 404，与音频资源和调用链无关。

### 9.4 未执行验证与剩余风险

1. 按用户全局规则，未运行 `npm test`、`npm run typecheck`、`npm run build` 或 lint。
2. 已执行代码审阅、调用链检查、资源完整性/哈希检查、Vite 开发运行和 Chrome 实际场景验收。
3. Headless Chrome 可以证明加载、解码、播放状态、音量、声像和生命周期，不能代替人在耳机与扬声器上的主观响度、音色和疲劳度判断。
4. Firefox、Edge 与 Safari 的听感和格式兼容仍需发布阶段专项复核。
5. 当前原始音频约 21 MB、运行时音频约 12 MB；若首屏加载预算不满足发布目标，再评估统一转码或分场景延迟加载。
