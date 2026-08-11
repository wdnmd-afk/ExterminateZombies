import Phaser from 'phaser';
import { DEPTH, GAME_HEIGHT, GAME_WIDTH } from '../constants';
import type { GameMode } from './GameState';

interface BattlefieldPalette {
  ground: number;
  groundAlt: number;
  edge: number;
  line: number;
  detail: number;
}

const BATTLEFIELD_PALETTES: Record<string, BattlefieldPalette> = {
  level_1: { ground: 0x20251f, groundAlt: 0x2a3026, edge: 0x141812, line: 0x67705a, detail: 0x7d6945 },
  level_2: { ground: 0x25282a, groundAlt: 0x303437, edge: 0x17191b, line: 0xa77b3f, detail: 0x59656c },
  level_3: { ground: 0x222326, groundAlt: 0x2c2d31, edge: 0x151518, line: 0xc9ad65, detail: 0x5f6369 },
  level_4: { ground: 0x1b2226, groundAlt: 0x232d32, edge: 0x0f1416, line: 0x4e7d84, detail: 0x3f6b70 },
  level_5: { ground: 0x232628, groundAlt: 0x2e3234, edge: 0x141617, line: 0xd6e0dc, detail: 0x7f9a93 },
  level_6: { ground: 0x272522, groundAlt: 0x33302b, edge: 0x18160f, line: 0xb08a44, detail: 0x6d6455 },
  level_7: { ground: 0x212023, groundAlt: 0x2b2a2f, edge: 0x141315, line: 0x9c8f7c, detail: 0x585462 },
  level_8: { ground: 0x1e2427, groundAlt: 0x283034, edge: 0x111618, line: 0x7fc4cd, detail: 0x4c7f88 },
  level_9: { ground: 0x261d1b, groundAlt: 0x322422, edge: 0x170f0d, line: 0xd2762f, detail: 0x8a4526 },
  level_10: { ground: 0x221a26, groundAlt: 0x2d2133, edge: 0x140e17, line: 0xb265c4, detail: 0x74357f },
  endless: { ground: 0x201e22, groundAlt: 0x2b282d, edge: 0x121115, line: 0xa54d3f, detail: 0x5f5964 },
};

/**
 * 已配置专属战场主题的 id(关卡 id 或 'endless')。
 * 供配置测试确认新增关卡没有漏掉调色板——漏掉不会报错,只会静默退回第一关的外观。
 */
export function getThemedBattlefieldIds(): string[] {
  return Object.keys(BATTLEFIELD_PALETTES);
}

/** 为每个模式绘制稳定、可复现且不遮挡战斗对象的地面与边界层。 */
export function renderBattlefield(scene: Phaser.Scene, mode: GameMode, levelId: string | null): void {
  const theme = mode === 'endless' ? 'endless' : levelId ?? 'level_1';
  const palette = BATTLEFIELD_PALETTES[theme] ?? BATTLEFIELD_PALETTES.level_1;
  const graphics = scene.add.graphics().setDepth(DEPTH.ground);
  const random = createSeededRandom(theme);

  graphics.fillStyle(palette.ground, 1);
  graphics.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  drawFloorVariation(graphics, palette, random);

  switch (theme) {
    case 'level_2':
      drawAbandonedStation(graphics, palette, random);
      break;
    case 'level_6':
      drawRailYard(graphics, palette, random);
      break;
    case 'level_3':
    // 塌陷街区沿用封锁城区的街道结构，配色区分。
    case 'level_7':
      drawCityBlock(graphics, palette, random);
      break;
    case 'level_4':
      drawDrainage(graphics, palette, random);
      break;
    case 'level_5':
      drawQuarantine(graphics, palette, random);
      break;
    case 'level_8':
      drawResearchStation(graphics, palette, random);
      break;
    case 'level_9':
      drawIncinerator(graphics, palette, random);
      break;
    case 'level_10':
      drawInfectionCore(graphics, palette, random);
      break;
    case 'endless':
      drawContainmentZone(graphics, palette, random);
      break;
    default:
      drawOutskirts(graphics, palette, random);
      break;
  }

  drawWorldBoundary(graphics, palette);
}

