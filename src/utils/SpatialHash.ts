/**
 * 面向高频邻近查询的均匀网格。每个对象只进入一个格子，查询只遍历相邻格，
 * 用于避免无尽模式中感染体之间每帧全量两层遍历。
 */
export interface SpatialPoint {
  x: number;
  y: number;
}

export class SpatialHash<T extends SpatialPoint> {
  private readonly cells = new Map<string, T[]>();

  constructor(private readonly cellSize: number) {}

  rebuild(items: readonly T[]): void {
    this.cells.clear();
    for (const item of items) {
      const key = this.keyFor(item.x, item.y);
      const bucket = this.cells.get(key);
      if (bucket) {
        bucket.push(item);
      } else {
        this.cells.set(key, [item]);
      }
    }
  }

  queryRadius(x: number, y: number, radius: number): T[] {
    const minX = Math.floor((x - radius) / this.cellSize);
    const maxX = Math.floor((x + radius) / this.cellSize);
    const minY = Math.floor((y - radius) / this.cellSize);
    const maxY = Math.floor((y + radius) / this.cellSize);
    const result: T[] = [];

    for (let cellY = minY; cellY <= maxY; cellY++) {
      for (let cellX = minX; cellX <= maxX; cellX++) {
        const bucket = this.cells.get(`${cellX}:${cellY}`);
        if (bucket) result.push(...bucket);
      }
    }
    return result;
  }

  clear(): void {
    this.cells.clear();
  }

  private keyFor(x: number, y: number): string {
    return `${Math.floor(x / this.cellSize)}:${Math.floor(y / this.cellSize)}`;
  }
}
