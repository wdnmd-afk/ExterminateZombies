# Zombies 1.1 来源记录

- 标题：Zombies 1.1
- 作者：Svetlana Kushnariova (Cabbit) 与 Jordan Irwin (AntumDeluge)
- 来源页面：https://opengameart.org/node/82939
- 许可证：OGA-BY 3.0 或更高版本、CC-BY 3.0 或更高版本
- 原始归档：`../zombie-1.1.zip`

## 当前加载状态（2026-09-08，基线 `bc75e37`）

`PreloadScene` 仍加载 `zombie-NESW.png`、`bloody_zombie-NESW.png`、`headless_zombie-NESW.png`，并保留旧切帧布局；四类感染体的当前实体 / 图鉴视觉均已改为项目生成素材。`rotting_zombie-NESW.png` 不再加载。三张遗留预载仍属于分发集合，因此保留游戏内署名；原图与许可不删除。

## 历史初次接入文件

- `PNG/48x64/zombie-NESW.png`：标准僵尸，运行时映射为 `feral`。
- `PNG/48x64/bloody_zombie-NESW.png`：血污僵尸，运行时映射为 `bloodied`。
- `PNG/48x64/headless_zombie-NESW.png`：无头僵尸，运行时映射为 `headless`。
- `PNG/48x64/rotting_zombie-NESW.png`：腐烂僵尸，运行时映射为 `rotting`。

四张表均为 `144 × 256`，按 `48 × 64` 切成 3 帧 × 4 方向；文件名与原包 README 明确标注方向顺序为 N/E/S/W。正式发布署名文本见 `../downloaded/zombies/ATTRIBUTION.md`。

## SHA-256

```text
4f2789fe7b20e0bfe4b2c252f81bd2e3a9f680f1e8e791fc73162c8594a84cf7  zombie-1.1.zip
9cea2cdd70a1b37eed8cdd2713ef3151147b43ec0ea53cd4232de57181f1a3fa  zombie-NESW.png
ef68679f91c37e790f3ab8bde8f9e815388e62b9e187b79d5bf8f0a53a5486b5  bloody_zombie-NESW.png
601cb068b6420a57f206c5077d74e4a72a48f910a682b870546e2490a249f48b  headless_zombie-NESW.png
764b30c55dc5b24a3f40f622455a17d5b7c3ae889954b776e598392b779b8d84  rotting_zombie-NESW.png
```
