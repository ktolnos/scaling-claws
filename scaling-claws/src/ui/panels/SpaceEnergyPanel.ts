import type { GameState } from '../../game/GameState.ts';
import type { Panel } from '../PanelManager.ts';
import { BALANCE } from '../../game/BalanceConfig.ts';
import type { PowerPlantConfig } from '../../game/BalanceConfig.ts';
import { formatMoney, formatNumber, formatMW, fromBigInt, toBigInt, mulB, scaleBigInt } from '../../game/utils.ts';
import { buyGridPower, sellGridPower, buyGasPlant, buyNuclearPlant, buySolarFarm, buySolarPanel } from '../../game/systems/EnergySystem.ts';
import {
  buildRocket, launchSatellite,
  buildLunarBase, sendRobotsToMoon, sendGPUsToMoon, buyLunarSolarPanel,
  buildMercuryBase, sendRobotsToMercury,
} from '../../game/systems/SpaceSystem.ts';
import { BulkBuyGroup, getBuyTiers } from '../components/BulkBuyGroup.ts';

interface PlantRowRefs {
  row: HTMLDivElement;
  info: HTMLSpanElement;
  btn: HTMLButtonElement;
  btnMoney: HTMLSpanElement;
  btnLabor: HTMLSpanElement;
}

interface SolarPanelRefs {
  row: HTMLDivElement;
  info: HTMLSpanElement;
  btnGroup: HTMLDivElement;
  lastTiers: string;
}

export class SpaceEnergyPanel implements Panel {
  readonly el: HTMLElement;
  private state: GameState;

  // --- Energy section refs ---
  private demandEl!: HTMLSpanElement;
  private supplyEl!: HTMLSpanElement;
  private throttleEl!: HTMLDivElement;
  private gridEl!: HTMLSpanElement;
  private gridBuyGroup!: BulkBuyGroup;
  private gridSellGroup!: BulkBuyGroup;
  private gasRow!: PlantRowRefs;
  private nuclearRow!: PlantRowRefs;
  private solarFarmRow!: PlantRowRefs;
  private solarPanelRefs!: SolarPanelRefs;

  // --- Space section refs ---
  private spaceSection!: HTMLDivElement;
  private rocketInfo!: HTMLSpanElement;
  private rocketBtn!: HTMLButtonElement;
  private rocketBtnMoney!: HTMLSpanElement;
  private rocketBtnLabor!: HTMLSpanElement;
  private satInfo!: HTMLSpanElement;
  private satBulk!: BulkBuyGroup;
  private orbitalPowerEl!: HTMLSpanElement;

  // --- Lunar section refs ---
  private lunarSection!: HTMLDivElement;
  private lunarHint!: HTMLDivElement;
  private lunarContent!: HTMLDivElement;
  private lunarBaseBtn!: HTMLButtonElement;
  private lunarBaseBtnMoney!: HTMLSpanElement;
  private lunarBaseBtnLabor!: HTMLSpanElement;
  private lunarBaseBtnCode!: HTMLSpanElement;
  private lunarBaseBuilt!: HTMLDivElement;
  private lunarRobotInfo!: HTMLSpanElement;
  private lunarRobotBulk!: BulkBuyGroup;
  private lunarGPUInfo!: HTMLSpanElement;
  private lunarGPUBulk!: BulkBuyGroup;
  private lunarPowerDemandEl!: HTMLSpanElement;
  private lunarPowerSupplyEl!: HTMLSpanElement;
  private lunarThrottleEl!: HTMLDivElement;
  private lunarSolarInfo!: HTMLSpanElement;
  private lunarSolarBulk!: BulkBuyGroup;
  private massDriverEl!: HTMLSpanElement;

  // --- Mercury section refs ---
  private mercurySection!: HTMLDivElement;
  private mercuryHint!: HTMLDivElement;
  private mercuryContent!: HTMLDivElement;
  private mercuryBaseBtn!: HTMLButtonElement;
  private mercuryBaseBtnMoney!: HTMLSpanElement;
  private mercuryBaseBtnLabor!: HTMLSpanElement;
  private mercuryBaseBtnCode!: HTMLSpanElement;
  private mercuryBaseBuilt!: HTMLDivElement;
  private mercuryRobotInfo!: HTMLSpanElement;
  private mercuryRobotBulk!: BulkBuyGroup;
  private mercuryMiningEl!: HTMLSpanElement;

