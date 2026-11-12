# 인수인계 — 드래곤 러쉬 2차 개발 (2026-11-12)

> 이 문서는 진행 중이던 작업을 다른 에이전트(새 세션)가 이어받기 위한 문서다. **완료 표시가 없는 작업만 이어간다.**
> 공통 규칙은 `AI_README.md`, `coding_convention.md`가 정본이다. 설계 근거 자료는 `docs/research/`(영어, 웹 조사 결과 원문)에 있다.

## 0. 현재 상태 한눈에

| 항목 | 상태 |
|---|---|
| `main` | `3846cc1` 기준. 온라인 롤백·문서, outcome 기반 코드, UI 수정, 학습 명세 정리까지 병합. 작업 트리 깨끗함. |
| 완료·병합 | 1차 P0~P7, 기존 2차 보드·FX·로컬 전투·AI 학습 환경, **A 전투 AI 동기화**, **C 온라인 롤백**(`1845ca9`, 문서 `d15c05d`), **D 온라인 로비**, outcome 기반 코드(`3846cc1`), UI 잔여 수정, 글꼴·효과음 경량화/별칭, 학습 문서 정리. |
| 진행 중 | B 상성 보정(`codex/feature-matchup-calibration-v2`, **루트 체크아웃**). E outcome 최종 데이터 피팅·rush-2 보드 밸런스는 B 병합 뒤 재개. |
| 남음 | B 방향·수치 검증 후 병합 → E 최종 모델·밸런스·README/기획서 → 전체 Prettier·문서 동기화·최종 통합 검증. 실제 에셋·사용자 가중치·배포 대상은 사용자 자료가 있어야 적용 가능. |
| 워크트리 | `main` 통합용은 `.claude/worktrees/codex-integrate-main`. **루트는 B 에이전트가 사용 중이므로 브랜치 전환·파일 수정 금지.** 다른 에이전트 작업 트리도 수정하지 않는다. |

**작업 순서와 병렬화**: B를 완료·병합한다 → E 작업 에이전트(`01a1cdcd-fca9-7f41-b46d-3f6e0469b248`, `C:\KoreaPenguin\dragon-rush-outcome-v1`)를 재개해 최신 `main`에서 최종 모델 피팅·rush-2를 완료한다 → 전체 포맷·문서 동기화·최종 검증. B 에이전트 ID는 `01a1cdad-2bbb-7b13-bfd8-ec34c61f4ff5`. B 브랜치의 `785ec38`은 **임시** 보정이라 10개 상성 방향이 모두 맞기 전에는 최종 병합하지 않는다.

**검증 기록:** 온라인 롤백·outcome 기반 코드 병합 후 `pnpm lint`, `pnpm typecheck`, `pnpm build`, Python pytest 16개가 통과했다. 로비 통합 테스트가 병렬 부하에서 한 번 20초 대기에 걸려 허용 대기를 `2c396d8`로 수정했다. 이후 전체 Vitest **455/455 통과**했다. 가상 TCP 지연 시험은 최종 해시가 일치하지만 150~250ms 손실 구간 p95 롤백 깊이가 목표보다 크다. 자세한 수치는 `docs/combat-design.md` §9.

**실제 브라우저에서 발견한 온라인 전투 문제(수정 중):** 2026-11-12 13:00, `pnpm dev`/`http://localhost:5173`에서 온라인 방을 사람 검사+성장형 봇으로 시작해 첫 사람 턴에 용 도전. `CombatStarted` 안내 뒤 경기장으로 넘어가지 않고 보드가 "검사님이 결정하는 중"으로 대기했다. 기본 방 옵션은 `quickCombat: false`. 넷코드 담당 에이전트 `01a1cdad-2afe-75f3-aaf3-49e180dfc09a`를 재개해 조사·재현 테스트·수정하도록 맡겼다. 코드상 의심 지점은 `apps/web/src/services/OnlineGameClient.ts`의 `onFightStart`가 이전 보드 상태에 `withFight(this.last)`를 호출할 때, 아직 `COMBAT` 갱신 전이면 `fightStart`를 지우는 순서 경합이다. 이 가설은 아직 검증되지 않았다. 수정 후 브라우저로 용전 진입·종료와 보드 복귀를 다시 확인할 것.

