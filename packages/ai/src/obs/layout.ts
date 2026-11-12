export const OBS_VERSION = 'obs_v4';

export const OBS_V3_SCALES = {
  HP_S: 120,
  ATK_S: 20,
  DEF_S: 20,
  COIN_S: 50,
  LVL_S: 10,
  ITEM_S: 3,
  ROUND_S: 100,
  GRACE_S: 3,
  CD_S: 2,
  TP_S: 2,
  DIST_S: 23,
} as const;

export interface ObsField {
  readonly name: string;
  readonly offset: number;
  readonly length: number;
}

const SELF_FIELDS: [string, number][] = [
  ['self.job', 5],
  ['self.pos', 24],
  ['self.hp', 1],
  ['self.maxHp', 1],
  ['self.hpRatio', 1],
  ['self.atk', 1],
  ['self.def', 1],
  ['self.coins', 1],
  ['self.upgradeLvl', 3],
  ['self.upgradeCost', 3],
  ['self.itemCount', 3],
  ['self.hasItem', 3],
  ['self.skipNextTurn', 1],
  ['self.indomitableReady', 1],
  ['self.rageActive', 1],
  ['self.ninjaCooldown', 1],
];

const OPP_FIELDS: [string, number][] = [
  ['present', 1],
  ['alive', 1],
  ['job', 5],
  ['pos', 24],
  ['fwdDist', 1],
  ['sameTile', 1],
  ['iCanReach', 1],
  ['canReachMe', 1],
  ['hp', 1],
  ['maxHp', 1],
  ['hpRatio', 1],
  ['atk', 1],
  ['def', 1],
  ['coins', 1],
  ['upgradeLvl', 3],
  ['itemCount', 3],
  ['hasItem', 3],
  ['skipNextTurn', 1],
  ['indomitableReady', 1],
  ['rageActive', 1],
  ['ninjaCooldown', 1],
];

const GLOBAL_FIELDS: [string, number][] = [
  ['g.round', 1],
  ['g.maxRounds', 1],
  ['g.roundsLeftFrac', 1],
  ['g.graceLeft', 1],
  ['g.pvpEnabled', 1],
  ['g.numPlayers', 3],
  ['g.aliveCount', 1],
  ['g.phase', 6],
  ['g.turnPlayer', 4],
  ['g.dice', 10],
  ['g.canBuy', 1],
  ['g.thiefUsed', 1],
  ['g.teleportsUsed', 1],
  ['g.teleportLimitReached', 1],
  ['g.pvpAmArriver', 1],
  ['g.pvpAmDefender', 1],
  ['g.pvpOpponent', 3],
  ['g.dragonHp', 1],
  ['g.dragonAtk', 1],
  ['g.dragonDef', 1],
  ['g.itemPrice', 3],
  ['g.paidUpgradesRemaining', 1],
];

function buildLayout(): ObsField[] {
  const out: ObsField[] = [];
  let offset = 0;
  const push = (name: string, length: number) => {
    out.push({ name, offset, length });
    offset += length;
  };
  for (const [name, len] of SELF_FIELDS) push(name, len);
  for (let k = 1; k <= 3; k++) for (const [name, len] of OPP_FIELDS) push(`opp${k}.${name}`, len);
  for (const [name, len] of GLOBAL_FIELDS) push(name, len);
  return out;
}

export const OBS_V3_LAYOUT: readonly ObsField[] = buildLayout();
/** Legacy obs_v2 layout ended at offset 256; all new fields are appended after it. */
export const OBS_V2_LAYOUT: readonly ObsField[] = OBS_V3_LAYOUT.slice(0, -1);
/** The existing scale constants are unchanged in obs_v3. */
export const OBS_V2_SCALES = OBS_V3_SCALES;
export const OBS_V4_SCALES = {
  ...OBS_V3_SCALES,
  TILE_COIN_S: 20,
  TILE_HP_S: 20,
  TILE_ATK_S: 5,
  TILE_DEF_S: 5,
  TILE_MAX_HP_S: 10,
} as const;
export const SELF_BLOCK = 51;
export const OPP_BLOCK = 54;
export const GLOBAL_OFFSET = SELF_BLOCK + OPP_BLOCK * 3;
export const BOARD_OFFSET = GLOBAL_OFFSET + 45;
export const TILE_BLOCK = 10;

const TILE_FIELDS = [
  'coins',
  'hp',
  'atk',
  'def',
  'maxHp',
  'skipTurn',
  'randomItem',
  'training',
  'shop',
  'mystery',
] as const;

export const OBS_V4_LAYOUT: readonly ObsField[] = [
  ...OBS_V3_LAYOUT,
  ...Array.from({ length: 24 }, (_, tile) =>
    TILE_FIELDS.map((name, field) => ({
      name: `tile${String(tile).padStart(2, '0')}.${name}`,
      offset: BOARD_OFFSET + tile * TILE_BLOCK + field,
      length: 1,
    })),
  ).flat(),
];
export const OBS_DIM = BOARD_OFFSET + 24 * TILE_BLOCK;
