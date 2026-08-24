import Phaser from 'phaser';
import { SCENES } from '../constants';
import type { GameMode } from '../systems/GameState';
import { SAVE_KEYS, SaveManager } from '../systems/SaveManager';
import { configureHighResolutionScene } from '../systems/DisplayManager';
import { SoundManager } from '../systems/SoundManager';
import {
  createDebriefLayout,
  formatAmmoEconomy,
  formatDuration,
  formatWeaponUsage,
  type DebriefStatCard,
} from '../ui/debrief';
import { LEVELS } from '../config/levels';
import { DEFAULT_CHARACTER_ID, getCharacterDef, type CharacterId } from '../config/characters';
import type { WeaponId } from '../config/weapons';

interface GameOverData {
  mode: GameMode;
  levelId: string | null;
  score: number;
  wave: number;
  elapsedMs: number;
  kills: number;
  bossDefeated: boolean;
  enhancements: number;
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

export class GameOverScene extends Phaser.Scene {
  private dataRef: GameOverData = { mode: 'level', levelId: 'level_1', score: 0, wave: 0, elapsedMs: 0, kills: 0, bossDefeated: false, enhancements: 0, bestKillStreak: 0, characterId: DEFAULT_CHARACTER_ID, starterWeaponId: 'pistol', headshots: 0, executions: 0, pierceHits: 0, oilBarrelsTriggered: 0, flourBarrelsTriggered: 0, minesTriggered: 0, weaponUsageMs: {}, weaponEmptyEvents: {}, ammoAmountsByType: {}, ammoPityTriggers: 0, finiteWeaponsUnavailableMs: 0 };

  constructor() {
    super(SCENES.gameOver);
  }

  init(data: Partial<GameOverData>): void {
    const mode = data.mode ?? 'level';
    this.dataRef = {
      mode,
      levelId: mode === 'endless' ? null : data.levelId ?? 'level_1',
      score: data.score ?? 0,
      wave: data.wave ?? 0,
      elapsedMs: data.elapsedMs ?? 0,
      kills: data.kills ?? 0,
      bossDefeated: data.bossDefeated ?? false,
      enhancements: data.enhancements ?? 0,
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
    const bestWave = SaveManager.load<number>(SAVE_KEYS.endlessBestWave, 0);
    const data = this.dataRef;
    const isEndless = data.mode === 'endless';
    const level = LEVELS.find((entry) => entry.id === data.levelId);
    const hazardTotal = data.oilBarrelsTriggered + data.flourBarrelsTriggered + data.minesTriggered;

    const restart = (): void => {
      this.scene.start(SCENES.game, {
        mode: data.mode,
        levelId: data.levelId,
        characterId: data.characterId,
        starterWeaponId: data.starterWeaponId,
      });
    };

    // 卡片顺序按"玩家最先想看什么"排：本局成绩 → 这局是谁在打 → 打法细节。
    const cards: DebriefStatCard[] = [
      { label: '得分', tag: 'SCORE', value: String(data.score), highlight: true },
      { label: isEndless ? '到达波次' : '完成波次', tag: 'WAVE', value: String(data.wave) },
      { label: '消灭感染体', tag: 'KILLS', value: String(data.kills) },
      { label: '战斗用时', tag: 'TIME', value: formatDuration(data.elapsedMs) },
      {
        label: '角色',
        tag: 'OPERATIVE',
        value: getCharacterDef(data.characterId).codename,
        detail: getCharacterDef(data.characterId).role,
      },
      { label: 'BOSS', tag: 'APEX', value: data.bossDefeated ? '已击败' : '未击败' },
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

    createDebriefLayout(this, {
      accent: 0xd32f2f,
      eyebrow: 'MISSION DEBRIEF  //  作战终止',
      title: 'GAME OVER',
      meta: isEndless ? '无尽模式 · 生存战场' : level?.name ?? data.levelId ?? '未知战区',
      metaSub: isEndless ? `无尽最佳  W${bestWave}` : undefined,
      watermark: 'TERMINATED',
      cards,
      footerRows: [
        { label: '武器占比', value: formatWeaponUsage(data.weaponUsageMs) },
        { label: '弹药补给', value: formatAmmoEconomy(data) },
      ],
      buttons: [
        { label: '重开本局', shortcut: 'R', primary: true, onSelect: restart },
        {
          label: '返回主菜单',
          shortcut: 'ESC',
          primary: false,
          onSelect: () => this.scene.start(SCENES.mainMenu),
        },
      ],
      hint: '药品与强化是局内资源，重开后归零',
    });

    this.input.keyboard?.once('keydown-R', restart);
    this.input.keyboard?.once('keydown-ESC', () => {
      this.scene.start(SCENES.mainMenu);
    });
  }
}
