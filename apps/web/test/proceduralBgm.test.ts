import { describe, expect, it } from 'vitest';
import { BGM_NAMES } from '../src/types/assetPaths';
import { renderBgmSamples } from '../src/fx/audio/proceduralBgm';

describe('procedural BGM', () => {
  it('renders repeatable, audible, bounded loops for every scene', () => {
    for (const name of BGM_NAMES) {
      const first = renderBgmSamples(name, 8000);
      const second = renderBgmSamples(name, 8000);
      expect(first).toEqual(second);
      expect(first.length).toBeGreaterThan(50000);
      const peak = first.reduce((max, sample) => Math.max(max, Math.abs(sample)), 0);
      expect(peak).toBeGreaterThan(0.05);
      expect(peak).toBeLessThan(1);
      expect(Math.abs(first[0]! - first[first.length - 1]!)).toBeLessThan(0.002);
    }
  });
});
