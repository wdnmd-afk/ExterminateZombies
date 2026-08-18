import Phaser from 'phaser';
import { ITEMS, type ItemId } from '../config/items';
import { EVENTS, GAME_HEIGHT, GAME_WIDTH, SCENES } from '../constants';
import type { GameScene, PauseReason } from './GameScene';
import {
  configureHighResolutionScene,
  DISPLAY_HAS_HUD_SIDEBARS,
  DISPLAY_HUD_SIDEBAR_TIER,
  DISPLAY_SIDEBAR_WIDTH,
  getRuntimeDisplayLayout,
  subscribeDisplayLayout,
  type RuntimeDisplayLayout,
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
import { ENHANCEMENTS } from '../config/enhancements';
import { MAX_WEAPON_LOADOUT_SIZE } from '../config/loadout';
import type { HudSidebarTier } from '../ui/displayLayout';
import { getCharacterDef } from '../config/characters';

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

function toHexColor(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

interface HudLayoutSnapshot {
  announcement: WaveAnnouncementPayload | null;
  announcementRemaining: number;
  combatAlert: CombatAlert | null;
  combatAlertRemaining: number;
  pickupToast: PickupToastPayload | null;
  pickupToastRemaining: number;
  killStreak: number;
  milestone: KillStreakMilestonePayload | null;
  milestoneRemaining: number;
  arsenalPinned: boolean;
  arsenalRemaining: number | null;
  controlHintRemaining: number | null;
  weaponUsability: Array<[WeaponId, boolean]>;
}

const SIDE_PANEL_MAX_WIDTH = 220;
/**
 * 压缩档内容面板下界。侧栏最小 120px、减去 6px 内缩即 114px，
 * 因此这个下界正常情况下总会被满足，只作为异常侧栏宽度的防御值。
 */
const COMPACT_SIDE_PANEL_MIN_WIDTH = 114;
const COMPACT_SIDE_PANEL_MAX_WIDTH = 156;
/** 军械面板内缩，取消微型形态后各档一致。 */
const ARSENAL_PANEL_PADDING = 8;
/** 侧栏道具面板高度，取消微型形态后各档一致。 */
const SIDE_ITEM_PANEL_HEIGHT = 64;
/** 右侧栏 Boss 槽固定高度：无 Boss 时保留留白，不让下方区块上移。 */
const RIGHT_BOSS_SLOT_HEIGHT = 108;
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

const LEFT_PANEL_TOP = 18;
const COMBAT_ALERT_WIDTH = 440;
const COMBAT_ALERT_LEFT = GAME_WIDTH / 2 - COMBAT_ALERT_WIDTH / 2;
const COMBAT_ALERT_CENTER_X = COMBAT_ALERT_LEFT + COMBAT_ALERT_WIDTH / 2;

const RIGHT_PANEL_TOP = 18;

let USE_SIDE_HUD = false;
let USE_FULL_SIDE_HUD = false;
let USE_NARROW_SIDE_HUD = false;
let SIDE_PANEL_WIDTH = 0;
let ARSENAL_COLUMNS = 4;
let ARSENAL_SLOT_HEIGHT = 40;
let ARSENAL_IMAGE_MAX_WIDTH = 32;
let ARSENAL_IMAGE_MAX_HEIGHT = 20;
let ARSENAL_IMAGE_CENTER_X = 27;
let ARSENAL_TEXT_LEFT = 45;
let ARSENAL_HEADING_HEIGHT = 24;
let LEFT_PANEL_LEFT = 20;
let LEFT_PANEL_WIDTH = 400;
let LEFT_PANEL_HEIGHT = 104;
let LEFT_PANEL_PADDING_X = 14;
let LEFT_PANEL_TEXT_LEFT = 34;
let LEFT_COLUMN_MAX_WIDTH = 238;
let ITEM_COLUMN_LEFT = 350;
let ITEM_COLUMN_MAX_WIDTH = 56;
let AMMO_BAR_WIDTH = 232;
let HEALTH_BAR_WIDTH = 120;
let ARSENAL_SLOT_WIDTH = 93;
let ARSENAL_SLOT_TEXT_WIDTH = 42;
let SIDE_ARSENAL_PANEL_HEIGHT = 0;
let SIDE_ITEM_PANEL_TOP = 0;
let RIGHT_PANEL_RIGHT = GAME_WIDTH - 20;
let RIGHT_PANEL_WIDTH = 330;
let RIGHT_PANEL_HEIGHT = 64;
let RIGHT_PANEL_PADDING_X = 14;
let RIGHT_PANEL_TEXT_RIGHT = RIGHT_PANEL_RIGHT - RIGHT_PANEL_PADDING_X;
let RIGHT_PANEL_TEXT_LEFT = RIGHT_PANEL_RIGHT - RIGHT_PANEL_WIDTH + RIGHT_PANEL_PADDING_X;
let RIGHT_PANEL_TEXT_MAX_WIDTH = RIGHT_PANEL_WIDTH - RIGHT_PANEL_PADDING_X * 2;
let BOSS_HEALTH_WIDTH = 320;
let LEVEL_PROGRESS_WIDTH = RIGHT_PANEL_TEXT_MAX_WIDTH;
let LEVEL_PROGRESS_Y = RIGHT_PANEL_TOP + 103;
let RIGHT_SUMMARY_TOP = 0;
let RIGHT_SUMMARY_HEIGHT = 0;

function resolveSidePanelWidth(tier: HudSidebarTier, sidebarWidth: number): number {
  if (tier === 'full') return SIDE_PANEL_MAX_WIDTH;
  if (tier === 'compact') {
    return Phaser.Math.Clamp(
      sidebarWidth - 6,
      COMPACT_SIDE_PANEL_MIN_WIDTH,
      COMPACT_SIDE_PANEL_MAX_WIDTH,
    );
  }
  return 0;
}

function refreshHudLayoutConstants(): void {
  USE_SIDE_HUD = DISPLAY_HAS_HUD_SIDEBARS;
  USE_FULL_SIDE_HUD = DISPLAY_HUD_SIDEBAR_TIER === 'full';
  SIDE_PANEL_WIDTH = resolveSidePanelWidth(DISPLAY_HUD_SIDEBAR_TIER, DISPLAY_SIDEBAR_WIDTH);
  USE_NARROW_SIDE_HUD = USE_SIDE_HUD && !USE_FULL_SIDE_HUD && SIDE_PANEL_WIDTH < 140;

  ARSENAL_COLUMNS = USE_SIDE_HUD ? 1 : 4;
  ARSENAL_SLOT_HEIGHT = USE_FULL_SIDE_HUD ? 56 : USE_SIDE_HUD ? 44 : 40;
  ARSENAL_IMAGE_MAX_WIDTH = USE_FULL_SIDE_HUD ? 52 : USE_NARROW_SIDE_HUD ? 32 : USE_SIDE_HUD ? 40 : 32;
  ARSENAL_IMAGE_MAX_HEIGHT = USE_FULL_SIDE_HUD ? 30 : USE_NARROW_SIDE_HUD ? 20 : USE_SIDE_HUD ? 24 : 20;
  ARSENAL_IMAGE_CENTER_X = USE_FULL_SIDE_HUD ? 38 : USE_NARROW_SIDE_HUD ? 25 : USE_SIDE_HUD ? 32 : 27;
  ARSENAL_TEXT_LEFT = USE_FULL_SIDE_HUD ? 72 : USE_NARROW_SIDE_HUD ? 50 : USE_SIDE_HUD ? 58 : 45;
  ARSENAL_HEADING_HEIGHT = USE_SIDE_HUD ? 24 : 0;

  LEFT_PANEL_LEFT = USE_SIDE_HUD
    ? -DISPLAY_SIDEBAR_WIDTH / 2 - SIDE_PANEL_WIDTH / 2
    : 20;
  LEFT_PANEL_WIDTH = USE_SIDE_HUD ? SIDE_PANEL_WIDTH : 400;
  LEFT_PANEL_HEIGHT = USE_SIDE_HUD ? 155 : 104;
  LEFT_PANEL_PADDING_X = USE_SIDE_HUD ? 12 : 14;
  LEFT_PANEL_TEXT_LEFT = LEFT_PANEL_LEFT + LEFT_PANEL_PADDING_X;
  LEFT_COLUMN_MAX_WIDTH = USE_SIDE_HUD ? LEFT_PANEL_WIDTH - LEFT_PANEL_PADDING_X * 2 : 238;
  ITEM_COLUMN_LEFT = USE_SIDE_HUD
    ? LEFT_PANEL_TEXT_LEFT + (USE_NARROW_SIDE_HUD ? 36 : 52)
    : LEFT_PANEL_LEFT + 330;
  ITEM_COLUMN_MAX_WIDTH = LEFT_PANEL_LEFT + LEFT_PANEL_WIDTH - LEFT_PANEL_PADDING_X - ITEM_COLUMN_LEFT;
  AMMO_BAR_WIDTH = USE_SIDE_HUD ? LEFT_COLUMN_MAX_WIDTH : 232;
  HEALTH_BAR_WIDTH = USE_SIDE_HUD ? LEFT_COLUMN_MAX_WIDTH : 120;
  ARSENAL_SLOT_WIDTH = USE_SIDE_HUD ? LEFT_PANEL_WIDTH - 16 : 93;
  ARSENAL_SLOT_TEXT_WIDTH = ARSENAL_SLOT_WIDTH - ARSENAL_TEXT_LEFT - 6;
  SIDE_ARSENAL_PANEL_HEIGHT = MAX_WEAPON_LOADOUT_SIZE * ARSENAL_SLOT_HEIGHT
    + (MAX_WEAPON_LOADOUT_SIZE - 1) * ARSENAL_SLOT_GAP
    + ARSENAL_PANEL_PADDING * 2
    + ARSENAL_HEADING_HEIGHT;
  SIDE_ITEM_PANEL_TOP = LEFT_PANEL_TOP + LEFT_PANEL_HEIGHT + 8 + SIDE_ARSENAL_PANEL_HEIGHT + 8;

  RIGHT_PANEL_RIGHT = USE_SIDE_HUD
    ? GAME_WIDTH + DISPLAY_SIDEBAR_WIDTH / 2 + SIDE_PANEL_WIDTH / 2
    : GAME_WIDTH - 20;
  RIGHT_PANEL_WIDTH = USE_SIDE_HUD ? SIDE_PANEL_WIDTH : 330;
  RIGHT_PANEL_HEIGHT = USE_FULL_SIDE_HUD ? 142 : USE_SIDE_HUD ? 128 : 64;
  RIGHT_PANEL_PADDING_X = USE_SIDE_HUD ? 12 : 14;
  RIGHT_PANEL_TEXT_RIGHT = RIGHT_PANEL_RIGHT - RIGHT_PANEL_PADDING_X;
  RIGHT_PANEL_TEXT_LEFT = RIGHT_PANEL_RIGHT - RIGHT_PANEL_WIDTH + RIGHT_PANEL_PADDING_X;
  RIGHT_PANEL_TEXT_MAX_WIDTH = RIGHT_PANEL_WIDTH - RIGHT_PANEL_PADDING_X * 2;
  BOSS_HEALTH_WIDTH = USE_SIDE_HUD ? RIGHT_PANEL_WIDTH - 28 : 320;
  LEVEL_PROGRESS_WIDTH = RIGHT_PANEL_TEXT_MAX_WIDTH;
  LEVEL_PROGRESS_Y = RIGHT_PANEL_TOP + (USE_FULL_SIDE_HUD ? 111 : 103);
  RIGHT_SUMMARY_TOP = RIGHT_PANEL_TOP + RIGHT_PANEL_HEIGHT + RIGHT_BOSS_SLOT_HEIGHT;
  RIGHT_SUMMARY_HEIGHT = USE_FULL_SIDE_HUD ? 90 : USE_SIDE_HUD ? 52 : 0;
}

refreshHudLayoutConstants();

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
  EVENTS.characterChanged,
  EVENTS.healthChanged,
  EVENTS.ammoChanged,
  EVENTS.itemChanged,
  EVENTS.scoreChanged,
  EVENTS.waveChanged,
] as const;

export class HUDScene extends Phaser.Scene {
  private gameScene!: GameScene;
  private leftHudRoot!: Phaser.GameObjects.Container;
  private rightHudRoot!: Phaser.GameObjects.Container;
  private leftSidebarBackdrop!: Phaser.GameObjects.Rectangle;
  private rightSidebarBackdrop!: Phaser.GameObjects.Rectangle;
  private leftSidebarEdge!: Phaser.GameObjects.Rectangle;
  private rightSidebarEdge!: Phaser.GameObjects.Rectangle;
  private currentHudTier: HudSidebarTier = DISPLAY_HUD_SIDEBAR_TIER;
  private currentHudSidebarWidth = DISPLAY_SIDEBAR_WIDTH;
  private currentHudPanelWidth = SIDE_PANEL_WIDTH;
  private unsubscribeHudLayout: (() => void) | null = null;
  private layoutDirtyWhileSleeping = false;
  private pendingLayoutSnapshot: HudLayoutSnapshot | null = null;
  private pendingLayoutGameState: object | null = null;

  private leftPanel!: Phaser.GameObjects.Rectangle;
  private weaponText!: Phaser.GameObjects.Text;
  private ammoText!: Phaser.GameObjects.Text;
  private ammoDetailText!: Phaser.GameObjects.Text;
  private ammoProgressFill!: Phaser.GameObjects.Rectangle;
  private healthText!: Phaser.GameObjects.Text;
  private characterText!: Phaser.GameObjects.Text;
  private healthFill!: Phaser.GameObjects.Rectangle;
  private healthPulseFill!: Phaser.GameObjects.Rectangle;
  private itemIcon!: Phaser.GameObjects.Image;
  private itemText!: Phaser.GameObjects.Text;
  private itemDetailText!: Phaser.GameObjects.Text;
  private arsenalPanel!: Phaser.GameObjects.Rectangle;
  private arsenalTitleText!: Phaser.GameObjects.Text;
  private arsenalContainer!: Phaser.GameObjects.Container;
  private arsenalHideCall: Phaser.Time.TimerEvent | null = null;
  private readonly arsenalSlots: ArsenalSlotRefs[] = [];
  private readonly previousWeaponUsability = new Map<WeaponId, boolean>();
  private rightPanel!: Phaser.GameObjects.Rectangle;
  private levelText!: Phaser.GameObjects.Text;
  private modeText!: Phaser.GameObjects.Text;
  private waveText!: Phaser.GameObjects.Text;
  private scoreText!: Phaser.GameObjects.Text;
  private enhancementText!: Phaser.GameObjects.Text;
  private levelProgressBg!: Phaser.GameObjects.Rectangle;
  private levelProgressFill!: Phaser.GameObjects.Rectangle;
  private levelProgressTicks!: Phaser.GameObjects.Graphics;
  private levelProgressLabels!: Phaser.GameObjects.Container;
  private levelProgressLabelSignature = '';
  private bossWaveMarkerText!: Phaser.GameObjects.Text;
  private bossPanel!: Phaser.GameObjects.Container;
  private bossNameText!: Phaser.GameObjects.Text;
  private bossHealthFill!: Phaser.GameObjects.Rectangle;
  private bossRecoveryText!: Phaser.GameObjects.Text;

  private announcementContainer!: Phaser.GameObjects.Container;
  private announcementBg!: Phaser.GameObjects.Rectangle;
  private announcementTitle!: Phaser.GameObjects.Text;
  private announcementSubtitle!: Phaser.GameObjects.Text;
  private announcementTween: Phaser.Tweens.Tween | null = null;
  private activeAnnouncement: WaveAnnouncementPayload | null = null;

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
  private activePickupToast: PickupToastPayload | null = null;

  private killStreakText!: Phaser.GameObjects.Text;
  private killStreakLabel!: Phaser.GameObjects.Text;
  private killStreakTween: Phaser.Tweens.Tween | null = null;
  private milestoneText!: Phaser.GameObjects.Text;
  private milestoneTween: Phaser.Tweens.Tween | null = null;
  private activeMilestone: KillStreakMilestonePayload | null = null;
  private currentKillStreak = 0;

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
    refreshHudLayoutConstants();
    this.currentHudTier = DISPLAY_HUD_SIDEBAR_TIER;
    this.currentHudSidebarWidth = DISPLAY_SIDEBAR_WIDTH;
    this.currentHudPanelWidth = SIDE_PANEL_WIDTH;
    this.layoutDirtyWhileSleeping = false;
    const pendingLayoutSnapshot = this.pendingLayoutSnapshot;
    const pendingLayoutGameState = this.pendingLayoutGameState;
    this.pendingLayoutSnapshot = null;
    this.pendingLayoutGameState = null;
    this.activeAnnouncement = null;
    this.announcementTween = null;
    this.activeCombatAlert = null;
    this.combatAlertTween = null;
    this.activePickupToast = null;
    this.pickupToastTween = null;
    this.activeMilestone = null;
    this.milestoneTween = null;
    this.killStreakTween = null;
    this.currentKillStreak = 0;
    configureHighResolutionScene(this, { includeSidebars: true });
    this.gameScene = this.scene.get(SCENES.game) as GameScene;
    const layoutSnapshot = pendingLayoutGameState === this.gameScene.getState()
      ? pendingLayoutSnapshot
      : null;

    this.createPanels();
    this.createArsenal();
    this.createBossPanel();
    this.createAnnouncement();
    this.createCombatAlert();
    this.createPickupToast();
    this.createKillStreak();
    this.createPauseOverlay();
    this.createDangerOverlay();
    this.createHudRoots();

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

    this.unsubscribeHudLayout = subscribeDisplayLayout(this.handleDisplayLayoutChanged.bind(this));
    this.events.on(Phaser.Scenes.Events.WAKE, this.handleHudWake, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown, this);
    if (layoutSnapshot) {
      this.previousWeaponUsability.clear();
      for (const [weaponId, usable] of layoutSnapshot.weaponUsability) {
        this.previousWeaponUsability.set(weaponId, usable);
      }
    }
    this.refresh();
    this.syncPauseOverlay(this.gameScene.getPauseReason());
    if (layoutSnapshot) {
      this.restoreHudLayoutSnapshot(layoutSnapshot);
    } else {
      this.showArsenal();
      this.showControlHint();
    }
    if (this.gameScene.getPauseReason() === 'cardSelection' && this.scene.isActive(SCENES.cardSelection)) {
      this.scene.bringToTop(SCENES.cardSelection);
    }
    const latestLayout = getRuntimeDisplayLayout();
    if (latestLayout.hudSidebarTier !== this.currentHudTier
      || latestLayout.sidebarWidth !== this.currentHudSidebarWidth
      || resolveSidePanelWidth(latestLayout.hudSidebarTier, latestLayout.sidebarWidth) !== this.currentHudPanelWidth) {
      this.handleDisplayLayoutChanged(latestLayout);
    }
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

  private createHudRoots(): void {
    this.leftHudRoot = this.add.container(0, 0);
    this.rightHudRoot = this.add.container(0, 0);
    if (!USE_SIDE_HUD) return;

    const leftObjects: Phaser.GameObjects.GameObject[] = [];
    const rightObjects: Phaser.GameObjects.GameObject[] = [];
    for (const gameObject of [...this.children.list]) {
      if (gameObject === this.leftHudRoot || gameObject === this.rightHudRoot) continue;
      if (gameObject === this.leftSidebarBackdrop
        || gameObject === this.rightSidebarBackdrop
        || gameObject === this.leftSidebarEdge
        || gameObject === this.rightSidebarEdge) continue;
      if (gameObject === this.arsenalContainer) {
        leftObjects.push(gameObject);
        continue;
      }
      if (gameObject === this.bossPanel
        || gameObject === this.levelProgressTicks
        || gameObject === this.levelProgressLabels) {
        rightObjects.push(gameObject);
        continue;
      }
      if (!('x' in gameObject) || typeof gameObject.x !== 'number') continue;
      if (gameObject.x < 0) leftObjects.push(gameObject);
      if (gameObject.x > GAME_WIDTH) rightObjects.push(gameObject);
    }
    this.leftHudRoot.add(leftObjects);
    this.rightHudRoot.add(rightObjects);
  }

  private handleDisplayLayoutChanged(
    layout: Readonly<RuntimeDisplayLayout>,
  ): void {
    const nextPanelWidth = resolveSidePanelWidth(layout.hudSidebarTier, layout.sidebarWidth);
    if (layout.hudSidebarTier === this.currentHudTier && nextPanelWidth === this.currentHudPanelWidth) {
      if (layout.hasHudSidebars) {
        const sidebarDelta = (layout.sidebarWidth - this.currentHudSidebarWidth) / 2;
        this.leftHudRoot.x -= sidebarDelta;
        this.rightHudRoot.x += sidebarDelta;
        this.layoutSidebarBackdrops(layout.sidebarWidth);
      }
      this.currentHudSidebarWidth = layout.sidebarWidth;
      this.layoutDirtyWhileSleeping = false;
      return;
    }

    if (this.sys.isSleeping()) {
      this.layoutDirtyWhileSleeping = true;
      return;
    }
    this.restartForDisplayLayout();
  }

  private handleHudWake(): void {
    if (!this.layoutDirtyWhileSleeping) return;
    this.layoutDirtyWhileSleeping = false;
    this.restartForDisplayLayout();
  }

  private restartForDisplayLayout(): void {
    this.pendingLayoutSnapshot = this.captureHudLayoutSnapshot();
    this.pendingLayoutGameState = this.gameScene.getState();
    refreshHudLayoutConstants();
    this.currentHudTier = DISPLAY_HUD_SIDEBAR_TIER;
    this.currentHudSidebarWidth = DISPLAY_SIDEBAR_WIDTH;
    this.currentHudPanelWidth = SIDE_PANEL_WIDTH;
    this.scene.restart();
  }

  private captureHudLayoutSnapshot(): HudLayoutSnapshot {
    return {
      announcement: this.activeAnnouncement ? { ...this.activeAnnouncement } : null,
      announcementRemaining: this.getTweenRemaining(this.announcementTween),
      combatAlert: this.activeCombatAlert ? { ...this.activeCombatAlert } : null,
      combatAlertRemaining: this.getTweenRemaining(this.combatAlertTween),
      pickupToast: this.activePickupToast ? { ...this.activePickupToast } : null,
      pickupToastRemaining: this.getTweenRemaining(this.pickupToastTween),
      killStreak: this.currentKillStreak,
      milestone: this.activeMilestone ? { ...this.activeMilestone } : null,
      milestoneRemaining: this.getTweenRemaining(this.milestoneTween),
      arsenalPinned: USE_SIDE_HUD && this.arsenalContainer.visible,
      arsenalRemaining: this.arsenalContainer.visible && !USE_SIDE_HUD
        ? this.arsenalHideCall?.getRemaining() ?? ARSENAL_DISPLAY_MS
        : null,
      controlHintRemaining: this.controlHintText.visible
        ? this.controlHintHideCall?.getRemaining() ?? CONTROL_HINT_DISPLAY_MS
        : null,
      weaponUsability: [...this.previousWeaponUsability.entries()],
    };
  }

  private restoreHudLayoutSnapshot(snapshot: HudLayoutSnapshot): void {
    if (snapshot.announcement && snapshot.announcementRemaining > 0) {
      this.showWaveAnnouncement(snapshot.announcement, snapshot.announcementRemaining);
    }
    if (snapshot.combatAlert && snapshot.combatAlertRemaining > 0) {
      this.showCombatAlert({ ...snapshot.combatAlert, duration: snapshot.combatAlertRemaining });
    }
    if (snapshot.pickupToast && snapshot.pickupToastRemaining > 0) {
      this.showPickupToast(snapshot.pickupToast, snapshot.pickupToastRemaining);
    }
    this.showKillStreak(snapshot.killStreak);
    if (snapshot.milestone && snapshot.milestoneRemaining > 0) {
      this.showKillStreakMilestone(snapshot.milestone, snapshot.milestoneRemaining);
    }

    if (USE_SIDE_HUD) {
      this.showArsenal();
    } else if (snapshot.arsenalPinned) {
      this.showArsenal();
    } else if (snapshot.arsenalRemaining !== null) {
      this.showArsenal(snapshot.arsenalRemaining);
    }
    if (snapshot.controlHintRemaining !== null && snapshot.controlHintRemaining > 0) {
      this.showControlHint(snapshot.controlHintRemaining);
    }
  }

  private getTweenRemaining(tween: Phaser.Tweens.Tween | null): number {
    if (!tween || (!tween.isPlaying() && !tween.isPaused())) return 0;
    const duration = tween.totalDuration || tween.duration;
    const progress = Number.isFinite(tween.totalProgress)
      ? Phaser.Math.Clamp(tween.totalProgress, 0, 1)
      : 0;
    return Math.max(0, duration * (1 - progress));
  }

  private layoutSidebarBackdrops(sidebarWidth: number): void {
    const width = Math.max(1, sidebarWidth);
    this.leftSidebarBackdrop.setPosition(-width / 2, GAME_HEIGHT / 2).setSize(width, GAME_HEIGHT);
    this.rightSidebarBackdrop.setPosition(GAME_WIDTH + width / 2, GAME_HEIGHT / 2).setSize(width, GAME_HEIGHT);
  }

  private createPanels(): void {
    const sidebarWidth = Math.max(1, DISPLAY_SIDEBAR_WIDTH);
    this.leftSidebarBackdrop = this.add.rectangle(
      -sidebarWidth / 2,
      GAME_HEIGHT / 2,
      sidebarWidth,
      GAME_HEIGHT,
      0x080b10,
      0.96,
    ).setVisible(USE_SIDE_HUD);
    this.rightSidebarBackdrop = this.add.rectangle(
      GAME_WIDTH + sidebarWidth / 2,
      GAME_HEIGHT / 2,
      sidebarWidth,
      GAME_HEIGHT,
      0x0d0b09,
      0.96,
    ).setVisible(USE_SIDE_HUD);
    this.leftSidebarEdge = this.add.rectangle(0, GAME_HEIGHT / 2, 2, GAME_HEIGHT, 0x58c9dd, 0.48)
      .setVisible(USE_SIDE_HUD);
    this.rightSidebarEdge = this.add.rectangle(GAME_WIDTH, GAME_HEIGHT / 2, 2, GAME_HEIGHT, 0xfbc02d, 0.48)
      .setVisible(USE_SIDE_HUD);
    this.add.text(LEFT_PANEL_LEFT, 2, 'OPERATIVE  //  状态', {
      fontFamily: UI_FONT_FAMILY,
      fontSize: '10px',
      color: '#58c9dd',
    }).setVisible(USE_SIDE_HUD);
    this.add.text(RIGHT_PANEL_TEXT_LEFT, 2, 'MISSION  //  情报', {
      fontFamily: UI_FONT_FAMILY,
      fontSize: '10px',
      color: '#fbc02d',
    }).setVisible(USE_SIDE_HUD);

    this.leftPanel = this.add.rectangle(
      LEFT_PANEL_LEFT + LEFT_PANEL_WIDTH / 2,
      LEFT_PANEL_TOP,
      LEFT_PANEL_WIDTH,
      LEFT_PANEL_HEIGHT,
      USE_SIDE_HUD ? 0x11151c : 0x101116,
      USE_SIDE_HUD ? 0.62 : 0.82,
    );
    this.leftPanel.setOrigin(0.5, 0);
    this.leftPanel.setStrokeStyle(
      2,
      USE_SIDE_HUD ? 0x58c9dd : 0xf4eedd,
      USE_SIDE_HUD ? 0.22 : 0.42,
    );

    this.characterText = this.add.text(LEFT_PANEL_TEXT_LEFT, LEFT_PANEL_TOP + (USE_NARROW_SIDE_HUD ? 7 : 10), '', {
      fontFamily: UI_FONT_FAMILY,
      fontSize: USE_NARROW_SIDE_HUD ? '10px' : '12px',
      color: '#58c9dd',
    });

    this.weaponText = this.add.text(
      LEFT_PANEL_TEXT_LEFT,
      LEFT_PANEL_TOP + (USE_NARROW_SIDE_HUD ? 59 : USE_SIDE_HUD ? 50 : 36),
      '',
      {
      fontFamily: UI_FONT_FAMILY,
      fontSize: USE_NARROW_SIDE_HUD ? '18px' : '22px',
      color: '#f4eedd',
      },
    );

    this.ammoText = this.add.text(
      USE_SIDE_HUD ? LEFT_PANEL_TEXT_LEFT : LEFT_PANEL_TEXT_LEFT + LEFT_COLUMN_MAX_WIDTH,
      LEFT_PANEL_TOP + (USE_NARROW_SIDE_HUD ? 87 : USE_SIDE_HUD ? 79 : 35),
      '',
      {
      fontFamily: UI_FONT_FAMILY,
      fontSize: USE_NARROW_SIDE_HUD ? '18px' : '22px',
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
    ).setVisible(!USE_SIDE_HUD || USE_FULL_SIDE_HUD);

    const ammoBarY = LEFT_PANEL_TOP + (USE_NARROW_SIDE_HUD ? 121 : USE_SIDE_HUD ? 132 : 91);
    this.add.rectangle(LEFT_PANEL_TEXT_LEFT, ammoBarY, AMMO_BAR_WIDTH, 6, 0xffffff, 0.14)
      .setOrigin(0, 0.5);
    this.ammoProgressFill = this.add.rectangle(LEFT_PANEL_TEXT_LEFT, ammoBarY, AMMO_BAR_WIDTH, 6, 0x65c694, 0.96)
      .setOrigin(0, 0.5);

    this.healthText = this.add.text(
      USE_SIDE_HUD ? LEFT_PANEL_TEXT_LEFT + LEFT_COLUMN_MAX_WIDTH : LEFT_PANEL_TEXT_LEFT + LEFT_COLUMN_MAX_WIDTH,
      LEFT_PANEL_TOP + (USE_NARROW_SIDE_HUD ? 25 : USE_SIDE_HUD ? 9 : 4),
      '',
      {
      fontFamily: UI_FONT_FAMILY,
      fontSize: '13px',
      color: '#f4eedd',
      },
    ).setOrigin(1, 0);

    const healthBarX = USE_SIDE_HUD ? LEFT_PANEL_TEXT_LEFT : LEFT_PANEL_TEXT_LEFT + 112;
    const healthBarY = LEFT_PANEL_TOP + (USE_NARROW_SIDE_HUD ? 48 : USE_SIDE_HUD ? 38 : 27);
    this.add.rectangle(healthBarX, healthBarY, HEALTH_BAR_WIDTH, 8, 0xffffff, 0.14).setOrigin(0, 0.5);
    this.healthPulseFill = this.add.rectangle(healthBarX, healthBarY, HEALTH_BAR_WIDTH, 8, 0xf59a8d, 0.18).setOrigin(0, 0.5);
    this.healthFill = this.add.rectangle(healthBarX, healthBarY, HEALTH_BAR_WIDTH, 8, 0xd9574e, 0.98).setOrigin(0, 0.5);

    if (USE_SIDE_HUD) {
      this.add.rectangle(
        LEFT_PANEL_TEXT_LEFT,
        LEFT_PANEL_TOP + 148,
        LEFT_COLUMN_MAX_WIDTH,
        1,
        0xf4eedd,
        0.18,
      )
        .setOrigin(0, 0.5);
    } else {
      this.add.rectangle(LEFT_PANEL_LEFT + 288, LEFT_PANEL_TOP + 12, 1, LEFT_PANEL_HEIGHT - 24, 0xf4eedd, 0.18)
        .setOrigin(0.5, 0);
    }

    this.add.rectangle(
      LEFT_PANEL_LEFT + LEFT_PANEL_WIDTH / 2,
      SIDE_ITEM_PANEL_TOP,
      LEFT_PANEL_WIDTH,
      SIDE_ITEM_PANEL_HEIGHT,
      0x11151c,
      0.62,
    ).setOrigin(0.5, 0).setStrokeStyle(2, 0x58c9dd, 0.18).setVisible(USE_SIDE_HUD);

    this.itemIcon = this.add.image(
      USE_SIDE_HUD ? LEFT_PANEL_LEFT + (USE_NARROW_SIDE_HUD ? 18 : 24) : LEFT_PANEL_LEFT + 308,
      USE_SIDE_HUD ? SIDE_ITEM_PANEL_TOP + 32 : LEFT_PANEL_TOP + 52,
      PROP_TEXTURE_KEYS.mine,
    );
    this.itemIcon.setDisplaySize(32, 32);
    this.itemText = this.add.text(ITEM_COLUMN_LEFT, USE_SIDE_HUD ? SIDE_ITEM_PANEL_TOP + 10 : LEFT_PANEL_TOP + 31, '', {
      fontFamily: UI_FONT_FAMILY,
      fontSize: '16px',
      color: '#f4eedd',
    });
    this.itemDetailText = this.add.text(
      ITEM_COLUMN_LEFT,
      USE_SIDE_HUD ? SIDE_ITEM_PANEL_TOP + 34 : LEFT_PANEL_TOP + 58,
      '',
      {
      fontFamily: UI_FONT_FAMILY,
      fontSize: '13px',
      color: '#fbc02d',
      },
    ).setOrigin(0, 0);

    this.rightPanel = this.add.rectangle(
      RIGHT_PANEL_RIGHT - RIGHT_PANEL_WIDTH / 2,
      RIGHT_PANEL_TOP,
      RIGHT_PANEL_WIDTH,
      RIGHT_PANEL_HEIGHT,
      USE_SIDE_HUD ? 0x17140f : 0x101116,
      USE_SIDE_HUD ? 0.62 : 0.82,
    );
    this.rightPanel.setOrigin(0.5, 0);
    this.rightPanel.setStrokeStyle(
      2,
      USE_SIDE_HUD ? 0xfbc02d : 0xf4eedd,
      USE_SIDE_HUD ? 0.22 : 0.42,
    );

    this.modeText = this.add.text(RIGHT_PANEL_TEXT_LEFT, RIGHT_PANEL_TOP + (USE_SIDE_HUD ? 10 : 8), '', {
      fontFamily: UI_FONT_FAMILY,
      fontSize: '13px',
      color: '#fbc02d',
    });

    this.levelText = this.add.text(USE_SIDE_HUD ? RIGHT_PANEL_TEXT_LEFT : RIGHT_PANEL_TEXT_RIGHT, RIGHT_PANEL_TOP + (USE_SIDE_HUD ? 32 : 8), '', {
      fontFamily: UI_FONT_FAMILY,
      fontSize: '12px',
      color: '#aab2b8',
    }).setOrigin(USE_SIDE_HUD ? 0 : 1, 0).setVisible(!USE_SIDE_HUD || USE_FULL_SIDE_HUD);

    this.waveText = this.add.text(RIGHT_PANEL_TEXT_LEFT, RIGHT_PANEL_TOP + (USE_SIDE_HUD ? 58 : 33), '', {
      fontFamily: UI_FONT_FAMILY,
      fontSize: '20px',
      color: '#f4eedd',
    });

    this.levelProgressBg = this.add.rectangle(
      RIGHT_PANEL_TEXT_LEFT,
      LEVEL_PROGRESS_Y,
      LEVEL_PROGRESS_WIDTH,
      USE_FULL_SIDE_HUD ? 9 : 7,
      0xffffff,
      0.14,
    ).setOrigin(0, 0.5).setVisible(USE_SIDE_HUD);
    this.levelProgressFill = this.add.rectangle(
      RIGHT_PANEL_TEXT_LEFT,
      LEVEL_PROGRESS_Y,
      LEVEL_PROGRESS_WIDTH,
      USE_FULL_SIDE_HUD ? 9 : 7,
      0x65c694,
      0.96,
    ).setOrigin(0, 0.5).setVisible(USE_SIDE_HUD);
    this.levelProgressTicks = this.add.graphics().setVisible(USE_FULL_SIDE_HUD);
    this.levelProgressLabels = this.add.container(0, 0).setVisible(USE_FULL_SIDE_HUD);
    this.levelProgressLabelSignature = '';
    this.bossWaveMarkerText = this.add.text(RIGHT_PANEL_TEXT_RIGHT, LEVEL_PROGRESS_Y + 8, '', {
      fontFamily: UI_FONT_FAMILY,
      fontSize: '10px',
      color: '#ef725f',
    }).setOrigin(1, 0).setVisible(false);

    this.add.rectangle(
      RIGHT_PANEL_RIGHT - RIGHT_PANEL_WIDTH / 2,
      RIGHT_SUMMARY_TOP,
      RIGHT_PANEL_WIDTH,
      RIGHT_SUMMARY_HEIGHT,
      0x17140f,
      0.62,
    ).setOrigin(0.5, 0).setStrokeStyle(2, 0xfbc02d, 0.18).setVisible(USE_SIDE_HUD);

    this.scoreText = this.add.text(
      USE_SIDE_HUD ? RIGHT_PANEL_TEXT_LEFT : RIGHT_PANEL_TEXT_RIGHT,
      USE_SIDE_HUD ? RIGHT_SUMMARY_TOP + 10 : RIGHT_PANEL_TOP + 36,
      '',
      {
      fontFamily: UI_FONT_FAMILY,
      fontSize: '13px',
      color: '#d7d4cb',
      },
    ).setOrigin(USE_SIDE_HUD ? 0 : 1, 0);

    this.enhancementText = this.add.text(
      RIGHT_PANEL_TEXT_LEFT,
      RIGHT_SUMMARY_TOP + 32,
      '',
      {
        fontFamily: UI_FONT_FAMILY,
        fontSize: USE_FULL_SIDE_HUD ? '12px' : '13px',
        color: '#9ed7e2',
        lineSpacing: 2,
      },
    ).setVisible(USE_FULL_SIDE_HUD);

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
    this.arsenalPanel = this.add.rectangle(
      LEFT_PANEL_LEFT,
      LEFT_PANEL_TOP + LEFT_PANEL_HEIGHT + 8,
      1,
      1,
      USE_SIDE_HUD ? 0x11151c : 0x101116,
      USE_SIDE_HUD ? 0.68 : 0.9,
    )
      .setOrigin(0, 0)
      .setStrokeStyle(2, USE_SIDE_HUD ? 0x58c9dd : 0xf4eedd, USE_SIDE_HUD ? 0.2 : 0.36);
    this.arsenalTitleText = this.add.text(0, 0, '', {
      fontFamily: UI_FONT_FAMILY,
      fontSize: '12px',
      color: '#aab2b8',
    }).setVisible(USE_SIDE_HUD);
    this.arsenalSlots.length = 0;
    this.previousWeaponUsability.clear();

    for (let index = 0; index < MAX_WEAPON_LOADOUT_SIZE; index++) {
      const box = this.add.rectangle(0, 0, ARSENAL_SLOT_WIDTH, ARSENAL_SLOT_HEIGHT, 0x23252b, 0.96)
        .setOrigin(0, 0)
        .setStrokeStyle(1, 0xf4eedd, 0.2);
      const slotNumber = this.add.text(6, 4, String(index + 1), {
        fontFamily: UI_FONT_FAMILY,
        fontSize: '10px',
        color: '#aab2b8',
      });
      const image = this.add.image(
        ARSENAL_IMAGE_CENTER_X,
        ARSENAL_SLOT_HEIGHT / 2,
        GAME_WEAPON_TEXTURE_KEYS.pistol,
      ).setVisible(false);
      const name = this.add.text(ARSENAL_TEXT_LEFT, USE_FULL_SIDE_HUD ? 7 : 4, '', {
        fontFamily: UI_FONT_FAMILY,
        fontSize: USE_FULL_SIDE_HUD ? '12px' : '10px',
        color: '#f4eedd',
      });
      const ammo = this.add.text(
        ARSENAL_TEXT_LEFT,
        USE_FULL_SIDE_HUD ? 31 : USE_SIDE_HUD ? 22 : 21,
        '--',
        {
        fontFamily: UI_FONT_FAMILY,
        fontSize: USE_FULL_SIDE_HUD ? '12px' : '11px',
        color: '#aab2b8',
        },
      ).setOrigin(0, 0);
      const reloadBg = this.add.rectangle(ARSENAL_TEXT_LEFT, ARSENAL_SLOT_HEIGHT - 4, ARSENAL_SLOT_TEXT_WIDTH, 3, 0xf4eedd, 0.16)
        .setOrigin(0, 0.5)
        .setVisible(false);
      const reloadFill = this.add.rectangle(ARSENAL_TEXT_LEFT, ARSENAL_SLOT_HEIGHT - 4, ARSENAL_SLOT_TEXT_WIDTH, 3, 0x58c9dd, 0.95)
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
      this.arsenalTitleText,
      ...this.arsenalSlots.map((slot) => slot.container),
    ]);
    this.arsenalContainer.setVisible(false).setAlpha(0);
  }

  private layoutArsenal(statusCount: number): void {
    const visibleCount = Phaser.Math.Clamp(statusCount, 0, this.arsenalSlots.length);
    const layoutCount = USE_SIDE_HUD ? MAX_WEAPON_LOADOUT_SIZE : visibleCount;
    const columns = Math.max(1, Math.min(ARSENAL_COLUMNS, layoutCount));
    const rows = Math.max(1, Math.ceil(layoutCount / ARSENAL_COLUMNS));
    const padding = ARSENAL_PANEL_PADDING;
    const headingHeight = USE_SIDE_HUD ? ARSENAL_HEADING_HEIGHT : 0;
    const panelWidth = columns * ARSENAL_SLOT_WIDTH + (columns - 1) * ARSENAL_SLOT_GAP + padding * 2;
    const panelHeight = USE_SIDE_HUD
      ? SIDE_ARSENAL_PANEL_HEIGHT
      : rows * ARSENAL_SLOT_HEIGHT + (rows - 1) * ARSENAL_SLOT_GAP + padding * 2 + headingHeight;
    const panelTop = LEFT_PANEL_TOP + LEFT_PANEL_HEIGHT + 8;

    this.arsenalPanel.setPosition(LEFT_PANEL_LEFT, panelTop).setSize(panelWidth, panelHeight);
    this.arsenalTitleText
      .setPosition(LEFT_PANEL_LEFT + padding, panelTop + 5)
      .setText(`出战武器  ${visibleCount}/${MAX_WEAPON_LOADOUT_SIZE}`);
    this.arsenalSlots.forEach((slot, index) => {
      const column = index % ARSENAL_COLUMNS;
      const row = Math.floor(index / ARSENAL_COLUMNS);
      slot.container.setPosition(
        LEFT_PANEL_LEFT + padding + column * (ARSENAL_SLOT_WIDTH + ARSENAL_SLOT_GAP),
        panelTop + padding + headingHeight + row * (ARSENAL_SLOT_HEIGHT + ARSENAL_SLOT_GAP),
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
    // 常驻状态已移入侧栏，警报回到战场中线，保证左右宽屏留白不会改变注意力锚点。
    this.combatAlertBg = this.add.rectangle(COMBAT_ALERT_CENTER_X, 208, COMBAT_ALERT_WIDTH, 48, 0x2b220f, 0.97);
    this.combatAlertBg.setStrokeStyle(3, 0xfbc02d, 0.95);
    this.combatAlertTitle = this.add.text(GAME_WIDTH / 2, 198, '', {
      fontFamily: UI_FONT_FAMILY,
      fontSize: '22px',
      color: '#fff0bd',
    }).setOrigin(0.5);
    this.combatAlertSubtitle = this.add.text(GAME_WIDTH / 2, 218, '', {
      fontFamily: UI_FONT_FAMILY,
      fontSize: '13px',
      color: '#d6c382',
    }).setOrigin(0.5);

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
    const streakTop = USE_SIDE_HUD
      ? RIGHT_SUMMARY_TOP + RIGHT_SUMMARY_HEIGHT + 12
      : RIGHT_PANEL_TOP + RIGHT_PANEL_HEIGHT + 10;
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
    // 暂停菜单必须始终覆盖战斗 HUD、Boss 条和临时提示。
    this.pauseOverlay.setDepth(10_000);
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
    const character = getCharacterDef(state.player.characterId);
    const passiveStatus = character.passive.kind === 'lastStand'
      ? state.player.characterPassive.lastStandAvailable ? '余生就绪' : '余生已用'
      : character.passive.kind === 'stationaryCalibration'
        ? state.player.characterPassive.calibrated ? '校准完成' : '校准中'
        : character.passive.name;

    this.refreshAmmoPresentation();
    this.refreshArsenal(true);

    this.healthText.setText(USE_NARROW_SIDE_HUD
      ? `HP ${state.player.health}/${state.player.maxHealth}`
      : `${state.player.health}/${state.player.maxHealth}`);
    this.characterText
      .setText(`${character.codename} · ${passiveStatus}`)
      .setColor(toHexColor(character.accentColor));
    this.healthFill.width = HEALTH_BAR_WIDTH * Phaser.Math.Clamp(healthRatio, 0, 1);
    this.healthPulseFill.width = HEALTH_BAR_WIDTH;
    this.healthFill.fillColor = healthRatio <= 0.25 ? 0xe33d35 : healthRatio <= 0.55 ? 0xe59a18 : 0xd9574e;

    this.itemText.setText(itemLabel);
    this.itemDetailText.setText(itemId ? `×${itemCount}` : '空');
    this.itemIcon.setVisible(Boolean(itemId));
    if (itemId) this.itemIcon.setTexture(PROP_TEXTURE_KEYS[itemId as ItemId]);

    const modeLabel = this.gameScene.getModeLabel();
    const levelLabel = this.gameScene.getLevelLabel();
    this.modeText.setText(USE_SIDE_HUD && !USE_FULL_SIDE_HUD
      ? `${modeLabel} · ${levelLabel}`
      : modeLabel);
    this.levelText.setText(levelLabel);
    this.waveText.setText(totalWaves ? `WAVE ${state.waveIndex}/${totalWaves}` : `WAVE ${state.waveIndex}`);
    this.scoreText.setText(USE_FULL_SIDE_HUD
      ? `${state.score} 分`
      : `${state.score} 分  ·  强化 ${state.player.activeEnhancements.size}`);
    const enhancementNames = [...state.player.activeEnhancements]
      .map((enhancementId) => ENHANCEMENTS[enhancementId]?.cardTitle)
      .filter((name): name is string => Boolean(name));
    this.enhancementText.setText(USE_FULL_SIDE_HUD
      ? [`强化 ${enhancementNames.length} 项`, ...enhancementNames.slice(-2).map((name) => `▸ ${name}`)].join('\n')
      : `强化 ${enhancementNames.length}`);
    this.refreshLevelProgress(state.waveIndex, totalWaves);
    this.controlHintText.setText(
      `${formatKeybind(MENU_KEY)} 菜单  ·  ${formatKeybind(keybinds.nextWeapon)}/${formatKeybind(keybinds.prevWeapon)} 切换武器  ·  ${formatKeybind(keybinds.deployItem)} 布置道具`,
    );

    fitTextWidth(this.healthText, USE_NARROW_SIDE_HUD ? LEFT_COLUMN_MAX_WIDTH : USE_SIDE_HUD ? 80 : 70);
    fitTextWidth(
      this.characterText,
      USE_NARROW_SIDE_HUD ? LEFT_COLUMN_MAX_WIDTH : USE_SIDE_HUD ? Math.max(64, LEFT_COLUMN_MAX_WIDTH - 86) : 140,
    );
    fitTextWidth(this.itemText, ITEM_COLUMN_MAX_WIDTH);
    fitTextWidth(this.itemDetailText, ITEM_COLUMN_MAX_WIDTH);
    fitTextWidth(this.modeText, USE_SIDE_HUD ? RIGHT_PANEL_TEXT_MAX_WIDTH : 142);
    fitTextWidth(this.levelText, USE_SIDE_HUD ? RIGHT_PANEL_TEXT_MAX_WIDTH : 150);
    fitTextWidth(this.waveText, USE_SIDE_HUD ? RIGHT_PANEL_TEXT_MAX_WIDTH : 132);
    fitTextWidth(this.scoreText, USE_SIDE_HUD ? RIGHT_PANEL_TEXT_MAX_WIDTH : 160);
    fitTextWidth(this.enhancementText, RIGHT_PANEL_TEXT_MAX_WIDTH);
    fitTextWidth(this.controlHintText, USE_SIDE_HUD ? RIGHT_PANEL_TEXT_MAX_WIDTH : GAME_WIDTH - 48);
  }

  private refreshLevelProgress(waveIndex: number, totalWaves: number | null): void {
    const visible = USE_SIDE_HUD && totalWaves !== null && totalWaves > 0;
    this.levelProgressBg.setVisible(visible);
    this.levelProgressFill.setVisible(visible);
    this.levelProgressTicks.clear().setVisible(visible && USE_FULL_SIDE_HUD);
    this.levelProgressLabels.setVisible(visible && USE_FULL_SIDE_HUD);
    this.bossWaveMarkerText.setVisible(visible && this.gameScene.hasBossWave());
    if (!visible || totalWaves === null) return;

    this.levelProgressFill.width = LEVEL_PROGRESS_WIDTH * Phaser.Math.Clamp(waveIndex / totalWaves, 0, 1);
    if (USE_FULL_SIDE_HUD) {
      const tickStep = totalWaves > 12 ? Math.ceil(totalWaves / 8) : 1;
      this.levelProgressTicks.lineStyle(1, 0xf4eedd, 0.36);
      for (let wave = tickStep; wave < totalWaves; wave += tickStep) {
        const x = RIGHT_PANEL_TEXT_LEFT + LEVEL_PROGRESS_WIDTH * wave / totalWaves;
        this.levelProgressTicks.lineBetween(x, LEVEL_PROGRESS_Y - 5, x, LEVEL_PROGRESS_Y + 5);
      }

      const labelSignature = String(totalWaves);
      if (this.levelProgressLabelSignature !== labelSignature) {
        this.levelProgressLabelSignature = labelSignature;
        this.levelProgressLabels.removeAll(true);
        const labelStep = Math.max(1, Math.ceil(totalWaves / 4));
        const labelWaves = new Set<number>([1, totalWaves]);
        for (let wave = 1; wave <= totalWaves; wave += labelStep) labelWaves.add(wave);
        for (const wave of [...labelWaves].sort((a, b) => a - b)) {
          const x = RIGHT_PANEL_TEXT_LEFT + LEVEL_PROGRESS_WIDTH * wave / totalWaves;
          this.levelProgressLabels.add(this.add.text(x, LEVEL_PROGRESS_Y + 8, `W${wave}`, {
            fontFamily: UI_FONT_FAMILY,
            fontSize: '8px',
            color: '#777f84',
          }).setOrigin(0.5, 0));
        }
      }
    }
    this.bossWaveMarkerText
      .setPosition(
        RIGHT_PANEL_TEXT_RIGHT,
        USE_FULL_SIDE_HUD ? LEVEL_PROGRESS_Y - 19 : LEVEL_PROGRESS_Y + 8,
      )
      .setText(USE_FULL_SIDE_HUD ? 'BOSS' : 'B');
  }

  private handleWeaponChanged(): void {
    this.refresh();
    this.showArsenal();
  }

  private showArsenal(duration = ARSENAL_DISPLAY_MS): void {
    this.refreshArsenal(true);
    this.arsenalHideCall?.remove(false);
    this.arsenalHideCall = null;
    this.tweens.killTweensOf(this.arsenalContainer);
    if (USE_SIDE_HUD) {
      this.arsenalContainer.setVisible(true).setAlpha(1).setY(0);
      return;
    }
    if (duration <= 0) {
      this.arsenalContainer.setVisible(false).setAlpha(0);
      return;
    }
    this.arsenalContainer.setVisible(true).setAlpha(0).setY(-4);
    this.tweens.add({
      targets: this.arsenalContainer,
      alpha: 1,
      y: 0,
      duration: 140,
      ease: 'Cubic.Out',
    });
    this.arsenalHideCall = this.time.delayedCall(duration, () => {
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

  private showControlHint(duration = CONTROL_HINT_DISPLAY_MS): void {
    this.controlHintHideCall?.remove(false);
    this.tweens.killTweensOf(this.controlHintText);
    this.controlHintText.setVisible(true).setAlpha(0);
    this.tweens.add({ targets: this.controlHintText, alpha: 1, duration: 180 });
    this.controlHintHideCall = this.time.delayedCall(duration, () => {
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
    const compactSideHud = USE_SIDE_HUD && !USE_FULL_SIDE_HUD;

    this.weaponText.setText(weapon.name);
    this.ammoText.setText(compactSideHud
      ? `${ammoInMag}/${weapon.magazineSize} · 备${ammoReserve}`
      : `${ammoInMag}/${weapon.magazineSize}`);
    // 每帧都会走这里：只做宽度收缩，行位不动，避免长武器名顶到弹药数上。
    fitTextWidth(this.weaponText, USE_SIDE_HUD ? LEFT_COLUMN_MAX_WIDTH : LEFT_COLUMN_MAX_WIDTH - 76);
    fitTextWidth(this.ammoText, USE_SIDE_HUD ? LEFT_COLUMN_MAX_WIDTH : 76);

    if (reload) {
      // 逐发填装的进度条读弹匣填充度而不是单发计时：玩家关心的是「现在有几发能打」，
      // 而不是当前这一发装到哪了。
      if (weapon.reloadMode === 'shell') {
        if (compactSideHud) {
          this.ammoText.setText(`装填 ${ammoInMag}/${weapon.magazineSize}`);
          fitTextWidth(this.ammoText, LEFT_COLUMN_MAX_WIDTH);
          this.setAmmoDetail('');
        } else {
          this.setAmmoDetail(`逐发装填 ${ammoInMag}/${weapon.magazineSize} · 开火可打断`);
        }
        this.ammoText.setColor('#58c9dd');
        this.ammoProgressFill.fillColor = 0x58c9dd;
        this.ammoProgressFill.width = AMMO_BAR_WIDTH * Phaser.Math.Clamp(
          weapon.magazineSize > 0 ? ammoInMag / weapon.magazineSize : 0,
          0,
          1,
        );
        return;
      }
      if (compactSideHud) {
        this.ammoText.setText(`换弹 ${(reload.remaining / 1000).toFixed(1)}s`);
        fitTextWidth(this.ammoText, LEFT_COLUMN_MAX_WIDTH);
        this.setAmmoDetail('');
      } else {
        this.setAmmoDetail(`换弹中 · ${(reload.remaining / 1000).toFixed(1)} s`);
      }
      this.ammoText.setColor('#58c9dd');
      this.ammoProgressFill.fillColor = 0x58c9dd;
      this.ammoProgressFill.width = AMMO_BAR_WIDTH * reload.progress;
      return;
    }

    const ammoRatio = weapon.magazineSize > 0 ? ammoInMag / weapon.magazineSize : 0;
    this.setAmmoDetail(compactSideHud ? '' : `备用 ${ammoReserve} · ${weapon.auto ? '连发' : '点射'}`);
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
        if (!USE_SIDE_HUD) {
          slot.container.setVisible(false);
          return;
        }
        slot.container.setVisible(true).setAlpha(0.58);
        slot.image.setVisible(false);
        slot.index.setText(String(index + 1)).setColor('#666d72');
        slot.name.setText('空槽').setColor('#777f84');
        slot.ammo.setText('待编入').setColor('#5f666b');
        slot.reloadBg.setVisible(false);
        slot.reloadFill.setVisible(false);
        slot.box.setFillStyle(0x191b20, 0.72).setStrokeStyle(1, 0xf4eedd, 0.12);
        return;
      }
      slot.container.setVisible(true);

      const weaponId = status.weaponId;
      const weapon = WEAPONS[weaponId];
      const isCurrent = weaponId === state.player.currentWeaponId;
      slot.image.setVisible(true).setTexture(GAME_WEAPON_TEXTURE_KEYS[weaponId]);
      const imageScale = Math.min(
        ARSENAL_IMAGE_MAX_WIDTH / slot.image.width,
        ARSENAL_IMAGE_MAX_HEIGHT / slot.image.height,
      );
      slot.image.setScale(imageScale).setAlpha(status.usable ? 1 : 0.25);
      slot.name
        .setText(index === 0 ? `锁 · ${weapon.name}` : weapon.name)
        .setColor(isCurrent ? '#0f0e13' : status.usable ? '#f4eedd' : '#8e8b88');
      fitTextWidth(slot.name, ARSENAL_SLOT_TEXT_WIDTH);
      slot.ammo
        .setText(`${status.ammoInMag}/${status.infiniteAmmo ? '∞' : status.ammoReserve}`)
        .setColor(isCurrent ? '#31302d' : status.usable ? '#c4c8cb' : '#ff7668');
      fitTextWidth(slot.ammo, ARSENAL_SLOT_TEXT_WIDTH);
      slot.index
        .setText(String(index + 1))
        .setColor(isCurrent ? '#0f0e13' : index === 0 ? '#58c9dd' : status.usable ? '#aab2b8' : '#777575');

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

  private showWaveAnnouncement(payload: WaveAnnouncementPayload, totalDuration = 1420): void {
    this.activeAnnouncement = { ...payload };
    this.announcementTitle.setText(payload.title);
    this.announcementSubtitle.setText(payload.subtitle);
    this.announcementBg.fillColor = payload.accent === 0xff6f4a ? 0x24130f : 0xf4eedd;
    this.announcementTitle.setColor(payload.accent === 0xff6f4a ? '#fff0e6' : '#0f0e13');
    this.announcementTitle.setStroke(payload.accent === 0xff6f4a ? '#ff9f76' : '#fbc02d', 3);
    this.announcementSubtitle.setColor(payload.accent === 0xff6f4a ? '#ffd7c9' : '#39424b');

    this.tweens.killTweensOf(this.announcementContainer);
    this.announcementTween = null;
    this.announcementContainer.setAlpha(0);
    this.announcementContainer.setScale(0.92);
    this.announcementContainer.y = -24;

    const fadeDuration = Math.min(260, Math.max(1, Math.floor(totalDuration / 2)));
    const holdDuration = Math.max(0, totalDuration - fadeDuration * 2);
    this.announcementTween = this.tweens.add({
      targets: this.announcementContainer,
      alpha: 1,
      scale: 1,
      y: 0,
      ease: 'Back.Out',
      duration: fadeDuration,
      hold: holdDuration,
      yoyo: true,
      onYoyo: () => {
        this.announcementContainer.y = 0;
      },
      onComplete: () => {
        this.activeAnnouncement = null;
        this.announcementTween = null;
      },
    });
    if (this.gameScene.getPauseReason() !== null) this.announcementTween.pause();
  }

  private showCombatAlert(payload: CombatAlert): void {
    if (!shouldPresentCombatAlert(this.activeCombatAlert, payload)) return;

    const style = COMBAT_ALERT_STYLES[payload.tone];
    this.activeCombatAlert = payload;
    this.combatAlertBg.fillColor = style.background;
    this.combatAlertBg.setStrokeStyle(3, style.accent, 0.95);
    this.combatAlertTitle.setText(payload.title).setColor(style.title);
    this.combatAlertSubtitle.setText(payload.subtitle).setColor(style.subtitle);
    fitTextWidth(this.combatAlertTitle, COMBAT_ALERT_WIDTH - 44);
    fitTextWidth(this.combatAlertSubtitle, COMBAT_ALERT_WIDTH - 44);

    this.tweens.killTweensOf(this.combatAlertContainer);
    this.combatAlertTween = null;
    this.combatAlertContainer.setVisible(true);
    this.combatAlertContainer.setAlpha(0);
    this.combatAlertContainer.y = -8;

    const fadeDuration = Math.min(130, Math.max(1, Math.floor(payload.duration / 2)));
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
    this.currentKillStreak = streak;
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

  private showKillStreakMilestone(payload: KillStreakMilestonePayload, totalDuration = 980): void {
    this.activeMilestone = { ...payload };
    this.milestoneText.setText(payload.label);
    this.milestoneText.setColor(`#${payload.color.toString(16).padStart(6, '0')}`);

    this.tweens.killTweensOf(this.milestoneText);
    this.milestoneTween = null;
    this.milestoneText.setVisible(true);
    this.milestoneText.setAlpha(0);
    this.milestoneText.setScale(0.6);
    const fadeDuration = Math.min(180, Math.max(1, Math.floor(totalDuration / 2)));
    const holdDuration = Math.max(0, totalDuration - fadeDuration * 2);
    this.milestoneTween = this.tweens.add({
      targets: this.milestoneText,
      alpha: 1,
      scale: 1,
      duration: fadeDuration,
      hold: holdDuration,
      yoyo: true,
      ease: 'Back.Out',
      onComplete: () => {
        this.milestoneText.setVisible(false);
        this.activeMilestone = null;
        this.milestoneTween = null;
      },
    });

    if (this.gameScene.getPauseReason() !== null) {
      this.milestoneTween.pause();
    }
  }

  private showPickupToast(payload: PickupToastPayload, totalDuration = 980): void {
    this.activePickupToast = { ...payload };
    this.pickupToastBg.setStrokeStyle(3, payload.accent, 0.95);
    this.pickupToastText.setText(payload.title);
    this.tweens.killTweensOf(this.pickupToastContainer);
    this.pickupToastTween = null;
    this.pickupToastContainer.setVisible(true);
    this.pickupToastContainer.setAlpha(0);
    this.pickupToastContainer.y = 0;
    const fadeDuration = Math.min(180, Math.max(1, Math.floor(totalDuration / 2)));
    const holdDuration = Math.max(0, totalDuration - fadeDuration * 2);
    this.pickupToastTween = this.tweens.add({
      targets: this.pickupToastContainer,
      alpha: 1,
      y: -24,
      duration: fadeDuration,
      hold: holdDuration,
      yoyo: true,
      onComplete: () => {
        this.pickupToastContainer.setVisible(false);
        this.activePickupToast = null;
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
      this.announcementTween?.pause();
      this.combatAlertTween?.pause();
      this.pickupToastTween?.pause();
      this.killStreakTween?.pause();
      this.milestoneTween?.pause();
    } else {
      this.announcementTween?.resume();
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
      if (reason === 'cardSelection' && this.scene.isActive(SCENES.cardSelection)) {
        this.scene.bringToTop(SCENES.cardSelection);
      }
      return;
    }

    for (const item of this.pauseMenuItems) {
      item.paint(false);
    }
    this.refreshPauseAudioLabel();
    this.pauseOverlay.setVisible(true);
    this.pauseOverlay.setAlpha(1);
    this.children.bringToTop(this.pauseOverlay);
  }

  private handleShutdown(): void {
    this.unsubscribeHudLayout?.();
    this.unsubscribeHudLayout = null;
    this.events.off(Phaser.Scenes.Events.WAKE, this.handleHudWake, this);
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
    if (!this.pendingLayoutSnapshot) {
      this.pendingLayoutGameState = null;
      this.layoutDirtyWhileSleeping = false;
      this.activeAnnouncement = null;
      this.activeCombatAlert = null;
      this.activePickupToast = null;
      this.activeMilestone = null;
      this.currentKillStreak = 0;
    }
  }
}
