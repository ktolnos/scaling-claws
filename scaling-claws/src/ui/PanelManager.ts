import type { GameState } from '../game/GameState.ts';

export interface Panel {
  readonly el: HTMLElement;
  update(state: GameState): void;
}

interface PanelSlot {
  id: string;
  panel: Panel;
  visible: boolean;
}

export class PanelManager {
  private container: HTMLElement;
  private slots: PanelSlot[] = [];

  constructor(container: HTMLElement) {
    this.container = container;
  }

  register(id: string, panel: Panel): void {
    this.slots.push({ id, panel, visible: true });
    this.container.appendChild(panel.el);
  }

  show(id: string): void {
    const slot = this.slots.find(s => s.id === id);
    if (slot && !slot.visible) {
      slot.visible = true;
      slot.panel.el.classList.remove('hidden');
    }
  }

  hide(id: string): void {
    const slot = this.slots.find(s => s.id === id);
    if (slot && slot.visible) {
      slot.visible = false;
      slot.panel.el.classList.add('hidden');
    }
  }

  replace(id: string, newPanel: Panel): void {
    const idx = this.slots.findIndex(s => s.id === id);
    if (idx >= 0) {
      const old = this.slots[idx];
      this.container.replaceChild(newPanel.el, old.panel.el);
      this.slots[idx] = { id, panel: newPanel, visible: old.visible };
    }
  }

  update(state: GameState): void {
    for (const slot of this.slots) {
      if (slot.visible) {
        slot.panel.update(state);
      }
    }
  }
}
