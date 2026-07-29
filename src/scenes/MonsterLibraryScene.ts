import Phaser from 'phaser';
import {
  getMonsterDeathHazard,
  getMonsterDefinition,
  getMonsterDropLines,
  getMonsterEncounterNames,
  MONSTER_LIBRARY,
  type MonsterLibraryEntry,
} from '../config/monsterLibrary';
import type { ZombieId } from '../config/zombies';
import { GAME_HEIGHT, GAME_WIDTH, SCENES } from '../constants';
import { configureHighResolutionScene } from '../systems/DisplayManager';
import { getZombieAnimationKey, getZombieVisual } from '../systems/GameAssetManager';

interface MonsterRowRefs {
  container: Phaser.GameObjects.Container;
  box: Phaser.GameObjects.Rectangle;
  marker: Phaser.GameObjects.Rectangle;
  index: Phaser.GameObjects.Text;
  name: Phaser.GameObjects.Text;
  role: Phaser.GameObjects.Text;
  threat: Phaser.GameObjects.Text;
  baseX: number;
}

const PREVIEW_X = 846;
const PREVIEW_Y = 378;
const PREVIEW_SCALE = 2.2;
const MONSTER_ROWS_PER_COLUMN = Math.ceil(MONSTER_LIBRARY.length / 2);

export class MonsterLibraryScene extends Phaser.Scene {
  private selectedId: ZombieId = MONSTER_LIBRARY[0]?.id ?? 'walker';
  private rows = new Map<ZombieId, MonsterRowRefs>();

  private detailIndexText!: Phaser.GameObjects.Text;
  private detailNameText!: Phaser.GameObjects.Text;
  private detailMetaText!: Phaser.GameObjects.Text;
  private detailThreatText!: Phaser.GameObjects.Text;
  private detailSummaryText!: Phaser.GameObjects.Text;
  private previewShadow!: Phaser.GameObjects.Ellipse;
  private previewSprite!: Phaser.GameObjects.Sprite;
  private statValues: Phaser.GameObjects.Text[] = [];
  private hazardText!: Phaser.GameObjects.Text;
  private encounterText!: Phaser.GameObjects.Text;
  private dropText!: Phaser.GameObjects.Text;
  private tacticText!: Phaser.GameObjects.Text;

  constructor() {
    super(SCENES.monsterLibrary);
  }

  create(): void {
    configureHighResolutionScene(this);
    this.rows.clear();
    this.statValues = [];

    this.createBackdrop();
    const header = this.createHeader();
    const index = this.createMonsterIndex();
    const detail = this.createDetailPanel();
    const footer = this.createFooter();

    this.selectMonster(this.selectedId, false);
    this.playEntrance(header, 40, 12);
    this.playEntrance(index, 110, 16);
    this.playEntrance(detail, 180, 16);
    this.playEntrance(footer, 260, 8);

    this.input.keyboard?.on('keydown', this.handleKeyboardNavigation, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown, this);
  }

  private createBackdrop(): void {
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x101014);
    this.add.rectangle(8, GAME_HEIGHT / 2, 16, GAME_HEIGHT, 0xd32f2f);

    const grid = this.add.graphics();
    grid.lineStyle(1, 0xf4eedd, 0.03);
    for (let x = 32; x <= GAME_WIDTH; x += 48) {
      grid.lineBetween(x, 0, x, GAME_HEIGHT);
    }
    for (let y = 0; y <= GAME_HEIGHT; y += 48) {
      grid.lineBetween(16, y, GAME_WIDTH, y);
    }

    const alertPlane = this.add.graphics();
    alertPlane.fillStyle(0xd32f2f, 0.07);
    alertPlane.fillTriangle(1008, 0, GAME_WIDTH, 0, GAME_WIDTH, 202);
    alertPlane.lineStyle(8, 0xd32f2f, 0.05);
    for (let offset = 0; offset < 240; offset += 30) {
      alertPlane.lineBetween(1090 + offset, 0, GAME_WIDTH, 170 - offset);
    }

