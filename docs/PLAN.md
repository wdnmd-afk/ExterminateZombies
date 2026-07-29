# 消灭僵尸 · 网页版游戏 — 技术方案与实施计划

> 类型:俯视角射击(Top-down Shooter)
> 目标:武器系统 + 道具/场景交互 + 关卡通关 + 无尽模式,可自定义键位
> 美术策略:先用纯色几何图形做占位(圆=僵尸、方块=玩家、线=子弹),系统跑通后再替换正式素材。

---

## 1. 技术选型

### 1.1 前端(游戏本体)

| 项 | 选择 | 理由 |
|---|---|---|
| 游戏引擎 | **Phaser 3**(`phaser@3.x`) | 成熟的 2D 网页游戏引擎,自带 game loop、精灵、动画、物理(Arcade Physics)、场景管理、输入、音频、粒子。省掉手写底层,专注玩法系统。 |
| 构建工具 | **Vite** | ES 模块 + 秒级热更新,便于把武器/僵尸/道具/关卡拆成独立文件维护;`npm run build` 一键产出静态文件可直接部署。 |
| 语言 | **TypeScript** | 数据驱动项目配置表字段多,TS 编译期就能拦住字段名拼错、漏填、类型不符等低级错误;Vite 原生支持,零额外配置成本。 |
| 物理系统 | **Phaser Arcade Physics** | 俯视角只需 AABB/圆形碰撞与重叠检测,Arcade 足够且性能好;不用上 Matter.js(那是给刚体/关节用的,过重)。 |
| 状态/存档 | **localStorage** + 一层封装 `SaveManager` | 存最高波数、关卡解锁进度、键位设置。无需后端。 |

### 1.2 后端(明确:MVP 不需要)

本游戏是**纯单机**。所有进度、最高分、设置都存在浏览器 `localStorage`,**不需要任何服务端**。

只有出现以下需求时才引入后端,届时的方案:

| 需求 | 后端方案 |
|---|---|
| 全球在线排行榜 | 轻量:Serverless 函数(Cloudflare Workers / Vercel Functions)+ 托管数据库(Supabase / Neon Postgres)。只需 2 个接口:`POST /score`、`GET /leaderboard`。 |
| 账号 / 云存档 | Supabase(自带 Auth + Postgres + 存储),前端直连,免自建服务器。 |
| 联机对战 | Node + Colyseus(专门的房间制多人游戏框架,WebSocket)。这是大改动,不在当前范围。 |

> 结论:当前计划**不写后端**。文档记录方案,以便日后扩展时不返工(所有分数/存档读写都走 `SaveManager` 这一层,将来换成网络请求只改这一个文件)。

### 1.2.1 数值配置放在哪(与后端无关)

一个关键澄清:**游戏数值(角色生命值、武器伤害、僵尸血量等)不是后端要管的数据**。要区分两类数据:

| 数据类型 | 例子 | 存在哪 | 需要后端吗 |
|---|---|---|---|
| **设计期常量**(游戏平衡数值) | 手枪伤害 25、玩家满血 100、坦克僵尸 300 血、地雷携带上限 5 | `src/config/` 里的配置表,`vite build` 时**打包进游戏本体** | ❌ 不需要 |
| **运行期用户数据**(每玩家不同、需跨设备/跨用户共享) | 全球排行榜、账号、云存档 | 数据库(需服务端) | ✅ 才需要 |

生命值、武器数值、僵尸数值全部属于第一类——它们是**游戏设计规则**,不是用户产生的数据。它们写在 `config/weapons.ts`、`config/zombies.ts`、`config/items.ts`、`config/levels.ts` 里(见第 3 章的完整 schema 与示例数值),随代码一起打包成静态文件,玩家打开网页时就下载到浏览器里了。

- **改数值** = 改 `src/config/` 下的文件 → 重新 `vite build` → 部署。不涉及任何数据库。
- **后端只有在"把不同玩家的数据存起来互相比较或跨设备同步"时才需要**(如全球排行榜),方案见上一节。

