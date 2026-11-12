import { isValidMask } from './mask';

/**
 * Hot-path fight messages are flat JSON integer arrays (one WebSocket frame each). The field order is the
 * canonical byte layout of combat-design §9; a later binary transport reuses the same order.
 * Decoders take `unknown` and return null on anything malformed (never throw).
 */

export const MAX_INPUT_MASKS = 16;
export const MAX_RELAY_MASKS = 16;
export const MAX_CONFIRM_TICKS = 32;

const U32_MAX = 0xffffffff;
const I32_MIN = -0x80000000;
const I32_MAX = 0x7fffffff;

/** Per-tick confirm flags. */
export const CONFIRM_SUBST_A = 1;
export const CONFIRM_SUBST_B = 2;
export const CONFIRM_BOT_A = 4;
export const CONFIRM_BOT_B = 8;
export const CONFIRM_TERMINAL = 16;
export const CONFIRM_HELD = 32;
export const CONFIRM_FLAGS_MAX = 63;

/** Quality per seat in `fight:confirm` (2 bits each). */
export type SeatQuality = 0 | 1 | 2;

export interface FightInputPacket {
  readonly fightId: number;
  /** Tick of masks[0]; masks[i] belongs to newestTick - i. Pre-roll ticks are <= 0. */
  readonly newestTick: number;
  /** Highest contiguous confirm tick this client has received (backlog control). */
  readonly ackConfirmTick: number;
  readonly masks: readonly number[];
}

export interface FightRelayPacket {
  readonly fightId: number;
  readonly seat: 0 | 1;
  readonly newestTick: number;
  /** Contiguous run, newest first. */
  readonly masks: readonly number[];
}

export interface ConfirmedTick {
  readonly a: number;
  readonly b: number;
  readonly flags: number;
}

export interface FightConfirmPacket {
  readonly fightId: number;
  readonly firstTick: number;
  /** Recipient's median arrival slack over the last 0.5 s (0 for spectators). */
  readonly slackMedMs: number;
  /** Recipient's uplink jitter estimate. */
  readonly jitUpMs: number;
  /** Bits 0-1 seat 0, bits 2-3 seat 1. */
  readonly quality: number;
  /** -1 = no hash in this batch. */
  readonly hashTick: number;
  readonly hash: number;
  /** Ticks firstTick .. firstTick + ticks.length - 1 (may be empty: a timing-only confirm). */
  readonly ticks: readonly ConfirmedTick[];
}

export interface FightAckPacket {
  readonly fightId: number;
  readonly tick: number;
}

export interface FightPingPacket {
  readonly pingId: number;
  readonly clientMs: number;
}

export interface FightPongPacket {
  readonly pingId: number;
  readonly clientMs: number;
  readonly serverRecvMs: number;
  readonly serverSendMs: number;
}

const isInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
const isFiniteNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export const qualityOf = (q: number, seat: 0 | 1): SeatQuality =>
  ((q >> (seat * 2)) & 3) as SeatQuality;
export const packQuality = (a: SeatQuality, b: SeatQuality): number => a | (b << 2);

export function encodeFightInput(p: FightInputPacket): number[] {
  return [p.fightId, p.newestTick, p.ackConfirmTick, ...p.masks];
}

export function decodeFightInput(raw: unknown): FightInputPacket | null {
  if (!Array.isArray(raw) || raw.length < 4 || raw.length > 3 + MAX_INPUT_MASKS) return null;
  const [fightId, newestTick, ackConfirmTick] = raw as unknown[];
  if (
    !isInt(fightId, 0, U32_MAX) ||
    !isInt(newestTick, I32_MIN, I32_MAX) ||
    !isInt(ackConfirmTick, I32_MIN, I32_MAX)
  ) {
    return null;
  }
  const masks: number[] = [];
  for (let i = 3; i < raw.length; i++) {
    const m: unknown = raw[i];
    if (!isValidMask(m)) return null;
    masks.push(m);
  }
  return { fightId, newestTick, ackConfirmTick, masks };
}

