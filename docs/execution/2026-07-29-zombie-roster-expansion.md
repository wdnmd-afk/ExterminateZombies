# 15+ 类感染体与美术资源扩展执行文档

## 目标

1. 在现有 6 类感染体基础上新增 10 类，最终形成 16 类可实际生成、可战斗、可掉落、可进入图鉴的感染体阵容。
2. 为 10 个新增类型分别接入独立美术造型，不通过单纯换色或 Boss 放大重复计数。
3. 将新增类型接入固定关卡和无尽模式，避免只增加配置或图鉴而不进入玩法。
4. 保持当前追击、接触攻击和死亡爆炸战斗模型稳定，不在本轮伪造尚未实现的远程、治疗、护盾或召唤行为。
5. 保留并补齐素材来源、许可证、原始文件哈希和派生处理方式。

## 范围

本轮预计涉及：

1. `src/config/zombies.ts`：新增 10 个准确 `ZombieId` 与唯一战斗配置。
2. `src/config/levels.ts`：把 10 个新增类型分阶段加入三关固定波次。
3. `src/config/monsterLibrary.ts`：新增对应档案文案，不复制玩法数值。
4. `src/systems/WaveManager.ts`：用数据化无尽模式规则逐步解锁新增类型。
5. `src/systems/GameAssetManager.ts`：支持 Curt、Cabbit、Reemax 和俯视旋转条带四类帧布局。
6. `src/entities/Zombie.ts`：在现有四方向动画之外支持俯视旋转型精灵朝向。
7. `src/scenes/PreloadScene.ts`：加载新增原始或派生纹理。
8. `src/scenes/MonsterLibraryScene.ts`：将 6 行索引扩展为可容纳 16 类的双列连续索引。
9. `scripts/process_zombie_assets.py`：把 3 个授权 GIF 机械转换为透明 PNG 横向帧条，保证浏览器端稳定切帧。
10. `src/assets/downloaded/zombies/`：归档新下载的原始 FreeArt 素材与来源记录。
11. `src/assets/processed/zombies/`：保存由授权 GIF 派生的运行时 PNG 帧条。
12. 僵尸素材 README、署名文件和本执行文档。

明确不修改：

1. 玩家、武器、子弹、伤害结算、道具和存档结构。
2. 不新增远程攻击、护甲减伤、治疗、分裂、召唤或控制类机制。
3. 不引入新的 npm 运行时依赖。
4. 不执行 `npm run build`；本轮只做局部类型、数据、资源和浏览器验证。

### 范围调整记录

实施前补充修改 `src/config/types.ts`，并在 `src/scenes/GameScene.ts` 移除随之失效的 Boss 字符串断言：将 `WaveDef.enemies[].type` 与 `LevelDef.boss.type` 从宽泛字符串收紧为准确的 `ZombieId`。原因是 16 类感染体同时进入固定关卡和无尽模式后，仅依靠运行时字符串断言无法阻止配置拼写错误；该调整只增强编译期约束，不改变现有伤害、生成或关卡流程。

## 已确认的 10 个新增造型