function drawFloorVariation(
  graphics: Phaser.GameObjects.Graphics,
  palette: BattlefieldPalette,
  random: () => number,
): void {
  graphics.fillStyle(palette.groundAlt, 0.22);
  for (let index = 0; index < 30; index++) {
    const width = 28 + Math.floor(random() * 80);
    const height = 12 + Math.floor(random() * 42);
    const x = 36 + Math.floor(random() * (GAME_WIDTH - 72 - width));
    const y = 36 + Math.floor(random() * (GAME_HEIGHT - 72 - height));
    graphics.fillRect(x, y, width, height);
  }

  graphics.lineStyle(1, palette.line, 0.08);
  for (let y = 48; y < GAME_HEIGHT - 48; y += 48) {
    graphics.lineBetween(24, y, GAME_WIDTH - 24, y);
  }
}

function drawOutskirts(
  graphics: Phaser.GameObjects.Graphics,
  palette: BattlefieldPalette,
  random: () => number,
): void {
  graphics.fillStyle(0x394735, 0.65);
  for (let index = 0; index < 48; index++) {
    const x = 28 + Math.floor(random() * (GAME_WIDTH - 56));
    const y = 28 + Math.floor(random() * (GAME_HEIGHT - 56));
    const length = 5 + Math.floor(random() * 9);
    graphics.fillTriangle(x, y, x + length, y + 3, x + 2, y + length);
  }

  graphics.lineStyle(4, palette.detail, 0.35);
  graphics.beginPath();
  graphics.moveTo(0, 420);
  graphics.lineTo(220, 390);
  graphics.lineTo(430, 430);
  graphics.lineTo(690, 402);
  graphics.lineTo(940, 438);
  graphics.lineTo(GAME_WIDTH, 398);
  graphics.strokePath();

  graphics.fillStyle(0x30352d, 0.76);
  graphics.fillRect(42, 82, 280, 46);
  graphics.fillRect(882, 610, 340, 54);
  graphics.lineStyle(2, 0xb1a06d, 0.25);
  for (let x = 54; x < 320; x += 28) graphics.lineBetween(x, 84, x, 128);
  for (let x = 894; x < 1216; x += 28) graphics.lineBetween(x, 612, x, 664);
}

/**
 * 废车站垂直切片：上下铁轨夹住中央维修场，左右黄色禁区对应油桶热点。
 * 中轴保持开阔，既让首批敌人进入后立即可读，也给坦克 Boss 的纵向冲锋留出完整预警带。
 */
function drawAbandonedStation(
  graphics: Phaser.GameObjects.Graphics,
  palette: BattlefieldPalette,
  random: () => number,
): void {
  graphics.fillStyle(0x1a1c1e, 0.7);
  graphics.fillRect(0, 92, GAME_WIDTH, 116);
  graphics.fillRect(0, 512, GAME_WIDTH, 116);

  drawRailLine(graphics, 118);
  drawRailLine(graphics, 538);

  // 中央维修通道和出生标识使用低对比度线条，不与子弹、掉落和危险预警争夺层级。
  graphics.fillStyle(0x353a3d, 0.78);
  graphics.fillRect(96, 246, GAME_WIDTH - 192, 228);
  graphics.lineStyle(2, palette.line, 0.28);
  graphics.strokeRect(112, 262, GAME_WIDTH - 224, 196);
  graphics.lineBetween(GAME_WIDTH / 2, 214, GAME_WIDTH / 2, 506);

  graphics.lineStyle(3, 0xc5b26a, 0.36);
  graphics.strokeCircle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 48);
  graphics.lineBetween(GAME_WIDTH / 2 - 58, GAME_HEIGHT / 2, GAME_WIDTH / 2 + 58, GAME_HEIGHT / 2);
  graphics.lineBetween(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 58, GAME_WIDTH / 2, GAME_HEIGHT / 2 + 58);

  // 两侧斜纹区提示爆炸资源的高风险位置，真正危险范围仍由战斗预警层表达。
  drawHazardBay(graphics, 204, 298, 132, 124);
  drawHazardBay(graphics, 944, 298, 132, 124);

  graphics.fillStyle(palette.detail, 0.22);
  for (let index = 0; index < 14; index++) {
    const x = 120 + Math.floor(random() * (GAME_WIDTH - 240));
    const y = index % 2 === 0
      ? 222 + Math.floor(random() * 22)
      : 478 + Math.floor(random() * 22);
    graphics.fillRect(x, y, 12 + Math.floor(random() * 34), 3);
  }
}

