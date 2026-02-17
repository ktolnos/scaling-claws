import type { GameState } from '../../game/GameState.ts';
import type { Panel } from '../PanelManager.ts';
import { BALANCE } from '../../game/BalanceConfig.ts';
import { formatMoney, formatNumber, fromBigInt, toBigInt } from '../../game/utils.ts';
import { buildFacility } from '../../game/systems/SupplySystem.ts';
import { BulkBuyGroup } from '../components/BulkBuyGroup.ts';

interface ResourceRowRefs {
  info: HTMLSpanElement;
  income: HTMLSpanElement;
  expense: HTMLSpanElement;
}

interface FacilityRowRefs {
  info: HTMLSpanElement;
  buyGroup: BulkBuyGroup;
  rate: HTMLSpanElement;
  price: HTMLSpanElement;
  limit: HTMLSpanElement;
}

export class SupplyPanel implements Panel {
  readonly el: HTMLElement;
  private state: GameState;

  // Resource Refs
  private materialRefs!: ResourceRowRefs;
  private solarPanelRefs!: ResourceRowRefs;
  private robotRefs!: ResourceRowRefs;
  private gpuRefs!: ResourceRowRefs;
  private gpuSatelliteRefs!: ResourceRowRefs;
  private rocketRefs!: ResourceRowRefs;

  // Facility Refs
  private gpuFactoryRefs!: FacilityRowRefs;
  private solarFactoryRefs!: FacilityRowRefs;
  private robotFactoryRefs!: FacilityRowRefs;
  private rocketFactoryRefs!: FacilityRowRefs;
  private gpuSatelliteFactoryRefs!: FacilityRowRefs;
  private materialMineRefs!: FacilityRowRefs;

  // Containers
  private resourcesContainer!: HTMLDivElement;
  private facilitiesContainer!: HTMLDivElement;

  constructor(state: GameState) {
    this.state = state;
    this.el = document.createElement('div');
    this.el.className = 'panel';
    this.build();
  }

  private build(): void {
    const header = document.createElement('div');
    header.className = 'panel-header';
    header.textContent = 'SUPPLY CHAIN';
    this.el.appendChild(header);

    const body = document.createElement('div');
    body.className = 'panel-body';

    // Resources Section
    const resTitle = document.createElement('div');
    resTitle.className = 'panel-section-title';
    resTitle.textContent = 'RESOURCES';
    body.appendChild(resTitle);

    this.resourcesContainer = document.createElement('div');
    this.resourcesContainer.className = 'panel-section';
    this.resourcesContainer.style.display = 'grid';
    this.resourcesContainer.style.gridTemplateColumns = '1fr 1fr';
    this.resourcesContainer.style.columnGap = '16px';
    this.resourcesContainer.style.rowGap = '4px';

    this.materialRefs = this.buildResourceRow(this.resourcesContainer, 'Material');
    this.solarPanelRefs = this.buildResourceRow(this.resourcesContainer, 'Solar P.');
    this.robotRefs = this.buildResourceRow(this.resourcesContainer, 'Robots');
    this.gpuRefs = this.buildResourceRow(this.resourcesContainer, 'GPUs');
    this.gpuSatelliteRefs = this.buildResourceRow(this.resourcesContainer, 'GPU Sats');
    this.rocketRefs = this.buildResourceRow(this.resourcesContainer, 'Rockets');

    body.appendChild(this.resourcesContainer);
    body.appendChild(this.createDivider());

    // Facilities Section
    const facTitle = document.createElement('div');
    facTitle.className = 'panel-section-title';
    facTitle.textContent = 'PRODUCTION FACILITIES';
    body.appendChild(facTitle);

    this.facilitiesContainer = document.createElement('div');
    this.facilitiesContainer.className = 'panel-section';

    this.gpuFactoryRefs = this.buildFacilityRow(this.facilitiesContainer, 'GPU Factory', (amt) => buildFacility(this.state, 'gpuFactory', amt));
    this.solarFactoryRefs = this.buildFacilityRow(this.facilitiesContainer, 'Solar Factory', (amt) => buildFacility(this.state, 'solarFactory', amt));
    this.robotFactoryRefs = this.buildFacilityRow(this.facilitiesContainer, 'Robot Factory', (amt) => buildFacility(this.state, 'robotFactory', amt));
    this.rocketFactoryRefs = this.buildFacilityRow(this.facilitiesContainer, 'Rocket Factory', (amt) => buildFacility(this.state, 'rocketFactory', amt));
    this.gpuSatelliteFactoryRefs = this.buildFacilityRow(this.facilitiesContainer, 'Satellite Factory', (amt) => buildFacility(this.state, 'gpuSatelliteFactory', amt));
    this.materialMineRefs = this.buildFacilityRow(this.facilitiesContainer, 'Material Mine', (amt) => buildFacility(this.state, 'materialMine', amt));

    body.appendChild(this.facilitiesContainer);
    this.el.appendChild(body);
  }

