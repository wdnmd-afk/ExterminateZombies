# 2026-08-17 P0 场景生命周期修复执行文档

## 1. 目标

修复“暂停 → 返回主页 → 重新开局”流程中的 `physics.world` 空引用异常，保证挂起战局被丢弃时不会再执行依赖已销毁 Arcade World 的恢复逻辑。

## 2. 范围

- `GameScene` 的暂停、唤醒和 shutdown 生命周期。
- `MainMenuScene` 的继续/开新局入口调用链。
- 与暂停恢复相关的纯规则测试和浏览器回归证据。

不调整武器数值、掉率、音量、G2-7 玩法或新增依赖。

## 3. 操作步骤

1. 核对 `GameScene.setPause`、`handleWake`、`handleShutdown` 以及主页的 `scene.start/scene.wake` 顺序。
2. 将正常游戏恢复与 shutdown 清理分离；shutdown 阶段不得调用需要 Arcade World 存在的恢复路径。
3. 对物理世界访问增加生命周期保护，保持正常暂停/恢复的计时器平移语义不变。
4. 增加回归测试，覆盖物理世界存在和已销毁两种恢复条件。
5. 运行定向测试、全量测试、类型检查和构建；再用 Chrome/Edge 实景复现该操作链。

## 4. 实施建议

- 优先在 `GameScene` 内收敛生命周期判断，避免向 `MainMenuScene` 泄漏 Phaser 内部销毁顺序。
- shutdown 时只清理本场景状态、计时器和音频，不平移战斗绝对时间点。
- 正常从主页唤醒仍走现有 `WAKE → handleWake → setPause(null)`，确保战局可继续。

## 5. 潜在风险

- Phaser 在不同浏览器下销毁 Arcade World 的时序可能不同，单纯依赖 `isActive` 不足以判断 world 是否可用。
- 若 shutdown 仍触发暂停事件，HUD 可能收到多余状态变化；需要保证 HUD 在 stop 前解绑。
- 过早清空暂停原因会影响正常 WAKE 路径，因此必须区分 shutdown 与 wake。

## 6. 优化方案

- 复用现有 `SlowMotionManager` 的可选 world 防护风格。
- 测试使用最小场景 stub 锁定“world 缺失不抛错、动画时间尺度仍复位”的契约，避免引入浏览器依赖。
- 保留当前证据目录，不清理既有服务、浏览器或调试产物。

## 7. 验证方式

- 定向：新增生命周期规则测试。
- 回归：`npm test`、`npm run typecheck`、`npm run build`。
- 实景：1280×720、DPR 1 下，第二关暂停 → 返回主页 → 开新局，检查控制台、Canvas、物理碰撞和 HUD。

## 8. 验证记录

- 定向测试：`tests/scene-lifecycle.test.ts` 与 `tests/slow-motion-manager.test.ts`，3/3 通过。
- 全量测试：19 个测试文件、172/172 通过。
- `npm run typecheck`：通过。
- `npm run build`：通过，仅保留既有大 chunk 警告。
- Chrome 实景：第二关暂停 → 返回主页 → 重新开局通过；控制台错误 0、失败请求 0。
- 运行状态：Arcade World 存在且未暂停，玩家刚体启用，`GameScene`/`HUDScene` 激活，暂停原因为 `null`。
- 证据：`.debug-p0-lifecycle-20260817-evidence/pause-home-restart.json` 与 `pause-home-restart.png`。
