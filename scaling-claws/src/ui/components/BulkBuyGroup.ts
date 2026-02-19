import { formatNumber } from '../../game/utils.ts';

export class BulkBuyGroup {
  readonly el: HTMLDivElement;
  private buttons: HTMLButtonElement[] = [];
  private onAction: (amount: number) => void;
  private lastTiers: string = '';
  private prefix: string;
  private maxedLabel: HTMLSpanElement;

  constructor(onAction: (amount: number) => void, prefix: string = '+', layout: 'horizontal' | 'vertical' = 'horizontal') {
    this.el = document.createElement('div');
    this.el.className = 'bulk-buy-group';
    if (layout === 'vertical') {
      this.el.style.flexDirection = 'column';
    }
    this.onAction = onAction;
    this.prefix = prefix;
    this.maxedLabel = document.createElement('span');
    this.maxedLabel.className = 'bulk-buy-maxed';
    this.maxedLabel.textContent = 'MAXED';
  }

  update(owned: number, canAct: (amount: number) => boolean, maxQuantity?: number | null): void {
    const tiers = this.getVisibleTiers(owned, maxQuantity);
    const isMaxed = !!maxQuantity && owned >= maxQuantity;
    const tiersKey = `${tiers.join(',')}|${isMaxed ? 'maxed' : 'active'}`;

    // Rebuild buttons if tiers changed
    if (tiersKey !== this.lastTiers) {
      this.lastTiers = tiersKey;
      this.el.innerHTML = '';
      this.buttons = [];

      if (isMaxed) {
        this.el.appendChild(this.maxedLabel);
      } else {
        for (const amount of tiers) {
          const btn = document.createElement('button');
          btn.textContent = this.prefix + formatNumber(amount);
          btn.addEventListener('click', () => this.onAction(amount));
          this.el.appendChild(btn);
          this.buttons.push(btn);
        }
      }
    }

    if (isMaxed) return;

    // Update enabled state
    for (let i = 0; i < tiers.length; i++) {
      this.buttons[i].disabled = !canAct(tiers[i]);
    }
  }

  private getVisibleTiers(owned: number, maxQuantity?: number | null): number[] {
    const baseTiers = getBuyTiers(owned);
    if (maxQuantity === null || maxQuantity === undefined || maxQuantity <= 0) return baseTiers;

    const remaining = Math.max(0, Math.floor(maxQuantity - owned));
    if (remaining <= 0) return [];

    const clamped = baseTiers.filter((amount) => amount <= remaining);
    // Add an exact remainder tier only when limit actually clips normal tiers.
    if (clamped.length < baseTiers.length && !clamped.includes(remaining)) {
      clamped.push(remaining);
    }
    clamped.sort((a, b) => a - b);
    return clamped;
  }
}

/** Returns adaptive tiers; includes +1 at low counts, then powers of 10. */
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
