import type { GameState } from '../GameState.ts';
import { BALANCE } from '../BalanceConfig.ts';
import { toBigInt, mulB, scaleB, fromBigInt, scaleBigInt } from '../utils.ts';

export function tickSpace(state: GameState, dtMs: number): void {
  // 1. Reusable Rockets Return
  const now = Date.now();
  if (state.rocketReturns.length > 0) {
    const remaining: number[] = [];
    for (const t of state.rocketReturns) {
      if (now >= t) {
        state.rockets += 1n;
      } else {
        remaining.push(t);
      }
    }
    state.rocketReturns = remaining;
  }

  if (!state.completedResearch.includes('orbitalLogistics')) {
    state.spaceUnlocked = false;
    return;
  }
  state.spaceUnlocked = true;

  // 2. Orbital Power
  // Satellites * Power
  state.orbitalPowerMW = mulB(state.satellites, toBigInt(Math.floor(BALANCE.satellitePowerMW * 100))) / 100n; // Scaling float

  // 3. Moon Operations
  if (state.lunarBase) {
    const alpha = 0.05;
    
    // Moon Mines: Produce Material.
    if (state.moonMines > 0n) {
       const prod = mulB(state.moonMines, BALANCE.moonMineOutput);
       state.moonMaterials += mulB(prod, toBigInt(dtMs)) / 60000n;
    }

    // B. Mass Driver (Moon)
    // Consumes Moon Material -> Launches Satellites.
    // "Mass drivers are cheaper alternative to rocket... can launch sattelites (payload/min)".
    // They consume "Material".
    if (state.moonMassDrivers > 0n && state.moonMaterials > 0n) {
        // Rate: payloads/min.
        const ratePerMin = Number(state.moonMassDrivers) * BALANCE.moonMassDriverPayloadRate; // kg/min
        const kgPerTick = (ratePerMin * dtMs) / 60000;
        
        // Cost: 10 Material per kg? 1 Material per kg?
        // Let's say 1 Material = 1kg?
        const materialNeeded = BigInt(Math.floor(kgPerTick));
        
        if (state.moonMaterials >= materialNeeded) {
            state.moonMaterials -= materialNeeded;
            // 1 GPU Sat = 1000kg.
            const satsLaunched = kgPerTick / BALANCE.gpuSatelliteWeight;
            if (satsLaunched > 0) {
                 if (Math.random() < satsLaunched) {
                     state.satellites += 1n;
                 }
            }
            state.lunarMassDriverRate = satsLaunched * 60; // per min
        } else {
            state.lunarMassDriverRate = 0;
        }
    } else {
        state.lunarMassDriverRate = 0;
    }

    // C. Moon Factories
    // GPU Factory
    if (state.moonGpuFactories > 0n) {
        // Consumes Material. Produces GPU (Lunar).
        // Let's say 100 Material -> 1 GPU.
        const output = Number(state.moonGpuFactories); // 1 per min
        // TODO: complete this
    }
    
    // Moon Power
    // Supply: Moon Solar Panels
    const moonSolarMW = mulB(state.lunarSolarPanels, toBigInt(Math.floor(BALANCE.solarPanelMW * 100))) / 100n;
    state.lunarPowerSupplyMW = moonSolarMW;
    
    // Demand: Moon GPUs + Datacenters?
    // "Moon GPUs are automatically working if they have enough power".
    // 1 GPU = 0.0004 MW.
    const demand = mulB(state.lunarGPUs, toBigInt(Math.floor(BALANCE.gpuPowerMW * 10000))) / 10000n;
    state.lunarPowerDemandMW = demand;
    
    if (demand > 0n) {
      if (state.lunarPowerSupplyMW >= demand) state.lunarPowerThrottle = 1.0;
      else state.lunarPowerThrottle = Number(state.lunarPowerSupplyMW) / Number(demand);
    } else {
      state.lunarPowerThrottle = 1.0;
    }
  }

  // 4. Mercury Operations
  if (state.mercuryBase) {
     const miningRate = Number(state.mercuryRobots) * 10; // 10 Material/min per robot
     state.mercuryMiningRate = miningRate;
     state.mercuryMassMined += BigInt(Math.floor((miningRate * dtMs) / 60000));
  }
}

// --- Actions ---

