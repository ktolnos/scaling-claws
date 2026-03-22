import type { FacilityId } from '../../game/GameState.ts';
import {
  datacenterBuildingSvg,
  dysonSwarmFacilitySvg,
  gasPlantSvg,
  gpuFactorySvg,
  gpuSatelliteFactorySvg,
  massDriverSvg,
  nuclearPlantSvg,
  robotFactorySvg,
  rocketSiloSvg,
  siliconMineSvg,
  solarFarmSvg,
  solarPanelFactorySvg,
  probeFactorySvg,
} from '../../assets/sprites.ts';

type FacilityCardIconKey =
  | FacilityId
  | 'gasPlant'
  | 'nuclearPlant'
  | 'solarFarm'
  | 'moonDatacenter';

const FACILITY_CARD_ICON_MAP: Record<FacilityCardIconKey, string> = {
  earthMaterialMine: siliconMineSvg,
  moonMaterialMine: siliconMineSvg,
  mercuryMaterialMine: siliconMineSvg,
  earthSolarFactory: solarPanelFactorySvg,
  moonSolarFactory: solarPanelFactorySvg,
  earthRobotFactory: robotFactorySvg,
  moonRobotFactory: robotFactorySvg,
  mercuryRobotFactory: robotFactorySvg,
  earthGpuFactory: gpuFactorySvg,
  moonGpuFactory: gpuFactorySvg,
  earthRocketFactory: rocketSiloSvg,
  earthGpuSatelliteFactory: gpuSatelliteFactorySvg,
  moonGpuSatelliteFactory: gpuSatelliteFactorySvg,
  mercuryDysonSwarmFacility: dysonSwarmFacilitySvg,
  mercuryProbeFactory: probeFactorySvg,
  moonMassDriver: massDriverSvg,
  gasPlant: gasPlantSvg,
  nuclearPlant: nuclearPlantSvg,
  solarFarm: solarFarmSvg,
  moonDatacenter: datacenterBuildingSvg,
};

export function getFacilityCardIconSvg(icon: FacilityCardIconKey): string {
  return FACILITY_CARD_ICON_MAP[icon];
}