function drawRailLine(graphics: Phaser.GameObjects.Graphics, y: number): void {
  graphics.lineStyle(5, 0x74797c, 0.72);
  graphics.lineBetween(0, y, GAME_WIDTH, y);
  graphics.lineBetween(0, y + 54, GAME_WIDTH, y + 54);
  graphics.lineStyle(4, 0x343638, 0.92);
  for (let x = -12; x < GAME_WIDTH; x += 36) {
    graphics.lineBetween(x, y - 12, x + 12, y + 66);
  }
}

function drawHazardBay(
  graphics: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  graphics.fillStyle(0x211f19, 0.62);
  graphics.fillRect(x, y, width, height);
  graphics.lineStyle(3, 0xd0a947, 0.42);
  graphics.strokeRect(x, y, width, height);
  for (let offset = -height; offset < width; offset += 24) {
    const startX = x + Math.max(0, offset);
    const startY = y + Math.max(0, -offset);
    const length = Math.min(width - Math.max(0, offset), height - Math.max(0, -offset));
    graphics.lineBetween(startX, startY, startX + length, startY + length);
  }
}

function drawRailYard(
  graphics: Phaser.GameObjects.Graphics,
  palette: BattlefieldPalette,
  random: () => number,
): void {
  graphics.lineStyle(5, 0x6f7478, 0.5);
  graphics.lineBetween(0, 132, GAME_WIDTH, 132);
  graphics.lineBetween(0, 182, GAME_WIDTH, 182);
  graphics.lineBetween(0, 552, GAME_WIDTH, 552);
  graphics.lineBetween(0, 602, GAME_WIDTH, 602);
  graphics.lineStyle(3, 0x3b3d40, 0.85);
  for (let x = 0; x < GAME_WIDTH; x += 38) {
    graphics.lineBetween(x, 118, x + 10, 196);
    graphics.lineBetween(x, 538, x + 10, 616);
  }

  graphics.fillStyle(0x151617, 0.3);
  for (let index = 0; index < 12; index++) {
    const x = 70 + Math.floor(random() * (GAME_WIDTH - 140));
    const y = 240 + Math.floor(random() * 240);
    graphics.fillEllipse(x, y, 28 + random() * 64, 10 + random() * 22);
  }

  graphics.lineStyle(2, palette.line, 0.32);
  for (let x = 96; x < GAME_WIDTH - 96; x += 176) {
    graphics.strokeRect(x, 250, 94, 58);
    graphics.lineBetween(x, 250, x + 94, 308);
  }
}

