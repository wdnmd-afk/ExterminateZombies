import Phaser from 'phaser';
import { ITEMS, type ItemId } from '../config/items';
import { EVENTS, GAME_HEIGHT, GAME_WIDTH, SCENES } from '../constants';
import type { GameScene, PauseReason } from './GameScene';
import {
  configureHighResolutionScene,
  DISPLAY_HAS_HUD_SIDEBARS,
  DISPLAY_SIDEBAR_WIDTH,
} from '../systems/DisplayManager';
import { EnhancementManager } from '../systems/EnhancementManager';
import { SoundManager } from '../systems/SoundManager';
import { MENU_KEY, formatKeybind } from '../config/keybinds';
import {
  shouldPresentCombatAlert,
  type CombatAlert,
  type CombatAlertTone,
} from '../config/combatAlerts';
import { resolveKillStreakColor } from '../systems/KillStreakRules';
import { UI_FONT_FAMILY } from '../ui/fonts';
import { isDeveloperCheatEnabled } from '../systems/DeveloperCheats';
import { fitTextWidth } from '../ui/layout';
import { WEAPONS, type WeaponId } from '../config/weapons';
import { GAME_WEAPON_TEXTURE_KEYS } from '../systems/WeaponAssetManager';
import { PROP_TEXTURE_KEYS } from '../systems/EnvironmentAssetManager';

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

const USE_SIDE_HUD = DISPLAY_HAS_HUD_SIDEBARS;
const SIDE_PANEL_MARGIN = 12;
const SIDE_PANEL_MAX_WIDTH = 220;
const SIDE_PANEL_WIDTH = Math.max(0, Math.min(
  SIDE_PANEL_MAX_WIDTH,
  DISPLAY_SIDEBAR_WIDTH - SIDE_PANEL_MARGIN * 2,
));

const ARSENAL_COLUMNS = USE_SIDE_HUD ? 1 : 4;
const ARSENAL_SLOT_HEIGHT = 40;
const ARSENAL_SLOT_GAP = 4;
const ARSENAL_DISPLAY_MS = 1800;
const CONTROL_HINT_DISPLAY_MS = 3200;

interface ArsenalSlotRefs {
  container: Phaser.GameObjects.Container;
  box: Phaser.GameObjects.Rectangle;
  image: Phaser.GameObjects.Image;
  index: Phaser.GameObjects.Text;
  name: Phaser.GameObjects.Text;
  ammo: Phaser.GameObjects.Text;
  reloadBg: Phaser.GameObjects.Rectangle;
  reloadFill: Phaser.GameObjects.Rectangle;
}

/** 左侧状态板几何。 */
const LEFT_PANEL_LEFT = USE_SIDE_HUD ? -DISPLAY_SIDEBAR_WIDTH + SIDE_PANEL_MARGIN : 20;
const LEFT_PANEL_WIDTH = USE_SIDE_HUD ? SIDE_PANEL_WIDTH : 400;
const LEFT_PANEL_HEIGHT = USE_SIDE_HUD ? 220 : 104;
const LEFT_PANEL_TOP = 18;
const LEFT_PANEL_PADDING_X = USE_SIDE_HUD ? 12 : 14;
const LEFT_PANEL_TEXT_LEFT = LEFT_PANEL_LEFT + LEFT_PANEL_PADDING_X;
const LEFT_COLUMN_MAX_WIDTH = USE_SIDE_HUD ? LEFT_PANEL_WIDTH - LEFT_PANEL_PADDING_X * 2 : 238;
const ITEM_COLUMN_LEFT = USE_SIDE_HUD ? LEFT_PANEL_TEXT_LEFT + 52 : LEFT_PANEL_LEFT + 330;
const ITEM_COLUMN_MAX_WIDTH = LEFT_PANEL_LEFT + LEFT_PANEL_WIDTH - LEFT_PANEL_PADDING_X - ITEM_COLUMN_LEFT;
const AMMO_BAR_WIDTH = USE_SIDE_HUD ? LEFT_COLUMN_MAX_WIDTH : 232;
const HEALTH_BAR_WIDTH = USE_SIDE_HUD ? LEFT_COLUMN_MAX_WIDTH : 120;
const ARSENAL_SLOT_WIDTH = USE_SIDE_HUD ? LEFT_PANEL_WIDTH - 16 : 96;
const ARSENAL_SLOT_TEXT_WIDTH = ARSENAL_SLOT_WIDTH - 52;
const COMBAT_ALERT_WIDTH = 440;
const COMBAT_ALERT_LEFT = GAME_WIDTH / 2 - COMBAT_ALERT_WIDTH / 2;
const COMBAT_ALERT_CENTER_X = COMBAT_ALERT_LEFT + COMBAT_ALERT_WIDTH / 2;

/** 右侧状态板几何。常态只占两行，不覆盖右上战场。 */
const RIGHT_PANEL_RIGHT = USE_SIDE_HUD
  ? GAME_WIDTH + DISPLAY_SIDEBAR_WIDTH - SIDE_PANEL_MARGIN
  : GAME_WIDTH - 20;
