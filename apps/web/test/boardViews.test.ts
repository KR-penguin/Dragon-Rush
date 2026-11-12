import {
  createGame,
  DEFAULT_RULES,
  toPublicState,
  type GameEvent,
  type PublicGameState,
  type TileId,
} from '@dragon-rush/engine';
import { describe, expect, it } from 'vitest';
import { countUpMs, eventCardFor, showsEventCard } from '../src/types/eventCards';
import { breathRunesLit, dragonIntentCue, lairState } from '../src/types/lairView';
import { buildPawns, pawnCount, type PawnInputs } from '../src/types/pawnView';
import type { CombatView } from '../src/types/combatView';
import {
  effectChips,
  effectSummary,
  landmarkOf,
  signed,
  tileCategory,
} from '../src/types/tileView';

const CATEGORY_TABLE: Record<string, readonly TileId[]> = {
  good: ['GOBLIN', 'HERB', 'WOLF', 'TREASURE', 'BLACKSMITH', 'ORC', 'FOUNTAIN', 'TROLL'],
  bad: [
    'POISON_SWAMP',
    'BANDIT',
    'TRAP',
    'PICKPOCKET',
    'CURSED_ALTAR',
    'ROCKFALL',
    'SPIDER_WEB',
    'STORM',
  ],
  special: ['TRAINING', 'MYSTERY', 'WANDERING_MERCHANT'],
  landmark: ['START', 'SHOP', 'INN'],
};

describe('tile categories and chips', () => {
  it('follows the decision sheet table on the default board', () => {
    const counts: Record<string, number> = {};
    DEFAULT_RULES.board.forEach((def, i) => {
      const cat = tileCategory(def, i);
      counts[cat] = (counts[cat] ?? 0) + 1;
      expect(CATEGORY_TABLE[cat]).toContain(def.id);
    });
    expect(counts).toEqual({ good: 8, bad: 8, special: 4, landmark: 4 });
  });

  it('turns effects into signed chips and a summary line', () => {
    const wolf = DEFAULT_RULES.board.find((t) => t.id === 'WOLF')!;
    const chips = effectChips(wolf.effects);
    expect(chips.map((c) => c.icon)).toEqual(['coins', 'hp']);
    expect(chips.map((c) => c.tone)).toEqual(['good', 'bad']);
    expect(signed(-5)).toBe('−5');
    expect(signed(3)).toBe('+3');
    expect(signed(null)).toBe('');
    expect(effectSummary([])).toBe('효과 없음');
    expect(effectSummary([{ kind: 'skipTurn' }])).toBe('한 턴 쉼');
  });

  it('gives corner landmarks their standee art', () => {
    expect(landmarkOf('START')).toBe('gate');
    expect(landmarkOf('SHOP')).toBe('tent');
    expect(landmarkOf('INN')).toBe('inn');
    expect(landmarkOf('HERB')).toBeNull();
  });
});

