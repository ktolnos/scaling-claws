import type { GameState } from './GameState.ts';
import { BALANCE } from './BalanceConfig.ts';
import { tickJobs } from './systems/JobSystem.ts';
import { tickCompute } from './systems/ComputeSystem.ts';
import { tickEnergy } from './systems/EnergySystem.ts';
import { tickTraining } from './systems/TrainingSystem.ts';
import { tickResearch } from './systems/ResearchSystem.ts';
import { tickSupply } from './systems/SupplySystem.ts';
import { tickSpace } from './systems/SpaceSystem.ts';

export class GameLoop {
  private state: GameState;
  private intervalId: number | null = null;
  private paused = false;
  private speedMultiplier = 1;
  private tickListeners = new Set<(state: GameState, dtMs: number) => void>();

  constructor(state: GameState) {
    this.state = state;
  }

  start(): void {
    this.intervalId = window.setInterval(
      () => this.tick(),
      BALANCE.tickIntervalMs,
    );
  }

  private tick(): void {
    if (this.paused) return;

    const speed = Math.max(1, Math.floor(this.speedMultiplier));
    for (let i = 0; i < speed; i++) {
      this.tickOnce();
      if (this.tickListeners.size > 0) {
        for (const listener of this.tickListeners) {
          listener(this.state, BALANCE.tickIntervalMs);
        }
      }
    }
  }

  private tickOnce(): void {
    const dt = BALANCE.tickIntervalMs;
    this.state.time += dt;
    this.state.tickCount++;

    // Reset breakdowns before systems run
    this.resetBreakdowns();

    // Run systems in order
    tickEnergy(this.state);
    tickResearch(this.state, dt);   // Compute bonuses before they're used
    tickCompute(this.state, dt);
    tickTraining(this.state, dt);
    tickSupply(this.state, dt);
    tickSpace(this.state, dt);
    tickJobs(this.state, dt);
  }

  private resetBreakdowns(): void {
    const rb = this.state.resourceBreakdown;
    rb.funds.income = [];
    rb.funds.expense = [];
    rb.code.income = [];
    rb.code.expense = [];
    rb.science.income = [];
    rb.science.expense = [];
    rb.labor.income = [];
    rb.labor.expense = [];
    rb.compute = [];
  }

  getState(): GameState {
    return this.state;
  }

  setState(state: GameState): void {
    this.state = state;
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  isPaused(): boolean {
    return this.paused;
  }

  setSpeedMultiplier(multiplier: number): void {
    this.speedMultiplier = Math.max(1, Math.floor(multiplier));
  }

  getSpeedMultiplier(): number {
    return this.speedMultiplier;
  }

  addTickListener(listener: (state: GameState, dtMs: number) => void): () => void {
    this.tickListeners.add(listener);
    return () => {
      this.tickListeners.delete(listener);
    };
  }

  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}
