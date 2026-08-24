import Phaser from 'phaser';
import {
  CHARACTER_IDS,
  CHARACTERS,
  getCharacterDef,
  type CharacterId,
} from '../config/characters';
import { LEVELS } from '../config/levels';
import { MAX_WEAPON_LOADOUT_SIZE } from '../config/loadout';
import { getWeaponDef, WEAPONS, type WeaponId } from '../config/weapons';
import { GAME_HEIGHT, GAME_WIDTH, SCENES } from '../constants';
import { configureHighResolutionScene } from '../systems/DisplayManager';
import { SaveManager } from '../systems/SaveManager';
import { SoundManager } from '../systems/SoundManager';
import { GAME_WEAPON_TEXTURE_KEYS } from '../systems/WeaponAssetManager';
import type { GameMode } from '../systems/GameState';
import { UI_FONT_FAMILY } from '../ui/fonts';
import { fitTextWidth } from '../ui/layout';

interface PreparationSceneData {
  mode?: GameMode;
  levelId?: string | null;
}

interface CharacterRowRefs {
  box: Phaser.GameObjects.Rectangle;
  stripe: Phaser.GameObjects.Rectangle;
  index: Phaser.GameObjects.Text;
  codename: Phaser.GameObjects.Text;
  role: Phaser.GameObjects.Text;
}

interface WeaponSlotRefs {
  weaponId: WeaponId;
  box: Phaser.GameObjects.Rectangle;
  accent: Phaser.GameObjects.Rectangle;
  image: Phaser.GameObjects.Image;
  name: Phaser.GameObjects.Text;
  meta: Phaser.GameObjects.Text;
}

interface WeaponLibraryCardRefs {
  box: Phaser.GameObjects.Rectangle;
  accent: Phaser.GameObjects.Rectangle;
  image: Phaser.GameObjects.Image;
  index: Phaser.GameObjects.Text;
  name: Phaser.GameObjects.Text;
  meta: Phaser.GameObjects.Text;
  status: Phaser.GameObjects.Text;
}

interface LoadoutEditorSlotRefs {
  box: Phaser.GameObjects.Rectangle;
  index: Phaser.GameObjects.Text;
  name: Phaser.GameObjects.Text;
  status: Phaser.GameObjects.Text;
}

interface StatRowRefs {
  fill: Phaser.GameObjects.Rectangle;
  value: Phaser.GameObjects.Text;
}

const CHARACTER_LIST_LEFT = 54;
const CHARACTER_LIST_WIDTH = 270;
const CHARACTER_ROW_HEIGHT = 62;
const CHARACTER_ROW_GAP = 8;
const STAT_BAR_WIDTH = 214;
const ALL_WEAPON_IDS = Object.keys(WEAPONS) as WeaponId[];

export class PreparationScene extends Phaser.Scene {
  private mode: GameMode = 'level';
  private levelId: string | null = 'level_1';
  private selectedCharacterId: CharacterId = 'watcher';
  private selectedWeaponId: WeaponId = 'pistol';
  private loadoutWeaponIds: WeaponId[] = ['pistol'];
  private unlockedWeaponIds = new Set<WeaponId>(['pistol']);
  private loadoutEditorOpen = false;
  private loadoutEditorDraft: WeaponId[] = ['pistol'];

  private readonly characterRows = new Map<CharacterId, CharacterRowRefs>();
  private readonly weaponSlots = new Map<WeaponId, WeaponSlotRefs>();
  private readonly loadoutEditorCards = new Map<WeaponId, WeaponLibraryCardRefs>();
  private readonly loadoutEditorSlots: LoadoutEditorSlotRefs[] = [];
  private readonly loadoutEditorObjects: Phaser.GameObjects.GameObject[] = [];
  private readonly statRows = new Map<'health' | 'speed' | 'damage' | 'headshot', StatRowRefs>();

  private characterImage!: Phaser.GameObjects.Image;
  private characterNameText!: Phaser.GameObjects.Text;
  private characterRoleText!: Phaser.GameObjects.Text;
  private characterSummaryText!: Phaser.GameObjects.Text;
  private passiveNameText!: Phaser.GameObjects.Text;
  private passiveDescriptionText!: Phaser.GameObjects.Text;
  private confirmBox!: Phaser.GameObjects.Rectangle;
  private confirmText!: Phaser.GameObjects.Text;
  private loadoutEditorCountText!: Phaser.GameObjects.Text;
  private loadoutEditorFeedbackText!: Phaser.GameObjects.Text;

  constructor() {
    super(SCENES.preparation);
  }

