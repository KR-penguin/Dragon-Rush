import { DEFAULT_COMBAT_RULES, hashCombatState, type CombatSetup } from '@dragon-rush/combat';
import { describe, expect, it } from 'vitest';
import { FightAuthority } from '../src/authority';
import { RollbackSession } from '../src/client/rollbackSession';
import { STARVE_BOT_MS, TICK_MS } from '../src/constants';

const fighter = (job: 'swordsman' | 'archer') => ({
  job,
  hp: 100,
  maxHp: 100,
  atk: 10,
  def: 5,
  indomitableAvailable: false,
});
const setup: CombatSetup = { kind: 'duel', a: fighter('swordsman'), b: fighter('archer') };
const dragon: CombatSetup = {
  kind: 'dragonFight',
  a: fighter('swordsman'),
  b: null,
  dragon: { hp: 100, atk: 10, def: 5 },
};

const authority = (fight: CombatSetup) =>
  new FightAuthority({
    fightId: 7,
    setup: fight,
    seed: 42,
    rules: DEFAULT_COMBAT_RULES,
    controllers: fight.kind === 'duel' ? ['human', 'human'] : ['human', 'bot'],
    botMask: () => 0,
  });
const packet = (tick: number, mask: number) => ({
  fightId: 7,
  newestTick: tick,
  ackConfirmTick: 0,
  masks: [mask],
});

describe('server-authoritative fight', () => {
  it('does not reveal a same-tick input before the other fighter commits', () => {
    const a = authority(setup);
    a.accept(1, packet(1, 0x14), 1, TICK_MS);
    expect(a.drain().relays).toHaveLength(0);
    a.accept(0, packet(1, 0x13), 1, TICK_MS);
    const relays = a.drain().relays;
    expect(relays).toHaveLength(2);
    expect(relays.find((r) => r.recipient === 0)?.packet.masks).toEqual([0x14]);
  });

  it('does not expose uncommitted opponent inputs in a sync snapshot', () => {
    const server = authority(setup);
    server.accept(1, packet(5, 0x14), 1, TICK_MS);
    expect(server.sync('join', 0).pending).toHaveLength(0);
    expect(server.sync('join', null).pending).toHaveLength(0);
    server.accept(0, packet(5, 0), 1, TICK_MS);
    expect(server.sync('join', 0).pending.some((p) => p.seat === 1)).toBe(true);
  });

  it('converges two rollback clients after delayed relays and confirms', () => {
    const server = authority(setup);
    const makeClient = (localSeat: 0 | 1) =>
      new RollbackSession({
        setup,
        seed: 42,
        rules: DEFAULT_COMBAT_RULES,
        localSeat,
        controllers: ['human', 'human'],
        hardCap: 40,
      });
    const clients: [RollbackSession, RollbackSession] = [makeClient(0), makeClient(1)];
    const pending: { at: number; to: 0 | 1; kind: 'relay' | 'confirm'; packet: unknown }[] = [];
    let lastConfirm = 0;
    for (let t = 1; t <= 240 && !server.result; t++) {
      const masks = [
        t % 9 === 0 ? 0x13 : t % 9 < 4 ? 3 : 0,
        t % 11 === 0 ? 0x15 : t % 11 < 5 ? 5 : 0,
      ];
      for (const seat of [0, 1] as const) {
        clients[seat].stamp(t, masks[seat]!);
        server.accept(seat, packet(t, masks[seat]!), t, t * TICK_MS);
      }
      server.advanceTo(t, t * TICK_MS);
      for (const relay of server.drain().relays)
        pending.push({ at: t + 3, to: relay.recipient, kind: 'relay', packet: relay.packet });
      if (server.tick - lastConfirm >= 2 || server.result) {
        for (const to of [0, 1] as const)
          pending.push({
            at: t + 4,
            to,
            kind: 'confirm',
            packet: server.confirm(lastConfirm + 1, to),
          });
        lastConfirm = server.tick;
      }
      for (const c of clients) c.update(t, t);
      for (const item of pending.filter((p) => p.at <= t)) {
        if (item.kind === 'relay')
          clients[item.to].ingestRelay(
            item.packet as Parameters<RollbackSession['ingestRelay']>[0],
          );
        else
          clients[item.to].ingestConfirm(
            item.packet as Parameters<RollbackSession['ingestConfirm']>[0],
          );
      }
      for (let i = pending.length - 1; i >= 0; i--) if (pending[i]!.at <= t) pending.splice(i, 1);
      for (const c of clients) c.update(t, t);
    }
    for (const item of pending) {
      if (item.kind === 'relay')
        clients[item.to].ingestRelay(item.packet as Parameters<RollbackSession['ingestRelay']>[0]);
      else
        clients[item.to].ingestConfirm(
          item.packet as Parameters<RollbackSession['ingestConfirm']>[0],
        );
    }
    for (const c of clients) {
      c.update(server.tick, server.tick);
      expect(c.lastPromoted).toBe(server.tick);
      expect(hashCombatState(c.current)).toBe(server.hash);
      expect(c.stats.desyncs).toBe(0);
    }
  });

  it('keeps PvE own prediction exact with zero delay', () => {
    const server = authority(dragon);
    const client = new RollbackSession({
      setup: dragon,
      seed: 42,
      rules: DEFAULT_COMBAT_RULES,
      localSeat: 0,
      controllers: ['human', 'bot'],
      hardCap: 120,
    });
    let lastConfirm = 0;
    for (let t = 1; t <= 120 && !server.result; t++) {
      const mask = t % 20 < 8 ? 3 : 0;
      client.stamp(t, mask);
      server.accept(0, packet(t, mask), t, t * TICK_MS);
      server.advanceTo(t, t * TICK_MS);
      if (server.tick - lastConfirm >= 2) {
        client.ingestConfirm(server.confirm(lastConfirm + 1, 0));
        lastConfirm = server.tick;
      }
      client.update(t, t);
    }
    expect(client.stats.ownCorrections).toBe(0);
    expect(client.stats.desyncs).toBe(0);
  });

  it('hands a disconnected fighter to a bot without revoking a committed mask', () => {
    const server = authority(setup);
    server.accept(0, packet(1, 3), 0, 0);
    server.takeOver(0);
    expect(server.drain().controls[0]).toMatchObject({ controller: 'bot', fromTick: 2 });
    server.accept(1, packet(1, 0), 1, TICK_MS);
    server.advanceTo(1, TICK_MS);
    expect(server.log[0]?.a).toBe(3);
    server.accept(1, packet(2, 0), 2, 2 * TICK_MS);
    server.advanceTo(2, 2 * TICK_MS);
    expect((server.log[1]?.flags ?? 0) & 4).toBe(4);
  });

  it('applies starvation takeover when no future human input is buffered', () => {
    let botCalls = 0;
    const server = new FightAuthority({
      fightId: 7,
      setup,
      seed: 42,
      rules: DEFAULT_COMBAT_RULES,
      controllers: ['human', 'human'],
      botMask: () => {
        botCalls += 1;
        return 3;
      },
    });
    const endTick = Math.ceil(STARVE_BOT_MS / TICK_MS) + 10;
    for (let tick = 1; tick <= endTick; tick++) server.advanceTo(tick, tick * TICK_MS);

    expect(server.streams.map((stream) => stream.controller)).toEqual(['bot', 'bot']);
    expect(server.streams.map((stream) => stream.pendingBotAt)).toEqual([null, null]);
    expect(botCalls).toBeGreaterThan(0);
    expect(server.log.at(-1)?.a).toBe(3);
  });
});
