import type { GameState } from './GameState.ts';

const SAVE_KEY = 'scaling-claws-save';

/**
 * SaveManager — Simple save/load without migrations or backward compatibility.
 *
 * During development, breaking changes to GameState are expected.
 * DO NOT add migration code or version checks — players will start fresh.
 * This keeps the codebase clean and saves will be stable after release.
 */

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

    const parsed = JSON.parse(json) as GameState;

    // Basic validation
    if (typeof parsed.funds !== 'number' || !parsed.agentPools) {
      return null;
    }

    // Reset tick time to prevent offline catch-up issues
    parsed.lastTickTime = Date.now();

    return parsed;
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
    const parsed = JSON.parse(json) as GameState;

    // Basic validation
    if (typeof parsed.funds !== 'number' || !parsed.agentPools) {
      return null;
    }

    // Reset tick time
    parsed.lastTickTime = Date.now();

    return parsed;
  } catch (_e) {
    return null;
  }
}
