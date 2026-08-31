/**
 * 武器库布局的纯计算，**不依赖 Phaser**，因此可在纯 node 测试里断言。
 *
 * 单独成文件的原因：`WeaponLibraryScene.ts` 顶层 `import Phaser`，
 * 而 Phaser 在 node 环境下访问 `window` 会直接抛错，测试无法加载它。
 * 布局不变量必须能被自动化守住，所以算式不能留在场景类里。
 */
import { computeRowGrid, type RowGridLayout } from '../ui/rowGrid';

/** 武器索引首行盒体中心 y。上方是 WEAPON INDEX 标题（y=168）。 */
export const WEAPON_INDEX_FIRST_ROW_Y = 223;
/** 页脚分隔线 y。武器索引必须完整停在它上方。 */
export const FOOTER_RULE_Y = 660;
/** 原始实现写死的行距与盒高，仅用于回归测试对照。 */
export const LEGACY_ROW_STEP = 55;
export const LEGACY_BOX_HEIGHT = 48;

/**
 * 武器索引网格：两列、行优先。
 *
 * 行距由武器数反推。写死 55px 时，武器从 8 把涨到 17 把使行数从 4 变 9，
 * 末行盒体下沿落到 687，同时压过页脚分隔线（660）与页脚文案（680）。
 */
export function computeWeaponIndexGrid(weaponCount: number): RowGridLayout {
  return computeRowGrid({
    itemCount: weaponCount,
    columns: 2,
    firstRowCenterY: WEAPON_INDEX_FIRST_ROW_Y,
    boundaryY: FOOTER_RULE_Y,
    safeGap: 16,
    boxShrink: 6,
    preferredRowStep: LEGACY_ROW_STEP,
  });
}
