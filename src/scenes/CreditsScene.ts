import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, SCENES } from '../constants';
import { configureHighResolutionScene } from '../systems/DisplayManager';
import { SoundManager } from '../systems/SoundManager';

export class CreditsScene extends Phaser.Scene {
  constructor() { super('CreditsScene'); }
  create(): void {
    configureHighResolutionScene(this);
    SoundManager.setMusic('menu');
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x121820);
    this.add.text(GAME_WIDTH / 2, 76, 'CREDITS / LICENSES', { fontFamily: 'Impact, "Arial Black", sans-serif', fontSize: '54px', color: '#f4eedd', stroke: '#455a64', strokeThickness: 6 }).setOrigin(0.5);
    this.add.text(GAME_WIDTH / 2, 180, [
      '本项目使用的外部资源与作者署名', '',
      'Ghostbyte_dev · Action/Horror TopDownCharacter · CC-BY 3.0',
      'CornerLord · Top down shooter animated · CC-BY 3.0',
      'Zombies 1.1 作者组 · OGA-BY / CC-BY 3.0+',
      'Warlock\'s Gauntlet artists · CC-BY 3.0',
      'Vincent Sevedge · 武器与环境资源 · 以资源台账为准', '',
      '音频：Kenney Interface Sounds、rubberduck 100 CC0 SFX 及台账中登记的 CC0 音频来源',
      '完整来源、许可证、哈希和处理脚本见 docs/ART_ASSET_REGISTRY.md 与 docs/AUDIO_ASSET_REGISTRY.md',
    ].join('\n'), { fontFamily: '"Microsoft YaHei", sans-serif', fontSize: '19px', lineSpacing: 9, align: 'center', color: '#f4eedd' }).setOrigin(0.5, 0);
    const back = this.add.rectangle(GAME_WIDTH / 2, 640, 280, 48, 0xf4eedd).setStrokeStyle(4, 0x0f0e13);
    this.add.text(GAME_WIDTH / 2, 640, '返回主菜单', { fontFamily: 'Impact, "Arial Black", sans-serif', fontSize: '24px', color: '#0f0e13' }).setOrigin(0.5);
    back.setInteractive({ useHandCursor: true }).on('pointerup', () => { SoundManager.play('uiConfirm'); this.scene.start(SCENES.mainMenu); });
    this.input.keyboard?.once('keydown-ESC', () => this.scene.start(SCENES.mainMenu));
  }
}
