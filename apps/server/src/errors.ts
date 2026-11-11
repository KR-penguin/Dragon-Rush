import type { ErrorCode } from '@hero-dice/protocol';

export class ProtocolError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string = code,
  ) {
    super(message);
  }
}