function drawCityBlock(
  graphics: Phaser.GameObjects.Graphics,
  palette: BattlefieldPalette,
  random: () => number,
): void {
  graphics.fillStyle(0x34363a, 0.92);
  graphics.fillRect(0, 0, GAME_WIDTH, 94);
  graphics.fillRect(0, GAME_HEIGHT - 94, GAME_WIDTH, 94);
  graphics.fillRect(0, 0, 86, GAME_HEIGHT);
  graphics.fillRect(GAME_WIDTH - 86, 0, 86, GAME_HEIGHT);

  graphics.lineStyle(3, palette.line, 0.42);
  graphics.lineBetween(110, GAME_HEIGHT / 2, 1170, GAME_HEIGHT / 2);
  for (let x = 150; x < 1130; x += 128) {
    graphics.fillStyle(0xd4bd72, 0.22);
    graphics.fillRect(x, GAME_HEIGHT / 2 - 3, 66, 6);
  }

  graphics.fillStyle(0xe2dfd1, 0.16);
  for (let index = 0; index < 8; index++) {
    graphics.fillRect(108 + index * 34, 102, 18, 70);
  }
  for (let index = 0; index < 8; index++) {
    graphics.fillRect(900 + index * 34, 548, 18, 70);
  }

  graphics.lineStyle(2, palette.detail, 0.32);
  for (let index = 0; index < 18; index++) {
    const x = 100 + Math.floor(random() * 1080);
    const y = 110 + Math.floor(random() * 500);
    graphics.beginPath();
    graphics.moveTo(x, y);
    graphics.lineTo(x + 14, y + 8);
    graphics.lineTo(x + 6, y + 22);
    graphics.strokePath();
  }
}

function drawContainmentZone(
  graphics: Phaser.GameObjects.Graphics,
  palette: BattlefieldPalette,
  random: () => number,
): void {
  graphics.lineStyle(2, palette.line, 0.34);
  graphics.strokeRect(112, 86, GAME_WIDTH - 224, GAME_HEIGHT - 172);
  graphics.strokeRect(132, 106, GAME_WIDTH - 264, GAME_HEIGHT - 212);

  graphics.fillStyle(0x151318, 0.42);
  for (let index = 0; index < 20; index++) {
    const x = 80 + Math.floor(random() * (GAME_WIDTH - 160));
    const y = 70 + Math.floor(random() * (GAME_HEIGHT - 140));
    graphics.fillRect(x, y, 22 + random() * 42, 5 + random() * 8);
  }

  graphics.fillStyle(palette.line, 0.24);
  for (let x = 36; x < GAME_WIDTH - 36; x += 72) {
    graphics.fillTriangle(x, 24, x + 32, 24, x + 16, 42);
    graphics.fillTriangle(x, GAME_HEIGHT - 24, x + 32, GAME_HEIGHT - 24, x + 16, GAME_HEIGHT - 42);
  }
}

/** 排水渠:四条纵向水道 + 横向格栅,与关卡里的平行路障走向一致。 */
function drawDrainage(
  graphics: Phaser.GameObjects.Graphics,
  palette: BattlefieldPalette,
  random: () => number,
): void {
  for (const x of [220, 500, 780, 1060]) {
    graphics.fillStyle(0x16232a, 0.72);
    graphics.fillRect(x - 46, 40, 92, GAME_HEIGHT - 80);
    graphics.lineStyle(2, palette.line, 0.3);
    graphics.lineBetween(x - 46, 40, x - 46, GAME_HEIGHT - 40);
    graphics.lineBetween(x + 46, 40, x + 46, GAME_HEIGHT - 40);
  }

  graphics.lineStyle(1, palette.detail, 0.34);
  for (const x of [220, 500, 780, 1060]) {
    for (let y = 70; y < GAME_HEIGHT - 60; y += 26) {
      graphics.lineBetween(x - 38, y, x + 38, y);
    }
  }

  graphics.fillStyle(0x2f5c60, 0.28);
  for (let index = 0; index < 22; index++) {
    const x = 60 + Math.floor(random() * (GAME_WIDTH - 120));
    const y = 60 + Math.floor(random() * (GAME_HEIGHT - 120));
    graphics.fillEllipse(x, y, 22 + random() * 54, 8 + random() * 16);
  }
}

