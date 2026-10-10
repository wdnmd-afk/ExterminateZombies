import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export function bossHudSourceHashes(extra = []) {
  return Object.fromEntries([...new Set(['src/scenes/HUDScene.ts', 'src/ui/layout.ts', 'src/ui/fonts.ts', 'src/systems/DisplayManager.ts', 'src/config/zombies.ts', 'scripts/cdp-boss-hud-layout.mjs', ...extra])].map(path => [path, createHash('sha256').update(readFileSync(path)).digest('hex')]));
}

export function inspectBossHud(browser) {
  return browser.evaluate(`(async () => {
    const game = window.__GAME__;
    const hud = game.scene.getScene('HUDScene');
    const camera = hud.cameras.main;
    const canvas = game.canvas.getBoundingClientRect();
    const { getRuntimeDisplayLayout } = await import('/src/systems/DisplayManager.ts');
    const rectangle = bounds => ({ left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom, width: bounds.width, height: bounds.height });
    const project = (worldX, worldY) => {
      const point = camera.matrix.transformPoint(worldX - camera.scrollX, worldY - camera.scrollY);
      return { x: canvas.left + point.x * canvas.width / game.scale.gameSize.width, y: canvas.top + point.y * canvas.height / game.scale.gameSize.height };
    };
    const origin = project(0, 0);
    const unit = project(0, 1);
    const cssPerLogicalUnit = Math.hypot(unit.x - origin.x, unit.y - origin.y);
    const measure = object => {
      const bounds = object.getBounds();
      const first = project(bounds.left, bounds.top);
      const last = project(bounds.right, bounds.bottom);
      const result = { logical: rectangle(bounds), css: { left: first.x, right: last.x, top: first.y, bottom: last.y, width: last.x - first.x, height: last.y - first.y } };
      if (typeof object.text === 'string') {
        const matrix = object.getWorldTransformMatrix();
        const fontSize = Number.parseFloat(String(object.style.fontSize));
        const logicalFontSize = fontSize * Math.hypot(matrix.c, matrix.d);
        Object.assign(result, { text: object.text, fontSize, logicalFontSize, cssFontSize: logicalFontSize * cssPerLogicalUnit });
      }
      return result;
    };
    const texts = [];
    const visit = (object, visible) => {
      visible = visible && object.visible !== false && object.alpha !== 0;
      if (visible && typeof object.text === 'string') texts.push(measure(object));
      if (Array.isArray(object.list)) object.list.forEach(child => visit(child, visible));
    };
    hud.children.list.forEach(object => visit(object, true));
    return { viewport: { width: innerWidth, height: innerHeight, devicePixelRatio }, canvas: rectangle(canvas), display: getRuntimeDisplayLayout(), cssPerLogicalUnit, visible: hud.bossPanel.visible, panel: measure(hud.bossPanel.list[0]), title: measure(hud.bossNameText), healthTrack: measure(hud.bossPanel.list[2]), healthFill: measure(hud.bossHealthFill), recovery: measure(hud.bossRecoveryText), texts };
  })()`);
}

export function rectanglesOverlap(first, second) {
  return first.left < second.right && first.right > second.left && first.top < second.bottom && first.bottom > second.top;
}

export function assertVisibleCssBounds(entry, canvas, label) {
  assert.ok(entry.css.width > 0 && entry.css.height > 0, `${label}: empty visible bounds`);
  assert.ok(entry.css.left >= canvas.left - 0.5 && entry.css.right <= canvas.right + 0.5, `${label}: outside CSS canvas horizontally`);
  assert.ok(entry.css.top >= canvas.top - 0.5 && entry.css.bottom <= canvas.bottom + 0.5, `${label}: outside CSS canvas vertically`);
}

export function assertBossHudLayout(layout, label) {
  assert.equal(layout.visible, true, `${label}: hidden boss panel`);
  const compact = layout.display.hudSidebarTier === 'compact';
  assert.ok(layout.title.logicalFontSize >= (compact ? 16 : 10) - 0.01, `${label}: unreadable logical font size ${layout.title.logicalFontSize}`);
  assert.ok(layout.title.cssFontSize >= 10 - 0.01, `${label}: unreadable CSS font size ${layout.title.cssFontSize}`);
  assert.equal(layout.title.text.split('\n').length, compact ? 3 : 1, `${label}: title line count`);
  for (const [name, entry] of Object.entries({ panel: layout.panel, title: layout.title, health: layout.healthTrack, ...(layout.recovery.text ? { recovery: layout.recovery } : {}) })) assertVisibleCssBounds(entry, layout.canvas, `${label}/${name}`);
  const panel = layout.panel.logical;
  const title = layout.title.logical;
  const health = layout.healthTrack.logical;
  assert.equal(panel.height, 90, `${label}: fixed boss slot height`);
  assert.ok(title.left >= panel.left + 9.5 && title.right <= panel.right - 9.5, `${label}: title exceeds panel width`);
  assert.ok(title.top >= panel.top + 1.5, `${label}: title exceeds panel top`);
  assert.ok(title.bottom + 2 <= health.top + 0.01, `${label}: title overlaps health track`);
  assert.ok(layout.healthFill.logical.left >= health.left - 0.01 && layout.healthFill.logical.right <= health.right + 0.01, `${label}: health fill exceeds track`);
  if (layout.recovery.text) {
    assert.ok(health.bottom + 2 <= layout.recovery.logical.top + 0.01, `${label}: health track overlaps recovery`);
    assert.ok(layout.recovery.logical.bottom <= panel.bottom - 1, `${label}: recovery exceeds fixed boss slot`);
  }
}
