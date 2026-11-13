import { EventEmitter } from 'node:events';
import { C2S } from '@dragon-rush/protocol';
import { expect, it, vi } from 'vitest';
import { OnlineGameClient } from '../src/services/OnlineGameClient';
import type { OnlineSession } from '../src/services/onlineSession';

it('contains a snapshot acknowledgement rejection when the socket disconnects during disposal', async () => {
  const onUnhandled = vi.fn();
  process.on('unhandledRejection', onUnhandled);
  const calls: string[] = [];
  const call = (event: string) => {
    calls.push(event);
    return Promise.reject(new Error('socket has been disconnected'));
  };
  const client = new OnlineGameClient({
    socket: new EventEmitter(),
    call,
  } as unknown as OnlineSession);
  try {
    client.requestSnapshot();
    client.dispose();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(calls).toEqual([C2S.gameRequestSnapshot]);
    expect(onUnhandled).not.toHaveBeenCalled();
  } finally {
    process.off('unhandledRejection', onUnhandled);
    client.dispose();
  }
});
