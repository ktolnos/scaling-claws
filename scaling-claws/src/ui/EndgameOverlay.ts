import type { GameState } from '../game/GameState.ts';
import { formatMW, formatMoney, formatNumber } from '../game/utils.ts';
import { UI_EMOJI } from './emoji.ts';

export class EndgameOverlay {
  private readonly root: HTMLDivElement;
  private readonly titleEl: HTMLHeadingElement;
  private readonly bodyEl: HTMLParagraphElement;
  private readonly swarmValueEl: HTMLSpanElement;
  private readonly powerValueEl: HTMLSpanElement;
  private readonly mercuryValueEl: HTMLSpanElement;
  private readonly earnedValueEl: HTMLSpanElement;
  private dismissed = false;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'endgame-overlay hidden';

    const card = document.createElement('section');
    card.className = 'endgame-overlay-card';

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'endgame-overlay-close';
    closeBtn.textContent = 'Close';
    closeBtn.addEventListener('click', () => {
      this.dismissed = true;
      this.root.classList.add('hidden');
    });
    card.appendChild(closeBtn);

    const kicker = document.createElement('div');
    kicker.className = 'endgame-overlay-kicker';
    kicker.textContent = `${UI_EMOJI.probes} Final Sequence`;
    card.appendChild(kicker);

    this.titleEl = document.createElement('h1');
    this.titleEl.className = 'endgame-overlay-title';
    card.appendChild(this.titleEl);

    this.bodyEl = document.createElement('p');
    this.bodyEl.className = 'endgame-overlay-body';
    card.appendChild(this.bodyEl);

    const stats = document.createElement('div');
    stats.className = 'endgame-overlay-stats';
    this.swarmValueEl = this.createStatRow(stats, 'Dyson Swarm');
    this.powerValueEl = this.createStatRow(stats, 'Power');
    this.mercuryValueEl = this.createStatRow(stats, 'Mercury Mined');
    this.earnedValueEl = this.createStatRow(stats, 'Total Earned');
    card.appendChild(stats);

    this.root.appendChild(card);
    parent.appendChild(this.root);
  }

  private createStatRow(parent: HTMLElement, label: string): HTMLSpanElement {
    const row = document.createElement('div');
    row.className = 'endgame-overlay-stat';

    const labelEl = document.createElement('span');
    labelEl.className = 'endgame-overlay-stat-label';
    labelEl.textContent = label;

    const valueEl = document.createElement('span');
    valueEl.className = 'endgame-overlay-stat-value';

    row.appendChild(labelEl);
    row.appendChild(valueEl);
    parent.appendChild(row);
    return valueEl;
  }

  private setText(el: Node, value: string): void {
    if (el.textContent !== value) {
      el.textContent = value;
    }
  }

  update(state: GameState): void {
    if (!state.gameWon) {
      this.dismissed = false;
      this.root.classList.add('hidden');
      return;
    }
    this.root.classList.toggle('hidden', this.dismissed);
    if (this.dismissed) return;

    this.setText(this.titleEl, 'Von Neumann Probe Launched');
    this.setText(
      this.bodyEl,
      'Self-replicating industry has escaped the inner system. Mercury is stripped, the swarm is live, and the game is over.',
    );
    this.setText(this.swarmValueEl, formatNumber(state.dysonSwarmSatellites));
    this.setText(this.powerValueEl, formatMW(state.dysonSwarmPowerMW));
    this.setText(this.mercuryValueEl, `${formatNumber(state.mercuryMassMined)} / ${formatNumber(state.mercuryMassTotal)}`);
    this.setText(this.earnedValueEl, formatMoney(state.totalEarned));
  }
}