**브랜치 규칙**: `main` 직접 커밋 금지. 새 브랜치는 `codex/` 접두어 사용, 영어 Conventional Commits. 체크포인트 커밋(`wip(...)`)은 병합 전에 squash 한다. 병합은 `git merge --no-ff`.

**공통 검증 명령**: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `python -m pytest python/tests`. 브라우저 확인은 `.claude/launch.json`의 `web`/`server` 구성으로 미리보기 도구를 쓸 수 있다.

## 1. 사용자 결정 대기 (작업 중 임의로 정하지 말 것)

| ID | 질문 | 현재 기본 |
|---|---|---|
| D6 | 직업 선택을 **비공개 동시 선택**으로 바꿀까? (상성 카운터픽 방지, 핫시트는 화면 가림 단계 추가) | 지금처럼 공개 선택 유지 |
| D4 / D13 | 보드 모델 / 전투 모델 **가중치 JSON 포맷 + 패리티 샘플** | 받기 전까지 모델 좌석 "준비 중" |
| D16 | 전투 결과 **승률 예측(outcome) 모델 피팅 코드** | 기반 코드 완료·병합, B 후 최종 모델 생성 예정 |
| D8 / D12 | 에셋(이미지 149·효과음 164·음악 8·환경음 3) 제공 — 목록은 `docs/development-plan.md` §4.2 | 플레이스홀더로 동작 |
| D9 | 배포 호스팅 대상 | 미정 |

## A. 전투 AI 테스트 동기화 — 완료

- `49c36ae`로 테스트 실패 원인을 수정해 `main`에 병합했다. 전체 lint/typecheck/test/build 및 Python 테스트 통과. 전투 시뮬 2,000판 기준 평균 10.5라운드, 용 처치 종료 76.9%, 용 도전 성공률 61.7%.
- **브랜치**: `bugfix/combat-ai-sync` (체크포인트 `398468f`, 5개 파일 수정 중)
- **배경**: 전투 엔진 1차 보정(봇 노브 poke/punish/fire/spacing, 전방위 패링·환급·경직, 백스탭, 용 chip/피해 배율 0.17, 짧아진 용 대기 간격 등)이 병합되면서 `packages/combat-ai/test/mask.test.ts` 2개와 `packages/sim/test/combatEnv.test.ts` 1개가 실패한다. 마스크 테스트는 시뮬에서 실제로 버튼을 눌러 검증하므로 **로직(mask/actionability)을 메커니즘에 맞게 고쳐야 한다**(테스트만 고치지 말 것). 직전 에이전트는 `hitstunLeft` 기반으로 actionability 테스트를 고치던 중이었다.

**프롬프트**
```
드래곤 러쉬 저장소(C:\KoreaPenguin\RPG board game)에서 작업한다. 먼저 AI_README.md, coding_convention.md, docs/handoff.md(§A)를 읽어라.
브랜치 bugfix/combat-ai-sync(체크포인트 398468f)를 이어서 작업한다. 목표: main에서 실패하는 3개 테스트
(packages/combat-ai/test/mask.test.ts 2개, packages/sim/test/combatEnv.test.ts 1개)를 고친다. 원인은 packages/combat 1차 보정으로 바뀐 메커니즘이다.
combatActionMask / isActionable / buttonReadyIn 로직을 최종 시뮬 메커니즘에 맞게 수정하고(테스트만 맞추지 말 것), 저장소 전체가 초록이 되게 한다
(pnpm lint, typecheck, test, build, python -m pytest python/tests). 그다음 `pnpm sim --combat sim --games 2000 --players 4`로
용 도전 성공률·용 처치 종료 비율·라운드·직업 승률을 측정해 보고한다. 체크포인트 커밋은 squash하고 Conventional Commit으로 정리한 뒤
main에 --no-ff로 병합한다(병합 전 main을 브랜치에 merge해 충돌 해결). 결과를 한국어로 요약 보고한다.
```

## B. 상성 2차 보정 (A 이후, C·D와 병렬 가능)

