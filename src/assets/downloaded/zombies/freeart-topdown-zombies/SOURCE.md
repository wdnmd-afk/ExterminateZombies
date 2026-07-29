# FreeArt - Topdown Zombies 来源记录

- 标题：FreeArt - Topdown Zombies
- 作者：SpriteAttack
- 来源页面：https://opengameart.org/content/freeart-topdown-zombies
- 原始压缩包：https://opengameart.org/sites/default/files/FreeArt_Topdown_Zombies_0.zip
- 许可证：Creative Commons Zero 1.0（CC0）
- 下载日期：2026-07-29

## 文件说明

- `ZombieWalk_normal_scaled_fast.gif`：普通俯视僵尸，`64 × 64`，8 帧。
- `ZombieWalk_odd_fast.gif`：异形俯视僵尸，`64 × 64`，8 帧。
- `FreeArt_Topdown_Zombies_0.zip`：OpenGameArt 提供的完整原始包。

运行时不直接加载 GIF。`scripts/process_zombie_assets.py` 会把每段动画按原顺序展开为透明 PNG 横向帧条，输出到 `src/assets/processed/zombies/`。该处理只重排原始帧，不重绘或猜测内容。

## SHA-256

```text
979cba6b4e64fd10f496ca56f4576ad379e91ef00616c617366bf53d002964b2  FreeArt_Topdown_Zombies_0.zip
b055f053719c11e06573f747b8af90f1ff8fe189c1cae834d06ade1903bb3f80  ZombieWalk_normal_scaled_fast.gif
ba169300265a3c522388f89f38aef83e91abfbc42894b180ed006adb46738d63  ZombieWalk_odd_fast.gif
```
