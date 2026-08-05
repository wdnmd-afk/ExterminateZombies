# Exterminate Zombies（消灭僵尸）

一款运行在桌面浏览器中的单人俯视角波次射击游戏。玩家需要移动拉扯感染体、管理武器与弹药，并利用油桶、粉尘区、地雷和掩体制造生存空间。

当前版本为 `0.1.0`，处于可玩原型与内容整合阶段。项目为纯前端单机实现，不依赖后端服务。

## 当前内容

| 模块 | 当前实现 |
| --- | --- |
| 固定关卡 | 3 个可顺序解锁的单屏关卡 |
| 无尽模式 | 程序化波次、逐步解锁敌人池、周期性 Boss、最佳波次记录 |
| 可用武器 | 8 把：4 把正式武器 + AK-47、Barrett M82、RPG-7、M79 测试配发 |
| 武器美术 | 8 把武器均使用对应真实型号的像素贴图；玩家为「身体 + 持枪手臂 + 武器」三层，枪口出弹点对齐枪管末端 |
| 武器库 | 8 项军械档案全部具备战斗配置；后 4 把标记为测试配发 |
| 怪物图鉴 | 16 项感染体档案，包含 14 种普通/变异感染体与 2 个 Boss |
| 特殊敌人 | 带前摇的冲刺、远程投射、Boss 震荡与目标区域轰炸 |
| 战术元素 | 油桶、面粉桶、地雷、火焰残留区、阻敌粉尘区、连锁爆炸 |
| 音频 | Web Audio 战斗/UI 音效、菜单/战斗氛围层和三档音量设置 |
| 进度保存 | 版本化存档、关卡解锁、无尽最佳波次、自定义键位和音量设置 |

### 游戏模式

**关卡模式**

1. `第一关：郊外`：3 个常规波次，以集装箱和基础感染体为主。
2. `第二关：废车站`：3 个常规波次与巨型坦克 Boss，场地包含废车和集装箱。
3. `第三关：封锁城区`：3 个常规波次与毁灭爆破者 Boss，场地包含路障、废车和集装箱。

完成关卡后会解锁下一关；失败后可以重开当前模式或返回主菜单。

**无尽模式**

敌人总量和生成节奏会随波次推进，新的感染体类型逐步加入敌人池，Boss 会在特定波次进入战场。游戏结束时会把最佳波次保存到浏览器本地。

### 核心玩法

- 键盘移动、鼠标瞄准与射击，支持点射、连发、散射和穿透等武器差异。
- 当前测试开关会在新局配发全部 8 把武器；数字键选择前四栏，鼠标滚轮可遍历全部武器。
- 起始沙漠之鹰拥有无限备用弹药，但仍保留弹匣和换弹节奏。
- RPG-7 与 M79 使用独立爆炸弹药，命中敌人、场景物、障碍或达到射程时触发一次范围爆炸，并保留玩家误伤与连锁规则。
- 敌人可掉落弹药、生命、地雷和武器；首次获得武器时自动装备。
- 油桶爆炸后留下持续伤害火焰，面粉桶产生短暂阻挡感染体的粉尘区。
- 油桶、面粉桶和地雷可被其它爆炸触发，形成连锁反应。
- 静态障碍物会阻挡玩家、感染体和子弹。
- 部分感染体会在明显前摇后冲刺或发射可躲避投射物；两个 Boss 拥有独立范围技能。
- 三个固定关卡和无尽模式使用不同地面、边界与环境细节；旋转障碍物使用与视觉对应的碰撞包围盒。
- HUD 显示生命、武器、弹匣、备用弹药、道具、波次和得分，并提供波次与拾取反馈。
- HUD 会读取当前真实键位、显示换弹状态和 Boss 生命；设置页可调音量并清除关卡进度。
- 武器库与怪物图鉴直接读取玩法配置，展示武器获取方式、敌人数值、出现关卡和掉落信息。

## 默认操作

| 操作 | 默认输入 |
| --- | --- |
| 移动 | `W` / `A` / `S` / `D` |
| 瞄准 | 移动鼠标 |
| 开火 | 鼠标左键 |
| 换弹 | `R` |
| 布置当前道具 | `Q` |
| 切换道具 | `F` |
| 切换武器 | 鼠标滚轮上 / 下 |
| 选择武器栏 | `1` / `2` / `3` / `4` |
| 暂停菜单 | `Esc`（固定键，不可改绑） |

