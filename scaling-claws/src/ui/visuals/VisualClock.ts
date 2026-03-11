export interface VisualClockOptions {
  fixedStepMs?: number;
  maxCatchUpSteps?: number;
  onSimulate: (dtMs: number) => void;
  onRender: () => void;
}

export class VisualClock {
  private readonly fixedStepMs: number;
  private readonly maxCatchUpSteps: number;
  private readonly onSimulate: (dtMs: number) => void;
  private readonly onRender: () => void;

  private running = false;
  private accumulatorMs = 0;
  private lastFrameMs = 0;
  private frameHandle = 0;

  constructor(options: VisualClockOptions) {
    this.fixedStepMs = options.fixedStepMs ?? (1000 / 30);
    this.maxCatchUpSteps = Math.max(1, options.maxCatchUpSteps ?? 6);
    this.onSimulate = options.onSimulate;
    this.onRender = options.onRender;
  }

  start(): void {
    if (this.running) {
      return;
    }
    this.running = true;
    this.accumulatorMs = 0;
    this.lastFrameMs = 0;
    this.frameHandle = window.requestAnimationFrame(this.tick);
  }

  stop(): void {
    if (!this.running) {
      return;
    }
    this.running = false;
    if (this.frameHandle !== 0) {
      window.cancelAnimationFrame(this.frameHandle);
      this.frameHandle = 0;
    }
    this.accumulatorMs = 0;
    this.lastFrameMs = 0;
  }

  private readonly tick = (frameNowMs: number): void => {
    if (!this.running) {
      return;
    }

    if (this.lastFrameMs <= 0) {
      this.lastFrameMs = frameNowMs;
      this.onRender();
      this.frameHandle = window.requestAnimationFrame(this.tick);
      return;
    }

    const frameDeltaMs = Math.min(250, Math.max(0, frameNowMs - this.lastFrameMs));
    this.lastFrameMs = frameNowMs;
    this.accumulatorMs += frameDeltaMs;

    let steps = 0;
    while (this.accumulatorMs >= this.fixedStepMs && steps < this.maxCatchUpSteps) {
      this.onSimulate(this.fixedStepMs);
      this.accumulatorMs -= this.fixedStepMs;
      steps++;
    }

    if (steps >= this.maxCatchUpSteps) {
      this.accumulatorMs = 0;
    }

    this.onRender();
    this.frameHandle = window.requestAnimationFrame(this.tick);
  };
}
