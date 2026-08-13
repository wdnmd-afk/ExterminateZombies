# 交接文档：2026-08-13 工作区收口

> 面向对象：下一个接手本项目的 Agent
>
> 生成日期：2026-08-13
>
> 对应提交：本文档随同一次提交进入仓库，提交前的基线是 `e92d51c`
>
> 文档定位：说明本次提交里**哪些已经完成、哪些只完成了一半、哪些完全没做**，避免下一个 Agent 把"已实施"误读为"已验证通过"。

## 1. 一句话现状

四组任务（G2-6 / G3-2 / G3-3 / G7-2）的**代码与资源实现已经收口，并且已完成 V0 静态审阅**；但**全部命令验证（V1/V2）与全部浏览器实景验证（V3/V4/V5）都没有执行**，V6 真人主观验收同样未做。因此本次提交的准确口径是"实现完成，验证未做"，不是"功能已通过"。

## 2. 本次提交的范围

| 组 | 任务 | 实现状态 | 验证状态 | 执行文档 |
| --- | --- | --- | --- | --- |
| G2-6 | 后四把武器爽感定位（AK-47/Barrett/RPG-7/M79） | 已完成 | 仅 V0 | `docs/execution/2026-08-13-g2-back-four-weapon-feel.md` |
| G3-2 | 五个爽感专属音效（暴击/处决/穿透/连杀/心跳） | 已完成 | 仅 V0 | `docs/execution/2026-08-12-g3-signature-audio.md` |
| G3-3 | Boss 独立 BGM | 已完成 | 仅 V0 | `docs/execution/2026-08-13-g3-boss-bgm.md` |
| G7-2 | 运行时实际使用资源清单 | 已完成 | 仅 V0 | `docs/execution/2026-08-13-g7-runtime-asset-manifest.md` |
| 收口 | 上述四组的交叠问题修正 | 已完成 | 仅 V0 | `docs/execution/2026-08-13-uncommitted-worktree-closure.md` |

提交内容规模：21 个已跟踪文件修改，6 个新增音频文件、1 个新增下载资源目录、5 个新增文档。仓库因 `boss.ogg`（原始 + 派生各约 3.4 MB）增加约 6.8 MB。

## 3. 已完成的内容

### 3.1 G2-6 后四把武器

1. `AK-47`：射速/弹匣提高，`movementPenalty:0.65` 支撑移动压制，穿透 2。
2. `Barrett M82`：`damage:210`、`penetration:8`、`critChance:0.15`、`knockback:220`、`chainBonus:1.08`，并新增 `killSlowMotionTier:'A'`。
3. `RPG-7`：爆炸 `damage:260`、`radius:170`，单发慢装。
4. `M79`：新增 `bounceCount:1`，命中障碍先反弹一次再爆炸。
5. 新增两个字段 `killSlowMotionTier`、`bounceCount`，已在 `validate.ts` 加启动期值域校验。

### 3.2 G3-2 爽感专属音效

`critical`、`execute`、`pierce`、`streak`、`heartbeat` 五个事件不再复用通用命中/爆炸/波次/受伤素材，改为从已归档 CC0 包派生的 5 个独立文件。

### 3.3 G3-3 Boss 独立 BGM

新增 CC0 素材 `Trance Boss Battle`（MintoDog），`MusicMode` 扩展为 `'menu' | 'battle' | 'boss'`，Boss 波次公告时切轨。

### 3.4 G7-2 运行时清单

新增 `docs/RUNTIME_ASSET_MANIFEST.md`，只登记实际被 `PreloadScene` / `audio.ts` / `fonts.ts` 加载的资源；同步修正 Credits 页面署名主体。

### 3.5 收口修正（重要，属于上一轮发现的"文档说已做、代码只做一半"）

1. **M79 反弹轴判定**：原实现按"弹体相对障碍中心"选轴，长条障碍边缘命中会选错轴。已改为 `resolveObstacleBounceSurface()` 纯函数，用上一帧到当前帧的扫掠线段求进入面。
2. **M79 射程语义**：原实现按"枪口到当前位置"直线距离，反弹后不能表示折线路径。已改为累计飞行路径 `traveledDistance`。
3. **M79 推离距离**：原固定 `8px` 不足以覆盖"弹体半径 + 单帧穿入深度"，同一输入会在"成功反弹"和"下一帧立即爆炸"之间抖动。已改为按实际碰撞轴放到障碍 AABB 外侧 `半径 + 1px`。
4. **Boss 音乐挂起恢复**：原 `handleWake()` 无条件切回 `battle`，Boss 战挂起后返回会退回普通 BGM。已新增 `GameScene.battleMusicMode` 显式保存当前战斗曲目。
5. **玩家素材署名错误**：清单与美术台账原把玩家登记为 Ghostbyte，实际 `PreloadScene` 加载的是 Kenney `Survivor 1/survivor1_hold.png`。已把 Ghostbyte 改回"已下载未接入"，并从 Credits 强制署名中移除。
6. **障碍纹理来源错误**：原写成 `Obstacle.ts` 程序绘制，实际由 `scripts/process_environment_assets.py` 生成、`PreloadScene` 加载。已修正。