  constructor(state: GameState) {
    this.state = state;
    this.el = document.createElement('div');
    this.el.className = 'panel';
    this.build();
  }

  private build(): void {
    const header = document.createElement('div');
    header.className = 'panel-header';
    header.textContent = 'SPACE & ENERGY';
    this.el.appendChild(header);

    const body = document.createElement('div');
    body.className = 'panel-body';

    // ─── EARTH ENERGY ───
    this.buildEnergySection(body);
    body.appendChild(this.createDivider());

    // ─── SPACE ───
    this.buildSpaceSection(body);

    // ─── LUNAR ───
    this.buildLunarSection(body);

    // ─── MERCURY ───
    this.buildMercurySection(body);

    this.el.appendChild(body);
  }

  // ===== ENERGY SECTION (same as EnergyPanel) =====
  private buildEnergySection(body: HTMLElement): void {
    const title = document.createElement('div');
    title.className = 'panel-section-title';
    title.textContent = 'EARTH ENERGY';
    body.appendChild(title);

    // Demand / Supply
    const demandRow = document.createElement('div');
    demandRow.className = 'panel-row';
    const demandLabel = document.createElement('span');
    demandLabel.className = 'label';
    demandLabel.textContent = 'Power demand:';
    this.demandEl = document.createElement('span');
    this.demandEl.className = 'value';
    demandRow.appendChild(demandLabel);
    demandRow.appendChild(this.demandEl);
    body.appendChild(demandRow);

    const supplyRow = document.createElement('div');
    supplyRow.className = 'panel-row';
    const supplyLabel = document.createElement('span');
    supplyLabel.className = 'label';
    supplyLabel.textContent = 'Power supply:';
    this.supplyEl = document.createElement('span');
    this.supplyEl.className = 'value';
    supplyRow.appendChild(supplyLabel);
    supplyRow.appendChild(this.supplyEl);
    body.appendChild(supplyRow);

    this.throttleEl = document.createElement('div');
    this.throttleEl.className = 'warning-text';
    this.throttleEl.style.display = 'none';
    body.appendChild(this.throttleEl);

    // Grid contract
    const gridRow = document.createElement('div');
    gridRow.className = 'panel-row';
    gridRow.style.fontSize = '0.82rem';

    const gridLabel = document.createElement('span');
    gridLabel.className = 'label';
    gridLabel.textContent = 'Grid contract:';
    gridRow.appendChild(gridLabel);

    const gridControls = document.createElement('div');
    gridControls.style.display = 'flex';
    gridControls.style.alignItems = 'center';
    gridControls.style.gap = '6px';

    this.gridSellGroup = new BulkBuyGroup((amt) => sellGridPower(this.state, amt), '-');
    this.gridBuyGroup = new BulkBuyGroup((amt) => buyGridPower(this.state, amt), '+');

    this.gridEl = document.createElement('span');
    this.gridEl.className = 'value';
    this.gridEl.style.fontWeight = 'bold';
    this.gridEl.style.minWidth = '45px';
    this.gridEl.style.textAlign = 'center';

    gridControls.appendChild(this.gridSellGroup.el);
    gridControls.appendChild(this.gridEl);
    gridControls.appendChild(this.gridBuyGroup.el);
    gridRow.appendChild(gridControls);
    body.appendChild(gridRow);

    // Power plants
    const plantsSection = document.createElement('div');
    plantsSection.className = 'panel-section';
    this.gasRow = this.buildPlantRow(plantsSection, () => buyGasPlant(this.state));
    this.nuclearRow = this.buildPlantRow(plantsSection, () => buyNuclearPlant(this.state));
    this.solarFarmRow = this.buildPlantRow(plantsSection, () => buySolarFarm(this.state));
    body.appendChild(plantsSection);

    // Solar panels
    const solarSection = document.createElement('div');
    solarSection.className = 'panel-section';
    const spRow = document.createElement('div');
    spRow.className = 'panel-row';
    spRow.style.fontSize = '0.82rem';
    spRow.style.display = 'none';
    const spInfo = document.createElement('span');
    spInfo.className = 'label';
    spRow.appendChild(spInfo);
    const spBtnGroup = document.createElement('div');
    spBtnGroup.className = 'bulk-buy-group';
    spRow.appendChild(spBtnGroup);
    solarSection.appendChild(spRow);
    body.appendChild(solarSection);
    this.solarPanelRefs = { row: spRow, info: spInfo, btnGroup: spBtnGroup, lastTiers: '' };

    const note = document.createElement('div');
    note.style.fontSize = '0.72rem';
    note.style.color = 'var(--text-muted)';
    note.style.marginTop = '4px';
    note.textContent = 'Surplus = wasted. Deficit → GPUs throttle.';
    body.appendChild(note);
  }

