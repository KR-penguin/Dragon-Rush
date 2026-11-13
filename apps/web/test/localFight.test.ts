import { NO_INPUT, createCombatBot, runCombat, type CombatState } from '@dragon-rush/combat';
import type { Action, GameEvent } from '@dragon-rush/engine';
import { describe, expect, it } from 'vitest';
import {
  LocalGameClient,
  type LocalGameConfig,
  type Scheduler,
} from '../src/services/LocalGameClient';
import { createFightBotSource, FIGHT_BOT_LEVELS } from '../src/services/fight/botInput';

it('uses the calibrated per-tick scripted bot policy in Normal local fights', () => {
  expect(FIGHT_BOT_LEVELS.normal.interval).toBe(1);
  const setup = {
    kind: 'duel' as const,
    a: { job: 'swordsman' as const, hp: 53, maxHp: 53, atk: 5, def: 5, indomitableAvailable: true },
    b: { job: 'archer' as const, hp: 39, maxHp: 39, atk: 6, def: 6, indomitableAvailable: false },
  };
  const seed = 733;
  const live = new LocalSimProvider(setup, seed, [
    createFightBotSource('normal', seed, 'a'),
    createFightBotSource('normal', seed, 'b'),
  ]);
  while (!live.curr.outcome) live.step();
  const headless = runCombat(
    setup,
    [createCombatBot('balanced'), createCombatBot('balanced')],
    seed,
    undefined,
    { decisionInterval: 1 },
  );
  expect(live.result()).toEqual(headless.result);
});
import { LocalSimProvider, ReplayProvider, simulateFight } from '../src/services/fight/simProvider';
import type { FightInputSource } from '../src/services/fight/types';
import type { GameUpdate, PendingFight } from '../src/services/gameClient';

function manualScheduler() {
  const tasks: (() => void)[] = [];
  const schedule: Scheduler = (fn) => {
    tasks.push(fn);
    return () => {
      const i = tasks.indexOf(fn);
      if (i >= 0) tasks.splice(i, 1);
    };
  };
  const flush = (max = 10_000) => {
    for (let i = 0; i < max && tasks.length; i++) tasks.shift()!();
  };
  return { schedule, flush };
}

function open(config: LocalGameConfig) {
  const sched = manualScheduler();
  const client = new LocalGameClient(config, sched.schedule);
  const updates: GameUpdate[] = [];
  client.subscribe((u) => updates.push(u));
  return { client, sched, updates, latest: () => updates.at(-1)! };
}

/** Walks the board without fighting: roll, no move adjust, no shield, end turn. */
function boardStep(u: GameUpdate): Action {
  const legal = u.legalActions;
  const pick = (type: Action['type']) => legal.find((a) => a.type === type);
  return (
    pick('ROLL_DICE') ??
    legal.find((a) => a.type === 'ADJUST_MOVE' && a.delta === 0) ??
    legal.find((a) => a.type === 'SHIELD_DECISION' && !a.use) ??
    pick('CHOOSE_TRAINING_STAT') ??
    pick('CHOOSE_PVP_TARGET') ??
    pick('END_TURN') ??
    legal[0]!
  );
}

/** Walks into the dragon, attacking every other tick: a scripted human fight. */
const scripted: FightInputSource = {
  sample: (s: CombatState) => ({
    move: s.tick < 40 ? 1 : 0,
    attack: s.tick % 2 === 0,
    skill: false,
    dash: false,
  }),
};
const idle: FightInputSource = { sample: () => NO_INPUT };

const eventTypes = (u: GameUpdate): GameEvent['type'][] => u.events.map((e) => e.type);

