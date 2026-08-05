# Gunshot Sounds

- 资源页：<https://opengameart.org/content/gunshot-sounds>
- 提交者：Tabasco
- 原始文件作者：Vincent Sevedge
- 下载地址：<https://opengameart.org/sites/default/files/sounds.zip>
- 下载日期：2026-08-05
- 本地文件：`original.zip`
- SHA-256：`5b3960083a94e18ee47bc84376615a476debc884b18f25b93ea4b6ab3f278e4f`
- 许可证：CC-BY 3.0

OpenGameArt 页面将该条目标记为 CC0，但压缩包内 `sounds/creativecommons.txt` 明确声明原始音视频内容使用 CC-BY 3.0。项目按更严格的包内许可证执行，发布时必须署名 Vincent Sevedge，并保留 `LICENSE-CC-BY-3.0.txt`。

运行时不直接加载连续录音。`scripts/process_audio_assets.py` 从压缩包读取 `cz.wav`、`mosin.wav`、`shotty.wav`、`sks.wav`，按固定时间段裁切成独立单发样本。
