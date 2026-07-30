import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, SCENES } from '../constants';
import { configureHighResolutionScene } from '../systems/DisplayManager';
import { SaveManager } from '../systems/SaveManager';
import { SoundManager } from '../systems/SoundManager';
import { validateGameConfig } from '../config/validate';

export class BootScene extends Phaser.Scene {
  constructor() {
    super(SCENES.boot);
  }

  create(): void {
    SaveManager.initialize();
    SoundManager.initialize();
    const configErrors = validateGameConfig();
    if (configErrors.length > 0) {
      throw new Error(`游戏配置校验失败：\n${configErrors.join('\n')}`);
    }
    configureHighResolutionScene(this);
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x111111);
    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'BOOTING...', {
      fontFamily: 'Impact, "Arial Black", sans-serif',
      fontSize: '28px',
      color: '#f4eedd',
    }).setOrigin(0.5);

    this.scene.start(SCENES.preload);
  }
}