  private buildResourceRow(parent: HTMLElement, labelText: string): ResourceRowRefs {
    const container = document.createElement('div');
    container.style.display = 'flex';
    container.style.alignItems = 'baseline';
    container.style.justifyContent = 'space-between';
    container.style.fontSize = '0.9rem';
    container.style.whiteSpace = 'nowrap';
    
    // Left: Label + Value
    const left = document.createElement('div');
    
    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = labelText + ': ';
    label.style.marginRight = '6px';
    label.style.color = 'var(--text-muted)';
    left.appendChild(label);

    const info = document.createElement('span');
    info.className = 'value';
    info.style.fontWeight = 'bold';
    left.appendChild(info);

    container.appendChild(left);

    // Right: Income + Expense
    const right = document.createElement('div');
    right.style.display = 'flex';
    right.style.gap = '6px';
    right.style.fontSize = '0.8rem';

    const income = document.createElement('span');
    income.style.color = 'var(--accent-green)';
    right.appendChild(income);

    const expense = document.createElement('span');
    expense.style.color = 'var(--accent-red)';
    right.appendChild(expense);

    container.appendChild(right);

    parent.appendChild(container);
    return { info, income, expense };
  }

  private buildFacilityRow(parent: HTMLElement, labelText: string, onAction: (amt: number) => void): FacilityRowRefs {
    const container = document.createElement('div');
    container.className = 'panel-row';
    container.style.display = 'flex';
    container.style.alignItems = 'flex-start'; // Align top
    container.style.justifyContent = 'space-between';
    container.style.marginBottom = '8px';
    container.style.padding = '2px 0'; // Tighter vertical spacing

    // --- Left Wrapper: Label, Info, Efficiency ---
    const leftWrapper = document.createElement('div');
    leftWrapper.style.display = 'flex';
    leftWrapper.style.flexDirection = 'column';
    leftWrapper.style.gap = '2px';

    // Top: Label + Count + Limit
    const headerLine = document.createElement('div');
    headerLine.style.display = 'flex';
    headerLine.style.alignItems = 'baseline';
    headerLine.style.gap = '8px';

    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = labelText;
    headerLine.appendChild(label);

    const infoGroup = document.createElement('div');
    infoGroup.style.display = 'flex';
    infoGroup.style.gap = '4px';
    infoGroup.style.alignItems = 'baseline';

    const info = document.createElement('span');
    info.className = 'value';
    info.style.fontWeight = 'bold';
    infoGroup.appendChild(info);

    const limit = document.createElement('span');
    limit.className = 'value';
    limit.style.fontSize = '0.75rem';
    infoGroup.appendChild(limit);

    headerLine.appendChild(infoGroup);
    leftWrapper.appendChild(headerLine);

    // Bottom: Efficiency (Rate)
    const rate = document.createElement('div');
    rate.style.fontSize = '0.72rem';
    rate.style.color = 'var(--text-muted)';
    leftWrapper.appendChild(rate);

    container.appendChild(leftWrapper);

    // --- Right Wrapper: Buy Buttons + Price ---
    const rightWrapper = document.createElement('div');
    rightWrapper.style.display = 'flex';
    rightWrapper.style.flexDirection = 'column';
    rightWrapper.style.alignItems = 'flex-end'; // Align to right
    rightWrapper.style.gap = '2px';

    const buyGroup = new BulkBuyGroup(onAction, '+');
    rightWrapper.appendChild(buyGroup.el);

    const price = document.createElement('div');
    price.style.fontSize = '0.70rem';
    price.style.color = 'var(--text-muted)';
    price.style.textAlign = 'right';
    rightWrapper.appendChild(price);

    container.appendChild(rightWrapper);

    parent.appendChild(container);
    return { info, rate, limit, buyGroup, price };
  }

  private createDivider(): HTMLHRElement {
    const hr = document.createElement('hr');
    hr.className = 'panel-divider';
    return hr;
  }

