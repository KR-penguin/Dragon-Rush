import type { Ctx } from './ctx';
import { createRng, shuffle } from './rng';
import { validateRules, validateSetup } from './rules/validateRules';
import { beginTurn, emptyItems, freshTurn } from './turn';
import { ITEM_IDS, type GameEvent, type GameSetup, type GameState, type PlayerState, type RulesConfig } from './types';

export function createGame(setup: GameSetup, rules: RulesConfig, seed: number): GameState {
  return createGameWithEvents(setup, rules, seed).state;
}

export function createGameWithEvents(
  setup: GameSetup,
  rules: RulesConfig,
  seed: number,
): { state: GameState; events: GameEvent[] } {
  validateRules(rules);
  validateSetup(setup);
  const [order, rng] = shuffle(
    createRng(seed),
    setup.seats.map((_, i) => i),
  );
  const players: PlayerState[] = order.map((origin, seat) => {
    const job = setup.seats[origin]!.job;
    const def = rules.jobs[job];
    const items = emptyItems();
    for (const id of ITEM_IDS) items[id] = rules.startingItems[id] ?? 0;
    return {
      seat,
      job,
      position: 0,
      alive: true,
      skipNextTurn: false,
      hp: def.hp,
      maxHp: def.hp,
      atk: def.atk,
      def: def.def,
      coins: rules.startingCoins,
      items,
      upgradeLevels: { atk: 0, def: 0, maxHp: 0 },
      passive: { indomitableUsed: false, ninjaCooldown: 0 },
    };
  });
  const ctx: Ctx = {
    s: {
      rules,
      players,
      current: 0,
      round: 1,
      seatOrigin: order,
      pending: null,
      turn: freshTurn(false),
      pvp: null,
      rng,
      outcome: null,
    },
    ev: [],
  };
  ctx.ev.push({ type: 'RoundStarted', round: 1 });
  beginTurn(ctx, 0);
  return { state: ctx.s, events: ctx.ev };
}

export function cloneState(s: GameState): GameState {
  return {
    rules: s.rules,
    players: s.players.map((p) => ({
      ...p,
      items: { ...p.items },
      upgradeLevels: { ...p.upgradeLevels },
      passive: { ...p.passive },
    })),
    current: s.current,
    round: s.round,
    seatOrigin: [...s.seatOrigin],
    pending: s.pending ? { ...s.pending } : null,
    turn: { ...s.turn },
    pvp: s.pvp ? { ...s.pvp, candidates: [...s.pvp.candidates] } : null,
    rng: { ...s.rng },
    outcome: s.outcome ? { ...s.outcome } : null,
  };
}
