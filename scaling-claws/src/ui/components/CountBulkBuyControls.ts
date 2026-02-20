import { formatNumber } from '../../game/utils.ts';
import { BulkBuyGroup } from './BulkBuyGroup.ts';

export interface CountBulkBuyControlsOptions {
  prefix?: string;
  bulkLayout?: 'horizontal' | 'vertical';
  countPrefix?: string;
  countMinWidthPx?: number;
  maxedLabel?: string;
}

export class CountBulkBuyControls {
  readonly el: HTMLDivElement;
  readonly countEl: HTMLSpanElement;
  readonly bulk: BulkBuyGroup;
  private countPrefix: string;

  constructor(onAction: (amount: number) => void, options?: CountBulkBuyControlsOptions) {
    const prefix = options?.prefix ?? '+';
    const bulkLayout = options?.bulkLayout ?? 'horizontal';
    this.countPrefix = options?.countPrefix ?? 'x';
    const countMinWidthPx = options?.countMinWidthPx ?? 34;
    const maxedLabel = options?.maxedLabel ?? 'MAXED';

    this.el = document.createElement('div');
    this.el.className = 'count-bulk-controls';

    this.countEl = document.createElement('span');
    this.countEl.className = 'value count-bulk-value';
    this.countEl.style.minWidth = `${countMinWidthPx}px`;
    this.countEl.style.textAlign = 'right';
    this.countEl.textContent = `${this.countPrefix}0`;
    this.el.appendChild(this.countEl);

    this.bulk = new BulkBuyGroup(onAction, prefix, bulkLayout, maxedLabel);
    this.el.appendChild(this.bulk.el);
  }

  setCount(count: number | bigint): void {
    this.countEl.textContent = `${this.countPrefix}${formatNumber(count)}`;
  }
}
