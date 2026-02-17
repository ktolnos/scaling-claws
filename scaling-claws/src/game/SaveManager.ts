import type { GameState } from './GameState.ts';

const SAVE_KEY = 'scaling-claws-save';

/**
 * SaveManager — Simple save/load without migrations or backward compatibility.
 *
 * During development, breaking changes to GameState are expected.
 * DO NOT add migration code or version checks — players will start fresh.
 * This keeps the codebase clean and saves will be stable after release.
 */

// Custom JSON serialization to handle BigInts
function bigIntReplacer(_key: string, value: any): any {
  if (typeof value === 'bigint') {
    return { __bigint__: value.toString() };
  }
  return value;
}

function bigIntReviver(_key: string, value: any): any {
  if (value && typeof value === 'object' && '__bigint__' in value) {
    return BigInt(value.__bigint__);
  }
  return value;
}

export function saveGame(state: GameState): void {
  try {
    const json = JSON.stringify(state, bigIntReplacer);
    localStorage.setItem(SAVE_KEY, json);
    console.log('[SaveManager] Game saved successfully');
  } catch (e) {
    console.error('[SaveManager] Failed to save game:', e);
  }
}

export function loadGame(): GameState | null {
  try {
    const json = localStorage.getItem(SAVE_KEY);
    if (!json) {
      console.log('[SaveManager] No save found');
      return null;
    }

    const parsed = JSON.parse(json, bigIntReviver) as GameState;

    // Reset tick time to prevent offline catch-up issues
    parsed.lastTickTime = Date.now();

    console.log('[SaveManager] Game loaded successfully');
    return parsed;
  } catch (e) {
    console.error('[SaveManager] Failed to load game:', e);
    return null;
  }
}

export function deleteSave(): void {
  localStorage.removeItem(SAVE_KEY);
  console.log('[SaveManager] Save deleted');
}

export function exportSave(state: GameState): string {
  return btoa(JSON.stringify(state, bigIntReplacer));
}

export function importSave(data: string): GameState | null {
  try {
    const json = atob(data);
    const parsed = JSON.parse(json, bigIntReviver) as GameState;

    // Basic validation
    if (!parsed.agentPools) {
      console.error('[SaveManager] Invalid save data: missing agentPools');
      return null;
    }

    // Reset tick time
    parsed.lastTickTime = Date.now();

    console.log('[SaveManager] Save imported successfully');
    return parsed;
  } catch (e) {
    console.error('[SaveManager] Failed to import save:', e);
    return null;
  }
}
