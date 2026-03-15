import { Application, Texture } from 'pixi.js';

export interface PixiSceneHost {
  sceneEl: HTMLDivElement;
  app: Application;
  ready: boolean;
  initPromise: Promise<void>;
}

export function createPixiSceneHost(
  root: HTMLElement,
  sceneClassName: string,
  canvasClassName: string,
): PixiSceneHost {
  const sceneEl = document.createElement('div');
  sceneEl.className = sceneClassName;
  root.appendChild(sceneEl);

  const app = new Application();
  const host: PixiSceneHost = {
    sceneEl,
    app,
    ready: false,
    initPromise: Promise.resolve(),
  };

  host.initPromise = app.init({
    preference: 'webgl',
    backgroundAlpha: 0,
    antialias: false,
    autoDensity: true,
    autoStart: false,
    sharedTicker: false,
    resizeTo: sceneEl,
    resolution: Math.max(1, Math.min(2, window.devicePixelRatio || 1)),
  }).then(() => {
    app.canvas.className = canvasClassName;
    sceneEl.appendChild(app.canvas);
    host.ready = true;
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