export function encodeFightRelay(p: FightRelayPacket): number[] {
  return [p.fightId, p.seat, p.newestTick, ...p.masks];
}

export function decodeFightRelay(raw: unknown): FightRelayPacket | null {
  if (!Array.isArray(raw) || raw.length < 4 || raw.length > 3 + MAX_RELAY_MASKS) return null;
  const [fightId, seat, newestTick] = raw as unknown[];
  if (!isInt(fightId, 0, U32_MAX) || !isInt(seat, 0, 1) || !isInt(newestTick, I32_MIN, I32_MAX))
    return null;
  const masks: number[] = [];
  for (let i = 3; i < raw.length; i++) {
    const m: unknown = raw[i];
    if (!isValidMask(m)) return null;
    masks.push(m);
  }
  return { fightId, seat: seat as 0 | 1, newestTick, masks };
}

export function encodeFightConfirm(p: FightConfirmPacket): number[] {
  const out = [p.fightId, p.firstTick, p.slackMedMs, p.jitUpMs, p.quality, p.hashTick, p.hash];
  for (const t of p.ticks) out.push(t.a, t.b, t.flags);
  return out;
}

export function decodeFightConfirm(raw: unknown): FightConfirmPacket | null {
  if (!Array.isArray(raw) || raw.length < 7 || (raw.length - 7) % 3 !== 0) return null;
  if ((raw.length - 7) / 3 > MAX_CONFIRM_TICKS) return null;
  const [fightId, firstTick, slackMedMs, jitUpMs, quality, hashTick, hash] = raw as unknown[];
  if (
    !isInt(fightId, 0, U32_MAX) ||
    !isInt(firstTick, I32_MIN, I32_MAX) ||
    !isInt(slackMedMs, -32768, 32767) ||
    !isInt(jitUpMs, 0, 255) ||
    !isInt(quality, 0, 15) ||
    !isInt(hashTick, -1, I32_MAX) ||
    !isInt(hash, 0, U32_MAX)
  ) {
    return null;
  }
  const ticks: ConfirmedTick[] = [];
  for (let i = 7; i < raw.length; i += 3) {
    const a: unknown = raw[i];
    const b: unknown = raw[i + 1];
    const flags: unknown = raw[i + 2];
    if (!isValidMask(a) || !isValidMask(b) || !isInt(flags, 0, CONFIRM_FLAGS_MAX)) return null;
    ticks.push({ a, b, flags });
  }
  return { fightId, firstTick, slackMedMs, jitUpMs, quality, hashTick, hash, ticks };
}

export const encodeFightAck = (p: FightAckPacket): number[] => [p.fightId, p.tick];

export function decodeFightAck(raw: unknown): FightAckPacket | null {
  if (!Array.isArray(raw) || raw.length !== 2) return null;
  const [fightId, tick] = raw as unknown[];
  if (!isInt(fightId, 0, U32_MAX) || !isInt(tick, I32_MIN, I32_MAX)) return null;
  return { fightId, tick };
}

export const encodeFightPing = (p: FightPingPacket): number[] => [p.pingId, p.clientMs];

export function decodeFightPing(raw: unknown): FightPingPacket | null {
  if (!Array.isArray(raw) || raw.length !== 2) return null;
  const [pingId, clientMs] = raw as unknown[];
  if (!isInt(pingId, 0, 0xffff) || !isFiniteNum(clientMs)) return null;
  return { pingId, clientMs };
}

export const encodeFightPong = (p: FightPongPacket): number[] => [
  p.pingId,
  p.clientMs,
  p.serverRecvMs,
  p.serverSendMs,
];

export function decodeFightPong(raw: unknown): FightPongPacket | null {
  if (!Array.isArray(raw) || raw.length !== 4) return null;
  const [pingId, clientMs, serverRecvMs, serverSendMs] = raw as unknown[];
  if (
    !isInt(pingId, 0, 0xffff) ||
    !isFiniteNum(clientMs) ||
    !isFiniteNum(serverRecvMs) ||
    !isFiniteNum(serverSendMs)
  ) {
    return null;
  }
  return { pingId, clientMs, serverRecvMs, serverSendMs };
}
