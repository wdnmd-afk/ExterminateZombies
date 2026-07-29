import Phaser from 'phaser';
import {
  getWeaponAcquisition,
  getWeaponDefinition,
  WEAPON_LIBRARY,
  WEAPON_TEXTURE_KEYS,
  type WeaponLibraryEntry,
} from '../config/weaponLibrary';
import { GAME_HEIGHT, GAME_WIDTH, SCENES } from '../constants';
import { configureHighResolutionScene } from '../systems/DisplayManager';

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

const DESERT_EAGLE_FRAME = 'desert-eagle';

export class WeaponLibraryScene extends Phaser.Scene {
  private selectedId = WEAPON_LIBRARY[0]?.id ?? '';
  private rows = new Map<string, WeaponRowRefs>();

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
    this.rows.clear();
    this.prepareWeaponTextures();
    this.createBackdrop();

    const header = this.createHeader();
    const index = this.createWeaponIndex();
    const detail = this.createDetailPanel();
    const footer = this.createFooter();

    this.selectWeapon(this.selectedId, false);
    this.playEntrance(header, 40, 12);
    this.playEntrance(index, 110, 16);
    this.playEntrance(detail, 180, 16);
    this.playEntrance(footer, 260, 8);

    this.input.keyboard?.once('keydown-ESC', this.openMainMenu, this);
  }

  private prepareWeaponTextures(): void {
    const gunTexture = this.textures.get(WEAPON_TEXTURE_KEYS.guns);
    const desertEagleTexture = this.textures.get(WEAPON_TEXTURE_KEYS.desertEagle);
    gunTexture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    desertEagleTexture.setFilter(Phaser.Textures.FilterMode.NEAREST);

    const desertEagle = WEAPON_LIBRARY.find((entry) => entry.id === 'desert_eagle');
    if (desertEagle?.art.kind === 'crop' && !desertEagleTexture.has(DESERT_EAGLE_FRAME)) {
      const { x, y, width, height } = desertEagle.art.crop;
      desertEagleTexture.add(DESERT_EAGLE_FRAME, 0, x, y, width, height);
    }
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
      fontFamily: 'Impact, "Arial Black", sans-serif',
      fontSize: '17px',
      color: '#f4eedd',
      letterSpacing: 5,
    }).setOrigin(0.5).setRotation(Math.PI / 2).setAlpha(0.15);
  }

  private createHeader(): Phaser.GameObjects.Container {
    const objects: Phaser.GameObjects.GameObject[] = [];
    const activeCount = WEAPON_LIBRARY.filter((entry) => entry.availability.kind !== 'unavailable').length;
    const reserveCount = WEAPON_LIBRARY.length - activeCount;

    const kicker = this.add.text(64, 28, 'FIELD ARMORY  //  WEAPON INDEX', {
      fontFamily: 'Consolas, monospace',
      fontSize: '14px',
      color: '#fbc02d',
      letterSpacing: 2,
    });
    const title = this.add.text(62, 48, '武器库', {
      fontFamily: '"Microsoft YaHei", "Arial Black", sans-serif',
      fontStyle: 'bold',
      fontSize: '56px',
      color: '#f4eedd',
      stroke: '#0f0e13',
      strokeThickness: 4,
    });
    const subtitle = this.add.text(66, 112, '悬停查看武器参数与真实获取方式', {
      fontFamily: '"Microsoft YaHei", sans-serif',
      fontSize: '16px',
      color: '#98949b',
    });
    const count = this.add.text(1052, 44, [
      `${String(activeCount).padStart(2, '0')}  IN SERVICE`,
      `${String(reserveCount).padStart(2, '0')}  RESERVE`,
    ].join('\n'), {
      fontFamily: 'Consolas, monospace',
      fontSize: '13px',
      color: '#8f8b92',
      align: 'right',
      lineSpacing: 4,
    }).setOrigin(1, 0);

    const backBox = this.add.rectangle(1150, 76, 130, 42, 0x1c1c22)
      .setStrokeStyle(2, 0xf4eedd, 0.2)
      .setInteractive({ useHandCursor: true });
    const backLabel = this.add.text(1150, 76, '←  返回', {
      fontFamily: '"Microsoft YaHei", sans-serif',
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
    objects.push(kicker, title, subtitle, count, backBox, backLabel, rule);
    return this.add.container(0, 0, objects);
  }

  private createWeaponIndex(): Phaser.GameObjects.Container {
    const objects: Phaser.GameObjects.GameObject[] = [];
    const startX = 64;
    const rowWidth = 626;
    const baseX = startX + rowWidth / 2;
    const firstY = 223;
    const rowStep = 55;

    const heading = this.add.text(startX, 168, 'WEAPON INDEX', {
      fontFamily: 'Impact, "Arial Black", sans-serif',
      fontSize: '22px',
      color: '#f4eedd',
      letterSpacing: 1,
    });
    const hint = this.add.text(startX + rowWidth, 174, `${WEAPON_LIBRARY.length} 项军械档案`, {
      fontFamily: '"Microsoft YaHei", sans-serif',
      fontSize: '13px',
      color: '#69666d',
    }).setOrigin(1, 0);
    objects.push(heading, hint);

    WEAPON_LIBRARY.forEach((entry, entryIndex) => {
      const y = firstY + entryIndex * rowStep;
      const box = this.add.rectangle(0, 0, rowWidth, 48, 0x19191f);
      const marker = this.add.rectangle(-rowWidth / 2, 0, 6, 48, 0xfbc02d).setOrigin(0, 0.5);
      const index = this.add.text(-rowWidth / 2 + 22, 0, String(entryIndex + 1).padStart(2, '0'), {
        fontFamily: 'Impact, "Arial Black", sans-serif',
        fontSize: '22px',
        color: '#f4eedd',
      }).setOrigin(0, 0.5);
      const name = this.add.text(-rowWidth / 2 + 72, -1, entry.name, {
        fontFamily: 'Impact, "Arial Black", sans-serif',
        fontSize: '21px',
        color: '#f4eedd',
        letterSpacing: 1,
      }).setOrigin(0, 0.5);
      const category = this.add.text(84, 0, entry.category, {
        fontFamily: '"Microsoft YaHei", sans-serif',
        fontSize: '13px',
        color: '#8e8b92',
      }).setOrigin(0, 0.5);
      const status = this.add.text(rowWidth / 2 - 20, 0, '', {
        fontFamily: 'Consolas, monospace',
        fontSize: '12px',
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
        });
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
      fontFamily: 'Consolas, monospace',
      fontSize: '13px',
      color: '#fbc02d',
      letterSpacing: 2,
    });
    this.detailIndexText = this.add.text(panelRight, 168, '', {
      fontFamily: 'Consolas, monospace',
      fontSize: '13px',
      color: '#6f6c73',
    }).setOrigin(1, 0);
    this.detailNameText = this.add.text(panelLeft, 194, '', {
      fontFamily: 'Impact, "Arial Black", sans-serif',
      fontSize: '39px',
      color: '#f4eedd',
      letterSpacing: 1,
    });
    this.detailCategoryText = this.add.text(panelLeft, 242, '', {
      fontFamily: '"Microsoft YaHei", sans-serif',
      fontSize: '15px',
      color: '#98949b',
    });
    this.detailStatusText = this.add.text(panelRight, 205, '', {
      fontFamily: 'Consolas, monospace',
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
    this.previewImage = this.add.image(panelCenter, 335, WEAPON_TEXTURE_KEYS.guns, 0);

    const statLabels = ['伤害', '弹匣', '射击', '弹药'];
    const statXs = [panelLeft, panelLeft + 112, panelLeft + 224, panelLeft + 336];
    this.statValues = statLabels.map((label, index) => {
      const labelText = this.add.text(statXs[index], 418, label, {
        fontFamily: '"Microsoft YaHei", sans-serif',
        fontSize: '12px',
        color: '#6f6c73',
      });
      const valueText = this.add.text(statXs[index], 440, '', {
        fontFamily: 'Impact, "Arial Black", sans-serif',
        fontSize: '21px',
        color: '#f4eedd',
      });
      objects.push(labelText, valueText);
      return valueText;
    });

    const acquisitionRule = this.add.rectangle(panelLeft, 492, panelRight - panelLeft, 2, 0xf4eedd, 0.1).setOrigin(0, 0.5);
    const acquisitionKicker = this.add.text(panelLeft, 510, '获取方式  //  ACQUISITION', {
      fontFamily: 'Consolas, monospace',
      fontSize: '12px',
      color: '#77747b',
      letterSpacing: 1,
    });
    this.acquisitionLabelText = this.add.text(panelLeft, 536, '', {
      fontFamily: '"Microsoft YaHei", sans-serif',
      fontStyle: 'bold',
      fontSize: '18px',
      color: '#fbc02d',
    });
    this.acquisitionText = this.add.text(panelLeft, 566, '', {
      fontFamily: '"Microsoft YaHei", sans-serif',
      fontSize: '16px',
      color: '#c7c2b9',
      lineSpacing: 6,
      wordWrap: { width: panelRight - panelLeft },
    });
    this.detailNoteText = this.add.text(panelRight, 630, '', {
      fontFamily: 'Consolas, monospace',
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
    const hint = this.add.text(64, 680, '移动鼠标查看军械档案与获取方式', {
      fontFamily: '"Microsoft YaHei", sans-serif',
      fontSize: '13px',
      color: '#77747b',
    });
    const back = this.add.text(GAME_WIDTH - 64, 680, 'ESC  返回主菜单', {
      fontFamily: 'Consolas, monospace',
      fontSize: '13px',
      color: '#fbc02d',
    }).setOrigin(1, 0);
    return this.add.container(0, 0, [rule, hint, back]);
  }

  private selectWeapon(id: string, animate: boolean): void {
    const entryIndex = WEAPON_LIBRARY.findIndex((entry) => entry.id === id);
    const entry = WEAPON_LIBRARY[entryIndex];
    if (!entry) return;

    this.selectedId = entry.id;
    for (const weapon of WEAPON_LIBRARY) this.paintRow(weapon.id);

    const available = entry.availability.kind !== 'unavailable';
    this.detailIndexText.setText(`${String(entryIndex + 1).padStart(2, '0')} / ${String(WEAPON_LIBRARY.length).padStart(2, '0')}`);
    this.detailNameText.setText(entry.name);
    this.detailCategoryText.setText(entry.category);
    this.detailStatusText
      .setText(available ? 'IN SERVICE' : 'RESERVE / LOCKED')
      .setColor(available ? '#fbc02d' : '#77747b');

    const previewFrame = entry.art.kind === 'frame' ? entry.art.frame : DESERT_EAGLE_FRAME;
    this.previewImage
      .setTexture(entry.art.textureKey, previewFrame)
      .setScale(entry.art.scale)
      .setAlpha(available ? 1 : 0.48);

    const weapon = getWeaponDefinition(entry);
    const damage = weapon ? `${weapon.damage}${weapon.pellets > 1 ? ` × ${weapon.pellets}` : ''}` : '—';
    const magazine = weapon ? String(weapon.magazineSize) : '—';
    const fireMode = weapon ? (weapon.auto ? '连发' : '点射') : '—';
    const ammo = weapon
      ? ({ light: '轻型', heavy: '重型', shell: '霰弹' } as const)[weapon.ammoType]
      : '—';
    [damage, magazine, fireMode, ammo].forEach((value, index) => {
      this.statValues[index]?.setText(value).setColor(available ? '#f4eedd' : '#69666d');
    });

    const acquisition = getWeaponAcquisition(entry);
    this.acquisitionLabelText
      .setText(acquisition.label)
      .setColor(available ? '#fbc02d' : '#8a878e');
    this.acquisitionText
      .setText(acquisition.lines.join('\n'))
      .setColor(available ? '#c7c2b9' : '#77747b');
    this.detailNoteText.setText(available ? 'LIVE GAMEPLAY DATA' : 'NOT YET IN DROP TABLE');

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
    const available = entry.availability.kind !== 'unavailable';
    refs.box.fillColor = selected ? 0xfbc02d : available ? 0x19191f : 0x15151a;
    refs.marker.setAlpha(selected ? 1 : 0);
    refs.index.setColor(selected ? '#0f0e13' : available ? '#f4eedd' : '#55535a');
    refs.name.setColor(selected ? '#0f0e13' : available ? '#f4eedd' : '#77747b');
    refs.category.setColor(selected ? '#494128' : available ? '#8e8b92' : '#56545a');
    refs.status
      .setText(available ? 'IN SERVICE' : 'RESERVE')
      .setColor(selected ? '#0f0e13' : available ? '#fbc02d' : '#5f5c63');
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
    this.scene.start(SCENES.mainMenu);
  }
}
