import type { GameEvent } from '@dragon-rush/engine';
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { soundCuesForEvent } from '../src/animation/eventSfx';
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
import { gameBgm, resultBgm } from '../src/types/resultView';

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

  it('voices automatic totem use and leaves maximum-HP restoration silent', () => {
    const context = { controllable: [0] };
    expect(soundCuesForEvent({ type: 'ItemUsed', seat: 0, item: 'princeTotem' }, context)).toEqual([
      { name: 'item_use' },
    ]);
    expect(
      soundCuesForEvent(
        { type: 'EffectApplied', seat: 0, effect: 'maxHp', delta: 15, after: 55 },
        context,
      ),
    ).toEqual([{ name: 'upgrade' }]);
    expect(
      soundCuesForEvent(
        { type: 'EffectApplied', seat: 0, effect: 'maxHp', delta: -15, after: 40 },
        context,
      ),
    ).toEqual([]);
  });

  it('leaves victory music to the result BGM without an old jingle', () => {
    expect(soundCuesForEvent(ended(0), { controllable: [0] })).toEqual([]);
    expect(soundCuesForEvent(ended(1), { controllable: [0] })).toEqual([{ name: 'defeat' }]);
    expect(soundCuesForEvent(ended(null), { controllable: [0] })).toEqual([{ name: 'defeat' }]);
    expect(soundCuesForEvent(ended(1), { controllable: [] })).toEqual([]);
  });
});

describe('asset paths', () => {
  it('builds the agreed file names', () => {
    expect(tileImagePath('POISON_SWAMP')).toBe('images/tiles/poison_swamp.png');
    expect(sfxPath('dice_roll')).toBe('audio/sfx/dice_roll.mp3');
    for (const scene of BGM_NAMES.slice(0, 3)) {
      const path = bgmPath(scene);
      expect(path).toBe(scene === 'dragon_battle' ? 'audio/bgm/battle.mp3' : 'audio/bgm/menu.mp3');
      expect(
        statSync(fileURLToPath(new URL(`../public/assets/${path}`, import.meta.url))).size,
      ).toBeGreaterThan(2_000_000);
    }
    expect(bgmPath('result_victory')).toBe('audio/bgm/triumph_of_the_hero.mp3');
    expect(
      createHash('sha256')
        .update(
          readFileSync(
            fileURLToPath(
              new URL('../public/assets/audio/bgm/triumph_of_the_hero.mp3', import.meta.url),
            ),
          ),
        )
        .digest('hex'),
    ).toBe('1db3424d208fba9f14e51d46ad6589f93149d96b82abaffddc2d872f380502f9');
    expect(bgmPath('result_defeat')).toBe('audio/bgm/result_defeat.mp3');
    expect(bgmPath('result_draw')).toBe('audio/bgm/result_draw.mp3');
    for (const scene of BGM_NAMES.slice(3)) {
      expect(
        statSync(fileURLToPath(new URL(`../public/assets/${bgmPath(scene)}`, import.meta.url)))
          .size,
      ).toBeGreaterThan(50_000);
    }
  });

  it('selects final music for a local win, loss, draw, and spectator', () => {
    expect(resultBgm({ kind: 'dragon', winner: 0 }, [0])).toBe('result_victory');
    expect(resultBgm({ kind: 'lastSurvivor', winner: 1 }, [0])).toBe('result_defeat');
    expect(resultBgm({ kind: 'draw', winner: null }, [0])).toBe('result_draw');
    expect(resultBgm({ kind: 'dragon', winner: 1 }, [])).toBe('result_victory');
  });

  it('switches at the result overlay, after the final animation and combat', () => {
    const outcome = { kind: 'dragon' as const, winner: 0 };
    expect(gameBgm(null, false, false, [0])).toBe('board');
    expect(gameBgm(outcome, true, false, [0])).toBe('board');
    expect(gameBgm(outcome, true, true, [0])).toBe('dragon_battle');
    expect(gameBgm(outcome, false, false, [0])).toBe('result_victory');
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