  update(state: GameState): void {
    this.state = state;
    
    // Visibility Check
    // "Unlock supply chain panel if any of the corresponding technologies are researched."
    const techs = ['materialProcessing', 'solarTechnology', 'robotics1', 'chipManufacturing', 'rocketry', 'orbitalLogistics'];
    const hasSupplyTech = techs.some(t => state.completedResearch.includes(t));
    
    if (!hasSupplyTech) {
        this.el.style.display = 'none';
        return;
    }
    this.el.style.display = '';

    // Update Resources
    // Update Resources
    // Update Resources
    this.updateResource(this.materialRefs, state.material, state.materialProductionPerMin, state.materialConsumptionPerMin);
    this.updateResource(this.solarPanelRefs, state.solarPanels, state.solarPanelProductionPerMin, state.solarPanelConsumptionPerMin);
    this.updateResource(this.robotRefs, state.robots, state.robotProductionPerMin, state.robotConsumptionPerMin);
    this.updateResource(this.gpuRefs, state.gpuCount, state.gpuProductionPerMin, state.gpuConsumptionPerMin);
    this.updateResource(this.gpuSatelliteRefs, state.gpuSatellites, state.gpuSatelliteProductionPerMin, state.gpuSatelliteConsumptionPerMin);
    this.updateResource(this.rocketRefs, state.rockets, state.rocketProductionPerMin, state.rocketConsumptionPerMin);

    // Update Facilities
    // Update Facilities
    // Logic for status reasons
    const noMaterial = state.material < toBigInt(10) ? 'No Material' : ''; // Heuristic check
    
    // Solar: Material
    let solarStatus = '';
    if (state.solarFactories > 0n && state.solarFactoryRate < 1.0) {
        if (state.material < toBigInt(10)) solarStatus = 'No Material';
    }

    let satStatus = '';
    if (state.gpuSatelliteFactories > 0n && state.gpuSatelliteFactoryRate < 1.0) {
        if (state.material < toBigInt(500)) satStatus = 'No Material';
        else if (state.gpuCount < toBigInt(10)) satStatus = 'No GPU';
    }

    this.updateFacility(this.gpuFactoryRefs, state.gpuFactories, BALANCE.gpuFactoryCost, BALANCE.gpuFactoryLaborCost, BALANCE.gpuFactoryLimit, state.gpuFactoryRate, noMaterial);
    this.updateFacility(this.solarFactoryRefs, state.solarFactories, BALANCE.solarFactoryCost, BALANCE.solarFactoryLaborCost, BALANCE.solarFactoryLimit, state.solarFactoryRate, solarStatus);
    this.updateFacility(this.robotFactoryRefs, state.robotFactories, BALANCE.robotFactoryCost, BALANCE.robotFactoryLaborCost, BALANCE.robotFactoryLimit, state.robotFactoryRate, noMaterial);
    this.updateFacility(this.rocketFactoryRefs, state.rocketFactories, BALANCE.rocketFactoryCost, BALANCE.rocketFactoryLaborCost, BALANCE.rocketFactoryLimit, state.rocketFactoryRate, noMaterial);
    this.updateFacility(this.gpuSatelliteFactoryRefs, state.gpuSatelliteFactories, BALANCE.gpuSatelliteFactoryCost, BALANCE.gpuSatelliteFactoryLaborCost, BALANCE.gpuSatelliteFactoryLimit, state.gpuSatelliteFactoryRate, satStatus);
    this.updateFacility(this.materialMineRefs, state.materialMines, BALANCE.materialMineCost, BALANCE.materialMineLaborCost, BALANCE.materialMineLimit, state.materialMineRate, '');
  }

  private updateResource(refs: ResourceRowRefs, current: bigint, income: bigint, expense: bigint) {
    refs.info.textContent = formatNumber(current);
    refs.income.textContent = income > 0n ? `+${formatNumber(income)}/m` : '';
    refs.expense.textContent = expense > 0n ? `-${formatNumber(expense)}/m` : '';
  }

  private updateFacility(
      refs: FacilityRowRefs,
      current: bigint, cost: bigint, laborCost: bigint, limit: number, efficiency: number,
      statusReason: string = ''
  ) {
    refs.info.textContent = formatNumber(current);
    
    // Limit check
    if (current >= toBigInt(limit)) {
        refs.limit.textContent = '/ MAX';
        refs.limit.style.color = 'var(--accent-red)';
    } else {
        refs.limit.textContent = `/ ${limit}`;
        refs.limit.style.color = 'var(--text-muted)';
    }

    // Rate efficiency
    /*
    const pct = Math.round(efficiency * 100);
    refs.rate.textContent = `Efficiency: ${pct}%`;
    if (pct >= 99) refs.rate.style.color = 'var(--accent-green)';
    else if (pct >= 50) refs.rate.style.color = 'var(--accent-yellow)';
    else refs.rate.style.color = 'var(--accent-red)';
    */
    // Wait, showing price AND efficiency?
    // Let's show efficiency.
    const costTxt = `${formatMoney(cost)} + ${formatNumber(laborCost)} labor`;
    refs.price.textContent = costTxt;

    // Rate efficiency
    if (current === 0n) {
        refs.rate.style.display = 'none';
    } else {
        refs.rate.style.display = '';
        const pct = Math.round(efficiency * 100);
        
        let statusText = `Running: ${pct}%`;
        let color = 'var(--accent-green)'; // >= 50%
        
        if (pct === 0) {
            color = 'var(--accent-red)';
            if (statusReason) statusText = statusReason; // Override "Running: 0%" with reason
            else statusText = 'Stopped';
        } else if (pct < 50) {
            color = 'var(--accent-gold)'; // Yellowish
        }

        refs.rate.textContent = statusText;
        refs.rate.style.color = color;
    }
    
    refs.buyGroup.update(Math.floor(fromBigInt(current)), (amt) => {
        const costOk = this.state.funds >= BigInt(amt) * cost;
        const laborOk = this.state.labor >= BigInt(amt) * laborCost;
        const limitOk = (current + toBigInt(amt)) <= toBigInt(limit);
        return costOk && laborOk && limitOk;
    });
  }
}
