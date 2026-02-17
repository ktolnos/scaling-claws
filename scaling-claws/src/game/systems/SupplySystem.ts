import type { GameState } from '../GameState.ts';
import { BALANCE } from '../BalanceConfig.ts';
import { toBigInt, mulB } from '../utils.ts';

export function tickSupply(state: GameState, dtMs: number): void {
  const alpha = 0.05; // Smoothing factor

  // Reset consumption rates
  state.materialConsumptionPerMin = 0n;
  state.solarPanelConsumptionPerMin = 0n;
  state.robotConsumptionPerMin = 0n;
  state.gpuConsumptionPerMin = 0n;
  state.rocketConsumptionPerMin = 0n;
  state.gpuSatelliteConsumptionPerMin = 0n;
  state.gpuSatelliteProductionPerMin = 0n;

  // 1. Mines (Material)
  // Requires 'materialProcessing'
  if (state.completedResearch.includes('materialProcessing')) {
    if (state.materialMines > 0n) {
      const prodPerMin = mulB(state.materialMines, BALANCE.materialMineOutput);
      const produced = mulB(prodPerMin, toBigInt(dtMs)) / 60000n;
      state.material += produced;
      state.materialProductionPerMin = prodPerMin;
      state.materialMineRate = (state.materialMineRate * (1 - alpha)) + (1.0 * alpha);
    } else {
      state.materialProductionPerMin = 0n;
      state.materialMineRate = (state.materialMineRate * (1 - alpha));
    }
  } else {
     state.materialProductionPerMin = 0n;
     state.materialMineRate = 0;
  }

  // 2. Solar Factory (Material -> Solar Panels)
  if (state.completedResearch.includes('solarTechnology') && state.solarFactories > 0n) {
    const maxOutputPerMin = mulB(state.solarFactories, BALANCE.solarFactoryOutput);
    const materialReqPerMin = mulB(state.solarFactories, BALANCE.solarFactoryMaterialReq);
    
    // Calculate potential production in this tick
    const potentialOutput = mulB(maxOutputPerMin, toBigInt(dtMs)) / 60000n;
    const materialNeeded = mulB(materialReqPerMin, toBigInt(dtMs)) / 60000n;

    let efficiency = 1.0;
    if (state.material < materialNeeded) efficiency = Math.min(efficiency, Number(state.material) / Number(materialNeeded || 1n));
    
    if (efficiency > 0) {
      const actualOutput = BigInt(Math.floor(Number(potentialOutput) * efficiency));
      const actualMaterial = BigInt(Math.floor(Number(materialNeeded) * efficiency));
      
      state.solarPanels += actualOutput;
      state.material -= actualMaterial;
      
      state.solarPanelProductionPerMin = BigInt(Math.floor(Number(maxOutputPerMin) * efficiency));
      state.materialConsumptionPerMin += BigInt(Math.floor(Number(materialReqPerMin) * efficiency));
    } else {
      state.solarPanelProductionPerMin = 0n;
    }
    state.solarFactoryRate = (state.solarFactoryRate * (1 - alpha)) + (efficiency * alpha);
  } else {
    state.solarPanelProductionPerMin = 0n;
    state.solarFactoryRate = (state.solarFactoryRate * (1 - alpha));
  }

  // 3. GPU Factory (Material -> GPU)
  if (state.completedResearch.includes('chipManufacturing') && state.gpuFactories > 0n) {
    const maxOutputPerMin = mulB(state.gpuFactories, BALANCE.gpuFactoryOutput);
    const materialReqPerMin = mulB(state.gpuFactories, BALANCE.gpuFactoryMaterialReq);
    
    const potentialOutput = mulB(maxOutputPerMin, toBigInt(dtMs)) / 60000n;
    const materialNeeded = mulB(materialReqPerMin, toBigInt(dtMs)) / 60000n;

    let efficiency = 1.0;
    if (state.material < materialNeeded) efficiency = Number(state.material) / Number(materialNeeded || 1n);

    if (efficiency > 0) {
       const actualOutput = BigInt(Math.floor(Number(potentialOutput) * efficiency));
       const actualMaterial = BigInt(Math.floor(Number(materialNeeded) * efficiency));
       
       state.gpuCount += actualOutput;
       state.material -= actualMaterial;
       state.gpuProductionPerMin = BigInt(Math.floor(Number(maxOutputPerMin) * efficiency));
       state.materialConsumptionPerMin += BigInt(Math.floor(Number(materialReqPerMin) * efficiency));
    } else {
      state.gpuProductionPerMin = 0n;
    }
    state.gpuFactoryRate = (state.gpuFactoryRate * (1 - alpha)) + (efficiency * alpha);
  } else {
    state.gpuProductionPerMin = 0n;
    state.gpuFactoryRate = (state.gpuFactoryRate * (1 - alpha));
  }

  // 4. Robot Factory (Material -> Robot)
  if (state.completedResearch.includes('robotics1') && state.robotFactories > 0n) {
    const maxOutputPerMin = mulB(state.robotFactories, BALANCE.robotFactoryOutput);
    const materialReqPerMin = mulB(state.robotFactories, BALANCE.robotFactoryMaterialReq);

    const potentialOutput = mulB(maxOutputPerMin, toBigInt(dtMs)) / 60000n;
    const materialNeeded = mulB(materialReqPerMin, toBigInt(dtMs)) / 60000n;

    let efficiency = 1.0;
    if (state.material < materialNeeded) efficiency = Number(state.material) / Number(materialNeeded || 1n);

    if (efficiency > 0) {
      const actualOutput = BigInt(Math.floor(Number(potentialOutput) * efficiency));
      const actualMaterial = BigInt(Math.floor(Number(materialNeeded) * efficiency));

      state.robots += actualOutput;
      state.material -= actualMaterial;
      state.robotProductionPerMin = BigInt(Math.floor(Number(maxOutputPerMin) * efficiency));
      state.materialConsumptionPerMin += BigInt(Math.floor(Number(materialReqPerMin) * efficiency));
    } else {
       state.robotProductionPerMin = 0n;
    }
     state.robotFactoryRate = (state.robotFactoryRate * (1 - alpha)) + (efficiency * alpha);
  } else {
    state.robotProductionPerMin = 0n;
    state.robotFactoryRate = (state.robotFactoryRate * (1 - alpha));
  }

  // 5. Rocket Factory (Material -> Rocket)
  if (state.completedResearch.includes('rocketry') && state.rocketFactories > 0n) {
    const materialReqPerMin = mulB(state.rocketFactories, BALANCE.rocketFactoryMaterialReq);
    const materialNeeded = mulB(materialReqPerMin, toBigInt(dtMs)) / 60000n;
    
    let efficiency = 1.0;
    if (state.material < materialNeeded) efficiency = Number(state.material) / Number(materialNeeded || 1n);
    
    if (efficiency > 0) {
       // Consume material deterministically to avoid flickering demand
       state.material -= BigInt(Math.floor(Number(materialNeeded) * efficiency));
       state.materialConsumptionPerMin += BigInt(Math.floor(Number(materialReqPerMin) * efficiency));
       
       // Produce rocket stochastically
       const rocketsPerMin = Number(state.rocketFactories) * BALANCE.rocketFactoryOutput * efficiency;
       const expectedRockets = (rocketsPerMin * dtMs) / 60000;
       
       if (Math.random() < expectedRockets) {
         state.rockets += 1n;
       }
       state.rocketProductionPerMin = rocketsPerMin > 0 ? 1n : 0n; 
    } else {
       state.rocketProductionPerMin = 0n;
    }
    state.rocketFactoryRate = (state.rocketFactoryRate * (1 - alpha)) + (efficiency * alpha);
  } else {
    state.rocketProductionPerMin = 0n;
    state.rocketFactoryRate = (state.rocketFactoryRate * (1 - alpha));
  }

  // 6. GPU Satellite Factory (Material + GPU -> Satellite)
  if (state.completedResearch.includes('orbitalLogistics') && state.gpuSatelliteFactories > 0n) {
    const outputRate = Number(state.gpuSatelliteFactories) * BALANCE.gpuSatelliteFactoryOutput; // 0.2 per factory
    
    // Requirements
    const materialReqPerMin = mulB(state.gpuSatelliteFactories, BALANCE.gpuSatelliteFactoryMaterialReq);
    const gpuReqPerMin = mulB(state.gpuSatelliteFactories, BALANCE.gpuSatelliteFactoryGpuReq);
    
    const materialNeeded = mulB(materialReqPerMin, toBigInt(dtMs)) / 60000n;
    const gpuNeeded = mulB(gpuReqPerMin, toBigInt(dtMs)) / 60000n;
    
    let efficiency = 1.0;
    if (state.material < materialNeeded) efficiency = Math.min(efficiency, Number(state.material) / Number(materialNeeded || 1n));
    if (state.gpuCount < gpuNeeded) efficiency = Math.min(efficiency, Number(state.gpuCount) / Number(gpuNeeded || 1n));
    
    if (efficiency > 0) {
      // Consume
      state.material -= BigInt(Math.floor(Number(materialNeeded) * efficiency));
      state.gpuCount -= BigInt(Math.floor(Number(gpuNeeded) * efficiency));
      
      state.materialConsumptionPerMin += BigInt(Math.floor(Number(materialReqPerMin) * efficiency));
      state.gpuConsumptionPerMin += BigInt(Math.floor(Number(gpuReqPerMin) * efficiency));
      
      // Produce Probabilistically
      const expectedSats = (outputRate * efficiency * dtMs) / 60000;
      if (Math.random() < expectedSats) {
        state.gpuSatellites += 1n;
      }
      
      state.gpuSatelliteProductionPerMin = outputRate > 0 ? 1n : 0n; // Flag
    } else {
      state.gpuSatelliteProductionPerMin = 0n;
    }
    state.gpuSatelliteFactoryRate = (state.gpuSatelliteFactoryRate * (1 - alpha)) + (efficiency * alpha);
  } else {
    state.gpuSatelliteProductionPerMin = 0n;
    state.gpuSatelliteFactoryRate = (state.gpuSatelliteFactoryRate * (1 - alpha));
  }
}

