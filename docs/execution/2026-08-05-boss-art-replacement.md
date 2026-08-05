# 2026-08-05 独立 Boss 美术资源替换

> 状态：已实施，待浏览器实机验收
> 关联：`docs/ART_ASSET_REGISTRY.md`、`src/config/zombieVisuals.ts`

## 0. 范围调整（2026-08-05）

用户复核后明确：巨型坦克本身也需要更换，首轮只替换其后的三个 Boss 属于范围理解不完整。

调整影响与方案：

1. 将 `tank_boss` 纳入本执行文档，四个固定关卡 Boss 均使用独立纹理。
2. 新增同一 Warlock's Gauntlet 作者组的 `Armored Crawler`，用于巨型坦克，继续沿用 CC-BY 3.0 许可证与统一署名。
3. 增加一套原始攻击、死亡、移动 PNG 归档，一个预加载纹理键和一个 80×80 旋转布局。
4. 更新图鉴预览、透明像素边界与“不得复用普通感染体纹理”测试基线。
5. 仍不修改巨型坦克的名称、数值、技能、关卡、掉落和碰撞半径。

## 0.1 首轮实施结果（2026-08-05）

1. 已从 OpenGameArt 归档 Kliver、Scorpion、Gargant Boss 共 17 张原始透明 PNG，以及来源、CC-BY 3.0 许可证、署名和 SHA-256。
2. `bomber_boss`、`hunter_boss`、`matriarch_boss` 已分别改用三张独立移动帧条，不再复用 `bomber`、`feral`、`bloater` 纹理。
3. 三套运行时移动条分别为 8、4、8 帧，单帧均为 64×64；原始向下朝向通过 `-Math.PI / 2` 接入现有旋转移动逻辑。
4. 显示倍率校准为 0.95、1.25、1.35。猎杀者与母体全部移动帧的透明像素并集落在既有碰撞圆内；爆破者保持与旧视觉相近的可见尺寸。
5. 怪物图鉴继续读取同一视觉配置，并新增测试约束，防止三个 Boss 未来静默退回复用普通感染体纹理。
6. 未修改 Boss 名称、数值、技能、关卡、掉落和碰撞半径；攻击、受伤和死亡帧只归档，未超范围接入。
7. 已完成文件类型、尺寸、透明通道、哈希、调用链与改动范围检查；按全局规则未执行 `vitest`、`tsc`、构建或浏览器测试。

## 0.2 追加实施结果（2026-08-05）

1. 已追加归档 Armored Crawler 的攻击、死亡和移动原始 PNG，资源包合计 20 张原图，SHA-256 全部复核一致。
2. `tank_boss` 已改用独立 `crawler-move.png`：8 帧、单帧 80×80、0.93 倍显示、向下原图按 `-Math.PI / 2` 接入旋转逻辑。
3. 全部移动帧的非透明像素并集为 `x=12..68、y=8..72`；缩放后完整落在既有半径 30 的碰撞圆内，未改变玩法碰撞。
4. 图鉴预览会把 80×80 帧条压入安全框；测试约束已扩为四个 Boss 均使用互不重复、且不复用普通感染体的纹理。
5. 素材 README、署名、资源台账和总规划事实段已同步为四个独立 Boss。
6. Vite 已成功解析新增 TypeScript 导入和移动帧条路径，HTTP 响应均为 200；仍未执行自动化测试、类型检查、构建或有头浏览器验收。

## 1. 目标

为四个固定关卡 Boss 接入独立的俯视像素动画，停止放大并着色复用普通感染体：

| Boss | 当前视觉 | 新素材 |
| --- | --- | --- |
| `tank_boss` 巨型坦克 | 放大复用 `tank` | Warlock's Gauntlet `Armored Crawler`，80×80 装甲重型轮廓 |
| `bomber_boss` 毁灭爆破者 | 放大复用 `bomber` | Warlock's Gauntlet `Kliver`，双黑色囊体/重拳轮廓与爆破者定位相符 |
| `hunter_boss` 猩红猎杀者 | 放大复用 `feral` | Warlock's Gauntlet `Scorpion`，红黑高速蝎型怪物 |
| `matriarch_boss` 腐化母体 | 放大复用 `bloater` | Warlock's Gauntlet `Gargant Boss`，大型角质重装怪物 |

三套素材均来自 OpenGameArt，由 Warlock's Gauntlet 团队创作，许可证为 CC-BY 3.0，署名要求为：

`Warlock's Gauntlet artists - rAum, jackFlower, DrZoliparia, Neil2D`

## 2. 范围

