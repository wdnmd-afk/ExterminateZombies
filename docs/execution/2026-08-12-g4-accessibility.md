# 2026-08-12 G4-3 可访问性设置

> 状态：已实施，V1/V2 通过；浏览器观感复核待 P2 回归重跑

## 1. 实施内容

1. 设置页新增震屏、闪光、慢动作四档控制（关/低/中/高）和血液效果开关。
2. `SaveManager` 新增 `accessibilitySettings` 存档键、默认值与非法值归一化。
3. GameScene 的分级震屏按设置缩放；命中火花按闪光档位减少；血液粒子可关闭；SlowMotionManager 按慢动作档位缩短/减弱或关闭。
4. 选项在设置页点击后立即持久化，按钮使用高亮显示当前档位。

## 2. 验证

- `tests/save-manager.test.ts`、`tests/feedback-rules.test.ts`、`tests/slow-motion-manager.test.ts`：14 项定向用例通过。
- `npm run typecheck`：通过。
- 全量 `npm test` 在本批收口时执行。

## 3. 剩余风险

需要在有头浏览器中确认四档设置的实际画面差异、设置页在 1×/2× 渲染下无重叠，以及关闭血液/慢动作后不影响战斗状态机。