    this.add.text(GAME_WIDTH - 18, GAME_HEIGHT / 2, 'INFECTED', {
      fontFamily: 'Impact, "Arial Black", sans-serif',
      fontSize: '17px',
      color: '#f4eedd',
      letterSpacing: 5,
    }).setOrigin(0.5).setRotation(Math.PI / 2).setAlpha(0.15);
  }

  private createHeader(): Phaser.GameObjects.Container {
    const objects: Phaser.GameObjects.GameObject[] = [];
    const apexCount = MONSTER_LIBRARY.filter((entry) => entry.id.endsWith('_boss')).length;

    const kicker = this.add.text(64, 28, 'FIELD ARCHIVE  //  INFECTED SPECIMENS', {
      fontFamily: 'Consolas, monospace',
      fontSize: '14px',
      color: '#fbc02d',
      letterSpacing: 2,
    });
    const title = this.add.text(62, 48, '怪物图鉴', {
      fontFamily: '"Microsoft YaHei", "Arial Black", sans-serif',
      fontStyle: 'bold',
      fontSize: '56px',
      color: '#f4eedd',
      stroke: '#0f0e13',
      strokeThickness: 4,
    });
    const subtitle = this.add.text(66, 112, '感染体行为、战斗参数与战术处置档案', {
      fontFamily: '"Microsoft YaHei", sans-serif',
      fontSize: '16px',
      color: '#98949b',
    });
    const count = this.add.text(1052, 44, [
      `${String(MONSTER_LIBRARY.length).padStart(2, '0')}  SPECIMENS`,
      `${String(apexCount).padStart(2, '0')}  APEX CLASS`,
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

  private createMonsterIndex(): Phaser.GameObjects.Container {
    const objects: Phaser.GameObjects.GameObject[] = [];
    const startX = 64;
    const rowWidth = 294;
    const columnGap = 310;
    const firstY = 215;
    const rowStep = 55;

    const heading = this.add.text(startX, 168, 'INFECTED INDEX', {
      fontFamily: 'Impact, "Arial Black", sans-serif',
      fontSize: '22px',
      color: '#f4eedd',
      letterSpacing: 1,
    });
    const hint = this.add.text(startX + rowWidth * 2 + 16, 174, `${MONSTER_LIBRARY.length} 项感染体档案`, {
      fontFamily: '"Microsoft YaHei", sans-serif',
      fontSize: '13px',
      color: '#69666d',
    }).setOrigin(1, 0);
    objects.push(heading, hint);

    MONSTER_LIBRARY.forEach((entry, rowIndex) => {
      const definition = getMonsterDefinition(entry);
      const column = Math.floor(rowIndex / MONSTER_ROWS_PER_COLUMN);
      const row = rowIndex % MONSTER_ROWS_PER_COLUMN;
      const baseX = startX + column * columnGap + rowWidth / 2;
      const y = firstY + row * rowStep;
      const box = this.add.rectangle(0, 0, rowWidth, 48, 0x19191f);
      const marker = this.add.rectangle(-rowWidth / 2, 0, 5, 48, 0xfbc02d).setOrigin(0, 0.5);
      const index = this.add.text(-rowWidth / 2 + 17, -10, entry.dossierCode, {
        fontFamily: 'Consolas, monospace',
        fontStyle: 'bold',
        fontSize: '11px',
        color: '#f4eedd',
      }).setOrigin(0, 0.5);
      const name = this.add.text(-rowWidth / 2 + 84, -10, definition.name, {
        fontFamily: '"Microsoft YaHei", sans-serif',
        fontStyle: 'bold',
        fontSize: '16px',
        color: '#f4eedd',
      }).setOrigin(0, 0.5);
      const role = this.add.text(-rowWidth / 2 + 17, 12, entry.role, {
        fontFamily: '"Microsoft YaHei", sans-serif',
        fontSize: '11px',
        color: '#8e8b92',
      }).setOrigin(0, 0.5);
      const threat = this.add.text(rowWidth / 2 - 16, 12, `T-${entry.threat}`, {
        fontFamily: 'Consolas, monospace',
        fontStyle: 'bold',
        fontSize: '11px',
        color: '#fbc02d',
      }).setOrigin(1, 0.5);
      const rowContainer = this.add.container(baseX, y, [box, marker, index, name, role, threat]);

      this.rows.set(entry.id, {
        container: rowContainer,
        box,
        marker,
        index,
        name,
        role,
        threat,
        baseX,
      });
      objects.push(rowContainer);

      box.setInteractive({ useHandCursor: true })
        .on('pointerover', () => this.selectMonster(entry.id, true))
        .on('pointerup', () => this.selectMonster(entry.id, true))
        .on('pointerout', () => this.settleRows());
    });

    return this.add.container(0, 0, objects);
  }

  private createDetailPanel(): Phaser.GameObjects.Container {
    const objects: Phaser.GameObjects.GameObject[] = [];
    const panelLeft = 746;
    const panelRight = 1216;

    const divider = this.add.rectangle(708, 409, 2, 500, 0xf4eedd, 0.13);
    const eyebrow = this.add.text(panelLeft, 168, 'ACTIVE DOSSIER', {
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
    this.detailNameText = this.add.text(panelLeft, 193, '', {
      fontFamily: '"Microsoft YaHei", "Arial Black", sans-serif',
      fontStyle: 'bold',
      fontSize: '38px',
      color: '#f4eedd',
    });
    this.detailMetaText = this.add.text(panelLeft, 241, '', {
      fontFamily: 'Consolas, monospace',
      fontSize: '13px',
      color: '#98949b',
      letterSpacing: 1,
    });
    this.detailThreatText = this.add.text(panelRight, 242, '', {
      fontFamily: 'Consolas, monospace',
      fontStyle: 'bold',
      fontSize: '12px',
      color: '#d32f2f',
      letterSpacing: 1,
    }).setOrigin(1, 0);
    this.detailSummaryText = this.add.text(panelLeft, 267, '', {
      fontFamily: '"Microsoft YaHei", sans-serif',
      fontSize: '14px',
      color: '#aaa6ad',
      wordWrap: { width: panelRight - panelLeft, useAdvancedWrap: true },
    });

    const previewPlane = this.add.rectangle(PREVIEW_X, PREVIEW_Y, 204, 170, 0x16161b)
      .setStrokeStyle(1, 0xf4eedd, 0.08);
    const crosshair = this.add.graphics();
    crosshair.lineStyle(1, 0xf4eedd, 0.07);
    crosshair.lineBetween(PREVIEW_X - 78, PREVIEW_Y, PREVIEW_X + 78, PREVIEW_Y);
    crosshair.lineBetween(PREVIEW_X, PREVIEW_Y - 64, PREVIEW_X, PREVIEW_Y + 64);
    crosshair.strokeCircle(PREVIEW_X, PREVIEW_Y, 48);
    this.previewShadow = this.add.ellipse(PREVIEW_X, PREVIEW_Y + 55, 68, 18, 0x000000, 0.34);

    const initialVisual = getZombieVisual(this.selectedId);
    this.previewSprite = this.add.sprite(PREVIEW_X, PREVIEW_Y, initialVisual.textureKey);
    this.previewSprite.setOrigin(0.5, initialVisual.originY);

    const statLayout = [
      { x: 980, y: 300, label: '生命  //  HEALTH' },
      { x: 1100, y: 300, label: '移速  //  SPEED' },
      { x: 980, y: 356, label: '伤害  //  DAMAGE' },
      { x: 1100, y: 356, label: '间隔  //  RATE' },
      { x: 980, y: 412, label: '击杀分  //  SCORE' },
      { x: 1100, y: 412, label: '威胁  //  CLASS' },
    ];
    this.statValues = statLayout.map(({ x, y, label }) => {
      const labelText = this.add.text(x, y, label, {
        fontFamily: 'Consolas, monospace',
        fontSize: '10px',
        color: '#6f6c73',
      });
      const valueText = this.add.text(x, y + 18, '', {
        fontFamily: 'Impact, "Arial Black", sans-serif',
        fontSize: '20px',
        color: '#f4eedd',
      });
      objects.push(labelText, valueText);
      return valueText;
    });

    this.hazardText = this.add.text(panelLeft, 466, '', {
      fontFamily: '"Microsoft YaHei", sans-serif',
      fontSize: '14px',
      color: '#8f8b92',
    });
    const archiveRule = this.add.rectangle(panelLeft, 495, panelRight - panelLeft, 2, 0xf4eedd, 0.1).setOrigin(0, 0.5);
    const encounterLabel = this.add.text(panelLeft, 508, '出现关卡  //  ENCOUNTERS', {
      fontFamily: 'Consolas, monospace',
      fontSize: '11px',
      color: '#77747b',
      letterSpacing: 1,
    });
    this.encounterText = this.add.text(panelLeft, 530, '', {
      fontFamily: '"Microsoft YaHei", sans-serif',
      fontSize: '14px',
      color: '#c7c2b9',
      lineSpacing: 3,
      wordWrap: { width: 218, useAdvancedWrap: true },
    });
    const dropLabel = this.add.text(982, 508, '掉落记录  //  DROPS', {
      fontFamily: 'Consolas, monospace',
      fontSize: '11px',
      color: '#77747b',
      letterSpacing: 1,
    });
    this.dropText = this.add.text(982, 530, '', {
      fontFamily: '"Microsoft YaHei", sans-serif',
      fontSize: '14px',
      color: '#c7c2b9',
      lineSpacing: 3,
      wordWrap: { width: 234, useAdvancedWrap: true },
    });

    const tacticRule = this.add.rectangle(panelLeft, 598, panelRight - panelLeft, 2, 0xf4eedd, 0.1).setOrigin(0, 0.5);
    const tacticLabel = this.add.text(panelLeft, 611, '处置建议  //  RESPONSE', {
      fontFamily: 'Consolas, monospace',
      fontSize: '11px',
      color: '#77747b',
      letterSpacing: 1,
    });
    this.tacticText = this.add.text(panelLeft, 631, '', {
      fontFamily: '"Microsoft YaHei", sans-serif',
      fontSize: '14px',
      color: '#f4eedd',
      lineSpacing: 3,
      wordWrap: { width: panelRight - panelLeft, useAdvancedWrap: true },
    });

    objects.push(
      divider,
      eyebrow,
      this.detailIndexText,
      this.detailNameText,
      this.detailMetaText,
      this.detailThreatText,
      this.detailSummaryText,
      previewPlane,
      crosshair,
      this.previewShadow,
      this.previewSprite,
      this.hazardText,
      archiveRule,
      encounterLabel,
      this.encounterText,
      dropLabel,
      this.dropText,
      tacticRule,
      tacticLabel,
      this.tacticText,
    );
    return this.add.container(0, 0, objects);
  }

  private createFooter(): Phaser.GameObjects.Container {
    const rule = this.add.rectangle(GAME_WIDTH / 2 + 8, 674, GAME_WIDTH - 112, 2, 0xf4eedd, 0.12);
    const source = this.add.text(64, 690, '配置来源  ZOMBIES / LEVELS / DROP TABLE', {
      fontFamily: 'Consolas, monospace',
      fontSize: '12px',
      color: '#77747b',
    });
    const status = this.add.text(
      GAME_WIDTH - 64,
      690,
      `LIVE GAMEPLAY DATA  //  ${String(MONSTER_LIBRARY.length).padStart(2, '0')}/${String(MONSTER_LIBRARY.length).padStart(2, '0')}`,
      {
        fontFamily: 'Consolas, monospace',
        fontSize: '12px',
        color: '#fbc02d',
      },
    ).setOrigin(1, 0);
    return this.add.container(0, 0, [rule, source, status]);
  }

  private selectMonster(id: ZombieId, animate: boolean): void {
    const entryIndex = MONSTER_LIBRARY.findIndex((entry) => entry.id === id);
    const entry = MONSTER_LIBRARY[entryIndex];
    if (!entry) return;
    const shouldAnimate = animate && this.selectedId !== entry.id;

    const definition = getMonsterDefinition(entry);
    const visual = getZombieVisual(entry.id);
    const encounters = getMonsterEncounterNames(entry.id);
    const dropLines = getMonsterDropLines(entry.id);
    const deathHazard = getMonsterDeathHazard(entry.id);

    this.selectedId = entry.id;
    for (const monster of MONSTER_LIBRARY) this.paintRow(monster);
    this.settleRows();

    this.detailIndexText.setText(
      `${String(entryIndex + 1).padStart(2, '0')} / ${String(MONSTER_LIBRARY.length).padStart(2, '0')}`,
    );
    this.detailNameText.setText(definition.name);
    this.detailMetaText.setText(`${entry.dossierCode}  //  ${entry.role}`);
    this.detailThreatText
      .setText(`THREAT LEVEL  ${String(entry.threat).padStart(2, '0')}`)
      .setColor(entry.threat >= 4 ? '#ef5b45' : '#fbc02d');
    this.detailSummaryText.setText(entry.summary);

    const statValues = [
      String(definition.health),
      `${definition.speed} px/s`,
      String(definition.damage),
      `${definition.attackRate} ms`,
      `+${definition.scoreValue}`,
      `T-${entry.threat}`,
    ];
    statValues.forEach((value, index) => this.statValues[index]?.setText(value));

    this.hazardText
      .setText(`死亡状态  //  ${deathHazard}`)
      .setColor(definition.explodeOnDeath ? '#ef725f' : '#8f8b92');
    this.encounterText.setText(encounters.length > 0 ? encounters.join('\n') : '未进入固定关卡配置');
    this.dropText.setText(dropLines.join('\n'));
    this.tacticText.setText(entry.tactic);

    this.previewSprite
      .stop()
      .setTexture(visual.textureKey)
      .setOrigin(0.5, visual.originY)
      .setRotation(0)
      .setTint(visual.tint)
      .play(getZombieAnimationKey(entry.id, 'down'));
    const animationFrameRate = this.previewSprite.anims.currentAnim?.frameRate ?? visual.frameRate;
    this.previewSprite.anims.timeScale = visual.frameRate / animationFrameRate;
    const previewScale = visual.scale * PREVIEW_SCALE;
    this.previewShadow
      .setY(PREVIEW_Y + Math.min(58, 14 * previewScale))
      .setDisplaySize(Math.max(58, definition.radius * 3.2), 18);

    if (shouldAnimate) {
      this.animateDetailChange(entry);
    } else {
      this.previewSprite.setPosition(PREVIEW_X, PREVIEW_Y).setScale(previewScale).setAlpha(1);
      this.previewShadow.setAlpha(0.34);
    }
  }

  private animateDetailChange(entry: MonsterLibraryEntry): void {
    const detailTargets = [
      this.detailNameText,
      this.detailMetaText,
      this.detailSummaryText,
      this.hazardText,
      this.encounterText,
      this.dropText,
      this.tacticText,
      ...this.statValues,
    ];
    const targetScale = getZombieVisual(entry.id).scale * PREVIEW_SCALE;

    this.tweens.killTweensOf(detailTargets);
    this.tweens.killTweensOf([this.previewSprite, this.previewShadow]);
    detailTargets.forEach((target) => target.setAlpha(0.42));
    this.tweens.add({
      targets: detailTargets,
      alpha: 1,
      duration: 150,
      ease: 'Cubic.Out',
    });

    this.previewSprite
      .setPosition(PREVIEW_X - 8, PREVIEW_Y)
      .setScale(targetScale * 0.8)
      .setAlpha(0.18);
    this.previewShadow.setAlpha(0.08);
    this.tweens.add({
      targets: this.previewSprite,
      x: PREVIEW_X,
      scaleX: targetScale,
      scaleY: targetScale,
      alpha: 1,
      duration: 210,
      ease: 'Back.Out',
    });
    this.tweens.add({
      targets: this.previewShadow,
      alpha: 0.34,
      duration: 180,
      ease: 'Cubic.Out',
    });
  }

  private paintRow(entry: MonsterLibraryEntry): void {
    const refs = this.rows.get(entry.id);
    if (!refs) return;

    const selected = entry.id === this.selectedId;
    refs.box.fillColor = selected ? 0xfbc02d : 0x19191f;
    refs.marker.setAlpha(selected ? 1 : 0);
    refs.index.setColor(selected ? '#0f0e13' : '#aaa6ad');
    refs.name.setColor(selected ? '#0f0e13' : '#f4eedd');
    refs.role.setColor(selected ? '#494128' : '#8e8b92');
    refs.threat.setColor(selected ? '#0f0e13' : entry.threat >= 4 ? '#ef5b45' : '#fbc02d');
  }

  private settleRows(): void {
    for (const entry of MONSTER_LIBRARY) {
      const refs = this.rows.get(entry.id);
      if (!refs) continue;
      this.tweens.killTweensOf(refs.container);
      this.tweens.add({
        targets: refs.container,
        x: refs.baseX + (entry.id === this.selectedId ? 6 : 0),
        duration: 100,
        ease: 'Cubic.Out',
      });
    }
  }

  private handleKeyboardNavigation(event: KeyboardEvent): void {
    if (event.keyCode === Phaser.Input.Keyboard.KeyCodes.ESC) {
      this.openMainMenu();
      return;
    }

    if (
      event.keyCode === Phaser.Input.Keyboard.KeyCodes.UP
      || event.keyCode === Phaser.Input.Keyboard.KeyCodes.W
    ) {
      event.preventDefault();
      this.selectRelative(-1);
    } else if (
      event.keyCode === Phaser.Input.Keyboard.KeyCodes.DOWN
      || event.keyCode === Phaser.Input.Keyboard.KeyCodes.S
    ) {
      event.preventDefault();
      this.selectRelative(1);
    } else if (
      event.keyCode === Phaser.Input.Keyboard.KeyCodes.LEFT
      || event.keyCode === Phaser.Input.Keyboard.KeyCodes.A
    ) {
      event.preventDefault();
      this.selectRelative(-MONSTER_ROWS_PER_COLUMN);
    } else if (
      event.keyCode === Phaser.Input.Keyboard.KeyCodes.RIGHT
      || event.keyCode === Phaser.Input.Keyboard.KeyCodes.D
    ) {
      event.preventDefault();
      this.selectRelative(MONSTER_ROWS_PER_COLUMN);
    }
  }

  private selectRelative(offset: number): void {
    const currentIndex = MONSTER_LIBRARY.findIndex((entry) => entry.id === this.selectedId);
    const nextIndex = Phaser.Math.Wrap(currentIndex + offset, 0, MONSTER_LIBRARY.length);
    const nextEntry = MONSTER_LIBRARY[nextIndex];
    if (nextEntry) this.selectMonster(nextEntry.id, true);
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

  private handleShutdown(): void {
    this.input.keyboard?.off('keydown', this.handleKeyboardNavigation, this);
  }
}