  // ===== SPACE SECTION =====
  private buildSpaceSection(body: HTMLElement): void {
    this.spaceSection = document.createElement('div');

    const title = document.createElement('div');
    title.className = 'panel-section-title';
    title.textContent = 'SPACE';
    this.spaceSection.appendChild(title);

    // Rockets
    const rocketRow = document.createElement('div');
    rocketRow.className = 'panel-row';
    rocketRow.style.fontSize = '0.82rem';
    this.rocketInfo = document.createElement('span');
    this.rocketInfo.className = 'label';
    rocketRow.appendChild(this.rocketInfo);

    this.rocketBtn = document.createElement('button');
    this.rocketBtn.style.fontSize = '0.72rem';
    const rocketBtnText = document.createElement('span');
    rocketBtnText.textContent = 'Build ';
    this.rocketBtn.appendChild(rocketBtnText);
    this.rocketBtnMoney = document.createElement('span');
    this.rocketBtn.appendChild(this.rocketBtnMoney);
    this.rocketBtn.appendChild(document.createTextNode(' '));
    this.rocketBtnLabor = document.createElement('span');
    this.rocketBtn.appendChild(this.rocketBtnLabor);
    this.rocketBtn.addEventListener('click', () => buildRocket(this.state));
    rocketRow.appendChild(this.rocketBtn);
    this.spaceSection.appendChild(rocketRow);

    // Satellites
    const satRow = document.createElement('div');
    satRow.className = 'panel-row';
    satRow.style.fontSize = '0.82rem';
    this.satInfo = document.createElement('span');
    this.satInfo.className = 'label';
    satRow.appendChild(this.satInfo);
    this.satBulk = new BulkBuyGroup((amt) => launchSatellite(this.state, amt), '+');
    satRow.appendChild(this.satBulk.el);
    this.spaceSection.appendChild(satRow);

    // Orbital power
    const orbRow = document.createElement('div');
    orbRow.className = 'panel-row';
    orbRow.style.fontSize = '0.82rem';
    const orbLabel = document.createElement('span');
    orbLabel.className = 'label';
    orbLabel.textContent = 'Orbital power:';
    orbRow.appendChild(orbLabel);
    this.orbitalPowerEl = document.createElement('span');
    this.orbitalPowerEl.className = 'value';
    orbRow.appendChild(this.orbitalPowerEl);
    this.spaceSection.appendChild(orbRow);

    body.appendChild(this.spaceSection);
  }

