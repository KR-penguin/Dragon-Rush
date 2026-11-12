export const FIGHT_C2S = {
  input: 'fight:input',
  ack: 'fight:ack',
  ping: 'fight:ping',
  ready: 'fight:ready',
  away: 'fight:away',
  back: 'fight:back',
  requestSync: 'fight:requestSync',
  stats: 'fight:stats',
} as const;

export const FIGHT_S2C = {
  start: 'fight:start',
  go: 'fight:go',
  relay: 'fight:relay',
  confirm: 'fight:confirm',
  pong: 'fight:pong',
  control: 'fight:control',
  sync: 'fight:sync',
  retime: 'fight:retime',
  end: 'fight:end',
  replay: 'fight:replay',
} as const;

export type FightC2SEvent = (typeof FIGHT_C2S)[keyof typeof FIGHT_C2S];
export type FightS2CEvent = (typeof FIGHT_S2C)[keyof typeof FIGHT_S2C];

export * from './mask';
export * from './wire';
export * from './messages';
export * from './schemas';
