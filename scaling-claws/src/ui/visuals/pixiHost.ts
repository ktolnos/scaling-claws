import { Application, Texture } from 'pixi.js';

export interface PixiSceneHost {
  sceneEl: HTMLDivElement;
  app: Application;
  ready: boolean;
  width: number;
  height: number;
  initPromise: Promise<void>;
}

export interface PixiSceneHostOptions {
  resolution?: number;
}

export function createPixiSceneHost(
  root: HTMLElement,
  sceneClassName: string,
  canvasClassName: string,
  options: PixiSceneHostOptions = {},
): PixiSceneHost {
  const sceneEl = document.createElement('div');
  sceneEl.className = sceneClassName;
  root.appendChild(sceneEl);

  const app = new Application();
  const host: PixiSceneHost = {
    sceneEl,
    app,
    ready: false,
    width: 0,
    height: 0,
    initPromise: Promise.resolve(),
  };
  const syncSize = (width: number, height: number): void => {
    host.width = Math.max(0, Math.round(width));
    host.height = Math.max(0, Math.round(height));
    if (host.ready) {
      host.app.renderer.resize(host.width, host.height);
    }
  };
  const resizeObserver = new ResizeObserver((entries) => {
    const entry = entries[0];
    if (!entry) {
      return;
    }
    syncSize(entry.contentRect.width, entry.contentRect.height);
  });
  resizeObserver.observe(sceneEl);

  host.initPromise = app.init({
    preference: 'webgl',
    backgroundAlpha: 0,
    antialias: false,
    autoDensity: true,
    autoStart: false,
    sharedTicker: false,
    resolution: Math.max(1, Math.min(2, options.resolution ?? (window.devicePixelRatio || 1))),
  }).then(() => {
    app.canvas.className = canvasClassName;
    sceneEl.appendChild(app.canvas);
    host.ready = true;
    if (host.width > 0 && host.height > 0) {
      app.renderer.resize(host.width, host.height);
    }
  });

  return host;
}

export function textureFromSvg(svgMarkup: string): Texture {
  const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgMarkup)}`;
  return Texture.from(dataUrl);
}

export function textureFromCanvas(canvas: HTMLCanvasElement): Texture {
  return Texture.from(canvas);
}

export function replaceManagedTexture(current: Texture | null, next: Texture): Texture {
  current?.destroy(true);
  return next;
}
