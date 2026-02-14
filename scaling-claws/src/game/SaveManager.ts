import type { GameState } from './GameState.ts';
import { createInitialState } from './GameState.ts';

const SAVE_KEY = 'scaling-claws-save';

export function saveGame(state: GameState): void {
  try {
    const json = JSON.stringify(state);
    localStorage.setItem(SAVE_KEY, json);
  } catch (_e) {
    // localStorage might be full or disabled
  }
}

export function loadGame(): GameState | null {
  try {
    const json = localStorage.getItem(SAVE_KEY);
    if (!json) return null;

    const parsed = JSON.parse(json) as Partial<GameState>;

    // Basic validation: check essential fields exist
    if (typeof parsed.funds !== 'number' || !Array.isArray(parsed.agents)) {
      return null;
    }

    // Merge with defaults to handle missing fields from older saves
    const defaults = createInitialState();
    const state: GameState = {
      ...defaults,
      ...parsed,
      milestones: { ...defaults.milestones, ...parsed.milestones },
    };

    // Fix lastTickTime to now (don't try to simulate offline time yet)
    state.lastTickTime = Date.now();

    return state;
  } catch (_e) {
    return null;
  }
}

export function deleteSave(): void {
  localStorage.removeItem(SAVE_KEY);
}

export function exportSave(state: GameState): string {
  return btoa(JSON.stringify(state));
}

export function importSave(data: string): GameState | null {
  try {
    const json = atob(data);
    const parsed = JSON.parse(json) as Partial<GameState>;
    if (typeof parsed.funds !== 'number') return null;
    const defaults = createInitialState();
    return {
      ...defaults,
      ...parsed,
      milestones: { ...defaults.milestones, ...parsed.milestones },
      lastTickTime: Date.now(),
    };
  } catch (_e) {
    return null;
  }
}
