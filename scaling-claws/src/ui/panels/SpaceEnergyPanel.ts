import type { GameState } from '../../game/GameState.ts';
import { BALANCE, hasCompletedResearch } from '../../game/BalanceConfig.ts';
import { dispatchGameAction } from '../../game/ActionDispatcher.ts';
import { formatMW, formatNumber, formatNumberOneDecimal, toBigInt } from '../../game/utils.ts';
import type { Panel } from '../PanelManager.ts';
import { createPanelDivider, createPanelScaffold } from '../components/PanelScaffold.ts';
import { emojiHtml, resourceLabelHtml } from '../emoji.ts';

export class SpaceEnergyPanel implements Panel {
  readonly el: HTMLElement;
  private state: GameState;
  private readonly sectionTitleOverride: string | null;

  private mercurySection!: HTMLDivElement;
  private mercurySwarmEl!: HTMLSpanElement;
  private mercurySwarmPowerEl!: HTMLSpanElement;
  private mercuryMinedEl!: HTMLSpanElement;
  private mercuryPieEl!: HTMLDivElement;
  private probeBtn!: HTMLButtonElement;

  constructor(state: GameState, sectionTitleOverride: string | null = null) {
    this.state = state;
    this.sectionTitleOverride = sectionTitleOverride;

    const { panel } = createPanelScaffold('MERCURY', {
      panelClassName: 'panel space-energy-panel',
      bodyClassName: 'panel-body panel-body-tight',
    });
    this.el = panel;
    this.build();
  }

  private build(): void {
    const body = this.el.querySelector('.panel-body') as HTMLDivElement;
    body.appendChild(createPanelDivider());
    this.buildMercury(body);
  }

  private buildMercury(parent: HTMLElement): void {
    this.mercurySection = document.createElement('div');

    const title = document.createElement('div');
    title.className = 'panel-section-title';
    title.textContent = this.sectionTitleOverride ?? 'MERCURY';
    this.mercurySection.appendChild(title);

    const overview = document.createElement('div');
    overview.className = 'mercury-overview';

    const iconWrap = document.createElement('div');
    iconWrap.className = 'mercury-overview-icon';
    iconWrap.innerHTML = `<span class="mercury-overview-emoji">${emojiHtml('mercury')}</span>`;
    this.mercuryPieEl = document.createElement('div');
    this.mercuryPieEl.className = 'mercury-overview-pie';
    this.mercuryPieEl.innerHTML = `<span class="mercury-overview-emoji mercury-overview-emoji-cover">${emojiHtml('mercury')}</span>`;
    iconWrap.appendChild(this.mercuryPieEl);
    overview.appendChild(iconWrap);

    const textWrap = document.createElement('div');
    textWrap.className = 'mercury-overview-text';

    const swarmRow = document.createElement('div');
    swarmRow.className = 'panel-row mercury-overview-row';
    this.mercurySwarmEl = document.createElement('span');
    this.mercurySwarmEl.className = 'label';
    this.mercurySwarmPowerEl = document.createElement('span');
    this.mercurySwarmPowerEl.className = 'value';
    swarmRow.appendChild(this.mercurySwarmEl);
    swarmRow.appendChild(this.mercurySwarmPowerEl);
    textWrap.appendChild(swarmRow);

    const minedRow = document.createElement('div');
    minedRow.className = 'mercury-mined-row';
    this.mercuryMinedEl = document.createElement('span');
    this.mercuryMinedEl.className = 'value';
    minedRow.appendChild(this.mercuryMinedEl);
    textWrap.appendChild(minedRow);

    overview.appendChild(textWrap);
    this.mercurySection.appendChild(overview);

    this.probeBtn = document.createElement('button');
    this.probeBtn.className = 'mercury-probe-btn';
    this.probeBtn.textContent = 'Launch Von Neumann Probe';
    this.probeBtn.addEventListener('click', () => {
      dispatchGameAction(this.state, { type: 'launchVonNeumannProbe' });
    });
    this.mercurySection.appendChild(this.probeBtn);
    parent.appendChild(this.mercurySection);
  }

  update(state: GameState): void {
    this.state = state;

    const visible = state.isPostGpuTransition && hasCompletedResearch(state.researchLevels, 'payloadToMercury');
    this.el.style.display = visible ? '' : 'none';
    if (!visible) return;

    const mined = state.mercuryMassMined;
    const total = state.mercuryMassTotal > 0n ? state.mercuryMassTotal : BALANCE.mercuryBaseMassTotal;
    const minedPctRaw = total > 0n ? (Number(mined) / Number(total)) * 100 : 0;
    const minedPct = Math.max(0, Math.min(100, minedPctRaw));
    const minedPctText = minedPct >= 1 ? formatNumberOneDecimal(minedPct) : minedPct >= 0.01 ? minedPct.toFixed(2) : minedPct.toFixed(3);

    const mercuryMatRate = state.locationProductionPerMin.mercury.material - state.locationConsumptionPerMin.mercury.material;
    this.mercurySwarmEl.innerHTML = `${resourceLabelHtml('gpuSatellites', 'Dyson Swarm')}: ${formatNumber(state.dysonSwarmSatellites)}`;
    this.mercurySwarmPowerEl.innerHTML = `${resourceLabelHtml('energy', 'Power')} ${formatMW(state.dysonSwarmPowerMW)}`;
    const rateAbs = mercuryMatRate >= 0n ? mercuryMatRate : -mercuryMatRate;
    const rateSign = mercuryMatRate >= 0n ? '+' : '-';
    const rateColor = mercuryMatRate >= 0n ? 'var(--accent-green)' : 'var(--accent-red)';
    this.mercuryMinedEl.innerHTML =
      `Mined ${formatNumber(mined)}/${formatNumber(total)} (${minedPctText}%) ` +
      `<span style="color:${rateColor}">${rateSign}${formatNumber(rateAbs)}/m</span>`;
    this.mercuryPieEl.style.setProperty('--mercury-mined-pct', `${minedPct.toFixed(3)}%`);

    const hasProbeTech = hasCompletedResearch(state.researchLevels, 'vonNeumannProbes');
    const hasProbeReady = state.locationResources.mercury.probes >= toBigInt(1);
    this.probeBtn.style.display = hasProbeTech ? '' : 'none';
    this.probeBtn.disabled = !hasProbeTech || !hasProbeReady || state.gameWon;
    this.probeBtn.textContent = state.gameWon ? 'Probe Launched' : 'Launch Von Neumann Probe';
  }
}
