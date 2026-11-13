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
  it('shows a blacksmith defense bonus as its event plays, before the queue reaches the next turn', () => {
    const before = toPublicState(
      createGameWithEvents({ seats: [{ job: 'mage' }, { job: 'ninja' }] }, DEFAULT_RULES, 42).state,
    );
    const defAfter = before.players[0]!.def + 1;
    const effect: GameEvent = {
      type: 'EffectApplied',
      seat: 0,
      effect: 'stat',
      stat: 'def',
      delta: 1,
      after: defAfter,
    };
    const nextTurn: GameEvent = { type: 'TurnStarted', seat: 1, round: 1, resting: false };
    const store = createGameStore();
    store.setState({
      latest: {
        version: 1,
        publicState: {
          ...before,
          players: before.players.map((p) => (p.seat === 0 ? { ...p, def: defAfter } : p)),
        },
        events: [effect, nextTurn],
        pending: null,
        controllableSeats: [],
        legalActions: [],
        seats: [],
        snapshot: false,
      },
      display: before,
      queue: [effect, nextTurn],
      current: null,
    });

    store.getState().advance();
    expect(store.getState().queue).toEqual([nextTurn]);
    expect(store.getState().display!.players[0]!.def).toBe(defAfter);
  });
  it('shows a paid stat upgrade while the same turn is still animating', () => {
    const before = toPublicState(
      createGameWithEvents({ seats: [{ job: 'mage' }, { job: 'ninja' }] }, DEFAULT_RULES, 42).state,
    );
    const after = applyEventToDisplay(before, {
      type: 'StatUpgraded',
      seat: 0,
      stat: 'atk',
      cost: 3,
      free: false,
      valueAfter: before.players[0]!.atk + 1,
      levelAfter: 1,
      coinsAfter: before.players[0]!.coins - 3,
    });
    expect(after.players[0]!.atk).toBe(before.players[0]!.atk + 1);
    expect(after.players[0]!.coins).toBe(before.players[0]!.coins - 3);
    expect(after.turn.paidUpgradesUsed).toBe(before.turn.paidUpgradesUsed + 1);
    const next = applyEventToDisplay(after, {
      type: 'TurnStarted',
      seat: 1,
      round: 1,
      resting: false,
    });
    expect(next.turn.paidUpgradesUsed).toBe(0);
  });
  it.each([20, 50])('restores the totem maximum without subtracting its bonus from HP %i', (hp) => {
    const before = toPublicState(
      createGameWithEvents({ seats: [{ job: 'mage' }, { job: 'ninja' }] }, DEFAULT_RULES, 42).state,
    );
    const originalMaxHp = before.players[0]!.maxHp;
    const bonus = DEFAULT_RULES.princeTotemMaxHpBonus;
    const boosted = {
      ...before,
      players: before.players.map((player) =>
        player.seat === 0 ? { ...player, hp, maxHp: originalMaxHp + bonus } : player,
      ),
    };
    const effect: GameEvent = {
      type: 'EffectApplied',
      seat: 0,
      effect: 'maxHp',
      delta: -bonus,
      after: originalMaxHp,
    };
    const restored = applyEventToDisplay(boosted, effect);
    expect(restored.players[0]!.maxHp).toBe(originalMaxHp);
    expect(restored.players[0]!.hp).toBe(Math.min(hp, originalMaxHp));
    expect(
      describeEvent(
        effect,
        () => '검사',
        () => 'START',
      ),
    ).toBe(`검사 최대 HP -${bonus}`);
  });
  it('explains HP lost because an event could not collect enough coins', () => {
    expect(
      describeEvent(
        {
          type: 'EffectApplied',
          seat: 0,
          effect: 'hp',
          delta: -4,
          after: 12,
          cause: 'coinShortfall',
        },
        () => '검사',
        () => 'BANDIT',
      ),
    ).toBe('검사: 코인이 부족해 HP 4를 대신 잃었습니다');
  });
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
