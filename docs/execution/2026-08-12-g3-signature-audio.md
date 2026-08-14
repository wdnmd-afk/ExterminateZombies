# 2026-08-12 G3-2 爽感专属音效事件

> 状态：已实施并完成 V0；2026-08-14 V1 与类型检查通过，生产构建、浏览器解码与 V6 听感待验。

## 1. 目标

补齐暴击、处决、穿透、连杀播报和濒死心跳五个爽感语义事件的运行时资源映射，让战斗逻辑只调用稳定事件名，后续主观混音或素材替换不再牵动 `GameScene` 命中结算。

## 2. 范围

本轮只处理 G3-2 的客观实现闭环：

1. 从已归档 `100-cc0-sfx` 与 `kenney-interface-sounds` 中抽取独立派生文件，不新增外部下载源。
2. 更新 `scripts/process_audio_assets.py`、`src/config/audio.ts`、相关配置测试和音频台账。
3. 核对 `GameScene` 已有触发点：暴击、处决、M4A1 签名穿透、连杀里程碑、濒死心跳。
4. 不在本轮调整混音主观参数、不新增 Boss BGM、不执行 V6 耳机/扬声器实听；这些仍归 G3-4。

## 3. 操作步骤

1. 读取 `LONG_TERM_OPTIMIZATION_GOALS.md`、音频台账、处理脚本、`audio.ts`、`SoundManager`、`GameScene` 和现有测试，确认字段与调用链。
2. 在处理脚本中登记 5 个派生文件：
   - `combat/critical-stinger-01.ogg`
   - `combat/execute-stinger-01.ogg`
   - `combat/pierce-stinger-01.ogg`
   - `ui/streak-stinger-01.ogg`
   - `combat/heartbeat-thump-01.ogg`
3. 更新 `AUDIO_ASSET_KEYS`、`AUDIO_ASSETS` 与 `AUDIO_EVENT_DEFS`，让五个语义事件不再复用通用命中、爆炸、波次或受伤文件。
4. 增强配置测试，锁定这些事件使用专属派生 asset key。
5. 运行项目既有音频处理脚本生成派生文件和 `SHA256SUMS`。
6. 同步 `AUDIO_ASSET_REGISTRY.md` 和本文档状态。

## 4. 实施建议

优先用已归档 CC0 包内资源完成语义分离，避免为了“专属”引入新许可证链路。音色是否真正闭眼可辨属于 G3-4 主观实听结论，本轮只能证明资源映射、触发链和合规来源完整。

## 5. 潜在风险

1. 现有 CC0 包的文件名只能表达大致音色，无法替代真人听感判断。
2. 心跳采用节拍式 one-shot 事件循环，不是连续 loop；如果 V6 认为不自然，再按 §3.3 候选补充真实 heartbeat loop。
3. 新增派生文件会改变运行时音频总数，台账、预加载与哈希必须一起更新。

## 6. 优化方案

1. 若 V6 反馈五个事件仍不够可辨，保留语义事件名，仅替换 `AUDIO_EVENT_DEFS` 的 asset key。
2. 若心跳节奏疲劳，可先调整 `GameScene.syncLowHealthFeedback` 的 Timer delay 与 `heartbeat` 的 volume/rate，再考虑新增外部 heartbeat loop。
3. 若高密度战斗里 stinger 过多，优先通过 `minInterval` 与 `maxVoices` 收敛，不在战斗逻辑里加分支。

## 7. 验证方式

1. V0：静态审阅脚本、配置、调用链、台账与生成文件清单。
2. V1/V2 建议命令：`npm test -- tests/audio-priority.test.ts`、`npm run typecheck`。
3. G3-4/V6：耳机与扬声器实听，确认暴击/处决/穿透闭眼可分辨、心跳不疲劳、连杀播报不刺耳。

## 8. 实施结果（2026-08-13）

1. `scripts/process_audio_assets.py` 已从既有 CC0 包生成 5 个独立派生文件：
   - `combat/critical-stinger-01.ogg`
   - `combat/execute-stinger-01.ogg`
   - `combat/pierce-stinger-01.ogg`
   - `combat/heartbeat-thump-01.ogg`
   - `ui/streak-stinger-01.ogg`
2. `src/config/audio.ts` 已新增对应 `AUDIO_ASSET_KEYS` 与预加载条目；`critical`、`execute`、`pierce`、`streak`、`heartbeat` 五个事件均指向专属派生 key。
3. `GameScene` 现有触发链已核对：命中结算触发暴击/处决/穿透事件，连杀里程碑触发 `streak`，低血量状态启动并停止 `heartbeat` TimerEvent。
4. `tests/audio-priority.test.ts` 已锁定五个语义事件的优先级与专属 asset key，防止回退到通用命中/爆炸/波次/受伤文件。
5. 已运行 `python scripts/process_audio_assets.py`，生成本轮 5 个派生文件并更新 `src/assets/processed/audio/SHA256SUMS`；叠加同工作区 G3-3 的 `music/boss.ogg` 后，运行时音频总数为 52 个。
6. 已同步 `docs/AUDIO_ASSET_REGISTRY.md` 与 `docs/design/LONG_TERM_OPTIMIZATION_GOALS.md`。

## 9. 剩余风险

1. 未执行 `npm test -- tests/audio-priority.test.ts` 与 `npm run typecheck`，需用户授权后补跑。
2. 未执行浏览器资源解码回归，新 5 个文件尚未在 Chrome/Edge/Firefox 中实际解码验证。
3. 未执行 V6 主观实听；“闭眼可分辨”和“心跳不疲劳”不能由本轮静态核查证明。
