import Phaser from 'phaser';
import { ITEMS, type ItemId } from '../config/items';
import { WEAPONS } from '../config/weapons';
import { EVENTS, GAME_HEIGHT, GAME_WIDTH, SCENES } from '../constants';
import type { GameScene } from './GameScene';
import { configureHighResolutionScene } from '../systems/DisplayManager';
import { formatKeybind } from '../config/keybinds';

interface WaveAnnouncementPayload {
  title: string;
  subtitle: string;
  accent: number;
}

interface PickupToastPayload {
  title: string;
  accent: number;
}

const HUD_STATE_EVENTS = [
  EVENTS.healthChanged,
  EVENTS.ammoChanged,
  EVENTS.weaponChanged,
  EVENTS.itemChanged,
  EVENTS.scoreChanged,
  EVENTS.waveChanged,
] as const;

export class HUDScene extends Phaser.Scene {
  private gameScene!: GameScene;

  private weaponText!: Phaser.GameObjects.Text;
  private ammoText!: Phaser.GameObjects.Text;
  private ammoDetailText!: Phaser.GameObjects.Text;
  private healthText!: Phaser.GameObjects.Text;
  private healthFill!: Phaser.GameObjects.Rectangle;
  private healthPulseFill!: Phaser.GameObjects.Rectangle;
  private itemText!: Phaser.GameObjects.Text;
  private itemDetailText!: Phaser.GameObjects.Text;
  private levelText!: Phaser.GameObjects.Text;
  private modeText!: Phaser.GameObjects.Text;
  private waveText!: Phaser.GameObjects.Text;
  private scoreText!: Phaser.GameObjects.Text;
  private bossPanel!: Phaser.GameObjects.Container;
  private bossNameText!: Phaser.GameObjects.Text;
  private bossHealthFill!: Phaser.GameObjects.Rectangle;

  private announcementContainer!: Phaser.GameObjects.Container;
  private announcementBg!: Phaser.GameObjects.Rectangle;
  private announcementTitle!: Phaser.GameObjects.Text;
  private announcementSubtitle!: Phaser.GameObjects.Text;

  private pauseOverlay!: Phaser.GameObjects.Container;
  private pauseBodyText!: Phaser.GameObjects.Text;
  private controlHintText!: Phaser.GameObjects.Text;
  private dangerEdges: Phaser.GameObjects.Rectangle[] = [];

  constructor() {
    super(SCENES.hud);
  }