所以当前无后端方案对"设置角色/武器/僵尸数值"这件事完全够用,数值配置的唯一位置就是 `src/config/`。

### 1.3 部署

`vite build` 产出 `dist/` 纯静态文件,可直接丢到 GitHub Pages / Netlify / Vercel / 任意静态托管。无服务端依赖。

---

## 2. 整体架构

### 2.1 场景(Scene)流转

Phaser 用 Scene 组织游戏阶段。HUD 与战斗场景**并行运行**(HUD 叠在 Game 之上),这样战斗暂停时 HUD 也能独立处理。

```
BootScene      → 初始化配置、注册全局管理器
   ↓
PreloadScene   → 加载资源(现阶段几乎无资源,直接过)
   ↓
MainMenuScene  → [开始关卡] [无尽模式] [设置]
   ↓                              ↓
GameScene ═══ 并行 ═══ HUDScene    SettingsScene(改键位)
   ↓
GameOverScene / LevelClearScene → 回菜单 or 下一关
```

### 2.2 系统分层

```
┌─────────────────────────────────────────────┐
│  Scenes(编排):Game / HUD / Menu / Settings │
├─────────────────────────────────────────────┤
│  Systems(逻辑,场景无关,可注入):            │
│   InputManager  WeaponManager  ItemManager    │
│   WaveManager   AreaEffectFactory  SaveManager│
├─────────────────────────────────────────────┤
│  Entities(游戏对象):                         │
│   Player  Zombie  Bullet  Prop  Pickup        │
├─────────────────────────────────────────────┤
│  Config(数据表,纯数据):                     │
│   weapons  zombies  items  levels  keybinds   │
├─────────────────────────────────────────────┤
│  Utils:ObjectPool、数学/角度、常量           │
└─────────────────────────────────────────────┘
```

核心原则:**数据驱动**。所有"内容"(有几把枪、僵尸多强、关卡怎么排)都在 `config/` 里,系统只读配置执行。加新枪/新僵尸/新关卡 = 往表里加一条,不动逻辑代码。

---

## 3. 数据结构详解

这是全项目的地基。下面给出每张配置表的字段(schema)和示例,以及运行时的核心数据结构。

> **关于类型的约定**:配置表用 `satisfies Record<string, XxxDef>` 校验。这样既能保证每条记录都符合接口(字段写错/漏填当场编译报错),又保留字面量的精确类型(例如 `WEAPONS.pistol.id` 推断为 `'pistol'` 而非宽泛的 `string`)。所有 `interface` 统一放在 `src/config/types.ts`,配置表从中 `import type`。

### 3.1 武器配置表 `config/weapons.ts`

```ts
// —— src/config/types.ts ——
export type AmmoType = 'light' | 'heavy' | 'shell';

export interface WeaponDef {
  id: string;            // 唯一标识
  name: string;          // 显示名
  damage: number;        // 单发伤害
  fireRate: number;      // 射击间隔(毫秒),越小越快
  magazineSize: number;  // 弹匣容量
  reloadTime: number;    // 换弹耗时(毫秒)
  bulletSpeed: number;   // 子弹速度(像素/秒)
  spread: number;        // 散射角度(度),0=绝对精准
  pellets: number;       // 每次击发射出的子弹数(霰弹枪 >1)
  penetration: number;   // 每颗子弹可贯穿的敌人数(0=命中即消失)
  auto: boolean;         // true=按住连发,false=单发
  ammoType: AmmoType;    // 弹药类型(与掉落匹配)
  range: number;         // 子弹最大飞行距离(像素),超出销毁回池
}

// —— src/config/weapons.ts ——
import type { WeaponDef } from './types';

export const WEAPONS = {
  pistol:  { id:'pistol',  name:'手枪',   damage:25, fireRate:300, magazineSize:12, reloadTime:1000,
             bulletSpeed:800, spread:2,  pellets:1, penetration:0, auto:false, ammoType:'light', range:700 },
  shotgun: { id:'shotgun', name:'霰弹枪', damage:18, fireRate:800, magazineSize:6,  reloadTime:1600,
             bulletSpeed:700, spread:14, pellets:7, penetration:1, auto:false, ammoType:'shell', range:400 },
  rifle:   { id:'rifle',   name:'步枪',   damage:35, fireRate:120, magazineSize:30, reloadTime:1500,
             bulletSpeed:1000,spread:4,  pellets:1, penetration:2, auto:true,  ammoType:'heavy', range:900 },
  smg:     { id:'smg',     name:'冲锋枪', damage:15, fireRate:70,  magazineSize:40, reloadTime:1300,
             bulletSpeed:850, spread:8,  pellets:1, penetration:0, auto:true,  ammoType:'light', range:600 },
} satisfies Record<string, WeaponDef>;

export type WeaponId = keyof typeof WEAPONS;  // 'pistol' | 'shotgun' | 'rifle' | 'smg'
```

