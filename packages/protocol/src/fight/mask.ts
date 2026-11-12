/**
 * Canonical 7-bit fight input mask: `move(0..8) | attack<<4 | skill<<5 | dash<<6`.
 * Wire format shared by fighters, the server, bots, replays and the network simulator.
 */
export const MOVE_NIBBLE = 0x0f;
export const MASK_ATTACK = 0x10;
export const MASK_SKILL = 0x20;
export const MASK_DASH = 0x40;
export const MASK_BUTTONS = MASK_ATTACK | MASK_SKILL | MASK_DASH;
export const MAX_MASK = 0x7f;

export function isValidMask(m: unknown): m is number {
  return typeof m === 'number' && Number.isInteger(m) && m >= 0 && m <= MAX_MASK && (m & MOVE_NIBBLE) <= 8;
}
