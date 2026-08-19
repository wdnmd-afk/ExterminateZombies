# 32px Medical Items 来源记录

- 标题：32px Medical Items
- 作者：Airos
- 来源页面：https://opengameart.org/content/32px-medical-items
- 原始下载：
  - https://opengameart.org/sites/default/files/medical_items_32x32.zip
  - https://opengameart.org/sites/default/files/medical_items_sheet.png
- 许可证：Creative Commons Zero 1.0（CC0-1.0）
- 下载日期：2026-08-19
- 署名要求：来源页原文「None required, but you're welcome to add a thanks in your credits
  if you feel so inclined.」——CC0 不强制署名，本项目未把它列入 Credits 强制署名清单。

## 本地文件与校验

| 文件 | 大小 | SHA-256 |
| --- | ---: | --- |
| `medical_items_32x32.zip` | 5287 | `39389f7dc66616f6e5ec0302b111e42c7e0f84fdfaa3cecdf4ddda63b4f3e3ae` |
| `medical_items_sheet.png` | 3872 | `4be6d1902a3c7d2a0ea09a305691518041aadbb601ef92559012be1c6813638a` |
| `bandage_32x32.png` | 1011 | `3a65bff8e8c1fd84aac684a118029a3d6ec1fc46d79765a4863f4eb72952b966` |
| `first_aid_kit_32x32.png` | 1171 | `d205c280d30c9fcfd91a0ce1422baeefe53b7bb7292295a1443947ef5b6b8945` |

`bandage_32x32.png` 与 `first_aid_kit_32x32.png` 是从同目录 `medical_items_32x32.zip` 内
原样解压出来的成员文件，未做任何像素改动，哈希即压缩包内原始文件哈希。压缩包另含
`medical_mask_32x32.png` 与 `pill_32x32.png`，本项目未使用，保留在压缩包内不单独解压。

## 本项目用途

绷带与急救的运行时图标。两张图都是 `32 x 32` 画布单图标（内容包围盒分别为 `32 x 14`
和 `32 x 19`），HUD 药品槽与战场掉落物均按 1:1 原生尺寸显示，因此不经过 `scripts/`
派生管线，由 `PreloadScene` 直接加载原始文件。
