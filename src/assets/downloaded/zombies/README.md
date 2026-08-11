# 下载的像素僵尸素材

本目录保存从互联网下载、许可证已经核实的原始像素僵尸素材。

## 素材包

1. `zombie-rpg-sprites/`
   - 6 种四方向像素僵尸造型。
   - 主精灵表均为 `124 × 144`，单元格为 `31 × 36`，网格为 `4 × 4`。
   - 包含额外的 Spawn 与 Spitter 正面造型。
2. `zombie-and-skeleton-32x48/`
   - 更粗壮的四方向僵尸和骷髅，可作为坦克、精英或 Boss 视觉候选。
3. `freeart-topdown-zombies/`
   - 2 种 `64 × 64`、8 帧俯视僵尸动画与完整原始 ZIP。
   - 原始素材采用 CC0 1.0，运行时 PNG 帧条由项目脚本机械派生。
4. `../characters/topdown-shooter-animated-64x64/`
   - 当前复用其中 2 种 `64 × 64`、4 帧俯视僵尸动画（`zombie.gif` → crawler、`zombie 2.gif` → stalker）。
   - 素材采用 CC-BY 3.0，署名见 `ATTRIBUTION.md`。
5. `../../zombie-1.1/`
   - 本轮接入标准、血污、无头、腐烂 4 种 `48 × 64` 四方向僵尸。
   - 素材采用 CC-BY 3.0 或更高版本，来源与哈希见该目录 `SOURCE.md`，署名见 `ATTRIBUTION.md`。
6. `warlocks-gauntlet-bosses/`
   - 归档 Armored Crawler、Kliver、Scorpion 与 Gargant Boss 四套透明俯视像素动画。
   - 四张移动条分别接入 `tank_boss`、`bomber_boss`、`hunter_boss`、`matriarch_boss`；四套攻击/死亡条均已接入对应机制战，Scorpion 与 Gargant 的分段死亡图按原顺序连续播放。
   - 素材采用 CC-BY 3.0，来源、原始下载地址和哈希见目录内 `SOURCE.md`，署名见 `ATTRIBUTION.md`。

Curt、Reemax 与 SpriteAttack 素材采用 `CC0 1.0`。Cabbit/AntumDeluge、CornerLord 与 Warlock's Gauntlet 团队素材采用 `CC-BY 3.0` 或更高版本。具体来源、许可证和文件哈希见各素材包内的 `SOURCE.md`、README 及本目录 `ATTRIBUTION.md`。

## 使用状态

当前运行时映射由 `src/systems/GameAssetManager.ts` 统一维护。原始素材保持不变，GIF 派生帧条生成方式见 `scripts/process_zombie_assets.py`。

### 当前运行时映射（2026-08-10）

| 感染体 | 素材来源 | 运行时帧结构 |
| --- | --- | --- |
| `walker` / `runner` / `tank` / `bomber` | Curt 第 1/3/5/6 套 | 3 帧 × 4 方向 |
| `lurker` / `drifter` | Curt 第 2/4 套 | 3 帧 × 4 方向 |
| `feral` / `bloodied` / `headless` / `rotting` | Cabbit/AntumDeluge 48×64 | 3 帧 × 4 方向 |
| `bloater` | Reemax 合图前三列 | 3 帧 × 4 方向 |
| `crawler` / `stalker` | CornerLord | 4 帧俯视旋转条带 |
| `oddity` | SpriteAttack | 8 帧俯视旋转条带 |
| `tank_boss` | Warlock's Gauntlet Armored Crawler | 8 帧移动、7 帧攻击、15 帧死亡；80×80 俯视旋转动画 |
| `bomber_boss` | Warlock's Gauntlet Kliver | 8 帧移动、8 帧攻击、16 帧死亡；64×64 俯视旋转动画 |
| `hunter_boss` | Warlock's Gauntlet Scorpion | 4 帧移动、8 帧攻击、16 帧死亡；64×64 俯视旋转动画 |
| `matriarch_boss` | Warlock's Gauntlet Gargant Boss | 8 帧移动、5 帧攻击、16 帧死亡；64×64 俯视旋转动画 |

派生帧条由脚本重新生成后的 SHA-256：

```text
9260dbedc3d98eabc9f7c0c125fe7397f84d2f1f898a1cbffedd8301f69d5115  crawler-strip.png
c7a013da7f4c6856eed30f5ffe009f3433a4cc3cd748645872628b68ad3eba4c  stalker-strip.png
ed3aa46b55ed29904e902c3aa23e42030b8839a19d4034f8aaeb4e0286c80742  oddity-strip.png
```
