import type { GameState } from './GameState.ts';
import { BALANCE } from './BalanceConfig.ts';
import { tickJobs } from './systems/JobSystem.ts';
import { tickCompute } from './systems/ComputeSystem.ts';
import { tickEnergy } from './systems/EnergySystem.ts';
import { tickTraining } from './systems/TrainingSystem.ts';
import { tickResearch } from './systems/ResearchSystem.ts';
import { tickSupply } from './systems/SupplySystem.ts';

export class GameLoop {
  private state: GameState;
  private intervalId: number | null = null;

  constructor(state: GameState) {
    this.state = state;
  }

  start(): void {
    this.state.lastTickTime = Date.now();
    this.intervalId = window.setInterval(
      () => this.tick(),
      BALANCE.tickIntervalMs,
    );
  }

  private tick(): void {
    const now = Date.now();
    const dt = Math.min(now - this.state.lastTickTime, 500); // Cap dt to prevent spiral
    this.state.lastTickTime = now;
    this.state.tickCount++;

    // Reset breakdowns before systems run
    this.resetBreakdowns();

    // Run systems in order
    tickEnergy(this.state, dt);
    tickResearch(this.state, dt);   // Compute bonuses before they're used
    tickCompute(this.state, dt);
    tickTraining(this.state, dt);
    tickSupply(this.state, dt);
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

  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}
