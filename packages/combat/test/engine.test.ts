import { describe, expect, it } from 'vitest';
import {
  applyAction,
  applyCombatResult,
  createGame,
  DEFAULT_RULES,
  getLegalActions,
  type GameState,
  type CombatResult as EngineCombatResult,
} from '@dragon-rush/engine';
import {
  createCombatBot,
  runCombat,
  type CombatResult,
  type CombatSetup,
  type FighterSetup,
} from '../src/index';

// compile-time: the combat package's result is exactly the engine's contract
const sameShape = (r: CombatResult): EngineCombatResult => r;
void sameShape;

function fighterOf(s: GameState, seat: number): FighterSetup {
  const p = s.players[seat]!;
  return {
    job: p.job,
    hp: p.hp,
    maxHp: p.maxHp,
    atk: p.atk,
    def: p.def,
    indomitableAvailable: !p.passive.indomitableUsed,
  };
}

describe('board engine seam', () => {
  it('a real-time dragon fight settles the engine COMBAT phase through applyCombatResult', () => {
    for (const seed of [1, 2, 3]) {
      const game = createGame(
        { seats: [{ job: 'swordsman' }, { job: 'mage' }] },
        DEFAULT_RULES,
        seed,
      );
      const challenge = getLegalActions(game).find((a) => a.type === 'CHALLENGE_DRAGON');
      expect(challenge).toBeDefined();
      const { state } = applyAction(game, challenge!);
      expect(state.pending?.phase).toBe('COMBAT');
      const req = state.combat!;
      const setup: CombatSetup = {
        kind: 'dragonFight',
        a: fighterOf(state, req.a),
        b: null,
        dragon: {
          hp: state.rules.dragon.hp,
          atk: state.rules.dragon.atk,
          def: state.rules.dragon.def,
        },
      };
      const { result } = runCombat(setup, [createCombatBot()], seed);
      const after = applyCombatResult(state, result);
      if (result.winner === 'a') expect(after.state.outcome?.kind).toBe('dragon');
      else expect(after.state.players[req.a]!.alive).toBe(false);
    }
  });
});