1. 将四套 Boss 的原始移动、攻击、受伤和死亡 PNG 归档到
   `src/assets/downloaded/zombies/warlocks-gauntlet-bosses/`。
2. 新增资源包 `SOURCE.md`、CC-BY 3.0 许可证副本，并更新僵尸素材署名与资源台账。
3. `PreloadScene` 仅加载四张原始移动帧条；攻击和死亡帧本轮只归档，不接玩法状态机。
4. 在 `zombieVisuals.ts` 中登记四套独立纹理、帧布局、旋转方向、显示缩放和碰撞中心。
5. 更新怪物图鉴布局测试中的 Boss 帧尺寸与透明像素边界基线。

本轮不修改 Boss 名称、生命、速度、伤害、技能、关卡编排、掉落和碰撞半径，不新增动画状态机。

## 3. 操作步骤

1. 从以下 OpenGameArt 页面下载页面明确列出的原始文件：
   - Kliver：`https://opengameart.org/content/top-down-pigeared-monster-animated`
   - Scorpion：`https://opengameart.org/content/top-down-scorpion-animated`
   - Gargant：`https://opengameart.org/content/top-down-gargant-monster-animated`
   - Armored Crawler：`https://opengameart.org/content/top-down-armored-crawler-animations`
2. 核对 PNG 文件类型、尺寸、透明通道和 SHA-256，并写入 `SOURCE.md`。
3. 在 `PreloadScene` 建立稳定纹理键，不把远程文件名泄漏到实体层。
4. 将三套移动帧条按原始单帧宽高登记为 `rotating` 布局；实体继续复用现有旋转动画路径。
5. 根据全部移动帧的非透明边界并集校准 `scale`、`rotationOffset` 和 `collisionOffsetY`，保持视觉主体与现有玩法碰撞圆一致。
6. 更新测试基线、素材 README、署名和资源台账，删除“Boss 继续复用普通感染体”的过时描述。
7. 审阅 `PreloadScene -> GameAssetManager -> Zombie -> MonsterLibraryScene` 全调用链，并检查无旧纹理复用残留。

## 4. 实施建议

1. 四套素材来自同一项目和同一作者组，优先保持原色，不再通过运行时 tint 伪造差异。
2. 原始移动条已是透明 PNG 横向帧条，不再生成重复派生文件，避免无意义的处理链。
3. 素材原始朝向为向下，旋转接入时使用方向修正，让逻辑朝向与移动向量一致。
4. 攻击和死亡帧先归档；后续只有在 Boss 行为状态机能提供明确时机时再接入，避免纯计时动画与真实伤害脱节。

## 5. 潜在风险

1. **视角风险**：素材虽为俯视动作游戏资源，但原始朝向与现有俯视爬行帧不同，旋转偏移错误会导致横向移动时身体朝向错误。
2. **碰撞风险**：Boss 当前半径已进入玩法平衡，不能为了贴合图片随意修改；必须通过显示缩放和纵向中心修正视觉。
3. **图鉴风险**：新 Boss 帧宽高改变后，预览自动缩放与安全框测试基线必须同步。
4. **授权风险**：CC-BY 3.0 要求发布时署名；来源页、作者、原始下载地址、许可证和哈希必须同时保留。
5. **范围风险**：资源包包含攻击和死亡动画，但本轮没有对应实体状态机；强行接入会扩大到玩法时序改造。

## 6. 优化方案

1. 未来为 `Zombie` 增加配置化的移动、攻击、受伤和死亡动画键，届时直接使用本轮归档帧条。
2. 四个 Boss 的独立移动视觉稳定后，再按实际行为时序接入各自攻击、受伤和死亡动画。
3. 发布前由实际运行时映射生成 Credits 清单，防止遗漏已使用的 CC-BY 素材。

## 7. 验证方式

本轮按全局规则默认不执行 `vitest`、`tsc`、构建或浏览器测试，只进行：

1. 原始文件类型、尺寸、透明通道与 SHA-256 核对。
2. 代码审阅：纹理键、帧布局、动画键和 Boss 映射一一对应。
3. 调用链检查：预加载、切帧、动画创建、战斗实体、怪物图鉴均读取新映射。
4. 静态边界核对：新素材显示尺寸、透明像素边界、碰撞圆与图鉴安全框计算一致。
5. 改动范围检查：不触碰 Boss 数值、能力、关卡和掉落配置。

建议后续经用户明确同意后执行：

```bash
npm test
npm run typecheck
```

并在有头浏览器中分别进入第 2、3、5、10 关或怪物图鉴，确认四个 Boss 的朝向、缩放、动画和命中区域。
