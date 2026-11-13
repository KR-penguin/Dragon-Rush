/** Bump only on breaking changes; clients with another version are refused at handshake. */
/** v2: pending.phase may be COMBAT, real-time fight:* messages, room option quickCombat. */
export const PROTOCOL_VERSION = 3;

export const C2S = {
  roomCreate: 'room:create',
  roomJoin: 'room:join',
  roomLeave: 'room:leave',
  roomConfigure: 'room:configure',
  roomConfigureSeat: 'room:configureSeat',
  roomSelectJob: 'room:selectJob',
  roomSetReady: 'room:setReady',
  roomStart: 'room:start',
  roomRematch: 'room:rematch',
  gameAction: 'game:action',
  gameRequestSnapshot: 'game:requestSnapshot',
} as const;

export const S2C = {
  sessionWelcome: 'session:welcome',
  roomState: 'room:state',
  gameUpdate: 'game:update',
  gameSnapshot: 'game:snapshot',
  seatStatus: 'seat:status',
  seatTakeover: 'seat:takeover',
  error: 'error',
} as const;
