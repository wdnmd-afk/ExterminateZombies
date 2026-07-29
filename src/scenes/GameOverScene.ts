import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, SCENES } from '../constants';
import type { GameMode } from '../systems/GameState';
import { SAVE_KEYS, SaveManager } from '../systems/SaveManager';
import { configureHighResolutionScene } from '../systems/DisplayManager';

interface GameOverData {
  mode: GameMode;
  levelId: string | null;
  score: number;
  wave: number;
}

export class GameOverScene extends Phaser.Scene {
  private dataRef: GameOverData = { mode: 'level', levelId: 'level_1', score: 0, wave: 0 };

  constructor() {
    super(SCENES.gameOver);
  }

  init(data: Partial<GameOverData>): void {
    this.dataRef = {
      mode: data.mode ?? 'level',
      levelId: data.levelId ?? 'level_1',
      score: data.score ?? 0,
      wave: data.wave ?? 0,
    };
  }

  create(): void {
    configureHighResolutionScene(this);
    const bestWave = SaveManager.load<number>(SAVE_KEYS.endlessBestWave, 0);

    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x140d10);
    this.add.text(GAME_WIDTH / 2, 160, 'GAME OVER', {
      fontFamily: 'Impact, "Arial Black", sans-serif',
      fontSize: '72px',
      color: '#f4eedd',
      stroke: '#d32f2f',
      strokeThickness: 7,
    }).setOrigin(0.5);

    this.add.text(GAME_WIDTH / 2, 300, [
      `模式: ${this.dataRef.mode === 'endless' ? '无尽' : '关卡'}`,
      `得分: ${this.dataRef.score}`,
      `到达波次: ${this.dataRef.wave}`,
      `无尽最佳: ${bestWave}`,
    ].join('\n'), {
      fontFamily: '"Microsoft YaHei", sans-serif',
      fontSize: '26px',
      lineSpacing: 10,
      align: 'center',
      color: '#f4eedd',
    }).setOrigin(0.5);

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
      fontFamily: 'Impact, "Arial Black", sans-serif',
      fontSize: '28px',
      color: '#0f0e13',
    }).setOrigin(0.5);

    box.setInteractive({ useHandCursor: true })
      .on('pointerover', () => { box.fillColor = 0xfbc02d; })
      .on('pointerout', () => { box.fillColor = 0xf4eedd; })
      .on('pointerup', onClick);
    text.setInteractive({ useHandCursor: true }).on('pointerup', onClick);
  }
}
