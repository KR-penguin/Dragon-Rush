import {
  createGame,
  DEFAULT_RULES,
  toPublicState,
  withRules,
  type PublicGameState,
} from '@dragon-rush/engine';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { MoveAdjustDialog } from '../src/components/dialogs/MoveAdjustDialog';
import { moveOptions } from '../src/types/decisionView';

vi.mock('../src/hooks/useAssetUrl', () => ({ useAssetUrl: () => null }));

function at(position: number, dice: number): PublicGameState {
  const state = toPublicState(
    createGame(
      { seats: [{ job: 'ninja' }, { job: 'swordsman' }] },
      withRules({ boardVariation: null }),
      42,
    ),
  );
  return {
    ...state,
    players: state.players.map((player) =>
      player.seat === state.current ? { ...player, position } : player,
    ),
    turn: { ...state.turn, dice },
  };
}

function render(state: PublicGameState): string {
  return renderToStaticMarkup(
    <MoveAdjustDialog
      dice={state.turn.dice}
      options={moveOptions(state, [-1, 0, 1])}
      locked={false}
      onChoose={() => undefined}
    />,
  );
}

describe('ninja move choices', () => {
  it('shows each actual destination and its signed positive and negative tile effects inside the buttons', () => {
    const html = render(at(5, 3));
    const buttons = [...html.matchAll(/<button\b[\s\S]*?<\/button>/g)].map(([button]) => button);
    expect(buttons).toHaveLength(3);
    expect(buttons[0]).toContain('7번 칸');
    expect(buttons[0]).toContain('늑대 무리 처치');
    expect(buttons[0]).toContain('코인 +10');
    expect(buttons[0]).toContain('HP −3');
    expect(buttons[0]).toContain('다음 내 턴 사용 불가');
    expect(buttons[1]).toContain('8번 칸');
    expect(buttons[1]).toContain('가시 함정');
    expect(buttons[1]).toContain('HP −6');
    expect(buttons[1]).toContain('다음 내 턴 사용 불가');
    expect(buttons[2]).toContain('9번 칸');
    expect(buttons[2]).toContain('약초 군락');
    expect(buttons[2]).toContain('HP +8');
  });

  it('shows a START crossing bonus even when the move lands on another tile', () => {
    const state = at(22, 2);
    const options = moveOptions(state, [-1, 0, 1]);
    expect(options.map((option) => option.tile)).toEqual([23, 0, 1]);
    expect(options.map((option) => option.startBonus)).toEqual([
      null,
      DEFAULT_RULES.startBonus,
      DEFAULT_RULES.startBonus,
    ]);
    const buttons = [...render(state).matchAll(/<button\b[\s\S]*?<\/button>/g)].map(
      ([button]) => button,
    );
    expect(buttons[0]).not.toContain('출발 통과 보너스');
    expect(buttons[1]).toContain('출발 통과 보너스');
    expect(buttons[2]).toContain('출발 통과 보너스');
    expect(buttons[2]).toContain('1번 칸');
    expect(buttons[2]).toContain('코인 +6');
    expect(buttons[2]).toContain(`코인 +${DEFAULT_RULES.startBonus.coins}`);
    expect(buttons[2]).toContain(`HP +${DEFAULT_RULES.startBonus.hp}`);
  });

  it('names nonnumeric tile actions on their destination cards', () => {
    const buttons = [...render(at(3, 3)).matchAll(/<button\b[\s\S]*?<\/button>/g)].map(
      ([button]) => button,
    );
    expect(buttons[0]).toContain('수련장');
    expect(buttons[0]).toContain('무료 강화');
    expect(buttons[1]).toContain('상점');
    expect(buttons[1]).toContain('아이템 구매');
    expect(buttons[2]).toContain('HP −3');
  });

  it('reads destination names and effects from the public rules', () => {
    const state = at(5, 3);
    const board = state.rules.board.map((tile, index) =>
      index === 7
        ? {
            ...tile,
            name: '바뀐 늑대 칸',
            effects: [
              { kind: 'coins' as const, amount: 4 },
              { kind: 'hp' as const, amount: -9 },
            ],
          }
        : tile,
    );
    const html = render({ ...state, rules: { ...state.rules, board } });
    expect(html).toContain('바뀐 늑대 칸');
    expect(html).toContain('코인 +4');
    expect(html).toContain('HP −9');
    expect(html).not.toContain('코인 +10');
  });
});
