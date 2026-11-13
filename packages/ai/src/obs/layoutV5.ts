import { OBS_DIM, OBS_V4_LAYOUT, OBS_V4_SCALES, type ObsField } from './layout';

export const OBS_VERSION = 'obs_v5';
export { BOARD_OFFSET, GLOBAL_OFFSET, OPP_BLOCK, SELF_BLOCK, TILE_BLOCK } from './layout';
export { OBS_DIM };
export const OBS_V5_SCALES = OBS_V4_SCALES;
export const OBS_V5_LAYOUT: readonly ObsField[] = OBS_V4_LAYOUT.map((field) =>
  field.name === 'g.thiefUsed' ? { ...field, name: 'g.itemsBoughtRemaining' } : field,
);
