# 丧尸灭绝 (ExterminateZombies) - 漫画风格美术方案与需求规范

## 1. 视觉风格定义 (Visual Style Definition)

本方案采用 **美漫黑稿/硬边阴影风 (American Comic/Graphic Novel Style)**，融合高对比度粗描边、网点阴影（Halftone Shader）与充满张力的动态表现力（如拟声词贴纸、集中线特效）。

### 1.1 核心视觉元素
- **粗重黑线条 (Bold Black Outlines)**: 所有的角色、道具和建筑物使用 3px - 6px 的强对比黑描边，强化漫画剪影。
- **美漫阴影 (Cell Shading & Cross-hatching)**: 不使用平滑渐变，而是使用硬边块状阴影或斜线交叉网格（Cross-hatching）表达立体感。
- **复古网点纸感 (Halftone Pattern)**: 背景及特效带有打印漫画特有的 Halftone 微小网点感。
- **拟声词与动作线 (Onomatopoeia & Action Lines)**: 击杀、爆炸、枪击时出现经典的漫画文本框（如 *BOOM!*, *RAT-TAT-TAT!*, *SPLASH!*）。

### 1.2 主题色板 (Color Palette)

| 色彩类型 | 16进制色值 | 用途说明 |
| :--- | :--- | :--- |
| **主背景 (Paper Tone)** | `#F4EEDD` / `#1A181C` | 复古漫画纸张底色（浅色）/ 夜间黑稿暗色底（深色） |
| **主描边 (Comic Black)** | `#0F0E13` | 统一字符与场景外边框描边 |
| **血腥红 (Zombie Red)** | `#D32F2F` | 击杀、暴击、受击与爆炸特效 |
| **变异绿 (Toxic Green)** | `#388E3C` | 毒液丧尸、辐射区域、感染槽 UI |
| **高亮黄 (Impact Yellow)**| `#FBC02D` | 拟声词框、提示箭头、高亮捡拾物 |
| **金属灰 (Gunmetal)** | `#455A64` | 枪械、机械与掩体设施 |

---

## 2. 角色与场景美术需求清单 (Asset Requirements)

### 2.1 角色与丧尸元素 (Characters & Zombies)
1. **幸存者玩家 (Player Hero)**:
   - 俯视角/侧视角矢量组件（包含头部、枪械手臂、动作阴影）。
   - 动作帧：站立、移动、射击、换弹。
2. **普通丧尸 (Walker Zombie)**:
   - 撕裂衣物、破损身体剪影、破皮粗描边。
3. **疾跑丧尸 (Runner Zombie)**:
   - 前倾体态、带风噪动作线（Speed Lines）。
4. **巨型自爆丧尸 (Tank Zombie)**:
   - 庞大肌肉与膨胀身体、带有绿色毒雾或红光核心。
5. **酸液远攻击丧尸 (Spitter Zombie)**:
   - 膨胀头部、吐酸液喷射线段。

### 2.2 场景与道具 (Props & Environment)
- **掩体/障碍物**: 带有漫画排线阴影的破旧汽车、沙包、废弃木箱、油桶（带警告标志）。
- **武器图标**: 手枪、霰弹枪、突击步枪、手雷、医疗包的美漫图示。
- **地面材质**: 复古网点沥青路面、破裂地砖、带有血迹/酸液溅射区域（Splatter）。

### 2.3 UI 与 特效组件 (UI & Visual FX)
- **对话/拟声框 (Speech & Action Bubbles)**:
  - 锯齿状爆破框（用于伤害数字或枪声）。
  - 圆角对话框（用于NPC提示或剧情引导）。
- **生命值/感染槽 (Health & Infection Bars)**:
  - 粗线条黑框 + 不规则块状填充（非传统平滑进度条）。
- **击杀特效**:
  - *POW!*, *BANG!*, *CRUNCH!* 美漫文字图片/SVG。

---

## 3. 技术落地方案 (Technical Implementation)

### 3.1 SVG 程序化生成 (Programmatic SVG Assets)
为保证极致的资源体积与清晰度，项目采用原生代码生成矢量漫画 SVG 图标与基础精灵（Sprite）。

### 3.2 CSS / Canvas 漫画滤镜 (Comic Shader Effect)
应用 CSS 后处理滤镜强化漫画感：
```css
.comic-style {
  filter: contrast(140%) saturate(120%);
  box-shadow: 4px 4px 0px #0F0E13;
  border: 3px solid #0F0E13;
}
```

### 3.3 开源漫画风素材补充 (Open Source Asset Pipeline)
在缺少特定动画时，优先从以下免费/CC0平台引入：
1. **OpenGameArt.org**: 检索关键字 `Comic`, `Cel-shaded`, `Comic Book Zombies`
2. **Kenney.nl**: 引入 `UI Pack (Comic/Toon)`，转换为 2D 漫画质感
3. **Itch.io (Free Game Assets)**: 搜寻漫画矢量包

---

## 4. 后续执行计划 (Next Steps)
1. 率先使用代码在前端编写一组**美漫风格 UI 组件与拟声词特效组件**。
2. 绘制基础角色（玩家与丧尸）的 SVG 矢量组件。
3. 整合至游戏主渲染流程中，检验画风效果。
