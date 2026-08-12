import type { LevelDef } from './types';

export const LEVELS: LevelDef[] = [
  {
    id: 'level_1',
    name: '第一关:郊外',
    briefing: '清理外缘感染体，守住撤离通道。\n利用油桶开路，用粉尘区截断追击。',
    props: [
      { type: 'barrel_oil', x: 400, y: 300 },
      { type: 'barrel_flour', x: 900, y: 500 },
      { type: 'barrel_oil', x: 700, y: 200 },
    ],
    // 郊外:少量集装箱,凸形分散,留出宽通路
    obstacles: [
      { kind: 'container', x: 320, y: 520, width: 150, height: 60 },
      { kind: 'container', x: 980, y: 240, width: 60, height: 150 },
      { kind: 'container', x: 640, y: 150, width: 130, height: 54, rotation: 8 },
    ],
    waves: [
      { enemies: [{ type: 'walker', count: 5 }, { type: 'drifter', count: 3 }], spawnInterval: 800, startDelay: 2000 },
      { enemies: [{ type: 'walker', count: 6 }, { type: 'runner', count: 3 }, { type: 'lurker', count: 2 }, { type: 'rotting', count: 2 }], spawnInterval: 600, startDelay: 3000 },
      { enemies: [{ type: 'walker', count: 7 }, { type: 'runner', count: 4 }, { type: 'lurker', count: 2 }, { type: 'rotting', count: 3 }, { type: 'tank', count: 1 }], spawnInterval: 500, startDelay: 3000 },
    ],
    boss: null,
  },
  {
    id: 'level_2',
    name: '第二关:废车站',
    briefing: '沿维修通道清理废车站。\n利用粉尘截断冲锋，诱导巨型坦克引爆油桶。',
    props: [
      { type: 'barrel_oil', x: 270, y: 360 },
      { type: 'barrel_oil', x: 1010, y: 360 },
      { type: 'barrel_flour', x: 470, y: 520 },
      { type: 'barrel_flour', x: 810, y: 200 },
    ],
    obstacles: [
      // 四组掩体只切割视线，不封死中央维修通道；Boss 冲锋始终有横向躲避空间。
      { kind: 'wreck', x: 270, y: 205, width: 150, height: 72, rotation: -8 },
      { kind: 'wreck', x: 1010, y: 205, width: 150, height: 72, rotation: 8 },
      { kind: 'container', x: 360, y: 520, width: 180, height: 58 },
      { kind: 'container', x: 920, y: 520, width: 180, height: 58 },
      { kind: 'barricade', x: 640, y: 145, width: 150, height: 40 },
    ],
    waves: [
      // P2 垂直切片只使用四个已冻结战斗角色：基础追击、冲刺、远程压制与重装推进。
      // 三个阶段各自拆成段落表达内部节奏；总量与依据见
      // `docs/execution/2026-08-12-g6-wave-rhythm.md`。同屏上限是密度与帧率之间的唯一闸门。
      {
        // 阶段一「进站」：逐类引入，让玩家在压力升级前先建立每种敌人的处理方式。
        startDelay: 2200,
        segments: [
          // 热身：只有基础追击，建立移动与射击基线。
          { enemies: [{ type: 'walker', count: 12 }], spawnInterval: 850, leadIn: 0, concurrentCap: 18 },
          // 引入冲刺：迫使侧移并留出逃生路线。
          { enemies: [{ type: 'walker', count: 18 }, { type: 'runner', count: 6 }], spawnInterval: 700, leadIn: 3200, concurrentCap: 24 },
          // 引入远程：迫使利用废车切换掩体与目标优先级。
          { enemies: [{ type: 'walker', count: 20 }, { type: 'runner', count: 8 }, { type: 'lurker', count: 4 }], spawnInterval: 600, leadIn: 3200, concurrentCap: 30 },
          // 小高潮：第一次真正的密度体验，为阶段奖励收束。
          { enemies: [{ type: 'walker', count: 24 }, { type: 'runner', count: 10 }], spawnInterval: 480, leadIn: 2600, concurrentCap: 32 },
        ],
        rewards: [{ type: 'weapon', weaponId: 'smg', ammo: 80 }, { type: 'enhancement' }],
      },
      {
        // 阶段二「调车场」：密度爆炸。中段插入一次喘息兼首次精英，避免持续高压导致疲劳。
        startDelay: 3200,
        segments: [
          { enemies: [{ type: 'walker', count: 30 }, { type: 'runner', count: 8 }], spawnInterval: 420, leadIn: 0, concurrentCap: 36 },
          { enemies: [{ type: 'walker', count: 22 }, { type: 'runner', count: 6 }, { type: 'lurker', count: 8 }], spawnInterval: 450, leadIn: 2400, concurrentCap: 34 },
          // 喘息 + 首次精英：长静默后只放少量敌人，让玩家补给、布雷并集中处理坦克。
          { enemies: [{ type: 'tank', count: 3 }, { type: 'walker', count: 10 }], spawnInterval: 900, leadIn: 5000, concurrentCap: 20 },
          // 弹雨：本关同屏上限最高的一段，MP5 的主场。
          { enemies: [{ type: 'walker', count: 34 }, { type: 'runner', count: 14 }], spawnInterval: 340, leadIn: 2200, concurrentCap: 40 },
        ],
        rewards: [{ type: 'weapon', weaponId: 'shotgun', ammo: 18 }],
      },
      {
        // 阶段三「调度塔」：精英压力。远程与重装同时在场，逼玩家在掩体与集火之间取舍。
        startDelay: 3600,
        segments: [
          { enemies: [{ type: 'walker', count: 20 }, { type: 'runner', count: 10 }, { type: 'lurker', count: 6 }], spawnInterval: 430, leadIn: 0, concurrentCap: 36 },
          { enemies: [{ type: 'tank', count: 4 }, { type: 'walker', count: 16 }, { type: 'lurker', count: 4 }], spawnInterval: 620, leadIn: 3400, concurrentCap: 28 },
          // 终局压制：Boss 前的最后考验，四类敌人全部在场。
          { enemies: [{ type: 'walker', count: 26 }, { type: 'runner', count: 12 }, { type: 'lurker', count: 8 }, { type: 'tank', count: 4 }], spawnInterval: 330, leadIn: 2600, concurrentCap: 40 },
        ],
        rewards: [{ type: 'weapon', weaponId: 'rifle', ammo: 60 }, { type: 'enhancement' }],
      },
    ],
    boss: { type: 'tank_boss' },
  },
  {
    id: 'level_3',
    name: '第三关:封锁城区',
    briefing: '在交错路障间控制爆炸感染体。\n避开轰炸落点，终止爆破者封锁。',
    props: [
      { type: 'barrel_oil', x: 240, y: 420 },
      { type: 'barrel_flour', x: 430, y: 210 },
      { type: 'barrel_oil', x: 690, y: 280 },
      { type: 'barrel_flour', x: 920, y: 470 },
      { type: 'barrel_oil', x: 1080, y: 220 },
    ],
    obstacles: [
      { kind: 'barricade', x: 360, y: 300, width: 118, height: 40, rotation: 90 },
      { kind: 'barricade', x: 920, y: 300, width: 118, height: 40, rotation: 90 },
      { kind: 'barricade', x: 500, y: 560, width: 150, height: 40 },
      { kind: 'barricade', x: 800, y: 560, width: 150, height: 40 },
      { kind: 'container', x: 200, y: 180, width: 150, height: 56, rotation: 12 },
      { kind: 'container', x: 1090, y: 560, width: 160, height: 56, rotation: -10 },
      { kind: 'wreck', x: 640, y: 150, width: 150, height: 70 },
    ],
    waves: [
      { enemies: [{ type: 'runner', count: 3 }, { type: 'feral', count: 2 }, { type: 'stalker', count: 2 }, { type: 'oddity', count: 2 }, { type: 'tank', count: 2 }], spawnInterval: 480, startDelay: 2200 },
      { enemies: [{ type: 'walker', count: 4 }, { type: 'runner', count: 4 }, { type: 'bloodied', count: 3 }, { type: 'headless', count: 2 }, { type: 'rotting', count: 2 }, { type: 'oddity', count: 3 }, { type: 'bomber', count: 3 }], spawnInterval: 430, startDelay: 2600 },
      { enemies: [{ type: 'runner', count: 3 }, { type: 'crawler', count: 2 }, { type: 'bloater', count: 2 }, { type: 'oddity', count: 3 }, { type: 'tank', count: 2 }, { type: 'bomber', count: 2 }], spawnInterval: 380, startDelay: 2800 },
    ],
    boss: { type: 'bomber_boss' },
  },
  {
    id: 'level_4',
    name: '第四关:排水渠',
    briefing: '守住四条狭窄水道，优先清除高速目标。\n不要被中央障碍切断退路。',
    // 排水渠:平行路障切出四条纵向水道,逼玩家在窄道里处理高速小体型群
    props: [
      { type: 'barrel_oil', x: 200, y: 360 },
      { type: 'barrel_flour', x: 640, y: 180 },
      { type: 'barrel_oil', x: 640, y: 540 },
      { type: 'barrel_flour', x: 1080, y: 360 },
    ],
    obstacles: [
      { kind: 'barricade', x: 320, y: 240, width: 200, height: 38 },
      { kind: 'barricade', x: 320, y: 480, width: 200, height: 38 },
      { kind: 'barricade', x: 960, y: 240, width: 200, height: 38 },
      { kind: 'barricade', x: 960, y: 480, width: 200, height: 38 },
      { kind: 'container', x: 640, y: 360, width: 150, height: 56, rotation: 90 },
    ],
    waves: [
      { enemies: [{ type: 'walker', count: 5 }, { type: 'crawler', count: 6 }, { type: 'feral', count: 4 }, { type: 'drifter', count: 3 }], spawnInterval: 620, startDelay: 2200 },
      { enemies: [{ type: 'crawler', count: 6 }, { type: 'feral', count: 5 }, { type: 'rotting', count: 4 }, { type: 'drifter', count: 4 }, { type: 'bloodied', count: 2 }], spawnInterval: 540, startDelay: 2600 },
      { enemies: [{ type: 'crawler', count: 5 }, { type: 'feral', count: 5 }, { type: 'rotting', count: 3 }, { type: 'lurker', count: 3 }, { type: 'stalker', count: 3 }, { type: 'tank', count: 1 }], spawnInterval: 480, startDelay: 2600 },
      { enemies: [{ type: 'feral', count: 6 }, { type: 'crawler', count: 5 }, { type: 'stalker', count: 3 }, { type: 'bloodied', count: 3 }, { type: 'tank', count: 2 }, { type: 'headless', count: 2 }], spawnInterval: 430, startDelay: 2800 },
    ],
    boss: null,
  },
  {
    id: 'level_5',
    name: '第五关:检疫所',
    briefing: '利用四角掩体诱导猎杀者冲锋落空。\n其贴身震荡前及时拉开距离。',
    // 检疫所:四角集装箱 + 上下路障,中央留出开阔地给冲刺型 Boss 施展
    props: [
      { type: 'barrel_oil', x: 260, y: 360 },
      { type: 'barrel_flour', x: 470, y: 210 },
      { type: 'barrel_oil', x: 810, y: 510 },
      { type: 'barrel_flour', x: 1020, y: 360 },
      { type: 'barrel_oil', x: 640, y: 610 },
    ],
    obstacles: [
      { kind: 'container', x: 250, y: 190, width: 160, height: 58 },
      { kind: 'container', x: 1030, y: 190, width: 160, height: 58 },
      { kind: 'container', x: 250, y: 530, width: 160, height: 58 },
      { kind: 'container', x: 1030, y: 530, width: 160, height: 58 },
      { kind: 'barricade', x: 640, y: 170, width: 150, height: 40 },
      { kind: 'wreck', x: 640, y: 480, width: 148, height: 72, rotation: -12 },
    ],
    waves: [
      { enemies: [{ type: 'walker', count: 4 }, { type: 'stalker', count: 3 }, { type: 'drifter', count: 4 }], spawnInterval: 600, startDelay: 2200 },
      { enemies: [{ type: 'stalker', count: 4 }, { type: 'oddity', count: 2 }, { type: 'bloodied', count: 3 }, { type: 'runner', count: 4 }], spawnInterval: 520, startDelay: 2600 },
      { enemies: [{ type: 'stalker', count: 3 }, { type: 'oddity', count: 3 }, { type: 'headless', count: 2 }, { type: 'tank', count: 2 }], spawnInterval: 470, startDelay: 2600 },
      { enemies: [{ type: 'feral', count: 4 }, { type: 'stalker', count: 4 }, { type: 'oddity', count: 3 }, { type: 'bloodied', count: 2 }, { type: 'tank', count: 1 }], spawnInterval: 420, startDelay: 2800 },
    ],
    boss: { type: 'hunter_boss' },
  },
  {
    id: 'level_6',
    name: '第六关:货运场',
    briefing: '在成排集装箱间保持横向机动。\n集中火力处理重装感染体。',
    // 货运场:成排集装箱与废车,通道较宽但视线受阻,重装感染体占主导
    props: [
      { type: 'barrel_oil', x: 300, y: 200 },
      { type: 'barrel_oil', x: 980, y: 200 },
      { type: 'barrel_flour', x: 420, y: 540 },
      { type: 'barrel_flour', x: 860, y: 540 },
      { type: 'barrel_oil', x: 640, y: 360 },
    ],
    obstacles: [
      { kind: 'container', x: 260, y: 330, width: 180, height: 60, rotation: 90 },
      { kind: 'container', x: 1020, y: 330, width: 180, height: 60, rotation: 90 },
      { kind: 'container', x: 640, y: 160, width: 210, height: 58 },
      { kind: 'container', x: 640, y: 570, width: 210, height: 58 },
      { kind: 'wreck', x: 450, y: 380, width: 150, height: 72, rotation: 22 },
      { kind: 'wreck', x: 840, y: 380, width: 150, height: 72, rotation: -22 },
    ],
    waves: [
      { enemies: [{ type: 'walker', count: 5 }, { type: 'headless', count: 2 }, { type: 'bloodied', count: 3 }, { type: 'drifter', count: 3 }], spawnInterval: 580, startDelay: 2200 },
      { enemies: [{ type: 'bloodied', count: 4 }, { type: 'headless', count: 3 }, { type: 'rotting', count: 4 }, { type: 'runner', count: 5 }], spawnInterval: 510, startDelay: 2600 },
      { enemies: [{ type: 'headless', count: 3 }, { type: 'bloater', count: 2 }, { type: 'tank', count: 2 }, { type: 'bomber', count: 3 }, { type: 'crawler', count: 4 }], spawnInterval: 460, startDelay: 2700 },
      { enemies: [{ type: 'bloodied', count: 4 }, { type: 'headless', count: 4 }, { type: 'bloater', count: 2 }, { type: 'tank', count: 2 }, { type: 'bomber', count: 3 }], spawnInterval: 410, startDelay: 2900 },
    ],
    boss: null,
  },
  {
    id: 'level_7',
    name: '第七关:塌陷街区',
    briefing: '在碎片化通路间反复转换阵地。\n优先压制远程与爆炸目标。',
    // 塌陷街区:废车与路障错落,掩体多但路径碎,远程与爆炸感染体混编
    props: [
      { type: 'barrel_oil', x: 230, y: 250 },
      { type: 'barrel_flour', x: 500, y: 460 },
      { type: 'barrel_oil', x: 700, y: 200 },
      { type: 'barrel_flour', x: 900, y: 480 },
      { type: 'barrel_oil', x: 1070, y: 280 },
      { type: 'barrel_oil', x: 640, y: 600 },
    ],
    obstacles: [
      { kind: 'wreck', x: 300, y: 400, width: 152, height: 74, rotation: 34 },
      { kind: 'wreck', x: 990, y: 400, width: 152, height: 74, rotation: -34 },
      { kind: 'wreck', x: 640, y: 300, width: 150, height: 72, rotation: 8 },
      { kind: 'barricade', x: 420, y: 170, width: 150, height: 40, rotation: 20 },
      { kind: 'barricade', x: 870, y: 170, width: 150, height: 40, rotation: -20 },
      { kind: 'barricade', x: 350, y: 590, width: 160, height: 40 },
      { kind: 'container', x: 950, y: 590, width: 170, height: 56, rotation: -8 },
    ],
    waves: [
      { enemies: [{ type: 'runner', count: 5 }, { type: 'crawler', count: 5 }, { type: 'lurker', count: 3 }, { type: 'walker', count: 4 }], spawnInterval: 560, startDelay: 2200 },
      { enemies: [{ type: 'lurker', count: 4 }, { type: 'oddity', count: 3 }, { type: 'bloater', count: 2 }, { type: 'feral', count: 5 }], spawnInterval: 490, startDelay: 2600 },
      { enemies: [{ type: 'oddity', count: 4 }, { type: 'bloater', count: 3 }, { type: 'headless', count: 3 }, { type: 'tank', count: 2 }, { type: 'stalker', count: 3 }], spawnInterval: 440, startDelay: 2700 },
      { enemies: [{ type: 'bloater', count: 3 }, { type: 'oddity', count: 4 }, { type: 'bomber', count: 4 }, { type: 'tank', count: 2 }, { type: 'feral', count: 4 }], spawnInterval: 390, startDelay: 2900 },
    ],
    boss: null,
  },
  {
    id: 'level_8',
    name: '第八关:研究站',
    briefing: '利用规整掩体切断远程感染体视线。\n避免在中央开阔区停留。',
    // 研究站:规整的集装箱矩阵,视野开阔,远程感染体占比最高
    props: [
      { type: 'barrel_flour', x: 250, y: 250 },
      { type: 'barrel_flour', x: 1030, y: 250 },
      { type: 'barrel_oil', x: 250, y: 470 },
      { type: 'barrel_oil', x: 1030, y: 470 },
      { type: 'barrel_flour', x: 640, y: 360 },
    ],
    obstacles: [
      { kind: 'container', x: 440, y: 220, width: 150, height: 56 },
      { kind: 'container', x: 840, y: 220, width: 150, height: 56 },
      { kind: 'container', x: 440, y: 500, width: 150, height: 56 },
      { kind: 'container', x: 840, y: 500, width: 150, height: 56 },
      { kind: 'barricade', x: 640, y: 150, width: 160, height: 40 },
      { kind: 'barricade', x: 640, y: 580, width: 160, height: 40 },
      { kind: 'wreck', x: 640, y: 360, width: 148, height: 70, rotation: 90 },
    ],
    waves: [
      { enemies: [{ type: 'drifter', count: 5 }, { type: 'lurker', count: 4 }, { type: 'rotting', count: 4 }, { type: 'walker', count: 4 }], spawnInterval: 540, startDelay: 2200 },
      { enemies: [{ type: 'oddity', count: 4 }, { type: 'lurker', count: 4 }, { type: 'rotting', count: 4 }, { type: 'crawler', count: 5 }], spawnInterval: 470, startDelay: 2600 },
      { enemies: [{ type: 'oddity', count: 5 }, { type: 'rotting', count: 4 }, { type: 'stalker', count: 4 }, { type: 'headless', count: 3 }, { type: 'tank', count: 1 }], spawnInterval: 420, startDelay: 2700 },
      { enemies: [{ type: 'oddity', count: 5 }, { type: 'lurker', count: 4 }, { type: 'bloater', count: 3 }, { type: 'feral', count: 5 }, { type: 'tank', count: 2 }], spawnInterval: 380, startDelay: 2900 },
    ],
    boss: null,
  },
  {
    id: 'level_9',
    name: '第九关:焚化厂',
    briefing: '控制油桶连锁方向，避免封死自身退路。\n先清除靠近爆炸链的威胁。',
    // 焚化厂:油桶密度全场最高,爆炸型感染体成群,连锁反应既是解法也是威胁
    props: [
      { type: 'barrel_oil', x: 220, y: 220 },
      { type: 'barrel_oil', x: 1060, y: 220 },
      { type: 'barrel_oil', x: 220, y: 500 },
      { type: 'barrel_oil', x: 1060, y: 500 },
      { type: 'barrel_oil', x: 640, y: 210 },
      { type: 'barrel_flour', x: 460, y: 380 },
      { type: 'barrel_flour', x: 820, y: 380 },
    ],
    obstacles: [
      { kind: 'container', x: 340, y: 330, width: 170, height: 58, rotation: 90 },
      { kind: 'container', x: 940, y: 330, width: 170, height: 58, rotation: 90 },
      { kind: 'wreck', x: 640, y: 470, width: 150, height: 72 },
      { kind: 'barricade', x: 470, y: 590, width: 160, height: 40 },
      { kind: 'barricade', x: 810, y: 590, width: 160, height: 40 },
      { kind: 'barricade', x: 640, y: 130, width: 170, height: 40 },
    ],
    waves: [
      { enemies: [{ type: 'bomber', count: 5 }, { type: 'walker', count: 5 }, { type: 'crawler', count: 5 }, { type: 'runner', count: 4 }], spawnInterval: 520, startDelay: 2200 },
      { enemies: [{ type: 'bomber', count: 5 }, { type: 'bloater', count: 3 }, { type: 'feral', count: 5 }, { type: 'rotting', count: 4 }], spawnInterval: 460, startDelay: 2600 },
      { enemies: [{ type: 'bloater', count: 4 }, { type: 'bomber', count: 5 }, { type: 'oddity', count: 4 }, { type: 'tank', count: 2 }, { type: 'headless', count: 3 }], spawnInterval: 410, startDelay: 2700 },
      { enemies: [{ type: 'bomber', count: 6 }, { type: 'bloater', count: 4 }, { type: 'tank', count: 3 }, { type: 'oddity', count: 4 }, { type: 'bloodied', count: 4 }], spawnInterval: 370, startDelay: 2900 },
    ],
    boss: null,
  },
  {
    id: 'level_10',
    name: '第十关:感染源核心',
    briefing: '借四组掩体推进至感染源核心。\n躲开孢群轰炸，终结腐化母体。',
    // 终局:中央开阔场 + 四根柱状掩体。母体是远程炮台,掩体是唯一的推进手段,
    // 因此柱子沿中线对称摆放,任何角度都能找到可躲位。5 个常规波次后进 Boss。
    props: [
      { type: 'barrel_oil', x: 200, y: 200 },
      { type: 'barrel_oil', x: 1080, y: 200 },
      { type: 'barrel_flour', x: 200, y: 520 },
      { type: 'barrel_flour', x: 1080, y: 520 },
      { type: 'barrel_oil', x: 400, y: 360 },
      { type: 'barrel_oil', x: 880, y: 360 },
      { type: 'barrel_flour', x: 640, y: 620 },
    ],
    obstacles: [
      { kind: 'container', x: 380, y: 230, width: 130, height: 56, rotation: 45 },
      { kind: 'container', x: 900, y: 230, width: 130, height: 56, rotation: -45 },
      { kind: 'container', x: 380, y: 490, width: 130, height: 56, rotation: -45 },
      { kind: 'container', x: 900, y: 490, width: 130, height: 56, rotation: 45 },
      { kind: 'wreck', x: 640, y: 150, width: 150, height: 70 },
      { kind: 'wreck', x: 640, y: 570, width: 150, height: 70 },
      { kind: 'barricade', x: 150, y: 360, width: 150, height: 40, rotation: 90 },
      { kind: 'barricade', x: 1130, y: 360, width: 150, height: 40, rotation: 90 },
    ],
    waves: [
      { enemies: [{ type: 'walker', count: 5 }, { type: 'runner', count: 5 }, { type: 'drifter', count: 5 }, { type: 'crawler', count: 5 }], spawnInterval: 500, startDelay: 2400 },
      { enemies: [{ type: 'feral', count: 5 }, { type: 'stalker', count: 4 }, { type: 'lurker', count: 4 }, { type: 'rotting', count: 4 }, { type: 'bloodied', count: 3 }], spawnInterval: 450, startDelay: 2600 },
      { enemies: [{ type: 'headless', count: 4 }, { type: 'bloodied', count: 4 }, { type: 'oddity', count: 4 }, { type: 'bloater', count: 3 }, { type: 'tank', count: 2 }], spawnInterval: 410, startDelay: 2700 },
      { enemies: [{ type: 'oddity', count: 5 }, { type: 'bloater', count: 4 }, { type: 'bomber', count: 5 }, { type: 'tank', count: 3 }, { type: 'stalker', count: 4 }], spawnInterval: 370, startDelay: 2800 },
      { enemies: [{ type: 'feral', count: 4 }, { type: 'crawler', count: 4 }, { type: 'headless', count: 4 }, { type: 'bloater', count: 3 }, { type: 'oddity', count: 4 }, { type: 'tank', count: 3 }, { type: 'bomber', count: 4 }], spawnInterval: 340, startDelay: 3000 },
    ],
    boss: { type: 'matriarch_boss' },
  },
];
