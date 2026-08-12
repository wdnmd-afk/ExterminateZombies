import Phaser from 'phaser';
import { ITEMS, type ItemId } from '../config/items';
import { EVENTS, GAME_HEIGHT, GAME_WIDTH, SCENES } from '../constants';
import type { GameScene, PauseReason } from './GameScene';
import { configureHighResolutionScene } from '../systems/DisplayManager';
import { EnhancementManager } from '../systems/EnhancementManager';
import { SoundManager } from '../systems/SoundManager';
import { MENU_KEY, formatKeybind } from '../config/keybinds';
import {
  shouldPresentCombatAlert,
  type CombatAlert,
  type CombatAlertTone,
} from '../config/combatAlerts';
import { resolveKillStreakColor } from '../systems/KillStreakRules';
import { PIXEL_FONT_FAMILY } from '../ui/fonts';

interface KillStreakMilestonePayload {
  label: string;
  count: number;
  color: number;
}

interface WaveAnnouncementPayload {
  title: string;
  subtitle: string;
  accent: number;
}

interface PickupToastPayload {
  title: string;
  accent: number;
}

const AMMO_BAR_WIDTH = 238;

const COMBAT_ALERT_STYLES: Record<CombatAlertTone, {
  background: number;
  accent: number;
  title: string;
  subtitle: string;
}> = {
  status: { background: 0x10251f, accent: 0x65c694, title: '#dfffea', subtitle: '#a7d8bb' },
  warning: { background: 0x2b220f, accent: 0xfbc02d, title: '#fff0bd', subtitle: '#d6c382' },
  danger: { background: 0x2b1110, accent: 0xef654d, title: '#ffe1d8', subtitle: '#e9a79a' },
};

/** 暂停菜单的一项。`paint` 由 hover 和「重新打开时复位」共用，避免残留高亮态。 */
interface PauseMenuItem {
  objects: Phaser.GameObjects.GameObject[];
  paint: (hovered: boolean) => void;
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
  private ammoProgressFill!: Phaser.GameObjects.Rectangle;
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
  private bossRecoveryText!: Phaser.GameObjects.Text;

  private announcementContainer!: Phaser.GameObjects.Container;
  private announcementBg!: Phaser.GameObjects.Rectangle;
  private announcementTitle!: Phaser.GameObjects.Text;
  private announcementSubtitle!: Phaser.GameObjects.Text;

  private combatAlertContainer!: Phaser.GameObjects.Container;
  private combatAlertBg!: Phaser.GameObjects.Rectangle;
  private combatAlertTitle!: Phaser.GameObjects.Text;
  private combatAlertSubtitle!: Phaser.GameObjects.Text;
  private combatAlertTween: Phaser.Tweens.Tween | null = null;
  private activeCombatAlert: CombatAlert | null = null;

  private pickupToastContainer!: Phaser.GameObjects.Container;
  private pickupToastBg!: Phaser.GameObjects.Rectangle;
  private pickupToastText!: Phaser.GameObjects.Text;
  private pickupToastTween: Phaser.Tweens.Tween | null = null;

  private killStreakText!: Phaser.GameObjects.Text;
  private killStreakLabel!: Phaser.GameObjects.Text;
  private killStreakTween: Phaser.Tweens.Tween | null = null;
  private milestoneText!: Phaser.GameObjects.Text;
  private milestoneTween: Phaser.Tweens.Tween | null = null;

  private pauseOverlay!: Phaser.GameObjects.Container;
  private readonly pauseMenuItems: PauseMenuItem[] = [];
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
    this.createCombatAlert();
    this.createPickupToast();
    this.createKillStreak();
    this.createPauseOverlay();
    this.createDangerOverlay();

    for (const eventName of HUD_STATE_EVENTS) {
      this.gameScene.events.on(eventName, this.refresh, this);
    }
    this.gameScene.events.on(EVENTS.waveAnnounced, this.showWaveAnnouncement, this);
    this.gameScene.events.on(EVENTS.combatAlert, this.showCombatAlert, this);
    this.gameScene.events.on(EVENTS.pickupCollected, this.showPickupToast, this);
    this.gameScene.events.on(EVENTS.pauseChanged, this.syncPauseOverlay, this);
    this.gameScene.events.on(EVENTS.killStreakChanged, this.showKillStreak, this);
    this.gameScene.events.on(EVENTS.killStreakMilestone, this.showKillStreakMilestone, this);

