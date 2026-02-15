import { formatNumber } from '../../game/utils.ts';

export class BulkBuyGroup {
  readonly el: HTMLDivElement;
  private buttons: HTMLButtonElement[] = [];
  private onAction: (amount: number) => void;
  private lastTiers: string = '';
  private prefix: string;

  constructor(onAction: (amount: number) => void, prefix: string = '+', layout: 'horizontal' | 'vertical' = 'horizontal') {
    this.el = document.createElement('div');
    this.el.className = 'bulk-buy-group';
    if (layout === 'vertical') {
      this.el.style.flexDirection = 'column';
    }
    this.onAction = onAction;
    this.prefix = prefix;
  }

  update(owned: number, canAct: (amount: number) => boolean): void {
    const tiers = getBuyTiers(owned);
    const tiersKey = tiers.join(',');

    // Rebuild buttons if tiers changed
    if (tiersKey !== this.lastTiers) {
      this.lastTiers = tiersKey;
      this.el.innerHTML = '';
      this.buttons = [];

      for (const amount of tiers) {
        const btn = document.createElement('button');
        btn.textContent = this.prefix + formatNumber(amount);
        btn.addEventListener('click', () => this.onAction(amount));
        this.el.appendChild(btn);
        this.buttons.push(btn);
      }
    }

    // Update enabled state
    for (let i = 0; i < tiers.length; i++) {
      this.buttons[i].disabled = !canAct(tiers[i]);
    }
  }
}

/** Returns powers of 10 tiers (no +1). Always starts at 10. */
export function getBuyTiers(owned: number): number[] {
  if (owned < 10) return [1]
  if (owned < 100) return [1, 10];
  const mag = Math.floor(Math.log10(owned));
  const high = 10 ** mag;
  if (high <= 10) return [1, 10];
  const low = 10 ** (mag - 1);
  if (low <= 10) return [10, high];
  return [low, high];
}
