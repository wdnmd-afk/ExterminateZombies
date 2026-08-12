import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { CardSelectionScene } from './scenes/CardSelectionScene';
import { CreditsScene } from './scenes/CreditsScene';
import { GameOverScene } from './scenes/GameOverScene';
import { GameScene } from './scenes/GameScene';
import { HUDScene } from './scenes/HUDScene';
import { LevelClearScene } from './scenes/LevelClearScene';
import { MainMenuScene } from './scenes/MainMenuScene';
import { MonsterLibraryScene } from './scenes/MonsterLibraryScene';
import { PreloadScene } from './scenes/PreloadScene';
import { SettingsScene } from './scenes/SettingsScene';
import { WeaponLibraryScene } from './scenes/WeaponLibraryScene';
import { DISPLAY_RENDER_HEIGHT, DISPLAY_RENDER_WIDTH } from './systems/DisplayManager';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: DISPLAY_RENDER_WIDTH,
  height: DISPLAY_RENDER_HEIGHT,
  backgroundColor: '#111111',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    autoRound: true,
  },
  physics: {
    default: 'arcade',
    arcade: {
      debug: false,
    },
  },
  scene: [
    BootScene,
    PreloadScene,
    MainMenuScene,
    WeaponLibraryScene,
    MonsterLibraryScene,
    GameScene,
    HUDScene,
    SettingsScene,
    GameOverScene,
    LevelClearScene,
    CardSelectionScene,
    CreditsScene,
  ],
});

// 开发调试:暴露 game 实例,便于 CDP/控制台驱动场景跳转。
if (import.meta.env.DEV) {
  (window as unknown as { __GAME__: Phaser.Game }).__GAME__ = game;
}

export default game;
