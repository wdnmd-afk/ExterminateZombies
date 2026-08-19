import type { ZombieId } from '../config/zombies';
import { getZombieFrameSize, getZombieVisual } from '../config/zombieVisuals';

/** 图鉴详情区预览底板的中心与尺寸，缩放上限按它反推。 */
export const MONSTER_PREVIEW_CENTER = { x: 846, y: 378 } as const;
export const MONSTER_PREVIEW_PLANE = { width: 204, height: 170 } as const;

/** 精灵可占用的区域：底板四周各留 10px，避免边缘压在描边上。 */
export const MONSTER_PREVIEW_BOX = { width: 184, height: 150 } as const;

/** 期望放大倍率。小体型素材仍按它放大，只有会超出底板的才被压回去。 */
export const MONSTER_PREVIEW_SCALE = 2.2;

/**
 * 图鉴预览缩放。
 *
 * `visual.scale × MONSTER_PREVIEW_SCALE` 只是期望值：源帧尺寸跨度很大
 * （31×36 到 64×64），Boss 又在战斗视觉上额外放大，直接沿用会让大体型精灵冲出
 * 底板并盖住上方的档案名称和代号行——这些文字先于精灵创建，会被压在下面。
 *
 * 精灵原点不在几何中心（方向素材 originY 0.62 偏脚底），所以垂直可用空间必须按
 * 离中心更远的那一侧计算，否则精灵仍会从上沿溢出。
 */
export function resolveMonsterPreviewScale(id: ZombieId): number {
  const visual = getZombieVisual(id);
  const frame = getZombieFrameSize(id);
  const verticalAnchor = Math.max(visual.originY, 1 - visual.originY);
  const fitScale = Math.min(
    MONSTER_PREVIEW_BOX.width / frame.width,
    MONSTER_PREVIEW_BOX.height / (frame.height * verticalAnchor * 2),
  );
  return Math.min(visual.scale * MONSTER_PREVIEW_SCALE, fitScale);
}

/** 预览精灵在场景坐标系里的实际边界，供布局校验使用。 */
export function getMonsterPreviewBounds(id: ZombieId): {
  top: number;
  bottom: number;
  left: number;
  right: number;
} {
  const visual = getZombieVisual(id);
  const frame = getZombieFrameSize(id);
  const scale = resolveMonsterPreviewScale(id);
  const width = frame.width * scale;
  const height = frame.height * scale;

  return {
    top: MONSTER_PREVIEW_CENTER.y - height * visual.originY,
    bottom: MONSTER_PREVIEW_CENTER.y + height * (1 - visual.originY),
    left: MONSTER_PREVIEW_CENTER.x - width / 2,
    right: MONSTER_PREVIEW_CENTER.x + width / 2,
  };
}