  // ===== LUNAR SECTION =====
  private buildLunarSection(body: HTMLElement): void {
    this.lunarSection = document.createElement('div');

    this.lunarSection.appendChild(this.createDivider());

    const title = document.createElement('div');
    title.className = 'panel-section-title';
    title.textContent = 'LUNAR';
    this.lunarSection.appendChild(title);

    // Hint (before spaceSystems2)
    this.lunarHint = document.createElement('div');
    this.lunarHint.style.fontSize = '0.82rem';
    this.lunarHint.style.color = 'var(--text-muted)';
    this.lunarHint.textContent = 'Requires Space Systems II research';
    this.lunarSection.appendChild(this.lunarHint);

    // Content (after spaceSystems2)
    this.lunarContent = document.createElement('div');
    this.lunarContent.style.display = 'none';

    // Build lunar base button
    const baseBtnRow = document.createElement('div');
    baseBtnRow.className = 'panel-row';
    baseBtnRow.style.fontSize = '0.82rem';
    this.lunarBaseBtn = document.createElement('button');
    this.lunarBaseBtn.style.fontSize = '0.72rem';
    const baseBtnText = document.createElement('span');
    baseBtnText.textContent = 'Build Lunar Base ';
    this.lunarBaseBtn.appendChild(baseBtnText);
    this.lunarBaseBtnMoney = document.createElement('span');
    this.lunarBaseBtn.appendChild(this.lunarBaseBtnMoney);
    this.lunarBaseBtn.appendChild(document.createTextNode(' '));
    this.lunarBaseBtnLabor = document.createElement('span');
    this.lunarBaseBtn.appendChild(this.lunarBaseBtnLabor);
    this.lunarBaseBtn.appendChild(document.createTextNode(' '));
    this.lunarBaseBtnCode = document.createElement('span');
    this.lunarBaseBtn.appendChild(this.lunarBaseBtnCode);
    this.lunarBaseBtn.addEventListener('click', () => buildLunarBase(this.state));
    baseBtnRow.appendChild(this.lunarBaseBtn);
    this.lunarContent.appendChild(baseBtnRow);

    // Lunar base built content
    this.lunarBaseBuilt = document.createElement('div');
    this.lunarBaseBuilt.style.display = 'none';

    // Lunar robots
    const lrRow = document.createElement('div');
    lrRow.className = 'panel-row';
    lrRow.style.fontSize = '0.82rem';
    this.lunarRobotInfo = document.createElement('span');
    this.lunarRobotInfo.className = 'label';
    lrRow.appendChild(this.lunarRobotInfo);
    this.lunarRobotBulk = new BulkBuyGroup((amt) => sendRobotsToMoon(this.state, amt), '+');
    lrRow.appendChild(this.lunarRobotBulk.el);
    this.lunarBaseBuilt.appendChild(lrRow);

    // Lunar GPUs
    const lgRow = document.createElement('div');
    lgRow.className = 'panel-row';
    lgRow.style.fontSize = '0.82rem';
    this.lunarGPUInfo = document.createElement('span');
    this.lunarGPUInfo.className = 'label';
    lgRow.appendChild(this.lunarGPUInfo);
    this.lunarGPUBulk = new BulkBuyGroup((amt) => sendGPUsToMoon(this.state, amt), '+');
    lgRow.appendChild(this.lunarGPUBulk.el);
    this.lunarBaseBuilt.appendChild(lgRow);

    // Lunar power demand/supply
    const lpRow = document.createElement('div');
    lpRow.className = 'panel-row';
    lpRow.style.fontSize = '0.82rem';
    const lpLabel = document.createElement('span');
    lpLabel.className = 'label';
    lpLabel.textContent = 'Lunar power:';
    lpRow.appendChild(lpLabel);
    const lpValues = document.createElement('span');
    this.lunarPowerDemandEl = document.createElement('span');
    this.lunarPowerSupplyEl = document.createElement('span');
    lpValues.appendChild(this.lunarPowerDemandEl);
    lpValues.appendChild(document.createTextNode(' / '));
    lpValues.appendChild(this.lunarPowerSupplyEl);
    lpRow.appendChild(lpValues);
    this.lunarBaseBuilt.appendChild(lpRow);

    // Lunar throttle warning
    this.lunarThrottleEl = document.createElement('div');
    this.lunarThrottleEl.className = 'warning-text';
    this.lunarThrottleEl.style.display = 'none';
    this.lunarBaseBuilt.appendChild(this.lunarThrottleEl);

    // Lunar solar panels
    const lsRow = document.createElement('div');
    lsRow.className = 'panel-row';
    lsRow.style.fontSize = '0.82rem';
    this.lunarSolarInfo = document.createElement('span');
    this.lunarSolarInfo.className = 'label';
    lsRow.appendChild(this.lunarSolarInfo);
    this.lunarSolarBulk = new BulkBuyGroup((amt) => buyLunarSolarPanel(this.state, amt), '+');
    lsRow.appendChild(this.lunarSolarBulk.el);
    this.lunarBaseBuilt.appendChild(lsRow);

    // Mass driver
    const mdRow = document.createElement('div');
    mdRow.className = 'panel-row';
    mdRow.style.fontSize = '0.82rem';
    const mdLabel = document.createElement('span');
    mdLabel.className = 'label';
    mdLabel.textContent = 'Mass driver:';
    mdRow.appendChild(mdLabel);
    this.massDriverEl = document.createElement('span');
    this.massDriverEl.className = 'value';
    mdRow.appendChild(this.massDriverEl);
    this.lunarBaseBuilt.appendChild(mdRow);

    this.lunarContent.appendChild(this.lunarBaseBuilt);
    this.lunarSection.appendChild(this.lunarContent);
    body.appendChild(this.lunarSection);
  }

