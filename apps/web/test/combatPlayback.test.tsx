import { NO_INPUT } from '@dragon-rush/combat';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CombatLayer } from '../src/pages/game/CombatLayer';
import { FightLoop, type LoopHost } from '../src/services/fight/FightLoop';
import {
  createLocalFightSession,
  createReplaySession,
} from '../src/services/fight/LocalFightSession';
import type { GameClient, GameUpdate, PendingFight } from '../src/services/gameClient';
import { createGameStore } from '../src/store/gameStore';

vi.mock('../src/services/assets', () => ({ resolveAsset: () => null }));

const STEP = 1000 / 60;
const setup = {
  kind: 'duel' as const,
  a: { job: 'swordsman' as const, hp: 50, maxHp: 50, atk: 5, def: 5, indomitableAvailable: false },
  b: { job: 'archer' as const, hp: 50, maxHp: 50, atk: 5, def: 5, indomitableAvailable: false },
};

const botFight: PendingFight = {
  id: 1,
  request: { kind: 'duel', a: 0, b: 1 },
  setup,
  seed: 1,
  sides: [
    { side: 'a', seat: 0, control: 'bot' },
    { side: 'b', seat: 1, control: 'bot' },
  ],
  botLevel: 'normal',
  replay: {
    result: { winner: 'a', hpA: 50, hpB: 0 },
    ticks: 2000,
    inputs: new Uint8Array(4000),
  },
};

const humanFight: PendingFight = {
  ...botFight,
  sides: [
    { side: 'a', seat: 0, control: 'keyboard-solo' },
    { side: 'b', seat: 1, control: 'bot' },
  ],
  replay: null,
};

const host: LoopHost = {
  now: () => 0,
  requestFrame: () => 1,
  cancelFrame: () => undefined,
};

function screen(fight: PendingFight): string {
  const store = createGameStore();
  store.setState({
    client: { reportFight: vi.fn() } as unknown as GameClient,
    latest: { fight, seats: [] } as unknown as GameUpdate,
    speed: 4,
  });
  store.getInitialState = store.getState;
  return renderToStaticMarkup(<CombatLayer store={store} />);
}

describe('combat playback', () => {
  it('shows bot-only combat even when the board speed is 4×', () => {
    const html = screen(botFight);
    expect(html).toContain('aria-label="전투"');
    expect(html).toContain('봇 전투 ×1');
    expect(html).toContain('건너뛰기');
  });

  it('shows a human fight without accelerated replay controls', () => {
    const html = screen(humanFight);
    expect(html).toContain('aria-label="전투"');
    expect(html).not.toContain('봇 전투 ×1');
    expect(html).not.toContain('건너뛰기');
  });

  it('runs the whole bot replay at 1× even when the board is set to 4×', () => {
    const replay = createReplaySession(botFight, botFight.replay!, host);
    const live = createLocalFightSession(
      humanFight,
      [{ sample: () => NO_INPUT }, { sample: () => NO_INPUT }],
      host,
    );
    expect(replay).toBeInstanceOf(FightLoop);
    expect(live).toBeInstanceOf(FightLoop);
    if (!(replay instanceof FightLoop) || !(live instanceof FightLoop))
      throw new Error('missing loop');
    expect(replay.frame().curr.tick).toBe(0);
    replay.start();
    live.start();
    replay.tick(0);
    live.tick(0);
    replay.tick(STEP);
    live.tick(STEP);
    expect(replay.frame().curr.tick).toBe(1);
    expect(live.frame().curr.tick).toBe(1);
    replay.dispose();
    live.dispose();
  });
});