| 新类型 ID | 展示名称 | 独立美术 | 原始路径或来源 | 帧结构 | 许可证 |
| --- | --- | --- | --- | --- | --- |
| `lurker` | 裂颅感染体 | Curt 第 2 套露脑僵尸 | `zombie-rpg-sprites/2ZombieSpriteSheet.png` | 3 帧 × 4 方向 | CC0 |
| `drifter` | 苍白行者 | Curt 第 4 套浅色僵尸 | `zombie-rpg-sprites/4ZombieSpriteSheet.png` | 3 帧 × 4 方向 | CC0 |
| `feral` | 狂乱者 | Cabbit 标准僵尸 | `zombie-1.1/PNG/48x64/zombie-NESW.png` | 3 帧 × 4 方向 | CC-BY 3.0+ |
| `bloodied` | 血污屠夫 | Cabbit 血污僵尸 | `zombie-1.1/PNG/48x64/bloody_zombie-NESW.png` | 3 帧 × 4 方向 | CC-BY 3.0+ |
| `headless` | 无头感染体 | Cabbit 无头僵尸 | `zombie-1.1/PNG/48x64/headless_zombie-NESW.png` | 3 帧 × 4 方向 | CC-BY 3.0+ |
| `rotting` | 腐烂感染体 | Cabbit 腐烂僵尸 | `zombie-1.1/PNG/48x64/rotting_zombie-NESW.png` | 3 帧 × 4 方向 | CC-BY 3.0+ |
| `bloater` | 肿胀者 | Reemax 粗壮僵尸 | `zombie-and-skeleton-32x48/zombie_n_skeleton2.png` | 3 帧 × 4 方向 | CC0 |
| `crawler` | 伏地感染体 | CornerLord 俯视僵尸 | `topdown-shooter-animated-64x64/topdown/zombie.gif` | 4 帧旋转条带 | CC-BY 3.0 |
| `stalker` | 俯行猎手 | SpriteAttack 普通俯视僵尸 | FreeArt 包 `ZombieWalk_normal_scaled_fast.gif` | 8 帧旋转条带 | CC0 |
| `oddity` | 畸变行者 | SpriteAttack 异形俯视僵尸 | FreeArt 包 `ZombieWalk_odd_fast.gif` | 8 帧旋转条带 | CC0 |

### 新下载资源确认

1. 标题：FreeArt - Topdown Zombies。
2. 作者：SpriteAttack。
3. 来源页：`https://opengameart.org/content/freeart-topdown-zombies`。
4. 原始压缩包：`https://opengameart.org/sites/default/files/FreeArt_Topdown_Zombies_0.zip`。
5. 许可证：Creative Commons Zero 1.0（CC0）。
6. 原始 ZIP SHA-256：`979CBA6B4E64FD10F496CA56F4576AD379E91EF00616C617366BF53D002964B2`。
7. 包含 3 个俯视僵尸造型，其中 2 个提供可直接派生的 8 帧动画，本轮只接入这 2 个动画造型。

## 已确认的数据与调用链

1. `ZombieDef` 当前支持 `health`、`speed`、`damage`、`attackRate`、`radius`、`scoreValue`、`drops` 和 `explodeOnDeath`，新增类型只能基于这些真实字段形成玩法差异。
2. `WaveManager` 是固定关卡和无尽模式的唯一波次生成入口；所有新 ID 必须经过 `ZombieId` 类型约束后进入生成队列。
3. `GameScene.spawnZombie` 统一从对象池生成 `Zombie`，不需要为每个新类型复制实体类。
4. `Zombie.spawn` 和 `Zombie.updateFacing` 负责纹理、动画、缩放、着色和朝向，是多帧格式接入的唯一实体修改点。
5. `PreloadScene` 加载原始纹理，`GameAssetManager.prepareGameAssets` 统一完成手动切帧、最近邻过滤和动画注册。
6. 怪物图鉴从 `ZOMBIES`、`LEVELS` 和掉落表实时派生，不允许在展示配置中重复生命、速度、伤害、关卡或掉落概率。

## 视觉与交互方案

### 视觉主张

继续使用黑稿战地档案风，但把左侧索引升级为 2 列 × 8 行的高密度感染体名册；右侧仍只保留一只真实动画感染体作为唯一视觉焦点。

### 内容规划

1. 顶部显示 16 类收录数和 2 类 APEX 首领数。
2. 左侧双列索引展示档案号、准确名称、定位与威胁等级。
3. 右侧继续展示真实动画、战斗数值、死亡危险、出现关卡、掉落和应对建议。
4. 底部只展示数据来源与同步状态，不新增操作教学文案。

### 交互主张

1. 悬停、点击、方向键和 W/S 均按 16 类固定顺序切换。
2. 选中行保持轻微横移，新预览短促显影回弹。
3. 四方向素材按速度主轴切换方向；俯视素材持续播放条带动画，并根据追击向量旋转。

