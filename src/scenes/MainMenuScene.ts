import Phaser from 'phaser';
import { LEVELS } from '../config/levels';
import { GAME_HEIGHT, GAME_WIDTH, SCENES } from '../constants';
import { SAVE_KEYS, SaveManager } from '../systems/SaveManager';
import { configureHighResolutionScene } from '../systems/DisplayManager';
import { SoundManager } from '../systems/SoundManager';

interface LevelRowRefs {
  container: Phaser.GameObjects.Container;
  box: Phaser.GameObjects.Rectangle;
  marker: Phaser.GameObjects.Rectangle;
  index: Phaser.GameObjects.Text;
  title: Phaser.GameObjects.Text;
  meta: Phaser.GameObjects.Text;
  status: Phaser.GameObjects.Text;
  unlocked: boolean;
}

interface ActionButtonRefs {
  box: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
}

export class MainMenuScene extends Phaser.Scene {
  private selectedLevelId = LEVELS[0]?.id ?? 'level_1';
  private levelRows = new Map<string, LevelRowRefs>();

  private missionNumberText!: Phaser.GameObjects.Text;
  private missionNameText!: Phaser.GameObjects.Text;
  private missionMetaText!: Phaser.GameObjects.Text;
  private missionBriefText!: Phaser.GameObjects.Text;
  private startButtonText!: Phaser.GameObjects.Text;

  constructor() {
    super(SCENES.mainMenu);
  }

  create(): void {
    configureHighResolutionScene(this);
    SoundManager.setMusic('menu');
    SoundManager.pauseMusic(false);
    const firstLevelId = LEVELS[0]?.id ?? 'level_1';
    const savedUnlocked = SaveManager.load<unknown>(SAVE_KEYS.unlockedLevels, [firstLevelId]);
    const knownLevelIds = new Set(LEVELS.map((level) => level.id));
    const unlockedIds = Array.isArray(savedUnlocked)
      ? savedUnlocked.filter((value): value is string => typeof value === 'string' && knownLevelIds.has(value))
      : [firstLevelId];
    const unlocked = new Set(unlockedIds);
    unlocked.add(firstLevelId);

    const orderedUnlocked = LEVELS.map((level) => level.id).filter((id) => unlocked.has(id));
    const bestWave = SaveManager.load<number>(SAVE_KEYS.endlessBestWave, 0);
    this.selectedLevelId = orderedUnlocked[orderedUnlocked.length - 1] ?? firstLevelId;
    this.levelRows.clear();

    this.createBackdrop();
    const heroSections = this.createHero(unlocked.size, bestWave);
    const levelList = this.createLevelList(unlocked);
    const missionPanel = this.createMissionPanel(bestWave);
    const footer = this.createFooter();

    this.refreshLevelSelection();
    this.playEntrance(heroSections.copy, 40, 18);
    this.playEntrance(heroSections.badge, 130, -12);
    this.playEntrance(levelList, 190, 16);
    this.playEntrance(missionPanel, 260, 16);
    this.playEntrance(footer, 340, 8);

    this.input.keyboard?.once('keydown-ONE', this.startSelectedLevel, this);
    this.input.keyboard?.once('keydown-TWO', this.startEndlessMode, this);
    this.input.keyboard?.once('keydown-THREE', this.openWeaponLibrary, this);
    this.input.keyboard?.once('keydown-FOUR', this.openMonsterLibrary, this);
    this.input.keyboard?.once('keydown-FIVE', this.openSettings, this);
  }

  private createBackdrop(): void {
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x101014);

    const grid = this.add.graphics();
    grid.lineStyle(1, 0xf4eedd, 0.035);
    for (let x = 0; x <= GAME_WIDTH; x += 48) {
      grid.lineBetween(x, 0, x, GAME_HEIGHT);
    }
    for (let y = 0; y <= GAME_HEIGHT; y += 48) {
      grid.lineBetween(0, y, GAME_WIDTH, y);
    }

