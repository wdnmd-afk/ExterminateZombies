import assert from 'node:assert/strict';

export function campaignPreparationAction(entries) {
  const matches = entries.filter(entry => entry.text === '进入战前整备' || entry.text === '进入整备');
  assert.equal(matches.length, 1, `Expected one visible campaign preparation action, found ${matches.length}`);
  return matches[0];
}

export function isAwaitingCardChoice(snapshot) {
  return snapshot.active.includes('CardSelectionScene') && snapshot.diagnostics?.pauseReason === 'cardSelection';
}
