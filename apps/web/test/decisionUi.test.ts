import {
  createGame,
  DEFAULT_RULES,
  getLegalActions,
  toPublicState,
  type Action,
  type PublicGameState,
} from '@dragon-rush/engine';
import { describe, expect, it } from 'vitest';
import { groupActions } from '../src/types/actionGroups';
import {
  activeDialog,
  canAct,
  landingDecisionReached,
  needsHandoff,
  shopVisitKey,
  type DecisionSource,
  type DialogInputs,
} from '../src/types/gameUi';

const base = (): PublicGameState =>
  toPublicState(createGame({ seats: [{ job: 'swordsman' }, { job: 'ninja' }] }, DEFAULT_RULES, 42));

describe('groupActions', () => {
  it('sorts every action type into its group', () => {
    const legal: Action[] = [
      { type: 'ROLL_DICE' },
      { type: 'END_TURN' },
      { type: 'CHALLENGE_DRAGON' },
      { type: 'UPGRADE', stat: 'def' },
      { type: 'UPGRADE', stat: 'maxHp' },
      { type: 'BUY_ITEM', item: 'shield' },
      { type: 'USE_TELEPORT', tile: 4 },
      { type: 'USE_TELEPORT', tile: 9 },
      { type: 'USE_THIEF', target: 1 },
      { type: 'ADJUST_MOVE', delta: 1 },
      { type: 'ADJUST_MOVE', delta: -1 },
      { type: 'ADJUST_MOVE', delta: 0 },
      { type: 'CHOOSE_PVP_TARGET', target: 2 },
      { type: 'SHIELD_DECISION', use: false },
      { type: 'SHIELD_DECISION', use: true },
      { type: 'CHOOSE_TRAINING_STAT', stat: 'atk' },
    ];
    const g = groupActions(legal);
    expect(g.roll && g.endTurn && g.challengeDragon).toBe(true);
    expect(g.upgrades).toEqual(['def', 'maxHp']);
    expect(g.buys).toEqual(['shield']);
    expect(g.teleportTiles).toEqual([4, 9]);
    expect(g.thiefTargets).toEqual([1]);
    expect(g.moveDeltas).toEqual([-1, 0, 1]);
    expect(g.pvpTargets).toEqual([2]);
    expect(g.shieldChoices).toEqual([false, true]);
    expect(g.trainingStats).toEqual(['atk']);
  });

  it('reflects the engine legal list at the start of a game', () => {
    const s = base();
    const g = groupActions(getLegalActions(s));
    expect(g.roll).toBe(true);
    expect(g.challengeDragon).toBe(true);
    expect(g.endTurn).toBe(false);
    expect(g.teleportTiles).toEqual([]);
    expect(g.buys).toEqual([]);
  });

  it('is empty without legal actions', () => {
    const g = groupActions([]);
    expect(g.roll || g.endTurn || g.challengeDragon).toBe(false);
    expect(g.upgrades).toEqual([]);
  });
});

