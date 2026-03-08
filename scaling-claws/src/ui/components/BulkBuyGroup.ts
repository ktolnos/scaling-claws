import { formatNumber } from '../../game/utils.ts';

const HOLD_REPEAT_DELAY_MS = 280;
const HOLD_REPEAT_START_INTERVAL_MS = 220;
const HOLD_REPEAT_MIN_INTERVAL_MS = 45;
const HOLD_REPEAT_ACCEL_MS_PER_SEC = 120;

export class BulkBuyGroup {
  readonly el: HTMLDivElement;
  private buttons: HTMLButtonElement[] = [];
  private displayTiers: number[] = [];
  private onAction: (amount: number) => void;
  private lastTiers: string = '';
  private prefix: string;
  private maxedLabel: HTMLSpanElement;
  private canAct: ((amount: number) => boolean) | null = null;
  private onInsufficient: ((amount: number) => void) | null = null;

  private holdDelayTimer: number | null = null;
  private holdRafId: number | null = null;
  private holdPointerId: number | null = null;
  private holdButtonIndex: number = -1;
  private holdStartedAtMs: number = 0;
  private holdNextFireAtMs: number = 0;
  private holdActive = false;
  private suppressClickUntilMs = 0;
  private readonly onWindowPointerEnd = (ev: PointerEvent) => this.handleWindowPointerEnd(ev);

  constructor(
    onAction: (amount: number) => void,
    prefix: string = '+',
    layout: 'horizontal' | 'vertical' = 'horizontal',
    maxedLabelText: string = 'MAXED',
  ) {
    this.el = document.createElement('div');
    this.el.className = 'bulk-buy-group';
    if (layout === 'vertical') {
      this.el.style.flexDirection = 'column';
    }
    this.onAction = onAction;
    this.prefix = prefix;
    this.maxedLabel = document.createElement('span');
    this.maxedLabel.className = 'bulk-buy-maxed';
    this.maxedLabel.textContent = maxedLabelText;
  }

  update(
    owned: number,
    canAct: (amount: number) => boolean,
    maxQuantity?: number | null,
    onInsufficient?: (amount: number) => void,
  ): void {
    this.canAct = canAct;
    this.onInsufficient = onInsufficient ?? null;
    const tiers = this.getVisibleTiers(owned, maxQuantity);
    const displayTiers = this.replaceLowerTierWithAffordableAmount(tiers, canAct);
    this.displayTiers = displayTiers;
    const isMaxed = !!maxQuantity && owned >= maxQuantity;
    const tiersKey = `${displayTiers.length}|${isMaxed ? 'maxed' : 'active'}`;

    // Rebuild only when count/maxed mode changes, keep button elements stable otherwise.
    if (tiersKey !== this.lastTiers) {
      this.lastTiers = tiersKey;
      this.el.innerHTML = '';
      this.buttons = [];

      if (isMaxed) {
        this.el.appendChild(this.maxedLabel);
      } else {
        for (let i = 0; i < displayTiers.length; i++) {
          const btn = document.createElement('button');
          btn.addEventListener('click', (ev) => this.handleButtonClick(ev, i));
          btn.addEventListener('pointerdown', (ev) => this.handleButtonPointerDown(ev, i));
          this.el.appendChild(btn);
          this.buttons.push(btn);
        }
      }
    }

    if (isMaxed) return;

    // Update labels and enabled state without rebuilding.
    for (let i = 0; i < displayTiers.length; i++) {
      const enabled = canAct(displayTiers[i]);
      this.buttons[i].textContent = this.prefix + formatNumber(displayTiers[i]);
      this.buttons[i].disabled = false;
      this.buttons[i].classList.toggle('bulk-buy-disabled', !enabled);
      this.buttons[i].setAttribute('aria-disabled', enabled ? 'false' : 'true');
    }
  }

  private handleButtonClick(ev: MouseEvent, index: number): void {
    const amount = this.displayTiers[index];
    if (!amount) return;
    if (performance.now() <= this.suppressClickUntilMs) {
      this.suppressClickUntilMs = 0;
      ev.preventDefault();
      return;
    }
    if (this.canAct && !this.canAct(amount)) {
      this.onInsufficient?.(amount);
      ev.preventDefault();
      return;
    }
    this.onAction(amount);
  }