    // 右上黄色切面承担唯一主视觉锚点，同时为任务编号提供稳定高对比背景。
    const posterPlane = this.add.graphics();
    posterPlane.fillStyle(0xfbc02d, 1);
    posterPlane.fillTriangle(862, 0, GAME_WIDTH, 0, GAME_WIDTH, 286);
    posterPlane.lineStyle(11, 0x0f0e13, 0.11);
    for (let offset = 0; offset < 260; offset += 34) {
      posterPlane.lineBetween(1080 + offset, 0, GAME_WIDTH, 200 - offset);
    }

    this.add.rectangle(GAME_WIDTH / 2, 252, GAME_WIDTH - 128, 2, 0xf4eedd, 0.16);
    this.add.rectangle(108, 230, 88, 5, 0xd32f2f).setOrigin(0, 0.5);
    this.add.text(GAME_WIDTH - 20, GAME_HEIGHT / 2, 'OUTBREAK', {
      fontFamily: 'Impact, "Arial Black", sans-serif',
      fontSize: '18px',
      color: '#f4eedd',
      letterSpacing: 5,
    }).setOrigin(0.5).setRotation(Math.PI / 2).setAlpha(0.22);
  }

  private createHero(unlockedCount: number, bestWave: number): {
    copy: Phaser.GameObjects.Container;
    badge: Phaser.GameObjects.Container;
  } {
    const kicker = this.add.text(70, 42, 'FIELD REPORT  //  SURVIVAL PROTOCOL', {
      fontFamily: 'Consolas, monospace',
      fontSize: '15px',
      color: '#fbc02d',
      letterSpacing: 2,
    });
    const title = this.add.text(68, 68, '消灭僵尸', {
      fontFamily: '"Microsoft YaHei", "Arial Black", sans-serif',
      fontStyle: 'bold',
      fontSize: '76px',
      color: '#f4eedd',
      stroke: '#0f0e13',
      strokeThickness: 5,
    });
    const englishTitle = this.add.text(72, 154, 'EXTERMINATE ZOMBIES', {
      fontFamily: 'Impact, "Arial Black", sans-serif',
      fontSize: '24px',
      color: '#d32f2f',
      letterSpacing: 6,
    });
    const tagline = this.add.text(72, 198, '守住防线。利用环境。活到下一波。', {
      fontFamily: '"Microsoft YaHei", sans-serif',
      fontSize: '18px',
      color: '#bdb8af',
      letterSpacing: 1,
    });
    const copy = this.add.container(0, 0, [kicker, title, englishTitle, tagline]);

    const badgeCircle = this.add.circle(1094, 104, 78, 0xf4eedd);
    badgeCircle.setStrokeStyle(6, 0x0f0e13, 0.95);
    const badgeLabel = this.add.text(1094, 46, 'ACTIVE SECTOR', {
      fontFamily: 'Consolas, monospace',
      fontSize: '11px',
      color: '#0f0e13',
      letterSpacing: 1,
    }).setOrigin(0.5);
    this.missionNumberText = this.add.text(1094, 103, '01', {
      fontFamily: 'Impact, "Arial Black", sans-serif',
      fontSize: '88px',
      color: '#0f0e13',
    }).setOrigin(0.5);
    const progressText = this.add.text(1216, 174, [
      `解锁 ${Math.min(unlockedCount, LEVELS.length)}/${LEVELS.length}`,
      `纪录 W${bestWave}`,
    ].join('\n'), {
      fontFamily: '"Microsoft YaHei", sans-serif',
      fontSize: '14px',
      color: '#0f0e13',
      align: 'center',
      lineSpacing: 4,
    }).setOrigin(0.5);
    const badge = this.add.container(0, 0, [badgeCircle, badgeLabel, this.missionNumberText, progressText]);

    return { copy, badge };
  }

  private createLevelList(unlocked: Set<string>): Phaser.GameObjects.Container {
    const objects: Phaser.GameObjects.GameObject[] = [];
    const startX = 64;
    const rowWidth = 664;
    const rowHeight = 66;
    const firstRowY = 344;
    const rowGap = 10;

    const heading = this.add.text(startX, 278, '选择作战区域', {
      fontFamily: 'Impact, "Arial Black", sans-serif',
      fontSize: '28px',
      color: '#f4eedd',
      letterSpacing: 1,
    });
    const counter = this.add.text(startX + rowWidth, 286, `${LEVELS.length} 个任务区域`, {
      fontFamily: '"Microsoft YaHei", sans-serif',
      fontSize: '14px',
      color: '#77747b',
    }).setOrigin(1, 0);
    objects.push(heading, counter);

    LEVELS.forEach((level, levelIndex) => {
      const y = firstRowY + levelIndex * (rowHeight + rowGap);
      const isUnlocked = unlocked.has(level.id);
      const baseX = startX + rowWidth / 2;

      const box = this.add.rectangle(0, 0, rowWidth, rowHeight, 0x19191f);
      const marker = this.add.rectangle(-rowWidth / 2, 0, 6, rowHeight, 0xfbc02d).setOrigin(0, 0.5);
      const index = this.add.text(-rowWidth / 2 + 22, 0, String(levelIndex + 1).padStart(2, '0'), {
        fontFamily: 'Impact, "Arial Black", sans-serif',
        fontSize: '27px',
        color: '#f4eedd',
      }).setOrigin(0, 0.5);
      const title = this.add.text(-rowWidth / 2 + 82, -13, level.name, {
        fontFamily: '"Microsoft YaHei", sans-serif',
        fontStyle: 'bold',
        fontSize: '22px',
        color: '#f4eedd',
      }).setOrigin(0, 0.5);
      const meta = this.add.text(-rowWidth / 2 + 82, 16, `${level.waves.length} 波${level.boss ? '  ·  BOSS' : ''}  ·  ${level.props.length} 个场景物`, {
        fontFamily: '"Microsoft YaHei", sans-serif',
        fontSize: '13px',
        color: '#8e8b92',
      }).setOrigin(0, 0.5);
      const status = this.add.text(rowWidth / 2 - 22, 0, '', {
        fontFamily: 'Consolas, monospace',
        fontSize: '14px',
        color: '#fbc02d',
      }).setOrigin(1, 0.5);

      const rowContainer = this.add.container(baseX, y, [box, marker, index, title, meta, status]);
      const refs: LevelRowRefs = {
        container: rowContainer,
        box,
        marker,
        index,
        title,
        meta,
        status,
        unlocked: isUnlocked,
      };
      this.levelRows.set(level.id, refs);
      objects.push(rowContainer);

      if (isUnlocked) {
        box.setInteractive({ useHandCursor: true })
          .on('pointerover', () => {
            if (level.id === this.selectedLevelId) return;
            box.fillColor = 0x25252d;
            marker.setAlpha(0.55);
            this.tweens.add({
              targets: rowContainer,
              x: baseX + 4,
              duration: 90,
              ease: 'Cubic.Out',
            });
          })
          .on('pointerout', () => {
            this.tweens.add({
              targets: rowContainer,
              x: baseX,
              duration: 90,
              ease: 'Cubic.Out',
            });
            this.paintLevelRow(level.id);
          })
          .on('pointerup', () => {
            this.selectedLevelId = level.id;
            this.refreshLevelSelection();
          });
      }
    });

    return this.add.container(0, 0, objects);
  }

  private createMissionPanel(bestWave: number): Phaser.GameObjects.Container {
    const objects: Phaser.GameObjects.GameObject[] = [];
    const divider = this.add.rectangle(772, 433, 2, 302, 0xf4eedd, 0.12);
    const eyebrow = this.add.text(814, 280, 'MISSION BRIEF', {
      fontFamily: 'Consolas, monospace',
      fontSize: '14px',
      color: '#fbc02d',
      letterSpacing: 2,
    });
    this.missionNameText = this.add.text(812, 314, '', {
      fontFamily: '"Microsoft YaHei", sans-serif',
      fontStyle: 'bold',
      fontSize: '30px',
      color: '#f4eedd',
    });
    this.missionMetaText = this.add.text(814, 360, '', {
      fontFamily: '"Microsoft YaHei", sans-serif',
      fontSize: '15px',
      color: '#99959c',
    });
    const rule = this.add.rectangle(814, 392, 398, 2, 0xf4eedd, 0.1).setOrigin(0, 0.5);
    this.missionBriefText = this.add.text(814, 410, '', {
      fontFamily: '"Microsoft YaHei", sans-serif',
      fontSize: '16px',
      color: '#c7c2b9',
      lineSpacing: 6,
      wordWrap: { width: 398 },
    });

    const primary = this.createActionButton(1013, 494, 398, 58, '开始行动  →', true, this.startSelectedLevel);
    this.startButtonText = primary.label;
    const endless = this.createActionButton(861, 565, 94, 48, `无尽 W${bestWave}`, false, this.startEndlessMode);
    const weaponLibrary = this.createActionButton(962, 565, 94, 48, '武器库', false, this.openWeaponLibrary);
    const monsterLibrary = this.createActionButton(1063, 565, 94, 48, '怪物图鉴', false, this.openMonsterLibrary);
    const settings = this.createActionButton(1164, 565, 94, 48, '设置', false, this.openSettings);

    objects.push(
      divider,
      eyebrow,
      this.missionNameText,
      this.missionMetaText,
      rule,
      this.missionBriefText,
      primary.box,
      primary.label,
      endless.box,
      endless.label,
      weaponLibrary.box,
      weaponLibrary.label,
      monsterLibrary.box,
      monsterLibrary.label,
      settings.box,
      settings.label,
    );

    return this.add.container(0, 0, objects);
  }

  private createFooter(): Phaser.GameObjects.Container {
    const rule = this.add.rectangle(GAME_WIDTH / 2, 628, GAME_WIDTH - 128, 2, 0xf4eedd, 0.12);
    const archiveStatus = this.add.text(64, 651, `档案状态  ${LEVELS.length} 个战区配置已同步`, {
      fontFamily: '"Microsoft YaHei", sans-serif',
      fontSize: '14px',
      color: '#9e9aa1',
    });
    const modules = this.add.text(GAME_WIDTH - 64, 651, '关卡  /  无尽  /  武器库  /  怪物图鉴  /  设置', {
      fontFamily: 'Consolas, monospace',
      fontSize: '14px',
      color: '#fbc02d',
    }).setOrigin(1, 0);
    const build = this.add.text(GAME_WIDTH - 64, 684, 'WEB BUILD  //  v0.1.0', {
      fontFamily: 'Consolas, monospace',
      fontSize: '11px',
      color: '#4f4d54',
      letterSpacing: 1,
    }).setOrigin(1, 0);

    return this.add.container(0, 0, [rule, archiveStatus, modules, build]);
  }

  private createActionButton(
    x: number,
    y: number,
    width: number,
    height: number,
    text: string,
    primary: boolean,
    onClick: () => void,
  ): ActionButtonRefs {
    const box = this.add.rectangle(x, y, width, height, primary ? 0xfbc02d : 0x1d1d24);
    box.setStrokeStyle(primary ? 4 : 2, primary ? 0x0f0e13 : 0xf4eedd, primary ? 1 : 0.22);
    const label = this.add.text(x, y, text, {
      fontFamily: primary ? 'Impact, "Arial Black", sans-serif' : '"Microsoft YaHei", sans-serif',
      fontStyle: primary ? 'normal' : 'bold',
      fontSize: primary ? '25px' : '16px',
      color: primary ? '#0f0e13' : '#f4eedd',
      letterSpacing: primary ? 1 : 0,
    }).setOrigin(0.5);

    box.setInteractive({ useHandCursor: true })
      .on('pointerover', () => {
        box.fillColor = primary ? 0xf4eedd : 0x292931;
        box.setStrokeStyle(primary ? 4 : 2, primary ? 0x0f0e13 : 0xfbc02d, 1);
        this.tweens.add({
          targets: [box, label],
          y: y - 2,
          duration: 90,
          ease: 'Cubic.Out',
        });
      })
      .on('pointerout', () => {
        box.fillColor = primary ? 0xfbc02d : 0x1d1d24;
        box.setStrokeStyle(primary ? 4 : 2, primary ? 0x0f0e13 : 0xf4eedd, primary ? 1 : 0.22);
        box.setScale(1);
        label.setScale(1);
        this.tweens.add({
          targets: [box, label],
          y,
          duration: 90,
          ease: 'Cubic.Out',
        });
      })
      .on('pointerdown', () => {
        box.setScale(0.985);
        label.setScale(0.985);
      })
      .on('pointerup', () => {
        box.setScale(1);
        label.setScale(1);
        onClick.call(this);
      });

    return { box, label };
  }

  private refreshLevelSelection(): void {
    for (const level of LEVELS) {
      this.paintLevelRow(level.id);
    }

    const selectedIndex = LEVELS.findIndex((level) => level.id === this.selectedLevelId);
    const selectedLevel = selectedIndex >= 0 ? LEVELS[selectedIndex] : LEVELS[0];
    if (!selectedLevel) return;

    this.missionNumberText.setText(String(selectedIndex + 1).padStart(2, '0'));
    this.missionNameText.setText(selectedLevel.name);
    this.missionMetaText.setText([
      `${selectedLevel.waves.length} 个标准波次`,
      selectedLevel.boss ? '终局 BOSS' : '清场通关',
      `${selectedLevel.props.length} 个战术场景物`,
    ].join('  ·  '));
    this.missionBriefText.setText(selectedLevel.boss
      ? '保持机动并保留爆炸物。\n清空常规波次后，Boss 将单独进入战场。'
      : '观察油桶与面粉桶的位置。\n用连锁爆炸清场，用粉尘区切断追击。');
    this.startButtonText.setText(`进入 ${selectedLevel.name}  →`);

    this.tweens.killTweensOf(this.missionNumberText);
    this.missionNumberText.setScale(0.9);
    this.tweens.add({
      targets: this.missionNumberText,
      scale: 1,
      duration: 180,
      ease: 'Back.Out',
    });
  }

  private paintLevelRow(levelId: string): void {
    const refs = this.levelRows.get(levelId);
    if (!refs) return;

    if (!refs.unlocked) {
      refs.box.fillColor = 0x17171c;
      refs.marker.setAlpha(0.08);
      refs.index.setColor('#57555c');
      refs.title.setColor('#6d6a72');
      refs.meta.setColor('#56545a');
      refs.status.setText('LOCKED').setColor('#6d6a72');
      return;
    }

    const selected = levelId === this.selectedLevelId;
    refs.box.fillColor = selected ? 0xfbc02d : 0x19191f;
    refs.marker.setAlpha(selected ? 1 : 0);
    refs.index.setColor(selected ? '#0f0e13' : '#f4eedd');
    refs.title.setColor(selected ? '#0f0e13' : '#f4eedd');
    refs.meta.setColor(selected ? '#494128' : '#8e8b92');
    refs.status.setText(selected ? 'SELECTED' : 'READY');
    refs.status.setColor(selected ? '#0f0e13' : '#fbc02d');
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
      duration: 380,
      ease: 'Cubic.Out',
    });
  }

  private startSelectedLevel(): void {
    SoundManager.play('uiConfirm');
    this.scene.start(SCENES.game, { mode: 'level', levelId: this.selectedLevelId });
  }

  private startEndlessMode(): void {
    SoundManager.play('uiConfirm');
    this.scene.start(SCENES.game, { mode: 'endless', levelId: null });
  }

  private openWeaponLibrary(): void {
    SoundManager.play('uiConfirm');
    this.scene.start(SCENES.weaponLibrary);
  }

  private openMonsterLibrary(): void {
    SoundManager.play('uiConfirm');
    this.scene.start(SCENES.monsterLibrary);
  }

  private openSettings(): void {
    SoundManager.play('uiConfirm');
    this.scene.start(SCENES.settings);
  }

}
