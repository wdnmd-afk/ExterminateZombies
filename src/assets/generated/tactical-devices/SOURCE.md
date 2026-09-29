# 战术装置与反打弹采用原图

## 来源与采用边界

2026-09-28 从现有 `TmpGenerate/` 原样复制两张 v01 候选，不重新生成、不修改原图、不删除临时来源。生成规格在 `scripts/prop_item_specs.json`，历史生成工具为项目的 `scripts/generate_prop_item_assets.mjs` 管线；仓库未保存逐文件生成回执，因此不补造具体生成日期、模型调用结果或作者授权。

它们登记为项目内生成资产，未指定独立对外许可证，不自动声明为 CC0。源码授权和发布交付仍由 P6 决策处理。

## 文件与指纹

| 原图 | 字节数 | SHA-256 |
| --- | ---: | --- |
| `prop-lure-station-v01.png` | 1,156,197 | `f1f0c84361b5c9adce2bf177f22d58a1c4b558ac8b139542562b62f4a4f56da9` |
| `prop-countershot-v01.png` | 1,012,638 | `cf24a68ea75f28916f4fe65c607f1540c717d0f000f12eda04ce38e9242006d2` |

原图均为 1024×1024；只有下列 46×38 透明成品进入预加载，原图不进入游戏加载集合。

| 成品路径（相对 `src/assets/processed/environment/`） | 字节数 | SHA-256 | 消费链 |
| --- | ---: | --- | --- |
| `prop-lure-station.png` | 3,081 | `ce9f106459cd557898722b0d8011c346f4bc59ec42dda41614f0ba270bae802c` | `PreloadScene` → `TACTICAL_TEXTURE_KEYS.lure` → `LureSystem` |
| `prop-countershot.png` | 2,523 | `5b278051d335c72242a5eb6555bd8d1a898859215e685ec7776deafd41a1a4e0` | `PreloadScene` → `TACTICAL_TEXTURE_KEYS.countershot` → `CountershotProjectile` |

## 可复现处理

使用 Python 3.13.7、Pillow 12.1.1 和当前仓库脚本，无需 NumPy、网络或再次生图。

1. 将本目录两张原图复制到根目录 `TmpGenerate/` 的同名路径；若已有同名文件，先比对以上 SHA-256，不覆盖不同内容。
2. 在仓库根目录执行 `python scripts/process_prop_item_assets.py lure_station countershot --version v01`。此命令会写入对应两个成品，不处理其他道具。
3. 核对成品指纹及 `docs/RUNTIME_ASSET_INVENTORY.csv`；未改变工具链时应与上表一致，工具链变化导致的字节差异需记录并复核，不能直接覆盖台账。

## 2026-09-28 实际记录

- 反打弹使用既有脚本产出；主体 843×406，宽高比 2.076、填充率 0.757、1 个有效连通域、来源洋红残留 0，落幅 42×20 居中于 46×38，成品洋红残留 1 像素，满足既有上限 12。
- 诱饵站在内存中重建后与已有成品逐字节一致，没有覆盖该成品；落幅 35×34、成品洋红残留 0。
- 两张归档原图的 SHA-256 与 `TmpGenerate/` 源文件一致。
- 仅完成素材处理、来源和静态加载链核对；不代表浏览器显示、反打玩法或 V6 可读性通过。