### 3.2 僵尸配置表 `config/zombies.ts`

```ts
import type { EffectDef } from './items';

export type AmmoType = 'light' | 'heavy' | 'shell';

export interface DropDef {
  type: 'ammo' | 'weapon' | 'item' | 'health';
  ammoType?: AmmoType;   // type==='ammo' 时用
  itemId?: string;       // type==='item'/'weapon' 时用
  chance: number;        // 0~1 掉落概率
  amount?: number;       // 数量
}

export interface ZombieDef {
  id: string;
  name: string;
  health: number;
  speed: number;         // 追击速度(像素/秒)
  damage: number;        // 接触/攻击伤害
  attackRate: number;    // 攻击间隔(毫秒)
  radius: number;        // 碰撞半径
  color: number;         // 占位颜色(0xRRGGBB)
  scoreValue: number;    // 击杀得分
  drops: DropDef[];      // 掉落表
  explodeOnDeath?: EffectDef;  // 死亡爆炸(爆炸僵尸),缺省=不爆
}

export const ZOMBIES = {
  walker: { id:'walker', name:'普通',  health:50,  speed:60,  damage:10, attackRate:1000, radius:14,
            color:0x88aa88, scoreValue:10, drops:[{type:'ammo', ammoType:'light', chance:0.25, amount:8}] },
  runner: { id:'runner', name:'快速',  health:30,  speed:140, damage:8,  attackRate:800,  radius:11,
            color:0xccaa44, scoreValue:15, drops:[{type:'ammo', ammoType:'light', chance:0.2,  amount:6}] },
  tank:   { id:'tank',   name:'坦克',  health:300, speed:35,  damage:25, attackRate:1500, radius:24,
            color:0x556655, scoreValue:40, drops:[{type:'ammo', ammoType:'heavy', chance:0.6,  amount:15}] },
  bomber: { id:'bomber', name:'爆炸',  health:40,  speed:80,  damage:5,  attackRate:1000, radius:13,
            color:0xdd5533, scoreValue:25, drops:[],
            explodeOnDeath:{ kind:'explosion', damage:60, radius:70 } },
} satisfies Record<string, ZombieDef>;

export type ZombieId = keyof typeof ZOMBIES;
```

### 3.3 道具/场景物配置表 `config/items.ts`

统一描述"场景爆炸物"和"玩家携带道具",区别在 `category` 与 `trigger`。`EffectDef` / `LingerDef` 在此定义,被 zombies 表的 `explodeOnDeath` 和 AreaEffectFactory 复用。

