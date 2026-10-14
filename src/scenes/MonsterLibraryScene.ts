import Phaser from 'phaser';
import {
  getMonsterDeathHazard,
  getMonsterDefinition,
  MONSTER_LIBRARY,
  type MonsterLibraryEntry,
} from '../config/monsterLibrary';
import { isBossZombie, type ZombieId } from '../config/zombies';
import { SCENES } from '../constants';
import { configureHighResolutionScene } from '../systems/DisplayManager';
import {
  getZombiePortraitTextureKey,
  getZombieVisual,
  type ZombieFacingMode,
} from '../systems/GameAssetManager';
import {
  MONSTER_PREVIEW_CENTER,
  MONSTER_PREVIEW_PLANE,
  resolveMonsterPreviewScale,
} from '../systems/MonsterPreviewLayout';
import { SoundManager } from '../systems/SoundManager';
import {
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

interface MonsterRowRefs {
  container: Phaser.GameObjects.Container;
  box: Phaser.GameObjects.Rectangle;
  marker: Phaser.GameObjects.Rectangle;
  index: Phaser.GameObjects.Text;
  name: Phaser.GameObjects.Text;
  role: Phaser.GameObjects.Text;
  threat: Phaser.GameObjects.Text;
  bossPlate: Phaser.GameObjects.Rectangle;
  bossLabel: Phaser.GameObjects.Text;
  baseX: number;
}

const PREVIEW_X = MONSTER_PREVIEW_CENTER.x;
const PREVIEW_Y = MONSTER_PREVIEW_CENTER.y;

/**
 * 预览帧名。
 * 独立立绘是未切帧的整图，只有 `__BASE`；方向表首帧为 `0-0`，旋转帧条首帧为 `0`。
 */
function resolvePreviewFrame(id: ZombieId, facingMode: ZombieFacingMode): string {
  if (getZombiePortraitTextureKey(id)) return '__BASE';
  return facingMode === 'directional' ? '0-0' : '0';
}

export class MonsterLibraryScene extends Phaser.Scene {
  private selectedId: ZombieId = MONSTER_LIBRARY[0]?.id ?? 'walker';
  private rows = new Map<ZombieId, MonsterRowRefs>();

  private detailIndexText!: Phaser.GameObjects.Text;
  private detailNameText!: Phaser.GameObjects.Text;
  private detailMetaText!: Phaser.GameObjects.Text;
  private detailThreatText!: Phaser.GameObjects.Text;
  private detailBossBadge!: Phaser.GameObjects.Container;
  private detailSummaryText!: Phaser.GameObjects.Text;
  private previewShadow!: Phaser.GameObjects.Ellipse;
  private previewSprite!: Phaser.GameObjects.Sprite;
  private statValues: Phaser.GameObjects.Text[] = [];
  private hazardText!: Phaser.GameObjects.Text;
  private tacticText!: Phaser.GameObjects.Text;

  constructor() {
    super(SCENES.monsterLibrary);
  }

  create(): void {
    configureHighResolutionScene(this);
    SoundManager.setMusic('menu');
    this.rows.clear();
    this.statValues = [];

    createArchiveBackdrop(this, 'monster');
    const header = this.createHeader();
    const index = this.createMonsterIndex();
    const detail = this.createDetailPanel();
    const footer = this.createFooter();

    this.selectMonster(this.selectedId, false);
    playArchiveEntrance(this, { header, index, detail, footer });

    this.input.keyboard?.on('keydown', this.handleKeyboardNavigation, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown, this);
  }

  private createHeader(): Phaser.GameObjects.Container {
    const apexCount = MONSTER_LIBRARY.filter((entry) => isBossZombie(entry.id)).length;
    const header = createArchiveHeader(this, {
      kind: 'monster',
      kicker: 'FIELD ARCHIVE  //  INFECTED SPECIMENS',
      title: '怪物图鉴',
      subtitle: '感染体行为、战斗参数与战术处置档案',
      summary: [
        `${String(MONSTER_LIBRARY.length).padStart(2, '0')}  SPECIMENS`,
        `${String(apexCount).padStart(2, '0')}  APEX CLASS`,
      ].join('\n'),
      onBack: () => this.openMainMenu(),
    });
    return header.container;
  }

  private createMonsterIndex(): Phaser.GameObjects.Container {
    const objects: Phaser.GameObjects.GameObject[] = createArchiveIndexHeading(
      this, 'monster', 'INFECTED INDEX', `${MONSTER_LIBRARY.length} 项感染体档案`,
    );
    const layout = computeArchiveIndexLayout('monster', MONSTER_LIBRARY.length);
    const rowWidth = layout.rowWidth;

    MONSTER_LIBRARY.forEach((entry, entryIndex) => {
      const definition = getMonsterDefinition(entry);
      const {
        container: rowContainer, box, marker, index, name, subtitle: role, status: threat, baseX,
      } = createArchiveRow(this, {
        kind: 'monster',
        position: layout.positions[entryIndex],
        width: rowWidth,
        height: layout.grid.boxHeight,
        index: entry.dossierCode,
        name: definition.name,
        subtitle: entry.role,
        status: `T-${entry.threat}`,
      });
      const bossPlate = this.add.rectangle(rowWidth / 2 - 43, name.y, 62, 18, 0xd32f2f)
        .setStrokeStyle(1, 0xff8a72, 0.9)
        .setVisible(isBossZombie(entry.id));
      const bossLabel = this.add.text(rowWidth / 2 - 43, name.y, 'BOSS', {
        fontFamily: UI_FONT_FAMILY,
        fontSize: '10px',
        color: '#fff4e8',
      }).setOrigin(0.5).setVisible(isBossZombie(entry.id));
      rowContainer.add([bossPlate, bossLabel]);

      this.rows.set(entry.id, {
        container: rowContainer,
        box,
        marker,
        index,
        name,
        role,
        threat,
        bossPlate,
        bossLabel,
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

    const frame = createArchiveDetailFrame(this, {
      kind: 'monster',
      panelLeft,
      panelRight,
      preview: {
        centerX: PREVIEW_X,
        centerY: PREVIEW_Y,
        width: MONSTER_PREVIEW_PLANE.width,
        height: MONSTER_PREVIEW_PLANE.height,
      },
    });
    this.detailIndexText = frame.index;
    this.detailNameText = frame.name;
    this.detailMetaText = frame.subtitle;
    this.detailThreatText = frame.status;
    const bossBadgePlate = this.add.rectangle(920, 176, 126, 24, 0xd32f2f)
      .setStrokeStyle(2, 0xff8a72, 0.9);
    const bossBadgeLabel = this.add.text(920, 176, 'BOSS // 首领级', {
      fontFamily: UI_FONT_FAMILY,
      fontStyle: 'bold',
      fontSize: '11px',
      color: '#fff4e8',
    }).setOrigin(0.5);
    this.detailBossBadge = this.add.container(0, 0, [bossBadgePlate, bossBadgeLabel]).setVisible(false);
    this.previewShadow = this.add.ellipse(PREVIEW_X, PREVIEW_Y + 55, 68, 18, 0x000000, 0.34);

    const initialVisual = getZombieVisual(this.selectedId);
    const initialPortraitKey = getZombiePortraitTextureKey(this.selectedId);
    this.previewSprite = this.add.sprite(
      PREVIEW_X,
      PREVIEW_Y,
      initialPortraitKey ?? initialVisual.textureKey,
    );
    this.previewSprite
      .setOrigin(0.5, initialVisual.originY)
      .setFrame(resolvePreviewFrame(this.selectedId, initialVisual.facingMode));

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
        fontFamily: UI_FONT_FAMILY,
        fontSize: '10px',
        color: '#6f6c73',
      });
      const valueText = this.add.text(x, y + 18, '', {
        fontFamily: UI_FONT_FAMILY,
        fontSize: '20px',
        color: '#f4eedd',
      });
      objects.push(labelText, valueText);
      return valueText;
    });

    this.hazardText = this.add.text(panelLeft, 466, '', {
      fontFamily: UI_FONT_FAMILY,
      fontSize: '14px',
      color: '#8f8b92',
    });
    const archiveRule = this.add.rectangle(panelLeft, 495, panelRight - panelLeft, 2, 0xf4eedd, 0.1).setOrigin(0, 0.5);
    const summaryLabel = this.add.text(panelLeft, 508, '档案介绍  //  PROFILE', {
      fontFamily: UI_FONT_FAMILY,
      fontSize: '11px',
      color: '#77747b',
    });
    this.detailSummaryText = this.add.text(panelLeft, 530, '', {
      fontFamily: UI_FONT_FAMILY,
      fontSize: '15px',
      color: '#c7c2b9',
      lineSpacing: 4,
      wordWrap: { width: panelRight - panelLeft, useAdvancedWrap: true },
    });

    const tacticRule = this.add.rectangle(panelLeft, 598, panelRight - panelLeft, 2, 0xf4eedd, 0.1).setOrigin(0, 0.5);
    const tacticLabel = this.add.text(panelLeft, 611, '处置建议  //  RESPONSE', {
      fontFamily: UI_FONT_FAMILY,
      fontSize: '11px',
      color: '#77747b',
    });
    this.tacticText = this.add.text(panelLeft, 631, '', {
      fontFamily: UI_FONT_FAMILY,
      fontSize: '14px',
      color: '#f4eedd',
      lineSpacing: 3,
      wordWrap: { width: panelRight - panelLeft, useAdvancedWrap: true },
    });

    objects.push(
      ...frame.objects,
      this.detailBossBadge,
      frame.previewPlane,
      this.previewShadow,
      this.previewSprite,
      this.hazardText,
      archiveRule,
      summaryLabel,
      this.detailSummaryText,
      tacticRule,
      tacticLabel,
      this.tacticText,
    );
    return this.add.container(0, 0, objects);
  }

  private createFooter(): Phaser.GameObjects.Container {
    const count = String(MONSTER_LIBRARY.length).padStart(2, '0');
    return createArchiveFooter(this, {
      kind: 'monster',
      hint: '配置来源  ZOMBIES / DOSSIER ARCHIVE',
      shortcuts: `LIVE GAMEPLAY DATA  //  ${count}/${count} · ↑↓←→/WASD 浏览 · Home/End 首尾 · ESC 返回`,
    }).container;
  }

  private selectMonster(id: ZombieId, animate: boolean): void {
    const entryIndex = MONSTER_LIBRARY.findIndex((entry) => entry.id === id);
    const entry = MONSTER_LIBRARY[entryIndex];
    if (!entry) return;
    const shouldAnimate = animate && this.selectedId !== entry.id;

    const definition = getMonsterDefinition(entry);
    const visual = getZombieVisual(entry.id);
    const deathHazard = getMonsterDeathHazard(entry.id);
    const boss = isBossZombie(entry.id);

    this.selectedId = entry.id;
    for (const monster of MONSTER_LIBRARY) this.paintRow(monster);
    this.settleRows();

    this.detailIndexText.setText(
      `${String(entryIndex + 1).padStart(2, '0')} / ${String(MONSTER_LIBRARY.length).padStart(2, '0')}`,
    );
    this.detailNameText.setText(definition.name);
    this.detailMetaText.setText(`${entry.dossierCode}  //  ${entry.role}`);
    this.detailBossBadge.setVisible(boss);
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
      boss ? 'BOSS' : `T-${entry.threat}`,
    ];
    statValues.forEach((value, index) => this.statValues[index]?.setText(value));

    this.hazardText
      .setText(`死亡状态  //  ${deathHazard}`)
      .setColor(definition.explodeOnDeath ? '#ef725f' : '#8f8b92');
    this.tacticText.setText(entry.tactic);

    this.previewSprite
      .stop()
      .setTexture(getZombiePortraitTextureKey(entry.id) ?? visual.textureKey)
      .setOrigin(0.5, visual.originY)
      .setFrame(resolvePreviewFrame(entry.id, visual.facingMode))
      .setRotation(0)
      .setTint(visual.tint)
      .stop();
    const previewScale = resolveMonsterPreviewScale(entry.id);
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
      this.detailBossBadge,
      this.detailSummaryText,
      this.hazardText,
      this.tacticText,
      ...this.statValues,
    ];
    const targetScale = resolveMonsterPreviewScale(entry.id);

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
    const boss = isBossZombie(entry.id);
    refs.box.fillColor = selected ? 0xfbc02d : boss ? 0x291619 : 0x19191f;
    refs.box.setStrokeStyle(boss ? (selected ? 2 : 1) : 0, 0xd32f2f, boss ? 0.85 : 0);
    refs.marker.fillColor = boss ? 0xd32f2f : 0xfbc02d;
    refs.marker.setAlpha(selected ? 1 : boss ? 0.7 : 0);
    refs.index.setColor(selected ? '#0f0e13' : '#aaa6ad');
    refs.name.setColor(selected ? '#0f0e13' : '#f4eedd');
    refs.role.setColor(selected ? '#494128' : '#8e8b92');
    refs.threat.setColor(selected ? '#0f0e13' : entry.threat >= 4 ? '#ef5b45' : '#fbc02d');
    refs.bossPlate.fillColor = selected ? 0x0f0e13 : 0xd32f2f;
    refs.bossLabel.setColor(selected ? '#fbc02d' : '#fff4e8');
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
    if (event.code === 'Escape') {
      event.preventDefault();
      this.openMainMenu();
      return;
    }

    const currentIndex = MONSTER_LIBRARY.findIndex((entry) => entry.id === this.selectedId);
    const nextIndex = resolveArchiveNavigationIndex('monster', event.code, currentIndex, MONSTER_LIBRARY.length);
    if (nextIndex === null) return;
    event.preventDefault();
    const nextEntry = MONSTER_LIBRARY[nextIndex];
    if (nextEntry) this.selectMonster(nextEntry.id, true);
  }

  private openMainMenu(): void {
    SoundManager.play('uiConfirm');
    this.scene.start(SCENES.mainMenu);
  }

  private handleShutdown(): void {
    this.input.keyboard?.off('keydown', this.handleKeyboardNavigation, this);
  }
}