    // 暂停菜单的数字快捷键。场景自身的 keyboard 插件会在 shutdown 时清掉监听，无需手动摘除。
    this.input.keyboard?.on('keydown-ONE', this.resumeRun, this);
    this.input.keyboard?.on('keydown-TWO', this.leaveToMainMenu, this);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown, this);
    this.refresh();
    this.syncPauseOverlay(this.gameScene.getPauseReason());
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
    if (this.gameScene.getPauseReason() === null) {
      this.refreshAmmoPresentation();
    }
    this.refreshBossStatus();
  }

  private createPanels(): void {
    // 左面板:两栏布局。弹药进度条和生命条各占一行，动态状态不会挤动其它文本。
    const leftPanel = this.add.rectangle(24 + 236, 20 + 78, 472, 156, 0xf4eedd, 0.97);
    leftPanel.setStrokeStyle(4, 0x0f0e13);

    this.add.text(42, 30, 'SURVIVOR', {
      fontFamily: PIXEL_FONT_FAMILY,
      fontSize: '24px',
      color: '#0f0e13',
    });

    this.weaponText = this.add.text(42, 60, '', {
      fontFamily: PIXEL_FONT_FAMILY,
      fontSize: '30px',
      color: '#0f0e13',
    });

    this.ammoText = this.add.text(250, 62, '', {
      fontFamily: PIXEL_FONT_FAMILY,
      fontSize: '28px',
      color: '#0f0e13',
    }).setOrigin(1, 0);

    this.ammoDetailText = this.add.text(42, 96, '', {
      fontFamily: PIXEL_FONT_FAMILY,
      fontSize: '14px',
      color: '#38434b',
    });

    const ammoProgressBg = this.add.rectangle(42, 120, AMMO_BAR_WIDTH, 10, 0x0f0e13, 0.16)
      .setOrigin(0, 0.5);
    ammoProgressBg.setStrokeStyle(1, 0x0f0e13, 0.4);
    this.ammoProgressFill = this.add.rectangle(42, 120, AMMO_BAR_WIDTH, 10, 0x24343c, 0.96)
      .setOrigin(0, 0.5);

    // 生命标签独立一行,血条在其右侧,互不重叠。
    this.healthText = this.add.text(42, 148, '', {
      fontFamily: PIXEL_FONT_FAMILY,
      fontSize: '15px',
      color: '#0f0e13',
    }).setOrigin(0, 0.5);

    const healthBarBg = this.add.rectangle(160, 148, 120, 16, 0x1b1517, 0.16).setOrigin(0, 0.5);
    healthBarBg.setStrokeStyle(2, 0x0f0e13, 0.45);
    this.healthPulseFill = this.add.rectangle(160, 148, 120, 16, 0xf59a8d, 0.14).setOrigin(0, 0.5);
    this.healthFill = this.add.rectangle(160, 148, 120, 16, 0xd32f2f, 0.94).setOrigin(0, 0.5);

    // 右栏:道具,和左栏用一道细分隔线隔开。
    this.add.rectangle(300, 98, 2, 122, 0x0f0e13, 0.25).setOrigin(0.5);

    this.itemText = this.add.text(322, 60, '', {
      fontFamily: PIXEL_FONT_FAMILY,
      fontSize: '24px',
      color: '#0f0e13',
    });
    this.itemDetailText = this.add.text(322, 92, '', {
      fontFamily: PIXEL_FONT_FAMILY,
      fontSize: '14px',
      color: '#38434b',
      lineSpacing: 4,
    });

    const rightPanel = this.add.rectangle(GAME_WIDTH - 24 - 180, 22 + 52, 360, 104, 0x0f0e13, 0.92);
    rightPanel.setStrokeStyle(4, 0xf4eedd, 0.9);

    this.modeText = this.add.text(GAME_WIDTH - 42, 34, '', {
      fontFamily: PIXEL_FONT_FAMILY,
      fontSize: '24px',
      color: '#fbc02d',
    }).setOrigin(1, 0);

    this.levelText = this.add.text(GAME_WIDTH - 42, 64, '', {
      fontFamily: PIXEL_FONT_FAMILY,
      fontSize: '16px',
      color: '#f4eedd',
    }).setOrigin(1, 0);

    this.waveText = this.add.text(GAME_WIDTH - 42, 90, '', {
      fontFamily: PIXEL_FONT_FAMILY,
      fontSize: '28px',
      color: '#f4eedd',
    }).setOrigin(1, 0);

    this.scoreText = this.add.text(GAME_WIDTH - 42, 120, '', {
      fontFamily: PIXEL_FONT_FAMILY,
      fontSize: '16px',
      color: '#f4eedd',
    }).setOrigin(1, 0);

    this.controlHintText = this.add.text(GAME_WIDTH - 42, GAME_HEIGHT - 28, '', {
      fontFamily: PIXEL_FONT_FAMILY,
      fontSize: '15px',
      color: '#fbc02d',
    }).setOrigin(1, 1);
  }

  private createAnnouncement(): void {
    this.announcementBg = this.add.rectangle(GAME_WIDTH / 2, 126, 430, 88, 0xf4eedd, 0.98);
    this.announcementBg.setStrokeStyle(5, 0x0f0e13);
    this.announcementTitle = this.add.text(GAME_WIDTH / 2, 100, '', {
      fontFamily: PIXEL_FONT_FAMILY,
      fontSize: '38px',
      color: '#0f0e13',
      stroke: '#fbc02d',
      strokeThickness: 3,
    }).setOrigin(0.5);
    this.announcementSubtitle = this.add.text(GAME_WIDTH / 2, 136, '', {
      fontFamily: PIXEL_FONT_FAMILY,
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

  private createCombatAlert(): void {
    this.combatAlertBg = this.add.rectangle(GAME_WIDTH / 2, 208, 520, 48, 0x2b220f, 0.97);
    this.combatAlertBg.setStrokeStyle(3, 0xfbc02d, 0.95);
    this.combatAlertTitle = this.add.text(GAME_WIDTH / 2 - 238, 198, '', {
      fontFamily: PIXEL_FONT_FAMILY,
      fontSize: '22px',
      color: '#fff0bd',
    }).setOrigin(0, 0.5);
    this.combatAlertSubtitle = this.add.text(GAME_WIDTH / 2 + 238, 218, '', {
      fontFamily: PIXEL_FONT_FAMILY,
      fontSize: '13px',
      color: '#d6c382',
    }).setOrigin(1, 0.5);

    this.combatAlertContainer = this.add.container(0, -8, [
      this.combatAlertBg,
      this.combatAlertTitle,
      this.combatAlertSubtitle,
    ]);
    this.combatAlertContainer.setAlpha(0);
    this.combatAlertContainer.setVisible(false);
  }

  private createPickupToast(): void {
    this.pickupToastBg = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT - 92, 320, 42, 0x0f0e13, 0.9);
    this.pickupToastBg.setStrokeStyle(3, 0xfbc02d, 0.95);
    this.pickupToastText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 92, '', {
      fontFamily: PIXEL_FONT_FAMILY,
      fontSize: '24px',
      color: '#f4eedd',
    }).setOrigin(0.5);
    this.pickupToastContainer = this.add.container(0, 0, [this.pickupToastBg, this.pickupToastText]);
    this.pickupToastContainer.setAlpha(0);
    this.pickupToastContainer.setVisible(false);
  }

  /**
   * 连杀计数与里程碑播报。
   *
   * 计数放在右侧状态板下方，避免和波次横幅（y=126）与战斗警报（y=208）抢位置；
   * 里程碑大字放在画布中线偏上（y=300），战斗中不会与这两者同时出现。
   */
  private createKillStreak(): void {
    this.killStreakLabel = this.add.text(GAME_WIDTH - 42, 152, '连杀', {
      fontFamily: PIXEL_FONT_FAMILY,
      fontSize: '13px',
      color: '#8d9298',
    }).setOrigin(1, 0);
    this.killStreakText = this.add.text(GAME_WIDTH - 42, 168, '', {
      fontFamily: PIXEL_FONT_FAMILY,
      fontSize: '34px',
      color: '#f4eedd',
      stroke: '#0f0e13',
      strokeThickness: 4,
    }).setOrigin(1, 0);
    this.killStreakLabel.setVisible(false);
    this.killStreakText.setVisible(false);

    this.milestoneText = this.add.text(GAME_WIDTH / 2, 300, '', {
      fontFamily: PIXEL_FONT_FAMILY,
      fontSize: '58px',
      color: '#ffd54a',
      stroke: '#0f0e13',
      strokeThickness: 8,
    }).setOrigin(0.5);
    this.milestoneText.setVisible(false);
    this.milestoneText.setAlpha(0);
  }

  private createBossPanel(): void {
    // 左右状态板之间的空隙中心在 x=696；放在画布正中会压住左侧生命面板。
    const bossCenterX = GAME_WIDTH / 2 + 56;
    const background = this.add.rectangle(bossCenterX, 40, 390, 50, 0x130f11, 0.94);
    background.setStrokeStyle(3, 0xef725f, 0.85);
    this.bossNameText = this.add.text(bossCenterX, 25, '', {
      fontFamily: PIXEL_FONT_FAMILY,
      fontStyle: 'bold',
      fontSize: '14px',
      color: '#ffe2d8',
    }).setOrigin(0.5);
    this.bossRecoveryText = this.add.text(bossCenterX, 68, '', { fontFamily: PIXEL_FONT_FAMILY, fontSize: '12px', color: '#9ff0b3' }).setOrigin(0.5);
    const healthBackground = this.add.rectangle(bossCenterX - 160, 51, 320, 11, 0x2a1a1c).setOrigin(0, 0.5);
    this.bossHealthFill = this.add.rectangle(bossCenterX - 160, 51, 320, 11, 0xd94a3a).setOrigin(0, 0.5);
    this.bossPanel = this.add.container(0, 0, [background, this.bossNameText, healthBackground, this.bossHealthFill, this.bossRecoveryText]);
    this.bossPanel.setVisible(false);
  }

  private createPauseOverlay(): void {
    // HUD 场景实例会跨局复用，重新 create 时旧菜单项指向已销毁的对象，必须先清空。
    this.pauseMenuItems.length = 0;
    const shade = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x09080b, 0.66);
    const board = this.add.rectangle(GAME_WIDTH / 2, 368, 440, 264, 0xf4eedd, 0.98);
    board.setStrokeStyle(5, 0x0f0e13);
    const title = this.add.text(GAME_WIDTH / 2, 286, 'PAUSED', {
      fontFamily: PIXEL_FONT_FAMILY,
      fontSize: '52px',
      color: '#0f0e13',
      stroke: '#fbc02d',
      strokeThickness: 5,
    }).setOrigin(0.5);
    const body = this.add.text(GAME_WIDTH / 2, 326, '战场已冻结', {
      fontFamily: PIXEL_FONT_FAMILY,
      fontSize: '17px',
      color: '#39424b',
    }).setOrigin(0.5);

    const resume = this.createPauseMenuItem(376, '继续游戏', '1', this.resumeRun);
    const home = this.createPauseMenuItem(436, '返回主页', '2', this.leaveToMainMenu);
    this.pauseMenuItems.push(resume, home);

    const hint = this.add.text(GAME_WIDTH / 2, 480, `${formatKeybind(MENU_KEY)} 也可直接继续战斗`, {
      fontFamily: PIXEL_FONT_FAMILY,
      fontSize: '13px',
      color: '#6c757c',
    }).setOrigin(0.5);

    this.pauseOverlay = this.add.container(0, 0, [
      shade, board, title, body,
      ...resume.objects, ...home.objects, hint,
    ]);
    // 容器隐藏时子对象不参与命中测试，所以抽卡界面期间不会留下可点击的幽灵按钮。
    this.pauseOverlay.setVisible(false);
    this.pauseOverlay.setAlpha(0);
  }

  private createPauseMenuItem(
    y: number,
    label: string,
    shortcut: string,
    onSelect: () => void,
  ): PauseMenuItem {
    const box = this.add.rectangle(GAME_WIDTH / 2, y, 300, 50, 0x1d1d24);
    box.setStrokeStyle(3, 0x0f0e13);
    const text = this.add.text(GAME_WIDTH / 2 - 18, y, label, {
      fontFamily: PIXEL_FONT_FAMILY,
      fontSize: '25px',
      color: '#f4eedd',
    }).setOrigin(0.5);
    const key = this.add.text(GAME_WIDTH / 2 + 132, y, `[${shortcut}]`, {
      fontFamily: PIXEL_FONT_FAMILY,
      fontSize: '14px',
      color: '#fbc02d',
    }).setOrigin(1, 0.5);

    const paint = (hovered: boolean): void => {
      box.fillColor = hovered ? 0xfbc02d : 0x1d1d24;
      text.setColor(hovered ? '#0f0e13' : '#f4eedd');
      key.setColor(hovered ? '#5c4a12' : '#fbc02d');
    };

    box.setInteractive({ useHandCursor: true })
      .on('pointerover', () => {
        paint(true);
        SoundManager.play('uiMove');
      })
      .on('pointerout', () => paint(false))
      .on('pointerup', onSelect, this);

    return { objects: [box, text, key], paint };
  }

  /** 暂停菜单第一项。菜单未打开时忽略，避免数字键在战斗中误触。 */
  private resumeRun(): void {
    if (!this.isPauseMenuOpen()) return;
    SoundManager.play('uiConfirm');
    this.gameScene.resumeFromMenu();
  }

  /** 暂停菜单第二项：挂起本局回到主页，战局由主页的「继续游戏」接回。 */
  private leaveToMainMenu(): void {
    if (!this.isPauseMenuOpen()) return;
    SoundManager.play('uiConfirm');
    this.gameScene.suspendToMainMenu();
  }

  private isPauseMenuOpen(): boolean {
    return this.gameScene.getPauseReason() === 'menu';
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
    const itemId = state.player.currentItemId;
    const itemCount = itemId ? state.player.items[itemId] ?? 0 : 0;
    const itemLabel = itemId ? ITEMS[itemId as ItemId].name : '无';
    const keybinds = this.gameScene.getKeybinds();
    const healthRatio = state.player.maxHealth > 0 ? state.player.health / state.player.maxHealth : 0;
    const totalWaves = this.gameScene.getWaveTotal();

    this.refreshAmmoPresentation();

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
    this.scoreText.setText(`得分 ${state.score}  ·  强化 ${state.player.activeEnhancements.size}/2`);
    this.controlHintText.setText(
      `${formatKeybind(MENU_KEY)} 菜单  ·  ${formatKeybind(keybinds.nextWeapon)}/${formatKeybind(keybinds.prevWeapon)} 切换武器`,
    );
  }

  private refreshAmmoPresentation(): void {
    const state = this.gameScene.getState();
    // 必须读强化后的定义，否则「连射改造」「加长弹匣」这类卡在 HUD 上不会体现。
    const weapon = EnhancementManager.resolveWeaponDef(
      state.player.currentWeaponId,
      state.player.activeEnhancements,
    );
    const ammoInMag = state.player.ammoInMag[state.player.currentWeaponId] ?? 0;
    const ammoReserve = weapon.infiniteAmmo ? '∞' : state.player.ammoReserve[weapon.ammoType] ?? 0;
    const reload = this.gameScene.getWeaponReloadStatus();

    this.weaponText.setText(weapon.name);
    this.ammoText.setText(`${ammoInMag}/${weapon.magazineSize}`);

    if (reload) {
      // 逐发填装的进度条读弹匣填充度而不是单发计时：玩家关心的是「现在有几发能打」，
      // 而不是当前这一发装到哪了。
      if (weapon.reloadMode === 'shell') {
        this.ammoDetailText.setText(`逐发装填 ${ammoInMag}/${weapon.magazineSize} · 开火可打断`);
        this.ammoText.setColor('#137887');
        this.ammoProgressFill.fillColor = 0x1b9db0;
        this.ammoProgressFill.width = AMMO_BAR_WIDTH * Phaser.Math.Clamp(
          weapon.magazineSize > 0 ? ammoInMag / weapon.magazineSize : 0,
          0,
          1,
        );
        return;
      }
      this.ammoDetailText.setText(`换弹中 · ${(reload.remaining / 1000).toFixed(1)} s`);
      this.ammoText.setColor('#137887');
      this.ammoProgressFill.fillColor = 0x1b9db0;
      this.ammoProgressFill.width = AMMO_BAR_WIDTH * reload.progress;
      return;
    }

    const ammoRatio = weapon.magazineSize > 0 ? ammoInMag / weapon.magazineSize : 0;
    this.ammoDetailText.setText(`备用 ${ammoReserve} · ${weapon.auto ? '连发' : '点射'}`);
    this.ammoProgressFill.width = AMMO_BAR_WIDTH * Phaser.Math.Clamp(ammoRatio, 0, 1);
    if (ammoInMag <= 0) {
      this.ammoText.setColor('#b71c1c');
      this.ammoProgressFill.fillColor = 0xc33d30;
    } else if (ammoRatio <= 0.25) {
      this.ammoText.setColor('#a86400');
      this.ammoProgressFill.fillColor = 0xe59a18;
    } else {
      this.ammoText.setColor('#0f0e13');
      this.ammoProgressFill.fillColor = 0x24343c;
    }
  }

  private refreshBossStatus(): void {
    const boss = this.gameScene.getBossStatus();
    if (!boss) {
      this.bossPanel.setVisible(false);
      return;
    }
    this.bossPanel.setVisible(true);
    const phaseLabel = boss.phase && boss.totalPhases && boss.phaseLabel
      ? `  //  P${boss.phase}/${boss.totalPhases} ${boss.phaseLabel}`
      : '';
    this.bossNameText.setText(`BOSS  //  ${boss.name}${phaseLabel}`);
    const ratio = boss.maxHealth > 0 ? Phaser.Math.Clamp(boss.health / boss.maxHealth, 0, 1) : 0;
    this.bossHealthFill.width = 320 * ratio;
    this.bossHealthFill.fillColor = boss.phase && boss.phase > 1 ? 0xf57f17 : 0xd94a3a;
    this.bossRecoveryText.setText(boss.recovery.active ? `破绽窗口 ${(boss.recovery.remaining / 1000).toFixed(1)}s` : '');
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

  private showCombatAlert(payload: CombatAlert): void {
    if (!shouldPresentCombatAlert(this.activeCombatAlert, payload)) return;

    const style = COMBAT_ALERT_STYLES[payload.tone];
    this.activeCombatAlert = payload;
    this.combatAlertBg.fillColor = style.background;
    this.combatAlertBg.setStrokeStyle(3, style.accent, 0.95);
    this.combatAlertTitle.setText(payload.title).setColor(style.title);
    this.combatAlertSubtitle.setText(payload.subtitle).setColor(style.subtitle);

    this.tweens.killTweensOf(this.combatAlertContainer);
    this.combatAlertTween = null;
    this.combatAlertContainer.setVisible(true);
    this.combatAlertContainer.setAlpha(0);
    this.combatAlertContainer.y = -8;

    const fadeDuration = Math.min(130, Math.max(80, Math.floor(payload.duration / 3)));
    const holdDuration = Math.max(0, payload.duration - fadeDuration * 2);
    this.combatAlertTween = this.tweens.add({
      targets: this.combatAlertContainer,
      alpha: 1,
      y: 0,
      duration: fadeDuration,
      hold: holdDuration,
      yoyo: true,
      ease: 'Cubic.Out',
      onComplete: () => {
        this.combatAlertContainer.setVisible(false);
        this.activeCombatAlert = null;
        this.combatAlertTween = null;
      },
    });

    if (this.gameScene.getPauseReason() !== null) {
      this.combatAlertTween.pause();
    }
  }

  /** 连杀计数。0 时整块隐藏，避免非战斗状态留一个空标签。 */
  private showKillStreak(streak: number): void {
    if (streak <= 1) {
      this.killStreakLabel.setVisible(false);
      this.killStreakText.setVisible(false);
      this.tweens.killTweensOf(this.killStreakText);
      this.killStreakTween = null;
      return;
    }

    this.killStreakLabel.setVisible(true);
    this.killStreakText.setVisible(true);
    this.killStreakText.setText(`×${streak}`);
    this.killStreakText.setColor(`#${resolveKillStreakColor(streak).toString(16).padStart(6, '0')}`);

    this.tweens.killTweensOf(this.killStreakText);
    this.killStreakText.setScale(1.3);
    this.killStreakTween = this.tweens.add({
      targets: this.killStreakText,
      scale: 1,
      duration: 150,
      ease: 'Back.Out',
    });

    if (this.gameScene.getPauseReason() !== null) {
      this.killStreakTween.pause();
    }
  }

  private showKillStreakMilestone(payload: KillStreakMilestonePayload): void {
    this.milestoneText.setText(payload.label);
    this.milestoneText.setColor(`#${payload.color.toString(16).padStart(6, '0')}`);

    this.tweens.killTweensOf(this.milestoneText);
    this.milestoneTween = null;
    this.milestoneText.setVisible(true);
    this.milestoneText.setAlpha(0);
    this.milestoneText.setScale(0.6);
    this.milestoneTween = this.tweens.add({
      targets: this.milestoneText,
      alpha: 1,
      scale: 1,
      duration: 180,
      hold: 620,
      yoyo: true,
      ease: 'Back.Out',
      onComplete: () => {
        this.milestoneText.setVisible(false);
        this.milestoneTween = null;
      },
    });

    if (this.gameScene.getPauseReason() !== null) {
      this.milestoneTween.pause();
    }
  }

  private showPickupToast(payload: PickupToastPayload): void {
    this.pickupToastBg.setStrokeStyle(3, payload.accent, 0.95);
    this.pickupToastText.setText(payload.title);
    this.tweens.killTweensOf(this.pickupToastContainer);
    this.pickupToastTween = null;
    this.pickupToastContainer.setVisible(true);
    this.pickupToastContainer.setAlpha(0);
    this.pickupToastContainer.y = 0;
    this.pickupToastTween = this.tweens.add({
      targets: this.pickupToastContainer,
      alpha: 1,
      y: -24,
      duration: 180,
      hold: 620,
      yoyo: true,
      onComplete: () => {
        this.pickupToastContainer.setVisible(false);
        this.pickupToastTween = null;
      },
    });

    if (this.gameScene.getPauseReason() !== null) {
      this.pickupToastTween.pause();
    }
  }

  private syncPauseOverlay(reason: PauseReason | null): void {
    this.tweens.killTweensOf(this.pauseOverlay);
    if (reason !== null) {
      this.combatAlertTween?.pause();
      this.pickupToastTween?.pause();
      this.killStreakTween?.pause();
      this.milestoneTween?.pause();
    } else {
      this.combatAlertTween?.resume();
      this.pickupToastTween?.resume();
      this.killStreakTween?.resume();
      this.milestoneTween?.resume();
      this.refreshAmmoPresentation();
    }

    // 只有 ESC 菜单会显示暂停界面。抽卡同样冻结战场，但它自带界面，
    // 再叠一层菜单只会压在卡片下面。
    if (reason !== 'menu') {
      this.pauseOverlay.setVisible(false);
      this.pauseOverlay.setAlpha(0);
      return;
    }

    for (const item of this.pauseMenuItems) {
      item.paint(false);
    }
    this.pauseOverlay.setVisible(true);
    this.pauseOverlay.setAlpha(0);
    this.tweens.add({
      targets: this.pauseOverlay,
      alpha: 1,
      duration: 160,
    });
  }

  private handleShutdown(): void {
    for (const eventName of HUD_STATE_EVENTS) {
      this.gameScene.events.off(eventName, this.refresh, this);
    }
    this.gameScene.events.off(EVENTS.waveAnnounced, this.showWaveAnnouncement, this);
    this.gameScene.events.off(EVENTS.combatAlert, this.showCombatAlert, this);
    this.gameScene.events.off(EVENTS.pickupCollected, this.showPickupToast, this);
    this.gameScene.events.off(EVENTS.pauseChanged, this.syncPauseOverlay, this);
    this.gameScene.events.off(EVENTS.killStreakChanged, this.showKillStreak, this);
    this.gameScene.events.off(EVENTS.killStreakMilestone, this.showKillStreakMilestone, this);
  }
}