```ts
export type ItemCategory = 'prop' | 'deployable';
export type ItemTrigger = 'onDamage' | 'onProximity' | 'manual';

export interface LingerDef {
  kind: 'fire' | 'dust';
  duration: number;         // 持续毫秒
  radius: number;           // 区域半径
  tickDamage?: number;      // 每跳伤害(火)
  tickRate?: number;        // 伤害间隔毫秒
  blocksEnemies?: boolean;  // 是否阻挡僵尸(面粉粉尘云 = true)
  slowFactor?: number;      // 减速系数 0~1(可选)
}

export interface EffectDef {
  kind: 'explosion';
  damage: number;           // 爆炸中心瞬时伤害
  radius: number;           // 爆炸半径
  lingering?: LingerDef;    // 残留区域效果(可无)
}

export interface ItemDef {
  id: string;
  name: string;
  category: ItemCategory;   // prop=地图上的场景物; deployable=玩家携带布置
  trigger: ItemTrigger;     // 触发方式
  chainable: boolean;       // 是否会被其它爆炸连锁引爆
  color: number;            // 占位颜色
  effect: EffectDef;        // 触发后产生的效果
  health?: number;          // prop 被打爆所需伤害(onDamage 用)
  proximity?: number;       // 触发半径(onProximity 用,如地雷)
  carryMax?: number;        // 携带上限(deployable 用)
}

export const ITEMS = {
  barrel_oil: {
    id:'barrel_oil', name:'油桶', category:'prop', trigger:'onDamage', health:1, chainable:true,
    color:0xcc7722,
    effect:{ kind:'explosion', damage:120, radius:90,
             lingering:{ kind:'fire', duration:3000, radius:70, tickDamage:15, tickRate:400 } },
  },
  barrel_flour: {
    id:'barrel_flour', name:'面粉桶', category:'prop', trigger:'onDamage', health:1, chainable:true,
    color:0xeeeecc,
    // 粉尘爆炸 + 残留粉尘云阻挡僵尸几秒(战术脱身)
    effect:{ kind:'explosion', damage:80, radius:100,
             lingering:{ kind:'dust', duration:4000, radius:90, blocksEnemies:true, slowFactor:0 } },
  },
  mine: {
    id:'mine', name:'地雷', category:'deployable', trigger:'onProximity', proximity:40, chainable:true,
    color:0x999999, carryMax:5,
    effect:{ kind:'explosion', damage:150, radius:80 },
  },
} satisfies Record<string, ItemDef>;

export type ItemId = keyof typeof ITEMS;
```

### 3.4 关卡配置表 `config/levels.ts`

```ts
import type { ZombieId } from './zombies';
import type { ItemId } from './items';

export interface WaveDef {
  enemies: { type: ZombieId; count: number }[];  // 本波僵尸构成
  spawnInterval: number;  // 两只之间生成间隔(毫秒)
  startDelay: number;     // 进入本波后的准备时间(毫秒)
}

export interface PropPlacement {
  type: ItemId;           // ITEMS 里 category==='prop' 的 id
  x: number;
  y: number;
}

export interface LevelDef {
  id: string;
  name: string;
  props: PropPlacement[]; // 本关手工摆放的场景物
  waves: WaveDef[];
  boss: { type: ZombieId } | null;  // Boss(用强化版僵尸 id),或 null
}

export const LEVELS: LevelDef[] = [
  {
    id:'level_1', name:'第一关:郊外',
    props:[ {type:'barrel_oil', x:400, y:300}, {type:'barrel_flour', x:900, y:500} ],
    waves:[
      { enemies:[{type:'walker',count:10}], spawnInterval:800, startDelay:2000 },
      { enemies:[{type:'walker',count:12},{type:'runner',count:4}], spawnInterval:600, startDelay:3000 },
      { enemies:[{type:'walker',count:15},{type:'tank',count:1}], spawnInterval:500, startDelay:3000 },
    ],
    boss:null,
  },
  // level_2, level_3 ...
];
```

### 3.5 键位配置 `config/keybinds.ts`(可自定义的默认值)

