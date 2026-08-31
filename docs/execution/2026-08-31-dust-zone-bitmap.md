# 粉尘/寒雾残留区位图执行文档

日期：2026-08-31
触发：用户截图指出"这个爆炸的特效需要重做"，附图中场地上有一块无纹理的纯灰圆盘。

## 1. 诊断：报告的现象与实际成因不一致

用户描述为"爆炸特效"，但 `src/assets/processed/effects/explosion.png` 本身是完好的四帧
高爆素材（白热核心起爆 → 满开火球带碎块 → 塌成火环 → 烟球带余烬），重做它不会让灰盘消失。

灰盘的真实来源是 `AreaEffectFactory.spawnLingerZone`：

```ts
// 改造前
const fireSprite = def.kind === 'fire' ? this.spawnFireZoneSprite(x, y, def) : null;
const visual = this.scene.add.circle(x, y, def.radius, def.color, fireSprite ? 0.1 : 0.26);
```

位图分支只覆盖 `kind === 'fire'`。`kind === 'dust'` 从来没有位图，整个残留期只有那个
`add.circle` 图元。爆炸瞬间的 `smoke-puff` 是 `repeat: 'once'`、4 帧 9fps，约 444ms 就播完
回收，之后 3.5~4.5 秒里屏幕上就只剩一块纯色圆。

半径也对得上：面粉桶 dust 残留 `radius: 90`，直径 180 逻辑像素，按截图竞技场边框反推的
1.29 倍缩放约 233 显示像素，与实测约 240 一致。

受影响的是三件道具：`barrel_flour`、`dust_canister`、`cryo_canister`。

`EFFECT_ASSET_KEYS` 原有八个条目里没有任何粉尘项——粉尘是八种特效里唯一完全没有美术的一种。

## 2. 为什么一张图同时服务粉尘与寒雾

`LingerDef.kind` 只有 `fire | dust` 两种取值，而 `dust` 下挂着两种语义完全不同的道具：
面粉粉尘（`color: 0xdddddd`，硬停敌人）与冷冻寒雾（`color: 0x8fdcec`，减速 35%）。

不做两张图，而是画一张严格中性灰白的 `dust-cloud`，运行时染 `def.color`。理由与
`smoke-puff` 的 `_tintNote` 同源：配置里已经有 `color` 字段在表达这个差异，再开一张图等于
把同一件事写两遍。代价是源图的色偏容忍度极低——带暖色偏的灰染成青色后会偏成脏绿，
所以 spec 把三档配色钉成严格等 RGB 的 `#f0f0f0 / #c0c0c0 / #7e7e7e`。

## 3. 生成结果

一次过，措辞阶梯 0（最强措辞未被拒），提示词 2025 字符，落在既有八条 1836~2271 的区间内。

```
node scripts/generate_effect_assets.mjs dust_cloud --version v01
  写入 effect-dust-cloud-4-v01.png (1313968 字节, 措辞阶梯 0)
```

上游返回透明底（`is_pre_keyed` 命中），跳过洋红键控。

### 3.1 单格判据

| cell | 覆盖率 | 边距 | 洋红残留 | 粉色回暖 |
| --- | --- | --- | --- | --- |
| 0 | 50.68% | 40px | 0px | 1px |
| 1 | 50.91% | 39px | 0px | 0px |
| 2 | 50.35% | 40px | 0px | 0px |
| 3 | 50.06% | 41px | 0px | 0px |

门槛是覆盖率 ≥0.008、边距 ≥3px，全部远超。

### 3.2 内容判据：脚本判据拦不住的那部分

`process_effect_assets.py` 的文档串明说自动判据只能拦"贴边/空帧/紫边残留"这类形式错误，
"粉尘画成了火球"只有人眼能判。本轮预览图 Read 两次均未返回图像内容，**无法目视验收**，
因此改用可量化判据覆盖 spec 的三条硬约束：

| 判据 | 实测 | 结论 |
| --- | --- | --- |
| 中性无色偏（染青后不脏） | 平均饱和度 7.6~7.8，最高 27，暖像素 2~3% | 合格 |
| 非光滑圆（撕裂 billow 轮廓） | 边缘径向标准差 7.6~9.1% 半径（完美圆为 0%） | 合格 |
| 内部有明暗结构（不是纯灰） | 亮度标准差 31.4~31.7，p5~p95 跨度 102~104 | 合格 |
| 四帧互不相同（真动画） | 两两平均绝对差 40.6~49.8 | 合格 |

最后一条"内部明暗结构"是本轮的核心判据：原始问题恰恰是一块 `stdev=0` 的纯灰圆。

spec 里要的"a few small holes"上游没给（穿洞率 0.00~0.34%）。判定为可接受：粉尘区的
玩法语义是**遮挡**，实心内部反而更符合"躲进去能断视线"，洞只是质感细节。

