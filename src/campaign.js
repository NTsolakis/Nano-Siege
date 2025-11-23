import { MAPS } from './maps.js';
import { buildWave as buildEndlessWave } from './waves.js';

// Assembly War mission table. Each mission can use its own map
// and a fixed number of waves so campaign balance can diverge
// from Endless Cycle.
export const ASSEMBLY_MISSIONS = [
  {
    id: 1,
    key: 'system_boot',
    name: 'System Boot',
    mapKey: 'corridor',
    waves: 10
  },
  {
    id: 2,
    key: 'subroutine_siege',
    name: 'Subroutine Siege',
    mapKey: 'lab',
    waves: 15
  },
  {
    id: 3,
    key: 'corruption_bloom',
    name: 'Corruption Bloom',
    mapKey: 'delta',
    waves: 20
  },
  {
    id: 4,
    key: 'dual_core_defense',
    name: 'Dual Core Defense',
    mapKey: 'nexus',
    waves: 25
  },
  {
    id: 5,
    key: 'overmind_ascendant',
    name: 'Overmind Ascendant',
    mapKey: 'spire',
    waves: 30
  },
  {
    id: 6,
    key: 'cascade_protocol',
    name: 'Cascade Protocol',
    mapKey: 'cascade',
    // Placeholder: treat final boss mission as 30 waves for now.
    waves: 30
  }
];

export function getMissionById(id){
  return ASSEMBLY_MISSIONS.find(m => m.id === id) || null;
}

export function getMissionMap(id){
  const mission = getMissionById(id);
  if(!mission) return null;
  const map = MAPS.find(m => m.key === mission.mapKey);
  return map || null;
}

export function getMissionTotalWaves(id){
  const mission = getMissionById(id);
  return mission ? mission.waves : null;
}

// Separate wave builder for Assembly War. For now this still
// delegates to the Endless generator so balance stays familiar,
// but it can be tailored per-mission later.
export function buildMissionWave(id, waveNumber){
  // eslint-disable-next-line no-unused-vars
  const mission = getMissionById(id);
  return buildEndlessWave(waveNumber);
}

