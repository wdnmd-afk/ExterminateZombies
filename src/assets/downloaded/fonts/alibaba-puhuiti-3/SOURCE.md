# Alibaba PuHuiTi 3.0 · 55 Regular

- 字体名称：阿里巴巴普惠体 3.0 / Alibaba PuHuiTi 3.0
- 版权方：阿里巴巴（中国）有限公司
- 设计方：Alibaba Design；汉仪字库（Hanyi Fonts）
- 官方发布页：https://fonts.alibabagroup.com/
- 字体内部版本：Version 3.01
- 版权声明（字体 `name` 表 ID 0）：`Copyright © 2020-2023 Alibaba (China) Co., Ltd. All rights reserved.`
- 商标声明（ID 7）：`Alibaba is a trademark of Alibaba Group Holding Limited.`
- 字符集范围（ID 10）：GB2312-1980 +《通用规范汉字表》
- 下载日期：2026-08-12

## 文件与校验

| 文件 | 用途 | SHA-256 |
| --- | --- | --- |
| `AlibabaPuHuiTi-3-55-Regular.woff2` | 运行时 UI 字体，全部 Phaser Text 使用 | `1CB8418D80B01EC08CB6F2D64B6244AAAF1BB80DC35491B66DDBA16C5E24F444` |

文件大小 5,256,740 字节；WOFF2 容器；29,296 个字形；`unitsPerEm` 1000。

## 获取方式

官方站点 `fonts.alibabagroup.com` 仅提供 TTF 下载且需要交互式确认，本机网络无法直连。
运行时所需的 WOFF2 由镜像包 `@pinhai/ali-fonts@1.0.4` 取得，经 jsDelivr 拉取：

```
https://cdn.jsdelivr.net/npm/@pinhai/ali-fonts@1.0.4/fonts/AlibabaPuHuiTi-3-55-Regular.woff2
```

该文件的 `name` 表版权、商标、厂商字段与官方 TTF 一致（见上方引用），据此确认为官方原版转封装、
未改动字形与字体内部名称。若后续能直连官方站点，应改为从官方 TTF 自行转换 WOFF2 并更新此处哈希。

## 许可与合规约束

阿里巴巴普惠体 3.0 允许个人与企业免费商用，但**不是** OFL 类许可，与本项目其他字体资源的约束不同：

- 禁止修改字形、字体文件与字体内部名称。因此本项目**不做子集化裁剪**，直接分发完整原始文件；
  若需减小体积，只能改用官方提供的其他字重或实现级别，不能自行 subset。
- 禁止将字体文件本身作为商品单独出售或再分发。
- 字体版权归阿里巴巴所有，「阿里巴巴」「Alibaba」为商标，不得声明本项目拥有字体版权。
- 完整法律条款以官方发布页公布的《阿里巴巴普惠体许可协议》为准。

官方站点当前无法直连，未能在本地留存许可协议全文。上述条款依据字体 `name` 表内嵌声明与官方公开
说明整理；正式对外发布前应补齐官方协议原文到本目录，并复核条款是否变更。

## 接入说明

运行时通过 [`src/ui/fonts.ts`](../../../../ui/fonts.ts) 在 Phaser 创建首个 Text 之前用 FontFace API 加载。
选用 55 Regular 单一字重：项目 UI 靠字号与描边区分层级，不依赖多字重。

字形覆盖检查（art bible §6 要求）：对项目源码中出现的 1134 个非 ASCII 字符逐一比对 `cmap`，缺字 0。
