interface WeaponRewardNoticeState {
  weaponName: string;
  alreadyOwned: boolean;
  addedToRun: boolean;
  licenseUnlocked: boolean;
  loadoutFull: boolean;
}

export function formatWeaponRewardLabel(state: WeaponRewardNoticeState): string {
  if (!state.alreadyOwned && !state.addedToRun && state.loadoutFull) {
    const licenseLabel = state.licenseUnlocked ? '，许可解锁' : '';
    return `${state.weaponName} · 编队已满${licenseLabel}，可在武器库调整`;
  }
  return `${state.weaponName}${state.licenseUnlocked ? ' · 许可解锁' : ''}`;
}

export function createWaveRewardNotice(
  labels: readonly string[],
  chapterReward: boolean,
  accent: number,
): { title: string; accent: number } | null {
  if (labels.length === 0) return null;
  return {
    title: `${chapterReward ? '章节战利品' : '阶段补给'} · ${labels.join('\n')}`,
    accent,
  };
}
