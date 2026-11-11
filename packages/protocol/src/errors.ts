export const ERROR_CODES = [
  'PROTOCOL_MISMATCH',
  'INVALID_PAYLOAD',
  'SESSION_INVALID',
  'ROOM_NOT_FOUND',
  'ROOM_FULL',
  'ROOM_IN_PROGRESS',
  'NOT_IN_ROOM',
  'NOT_HOST',
  'SEAT_OCCUPIED',
  'JOB_TAKEN',
  'NOT_READY',
  'NOT_YOUR_TURN',
  'STALE_VERSION',
  'ILLEGAL_ACTION',
  'MODEL_NOT_FOUND',
  'RATE_LIMITED',
  'INTERNAL',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export type Ack<T> = { ok: true; data: T } | { ok: false; error: { code: ErrorCode; message: string } };

export const ok = <T>(data: T): Ack<T> => ({ ok: true, data });
export const fail = (code: ErrorCode, message: string = code): Ack<never> => ({ ok: false, error: { code, message } });
