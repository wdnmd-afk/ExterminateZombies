# 消灭僵尸 · 实测与可玩性验证说明

> 目的:提供一套可重复执行的测试流程,覆盖「游戏逻辑正确性」与「可玩性手感」两个层面。
> 每一轮改动(尤其是数值、系统、地形)后按本文档跑一遍,确保没有回归。

---

## 1. 测试分层

游戏测试分三层,从下往上成本递增、覆盖面递增:

| 层级 | 手段 | 抓什么问题 | 何时跑 |
|---|---|---|---|
| **L1 静态检查** | `npm run typecheck` / `npm run build` | 类型错误、字段拼写、编译失败 | 每次改代码后 |
| **L2 运行时冒烟** | headless Chrome + CDP 驱动 | 加载即崩、场景切换报错、运行时异常 | 每次改逻辑后 |
| **L3 人工可玩性** | 手动 `npm run dev` 试玩 | 手感、平衡、卡墙、视觉违和 | 每轮功能完成后 |

L1+L2 可自动化、无人值守;L3 必须真人操作,机器只能截图旁证。

---

## 2. L1 — 静态检查

```bash
npm run typecheck   # tsc --noEmit,零错误才算过
npm run build       # tsc + vite build,产出 dist/ 且无报错
```

**通过标准**:两条命令均以退出码 0 结束,无 TS 报错。构建的 chunk 体积警告(Phaser 本体 ~1.5MB)可忽略,不算失败。

---

## 3. L2 — 运行时冒烟(headless + CDP)

原理:用带远程调试端口的 Chrome 加载 dev 页面,通过 CDP(Chrome DevTools Protocol)驱动 Phaser 场景跳转,采集运行时异常并截图。这能抓住「编译通过但一运行就崩」的问题,是纯 `tsc` 抓不到的。

### 3.1 前置准备

```bash
# dev 服务器(若未运行)
npm run dev            # 监听 http://localhost:5173

# CDP 驱动依赖(仅测试用,不进 package.json)
npm i ws --no-save

# 启动带调试端口的 Chrome(路径按本机安装位置调整)
"/c/Program Files/Google/Chrome/Application/chrome.exe" \
  --headless=new --remote-debugging-port=9333 \
  --user-data-dir=.chrome-debug about:blank &
```

> `main.ts` 在 DEV 模式把游戏实例挂到 `window.__GAME__`,供 CDP 驱动调用 `scene.start` 直接跳关。该暴露被 `import.meta.env.DEV` 守卫,不进生产包。

### 3.2 驱动脚本要点(`.debug-drive.mjs`,临时文件)

脚本流程:
1. 连 CDP `http://127.0.0.1:9333/json` 拿 page target 的 webSocketDebuggerUrl
2. `Page.navigate` 到 `http://localhost:5173/`,等 ~3.5s 让 Boot→Preload→MainMenu 走完
3. 订阅 `Runtime.exceptionThrown` 收集运行时异常
4. `Runtime.evaluate` 执行 `window.__GAME__.scene.start('GameScene', { mode:'level', levelId:'level_1' })` 跳进目标关卡
5. 等 ~4s 让波次生成、僵尸移动
6. `Runtime.evaluate` 探针:读回 `scene.isActive('GameScene')`、`isActive('HUDScene')`、场景 children 数量
7. `Page.captureScreenshot` 截图落地为 PNG
8. 打印 errors 数组

### 3.3 通过标准

- **errors: none** — 无任何运行时异常(最关键)
- **GameScene active + HUDScene active** — 两场景并行运行
- **children > 0** — 场上有对象(玩家/僵尸/障碍物/场景物已生成)
- 截图非纯黑/纯背景 — 确认实际渲染

### 3.4 覆盖矩阵(每轮至少跑关卡模式三关 + 无尽)

| 用例 | 跳转参数 | 重点看 |
|---|---|---|
| 第一关 | `{mode:'level', levelId:'level_1'}` | 集装箱渲染、僵尸生成、HUD |
| 第二关 | `{mode:'level', levelId:'level_2'}` | 废车渲染、Boss 波(tank_boss) |
| 第三关 | `{mode:'level', levelId:'level_3'}` | 路障渲染、bomber 群、Boss(bomber_boss) |
| 无尽模式 | `{mode:'endless', levelId:null}` | 程序化波次、随机场景物、无障碍物空场 |

### 3.5 清理

```bash
taskkill //F //IM chrome.exe            # 关调试 Chrome
rm -rf .chrome-debug .debug-*.png .debug-drive.mjs
npm uninstall ws 2>/dev/null || true    # --no-save 装的一般无需卸
```