  // ===== MERCURY SECTION =====
  private buildMercurySection(body: HTMLElement): void {
    this.mercurySection = document.createElement('div');

    this.mercurySection.appendChild(this.createDivider());

    const title = document.createElement('div');
    title.className = 'panel-section-title';
    title.textContent = 'MERCURY';
    this.mercurySection.appendChild(title);

    // Hint
    this.mercuryHint = document.createElement('div');
    this.mercuryHint.style.fontSize = '0.82rem';
    this.mercuryHint.style.color = 'var(--text-muted)';
    this.mercuryHint.textContent = 'Requires Space Systems III research';
    this.mercurySection.appendChild(this.mercuryHint);

    // Content
    this.mercuryContent = document.createElement('div');
    this.mercuryContent.style.display = 'none';

    // Build mercury base button
    const baseBtnRow = document.createElement('div');
    baseBtnRow.className = 'panel-row';
    baseBtnRow.style.fontSize = '0.82rem';
    this.mercuryBaseBtn = document.createElement('button');
    this.mercuryBaseBtn.style.fontSize = '0.72rem';
    const baseBtnText = document.createElement('span');
    baseBtnText.textContent = 'Build Mercury Base ';
    this.mercuryBaseBtn.appendChild(baseBtnText);
    this.mercuryBaseBtnMoney = document.createElement('span');
    this.mercuryBaseBtn.appendChild(this.mercuryBaseBtnMoney);
    this.mercuryBaseBtn.appendChild(document.createTextNode(' '));
    this.mercuryBaseBtnLabor = document.createElement('span');
    this.mercuryBaseBtn.appendChild(this.mercuryBaseBtnLabor);
    this.mercuryBaseBtn.appendChild(document.createTextNode(' '));
    this.mercuryBaseBtnCode = document.createElement('span');
    this.mercuryBaseBtn.appendChild(this.mercuryBaseBtnCode);
    this.mercuryBaseBtn.addEventListener('click', () => buildMercuryBase(this.state));
    baseBtnRow.appendChild(this.mercuryBaseBtn);
    this.mercuryContent.appendChild(baseBtnRow);

    // Mercury base built content
    this.mercuryBaseBuilt = document.createElement('div');
    this.mercuryBaseBuilt.style.display = 'none';

    // Mercury robots
    const mrRow = document.createElement('div');
    mrRow.className = 'panel-row';
    mrRow.style.fontSize = '0.82rem';
    this.mercuryRobotInfo = document.createElement('span');
    this.mercuryRobotInfo.className = 'label';
    mrRow.appendChild(this.mercuryRobotInfo);
    this.mercuryRobotBulk = new BulkBuyGroup((amt) => sendRobotsToMercury(this.state, amt), '+');
    mrRow.appendChild(this.mercuryRobotBulk.el);
    this.mercuryBaseBuilt.appendChild(mrRow);

    // Mining rate
    const mmRow = document.createElement('div');
    mmRow.className = 'panel-row';
    mmRow.style.fontSize = '0.82rem';
    const mmLabel = document.createElement('span');
    mmLabel.className = 'label';
    mmLabel.textContent = 'Mining rate:';
    mmRow.appendChild(mmLabel);
    this.mercuryMiningEl = document.createElement('span');
    this.mercuryMiningEl.className = 'value';
    mmRow.appendChild(this.mercuryMiningEl);
    this.mercuryBaseBuilt.appendChild(mmRow);

    this.mercuryContent.appendChild(this.mercuryBaseBuilt);
    this.mercurySection.appendChild(this.mercuryContent);
    body.appendChild(this.mercurySection);
  }

  // ===== Helpers =====
  private buildPlantRow(parent: HTMLElement, onClick: () => void): PlantRowRefs {
    const row = document.createElement('div');
    row.className = 'panel-row';
    row.style.fontSize = '0.82rem';
    const info = document.createElement('span');
    info.className = 'label';
    row.appendChild(info);
    const btn = document.createElement('button');
    btn.style.fontSize = '0.75rem';
    const btnText = document.createElement('span');
    btnText.textContent = 'Build ';
    btn.appendChild(btnText);
    const btnMoney = document.createElement('span');
    btn.appendChild(btnMoney);
    btn.appendChild(document.createTextNode(' '));
    const btnLabor = document.createElement('span');
    btn.appendChild(btnLabor);
    btn.addEventListener('click', onClick);
    row.appendChild(btn);
    parent.appendChild(row);
    return { row, info, btn, btnMoney, btnLabor };
  }

