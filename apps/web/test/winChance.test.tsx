import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { WinChance } from '../src/components/common/WinChance';

describe('win chance wording', () => {
  it('names dice only in quick combat', () => {
    const dice = renderToStaticMarkup(<WinChance label="결투" chance={0.6} method="dice" />);
    const realtime = renderToStaticMarkup(
      <WinChance label="결투" chance={0.6} method="realtime" />,
    );
    const pending = renderToStaticMarkup(
      <WinChance label="결투" chance={null} method="realtime" />,
    );
    expect(dice).toContain('주사위');
    expect(realtime).toContain('AI 승률 예측치');
    expect(realtime).not.toContain('주사위');
    expect(pending).toContain('AI 승률 예측 준비 중');
    expect(pending).not.toContain('주사위');
  });
});