```ts
// 统一的按键代号字符串(InputManager 负责解析成 Phaser 的监听):
//   键盘:'W' 'S' 'A' 'D' 'R' 'ONE'..'NINE'
//   鼠标:'MOUSE_LEFT' 'MOUSE_RIGHT'
//   滚轮:'WHEEL_UP' 'WHEEL_DOWN'
export type KeyCode = string;

// 所有可绑定的动作。新增动作时在此加一行,InputManager/设置界面都会跟着约束。
export interface Keybinds {
  moveUp: KeyCode; moveDown: KeyCode; moveLeft: KeyCode; moveRight: KeyCode;
  fire: KeyCode;
  reload: KeyCode;
  deployItem: KeyCode;   // 布置当前道具
  nextItem: KeyCode;     // 切换携带道具种类
  nextWeapon: KeyCode; prevWeapon: KeyCode;
  weapon1: KeyCode; weapon2: KeyCode; weapon3: KeyCode; weapon4: KeyCode;
  pause: KeyCode;
}

// 可绑定动作名(供 InputManager 的 isDown/justPressed 约束参数)
export type GameAction = keyof Keybinds;

export const DEFAULT_KEYBINDS: Keybinds = {
  moveUp:'W', moveDown:'S', moveLeft:'A', moveRight:'D',
  fire:'MOUSE_LEFT',
  reload:'R',
  deployItem:'Q',       // 布置当前道具(可改)
  nextItem:'F',         // 切换携带道具种类
  nextWeapon:'WHEEL_UP', prevWeapon:'WHEEL_DOWN',
  weapon1:'ONE', weapon2:'TWO', weapon3:'THREE', weapon4:'FOUR',
  pause:'ESC',
};
```

### 3.6 运行时数据结构

**(a) 玩家背包 / 游戏状态 `GameState`**(挂在 GameScene 上,HUD 读它渲染)。放在 `src/state/GameState.ts`:
```ts
import type { AmmoType } from '../config/types';
import type { WeaponId } from '../config/weapons';

export interface PlayerState {
  health: number; maxHealth: number;
  currentWeaponId: WeaponId;
  ownedWeapons: WeaponId[];                       // 已拥有的枪
  ammoInMag: Partial<Record<WeaponId, number>>;   // 每把枪当前弹匣
  ammoReserve: Record<AmmoType, number>;          // 备用弹按类型
  items: Record<string, number>;                  // 携带道具数量(itemId -> 数量)
  currentItemId: string | null;
}

export interface GameState {
  mode: 'level' | 'endless';
  levelId: string | null;
  score: number;
  waveIndex: number;                              // 当前第几波
  player: PlayerState;
}

// 新开一局时的初始状态工厂(数值取自 config,不写死在这里)
export function createInitialState(mode: GameState['mode'], levelId: string | null): GameState {
  return {
    mode, levelId, score: 0, waveIndex: 0,
    player: {
      health: 100, maxHealth: 100,
      currentWeaponId: 'pistol',
      ownedWeapons: ['pistol'],
      ammoInMag: { pistol: 12 },
      ammoReserve: { light: 60, heavy: 0, shell: 0 },
      items: { mine: 3 },
      currentItemId: 'mine',
    },
  };
}
```

**(b) 对象池 `ObjectPool`**(`utils/ObjectPool.ts`):子弹、粒子、掉落物高频创建销毁,必须复用而不是每帧 new。Phaser 的 `Group` 自带池化(`getFirstDead()` / `killAndHide()`),我们封装成统一接口:`pool.spawn(x,y,...)` / `pool.despawn(obj)`。

**(c) WaveManager 状态机**:
```
IDLE ──开始波次──▶ SPAWNING ──本波全部生成完──▶ WAITING_CLEAR
  ▲                                                    │
  └──────── 还有下一波?否→关卡结束 ◀── 场上僵尸清空 ──┘
```
无尽模式:`WAITING_CLEAR` 清空后不查表,而是调用 `generateWave(waveIndex)` 程序化生成下一波(见 §4.10)。

**(d) 空间优化(僵尸很多时的碰撞)**:初期直接用 Arcade Physics 的 overlap(内部有空间树)。若无尽模式后期僵尸数破百出现卡顿,再引入网格分区(uniform grid)做子弹/僵尸的邻近查询。**先不做,标记为性能预留项**。

---

## 4. 各系统详细设计(怎么做)