  private createDivider(): HTMLHRElement {
    const hr = document.createElement('hr');
    hr.className = 'panel-divider';
    return hr;
  }

  // ===== UPDATE =====
  update(state: GameState): void {
    this.state = state;
    this.updateEnergy(state);
    this.updateSpace(state);
    this.updateLunar(state);
    this.updateMercury(state);
  }

  private updateEnergy(state: GameState): void {
    this.demandEl.textContent = formatMW(state.powerDemandMW);
    this.supplyEl.textContent = formatMW(state.powerSupplyMW);
    this.supplyEl.style.color = state.powerSupplyMW >= state.powerDemandMW ? 'var(--accent-green)' : 'var(--accent-red)';

    if (state.powerThrottle < 1) {
      this.throttleEl.style.display = 'block';
      this.throttleEl.textContent = 'GPUs throttled to ' + Math.round(state.powerThrottle * 100) + '% — need more power!';
    } else {
      this.throttleEl.style.display = 'none';
    }

    // Grid
    this.gridEl.textContent = formatMW(state.gridPowerKW / 1000n);
    const gridKWNum = Math.floor(fromBigInt(state.gridPowerKW));
    this.gridBuyGroup.update(gridKWNum, (amt) => {
      const amtB = toBigInt(amt);
      const nextTotalKW = state.gridPowerKW + amtB;
      const costPerMin = mulB(nextTotalKW, toBigInt(BALANCE.gridPowerCostPerKWPerMin));
      return state.funds >= costPerMin;
    });
    this.gridSellGroup.update(gridKWNum, (amt) => gridKWNum >= amt);

    // Plants
    this.updatePlantRow(this.gasRow, 'Gas Plant', Math.floor(fromBigInt(state.gasPlants)), BALANCE.powerPlants.gas, state.labor);
    this.updatePlantRow(this.nuclearRow, 'Nuclear Plant', Math.floor(fromBigInt(state.nuclearPlants)), BALANCE.powerPlants.nuclear, state.labor);
    this.updatePlantRow(this.solarFarmRow, 'Solar Farm', Math.floor(fromBigInt(state.solarFarms)), BALANCE.powerPlants.solar, state.labor);

    // Solar panels
    if (state.solarFarms > 0n) {
      this.solarPanelRefs.row.style.display = '';
      this.solarPanelRefs.info.textContent = 'Solar panels: ' + formatNumber(state.solarPanels) + ' (' + formatMW(mulB(state.solarPanels, toBigInt(BALANCE.solarPanelMW))) + ')';
      const spNum = Math.floor(fromBigInt(state.solarPanels));
      const tiers = getBuyTiers(spNum);
      const tiersKey = tiers.join(',');
      if (tiersKey !== this.solarPanelRefs.lastTiers) {
        this.solarPanelRefs.lastTiers = tiersKey;
        this.solarPanelRefs.btnGroup.innerHTML = '';
        for (const amt of tiers) {
          const btn = document.createElement('button');
          btn.textContent = '+' + formatNumber(amt);
          btn.dataset.amount = amt.toString();
          btn.addEventListener('click', () => buySolarPanel(this.state, amt));
          this.solarPanelRefs.btnGroup.appendChild(btn);
        }
      }
      this.solarPanelRefs.btnGroup.querySelectorAll('button').forEach(btn => {
        const amt = parseInt((btn as HTMLElement).dataset.amount ?? '1');
        (btn as HTMLButtonElement).disabled = state.funds < mulB(toBigInt(amt), BALANCE.solarPanelCost);
      });
    } else {
      this.solarPanelRefs.row.style.display = 'none';
    }
  }

  private updatePlantRow(refs: PlantRowRefs, name: string, count: number, config: PowerPlantConfig, currentLabor: bigint): void {
    const mwText = config.outputMW > 0n ? '+' + formatMW(config.outputMW) : '+panels MW';
    const laborMet = currentLabor >= config.laborCost;
    const moneyMet = this.state.funds >= config.cost;
    refs.info.textContent = `${name}: ${count} ${mwText}`;
    refs.btnMoney.textContent = formatMoney(config.cost);
    refs.btnMoney.style.color = moneyMet ? '' : 'var(--accent-red)';
    refs.btnLabor.textContent = ` + ${formatNumber(config.laborCost)} labor`;
    refs.btnLabor.style.color = laborMet ? '' : 'var(--accent-red)';
    refs.btn.disabled = !moneyMet || !laborMet;
  }