describe('real-time fights in local play', () => {
  it('pauses at COMBAT, offers the fight, and applies the scripted fight result', async () => {
    const g = open({
      seed: 21,
      seats: [
        { name: 'A', job: 'swordsman', kind: 'human' },
        { name: 'B', job: 'mage', kind: 'human' },
      ],
    });
    const before = g.latest();
    const actor = before.pending!.actor;
    await g.client.submit({ type: 'CHALLENGE_DRAGON' }, before.version);
    const u = g.latest();
    expect(u.pending).toMatchObject({ actor, phase: 'COMBAT' });
    expect(u.legalActions).toEqual([]);
    expect(eventTypes(u)).toContain('CombatStarted');
    const fight = u.fight!;
    expect(fight.request).toEqual({ kind: 'dragonFight', a: actor, b: null });
    expect(fight.sides).toEqual([
      { side: 'a', seat: actor, control: 'keyboard-solo' },
      { side: 'b', seat: null, control: 'dragon' },
    ]);
    expect(fight.replay).toBeNull();
    const me = u.publicState.players.find((p) => p.seat === actor)!;
    expect(fight.setup.a).toMatchObject({
      job: me.job,
      hp: me.hp,
      maxHp: me.maxHp,
      atk: me.atk,
      def: me.def,
    });
    // Board actions are refused while the fight is pending.
    expect((await g.client.submit({ type: 'END_TURN' }, u.version)).ok).toBe(false);

    const out = simulateFight(fight.setup, fight.seed, [scripted, null]);
    expect(out.inputs.length).toBe(out.ticks * 2);
    expect(await g.client.reportFight(fight.id, out.result)).toEqual({ ok: true });
    const after = g.latest();
    expect(after.fight).toBeNull();
    expect(after.version).toBe(u.version + 1);
    expect(eventTypes(after)).toContain('CombatEnded');
    const p = after.publicState.players.find((x) => x.seat === actor)!;
    if (out.result.winner === 'a') expect(after.publicState.outcome?.kind).toBe('dragon');
    else expect(p.alive).toBe(false);
    // The same fight cannot be reported twice.
    expect((await g.client.reportFight(fight.id, out.result)).ok).toBe(false);
  });

  it('runs a hot-seat duel with P1/P2 keys and writes HP back to the board', async () => {
    const g = open({
      seed: 5,
      debug: true,
      seats: [
        { name: 'A', job: 'berserker', kind: 'human' },
        { name: 'B', job: 'ninja', kind: 'human' },
      ],
    });
    for (let i = 0; i < 200; i++) {
      const u = g.latest();
      if (u.publicState.round >= 3 && u.pending?.phase === 'PRE_ROLL') break;
      await g.client.submit(boardStep(u), u.version);
    }
    const start = g.latest();
    const arriver = start.pending!.actor;
    const defender = start.publicState.players.find((p) => p.seat !== arriver)!.seat;
    const from = start.publicState.players.find((p) => p.seat === arriver)!.position;
    const tile = start.publicState.rules.board.findIndex((t, i) => !t.safe && i !== from);
    const defenderMaxHp = start.publicState.players.find((p) => p.seat === defender)!.maxHp;
    g.client.debugPatchPlayer(defender, {
      position: tile,
      hp: 1,
      items: { shield: 0, princeTotem: 1 },
    });
    g.client.debugPatchPlayer(arriver, { items: { teleport: 1, shield: 0, princeTotem: 0 } });
    await g.client.submit({ type: 'USE_TELEPORT', tile }, g.latest().version);
    for (let i = 0; i < 5 && !g.latest().fight; i++) {
      const u = g.latest();
      await g.client.submit(boardStep(u), u.version);
    }
    const fight = g.latest().fight as PendingFight;
    expect(fight.request).toEqual({
      kind: 'duel',
      a: arriver,
      b: defender,
      princeTotemBonusB: start.publicState.rules.princeTotemMaxHpBonus,
    });
    expect(fight.setup.b).toMatchObject({
      hp: defenderMaxHp + start.publicState.rules.princeTotemMaxHpBonus,
      maxHp: defenderMaxHp + start.publicState.rules.princeTotemMaxHpBonus,
    });
    expect(fight.sides.map((s) => s.control)).toEqual(['keyboard-p1', 'keyboard-p2']);

    const out = simulateFight(fight.setup, fight.seed, [scripted, idle]);
    const before = g.latest().version;
    expect((await g.client.reportFight(fight.id, out.result)).ok).toBe(true);
    const after = g.latest();
    expect(after.version).toBe(before + 1);
    const winnerSeat = out.result.winner === 'a' ? arriver : defender;
    const loserSeat = out.result.winner === 'a' ? defender : arriver;
    const winner = after.publicState.players.find((p) => p.seat === winnerSeat)!;
    expect(winner.hp).toBe(winner.maxHp);
    expect(after.publicState.players.find((p) => p.seat === loserSeat)!.alive).toBe(false);
    expect(after.publicState.players.find((p) => p.seat === defender)!.maxHp).toBe(defenderMaxHp);
    expect(after.publicState.players.find((p) => p.seat === defender)!.items.princeTotem).toBe(0);
    expect(eventTypes(after)).toContain('PlayerEliminated');
  });

  it('rejects stale fight ids and impossible results; dice settles on request', async () => {
    const g = open({
      seed: 8,
      seats: [
        { name: 'A', job: 'archer', kind: 'human' },
        { name: 'B', job: 'ninja', kind: 'human' },
      ],
    });
    await g.client.submit({ type: 'CHALLENGE_DRAGON' }, g.latest().version);
    const fight = g.latest().fight!;
    expect((await g.client.reportFight(fight.id + 1, 'dice')).ok).toBe(false);
    const bad = await g.client.reportFight(fight.id, { winner: 'a', hpA: 0, hpB: null });
    expect(bad).toMatchObject({ ok: false, code: 'INVALID_RESULT' });
    expect(g.latest().fight).not.toBeNull();
    expect((await g.client.reportFight(fight.id, 'dice')).ok).toBe(true);
    expect(g.latest().fight).toBeNull();
    expect(eventTypes(g.latest())).toContain('CombatHit');
  });

  it('fast combat mode settles fights with dice inside the same update', async () => {
    const g = open({
      seed: 8,
      fightMode: () => 'dice',
      seats: [
        { name: 'A', job: 'archer', kind: 'human' },
        { name: 'B', job: 'ninja', kind: 'human' },
      ],
    });
    await g.client.submit({ type: 'CHALLENGE_DRAGON' }, g.latest().version);
    expect(g.latest().fight).toBeNull();
    expect(eventTypes(g.latest())).toContain('CombatEnded');
  });
});

