import Phaser from 'phaser';
import { CORRIDOR_MAX_ALLIES, CORRIDOR_PRESETS, CORRIDOR_VERSION } from '../config/corridor';
import { SCENES } from '../constants';
import { configureHighResolutionScene } from '../systems/DisplayManager';
import { SoundManager } from '../systems/SoundManager';
import { formatCorridorTime, type CorridorRecord, type CorridorRun } from '../systems/CorridorRules';
import { createDebriefLayout } from '../ui/debrief';

export interface CorridorResultData {
  run: CorridorRun;
  totalScore: number;
  newRecord: boolean;
  best: CorridorRecord | null;
}

/** 通道模式结算页。得分制:漏怪(breached)与阵亡(dead)同权重记分。 */
export class CorridorResultScene extends Phaser.Scene {
  private result!: CorridorResultData;
  private leaving = false;

  constructor() { super(SCENES.corridorResult); }
  init(data: CorridorResultData): void { this.result = data; this.leaving = false; }

  create(): void {
    configureHighResolutionScene(this);
    SoundManager.setMusic('menu');
    SoundManager.pauseMusic(false);
    const { run, totalScore, newRecord, best } = this.result;
    const survived = run.phase === 'dead';
    createDebriefLayout(this, {
      accent: survived ? 0x8fe8ff : 0xd9574e,
      eyebrow: 'CORRIDOR  //  AFTER ACTION REPORT',
      title: survived ? '防线未破' : '通道失守',
      meta: `通道模式 · ${CORRIDOR_PRESETS[run.presetId].name}`,
      metaSub: !run.recordEligible ? '调试战局 · 不记录成绩' : newRecord ? '新的个人纪录' : best ? `个人最佳 ${best.score} 分` : '按局记分,好分不回退',
      watermark: 'CORRIDOR',
      cards: [
        { label: '本局总分', tag: 'SCORE', value: String(totalScore), highlight: true },
        { label: '存活时间', tag: 'TIME', value: formatCorridorTime(run.elapsedMs) },
        { label: '击破卡片', tag: 'CARDS', value: String(run.cardKills) },
        { label: '叫上的队友', tag: 'ALLIES', value: `${run.alliesSummoned} / ${CORRIDOR_MAX_ALLIES}` },
        { label: '卡片得分', tag: 'CARD SCORE', value: String(run.cardScore) },
        { label: '击杀与存活', tag: 'COMBAT', value: String(Math.max(0, totalScore - run.cardScore)), detail: '每存活 1 秒 +2' },
        { label: '弹道增幅', tag: 'VOLLEY', value: `+${run.bonusProjectiles}` },
        { label: '火力倍率', tag: 'DAMAGE', value: `×${(1.25 ** run.damageStacks).toFixed(2)}` },
      ],
      footerRows: [
        { label: '规则', value: '主通道漏一只即失败;击破漂移卡当帧生效,漂出左侧则作废。' },
        { label: '纪录', value: `按配置版本 ${CORRIDOR_VERSION} 与预设独立记录,漏怪与阵亡都记分。` },
      ],
      buttons: [
        { label: '同预设再来一局', shortcut: 'ENTER', primary: true, onSelect: () => this.leave('retry') },
        { label: '更换预设', primary: false, onSelect: () => this.leave('preset') },
        { label: '返回主页', shortcut: 'ESC', primary: false, onSelect: () => this.leave('menu') },
      ],
      hint: '试试更早叫队友,或把火力强化叠满两层再迎狂潮阶段。',
    });
    this.input.keyboard?.once('keydown-ENTER', () => this.leave('retry'));
    this.input.keyboard?.once('keydown-ESC', () => this.leave('menu'));
  }

  private leave(destination: 'retry' | 'preset' | 'menu'): void {
    if (this.leaving) return;
    this.leaving = true;
    SoundManager.play('uiConfirm');
    if (destination === 'retry') this.scene.start(SCENES.game, { mode: 'corridor', corridorPresetId: this.result.run.presetId });
    else if (destination === 'preset') this.scene.start(SCENES.corridorPreparation, { presetId: this.result.run.presetId });
    else this.scene.start(SCENES.mainMenu);
  }
}
