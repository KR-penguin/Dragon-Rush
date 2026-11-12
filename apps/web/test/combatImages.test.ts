import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  combatDragonImage,
  combatJobImage,
  preloadCombatImages,
} from '../src/combat/render/combatImages';
import { combatDragonImagePath, combatJobImagePath } from '../src/types/assetPaths';

const resolveAsset = vi.hoisted(() => vi.fn<(path: string) => string | null>());
vi.mock('../src/services/assets', () => ({ resolveAsset }));

class FakeImage {
  static created: FakeImage[] = [];
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 64;
  naturalHeight = 64;
  src = '';

  constructor() {
    FakeImage.created.push(this);
  }
}

describe('combat cutout loading', () => {
  beforeEach(() => {
    vi.stubGlobal('Image', FakeImage);
    resolveAsset.mockReturnValue(null);
    FakeImage.created = [];
  });

  it('uses the six supplied paths and leaves missing art on the procedural fallback', () => {
    expect(combatJobImagePath('swordsman')).toBe('images/combat/swordsman.png');
    expect(combatJobImagePath('archer')).toBe('images/combat/archer.png');
    expect(combatJobImagePath('mage')).toBe('images/combat/mage.png');
    expect(combatJobImagePath('ninja')).toBe('images/combat/ninja.png');
    expect(combatJobImagePath('berserker')).toBe('images/combat/berserker.png');
    expect(combatDragonImagePath).toBe('images/combat/dragon.png');
    preloadCombatImages(['swordsman', 'ninja'], true);
    expect(FakeImage.created).toHaveLength(0);
    expect(combatJobImage('swordsman')).toBeNull();
    expect(combatDragonImage()).toBeNull();
  });

  it('loads each available image once, publishes only decoded images, and caches failures', () => {
    resolveAsset.mockImplementation((path) => `/assets/${path}`);
    preloadCombatImages(['archer', 'archer'], true);
    expect(FakeImage.created).toHaveLength(2);
    const [archer, dragon] = FakeImage.created;
    expect(archer?.src).toBe('/assets/images/combat/archer.png');
    expect(dragon?.src).toBe('/assets/images/combat/dragon.png');
    expect(combatJobImage('archer')).toBeNull();
    archer?.onload?.();
    expect(combatJobImage('archer')).toBe(archer);
    dragon?.onerror?.();
    expect(combatDragonImage()).toBeNull();
    preloadCombatImages(['archer'], true);
    expect(FakeImage.created).toHaveLength(2);
  });
});
