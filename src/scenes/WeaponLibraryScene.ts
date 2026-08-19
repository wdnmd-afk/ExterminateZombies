import Phaser from 'phaser';
import {
  getWeaponAcquisition,
  getWeaponDefinition,
  WEAPON_LIBRARY,
  type WeaponLibraryEntry,
} from '../config/weaponLibrary';
import {
  MAX_WEAPON_LOADOUT_SIZE,
  REQUIRED_LOADOUT_WEAPON_ID,
} from '../config/loadout';
import type { WeaponId } from '../config/weapons';
import { GAME_HEIGHT, GAME_WIDTH, SCENES } from '../constants';
import { configureHighResolutionScene } from '../systems/DisplayManager';
import { SaveManager } from '../systems/SaveManager';
import { SoundManager } from '../systems/SoundManager';
import { GAME_WEAPON_TEXTURE_KEYS, prepareWeaponAssets } from '../systems/WeaponAssetManager';
import { UI_FONT_FAMILY } from '../ui/fonts';
import { fitTextWidth } from '../ui/layout';

interface WeaponRowRefs {
  container: Phaser.GameObjects.Container;
  box: Phaser.GameObjects.Rectangle;
  marker: Phaser.GameObjects.Rectangle;
  index: Phaser.GameObjects.Text;
  name: Phaser.GameObjects.Text;
  category: Phaser.GameObjects.Text;
  status: Phaser.GameObjects.Text;
  baseX: number;
}

export class WeaponLibraryScene extends Phaser.Scene {
  private selectedId = WEAPON_LIBRARY[0]?.id ?? '';
  private rows = new Map<string, WeaponRowRefs>();
  private unlockedWeaponIds = new Set<WeaponId>([REQUIRED_LOADOUT_WEAPON_ID]);
  private loadoutWeaponIds: WeaponId[] = [REQUIRED_LOADOUT_WEAPON_ID];

  private loadoutCountText!: Phaser.GameObjects.Text;
  private footerHintText!: Phaser.GameObjects.Text;
  private detailIndexText!: Phaser.GameObjects.Text;
  private detailStatusText!: Phaser.GameObjects.Text;
  private detailNameText!: Phaser.GameObjects.Text;
  private detailCategoryText!: Phaser.GameObjects.Text;
  private previewImage!: Phaser.GameObjects.Image;
  private statValues: Phaser.GameObjects.Text[] = [];
  private acquisitionLabelText!: Phaser.GameObjects.Text;
  private acquisitionText!: Phaser.GameObjects.Text;
  private detailNoteText!: Phaser.GameObjects.Text;

  constructor() {
    super(SCENES.weaponLibrary);
  }

  create(): void {
    configureHighResolutionScene(this);
    SoundManager.setMusic('menu');
    this.rows.clear();
    this.unlockedWeaponIds = new Set(SaveManager.getUnlockedWeapons());
    this.loadoutWeaponIds = SaveManager.getWeaponLoadout();
    this.prepareWeaponTextures();
    this.createBackdrop();

    const header = this.createHeader();
    const index = this.createWeaponIndex();
    const detail = this.createDetailPanel();
    const footer = this.createFooter();

    this.selectWeapon(this.selectedId, false);
    this.refreshLoadoutSummary();
    this.playEntrance(header, 40, 12);
    this.playEntrance(index, 110, 16);
    this.playEntrance(detail, 180, 16);
    this.playEntrance(footer, 260, 8);

    this.input.keyboard?.once('keydown-ESC', this.openMainMenu, this);
  }

  private prepareWeaponTextures(): void {
    prepareWeaponAssets(this);
  }

  private createBackdrop(): void {
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x101014);
    this.add.rectangle(8, GAME_HEIGHT / 2, 16, GAME_HEIGHT, 0xfbc02d);

    const grid = this.add.graphics();
    grid.lineStyle(1, 0xf4eedd, 0.03);
    for (let x = 32; x <= GAME_WIDTH; x += 48) {
      grid.lineBetween(x, 0, x, GAME_HEIGHT);
    }
    for (let y = 0; y <= GAME_HEIGHT; y += 48) {
      grid.lineBetween(16, y, GAME_WIDTH, y);
    }