/** 检疫所:双层隔离警戒线 + 医疗十字标记,中央留空给冲刺 Boss。 */
function drawQuarantine(
  graphics: Phaser.GameObjects.Graphics,
  palette: BattlefieldPalette,
  random: () => number,
): void {
  graphics.lineStyle(3, palette.line, 0.26);
  graphics.strokeRect(96, 76, GAME_WIDTH - 192, GAME_HEIGHT - 152);
  graphics.lineStyle(1, palette.line, 0.16);
  graphics.strokeRect(126, 106, GAME_WIDTH - 252, GAME_HEIGHT - 212);

  // 地面医疗十字:四角各一个,提示这里原本是分诊区
  graphics.fillStyle(0xd8e4df, 0.12);
  for (const [cx, cy] of [[250, 190], [1030, 190], [250, 530], [1030, 530]] as const) {
    graphics.fillRect(cx - 34, cy - 9, 68, 18);
    graphics.fillRect(cx - 9, cy - 34, 18, 68);
  }

  graphics.fillStyle(palette.detail, 0.3);
  for (let x = 60; x < GAME_WIDTH - 60; x += 64) {
    graphics.fillRect(x, 46, 34, 6);
    graphics.fillRect(x, GAME_HEIGHT - 52, 34, 6);
  }

  graphics.fillStyle(0x1b2b2a, 0.4);
  for (let index = 0; index < 14; index++) {
    const x = 150 + Math.floor(random() * (GAME_WIDTH - 300));
    const y = 150 + Math.floor(random() * (GAME_HEIGHT - 300));
    graphics.fillRect(x, y, 18 + random() * 40, 6 + random() * 10);
  }
}

/** 研究站:规整地砖 + 警示条带,视野最开阔,配合远程感染体占比最高的波次。 */
function drawResearchStation(
  graphics: Phaser.GameObjects.Graphics,
  palette: BattlefieldPalette,
  random: () => number,
): void {
  graphics.lineStyle(1, palette.line, 0.13);
  for (let x = 80; x < GAME_WIDTH - 60; x += 80) {
    graphics.lineBetween(x, 44, x, GAME_HEIGHT - 44);
  }
  for (let y = 76; y < GAME_HEIGHT - 60; y += 80) {
    graphics.lineBetween(44, y, GAME_WIDTH - 44, y);
  }

  // 中央通道的警示条带
  graphics.fillStyle(palette.line, 0.14);
  for (let x = 150; x < GAME_WIDTH - 150; x += 46) {
    graphics.fillTriangle(x, 340, x + 26, 340, x + 13, 380);
  }

  graphics.lineStyle(2, palette.detail, 0.34);
  for (const [cx, cy] of [[440, 220], [840, 220], [440, 500], [840, 500]] as const) {
    graphics.strokeRect(cx - 52, cy - 44, 104, 88);
  }

  graphics.fillStyle(0x9fdce4, 0.1);
  for (let index = 0; index < 16; index++) {
    const x = 70 + Math.floor(random() * (GAME_WIDTH - 140));
    const y = 70 + Math.floor(random() * (GAME_HEIGHT - 140));
    graphics.fillCircle(x, y, 4 + random() * 9);
  }
}