- **브랜치**: 새로 `feature/matchup-calibration-v2` (기존 동명 브랜치는 커밋 없음 — 지우고 main에서 새로 만들어도 된다)
- **설계 정본**: `docs/research/matchup-design-v2.md`(검토 반영 최종안), 요약 `docs/research/matchup-summary-ko.md`, 검토 지적 `docs/research/matchup-review-issues.md`
- **상성 고리**: 검사 → 닌자 → 궁수 → 마법사 → 광전사 → 검사 (각자 다음 둘을 이김). 대 상성 목표 64%(허용 60~68), 소 상성 60%(56~64), 미러 약 50%, 직업 평균 47~53%, 합산 셀 상한 68%.
- **1차 보정 결과**(기본 스탯, 2,000판/칸): 검>궁 66, 광>닌 67, 궁>마 76(과함), 마>광 73(과함), 닌>마 58, 닌>궁 55, 광>검 55, 마>검 51, **검>닌 40(역방향)**, **궁>광 45(역방향)**. 결투 평균 17.6초. 용: 기본 0~2%, ATK9/DEF8/HP70 약 54%, ATK11/DEF10/HP80 약 79%(유지할 것).
- **리드가 정한 기본값**: D1 PvP 소수점 피해 누적 적용, D2 +3 스탯 우위는 대 상성을 거의 뒤집지 않게, D7 불의 고리 24→34초에 반지름 460→160px, D8 궁수 예측 조준(≤12틱, 사람·AI 공통 조준 보조). D6은 구현하지 않는다(사용자 결정 대기).

**프롬프트**
```
드래곤 러쉬 저장소(C:\KoreaPenguin\RPG board game)에서 작업한다. AI_README.md, coding_convention.md, docs/handoff.md(§B),
docs/combat-design.md, docs/research/matchup-design-v2.md(정본), matchup-summary-ko.md, matchup-review-issues.md를 읽어라.
main(작업 A 병합 후)에서 feature/matchup-calibration-v2 브랜치를 만들어 packages/combat의 상성 2차 보정을 한다.
상성 고리 검사→닌자→궁수→마법사→광전사→검사(각자 다음 둘을 이김), 대 상성 64%(60~68)·소 상성 60%(56~64), 미러 약 50%,
직업 평균 47~53%, 합산 셀 ≤68%. handoff §B의 리드 기본값(D1 소수점 피해 누적, D2, D7 불의 고리 24→34초 460→160px, D8 궁수 예측 조준)과
설계의 검토 수정(반사 화살 ×0.5·관통 없음, 광전사 경직 저항 0.5, 완전 사격 넉백 40/경직 10, 메테오 장전, 기술별 패링 결과 데이터, 용 경직 면역 등)을 적용하고
직업별 공격 방식(리듬·사거리·특수 방어)이 확실히 다르게 하라. 봇도 직업 스타일대로 싸우게 한다. 보정 도구:
pnpm --filter @dragon-rush/combat calibrate [matrix,stats,dragon,bench] --n 1000 [--set path=value], scripts/autobalance.ts.
최종 행렬은 칸당 ≥2,000판, 95% 신뢰구간, 보통·쉬움 합산과 어려움 별도. 용 난이도 대역은 유지(직업 5종 모두 용을 잡을 수 있게).
결정성·정수 연산(ESLint 규칙) 유지, 공개 API는 추가만. 패킹 레이아웃이 바뀌면 COMBAT_PACK_VERSION을 올린다.
packages/combat-ai(마스크), packages/sim(combat env, --combat sim), apps/web 전투 화면이 깨지면 같이 고친다.
docs/combat-design.md를 최종 수치·상성표·직업별 공격 방식으로 갱신한다(한국어). MATCHUPS에 대/소 크기를 넣고 밸런스 테스트가 각 상성의 방향과 범위를 검증하게 하라.
전체 검증 통과 후 Conventional Commits(본문에 전후 행렬)로 커밋하고 main에 --no-ff 병합. 최종 5×5 행렬과 상성별 상태를 한국어로 보고하라.
```

## C. 롤백 온라인 실시간 전투 — 완료·병합

- 코드 `1845ca9`, 문서 `d15c05d`로 `main`에 병합했다. 가상 TCP 매트릭스와 실제 Socket.IO 전투 통합 테스트를 포함한다. 손실 구간의 롤백 깊이 목표 미달은 `docs/combat-design.md` §9에 기록했다. 이후 성능 검토 에이전트는 TCP 재전송 지연이 주원인이라고 확인했고, 실측 향상 없이 수치만 낮추는 변경은 하지 않았다.