// --- Actions ---

// Generic imports
export function importResource(state: GameState, resource: 'material' | 'solarPanels' | 'robots' | 'rockets' | 'gpuSatellites' | 'gpu', amount: number): boolean {
  const amountB = toBigInt(amount);
  let cost = 0n;
  
  if (resource === 'material') cost = BALANCE.materialCost;
  else if (resource === 'solarPanels') cost = BALANCE.solarPanelImportCost;
  else if (resource === 'robots') cost = BALANCE.robotImportCost;
  else if (resource === 'rockets') cost = BALANCE.rocketImportCost;
  else if (resource === 'gpuSatellites') cost = BALANCE.gpuSatelliteImportCost;
  else if (resource === 'gpu') cost = BALANCE.gpuImportCost;

  const totalCost = mulB(amountB, cost);
  
  if (state.funds < totalCost) return false;
  state.funds -= totalCost;
  
  if (resource === 'material') state.material += amountB;
  else if (resource === 'solarPanels') state.solarPanels += amountB;
  else if (resource === 'robots') state.robots += amountB;
  else if (resource === 'rockets') state.rockets += amountB;
  else if (resource === 'gpuSatellites') state.gpuSatellites += amountB;
  else if (resource === 'gpu') state.gpuCount += amountB; // Note: gpuCount
  
  return true;
}