  private updateSpace(state: GameState): void {
    // Show/hide space section
    const hasSpace = state.completedResearch.includes('spaceRockets1');
    this.spaceSection.style.display = hasSpace ? '' : 'none';
    if (!hasSpace) return;

    // Rockets
    this.rocketInfo.textContent = 'Rockets: ' + formatNumber(state.rockets);
    const rocketMoneyMet = state.funds >= BALANCE.rocketCost;
    const rocketLaborMet = state.labor >= BALANCE.rocketLaborCost;
    this.rocketBtnMoney.textContent = formatMoney(BALANCE.rocketCost);
    this.rocketBtnMoney.style.color = rocketMoneyMet ? '' : 'var(--accent-red)';
    this.rocketBtnLabor.textContent = '+ ' + formatNumber(BALANCE.rocketLaborCost) + ' labor';
    this.rocketBtnLabor.style.color = rocketLaborMet ? '' : 'var(--accent-red)';
    this.rocketBtn.disabled = !rocketMoneyMet || !rocketLaborMet;

    // Satellites
    let satText = 'Satellites: ' + formatNumber(state.satellites);
    if (state.lunarMassDriverRate > 0) {
      satText += ' (+' + formatNumber(state.lunarMassDriverRate) + '/min)';
    }
    this.satInfo.textContent = satText;

    const satCost = mulB(BALANCE.satelliteCost, toBigInt(state.launchCostBonus));
    const satNum = Math.floor(fromBigInt(state.satellites));
    this.satBulk.update(satNum, (amt) => {
      const amtB = toBigInt(amt);
      return state.rockets >= scaleBigInt(1n) && state.funds >= mulB(satCost, amtB) && state.labor >= mulB(BALANCE.satelliteLaborCost, amtB);
    });

    // Orbital power
    this.orbitalPowerEl.textContent = formatMW(state.orbitalPowerMW) + ' (self-sufficient)';
  }

  private updateLunar(state: GameState): void {
    const hasLunar = state.completedResearch.includes('spaceSystems2');
    this.lunarSection.style.display = state.completedResearch.includes('spaceRockets1') ? '' : 'none';
    if (!state.completedResearch.includes('spaceRockets1')) return;

    if (!hasLunar) {
      this.lunarHint.style.display = '';
      this.lunarContent.style.display = 'none';
      return;
    }

    this.lunarHint.style.display = 'none';
    this.lunarContent.style.display = '';

    if (!state.lunarBase) {
      // Show build button
      this.lunarBaseBtn.style.display = '';
      this.lunarBaseBuilt.style.display = 'none';
      const moneyMet = state.funds >= BALANCE.lunarBaseCost;
      const laborMet = state.labor >= BALANCE.lunarBaseLaborCost;
      const codeMet = state.code >= BALANCE.lunarBaseCodeCost;
      this.lunarBaseBtnMoney.textContent = formatMoney(BALANCE.lunarBaseCost);
      this.lunarBaseBtnMoney.style.color = moneyMet ? '' : 'var(--accent-red)';
      this.lunarBaseBtnLabor.textContent = '+ ' + formatNumber(BALANCE.lunarBaseLaborCost) + ' labor';
      this.lunarBaseBtnLabor.style.color = laborMet ? '' : 'var(--accent-red)';
      this.lunarBaseBtnCode.textContent = '+ ' + formatNumber(BALANCE.lunarBaseCodeCost) + ' code';
      this.lunarBaseBtnCode.style.color = codeMet ? '' : 'var(--accent-red)';
      this.lunarBaseBtn.disabled = !moneyMet || !laborMet || !codeMet;
    } else {
      // Show built content
      this.lunarBaseBtn.style.display = 'none';
      this.lunarBaseBuilt.style.display = '';

      // Robots
      this.lunarRobotInfo.textContent = 'Lunar robots: ' + formatNumber(state.lunarRobots);
      const lrNum = Math.floor(fromBigInt(state.lunarRobots));
      this.lunarRobotBulk.update(lrNum, (amt) => {
        const amtB = toBigInt(amt);
        return state.robots >= amtB && state.funds >= mulB(amtB, BALANCE.lunarRobotTransferCost);
      });

      // GPUs
      this.lunarGPUInfo.textContent = 'Lunar GPUs: ' + formatNumber(state.lunarGPUs);
      const lgNum = Math.floor(fromBigInt(state.lunarGPUs));
      this.lunarGPUBulk.update(lgNum, (amt) => {
        const amtB = toBigInt(amt);
        return state.gpuCount >= amtB && state.funds >= mulB(amtB, BALANCE.lunarGPUTransferCost);
      });

      // Power
      this.lunarPowerDemandEl.textContent = 'demand ' + formatMW(state.lunarPowerDemandMW);
      this.lunarPowerSupplyEl.textContent = 'supply ' + formatMW(state.lunarPowerSupplyMW);
      this.lunarPowerSupplyEl.style.color = state.lunarPowerSupplyMW >= state.lunarPowerDemandMW ? 'var(--accent-green)' : 'var(--accent-red)';

      if (state.lunarPowerThrottle < 1) {
        this.lunarThrottleEl.style.display = 'block';
        this.lunarThrottleEl.textContent = 'Lunar GPUs throttled to ' + Math.round(state.lunarPowerThrottle * 100) + '% — build lunar solar panels!';
      } else {
        this.lunarThrottleEl.style.display = 'none';
      }

      // Lunar solar panels
      this.lunarSolarInfo.textContent = 'Lunar solar: ' + formatNumber(state.lunarSolarPanels) + ' (' + formatMW(mulB(state.lunarSolarPanels, toBigInt(BALANCE.lunarSolarPanelMW))) + ')';
      const lsNum = Math.floor(fromBigInt(state.lunarSolarPanels));
      this.lunarSolarBulk.update(lsNum, (amt) => {
        const amtB = toBigInt(amt);
        return state.funds >= mulB(amtB, BALANCE.lunarSolarPanelCost);
      });

      // Mass driver
      this.massDriverEl.textContent = formatNumber(state.lunarMassDriverRate) + ' satellites/min';
    }
  }

