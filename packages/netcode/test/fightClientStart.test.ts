import {
  COMBAT_PACK_VERSION,
  DEFAULT_COMBAT_RULES,
  hashCombatRules,
  type CombatSetup,
} from '@dragon-rush/combat';
import type { FightStartMsg } from '@dragon-rush/protocol';
import { expect, it } from 'vitest';
import { ClockSync } from '../src/clock';
import { FightClient, combatBuildId } from '../src/client/fightClient';
import { NETCODE_VERSION, TICK_MS } from '../src/constants';

const fighter = (job: 'swordsman' | 'archer') => ({
  job,
  hp: 100,
  maxHp: 100,
  atk: 10,
  def: 5,
  indomitableAvailable: false,
});
const setup: CombatSetup = { kind: 'duel', a: fighter('swordsman'), b: fighter('archer') };

it.each([0, 150])(
  'predicts local movement at %i ms RTT when go arrives during the presentation',
  (rttMs) => {
    const sent: string[] = [];
    const clock = new ClockSync();
    clock.srtt = rttMs;
    const start: FightStartMsg = {
      fightId: 7,
      kind: 'duel',
      seed: 42,
      setup,
      rules: DEFAULT_COMBAT_RULES,
      rulesHash: hashCombatRules(DEFAULT_COMBAT_RULES),
      packVersion: COMBAT_PACK_VERSION,
      combatBuildId: combatBuildId(NETCODE_VERSION),
      seats: [
        { engineSeat: 0, playerId: 'alice', name: 'Alice', controller: 'human' },
        { engineSeat: 1, playerId: 'bob', name: 'Bob', controller: 'human' },
      ],
      you: { role: 'fighter', seat: 0 },
      prerollTicks: 90,
      maxTicks: DEFAULT_COMBAT_RULES.timeLimit.duel,
      pveHoldTicks: 15,
      pvpHoldTicks: 6,
    };
    const client = new FightClient({
      start,
      clock,
      transport: { send: (event) => sent.push(event) },
    });
    const startX = client.session.current.a.x;

    // The server schedules tick zero 1.6 s ahead, while the VS animation is still shown.
    client.receive('fight:go', { fightId: 7, epochServerMs: 1600 }, 0);
    // The presentation starts rendering this session only after the scheduled epoch.
    client.frame(1700, () => 3);
    for (let i = 1; i <= 7; i++) client.frame(1700 + i * TICK_MS, () => 3);

    expect(client.session.simTick).toBeGreaterThan(0);
    expect(client.session.current.a.x).toBeGreaterThan(startX);
    expect(sent).toContain('fight:input');
    expect(client.session.lastPromoted).toBe(0); // Motion was predicted before any server confirm.
  },
);
