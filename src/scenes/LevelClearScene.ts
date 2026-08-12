import Phaser from 'phaser';
import { LEVELS } from '../config/levels';
import { GAME_HEIGHT, GAME_WIDTH, SCENES } from '../constants';
import { configureHighResolutionScene } from '../systems/DisplayManager';
import { SoundManager } from '../systems/SoundManager';
import { UI_FONT_FAMILY } from '../ui/fonts';
import { fitTextBlock, fitTextWidth } from '../ui/layout';

/** 统计块可用纵向区间：标题下沿到最靠上的按钮上沿。 */
const STATS_TOP = 150;
const STATS_BOTTOM_WITH_NEXT = 462;
const STATS_BOTTOM_WITHOUT_NEXT = 542;

interface LevelClearData {
  levelId: string | null;
  nextLevelId: string | null;
  score: number;
  wave: number;
  elapsedMs: number;
  kills: number;
  bossDefeated: boolean;
  enhancements: number;
  unlockedLevelId: string | null;
  bestKillStreak: number;
  criticalHits: number;
  executions: number;
  pierceHits: number;
  oilBarrelsTriggered: number;
  flourBarrelsTriggered: number;
  minesTriggered: number;
  weaponUsageMs: Record<string, number>;
}

export class LevelClearScene extends Phaser.Scene {
  private dataRef: LevelClearData = { levelId: 'level_1', nextLevelId: null, score: 0, wave: 0, elapsedMs: 0, kills: 0, bossDefeated: false, enhancements: 0, unlockedLevelId: null, bestKillStreak: 0, criticalHits: 0, executions: 0, pierceHits: 0, oilBarrelsTriggered: 0, flourBarrelsTriggered: 0, minesTriggered: 0, weaponUsageMs: {} };

  constructor() {
    super(SCENES.levelClear);
  }

  init(data: Partial<LevelClearData>): void {
    this.dataRef = {
      levelId: data.levelId ?? 'level_1',
      nextLevelId: data.nextLevelId ?? null,
      score: data.score ?? 0,
      wave: data.wave ?? 0,
      elapsedMs: data.elapsedMs ?? 0,
      kills: data.kills ?? 0,
      bossDefeated: data.bossDefeated ?? false,
      enhancements: data.enhancements ?? 0,
      unlockedLevelId: data.unlockedLevelId ?? null,
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
    const currentLevel = LEVELS.find((level) => level.id === this.dataRef.levelId);
    const nextLevel = LEVELS.find((level) => level.id === this.dataRef.nextLevelId);

    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x102016);
    this.add.text(GAME_WIDTH / 2, 96, 'LEVEL CLEAR', {
      fontFamily: UI_FONT_FAMILY,
      fontSize: '68px',
      color: '#f4eedd',
      stroke: '#388e3c',
      strokeThickness: 7,
    }).setOrigin(0.5);

    // 同 GameOverScene：行数会随玩法增长，按实测高度收进标题与按钮之间。
    const stats = this.add.text(GAME_WIDTH / 2, 0, [
      `关卡: ${currentLevel?.name ?? this.dataRef.levelId ?? '未知'}`,
      `得分: ${this.dataRef.score}`,
      `完成波次: ${this.dataRef.wave}`,
      `战斗用时: ${formatDuration(this.dataRef.elapsedMs)}  ·  击杀: ${this.dataRef.kills}`,
      `Boss: ${this.dataRef.bossDefeated ? '已击败' : '本关无 Boss'}  ·  强化: ${this.dataRef.enhancements}`,
      `最高连杀: ${this.dataRef.bestKillStreak}  ·  暴击: ${this.dataRef.criticalHits}  ·  处决: ${this.dataRef.executions}`,
      `穿透: ${this.dataRef.pierceHits}  ·  环境利用: ${this.dataRef.oilBarrelsTriggered + this.dataRef.flourBarrelsTriggered + this.dataRef.minesTriggered}`,
      `武器占比: ${formatWeaponUsage(this.dataRef.weaponUsageMs)}`,
      this.dataRef.unlockedLevelId && nextLevel ? `新解锁: ${nextLevel.name}` : nextLevel ? `下一关: ${nextLevel.name}` : '当前已无后续关卡',
    ].join('\n'), {
      fontFamily: UI_FONT_FAMILY,
      fontSize: '26px',
      lineSpacing: 10,
      align: 'center',
      color: '#f4eedd',
    }).setOrigin(0.5);

    // 无下一关时少一个按钮，统计块可以多用 80px。
    const statsBottom = nextLevel ? STATS_BOTTOM_WITH_NEXT : STATS_BOTTOM_WITHOUT_NEXT;
    fitTextBlock(stats, { top: STATS_TOP, bottom: statsBottom, maxWidth: GAME_WIDTH - 120 });

    if (nextLevel) {
      this.createButton(GAME_WIDTH / 2, 500, '进入下一关', () => {
        this.scene.start(SCENES.game, {
          mode: 'level',
          levelId: nextLevel.id,
        });
      });
    }

    this.createButton(GAME_WIDTH / 2, 580, '返回主菜单', () => {
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
