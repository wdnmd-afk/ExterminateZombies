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
      '本项目运行时加载资源署名（含遗留预载）', '',
      'Svetlana Kushnariova (Cabbit) / Jordan Irwin (AntumDeluge) · Zombies 1.1 · CC-BY 3.0+',
      'Vincent Sevedge / Tabasco · Gunshot Sounds · CC-BY 3.0（原录音裁切）',
      'CC-BY 3.0：https://creativecommons.org/licenses/by/3.0/', '',
      '字体：阿里巴巴（中国）有限公司 / Alibaba Design / 汉仪字库 · 阿里巴巴普惠体 3.0',
      '官方字体中英文法律声明已随素材归档；不是 CC0 / OFL',
      'CC0 资源：Kenney、rubberduck、titmouse001、Curt、SpriteAttack、MintoDog 等',
      '完整来源与许可：docs/RUNTIME_ASSET_MANIFEST.md 及 ART/AUDIO 台账',
      '逐文件尺寸与 SHA-256：docs/RUNTIME_ASSET_INVENTORY.csv',
      '历史未加载素材的署名随原始素材归档保留，不列为当前使用',
    ].join('\n'), { fontFamily: UI_FONT_FAMILY, fontSize: '19px', lineSpacing: 9, align: 'center', color: '#f4eedd' }).setOrigin(0.5, 0);
    // 次级按钮统一走「深底 + 旧纸白字 + 半透明描边」，与主菜单的功能按钮同一语言；
    // 原来的米白实心底板属另一套配色，见 docs/playDesign/角色与战前整备系统.md §8.1。
    const back = this.add.rectangle(GAME_WIDTH / 2, 640, 280, 48, 0x1d1d24).setStrokeStyle(2, 0xf4eedd, 0.22);
    this.add.text(GAME_WIDTH / 2, 640, '返回主菜单', { fontFamily: UI_FONT_FAMILY, fontStyle: 'bold', fontSize: '22px', color: '#f4eedd' }).setOrigin(0.5);
    back.setInteractive({ useHandCursor: true })
      .on('pointerover', () => { back.fillColor = 0x292931; back.setStrokeStyle(2, 0xfbc02d, 1); })
      .on('pointerout', () => { back.fillColor = 0x1d1d24; back.setStrokeStyle(2, 0xf4eedd, 0.22); })
      .on('pointerup', () => { SoundManager.play('uiConfirm'); this.scene.start(SCENES.mainMenu); });
    this.input.keyboard?.once('keydown-ESC', () => this.scene.start(SCENES.mainMenu));
  }
}