- **브랜치**: `feature/rollback-netcode` (체크포인트 `d18aaa3`. `feature/realtime-combat`, `feature/combat-screen`이 이미 merge됨. 막 클라이언트 쪽 "seat input tables와 state ring"을 만들던 중)
- **설계 정본**: `docs/research/netcode-design-v2.md`(검토 반영 최종안), 검토 지적 `docs/research/netcode-review-issues.md`
- **요지**: PvP = 서버 권위 입력 롤백(서버가 확정 입력 중계·자기 시계로 틱 확정·누락 입력은 직전 마스크 반복·commit-before-reveal·조건부 정지 대기·핑 구간별 고정 입력 지연·링 버퍼·예측 상한·시간 팽창·보정 스무딩·이벤트 id 중복 제거·KO는 확정 후·주기적 해시와 재동기화), PvE(용) = 지연 0 로컬 시뮬 + 서버 검증, 관전 = 확정 입력 재생, 봇 = 서버 좌석, 핫시트·오프라인은 로컬.
- **웹 연동 지점**: `apps/web/src/services/fight/*`의 `FightLoop`(`FightStateProvider`·`FightInputSource`), `GameUpdate.fight`(control `'remote'`), `GameClient.reportFight`(온라인은 서버가 결과 보고).

**프롬프트**
```
드래곤 러쉬 저장소(C:\KoreaPenguin\RPG board game)에서 작업한다. AI_README.md, coding_convention.md, docs/handoff.md(§C),
docs/research/netcode-design-v2.md(정본), netcode-review-issues.md, docs/combat-design.md §9, docs/architecture.md §7·§8·§12를 읽어라.
브랜치 feature/rollback-netcode(체크포인트 d18aaa3)를 이어서 작업한다. 먼저 `git log main..HEAD`와 `git show d18aaa3 --stat`으로
이미 만든 것을 파악하고, main을 merge해 최신화한다. 목표: 온라인 1:1 PvP와 용 PvE가 핑과 상관없이 잘 되도록 설계안을 구현한다.
1) packages/protocol: 전투 메시지 zod 스키마, PROTOCOL_VERSION 2(breaking, feat(protocol)!:)
2) packages/netcode(@dragon-rush/netcode, DOM 없음): 클라이언트 RollbackSession(입력 기록·고정 지연·원격 예측·상태 링 버퍼·재시뮬·예측 상한·시간 팽창·보간·이벤트 확정/중복 제거·디싱크 감지),
   PvE 모드, 관전 재생 버퍼, 서버 FightAuthority(틱 확정·대체 입력·정지 대기·commit-before-reveal·해시·재동기화·끊김 시 봇 인계·입력률/시간 조작 제한),
   결정적 네트워크 시뮬레이터(지연·지터·손실·순서 뒤바뀜·TCP 머리 막힘)
3) apps/server: 60Hz 전투 루프, GameSession이 COMBAT에서 실제 전투 시작(보드 턴 타이머 정지), 종료 시 applyCombatResult 단일 경로로 반영. 방 옵션 "빠른 전투"(주사위)는 유지
4) apps/web: FightLoop용 롤백 FightStateProvider + 네트워크 FightInputSource, 'remote' control 처리, OnlineGameClient가 GameUpdate.fight를 채움,
   연결 품질 UI(핑·입력 지연·롤백 프레임·"상대 연결 불안정"), 개발용 가짜 핑/지터/손실 패널
5) 테스트: RTT 20/80/150/250ms·지터·1% 손실에서 2클라이언트+서버 수렴(해시 일치·서버와 같은 결과), 롤백 깊이 분포, 확정 이벤트 중복 없음,
   PvE 정상 핑에서 롤백 0, 디싱크 주입 후 재동기화, 끊김 시 봇 인계, 실제 Socket.IO 통합(서버+2클라이언트+관전 1)
6) 문서: docs/combat-design.md §9를 한국어로 교체, architecture.md §12, AI_README.md
전체 검증 통과 후 체크포인트를 squash하고 Conventional Commits로 정리, main에 --no-ff 병합. RTT 구간별 롤백 통계와 남은 과제를 한국어로 보고하라.
```

## D. 온라인 로비 Ember Table 재디자인 — 완료

- `780cff0`으로 이모지를 game-icons로 교체하고 선택자 충돌·좁은 화면·접근성을 정리해 `main`에 병합했다. 전체 테스트 425개, lint/typecheck/web build 통과.
- **브랜치**: `feature/lobby-ember-style` (체크포인트 `f81a300`, 15개 파일. 공유 CSS 규칙과 우선순위가 겹치는 선택자 `.game-icon`, `.crest`, `.modal-seal`을 정리하던 중)
- **범위**: `apps/web/src/pages/OnlinePage.tsx`, `components/lobby/*`, `styles/lobby.css`, 필요 시 `types/onlineLobby.ts`. 기능 변경 없음, 이모지 → game-icons.

