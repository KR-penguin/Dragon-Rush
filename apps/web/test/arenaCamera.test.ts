import { expect, it } from 'vitest';
import { ZERO_CAMERA } from '../src/fx/core/camera';
import { ArenaFx } from '../src/fx/runtime/arenaFx';
import { DEFAULT_FX_SETTINGS, resolveFxPolicy } from '../src/fx/settings/fxSettings';

it('returns a stable zero transform once camera recoil and zoom fall below the existing idle threshold', () => {
  let now = 0;
  const arena = new ArenaFx({
    clock: { now: () => now },
    policy: () => resolveFxPolicy(DEFAULT_FX_SETTINGS, false),
    seed: 42,
  });
  arena.kick(1, 0);
  arena.zoomPunch();
  now = 100;
  expect(arena.camera.isIdle()).toBe(false);
  expect(arena.cameraTransform().dx).not.toBe(0);
  expect(arena.cameraTransform().zoom).toBeGreaterThan(1);
  now = 10_000;
  expect(arena.camera.isIdle()).toBe(true);
  expect(arena.cameraTransform()).toBe(ZERO_CAMERA);
  now += 16;
  expect(arena.cameraTransform()).toBe(ZERO_CAMERA);
});
