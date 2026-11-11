import { describe, expect, it } from 'vitest';
import { applyAction, createGameWithEvents, DEFAULT_RULES, getLegalActions, withRules, type GameEvent } from '../src/index';

/** Fixed seed + scripted choices → event log. A diff here means a rules change: update game-design and RulesConfig.version. */
describe('engine golden event log', () => {
  it('replays a scripted 3-player game identically', () => {
    const created = createGameWithEvents(
      { seats: [{ job: 'berserker' }, { job: 'ninja' }, { job: 'archer' }] },
      withRules({ maxRounds: 12 }, DEFAULT_RULES),
      20261111,
    );
    let state = created.state;
    const events: GameEvent[] = [...created.events];
    let i = 0;
    while (state.pending && i < 2000) {
      const legal = getLegalActions(state);
      const action = legal[(i * 7) % legal.length]!;
      const r = applyAction(state, action.type === 'CHALLENGE_DRAGON' ? legal[0]! : action);
      state = r.state;
      events.push(...r.events);
      i++;
    }
    expect({ outcome: state.outcome, round: state.round, count: events.length }).toMatchSnapshot();
    expect(events.map((e) => e.type).join(',')).toMatchSnapshot();
  });

  it('keeps the timeout-relevant legal action order', () => {
    expect(getLegalActions({ ...createGameWithEvents({ seats: [{ job: 'mage' }, { job: 'archer' }] }, DEFAULT_RULES, 1).state })[0]).toEqual({ type: 'ROLL_DICE' });
  });
});
