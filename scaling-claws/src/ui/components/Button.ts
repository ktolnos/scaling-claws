import { moneyWithEmojiHtml } from '../emoji.ts';

export class Button {
  readonly el: HTMLButtonElement;
  private costEl: HTMLSpanElement | null = null;

  constructor(
    label: string,
    opts: {
      cost?: number;
      className?: string;
      onClick: () => void;
    },
  ) {
    this.el = document.createElement('button');
    if (opts.className) {
      this.el.className = opts.className;
    }

    const labelSpan = document.createElement('span');
    labelSpan.textContent = label;
    this.el.appendChild(labelSpan);

    if (opts.cost !== undefined) {
      this.costEl = document.createElement('span');
      this.costEl.className = 'btn-cost';
      this.costEl.innerHTML = ' ' + moneyWithEmojiHtml(opts.cost, 'funds');
      this.costEl.style.color = 'var(--text-secondary)';
      this.costEl.style.fontSize = '0.8em';
      this.el.appendChild(this.costEl);
    }

    this.el.addEventListener('click', opts.onClick);
  }

  setEnabled(enabled: boolean): void {
    this.el.disabled = !enabled;
  }

  updateCost(cost: number): void {
    if (this.costEl) {
      this.costEl.innerHTML = ' ' + moneyWithEmojiHtml(cost, 'funds');
    }
  }

  setLabel(label: string): void {
    const labelSpan = this.el.querySelector('span');
    if (labelSpan) {
      labelSpan.textContent = label;
    }
  }
}