    const rightPlane = this.add.graphics();
    rightPlane.fillStyle(0xfbc02d, 0.05);
    rightPlane.fillTriangle(1010, 0, GAME_WIDTH, 0, GAME_WIDTH, 194);
    rightPlane.lineStyle(8, 0xfbc02d, 0.045);
    for (let offset = 0; offset < 220; offset += 30) {
      rightPlane.lineBetween(1100 + offset, 0, GAME_WIDTH, 160 - offset);
    }

    this.add.text(GAME_WIDTH - 18, GAME_HEIGHT / 2, 'ARMORY', {
      fontFamily: UI_FONT_FAMILY,
      fontSize: '17px',
      color: '#f4eedd',
      letterSpacing: 5,
    }).setOrigin(0.5).setRotation(Math.PI / 2).setAlpha(0.15);
  }

  private createHeader(): Phaser.GameObjects.Container {
    const objects: Phaser.GameObjects.GameObject[] = [];

    const kicker = this.add.text(64, 28, 'FIELD ARMORY  //  WEAPON INDEX', {
      fontFamily: UI_FONT_FAMILY,
      fontSize: '14px',
      color: '#fbc02d',
      letterSpacing: 2,
    });
    const title = this.add.text(62, 48, '武器库', {
      fontFamily: UI_FONT_FAMILY,
      fontStyle: 'bold',
      fontSize: '56px',
      color: '#f4eedd',
      stroke: '#0f0e13',
      strokeThickness: 4,
    });
    const subtitle = this.add.text(66, 112, '军械许可、实战参数与五槽出战编队', {
      fontFamily: UI_FONT_FAMILY,
      fontSize: '16px',
      color: '#98949b',
    });
    this.loadoutCountText = this.add.text(1052, 52, '', {
      fontFamily: UI_FONT_FAMILY,
      fontSize: '13px',
      color: '#8f8b92',
      align: 'right',
    }).setOrigin(1, 0);

    const backBox = this.add.rectangle(1150, 76, 130, 42, 0x1c1c22)
      .setStrokeStyle(2, 0xf4eedd, 0.2)
      .setInteractive({ useHandCursor: true });
    const backLabel = this.add.text(1150, 76, '←  返回', {
      fontFamily: UI_FONT_FAMILY,
      fontStyle: 'bold',
      fontSize: '16px',
      color: '#f4eedd',
    }).setOrigin(0.5);

    backBox
      .on('pointerover', () => {
        backBox.fillColor = 0xfbc02d;
        backBox.setStrokeStyle(2, 0xfbc02d, 1);
        backLabel.setColor('#0f0e13');
      })
      .on('pointerout', () => {
        backBox.fillColor = 0x1c1c22;
        backBox.setStrokeStyle(2, 0xf4eedd, 0.2);
        backLabel.setColor('#f4eedd');
      })
      .on('pointerup', this.openMainMenu, this);

    const rule = this.add.rectangle(GAME_WIDTH / 2 + 8, 148, GAME_WIDTH - 112, 2, 0xf4eedd, 0.13);
    objects.push(kicker, title, subtitle, this.loadoutCountText, backBox, backLabel, rule);
    return this.add.container(0, 0, objects);
  }

  private createWeaponIndex(): Phaser.GameObjects.Container {
    const objects: Phaser.GameObjects.GameObject[] = [];
    const startX = 64;
    const indexWidth = 626;
    const columnGap = 12;
    const rowWidth = (indexWidth - columnGap) / 2;
    const firstY = 223;
    const rowStep = 55;

    const heading = this.add.text(startX, 168, 'WEAPON INDEX', {
      fontFamily: UI_FONT_FAMILY,
      fontSize: '22px',
      color: '#f4eedd',
      letterSpacing: 1,
    });
    const hint = this.add.text(startX + indexWidth, 174, `${WEAPON_LIBRARY.length} 项军械档案`, {
      fontFamily: UI_FONT_FAMILY,
      fontSize: '13px',
      color: '#69666d',
    }).setOrigin(1, 0);
    objects.push(heading, hint);

    WEAPON_LIBRARY.forEach((entry, entryIndex) => {
      const column = entryIndex % 2;
      const rowIndex = Math.floor(entryIndex / 2);
      const baseX = startX + rowWidth / 2 + column * (rowWidth + columnGap);
      const y = firstY + rowIndex * rowStep;
      const box = this.add.rectangle(0, 0, rowWidth, 48, 0x19191f);
      const marker = this.add.rectangle(-rowWidth / 2, 0, 6, 48, 0xfbc02d).setOrigin(0, 0.5);
      const index = this.add.text(-rowWidth / 2 + 18, 0, String(entryIndex + 1).padStart(2, '0'), {
        fontFamily: UI_FONT_FAMILY,
        fontSize: '17px',
        color: '#f4eedd',
      }).setOrigin(0, 0.5);
      const textX = -rowWidth / 2 + 54;
      const name = this.add.text(textX, -10, entry.name, {
        fontFamily: UI_FONT_FAMILY,
        fontStyle: 'bold',
        fontSize: '16px',
        color: '#f4eedd',
      }).setOrigin(0, 0.5);
      fitTextWidth(name, 156);
      const category = this.add.text(textX, 13, entry.category, {
        fontFamily: UI_FONT_FAMILY,
        fontSize: '10px',
        color: '#8e8b92',
      }).setOrigin(0, 0.5);
      fitTextWidth(category, 156);
      const status = this.add.text(rowWidth / 2 - 14, 0, '', {
        fontFamily: UI_FONT_FAMILY,
        fontSize: '11px',
        color: '#fbc02d',
      }).setOrigin(1, 0.5);
      const row = this.add.container(baseX, y, [box, marker, index, name, category, status]);

      this.rows.set(entry.id, {
        container: row,
        box,
        marker,
        index,
        name,
        category,
        status,
        baseX,
      });
      objects.push(row);

      box.setInteractive({ useHandCursor: true })
        .on('pointerover', () => {
          this.selectWeapon(entry.id, true);
          this.tweens.add({
            targets: row,
            x: baseX + 6,
            duration: 90,
            ease: 'Cubic.Out',
          });
        })
        .on('pointerout', () => {
          this.tweens.add({
            targets: row,
            x: baseX,
            duration: 90,
            ease: 'Cubic.Out',
          });
          this.paintRow(entry.id);
        })
        .on('pointerup', () => this.toggleLoadoutWeapon(entry));
    });

    return this.add.container(0, 0, objects);
  }

  private createDetailPanel(): Phaser.GameObjects.Container {
    const objects: Phaser.GameObjects.GameObject[] = [];
    const panelLeft = 762;
    const panelRight = 1192;
    const panelCenter = (panelLeft + panelRight) / 2;

    const divider = this.add.rectangle(724, 398, 2, 482, 0xf4eedd, 0.13);
    const eyebrow = this.add.text(panelLeft, 168, 'SELECTED WEAPON', {
      fontFamily: UI_FONT_FAMILY,
      fontSize: '13px',
      color: '#fbc02d',
      letterSpacing: 2,
    });
    this.detailIndexText = this.add.text(panelRight, 168, '', {
      fontFamily: UI_FONT_FAMILY,
      fontSize: '13px',
      color: '#6f6c73',
    }).setOrigin(1, 0);
    this.detailNameText = this.add.text(panelLeft, 194, '', {
      fontFamily: UI_FONT_FAMILY,
      fontSize: '39px',
      color: '#f4eedd',
      letterSpacing: 1,
    });
    this.detailCategoryText = this.add.text(panelLeft, 242, '', {
      fontFamily: UI_FONT_FAMILY,
      fontSize: '15px',
      color: '#98949b',
    });
    this.detailStatusText = this.add.text(panelRight, 205, '', {
      fontFamily: UI_FONT_FAMILY,
      fontSize: '12px',
      color: '#fbc02d',
      letterSpacing: 1,
    }).setOrigin(1, 0);

    const imagePlane = this.add.rectangle(panelCenter, 335, panelRight - panelLeft, 142, 0x16161b);
    imagePlane.setStrokeStyle(1, 0xf4eedd, 0.08);
    const crosshair = this.add.graphics();
    crosshair.lineStyle(1, 0xf4eedd, 0.07);
    crosshair.lineBetween(panelLeft + 24, 335, panelRight - 24, 335);
    crosshair.lineBetween(panelCenter, 282, panelCenter, 388);
    crosshair.strokeCircle(panelCenter, 335, 42);
    // 初始纹理只是占位，selectEntry 会立即换成当前条目的真实武器贴图；
    // 这里不能用带标签文字的原始素材表，避免首帧闪出「GLOCK 19」单元格。
    this.previewImage = this.add.image(panelCenter, 335, GAME_WEAPON_TEXTURE_KEYS.pistol);

    const statLabels = ['伤害', '弹匣', '射击', '弹药'];
    const statXs = [panelLeft, panelLeft + 112, panelLeft + 224, panelLeft + 336];
    this.statValues = statLabels.map((label, index) => {
      const labelText = this.add.text(statXs[index], 418, label, {
        fontFamily: UI_FONT_FAMILY,
        fontSize: '12px',
        color: '#6f6c73',
      });
      const valueText = this.add.text(statXs[index], 440, '', {
        fontFamily: UI_FONT_FAMILY,
        fontSize: '21px',
        color: '#f4eedd',
      });
      objects.push(labelText, valueText);
      return valueText;
    });

    const acquisitionRule = this.add.rectangle(panelLeft, 492, panelRight - panelLeft, 2, 0xf4eedd, 0.1).setOrigin(0, 0.5);
    const acquisitionKicker = this.add.text(panelLeft, 510, '获取方式  //  ACQUISITION', {
      fontFamily: UI_FONT_FAMILY,
      fontSize: '12px',
      color: '#77747b',
      letterSpacing: 1,
    });
    this.acquisitionLabelText = this.add.text(panelLeft, 536, '', {
      fontFamily: UI_FONT_FAMILY,
      fontStyle: 'bold',
      fontSize: '18px',
      color: '#fbc02d',
    });
    this.acquisitionText = this.add.text(panelLeft, 566, '', {
      fontFamily: UI_FONT_FAMILY,
      fontSize: '16px',
      color: '#c7c2b9',
      lineSpacing: 6,
      wordWrap: { width: panelRight - panelLeft },
    });
    this.detailNoteText = this.add.text(panelRight, 630, '', {
      fontFamily: UI_FONT_FAMILY,
      fontSize: '11px',
      color: '#5c5960',
      letterSpacing: 1,
    }).setOrigin(1, 0);

    objects.push(
      divider,
      eyebrow,
      this.detailIndexText,
      this.detailNameText,
      this.detailCategoryText,
      this.detailStatusText,
      imagePlane,
      crosshair,
      this.previewImage,
      acquisitionRule,
      acquisitionKicker,
      this.acquisitionLabelText,
      this.acquisitionText,
      this.detailNoteText,
    );
    return this.add.container(0, 0, objects);
  }

  private createFooter(): Phaser.GameObjects.Container {
    const rule = this.add.rectangle(GAME_WIDTH / 2 + 8, 660, GAME_WIDTH - 112, 2, 0xf4eedd, 0.12);
    this.footerHintText = this.add.text(64, 680, '', {
      fontFamily: UI_FONT_FAMILY,
      fontSize: '13px',
      color: '#77747b',
    });
    const back = this.add.text(GAME_WIDTH - 64, 680, 'ESC  返回主菜单', {
      fontFamily: UI_FONT_FAMILY,
      fontSize: '13px',
      color: '#fbc02d',
    }).setOrigin(1, 0);
    return this.add.container(0, 0, [rule, this.footerHintText, back]);
  }

  private selectWeapon(id: string, animate: boolean): void {
    const entryIndex = WEAPON_LIBRARY.findIndex((entry) => entry.id === id);
    const entry = WEAPON_LIBRARY[entryIndex];
    if (!entry) return;

    this.selectedId = entry.id;
    for (const weapon of WEAPON_LIBRARY) this.paintRow(weapon.id);

    const weaponId = entry.art.weaponId;
    const licensed = entry.availability.kind !== 'unavailable' && this.unlockedWeaponIds.has(weaponId);
    const loadoutIndex = this.loadoutWeaponIds.indexOf(weaponId);
    this.detailIndexText.setText(`${String(entryIndex + 1).padStart(2, '0')} / ${String(WEAPON_LIBRARY.length).padStart(2, '0')}`);
    this.detailNameText.setText(entry.name);
    this.detailCategoryText.setText(entry.category);
    this.detailStatusText
      .setText(!licensed
        ? 'LICENSE LOCKED'
        : loadoutIndex === 0
          ? 'SLOT 1 / REQUIRED'
          : loadoutIndex > 0
            ? `SLOT ${loadoutIndex + 1} / DEPLOYED`
            : 'LICENSED / RESERVE')
      .setColor(loadoutIndex >= 0 ? '#58c9dd' : licensed ? '#fbc02d' : '#77747b');

    this.previewImage
      .setTexture(GAME_WEAPON_TEXTURE_KEYS[entry.art.weaponId])
      .setScale(entry.art.scale)
      .setAlpha(licensed ? 1 : 0.48);

    const weapon = getWeaponDefinition(entry);
    const damage = weapon ? `${weapon.damage}${weapon.pellets > 1 ? ` × ${weapon.pellets}` : ''}` : '—';
    const magazine = weapon ? String(weapon.magazineSize) : '—';
    const fireMode = weapon ? (weapon.auto ? '连发' : '点射') : '—';
    const ammo = weapon
      ? ({
          light: '轻型', heavy: '重型', shell: '霰弹', explosive: '爆炸弹', belt: '弹链', fuel: '燃料',
        } as const)[weapon.ammoType]
      : '—';
    [damage, magazine, fireMode, ammo].forEach((value, index) => {
      this.statValues[index]?.setText(value).setColor(licensed ? '#f4eedd' : '#69666d');
    });

    const acquisition = getWeaponAcquisition(entry);
    this.acquisitionLabelText
      .setText(acquisition.label)
      .setColor(licensed ? '#fbc02d' : '#8a878e');
    this.acquisitionText
      .setText(acquisition.lines.join('\n'))
      .setColor(licensed ? '#c7c2b9' : '#77747b');
    this.detailNoteText.setText(!licensed
      ? '战场首次获得后解锁许可'
      : loadoutIndex === 0
        ? '固定出战 · 不可移除'
        : loadoutIndex > 0
          ? '已编入出战编队'
          : '已解锁 · 可编入');

    if (animate) this.animateDetailChange(entry);
  }

  private animateDetailChange(entry: WeaponLibraryEntry): void {
    const detailTargets = [
      this.detailNameText,
      this.detailCategoryText,
      this.acquisitionLabelText,
      this.acquisitionText,
    ];
    this.tweens.killTweensOf(detailTargets);
    this.tweens.killTweensOf(this.previewImage);
    detailTargets.forEach((target) => target.setAlpha(0.45));
    this.tweens.add({
      targets: detailTargets,
      alpha: 1,
      duration: 150,
      ease: 'Cubic.Out',
    });

    const targetScale = entry.art.scale;
    this.previewImage.setScale(targetScale * 0.9);
    this.tweens.add({
      targets: this.previewImage,
      scale: targetScale,
      duration: 190,
      ease: 'Back.Out',
    });
  }

  private paintRow(id: string): void {
    const refs = this.rows.get(id);
    const entry = WEAPON_LIBRARY.find((weapon) => weapon.id === id);
    if (!refs || !entry) return;

    const selected = id === this.selectedId;
    const weaponId = entry.art.weaponId;
    const licensed = entry.availability.kind !== 'unavailable' && this.unlockedWeaponIds.has(weaponId);
    const loadoutIndex = this.loadoutWeaponIds.indexOf(weaponId);
    const deployed = loadoutIndex >= 0;
    refs.box.fillColor = selected ? 0xfbc02d : deployed ? 0x183038 : licensed ? 0x19191f : 0x15151a;
    refs.box.setStrokeStyle(deployed ? 2 : 0, deployed ? 0x58c9dd : 0xf4eedd, deployed ? 0.9 : 0);
    refs.marker.setAlpha(selected ? 1 : 0);
    refs.index.setColor(selected ? '#0f0e13' : licensed ? '#f4eedd' : '#55535a');
    refs.name.setColor(selected ? '#0f0e13' : licensed ? '#f4eedd' : '#77747b');
    refs.category.setColor(selected ? '#494128' : licensed ? '#8e8b92' : '#56545a');
    refs.status
      .setText(!licensed
        ? '未解锁'
        : loadoutIndex === 0
          ? '槽位 1 · 必带'
          : loadoutIndex > 0
            ? `槽位 ${loadoutIndex + 1}`
            : '可编入')
      .setColor(selected ? '#0f0e13' : deployed ? '#58c9dd' : licensed ? '#fbc02d' : '#5f5c63');
  }

  private toggleLoadoutWeapon(entry: WeaponLibraryEntry): void {
    const weaponId = entry.art.weaponId;
    if (entry.availability.kind === 'unavailable' || !this.unlockedWeaponIds.has(weaponId)) {
      this.refreshLoadoutSummary('该武器尚未解锁军械许可');
      SoundManager.play('uiMove');
      return;
    }
    if (weaponId === REQUIRED_LOADOUT_WEAPON_ID) {
      this.refreshLoadoutSummary('沙漠之鹰固定占第 1 槽，不能移出');
      SoundManager.play('uiMove');
      return;
    }

    const currentIndex = this.loadoutWeaponIds.indexOf(weaponId);
    if (currentIndex < 0 && this.loadoutWeaponIds.length >= MAX_WEAPON_LOADOUT_SIZE) {
      this.refreshLoadoutSummary('编队已满，请先移出一把武器');
      SoundManager.play('uiMove');
      return;
    }

    const nextLoadout = currentIndex >= 0
      ? this.loadoutWeaponIds.filter((candidate) => candidate !== weaponId)
      : [...this.loadoutWeaponIds, weaponId];
    this.loadoutWeaponIds = SaveManager.setWeaponLoadout(nextLoadout);
    SoundManager.play('uiConfirm');
    for (const weapon of WEAPON_LIBRARY) this.paintRow(weapon.id);
    this.selectWeapon(entry.id, false);
    this.refreshLoadoutSummary(currentIndex >= 0
      ? `${entry.name} 已移出出战编队`
      : `${entry.name} 已编入第 ${this.loadoutWeaponIds.indexOf(weaponId) + 1} 槽`);
  }

  private refreshLoadoutSummary(message?: string): void {
    this.loadoutCountText?.setText(`LOADOUT  ${this.loadoutWeaponIds.length} / ${MAX_WEAPON_LOADOUT_SIZE}`);
    this.footerHintText?.setText(message ?? '固定槽 01：沙漠之鹰 · 编队容量 5');
  }

  private playEntrance(
    container: Phaser.GameObjects.Container,
    delay: number,
    offsetY: number,
  ): void {
    const targetY = container.y;
    container.setAlpha(0);
    container.y = targetY + offsetY;
    this.tweens.add({
      targets: container,
      alpha: 1,
      y: targetY,
      delay,
      duration: 340,
      ease: 'Cubic.Out',
    });
  }

  private openMainMenu(): void {
    SoundManager.play('uiConfirm');
    this.scene.start(SCENES.mainMenu);
  }
}
