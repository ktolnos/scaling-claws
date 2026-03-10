import type { GameState, LocationId } from '../../game/GameState.ts';
import type { Panel } from '../PanelManager.ts';
import { ResourcesPanel } from './ResourcesPanel.ts';
import { SpaceEnergyPanel } from './SpaceEnergyPanel.ts';
import { SupplyPanel } from './SupplyPanel.ts';

type PlanetLocation = Extract<LocationId, 'moon' | 'mercury'>;

export class LocationPanel implements Panel {
  readonly el: HTMLElement;
  private readonly resourcesPanel: ResourcesPanel;
  private readonly supplyPanel: SupplyPanel;
  private readonly spacePanel: SpaceEnergyPanel | null;

  constructor(state: GameState, location: PlanetLocation) {
    this.resourcesPanel = new ResourcesPanel(state, {
      includeCore: false,
      fixedLocations: [location],
      showRestart: false,
      supplyTitle: 'Resources',
      showLocationHeaders: false,
    });
    this.supplyPanel = new SupplyPanel(state, {
      fixedLocations: [location],
      showResources: false,
      sectionTitle: 'Facilities',
      logisticsTitle: location === 'moon' ? 'Launching' : null,
      showLocationHeaders: false,
      logisticsRoutes: location === 'moon' ? ['moonOrbit', 'moonMercury'] : [],
    });
    this.spacePanel = location === 'mercury'
      ? new SpaceEnergyPanel(
        state,
        location,
        location,
        'Mining',
      )
      : null;
    this.resourcesPanel.el.classList.add('embedded-planet-panel');
    this.supplyPanel.el.classList.add('embedded-planet-panel');
    this.spacePanel?.el.classList.add('embedded-planet-panel');

    this.el = document.createElement('div');
    this.el.className = 'planet-tab-stack';
    this.el.appendChild(this.resourcesPanel.el);
    this.el.appendChild(this.supplyPanel.el);
    if (this.spacePanel) {
      this.el.appendChild(this.spacePanel.el);
    }
  }

  update(state: GameState): void {
    this.resourcesPanel.update(state);
    this.supplyPanel.update(state);
    this.spacePanel?.update(state);
  }
}
