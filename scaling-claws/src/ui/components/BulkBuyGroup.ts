import { formatNumber } from '../../game/utils.ts';

const HOLD_REPEAT_DELAY_MS = 280;
const HOLD_REPEAT_START_INTERVAL_MS = 220;
const HOLD_REPEAT_MIN_INTERVAL_MS = 45;
const HOLD_REPEAT_ACCEL_MS_PER_SEC = 120;

export class BulkBuyGroup {
  readonly el: HTMLDivElement;
  private buttons: HTMLButtonElement[] = [];
  private onAction: (amount: number) => void;
  private lastTiers: string = '';
  private prefix: string;
  private maxedLabel: HTMLSpanElement;
  private canAct: ((amount: number) => boolean) | null = null;

  private holdDelayTimer: number | null = null;
  private holdRafId: number | null = null;
  private holdPointerId: number | null = null;
  private holdAmount: number = 0;
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

  update(owned: number, canAct: (amount: number) => boolean, maxQuantity?: number | null): void {
    this.canAct = canAct;
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
          btn.addEventListener('click', (ev) => this.handleButtonClick(ev, amount));
          btn.addEventListener('pointerdown', (ev) => this.handleButtonPointerDown(ev, amount));
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

  private handleButtonClick(ev: MouseEvent, amount: number): void {
    if (performance.now() <= this.suppressClickUntilMs) {
      this.suppressClickUntilMs = 0;
      ev.preventDefault();
      return;
    }
    this.onAction(amount);
  }

  private handleButtonPointerDown(ev: PointerEvent, amount: number): void {
    const target = ev.currentTarget as HTMLButtonElement | null;
    if (ev.button !== 0 || !target || target.disabled) return;

    this.stopHold();
    this.holdPointerId = ev.pointerId;
    this.holdAmount = amount;

    window.addEventListener('pointerup', this.onWindowPointerEnd);
    window.addEventListener('pointercancel', this.onWindowPointerEnd);
    this.holdDelayTimer = window.setTimeout(() => this.startHoldRepeat(), HOLD_REPEAT_DELAY_MS);
  }

  private startHoldRepeat(): void {
    if (this.holdPointerId === null) return;
    if (this.canAct && !this.canAct(this.holdAmount)) return;

    this.holdActive = true;
    this.suppressClickUntilMs = performance.now() + 600;

    const now = performance.now();
    this.holdStartedAtMs = now;
    this.holdNextFireAtMs = now;

    const tick = (ts: number): void => {
      if (!this.holdActive || this.holdPointerId === null) return;

      if (this.canAct && !this.canAct(this.holdAmount)) {
        this.stopHold();
        return;
      }

      if (ts >= this.holdNextFireAtMs) {
        this.onAction(this.holdAmount);
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
