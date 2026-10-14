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
import type { AmmoType } from '../config/types';
import { SCENES } from '../constants';
import { configureHighResolutionScene } from '../systems/DisplayManager';
import { SaveManager } from '../systems/SaveManager';
import { SoundManager } from '../systems/SoundManager';
import { GAME_WEAPON_TEXTURE_KEYS, prepareWeaponAssets } from '../systems/WeaponAssetManager';
import {
  ARCHIVE_FOOTER_HINT_WIDTH,
  createArchiveBackdrop,
  createArchiveDetailFrame,
  createArchiveFooter,
  createArchiveHeader,
  createArchiveIndexHeading,
  createArchiveRow,
  playArchiveEntrance,
} from '../ui/archiveComponents';
import { computeArchiveIndexLayout, resolveArchiveNavigationIndex } from '../ui/archiveLayout';
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
    createArchiveBackdrop(this, 'weapon');

    const header = this.createHeader();
    const index = this.createWeaponIndex();
    const detail = this.createDetailPanel();
    const footer = this.createFooter();

    this.selectWeapon(this.selectedId, false);
    this.refreshLoadoutSummary();
    playArchiveEntrance(this, { header, index, detail, footer });

    this.input.keyboard?.on('keydown', this.handleKeyboardNavigation, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown, this);
  }

  private prepareWeaponTextures(): void {
    prepareWeaponAssets(this);
  }

  private createHeader(): Phaser.GameObjects.Container {
    const header = createArchiveHeader(this, {
      kind: 'weapon',
      kicker: 'FIELD ARMORY  //  WEAPON INDEX',
      title: '武器库',
      subtitle: `军械许可、实战参数与 ${MAX_WEAPON_LOADOUT_SIZE} 槽出战编队`,
      summary: '',
      onBack: () => this.openMainMenu(),
    });
    this.loadoutCountText = header.summary;
    return header.container;
  }

  private createWeaponIndex(): Phaser.GameObjects.Container {
    const objects: Phaser.GameObjects.GameObject[] = createArchiveIndexHeading(
      this, 'weapon', 'WEAPON INDEX', `${WEAPON_LIBRARY.length} 项军械档案`,
    );
    const layout = computeArchiveIndexLayout('weapon', WEAPON_LIBRARY.length);

    WEAPON_LIBRARY.forEach((entry, entryIndex) => {
      const {
        container: row, box, marker, index, name, subtitle: category, status, baseX,
      } = createArchiveRow(this, {
        kind: 'weapon',
        position: layout.positions[entryIndex],
        width: layout.rowWidth,
        height: layout.grid.boxHeight,
        index: String(entryIndex + 1).padStart(2, '0'),
        name: entry.name,
        subtitle: entry.category,
        status: '',
      });

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

    const frame = createArchiveDetailFrame(this, {
      kind: 'weapon',
      panelLeft,
      panelRight,
      preview: { centerX: panelCenter, centerY: 335, width: panelRight - panelLeft, height: 142 },
    });
    this.detailIndexText = frame.index;
    this.detailNameText = frame.name;
    this.detailCategoryText = frame.subtitle;
    this.detailStatusText = frame.status;
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
      ...frame.objects,
      frame.previewPlane,
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
    const footer = createArchiveFooter(this, {
      kind: 'weapon',
      hint: '',
      shortcuts: '↑↓←→/WASD 浏览 · Home/End 首尾 · Enter/空格 编队 · ESC 返回',
    });
    this.footerHintText = footer.hint;
    return footer.container;
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
    // 扇形武器（喷火器）不发射弹丸，伤害栏改成每秒火焰伤害。
    const damage = weapon
      ? weapon.coneAttack
        ? `${Math.round(weapon.coneAttack.damagePerSecond)}/秒`
        : `${weapon.damage}${weapon.pellets > 1 ? ` × ${weapon.pellets}` : ''}`
      : '—';
    const magazine = weapon ? String(weapon.magazineSize) : '—';
    const fireMode = weapon ? (weapon.auto ? '连发' : '点射') : '—';
    const ammo = weapon
      ? ({
          light: '轻型', heavy: '重型', shell: '霰弹', explosive: '爆炸弹', belt: '弹链', fuel: '燃料',
          energy: '能量',
        } as const satisfies Record<AmmoType, string>)[weapon.ammoType]
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
    if (this.footerHintText) {
      this.footerHintText.setText(message ?? `固定槽 01：沙漠之鹰 · 编队容量 ${MAX_WEAPON_LOADOUT_SIZE}`);
      fitTextWidth(this.footerHintText, ARCHIVE_FOOTER_HINT_WIDTH);
    }
  }

  private handleKeyboardNavigation(event: KeyboardEvent): void {
    if (event.code === 'Escape') {
      event.preventDefault();
      this.openMainMenu();
      return;
    }

    const currentIndex = WEAPON_LIBRARY.findIndex((entry) => entry.id === this.selectedId);
    if (event.code === 'Enter' || event.code === 'NumpadEnter' || event.code === 'Space') {
      event.preventDefault();
      // 长按确认键不能反复编入/移出；鼠标和键盘都复用原有许可与编队校验。
      if (event.repeat) return;
      const entry = WEAPON_LIBRARY[currentIndex];
      if (entry) this.toggleLoadoutWeapon(entry);
      return;
    }

    const nextIndex = resolveArchiveNavigationIndex('weapon', event.code, currentIndex, WEAPON_LIBRARY.length);
    if (nextIndex === null) return;
    event.preventDefault();
    const nextEntry = WEAPON_LIBRARY[nextIndex];
    if (nextEntry) this.selectWeapon(nextEntry.id, true);
  }

  private openMainMenu(): void {
    SoundManager.play('uiConfirm');
    this.scene.start(SCENES.mainMenu);
  }

  private handleShutdown(): void {
    this.input.keyboard?.off('keydown', this.handleKeyboardNavigation, this);
  }
}
