import { describe, expect, it } from 'vitest';
import { ActionSchema, PROTOCOL_VERSION } from '../src/index';

describe('item action contract', () => {
  it('versions the removed thief action and accepts the prince totem purchase', () => {
    expect(PROTOCOL_VERSION).toBe(3);
    expect(ActionSchema.parse({ type: 'BUY_ITEM', item: 'princeTotem' })).toEqual({
      type: 'BUY_ITEM',
      item: 'princeTotem',
    });
    expect(ActionSchema.safeParse({ type: 'BUY_ITEM', item: 'thief' }).success).toBe(false);
    expect(ActionSchema.safeParse({ type: 'USE_THIEF', target: 1 }).success).toBe(false);
  });
});
