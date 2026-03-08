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

export class PanelManager {
  private readonly tabsContainer: HTMLElement;
  private readonly staticContainers: Map<string, HTMLElement>;
  private readonly tabShell: HTMLDivElement;
  private readonly tabSelectorEl: HTMLDivElement;
  private readonly tabTitleEl: HTMLDivElement;
  private readonly tabContentEl: HTMLDivElement;
  private slots: PanelSlot[] = [];
  private selectedTabId: string | null = null;

  constructor(tabsContainer: HTMLElement, staticContainers: Record<string, HTMLElement> = {}) {
    this.tabsContainer = tabsContainer;
    this.staticContainers = new Map(Object.entries(staticContainers));

    this.tabsContainer.innerHTML = '';

    this.tabShell = document.createElement('div');
    this.tabShell.className = 'tabbed-panel-shell';

    this.tabSelectorEl = document.createElement('div');
    this.tabSelectorEl.className = 'tab-selector';
    this.tabShell.appendChild(this.tabSelectorEl);

    this.tabTitleEl = document.createElement('div');
    this.tabTitleEl.className = 'tab-selected-title';
    this.tabShell.appendChild(this.tabTitleEl);

    this.tabContentEl = document.createElement('div');
    this.tabContentEl.className = 'tab-content';
    this.tabShell.appendChild(this.tabContentEl);

    this.tabsContainer.appendChild(this.tabShell);
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
    this.selectedTabId = null;
    this.tabSelectorEl.innerHTML = '';
    this.tabContentEl.innerHTML = '';
    this.tabTitleEl.textContent = '';
  }

  private applyTabMetadata(button: HTMLButtonElement, tab: TabMetadata): void {
    button.textContent = tab.emoji;
    button.title = tab.title;
    button.setAttribute('aria-label', tab.title);
  }

  private createTabButton(id: string, tab: TabMetadata): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tab-selector-btn';
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

      if (this.selectedTabId === null) {
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
          if (this.selectedTabId !== id) {
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

          if (this.selectedTabId === null) {
            this.selectTab(id);
          } else if (this.selectedTabId !== id) {
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
    this.selectedTabId = id;
    this.refreshTabUi();
  }

  private refreshTabUi(): void {
    let selectedTitle = '';
    let selectedTabExists = false;

    for (const slot of this.slots) {
      if (slot.placement.kind !== 'tabs') {
        continue;
      }

      const selected = slot.id === this.selectedTabId;
      if (selected) {
        selectedTabExists = true;
        selectedTitle = slot.placement.tab.title;
      }
      slot.panel.el.classList.toggle('hidden', !selected);
      slot.tabButton?.classList.toggle('is-selected', selected);
    }

    if (!selectedTabExists) {
      const firstTab = this.slots.find((slot) => slot.placement.kind === 'tabs');
      if (firstTab) {
        this.selectedTabId = firstTab.id;
        this.refreshTabUi();
        return;
      }
      this.selectedTabId = null;
      this.tabTitleEl.textContent = '';
      return;
    }

    this.tabTitleEl.textContent = selectedTitle;
  }

  update(state: GameState): void {
    for (const slot of this.slots) {
      slot.panel.update(state);
    }
  }
}
