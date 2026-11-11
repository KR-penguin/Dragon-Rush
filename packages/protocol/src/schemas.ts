import { ITEM_IDS, JOB_IDS, UPGRADE_STATS, type Action } from '@dragon-rush/engine';
import { z } from 'zod';

const seatId = z.number().int().min(0).max(3);
const stat = z.enum(UPGRADE_STATS);

export const ActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ROLL_DICE') }).strict(),
  z.object({ type: z.literal('END_TURN') }).strict(),
  z.object({ type: z.literal('CHALLENGE_DRAGON') }).strict(),
  z.object({ type: z.literal('UPGRADE'), stat }).strict(),
  z.object({ type: z.literal('CHOOSE_TRAINING_STAT'), stat }).strict(),
  z.object({ type: z.literal('BUY_ITEM'), item: z.enum(ITEM_IDS) }).strict(),
  z.object({ type: z.literal('USE_TELEPORT'), tile: z.number().int().min(0).max(23) }).strict(),
  z.object({ type: z.literal('USE_THIEF'), target: seatId }).strict(),
  z.object({ type: z.literal('CHOOSE_PVP_TARGET'), target: seatId }).strict(),
  z.object({ type: z.literal('ADJUST_MOVE'), delta: z.union([z.literal(-1), z.literal(0), z.literal(1)]) }).strict(),
  z.object({ type: z.literal('SHIELD_DECISION'), use: z.boolean() }).strict(),
]);

// Compile-time check: the schema and the engine Action type must stay identical.
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const _actionSchemaMatchesEngine: Equal<z.infer<typeof ActionSchema>, Action> = true;
void _actionSchemaMatchesEngine;

export const NicknameSchema = z
  .string()
  .trim()
  .min(1)
  .max(16)
  .refine((s) => !/[<>{}]/.test(s) && [...s].every((ch) => ch.charCodeAt(0) >= 0x20), 'invalid characters');

export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const roomCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);

export const HandshakeAuthSchema = z.object({
  protocolVersion: z.number().int(),
  sessionToken: z.string().regex(/^[0-9a-f]{32}$/).optional(),
});

export const RoomCreateSchema = z.object({ nickname: NicknameSchema }).strict();
export const RoomJoinSchema = z.object({ roomCode, nickname: NicknameSchema }).strict();
export const RoomLeaveSchema = z.object({}).strict();
export const RoomConfigureSchema = z.object({ maxRounds: z.number().int().min(1).max(500).nullable() }).strict();
export const RoomConfigureSeatSchema = z
  .object({
    seat: seatId,
    kind: z.enum(['human', 'bot', 'model', 'empty']),
    botName: z.enum(['heuristic', 'heuristic:aggro', 'heuristic:growth', 'heuristic:rush', 'random']).optional(),
    modelId: z.string().regex(/^[a-z0-9_-]{1,64}$/).optional(),
  })
  .strict();
export const RoomSelectJobSchema = z.object({ job: z.enum(JOB_IDS).nullable(), seat: seatId.optional() }).strict();
export const RoomSetReadySchema = z.object({ ready: z.boolean() }).strict();
export const RoomStartSchema = z.object({}).strict();
export const GameActionSchema = z.object({ action: ActionSchema, stateVersion: z.number().int().min(0) }).strict();
export const GameRequestSnapshotSchema = z.object({}).strict();

export type HandshakeAuth = z.infer<typeof HandshakeAuthSchema>;
export type RoomCreate = z.infer<typeof RoomCreateSchema>;
export type RoomJoin = z.infer<typeof RoomJoinSchema>;
export type RoomConfigure = z.infer<typeof RoomConfigureSchema>;
export type RoomConfigureSeat = z.infer<typeof RoomConfigureSeatSchema>;
export type RoomSelectJob = z.infer<typeof RoomSelectJobSchema>;
export type RoomSetReady = z.infer<typeof RoomSetReadySchema>;
export type GameActionPayload = z.infer<typeof GameActionSchema>;