  create(): void {
    configureHighResolutionScene(this);
    this.gameScene = this.scene.get(SCENES.game) as GameScene;

    this.createPanels();
    this.createBossPanel();
    this.createAnnouncement();
    this.createPauseOverlay();
    this.createDangerOverlay();

    for (const eventName of HUD_STATE_EVENTS) {
      this.gameScene.events.on(eventName, this.refresh, this);
    }
    this.gameScene.events.on(EVENTS.waveAnnounced, this.showWaveAnnouncement, this);
    this.gameScene.events.on(EVENTS.pickupCollected, this.showPickupToast, this);
    this.gameScene.events.on(EVENTS.pauseChanged, this.syncPauseOverlay, this);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown, this);
    this.refresh();
    this.syncPauseOverlay(this.gameScene.isPaused());
  }

  update(time: number): void {
    const state = this.gameScene.getState();
    const ratio = state.player.maxHealth > 0 ? state.player.health / state.player.maxHealth : 0;
    const danger = Phaser.Math.Clamp((0.42 - ratio) / 0.42, 0, 1);
    const pulse = (Math.sin(time / 130) + 1) * 0.5;
    const alpha = danger * (0.08 + pulse * 0.18);

    for (const edge of this.dangerEdges) {
      edge.setAlpha(alpha);
    }
    this.refreshBossStatus();
  }

  private createPanels(): void {
    // 左面板:两栏布局。左栏=武器/弹药/生命,右栏=道具。加高到 132 给血条独立留位。
    const leftPanel = this.add.rectangle(24 + 236, 20 + 66, 472, 132, 0xf4eedd, 0.97);
    leftPanel.setStrokeStyle(4, 0x0f0e13);

    this.add.text(42, 30, 'SURVIVOR', {
      fontFamily: 'Impact, "Arial Black", sans-serif',
      fontSize: '24px',
      color: '#0f0e13',
    });

    this.weaponText = this.add.text(42, 60, '', {
      fontFamily: 'Impact, "Arial Black", sans-serif',
      fontSize: '30px',
      color: '#0f0e13',
    });

    this.ammoText = this.add.text(250, 62, '', {
      fontFamily: 'Impact, "Arial Black", sans-serif',
      fontSize: '28px',
      color: '#0f0e13',
    }).setOrigin(1, 0);

    this.ammoDetailText = this.add.text(42, 96, '', {
      fontFamily: '"Microsoft YaHei", sans-serif',
      fontSize: '14px',
      color: '#38434b',
    });

    // 生命标签独立一行,血条在其右侧,互不重叠。
    this.healthText = this.add.text(42, 122, '', {
      fontFamily: '"Microsoft YaHei", sans-serif',
      fontSize: '15px',
      color: '#0f0e13',
    }).setOrigin(0, 0.5);

    const healthBarBg = this.add.rectangle(160, 122, 120, 16, 0x1b1517, 0.16).setOrigin(0, 0.5);
    healthBarBg.setStrokeStyle(2, 0x0f0e13, 0.45);
    this.healthPulseFill = this.add.rectangle(160, 122, 120, 16, 0xf59a8d, 0.14).setOrigin(0, 0.5);
    this.healthFill = this.add.rectangle(160, 122, 120, 16, 0xd32f2f, 0.94).setOrigin(0, 0.5);

    // 右栏:道具,和左栏用一道细分隔线隔开。
    this.add.rectangle(300, 76, 2, 92, 0x0f0e13, 0.25).setOrigin(0.5);

    this.itemText = this.add.text(322, 60, '', {
      fontFamily: 'Impact, "Arial Black", sans-serif',
      fontSize: '24px',
      color: '#0f0e13',
    });
    this.itemDetailText = this.add.text(322, 92, '', {
      fontFamily: '"Microsoft YaHei", sans-serif',
      fontSize: '14px',
      color: '#38434b',
      lineSpacing: 4,
    });

    const rightPanel = this.add.rectangle(GAME_WIDTH - 24 - 180, 22 + 52, 360, 104, 0x0f0e13, 0.92);
    rightPanel.setStrokeStyle(4, 0xf4eedd, 0.9);

    this.modeText = this.add.text(GAME_WIDTH - 42, 34, '', {
      fontFamily: 'Impact, "Arial Black", sans-serif',
      fontSize: '24px',
      color: '#fbc02d',
    }).setOrigin(1, 0);

    this.levelText = this.add.text(GAME_WIDTH - 42, 64, '', {
      fontFamily: '"Microsoft YaHei", sans-serif',
      fontSize: '16px',
      color: '#f4eedd',
    }).setOrigin(1, 0);

    this.waveText = this.add.text(GAME_WIDTH - 42, 90, '', {
      fontFamily: 'Impact, "Arial Black", sans-serif',
      fontSize: '28px',
      color: '#f4eedd',
    }).setOrigin(1, 0);

    this.scoreText = this.add.text(GAME_WIDTH - 42, 120, '', {
      fontFamily: '"Microsoft YaHei", sans-serif',
      fontSize: '16px',
      color: '#f4eedd',
    }).setOrigin(1, 0);

    this.controlHintText = this.add.text(GAME_WIDTH - 42, GAME_HEIGHT - 28, '', {
      fontFamily: '"Microsoft YaHei", sans-serif',
      fontSize: '15px',
      color: '#fbc02d',
    }).setOrigin(1, 1);
  }

  private createAnnouncement(): void {
    this.announcementBg = this.add.rectangle(GAME_WIDTH / 2, 126, 430, 88, 0xf4eedd, 0.98);
    this.announcementBg.setStrokeStyle(5, 0x0f0e13);
    this.announcementTitle = this.add.text(GAME_WIDTH / 2, 100, '', {
      fontFamily: 'Impact, "Arial Black", sans-serif',
      fontSize: '38px',
      color: '#0f0e13',
      stroke: '#fbc02d',
      strokeThickness: 3,
    }).setOrigin(0.5);
    this.announcementSubtitle = this.add.text(GAME_WIDTH / 2, 136, '', {
      fontFamily: '"Microsoft YaHei", sans-serif',
      fontSize: '18px',
      color: '#39424b',
    }).setOrigin(0.5);

    this.announcementContainer = this.add.container(0, -24, [
      this.announcementBg,
      this.announcementTitle,
      this.announcementSubtitle,
    ]);
    this.announcementContainer.setAlpha(0);
    this.announcementContainer.setScale(0.92);
  }

  private createBossPanel(): void {
    const background = this.add.rectangle(GAME_WIDTH / 2, 40, 330, 50, 0x130f11, 0.94);
    background.setStrokeStyle(3, 0xef725f, 0.85);
    this.bossNameText = this.add.text(GAME_WIDTH / 2, 25, '', {
      fontFamily: '"Microsoft YaHei", sans-serif',
      fontStyle: 'bold',
      fontSize: '14px',
      color: '#ffe2d8',
    }).setOrigin(0.5);
    const healthBackground = this.add.rectangle(GAME_WIDTH / 2 - 140, 51, 280, 11, 0x2a1a1c).setOrigin(0, 0.5);
    this.bossHealthFill = this.add.rectangle(GAME_WIDTH / 2 - 140, 51, 280, 11, 0xd94a3a).setOrigin(0, 0.5);
    this.bossPanel = this.add.container(0, 0, [background, this.bossNameText, healthBackground, this.bossHealthFill]);
    this.bossPanel.setVisible(false);
  }

  private createPauseOverlay(): void {
    const shade = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x09080b, 0.62);
    const board = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 420, 220, 0xf4eedd, 0.98);
    board.setStrokeStyle(5, 0x0f0e13);
    const title = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 44, 'PAUSED', {
      fontFamily: 'Impact, "Arial Black", sans-serif',
      fontSize: '56px',
      color: '#0f0e13',
      stroke: '#fbc02d',
      strokeThickness: 5,
    }).setOrigin(0.5);
    this.pauseBodyText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 32, '', {
      fontFamily: '"Microsoft YaHei", sans-serif',
      fontSize: '22px',
      color: '#283038',
      lineSpacing: 10,
      align: 'center',
    }).setOrigin(0.5);

    this.pauseOverlay = this.add.container(0, 0, [shade, board, title, this.pauseBodyText]);
    this.pauseOverlay.setVisible(false);
    this.pauseOverlay.setAlpha(0);
  }

  private createDangerOverlay(): void {
    const top = this.add.rectangle(GAME_WIDTH / 2, 0, GAME_WIDTH, 44, 0xd32f2f, 1).setOrigin(0.5, 0);
    const bottom = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT, GAME_WIDTH, 64, 0xd32f2f, 1).setOrigin(0.5, 1);
    const left = this.add.rectangle(0, GAME_HEIGHT / 2, 56, GAME_HEIGHT, 0xd32f2f, 1).setOrigin(0, 0.5);
    const right = this.add.rectangle(GAME_WIDTH, GAME_HEIGHT / 2, 56, GAME_HEIGHT, 0xd32f2f, 1).setOrigin(1, 0.5);
    this.dangerEdges = [top, bottom, left, right];
    for (const edge of this.dangerEdges) {
      edge.setAlpha(0);
    }
  }

  private refresh(): void {
    const state = this.gameScene.getState();
    const weapon = WEAPONS[state.player.currentWeaponId];
    const ammoInMag = state.player.ammoInMag[state.player.currentWeaponId] ?? 0;
    const ammoReserve = weapon.infiniteAmmo ? '∞' : state.player.ammoReserve[weapon.ammoType] ?? 0;
    const itemId = state.player.currentItemId;
    const itemCount = itemId ? state.player.items[itemId] ?? 0 : 0;
    const itemLabel = itemId ? ITEMS[itemId as ItemId].name : '无';
    const keybinds = this.gameScene.getKeybinds();
    const healthRatio = state.player.maxHealth > 0 ? state.player.health / state.player.maxHealth : 0;
    const totalWaves = this.gameScene.getWaveTotal();

    this.weaponText.setText(weapon.name);
    this.ammoText.setText(`${ammoInMag}/${weapon.magazineSize}`);
    this.ammoDetailText.setText(this.gameScene.isWeaponReloading()
      ? `换弹中 · ${weapon.reloadTime} ms`
      : `备用 ${ammoReserve} · ${weapon.auto ? '连发' : '点射'}`);

    this.healthText.setText(`生命 ${state.player.health}/${state.player.maxHealth}`);
    this.healthFill.width = 120 * Phaser.Math.Clamp(healthRatio, 0, 1);
    this.healthPulseFill.width = 120;
    this.healthFill.fillColor = healthRatio <= 0.25 ? 0xb71c1c : healthRatio <= 0.55 ? 0xf57f17 : 0xd32f2f;

    this.itemText.setText(itemLabel);
    this.itemDetailText.setText(itemId
      ? `数量 x${itemCount}\n${formatKeybind(keybinds.deployItem)} 布置 / ${formatKeybind(keybinds.nextItem)} 切换`
      : '当前没有可用布置道具');

    this.modeText.setText(this.gameScene.getModeLabel());
    this.levelText.setText(this.gameScene.getLevelLabel());
    this.waveText.setText(totalWaves ? `WAVE ${state.waveIndex}/${totalWaves}` : `WAVE ${state.waveIndex}`);
    this.scoreText.setText(`得分 ${state.score}`);
    this.controlHintText.setText(
      `${formatKeybind(keybinds.pause)} 暂停  ·  ${formatKeybind(keybinds.nextWeapon)}/${formatKeybind(keybinds.prevWeapon)} 切换测试武器`,
    );
    this.pauseBodyText.setText(['战场已冻结', `按 ${formatKeybind(keybinds.pause)} 返回战斗`].join('\n'));
  }

  private refreshBossStatus(): void {
    const boss = this.gameScene.getBossStatus();
    if (!boss) {
      this.bossPanel.setVisible(false);
      return;
    }
    this.bossPanel.setVisible(true);
    this.bossNameText.setText(`BOSS  //  ${boss.name}`);
    const ratio = boss.maxHealth > 0 ? Phaser.Math.Clamp(boss.health / boss.maxHealth, 0, 1) : 0;
    this.bossHealthFill.width = 280 * ratio;
  }

  private showWaveAnnouncement(payload: WaveAnnouncementPayload): void {
    this.announcementTitle.setText(payload.title);
    this.announcementSubtitle.setText(payload.subtitle);
    this.announcementBg.fillColor = payload.accent === 0xff6f4a ? 0x24130f : 0xf4eedd;
    this.announcementTitle.setColor(payload.accent === 0xff6f4a ? '#fff0e6' : '#0f0e13');
    this.announcementTitle.setStroke(payload.accent === 0xff6f4a ? '#ff9f76' : '#fbc02d', 3);
    this.announcementSubtitle.setColor(payload.accent === 0xff6f4a ? '#ffd7c9' : '#39424b');

    this.tweens.killTweensOf(this.announcementContainer);
    this.announcementContainer.setAlpha(0);
    this.announcementContainer.setScale(0.92);
    this.announcementContainer.y = -24;

    this.tweens.add({
      targets: this.announcementContainer,
      alpha: 1,
      scale: 1,
      y: 0,
      ease: 'Back.Out',
      duration: 260,
      hold: 900,
      yoyo: true,
      onYoyo: () => {
        this.announcementContainer.y = 0;
      },
    });
  }

  private showPickupToast(payload: PickupToastPayload): void {
    const bg = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT - 92, 320, 42, 0x0f0e13, 0.9);
    bg.setStrokeStyle(3, payload.accent, 0.95);
    const text = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 92, payload.title, {
      fontFamily: 'Impact, "Arial Black", sans-serif',
      fontSize: '24px',
      color: '#f4eedd',
    }).setOrigin(0.5);

    const toast = this.add.container(0, 0, [bg, text]);
    toast.setAlpha(0);
    this.tweens.add({
      targets: toast,
      alpha: 1,
      y: -24,
      duration: 180,
      hold: 620,
      yoyo: true,
      onComplete: () => toast.destroy(),
    });
  }

  private syncPauseOverlay(paused: boolean): void {
    this.pauseOverlay.setVisible(true);
    this.tweens.killTweensOf(this.pauseOverlay);

    if (paused) {
      this.pauseOverlay.setAlpha(0);
      this.tweens.add({
        targets: this.pauseOverlay,
        alpha: 1,
        duration: 180,
      });
      return;
    }

    this.tweens.add({
      targets: this.pauseOverlay,
      alpha: 0,
      duration: 140,
      onComplete: () => {
        this.pauseOverlay.setVisible(false);
      },
    });
  }

  private handleShutdown(): void {
    for (const eventName of HUD_STATE_EVENTS) {
      this.gameScene.events.off(eventName, this.refresh, this);
    }
    this.gameScene.events.off(EVENTS.waveAnnounced, this.showWaveAnnouncement, this);
    this.gameScene.events.off(EVENTS.pickupCollected, this.showPickupToast, this);
    this.gameScene.events.off(EVENTS.pauseChanged, this.syncPauseOverlay, this);
  }
}