除鼠标瞄准和 `Esc` 暂停菜单外，玩法动作都可以在设置页面重新绑定。若新输入已被其它动作占用，两个动作会自动交换绑定。`Esc` 保留给暂停菜单，设置页不接受把它绑到其它动作上。

游戏内按 `Esc` 打开暂停菜单，菜单提供两项：`1` 继续游戏、`2` 返回主页。选择返回主页时当前战局会被挂起而不是丢弃，主菜单会出现「继续游戏」按钮（也可直接按 `Esc`）把这一局原样接回；在主菜单开始新关卡或无尽模式则会丢弃挂起的战局。

主菜单也支持数字键快捷入口：`1` 开始所选关卡、`2` 进入无尽模式、`3` 打开武器库、`4` 打开怪物图鉴、`5` 打开设置。

## 快速开始

### 环境要求

- Node.js
- npm

仓库当前未通过 `engines` 固定 Node.js 版本；请使用满足 Vite 5 运行要求的 Node.js 环境。

### 安装与启动

```bash
npm ci
npm run dev
```

开发服务器默认运行在 <http://localhost:5173>，并会尝试自动打开浏览器。

### 类型检查

```bash
npm run typecheck
```

### 自动化测试

```bash
npm test
```

### 构建与本地预览

```bash
npm run build
npm run preview
```

构建命令会先执行 TypeScript 检查，再由 Vite 输出静态文件到 `dist/`。项目使用相对资源路径，可以部署到静态站点托管服务。

## 可用脚本

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 启动 Vite 开发服务器 |
| `npm test` | 运行 Vitest 配置与纯逻辑测试 |
| `npm run typecheck` | 执行 `tsc --noEmit` |
| `npm run build` | 类型检查并生成生产构建 |
| `npm run preview` | 本地预览已有生产构建 |

## 技术栈

