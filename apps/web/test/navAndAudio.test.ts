import type { GameEvent } from '@dragon-rush/engine';
import { statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { sfxForEvent } from '../src/animation/eventSfx';
import { LocalGameClient } from '../src/services/LocalGameClient';
import type { GameClient, GameUpdate, SubmitResult } from '../src/services/gameClient';
import { createNavStore } from '../src/store/navStore';
import {
  BGM_NAMES,
  bgmPath,
  normalizeManifest,
  sfxPath,
  tileImagePath,
} from '../src/types/assetPaths';

/** Minimal client that records its lifecycle. */
function fakeClient() {
  const log: string[] = [];
  const client: GameClient = {
    mode: 'online',
    subscribe(_onUpdate: (u: GameUpdate) => void) {
      log.push('subscribe');
      return () => log.push('unsubscribe');
    },
    submit: async (): Promise<SubmitResult> => ({ ok: true }),
    requestSnapshot: () => log.push('snapshot'),
    dispose: () => log.push('dispose'),
  };
  return { client, log };
}

const noSchedule = () => () => undefined;

describe('nav store', () => {
  it('opens any GameClient and disposes it when leaving', () => {
    const nav = createNavStore();
    const { client, log } = fakeClient();
    nav.getState().openGame(client, { exitTo: 'online' });
    const route = nav.getState().route;
    expect(route.page).toBe('game');
    if (route.page !== 'game') return;
    expect(route.session.restart).toBeNull();
    expect(route.session.exitTo).toBe('online');
    expect(route.session.store.getState().client).toBe(client);
    expect(log).toEqual(['subscribe']);
    nav.getState().go('online');
    expect(nav.getState().route).toEqual({ page: 'online' });
    expect(log).toEqual(['subscribe', 'unsubscribe', 'dispose']);
  });

  it('restarts with a fresh client and a new session', () => {
    const nav = createNavStore();
    const made: LocalGameClient[] = [];
    const restart = () => {
      const c = new LocalGameClient(
        {
          seats: [
            { name: 'A', job: 'mage', kind: 'human' },
            { name: 'B', job: 'ninja', kind: 'human' },
          ],
        },
        noSchedule,
      );
      made.push(c);
      return c;
    };
    nav.getState().openGame(restart(), { restart });
    const first = nav.getState().route;
    if (first.page === 'game') first.session.store.getState().setSpeed(4);
    nav.getState().restartGame();
    const second = nav.getState().route;
    expect(made).toHaveLength(2);
    expect(first.page === 'game' && second.page === 'game').toBe(true);
    if (first.page !== 'game' || second.page !== 'game') return;
    expect(second.session.id).not.toBe(first.session.id);
    expect(first.session.store.getState().client).toBeNull();
    expect(second.session.store.getState().latest).not.toBeNull();
    expect(second.session.store.getState().speed).toBe(4);
    nav.getState().go('home');
  });

  it('ignores restart without a factory', () => {
    const nav = createNavStore();
    nav.getState().openGame(fakeClient().client);
    const before = nav.getState().route;
    nav.getState().restartGame();
    expect(nav.getState().route).toBe(before);
  });
});

describe('sound mapping', () => {
  const ended = (winner: number | null): GameEvent => ({
    type: 'GameEnded',
    outcome: { kind: winner === null ? 'draw' : 'dragon', winner },
  });

  it('voices key events', () => {
    expect(sfxForEvent({ type: 'DiceRolled', seat: 0, value: 3 }, [0])).toBe('dice_roll');
    expect(sfxForEvent({ type: 'ShieldUsed', seat: 0, against: 1 }, [0])).toBe('shield');
    expect(sfxForEvent({ type: 'ItemUsed', seat: 0, item: 'shield' }, [0])).toBeNull();
    expect(sfxForEvent({ type: 'ItemUsed', seat: 0, item: 'thief', target: 1 }, [0])).toBe(
      'item_use',
    );
    const hit = {
      type: 'CombatHit',
      kind: 'dragonFight',
      attacker: 'dragon',
      defender: 0,
      roll: 2,
      damage: 9,
      evaded: false,
      rage: false,
      firstStrike: false,
      hpAfter: 3,
    } as const;
    expect(sfxForEvent({ ...hit, breath: true }, [0])).toBe('dragon_breath');
    expect(sfxForEvent({ ...hit, breath: false }, [0])).toBe('attack_hit');
    expect(
      sfxForEvent({ type: 'EffectApplied', seat: 0, effect: 'coins', delta: -2, after: 1 }, [0]),
    ).toBeNull();
    expect(sfxForEvent({ type: 'TurnEnded', seat: 0 }, [0])).toBeNull();
  });

  it('plays victory only when a local seat wins', () => {
    expect(sfxForEvent(ended(0), [0])).toBe('victory');
    expect(sfxForEvent(ended(1), [0])).toBe('defeat');
    expect(sfxForEvent(ended(null), [0])).toBe('defeat');
    expect(sfxForEvent(ended(1), [])).toBe('victory');
  });
});

describe('asset paths', () => {
  it('builds the agreed file names', () => {
    expect(tileImagePath('POISON_SWAMP')).toBe('images/tiles/poison_swamp.png');
    expect(sfxPath('dice_roll')).toBe('audio/sfx/dice_roll.mp3');
    for (const scene of BGM_NAMES) {
      const path = bgmPath(scene);
      expect(path).toBe('audio/bgm/dragon_foothills.mp3');
      expect(
        statSync(fileURLToPath(new URL(`../public/assets/${path}`, import.meta.url))).size,
      ).toBeGreaterThan(2_000_000);
    }
  });

  it('normalizes manifest entries and skips dotfiles', () => {
    const set = normalizeManifest([
      'images\\jobs\\mage.png',
      '/audio/bgm/lobby.mp3',
      '.gitkeep',
      'images/.DS_Store',
    ]);
    expect([...set]).toEqual(['images/jobs/mage.png', 'audio/bgm/lobby.mp3']);
  });
});
