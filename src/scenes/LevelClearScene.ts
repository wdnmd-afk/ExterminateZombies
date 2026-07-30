import Phaser from 'phaser';
import { LEVELS } from '../config/levels';
import { GAME_HEIGHT, GAME_WIDTH, SCENES } from '../constants';
import { configureHighResolutionScene } from '../systems/DisplayManager';
import { SoundManager } from '../systems/SoundManager';

interface LevelClearData {
  levelId: string | null;
  nextLevelId: string | null;
  score: number;
  wave: number;
}

export class LevelClearScene extends Phaser.Scene {
  private dataRef: LevelClearData = { levelId: 'level_1', nextLevelId: null, score: 0, wave: 0 };

  constructor() {
    super(SCENES.levelClear);
  }

  init(data: Partial<LevelClearData>): void {
    this.dataRef = {
      levelId: data.levelId ?? 'level_1',
      nextLevelId: data.nextLevelId ?? null,
      score: data.score ?? 0,
      wave: data.wave ?? 0,
    };
  }

  create(): void {
    configureHighResolutionScene(this);
    SoundManager.setMusic('menu');
    const currentLevel = LEVELS.find((level) => level.id === this.dataRef.levelId);
    const nextLevel = LEVELS.find((level) => level.id === this.dataRef.nextLevelId);

    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x102016);
    this.add.text(GAME_WIDTH / 2, 150, 'LEVEL CLEAR', {
      fontFamily: 'Impact, "Arial Black", sans-serif',
      fontSize: '68px',
      color: '#f4eedd',
      stroke: '#388e3c',
      strokeThickness: 7,
    }).setOrigin(0.5);

    this.add.text(GAME_WIDTH / 2, 285, [
      `关卡: ${currentLevel?.name ?? this.dataRef.levelId ?? '未知'}`,
      `得分: ${this.dataRef.score}`,
      `完成波次: ${this.dataRef.wave}`,
      nextLevel ? `下一关已解锁: ${nextLevel.name}` : '当前已无后续关卡',
    ].join('\n'), {
      fontFamily: '"Microsoft YaHei", sans-serif',
      fontSize: '26px',
      lineSpacing: 10,
      align: 'center',
      color: '#f4eedd',
    }).setOrigin(0.5);

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
