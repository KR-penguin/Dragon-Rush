import { describe, expect, it } from 'vitest';
import {
  applyAction,
  createGameWithEvents,
  DEFAULT_RULES,
  getLegalActions,
  resolveCombatWithDice,
  withRules,
  type CombatMode,
  type GameEvent,
  type GameState,
} from '../src/index';

/** Scripted choices on a fixed seed; external-mode fights are settled by the dice resolver without consuming a choice. */
function replay(mode: CombatMode): { state: GameState; events: GameEvent[] } {
  const created = createGameWithEvents(
    { seats: [{ job: 'berserker' }, { job: 'ninja' }, { job: 'archer' }] },
    withRules({ maxRounds: 12, combat: { ...DEFAULT_RULES.combat, mode } }, DEFAULT_RULES),
    20261111,
  );
  let state = created.state;
  const events: GameEvent[] = [...created.events];
  let i = 0;
  while (state.pending && i < 2000) {
    if (state.pending.phase === 'COMBAT') {
      const r = resolveCombatWithDice(state);
      state = r.state;
      events.push(...r.events);
      continue;
    }
    const legal = getLegalActions(state);
    const action = legal[(i * 7) % legal.length]!;
    const r = applyAction(state, action.type === 'CHALLENGE_DRAGON' ? legal[0]! : action);
    state = r.state;
    events.push(...r.events);
    i++;
  }
  return { state, events };
}

/** Fixed seed + scripted choices → event log. A diff here means a rules change: update game-design and RulesConfig.version. */
describe('engine golden event log', () => {
  it('replays a scripted 3-player game identically', () => {
    const { state, events } = replay('dice');
    expect({ outcome: state.outcome, round: state.round, count: events.length }).toMatchSnapshot();
    expect(events.map((e) => e.type).join(',')).toMatchSnapshot();
  });

  it('gives the same event log in external mode when fights are settled by resolveCombatWithDice', () => {
    const dice = replay('dice');
    const external = replay('external');
    expect(external.events.filter((e) => e.type === 'CombatStarted').length).toBeGreaterThan(0);
    expect(external.events).toEqual(dice.events);
    expect({ ...external.state, rules: null }).toEqual({ ...dice.state, rules: null });
  });

  it('keeps the timeout-relevant legal action order', () => {
    expect(getLegalActions({ ...createGameWithEvents({ seats: [{ job: 'mage' }, { job: 'archer' }] }, DEFAULT_RULES, 1).state })[0]).toEqual({ type: 'ROLL_DICE' });
  });
});
