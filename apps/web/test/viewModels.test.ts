import { dragonProfile, profileOf, winProbability } from '@hero-dice/ai';
import {
  createGame,
  DEFAULT_RULES,
  toPublicState,
  upgradeCost,
  type PlayerState,
  type PublicGameState,
} from '@hero-dice/engine';
import { describe, expect, it } from 'vitest';
import { moveOptions, opponentSummaries, shopRows, statOptions } from '../src/types/decisionView';
import {
  dragonWinChance,
  duelWinChance,
  formatPercent,
  shieldDecisionChance,
} from '../src/types/estimates';
import {
  playerBadges,
  playerCards,
  seatBadges,
  seatKindLabel,
  type SeatLike,
} from '../src/types/playerView';
import { tileTone } from '../src/types/tileView';

const game = (): PublicGameState =>
  toPublicState(
    createGame(
      { seats: [{ job: 'swordsman' }, { job: 'ninja' }, { job: 'berserker' }] },
      DEFAULT_RULES,
      7,
    ),
  );

const withPlayer = (
  s: PublicGameState,
  seat: number,
  patch: Partial<PlayerState>,
): PublicGameState => ({
  ...s,
  players: s.players.map((p) => (p.seat === seat ? { ...p, ...patch } : p)),
});

const seatOfJob = (s: PublicGameState, job: PlayerState['job']) =>
  s.players.find((p) => p.job === job)!.seat;

describe('decision view models', () => {
  it('previews move adjustments from the rolled dice and wraps the board', () => {
    let s = game();
    s = withPlayer(s, s.current, { position: 21 });
    s = { ...s, turn: { ...s.turn, dice: 2 } };
    const opts = moveOptions(s, [1, -1, 0]);
    expect(opts.map((o) => o.delta)).toEqual([-1, 0, 1]);
    expect(opts.map((o) => o.steps)).toEqual([1, 2, 3]);
    expect(opts.map((o) => o.tile)).toEqual([22, 23, 0]);
    expect(opts[2]!.tileId).toBe('START');
  });

  it('shows next upgrade cost and value from the rules', () => {
    const s = game();
    const p = s.players[0]!;
    const opts = statOptions(s, p.seat, ['def']);
    const atk = opts.find((o) => o.stat === 'atk')!;
    const hp = opts.find((o) => o.stat === 'maxHp')!;
    expect(atk.cost).toBe(upgradeCost(DEFAULT_RULES, p, 'atk'));
    expect(atk.next).toBe(p.atk + DEFAULT_RULES.upgrades.atk.amount);
    expect(hp.current).toBe(p.maxHp);
    expect(hp.next).toBe(p.maxHp + DEFAULT_RULES.upgrades.maxHp.amount);
    expect(opts.filter((o) => o.legal).map((o) => o.stat)).toEqual(['def']);
  });

  it('lists shop items with rule prices and owned counts', () => {
    const s = game();
    const rows = shopRows(s, 0, ['thief']);
    expect(rows.map((r) => r.item)).toEqual(['teleport', 'shield', 'thief']);
    expect(rows.find((r) => r.item === 'shield')!.owned).toBe(DEFAULT_RULES.startingItems.shield);
    expect(rows.find((r) => r.item === 'teleport')!.price).toBe(DEFAULT_RULES.items.teleport.price);
    expect(rows.filter((r) => r.buyable).map((r) => r.item)).toEqual(['thief']);
  });

  it('summarises opponents for choice dialogs', () => {
    const s = game();
    const [a] = opponentSummaries(s, [1]);
    expect(a).toMatchObject({ seat: 1, coins: DEFAULT_RULES.startingCoins, shields: 1 });
  });
});