### 4.1 InputManager `systems/InputManager.ts`
- 启动时从 `SaveManager` 读键位(没有则用 `DEFAULT_KEYBINDS`),建立**动作 → 按键代号**映射。
- 把每个按键代号解析并注册到 Phaser:键盘用 `this.scene.input.keyboard.addKey()`,鼠标用 `pointerdown/up`,滚轮用 `wheel` 事件。
- 对外暴露语义化查询,业务代码**不直接读物理按键**:
  - `isDown('moveUp')`、`justPressed('deployItem')`、`justPressed('reload')`
  - 指针世界坐标 `getPointerWorld()` 给瞄准用。
- 重绑定:设置界面调用 `rebind(action, newCode)` → 存回 `SaveManager` → 重新注册。
- 这样"可自定义键位"从第一天就成立,任何系统换键都不用改。

### 4.2 Player `entities/Player.ts`
- Arcade 物理精灵(占位:方块)。
- **移动**:读 `InputManager` 四个方向,合成速度向量并归一化(防止斜向更快),乘移动速度赋给 `body.velocity`。
- **瞄准**:每帧 `rotation = angleTo(pointerWorld)`,朝鼠标转向。
- **射击**:把"开火意图"转交 `WeaponManager`(它管射速/弹匣)。
- **受伤**:与僵尸/爆炸重叠时扣血,进 `GameState`;归零 → 触发 GameOver。短暂无敌帧防连扣。

### 4.3 WeaponManager `systems/WeaponManager.ts`
- 持有当前 `WeaponDef`,维护 `lastFireTime`、`isReloading`。
- `tryFire(now)`:检查冷却(`now - lastFire >= fireRate`)、弹匣是否有弹;满足则按 `pellets` 数循环,以 `spread` 随机偏移角度,从枪口生成子弹(走子弹池),扣弹匣;`auto` 决定按住是否连发。
- `reload()`:从 `ammoReserve[ammoType]` 补足弹匣,消耗备用弹,计 `reloadTime`。
- `switchTo(id)` / `next()` / `prev()`:在 `ownedWeapons` 里切换。
- `pickupWeapon(id)`:掉落拾取时加入拥有列表。

### 4.4 Bullet `entities/Bullet.ts` + 子弹池
- 生成时设速度向量 = 朝向 × `bulletSpeed`,记录 `damage`、剩余 `penetration`、起点(算 `range`)。
- 命中僵尸:扣血,`penetration--`,为 0 或飞出 range/边界 → 回池。
- 命中 `chainable` 的 prop:对其造成伤害触发爆炸(见 4.6)。

### 4.5 Zombie `entities/Zombie.ts` + AI
- 从 `ZombieDef` 初始化血量/速度/半径/颜色。
- **AI(seek)**:每帧朝玩家方向设速度。
- **防叠堆(separation)**:对邻近僵尸施加一个远离的小分量,避免全挤成一个点(简易 boids 的分离项)。
- **被粉尘云阻挡**:若目标路径进入 `blocksEnemies` 的残留区,速度归零(或绕行);离开恢复。这是面粉桶的战术价值所在。
- **攻击**:接触玩家且冷却到 → 造成 `damage`。
- **死亡**:回收、掉落判定(`drops`)、加分;若 `explodeOnDeath` 则生成一次 AreaEffect(爆炸僵尸)。

### 4.6 AreaEffect / 爆炸 `systems/AreaEffectFactory.ts`(连锁核心)
统一处理油桶、地雷、爆炸僵尸、面粉云——它们底层都是"在某点产生范围效果 + 可选残留区"。
- `explode(x, y, effectDef)`:
  1. 对半径内所有僵尸按 `damage` 扣血(可做距离衰减)。
  2. 对半径内所有玩家扣血(误伤,增加策略性;可配置)。
  3. **连锁**:对半径内所有 `chainable` 的 prop/mine 施加致命伤害 → 它们各自触发自己的 `explode`。用一个"本帧已引爆集合"防止无限递归/重复。
  4. 若有 `lingering`,生成一个 `LingerZone`(火焰区/粉尘云)。
- `LingerZone`:一个带定时器的区域对象。
  - 火(`fire`):每 `tickRate` 对区内僵尸/玩家造成 `tickDamage`,`duration` 后消失。
  - 粉尘(`dust`):标记该区域 `blocksEnemies`,僵尸进不来;`duration` 后消散。
