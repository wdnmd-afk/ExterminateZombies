
### **规划文档：武器增强系统 (Weapon Enhancement System)**

**版本**: 1.0
**目标**: 设计并规划一个通过击杀敌人概率掉落、拾取后提供三选一武器强化的新系统，以增加游戏的局内成长和策略选择。
**关联文档**: `PROJECT_MASTER_PLAN.md`

### 1. 功能概述

该系统为游戏增加一个核心的局内成长机制。玩家在击杀僵尸时，有小概率获得一个名为“武器增强包”的特殊掉落物。拾取该掉落物后，游戏将暂停，并弹出一个界面，展示若干张（暂定3-6张）随机抽取的“武器增强卡”。玩家只能选择其中一张。卡片会为玩家当前持有的一把武器提供一个永久（本局游戏内）的强大增益。

这个系统的设计目标是：
*   **增加策略深度**: 玩家需要根据当前战况和持有的武器组合，做出有利的选择。
*   **提升可复玩性**: 随机的卡片组合让每一局游戏的成长路线都独一无二。
*   **创造“爽点”**: 某些增强效果会极大地改变武器的手感和效能，带来显著的强度提升。

### 2. 核心玩法流程

1.  **掉落**: 任意僵尸被击杀时，有独立的低概率（例如 1-5%）生成一个“武器增强包”掉落物。
2.  **拾取**: 玩家角色接触到“武器增强包”时，该掉落物消失。
3.  **暂停与选择**: 游戏逻辑立刻暂停（敌人和子弹静止），并在屏幕中央弹出一个卡片选择界面。
4.  **卡片生成**: 系统会从一个预设的“增强卡池”中，根据玩家当前拥有的武器，随机抽取N张（例如6张）不重复的卡片进行展示。
5.  **决策**: 每张卡片都清晰地显示它将增强哪把武器，以及具体的增强效果描述。玩家用鼠标点击选择一张卡片。
6.  **应用与恢复**: 选择后，卡片选择界面消失，所选的增强效果立即应用到对应武器上。游戏逻辑恢复正常。
7.  **后续**: 该增强效果持续到本局游戏结束。玩家可以继续通过掉落增强包，为其他武器或同一武器获得更多（不冲突的）增强。

### 3. 架构与模块设计

为了实现此功能，我们需要对现有架构进行扩展，并新增一些模块。

#### 3.1. 新增配置: `config/enhancements.ts`

这是整个系统的基石。我们需要创建一个新的配置文件来定义所有可能的武器增强效果。

```typescript:src/config/enhancements.ts
import type { WeaponId } from './weapons';

// 用于防止同一武器的冲突强化出现在同一次抽卡中, 例如散弹枪不能同时抽到“增加弹丸”和“变独头弹”
export type EnhancementExclusionKey = string;

export interface EnhancementDef {
  id: string; // 唯一ID, e.g., 'shotgun_double_pellets'
  weaponId: WeaponId; // 关联的武器ID
  exclusionKey?: EnhancementExclusionKey; // 互斥组ID, e.g., 'shotgun_ammo_mod'
  
  cardTitle: string; // 卡片标题, e.g., "双倍火力"
  cardDescription: string; // 卡片效果描述, e.g., "霰弹枪的弹丸数量翻倍，但单发伤害略微降低。"

  // 具体的效果改动, 由 WeaponManager 解析
  // 使用 key-value 形式，便于扩展
  effects: {
    // 乘法修正
    damageFactor?: number;      // e.g., 0.8 (伤害变为80%)
    fireRateFactor?: number;    // e.g., 0.5 (射速翻倍)
    reloadTimeFactor?: number;  // e.g., 1.2 (换弹时间增加20%)
    pelletsFactor?: number;     // e.g., 2.0 (弹丸数量翻倍)
    spreadFactor?: number;      // e.g., 1.5 (散射范围增加50%)

    // 替换/赋值
    setToAuto?: boolean;        // e.g., true (变为全自动)
    setPellets?: number;        // e.g., 1 (变为独头弹)
    setPenetration?: number;    // e.g., 10 (变为可穿透10个敌人)
    
    // 加法修正
    addSpread?: number;         // e.g., -5 (减少5度散射)
    addExplosionRadius?: number; // e.g., 50 (爆炸半径增加50像素)
  }
}

export const ENHANCEMENTS: Record<string, EnhancementDef> = {
  // 手枪
  pistol_auto: {
    id: 'pistol_auto', weaponId: 'pistol',
    cardTitle: '连射改造', cardDescription: '你的手枪变为全自动，按住即可连续开火。',
    effects: { setToAuto: true, fireRateFactor: 0.8 }
  },
  
  // 霰弹枪
  shotgun_double_pellets: {
    id: 'shotgun_double_pellets', weaponId: 'shotgun', exclusionKey: 'shotgun_ammo_mod',
    cardTitle: '双倍火力', cardDescription: '霰弹枪的弹丸数量翻倍，散射范围略微增大。',
    effects: { pelletsFactor: 2, spreadFactor: 1.2 }
  },
  shotgun_slug: {
    id: 'shotgun_slug', weaponId: 'shotgun', exclusionKey: 'shotgun_ammo_mod',
    cardTitle: '独头鹿弹', cardDescription: '霰弹枪变为发射单发高伤害独头弹，伤害变为3倍，且拥有1次穿透。',
    effects: { setPellets: 1, damageFactor: 3, setPenetration: 1, spreadFactor: 0.1 }
  },

  // RPG (假设已加入)
  rpg_wider_explosion: {
    id: 'rpg_wider_explosion', weaponId: 'rpg', exclusionKey: 'rpg_explosion_mod',
    cardTitle: '扩大爆炸', cardDescription: '火箭筒的爆炸半径增加50%。',
    effects: { addExplosionRadius: 50 }
  },
  
  // ... 其他武器的增强
};
```