## 操作步骤

1. 归档 FreeArt 原始 ZIP，提取两个 GIF，补充 `SOURCE.md` 和许可证说明。
2. 新增可复现的 GIF → PNG 帧条处理脚本，生成 3 个运行时 PNG：CornerLord 1 个、SpriteAttack 2 个。
3. 将 `GameAssetManager` 改为数据化帧集注册：
   - Curt 非等距列布局。
   - Cabbit `48 × 64`、N/E/S/W 行序。
   - Reemax 合图中的僵尸区域。
   - 俯视旋转型横向帧条。
4. 新增 10 个 `ZOMBIES` 配置，控制在当前武器伤害、移动速度和碰撞尺寸可承受范围内。
5. 更新 `Zombie` 朝向逻辑，使旋转型素材只旋转精灵，不改变物理碰撞体。
6. 调整三关波次，让 10 个新增类型全部至少出现一次，并保持由易到难的引入顺序。
7. 重写无尽模式新增类型规则，按波次逐步解锁，不依赖不受约束的字符串断言。
8. 增加 10 条图鉴展示文案并重排双列索引。
9. 更新素材说明与 CC-BY 署名。
10. 执行局部验证并记录结果。

## 实施建议

1. 10 个新类型必须拥有 10 个不同帧集；允许多个帧集共享一张原始合图，但不允许仅通过 tint 伪装成新美术。
2. 继续用 `ZombieId` 作为战斗配置、视觉配置、波次和图鉴的唯一关联键。
3. 帧集结构集中在 `GameAssetManager`，不要把不同素材的行列坐标散落到实体或场景。
4. GIF 只作为可追溯源文件，运行时加载透明 PNG 帧条，避免不同浏览器对 GIF 帧处理不一致。
5. 新类型名称与档案描述只表达当前已实现的追击、速度、耐久、接触伤害和死亡爆炸差异。
6. 固定关卡先保证每类可复现出现，无尽模式再提供长期混编变化。

## 潜在风险分析

1. 四套素材的像素密度和画风不同，必须分别设置整数或稳定缩放，并坚持最近邻过滤。
2. Cabbit 使用 N/E/S/W 行序，与 Curt 的下/左/右/上不同，映射错误会导致倒退或横向朝向相反。
3. Reemax 合图同时包含僵尸和骷髅，本轮只切出已确认的前三列僵尸帧，不猜测其它区域用途。
4. 俯视条带素材需要旋转偏移；偏移值必须通过浏览器动画验证，不可只凭静态图声称正确。
5. 16 条索引若继续单列会溢出 720 高度，必须改为稳定双列尺寸并检查长名称。
6. 固定波次数量上升会改变难度和掉落经济；本轮以替换原有数量结构为主，避免简单叠加 10 类导致敌人数暴涨。
7. 新类型数值会影响线上玩法，必须通过关卡波次总量、生命区间和掉落概率数据检查。
8. CC-BY 素材必须在项目署名文档中保留作者、来源和许可证。

## 优化方案

1. 使用帧集注册表统一生成纹理帧和动画，避免为 10 个类型写 10 份切帧函数。
2. Reemax 多造型合图只加载一次纹理；动画按帧集 ID 隔离，避免动画 key 冲突。
3. 无尽模式用带解锁波次和占比的数据表生成编队，后续增加类型无需继续堆叠条件分支。
4. 图鉴继续复用一个精灵和现有文本对象，16 类切换不重复创建详情面板。
5. 不增加网络运行时请求，所有远程资源都在开发阶段下载并随项目打包。

## 验证方式

1. 运行素材处理脚本，核对 3 个 PNG 帧条的尺寸、帧数、Alpha 通道和 SHA-256。
2. 运行 `npm run typecheck`，必须零错误。
3. 通过 Vite SSR 校验：
   - `ZOMBIES` 和 `MONSTER_LIBRARY` 均为 16 项。
   - 两者 ID 集合完全一致。
   - 10 个新增类型均能从 `LEVELS` 检索到至少一个出现关卡。
   - 所有掉落都能解析为准确名称，不出现“配置异常”。
