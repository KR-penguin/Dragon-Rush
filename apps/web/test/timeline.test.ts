import {
  applyAction,
  createGameWithEvents,
  DEFAULT_RULES,
  getLegalActions,
  toPublicState,
  type GameEvent,
} from '@dragon-rush/engine';
import { describe, expect, it } from 'vitest';
import {
  applyEventToDisplay,
  describeEvent,
  eventDuration,
  eventIcon,
  eventSeat,
} from '../src/animation/eventTimeline';
import { ICON_NAMES } from '../src/types/icons';

describe('event timeline', () => {
  it('describes every event of a full game without throwing and replays positions', () => {
    // Dice mode resolves fights inside applyAction (same events the temporary client-side resolver produces).
    const rules = {
      ...DEFAULT_RULES,
      maxRounds: 30,
      combat: { ...DEFAULT_RULES.combat, mode: 'dice' as const },
    };
    const created = createGameWithEvents(
      { seats: [{ job: 'mage' }, { job: 'ninja' }, { job: 'archer' }] },
      rules,
      4,
    );
    let state = created.state;
    const events = created.events;
    const all: GameEvent[] = [...events];
    let display = toPublicState(state);
    for (let i = 0; i < 3000 && state.pending; i++) {
      const legal = getLegalActions(state);
      const action = legal.find((a) => a.type !== 'CHALLENGE_DRAGON') ?? legal[0]!;
      const before = toPublicState(state);
      const r = applyAction(state, action);
      display = before;
      for (const e of r.events) display = applyEventToDisplay(display, e);
      for (const p of r.state.players) {
        if (p.alive) expect(display.players[p.seat]!.position).toBe(p.position);
      }
      state = r.state;
      all.push(...r.events);
    }
    const name = (s: number) => `P${s}`;
    const emoji = /\p{Extended_Pictographic}/u;
    for (const e of all) {
      expect(() => describeEvent(e, name, (t) => DEFAULT_RULES.board[t]!.id)).not.toThrow();
      expect(describeEvent(e, name, (t) => DEFAULT_RULES.board[t]!.id) ?? '').not.toMatch(emoji);
      expect(eventDuration(e)).toBeGreaterThanOrEqual(0);
      expect(ICON_NAMES).toContain(eventIcon(e));
      const seat = eventSeat(e);
      if (seat !== null) expect(seat).toBeGreaterThanOrEqual(0);
    }
    expect(
      all.some((e) =>
        describeEvent(e, name, (t) => DEFAULT_RULES.board[t]!.id)?.includes('라운드'),
      ),
    ).toBe(true);
  });
});
