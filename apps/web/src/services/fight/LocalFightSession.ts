import { KEY_LAYOUTS } from '../../types/combatControls';
import type { FightControl, FightReplay, FightSide, PendingFight } from '../gameClient';
import { createFightBotSource } from './botInput';
import { FightLoop, browserHost, type LoopHost } from './FightLoop';
import { browserPads, combineSources, createGamepadSource, type GetPads } from './gamepadInput';
import { createKeyboardSource, type KeyTracker } from './keyboardInput';
import { LocalSimProvider, ReplayProvider, type FightSources } from './simProvider';
import type { FightInfo, FightInputSource, FightSession } from './types';

export const fightInfo = (f: PendingFight): FightInfo => ({
  id: f.id,
  setup: f.setup,
  seed: f.seed,
  sides: f.sides,
});

/** Keyboard layouts the screen listens to for these controls (hot-seat: P1 + P2). */
export const layoutsFor = (controls: readonly FightControl[]) =>
  controls.flatMap((c) =>
    c === 'keyboard-p1'
      ? [KEY_LAYOUTS.p1]
      : c === 'keyboard-p2'
        ? [KEY_LAYOUTS.p2]
        : c === 'keyboard-solo'
          ? [KEY_LAYOUTS.solo]
          : [],
  );

/** Per-side input: keys (+ the matching gamepad), the scripted bot, or nothing for the dragon. */
export function sourceFor(
  fight: PendingFight,
  side: FightSide,
  tracker: KeyTracker,
  getPads: GetPads = browserPads,
): FightInputSource | null {
  const keys = (layout: keyof typeof KEY_LAYOUTS, pad: number | 'any') =>
    combineSources([
      createKeyboardSource(tracker, KEY_LAYOUTS[layout]),
      createGamepadSource(pad, getPads),
    ]);
  switch (side.control) {
    case 'keyboard-p1':
      return keys('p1', 0);
    case 'keyboard-p2':
      return keys('p2', 1);
    case 'keyboard-solo':
      return keys('solo', 'any');
    case 'bot':
      return createFightBotSource(fight.botLevel, fight.seed, side.side);
    case 'dragon':
      return null;
    case 'remote':
      // Online fights get their own provider (server snapshots + prediction); never local.
      throw new Error('remote fighters need an online fight session');
  }
}

export function sourcesFor(
  fight: PendingFight,
  tracker: KeyTracker,
  getPads?: GetPads,
): FightSources {
  const a = sourceFor(fight, fight.sides[0], tracker, getPads);
  if (!a) throw new Error('side a is always a fighter');
  return [a, sourceFor(fight, fight.sides[1], tracker, getPads)];
}

/** A fight played on this screen: local sim at 60 Hz with keyboard/gamepad/bot inputs. */
export function createLocalFightSession(
  fight: PendingFight,
  sources: FightSources,
  host: LoopHost = browserHost(),
): FightSession {
  return new FightLoop(
    fightInfo(fight),
    new LocalSimProvider(fight.setup, fight.seed, sources),
    host,
  );
}

/** Bot-only replays keep the same clock as live fights. */
export const BOT_REPLAY_SPEED = 1;

/** An already resolved fight, re-simulated from its recorded inputs. */
export function createReplaySession(
  fight: PendingFight,
  replay: FightReplay,
  host: LoopHost = browserHost(),
): FightSession {
  const provider = new ReplayProvider(fight.setup, fight.seed, replay.inputs);
  return new FightLoop(fightInfo(fight), provider, host, { speed: BOT_REPLAY_SPEED });
}