/** 焚化厂:炉栅、烧灼痕与余烬,呼应本关最高密度的油桶与爆炸型感染体。 */
function drawIncinerator(
  graphics: Phaser.GameObjects.Graphics,
  palette: BattlefieldPalette,
  random: () => number,
): void {
  graphics.fillStyle(0x1b1210, 0.72);
  graphics.fillRect(0, 250, GAME_WIDTH, 220);
  graphics.lineStyle(3, palette.detail, 0.5);
  for (let x = 40; x < GAME_WIDTH - 30; x += 34) {
    graphics.lineBetween(x, 258, x, 462);
  }
  graphics.lineStyle(2, palette.line, 0.36);
  graphics.lineBetween(24, 250, GAME_WIDTH - 24, 250);
  graphics.lineBetween(24, 470, GAME_WIDTH - 24, 470);

  // 烧灼痕:深色椭圆,集中在炉栅上下两侧
  graphics.fillStyle(0x0e0908, 0.5);
  for (let index = 0; index < 24; index++) {
    const x = 50 + Math.floor(random() * (GAME_WIDTH - 100));
    const y = random() < 0.5 ? 60 + random() * 170 : 490 + random() * 170;
    graphics.fillEllipse(x, y, 30 + random() * 74, 12 + random() * 26);
  }

  graphics.fillStyle(palette.line, 0.32);
  for (let index = 0; index < 40; index++) {
    const x = 40 + Math.floor(random() * (GAME_WIDTH - 80));
    const y = 40 + Math.floor(random() * (GAME_HEIGHT - 80));
    graphics.fillCircle(x, y, 1 + random() * 2.4);
  }
}

/** 感染源核心:向外扩散的同心增生环 + 菌毯斑块,标出终局战场的中心。 */
function drawInfectionCore(
  graphics: Phaser.GameObjects.Graphics,
  palette: BattlefieldPalette,
  random: () => number,
): void {
  const centerX = GAME_WIDTH / 2;
  const centerY = GAME_HEIGHT / 2;

  for (let ring = 0; ring < 6; ring++) {
    graphics.lineStyle(3 - ring * 0.35, palette.line, 0.3 - ring * 0.04);
    graphics.strokeEllipse(centerX, centerY, 150 + ring * 150, 108 + ring * 104);
  }

  graphics.fillStyle(palette.detail, 0.26);
  graphics.fillEllipse(centerX, centerY, 210, 148);
  graphics.fillStyle(0x3f1147, 0.5);
  graphics.fillEllipse(centerX, centerY, 128, 92);

  // 菌毯:越靠中心越密,提示这里就是感染源
  for (let index = 0; index < 46; index++) {
    const angle = random() * Math.PI * 2;
    const spread = Math.pow(random(), 0.6);
    const x = centerX + Math.cos(angle) * spread * 600;
    const y = centerY + Math.sin(angle) * spread * 320;
    graphics.fillStyle(0x5a2465, 0.3 - spread * 0.16);
    graphics.fillEllipse(x, y, 24 + random() * 60, 14 + random() * 30);
  }

  graphics.lineStyle(2, palette.line, 0.2);
  for (let index = 0; index < 10; index++) {
    const angle = (Math.PI * 2 * index) / 10;
    graphics.lineBetween(
      centerX + Math.cos(angle) * 110, centerY + Math.sin(angle) * 78,
      centerX + Math.cos(angle) * 480, centerY + Math.sin(angle) * 300,
    );
  }
}

function drawWorldBoundary(graphics: Phaser.GameObjects.Graphics, palette: BattlefieldPalette): void {
  graphics.fillStyle(palette.edge, 0.94);
  graphics.fillRect(0, 0, GAME_WIDTH, 20);
  graphics.fillRect(0, GAME_HEIGHT - 20, GAME_WIDTH, 20);
  graphics.fillRect(0, 0, 20, GAME_HEIGHT);
  graphics.fillRect(GAME_WIDTH - 20, 0, 20, GAME_HEIGHT);
  graphics.lineStyle(2, palette.line, 0.48);
  graphics.strokeRect(21, 21, GAME_WIDTH - 42, GAME_HEIGHT - 42);
}

function createSeededRandom(seedText: string): () => number {
  let seed = 2166136261;
  for (let index = 0; index < seedText.length; index++) {
    seed ^= seedText.charCodeAt(index);
    seed = Math.imul(seed, 16777619);
  }
  return () => {
    seed = Math.imul(seed ^ (seed >>> 15), 2246822519);
    seed = Math.imul(seed ^ (seed >>> 13), 3266489917);
    return ((seed ^= seed >>> 16) >>> 0) / 4294967296;
  };
}
