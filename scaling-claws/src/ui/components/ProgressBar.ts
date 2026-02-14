export class ProgressBar {
  readonly el: HTMLDivElement;
  private fillEl: HTMLDivElement;

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'progress-bar';

    this.fillEl = document.createElement('div');
    this.fillEl.className = 'progress-bar-fill';
    this.el.appendChild(this.fillEl);
  }

  update(progress: number, stuck: boolean = false): void {
    const pct = Math.min(100, Math.max(0, progress * 100));
    this.fillEl.style.width = pct + '%';

    if (stuck) {
      this.fillEl.classList.add('stuck');
    } else {
      this.fillEl.classList.remove('stuck');
    }
  }
}
