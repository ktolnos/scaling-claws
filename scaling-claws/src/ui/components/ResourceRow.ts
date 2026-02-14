export class ResourceRow {
  readonly el: HTMLDivElement;
  private valueEl: HTMLSpanElement;
  private rateEl: HTMLSpanElement | null = null;

  constructor(label: string, opts?: { showRate?: boolean }) {
    this.el = document.createElement('div');
    this.el.className = 'panel-row';

    const labelEl = document.createElement('span');
    labelEl.className = 'label';
    labelEl.textContent = label;
    this.el.appendChild(labelEl);

    const right = document.createElement('span');
    right.style.display = 'flex';
    right.style.alignItems = 'center';
    right.style.gap = '8px';

    this.valueEl = document.createElement('span');
    this.valueEl.className = 'value';
    right.appendChild(this.valueEl);

    if (opts?.showRate) {
      this.rateEl = document.createElement('span');
      this.rateEl.className = 'rate';
      right.appendChild(this.rateEl);
    }

    this.el.appendChild(right);
  }

  update(value: string, rate?: string): void {
    this.valueEl.textContent = value;
    if (this.rateEl && rate !== undefined) {
      this.rateEl.textContent = rate;
      this.rateEl.className = rate.startsWith('-') ? 'rate negative' : 'rate';
    }
  }
}