const RIGHT_PANEL_WIDTH = USE_SIDE_HUD ? SIDE_PANEL_WIDTH : 330;
const RIGHT_PANEL_HEIGHT = USE_SIDE_HUD ? 132 : 64;
const RIGHT_PANEL_PADDING_X = USE_SIDE_HUD ? 12 : 14;
const RIGHT_PANEL_TOP = 18;
const RIGHT_PANEL_TEXT_RIGHT = RIGHT_PANEL_RIGHT - RIGHT_PANEL_PADDING_X;
const RIGHT_PANEL_TEXT_LEFT = RIGHT_PANEL_RIGHT - RIGHT_PANEL_WIDTH + RIGHT_PANEL_PADDING_X;
const RIGHT_PANEL_TEXT_MAX_WIDTH = RIGHT_PANEL_WIDTH - RIGHT_PANEL_PADDING_X * 2;
const BOSS_HEALTH_WIDTH = USE_SIDE_HUD ? RIGHT_PANEL_WIDTH - 28 : 320;

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
  label: Phaser.GameObjects.Text;
  paint: (hovered: boolean) => void;
}

const HUD_STATE_EVENTS = [
  EVENTS.healthChanged,
  EVENTS.ammoChanged,
  EVENTS.itemChanged,
  EVENTS.scoreChanged,
  EVENTS.waveChanged,
] as const;

export class HUDScene extends Phaser.Scene {
  private gameScene!: GameScene;

  private leftPanel!: Phaser.GameObjects.Rectangle;
  private weaponText!: Phaser.GameObjects.Text;
  private ammoText!: Phaser.GameObjects.Text;
  private ammoDetailText!: Phaser.GameObjects.Text;
  private ammoProgressFill!: Phaser.GameObjects.Rectangle;
  private healthText!: Phaser.GameObjects.Text;
  private healthFill!: Phaser.GameObjects.Rectangle;
  private healthPulseFill!: Phaser.GameObjects.Rectangle;
  private itemIcon!: Phaser.GameObjects.Image;
  private itemText!: Phaser.GameObjects.Text;
  private itemDetailText!: Phaser.GameObjects.Text;
  private arsenalPanel!: Phaser.GameObjects.Rectangle;
  private arsenalContainer!: Phaser.GameObjects.Container;
  private arsenalHideCall: Phaser.Time.TimerEvent | null = null;
  private readonly arsenalSlots: ArsenalSlotRefs[] = [];
  private readonly previousWeaponUsability = new Map<WeaponId, boolean>();
  private rightPanel!: Phaser.GameObjects.Rectangle;
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
  private pauseAudioText!: Phaser.GameObjects.Text;
  private controlHintText!: Phaser.GameObjects.Text;
  private controlHintHideCall: Phaser.Time.TimerEvent | null = null;
  private dangerEdges: Phaser.GameObjects.Rectangle[] = [];

  constructor() {
    super(SCENES.hud);
  }

