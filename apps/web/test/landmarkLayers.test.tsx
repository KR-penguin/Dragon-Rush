import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { Landmark } from '../src/components/board/Landmark';

vi.mock('../src/hooks/useAssetUrl', () => ({ useAssetUrl: () => null }));

describe('landmark motion layers', () => {
  it('animates the gate flags on HTML layers while preserving their vector paths', () => {
    const html = renderToStaticMarkup(<Landmark kind="gate" tileId="START" />);
    expect(html.match(/class="landmark-motion-layer landmark-flag/g)).toHaveLength(2);
    expect(html).not.toContain('<g class="landmark-flag');
    expect(html).toContain('M31 5h26l-6 7 6 7H31Z');
    expect(html).toContain('M111 5h26l-6 7 6 7h-26Z');
    expect(html.match(/viewBox="0 0 140 130"/g)).toHaveLength(3);
  });

  it('keeps each smoke puff on its own HTML layer with the original circle geometry', () => {
    const html = renderToStaticMarkup(<Landmark kind="inn" tileId="INN" />);
    expect(html.match(/class="landmark-motion-layer landmark-smoke-puff/g)).toHaveLength(3);
    expect(html).toContain('cx="105" cy="22" r="6"');
    expect(html).toContain('cx="110" cy="12" r="5"');
    expect(html).toContain('cx="104" cy="4" r="4"');
    expect(html.match(/viewBox="0 0 140 130"/g)).toHaveLength(4);
  });
});
