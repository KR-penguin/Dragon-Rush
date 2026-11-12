import type { BotOptionId } from '../../types/setupForm';

export const BOT_STYLE_HELP: Readonly<Record<BotOptionId, string>> = {
  heuristic:
    '게임 시작 시 공격형·성장형·용 러시형 중 한 성향을 무작위로 정하고, 그 성향의 전략을 계속 사용합니다.',
  'heuristic:aggro': '상대와의 결투를 중시하는 공격형 전략을 사용합니다.',
  'heuristic:growth': '능력치와 자원을 키우는 성장형 전략을 사용합니다.',
  'heuristic:rush': '용에게 도전할 기회를 중시하는 용 러시형 전략을 사용합니다.',
  random:
    '매 행동마다 가능한 행동 종류를 무작위로 고른 뒤, 그 종류의 대상도 무작위로 고릅니다. 용 도전은 다른 종류보다 선택 확률이 매우 낮습니다.',
};
