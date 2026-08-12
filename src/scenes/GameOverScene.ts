import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, SCENES } from '../constants';
import type { GameMode } from '../systems/GameState';
import { SAVE_KEYS, SaveManager } from '../systems/SaveManager';
import { configureHighResolutionScene } from '../systems/DisplayManager';
import { SoundManager } from '../systems/SoundManager';
import { UI_FONT_FAMILY } from '../ui/fonts';
import { fitTextBlock, fitTextWidth } from '../ui/layout';

/** 统计块可用纵向区间：标题下沿到「重开本局」按钮上沿。 */
const STATS_TOP = 156;
const STATS_BOTTOM = 462;

interface GameOverData {
  mode: GameMode;
  levelId: string | null;
  score: number;
  wave: number;
  elapsedMs: number;
  kills: number;
  bossDefeated: boolean;
  enhancements: number;
  bestKillStreak: number;
  criticalHits: number;
  executions: number;
  pierceHits: number;
  oilBarrelsTriggered: number;
  flourBarrelsTriggered: number;
  minesTriggered: number;
  weaponUsageMs: Record<string, number>;
}

export class GameOverScene extends Phaser.Scene {
  private dataRef: GameOverData = { mode: 'level', levelId: 'level_1', score: 0, wave: 0, elapsedMs: 0, kills: 0, bossDefeated: false, enhancements: 0, bestKillStreak: 0, criticalHits: 0, executions: 0, pierceHits: 0, oilBarrelsTriggered: 0, flourBarrelsTriggered: 0, minesTriggered: 0, weaponUsageMs: {} };

  constructor() {
    super(SCENES.gameOver);
  }

  init(data: Partial<GameOverData>): void {
    const mode = data.mode ?? 'level';
    this.dataRef = {
      mode,
      levelId: mode === 'endless' ? null : data.levelId ?? 'level_1',
      score: data.score ?? 0,
      wave: data.wave ?? 0,
      elapsedMs: data.elapsedMs ?? 0,
      kills: data.kills ?? 0,
      bossDefeated: data.bossDefeated ?? false,
      enhancements: data.enhancements ?? 0,
      bestKillStreak: data.bestKillStreak ?? 0,
      criticalHits: data.criticalHits ?? 0,
      executions: data.executions ?? 0,
      pierceHits: data.pierceHits ?? 0,
      oilBarrelsTriggered: data.oilBarrelsTriggered ?? 0,
      flourBarrelsTriggered: data.flourBarrelsTriggered ?? 0,
      minesTriggered: data.minesTriggered ?? 0,
      weaponUsageMs: data.weaponUsageMs ?? {},
    };
  }

  create(): void {
    configureHighResolutionScene(this);
    SoundManager.setMusic('menu');
    const bestWave = SaveManager.load<number>(SAVE_KEYS.endlessBestWave, 0);

    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x140d10);
    this.add.text(GAME_WIDTH / 2, 102, 'GAME OVER', {
      fontFamily: UI_FONT_FAMILY,
      fontSize: '72px',
      color: '#f4eedd',
      stroke: '#d32f2f',
      strokeThickness: 7,
    }).setOrigin(0.5);

    // 结算统计有 12 行，写死字号会压到标题和按钮上（统计项还会随玩法继续加）。
    // 交给 fitTextBlock 按实测高度收进标题与按钮之间的空档。
    const stats = this.add.text(GAME_WIDTH / 2, 0, [
      `模式: ${this.dataRef.mode === 'endless' ? '无尽' : '关卡'}`,
      `得分: ${this.dataRef.score}`,
      `到达波次: ${this.dataRef.wave}`,
      `战斗用时: ${formatDuration(this.dataRef.elapsedMs)}`,
      `消灭感染体: ${this.dataRef.kills}`,
      `Boss: ${this.dataRef.bossDefeated ? '已击败' : '未击败'}`,
      `已选强化: ${this.dataRef.enhancements}`,
      `最高连杀: ${this.dataRef.bestKillStreak}  ·  暴击: ${this.dataRef.criticalHits}`,
      `处决: ${this.dataRef.executions}  ·  穿透: ${this.dataRef.pierceHits}`,
      `环境: 油桶 ${this.dataRef.oilBarrelsTriggered} / 粉尘 ${this.dataRef.flourBarrelsTriggered} / 地雷 ${this.dataRef.minesTriggered}`,
      `武器占比: ${formatWeaponUsage(this.dataRef.weaponUsageMs)}`,
      `无尽最佳: ${bestWave}`,
    ].join('\n'), {
      fontFamily: UI_FONT_FAMILY,
      fontSize: '26px',
      lineSpacing: 10,
      align: 'center',
      color: '#f4eedd',
    }).setOrigin(0.5);
    fitTextBlock(stats, { top: STATS_TOP, bottom: STATS_BOTTOM, maxWidth: GAME_WIDTH - 120 });

    this.createButton(GAME_WIDTH / 2, 500, '重开本局', () => {
      this.scene.start(SCENES.game, {
        mode: this.dataRef.mode,
        levelId: this.dataRef.levelId,
      });
    });
    this.createButton(GAME_WIDTH / 2, 580, '返回主菜单', () => {
      this.scene.start(SCENES.mainMenu);
    });

    this.input.keyboard?.once('keydown-R', () => {
      this.scene.start(SCENES.game, { mode: this.dataRef.mode, levelId: this.dataRef.levelId });
    });
    this.input.keyboard?.once('keydown-ESC', () => {
      this.scene.start(SCENES.mainMenu);
    });
  }

  private createButton(x: number, y: number, label: string, onClick: () => void): void {
    const box = this.add.rectangle(x, y, 300, 54, 0xf4eedd).setStrokeStyle(4, 0x0f0e13);
    const text = this.add.text(x, y, label, {
      fontFamily: UI_FONT_FAMILY,
      fontSize: '28px',
      color: '#0f0e13',
    }).setOrigin(0.5);
    fitTextWidth(text, 300 - 28);

    box.setInteractive({ useHandCursor: true })
      .on('pointerover', () => { box.fillColor = 0xfbc02d; })
      .on('pointerout', () => { box.fillColor = 0xf4eedd; })
      .on('pointerup', onClick);
    text.setInteractive({ useHandCursor: true }).on('pointerup', onClick);
  }
}

function formatDuration(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`;
}

function formatWeaponUsage(usage: Record<string, number>): string {
  const total = Object.values(usage).reduce((sum, value) => sum + Math.max(0, value), 0);
  if (total <= 0) return '暂无';
  return Object.entries(usage)
    .filter(([, value]) => value > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([id, value]) => `${id} ${Math.round(value / total * 100)}%`)
    .join(' / ');
}
