import type { GameState } from '../game/GameState.ts';

export interface Panel {
  readonly el: HTMLElement;
  update(state: GameState): void;
}

export interface TabMetadata {
  emoji: string;
  title: string;
}

export interface StaticPanelPlacement {
  kind: 'static';
  region: string;
}

export interface TabPanelPlacement {
  kind: 'tabs';
  tab: TabMetadata;
}

export type PanelPlacement = StaticPanelPlacement | TabPanelPlacement;

interface PanelSlot {
  id: string;
  panel: Panel;
  placement: PanelPlacement;
  tabButton?: HTMLButtonElement;
}

type GameStateWithUi = GameState & {
  openedTabs?: Record<string, boolean>;
  tabAlerts?: Record<string, boolean>;
  selectedTabId?: string | null;
};

export class PanelManager {
  private readonly tabsContainer: HTMLElement;
  private readonly staticContainers: Map<string, HTMLElement>;
  private readonly tabShell: HTMLDivElement;
  private readonly tabSelectorEl: HTMLDivElement;
  private readonly tabContentEl: HTMLDivElement;
  private currentState: GameState | null;
  private slots: PanelSlot[] = [];

  constructor(tabsContainer: HTMLElement, staticContainers: Record<string, HTMLElement> = {}, state: GameState | null = null) {
    this.tabsContainer = tabsContainer;
    this.staticContainers = new Map(Object.entries(staticContainers));
    this.currentState = state;

    this.tabsContainer.innerHTML = '';

    this.tabShell = document.createElement('div');
    this.tabShell.className = 'tabbed-panel-shell';

    this.tabSelectorEl = document.createElement('div');
    this.tabSelectorEl.className = 'tab-selector';
    this.tabShell.appendChild(this.tabSelectorEl);

    this.tabContentEl = document.createElement('div');
    this.tabContentEl.className = 'tab-content';
    this.tabShell.appendChild(this.tabContentEl);

    this.tabsContainer.appendChild(this.tabShell);
  }

  setState(state: GameState): void {
    this.currentState = state;
  }

  private getStateWithUi(): GameStateWithUi | null {
    if (!this.currentState) return null;
    return this.currentState as GameStateWithUi;
  }

  private getSelectedTabId(): string | null {
    const stateWithUi = this.getStateWithUi();
    return typeof stateWithUi?.selectedTabId === 'string' ? stateWithUi.selectedTabId : null;
  }

  private setSelectedTabId(id: string | null): void {
    const stateWithUi = this.getStateWithUi();
    if (!stateWithUi) return;
    stateWithUi.selectedTabId = id;
  }

  private getOpenedTabsMap(): Record<string, boolean> | null {
    const stateWithUi = this.getStateWithUi();
    if (!stateWithUi) {
      return null;
    }
    if (!stateWithUi.openedTabs) {
      stateWithUi.openedTabs = {};
    }
    return stateWithUi.openedTabs;
  }

  private getTabAlertsMap(): Record<string, boolean> | null {
    const stateWithUi = this.getStateWithUi();
    if (!stateWithUi) {
      return null;
    }
    if (!stateWithUi.tabAlerts) {
      stateWithUi.tabAlerts = {};
    }
    return stateWithUi.tabAlerts;
  }

  reset(): void {
    for (const slot of this.slots) {
      if (slot.placement.kind === 'tabs') {
        slot.panel.el.remove();
        slot.tabButton?.remove();
        continue;
      }

      const regionEl = this.staticContainers.get(slot.placement.region);
      if (regionEl && regionEl.contains(slot.panel.el)) {
        regionEl.removeChild(slot.panel.el);
      }
    }

    this.slots = [];
    this.tabSelectorEl.innerHTML = '';
    this.tabContentEl.innerHTML = '';
  }

  private applyTabMetadata(button: HTMLButtonElement, tab: TabMetadata): void {
    const emojiEl = button.querySelector<HTMLSpanElement>('.tab-selector-emoji');
    const titleEl = button.querySelector<HTMLSpanElement>('.tab-selector-title');
    if (!emojiEl || !titleEl) {
      return;
    }
    emojiEl.textContent = tab.emoji;
    titleEl.textContent = tab.title;
    button.title = tab.title;
    button.setAttribute('aria-label', tab.title);
  }

  private clearTabAttention(id: string): void {
    const openedTabs = this.getOpenedTabsMap();
    if (openedTabs) {
      openedTabs[id] = true;
    }
  }

  private shouldShowTabAttention(id: string, selected: boolean): boolean {
    if (selected) return false;
    const tabAlerts = this.getTabAlertsMap();
    if (tabAlerts?.[id] === true) {
      return true;
    }
    const openedTabs = this.getOpenedTabsMap();
    if (!openedTabs) return true;
    return openedTabs[id] !== true;
  }

  private createTabButton(id: string, tab: TabMetadata): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tab-selector-btn';

    const emojiEl = document.createElement('span');
    emojiEl.className = 'tab-selector-emoji';
    button.appendChild(emojiEl);

    const titleEl = document.createElement('span');
    titleEl.className = 'tab-selector-title';
    button.appendChild(titleEl);

