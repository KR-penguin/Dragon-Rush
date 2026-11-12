export const COBS_VERSION = 'cobs_v1';
export const COBS_DIM = 160;

/**
 * Normalisation constants (docs/combat-ai-spec.md §4). The arena width W and height H are read from the state
 * (duel 800 x 448, dragon fight 896 x 448) so both modes share one layout.
 */
export const COBS_V1_SCALES = {
  /** px/s: fighter, relative and dragon velocities. */
  V_S: 720,
  /** px/s: projectile velocities. */
  PV_S: 960,
  HP_S: 100,
  STAT_S: 20,
  /** ticks: time until a hazard turns active. */
  T_S: 60,
  /** px: hazard radius. */
  R_S: 64,
  /** px: duel fire ring radius. */
  RING_S: 460,
  /** ticks: reaction delay. */
  DELAY_S: 18,
  /** ticks: remaining hitstun. */
  HITSTUN_S: 30,
  /** Damaging dragon maneuvers left before the forced Breath. */
  BREATH_S: 2,
} as const;

export interface CobsField {
  readonly name: string;
  readonly offset: number;
  readonly length: number;
}

export const THREAT_SLOTS = 6;
export const THREAT_WIDTH = 9;

const FIELDS: readonly (readonly [string, number])[] = [
  // self block (36)
  ['self.stats', 4],
  ['self.job', 5],
  ['self.state', 7],
  ['self.stateInfo', 2],
  ['self.cooldowns', 4],
  ['self.flags', 8],
  ['self.vel', 2],
  ['self.facing', 2],
  ['self.pos', 2],
  // opponent block (38): the other fighter, or the dragon in a dragon fight
  ['opp.rel', 3],
  ['opp.motion', 4],
  ['opp.stats', 4],
  ['opp.type', 6],
  ['opp.state', 8],
  ['opp.moveKind', 4],
  ['opp.flags', 6],
  ['opp.ready', 3],
  // dragon block (15), zero in a duel
  ['dragon.phase', 3],
  ['dragon.maneuver', 7],
  ['dragon.stage', 3],
  ['dragon.telegraphAim', 2],
  // threat slots (6 x 9)
  ...Array.from({ length: THREAT_SLOTS }, (_, k) => [`threat${k}`, THREAT_WIDTH] as const),
  // global block (17)
  ['g.match', 4],
  ['g.prevMove', 9],
  ['g.prevButton', 4],
];

function buildLayout(): CobsField[] {
  const out: CobsField[] = [];
  let offset = 0;
  for (const [name, length] of FIELDS) {
    out.push(Object.freeze({ name, offset, length }));
    offset += length;
  }
  if (offset !== COBS_DIM)
    throw new Error(`cobs_v1 layout sums to ${offset}, expected ${COBS_DIM}`);
  return out;
}

export const COBS_V1_LAYOUT: readonly CobsField[] = Object.freeze(buildLayout());

function offsetOf(name: string): number {
  const f = COBS_V1_LAYOUT.find((x) => x.name === name);
  if (!f) throw new Error(`unknown cobs field ${name}`);
  return f.offset;
}

/** Absolute offsets of every field (encoder and mirror helpers index through these). */
export const O = Object.freeze({
  selfStats: offsetOf('self.stats'),
  selfJob: offsetOf('self.job'),
  selfState: offsetOf('self.state'),
  selfStateInfo: offsetOf('self.stateInfo'),
  selfCooldowns: offsetOf('self.cooldowns'),
  selfFlags: offsetOf('self.flags'),
  selfVel: offsetOf('self.vel'),
  selfFacing: offsetOf('self.facing'),
  selfPos: offsetOf('self.pos'),
  oppRel: offsetOf('opp.rel'),
  oppMotion: offsetOf('opp.motion'),
  oppStats: offsetOf('opp.stats'),
  oppType: offsetOf('opp.type'),
  oppState: offsetOf('opp.state'),
  oppMoveKind: offsetOf('opp.moveKind'),
  oppFlags: offsetOf('opp.flags'),
  oppReady: offsetOf('opp.ready'),
  dragonPhase: offsetOf('dragon.phase'),
  dragonManeuver: offsetOf('dragon.maneuver'),
  dragonStage: offsetOf('dragon.stage'),
  dragonAim: offsetOf('dragon.telegraphAim'),
  threats: offsetOf('threat0'),
  gMatch: offsetOf('g.match'),
  gPrevMove: offsetOf('g.prevMove'),
  gPrevButton: offsetOf('g.prevButton'),
});

/** Block starts: self 0 / opponent 36 / dragon 74 / threats 89 / global 143. */
export const COBS_V1_BLOCKS = Object.freeze({
  self: 0,
  opp: 36,
  dragon: 74,
  threats: 89,
  global: 143,
});

/** One-hot groups whose sum is always 0 or 1 (tests and debugging). */
export const COBS_V1_ONE_HOTS: readonly string[] = [
  'self.job',
  'self.state',
  'opp.type',
  'opp.moveKind',
  'dragon.phase',
  'dragon.maneuver',
  'g.prevMove',
  'g.prevButton',
];

/** Fighter state one-hot order (self.state, opp.state[0..6]). */
export const STATE_NAMES = [
  'idle',
  'move',
  'startup',
  'active',
  'recovery',
  'dash',
  'hitstun',
] as const;
/** opp.moveKind order. */
export const MOVE_KIND_NAMES = ['none', 'light', 'heavy', 'skill'] as const;
/** dragon.maneuver order ('volley' is the fireball volley). */
export const MANEUVER_NAMES = [
  'claw',
  'tail',
  'volley',
  'charge',
  'gust',
  'breath',
  'dive',
] as const;
