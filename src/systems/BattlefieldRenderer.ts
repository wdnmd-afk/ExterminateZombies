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
  endless: { ground: 0x201e22, groundAlt: 0x2b282d, edge: 0x121115, line: 0xa54d3f, detail: 0x5f5964 },
};

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
      drawRailYard(graphics, palette, random);
      break;
    case 'level_3':
      drawCityBlock(graphics, palette, random);
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
