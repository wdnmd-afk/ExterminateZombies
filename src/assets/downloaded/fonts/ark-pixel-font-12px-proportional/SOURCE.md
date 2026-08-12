# Ark Pixel Font 12px Proportional

- 项目名称：方舟像素字体 / Ark Pixel Font
- 作者：TakWolf
- 官方仓库：https://github.com/TakWolf/ark-pixel-font
- 发布版本：2026.08.11
- 发布页面：https://github.com/TakWolf/ark-pixel-font/releases/tag/2026.08.11
- 原始下载：https://github.com/TakWolf/ark-pixel-font/releases/download/2026.08.11/ark-pixel-font-12px-proportional-otf.woff2-v2026.08.11.zip
- 许可证：SIL Open Font License 1.1
- 许可证原文：https://raw.githubusercontent.com/TakWolf/ark-pixel-font/2026.08.11/LICENSE-OFL
- 下载日期：2026-08-12

## 文件与校验

| 文件 | 用途 | SHA-256 |
| --- | --- | --- |
| `original.zip` | 官方 12px 比例 OTF WOFF2 发布包，保留全部语言变体与包内 `OFL.txt` | `78B7D7BF1DE80376A220684D6F5E8F5FC39C04F1BDA3B7EB555E962B62FCE75F` |
| `ark-pixel-12px-proportional-zh_cn.woff2` | 从官方 ZIP 原样提取并移除文件名中的 `.otf`，作为简体中文运行时字体 | `D759CD46AF7C292498D3F36C06348870D78CF89AE09DE11EB3C22A635D359825` |
| `LICENSE-OFL-1.1.txt` | 官方仓库同版本的字体许可证原文 | `3AB41567E68E3988BA1EF16DD2644ECA95CA5648EA12E7D46E6287FC0BBE5AEE` |

## 接入说明

项目使用官方推荐的比例模式和中国大陆简体中文字形变体。运行时通过 `src/ui/fonts.ts` 在 Phaser 创建前加载字体；未修改字形或字体内部名称。字体文件随项目分发时必须继续保留本目录中的 OFL 许可证与版权声明。
