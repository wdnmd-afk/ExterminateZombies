# 本地候选包与发布门禁

> 本文件是交付步骤，不是发布批准。当前版本仍为 `0.1.0`，源码 `LICENSE` 尚未由用户确定；不自动套用 MIT、不重新授权第三方或项目生成素材、不自动上传／部署。

## 1. 本轮候选变更说明

- 共用完整按下／松开交互，补齐设置、整备、卡片和 Credits；整备最后一槽与确认按钮不再遮挡，主页新增“制作与许可”。
- 新增七张 UI 图标／边框；Canvas 回退与 WebGL 共用八块图片边框，并修正高清文字纹理源分辨率同步。
- 五角色／17 武器使用原完整人物与枪层的分武器待机、射击、换弹、切枪姿态；不是新手绘逐帧动画，不改变伤害、射速和弹药。
- 第 3—7 关首批十个独立战术时刻使用油桶／面粉桶，近身 180px 跳过投放；不增加敌群预算。8—30 关的全面独立制作不在本批完成范围。
- 存档保持 v7；没有数据库／服务端迁移，不改变既有三模式纪录隔离。

已知限制：F-08 爆破狂潮最近自然局仍 300 秒超时；全部真人体验、真实目标设备和公开试玩待完成；主 JS 大包警告保留。最新实际验收数和候选指纹以 `main-goal.md` 与闭环证据为准。

## 2. 可复现的本地候选包

在依赖已经安装、仍有本地验证授权的项目根目录执行；禁止因此自动运行 `npm install` 或 `npm ci`。每次使用新编号，不覆盖失败或旧候选。

```powershell
npm test
$nodeTests = Get-ChildItem -LiteralPath tests -Filter '*.test.mjs' | Select-Object -ExpandProperty FullName
node --test @nodeTests
npm run typecheck
npm run build
$env:EZ_CHROME_RENDERER = 'auto'
node scripts/cdp-production-benchmark.mjs <新编号> <空闲CDP端口> 30
node scripts/prepare-local-release.mjs .release-candidates/<新候选编号> docs/execution/evidence/2026-10-08-scene-acceptance/<新编号>/build.json docs/execution/evidence/<新证据目录>/release-report.json
```

尖括号表示需替换的参数，不原样输入。短局须再目视开始／结束图确认确实处于战斗。

预检复制生产包及 60 份当前来源／许可材料，不复制 `node_modules` 全目录、AI 原图、浏览器配置、存档、日志或历史截图；`.release-candidates/` 已被忽略，避免把重复的约 93MB 交付包纳入 Git。

检查项包括 226 个运行时文件、九个 UI 的登记接线、生产包所有文件指纹、生产实景所记录的源码、许可原文存在性，以及候选包逐文件回环 HTTP／MIME／字节校验。源码只比较实景记录过的文件，不把它声称为全仓库源码与构建的形式化一致性证明。

- `0`：本工具当前不使用此退出码表示可发布。
- `1`：技术预检失败，不得交付；保留现场，修复后生成新候选。
- `2`：本地材料和技术检查通过，但外部／发布门禁仍开放。**这是预期阻断，不能在流水线中忽略后自动部署。**

`release-report.json` 始终明确 `publicReleaseReady=false`。源码 `LICENSE` 即便出现，也不自动代表权利人确认了项目生成图或发布范围。

## 3. 必须由真实条件关闭的门禁

| 门禁 | 当前缺口 | 关闭方式 |
| --- | --- | --- |
| F-08 | 爆破狂潮自然成功未达 | 先提出有限、可检验的输入／路线诊断；正常击杀首领才可关闭，不调低游戏难度来过验收 |
| P2／V6 | 独立一局、同一试玩者三个记忆点、视觉／手感／实听 | 使用 [`acceptance/PLAYTEST_ACCEPTANCE.md`](acceptance/PLAYTEST_ACCEPTANCE.md) 由真实参与者回填并留证 |
| P5 | 指定设备、Chrome／Edge／Firefox 实际体验与公开试玩 | 用户明确目标机器、合格标准和试玩渠道；本机 rAF 不能代替 |
| G7-3 | 三张重火力采用原图 | 按下节取得原图、采用版本与来源记录；不能重生图冒充 |
| P6 许可 | 源码许可和项目生成视觉对外使用范围 | 权利人明确决定；第三方许可证保持独立，必要时由专业人士审阅 |
| 对外发布 | 版本号、部署主机、路径、参与者／公众范围和授权 | 用户明确后执行；本轮只构造回环可检验的本地候选 |

## 4. 三张采用原图的准确交付要求

运行时成品为 132×48，不能从它们放大还原来源。需要备份持有人提供**当时实际采用的完整原图**、真实版本号、来源／生成记录及采用时间；普通候选即使同名也不直接认定为采用稿。

| 成品 | 管线期待的候选命名 |
| --- | --- |
| `src/assets/processed/weapons/gatling.png` | `TmpGenerate/weapon-gatling-icon-<采用版本>.png` |
| `src/assets/processed/weapons/golden_m249.png` | `TmpGenerate/weapon-golden-m249-icon-<采用版本>.png` |
| `src/assets/processed/weapons/flamethrower.png` | `TmpGenerate/weapon-flamethrower-icon-<采用版本>.png` |

当前成品 SHA-256、尺寸、字节数和已知候选目录只读检查结果由 `node scripts/audit-delivery-workspace.mjs docs/execution/evidence/<新目录>/workspace.json` 输出。未找回之前，这一项继续开放；四张战术道具采用原图已归档，不重复报缺。

收到材料后先用 `inspect_weapon_side_candidates.py <id> --version <真实版本>` 只读检查，再调用现有 `process_weapon_side_assets.build_icon()` 写入新的 `.asset-candidates/` 子目录，与成品逐字节比对。不要直接运行会覆盖成品的 `process_weapon_side_assets.py all`。能复现才归档到 `generated/` 并补 SOURCE、原图／成品指纹及采用依据；不能复现时保留差异，不伪造哈希匹配。

## 5. 获准后的部署与回滚步骤（尚未执行）

1. 冻结提交／候选 fingerprint、最终版本号、签认表和阻断清单。重新生成验证候选，不发布带“尚未获准”的旧包。
2. 先在指定主机的非公开版本目录放置整个 `payload`；`vite.config.ts` 当前 `base: './'`，入口及资源相对路径必须保持一致。使用 HTTP(S)，不双击 `file://`。
3. 部署 HTML 不长期缓存；内容哈希资产可用长期不可变缓存。验证正确 MIME、字体／音频加载、所有许可材料 URL、刷新／返回菜单、自然结算和旧 v7 存档读取。
4. 使用负责人批准的稳定 URL 做灰度。`localStorage` 按 scheme／host／port 隔离；换域名或端口不会迁移存档，不能把新 origin 空存档报成数据损坏。收集反馈须事先取得参与者知情同意。
5. 保留上一已验证版本及其完整哈希清单；出现启动、存档或稳定流程阻断时切回上一个版本目录／发布指针，再次核验入口和资源。禁止通过删玩家 localStorage“回滚”。未来有存档版本迁移时必须另立向前／向后兼容方案，本批未迁移。
6. 回填真实部署／回滚结果后才关闭对应 P6 项。本轮仅完成方案和本地包验证，不声称已验证某个公共平台的缓存、发布或回滚操作。
