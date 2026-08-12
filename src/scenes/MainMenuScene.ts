import Phaser from 'phaser';
import { LEVELS } from '../config/levels';
import { GAME_HEIGHT, GAME_WIDTH, SCENES } from '../constants';
import { SAVE_KEYS, SaveManager } from '../systems/SaveManager';
import { configureHighResolutionScene } from '../systems/DisplayManager';
import { SoundManager } from '../systems/SoundManager';
import type { GameMode } from '../systems/GameState';

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
  /** 有挂起战局时主行动行要塞两个按钮，开始按钮改用不带关卡名的短文案。 */
  private compactStartLabel = false;

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

    const canResume = this.canResumeRun();
    this.compactStartLabel = canResume;

    this.createBackdrop();
    const heroSections = this.createHero(unlocked.size, bestWave);
    const levelList = this.createLevelList(unlocked);
    const missionPanel = this.createMissionPanel(bestWave, canResume);
    const footer = this.createFooter(canResume);

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
    this.input.keyboard?.once('keydown-SIX', this.openCredits, this);
    // ESC 在战斗里是打开菜单，在主页就是回到战斗，两端保持同一个键。
    if (canResume) {
      this.input.keyboard?.once('keydown-ESC', this.resumeSuspendedRun, this);
    }
  }

  /** 战斗场景处于 sleeping 说明有一局被挂起，可以原样接回。 */
  private canResumeRun(): boolean {
    return this.scene.isSleeping(SCENES.game);
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
    const listWidth = 664;
    const columnGap = 20;
    const rowWidth = (listWidth - columnGap) / 2;
    const rowHeight = 52;
    const firstRowY = 344;
    /** 列表底部红线:行距按它反推,关卡再增多也只会收紧行距而不会压到页脚。 */
    const listBottomY = 600;
    const rowsPerColumn = Math.max(1, Math.ceil(LEVELS.length / 2));
    const rowPitch = rowsPerColumn > 1
      ? Math.min(62, (listBottomY - firstRowY) / (rowsPerColumn - 1))
      : 62;

    const heading = this.add.text(startX, 278, '选择作战区域', {
      fontFamily: 'Impact, "Arial Black", sans-serif',
      fontSize: '28px',
      color: '#f4eedd',
      letterSpacing: 1,
    });
    const counter = this.add.text(startX + listWidth, 286, `${LEVELS.length} 个任务区域`, {
      fontFamily: '"Microsoft YaHei", sans-serif',
      fontSize: '14px',
      color: '#77747b',
    }).setOrigin(1, 0);
    objects.push(heading, counter);

    LEVELS.forEach((level, levelIndex) => {
      // 先填满左列再排右列,序号在视觉上仍然自上而下连续。
      const column = Math.floor(levelIndex / rowsPerColumn);
      const row = levelIndex % rowsPerColumn;
      const y = firstRowY + row * rowPitch;
      const isUnlocked = unlocked.has(level.id);
      const baseX = startX + column * (rowWidth + columnGap) + rowWidth / 2;

      const box = this.add.rectangle(0, 0, rowWidth, rowHeight, 0x19191f);
      const marker = this.add.rectangle(-rowWidth / 2, 0, 6, rowHeight, 0xfbc02d).setOrigin(0, 0.5);
      const index = this.add.text(-rowWidth / 2 + 18, 0, String(levelIndex + 1).padStart(2, '0'), {
        fontFamily: 'Impact, "Arial Black", sans-serif',
        fontSize: '23px',
        color: '#f4eedd',
      }).setOrigin(0, 0.5);
      const title = this.add.text(-rowWidth / 2 + 60, -8, level.name, {
        fontFamily: '"Microsoft YaHei", sans-serif',
        fontStyle: 'bold',
        fontSize: '17px',
        color: '#f4eedd',
      }).setOrigin(0, 0.5);
      const meta = this.add.text(-rowWidth / 2 + 60, 13, `${level.waves.length} 波${level.boss ? '  ·  BOSS' : ''}`, {
        fontFamily: '"Microsoft YaHei", sans-serif',
        fontSize: '11px',
        color: '#8e8b92',
      }).setOrigin(0, 0.5);
      const status = this.add.text(rowWidth / 2 - 16, 0, '', {
        fontFamily: 'Consolas, monospace',
        fontSize: '12px',
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

  private createMissionPanel(bestWave: number, canResume: boolean): Phaser.GameObjects.Container {
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

    objects.push(
      divider,
      eyebrow,
      this.missionNameText,
      this.missionMetaText,
      rule,
      this.missionBriefText,
    );

    // 主行动行固定占 814..1212。有挂起战局时横向切成「继续游戏 + 开始行动」两块，
    // 而不是另起一行——下面的功能按钮行与页脚红线之间已经没有余量。
    if (canResume) {
      const resume = this.createActionButton(906, 494, 184, 58, '继续游戏', true, this.resumeSuspendedRun);
      const primary = this.createActionButton(1109, 494, 206, 58, '开始行动  →', true, this.startSelectedLevel);
      this.startButtonText = primary.label;
      objects.push(resume.box, resume.label, primary.box, primary.label);
    } else {
      const primary = this.createActionButton(1013, 494, 398, 58, '开始行动  →', true, this.startSelectedLevel);
      this.startButtonText = primary.label;
      objects.push(primary.box, primary.label);
    }

    const endless = this.createActionButton(851, 565, 74, 48, `无尽 W${bestWave}`, false, this.startEndlessMode);
    const weaponLibrary = this.createActionButton(932, 565, 74, 48, '武器库', false, this.openWeaponLibrary);
    const monsterLibrary = this.createActionButton(1013, 565, 74, 48, '怪物', false, this.openMonsterLibrary);
    const settings = this.createActionButton(1094, 565, 74, 48, '设置', false, this.openSettings);
    const credits = this.createActionButton(1175, 565, 74, 48, '署名', false, this.openCredits);

    objects.push(
      endless.box,
      endless.label,
      weaponLibrary.box,
      weaponLibrary.label,
      monsterLibrary.box,
      monsterLibrary.label,
      settings.box,
      settings.label,
      credits.box,
      credits.label,
    );

    return this.add.container(0, 0, objects);
  }

  private createFooter(canResume: boolean): Phaser.GameObjects.Container {
    const rule = this.add.rectangle(GAME_WIDTH / 2, 628, GAME_WIDTH - 128, 2, 0xf4eedd, 0.12);
    const archiveStatus = this.add.text(64, 651, canResume
      ? '战局已挂起  按 ESC 或点击「继续游戏」回到战场'
      : `档案状态  ${LEVELS.length} 个战区配置已同步  ·  按 6 查看署名`, {
      fontFamily: '"Microsoft YaHei", sans-serif',
      fontSize: '14px',
      color: canResume ? '#fbc02d' : '#9e9aa1',
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
    this.missionBriefText.setText(selectedLevel.briefing);
    // 短按钮塞不下关卡名，但关卡名已经在上方的任务简报标题里，信息不会丢。
    this.startButtonText.setText(this.compactStartLabel
      ? '开始行动  →'
      : `进入 ${selectedLevel.name}  →`);

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

  /** 回到被挂起的战局。GameScene 的 WAKE 处理会唤醒 HUD 并解除冻结。 */
  private resumeSuspendedRun(): void {
    if (!this.canResumeRun()) return;
    SoundManager.play('uiConfirm');
    this.scene.wake(SCENES.game);
    this.scene.stop();
  }

  /**
   * 开新局。挂起的战局会被丢弃：`scene.start` 对 sleeping 的场景会先走 shutdown 再重新 create，
   * 因此上一局的实体、对象池和波次计时器不会残留到新一局里。
   */
  private launchRun(mode: GameMode, levelId: string | null): void {
    SoundManager.play('uiConfirm');
    this.scene.start(SCENES.game, { mode, levelId });
  }

  private startSelectedLevel(): void {
    this.launchRun('level', this.selectedLevelId);
  }

  private startEndlessMode(): void {
    this.launchRun('endless', null);
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

  private openCredits(): void {
    SoundManager.play('uiConfirm');
    this.scene.start(SCENES.credits);
  }

}
