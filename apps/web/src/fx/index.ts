/**
 * Game-feel toolkit: trauma camera, hit-stop clock, particles, floating text, flash governor,
 * procedural audio fallback and the board event → effect mapping.
 *
 * Board: mount `<FxLayer store resolver/>` and wrap the world in `<ShakeContainer>`.
 * Arena (Canvas): `createArenaFx()` → `hit()`, `kick()`, `zoomPunch()`, `update(dt)`, `draw(ctx)`,
 * `cameraTransform()`. Screen-space callers can use `fx.hit({x, y, damage})` directly.
 */
export { fx, fxPolicy, fxTime, createArenaFx } from './runtime/fxInstance';
export { FxRuntime, type ScreenHit, type FxSurface, type FxAudioPort } from './runtime/fxRuntime';
export { ArenaFx, type ArenaHit } from './runtime/arenaFx';
export { installButtonJuice } from './runtime/buttonJuice';
export { punchElement } from './runtime/punch';

export { FxLayer, ShakeContainer } from './components/FxLayer';
export { FxSettingsDock } from './components/FxSettingsDock';
export { FxSettingsPanel } from './components/FxSettingsPanel';
export { useFxEvents } from './hooks/useFxEvents';
export {
  useAudioSettings,
  useButtonJuice,
  useFxSettings,
  useFxSurface,
  useShakeTarget,
} from './hooks/useFxRuntime';

export {
  createBoardFxResolver,
  BOARD_SELECTORS,
  type BoardResolverOptions,
} from './board/boardResolver';
export { fxForEvent, trackCombat, type CombatSides, type FxEventContext } from './eventFx';
export * from './recipes';
export type * from './types';

export * from './core/easing';
export {
  createCameraRig,
  BOARD_CAMERA,
  ARENA_CAMERA,
  type CameraRig,
  type CameraSample,
  type ClockLike,
} from './core/camera';
export {
  createFxClock,
  KO_STOP,
  DRAGON_DEATH_STOP,
  type FxClock,
  type BossStop,
} from './core/time';
export { createFlashGovernor, createRateLimiter, FLASH_RULES, safeFlashColor } from './core/flash';
export { createParticlePool, PARTICLE_CAP, type ParticlePool } from './core/particles';
export {
  BURST_PRESETS,
  RING_PRESETS,
  emitBurst,
  emitRing,
  emitCoinFlight,
  presetUnit,
} from './core/particlePresets';
export {
  createFloatingTextBook,
  TEXT_KINDS,
  textFrame,
  type FloatingTextKind,
} from './core/floatingText';
export { createFxRng, hashSeed, type FxRng } from './core/rng';
export { perlin1 } from './core/noise';
export { drawParticles } from './render/drawParticles';
export { drawFloatingTexts } from './render/drawFloatingText';

export {
  fxSettings,
  resolveFxPolicy,
  FX_CHANNELS,
  type FxSettings,
  type FxPolicy,
} from './settings/fxSettings';
export { SOUND_NAMES, SOUND_SPEC, selectSoundSource, type SoundName } from './audio/soundCatalog';
