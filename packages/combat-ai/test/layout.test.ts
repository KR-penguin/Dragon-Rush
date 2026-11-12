import { describe, expect, it } from 'vitest';
import {
  CACT_FLAT_DIM,
  CACT_NAMES,
  CACT_NVEC,
  CACT_V1_NAMES,
  COBS_DIM,
  COBS_V1_BLOCKS,
  COBS_V1_LAYOUT,
  COBS_VERSION,
  CACT_VERSION,
} from '../src/index';

describe('cobs_v1 layout', () => {
  it('is contiguous and sums to 160', () => {
    let offset = 0;
    for (const f of COBS_V1_LAYOUT) {
      expect(f.offset).toBe(offset);
      expect(f.length).toBeGreaterThan(0);
      offset += f.length;
    }
    expect(offset).toBe(COBS_DIM);
    expect(COBS_DIM).toBe(160);
    expect(COBS_VERSION).toBe('cobs_v1');
  });

  it('keeps the spec block starts and field names unique', () => {
    const at = (name: string) => COBS_V1_LAYOUT.find((f) => f.name === name)!.offset;
    expect(at('self.stats')).toBe(COBS_V1_BLOCKS.self);
    expect(at('opp.rel')).toBe(COBS_V1_BLOCKS.opp);
    expect(at('dragon.phase')).toBe(COBS_V1_BLOCKS.dragon);
    expect(at('threat0')).toBe(COBS_V1_BLOCKS.threats);
    expect(at('g.match')).toBe(COBS_V1_BLOCKS.global);
    expect(COBS_V1_BLOCKS).toEqual({ self: 0, opp: 36, dragon: 74, threats: 89, global: 143 });
    expect(at('g.prevButton')).toBe(156);
    expect(new Set(COBS_V1_LAYOUT.map((f) => f.name)).size).toBe(COBS_V1_LAYOUT.length);
  });
});

describe('cact_v1 names', () => {
  it('has 9 moves, 4 buttons and 36 flat names in move * 4 + button order', () => {
    expect(CACT_VERSION).toBe('cact_v1');
    expect(CACT_NVEC).toEqual([9, 4]);
    expect(CACT_V1_NAMES.move).toHaveLength(9);
    expect(CACT_V1_NAMES.button).toHaveLength(4);
    expect(CACT_NAMES).toHaveLength(CACT_FLAT_DIM);
    expect(CACT_NAMES[2 * 4 + 1]).toBe('NE+attack');
    expect(CACT_NAMES[0]).toBe('none+none');
    expect(CACT_NAMES[35]).toBe('NW+dash');
  });
});
