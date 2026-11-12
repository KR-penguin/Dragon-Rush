export {
  playGame,
  runBatch,
  deriveSeed,
  randomJobs,
  autoResolveCombat,
  type GameRecord,
  type BatchOptions,
} from './runner';
export { summarize, formatMetrics, type Metrics } from './metrics';
export { EnvServer, ENV_PROTOCOL } from './env/envServer';
export { EnvInstance, EnvError, type Transition } from './env/envInstance';
export {
  createCombatResolver,
  COMBAT_RESOLVERS,
  type CombatResolver,
  type CombatResolverName,
  type FightLog,
} from './combatResolver';
export { statDistFromRecords, StatDistSchema, STAT_DIST_VERSION, type StatDist } from './statDist';
export { CombatEnvServer, COMBAT_ENV_PROTOCOL } from './combat-env/server';
export {
  CombatEnvInstance,
  type CombatTransition,
  type CombatOutcomeInfo,
} from './combat-env/instance';
export { CombatEnvConfigSchema, type CombatEnvConfig } from './combat-env/config';
export {
  sampleEpisode,
  sampleFighter,
  parseStatSampler,
  UNIFORM_BOARD,
  CombatEnvError,
} from './combat-env/sampler';
export {
  generateOutcomeRows,
  fitOutcomeModel,
  outcomeCalibration,
  sampleOutcomeResult,
  outcomeDamage,
  type OutcomeRow,
  type CalibrationReport,
} from './outcome';
export { loadOutcomeModel } from './outcome/load';
