import type { GameState } from '../../game/GameState.ts';
import type { Panel } from '../PanelManager.ts';
import { BALANCE } from '../../game/BalanceConfig.ts';
import { formatMoney, formatNumber, formatMW, fromBigInt, mulB, toBigInt, scaleBigInt } from '../../game/utils.ts';
import { buyGridPower, sellGridPower, buyGasPlant, buyNuclearPlant } from '../../game/systems/EnergySystem.ts';
import { 
  launchSatellite, buildLunarBase, launchLunarPayload, buildMoonFacility, buildMercuryBase 
} from '../../game/systems/SpaceSystem.ts';
import { BulkBuyGroup } from '../components/BulkBuyGroup.ts';

interface PlantRowRefs {
  row: HTMLDivElement;
  info: HTMLSpanElement;
  btn: HTMLButtonElement;
  btnMoney: HTMLSpanElement;
  btnLabor: HTMLSpanElement;
}

export class SpaceEnergyPanel implements Panel {
  readonly el: HTMLElement;
  private state: GameState;

  // Energy
  private demandEl!: HTMLSpanElement;
  private supplyEl!: HTMLSpanElement;
  private throttleEl!: HTMLDivElement;
  private gridEl!: HTMLSpanElement;
  private gridBuyGroup!: BulkBuyGroup;
  private gridSellGroup!: BulkBuyGroup;
  private gasRow!: PlantRowRefs;
  private nuclearRow!: PlantRowRefs;
  private solarInfoRow!: HTMLDivElement;
  private solarInfoEl!: HTMLSpanElement;

  // Space
  private spaceSection!: HTMLDivElement;
  private satInfo!: HTMLSpanElement;
  private satBulk!: BulkBuyGroup;
  private orbitalPowerEl!: HTMLSpanElement;

  // Lunar
  private lunarSection!: HTMLDivElement;
  private lunarContent!: HTMLDivElement;
  private lunarBaseBtn!: HTMLButtonElement;
  private lunarBaseBtnMoney!: HTMLSpanElement;
  
  // Launchers
  private lunarRobotBulk!: BulkBuyGroup;
  private lunarSolarBulk!: BulkBuyGroup;
  private lunarGPUBulk!: BulkBuyGroup;
  
  // Builders
  private lunarMineBulk!: BulkBuyGroup;
  private lunarFacBulk!: BulkBuyGroup;
  private lunarSolarFacBulk!: BulkBuyGroup;
  private lunarMassDriverBulk!: BulkBuyGroup;
  
  // Display
  private lunarRobotsInfo!: HTMLSpanElement;
  private lunarSolarInfo!: HTMLSpanElement;
  private lunarGPUsInfo!: HTMLSpanElement;
  private lunarMinesInfo!: HTMLSpanElement;
  private lunarFacInfo!: HTMLSpanElement;
  private lunarSolarFacInfo!: HTMLSpanElement;
  private lunarMassDriverInfo!: HTMLSpanElement;
  private lunarMaterialsInfo!: HTMLSpanElement;
  private lunarPowerInfo!: HTMLSpanElement;

  // Mercury
  private mercurySection!: HTMLDivElement;
  private mercuryContent!: HTMLDivElement;
  private mercuryBaseBtn!: HTMLButtonElement;
  private mercuryBaseBtnMoney!: HTMLSpanElement;
  
  private mercuryMiningInfo!: HTMLSpanElement;
  private mercuryMinedMassInfo!: HTMLSpanElement;

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

    this.buildEnergySection(body);
    body.appendChild(this.createDivider());
    this.buildSpaceSection(body);
    this.buildLunarSection(body);
    this.buildMercurySection(body);