- 视觉:用 Phaser 粒子发射器 + 圆形闪光做占位反馈。

### 4.7 Prop `entities/Prop.ts`(场景爆炸物)
- 由关卡数据或无尽随机刷生成,带 `health`。
- `trigger:'onDamage'`:被子弹/爆炸打到,`health<=0` → 调 `AreaEffectFactory.explode`。
- 死亡即从场上移除。`chainable` 使其能被邻近爆炸引爆(连环)。

### 4.8 ItemManager `systems/ItemManager.ts`(玩家携带道具)
- 维护当前选中道具 `currentItemId` 与各道具持有数 `GameState.player.items`。
- `deploy()`(绑 `deployItem` 键):在玩家脚下放置一个 `deployable`(如地雷)实例,数量 -1,受 `carryMax` 限制。
- 地雷 = `trigger:'onProximity'`:每帧检测 `proximity` 半径内是否有僵尸,有则 `explode`。
- `switchItem()`(绑 `nextItem` 键):在持有的道具种类间切换。
- 击杀掉落可补充道具(`DropDef.type==='item'`)。

### 4.9 WaveManager `systems/WaveManager.ts`(关卡/无尽共用)
- 输入一个"波次提供者":关卡模式 = 读 `LevelDef.waves`;无尽模式 = 生成函数。
- 状态机见 §3.6(c)。生成时僵尸从**屏幕边缘随机点**刷出,朝内移动。
- `spawnInterval` 控制同波内出怪节奏;本波怪全部出完且场上清零 → 进下一波。
- 关卡:波次表走完 → `LevelClear`(解锁下一关,存档)。

### 4.10 关卡模式 `GameScene(mode='level')`
- 载入 `LevelDef`:按 `props` 摆放场景物,把 `waves` 交给 WaveManager。
- 全部通关 → 记录解锁进度到 `SaveManager`,进 LevelClear 界面 → 可进下一关。
- Boss:用一只强化属性的僵尸,单独一波。

### 4.11 无尽模式 `GameScene(mode='endless')`
- `generateWave(n)` 程序化难度曲线,例如:
  - 数量:`baseCount + floor(n * 1.5)`;
  - 组成:随 `n` 提高解锁 runner→tank→bomber 的比例;
  - 节奏:`spawnInterval = max(200, 800 - n*20)`;
  - 每隔几波强制刷一只 tank 当"小 Boss"。
- **随机场景物**:每波在地图随机位置刷少量油桶/面粉桶,保证无尽模式也能利用环境爆炸(你确认要的)。
- 结束时把当前波数与最高纪录比较,写 `SaveManager`。

### 4.12 HUD `HUDScene`
- 与 GameScene 并行,读 `GameState`:血条、当前武器与弹匣/备用弹、携带道具与数量、波数、得分。
- 事件驱动更新(GameScene 用 Phaser events 发 `emit('ammoChanged')` 等,HUD 监听),避免每帧全量重绘。

### 4.13 SaveManager `systems/SaveManager.ts`
- 唯一的持久化出入口(将来接后端只改这里)。
- 读写:`keybinds`、`unlockedLevels`、`endlessBestWave`。
- API:`load(key, default)`、`save(key, value)`,内部 `JSON` + `localStorage`,带 try/catch 兜底(隐私模式禁用 storage 时不崩)。

---

## 5. 文件结构