  init(data: PreparationSceneData): void {
    this.mode = data.mode ?? 'level';
    if (this.mode === 'endless') {
      this.levelId = null;
    } else {
      this.levelId = LEVELS.find((level) => level.id === data.levelId)?.id
        ?? LEVELS[0]?.id
        ?? 'level_1';
    }

    this.loadoutWeaponIds = SaveManager.getWeaponLoadout();
    this.unlockedWeaponIds = new Set(SaveManager.getUnlockedWeapons());
    this.loadoutEditorDraft = [...this.loadoutWeaponIds];
    this.selectedCharacterId = SaveManager.getPreferredCharacterId();
    const preferredWeaponId = SaveManager.getPreferredStarterWeapon();
    this.selectedWeaponId = this.isTutorialLevel()
      ? 'pistol'
      : this.loadoutWeaponIds.includes(preferredWeaponId)
        ? preferredWeaponId
        : this.loadoutWeaponIds[0] ?? 'pistol';
  }

  create(): void {
    configureHighResolutionScene(this);
    SoundManager.setMusic('menu');
    this.characterRows.clear();
    this.weaponSlots.clear();
    this.loadoutEditorCards.clear();
    this.loadoutEditorSlots.length = 0;
    this.loadoutEditorObjects.length = 0;
    this.statRows.clear();

    this.createBackdrop();
    this.createHeader();
    this.createCharacterList();
    this.createCharacterFocus();
    this.createInspector();
    this.createWeaponStrip();
    this.createActions();
    this.refreshCharacter(false);
    this.refreshWeapon(false);

    this.input.keyboard?.on('keydown', this.handleKeyDown, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard?.off('keydown', this.handleKeyDown, this);
    });
  }

  private createBackdrop(): void {
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x101014);

    const grid = this.add.graphics();
    grid.lineStyle(1, 0xf4eedd, 0.035);
    for (let x = 0; x <= GAME_WIDTH; x += 48) grid.lineBetween(x, 0, x, GAME_HEIGHT);
    for (let y = 0; y <= GAME_HEIGHT; y += 48) grid.lineBetween(0, y, GAME_WIDTH, y);

    this.add.rectangle(486, 328, 278, 430, 0xfbc02d, 0.92);
    this.add.rectangle(486, 328, 248, 400, 0x17171d, 1);
    this.add.rectangle(347, 328, 4, 430, 0xd32f2f, 0.9);
    this.add.rectangle(640, 328, 2, 430, 0xf4eedd, 0.12);
  }

  private createHeader(): void {
    this.add.text(54, 30, 'PRE-MISSION LOADOUT', {
      fontFamily: UI_FONT_FAMILY,
      fontSize: '14px',
      color: '#fbc02d',
      letterSpacing: 2,
    });
    this.add.text(52, 51, '战前整备', {
      fontFamily: UI_FONT_FAMILY,
      fontStyle: 'bold',
      fontSize: '44px',
      color: '#f4eedd',
    });
    this.add.text(310, 66, this.getMissionLabel(), {
      fontFamily: UI_FONT_FAMILY,
      fontSize: '16px',
      color: '#99959c',
    });
    this.add.rectangle(GAME_WIDTH / 2, 108, GAME_WIDTH - 104, 2, 0xf4eedd, 0.16);

    const backBox = this.add.rectangle(1170, 58, 112, 44, 0x1d1d24)
      .setStrokeStyle(2, 0xf4eedd, 0.24)
      .setInteractive({ useHandCursor: true });
    const backText = this.add.text(1170, 58, '返回', {
      fontFamily: UI_FONT_FAMILY,
      fontSize: '18px',
      color: '#f4eedd',
    }).setOrigin(0.5);
    backBox
      .on('pointerover', () => backBox.setStrokeStyle(2, 0xfbc02d, 1))
      .on('pointerout', () => backBox.setStrokeStyle(2, 0xf4eedd, 0.24))
      .on('pointerup', this.returnToMenu, this);
    backText.setInteractive({ useHandCursor: true }).on('pointerup', this.returnToMenu, this);
  }

  private createCharacterList(): void {
    this.add.text(CHARACTER_LIST_LEFT, 132, '选择角色', {
      fontFamily: UI_FONT_FAMILY,
      fontSize: '21px',
      color: '#f4eedd',
    });

    CHARACTER_IDS.forEach((characterId, index) => {
      const character = getCharacterDef(characterId);
      const y = 195 + index * (CHARACTER_ROW_HEIGHT + CHARACTER_ROW_GAP);
      const box = this.add.rectangle(
        CHARACTER_LIST_LEFT + CHARACTER_LIST_WIDTH / 2,
        y,
        CHARACTER_LIST_WIDTH,
        CHARACTER_ROW_HEIGHT,
        0x19191f,
      ).setInteractive({ useHandCursor: true });
      const stripe = this.add.rectangle(CHARACTER_LIST_LEFT, y, 5, CHARACTER_ROW_HEIGHT, character.accentColor)
        .setOrigin(0, 0.5);
      const order = this.add.text(CHARACTER_LIST_LEFT + 16, y, String(index + 1).padStart(2, '0'), {
        fontFamily: UI_FONT_FAMILY,
        fontSize: '21px',
        color: '#77747b',
      }).setOrigin(0, 0.5);
      const codename = this.add.text(CHARACTER_LIST_LEFT + 60, y - 11, character.codename, {
        fontFamily: UI_FONT_FAMILY,
        fontStyle: 'bold',
        fontSize: '18px',
        color: '#f4eedd',
      }).setOrigin(0, 0.5);
      const role = this.add.text(CHARACTER_LIST_LEFT + 60, y + 13, character.role, {
        fontFamily: UI_FONT_FAMILY,
        fontSize: '12px',
        color: '#8e8b92',
      }).setOrigin(0, 0.5);

      this.characterRows.set(characterId, { box, stripe, index: order, codename, role });
      box
        .on('pointerover', () => {
          if (this.selectedCharacterId !== characterId) box.fillColor = 0x292931;
        })
        .on('pointerout', () => this.paintCharacterRow(characterId))
        .on('pointerup', () => this.selectCharacter(characterId));
    });
  }

  private createCharacterFocus(): void {
    this.characterImage = this.add.image(486, 316, CHARACTERS.watcher.portraitTextureKey);
    this.add.ellipse(486, 460, 194, 46, 0x000000, 0.38).setDepth(2);
    this.characterImage.setDepth(3);

    this.characterNameText = this.add.text(486, 478, '', {
      fontFamily: UI_FONT_FAMILY,
      fontStyle: 'bold',
      fontSize: '38px',
      color: '#f4eedd',
    }).setOrigin(0.5).setDepth(4);
    this.characterRoleText = this.add.text(486, 512, '', {
      fontFamily: UI_FONT_FAMILY,
      fontSize: '15px',
      color: '#fbc02d',
    }).setOrigin(0.5).setDepth(4);
  }

  private createInspector(): void {
    const left = 680;
    this.add.text(left, 132, '战斗档案', {
      fontFamily: UI_FONT_FAMILY,
      fontSize: '21px',
      color: '#f4eedd',
    });
    this.characterSummaryText = this.add.text(left, 170, '', {
      fontFamily: UI_FONT_FAMILY,
      fontSize: '15px',
      color: '#bdb8af',
      lineSpacing: 5,
      wordWrap: { width: 520 },
    });

    const statDefinitions: Array<{
      key: 'health' | 'speed' | 'damage' | 'headshot';
      label: string;
    }> = [
      { key: 'health', label: '生命' },
      { key: 'speed', label: '移速' },
      { key: 'damage', label: '伤害' },
      { key: 'headshot', label: '基础爆头' },
    ];

    statDefinitions.forEach((stat, index) => {
      const y = 256 + index * 47;
      this.add.text(left, y, stat.label, {
        fontFamily: UI_FONT_FAMILY,
        fontSize: '15px',
        color: '#f4eedd',
      }).setOrigin(0, 0.5);
      this.add.rectangle(left + 88, y, STAT_BAR_WIDTH, 8, 0xf4eedd, 0.12).setOrigin(0, 0.5);
      const fill = this.add.rectangle(left + 88, y, 0, 8, 0xfbc02d, 0.95).setOrigin(0, 0.5);
      const value = this.add.text(left + 326, y, '', {
        fontFamily: UI_FONT_FAMILY,
        fontSize: '15px',
        color: '#f4eedd',
      }).setOrigin(0, 0.5);
      this.statRows.set(stat.key, { fill, value });
    });

    this.add.rectangle(left, 450, 520, 2, 0xf4eedd, 0.12).setOrigin(0, 0.5);
    this.passiveNameText = this.add.text(left, 470, '', {
      fontFamily: UI_FONT_FAMILY,
      fontStyle: 'bold',
      fontSize: '19px',
      color: '#fbc02d',
    });
    this.passiveDescriptionText = this.add.text(left, 503, '', {
      fontFamily: UI_FONT_FAMILY,
      fontSize: '14px',
      color: '#c7c2b9',
      lineSpacing: 5,
      wordWrap: { width: 520 },
    });
  }

  private createWeaponStrip(): void {
    this.add.rectangle(GAME_WIDTH / 2, 558, GAME_WIDTH - 104, 2, 0xf4eedd, 0.16);
    this.add.text(54, 574, '出战军械带 · 6 槽', {
      fontFamily: UI_FONT_FAMILY,
      fontSize: '18px',
      color: '#f4eedd',
    });
    const editBox = this.add.rectangle(918, 576, 150, 34, 0x1c1c22)
      .setStrokeStyle(2, 0xf4eedd, 0.2)
      .setInteractive({ useHandCursor: true });
    const editText = this.add.text(918, 576, '编辑武器库', {
      fontFamily: UI_FONT_FAMILY,
      fontSize: '13px',
      color: '#fbc02d',
    }).setOrigin(0.5);
    editBox
      .on('pointerover', () => {
        editBox.fillColor = 0xfbc02d;
        editText.setColor('#0f0e13');
      })
      .on('pointerout', () => {
        editBox.fillColor = 0x1c1c22;
        editText.setColor('#fbc02d');
      })
      .on('pointerup', this.openLoadoutEditor, this);
    editText.setInteractive({ useHandCursor: true }).on('pointerup', this.openLoadoutEditor, this);

    const slotWidth = 158;
    const gap = 10;
    this.loadoutWeaponIds.forEach((weaponId, index) => {
      const weapon = WEAPONS[weaponId];
      const x = 54 + slotWidth / 2 + index * (slotWidth + gap);
      const y = 641;
      const box = this.add.rectangle(x, y, slotWidth, 72, 0x19191f)
        .setStrokeStyle(2, 0xf4eedd, 0.14);
      const accent = this.add.rectangle(x, y + 34, slotWidth, 4, weapon.color).setOrigin(0.5, 1);
      const image = this.add.image(x - 48, y - 8, GAME_WEAPON_TEXTURE_KEYS[weaponId]);
      const scale = Math.min(56 / image.width, 27 / image.height);
      image.setScale(scale);
      const name = this.add.text(x - 12, y - 22, weapon.name, {
        fontFamily: UI_FONT_FAMILY,
        fontStyle: 'bold',
        fontSize: '13px',
        color: '#f4eedd',
      });
      fitTextWidth(name, 82);
      const meta = this.add.text(x - 12, y + 3, this.getWeaponMeta(weaponId), {
        fontFamily: UI_FONT_FAMILY,
        fontSize: '10px',
        color: '#8e8b92',
      });
      fitTextWidth(meta, 82);
      this.weaponSlots.set(weaponId, { weaponId, box, accent, image, name, meta });

      {
        box.setInteractive({ useHandCursor: true })
          .on('pointerover', () => {
            if (this.selectedWeaponId !== weaponId) box.setStrokeStyle(2, 0xfbc02d, 0.7);
          })
        .on('pointerout', () => this.paintWeaponSlot(weaponId))
          .on('pointerup', () => this.selectWeapon(weaponId));
      }
    });
  }

  private createActions(): void {
    this.confirmBox = this.add.rectangle(1104, 641, 244, 72, 0xfbc02d)
      .setStrokeStyle(4, 0x0f0e13, 1)
      .setInteractive({ useHandCursor: true });
    this.confirmText = this.add.text(1104, 641, '确认行动  →', {
      fontFamily: UI_FONT_FAMILY,
      fontSize: '24px',
      color: '#0f0e13',
    }).setOrigin(0.5);
    this.confirmBox
      .on('pointerover', () => {
        this.confirmBox.fillColor = 0xf4eedd;
        this.tweens.add({ targets: [this.confirmBox, this.confirmText], y: 639, duration: 90 });
      })
      .on('pointerout', () => {
        this.confirmBox.fillColor = 0xfbc02d;
        this.tweens.add({ targets: [this.confirmBox, this.confirmText], y: 641, duration: 90 });
      })
      .on('pointerup', this.confirmSelection, this);
    this.confirmText.setInteractive({ useHandCursor: true }).on('pointerup', this.confirmSelection, this);
  }

  private openLoadoutEditor(): void {
    if (this.loadoutEditorOpen) return;
    this.loadoutEditorOpen = true;
    this.loadoutEditorDraft = [...this.loadoutWeaponIds];
    this.loadoutEditorCards.clear();
    this.loadoutEditorSlots.length = 0;

    const add = <T extends Phaser.GameObjects.GameObject>(object: T): T => {
      object.setDepth(50);
      this.loadoutEditorObjects.push(object);
      return object;
    };
    add(this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x0b0b0f, 0.96));
    add(this.add.text(54, 28, 'WEAPON LIBRARY  //  LOADOUT', {
      fontFamily: UI_FONT_FAMILY,
      fontSize: '14px',
      color: '#fbc02d',
    }).setLetterSpacing(2));
    add(this.add.text(52, 49, '出战军械库', {
      fontFamily: UI_FONT_FAMILY,
      fontStyle: 'bold',
      fontSize: '40px',
      color: '#f4eedd',
    }));
    add(this.add.text(54, 108, '从已解锁武器中选择 6 把组成出战编队', {
      fontFamily: UI_FONT_FAMILY,
      fontSize: '16px',
      color: '#c7c2b9',
    }));
    this.loadoutEditorCountText = add(this.add.text(1226, 108, '', {
      fontFamily: UI_FONT_FAMILY,
      fontStyle: 'bold',
      fontSize: '17px',
      color: '#fbc02d',
    }).setOrigin(1, 0));
    add(this.add.rectangle(GAME_WIDTH / 2, 137, GAME_WIDTH - 104, 2, 0xf4eedd, 0.16));

    const cardWidth = 184;
    const cardHeight = 96;
    const cardGap = 12;
    ALL_WEAPON_IDS.forEach((weaponId, weaponIndex) => {
      const weapon = WEAPONS[weaponId];
      const column = weaponIndex % 6;
      const row = Math.floor(weaponIndex / 6);
      const x = 54 + cardWidth / 2 + column * (cardWidth + cardGap);
      const y = 192 + row * 108;
      const box = add(this.add.rectangle(x, y, cardWidth, cardHeight, 0x19191f)
        .setStrokeStyle(2, 0xf4eedd, 0.14)
        .setInteractive({ useHandCursor: true }));
      const accent = add(this.add.rectangle(x, y + cardHeight / 2, cardWidth, 5, weapon.color).setOrigin(0.5, 1));
      const index = add(this.add.text(x - 82, y - 35, String(weaponIndex + 1).padStart(2, '0'), {
        fontFamily: UI_FONT_FAMILY,
        fontSize: '12px',
        color: '#77747b',
      }));
      const image = add(this.add.image(x - 54, y + 3, GAME_WEAPON_TEXTURE_KEYS[weaponId]));
      image.setScale(Math.min(58 / image.width, 32 / image.height));
      const name = add(this.add.text(x - 17, y - 26, weapon.name, {
        fontFamily: UI_FONT_FAMILY,
        fontStyle: 'bold',
        fontSize: '16px',
        color: '#f4eedd',
      }));
      fitTextWidth(name, 99);
      const meta = add(this.add.text(x - 17, y - 1, this.getWeaponMeta(weaponId), {
        fontFamily: UI_FONT_FAMILY,
        fontSize: '10px',
        color: '#8e8b92',
      }));
      fitTextWidth(meta, 99);
      const status = add(this.add.text(x + 82, y + 28, '', {
        fontFamily: UI_FONT_FAMILY,
        fontStyle: 'bold',
        fontSize: '10px',
        color: '#fbc02d',
      }).setOrigin(1, 0));
      this.loadoutEditorCards.set(weaponId, { box, accent, image, index, name, meta, status });
      box
        .on('pointerover', () => this.paintLoadoutEditorCard(weaponId, true))
        .on('pointerout', () => this.paintLoadoutEditorCard(weaponId))
        .on('pointerup', () => this.toggleLoadoutEditorWeapon(weaponId));
    });

    add(this.add.rectangle(GAME_WIDTH / 2, 346, GAME_WIDTH - 104, 2, 0xf4eedd, 0.16));
    add(this.add.text(54, 364, '当前出战编队', {
      fontFamily: UI_FONT_FAMILY,
      fontSize: '18px',
      color: '#f4eedd',
    }));
    const slotWidth = 188;
    const slotGap = 10;
    for (let slotIndex = 0; slotIndex < MAX_WEAPON_LOADOUT_SIZE; slotIndex += 1) {
      const x = 54 + slotWidth / 2 + slotIndex * (slotWidth + slotGap);
      const y = 430;
      const box = add(this.add.rectangle(x, y, slotWidth, 68, 0x18181e).setStrokeStyle(2, 0xf4eedd, 0.12));
      const index = add(this.add.text(x - 78, y - 22, String(slotIndex + 1).padStart(2, '0'), {
        fontFamily: UI_FONT_FAMILY,
        fontSize: '12px',
        color: '#77747b',
      }));
      const name = add(this.add.text(x - 48, y - 18, '', {
        fontFamily: UI_FONT_FAMILY,
        fontStyle: 'bold',
        fontSize: '14px',
        color: '#f4eedd',
      }));
      const status = add(this.add.text(x - 48, y + 10, '', {
        fontFamily: UI_FONT_FAMILY,
        fontSize: '10px',
        color: '#77747b',
      }));
      fitTextWidth(name, 128);
      this.loadoutEditorSlots.push({ box, index, name, status });
    }

    this.loadoutEditorFeedbackText = add(this.add.text(54, 505, '', {
      fontFamily: UI_FONT_FAMILY,
      fontSize: '14px',
      color: '#8e8b92',
    }));
    const cancelBox = add(this.add.rectangle(936, 612, 150, 50, 0x1c1c22)
      .setStrokeStyle(2, 0xf4eedd, 0.24).setInteractive({ useHandCursor: true }));
    const cancelText = add(this.add.text(936, 612, '取消', {
      fontFamily: UI_FONT_FAMILY,
      fontSize: '17px',
      color: '#f4eedd',
    }).setOrigin(0.5));
    cancelBox.on('pointerup', this.closeLoadoutEditor, this);
    cancelText.setInteractive({ useHandCursor: true }).on('pointerup', this.closeLoadoutEditor, this);
    const applyBox = add(this.add.rectangle(1138, 612, 190, 50, 0xfbc02d)
      .setStrokeStyle(3, 0x0f0e13, 1).setInteractive({ useHandCursor: true }));
    const applyText = add(this.add.text(1138, 612, '应用编队  →', {
      fontFamily: UI_FONT_FAMILY,
      fontStyle: 'bold',
      fontSize: '18px',
      color: '#0f0e13',
    }).setOrigin(0.5));
    applyBox.on('pointerup', this.applyLoadoutEditor, this);
    applyText.setInteractive({ useHandCursor: true }).on('pointerup', this.applyLoadoutEditor, this);
    this.refreshLoadoutEditor();
  }

  private closeLoadoutEditor(): void {
    this.loadoutEditorOpen = false;
    this.loadoutEditorCards.clear();
    this.loadoutEditorSlots.length = 0;
    for (const object of this.loadoutEditorObjects) object.destroy();
    this.loadoutEditorObjects.length = 0;
  }

  private toggleLoadoutEditorWeapon(weaponId: WeaponId): void {
    if (!this.unlockedWeaponIds.has(weaponId)) {
      this.loadoutEditorFeedbackText.setText('该武器尚未解锁军械许可');
      SoundManager.play('uiMove');
      return;
    }
    if (weaponId === 'pistol') {
      this.loadoutEditorFeedbackText.setText('沙漠之鹰为固定武器，始终占用第 1 槽');
      SoundManager.play('uiMove');
      return;
    }
    const currentIndex = this.loadoutEditorDraft.indexOf(weaponId);
    if (currentIndex >= 0) {
      this.loadoutEditorDraft = this.loadoutEditorDraft.filter((candidate) => candidate !== weaponId);
      this.loadoutEditorFeedbackText.setText(`${WEAPONS[weaponId].name} 已移出编队`);
    } else if (this.loadoutEditorDraft.length >= MAX_WEAPON_LOADOUT_SIZE) {
      this.loadoutEditorFeedbackText.setText(`${MAX_WEAPON_LOADOUT_SIZE} 个槽位已满，请先移出一把武器`);
      SoundManager.play('uiMove');
      return;
    } else {
      this.loadoutEditorDraft.push(weaponId);
      this.loadoutEditorFeedbackText.setText(`${WEAPONS[weaponId].name} 已编入第 ${this.loadoutEditorDraft.length} 槽`);
    }
    SoundManager.play('weaponSwitch');
    this.refreshLoadoutEditor(true, weaponId);
  }

  private refreshLoadoutEditor(animate = false, changedWeaponId?: WeaponId): void {
    for (const weaponId of ALL_WEAPON_IDS) this.paintLoadoutEditorCard(weaponId);
    this.loadoutEditorSlots.forEach((refs, slotIndex) => {
      const weaponId = this.loadoutEditorDraft[slotIndex];
      const occupied = weaponId !== undefined;
      refs.box.fillColor = occupied ? 0x24241f : 0x18181e;
      refs.box.setStrokeStyle(2, occupied ? WEAPONS[weaponId].color : 0xf4eedd, occupied ? 0.72 : 0.12);
      refs.index.setColor(occupied ? '#fbc02d' : '#77747b');
      refs.name.setText(occupied ? WEAPONS[weaponId].name : '空槽').setColor(occupied ? '#f4eedd' : '#57555c');
      fitTextWidth(refs.name, 128);
      refs.status
        .setText(slotIndex === 0 ? '必选 · 锁定' : occupied ? '已编入' : '待选择')
        .setColor(slotIndex === 0 ? '#58c9dd' : occupied ? '#bdb8af' : '#57555c');
    });
    this.loadoutEditorCountText.setText(`LOADOUT  ${this.loadoutEditorDraft.length} / ${MAX_WEAPON_LOADOUT_SIZE}`);
    if (!animate || !changedWeaponId) return;
    const refs = this.loadoutEditorCards.get(changedWeaponId);
    if (!refs) return;
    this.tweens.killTweensOf([refs.image, refs.name, refs.meta]);
    this.tweens.add({ targets: [refs.image, refs.name, refs.meta], y: '-=2', duration: 80, yoyo: true });
  }

  private paintLoadoutEditorCard(weaponId: WeaponId, hovered = false): void {
    const refs = this.loadoutEditorCards.get(weaponId);
    if (!refs) return;
    const unlocked = this.unlockedWeaponIds.has(weaponId);
    const slotIndex = this.loadoutEditorDraft.indexOf(weaponId);
    const selected = slotIndex >= 0;
    const required = weaponId === 'pistol';
    refs.box.fillColor = selected ? 0x292923 : hovered && unlocked ? 0x24242b : 0x19191f;
    refs.box.setStrokeStyle(2, selected ? 0xfbc02d : hovered && unlocked ? 0xfbc02d : 0xf4eedd, selected || hovered ? 1 : 0.14);
    refs.accent.setAlpha(unlocked ? selected ? 1 : 0.35 : 0.12);
    refs.image.setAlpha(unlocked ? selected ? 1 : 0.62 : 0.22);
    refs.index.setColor(unlocked ? selected ? '#fbc02d' : '#77747b' : '#55535a');
    refs.name.setColor(unlocked ? selected ? '#f4eedd' : '#b5b0a8' : '#69666d');
    refs.meta.setColor(unlocked ? selected ? '#bdb8af' : '#77747b' : '#55535a');
    refs.status
      .setText(!unlocked ? '未解锁' : required ? 'SLOT 01 · 必选' : selected ? `SLOT ${String(slotIndex + 1).padStart(2, '0')}` : '可选')
      .setColor(!unlocked ? '#55535a' : required ? '#58c9dd' : selected ? '#fbc02d' : '#77747b');
  }

  private applyLoadoutEditor(): void {
    if (this.loadoutEditorDraft.length !== MAX_WEAPON_LOADOUT_SIZE) {
      const remaining = MAX_WEAPON_LOADOUT_SIZE - this.loadoutEditorDraft.length;
      this.loadoutEditorFeedbackText.setText(`编队未完成，还需选择 ${remaining} 把武器`);
      SoundManager.play('uiMove');
      return;
    }
    this.loadoutWeaponIds = SaveManager.setWeaponLoadout(this.loadoutEditorDraft);
    this.selectedWeaponId = this.loadoutWeaponIds.includes(this.selectedWeaponId)
      ? this.selectedWeaponId
      : this.loadoutWeaponIds[0] ?? 'pistol';
    SoundManager.play('uiConfirm');
    this.closeLoadoutEditor();
    this.scene.restart({ mode: this.mode, levelId: this.levelId });
  }

  private selectCharacter(characterId: CharacterId): void {
    if (characterId === this.selectedCharacterId) return;
    this.selectedCharacterId = characterId;
    SoundManager.play('weaponSwitch');
    this.refreshCharacter(true);
  }

  private refreshCharacter(animate: boolean): void {
    const character = getCharacterDef(this.selectedCharacterId);
    for (const characterId of CHARACTER_IDS) this.paintCharacterRow(characterId);

    this.characterImage.setTexture(character.portraitTextureKey);
    const imageScale = Math.min(188 / this.characterImage.width, 230 / this.characterImage.height);
    this.characterImage.setScale(imageScale);
    this.characterNameText.setFontSize(38).setText(character.codename);
    this.characterRoleText.setFontSize(15).setText(character.role.toUpperCase());
    fitTextWidth(this.characterNameText, 210);
    fitTextWidth(this.characterRoleText, 210);
    this.characterSummaryText.setText(character.summary);
    this.passiveNameText.setText(`${character.passive.name}  //  PASSIVE`);
    this.passiveDescriptionText.setText(character.passive.description);

    this.updateStat('health', character.maxHealth / 160, String(character.maxHealth), character.accentColor);
    this.updateStat('speed', character.moveSpeed / 160, String(character.moveSpeed), character.accentColor);
    this.updateStat('damage', character.damageMultiplier / 1.3, `${Math.round(character.damageMultiplier * 100)}%`, character.accentColor);
    this.updateStat('headshot', character.headshotChance / 0.3, `${Math.round(character.headshotChance * 100)}%`, character.accentColor);
    this.characterRoleText.setColor(toHexColor(character.accentColor));
    this.passiveNameText.setColor(toHexColor(character.accentColor));

    if (animate) {
      this.tweens.killTweensOf(this.characterImage);
      this.characterImage.setAlpha(0.35).setScale(imageScale * 0.96);
      this.tweens.add({
        targets: this.characterImage,
        alpha: 1,
        scale: imageScale,
        duration: 180,
        ease: 'Cubic.Out',
      });
    }
  }

  private updateStat(
    key: 'health' | 'speed' | 'damage' | 'headshot',
    ratio: number,
    value: string,
    color: number,
  ): void {
    const refs = this.statRows.get(key);
    if (!refs) return;
    refs.fill.width = STAT_BAR_WIDTH * Phaser.Math.Clamp(ratio, 0, 1);
    refs.fill.fillColor = color;
    refs.value.setText(value);
  }

  private paintCharacterRow(characterId: CharacterId): void {
    const refs = this.characterRows.get(characterId);
    if (!refs) return;
    const selected = characterId === this.selectedCharacterId;
    refs.box.fillColor = selected ? 0xf4eedd : 0x19191f;
    refs.stripe.setAlpha(selected ? 1 : 0.35);
    refs.index.setColor(selected ? '#0f0e13' : '#77747b');
    refs.codename.setColor(selected ? '#0f0e13' : '#f4eedd');
    refs.role.setColor(selected ? '#4f4b45' : '#8e8b92');
  }

  private selectWeapon(weaponId: WeaponId): void {
    if (
      !this.loadoutWeaponIds.includes(weaponId)
      || weaponId === this.selectedWeaponId
      || (this.isTutorialLevel() && weaponId !== 'pistol')
    ) return;
    this.selectedWeaponId = weaponId;
    SoundManager.play('weaponSwitch');
    this.refreshWeapon(true);
  }

  private refreshWeapon(animate: boolean): void {
    for (const weaponId of this.loadoutWeaponIds) this.paintWeaponSlot(weaponId);
    if (!animate) return;
    const refs = this.weaponSlots.get(this.selectedWeaponId);
    if (!refs) return;
    this.tweens.killTweensOf([refs.image, refs.name, refs.meta]);
    this.tweens.add({
      targets: [refs.image, refs.name, refs.meta],
      y: '-=2',
      duration: 80,
      yoyo: true,
    });
  }

  private paintWeaponSlot(weaponId: WeaponId): void {
    const refs = this.weaponSlots.get(weaponId);
    if (!refs) return;
    const tutorialLocked = this.isTutorialLevel() && weaponId !== 'pistol';
    const selected = weaponId === this.selectedWeaponId;
    refs.box.fillColor = selected ? 0x292923 : 0x19191f;
    refs.box.setStrokeStyle(2, selected ? 0xfbc02d : 0xf4eedd, selected ? 1 : 0.14);
    refs.accent.setAlpha(selected ? 1 : tutorialLocked ? 0.15 : 0.45);
    refs.image.setAlpha(tutorialLocked ? 0.22 : selected ? 1 : 0.62);
    refs.name.setAlpha(tutorialLocked ? 0.28 : 1);
    refs.meta
      .setText(tutorialLocked ? '教学锁定' : this.getWeaponMeta(weaponId))
      .setAlpha(tutorialLocked ? 0.42 : 1);
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (event.repeat) return;
    const numberMatch = /^Digit([1-5])$/.exec(event.code);
    if (numberMatch) {
      const index = Number(numberMatch[1]) - 1;
      const characterId = CHARACTER_IDS[index];
      if (characterId) this.selectCharacter(characterId);
      return;
    }
    if (event.code === 'ArrowLeft') {
      this.cycleWeapon(-1);
      return;
    }
    if (event.code === 'ArrowRight') {
      this.cycleWeapon(1);
      return;
    }
    if (event.code === 'Enter') {
      this.confirmSelection();
      return;
    }
    if (event.code === 'Escape') this.returnToMenu();
  }

  private cycleWeapon(direction: -1 | 1): void {
    if (this.isTutorialLevel() || this.loadoutWeaponIds.length <= 1) return;
    const currentIndex = Math.max(0, this.loadoutWeaponIds.indexOf(this.selectedWeaponId));
    const nextIndex = (currentIndex + direction + this.loadoutWeaponIds.length) % this.loadoutWeaponIds.length;
    this.selectWeapon(this.loadoutWeaponIds[nextIndex]);
  }

  private confirmSelection(): void {
    if (this.loadoutWeaponIds.length !== MAX_WEAPON_LOADOUT_SIZE) return;
    this.loadoutWeaponIds = SaveManager.setWeaponLoadout(this.loadoutWeaponIds);
    SaveManager.setPreferredCharacterId(this.selectedCharacterId);
    SoundManager.play('uiConfirm');
    this.scene.start(SCENES.game, {
      mode: this.mode,
      levelId: this.levelId,
      characterId: this.selectedCharacterId,
    });
  }

  private returnToMenu(): void {
    SoundManager.play('uiMove');
    this.scene.start(SCENES.mainMenu, {
      selectedLevelId: this.mode === 'level' && this.levelId ? this.levelId : undefined,
    });
  }

  private isTutorialLevel(): boolean {
    return this.mode === 'level' && this.levelId === (LEVELS[0]?.id ?? 'level_1');
  }

  private getMissionLabel(): string {
    if (this.mode === 'endless') return '无尽模式  //  生存战场';
    return LEVELS.find((level) => level.id === this.levelId)?.name ?? '未知战区';
  }

  private getWeaponMeta(weaponId: WeaponId): string {
    const weapon = getWeaponDef(weaponId);
    // 扇形武器没有单发伤害，展示每秒伤害才对得上它在场上的实际表现。
    if (weapon.coneAttack) {
      return `${Math.round(weapon.coneAttack.damagePerSecond)}/秒 火焰 · ${weapon.magazineSize} 发`;
    }
    if (weapon.impactEffect?.kind === 'explosion') {
      return `爆炸 ${weapon.impactEffect.damage} · ${weapon.magazineSize} 发`;
    }
    if (weapon.pellets > 1) {
      return `${weapon.damage}×${weapon.pellets} 伤害 · ${weapon.magazineSize} 发`;
    }
    return weapon.headshotChanceBonus > 0
      ? `爆头 +${Math.round(weapon.headshotChanceBonus * 100)}% · ${weapon.magazineSize} 发`
      : `${weapon.damage} 伤害 · ${weapon.magazineSize} 发`;
  }
}

function toHexColor(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}
