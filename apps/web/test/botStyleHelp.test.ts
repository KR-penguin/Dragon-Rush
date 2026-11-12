import { DEFAULT_RULES, type JobId } from '@dragon-rush/engine';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { SeatEditor } from '../src/components/setup/SeatEditor';
import { BOT_STYLE_HELP } from '../src/components/setup/botStyleHelp';
import { BOT_OPTIONS, defaultSetup, jobStatScale } from '../src/types/setupForm';

vi.mock('../src/services/assets', () => ({ resolveAsset: () => null }));

describe('bot style explanations', () => {
  it('covers every offered style and distinguishes the two random choices', () => {
    expect(Object.keys(BOT_STYLE_HELP).sort()).toEqual(
      BOT_OPTIONS.map((option) => option.id).sort(),
    );
    expect(BOT_STYLE_HELP.heuristic).toContain('게임 시작 시');
    expect(BOT_STYLE_HELP.heuristic).toContain('전략을 계속 사용');
    expect(BOT_STYLE_HELP.random).toContain('매 행동마다');
    expect(BOT_STYLE_HELP.random).toContain('용 도전');
  });

  it('shows the selected policy explanation beside the bot selector', () => {
    const seat = defaultSetup().seats[1]!;
    for (const bot of ['heuristic', 'random'] as const) {
      const markup = renderToStaticMarkup(
        createElement(SeatEditor, {
          index: 1,
          seat: { ...seat, bot },
          taken: new Set<JobId>(),
          jobs: DEFAULT_RULES.jobs,
          scale: jobStatScale(DEFAULT_RULES.jobs),
          onChange: () => undefined,
        }),
      );
      expect(markup).toContain('aria-describedby="seat-1-bot-help"');
      expect(markup).toContain(BOT_STYLE_HELP[bot]);
    }
  });
});
