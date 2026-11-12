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
  EVENT_CARD_FADE_MS,
  EVENT_CARD_FLIP_MS,
  EVENT_CARD_HOLD_MS,
  EVENT_CARD_MS,
  EVENT_CARD_RISE_MS,
} from '../src/animation/eventTimeline';
import { createGameStore } from '../src/store/gameStore';
import { ICON_NAMES } from '../src/types/icons';

describe('event timeline', () => {
  it('keeps the rise, reveal, and fade while shortening the readable hold by 300 ms', () => {
    expect(EVENT_CARD_RISE_MS).toBe(200);
    expect(EVENT_CARD_FLIP_MS).toBe(180);
    expect(EVENT_CARD_HOLD_MS).toBe(2700);
    expect(EVENT_CARD_FADE_MS).toBe(250);
    expect(EVENT_CARD_MS).toBe(3330);
    expect(EVENT_CARD_MS - EVENT_CARD_FADE_MS).toBe(
      EVENT_CARD_RISE_MS + EVENT_CARD_FLIP_MS + EVENT_CARD_HOLD_MS,
    );

    expect(eventDuration({ type: 'TileResolved', seat: 0, tile: 3, tileId: 'HERB' })).toBe(3330);
    expect(
      eventDuration({ type: 'StartBonus', seat: 0, coins: 10, hp: 0, coinsAfter: 15, hpAfter: 40 }),
    ).toBe(3330);
    expect(eventDuration({ type: 'MysteryCardDrawn', seat: 0, cardId: 'BAT_SWARM' })).toBe(3330);
    expect(eventDuration({ type: 'TileResolved', seat: 0, tile: 17, tileId: 'MYSTERY' })).toBe(600);
    expect(eventDuration({ type: 'TileResolved', seat: 0, tile: 6, tileId: 'SHOP' })).toBe(250);
    expect(eventDuration({ type: 'TileResolved', seat: 0, tile: 7, tileId: 'TRAINING' })).toBe(250);
  });

  it('scales the card queue beat at every supported playback speed', () => {
    const state = toPublicState(
      createGameWithEvents({ seats: [{ job: 'mage' }, { job: 'ninja' }] }, DEFAULT_RULES, 42).state,
    );
    const store = createGameStore();
    const card: GameEvent = { type: 'TileResolved', seat: 0, tile: 3, tileId: 'HERB' };
    for (const speed of [1, 2, 4] as const) {
      store.setState({
        latest: {
          version: 1,
          publicState: state,
          events: [card],
          pending: null,
          controllableSeats: [],
          legalActions: [],
          seats: [],
          snapshot: false,
        },
        display: state,
        queue: [card],
        current: null,
      });
      store.getState().setSpeed(speed);
      expect(store.getState().advance()).toBe(3330 / speed);
    }
  });
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
