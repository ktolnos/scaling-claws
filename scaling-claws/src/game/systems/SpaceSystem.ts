import type { GameState } from '../GameState.ts';
import { BALANCE } from '../BalanceConfig.ts';
import { toBigInt, mulB, scaleB, fromBigInt, scaleBigInt } from '../utils.ts';

export function tickSpace(state: GameState, dtMs: number): void {
  if (!state.completedResearch.includes('spaceRockets1')) {
    state.spaceUnlocked = false;
    return;
  }
  state.spaceUnlocked = true;

  // Orbital power
  state.orbitalPowerMW = mulB(state.satellites, toBigInt(BALANCE.satellitePowerMW));

  // Lunar operations
  if (state.lunarBase) {
    // Mass driver: auto-launches satellites, scales with lunar robots
    const lunarRobotsNum = fromBigInt(state.lunarRobots);
    const massDriverRate = BALANCE.massDriverBaseRate * (1 + lunarRobotsNum / 10);
    state.lunarMassDriverRate = massDriverRate;
    state.satellites += mulB(toBigInt(massDriverRate), toBigInt(dtMs)) / 60000n;
  } else {
    state.lunarMassDriverRate = 0;
  }

  // Mercury operations
  if (state.mercuryBase) {
    // Mining rate scales with robots
    const mercuryRobotsNum = fromBigInt(state.mercuryRobots);
    state.mercuryMiningRate = BALANCE.mercuryMiningBaseRate * (1 + mercuryRobotsNum / 5);
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
  state.rockets += scaleBigInt(1n); // rockets is scaled

  if (state.rockets === scaleBigInt(1n)) {
    state.pendingFlavorTexts.push(
      '"Your first rocket. Your neighbors have questions about the delivery."'
    );
  }
  return true;
}

export function launchSatellite(state: GameState, count: number): boolean {
  if (state.rockets < scaleBigInt(1n)) return false;

  const countB = toBigInt(count);
  const costPerSat = scaleB(BALANCE.satelliteCost, state.launchCostBonus);
  const laborPerSat = BALANCE.satelliteLaborCost;
  const totalCost = mulB(costPerSat, countB);
  const totalLabor = mulB(laborPerSat, countB);

  if (state.funds < totalCost) return false;
  if (state.labor < totalLabor) return false;

  state.funds -= totalCost;
  state.labor -= totalLabor;
  state.rockets -= countB;
  state.satellites += countB;

  if (state.satellites === countB) {
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
  const countB = toBigInt(count);
  if (state.robots < countB) return false;
  const cost = mulB(countB, BALANCE.lunarRobotTransferCost);
  if (state.funds < cost) return false;

  state.funds -= cost;
  state.robots -= countB;
  state.lunarRobots += countB;
  return true;
}

export function sendGPUsToMoon(state: GameState, count: number): boolean {
  if (!state.lunarBase) return false;
  const countB = toBigInt(count);
  if (state.gpuCount < countB) return false;
  const cost = mulB(countB, BALANCE.lunarGPUTransferCost);
  if (state.funds < cost) return false;

  state.funds -= cost;
  state.gpuCount -= countB;
  state.lunarGPUs += countB;
  return true;
}

export function buyLunarSolarPanel(state: GameState, count: number): boolean {
  if (!state.lunarBase) return false;
  const countB = toBigInt(count);
  const cost = mulB(countB, BALANCE.lunarSolarPanelCost);
  if (state.funds < cost) return false;

  state.funds -= cost;
  state.lunarSolarPanels += countB;
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
  const countB = toBigInt(count);
  if (state.robots < countB) return false;
  const cost = mulB(countB, BALANCE.mercuryRobotTransferCost);
  if (state.funds < cost) return false;

  state.funds -= cost;
  state.robots -= countB;
  state.mercuryRobots += countB;
  return true;
}