## 4. 本轮 V0 实际核对到的事实

以下是本次提交前静态核对过的结论，下一个 Agent 可以直接复用，不必重查：

1. 字段链路完整：`types.ts` → `validate.ts` → `weapons.ts` → `WeaponManager.fire()` → `Bullet.fire()` → `GameScene`，池化 `Bullet` 每次 `fire()` 都显式复位这两个新字段。
2. `SlowMotionManager.requestByTier()` 确实存在（`src/systems/SlowMotionManager.ts:38`）。
3. `Obstacle.body` 声明为 `Phaser.Physics.Arcade.StaticBody`，`left/right/top/bottom` 可用。
4. Barrett 击杀判定 `damage >= zombie.health` 取的是**伤害结算前**的血量，位置在 `damageZombie()` 之前，判定正确。
5. 五个音效事件都有真实触发点：`GameScene.ts:769-771`（暴击/处决/穿透）、`:904`（连杀）、`:921-922`（心跳 TimerEvent 循环）。心跳不再是"已登记未接入"。
6. 音频数量三方一致：磁盘 52 个文件（27 ogg + 22 wav + 3 mp3）= `SHA256SUMS` 52 条 = `audio.ts` 52 个 import = `AUDIO_ASSETS` 52 条，无缺漏、无多余。
7. `boss.ogg` 的 SHA-256 与下载目录原始文件一致（`16e6949a…`），下载目录已有 `SOURCE.md` 与 `LICENSE-CC0-1.0.txt`。
8. **每波都调 `setMusic` 不会重启音乐**：`SoundManager.ensureMusic()` 对同模式有早退保护（只调音量、不 stop/destroy），因此 `announceWave` 每波调用是幂等的，没有引入"每波音乐从头播"的回归。
9. 音乐回落链路完整：`LevelClearScene`、`GameOverScene`、`MainMenuScene`、`SettingsScene`、`CreditsScene`、两个图鉴场景都调 `setMusic('menu')`。
10. `git diff --check` 通过，无空白错误。

## 5. 未完成事项

### 5.1 命令验证：全部未执行（最高优先级）

| 层级 | 命令 | 状态 |
| --- | --- | --- |
| V1 | `npm test`（当前 17 个测试文件、约 155 个 `it`） | **未执行** |
| V1 定向 | `npm test -- tests/weapon-combat-rules.test.ts tests/config-integrity.test.ts tests/audio-priority.test.ts` | **未执行** |
| V2 | `npm run typecheck` | **未执行** |
| V2 | `npm run build` | **未执行** |

本次改了 `.ts` 类型契约（`WeaponDef` 新增两个字段、`MusicMode` 扩展枚举、`WeaponCombatRules` 新增导出），按 `TESTING_RULES.md` 第 5 章决策树属于"改动类型契约"，最低要求是 V0+V1+V2+V3。**当前只做到 V0，缺口是三层。**

> 注意：本项目规则要求执行任何命令前必须先向用户提交授权确认单并等待明确同意（`TESTING_RULES.md` §3）。不要直接跑。仅跑 V1 时可用 §3.4 轻量确认。

### 5.2 浏览器实景验证：全部未执行

| 待验项 | 层级 | 说明 |
| --- | --- | --- |
| 6 个新音频文件解码 | V3 | 5 个 stinger + `boss.ogg`，Chrome 147 的历史解码记录只覆盖 2026-08-07 的 46 个旧文件 |
| Boss 波次切轨 | V4 | 进入带 Boss 的固定关卡，确认切到 `boss` 曲目 |
| Boss 战挂起恢复 | V4 | Boss 波 → ESC → 返回主菜单 → 继续原局，确认回到 Boss 曲目而不是普通战斗曲 |
| 后四把武器手感 | V4/V5 | AK 压制、Barrett 一击必杀慢动作、RPG 清屏、M79 弹跳 |
| M79 长条障碍反弹 | V4 | 重点测横向/纵向命中与**角点命中**，角点仍是离散近似，未实景确认 |
| Credits 页面 | V3/V4 | 文本行数增加后是否在 `1280 × 720` 内溢出，返回路径是否可用 |
| RPG 大半径爆炸 | V4/V5 | 自伤风险与性能压力 |

### 5.3 真人主观验收（V6，Agent 不能代替）

1. 五个 stinger 是否闭眼可分辨，心跳是否疲劳。
2. Boss BGM 的响度、循环点、切换突兀程度（归 G3-4）。
3. 后四把武器是否能明确说出各自"最爽瞬间"。
4. Barrett 伤害 210 是否过高、是否压缩 Boss 阶段；数值需试玩收敛。