```
ExterminateZombies/
├── index.html                 # 挂载点 + Phaser 引入
├── package.json
├── vite.config.ts
├── tsconfig.json              # TS 编译配置(strict 模式)
├── docs/
│   └── PLAN.md                # 本文档
└── src/
    ├── main.ts                # Phaser.Game 配置(尺寸/物理/场景列表)
    ├── constants.ts           # 全局常量(画布尺寸、层级、事件名)
    ├── scenes/
    │   ├── BootScene.ts
    │   ├── PreloadScene.ts
    │   ├── MainMenuScene.ts
    │   ├── GameScene.ts
    │   ├── HUDScene.ts
    │   ├── SettingsScene.ts
    │   ├── GameOverScene.ts
    │   └── LevelClearScene.ts
    ├── entities/
    │   ├── Player.ts
    │   ├── Zombie.ts
    │   ├── Bullet.ts
    │   ├── Prop.ts
    │   └── Pickup.ts           # 掉落物(弹药/武器/道具/血)
    ├── systems/
    │   ├── InputManager.ts
    │   ├── WeaponManager.ts
    │   ├── ItemManager.ts
    │   ├── WaveManager.ts
    │   ├── AreaEffectFactory.ts
    │   └── SaveManager.ts
    ├── config/
    │   ├── types.ts            # 所有配置的 interface 集中定义
    │   ├── weapons.ts
    │   ├── zombies.ts
    │   ├── items.ts
    │   ├── levels.ts
    │   └── keybinds.ts
    └── utils/
        ├── ObjectPool.ts
        └── math.ts            # 角度、归一化、距离等
```

---

## 6. 实施步骤(每步都保持可运行,可独立验收)

| 步 | 内容 | 产出/验收标准 |
|---|---|---|
| 1 | **脚手架** Vite + TS(`tsconfig.json` strict)+ Phaser,`main.ts` 起一个显示背景的 GameScene | `npm run dev` 打开浏览器看到画布;`tsc --noEmit` 无报错 |
| 2 | **输入层 + 玩家** InputManager;Player WASD 移动、朝鼠标瞄准;手枪射击(子弹池) | 能走动、转向、左键打出子弹并回收 |
| 3 | **僵尸 + 碰撞** 一种僵尸从边缘刷出追玩家;子弹命中扣血死亡;接触玩家扣血、归零 GameOver | **完整可玩循环成形** |
| 4 | **武器系统** weapons 表 + WeaponManager;切枪/换弹/散射/贯穿/掉落拾取 | 数字键/滚轮换枪,R 换弹,霰弹一枪多弹 |
| 5 | **道具与场景交互** AreaEffectFactory(爆炸+连锁+残留区);油桶(火)、面粉桶(粉尘阻挡)、地雷(布置) | 打爆油桶连环爆;面粉云挡住僵尸几秒;Q 放地雷炸僵尸 |
| 6 | **僵尸多种类** zombies 表补齐 runner/tank/bomber(死亡爆炸走 §4.6) | 四种僵尸行为各异 |
| 7 | **波次系统** WaveManager 状态机 + 边缘生成 | 一波清完自动进下一波 |
| 8 | **关卡模式** levels 表;摆放场景物;通关解锁 + Boss;LevelClear 界面 | 打完 level_1 解锁 level_2 |
| 9 | **无尽模式** 程序化波次 + 难度曲线 + 随机场景物 + 最高波数存档 | 越打越难,刷新后最高纪录还在 |
| 10 | **HUD + 菜单 + 设置** HUD 显示血/弹/道具/波/分;主菜单选模式;设置界面改键位并持久化 | 改键后即时生效且重启保留 |
| 11 | **打磨** 音效、粒子、击中/爆炸屏幕震动、死亡反馈 | 手感反馈到位 |

> 第 3 步结束即有可玩原型;之后每步都在可玩基础上叠加,任何一步做完都能 `npm run dev` 直接体验。

---

## 7. 技术风险与预留项

- **性能(僵尸数)**:Arcade overlap 初期够用;无尽后期僵尸破百若掉帧,引入网格空间分区做邻近查询(已在 §3.6d 预留,先不做)。
- **误伤平衡**:爆炸是否伤到玩家做成可配置项,便于调难度。
- **连锁递归**:AreaEffect 用"本帧已引爆集合"防止无限递归(§4.6)。
- **存档兜底**:localStorage 在隐私模式可能不可用,SaveManager 全程 try/catch。
- **后端边界**:所有持久化只走 SaveManager,将来加在线排行榜只改这一个文件,不返工。
```
