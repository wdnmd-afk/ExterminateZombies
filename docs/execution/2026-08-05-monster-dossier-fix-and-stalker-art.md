# 2026-08-05 怪物图鉴文字重叠修复与俯行猎手美术替换

> 状态：已实施，待浏览器实机验收
> 关联：`docs/ART_ASSET_REGISTRY.md`、`docs/execution/2026-08-04-monster-preview-hitbox-stabilization.md`

## 0. 实施结果（2026-08-05）

1. 出现关卡展示已改为「≤3 关整行全名 / >3 关序号汇总（共 N 关 + 第 x/y/z 关，最多 3 行）」，不再可能压过处置建议区。
2. `stalker` 已替换为 CornerLord `zombie 2.gif`（4 帧 256×64，SHA-256 `c7a013…3eba4c`），`scale` 按非透明区 36px 与 radius 13 校准为 1.0，`rotationOffset` 归零。
3. 资源台账、僵尸素材 README 映射表与哈希已同步；CornerLord 署名沿用现有条目。
4. 按全局规则未执行 `vitest`/`tsc`；已完成代码审阅与调用链检查（`GameAssetManager` 帧切分与动画完全由 `ZOMBIE_TEXTURE_LAYOUTS` 驱动，无硬编码残留；全仓无 `getMonsterEncounterNames` 旧引用）。

## 1. 目标

1. 修复怪物图鉴详情区「出现关卡」列表在关卡扩展到 10 关后溢出、压住下方「处置建议 // RESPONSE」区的文字重叠问题。
2. 排查仓库内已下载未接入的怪物美术资源；将风格一致的可用资源接入，替换当前风格违和的简单素材。

## 2. 问题定位

### 2.1 文字重叠

`src/scenes/MonsterLibraryScene.ts` 中 `encounterText` 从 y=530 起逐行渲染完整关卡名（`getMonsterEncounterNames` 返回 `第X关:主题` 全名列表），而「处置建议」分区固定在 y=598（分隔线）/611（标签）/631（正文）。固定关卡扩到 10 关后，高频感染体的出现关卡可达 7-8 行（约 160px），必然压过处置建议区。可用高度只有约 68px（约 3 行）。

### 2.2 未接入怪物资源盘点

| 资源 | 结论 |
| --- | --- |
| `topdown-shooter-animated-64x64/topdown/zombie 2.gif` | **可用**。与已接入 crawler（`zombie.gif`）同作者（CornerLord）、同 64×64 俯视爬行姿态的深色变体（深蓝衣着、背部撕裂伤口），4 帧。风格完全一致，姿态契合「俯行猎手」（伏地冲刺型）定位 |
| Kenney Topdown Shooter `Zombie 1`（zoimbie1_*） | 不接入。扁平卡通矢量风、仅静态姿势，违反总规划「不混用不同像素密度和视角」约束 |
| Kenney Animated Characters Retro 僵尸皮肤 | 不接入。3D FBX 贴图，2D 战场无法使用 |
| zombie-rpg-sprites 的 SPAWN/SPITTER 正面帧 | 暂不接入。仅单方向特写帧，不构成完整替换 |

现役素材中风格最违和的是 `stalker`（俯行猎手）与 `oddity`（畸变行者）使用的 FreeArt 素材：厚棕描边、马卡龙配色的 Q 版卡通僵尸，与其余感染体的写实像素风明显脱节。本轮用 `zombie 2.gif` 替换 `stalker`；`oddity` 暂无库内替代，保留并记录为遗留项。

## 3. 范围与步骤

1. `src/scenes/MonsterLibraryScene.ts`
   - 出现关卡展示改为：条目 ≤3 时保持整行关卡全名；条目 >3 时压缩为「共 N 关 · 第 2 / 3 / … 关」序号汇总（最多 2 行），不再溢出。
2. `src/config/monsterLibrary.ts`
   - `getMonsterEncounterNames` 改为 `getMonsterEncounters`，返回 `{ ordinal, name }`，序号取 `LEVELS` 数组下标 +1，供场景做压缩展示。
3. `scripts/process_zombie_assets.py`
   - `stalker-strip.png` 的生成源从 FreeArt `ZombieWalk_normal_scaled_fast.gif` 改为 CornerLord `zombie 2.gif`；重新运行脚本生成帧条（4 帧 256×64）。
4. `src/config/zombieVisuals.ts`
   - stalker 帧布局 `frameCount` 8 → 4；`rotationOffset` `Math.PI / 2` → 0（zombie 2 与 crawler 同为头朝右）；按新素材非透明范围校准 `scale`；更新相关注释（SpriteAttack 朝上修正仅剩 oddity）。
5. 资源文档同步
   - `src/assets/downloaded/zombies/README.md`：运行时映射表与派生帧条 SHA-256。
   - `docs/ART_ASSET_REGISTRY.md`：CornerLord 包用途（新增 stalker）、FreeArt 包用途（仅剩 oddity）、派生资源表 stalker-strip 来源行。
   - CornerLord 署名已存在于 `characters/ATTRIBUTION.md`，无需新增条目。

## 4. 风险

1. stalker 帧数 8→4、帧率不变会改变动画观感；`scale` 需按新素材非透明范围校准，避免视觉与碰撞圆（radius 13）脱节。`tests/monster-library.test.ts` 的「碰撞圆不显著宽于精灵」约束在 scale ≥0.31 时均满足。
2. 图鉴预览缩放由帧尺寸自动推导，64×64 不变，无需改 `MonsterPreviewLayout`。
3. crawler 与 stalker 将成为同姿态双色变体（白色低阶 / 深色高阶），属于可接受的视觉亚种关系。
4. `oddity` 仍为卡通风格，与整体不一致，待后续按台账 §9.4 评估外部素材（SmallScaleInt Top-Down Zombie Pack 2）后替换。

## 5. 验证方式

1. 代码审阅：出现关卡压缩逻辑边界（0 关 / ≤3 关 / 10 关）、帧布局与 visual 一致性。
2. 脚本输出核对：stalker-strip.png 尺寸 256×64、4 帧；重算 SHA-256 写回文档。
3. 未经用户要求不执行 `vitest` / `tsc`；建议用户实机进入怪物图鉴检查 INF-01（多关卡条目）与 INF-13（新素材预览），并在战局中观察 stalker 移动与冲刺表现。