// Facilities
export function buildFacility(state: GameState, type: 'materialMine' | 'solarFactory' | 'robotFactory' | 'gpuFactory' | 'rocketFactory' | 'gpuSatelliteFactory', amount: number): boolean {
  const amountB = toBigInt(amount);
  let cost = 0n;
  let labor = 0n;
  let currentCount = 0n;
  let limit = 0;
  
  if (type === 'materialMine') {
    cost = BALANCE.materialMineCost;
    labor = BALANCE.materialMineLaborCost;
    currentCount = state.materialMines;
    limit = BALANCE.materialMineLimit;
  } else if (type === 'solarFactory') {
    cost = BALANCE.solarFactoryCost;
    labor = BALANCE.solarFactoryLaborCost;
    currentCount = state.solarFactories;
    limit = BALANCE.solarFactoryLimit;
  } else if (type === 'robotFactory') {
    cost = BALANCE.robotFactoryCost;
    labor = BALANCE.robotFactoryLaborCost;
    currentCount = state.robotFactories;
    limit = BALANCE.robotFactoryLimit;
  } else if (type === 'gpuFactory') {
    cost = BALANCE.gpuFactoryCost;
    labor = BALANCE.gpuFactoryLaborCost;
    currentCount = state.gpuFactories;
    limit = BALANCE.gpuFactoryLimit;
  } else if (type === 'rocketFactory') {
    cost = BALANCE.rocketFactoryCost;
    labor = BALANCE.rocketFactoryLaborCost;
    currentCount = state.rocketFactories;
    limit = BALANCE.rocketFactoryLimit;
  } else if (type === 'gpuSatelliteFactory') {
    cost = BALANCE.gpuSatelliteFactoryCost;
    labor = BALANCE.gpuSatelliteFactoryLaborCost;
    currentCount = state.gpuSatelliteFactories;
    limit = BALANCE.gpuSatelliteFactoryLimit;
  }
  
  if (currentCount + amountB > toBigInt(limit)) return false; // Limit check

  const totalCost = mulB(amountB, cost);
  const totalLabor = mulB(amountB, labor);
  
  if (state.funds < totalCost) return false;
  if (state.labor < totalLabor) return false;
  
  state.funds -= totalCost;
  state.labor -= totalLabor;
  
  if (type === 'materialMine') state.materialMines += amountB;
  else if (type === 'solarFactory') state.solarFactories += amountB;
  else if (type === 'robotFactory') state.robotFactories += amountB;
  else if (type === 'gpuFactory') state.gpuFactories += amountB;
  else if (type === 'rocketFactory') state.rocketFactories += amountB;
  else if (type === 'gpuSatelliteFactory') state.gpuSatelliteFactories += amountB;
  
  return true;
}
