import { EventEmitter } from 'node:events';
import { COMBAT_PACK_VERSION, DEFAULT_COMBAT_RULES, hashCombatRules } from '@dragon-rush/combat';
import { withRules, type GameEvent } from '@dragon-rush/engine';
import {
  combatBuildId,
  NETCODE_VERSION,
  PREROLL_TICKS,
  PVE_HOLD_TICKS,
  PVP_HOLD_TICKS,
} from '@dragon-rush/netcode';
import {
  FIGHT_S2C,
  FightStartSchema,
  PROTOCOL_VERSION,
  S2C,
  type FightStartMsg,
} from '@dragon-rush/protocol';
import { expect, it, vi } from 'vitest';
import { OnlineGameClient } from '../src/services/OnlineGameClient';
import type { GameUpdate } from '../src/services/gameClient';
import type { OnlineSession } from '../src/services/onlineSession';
import { GameSession, type SessionNotifier } from '../../server/src/game/GameSession';

it('retains a totem bonus through reconnect snapshots and authoritative fight presentation', async () => {
  const rules = withRules({ startingItems: { princeTotem: 2 } });
  const launches: Parameters<NonNullable<SessionNotifier['fightStarted']>>[0][] = [];
  let events: GameEvent[] = [];
  const game = new GameSession(
    {
      seats: [
        { lobbySeat: 0, kind: 'human', playerId: 'alice', name: 'Alice', job: 'swordsman' },
        { lobbySeat: 1, kind: 'human', playerId: 'bob', name: 'Bob', job: 'archer' },
      ],
      rules,
      seed: 42,
      turnTimeoutMs: 60_000,
      reconnectGraceMs: 1000,
      botActionDelayMs: 60_000,
      maxConsecutiveTimeouts: 3,
    },
    {
      update: (next) => {
        events = next;
      },
      seatStatus: () => {},
      seatTakeover: () => {},
      ended: () => {},
      fightStarted: (fight) => launches.push(fight),
    },
  );
  const socket = new EventEmitter();
  const client = new OnlineGameClient({
    socket,
    call: vi.fn().mockResolvedValue({ ok: true }),
  } as unknown as OnlineSession);
  const updates: GameUpdate[] = [];
  client.subscribe((update) => updates.push(update));
  try {
    expect(PROTOCOL_VERSION).toBe(3);
    const actor = game.publicState.pending!.actor;
    const playerId = game.seatOf('alice') === actor ? 'alice' : 'bob';
    const originalMaxHp = game.publicState.players[actor]!.maxHp;
    game.submit(actor, { type: 'CHALLENGE_DRAGON' }, game.version, 'human');
    expect(launches).toHaveLength(1);
    const fight = launches[0]!;
    const boostedMaxHp = originalMaxHp + rules.princeTotemMaxHpBonus;
    expect(fight.request.princeTotemBonusA).toBe(rules.princeTotemMaxHpBonus);
    expect(fight.setup.a).toMatchObject({ hp: boostedMaxHp, maxHp: boostedMaxHp });
    expect(game.publicState.players[actor]!.items.princeTotem).toBe(1);

    const start: FightStartMsg = {
      fightId: fight.id,
      kind: fight.setup.kind,
      seed: fight.seed,
      setup: fight.setup,
      rules: DEFAULT_COMBAT_RULES,
      rulesHash: hashCombatRules(DEFAULT_COMBAT_RULES),
      packVersion: COMBAT_PACK_VERSION,
      combatBuildId: combatBuildId(NETCODE_VERSION),
      seats: [{ engineSeat: actor, playerId, name: 'Challenger', controller: 'human' }],
      you: { role: 'fighter', seat: 0 },
      prerollTicks: PREROLL_TICKS,
      maxTicks: DEFAULT_COMBAT_RULES.timeLimit.dragonFight,
      pveHoldTicks: PVE_HOLD_TICKS,
      pvpHoldTicks: PVP_HOLD_TICKS,
    };
    const snapshot = structuredClone(game.snapshotFor(playerId));
    expect(snapshot.publicState.combat?.princeTotemBonusA).toBe(rules.princeTotemMaxHpBonus);
    socket.emit(S2C.gameSnapshot, snapshot);
    socket.emit(FIGHT_S2C.start, FightStartSchema.parse(structuredClone(start)));
    expect(updates.at(-1)?.fight?.request.princeTotemBonusA).toBe(rules.princeTotemMaxHpBonus);
    expect(updates.at(-1)?.fight?.setup.a).toMatchObject({ hp: boostedMaxHp, maxHp: boostedMaxHp });

    const result = { winner: 'a' as const, hpA: boostedMaxHp, hpB: null };
    expect(() => game.submitCombatResult(fight.id + 1, result)).toThrow('fight is not active');
    expect(game.publicState.players[actor]!.maxHp).toBe(boostedMaxHp);
    game.submitCombatResult(fight.id, result);
    expect(game.publicState.players[actor]).toMatchObject({
      hp: originalMaxHp,
      maxHp: originalMaxHp,
    });
    expect(game.publicState.players[actor]!.items.princeTotem).toBe(1);
    socket.emit(S2C.gameUpdate, structuredClone(game.updateFor(playerId, events)));
    expect(updates.at(-1)?.fight?.id).toBe(fight.id);
    expect(await client.reportFight(fight.id + 1)).toEqual({ ok: false, code: 'NO_FIGHT' });
    expect(await client.reportFight(fight.id)).toEqual({ ok: true });
    expect(updates.at(-1)?.version).toBe(game.version);
    expect(updates.at(-1)?.fight).toBeNull();
    expect(updates.at(-1)?.publicState.players[actor]).toMatchObject({
      hp: originalMaxHp,
      maxHp: originalMaxHp,
    });
    expect(updates.at(-1)?.publicState.players[actor]!.items.princeTotem).toBe(1);
  } finally {
    client.dispose();
    game.dispose();
  }
});