  private updateMercury(state: GameState): void {
    const hasMercury = state.completedResearch.includes('spaceSystems3');
    this.mercurySection.style.display = state.completedResearch.includes('spaceSystems2') ? '' : 'none';
    if (!state.completedResearch.includes('spaceSystems2')) return;

    if (!hasMercury) {
      this.mercuryHint.style.display = '';
      this.mercuryContent.style.display = 'none';
      return;
    }

    this.mercuryHint.style.display = 'none';
    this.mercuryContent.style.display = '';

    if (!state.mercuryBase) {
      this.mercuryBaseBtn.style.display = '';
      this.mercuryBaseBuilt.style.display = 'none';
      const moneyMet = state.funds >= BALANCE.mercuryBaseCost;
      const laborMet = state.labor >= BALANCE.mercuryBaseLaborCost;
      const codeMet = state.code >= BALANCE.mercuryBaseCodeCost;
      this.mercuryBaseBtnMoney.textContent = formatMoney(BALANCE.mercuryBaseCost);
      this.mercuryBaseBtnMoney.style.color = moneyMet ? '' : 'var(--accent-red)';
      this.mercuryBaseBtnLabor.textContent = '+ ' + formatNumber(BALANCE.mercuryBaseLaborCost) + ' labor';
      this.mercuryBaseBtnLabor.style.color = laborMet ? '' : 'var(--accent-red)';
      this.mercuryBaseBtnCode.textContent = '+ ' + formatNumber(BALANCE.mercuryBaseCodeCost) + ' code';
      this.mercuryBaseBtnCode.style.color = codeMet ? '' : 'var(--accent-red)';
      this.mercuryBaseBtn.disabled = !moneyMet || !laborMet || !codeMet;
    } else {
      this.mercuryBaseBtn.style.display = 'none';
      this.mercuryBaseBuilt.style.display = '';

      // Robots
      this.mercuryRobotInfo.textContent = 'Mercury robots: ' + formatNumber(state.mercuryRobots);
      const mrNum = Math.floor(fromBigInt(state.mercuryRobots));
      this.mercuryRobotBulk.update(mrNum, (amt) => {
        const amtB = toBigInt(amt);
        return state.robots >= amtB && state.funds >= mulB(amtB, BALANCE.mercuryRobotTransferCost);
      });

      // Mining rate
      this.mercuryMiningEl.textContent = formatNumber(state.mercuryMiningRate) + '/min';
    }
  }
}
