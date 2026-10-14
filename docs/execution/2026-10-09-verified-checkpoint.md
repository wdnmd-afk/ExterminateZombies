# 2026-10-09 已验收修复提交检查点

## 目标与范围

按用户“先把验收通过的提交一版并且推送”的要求，只提交四项已完成命令和实景验证的生产修复及对应回归：血液设置入口、阶段奖励提示被抽卡覆盖、环境位图遮挡战术叠加、旧场景鼠标松开误触新按钮。

本版生产文件为 `src/scenes/SettingsScene.ts`、`src/scenes/GameScene.ts`、`src/systems/BattlefieldRenderer.ts`、`src/ui/components.ts`；测试为 `tests/settings-accessibility.test.ts`、`tests/wave-reward-rules.test.ts`、`tests/battlefield-render-order.test.ts`、`tests/action-button.test.ts`。

明确排除仍待实景的 `src/ui/debrief.ts`、`tests/debrief-layout.test.ts`、相关新驱动、未结束自然局和未完整回填的滚动文档。保留全部工作区改动，不重置、不清理旧证据、不强推。

## 操作步骤

1. 确认当前 `main`、远端 `origin/main` 和索引状态；先拉取远端引用，若发生分叉停止推送，不自动变基或覆盖其他提交。
2. 审阅四条实现、调用链及对应测试，逐项核对已完成实景的结果、前置条件和源文件哈希。
3. 仅暂存上述八个源文件；用 `git checkout-index` 导出独立、忽略的验证副本，确保不把工作区未提交的结算排版及额外测试混入验证。
4. 在副本运行全量 Vitest、图片代理测试、类型检查、构建及全部产物 HTTP/字节/MIME 核对；保存命令、输出、文件指纹和实际结果。
5. 验证通过后归档四项修复的选定结果、前置和截图，补充本检查点实际结果。再次核对暂存路径、大小和代码指纹，提交一版并正常推送当前分支。
6. 核对远端 SHA 与本地提交一致，汇报提交号、验证范围及仍留在工作区的待验内容。

## 实施建议与优化

采用显式文件白名单，不使用 `git add .`。原有验收目录含数千份过程记录，只收录与本版四项修复直接相关的、已结束批次证据。独立快照使用原有依赖，不安装依赖或修改锁文件；生产游戏进程不受源码变更影响。

## 风险与边界

- 工作区最新934用例包含尚未实景复验的结算排版；不能用其数量冒充本次局部提交的结果。本版须独立运行并记录实际用例数。
- 血液/闪光与图层、按钮验收包含受控前置，只证明对应呈现/交互，不证明自然战斗难度。阶段提示的首次/已有许可取自自然输入批次。
- 已完成批次的截图、结果和 sourceHashes 是历史实测证据，不重写原始记录。图层批次曾记录 Chrome 关闭确认失败，不将其改写为正常关闭。
- 只提交有确证的修复，不顺带提交自然战役、完整Boss、狂潮爆破、真人V6或目标设备性能的“完成”结论。

## 验证方式与实际结果

本版命令证据目录为 `evidence/2026-10-09-verified-checkpoint-r01/`。2026-10-09 14:20 独立快照验证通过：

- 全量 Vitest：**54文件 / 930用例通过，0失败**；图片代理：**9/9通过**。
- 类型检查、Vite构建、暂存区空白检查均通过；生产预览125个文件的HTTP状态、MIME和字节一致性全部通过，预览服务已关闭。
- 产物共92,831,326字节；主JS为 `assets/index-lOb3GoyK.js`，2,154,030字节，gzip 599,741字节。独立检出的HTML换行与空行比历史工作区构建多14字节，核对非空行内容一致；其余124份产物的哈希与字节完全一致。保留大包警告，不据此给出目标设备性能认证。
- 导出的八个源文件与索引blob一致；结算排版 `src/ui/debrief.ts` 保持本次提交基线HEAD版本，未混入本地待实景修改。该版930与完整工作区934是不同范围，不相加、不混称。
- 选定109份已结束批次的实景证据，共7,683,323字节；路径与SHA-256见 `accepted-evidence-manifest.json`。四条修复各自的生产源文件哈希与相应实景session记录一致。

| 修复 | 已核对的实景证据（相对 `evidence/2026-10-08-scene-acceptance/`） | 范围 |
| --- | --- | --- |
| 血液设置入口 | `visual-r01/result.json`、三档observed与设置/战斗截图 | 真实设置操作与刷新持久化；战斗特效目标使用受控前置 |
| 抽卡覆盖阶段提示 | `isolation-r02/first-license-wide-checks.json`、`existing-license-narrow-checks.json`及visible-notice截图 | 首次/已有许可、宽窄视口的自然输入实景，队列后提示可见 |
| 位图遮挡战术叠加 | `environment-r03/result.json`、11主题bitmap/fallback状态与原图 | 受控图层、缺图回退和碰撞；不评价美术风格或真人观感 |
| 跨场景松开误触按钮 | `buttons-after-r02/result.json`、`cross-scene-release.json/png`、正常点击截图 | 独立结算前置下真实鼠标与键盘，六条交互判据通过 |

`snapshot-manifest.json`记录基线提交和导出时的源代码树；随后加入的本说明及证据只增加文档，不改变已验证的八个源文件。复验本版可运行 `npm test`、`npm run test:image-api`、`npm run typecheck`、`npm run build`。提交号与远端同步结果以实际Git操作及最终汇报为准。