    const alertDot = document.createElement('span');
    alertDot.className = 'tab-selector-alert';
    alertDot.setAttribute('aria-hidden', 'true');
    button.appendChild(alertDot);

    this.applyTabMetadata(button, tab);
    button.addEventListener('click', () => this.selectTab(id));
    return button;
  }

  register(id: string, panel: Panel, placement: PanelPlacement): void {
    this.slots.push({ id, panel, placement });

    if (placement.kind === 'tabs') {
      const button = this.createTabButton(id, placement.tab);
      this.tabSelectorEl.appendChild(button);

      panel.el.classList.add('panel-tab-view');
      panel.el.classList.add('hidden');
      this.tabContentEl.appendChild(panel.el);

      const slot = this.slots[this.slots.length - 1];
      slot.tabButton = button;

      if (this.getSelectedTabId() === null) {
        this.selectTab(id);
      } else {
        this.refreshTabUi();
      }
      return;
    }

    const staticRegion = this.staticContainers.get(placement.region);
    if (!staticRegion) {
      throw new Error(`Panel region "${placement.region}" is not registered.`);
    }

    staticRegion.appendChild(panel.el);
  }

  replace(id: string, newPanel: Panel, placement?: PanelPlacement): void {
    const idx = this.slots.findIndex(s => s.id === id);
    if (idx >= 0) {
      const old = this.slots[idx];
      const resolvedPlacement = placement ?? old.placement;

      if (old.placement.kind === 'tabs') {
        if (resolvedPlacement.kind === 'tabs') {
          this.tabContentEl.replaceChild(newPanel.el, old.panel.el);
          newPanel.el.classList.add('panel-tab-view');
          if (this.getSelectedTabId() !== id) {
            newPanel.el.classList.add('hidden');
          }

          if (old.tabButton) {
            this.applyTabMetadata(old.tabButton, resolvedPlacement.tab);
          }
        } else {
          old.tabButton?.remove();
          old.panel.el.remove();
          const staticRegion = this.staticContainers.get(resolvedPlacement.region);
          if (!staticRegion) {
            throw new Error(`Panel region "${resolvedPlacement.region}" is not registered.`);
          }
          staticRegion.appendChild(newPanel.el);
        }
      } else {
        const previousRegion = this.staticContainers.get(old.placement.region);
        if (resolvedPlacement.kind === 'static') {
          const nextRegion = this.staticContainers.get(resolvedPlacement.region);
          if (!nextRegion) {
            throw new Error(`Panel region "${resolvedPlacement.region}" is not registered.`);
          }
          if (previousRegion === nextRegion && previousRegion?.contains(old.panel.el)) {
            previousRegion.replaceChild(newPanel.el, old.panel.el);
          } else {
            old.panel.el.remove();
            nextRegion.appendChild(newPanel.el);
          }
        } else {
          if (previousRegion?.contains(old.panel.el)) {
            previousRegion.removeChild(old.panel.el);
          }
          const button = this.createTabButton(id, resolvedPlacement.tab);
          this.tabSelectorEl.appendChild(button);
          this.tabContentEl.appendChild(newPanel.el);
          newPanel.el.classList.add('panel-tab-view');
          old.tabButton = button;

          if (this.getSelectedTabId() === null) {
            this.selectTab(id);
          } else if (this.getSelectedTabId() !== id) {
            newPanel.el.classList.add('hidden');
          }
        }
      }

      this.slots[idx] = {
        id,
        panel: newPanel,
        placement: resolvedPlacement,
        tabButton: old.tabButton,
      };
      this.refreshTabUi();
    }
  }

  private selectTab(id: string): void {
    this.setSelectedTabId(id);
    this.clearTabAttention(id);
    this.refreshTabUi();
  }

  private refreshTabUi(): void {
    const tabSlots = this.slots.filter((slot): slot is PanelSlot & { placement: TabPanelPlacement } => slot.placement.kind === 'tabs');
    const selectedTabId = this.getSelectedTabId();
    const selectedTabExists = selectedTabId !== null && tabSlots.some((slot) => slot.id === selectedTabId);
    const visibleTabId = selectedTabExists ? selectedTabId : tabSlots[0]?.id ?? null;
    const moonUnlocked = this.currentState?.completedResearch.includes('payloadToMoon') ?? false;

    for (const slot of tabSlots) {
      const selected = slot.id === visibleTabId;
      slot.panel.el.classList.toggle('hidden', !selected);
      slot.tabButton?.classList.toggle('is-selected', selected);
      slot.tabButton?.classList.toggle('emoji-only', moonUnlocked && !selected);
      slot.tabButton?.classList.toggle('has-attention', this.shouldShowTabAttention(slot.id, selected));
    }

    if (selectedTabExists) {
      return;
    }

    if (selectedTabId === null) {
      this.setSelectedTabId(visibleTabId);
      return;
    }

    if (visibleTabId === null) {
      this.setSelectedTabId(null);
    }
  }

  update(state: GameState): void {
    this.currentState = state;
    this.refreshTabUi();
    for (const slot of this.slots) {
      slot.panel.update(state);
    }
  }
}
