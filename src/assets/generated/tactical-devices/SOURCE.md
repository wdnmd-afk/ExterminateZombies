# 战术道具、装置与反打弹采用原图

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

## 2026-09-30 四种携带道具原图归档

四张 v01 候选先经现有 `process_prop_item_assets.build_icon` 在内存处理，与现有运行时 PNG **逐字节一致**，再原样复制到本目录；随后从本目录输入再次复现，四张全部一致。未覆盖运行时文件，未删除 `TmpGenerate/` 候选，未重新生成图片。

生成规格与历史管线为 `scripts/prop_item_specs.json`、`scripts/generate_prop_item_assets.mjs`；本次验证采用关系，不补造缺失的历史逐图生成回执或对外许可。与前两张一样登记为项目内生成资产，不自动声明 CC0。

| 归档原图 | 字节数 | SHA-256 |
| --- | ---: | --- |
| `prop-firebomb-v01.png` | 1,017,011 | `21257985d4963d9cca49682d24834711102878dc44a68bdb5e70cd7368d8d9a7` |
| `prop-dust-canister-v01.png` | 1,150,228 | `dd1a4af9485da9932b0266c536975a774792f71e6742cf72c11d6a75acaa75ba` |
| `prop-demo-charge-v01.png` | 1,174,500 | `2ede24db4334b7cf7f0c72793b11215374fad77812973a332197aeab66a23124` |
| `prop-cryo-canister-v01.png` | 1,249,655 | `126de21df8588000674e7295ba6eebe7b5434144e4f4da0c43ea8b87b276ef5e` |

总计新增 4,591,394 字节原图，不进入运行时加载集合，不称为仓库减重。四张原图和复现驱动随本提交纳入版本控制，不依赖本机被忽略的候选目录。

| 成品（相对 `src/assets/processed/environment/`） | 字节数 | SHA-256 |
| --- | ---: | --- |
| `prop-firebomb.png` | 3,901 | `8d65823056ca0715913b87173d49334b7a1d7967c0bdef9cefdbf0bc6d60f3c4` |
| `prop-dust-canister.png` | 3,525 | `f0b6aab654c98a16aded7b00cc4c6d2a4fead622f0ce0a8815924418c97da27a` |
| `prop-demo-charge.png` | 3,009 | `95f3c98f8c4ab0ddec30f4722a5e17932e6119737c65a5290e5a59c74b93b8d2` |
| `prop-cryo-canister.png` | 3,557 | `46130de26d2746c82817b369f387a267e06de91c7f4cb89b7ba815544c2c5eaf` |

四张成品均为 46×38 RGBA，继续由 `PreloadScene → PROP_TEXTURE_KEYS → Prop / Pickup / HUD` 消费。加载键、成品指纹及运行时 CSV 不变。

验证环境：Python 3.13.7、Pillow 12.1.1。可复现驱动与完整门控输出位于 `docs/execution/evidence/2026-09-30-prop-source-archive/`，其中 `from-candidates.json`、`archive-copy.json`、`from-archive.json` 分别记录候选复现、复制指纹和归档复现。

从仓库根目录复核、不写运行时图片：

```text
python docs/execution/evidence/2026-09-30-prop-source-archive/reproduce.py --source-dir src/assets/generated/tactical-devices --report from-archive-rerun-01.json
```

报告名必须未使用，避免覆盖历史证据；再次运行时递增后缀。驱动只复用既有算法，不依赖 `TmpGenerate/` 的候选副本、不访问网络。本结果证明采用来源与处理可复现，不代表 U-06 游戏内显示或 V6 体验通过。
