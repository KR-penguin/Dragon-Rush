import type { JobId } from '@dragon-rush/engine';

/** Korean names of each job's real-time kit (combat-design §5) for the HUD and the controls help. */
export const KIT_LABEL: Readonly<
  Record<
    JobId,
    {
      readonly attack: string;
      readonly skill: string;
      readonly dash: string;
      readonly passive: string;
    }
  >
> = {
  swordsman: { attack: '3연타 베기', skill: '패링', dash: '대시', passive: '불굴' },
  archer: {
    attack: '활 (누르고 있으면 당기기)',
    skill: '일제 사격',
    dash: '뒷걸음',
    passive: '선제',
  },
  mage: { attack: '비전 화살', skill: '메테오 룬', dash: '점멸', passive: '관통' },
  ninja: { attack: '2연타 단검', skill: '쿠나이', dash: '그림자 걸음', passive: '회피' },
  berserker: { attack: '대도끼', skill: '회오리', dash: '어깨 돌진', passive: '광폭' },
};

export const PASSIVE_HINT: Readonly<Record<JobId, string>> = {
  swordsman: '이번 게임에 처음 받는 치명타를 HP 1로 버팀',
  archer: '완전히 당긴 화살로 시작, 처음 맞힌 공격 +3',
  mage: '모든 공격이 방어력 절반만 적용',
  ninja: '받는 공격 8번째마다 자동 회피',
  berserker: 'HP 절반 이하에서 공격력 ×1.3',
};
