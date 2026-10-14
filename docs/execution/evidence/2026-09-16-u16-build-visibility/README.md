# U-16 构筑可见性证据说明

## 最终结论

U-16 于 2026-09-16 完成 V3/V4 客观验收：主探针 9 条判据全部通过，排序补测 5 条判据全部通过；
V6 信息可理解性仍需真人判断。

## 权威结果

- `u16-result.json`：主流程最终结果，`status=passed`。
- `u16-sort-result.json`：排序补测最终结果，`status=objective-pass`。
- `u16-draw1.json`、`u16-draw2.json`、`u16-dirty.json`：界面显示树与独立配置期望。
- `u16-02-first-draw.png`、`u16-03-second-draw.png`、`u16-sort-01-three-weapons.png`：关键截图。

## 调试产物边界

`u16-98-second-draw-missing.png` 和 `u16-99-error.png` 是驱动调试阶段产物，不代表最终结论。
`u16-pools.json` 是普通关卡顺带采集的对象池样本；采集时最终 48/96 硬上限尚未启用，
不能替代无尽模式 50/100/150 敌压力验收。