    this.el.appendChild(body);
  }

  private buildEnergySection(body: HTMLElement): void {
    const title = document.createElement('div');
    title.className = 'panel-section-title';
    title.textContent = 'EARTH ENERGY';
    body.appendChild(title);

    // Demand / Supply lines...
    const dRow = document.createElement('div');
    dRow.className = 'panel-row';
    this.demandEl = document.createElement('span');
    dRow.appendChild(document.createTextNode('Demand: ')); dRow.appendChild(this.demandEl);
    body.appendChild(dRow);
    
    const sRow = document.createElement('div');
    sRow.className = 'panel-row';
    this.supplyEl = document.createElement('span');
    sRow.appendChild(document.createTextNode('Supply: ')); sRow.appendChild(this.supplyEl);
    body.appendChild(sRow);

    this.throttleEl = document.createElement('div');
    this.throttleEl.className = 'warning-text';
    this.throttleEl.style.display = 'none';
    body.appendChild(this.throttleEl);

    // Grid
    const gRow = document.createElement('div');
    gRow.className = 'panel-row';
    gRow.appendChild(document.createTextNode('Grid: '));
    this.gridEl = document.createElement('span');
    gRow.appendChild(this.gridEl);
    this.gridBuyGroup = new BulkBuyGroup((amt) => buyGridPower(this.state, amt), '+');
    this.gridSellGroup = new BulkBuyGroup((amt) => sellGridPower(this.state, amt), '-');
    gRow.appendChild(this.gridSellGroup.el);
    gRow.appendChild(this.gridBuyGroup.el);
    body.appendChild(gRow);
    
    // Plants
    this.gasRow = this.buildPlantRow(body, () => buyGasPlant(this.state));
    this.nuclearRow = this.buildPlantRow(body, () => buyNuclearPlant(this.state));
    
    this.solarInfoRow = document.createElement('div');
    this.solarInfoRow.className = 'panel-row';
    this.solarInfoEl = document.createElement('span');
    this.solarInfoRow.appendChild(this.solarInfoEl);
    body.appendChild(this.solarInfoRow);
  }

  private buildPlantRow(parent: HTMLElement, onClick: () => void): PlantRowRefs {
     const row = document.createElement('div');
     row.className = 'panel-row';
     const info = document.createElement('span');
     row.appendChild(info);
     const btn = document.createElement('button');
     btn.textContent = 'Build';
     const btnMoney = document.createElement('span');
     const btnLabor = document.createElement('span');
     btn.appendChild(btnMoney); btn.appendChild(btnLabor);
     btn.addEventListener('click', onClick);
     row.appendChild(btn);
     parent.appendChild(row);
     return { row, info, btn, btnMoney, btnLabor };
  }

  private buildSpaceSection(body: HTMLElement): void {
     this.spaceSection = document.createElement('div');
     const title = document.createElement('div');
     title.className = 'panel-section-title';
     title.textContent = 'ORBIT';
     this.spaceSection.appendChild(title);

     // Launch Satellites
     const satRow = document.createElement('div');
     satRow.className = 'panel-row';
     this.satInfo = document.createElement('span');
     satRow.appendChild(this.satInfo);
     this.satBulk = new BulkBuyGroup((amt) => launchSatellite(this.state, amt), 'Launch');
     satRow.appendChild(this.satBulk.el);
     this.spaceSection.appendChild(satRow);
     
     this.orbitalPowerEl = document.createElement('span');
     this.spaceSection.appendChild(this.orbitalPowerEl);

     body.appendChild(this.spaceSection);
  }

  private buildLunarSection(body: HTMLElement): void {
    this.lunarSection = document.createElement('div');
    this.lunarSection.appendChild(this.createDivider());
    const title = document.createElement('div');
    title.className = 'panel-section-title';
    title.textContent = 'LUNAR';
    this.lunarSection.appendChild(title);
    
    this.lunarBaseBtn = document.createElement('button');
    this.lunarBaseBtn.textContent = 'Build Lunar Base';
    this.lunarBaseBtnMoney = document.createElement('span');
    this.lunarBaseBtn.appendChild(this.lunarBaseBtnMoney);
    this.lunarBaseBtn.addEventListener('click', () => buildLunarBase(this.state));
    this.lunarSection.appendChild(this.lunarBaseBtn);

    this.lunarContent = document.createElement('div');
    
    // Status
    const statusRow = document.createElement('div');
    statusRow.className = 'panel-row';
    this.lunarPowerInfo = document.createElement('span');
    statusRow.appendChild(this.lunarPowerInfo);
    this.lunarContent.appendChild(statusRow);
    
    const matRow = document.createElement('div');
    matRow.className = 'panel-row';
    this.lunarMaterialsInfo = document.createElement('span');
    matRow.appendChild(this.lunarMaterialsInfo);
    this.lunarContent.appendChild(matRow);

    // Launchers
    const lr = this.addLaunchRow(this.lunarContent, 'Launch Robot', (amt) => launchLunarPayload(this.state, 'robot', amt));
    this.lunarRobotBulk = lr.group; this.lunarRobotsInfo = lr.info;
    
    const ls = this.addLaunchRow(this.lunarContent, 'Launch Solar', (amt) => launchLunarPayload(this.state, 'solar', amt));
    this.lunarSolarBulk = ls.group; this.lunarSolarInfo = ls.info;
    
    const lg = this.addLaunchRow(this.lunarContent, 'Launch GPU', (amt) => launchLunarPayload(this.state, 'gpu', amt));
    this.lunarGPUBulk = lg.group; this.lunarGPUsInfo = lg.info;
    
    // Builders
    const lm = this.addBuildRow(this.lunarContent, 'Build Mine', (amt) => buildMoonFacility(this.state, 'mine', amt));
    this.lunarMineBulk = lm.group; this.lunarMinesInfo = lm.info;
    
    const lf = this.addBuildRow(this.lunarContent, 'Build GPU Factory', (amt) => buildMoonFacility(this.state, 'gpuFactory', amt));
    this.lunarFacBulk = lf.group; this.lunarFacInfo = lf.info;
    
    const lsf = this.addBuildRow(this.lunarContent, 'Build Solar Factory', (amt) => buildMoonFacility(this.state, 'solarFactory', amt));
    this.lunarSolarFacBulk = lsf.group; this.lunarSolarFacInfo = lsf.info;
    
    const lmd = this.addBuildRow(this.lunarContent, 'Build Mass Driver', (amt) => buildMoonFacility(this.state, 'massDriver', amt));
    this.lunarMassDriverBulk = lmd.group; this.lunarMassDriverInfo = lmd.info;
    
    this.lunarSection.appendChild(this.lunarContent);
    body.appendChild(this.lunarSection);
  }

  private addLaunchRow(parent: HTMLElement, label: string, action: (amt: number) => void) {
     const row = document.createElement('div');
     row.className = 'panel-row';
     const lbl = document.createElement('span');
     lbl.textContent = label;
     row.appendChild(lbl);
     
     const info = document.createElement('span');
     info.className = 'value';
     row.appendChild(info);
     
     const group = new BulkBuyGroup(action, 'Launch');
     row.appendChild(group.el);
     parent.appendChild(row);
     return {group, info};
  }
  
  private addBuildRow(parent: HTMLElement, label: string, action: (amt: number) => void) {
     const row = document.createElement('div');
     row.className = 'panel-row';
     const lbl = document.createElement('span');
     lbl.textContent = label;
     row.appendChild(lbl);
     
     const info = document.createElement('span');
     info.className = 'value';
     row.appendChild(info);
     
     const group = new BulkBuyGroup(action, 'Build');
     row.appendChild(group.el);
     parent.appendChild(row);
     return {group, info};
  }

  private buildMercurySection(body: HTMLElement): void {
     this.mercurySection = document.createElement('div');
     this.mercurySection.appendChild(this.createDivider());
     const title = document.createElement('div');
     title.className = 'panel-section-title';
     title.textContent = 'MERCURY';
     this.mercurySection.appendChild(title);
     
     this.mercuryBaseBtn = document.createElement('button');
     this.mercuryBaseBtn.textContent = 'Build Mercury Base';
     this.mercuryBaseBtnMoney = document.createElement('span');
     this.mercuryBaseBtn.appendChild(this.mercuryBaseBtnMoney);
     this.mercuryBaseBtn.addEventListener('click', () => buildMercuryBase(this.state));
     this.mercurySection.appendChild(this.mercuryBaseBtn);
     
     this.mercuryContent = document.createElement('div');
     
     const mmRow = document.createElement('div');
     mmRow.className = 'panel-row';
     this.mercuryMiningInfo = document.createElement('span');
     mmRow.appendChild(this.mercuryMiningInfo);
     this.mercuryContent.appendChild(mmRow);
     
     const progRow = document.createElement('div');
     progRow.className = 'panel-row';
     this.mercuryMinedMassInfo = document.createElement('span');
     progRow.appendChild(this.mercuryMinedMassInfo);
     this.mercuryContent.appendChild(progRow);
     
     this.mercurySection.appendChild(this.mercuryContent);
     
     body.appendChild(this.mercurySection);
  }
  
  private createDivider(): HTMLHRElement {
    const hr = document.createElement('hr');
    hr.className = 'panel-divider';
    return hr;
  }

  update(state: GameState): void {
    this.state = state;
    
    // Energy Update (Minimal)
    this.demandEl.textContent = formatMW(state.powerDemandMW);
    this.supplyEl.textContent = formatMW(state.powerSupplyMW);
    if (!state.completedResearch.includes('orbitalLogistics')) {
        this.spaceSection.style.display = 'none';
        this.lunarSection.style.display = 'none';
        this.mercurySection.style.display = 'none';
        return;
    }
    this.spaceSection.style.display = '';
    
    // Satellites
    this.satInfo.textContent = `Deployed Sats: ${formatNumber(state.satellites)}`;
    this.satBulk.update(1, (amt) => state.gpuSatellites >= BigInt(amt) && state.rockets >= 1n); 
    
    this.orbitalPowerEl.textContent = `Orbital Power: ${formatMW(state.orbitalPowerMW)}`;
    
    // Lunar
    if (state.completedResearch.includes('spaceSystems2')) {
        this.lunarSection.style.display = '';
        if (!state.lunarBase) {
            this.lunarContent.style.display = 'none';
            this.lunarBaseBtn.style.display = '';
            this.lunarBaseBtn.disabled = state.funds < BALANCE.lunarBaseCost;
            this.lunarBaseBtnMoney.textContent = `(${formatMoney(BALANCE.lunarBaseCost)})`;
        } else {
            this.lunarContent.style.display = '';
            this.lunarBaseBtn.style.display = 'none';
            
            this.lunarPowerInfo.textContent = `Power: ${formatMW(state.lunarPowerSupplyMW)} / ${formatMW(state.lunarPowerDemandMW)}`;
            this.lunarMaterialsInfo.textContent = `Materials: ${formatNumber(state.moonMaterials)}`;
            
            // Updates for bulk groups...
            this.lunarRobotsInfo.textContent = `Robots: ${formatNumber(state.lunarRobots)}`;
            this.lunarRobotBulk.update(1, (amt) => state.robots >= BigInt(amt) && state.rockets >= 1n);
            
            this.lunarSolarInfo.textContent = `Solar: ${formatNumber(state.lunarSolarPanels)}`;
            this.lunarSolarBulk.update(1, (amt) => state.solarPanels >= BigInt(amt) && state.rockets >= 1n);
            
            this.lunarGPUsInfo.textContent = `GPUs: ${formatNumber(state.lunarGPUs)}`;
            this.lunarGPUBulk.update(1, (amt) => state.gpuCount >= BigInt(amt) && state.rockets >= 1n);
            
            // Builders
            this.lunarMinesInfo.textContent = `Mines: ${formatNumber(state.moonMines)}`;
            this.lunarMineBulk.update(1, (amt) => state.funds >= mulB(toBigInt(amt), toBigInt(5_000_000))); // Hardcoded cost from SpaceSystem.ts
            
            this.lunarFacInfo.textContent = `GPU Fac: ${formatNumber(state.moonGpuFactories)}`;
            this.lunarFacBulk.update(1, (amt) => state.funds >= mulB(toBigInt(amt), toBigInt(20_000_000)));
            
            this.lunarSolarFacInfo.textContent = `Solar Fac: ${formatNumber(state.moonSolarFactories)}`;
            this.lunarSolarFacBulk.update(1, (amt) => state.funds >= mulB(toBigInt(amt), toBigInt(20_000_000)));
            
            this.lunarMassDriverInfo.textContent = `Mass Dr: ${formatNumber(state.moonMassDrivers)}`;
            this.lunarMassDriverBulk.update(1, (amt) => state.funds >= mulB(toBigInt(amt), toBigInt(50_000_000)));
        }
    } else {
        this.lunarSection.style.display = 'none';
    }
    
    // Mercury
    if (state.completedResearch.includes('spaceSystems3')) {
        this.mercurySection.style.display = '';
        if (!state.mercuryBase) {
            this.mercuryContent.style.display = 'none';
            this.mercuryBaseBtn.style.display = '';
            this.mercuryBaseBtn.disabled = state.funds < BALANCE.mercuryBaseCost;
            this.mercuryBaseBtnMoney.textContent = `(${formatMoney(BALANCE.mercuryBaseCost)})`;
        } else {
            this.mercuryContent.style.display = '';
            this.mercuryBaseBtn.style.display = 'none';
            
            this.mercuryMiningInfo.textContent = `Mining Rate: ${formatNumber(state.mercuryMiningRate)}/min`;
            this.mercuryMinedMassInfo.textContent = `Mined Mass: ${formatNumber(state.mercuryMassMined)}`;
        }
    } else {
        this.mercurySection.style.display = 'none';
    }
  }
}
