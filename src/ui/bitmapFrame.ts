import type Phaser from 'phaser';
import { UI_ASSET_KEYS } from '../config/uiVisuals';

export function createBitmapFrame(
  scene: Phaser.Scene, x: number, y: number, width: number, height: number, color: number,
): Phaser.GameObjects.Container | null {
  if (!scene.textures.exists(UI_ASSET_KEYS.panelFrame)) return null;
  const texture = scene.textures.get(UI_ASSET_KEYS.panelFrame);
  const corner = Math.min(8, width / 2, height / 2);
  const widths = [corner, width - corner * 2, corner];
  const heights = [corner, height - corner * 2, corner];
  const sourceSizes = [8, 32, 8];
  const sourceOffsets = [0, 8, 40];
  const pieces: Phaser.GameObjects.Image[] = [];
  let top = -height / 2;
  for (let row = 0; row < 3; row += 1) {
    let left = -width / 2;
    for (let column = 0; column < 3; column += 1) {
      if ((row !== 1 || column !== 1) && widths[column] > 0 && heights[row] > 0) {
        const frame = `border-${row}-${column}`;
        if (!texture.has(frame)) texture.add(frame, 0, sourceOffsets[column], sourceOffsets[row], sourceSizes[column], sourceSizes[row]);
        pieces.push(scene.add.image(left, top, UI_ASSET_KEYS.panelFrame, frame).setOrigin(0)
          .setDisplaySize(widths[column], heights[row]).setTint(color));
      }
      left += widths[column];
    }
    top += heights[row];
  }
  // Phaser 的 NineSlice 不支持 Canvas；用同一纹理的八个 frame 保留低端回退与固定角尺寸。
  return scene.add.container(x, y, pieces).setAlpha(0.7);
}