  create(): void {
    configureHighResolutionScene(this, { includeSidebars: true });
    this.gameScene = this.scene.get(SCENES.game) as GameScene;

    this.createPanels();
    this.createArsenal();
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
    this.gameScene.events.on(EVENTS.weaponChanged, this.handleWeaponChanged, this);
    this.gameScene.events.on(EVENTS.waveAnnounced, this.showWaveAnnouncement, this);
    this.gameScene.events.on(EVENTS.combatAlert, this.showCombatAlert, this);
    this.gameScene.events.on(EVENTS.pickupCollected, this.showPickupToast, this);
    this.gameScene.events.on(EVENTS.pauseChanged, this.syncPauseOverlay, this);
    this.gameScene.events.on(EVENTS.killStreakChanged, this.showKillStreak, this);
    this.gameScene.events.on(EVENTS.killStreakMilestone, this.showKillStreakMilestone, this);

    // 暂停菜单的数字快捷键。场景自身的 keyboard 插件会在 shutdown 时清掉监听，无需手动摘除。
    this.input.keyboard?.on('keydown-ONE', this.resumeRun, this);
    this.input.keyboard?.on('keydown-TWO', this.leaveToMainMenu, this);
    this.input.keyboard?.on('keydown-M', this.toggleAudio, this);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown, this);
    this.refresh();
    this.showArsenal();
    this.showControlHint();
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
      this.refreshArsenal(false);
    }
    this.refreshBossStatus();
  }

  private createPanels(): void {
    this.leftPanel = this.add.rectangle(
      LEFT_PANEL_LEFT + LEFT_PANEL_WIDTH / 2,
      LEFT_PANEL_TOP,
      LEFT_PANEL_WIDTH,
      LEFT_PANEL_HEIGHT,
      0x101116,
      0.82,
    );
    this.leftPanel.setOrigin(0.5, 0);
    this.leftPanel.setStrokeStyle(2, 0xf4eedd, 0.42);

    this.add.text(LEFT_PANEL_TEXT_LEFT, LEFT_PANEL_TOP + 10, '生命', {
      fontFamily: UI_FONT_FAMILY,
      fontSize: '13px',
      color: '#bfc3c8',
    });

    this.weaponText = this.add.text(
      LEFT_PANEL_TEXT_LEFT,
      LEFT_PANEL_TOP + (USE_SIDE_HUD ? 50 : 36),
      '',
      {
      fontFamily: UI_FONT_FAMILY,
      fontSize: '22px',
      color: '#f4eedd',
      },
    );

    this.ammoText = this.add.text(
      USE_SIDE_HUD ? LEFT_PANEL_TEXT_LEFT : LEFT_PANEL_TEXT_LEFT + LEFT_COLUMN_MAX_WIDTH,
      LEFT_PANEL_TOP + (USE_SIDE_HUD ? 79 : 35),
      '',
      {
      fontFamily: UI_FONT_FAMILY,
      fontSize: '22px',
      color: '#f4eedd',
      },
    ).setOrigin(USE_SIDE_HUD ? 0 : 1, 0);

    this.ammoDetailText = this.add.text(
      LEFT_PANEL_TEXT_LEFT,
      LEFT_PANEL_TOP + (USE_SIDE_HUD ? 109 : 68),
      '',
      {
      fontFamily: UI_FONT_FAMILY,
      fontSize: '12px',
      color: '#aab2b8',
      },
    );

    const ammoBarY = LEFT_PANEL_TOP + (USE_SIDE_HUD ? 132 : 91);
    this.add.rectangle(LEFT_PANEL_TEXT_LEFT, ammoBarY, AMMO_BAR_WIDTH, 6, 0xffffff, 0.14)
      .setOrigin(0, 0.5);
    this.ammoProgressFill = this.add.rectangle(LEFT_PANEL_TEXT_LEFT, ammoBarY, AMMO_BAR_WIDTH, 6, 0x65c694, 0.96)
      .setOrigin(0, 0.5);

    this.healthText = this.add.text(
      USE_SIDE_HUD ? LEFT_PANEL_TEXT_LEFT + LEFT_COLUMN_MAX_WIDTH : LEFT_PANEL_TEXT_LEFT + 39,
      LEFT_PANEL_TOP + 9,
      '',
      {
      fontFamily: UI_FONT_FAMILY,
      fontSize: '13px',
      color: '#f4eedd',
      },
    ).setOrigin(USE_SIDE_HUD ? 1 : 0, 0);

    const healthBarX = USE_SIDE_HUD ? LEFT_PANEL_TEXT_LEFT : LEFT_PANEL_TEXT_LEFT + 112;
    const healthBarY = LEFT_PANEL_TOP + (USE_SIDE_HUD ? 38 : 18);
    this.add.rectangle(healthBarX, healthBarY, HEALTH_BAR_WIDTH, 8, 0xffffff, 0.14).setOrigin(0, 0.5);
    this.healthPulseFill = this.add.rectangle(healthBarX, healthBarY, HEALTH_BAR_WIDTH, 8, 0xf59a8d, 0.18).setOrigin(0, 0.5);
    this.healthFill = this.add.rectangle(healthBarX, healthBarY, HEALTH_BAR_WIDTH, 8, 0xd9574e, 0.98).setOrigin(0, 0.5);

    if (USE_SIDE_HUD) {
      this.add.rectangle(LEFT_PANEL_TEXT_LEFT, LEFT_PANEL_TOP + 148, LEFT_COLUMN_MAX_WIDTH, 1, 0xf4eedd, 0.18)
        .setOrigin(0, 0.5);
    } else {
      this.add.rectangle(LEFT_PANEL_LEFT + 288, LEFT_PANEL_TOP + 12, 1, LEFT_PANEL_HEIGHT - 24, 0xf4eedd, 0.18)
        .setOrigin(0.5, 0);
    }

    this.itemIcon = this.add.image(
      USE_SIDE_HUD ? LEFT_PANEL_TEXT_LEFT + 17 : LEFT_PANEL_LEFT + 308,
      LEFT_PANEL_TOP + (USE_SIDE_HUD ? 184 : 52),
      PROP_TEXTURE_KEYS.mine,
    );
    this.itemIcon.setDisplaySize(32, 32);
    this.itemText = this.add.text(ITEM_COLUMN_LEFT, LEFT_PANEL_TOP + (USE_SIDE_HUD ? 163 : 31), '', {
      fontFamily: UI_FONT_FAMILY,
      fontSize: '16px',
      color: '#f4eedd',
    });
    this.itemDetailText = this.add.text(ITEM_COLUMN_LEFT, LEFT_PANEL_TOP + (USE_SIDE_HUD ? 190 : 58), '', {
      fontFamily: UI_FONT_FAMILY,
      fontSize: '13px',
      color: '#fbc02d',
    });

    this.rightPanel = this.add.rectangle(
      RIGHT_PANEL_RIGHT - RIGHT_PANEL_WIDTH / 2,
      RIGHT_PANEL_TOP,
      RIGHT_PANEL_WIDTH,
      RIGHT_PANEL_HEIGHT,
      0x101116,
      0.82,
    );
    this.rightPanel.setOrigin(0.5, 0);
    this.rightPanel.setStrokeStyle(2, 0xf4eedd, 0.42);

    this.modeText = this.add.text(RIGHT_PANEL_TEXT_LEFT, RIGHT_PANEL_TOP + (USE_SIDE_HUD ? 10 : 8), '', {
      fontFamily: UI_FONT_FAMILY,
      fontSize: '13px',
      color: '#fbc02d',
    });

    this.levelText = this.add.text(USE_SIDE_HUD ? RIGHT_PANEL_TEXT_LEFT : RIGHT_PANEL_TEXT_RIGHT, RIGHT_PANEL_TOP + (USE_SIDE_HUD ? 35 : 8), '', {
      fontFamily: UI_FONT_FAMILY,
      fontSize: '12px',
      color: '#aab2b8',
    }).setOrigin(USE_SIDE_HUD ? 0 : 1, 0);

    this.waveText = this.add.text(RIGHT_PANEL_TEXT_LEFT, RIGHT_PANEL_TOP + (USE_SIDE_HUD ? 60 : 33), '', {
      fontFamily: UI_FONT_FAMILY,
      fontSize: '20px',
      color: '#f4eedd',
    });

    this.scoreText = this.add.text(USE_SIDE_HUD ? RIGHT_PANEL_TEXT_LEFT : RIGHT_PANEL_TEXT_RIGHT, RIGHT_PANEL_TOP + (USE_SIDE_HUD ? 96 : 36), '', {
      fontFamily: UI_FONT_FAMILY,
      fontSize: '13px',
      color: '#d7d4cb',
    }).setOrigin(USE_SIDE_HUD ? 0 : 1, 0);

    this.controlHintText = this.add.text(
      USE_SIDE_HUD ? RIGHT_PANEL_TEXT_LEFT : GAME_WIDTH - 24,
      GAME_HEIGHT - 22,
      '',
      {
      fontFamily: UI_FONT_FAMILY,
      fontSize: USE_SIDE_HUD ? '12px' : '13px',
      color: '#d7d4cb',
      backgroundColor: '#101116cc',
      padding: { x: 10, y: 6 },
      wordWrap: USE_SIDE_HUD
        ? { width: Math.max(80, RIGHT_PANEL_TEXT_MAX_WIDTH - 20), useAdvancedWrap: true }
        : undefined,
      },
    ).setOrigin(USE_SIDE_HUD ? 0 : 1, 1);
    this.controlHintText.setAlpha(0).setVisible(false);
  }

  private createArsenal(): void {
    this.arsenalPanel = this.add.rectangle(LEFT_PANEL_LEFT, LEFT_PANEL_TOP + LEFT_PANEL_HEIGHT + 8, 1, 1, 0x101116, 0.9)
      .setOrigin(0, 0)
      .setStrokeStyle(2, 0xf4eedd, 0.36);
    this.arsenalSlots.length = 0;
    this.previousWeaponUsability.clear();

    for (let index = 0; index < 8; index++) {
      const box = this.add.rectangle(0, 0, ARSENAL_SLOT_WIDTH, ARSENAL_SLOT_HEIGHT, 0x23252b, 0.96)
        .setOrigin(0, 0)
        .setStrokeStyle(1, 0xf4eedd, 0.2);
      const slotNumber = this.add.text(6, 4, String(index + 1), {
        fontFamily: UI_FONT_FAMILY,
        fontSize: '10px',
        color: '#aab2b8',
      });
      const image = this.add.image(27, 21, GAME_WEAPON_TEXTURE_KEYS.pistol).setVisible(false);
      const name = this.add.text(45, 4, '', {
        fontFamily: UI_FONT_FAMILY,
        fontSize: '10px',
        color: '#f4eedd',
      });
      const ammo = this.add.text(45, 21, '--', {
        fontFamily: UI_FONT_FAMILY,
        fontSize: '11px',
        color: '#aab2b8',
      });
      const reloadBg = this.add.rectangle(45, 36, ARSENAL_SLOT_TEXT_WIDTH, 3, 0xf4eedd, 0.16)
        .setOrigin(0, 0.5)
        .setVisible(false);
      const reloadFill = this.add.rectangle(45, 36, ARSENAL_SLOT_TEXT_WIDTH, 3, 0x58c9dd, 0.95)
        .setOrigin(0, 0.5)
        .setVisible(false);
      const container = this.add.container(0, 0, [box, slotNumber, image, name, ammo, reloadBg, reloadFill]);
      this.arsenalSlots.push({
        container,
        box,
        image,
        index: slotNumber,
        name,
        ammo,
        reloadBg,
        reloadFill,
      });
    }
    this.arsenalContainer = this.add.container(0, 0, [
      this.arsenalPanel,
      ...this.arsenalSlots.map((slot) => slot.container),
    ]);
    this.arsenalContainer.setVisible(false).setAlpha(0);
  }

  private layoutArsenal(statusCount: number): void {
    const visibleCount = Phaser.Math.Clamp(statusCount, 0, this.arsenalSlots.length);
    const columns = Math.max(1, Math.min(ARSENAL_COLUMNS, visibleCount));
    const rows = Math.max(1, Math.ceil(visibleCount / ARSENAL_COLUMNS));
    const padding = 8;
    const panelWidth = columns * ARSENAL_SLOT_WIDTH + (columns - 1) * ARSENAL_SLOT_GAP + padding * 2;
    const panelHeight = rows * ARSENAL_SLOT_HEIGHT + (rows - 1) * ARSENAL_SLOT_GAP + padding * 2;
    const panelTop = LEFT_PANEL_TOP + LEFT_PANEL_HEIGHT + 8;

    this.arsenalPanel.setPosition(LEFT_PANEL_LEFT, panelTop).setSize(panelWidth, panelHeight);
    this.arsenalSlots.forEach((slot, index) => {
      const column = index % ARSENAL_COLUMNS;
      const row = Math.floor(index / ARSENAL_COLUMNS);
      slot.container.setPosition(
        LEFT_PANEL_LEFT + padding + column * (ARSENAL_SLOT_WIDTH + ARSENAL_SLOT_GAP),
        panelTop + padding + row * (ARSENAL_SLOT_HEIGHT + ARSENAL_SLOT_GAP),
      );
    });
  }

  private createAnnouncement(): void {
    this.announcementBg = this.add.rectangle(GAME_WIDTH / 2, 126, 430, 88, 0xf4eedd, 0.98);
    this.announcementBg.setStrokeStyle(5, 0x0f0e13);
    this.announcementTitle = this.add.text(GAME_WIDTH / 2, 100, '', {
      fontFamily: UI_FONT_FAMILY,
      fontSize: '38px',
      color: '#0f0e13',
      stroke: '#fbc02d',
      strokeThickness: 3,
    }).setOrigin(0.5);
    this.announcementSubtitle = this.add.text(GAME_WIDTH / 2, 136, '', {
      fontFamily: UI_FONT_FAMILY,
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
    // 警报从左侧状态板右缘起算，空弹时不能遮住玩家正要读取的军械槽。
    this.combatAlertBg = this.add.rectangle(COMBAT_ALERT_CENTER_X, 208, COMBAT_ALERT_WIDTH, 48, 0x2b220f, 0.97);
    this.combatAlertBg.setStrokeStyle(3, 0xfbc02d, 0.95);
    this.combatAlertTitle = this.add.text(COMBAT_ALERT_LEFT + 22, 198, '', {
      fontFamily: UI_FONT_FAMILY,
      fontSize: '22px',
      color: '#fff0bd',
    }).setOrigin(0, 0.5);
    this.combatAlertSubtitle = this.add.text(COMBAT_ALERT_LEFT + COMBAT_ALERT_WIDTH - 22, 218, '', {
      fontFamily: UI_FONT_FAMILY,
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
      fontFamily: UI_FONT_FAMILY,
      fontSize: '24px',
      color: '#f4eedd',
    }).setOrigin(0.5);
    this.pickupToastContainer = this.add.container(0, 0, [this.pickupToastBg, this.pickupToastText]);
    this.pickupToastContainer.setAlpha(0);
    this.pickupToastContainer.setVisible(false);
  }

  private createKillStreak(): void {
    const streakTop = RIGHT_PANEL_TOP + RIGHT_PANEL_HEIGHT + (USE_SIDE_HUD ? 116 : 10);
    this.killStreakLabel = this.add.text(RIGHT_PANEL_TEXT_RIGHT, streakTop, '连杀', {
      fontFamily: UI_FONT_FAMILY,
      fontSize: '13px',
      color: '#8d9298',
    }).setOrigin(1, 0);
    this.killStreakText = this.add.text(RIGHT_PANEL_TEXT_RIGHT, streakTop + 17, '', {
      fontFamily: UI_FONT_FAMILY,
      fontSize: '34px',
      color: '#f4eedd',
      stroke: '#0f0e13',
      strokeThickness: 4,
    }).setOrigin(1, 0);
    this.killStreakLabel.setVisible(false);
    this.killStreakText.setVisible(false);

    this.milestoneText = this.add.text(GAME_WIDTH / 2, 300, '', {
      fontFamily: UI_FONT_FAMILY,
      fontSize: '58px',
      color: '#ffd54a',
      stroke: '#0f0e13',
      strokeThickness: 8,
    }).setOrigin(0.5);
    this.milestoneText.setVisible(false);
    this.milestoneText.setAlpha(0);
  }

  private createBossPanel(): void {
    const bossCenterX = USE_SIDE_HUD
      ? RIGHT_PANEL_RIGHT - RIGHT_PANEL_WIDTH / 2
      : GAME_WIDTH / 2 + 56;
    const bossCenterY = USE_SIDE_HUD ? RIGHT_PANEL_TOP + RIGHT_PANEL_HEIGHT + 58 : 40;
    const bossPanelWidth = USE_SIDE_HUD ? RIGHT_PANEL_WIDTH : 390;
    const bossPanelHeight = USE_SIDE_HUD ? 90 : 50;
    const bossNameY = USE_SIDE_HUD ? bossCenterY - 31 : 25;
    const bossHealthY = USE_SIDE_HUD ? bossCenterY : 51;
    const bossRecoveryY = USE_SIDE_HUD ? bossCenterY + 27 : 68;
    const background = this.add.rectangle(bossCenterX, bossCenterY, bossPanelWidth, bossPanelHeight, 0x130f11, 0.94);
    background.setStrokeStyle(3, 0xef725f, 0.85);
    this.bossNameText = this.add.text(bossCenterX, bossNameY, '', {
      fontFamily: UI_FONT_FAMILY,
      fontStyle: 'bold',
      fontSize: '14px',
      color: '#ffe2d8',
    }).setOrigin(0.5);
    this.bossRecoveryText = this.add.text(bossCenterX, bossRecoveryY, '', {
      fontFamily: UI_FONT_FAMILY,
      fontSize: '12px',
      color: '#9ff0b3',
    }).setOrigin(0.5);
    const bossHealthLeft = bossCenterX - BOSS_HEALTH_WIDTH / 2;
    const healthBackground = this.add.rectangle(bossHealthLeft, bossHealthY, BOSS_HEALTH_WIDTH, 11, 0x2a1a1c).setOrigin(0, 0.5);
    this.bossHealthFill = this.add.rectangle(bossHealthLeft, bossHealthY, BOSS_HEALTH_WIDTH, 11, 0xd94a3a).setOrigin(0, 0.5);
    this.bossPanel = this.add.container(0, 0, [background, this.bossNameText, healthBackground, this.bossHealthFill, this.bossRecoveryText]);
    this.bossPanel.setVisible(false);
  }

  private createPauseOverlay(): void {
    // HUD 场景实例会跨局复用，重新 create 时旧菜单项指向已销毁的对象，必须先清空。
    this.pauseMenuItems.length = 0;
    const shade = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x09080b, 0.66);
    const board = this.add.rectangle(GAME_WIDTH / 2, 370, 440, 330, 0xf4eedd, 0.98);
    board.setStrokeStyle(5, 0x0f0e13);
    const title = this.add.text(GAME_WIDTH / 2, 246, 'PAUSED', {
      fontFamily: UI_FONT_FAMILY,
      fontSize: '52px',
      color: '#0f0e13',
      stroke: '#fbc02d',
      strokeThickness: 5,
    }).setOrigin(0.5);
    const body = this.add.text(GAME_WIDTH / 2, 286, '战场已冻结', {
      fontFamily: UI_FONT_FAMILY,
      fontSize: '17px',
      color: '#39424b',
    }).setOrigin(0.5);

    const resume = this.createPauseMenuItem(336, '继续游戏', '1', this.resumeRun);
    const audio = this.createPauseMenuItem(396, '', 'M', this.toggleAudio);
    const home = this.createPauseMenuItem(456, '返回主页', '2', this.leaveToMainMenu);
    this.pauseAudioText = audio.label;
    this.refreshPauseAudioLabel();
    this.pauseMenuItems.push(resume, audio, home);

    const hint = this.add.text(GAME_WIDTH / 2, 504, `${formatKeybind(MENU_KEY)} 也可直接继续战斗`, {
      fontFamily: UI_FONT_FAMILY,
      fontSize: '13px',
      color: '#6c757c',
    }).setOrigin(0.5);

    this.pauseOverlay = this.add.container(0, 0, [
      shade, board, title, body,
      ...resume.objects, ...audio.objects, ...home.objects, hint,
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
      fontFamily: UI_FONT_FAMILY,
      fontSize: '25px',
      color: '#f4eedd',
    }).setOrigin(0.5);
    const key = this.add.text(GAME_WIDTH / 2 + 132, y, `[${shortcut}]`, {
      fontFamily: UI_FONT_FAMILY,
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

    return { objects: [box, text, key], label: text, paint };
  }

  /** 暂停菜单第一项。菜单未打开时忽略，避免数字键在战斗中误触。 */
  private resumeRun(): void {
    if (!this.isPauseMenuOpen()) return;
    SoundManager.play('uiConfirm');
    this.gameScene.resumeFromMenu();
  }

  private toggleAudio(): void {
    if (!this.isPauseMenuOpen()) return;
    const enabled = SoundManager.toggleEnabled();
    this.refreshPauseAudioLabel();
    if (enabled) SoundManager.play('uiConfirm');
  }

  private refreshPauseAudioLabel(): void {
    if (!this.pauseAudioText) return;
    this.pauseAudioText.setText(`声音 ${SoundManager.isEnabled() ? '开启' : '关闭'}`);
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
    this.refreshArsenal(true);

    this.healthText.setText(`${state.player.health}/${state.player.maxHealth}`);
    this.healthFill.width = HEALTH_BAR_WIDTH * Phaser.Math.Clamp(healthRatio, 0, 1);
    this.healthPulseFill.width = HEALTH_BAR_WIDTH;
    this.healthFill.fillColor = healthRatio <= 0.25 ? 0xe33d35 : healthRatio <= 0.55 ? 0xe59a18 : 0xd9574e;

    this.itemText.setText(itemLabel);
    this.itemDetailText.setText(itemId ? `×${itemCount}` : '空');
    this.itemIcon.setVisible(Boolean(itemId));
    if (itemId) this.itemIcon.setTexture(PROP_TEXTURE_KEYS[itemId as ItemId]);

    this.modeText.setText(this.gameScene.getModeLabel());
    this.levelText.setText(this.gameScene.getLevelLabel());
    this.waveText.setText(totalWaves ? `WAVE ${state.waveIndex}/${totalWaves}` : `WAVE ${state.waveIndex}`);
    this.scoreText.setText(`${state.score} 分  ·  强化 ${state.player.activeEnhancements.size}/2`);
    this.controlHintText.setText(
      `${formatKeybind(MENU_KEY)} 菜单  ·  ${formatKeybind(keybinds.nextWeapon)}/${formatKeybind(keybinds.prevWeapon)} 切换武器  ·  ${formatKeybind(keybinds.deployItem)} 布置道具`,
    );

    fitTextWidth(this.healthText, USE_SIDE_HUD ? 80 : 66);
    fitTextWidth(this.itemText, ITEM_COLUMN_MAX_WIDTH);
    fitTextWidth(this.itemDetailText, ITEM_COLUMN_MAX_WIDTH);
    fitTextWidth(this.modeText, USE_SIDE_HUD ? RIGHT_PANEL_TEXT_MAX_WIDTH : 142);
    fitTextWidth(this.levelText, USE_SIDE_HUD ? RIGHT_PANEL_TEXT_MAX_WIDTH : 150);
    fitTextWidth(this.waveText, USE_SIDE_HUD ? RIGHT_PANEL_TEXT_MAX_WIDTH : 132);
    fitTextWidth(this.scoreText, USE_SIDE_HUD ? RIGHT_PANEL_TEXT_MAX_WIDTH : 160);
    fitTextWidth(this.controlHintText, USE_SIDE_HUD ? RIGHT_PANEL_TEXT_MAX_WIDTH : GAME_WIDTH - 48);
  }

  private handleWeaponChanged(): void {
    this.refresh();
    this.showArsenal();
  }

  private showArsenal(): void {
    this.refreshArsenal(true);
    this.arsenalHideCall?.remove(false);
    this.tweens.killTweensOf(this.arsenalContainer);
    this.arsenalContainer.setVisible(true).setAlpha(0).setY(-4);
    this.tweens.add({
      targets: this.arsenalContainer,
      alpha: 1,
      y: 0,
      duration: 140,
      ease: 'Cubic.Out',
    });
    this.arsenalHideCall = this.time.delayedCall(ARSENAL_DISPLAY_MS, () => {
      this.tweens.add({
        targets: this.arsenalContainer,
        alpha: 0,
        y: -4,
        duration: 220,
        ease: 'Cubic.In',
        onComplete: () => this.arsenalContainer.setVisible(false),
      });
      this.arsenalHideCall = null;
    });
  }

  private showControlHint(): void {
    this.controlHintHideCall?.remove(false);
    this.tweens.killTweensOf(this.controlHintText);
    this.controlHintText.setVisible(true).setAlpha(0);
    this.tweens.add({ targets: this.controlHintText, alpha: 1, duration: 180 });
    this.controlHintHideCall = this.time.delayedCall(CONTROL_HINT_DISPLAY_MS, () => {
      this.tweens.add({
        targets: this.controlHintText,
        alpha: 0,
        duration: 280,
        onComplete: () => this.controlHintText.setVisible(false),
      });
      this.controlHintHideCall = null;
    });
  }

  /** 弹药详情行每帧刷新，文案长度差别大，统一在这里收缩宽度。 */
  private setAmmoDetail(text: string): void {
    this.ammoDetailText.setText(text);
    fitTextWidth(this.ammoDetailText, LEFT_COLUMN_MAX_WIDTH);
  }

  private refreshAmmoPresentation(): void {
    const state = this.gameScene.getState();
    // 必须读强化后的定义，否则「连射改造」「加长弹匣」这类卡在 HUD 上不会体现。
    const weapon = EnhancementManager.resolveWeaponDef(
      state.player.currentWeaponId,
      state.player.activeEnhancements,
    );
    const ammoInMag = state.player.ammoInMag[state.player.currentWeaponId] ?? 0;
    const ammoReserve = weapon.infiniteAmmo || isDeveloperCheatEnabled()
      ? '∞'
      : state.player.ammoReserve[weapon.ammoType] ?? 0;
    const reload = this.gameScene.getWeaponReloadStatus();

    this.weaponText.setText(weapon.name);
    this.ammoText.setText(`${ammoInMag}/${weapon.magazineSize}`);
    // 每帧都会走这里：只做宽度收缩，行位不动，避免长武器名顶到弹药数上。
    fitTextWidth(this.weaponText, USE_SIDE_HUD ? LEFT_COLUMN_MAX_WIDTH : LEFT_COLUMN_MAX_WIDTH - 76);
    fitTextWidth(this.ammoText, 76);

    if (reload) {
      // 逐发填装的进度条读弹匣填充度而不是单发计时：玩家关心的是「现在有几发能打」，
      // 而不是当前这一发装到哪了。
      if (weapon.reloadMode === 'shell') {
        this.setAmmoDetail(`逐发装填 ${ammoInMag}/${weapon.magazineSize} · 开火可打断`);
        this.ammoText.setColor('#58c9dd');
        this.ammoProgressFill.fillColor = 0x58c9dd;
        this.ammoProgressFill.width = AMMO_BAR_WIDTH * Phaser.Math.Clamp(
          weapon.magazineSize > 0 ? ammoInMag / weapon.magazineSize : 0,
          0,
          1,
        );
        return;
      }
      this.setAmmoDetail(`换弹中 · ${(reload.remaining / 1000).toFixed(1)} s`);
      this.ammoText.setColor('#58c9dd');
      this.ammoProgressFill.fillColor = 0x58c9dd;
      this.ammoProgressFill.width = AMMO_BAR_WIDTH * reload.progress;
      return;
    }

    const ammoRatio = weapon.magazineSize > 0 ? ammoInMag / weapon.magazineSize : 0;
    this.setAmmoDetail(`备用 ${ammoReserve} · ${weapon.auto ? '连发' : '点射'}`);
    this.ammoProgressFill.width = AMMO_BAR_WIDTH * Phaser.Math.Clamp(ammoRatio, 0, 1);
    if (ammoInMag <= 0) {
      this.ammoText.setColor('#ff7668');
      this.ammoProgressFill.fillColor = 0xe34f42;
    } else if (ammoRatio <= 0.25) {
      this.ammoText.setColor('#fbc02d');
      this.ammoProgressFill.fillColor = 0xe59a18;
    } else {
      this.ammoText.setColor('#f4eedd');
      this.ammoProgressFill.fillColor = 0x65c694;
    }
  }

  private refreshArsenal(allowReactivationHighlight: boolean): void {
    const state = this.gameScene.getState();
    const statuses = this.gameScene.getWeaponStatuses();
    const currentStatus = statuses.find((status) => status.weaponId === state.player.currentWeaponId);
    const currentWeaponEmpty = currentStatus !== undefined && !currentStatus.usable;
    this.layoutArsenal(statuses.length);

    this.arsenalSlots.forEach((slot, index) => {
      const status = statuses[index];
      if (!status) {
        slot.container.setVisible(false);
        return;
      }
      slot.container.setVisible(true);

      const weaponId = status.weaponId;
      const weapon = WEAPONS[weaponId];
      const isCurrent = weaponId === state.player.currentWeaponId;
      slot.image.setVisible(true).setTexture(GAME_WEAPON_TEXTURE_KEYS[weaponId]);
      const imageScale = Math.min(32 / slot.image.width, 20 / slot.image.height);
      slot.image.setScale(imageScale).setAlpha(status.usable ? 1 : 0.25);
      slot.name.setText(weapon.name).setColor(isCurrent ? '#0f0e13' : status.usable ? '#f4eedd' : '#8e8b88');
      fitTextWidth(slot.name, ARSENAL_SLOT_TEXT_WIDTH);
      slot.ammo
        .setText(`${status.ammoInMag}/${status.infiniteAmmo ? '∞' : status.ammoReserve}`)
        .setColor(isCurrent ? '#31302d' : status.usable ? '#c4c8cb' : '#ff7668');
      fitTextWidth(slot.ammo, ARSENAL_SLOT_TEXT_WIDTH);
      slot.index.setColor(isCurrent ? '#0f0e13' : status.usable ? '#aab2b8' : '#777575');

      if (isCurrent && !status.usable) {
        slot.box.setFillStyle(0x9f3a32, 0.78).setStrokeStyle(3, 0xfbc02d, 0.95);
      } else if (isCurrent) {
        slot.box.setFillStyle(0xfbc02d, 0.96).setStrokeStyle(3, 0x0f0e13, 0.95);
      } else if (status.usable && currentWeaponEmpty) {
        slot.box.setFillStyle(0x183038, 0.96).setStrokeStyle(2, 0x58c9dd, 0.9);
      } else if (status.usable) {
        slot.box.setFillStyle(0x23252b, 0.96).setStrokeStyle(1, 0xf4eedd, 0.22);
      } else {
        slot.box.setFillStyle(0x2b2325, 0.82).setStrokeStyle(1, 0xb9473e, 0.55);
      }

      slot.reloadBg.setVisible(status.reloading);
      slot.reloadFill.setVisible(status.reloading);
      slot.reloadFill.width = ARSENAL_SLOT_TEXT_WIDTH * status.reloadProgress;

      const previousUsable = this.previousWeaponUsability.get(weaponId);
      if (allowReactivationHighlight && previousUsable === false && status.usable) {
        this.tweens.killTweensOf(slot.container);
        slot.container.setAlpha(0.45);
        this.tweens.add({ targets: slot.container, alpha: 1, duration: 240, ease: 'Cubic.Out' });
      } else if (!this.tweens.isTweening(slot.container)) {
        slot.container.setAlpha(1);
      }
      this.previousWeaponUsability.set(weaponId, status.usable);
    });
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
    fitTextWidth(this.bossNameText, USE_SIDE_HUD ? RIGHT_PANEL_WIDTH - 20 : 360);
    const ratio = boss.maxHealth > 0 ? Phaser.Math.Clamp(boss.health / boss.maxHealth, 0, 1) : 0;
    this.bossHealthFill.width = BOSS_HEALTH_WIDTH * ratio;
    this.bossHealthFill.fillColor = boss.phase && boss.phase > 1 ? 0xf57f17 : 0xd94a3a;
    this.bossRecoveryText.setText(boss.recovery.active ? `破绽窗口 ${(boss.recovery.remaining / 1000).toFixed(1)}s` : '');
    fitTextWidth(this.bossRecoveryText, USE_SIDE_HUD ? RIGHT_PANEL_WIDTH - 20 : 360);
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
    this.refreshPauseAudioLabel();
    this.pauseOverlay.setVisible(true);
    this.pauseOverlay.setAlpha(0);
    this.tweens.add({
      targets: this.pauseOverlay,
      alpha: 1,
      duration: 160,
    });
  }

  private handleShutdown(): void {
    this.arsenalHideCall?.remove(false);
    this.arsenalHideCall = null;
    this.controlHintHideCall?.remove(false);
    this.controlHintHideCall = null;
    for (const eventName of HUD_STATE_EVENTS) {
      this.gameScene.events.off(eventName, this.refresh, this);
    }
    this.gameScene.events.off(EVENTS.weaponChanged, this.handleWeaponChanged, this);
    this.gameScene.events.off(EVENTS.waveAnnounced, this.showWaveAnnouncement, this);
    this.gameScene.events.off(EVENTS.combatAlert, this.showCombatAlert, this);
    this.gameScene.events.off(EVENTS.pickupCollected, this.showPickupToast, this);
    this.gameScene.events.off(EVENTS.pauseChanged, this.syncPauseOverlay, this);
    this.gameScene.events.off(EVENTS.killStreakChanged, this.showKillStreak, this);
    this.gameScene.events.off(EVENTS.killStreakMilestone, this.showKillStreakMilestone, this);
  }
}
