import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { Text } = vi.hoisted(() => ({
  Text: class {
    style = { resolution: 1 };
    frame = { source: { resolution: 1 } };
    setResolution(value: number): this { this.style.resolution = value; return this; }
  },
}));
vi.mock('phaser', () => ({ default: {
  Math: { Clamp: (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value)) },
  GameObjects: { Text },
  Scenes: { Events: { ADDED_TO_SCENE: 'added', SHUTDOWN: 'shutdown' } },
} }));

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal('window', { innerWidth: 1920, innerHeight: 1080, devicePixelRatio: 1 });
});
afterEach(() => vi.unstubAllGlobals());

function sceneFixture(children: unknown[]) {
  const handlers = new Map<string, (value?: unknown) => void>();
  const camera = { setViewport: vi.fn().mockReturnThis(), setZoom: vi.fn().mockReturnThis(), centerOn: vi.fn().mockReturnThis() };
  const scene = {
    children: { list: children }, cameras: { main: camera },
    events: {
      on: vi.fn((event: string, handler: (value?: unknown) => void) => handlers.set(event, handler)),
      once: vi.fn((event: string, handler: (value?: unknown) => void) => handlers.set(event, handler)),
      off: vi.fn((event: string) => handlers.delete(event)),
    },
  };
  return { scene: scene as unknown as Phaser.Scene, handlers, camera };
}

describe('共享高清文字的 Canvas / WebGL 一致性', () => {
  it('已有文字与后来加入的文字同时同步样式和纹理源分辨率', async () => {
    const { configureHighResolutionScene, DISPLAY_RENDER_SCALE } = await import('../src/systems/DisplayManager');
    const existing = new Text();
    const fixture = sceneFixture([existing]);
    configureHighResolutionScene(fixture.scene);
    expect(DISPLAY_RENDER_SCALE).toBe(2);
    expect(existing.style.resolution).toBe(2);
    expect(existing.frame.source.resolution).toBe(2);
    const dynamic = new Text();
    fixture.handlers.get('added')!(dynamic);
    expect(dynamic.frame.source.resolution).toBe(dynamic.style.resolution);
    expect(dynamic.style.resolution).toBe(2);
    expect(fixture.camera.setZoom).toHaveBeenCalledWith(2);
    expect(fixture.camera.centerOn).toHaveBeenCalledWith(640, 360);
  });
  it('不改非文字纹理，场景结束解除动态文字监听', async () => {
    const { configureHighResolutionScene } = await import('../src/systems/DisplayManager');
    const image = { frame: { source: { resolution: 1 } } };
    const fixture = sceneFixture([image]);
    configureHighResolutionScene(fixture.scene);
    expect(image.frame.source.resolution).toBe(1);
    fixture.handlers.get('shutdown')!();
    expect(fixture.handlers.has('added')).toBe(false);
  });
});
