import type { LevelDef } from './types';

export const LEVELS: LevelDef[] = [
  {
    id: 'level_1',
    name: '第一关:郊外',
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
    props: [
      { type: 'barrel_oil', x: 300, y: 240 },
      { type: 'barrel_oil', x: 980, y: 230 },
      { type: 'barrel_flour', x: 620, y: 360 },
      { type: 'barrel_flour', x: 840, y: 520 },
    ],
    obstacles: [
      { kind: 'wreck', x: 250, y: 470, width: 150, height: 74, rotation: 18 },
      { kind: 'wreck', x: 1040, y: 470, width: 150, height: 74, rotation: -20 },
      { kind: 'wreck', x: 470, y: 180, width: 140, height: 70, rotation: -8 },
      { kind: 'wreck', x: 820, y: 190, width: 140, height: 70, rotation: 10 },
      { kind: 'container', x: 640, y: 590, width: 190, height: 58 },
    ],
    waves: [
      { enemies: [{ type: 'walker', count: 5 }, { type: 'runner', count: 5 }, { type: 'feral', count: 3 }, { type: 'crawler', count: 2 }, { type: 'stalker', count: 2 }], spawnInterval: 650, startDelay: 2200 },
      { enemies: [{ type: 'walker', count: 6 }, { type: 'runner', count: 4 }, { type: 'bloodied', count: 3 }, { type: 'headless', count: 2 }, { type: 'crawler', count: 2 }, { type: 'stalker', count: 3 }, { type: 'tank', count: 1 }], spawnInterval: 520, startDelay: 2600 },
      { enemies: [{ type: 'runner', count: 4 }, { type: 'feral', count: 2 }, { type: 'bloodied', count: 2 }, { type: 'headless', count: 1 }, { type: 'bloater', count: 1 }, { type: 'tank', count: 2 }], spawnInterval: 450, startDelay: 2800 },
    ],
    boss: { type: 'tank_boss' },
  },
  {
    id: 'level_3',
    name: '第三关:封锁城区',
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
];