---

## 4. L3 — 人工可玩性清单

`npm run dev` → 打开 `http://localhost:5173` → 逐项验证。分「逻辑」与「手感」两组。

### 4.1 核心逻辑(对/错,可客观判定)

- [ ] **移动**:WASD 四向 + 斜向,斜向不比直向快(归一化生效)
- [ ] **瞄准**:玩家枪管始终指向鼠标
- [ ] **射击**:左键出弹,子弹朝准星飞;子弹飞出射程/边界消失
- [ ] **手枪无限**:把手枪打到弹匣空 → 自动换弹 → 备用弹仍显示 `∞`,可无限继续射击(核心防软锁死)
- [ ] **重型限量**:拾取冲锋枪/步枪后,备用弹是有限数字,打光后不再自动补充(需再拾取)
- [ ] **换弹**:R 键换弹,换弹期间不能射击
- [ ] **切枪**:1-4 数字键 / 滚轮切换已拥有武器,HUD 同步
- [ ] **僵尸追击**:僵尸从屏幕边缘生成,朝玩家移动
- [ ] **命中扣血**:子弹命中僵尸,僵尸闪白、掉血、血尽死亡并加分
- [ ] **僵尸攻击**:僵尸接触玩家,玩家掉血(有无敌帧,不会瞬间被连扣致死)
- [ ] **油桶**:射击油桶 → 爆炸 → 火焰残留区持续烧伤范围内僵尸
- [ ] **面粉桶**:射击面粉桶 → 爆炸 + 粉尘云,粉尘云期间僵尸被挡在外面
- [ ] **连锁爆炸**:相邻油桶/面粉桶/地雷被爆炸波及会连环引爆
- [ ] **地雷**:Q 布置地雷,僵尸靠近触发爆炸;受 carryMax 上限
- [ ] **掉落拾取**:僵尸死亡掉落弹药/道具/血/武器,玩家碰到拾取,HUD 更新
- [ ] **波次推进**:一波清空后进入下一波,HUD 波数递增,有波次公告
- [ ] **Boss 波**(二、三关):常规波打完后单独一波 Boss,有 BOSS WAVE 公告
- [ ] **通关**:打完最后一波(含 Boss)进 LevelClear,解锁下一关(回菜单确认解锁状态持久)
- [ ] **失败**:玩家血尽进 GameOver,可重试/回菜单
- [ ] **暂停**:ESC 冻结战场(僵尸/子弹静止),再按恢复
- [ ] **地形挡移动**:玩家撞不穿集装箱/废车/路障;僵尸也被挡,沿墙滑行绕过(不卡死、不穿墙)
- [ ] **地形挡子弹**:子弹打在障碍物上消失,不穿过

### 4.2 可玩性手感(主观,记录感受)

- [ ] **僵尸速度**:当前全局降速 25% 后是否舒适?runner(105)是否仍偏快?
- [ ] **手枪节奏**:无限手枪是否"够用但偏弱",让人有动力去抢重型武器?
- [ ] **弹药紧张度**:重型弹药靠掉落是否过紧(打不动)或过松(管够)?
- [ ] **地形价值**:掩体是否真能用来卡视线/脱身,而不是纯碍事?
- [ ] **难度曲线**:三关是否递增合理?第一关是否太难劝退?
- [ ] **视觉一致性**:集装箱/废车/路障的手绘外观与圆形僵尸、方块玩家风格是否统一,不违和?
- [ ] **爆炸爽感**:连锁爆炸清场是否有正反馈?

### 4.3 边界与压力

- [ ] 长时间不动,僵尸是否正确围拢并造成压力
- [ ] 无尽模式后期(第 8 波以上)僵尸数量多时是否掉帧
- [ ] 把僵尸引到障碍物密集区,是否出现集体卡死或抖动
- [ ] 隐私/无痕窗口下运行(localStorage 受限),是否仍能开始游戏不崩(SaveManager 兜底)

---

## 5. 本轮测试记录模板

> 每轮把结果填这里,便于追踪回归。

```
轮次:____    日期:____    对应改动:____

L1 静态：typecheck [  ]  build [  ]
L2 冒烟：level_1 [  ]  level_2 [  ]  level_3 [  ]  endless [  ]   errors: ____
L3 逻辑：通过 __/24 项，失败项：____
L3 手感：____（简述感受与待调数值）

结论：[ ] 通过  [ ] 有阻塞问题（列出）
```
