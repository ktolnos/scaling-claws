import type { GameState } from '../GameState.ts';
import { BALANCE } from '../BalanceConfig.ts';

export function tickEnergy(state: GameState, _dtMs: number): void {
  if (!state.isPostGpuTransition) return;

  // Power demand: GPUs
  state.powerDemandMW = state.gpuCount * BALANCE.gpuPowerMW;

  // Power supply: grid + plants + solar + home
  let supply = BALANCE.homePowerMW; 
  supply += state.gridBlocksOwned * BALANCE.gridBlockMW;
  supply += state.gasPlants * BALANCE.powerPlants.gas.outputMW;
  supply += state.nuclearPlants * BALANCE.powerPlants.nuclear.outputMW;
  supply += state.solarPanels * BALANCE.solarPanelMW;
  state.powerSupplyMW = supply;

  // Throttle: if demand > supply, GPUs run at reduced capacity
  if (state.powerDemandMW > 0 && state.powerSupplyMW < state.powerDemandMW) {
    state.powerThrottle = state.powerSupplyMW / state.powerDemandMW;
  } else {
    state.powerThrottle = 1;
  }
}

export function buyGridBlock(state: GameState): boolean {
  // Grid blocks have no upfront cost, just ongoing $800/min per block
  // But check they can afford at least 1 min
  const newCostPerMin = (state.gridBlocksOwned + 1) * BALANCE.gridCostPerBlockPerMin;
  if (state.funds < newCostPerMin) return false;

  state.gridBlocksOwned++;
  return true;
}

export function sellGridBlock(state: GameState): boolean {
  if (state.gridBlocksOwned <= 0) return false;
  state.gridBlocksOwned--;
  return true;
}

export function buyGasPlant(state: GameState): boolean {
  if (state.funds < BALANCE.powerPlants.gas.cost) return false;
  // Check engineer availability
  const engAvailable = state.engineerCount - state.engineersRequired;
  if (engAvailable < BALANCE.powerPlants.gas.engineersRequired) return false;

  state.funds -= BALANCE.powerPlants.gas.cost;
  state.gasPlants++;

  if (!state.milestones.firstGasPlant) {
    state.milestones.firstGasPlant = true;
    state.pendingFlavorTexts.push(
      '"Datacenter #4. The power company sent a personal account manager. And a fruit basket."'
    );
  }

  return true;
}

export function buyNuclearPlant(state: GameState): boolean {
  if (state.funds < BALANCE.powerPlants.nuclear.cost) return false;
  const engAvailable = state.engineerCount - state.engineersRequired;
  if (engAvailable < BALANCE.powerPlants.nuclear.engineersRequired) return false;

  state.funds -= BALANCE.powerPlants.nuclear.cost;
  state.nuclearPlants++;

  if (!state.milestones.firstNuclearPlant) {
    state.milestones.firstNuclearPlant = true;
  }

  return true;
}

export function buySolarFarm(state: GameState): boolean {
  if (state.funds < BALANCE.powerPlants.solar.cost) return false;
  const engAvailable = state.engineerCount - state.engineersRequired;
  if (engAvailable < BALANCE.powerPlants.solar.engineersRequired) return false;

  state.funds -= BALANCE.powerPlants.solar.cost;
  state.solarFarms++;

  if (!state.milestones.firstSolarFarm) {
    state.milestones.firstSolarFarm = true;
  }

  return true;
}

export function buySolarPanel(state: GameState, amount: number): boolean {
  if (state.solarFarms <= 0) return false;
  const cost = amount * BALANCE.solarPanelCost;
  if (state.funds < cost) return false;

  state.funds -= cost;
  state.solarPanels += amount;
  return true;
}
