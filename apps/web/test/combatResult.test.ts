import {
  applyAction,
  createGame,
  DEFAULT_RULES,
  toPublicState,
  type GameEvent,
  type PublicGameState,
} from '@hero-dice/engine';
import { describe, expect, it } from 'vitest';
import { applyEventToDisplay } from '../src/animation/eventTimeline';
import { reduceCombat, type CombatView } from '../src/types/combatView';
import { collectEliminations, outcomeHeadline, resultRows } from '../src/types/resultView';

/** Replays events the way the animation queue does and folds them into the combat view. */
function replay(display: PublicGameState, events: readonly GameEvent[]) {
  let view: CombatView | null = null;
  const seen: (CombatView | null)[] = [];
  for (const e of events) {
    display = applyEventToDisplay(display, e);
    view = reduceCombat(view, e, display);
    seen.push(view);
  }
  return { view, seen };
}

describe('combat overlay model', () => {
  it('follows a real dragon fight hit by hit', () => {
    const state = createGame({ seats: [{ job: 'archer' }, { job: 'mage' }] }, DEFAULT_RULES, 11);
    const { events } = applyAction(state, { type: 'CHALLENGE_DRAGON' });
    const hits = events.filter((e) => e.type === 'CombatHit');
    const ended = events.find((e) => e.type === 'CombatEnded');
    const endIndex = events.findIndex((e) => e.type === 'CombatEnded');
    const { seen } = replay(toPublicState(state), events.slice(0, endIndex + 1));
    const last = seen.at(-1)!;
    expect(last).not.toBeNull();
    expect(last.kind).toBe('dragonFight');
    expect(last.b.ref).toBe('dragon');
    expect(last.hits).toHaveLength(hits.length);
    expect(last.winner).toBe(ended && ended.type === 'CombatEnded' ? ended.winner : null);
    const challenger = state.players[state.current]!;
    expect(last.a.ref).toBe(challenger.seat);
    expect(last.hits[0]!.badges.includes('firstStrike')).toBe(challenger.job === 'archer');
    const loser = last.winner === 'dragon' ? last.a : last.b;
    expect(loser.hp).toBe(0);
  });

  it('closes on the first event after the fight and on a cleared queue', () => {
    const state = createGame({ seats: [{ job: 'archer' }, { job: 'mage' }] }, DEFAULT_RULES, 11);
    const display = toPublicState(state);
    const started = reduceCombat(
      null,
      { type: 'CombatStarted', kind: 'duel', a: 0, b: 1, first: 0 },
      display,
    );
    expect(started).not.toBeNull();
    expect(
      reduceCombat(started, { type: 'PlayerEliminated', seat: 1, by: 0, round: 4 }, display)!
        .eliminated,
    ).toBe(1);
    expect(reduceCombat(started, { type: 'TurnEnded', seat: 0 }, display)).toBeNull();
    expect(reduceCombat(started, null, display)).toBeNull();
    expect(
      reduceCombat(
        null,
        {
          type: 'CombatHit',
          kind: 'duel',
          attacker: 0,
          defender: 1,
          roll: 3,
          damage: 4,
          evaded: false,
          breath: false,
          rage: false,
          firstStrike: false,
          hpAfter: 30,
        },
        display,
      ),
    ).toBeNull();
  });

  it('attaches indomitable to the hit it saved and marks evades and breath', () => {
    const state = createGame({ seats: [{ job: 'swordsman' }, { job: 'ninja' }] }, DEFAULT_RULES, 3);
    const display = toPublicState(state);
    const sword = display.players.find((p) => p.job === 'swordsman')!.seat;
    const events: GameEvent[] = [
      { type: 'CombatStarted', kind: 'dragonFight', a: sword, b: 'dragon', first: sword },
      { type: 'PassiveTriggered', seat: sword, passive: 'indomitable' },
      {
        type: 'CombatHit',
        kind: 'dragonFight',
        attacker: 'dragon',
        defender: sword,
        roll: 6,
        damage: 99,
        evaded: false,
        breath: true,
        rage: false,
        firstStrike: false,
        hpAfter: 1,
      },
      {
        type: 'CombatHit',
        kind: 'dragonFight',
        attacker: sword,
        defender: 'dragon',
        roll: 2,
        damage: 0,
        evaded: true,
        breath: false,
        rage: true,
        firstStrike: false,
        hpAfter: 115,
      },
    ];
    const { view } = replay(display, events);
    expect(view!.hits[0]!.badges).toEqual(['breath', 'indomitable']);
    expect(view!.hits[1]!.badges).toEqual(['rage', 'evade']);
    expect(view!.a.hp).toBe(1);
    expect(view!.pendingIndomitable).toBe(false);
  });
});

describe('result view model', () => {
  const finished = (): PublicGameState => {
    const s = toPublicState(
      createGame(
        { seats: [{ job: 'archer' }, { job: 'mage' }, { job: 'ninja' }] },
        DEFAULT_RULES,
        5,
      ),
    );
    return {
      ...s,
      round: 9,
      outcome: { kind: 'lastSurvivor', winner: 2 },
      players: s.players.map((p) => (p.seat === 2 ? p : { ...p, alive: false, hp: 0 })),
    };
  };

  it('collects eliminations and reuses the map when nothing changed', () => {
    const empty = new Map();
    expect(collectEliminations(empty, [{ type: 'TurnEnded', seat: 0 }])).toBe(empty);
    const rec = collectEliminations(empty, [
      { type: 'PlayerEliminated', seat: 0, by: 'dragon', round: 4 },
      { type: 'PlayerEliminated', seat: 1, by: 2, round: 8 },
    ]);
    expect(rec.get(0)).toEqual({ round: 4, by: 'dragon' });
    expect(rec.get(1)).toEqual({ round: 8, by: 2 });
  });

  it('ranks the winner first, then the most recently eliminated', () => {
    const s = finished();
    const names = ['A', 'B', 'C'];
    const rec = collectEliminations(new Map(), [
      { type: 'PlayerEliminated', seat: 0, by: 'dragon', round: 4 },
      { type: 'PlayerEliminated', seat: 1, by: 2, round: 8 },
    ]);
    const rows = resultRows(s, (seat) => names[seat]!, rec);
    expect(rows.map((r) => r.seat)).toEqual([2, 1, 0]);
    expect(rows[0]!.winner).toBe(true);
    expect(rows[0]!.status).toBe('승리');
    expect(rows[1]!.status).toBe('8라운드 탈락 · C에게 패배');
    expect(rows[2]!.status).toBe('4라운드 탈락 · 용에게 패배');
  });

  it('writes the headline for wins and draws', () => {
    const name = (seat: number) => `P${seat}`;
    expect(outcomeHeadline({ kind: 'dragon', winner: 1 }, name)).toEqual({
      title: 'P1 승리!',
      kind: '용 처치',
    });
    expect(outcomeHeadline({ kind: 'lastSurvivor', winner: 0 }, name).kind).toBe('최후 생존');
    expect(outcomeHeadline({ kind: 'draw', winner: null }, name)).toEqual({
      title: '무승부',
      kind: '무승부',
    });
  });
});