describe('bot-only fights', () => {
  it('resolves a shared-tile bot duel with no shield used', async () => {
    const g = open({
      seed: 0,
      debug: true,
      maxRounds: 25,
      seats: [
        { name: 'R1', job: 'berserker', kind: 'bot', botName: 'heuristic:aggro' },
        { name: 'R2', job: 'swordsman', kind: 'bot', botName: 'heuristic:aggro' },
      ],
    });
    const arriver = g.latest().pending!.actor;
    const defender = g.latest().publicState.players.find((player) => player.seat !== arriver)!.seat;
    g.client.debugPatchPlayer(arriver, {
      position: 23,
      coins: 0,
      items: { teleport: 1, shield: 0, princeTotem: 0 },
    });
    g.client.debugPatchPlayer(defender, {
      position: 1,
      coins: 0,
      hp: 1,
      items: { teleport: 0, shield: 0, princeTotem: 0 },
    });
    for (let i = 0; i < 12; i++) {
      g.sched.flush();
      const fight = g.latest().fight;
      if (!fight) break;
      await g.client.reportFight(fight.id, fight.replay?.result ?? 'dice');
      if (g.updates.some((u) => eventTypes(u).includes('PlayerEliminated'))) break;
    }
    const events = g.updates.flatMap((u) => u.events);
    const started = events.findIndex((e) => e.type === 'CombatStarted' && e.kind === 'duel');
    const landed = events.reduce(
      (found, e, i) => (i < started && e.type === 'PvpTriggered' ? i : found),
      -1,
    );
    expect(landed).toBeGreaterThanOrEqual(0);
    expect(started).toBeGreaterThan(landed);
    expect(events.slice(landed, started).some((e) => e.type === 'ShieldUsed')).toBe(false);
    expect(events.slice(started).some((e) => e.type === 'PlayerEliminated')).toBe(true);
    g.client.dispose();
  });

  it('offers a replay screen even when no human plays', async () => {
    const g = open({
      seed: 0,
      maxRounds: 25,
      seats: [
        { name: 'R1', job: 'berserker', kind: 'bot', botName: 'heuristic:aggro' },
        { name: 'R2', job: 'swordsman', kind: 'bot', botName: 'heuristic:aggro' },
      ],
    });
    g.sched.flush();
    const pending = g.latest();
    expect(pending.fight?.replay).toBeTruthy();
    expect(pending.pending?.phase).toBe('COMBAT');
    const fight = pending.fight!;
    expect(await g.client.reportFight(fight.id, fight.replay!.result)).toEqual({ ok: true });
    expect(g.latest().fight).toBeNull();
    expect(eventTypes(g.latest())).toContain('CombatEnded');
    g.client.dispose();
  });

  /** Plays as the human (never challenging) until a bot-only fight is offered; null if the game ends first. */
  async function findBotOnlyFight(seed: number) {
    const g = open({
      seed,
      maxRounds: 40,
      seats: [
        { name: '나', job: 'mage', kind: 'human' },
        { name: '러시', job: 'berserker', kind: 'bot', botName: 'heuristic:rush' },
        { name: '러시2', job: 'archer', kind: 'bot', botName: 'heuristic:rush' },
      ],
    });
    for (let i = 0; i < 600; i++) {
      g.sched.flush(1);
      const u = g.latest();
      if (u.publicState.outcome) return null;
      if (u.fight?.replay) return { g, fight: u.fight };
      // A fight against the human is not what this test is about: settle it and walk on.
      if (u.fight) await g.client.reportFight(u.fight.id, 'dice');
      else if (u.legalActions.length > 0) {
        const pick = boardStep(u);
        await g.client.submit(
          pick.type === 'CHALLENGE_DRAGON' ? { type: 'END_TURN' } : pick,
          u.version,
        );
      }
    }
    return null;
  }

  it('carry a replay when a human is watching, and the replay reproduces the result', async () => {
    let found: Awaited<ReturnType<typeof findBotOnlyFight>> = null;
    for (let seed = 1; seed <= 12 && !found; seed++) found = await findBotOnlyFight(seed);
    expect(found).not.toBeNull();
    const { g, fight } = found!;
    const f = fight;
    expect(f.sides.every((s) => s.control === 'bot' || s.control === 'dragon')).toBe(true);
    const replay = f.replay!;
    expect(replay.inputs.length).toBe(replay.ticks * 2);

    // Re-simulating the recorded inputs gives the same fight.
    const rp = new ReplayProvider(f.setup, f.seed, replay.inputs);
    while (!rp.curr.outcome) rp.step();
    expect(rp.result()).toEqual(replay.result);
    // So does a live session with the same bot sources (what the screen would run).
    const live = new LocalSimProvider(f.setup, f.seed, [
      createFightBotSource(f.botLevel, f.seed, 'a'),
      f.setup.b ? createFightBotSource(f.botLevel, f.seed, 'b') : null,
    ]);
    while (!live.curr.outcome) live.step();
    expect(live.result()).toEqual(replay.result);
    expect((await g.client.reportFight(f.id, replay.result)).ok).toBe(true);
    expect(g.latest().fight).toBeNull();
  });
});
