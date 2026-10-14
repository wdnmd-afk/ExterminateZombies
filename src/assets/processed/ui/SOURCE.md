# UI 位图来源

全部文件由本仓库 `scripts/generate_ui_assets.py` 使用 Pillow 确定性绘制，不使用第三方图标包、字体轮廓或付费生成服务。

- 原有：`keycap.png`、`crosshair.png`。
- 本批新增：`panel-frame.png`；`icon-back.png`、`icon-confirm.png`、`icon-settings.png`、`icon-loadout.png`、`icon-volume.png`、`icon-accessibility.png`。
- 边框为 48×48 RGBA，按 8／32／8 网格分成八个外圈 frame；九宫中心透明，不遮挡文字。实现兼容 WebGL 与 Canvas，不使用 WebGL 专属 NineSlice。
- 图标为 24×24 白色 RGBA，运行时按现有警戒黄／深色配色着色；图标不取代文字标签，也不额外创建输入命中区。
- 复现：`python scripts/generate_ui_assets.py`。来源登记与逐文件 SHA-256 见运行时资源清单。源码许可由项目整体许可决策决定，此处不代替用户新增开源授权。
