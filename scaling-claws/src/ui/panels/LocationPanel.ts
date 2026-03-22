import type { GameState, LocationId } from '../../game/GameState.ts';
import type { Panel } from '../PanelManager.ts';
import { UI_EMOJI } from '../emoji.ts';
import { SpaceEnergyPanel } from './SpaceEnergyPanel.ts';
import { SupplyPanel } from './SupplyPanel.ts';

type PlanetLocation = Extract<LocationId, 'moon' | 'mercury'>;

export class LocationPanel implements Panel {
  readonly el: HTMLElement;
  private readonly supplyPanel: SupplyPanel;
  private readonly spacePanel: SpaceEnergyPanel | null;

  constructor(state: GameState, location: PlanetLocation) {
    this.supplyPanel = new SupplyPanel(state, {
      fixedLocations: [location],
      showResources: true,
      sectionTitle: location === 'moon' ? null : 'Facilities',
      logisticsTitle: location === 'moon' ? `${UI_EMOJI.rockets} Launching` : null,
      showLocationHeaders: false,
      logisticsRoutes: location === 'moon' ? ['moonOrbit', 'moonMercury'] : [],
    });
    this.spacePanel = location === 'mercury'
      ? new SpaceEnergyPanel(state, 'Mining')
      : null;
    this.supplyPanel.el.classList.add('embedded-planet-panel');
    this.spacePanel?.el.classList.add('embedded-planet-panel');

    this.el = document.createElement('div');
    this.el.className = 'planet-tab-stack';
    this.el.appendChild(this.supplyPanel.el);
    if (this.spacePanel) {
      this.el.appendChild(this.spacePanel.el);
    }
  }

  update(state: GameState): void {
    this.supplyPanel.update(state);
    this.spacePanel?.update(state);
  }
}