### 5.4 本轮范围外、仍然待办的长期目标

1. **G2-7 强化卡爽感化**：纯数值卡替换为打法变异卡，未开始。
2. **G3-4 主观混音验收**：耳机 + 扬声器两轮实听、多浏览器解码复核，未开始。
3. **清屏爆发音效**：按 C-8 冻结至 P3，本轮未做。
4. **阿里巴巴普惠体官方许可协议全文**：本地仍未留存，正式公开发布前必须补齐。
5. **分武器持枪动画**：8 把武器仍共用 Kenney Survivor 同一持枪姿态。
6. **正式位图环境素材**、第二至第十关逐关试玩，仍缺失。

## 6. 文档口径问题

本次提交已修正两处会误导状态判断的口径：

1. `docs/execution/2026-08-12-g3-signature-audio.md` §8 第 5 条原写"生成 51 个运行时音频文件"，实际是 **52 个**（该条写于 `boss.ogg` 加入之前）。已改为区分本轮 5 个派生文件与叠加 `boss.ogg` 后的总数 52。
2. `docs/execution/2026-08-13-uncommitted-worktree-closure.md` 状态行原写"实施中；代码修复……待执行"，实际第 4 章的代码修复已全部落地。已改为"代码修复与最终 V0 复核已完成，V1/V2 与 V3-V6 待授权"。

仍需保留、不要误删的表述：

1. `README.md` 里"`npm run typecheck` 与 `npm run build` 在最近一轮改动后尚未重新执行"在本次提交后依然成立。
2. `docs/AUDIO_ASSET_REGISTRY.md` §6 里"Chrome 147 解码记录仍覆盖 2026-08-07 的 46 个旧文件"是刻意保留的缺口说明，补测通过后才可更新。

## 7. 风险提示

1. **不要把本次提交当作已验证基线**。如果后续出现武器数值、音频或反弹问题，先跑 V1/V2 定位，再考虑是本轮引入还是既有问题。
2. **M79 反弹是离散碰撞近似**。Arcade overlap 不提供碰撞法线，`resolveObstacleBounceSurface()` 用扫掠线段还原进入面，并在"上一帧已在 AABB 内"时退化为最近边界。角点命中的表现必须靠 V4 实景确认，不能靠读代码下结论。
3. **M79 改累计路径后，爆炸位置可能比旧实现更早到达射程上限**，需要试玩判断节奏是否变差。
4. **Barrett 慢动作与穿透慢动作可能叠加**：`hitCount >= 4` 的穿透高光和 `killSlowMotionTier` 是两个独立入口，同一枪穿透多个目标时是否请求过多慢动作，未实景确认。
5. **音频文件可静态存在但仍被浏览器拒绝解码**，V0 的哈希与数量核对不能代替 V3。
6. 本次改动跨 20+ 个源码、测试、文档和二进制资源文件。验证失败时按 G2 / G3 / G7 归属定位，不要在验证通过前继续叠加新功能。

## 8. 建议执行顺序

1. 读 `TESTING_RULES.md`（授权门禁与 V0-V6 口径）与本文档。
2. 向用户提交 V1 轻量确认单，跑定向测试：`npm test -- tests/weapon-combat-rules.test.ts tests/config-integrity.test.ts tests/audio-priority.test.ts`。
3. 通过后申请全量 `npm test` + `npm run typecheck`（本轮改了类型契约，必须补 V2）。
4. 申请 V3/V4：`npm run dev` 起服务，按 §5.2 表格逐项验收，重点是 6 个新音频解码、Boss 切轨与挂起恢复、M79 长条障碍反弹。
5. 全部客观项通过后，更新四份执行文档的状态行与 §6 的三处口径问题，再把 `LONG_TERM_OPTIMIZATION_GOALS.md` 中 G2-6 从"主实现完成"改为对应结论。
6. V6 主观项交给用户，Agent 不得代替结论。

## 9. 关键文件索引

| 关注点 | 文件 |
| --- | --- |
| 新增武器字段定义 | `src/config/types.ts` |
| 启动期值域校验 | `src/config/validate.ts` |
| 后四把数值 | `src/config/weapons.ts` |
| 反弹面纯函数 | `src/systems/WeaponCombatRules.ts` |
| 反弹与累计路径 | `src/entities/Bullet.ts` |
| 障碍命中分支、Boss 音乐、击杀慢动作 | `src/scenes/GameScene.ts` |
| 音频 key / 事件 / 音乐模式 | `src/config/audio.ts` |
| 音乐切轨早退保护 | `src/systems/SoundManager.ts` |
| 音频派生映射 | `scripts/process_audio_assets.py` |
| 运行时资源清单 | `docs/RUNTIME_ASSET_MANIFEST.md` |
| 测试规范与授权门禁 | `TESTING_RULES.md` |
| 长期目标与进度 | `docs/design/LONG_TERM_OPTIMIZATION_GOALS.md` |
