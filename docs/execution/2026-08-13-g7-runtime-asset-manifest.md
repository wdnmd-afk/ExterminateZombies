# 2026-08-13 G7-2 运行时实际使用清单

> 状态：实现已收口，V0 静态核查完成；浏览器 Credits 页面验证待后续授权。

## 1. 目标

建立“运行时实际加载资源 → 原始来源 → 许可证 → 署名要求”的清单，覆盖 `PreloadScene`、字体加载、音频配置和游戏内 Credits 页面当前实际使用的外部素材。

## 2. 范围

本轮覆盖：

1. `src/scenes/PreloadScene.ts` 中加载的图片与音频。
2. `src/config/audio.ts` 中 `AUDIO_ASSETS` 与 `MUSIC_DEFS` 引用的音频。
3. `src/ui/fonts.ts` 中加载的 UI 字体。
4. `src/systems/*AssetManager.ts` 中运行时纹理键对应的素材用途。
5. `docs/ART_ASSET_REGISTRY.md` 与 `docs/AUDIO_ASSET_REGISTRY.md` 已登记的来源和许可证。

不覆盖：

1. 已下载未接入或候选未下载素材。
2. 构建工具、npm 包、源码许可证。
3. V6 人工验收结论。

## 3. 操作步骤

1. 从 `PreloadScene` 和 `audio.ts` 列出实际 import 的资源文件。
2. 按资源包归并到当前台账里的来源、作者和许可证。
3. 生成 `docs/RUNTIME_ASSET_MANIFEST.md`，只记录实际加载资源。
4. 更新 `CreditsScene`，让游戏内 Credits 与运行时清单保持一致。
5. 更新 `LONG_TERM_OPTIMIZATION_GOALS.md` 的 G7-2 状态。

## 4. 实施建议

清单按“运行时用途组”而不是单文件逐条展开，避免 50+ 音频和大量角色帧条造成维护负担；每组必须能追溯到本地资源目录、台账和许可证。

## 5. 潜在风险

1. `src/assets/zombie-1.1/` 是历史直接解压目录，不完全符合新下载目录结构，但当前确实被运行时加载，必须列入。
2. 阿里巴巴普惠体许可原文在台账中仍标注正式发布前需补齐，因此清单不能把该项写成发布合规已无风险。
3. Credits 页面空间有限，游戏内只展示强制署名与清单入口；完整对照以 Markdown 清单为准。

## 6. 验证方式

1. V0：静态核对 `PreloadScene`、`audio.ts`、`fonts.ts`、台账与清单条目一致。
2. V3/V4：后续浏览器进入 Credits 页面，确认文本可见、返回路径可用。
3. 发布前：配合构建产物资源清单再次核对，防止 tree-shaking 或新 import 改变实际加载集合。

## 7. 实施结果

1. 新增 `docs/RUNTIME_ASSET_MANIFEST.md`，按强制署名资源、CC0 视觉资源、CC0 音频资源和项目内生成视觉分组登记。
2. 清单只纳入 `PreloadScene`、`audio.ts` 与 `fonts.ts` 当前实际加载资源，不列入候选未下载或已下载未接入素材。
3. 更新 `CreditsScene`，展示强制署名主体，并指向 `docs/RUNTIME_ASSET_MANIFEST.md` 与 ART/AUDIO 台账。
4. 更新 `LONG_TERM_OPTIMIZATION_GOALS.md`，将 G7-2 标记为已完成。

## 8. 剩余风险

### 8.1 收口修正（2026-08-13）

1. 复核发现实际玩家素材是 Kenney `Survivor 1/survivor1_hold.png`，不是历史 Ghostbyte 三层方案；已将 Ghostbyte 改回“已下载未接入”，并从运行时 Credits 强制署名主体中移除。
2. 复核发现障碍纹理由 `scripts/process_environment_assets.py` 生成并由 `PreloadScene` 加载；已将运行时清单的生成入口从 `Obstacle.ts` 修正为处理脚本。
3. 当前清单与 `PreloadScene`、`src/ui/fonts.ts`、`src/config/audio.ts` 的实际加载入口一致。

1. 未执行浏览器 Credits 页实景验证，文字是否完全适配画布仍需 V3/V4 补测。
2. 阿里巴巴普惠体官方许可协议全文仍需正式发布前补齐。
3. 后续新增运行时资源时，必须同步本清单、Credits 与对应台账。
