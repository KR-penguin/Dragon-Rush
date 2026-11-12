import type { CombatSetup, DragonSetup, FighterSetup } from '@dragon-rush/combat';
import { PASSIVES, type GameState, type PlayerState, type RulesConfig } from '@dragon-rush/engine';

/** Board player -> real-time fighter: same HP/ATK/DEF, Last Stand only while the board passive is unused. */
export function fighterFromPlayer(p: PlayerState, rules: RulesConfig): FighterSetup {
  return {
    job: p.job,
    hp: p.hp,
    maxHp: p.maxHp,
    atk: p.atk,
    def: p.def,
    indomitableAvailable:
      PASSIVES[p.job].indomitable === true &&
      rules.passives.indomitableUses > 0 &&
      !p.passive.indomitableUsed,
  };
}

export function dragonFromRules(rules: RulesConfig): DragonSetup {
  return { hp: rules.dragon.hp, atk: rules.dragon.atk, def: rules.dragon.def };
}

/**
 * Combat setup for the fight the engine is waiting on (phase COMBAT, external mode): a = arriver/challenger,
 * b = defender (null for the dragon). The result goes back through applyCombatResult.
 */
export function boardCombatSetup(state: GameState): CombatSetup {
  const req = state.combat;
  if (!req || state.pending?.phase !== 'COMBAT') throw new RangeError('no combat is pending');
  const player = (seat: number): PlayerState => {
    const p = state.players[seat];
    if (!p) throw new RangeError(`no player at seat ${seat}`);
    return p;
  };
  const a = fighterFromPlayer(player(req.a), state.rules);
  if (req.kind === 'duel') {
    if (req.b === null) throw new RangeError('a duel needs a defender');
    return { kind: 'duel', a, b: fighterFromPlayer(player(req.b), state.rules) };
  }
  return { kind: 'dragonFight', a, b: null, dragon: dragonFromRules(state.rules) };
}
