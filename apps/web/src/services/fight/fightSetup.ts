import type { CombatSetup, FighterSetup } from '@dragon-rush/combat';
import {
  PASSIVES,
  type CombatRequest,
  type PlayerState,
  type PublicGameState,
  type SeatId,
} from '@dragon-rush/engine';
import type { FightControl, FightSide } from '../gameClient';

/** Board stats → fighter. HP carries over 1:1; Last Stand only while the board passive is unused. */
export function fighterFromPlayer(state: PublicGameState, p: PlayerState): FighterSetup {
  return {
    job: p.job,
    hp: p.hp,
    maxHp: p.maxHp,
    atk: p.atk,
    def: p.def,
    indomitableAvailable:
      PASSIVES[p.job].indomitable === true &&
      state.rules.passives.indomitableUses > 0 &&
      !p.passive.indomitableUsed,
  };
}

function playerAt(state: PublicGameState, seat: SeatId): PlayerState {
  const p = state.players.find((x) => x.seat === seat);
  if (!p) throw new RangeError(`no player at seat ${seat}`);
  return p;
}

/** The sim setup for the fight the engine is waiting on; the dragon uses the board rules' stats. */
export function buildFightSetup(state: PublicGameState, request: CombatRequest): CombatSetup {
  const a = fighterFromPlayer(state, playerAt(state, request.a));
  if (request.b === null) {
    const { hp, atk, def } = state.rules.dragon;
    return { kind: 'dragonFight', a, b: null, dragon: { hp, atk, def } };
  }
  return { kind: 'duel', a, b: fighterFromPlayer(state, playerAt(state, request.b)) };
}

/** True when this screen plays the seat with its keyboard/gamepad. */
export type IsLocalHuman = (seat: SeatId) => boolean;

/**
 * Hot-seat human vs human: arriver = P1 keys (left), defender = P2 keys (right).
 * One local human (vs a bot or the dragon): solo keys. Others are bots; the dragon is scripted.
 */
export function fightSides(
  request: CombatRequest,
  isLocalHuman: IsLocalHuman,
): [FightSide, FightSide] {
  const aHuman = isLocalHuman(request.a);
  const bHuman = request.b !== null && isLocalHuman(request.b);
  const control = (human: boolean, other: boolean, hotSeat: FightControl): FightControl =>
    !human ? 'bot' : other ? hotSeat : 'keyboard-solo';
  return [
    { side: 'a', seat: request.a, control: control(aHuman, bHuman, 'keyboard-p1') },
    request.b === null
      ? { side: 'b', seat: null, control: 'dragon' }
      : { side: 'b', seat: request.b, control: control(bHuman, aHuman, 'keyboard-p2') },
  ];
}

/** Nobody on this screen plays: resolve instantly (and maybe show a highlight). */
export const isBotOnlyFight = (sides: readonly FightSide[]): boolean =>
  sides.every((s) => s.control === 'bot' || s.control === 'dragon');

/** 32-bit fight seeds from a seeded float stream (the board game's own seed drives it). */
export function createSeedStream(random: () => number): () => number {
  return () => Math.floor(random() * 0x100000000) >>> 0;
}
