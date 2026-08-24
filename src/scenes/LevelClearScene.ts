import Phaser from 'phaser';
import { LEVELS } from '../config/levels';
import { SCENES } from '../constants';
import { configureHighResolutionScene } from '../systems/DisplayManager';
import { SoundManager } from '../systems/SoundManager';
import {
  createDebriefLayout,
  formatAmmoEconomy,
  formatDuration,
  formatWeaponUsage,
  type DebriefButtonSpec,
  type DebriefStatCard,
} from '../ui/debrief';
import { DEFAULT_CHARACTER_ID, getCharacterDef, type CharacterId } from '../config/characters';
import type { WeaponId } from '../config/weapons';

interface LevelClearData {
  levelId: string | null;
  nextLevelId: string | null;
  score: number;
  wave: number;
  elapsedMs: number;
  kills: number;
  bossDefeated: boolean;
  enhancements: number;
  unlockedLevelId: string | null;
  bestKillStreak: number;
  characterId: CharacterId;
  starterWeaponId: WeaponId;
  headshots: number;
  executions: number;
  pierceHits: number;
  oilBarrelsTriggered: number;
  flourBarrelsTriggered: number;
  minesTriggered: number;
  weaponUsageMs: Record<string, number>;
  weaponEmptyEvents: Record<string, number>;
  ammoAmountsByType: Record<string, number>;
  ammoPityTriggers: number;
  finiteWeaponsUnavailableMs: number;
}

export class LevelClearScene extends Phaser.Scene {
  private dataRef: LevelClearData = { levelId: 'level_1', nextLevelId: null, score: 0, wave: 0, elapsedMs: 0, kills: 0, bossDefeated: false, enhancements: 0, unlockedLevelId: null, bestKillStreak: 0, characterId: DEFAULT_CHARACTER_ID, starterWeaponId: 'pistol', headshots: 0, executions: 0, pierceHits: 0, oilBarrelsTriggered: 0, flourBarrelsTriggered: 0, minesTriggered: 0, weaponUsageMs: {}, weaponEmptyEvents: {}, ammoAmountsByType: {}, ammoPityTriggers: 0, finiteWeaponsUnavailableMs: 0 };

  constructor() {
    super(SCENES.levelClear);
  }

  init(data: Partial<LevelClearData>): void {
    this.dataRef = {
      levelId: data.levelId ?? 'level_1',
      nextLevelId: data.nextLevelId ?? null,
      score: data.score ?? 0,
      wave: data.wave ?? 0,
      elapsedMs: data.elapsedMs ?? 0,
      kills: data.kills ?? 0,
      bossDefeated: data.bossDefeated ?? false,
      enhancements: data.enhancements ?? 0,
      unlockedLevelId: data.unlockedLevelId ?? null,
      bestKillStreak: data.bestKillStreak ?? 0,
      characterId: data.characterId ?? DEFAULT_CHARACTER_ID,
      starterWeaponId: data.starterWeaponId ?? 'pistol',
      headshots: data.headshots ?? 0,
      executions: data.executions ?? 0,
      pierceHits: data.pierceHits ?? 0,
      oilBarrelsTriggered: data.oilBarrelsTriggered ?? 0,
      flourBarrelsTriggered: data.flourBarrelsTriggered ?? 0,
      minesTriggered: data.minesTriggered ?? 0,
      weaponUsageMs: data.weaponUsageMs ?? {},
      weaponEmptyEvents: data.weaponEmptyEvents ?? {},
      ammoAmountsByType: data.ammoAmountsByType ?? {},
      ammoPityTriggers: data.ammoPityTriggers ?? 0,
      finiteWeaponsUnavailableMs: data.finiteWeaponsUnavailableMs ?? 0,
    };
  }

  create(): void {
    configureHighResolutionScene(this);
    SoundManager.setMusic('menu');
    const data = this.dataRef;
    const currentLevel = LEVELS.find((level) => level.id === data.levelId);
    const nextLevel = LEVELS.find((level) => level.id === data.nextLevelId);
    const hazardTotal = data.oilBarrelsTriggered + data.flourBarrelsTriggered + data.minesTriggered;

    const cards: DebriefStatCard[] = [
      { label: '得分', tag: 'SCORE', value: String(data.score), highlight: true },
      { label: '完成波次', tag: 'WAVE', value: String(data.wave) },
      { label: '消灭感染体', tag: 'KILLS', value: String(data.kills) },
      { label: '战斗用时', tag: 'TIME', value: formatDuration(data.elapsedMs) },
      {
        label: '角色',
        tag: 'OPERATIVE',
        value: getCharacterDef(data.characterId).codename,
        detail: getCharacterDef(data.characterId).role,
      },
      { label: 'BOSS', tag: 'APEX', value: data.bossDefeated ? '已击败' : '本关无 BOSS' },
      { label: '已选强化', tag: 'AUGMENTS', value: String(data.enhancements) },
      { label: '最高连杀', tag: 'STREAK', value: String(data.bestKillStreak) },
      { label: '爆头', tag: 'HEADSHOT', value: String(data.headshots) },
      { label: '处决', tag: 'EXECUTE', value: String(data.executions) },
      { label: '穿透', tag: 'PIERCE', value: String(data.pierceHits) },
      {
        label: '环境利用',
        tag: 'HAZARD',
        value: String(hazardTotal),
        detail: `油桶 ${data.oilBarrelsTriggered} / 粉尘 ${data.flourBarrelsTriggered} / 地雷 ${data.minesTriggered}`,
      },
    ];

    const buttons: DebriefButtonSpec[] = [];
    if (nextLevel) {
      buttons.push({
        label: '下一关整备',
        primary: true,
        onSelect: () => {
          this.scene.start(SCENES.preparation, { mode: 'level', levelId: nextLevel.id });
        },
      });
    }
    buttons.push({
      label: '返回主菜单',
      shortcut: 'ESC',
      // 无下一关时「返回主菜单」就是唯一出口，升为主按钮。
      primary: !nextLevel,
      onSelect: () => this.scene.start(SCENES.mainMenu),
    });

    const progress = data.unlockedLevelId && nextLevel
      ? `新解锁  ${nextLevel.name}`
      : nextLevel
        ? `下一关  ${nextLevel.name}`
        : '战役已全部完成';

    createDebriefLayout(this, {
      accent: 0x388e3c,
      eyebrow: 'MISSION DEBRIEF  //  战区已肃清',
      title: 'LEVEL CLEAR',
      meta: currentLevel?.name ?? data.levelId ?? '未知战区',
      metaSub: progress,
      watermark: 'SECURED',
      cards,
      footerRows: [
        { label: '武器占比', value: formatWeaponUsage(data.weaponUsageMs) },
        { label: '弹药补给', value: formatAmmoEconomy(data) },
      ],
      buttons,
      hint: nextLevel
        ? '药品与强化是局内资源，进入下一关时归零'
        : '药品与强化是局内资源，本局结算后归零',
    });

    this.input.keyboard?.once('keydown-ESC', () => {
      this.scene.start(SCENES.mainMenu);
    });
  }
}
