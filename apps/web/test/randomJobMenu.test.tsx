import { DEFAULT_RULES } from '@dragon-rush/engine';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { SeatEditor } from '../src/components/setup/SeatEditor';
import { defaultSetup, jobStatScale, updateSeat } from '../src/types/setupForm';

vi.mock('../src/hooks/useAssetUrl', () => ({ useAssetUrl: () => null }));

describe('random job in the local menu', () => {
  it.each(['human', 'bot'] as const)('offers a selected random choice to a %s', (kind) => {
    const seat = updateSeat(defaultSetup(), 1, { kind, job: null }).seats[1]!;
    const html = renderToStaticMarkup(
      <SeatEditor
        index={1}
        seat={seat}
        jobs={DEFAULT_RULES.jobs}
        scale={jobStatScale(DEFAULT_RULES.jobs)}
        onChange={() => undefined}
      />,
    );
    expect(html).toContain('무작위');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('게임을 시작할 때 5개 직업 중 하나를 뽑습니다.');
  });
});
