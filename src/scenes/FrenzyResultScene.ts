import Phaser from 'phaser';
import { FRENZY_DURATION_MS, FRENZY_PRESETS, FRENZY_VERSION } from '../config/frenzy';
import { SCENES } from '../constants';
import { configureHighResolutionScene } from '../systems/DisplayManager';
import { formatFrenzyTime, getFrenzyScore, type FrenzyRecord, type FrenzyRun } from '../systems/FrenzyRules';
import { SoundManager } from '../systems/SoundManager';
import { createDebriefLayout } from '../ui/debrief';

export interface FrenzyResultData { run: FrenzyRun; newRecord: boolean; best: FrenzyRecord | null }

export class FrenzyResultScene extends Phaser.Scene {
  private result!: FrenzyResultData;
  private leaving = false;

  constructor() { super(SCENES.frenzyResult); }
  init(data: FrenzyResultData): void { this.result = data; this.leaving = false; }

  create(): void {
    configureHighResolutionScene(this);
    SoundManager.setMusic('menu');
    SoundManager.pauseMusic(false);
    const { run, newRecord, best } = this.result;
    const score = getFrenzyScore(run);
    const won = run.phase === 'won';
    createDebriefLayout(this, {
      accent: won ? 0xfbc02d : 0xd9574e,
      eyebrow: 'FRENZY  //  AFTER ACTION REPORT',
      title: won ? '狂潮突破' : run.phase === 'timeout' ? '时间耗尽' : '猎杀中断',
      meta: `狂潮挑战 · ${FRENZY_PRESETS[run.presetId].name}`,
      metaSub: !run.recordEligible ? '调试战局 · 不记录成绩' : newRecord ? '新的个人纪录' : best ? `个人最佳 ${best.score} 分` : '通关后记录个人最佳',
      watermark: 'FRENZY',
      cards: [
        { label: won ? '通关总分' : '本局得分', tag: 'SCORE', value: String(score.total), highlight: true },
        { label: '用时', tag: 'TIME', value: formatFrenzyTime(run.elapsedMs) },
        { label: '核心', tag: 'OBJECTIVES', value: `${Object.values(run.targets).filter((status) => status === 'collected').length} / 3` },
        { label: '最佳连杀', tag: 'STREAK', value: String(run.bestStreak) },
        { label: '目标得分', tag: 'HUNT', value: String(score.objectives) },
        { label: '通关奖励', tag: 'CLEAR', value: String(score.completion) },
        { label: '时间奖励', tag: 'SPEED', value: String(score.time), detail: `剩余 ${formatFrenzyTime(FRENZY_DURATION_MS - run.elapsedMs)}` },
        { label: '战斗加分', tag: 'COMBAT', value: String(score.combat), detail: `击杀 ${run.kills} · 加分上限 2000` },
      ],
      footerRows: [
        { label: '规则', value: '三核心召唤首领，击杀立即通关；刷杂兵不如更快完成目标。' },
        { label: '纪录', value: `按配置版本 ${FRENZY_VERSION} 与预设独立记录，失败不覆盖通关成绩。` },
      ],
      buttons: [
        { label: '同预设再来一局', shortcut: 'ENTER', primary: true, onSelect: () => this.leave('retry') },
        { label: '更换预设', primary: false, onSelect: () => this.leave('preset') },
        { label: '返回主页', shortcut: 'ESC', primary: false, onSelect: () => this.leave('menu') },
      ],
      hint: '更换猎杀顺序，尝试用上一枚核心的奖励攻下下一个目标。',
    });
    this.input.keyboard?.once('keydown-ENTER', () => this.leave('retry'));
    this.input.keyboard?.once('keydown-ESC', () => this.leave('menu'));
  }

  private leave(destination: 'retry' | 'preset' | 'menu'): void {
    if (this.leaving) return;
    this.leaving = true;
    SoundManager.play('uiConfirm');
    if (destination === 'retry') this.scene.start(SCENES.game, { mode: 'frenzy', frenzyPresetId: this.result.run.presetId });
    else if (destination === 'preset') this.scene.start(SCENES.frenzyPreparation, { presetId: this.result.run.presetId });
    else this.scene.start(SCENES.mainMenu);
  }
}