#### 3.2. 游戏状态扩展: `src/systems/GameState.ts`

需要在 `PlayerState` 中添加一个字段来记录当前激活的增强。

```typescript:src/systems/GameState.ts
// ... in PlayerState interface
export interface PlayerState {
  // ... existing fields
  activeEnhancements: Set<string>; // 存储已激活的 EnhancementDef.id
}

// ... in createInitialState function
// ...
player: {
  // ... existing fields
  activeEnhancements: new Set<string>(),
},
// ...
```

#### 3.3. 僵尸掉落: `config/zombies.ts`

在 `ZombieDef` 的 `drops` 数组中增加一种新的掉落类型。

```typescript:config/zombies.ts
// ... in DropDef interface (or type)
export interface DropDef {
  type: 'ammo' | 'weapon' | 'item' | 'health' | 'enhancement_pack'; // 新增
  // ...
}

// ... in ZOMBIES definitions, e.g., for a boss or elite
tank: {
  // ...
  drops: [
    {type:'ammo', ammoType:'heavy', chance:0.6, amount:15},
    {type:'enhancement_pack', chance: 1.0} // 例如坦克Boss 100% 掉落
  ]
},
```

#### 3.4. 新增场景: `src/scenes/CardSelectionScene.ts`

这是一个全新的场景，用于显示卡片选择界面。

*   **职责**:
    1.  从 `GameScene` 接收一个包含6个 `EnhancementDef` 对象的数组作为启动数据。
    2.  创建6个卡片UI元素，并填充标题和描述。
    3.  监听鼠标点击事件，当玩家选择一张卡片时，通过事件系统通知 `GameScene` 玩家的选择。
    4.  关闭自身，并将控制权交还给 `GameScene`。
*   **特性**:
    *   它会覆盖在 `GameScene` 和 `HUDScene` 之上。
    *   背景可以是半透明的黑色，以突出卡片。
    *   它的 `create` 方法会暂停 `GameScene`。它的 `shutdown` 方法会恢复 `GameScene`。

#### 3.5. 游戏主场景: `src/scenes/GameScene.ts`

`GameScene` 需要承担流程控制的职责。

*   **拾取逻辑**: 在 `Player` 和掉落物（新的 `enhancement_pack` 类型）的碰撞回调中：
    1.  暂停当前场景的更新循环: `this.scene.pause()`。
    2.  调用“卡片抽取逻辑”（见下文）。
    3.  启动 `CardSelectionScene`，并将抽取的6张卡片数据传递过去: `this.scene.launch('CardSelectionScene', { cards: drawnCards })`。
*   **监听选择结果**: 监听 `CardSelectionScene` 发回的事件，例如 `onCardSelected`。
*   **应用增强**:
    1.  收到事件后，获取被选中的 `EnhancementDef.id`。
    2.  将其添加到 `GameState.player.activeEnhancements` 中。
    3.  关闭卡片场景: `this.scene.stop('CardSelectionScene')`。
    4.  恢复当前场景: `this.scene.resume()`。

#### 3.6. 新增系统: `EnhancementManager` (或作为 `GameScene` 的一部分)

这个模块负责核心的“抽卡”逻辑。

