import type { GameState } from '../../game/GameState.ts';

export interface VisualScene {
  build(root: HTMLElement): void;
  sample(state: GameState): void;
  simulate(dtMs: number): void;
  render(): void;
  setVisible(visible: boolean): void;
  getDrawCallCount?(): number;
}
