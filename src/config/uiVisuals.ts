/** UI 位图资源 key。 */
export const UI_ASSET_KEYS = {
  keycap: 'ui-keycap',
  crosshair: 'ui-crosshair',
  panelFrame: 'ui-panel-frame',
  iconBack: 'ui-icon-back',
  iconConfirm: 'ui-icon-confirm',
  iconSettings: 'ui-icon-settings',
  iconLoadout: 'ui-icon-loadout',
  iconVolume: 'ui-icon-volume',
  iconAccessibility: 'ui-icon-accessibility',
} as const;

export const UI_ICON_KEYS = {
  back: UI_ASSET_KEYS.iconBack,
  confirm: UI_ASSET_KEYS.iconConfirm,
  settings: UI_ASSET_KEYS.iconSettings,
  loadout: UI_ASSET_KEYS.iconLoadout,
  volume: UI_ASSET_KEYS.iconVolume,
  accessibility: UI_ASSET_KEYS.iconAccessibility,
} as const;
