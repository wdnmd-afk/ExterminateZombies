# 32px Food Items 来源记录

- 标题：32px Food Items
- 作者：Airos
- 来源页面：https://opengameart.org/content/32px-food-items
- 原始下载：
  - https://opengameart.org/sites/default/files/food_32x32.zip
  - https://opengameart.org/sites/default/files/food_sheet_0.png（页面第二版预览图，本地存为 `food_sheet.png`）
- 许可证：Creative Commons Zero 1.0（CC0-1.0）
- 下载日期：2026-08-19
- 署名要求：来源页原文「None required, but you're welcome to add a thanks in your credits
  if you feel so inclined.」——CC0 不强制署名，本项目未把它列入 Credits 强制署名清单。

## 本地文件与校验

| 文件 | 大小 | SHA-256 |
| --- | ---: | --- |
| `food_32x32.zip` | 6067 | `c4c8eb5ea6c0572458e78fff386e0867ec91d7dafc4fd0576015b9de190a916c` |
| `food_sheet.png` | 4848 | `74a9c71d5ecc4b4797872a05439e18e8d6992ea3ffe7fa0de4b06015ee67f742` |
| `purple_drink_32x32.png` | 1862 | `10fee311a33dc4ab6c9065e550a2c43bbd745d92d6d903a83215d9c773bdff72` |

`purple_drink_32x32.png` 是从同目录 `food_32x32.zip` 内原样解压出来的成员文件，未做任何
像素改动。压缩包另含 `cafe_latte_32x32.png`、`chinese_take_out_32x32.png` 与
`ramune_32x32.png`，本项目未使用，保留在压缩包内不单独解压。

## 本项目用途

能量饮料的运行时图标。来源页对该文件的原文描述是「a can of energy drink/soda」，即易拉罐
本身就是作者标定的能量饮料。`32 x 32` 画布，内容包围盒 `20 x 32`，HUD 药品槽与战场掉落物
均按 1:1 原生尺寸显示，因此不经过 `scripts/` 派生管线，由 `PreloadScene` 直接加载原始文件。

罐体主色采样值 `0xbd73d7`（中间调）已同步写入 `src/config/medicine.ts` 的
`energy_drink.color`，使 HUD 读条描边、进度填充与掉落物辉光和图标同色。
