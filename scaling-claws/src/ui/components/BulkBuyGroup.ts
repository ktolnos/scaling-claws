import { formatNumber } from '../../game/utils.ts';

export class BulkBuyGroup {
  readonly el: HTMLDivElement;
  private buttons: HTMLButtonElement[] = [];
  private onBuy: (amount: number) => void;
  private lastTiers: string = '';

  constructor(onBuy: (amount: number) => void) {
    this.el = document.createElement('div');
    this.el.className = 'bulk-buy-group';
    this.onBuy = onBuy;
  }

  update(owned: number, canAfford: (amount: number) => boolean): void {
    const tiers = getBuyTiers(owned);
    const tiersKey = tiers.join(',');

    // Rebuild buttons if tiers changed
    if (tiersKey !== this.lastTiers) {
      this.lastTiers = tiersKey;
      this.el.innerHTML = '';
      this.buttons = [];

      for (const amount of tiers) {
        const btn = document.createElement('button');
        btn.textContent = '+' + formatNumber(amount);
        btn.addEventListener('click', () => this.onBuy(amount));
        this.el.appendChild(btn);
        this.buttons.push(btn);
      }
    }

    // Update enabled state
    for (let i = 0; i < tiers.length; i++) {
      this.buttons[i].disabled = !canAfford(tiers[i]);
    }
  }
}

function getBuyTiers(owned: number): number[] {
  if (owned >= 1000) return [10, 100, 1000];
  if (owned >= 100) return [1, 10, 100];
  if (owned >= 10) return [1, 10];
  return [1];
}
