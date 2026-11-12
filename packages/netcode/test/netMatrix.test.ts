import { DEFAULT_COMBAT_RULES, hashCombatState, type CombatSetup } from '@dragon-rush/combat';
import { describe, expect, it } from 'vitest';
import { FightAuthority } from '../src/authority';
import { RollbackSession } from '../src/client/rollbackSession';
import { TICK_MS } from '../src/constants';
import { VirtualClock, VirtualLink } from '../src/netsim';
import { chooseInputDelay } from '../src/timing';

const setup: CombatSetup = {
  kind: 'duel',
  a: { job: 'swordsman', hp: 100, maxHp: 100, atk: 10, def: 5, indomitableAvailable: false },
  b: { job: 'archer', hp: 100, maxHp: 100, atk: 10, def: 5, indomitableAvailable: false },
};

describe('virtual TCP network matrix', () => {
  for (const { rtt, jitter, loss } of [
    { rtt: 20, jitter: 5, loss: 0 },
    { rtt: 80, jitter: 15, loss: 0.5 },
    { rtt: 150, jitter: 20, loss: 1 },
    { rtt: 250, jitter: 40, loss: 1 },
  ]) {
    it(`converges at ${rtt} ms RTT, ±${jitter} ms jitter, ${loss}% loss`, () => {
      const clock = new VirtualClock();
      const profile = { oneWayMs: rtt / 2, jitterMs: jitter, lossPct: loss, mode: 'tcp' as const };
      const up = [
        new VirtualLink(clock, profile, 100 + rtt),
        new VirtualLink(clock, profile, 200 + rtt),
      ];
      const down = [
        new VirtualLink(clock, profile, 300 + rtt),
        new VirtualLink(clock, profile, 400 + rtt),
      ];
      const server = new FightAuthority({
        fightId: 9,
        setup,
        seed: 72,
        rules: DEFAULT_COMBAT_RULES,
        controllers: ['human', 'human'],
        botMask: () => 0,
      });
      const clients: [RollbackSession, RollbackSession] = [0, 1].map(
        (localSeat) =>
          new RollbackSession({
            setup,
            seed: 72,
            rules: DEFAULT_COMBAT_RULES,
            localSeat: localSeat as 0 | 1,
            controllers: ['human', 'human'],
            hardCap: 40,
          }),
      ) as [RollbackSession, RollbackSession];
      const d = chooseInputDelay(rtt + jitter, 0, false);
      const lead = Math.max(1, Math.ceil((rtt / 2 + 6 + 2 * jitter) / TICK_MS) - d);
      const sent: [Map<number, number>, Map<number, number>] = [new Map(), new Map()];
      let lastConfirm = 0;
      let wall = 0;
      for (wall = 1; wall <= 500 && !server.result; wall++) {
        clock.advanceTo(wall * TICK_MS);
        for (const seat of [0, 1] as const) {
          const tick = wall + lead + d;
          const mask =
            seat === 0
              ? Math.floor(tick / 7) % 2
                ? 0x13
                : 0
              : Math.floor(tick / 11) % 2
                ? 0x15
                : 0;
          sent[seat].set(tick, mask);
          clients[seat].stamp(tick, mask);
          const masks = [0, 1, 2, 3]
            .map((age) => sent[seat].get(tick - age))
            .filter((m): m is number => m !== undefined);
          up[seat]!.send(48, () =>
            server.accept(
              seat,
              { fightId: 9, newestTick: tick, ackConfirmTick: 0, masks },
              Math.floor(clock.now / TICK_MS),
              clock.now,
            ),
          );
        }
        server.advanceTo(wall, clock.now);
        for (const relay of server.drain().relays) {
          down[relay.recipient]!.send(40, () => clients[relay.recipient].ingestRelay(relay.packet));
        }
        if (server.tick - lastConfirm >= 2 || server.result) {
          for (const seat of [0, 1] as const) {
            const packet = server.confirm(lastConfirm + 1, seat);
            down[seat]!.send(64, () => {
              clients[seat].ingestConfirm(packet);
            });
          }
          lastConfirm = server.tick;
        }
        for (const c of clients) c.update(wall + lead, wall + lead);
      }
      if (server.tick > lastConfirm) {
        for (const seat of [0, 1] as const) {
          const final = server.confirm(lastConfirm + 1, seat);
          down[seat]!.send(64, () => {
            clients[seat].ingestConfirm(final);
          });
        }
      }
      clock.advanceTo(clock.now + 3000);
      for (const c of clients) {
        c.update(server.tick, server.tick);
        expect(c.lastPromoted).toBe(server.tick);
        expect(hashCombatState(c.stateAt(server.tick)!)).toBe(server.hash);
        expect(c.stats.desyncs).toBe(0);
        expect(c.stats.predictionDepth.quantile(0.95)).toBeLessThanOrEqual(40);
      }
      console.info(
        `RTT ${rtt}ms: depth p95=${clients.map((c) => c.stats.predictionDepth.quantile(0.95)).join('/')}f, rollback p95=${clients.map((c) => c.stats.rollbackDepth.quantile(0.95)).join('/')}f, eaten=${server.streams.map((s) => s.eaten).join('/')}`,
      );
      expect(server.tick).toBeGreaterThan(100);
    });
  }
});
