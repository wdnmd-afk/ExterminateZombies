# Kenney RPG Urban Pack

| 项 | 内容 |
| --- | --- |
| 资源包标题 | RPG Urban Pack 1.0 |
| 作者 | Kenney（www.kenney.nl） |
| 来源页面 | https://kenney.nl/assets/rpg-urban-pack |
| 下载链接 | https://kenney.nl/media/pages/assets/rpg-urban-pack/0a097d1dc7-1677578575/kenney_rpg-urban-pack.zip |
| 许可证 | CC0 1.0（Creative Commons Zero） |
| 许可证原文 | 包内 `License.txt`（已保留，与来源页面标注一致） |
| 下载日期 | 2026-09-01 |
| 用途 | G5-2 第二关正式位图环境：沥青/混凝土地面、路障、街道杂物 |

## SHA-256

| 文件 | 哈希 |
| --- | --- |
| `kenney_rpg-urban-pack.zip` | `4541d89d639fc7d1e905dd925e55b1c4977a41d983516228db1d57173bb9afaf` |

## 文件说明

| 路径 | 说明 |
| --- | --- |
| `kenney_rpg-urban-pack.zip` | 原始下载包，保留不动 |
| `Tilemap/tilemap_packed.png` | 432×288，27×18 网格，16×16 瓦片**无间距**，共 486 项。G5-2 的首选切图源 |
| `Tilemap/tilemap.png` | 458×305，同内容但带 1px 间距，切图需跳间距，因此不作首选 |
| `Tilemap/tilemap.txt` | 官方网格参数说明（瓦片 16×16、margin 0、spacing 1px） |
| `License.txt` | CC0 许可证原文 |
| `Preview.png`、`Sample.png` | 官方预览图，不进运行时 |

## 未入库的包内内容

原包解压后还有 `Tiles/tile_0000.png` … `tile_0485.png`（486 张已切好的独立 16×16 瓦片，
合计 88.4 KB）与三个 `*.url` 外链快捷方式，**均未提交入仓库**。

理由：这 486 张与 `Tilemap/tilemap_packed.png` 内容完全重复，不被任何脚本读取
（派生脚本只读 `tilemap_packed.png`），且可从本目录已保留的原始 zip 完整恢复。
仓库当前已约 919 MB，`docs/execution/2026-09-01-g5-2-level2-bitmap-environment.md`
§7 把体积膨胀列为风险，因此不为零收益的重复文件增加 486 个索引条目。

需要独立瓦片时解压 `kenney_rpg-urban-pack.zip` 即可。按 `ART_ASSET_REGISTRY.md` §8
「不得覆盖来源文件」，原始 zip 本体已完整保留，该条约束未被破坏。

## 备注

CC0 不强制署名，但按 `docs/ART_ASSET_REGISTRY.md` §9 仍保留作者与来源记录。
包内 `License.txt` 第 14 行写明署名"not mandatory"。
