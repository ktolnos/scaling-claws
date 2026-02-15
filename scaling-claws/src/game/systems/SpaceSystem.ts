import type { GameState } from '../GameState.ts';
import { BALANCE } from '../BalanceConfig.ts';

export function tickSpace(state: GameState, dtMs: number): void {
  if (!state.completedResearch.includes('spaceRockets1')) {
    state.spaceUnlocked = false;
    return;
  }
  state.spaceUnlocked = true;

  const dtMin = dtMs / 60000;

  // Orbital power (display only — satellites are self-sufficient)
  state.orbitalPowerMW = state.satellites * BALANCE.satellitePowerMW;

  // Lunar operations
  if (state.lunarBase) {
    // Mass driver: auto-launches satellites, scales with lunar robots
    const massDriverRate = BALANCE.massDriverBaseRate * (1 + state.lunarRobots / 10);
    state.lunarMassDriverRate = massDriverRate;
    state.satellites += massDriverRate * dtMin;
  } else {
    state.lunarMassDriverRate = 0;
  }

  // Mercury operations
  if (state.mercuryBase) {
    // Mining rate scales with robots
    state.mercuryMiningRate = BALANCE.mercuryMiningBaseRate * (1 + state.mercuryRobots / 5);
  } else {
    state.mercuryMiningRate = 0;
  }
}

// --- Actions ---

export function buildRocket(state: GameState): boolean {
  if (state.funds < BALANCE.rocketCost) return false;
  if (state.labor < BALANCE.rocketLaborCost) return false;

  state.funds -= BALANCE.rocketCost;
  state.labor -= BALANCE.rocketLaborCost;
  state.rockets++;

  if (state.rockets === 1) {
    state.pendingFlavorTexts.push(
      '"Your first rocket. Your neighbors have questions about the delivery."'
    );
  }
  return true;
}

export function launchSatellite(state: GameState, count: number): boolean {
  if (state.rockets < 1) return false;

  const costPerSat = BALANCE.satelliteCost * state.launchCostBonus;
  const laborPerSat = BALANCE.satelliteLaborCost;
  const totalCost = costPerSat * count;
  const totalLabor = laborPerSat * count;

  if (state.funds < totalCost) return false;
  if (state.labor < totalLabor) return false;

  state.funds -= totalCost;
  state.labor -= totalLabor;
  state.satellites += count;

  if (state.satellites === count) {
    // First satellites ever
    state.pendingFlavorTexts.push(
      '"First satellite deployed. No electricity bill. The sun works for free."'
    );
  }
  return true;
}

export function buildLunarBase(state: GameState): boolean {
  if (state.lunarBase) return false;
  if (!state.completedResearch.includes('spaceSystems2')) return false;
  if (state.funds < BALANCE.lunarBaseCost) return false;
  if (state.labor < BALANCE.lunarBaseLaborCost) return false;
  if (state.code < BALANCE.lunarBaseCodeCost) return false;

  state.funds -= BALANCE.lunarBaseCost;
  state.labor -= BALANCE.lunarBaseLaborCost;
  state.code -= BALANCE.lunarBaseCodeCost;
  state.lunarBase = true;

  state.pendingFlavorTexts.push(
    '"Lunar base operational. The robots don\'t complain about the commute."'
  );
  return true;
}

export function sendRobotsToMoon(state: GameState, count: number): boolean {
  if (!state.lunarBase) return false;
  if (state.robots < count) return false;
  const cost = count * BALANCE.lunarRobotTransferCost;
  if (state.funds < cost) return false;

  state.funds -= cost;
  state.robots -= count;
  state.lunarRobots += count;
  return true;
}

export function sendGPUsToMoon(state: GameState, count: number): boolean {
  if (!state.lunarBase) return false;
  if (state.gpuCount < count) return false;
  const cost = count * BALANCE.lunarGPUTransferCost;
  if (state.funds < cost) return false;

  state.funds -= cost;
  state.gpuCount -= count;
  state.lunarGPUs += count;
  return true;
}

export function buyLunarSolarPanel(state: GameState, count: number): boolean {
  if (!state.lunarBase) return false;
  const cost = count * BALANCE.lunarSolarPanelCost;
  if (state.funds < cost) return false;

  state.funds -= cost;
  state.lunarSolarPanels += count;
  return true;
}

export function buildMercuryBase(state: GameState): boolean {
  if (state.mercuryBase) return false;
  if (!state.completedResearch.includes('spaceSystems3')) return false;
  if (state.funds < BALANCE.mercuryBaseCost) return false;
  if (state.labor < BALANCE.mercuryBaseLaborCost) return false;
  if (state.code < BALANCE.mercuryBaseCodeCost) return false;

  state.funds -= BALANCE.mercuryBaseCost;
  state.labor -= BALANCE.mercuryBaseLaborCost;
  state.code -= BALANCE.mercuryBaseCodeCost;
  state.mercuryBase = true;

  state.pendingFlavorTexts.push(
    '"Mercury base established. Mercury is about to get a lot lighter."'
  );
  return true;
}

export function sendRobotsToMercury(state: GameState, count: number): boolean {
  if (!state.mercuryBase) return false;
  if (state.robots < count) return false;
  const cost = count * BALANCE.mercuryRobotTransferCost;
  if (state.funds < cost) return false;

  state.funds -= cost;
  state.robots -= count;
  state.mercuryRobots += count;
  return true;
}