describe('event cards', () => {
  const rules = DEFAULT_RULES;
  const index = (id: TileId) => rules.board.findIndex((t) => t.id === id);

  it('rises for effect tiles but not for shop or training props', () => {
    expect(showsEventCard(rules.board[index('SHOP')]!)).toBe(false);
    expect(showsEventCard(rules.board[index('TRAINING')]!)).toBe(false);
    expect(showsEventCard(rules.board[index('START')]!)).toBe(false);
    const herb = eventCardFor(
      { type: 'TileResolved', seat: 1, tile: index('HERB'), tileId: 'HERB' },
      rules,
    )!;
    expect(herb).toMatchObject({ kind: 'tile', seat: 1, tone: 'good', icon: 'herb' });
    expect(herb.chips[0]!.icon).toBe('hp');
  });

  it('keeps a cave card face down until the mystery card turns it over', () => {
    const cave = eventCardFor(
      { type: 'TileResolved', seat: 0, tile: index('MYSTERY'), tileId: 'MYSTERY' },
      rules,
    )!;
    expect(cave.kind).toBe('cave');
    expect(cave.chips).toEqual([]);
    const card = eventCardFor({ type: 'MysteryCardDrawn', seat: 0, cardId: 'BAT_SWARM' }, rules)!;
    expect(card).toMatchObject({ kind: 'mystery', title: '박쥐 떼', tone: 'mystery' });
    expect(card.chips.length).toBeGreaterThan(0);
  });

  it('shows the start bonus and nothing for other events', () => {
    const bonus = eventCardFor(
      { type: 'StartBonus', seat: 2, coins: 10, hp: 0, coinsAfter: 15, hpAfter: 40 },
      rules,
    )!;
    expect(bonus.chips.map((c) => c.amount)).toEqual([10]);
    expect(eventCardFor({ type: 'DiceRolled', seat: 0, value: 3 }, rules)).toBeNull();
  });

  it('explains the actual HP loss when coins cannot cover a tile event', () => {
    const bandit = index('BANDIT');
    const card = eventCardFor(
      { type: 'TileResolved', seat: 0, tile: bandit, tileId: 'BANDIT' },
      rules,
      [
        { type: 'EffectApplied', seat: 0, effect: 'coins', delta: -2, after: 0 },
        {
          type: 'EffectApplied',
          seat: 0,
          effect: 'hp',
          delta: -4,
          after: 12,
          cause: 'coinShortfall',
        },
      ],
    );
    expect(card?.notice).toBe('코인이 부족해 HP 4를 대신 잃었습니다');
  });

  it('only attributes a shortfall to the matching event and seat', () => {
    const bandit = index('BANDIT');
    const tile = {
      type: 'TileResolved' as const,
      seat: 0,
      tile: bandit,
      tileId: 'BANDIT' as const,
    };
    const otherSeat = eventCardFor(tile, rules, [
      {
        type: 'EffectApplied',
        seat: 1,
        effect: 'hp',
        delta: -3,
        after: 12,
        cause: 'coinShortfall',
      },
    ]);
    expect(otherSeat?.notice).toBeUndefined();

    const laterEvent = eventCardFor(tile, rules, [
      { type: 'TurnEnded', seat: 0 },
      {
        type: 'EffectApplied',
        seat: 0,
        effect: 'hp',
        delta: -3,
        after: 12,
        cause: 'coinShortfall',
      },
    ]);
    expect(laterEvent?.notice).toBeUndefined();

    const hpFloor = eventCardFor(tile, rules, [
      { type: 'EffectApplied', seat: 0, effect: 'hp', delta: 0, after: 1, cause: 'coinShortfall' },
    ]);
    expect(hpFloor?.notice).toBeUndefined();
  });

  it('explains coin shortfalls on a mystery card after it is revealed', () => {
    const card = eventCardFor({ type: 'MysteryCardDrawn', seat: 0, cardId: 'BAT_SWARM' }, rules, [
      { type: 'EffectApplied', seat: 0, effect: 'hp', delta: -2, after: 8, cause: 'coinShortfall' },
    ]);
    expect(card?.notice).toBe('코인이 부족해 HP 2를 대신 잃었습니다');
  });

  it('counts small changes in 300 ms and big ones in 500 ms', () => {
    expect(countUpMs(10)).toBe(300);
    expect(countUpMs(-11)).toBe(500);
  });
});

const game = (): PublicGameState =>
  toPublicState(
    createGame({ seats: [{ job: 'mage' }, { job: 'ninja' }, { job: 'archer' }] }, DEFAULT_RULES, 3),
  );

const inputs = (over: Partial<PawnInputs>): PawnInputs => ({
  display: game(),
  current: null,
  stepped: null,
  pending: null,
  combat: null,
  speed: 1,
  nameOf: (s) => `P${s}`,
  ...over,
});

const duelView = (a: number, b: number): CombatView => ({
  kind: 'duel',
  a: { ref: a, hp: 10, maxHp: 30 },
  b: { ref: b, hp: 0, maxHp: 30 },
  first: a,
  hits: [],
  winner: a,
  capReached: false,
  eliminated: b,
  pendingIndomitable: false,
});

