import Phaser from 'phaser';
import {
  CORRIDOR_PRESETS,
  CORRIDOR_PRESET_IDS,
  CORRIDOR_VERSION,
  isCorridorPresetId,
  type CorridorPresetId,
} from '../config/corridor';
import { getCharacterDef, CHARACTER_PORTRAIT_TEXTURE_KEYS } from '../config/characters';
import { WEAPONS } from '../config/weapons';
import { GAME_HEIGHT, GAME_WIDTH, SCENES } from '../constants';
import { configureHighResolutionScene } from '../systems/DisplayManager';
import { SAVE_KEYS, SaveManager } from '../systems/SaveManager';
import { SoundManager } from '../systems/SoundManager';
import { formatCorridorTime, normalizeCorridorRecords } from '../systems/CorridorRules';
import { createActionButton, type ActionButtonRefs } from '../ui/components';
import { UI_FONT_FAMILY } from '../ui/fonts';

/**
 * 通道模式预设选择页。克隆 FrenzyPreparationScene 骨架:热键 1/2/3+Enter,
 * 右侧详情与最佳纪录,底部返回/进入。不读长期编队,不动任何许可存档。
 */
export class CorridorPreparationScene extends Phaser.Scene {
  private selected: CorridorPresetId = 'pistol';
  private readonly rows = new Map<CorridorPresetId, ActionButtonRefs>();
  private detail!: Phaser.GameObjects.Text;
  private record!: Phaser.GameObjects.Text;
  private portrait!: Phaser.GameObjects.Image;
  private launching = false;

  constructor() { super(SCENES.corridorPreparation); }

  init(data?: { presetId?: CorridorPresetId }): void {
    this.selected = isCorridorPresetId(data?.presetId) ? data.presetId : 'pistol';
    this.launching = false;
    this.rows.clear();
  }

  create(): void {
    configureHighResolutionScene(this);
    SoundManager.setMusic('menu');
    SoundManager.pauseMusic(false);
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x0f0e13);
    this.add.rectangle(0, GAME_HEIGHT / 2, 8, GAME_HEIGHT, 0x8fe8ff).setOrigin(0, 0.5);
    this.add.text(64, 42, 'CORRIDOR  //  LANE PROTOCOL', { fontFamily: UI_FONT_FAMILY, fontSize: '16px', color: '#8fe8ff' });
    this.add.text(64, 84, '通道模式', { fontFamily: UI_FONT_FAMILY, fontSize: '52px', color: '#f4eedd', fontStyle: 'bold' });
    this.add.text(64, 160, '左边是墙，右边是尸潮。', { fontFamily: UI_FONT_FAMILY, fontSize: '24px', color: '#f4eedd' });
    this.add.text(64, 210, '三条横道:上门漂道具卡,中门是主通道,下门飘队友卡。\n击穿漂移卡立即生效;主通道漏一只僵尸即失败,冲最高分。', {
      fontFamily: UI_FONT_FAMILY, fontSize: '17px', color: '#a9a5ad', lineSpacing: 10,
    });
    CORRIDOR_PRESET_IDS.forEach((id, index) => {
      this.rows.set(id, createActionButton(this, {
        x: 265, y: 342 + index * 82, width: 400, height: 64,
        label: `${index + 1}  ${CORRIDOR_PRESETS[id].name}`, primary: false,
        onSelect: () => this.select(id),
      }));
    });
    this.portrait = this.add.image(1060, 370, CHARACTER_PORTRAIT_TEXTURE_KEYS.watcher);
    this.detail = this.add.text(520, 326, '', {
      fontFamily: UI_FONT_FAMILY, fontSize: '21px', color: '#f4eedd', lineSpacing: 18,
      wordWrap: { width: 380, useAdvancedWrap: true },
    });
    this.record = this.add.text(520, 495, '', { fontFamily: UI_FONT_FAMILY, fontSize: '17px', color: '#8fe8ff' });
    this.add.text(64, 561, '固定预设全开放 · 不修改原编队与解锁 · 卡片击破即时生效 · 漏怪即失败', {
      fontFamily: UI_FONT_FAMILY, fontSize: '16px', color: '#8e8b92',
    });
    createActionButton(this, { x: 390, y: 634, width: 330, height: 58, label: '返回主页', primary: false, onSelect: () => this.back() });
    createActionButton(this, { x: 830, y: 634, width: 430, height: 58, label: '进入通道  →', primary: true, onSelect: () => this.launch() });
    this.input.keyboard?.on('keydown', this.handleKey, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.input.keyboard?.off('keydown', this.handleKey, this));
    this.select(this.selected);
  }

  private select(id: CorridorPresetId): void {
    this.selected = id;
    for (const [presetId, row] of this.rows) row.setSelected(presetId === id);
    const preset = CORRIDOR_PRESETS[id];
    const character = getCharacterDef(preset.characterId);
    this.detail.setText(`${character.codename}  /  ${WEAPONS[preset.weaponId].name}\n${preset.description}\n手枪备用 · 技能与战术道具可用`);
    this.portrait.setTexture(CHARACTER_PORTRAIT_TEXTURE_KEYS[preset.characterId]);
    this.portrait.setScale(Math.min(220 / this.portrait.width, 260 / this.portrait.height));
    const records = normalizeCorridorRecords(SaveManager.load<unknown>(SAVE_KEYS.corridorRecords, {}));
    const best = records[CORRIDOR_VERSION]?.[id];
    this.record.setText(best ? `最佳 ${best.score} 分 · 存活 ${formatCorridorTime(best.elapsedMs)}` : '尚无纪录 · 配置 ' + CORRIDOR_VERSION);
  }

  private handleKey(event: KeyboardEvent): void {
    if (event.repeat) return;
    const index = ['Digit1', 'Digit2', 'Digit3'].indexOf(event.code);
    if (index >= 0) this.select(CORRIDOR_PRESET_IDS[index]);
    if (event.code === 'Enter') this.launch();
    if (event.code === 'Escape') this.back();
  }

  private launch(): void {
    if (this.launching) return;
    this.launching = true;
    SoundManager.play('uiConfirm');
    if (this.scene.isSleeping(SCENES.game) || this.scene.isActive(SCENES.game)) this.scene.stop(SCENES.game);
    this.scene.start(SCENES.game, { mode: 'corridor', corridorPresetId: this.selected });
  }

  private back(): void { this.scene.start(SCENES.mainMenu); }
}