describe('decision gating', () => {
  const update = (overrides: Partial<DecisionSource> = {}): DecisionSource => {
    const s = base();
    return {
      pending: s.pending,
      controllableSeats: [0],
      legalActions: getLegalActions(s),
      publicState: s,
      ...overrides,
    };
  };

  it('lets a controllable seat act only after animations finish', () => {
    expect(canAct(update(), false)).toBe(true);
    expect(canAct(update(), true)).toBe(false);
    expect(canAct(null, false)).toBe(false);
    expect(canAct(update({ controllableSeats: [1] }), false)).toBe(false);
    expect(canAct(update({ legalActions: [] }), false)).toBe(false);
    const s = base();
    expect(
      canAct(update({ publicState: { ...s, outcome: { kind: 'draw', winner: null } } }), false),
    ).toBe(false);
  });

  it('opens landing decisions as soon as the pawn reaches the tile', () => {
    const start = base();
    const landed = {
      ...start,
      players: start.players.map((p) => (p.seat === 0 ? { ...p, position: 6 } : p)),
    };
    const shop = update({
      pending: { actor: 0, phase: 'POST_MOVE' },
      publicState: { ...landed, turn: { ...landed.turn, canBuy: true } },
      legalActions: [{ type: 'END_TURN' }],
    });
    expect(landingDecisionReached(shop, start)).toBe(false);
    expect(landingDecisionReached(shop, landed)).toBe(true);
    expect(
      landingDecisionReached(
        { ...shop, publicState: { ...landed, turn: { ...landed.turn, canBuy: false } } },
        landed,
      ),
    ).toBe(false);
    expect(
      landingDecisionReached(
        { ...shop, pending: { actor: 0, phase: 'CHOOSE_PVP_TARGET' } },
        landed,
      ),
    ).toBe(true);
    expect(
      landingDecisionReached({ ...shop, pending: { actor: 0, phase: 'PRE_ROLL' } }, landed),
    ).toBe(false);
    expect(landingDecisionReached(shop, { ...landed, current: 1 })).toBe(false);
    expect(landingDecisionReached(shop, null)).toBe(false);
  });

  it('opens the defender confirmation when the arriving pawn lands', () => {
    const start = base();
    const before = {
      ...start,
      players: start.players.map((p) => (p.seat === 1 ? { ...p, position: 6 } : p)),
    };
    const landed = {
      ...before,
      players: before.players.map((p) => (p.seat === 0 ? { ...p, position: 6 } : p)),
      pvp: { arriver: 0, candidates: [1], target: 1, stage: 'defender' as const },
    };
    const confirm = update({
      pending: { actor: 1, phase: 'SHIELD_DECISION' },
      controllableSeats: [1],
      publicState: landed,
      legalActions: [{ type: 'SHIELD_DECISION', use: false }],
    });
    expect(landingDecisionReached(confirm, before)).toBe(false);
    expect(landingDecisionReached(confirm, landed)).toBe(true);
  });

  it('asks for a hand-off only when another local human takes over', () => {
    expect(needsHandoff([0, 1], 0, null)).toBe(true);
    expect(needsHandoff([0, 1], 0, 0)).toBe(false);
    expect(needsHandoff([0, 1], 1, 0)).toBe(true);
    expect(needsHandoff([0], 0, null)).toBe(false);
    expect(needsHandoff([0, 1], 2, 0)).toBe(false);
    expect(needsHandoff([0, 1], null, 0)).toBe(false);
  });

  it('changes the shop visit key on a new turn or teleport', () => {
    const s = base();
    const k = shopVisitKey(s);
    expect(shopVisitKey({ ...s, turn: { ...s.turn, teleportsUsed: 1 } })).not.toBe(k);
    expect(shopVisitKey({ ...s, round: 2 })).not.toBe(k);
    expect(shopVisitKey({ ...s, turn: { ...s.turn, canBuy: true } })).toBe(k);
  });
});

describe('activeDialog', () => {
  const inputs = (o: Partial<DialogInputs>): DialogInputs => ({
    canAct: true,
    phase: 'PRE_ROLL',
    handoffNeeded: false,
    shopAvailable: false,
    shopDismissed: false,
    request: null,
    ...o,
  });

  it('shows nothing while the screen cannot act', () => {
    expect(activeDialog(inputs({ canAct: false, phase: 'SHIELD_DECISION' }))).toBeNull();
    expect(activeDialog(inputs({ phase: null }))).toBeNull();
  });

  it('puts the hand-off before any decision', () => {
    expect(activeDialog(inputs({ handoffNeeded: true, phase: 'SHIELD_DECISION' }))).toBe('handoff');
  });

  it('maps forced decisions to their dialogs', () => {
    expect(activeDialog(inputs({ phase: 'MOVE_ADJUST' }))).toBe('moveAdjust');
    expect(activeDialog(inputs({ phase: 'CHOOSE_PVP_TARGET' }))).toBe('pvpTarget');
    expect(activeDialog(inputs({ phase: 'SHIELD_DECISION' }))).toBe('shield');
    expect(activeDialog(inputs({ phase: 'TRAINING_CHOICE' }))).toBe('training');
  });

  it('auto-opens the shop after moving until it is dismissed', () => {
    expect(activeDialog(inputs({ phase: 'POST_MOVE', shopAvailable: true }))).toBe('shop');
    expect(
      activeDialog(inputs({ phase: 'POST_MOVE', shopAvailable: true, shopDismissed: true })),
    ).toBeNull();
    expect(
      activeDialog(
        inputs({ phase: 'POST_MOVE', shopAvailable: true, shopDismissed: true, request: 'shop' }),
      ),
    ).toBe('shop');
    expect(activeDialog(inputs({ phase: 'PRE_ROLL', shopAvailable: true }))).toBeNull();
    expect(activeDialog(inputs({ phase: 'POST_MOVE', request: 'shop' }))).toBeNull();
  });

  it('opens user requests and leaves teleport to the board', () => {
    expect(activeDialog(inputs({ request: 'dragon' }))).toBe('dragon');
    expect(activeDialog(inputs({ request: 'thief', phase: 'POST_MOVE' }))).toBe('thief');
    expect(
      activeDialog(inputs({ request: 'teleport', phase: 'POST_MOVE', shopAvailable: true })),
    ).toBeNull();
  });
});