describe('estimates', () => {
  it('uses the AI win probability helpers with 320 samples', () => {
    const s = game();
    const p = s.players[0]!;
    expect(dragonWinChance(s, 0)).toBe(
      winProbability(s.rules, profileOf(p, s.rules), dragonProfile(s.rules), 320),
    );
    const d = duelWinChance(s, 0, 1);
    expect(d).toBeGreaterThanOrEqual(0);
    expect(d).toBeLessThanOrEqual(1);
    expect(formatPercent(0.456)).toBe('46%');
  });

  it('gives the shield decider their own duel odds', () => {
    let s = game();
    expect(shieldDecisionChance(s, 0)).toBeNull();
    s = { ...s, pvp: { arriver: 0, candidates: [1], target: 1, stage: 'defender' } };
    const arriverWins = duelWinChance(s, 0, 1);
    expect(shieldDecisionChance(s, 0)).toBe(arriverWins);
    expect(shieldDecisionChance(s, 1)).toBeCloseTo(1 - arriverWins, 10);
  });
});

describe('player badges', () => {
  it('reads passive state through the engine hooks', () => {
    let s = game();
    const sword = seatOfJob(s, 'swordsman');
    const ninja = seatOfJob(s, 'ninja');
    const bers = seatOfJob(s, 'berserker');
    const kinds = (seat: number) => playerBadges(s, s.players[seat]!).map((b) => b.kind);
    expect(kinds(sword)).toContain('indomitable');
    expect(kinds(ninja)).not.toContain('ninjaCooldown');
    expect(kinds(bers)).not.toContain('rage');

    const bp = s.players[bers]!;
    s = withPlayer(s, bers, { hp: Math.floor(bp.maxHp / 2) });
    s = withPlayer(s, ninja, {
      passive: { indomitableUsed: false, ninjaCooldown: 2 },
      skipNextTurn: true,
    });
    s = withPlayer(s, sword, { passive: { indomitableUsed: true, ninjaCooldown: 0 } });
    expect(kinds(bers)).toContain('rage');
    expect(kinds(ninja)).toEqual(expect.arrayContaining(['ninjaCooldown', 'resting']));
    expect(
      playerBadges(s, s.players[ninja]!).find((b) => b.kind === 'ninjaCooldown')!.label,
    ).toContain('2');
    expect(kinds(sword)).not.toContain('indomitable');

    s = withPlayer(s, sword, { alive: false });
    expect(kinds(sword)).toEqual(['eliminated']);
  });

  it('flags the current player during a resting turn', () => {
    const s0 = game();
    const s = { ...s0, turn: { ...s0.turn, resting: true } };
    expect(playerBadges(s, s.players[s.current]!).map((b) => b.kind)).toContain('resting');
  });

  it('builds player cards with names, kinds and connection badges', () => {
    const s = game();
    const seats: SeatLike[] = [
      { seat: 0, name: 'A', kind: 'human', connected: true, controlledBy: 'human' },
      {
        seat: 1,
        name: 'B',
        kind: 'bot',
        botName: 'heuristic:rush',
        connected: true,
        controlledBy: 'bot',
      },
      { seat: 2, name: 'C', kind: 'human', connected: false, controlledBy: 'bot' },
    ];
    const cards = playerCards(s, seats, 1);
    expect(cards.map((c) => c.name)).toEqual(['A', 'B', 'C']);
    expect(cards[1]!.kindLabel).toBe('봇 · 용 러시형');
    expect(cards[1]!.isActor).toBe(true);
    expect(cards[s.current]!.isTurn).toBe(true);
    expect(cards[2]!.badges.map((b) => b.kind)).toEqual(
      expect.arrayContaining(['disconnected', 'botControlled']),
    );
    expect(seatBadges(seats[0]!)).toEqual([]);
    expect(seatKindLabel(seats[0])).toBe('사람');
  });
});

describe('tile tone', () => {
  it('colours tiles by their effect data', () => {
    const tone = (i: number) => tileTone(DEFAULT_RULES.board[i]!);
    expect(tone(0)).toBe('safe');
    expect(tone(1)).toBe('good');
    expect(tone(2)).toBe('bad');
    expect(tone(6)).toBe('special');
    expect(tone(17)).toBe('special');
    expect(tone(20)).toBe('bad');
    expect(tone(19)).toBe('good');
  });
});
