import Phaser from 'phaser';
import { FRENZY_PRESETS, FRENZY_PRESET_IDS, FRENZY_VERSION, isFrenzyPresetId, type FrenzyPresetId } from '../config/frenzy';
import { WEAPONS } from '../config/weapons';
import { CHARACTER_PORTRAIT_TEXTURE_KEYS, getCharacterDef } from '../config/characters';
import { GAME_HEIGHT, GAME_WIDTH, SCENES } from '../constants';
import { configureHighResolutionScene } from '../systems/DisplayManager';
import { SAVE_KEYS, SaveManager } from '../systems/SaveManager';
import { SoundManager } from '../systems/SoundManager';
import { formatFrenzyTime, type FrenzyRecords } from '../systems/FrenzyRules';
import { createActionButton, type ActionButtonRefs } from '../ui/components';
import { UI_FONT_FAMILY } from '../ui/fonts';

export class FrenzyPreparationScene extends Phaser.Scene {
  private selected: FrenzyPresetId = 'shotgun';
  private readonly rows = new Map<FrenzyPresetId, ActionButtonRefs>();
  private detail!: Phaser.GameObjects.Text;
  private record!: Phaser.GameObjects.Text;
  private portrait!: Phaser.GameObjects.Image;
  private launching = false;

  constructor() { super(SCENES.frenzyPreparation); }

  init(data?: { presetId?: FrenzyPresetId }): void {
    this.selected = isFrenzyPresetId(data?.presetId) ? data.presetId : 'shotgun';
    this.launching = false;
    this.rows.clear();
  }

  create(): void {
    configureHighResolutionScene(this);
    SoundManager.setMusic('menu');
    SoundManager.pauseMusic(false);
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x0f0e13);
    this.add.rectangle(0, GAME_HEIGHT / 2, 8, GAME_HEIGHT, 0xfbc02d).setOrigin(0, 0.5);
    this.add.text(64, 42, 'FRENZY  //  HUNT PROTOCOL', { fontFamily: UI_FONT_FAMILY, fontSize: '16px', color: '#fbc02d' });
    this.add.text(64, 84, '狂潮挑战', { fontFamily: UI_FONT_FAMILY, fontSize: '52px', color: '#f4eedd', fontStyle: 'bold' });
    this.add.text(64, 160, '五分钟，抢下火力，斩杀首领。', { fontFamily: UI_FONT_FAMILY, fontSize: '24px', color: '#f4eedd' });
    this.add.text(64, 210, '自由猎杀三个标记目标 → 靠近拾取核心 → 首领立即登场\n击杀首领即通关，剩余时间加分；超时或死亡结束挑战。', {
      fontFamily: UI_FONT_FAMILY, fontSize: '17px', color: '#a9a5ad', lineSpacing: 10,
    });
    FRENZY_PRESET_IDS.forEach((id, index) => {
      this.rows.set(id, createActionButton(this, {
        x: 265, y: 342 + index * 82, width: 400, height: 64,
        label: `${index + 1}  ${FRENZY_PRESETS[id].name}`, primary: false,
        onSelect: () => this.select(id),
      }));
    });
    this.portrait = this.add.image(1060, 370, CHARACTER_PORTRAIT_TEXTURE_KEYS.watcher);
    this.detail = this.add.text(520, 326, '', {
      fontFamily: UI_FONT_FAMILY, fontSize: '21px', color: '#f4eedd', lineSpacing: 18,
      wordWrap: { width: 380, useAdvancedWrap: true },
    });
    this.record = this.add.text(520, 495, '', { fontFamily: UI_FONT_FAMILY, fontSize: '17px', color: '#fbc02d' });
    this.add.text(64, 561, '固定预设全开放 · 不消耗库存 · 不修改原编队与解锁 · 不暂停抽卡', {
      fontFamily: UI_FONT_FAMILY, fontSize: '16px', color: '#8e8b92',
    });
    createActionButton(this, { x: 390, y: 634, width: 330, height: 58, label: '返回主页', primary: false, onSelect: () => this.back() });
    createActionButton(this, { x: 830, y: 634, width: 430, height: 58, label: '进入狂潮  →', primary: true, onSelect: () => this.launch() });
    this.input.keyboard?.on('keydown', this.handleKey, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.input.keyboard?.off('keydown', this.handleKey, this));
    this.select(this.selected);
  }

  private select(id: FrenzyPresetId): void {
    this.selected = id;
    for (const [presetId, row] of this.rows) row.label.setColor(presetId === id ? '#fbc02d' : '#f4eedd');
    const preset = FRENZY_PRESETS[id];
    const character = getCharacterDef(preset.characterId);
    this.detail.setText(`${character.codename}  /  ${WEAPONS[preset.weaponId].name}\n${preset.description}\n手枪备用 · 技能与战术道具可用`);
    this.portrait.setTexture(CHARACTER_PORTRAIT_TEXTURE_KEYS[preset.characterId]);
    this.portrait.setScale(Math.min(220 / this.portrait.width, 260 / this.portrait.height));
    const best = SaveManager.load<FrenzyRecords>(SAVE_KEYS.frenzyRecords, {})[FRENZY_VERSION]?.[id];
    this.record.setText(best ? `最佳 ${best.score} 分 · 用时 ${formatFrenzyTime(best.elapsedMs)}` : '尚无通关纪录 · 挑战配置 hunt-v1');
  }

  private handleKey(event: KeyboardEvent): void {
    if (event.repeat) return;
    const index = ['Digit1', 'Digit2', 'Digit3'].indexOf(event.code);
    if (index >= 0) this.select(FRENZY_PRESET_IDS[index]);
    if (event.code === 'Enter') this.launch();
    if (event.code === 'Escape') this.back();
  }

  private launch(): void {
    if (this.launching) return;
    this.launching = true;
    SoundManager.play('uiConfirm');
    if (this.scene.isSleeping(SCENES.game) || this.scene.isActive(SCENES.game)) this.scene.stop(SCENES.game);
    this.scene.start(SCENES.game, { mode: 'frenzy', frenzyPresetId: this.selected });
  }

  private back(): void { this.scene.start(SCENES.mainMenu); }
}
