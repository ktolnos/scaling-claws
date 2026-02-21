import type { GameState } from '../game/GameState.ts';

function bigIntReplacer(_key: string, value: unknown): unknown {
  if (typeof value === 'bigint') {
    return { __bigint__: value.toString() };
  }
  return value;
}

function bigIntReviver(_key: string, value: unknown): unknown {
  if (value && typeof value === 'object' && '__bigint__' in (value as Record<string, unknown>)) {
    return BigInt((value as { __bigint__: string }).__bigint__);
  }
  return value;
}

export function cloneGameState(state: GameState): GameState {
  const json = JSON.stringify(state, bigIntReplacer);
  return JSON.parse(json, bigIntReviver) as GameState;
}
