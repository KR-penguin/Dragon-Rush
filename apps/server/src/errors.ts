import type { ErrorCode } from '@dragon-rush/protocol';

export class ProtocolError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string = code,
  ) {
    super(message);
  }
}