describe('pawn view model', () => {
  it('hops the moving seat and counts the remaining steps down to a burst', () => {
    const i = inputs({ stepped: { seat: 1, tile: 5, hop: 2, steps: 3, ms: 144 } });
    const p = buildPawns(i).find((x) => x.seat === 1)!;
    expect(p.tile).toBe(5);
    expect(p.motion).toEqual({ kind: 'hop', ms: 144, final: false });
    expect(p.count).toBe(1);
    const last = buildPawns(inputs({ stepped: { seat: 1, tile: 6, hop: 3, steps: 3, ms: 130 } }));
    expect(last.find((x) => x.seat === 1)).toMatchObject({ count: 0, motion: { final: true } });
  });

  it('shows the roulette result after it settles and while a ninja adjusts', () => {
    const roll: GameEvent = { type: 'DiceRolled', seat: 0, value: 5 };
    const p = buildPawns(inputs({ current: roll, speed: 2 })).find((x) => x.seat === 0)!;
    expect(p.count).toBe(5);
    expect(p.countDelayMs).toBe(300);
    const display = { ...game(), turn: { ...game().turn, dice: 4 } };
    expect(
      pawnCount(2, {
        display,
        current: null,
        stepped: null,
        pending: { actor: 2, phase: 'MOVE_ADJUST' },
      }),
    ).toBe(4);
    expect(pawnCount(1, { display, current: null, stepped: null, pending: null })).toBeNull();
  });

  it('hops through a teleport route and marks the current player active', () => {
    const tp: GameEvent = { type: 'Moved', seat: 2, from: 0, to: 9, steps: 9, via: 'teleport' };
    const pawns = buildPawns(
      inputs({ current: tp, stepped: { seat: 2, tile: 3, hop: 3, steps: 9, ms: 69 } }),
    );
    expect(pawns.find((x) => x.seat === 2)).toMatchObject({
      tile: 3,
      motion: { kind: 'hop', ms: 69, final: false },
      count: 6,
    });
    expect(pawns.filter((x) => x.active).map((x) => x.seat)).toEqual([game().current]);
  });

  it('keeps a fight loser standing until the fight closes, then topples it', () => {
    const base = game();
    const display = {
      ...base,
      players: base.players.map((p) => (p.seat === 2 ? { ...p, alive: false, hp: 0 } : p)),
    };
    const during = buildPawns(inputs({ display, combat: duelView(0, 2) })).find(
      (x) => x.seat === 2,
    )!;
    expect(during.out).toBe(false);
    const after = buildPawns(inputs({ display })).find((x) => x.seat === 2)!;
    expect(after.out).toBe(true);
    expect(after.count).toBeNull();
  });
});

describe('lair', () => {
  it('describes board dragon intent and attack cadence without inventing a breath countdown', () => {
    expect(dragonIntentCue('asleep', 3)).toEqual({
      status: '용이 잠들어 있습니다',
      breath: '전투 시 3번째 공격마다 브레스',
    });
    expect(dragonIntentCue('awake', 3).status).toBe('용에게 도전할 수 있습니다');
    expect(dragonIntentCue('roar', 3).status).toBe('용이 포효합니다');
    expect(dragonIntentCue('asleep', 4).breath).toBe('전투 시 4번째 공격마다 브레스');
  });

  it('sleeps, wakes when a challenge is legal and roars in a dragon fight', () => {
    expect(lairState(null, false)).toBe('asleep');
    expect(lairState(null, true)).toBe('awake');
    expect(lairState({ ...duelView(0, 1), kind: 'dragonFight' }, false)).toBe('roar');
  });

  it('lights one breath rune per dragon attack and all of them on the breath', () => {
    const hit = (attacker: number | 'dragon') => ({
      index: 0,
      attacker,
      defender: attacker === 'dragon' ? 0 : ('dragon' as const),
      roll: 1,
      damage: 1,
      hpAfter: 1,
      badges: [],
    });
    const fight = (n: number): CombatView => ({
      ...duelView(0, 1),
      kind: 'dragonFight',
      hits: Array.from({ length: n }, (_, i) => [hit(0), hit('dragon')][i % 2]!),
    });
    expect(breathRunesLit(null, 3)).toBe(0);
    expect(breathRunesLit(fight(1), 3)).toBe(0);
    expect(breathRunesLit(fight(2), 3)).toBe(1);
    expect(breathRunesLit(fight(6), 3)).toBe(3);
    expect(breathRunesLit(fight(8), 3)).toBe(1);
    expect(breathRunesLit(duelView(0, 1), 3)).toBe(0);
  });
});