**프롬프트**
```
드래곤 러쉬 저장소(C:\KoreaPenguin\RPG board game)에서 작업한다. AI_README.md, coding_convention.md, docs/handoff.md(§D), docs/art-direction.md를 읽어라.
브랜치 feature/lobby-ember-style(체크포인트 f81a300)을 이어서 온라인 로비를 Ember Table 스타일로 재디자인한다(기능 변경 없음).
먼저 main을 merge해 최신화한다. 범위: apps/web/src/pages/OnlinePage.tsx, components/lobby/*, styles/lobby.css(필요하면 types/onlineLobby.ts).
홈·로컬 설정 화면의 컴포넌트·아이콘·문장(crest)을 재사용하고 이모지를 모두 game-icons(react-icons/gi)로 바꾼다. 공유 CSS(.game-icon, .crest, .modal-seal)와
선택자 우선순위 충돌을 정리하던 중이었다. 접근성(라벨·포커스·reduced motion) 유지, 로비 테스트 통과.
pnpm lint/typecheck/test와 web build 통과 후, 가능하면 서버+웹 개발 서버로 두 탭(localhost와 [::1]) 확인.
체크포인트를 squash하고 Conventional Commits로 정리해 main에 --no-ff 병합, 한국어로 보고하라.
```

## E. 실시간 전투 기준 보드 밸런스 + 승률 예측 모델 (B 이후)

- `codex/feature-outcome-v1`에서 **기반 코드 3개 커밋을 `main`에 병합했다**(`3846cc1`): 실제 전투 데이터 생성·피팅 CLI, `outcome_v1` 스키마·추론, 게임 RNG로 결과 샘플링하는 리졸버, 봇·웹 연결 지점, 전투 방식별 승률 안내. B 상성 보정이 아직 없으므로 최종 모델 JSON·rush-2 수치와 문서는 미완료다. 같은 에이전트(`01a1cdcd-fca9-7f41-b46d-3f6e0469b248`)에 최신 `main` 병합 후 작업을 이어 달라고 한다.
- **배경**: rush-1은 주사위 전투 기준으로 맞췄다(4인 중앙 10라운드, 약 6.8분, 용 처치 종료 87.5%로 목표 40~75% 초과). 실시간 전투로 판정하면 결과가 달라진다. 보드 봇(HeuristicBot)의 용 도전 판단과 화면의 "용의 눈"(승률 표시)은 아직 **주사위 기준 추정**이라, 실제 전투 시뮬 결과로 학습한 승률 예측 모델이 필요하다(D16, 기본 진행).

**프롬프트**
```
드래곤 러쉬 저장소(C:\KoreaPenguin\RPG board game)에서 작업한다. AI_README.md, coding_convention.md, docs/handoff.md(§E),
docs/game-design.md §15, docs/combat-ai-spec.md(combat_resolver, outcome 모델 부분), docs/research/decision-sheet-v1.md §6을 읽어라.
상성 2차 보정(작업 B)이 병합된 main에서 feature/outcome-model-and-rush-2 브랜치를 만든다.
1) 승률 예측(outcome) 모델: 실제 전투 시뮬(봇, 보통 난이도)로 전투 데이터를 대량 생성하고(stat_dist_v1 기반 셋업), 직업 쌍·스탯·불굴 등을 특징으로
   P(도착자/도전자 승), 승자 HP 분포(10구간), 불굴 소모 확률을 예측하는 작은 모델을 TS로 피팅해 `outcome_v1` JSON으로 저장한다(정책 트레이너가 아님, D16).
   보정 기준: 10분위별 오차 ±3%. 이 모델을 HeuristicBot 승률 추정(packages/ai/src/bots/heuristic/estimate.ts), 웹 "용의 눈"(apps/web/src/types/estimates.ts),
   보드 env/시뮬의 combat_resolver: 'outcome'에 연결한다.
2) 보드 밸런스 rush-2: `pnpm sim --combat sim`(또는 outcome)으로 4인 중앙 9~11라운드·p95 ≤15, 용 처치 종료 40~75%, 직업 승률 공정 ±5%p, 2라운드 내 탈락 <5%를 맞춘다.
   수치만 바꾼다(DEFAULT_RULES, version 'rush-2'). 구조 변경(예: 시작 방어막 N라운드 후 소멸)이 필요하면 구현하지 말고 근거와 함께 제안만 한다.
   실시간 전투 시간(결투·용전)을 포함한 한 판 예상 시간을 보고한다.
3) docs/game-design.md(§6·§9의 "자동 해결" 서술을 실시간 전투로, §15 결과표), README·AI_README·python/README의 수치를 갱신한다.
전체 검증 후 Conventional Commits로 커밋, main에 --no-ff 병합, 한국어로 보고하라.
```