- [Phaser 3](https://phaser.io/)：场景、渲染、输入与 Arcade Physics。
- [TypeScript](https://www.typescriptlang.org/)：启用严格模式、未使用变量检查和未使用参数检查。
- [Vite](https://vite.dev/)：开发服务器与生产构建。
- [Vitest](https://vitest.dev/)：配置完整性、存档、碰撞、空间哈希和换弹生命周期测试。
- Web Audio API：合成战斗/UI 音效与菜单/战斗氛围层，无额外音频文件依赖。
- `localStorage`：保存键位、音量、关卡解锁和无尽模式记录；不可用时退化为内存存储。

游戏使用 `1280 × 720` 逻辑坐标，并根据物理屏幕选择 `1×` 或 `2×` 渲染缓冲区，再通过 Phaser 的 `FIT` 缩放适配浏览器窗口。

## 场景与架构

```text
Boot
  -> Preload
  -> MainMenu
       -> Game + HUD
       -> WeaponLibrary
       -> MonsterLibrary
       -> Settings
  -> GameOver / LevelClear
```

```text
src/
├─ assets/       原始、下载和处理后的游戏素材
├─ config/       关卡、武器、感染体、道具和键位配置
├─ entities/     玩家、感染体、双方投射物、掉落物、场景物和障碍物
├─ scenes/       菜单、战斗、HUD、图鉴、设置和结算场景
├─ systems/      输入、波次、武器、敌人能力、战场、音频、存档、区域效果和显示管理
├─ utils/        数学、几何、空间哈希与对象池
├─ constants.ts  全局尺寸、深度层级、事件名和场景键
└─ main.ts       Phaser 游戏入口与场景注册

scripts/         素材处理脚本
docs/            规划、测试说明和执行记录
```

战斗状态由 `GameScene` 持有，`HUDScene` 通过事件同步显示；武器、道具、波次、敌人能力、战场绘制、音频与存档分别由独立系统管理。高频创建的双方投射物、感染体和掉落物使用对象池复用；无尽模式用空间哈希收敛敌群邻近查询。

## 配置入口

| 配置 | 文件 |
| --- | --- |
| 关卡、波次、Boss、场景物与障碍物 | [`src/config/levels.ts`](src/config/levels.ts) |
| 武器战斗数值 | [`src/config/weapons.ts`](src/config/weapons.ts) |
| 武器库档案与开放状态 | [`src/config/weaponLibrary.ts`](src/config/weaponLibrary.ts) |
| 感染体战斗数值与掉落 | [`src/config/zombies.ts`](src/config/zombies.ts) |
| 怪物图鉴展示信息 | [`src/config/monsterLibrary.ts`](src/config/monsterLibrary.ts) |
| 油桶、面粉桶和地雷 | [`src/config/items.ts`](src/config/items.ts) |
| 默认键位 | [`src/config/keybinds.ts`](src/config/keybinds.ts) |

## 本地存档

存档统一由 [`SaveManager`](src/systems/SaveManager.ts) 读写，浏览器键名使用 `ez:` 前缀：

| 键名 | 内容 |
| --- | --- |
| `ez:keybinds` | 自定义键位 |
| `ez:unlockedLevels` | 已解锁关卡 ID |
| `ez:endlessBestWave` | 无尽模式最佳波次 |
| `ez:audioSettings` | 总音量、音效音量和音乐音量 |
| `ez:saveVersion` | 当前存档结构版本 |

读取存档时会补齐缺失字段、过滤无效类型并迁移旧键；设置页提供显式清除关卡进度入口。当浏览器禁用或拒绝 `localStorage` 时，游戏不会因此崩溃，但数据只会保留在当前页面的内存中。

## 验证与测试

当前仓库使用 Vitest 覆盖配置引用、存档归一化、旋转碰撞、空间哈希和换弹取消。最低自动化验证为：

```bash
npm test
npm run typecheck
```

正式端到端套件尚未接入。项目维护了运行时冒烟、固定关卡、无尽模式和人工可玩性检查流程，详见 [`docs/TESTING.md`](docs/TESTING.md)。

> 已知问题：`npm run typecheck` 当前失败。`tests/weapon-loadout.test.ts` 使用 `node:fs`、`node:url` 和 `Buffer`，但仓库未安装 `@types/node`，而 `tsconfig.json` 的 `include` 覆盖了 `tests`。由于 `build` 脚本为 `tsc --noEmit && vite build`，`npm run build` 同样失败。`npm test` 不受影响。

## 素材与许可

仓库包含来自多个作者和素材包的第三方资源，许可并不统一：

- 玩家与部分感染体素材使用 `CC-BY 3.0` 或更高版本，需要保留署名。
- 部分感染体与武器素材使用 `CC0 1.0`。
- `Zombies 1.1` 同时提供 `OGA-BY` 与 `CC-BY` 许可选项。

完整来源、许可证文本、文件哈希和署名要求请以以下文件及素材目录内的 `SOURCE.md` / `LICENSE*` 为准：

- [人物素材说明](src/assets/downloaded/characters/README.md)
- [人物素材署名](src/assets/downloaded/characters/ATTRIBUTION.md)
- [感染体素材说明](src/assets/downloaded/zombies/README.md)
- [感染体素材署名](src/assets/downloaded/zombies/ATTRIBUTION.md)
- [武器素材说明](src/assets/downloaded/weapons/README.md)

GIF 感染体素材的运行时 PNG 帧条由 [`scripts/process_zombie_assets.py`](scripts/process_zombie_assets.py) 生成，8 张武器运行时 PNG 由 [`scripts/process_weapon_assets.py`](scripts/process_weapon_assets.py) 从像素枪械表逐格裁剪并抠除背景与镂空生成。两个脚本都依赖 Python 和 Pillow。

仓库根目录当前没有统一的项目源码 `LICENSE`。除第三方素材各自明确授予的权利外，不应将整个项目视为已经按某个开源许可证授权。

## 项目文档

- [`PROJECT_MASTER_PLAN.md`](PROJECT_MASTER_PLAN.md)：当前基线、方向决策、风险和阶段路线。
- [`docs/TESTING.md`](docs/TESTING.md)：静态检查、运行时冒烟与人工试玩流程。
- [`docs/execution/`](docs/execution/)：历次复杂任务的执行记录。

## 当前限制

- 当前主要面向桌面浏览器和键盘鼠标操作，尚未提供移动端触控适配。
- 尚未接入账号、后端、云存档、排行榜或联机功能。
- AK-47、Barrett M82、RPG-7 和 M79 当前通过测试初始配发开放，尚未进入正式掉落表，数值也未完成平衡验收。
- 8 把武器共用同一层通用持枪手臂，长枪缺少支撑手，尚无分武器持枪动画；武器表现只在 headless 浏览器验收过，斜向持枪贴合度与有头浏览器观感仍待确认。
- 当前环境场景已具备主题化程序地面与边界，但仍缺正式位图环境素材和本轮最新浏览器截图验收。
- `npm run typecheck` 与 `npm run build` 当前失败，原因见「验证与测试」。
- 正式端到端测试、浏览器兼容矩阵和发布流程仍待完善。
