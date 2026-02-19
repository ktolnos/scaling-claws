import type { JobType } from '../BalanceConfig.ts';
import { BALANCE, getJobProductionMultiplier } from '../BalanceConfig.ts';
import type { GameState } from '../GameState.ts';
import { mulB, toBigInt } from '../utils.ts';

export function getJobOutputAmount(state: GameState, jobType: JobType, baseAmount: bigint): bigint {
  return mulB(baseAmount, toBigInt(getJobProductionMultiplier(state.completedResearch, jobType)));
}

export function getRobotLaborPerMin(state: GameState): bigint {
  return mulB(BALANCE.robotLaborPerMinBase, toBigInt(getJobProductionMultiplier(state.completedResearch, 'robotWorker')));
}
