import { NO_INPUT, type FighterInput, type MoveDir } from '@dragon-rush/combat';
import { isValidMask, MASK_ATTACK, MASK_DASH, MASK_SKILL, MOVE_NIBBLE } from '@dragon-rush/protocol';
import { DECAY_RUN } from './constants';

/** Precomputed frozen inputs for all 128 byte values (invalid nibbles map to NO_INPUT; decoders reject them). */
const TABLE: readonly FighterInput[] = Array.from({ length: 128 }, (_, m) =>
  isValidMask(m)
    ? Object.freeze({
        move: (m & MOVE_NIBBLE) as MoveDir,
        attack: (m & MASK_ATTACK) !== 0,
        skill: (m & MASK_SKILL) !== 0,
        dash: (m & MASK_DASH) !== 0,
      })
    : NO_INPUT,
);

/** The only mask -> FighterInput conversion (server, clients, bots, replays, netsim). */
export function maskToInput(m: number): FighterInput {
  return TABLE[m & 0x7f] ?? NO_INPUT;
}

/** The only FighterInput -> mask conversion. Out-of-range moves become 0 (the sim does the same). */
export function inputToMask(i: FighterInput): number {
  const move = Number.isInteger(i.move) && i.move >= 0 && i.move <= 8 ? i.move : 0;
  return move | (i.attack ? MASK_ATTACK : 0) | (i.skill ? MASK_SKILL : 0) | (i.dash ? MASK_DASH : 0);
}

/**
 * Server substitution for a missing human mask. `run` counts consecutive substituted ticks including this one.
 * Buttons stay held (no press, no release: releasing would fire the archer's draw); movement goes neutral after
 * DECAY_RUN ticks so a stalled fighter does not walk into the ring of fire.
 */
export function substitute(lastReal: number, run: number): number {
  return run <= DECAY_RUN ? lastReal : lastReal & ~MOVE_NIBBLE;
}
