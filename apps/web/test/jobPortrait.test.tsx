import { JOB_IDS } from '@dragon-rush/engine';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { JobArt } from '../src/components/icons/Art';
import { JobPortrait } from '../src/components/icons/JobPortrait';

vi.mock('../src/services/assets', () => ({ resolveAsset: () => null }));

describe('fallback job portraits', () => {
  it('draws all five jobs as faces and busts on the same canvas', () => {
    for (const job of JOB_IDS) {
      const markup = renderToStaticMarkup(<JobPortrait job={job} />);
      expect(markup).toContain('viewBox="0 0 64 64"');
      expect(markup).toContain('data-job-portrait="' + job + '"');
      expect(markup).toContain('data-part="face"');
      expect(markup).toContain('data-part="bust"');
      expect(renderToStaticMarkup(<JobArt job={job} />)).toContain(`data-job-portrait="${job}"`);
    }
  });
});
