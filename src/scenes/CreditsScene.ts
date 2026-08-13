import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, SCENES } from '../constants';
import { configureHighResolutionScene } from '../systems/DisplayManager';
import { SoundManager } from '../systems/SoundManager';
import { UI_FONT_FAMILY } from '../ui/fonts';

export class CreditsScene extends Phaser.Scene {
  constructor() { super('CreditsScene'); }
  create(): void {
    configureHighResolutionScene(this);
    SoundManager.setMusic('menu');
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x121820);
    this.add.text(GAME_WIDTH / 2, 76, 'CREDITS / LICENSES', { fontFamily: UI_FONT_FAMILY, fontSize: '54px', color: '#f4eedd', stroke: '#455a64', strokeThickness: 6 }).setOrigin(0.5);
    this.add.text(GAME_WIDTH / 2, 180, [
      '本项目运行时外部资源署名', '',
      'CornerLord · Top down shooter animated · CC-BY 3.0',
      'Svetlana Kushnariova (Cabbit) / Jordan Irwin (AntumDeluge) · Zombies 1.1 · OGA-BY / CC-BY 3.0+',
      'Warlock\'s Gauntlet artists: rAum, jackFlower, DrZoliparia, Neil2D · CC-BY 3.0',
      'Vincent Sevedge / Tabasco · Gunshot Sounds · CC-BY 3.0', '',
      '字体：阿里巴巴（中国）有限公司 / Alibaba Design / 汉仪字库 · 阿里巴巴普惠体 3.0',
      'CC0 资源：Kenney、rubberduck、Curt、SpriteAttack、MintoDog 等，完整列表见运行时清单',
      '完整来源、许可证、哈希和处理脚本见 docs/RUNTIME_ASSET_MANIFEST.md 及 ART/AUDIO 台账',
    ].join('\n'), { fontFamily: UI_FONT_FAMILY, fontSize: '19px', lineSpacing: 9, align: 'center', color: '#f4eedd' }).setOrigin(0.5, 0);
    const back = this.add.rectangle(GAME_WIDTH / 2, 640, 280, 48, 0xf4eedd).setStrokeStyle(4, 0x0f0e13);
    this.add.text(GAME_WIDTH / 2, 640, '返回主菜单', { fontFamily: UI_FONT_FAMILY, fontSize: '24px', color: '#0f0e13' }).setOrigin(0.5);
    back.setInteractive({ useHandCursor: true }).on('pointerup', () => { SoundManager.play('uiConfirm'); this.scene.start(SCENES.mainMenu); });
    this.input.keyboard?.once('keydown-ESC', () => this.scene.start(SCENES.mainMenu));
  }
}