4. 校验每关每波敌人总量，确认扩充类型时没有无意大幅增加总数。
5. 开发服务器逐项请求所有新增纹理和场景模块，必须返回 HTTP 200。
6. 在 `1280 × 720` 视口检查首页与 16 类双列图鉴：不溢出、不重叠、长名称完整。
7. 逐类播放 10 个新增动画，确认 Curt/Cabbit/Reemax 四方向正确，3 个俯视条带旋转方向正确。
8. 实际进入三关和无尽模式，确认新类型能生成、追击、攻击、受伤、死亡、掉落和回收。
9. 捕获浏览器运行时异常，确认场景重复进入后无重复键盘监听。
10. 本轮不执行 `npm run build`。

## 执行结果

### 已实施

1. `ZOMBIES` 从 6 类扩展为 16 类，新增 `lurker`、`drifter`、`feral`、`bloodied`、`headless`、`rotting`、`bloater`、`crawler`、`stalker`、`oddity`，全部只使用当前已实现的追击、接触攻击、掉落和可选死亡爆炸字段。
2. `GameAssetManager` 改为数据化帧布局注册，统一支持 Curt 非等距列、Cabbit NESW、Reemax 合图前三列和俯视旋转帧条；16 类感染体均有完整视觉映射。
3. `Zombie` 根据视觉配置选择四方向动画或俯视旋转，只旋转精灵而不旋转容器与圆形物理体；对象池复用时会重置原点、旋转、着色、缩放和动画速率。
4. `PreloadScene` 已加载 10 个新增造型所需的原始或派生纹理；3 个 GIF 派生帧条仍由 `scripts/process_zombie_assets.py` 可重复生成。
5. 三关波次已用等量替换方式接入新增类型，每波总数保持原有规模；10 个新增类型均至少进入一个固定关卡。
6. 无尽模式改为带 `unlockWave` 与 `weight` 的类型安全阵容表，第 11 波前逐步解锁全部非 Boss 类型，第 10/15 波起按周期加入现有 Boss。
7. 怪物图鉴扩展为 2 列 × 8 行连续索引，保留单一动画标本焦点，并支持悬停、点击、W/S、A/D 和方向键浏览。
8. `WaveDef.enemies[].type` 与 `LevelDef.boss.type` 已收紧为 `ZombieId`；素材 README 已补充运行时映射、许可证关系和派生文件哈希。

### 已验证

1. 多次执行 `npm run typecheck`，均为零错误。
2. 重新运行 `scripts/process_zombie_assets.py`，得到 `crawler` 4 帧、`stalker` 8 帧、`oddity` 8 帧，单帧均为 `64 × 64`；重新生成后的 SHA-256 与记录一致。
3. 通过 Pillow 核对新增 Cabbit、Reemax 和 3 个派生 PNG，尺寸符合帧布局且 Alpha 范围均为 `0~255`。
4. 通过 Vite SSR 加载纯配置模块，确认 `ZOMBIES` 与 `MONSTER_LIBRARY` 均为 16 项、ID 集合完全一致、所有掉落均能解析且不存在“配置异常”。
5. 10 个新增类型均能从 `LEVELS` 检索到出现关卡；三关每波总量保持为 `8/13/17`、`17/21/12`、`11/21/14`。
6. 开发服务器对入口、受影响模块和 10 个新增纹理请求均返回 HTTP 200。
7. 已静态放大核对四套素材的帧方向与主体朝向；未执行 `npm run build`，符合本轮约束。

### 待补验证

当前环境没有可连接的应用内浏览器，因此尚未完成 `1280 × 720` 实际画布截图、16 类索引的真实悬停/键盘操作、四方向动画运行效果、俯视素材旋转偏移，以及三关和无尽模式中的生成、攻击、死亡、掉落与对象池复用验证。在补齐这些浏览器实测前，不将视觉与完整运行时验收标记为通过。