  private handleButtonPointerDown(ev: PointerEvent, index: number): void {
    const amount = this.displayTiers[index];
    if (!amount) return;
    const target = ev.currentTarget as HTMLButtonElement | null;
    if (ev.button !== 0 || !target) return;
    if (this.canAct && !this.canAct(amount)) return;

    this.stopHold();
    this.holdPointerId = ev.pointerId;
    this.holdButtonIndex = index;

    window.addEventListener('pointerup', this.onWindowPointerEnd);
    window.addEventListener('pointercancel', this.onWindowPointerEnd);
    this.holdDelayTimer = window.setTimeout(() => this.startHoldRepeat(), HOLD_REPEAT_DELAY_MS);
  }

  private getCurrentHoldAmount(): number | null {
    if (this.holdButtonIndex < 0) return null;
    const amount = this.displayTiers[this.holdButtonIndex];
    return amount && amount > 0 ? amount : null;
  }

  private startHoldRepeat(): void {
    if (this.holdPointerId === null) return;
    const firstAmount = this.getCurrentHoldAmount();
    if (!firstAmount) return;
    if (this.canAct && !this.canAct(firstAmount)) return;

    this.holdActive = true;
    this.suppressClickUntilMs = performance.now() + 600;

    const now = performance.now();
    this.holdStartedAtMs = now;
    this.holdNextFireAtMs = now;

    const tick = (ts: number): void => {
      if (!this.holdActive || this.holdPointerId === null) return;

      const amount = this.getCurrentHoldAmount();
      if (!amount) {
        this.stopHold();
        return;
      }

      if (this.canAct && !this.canAct(amount)) {
        this.stopHold();
        return;
      }

      if (ts >= this.holdNextFireAtMs) {
        this.onAction(amount);
        const heldMs = ts - this.holdStartedAtMs;
        const intervalMs = Math.max(
          HOLD_REPEAT_MIN_INTERVAL_MS,
          HOLD_REPEAT_START_INTERVAL_MS - (HOLD_REPEAT_ACCEL_MS_PER_SEC * heldMs) / 1000,
        );
        this.holdNextFireAtMs = ts + intervalMs;
      }

      this.holdRafId = window.requestAnimationFrame(tick);
    };

    this.holdRafId = window.requestAnimationFrame(tick);
  }

  private handleWindowPointerEnd(ev: PointerEvent): void {
    if (this.holdPointerId === null) return;
    if (ev.pointerId !== this.holdPointerId) return;
    this.stopHold();
  }

  private stopHold(): void {
    if (this.holdDelayTimer !== null) {
      window.clearTimeout(this.holdDelayTimer);
      this.holdDelayTimer = null;
    }

    if (this.holdRafId !== null) {
      window.cancelAnimationFrame(this.holdRafId);
      this.holdRafId = null;
    }

    this.holdActive = false;
    window.removeEventListener('pointerup', this.onWindowPointerEnd);
    window.removeEventListener('pointercancel', this.onWindowPointerEnd);
    this.holdPointerId = null;
    this.holdButtonIndex = -1;
  }

  private getVisibleTiers(owned: number, maxQuantity?: number | null): number[] {
    return getVisibleBuyTiers(owned, maxQuantity);
  }

  private replaceLowerTierWithAffordableAmount(
    tiers: number[],
    canAct: (amount: number) => boolean,
  ): number[] {
    if (tiers.length < 2) return tiers;

    const low = tiers[0];
    const high = tiers[1];
    if (high <= low || low <= 1) return tiers;
    if (canAct(low)) return tiers;

    let left = 1;
    let right = low - 1;
    let best = 0;
    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      if (canAct(mid)) {
        best = mid;
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }

    if (best <= 0) return tiers;
    return [best, high];
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

export function getVisibleBuyTiers(owned: number, maxQuantity?: number | null): number[] {
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