## F. 정리·문서 동기화 (마지막, 작은 작업 묶음)

- 완료: 효과음 폴더·번호 별칭과 자동 선택 테스트(`59ed798`), 한국어 WOFF2 9개만 묶는 글꼴 경량화(`e00ecaa`; CSS 1,080,673→99,364B, 글꼴 25,673,736→3,403,548B).
- 완료: 화면 잔여 3건(`d1389b3`), 2차 개발 현황 문서(`d9bef5d`), 온라인 로비 부하 테스트 대기 한도(`2c396d8`). 남음: 전체 Prettier, B/E 이후 개발 현황·기획서·README 최종 동기화, 최종 검증.

**프롬프트**
```
드래곤 러쉬 저장소(C:\KoreaPenguin\RPG board game)에서 작업한다. AI_README.md, coding_convention.md, docs/handoff.md(§F)를 읽어라.
main에서 chore/cleanup-after-round2 브랜치를 만들어 다음을 처리한다.
1) 효과음 이름 정리: apps/web/src/fx/audio/soundCatalog.ts의 이름(dash, shot, telegraph, clash 등)과 docs/development-plan.md §4.2 에셋 목록 파일명(dash_01, duel_clash 등)을 하나로 맞춘다
   (코드 쪽 이름을 기준으로 목록을 고치거나 별칭 매핑 추가). 실제 파일이 들어오면 자동으로 대체되는지 테스트.
2) Prettier가 저장소 전체에서 깨끗하지 않다. `pnpm format` 후 lint/test 통과 확인(동작 변경 없음, 별도 커밋 chore: format).
3) 웹 빌드 크기: Fontsource 글꼴이 dist를 키운다(CSS 1MB, dist 26MB). 굵기 축소·woff2만 사용·가변 글꼴 등으로 줄이고 수치를 보고.
4) Ember Table 잔여: 모루(강화) 트레이가 모루 버튼 위가 아니라 독 중앙에 열림, 1100px 미만 세로 배치 개선, 전투 밖 "브레스까지 N" 표시.
5) docs/development-plan.md §5 진행 현황 표, README.md, AI_README.md §2 상태를 실제와 맞춘다. docs/handoff.md의 완료된 작업을 "완료"로 표시.
각 항목을 별도 커밋으로, 전체 검증 후 main에 --no-ff 병합하고 한국어로 보고하라.
```

## 2. 참고: 주요 수치·위치

- 밸런스 rush-1: 시작 코인 10, 출발 +20, 용 88/10/6, 초반 보호 2라운드, 도둑 10코인 (`packages/engine/src/rules/defaultRules.ts`, 기획서 §15)
- 실시간 전투: 60Hz, Q8 정수 좌표, 결투 45초(불의 고리), 용 75초 제한, `DEFAULT_COMBAT_RULES` (`packages/combat/src`), 보정 스크립트 `packages/combat/scripts/`
- 전투 AI: `cobs_v1` 160 / `cact_v1` [9,4]·36, `pnpm combat-env-server`, Python `CombatEnv`/`CombatVecEnv`, `python/README.md` 전투 절
- 보드 AI: `obs_v1` 253 / `act_v1` 47, `pnpm env-server`, Python `RPGBoardEnv`/`RPGBoardVecEnv`
- 웹: Ember Table 보드(`components/board/*`), FX(`src/fx`), 전투 화면(`services/fight/*`, `components/combat/*`, `combat/render/*`)
- 웹 조사 원문: `docs/research/` (아트·이펙트·전투·넷코드 결정 시트, 에셋 목록 원문, 넷코드 v2, 상성 v2)