*   **`drawEnhancements(ownedWeapons: WeaponId[], activeEnhancements: Set<string>): EnhancementDef[]`**:
    1.  从 `config/enhancements.ts` 中筛选出所有与 `ownedWeapons` 相关的、且尚未被 `activeEnhancements` 包含的增强。
    2.  **处理互斥**: 遍历筛选出的增强列表。如果一个增强有 `exclusionKey`，则将所有具有相同 `exclusionKey` 的增强视为一组。在后续抽卡时，每组中最多只能抽取一个。
    3.  **随机抽取**: 从处理过的池子里，随机、不重复地抽取6个增强项。
    4.  返回这6个 `EnhancementDef` 对象。

#### 3.7. 核心逻辑修改: `src/systems/WeaponManager.ts`

这是最关键的修改。`WeaponManager` 在执行武器操作时，不能再只依赖静态的 `WeaponDef`，而需要结合动态的 `activeEnhancements`。

*   **建议方案**: 在 `WeaponManager` 中创建一个 `getEffectiveWeaponDef(weaponId)` 方法。
    *   该方法接收一个 `weaponId`。
    *   它首先获取基础的 `WeaponDef`。
    *   然后，它检查 `GameState.player.activeEnhancements`，找出所有应用于该 `weaponId` 的增强。
    *   它将这些增强的 `effects` 逐一应用到基础 `WeaponDef` 上，生成一个临时的、“有效的”武器定义对象，并返回。
    *   例如，`fire()`, `reload()` 等方法在执行时，不再直接用 `this.currentWeaponDef`，而是用 `this.getEffectiveWeaponDef(this.currentWeaponId)` 的结果。

### 4. UI/UX 设计草案

*   **卡片布局**:
    *   **标题**: `增强选择`
    *   **卡片**: 竖排卡片，包含：
        *   **卡片顶部**: 武器名称 (e.g., "霰弹枪")
        *   **卡片中部**: 增强标题 (e.g., "独头鹿弹")
        *   **卡片底部**: 详细描述 ("霰弹枪变为发射单发高伤害独头弹...")
    *   **交互**: 鼠标悬浮在卡片上有放大或高亮效果。点击即选中。

### 5. 实施步骤清单

1.  **[数据结构]** 在 `src/config/types.ts` 中定义 `EnhancementDef` 接口，并在 `src/config/enhancements.ts` 中创建配置文件和至少3-4个示例增强。
2.  **[状态管理]** 在 `GameState.ts` 的 `PlayerState` 中添加 `activeEnhancements: Set<string>`。
3.  **[掉落物]** 在 `config/zombies.ts` 中扩展 `DropDef`，并为至少一种敌人（如Boss）添加 `enhancement_pack` 掉落。在 `GameScene` 中实现该掉落物的生成。
4.  **[拾取与场景流]** 在 `GameScene` 中实现拾取 `enhancement_pack` 后的游戏暂停和场景启动逻辑。
5.  **[抽卡逻辑]** 实现 `EnhancementManager` 的 `drawEnhancements` 核心抽卡算法。
6.  **[新场景UI]** 创建 `CardSelectionScene.ts`，实现接收卡片数据并将其渲染出来的基本功能。
7.  **[交互闭环]** 实现 `CardSelectionScene` 的卡片选择、事件发送，以及 `GameScene` 接收事件、更新 `GameState` 并恢复游戏的功能。
8.  **[核心增强逻辑]** 修改 `WeaponManager.ts`，实现 `getEffectiveWeaponDef` 方法，并让 `fire` 方法使用它。首先实现一个简单的增强（如 `pistol_auto`）。
9.  **[端到端测试]** 完整测试一次从掉落、拾取、选择到增强生效的全过程。
10. **[扩展与完善]** 逐步实现 `enhancements.ts` 中定义的所有 `effects` 类型（乘法、加法、赋值等），并丰富卡池。
11. **[打磨]** 优化卡片UI、增加过渡动画和音效。

### 6. 潜在风险

*   **平衡性**: 这是最大的风险。某些增强组合可能会过于强大。需要在后续的测试阶段进行大量调整。`effects` 中使用乘法因子（`damageFactor`）而不是直接赋值，有助于进行更精细的平衡。
*   **逻辑复杂性**: `WeaponManager` 的 `getEffectiveWeaponDef` 方法如果处理不当，可能会变得臃肿。需要确保代码清晰，注释到位。
*   **UI/UX**: 卡片选择界面必须清晰、无歧义，并且不能在暂停/恢复时产生BUG。

