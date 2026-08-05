# Warlock's Gauntlet Boss 素材来源

## 基本信息

- 标题：Top down armored crawler animations；Top down pigeared monster, animated；Top down scorpion, animated；Top down gargant monster, animated
- 作者：Warlock's Gauntlet team
- 明确署名：Warlock's Gauntlet artists - rAum, jackFlower, DrZoliparia, Neil2D
- 提交者：Liosan
- 来源网站：OpenGameArt
- 下载日期：2026-08-05
- 许可证：CC-BY 3.0
- 许可证副本：`LICENSE-CC-BY-3.0.txt`

## 来源页面

1. Armored Crawler：<https://opengameart.org/content/top-down-armored-crawler-animations>
2. Kliver：<https://opengameart.org/content/top-down-pigeared-monster-animated>
3. Scorpion：<https://opengameart.org/content/top-down-scorpion-animated>
4. Gargant：<https://opengameart.org/content/top-down-gargant-monster-animated>

OpenGameArt 页面说明这些角色均来自 Warlock's Gauntlet。原始动画元数据可参考页面指向的项目仓库；本项目不改写下载的 PNG 帧条。

## 本地用途

| 文件组 | 运行时用途 | 移动帧结构 |
| --- | --- | --- |
| `crawler-*` | `tank_boss` 巨型坦克；金属甲壳与四侧装甲构成重型轮廓 | `crawler-move.png`：8 帧，单帧 80×80 |
| `kliver-*` | `bomber_boss` 毁灭爆破者；双黑色囊体/重拳构成重型爆破轮廓 | `kliver-move.png`：8 帧，单帧 64×64 |
| `scorpion-*` | `hunter_boss` 猩红猎杀者；红黑高速蝎型轮廓 | `scorpion-move.png`：4 帧，单帧 64×64 |
| `gargant-boss-*` | `matriarch_boss` 腐化母体；大型角质重装轮廓 | `gargant-boss-move.png`：8 帧，单帧 64×64 |

本轮运行时只加载四张 `move` 帧条。攻击、受伤和死亡帧保留为原始归档，待实体具备对应动画状态机后再接入。

## 原始下载地址

### Armored Crawler

- <https://opengameart.org/sites/default/files/crawler-attack.png>
- <https://opengameart.org/sites/default/files/crawler-death.png>
- <https://opengameart.org/sites/default/files/crawler-move.png>

### Kliver

- <https://opengameart.org/sites/default/files/kliver-attack.png>
- <https://opengameart.org/sites/default/files/kliver-attack-wounded.png>
- <https://opengameart.org/sites/default/files/kliver-death.png>
- <https://opengameart.org/sites/default/files/kliver-move.png>
- <https://opengameart.org/sites/default/files/kliver-move-wounded_0.png>

### Scorpion

- <https://opengameart.org/sites/default/files/scorpion-attack.png>
- <https://opengameart.org/sites/default/files/scorpion-attack-wounded.png>
- <https://opengameart.org/sites/default/files/scorpion-death-0.png>
- <https://opengameart.org/sites/default/files/scorpion-death-1.png>
- <https://opengameart.org/sites/default/files/scorpion-move.png>
- <https://opengameart.org/sites/default/files/scorpion-move-wounded.png>

### Gargant Boss

- <https://opengameart.org/sites/default/files/gargant-boss-attack.png>
- <https://opengameart.org/sites/default/files/gargant-boss-attack-wounded.png>
- <https://opengameart.org/sites/default/files/gargant-boss-death-0.png>
- <https://opengameart.org/sites/default/files/gargant-boss-death-1.png>
- <https://opengameart.org/sites/default/files/gargant-boss-move.png>
- <https://opengameart.org/sites/default/files/gargant-boss-move-wounded.png>

## SHA-256

```text
4090e15cd64ee1fb84135ed5b34c4b2fad691dd9d33ff29bbc7aefa8432943a6  crawler-attack.png
f7bd908b0fe6e9a88a0a594a7585ae55529a4e7e8e9042116d8aeeca332c015d  crawler-death.png
b580105813f81351a748327301f5bcc2a6ea43308602def46cc66d5e28345eb2  crawler-move.png
78ff4dcb81497c42c5b598a04de964f5718b8ffa5ca28a8726c697d8618270a9  gargant-boss-attack-wounded.png
793494489d22dca0e94ef836cf52bd9de4c90d20687743d84fab80987c1df911  gargant-boss-attack.png
287a4b858d42df652c8d29cd6a8879b6f9a46e922b40712ea11c419b01567a27  gargant-boss-death-0.png
82449f2c9740f2c88bbafdf80f734e7bdcac954b819ea5eed3d92c3321b8887e  gargant-boss-death-1.png
c488fb939c2f90e43ae232cc19ac3c65e5787d47824d7fd82616719f79baf357  gargant-boss-move-wounded.png
2951ffa66958f1b9de4b7cffcf5ff0fc50359d5b03f0e6a08afee3f4d8ac0615  gargant-boss-move.png
1dbc7abbeced817c82c4857903232d3ea08db5ec0f1a11f5c052bb7843648ecd  kliver-attack-wounded.png
d360dda077f915440df5a65783f167a9d672cfa69082dd67de491589852a88d4  kliver-attack.png
100887eea414915d9be66120b6f6c38c4c84cdda44974d285f57267ce47958b8  kliver-death.png
99c1e81dcb66d25e90250be7f60bdf9e2ab1a55480376295689ef9fd80fa5d21  kliver-move-wounded.png
7e4bf43afe73e1f3cfb1bbf31627c9afe6442bea3e82dfc1f7d47baff6a759fd  kliver-move.png
434050dfe005b6157d310f8da3bfc71d4f67a0662c5282e323dbef422c69a642  scorpion-attack-wounded.png
1dca7b13343bf3d61c6bf4da64e5bd1de3ef93f292c7182f19501cc2fbf0c6b2  scorpion-attack.png
4594ff89518e1836bc74a71b1aa90535b5331dd68ab9b348805ac216bed2b2cc  scorpion-death-0.png
c90f25d906067c8c010715c7a000dab9a0afa901156593082b0c63cdfd0d46b0  scorpion-death-1.png
ae68a67fb103ffe129020793a75326fac6b23b797bcc2886fc091d02c42634dc  scorpion-move-wounded.png
8a65b3602395bfa63ef49a21f331ac750b8f384d506cfe6d645f063d9d7e3566  scorpion-move.png
```
