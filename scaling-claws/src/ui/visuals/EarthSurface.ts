import type { GameState } from '../../game/GameState.ts';
import {
  datacenterBuildingSvg, gasPlantSvg, nuclearPlantSvg, solarFarmSvg,
  rocketSiloSvg, robotFactorySvg, siliconMineSvg, waferFabSvg,
} from '../../assets/sprites.ts';

type ZoomLevel = 'zoom-1' | 'zoom-2' | 'zoom-3' | 'zoom-4';

interface BuildingEntry {
  type: string;
  el: HTMLDivElement;
}

export class EarthSurface {
  private container: HTMLElement;
  private stageEl: HTMLDivElement;
  private surfaceContainer!: HTMLDivElement;
  private buildingsArea!: HTMLDivElement;
  private currentZoom: ZoomLevel = 'zoom-1';
  private buildings: BuildingEntry[] = [];
  private isVisible: boolean = false;

  // Track rendered counts to avoid DOM rebuild
  private renderedCounts = {
    datacenter: 0,
    gas: 0,
    nuclear: 0,
    solar: 0,
    rocket: 0,
    robotFactory: 0,
    mine: 0,
    fab: 0,
  };

  constructor(container: HTMLElement) {
    this.container = container;
    this.stageEl = document.createElement('div');
    this.stageEl.className = 'visual-stage hidden';
    this.build();
    this.container.appendChild(this.stageEl);
  }

  private build(): void {
    // Sky gradient background
    const sky = document.createElement('div');
    sky.className = 'earth-surface-sky';
    this.stageEl.appendChild(sky);

    // Mountains backdrop (parallax layer)
    const mountains = document.createElement('div');
    mountains.className = 'earth-surface-mountains';
    this.stageEl.appendChild(mountains);

    // Surface container (gets zoomed)
    this.surfaceContainer = document.createElement('div');
    this.surfaceContainer.className = 'earth-surface-container';

    // Ground
    const ground = document.createElement('div');
    ground.className = 'earth-surface-ground';
    this.surfaceContainer.appendChild(ground);

    // Buildings area
    this.buildingsArea = document.createElement('div');
    this.buildingsArea.className = 'earth-surface-buildings';
    this.surfaceContainer.appendChild(this.buildingsArea);

    this.stageEl.appendChild(this.surfaceContainer);
  }

  update(state: GameState): void {
    const totalDCs = state.datacenters.reduce((a, b) => a + b, 0);
    const shouldShow = totalDCs >= 1;

    if (shouldShow && !this.isVisible) {
      this.stageEl.classList.remove('hidden');
      this.isVisible = true;
    } else if (!shouldShow && this.isVisible) {
      this.stageEl.classList.add('hidden');
      this.isVisible = false;
    }

    if (!this.isVisible) return;

    // Add new buildings (never remove — incremental game)
    this.syncBuildings(state, 'datacenter', totalDCs, datacenterBuildingSvg);
    this.syncBuildings(state, 'gas', state.gasPlants, gasPlantSvg);
    this.syncBuildings(state, 'nuclear', state.nuclearPlants, nuclearPlantSvg);
    this.syncBuildings(state, 'solar', state.solarFarms, solarFarmSvg);
    this.syncBuildings(state, 'rocket', state.rockets, rocketSiloSvg);
    this.syncBuildings(state, 'robotFactory', state.robotFactories, robotFactorySvg);
    this.syncBuildings(state, 'mine', state.siliconMines, siliconMineSvg);
    this.syncBuildings(state, 'fab', state.waferFabs, waferFabSvg);

    // Update zoom level based on total building count
    const totalBuildings = this.buildings.length;
    let targetZoom: ZoomLevel = 'zoom-1';
    if (totalBuildings >= 12) targetZoom = 'zoom-4';
    else if (totalBuildings >= 8) targetZoom = 'zoom-3';
    else if (totalBuildings >= 4) targetZoom = 'zoom-2';

    if (targetZoom !== this.currentZoom) {
      this.surfaceContainer.classList.remove(this.currentZoom);
      this.surfaceContainer.classList.add(targetZoom);
      this.currentZoom = targetZoom;
    }
  }

  private syncBuildings(_state: GameState, type: keyof typeof this.renderedCounts, count: number, svg: string): void {
    const current = this.renderedCounts[type];
    // Cap visual buildings at a reasonable number
    const target = Math.min(count, 6);

    for (let i = current; i < target; i++) {
      const bldg = document.createElement('div');
      bldg.className = 'earth-surface-building building-enter';
      bldg.innerHTML = svg;
      // Position buildings in a row with slight random offset
      const xOffset = this.buildings.length * 60 + (Math.random() * 20 - 10);
      bldg.style.left = xOffset + 'px';
      this.buildingsArea.appendChild(bldg);
      this.buildings.push({ type, el: bldg });
    }

    this.renderedCounts[type] = target;
  }
}
