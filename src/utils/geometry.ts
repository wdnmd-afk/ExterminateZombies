/** 旋转矩形的轴对齐包围盒尺寸，rotationDegrees 使用角度制。 */
export function getRotatedAabbSize(
  width: number,
  height: number,
  rotationDegrees = 0,
): { width: number; height: number } {
  const rotation = (rotationDegrees % 360) * Math.PI / 180;
  const cos = Math.abs(Math.cos(rotation));
  const sin = Math.abs(Math.sin(rotation));
  return {
    width: width * cos + height * sin,
    height: width * sin + height * cos,
  };
}
