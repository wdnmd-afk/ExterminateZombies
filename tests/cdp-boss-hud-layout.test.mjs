import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assertBossHudLayout } from '../scripts/cdp-boss-hud-layout.mjs';

function readableLayout() {
  const scale = 960 / 1520;
  const entry = (left, top, width, height) => ({ logical: { left, top, width, height, right: left + width, bottom: top + height }, css: { left: left * scale, top: top * scale, width: width * scale, height: height * scale, right: (left + width) * scale, bottom: (top + height) * scale } });
  return {
    visible: true, display: { hudSidebarTier: 'compact' }, canvas: { left: 0, top: 0, right: 960, bottom: 720 },
    panel: entry(0, 0, 114, 90),
    title: { ...entry(17, 4.5, 80, 49), text: '毁灭爆破者\nBOSS P3/3\n饱和轰炸', logicalFontSize: 16, cssFontSize: 16 * scale },
    healthTrack: entry(14, 57.5, 86, 11), healthFill: entry(14, 57.5, 43, 11),
    recovery: { ...entry(12, 73.5, 90, 15), text: '破甲×1.25 1.2s' },
  };
}

describe('Boss HUD真实CSS验收判据', () => {
  it('接受三行16逻辑像素且960宽仍达10 CSS像素的标题', () => {
    assert.doesNotThrow(() => assertBossHudLayout(readableLayout(), 'readable'));
  });
  it('拒绝虽在边界内但被整体缩成细线的旧标题', () => {
    const layout = readableLayout(); layout.title.logicalFontSize = 5;
    assert.throws(() => assertBossHudLayout(layout, 'thin'), /unreadable logical font size/);
  });
  it('逻辑字号正常也不能用高DPR冒充可见CSS字号', () => {
    const layout = readableLayout(); layout.title.cssFontSize = 5;
    assert.throws(() => assertBossHudLayout(layout, 'css'), /unreadable CSS font size/);
  });
  it('按可见画布而非高分辨率渲染缓冲检查越界', () => {
    const layout = readableLayout(); layout.panel.css.right = 961;
    assert.throws(() => assertBossHudLayout(layout, 'bounds'), /outside CSS canvas horizontally/);
  });
  it('拒绝标题与血条交叠', () => {
    const layout = readableLayout(); layout.title.logical.bottom = 58;
    assert.throws(() => assertBossHudLayout(layout, 'health'), /title overlaps health track/);
  });
  it('反击提示不能超出原固定槽', () => {
    const layout = readableLayout(); layout.recovery.logical.bottom = 91;
    assert.throws(() => assertBossHudLayout(layout, 'recovery'), /recovery exceeds fixed boss slot/);
  });
  it('分行后仍必须保留左右内容内边距', () => {
    const layout = readableLayout(); layout.title.logical.right = 110;
    assert.throws(() => assertBossHudLayout(layout, 'padding'), /title exceeds panel width/);
  });
});