export function launchSatellite(state: GameState, amount: number): boolean {
  // Launch GPU Satellites from Earth Inv -> Space
  const amountB = toBigInt(amount);
  
  // Check Inventory
  if (state.gpuSatellites < amountB) return false;
  
  // Check Rockets
  // Capacity: 100,000 kg. Sat: 1000 kg. => 100 sats per rocket.
  const satsPerRocket = Math.floor(BALANCE.rocketCapacityLowOrbit / BALANCE.gpuSatelliteWeight);
  const rocketsNeeded = Math.ceil(amount / satsPerRocket);
  const rocketsNeededB = BigInt(rocketsNeeded);
  
  if (state.rockets < rocketsNeededB) return false;
  
  // Launch
  state.gpuSatellites -= amountB;
  state.rockets -= rocketsNeededB;
  state.satellites += amountB;
  
  // Return Rockets
  if (state.completedResearch.includes('reusableRockets')) {
    const returnTime = Date.now() + 60000;
    for (let i = 0; i < rocketsNeeded; i++) {
        state.rocketReturns.push(returnTime);
    }
  }
  
  return true;
}

export function buildLunarBase(state: GameState): boolean {
  if (state.lunarBase) return false;
  if (state.funds < BALANCE.lunarBaseCost) return false;
  // ... other checks
  state.funds -= BALANCE.lunarBaseCost;
  state.lunarBase = true;
  return true;
}

// Launch Payload to Moon
export function launchLunarPayload(state: GameState, type: 'robot' | 'solar' | 'gpu', amount: number): boolean {
    if (!state.lunarBase) return false;
    const amountB = toBigInt(amount);
    
    // Weight check
    let weight = 0;
    if (type === 'robot') weight = BALANCE.robotWeight;
    else if (type === 'solar') weight = BALANCE.solarPanelWeight;
    else if (type === 'gpu') weight = BALANCE.gpuWeight;
    
    const totalWeight = weight * amount;
    const rocketsNeeded = Math.ceil(totalWeight / BALANCE.rocketCapacityLunar);
    const rocketsNeededB = BigInt(rocketsNeeded);
    
    if (state.rockets < rocketsNeededB) return false;
    
    // Resource check
    if (type === 'robot' && state.robots < amountB) return false;
    if (type === 'solar' && state.solarPanels < amountB) return false;
    if (type === 'gpu' && state.gpuCount < amountB) return false; // Note: gpuCount is Earth GPUs
    
    // Execute
    state.rockets -= rocketsNeededB;
    if (type === 'robot') {
        state.robots -= amountB;
        state.lunarRobots += amountB;
    } else if (type === 'solar') {
        state.solarPanels -= amountB;
        state.lunarSolarPanels += amountB;
    } else if (type === 'gpu') {
        state.gpuCount -= amountB;
        state.lunarGPUs += amountB;
    }
    
    // Return
    if (state.completedResearch.includes('reusableRockets')) {
        const returnTime = Date.now() + 60000;
        for (let i = 0; i < rocketsNeeded; i++) {
            state.rocketReturns.push(returnTime);
        }
    }
    
    return true;
}

// Build Moon Facility
export function buildMoonFacility(state: GameState, type: 'mine' | 'datacenter' | 'solarFactory' | 'gpuFactory' | 'massDriver', amount: number): boolean {
    if (!state.lunarBase) return false;
    const amountB = toBigInt(amount);
    
    // Cost: Earth Labor (via remote control?) + Moon Material?
    // "Facilities cost labor, consume only materials".
    // I'll assume Earth Funds for kit + Earth Labor for operation (remote)?
    // Or Moon Robots (Labor)?
    // Simplified: Cost Earth Funds.
    
    let cost = 0n;
    if (type === 'mine') cost = toBigInt(5_000_000);
    else if (type === 'datacenter') cost = toBigInt(10_000_000);
    else if (type === 'massDriver') cost = toBigInt(50_000_000);
    else cost = toBigInt(20_000_000); // factories
    
    const totalCost = mulB(amountB, cost);
    if (state.funds < totalCost) return false;
    
    state.funds -= totalCost;
    
    if (type === 'mine') state.moonMines += amountB;
    else if (type === 'datacenter') state.moonDatacenters += amountB;
    else if (type === 'gpuFactory') state.moonGpuFactories += amountB;
    else if (type === 'solarFactory') state.moonSolarFactories += amountB;
    else if (type === 'massDriver') state.moonMassDrivers += amountB;
    
    return true;
}

export function buildMercuryBase(state: GameState): boolean {
  if (state.mercuryBase) return false;
  if (state.funds < BALANCE.mercuryBaseCost) return false;
  state.funds -= BALANCE.mercuryBaseCost;
  state.mercuryBase = true;
  return true;
}
