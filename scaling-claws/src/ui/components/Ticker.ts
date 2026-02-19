import type { GameState } from '../../game/GameState.ts';

const TICKER_INTERVAL_MS = 8000;

export class Ticker {
  private el: HTMLElement;
  private textEl: HTMLDivElement;
  private lastShowTime: number = -Infinity;
  private currentText: string = '';

  constructor(container: HTMLElement) {
    this.el = container;
    this.textEl = document.createElement('div');
    this.textEl.className = 'ticker-text';
    this.el.appendChild(this.textEl);
  }

  update(state: GameState): void {
    const now = state.time;

    // Check if there's a pending text to show
    if (state.pendingFlavorTexts.length > 0 && now - this.lastShowTime > TICKER_INTERVAL_MS) {
      const text = state.pendingFlavorTexts.shift()!;
      this.showText(text);
      state.shownFlavorTexts.push(text);
      this.lastShowTime = now;
    }
  }

  private showText(text: string): void {
    if (text === this.currentText) return;
    this.currentText = text;

    // Trigger re-animation by recreating element
    const newEl = document.createElement('div');
    newEl.className = 'ticker-text';
    newEl.textContent = text;
    this.el.replaceChild(newEl, this.textEl);
    this.textEl = newEl;
  }
}
