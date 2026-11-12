import { describe, expect, it } from 'vitest';
import {
  decodeFightConfirm,
  decodeFightInput,
  decodeFightRelay,
  encodeFightConfirm,
  encodeFightInput,
  encodeFightRelay,
  isValidMask,
  FightReadySchema,
} from '../src/index';

describe('fight wire boundary', () => {
  it('round-trips input, relay and confirmed batches', () => {
    const input = {
      fightId: 0xffffffff,
      newestTick: 15,
      ackConfirmTick: 12,
      masks: [0x13, 0x03, 0],
    };
    expect(decodeFightInput(encodeFightInput(input))).toEqual(input);
    const relay = { fightId: 7, seat: 1 as const, newestTick: 20, masks: [0x15, 0x05] };
    expect(decodeFightRelay(encodeFightRelay(relay))).toEqual(relay);
    const confirm = {
      fightId: 7,
      firstTick: 19,
      slackMedMs: -4,
      jitUpMs: 15,
      quality: 2,
      hashTick: 20,
      hash: 0xffffffff,
      ticks: [
        { a: 0x13, b: 0x15, flags: 0 },
        { a: 0, b: 5, flags: 16 },
      ],
    };
    expect(decodeFightConfirm(encodeFightConfirm(confirm))).toEqual(confirm);
  });

  it('rejects every invalid mask and malformed hot-path packet', () => {
    for (let mask = 0; mask < 256; mask++) {
      const valid = mask < 128 && (mask & 15) <= 8;
      expect(isValidMask(mask)).toBe(valid);
      expect(decodeFightInput([7, 1, 0, mask]) !== null).toBe(valid);
    }
    expect(decodeFightInput([7, 1, 0])).toBeNull();
    expect(decodeFightInput([7, 1.5, 0, 0])).toBeNull();
    expect(decodeFightInput([7, 1, 0, ...new Array(17).fill(0)])).toBeNull();
    expect(decodeFightRelay([7, 2, 1, 0])).toBeNull();
    expect(decodeFightConfirm([7, 1, 0, 0, 0, -1, 0, 0, 0])).toBeNull();
    expect(
      FightReadySchema.safeParse({ fightId: 7, inputDelay: 9, rttMs: 0, jitterMs: 0 }).success,
    ).toBe(false);
  });
});