### 3.3 产物

```
dust-cloud.png: 896x224 RGBA sha256=66398a315ee0272214b2cba98abd80fce7535e81d5e8155b113f5b44c000b9cf
共用外接框 (39, 44, 587, 579) 548x535 -> 共用缩放系数 0.4088 -> 内容 224x219
```

## 4. 运行时接线

| 文件 | 改动 |
| --- | --- |
| `scripts/effect_asset_specs.json` | 新增 `dust_cloud` 条目 |
| `src/config/effectVisuals.ts` | `EFFECT_ASSET_KEYS.dustCloud`；帧布局 224×224×4 @6fps loop center |
| `src/scenes/PreloadScene.ts` | import + `load.image` |
| `src/systems/AreaEffectFactory.ts` | `spawnFireZoneSprite` → `spawnZoneSprite`（按 kind 取贴图）；`fireSprite` → `zoneSprite`；新增 `resolveZoneTexture` |

三处刻意的取值差异：

- **6fps 而不是 fire-patch 的 8**：粉尘是悬浮粉末，翻滚必须明显慢于火焰，否则一团灰白
  高频抖动读成"画面在闪"。
- **NORMAL 而不是火焰的 ADD**：ADD 会把灰白粉末提亮成一团光，而粉尘的语义恰恰是遮挡。
- **alpha 0.82 而不是 1**：区域内的僵尸必须仍能看出轮廓，否则玩家在自己扔的粉尘里
  完全失去目标读数，阻挡从战术收益变成自我致盲。

图元圆保留但不透明度从 0.26 压到 0.1，与火焰区一致：位图轮廓是撕裂的，而"被挡住"的
范围是精确的圆，玩家必须能看出后者。

## 5. 交付链验证

本轮的失效形状正是"绿测试掩盖断裂链路"：`prepareEffectFrames` 在帧条宽度与登记值不符时
只 `console.warn` 然后 `continue`，`prepareEffectAnimations` 随即因缺末帧跳过建动画，
`EffectSpritePool.has` 返回 false，调用方自动退回图元——每一环都"正确地"降级了，
而配置校验、类型检查和既有测试全部通过，因为数据表自己始终自洽。

因此加了两道验证。

### 5.1 单元测试：把 warn 前移成红

`tests/effect-strip-assets.test.ts` 读磁盘上九张 PNG 的真实 IHDR 尺寸，逐项比对
`EFFECT_TEXTURE_LAYOUTS` 的 `frameWidth * frameCount` 与 `frameHeight`。

变异验证（确认这条测试真的会红）：把 `dustCloud.frameWidth` 从 224 改成 200，测试报
`expected { width: 896, height: 224 } to deeply equal { width: 800, height: 224 }`，
1 failed | 10 passed。恢复后 11 passed。

### 5.2 浏览器探针：确认位图真的到了屏幕上

CDP 场景跳转下纹理会渲染成 `__MISSING`，画面不可信，但交付链本身可验：

```json
"dustCloud": { "textureExists": true, "stripWidth": 896, "frames": ["0","1","2","3"],
               "animExists": true, "poolHas": true }
"activeSprites": { "before": 0, "afterDust": 1, "afterCryo": 2, "afterFire": 3 }
```

`afterDust` 从 0 变 1 是关键：改造前这个数字会停在 0。`afterCryo` 验同一张图染青色的
第二条路径，`afterFire` 是对照组（这条链本来就通，用来证明探针本身有效）。
无 effect 相关控制台告警。

## 6. 验证结论

| 项 | 结果 |
| --- | --- |
| `npm run typecheck` | 0 错误 |
| `npm test` | 32 文件 / 394 测试全绿（本轮新增 1 文件 11 测试；其余增量来自并行会话的 settings 改动） |
| 浏览器交付链探针 | 纹理/切帧/动画/池子/实际 spawn 五级全通 |
| 目视验收 | **未完成**——预览图 `TmpGenerate/dust-cloud-preview-v01.png` 两次 Read 均未返回图像内容，已用 §3.2 的量化判据替代，但"实机上好不好看"仍待人眼确认 |

## 7. 顺带补上的既存缺口

`RUNTIME_ASSET_MANIFEST.md` 第 5 节自己写着"若后续接入特效位图…必须先更新对应台账"，
但现有八张特效位图从未进入台账第 4 节或清单第 4 节。本轮按整族补齐（九张共用一条管线），
不逐张追补其余八张的生成细节。

## 8. 遗留

- 目视验收未完成，见 §6。
- spec 要求的穿洞未生成，判定可接受，见 §3.2。若后续觉得粉尘太"实"，重生成时可把
  `silhouette` 里的 holes 一句提前到句首加权。
