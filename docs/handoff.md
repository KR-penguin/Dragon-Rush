# 드래곤 러쉬 개발 인수인계 (2026-11-12)

이 문서는 현재 코드의 상태를 요약한다. 작업을 시작할 때 `AI_README.md`와 `coding_convention.md`를 먼저 읽는다. 상세 규칙은 `docs/game-design.md`, 전투와 AI 계약은 `docs/combat-design.md`, `docs/ai-interface-spec.md`, `docs/combat-ai-spec.md`를 따른다. 과거 작업 지시는 Git 이력에서 확인한다.

## 현재 상태

- 웹에서 로컬 및 Socket.IO 온라인 보드 게임을 플레이할 수 있다. 최대 4인, 보드 봇과 실시간 2D 탑다운 PvP/PvE, 각각 분리된 보드·PvP·용전 AI 학습 환경이 있다. 실행 예제와 계약은 `docs/training-environments.md`에 있다.
- 현재 보드 규칙 버전은 `rush-7`이다. 이동은 1~10 룰렛(`movement.rollSides = 10`), 빠른 전투는 1d6(`combat.dieSides = 6`)이다. 텔레포트는 목적지까지 시계 방향으로 1~23칸 이동해 0번을 통과·도착하면 출발 보너스를 받고, 목적지에서만 PvP·칸 이벤트를 처리한다. 초반 PvP 보호와 출발 칸 안전은 없다. 시작 방어막은 없고 PvP 승자는 패자 코인의 절반·아이템 전부·코인 30개와 완전 회복을 받는다. 코인 손실 이벤트에서 모자란 1코인당 HP 1을 잃되 HP 1에서 멈춘다.
- 어느 라운드·칸이든 생존 상대가 있는 칸에 새로 착지하면 도착자에게 대상 확인, 방어자에게 방어막 사용 또는 결투 시작 확인 화면을 보여 준다. 게임 시작 때 함께 선 0번 칸은 착지가 아니다. 방어막 없는 방어자도 확인을 거쳐야 전투가 시작된다. 상점은 구매 가능한 아이템이 없어도 방문 화면을 보여 준다. 해당 화면은 말이 착지한 직후 표시된다.
- 이벤트 카드는 보통 속도에서 총 3.33초(등장 200ms, 뒤집기 180ms, 읽기 2.7초, 퇴장 250ms) 표시되고, 알림은 약 6초다. 보드 칸에는 hover/focus 설명이 나온다. 전투 기본 공격은 클릭/터치 누르기이고 키보드·게임패드도 지원한다.
- 로비·보드에는 제공받은 `apps/web/public/assets/audio/bgm/menu.mp3`, 결투·PvE·용전에는 `battle.mp3`, 승리 화면에는 제공받은 `result_victory.mp3`를 사용한다. 패배·무승부는 기존 MP3다. 브라우저 음향 정책에 따라 첫 사용자 동작 뒤 재생된다. SFX는 기존 로직을 사용한다.
- 검사·궁수의 초상은 다른 직업과 같은 흉상 구도로 맞췄다. 봇의 “무작위”는 시작 시 고른 전략을 유지하고, “무작위 정책”은 행동마다 무작위로 고른다.
- 내부 전투 결과 예측기 `outcome_v1`은 제거됐다. 보드 학습 env(`rpgboard-env/2`)는 실제 60Hz 스크립트 전투 `sim`이 기본이고 `dice`를 선택할 수 있다. **인게임에서 승률 예측을 보여 주지 않는다.** 보드 관측은 `obs_v2` 257차원, 행동은 `act_v1` 47개다. 기존 `obs_v1` 가중치는 재학습 또는 명시적 변환이 필요하다. 사용자가 제공할 보드 Actor-Critic JSON과 전투 Actor-Critic JSON은 각각의 모델 어댑터로 연결한다.
- `prompt.md`는 커밋하지 않는다. 커밋은 브랜치에서 영어 Conventional Commits로 나누고 `main`에 `--no-ff`로 병합한다.

## 재현과 실행

```powershell
pnpm install
pnpm dev
```

웹 `http://localhost:5173/`, 서버 건강 검사 `http://localhost:3001/health`.

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm build
python -m pytest python/tests
pnpm exec prettier --check .
```

실측 기준은 `docs/game-design.md` §15와 `README.md`에 기록했다. 현행 `rush-7` 4인 4,000판(seed 2026, 4 workers, 실제 60Hz 전투)은 평균 4.24(중앙 4)/p95 7라운드, 3라운드 내 좌석 탈락 37.3%, 용 처치 종료 50.2%, 판당 PvP 1.10회, 무승부 0%다. 과거 `rush-6` 4인 4,000판의 평균 4.37(중앙 4)/p95 9라운드, 조기 탈락 44.5%는 역사적 비교 수치다. 기존 `rush-3` 전투 가중치를 이전했으며 `rush-7` 보드 분포에서는 재보정하지 않았다. 이 수치는 봇 정책을 포함한 시뮬레이션이며 실제 사람 경기 결과를 예측하지 않는다.

## 다음 작업

1. 사용자 제공 보드 및 전투 Actor-Critic JSON을 받으면 각 모델 레이아웃·버전·마스크에 맞는지 검증하고 연결한다. 두 모델은 별개의 학습 환경과 계약을 사용한다.
2. 에셋 목록은 `docs/development-plan.md` §4.2와 `docs/art-direction.md`를 따른다. 제공된 BGM 및 결과 음악 외의 SFX/이미지는 실제 파일이 생길 때 대체한다.
3. 밸런스 개선은 현행 `rush-7` 4,000판 결과를 기준으로 원인별로 측정한다. 사용자 지정 초반 보호·출발 칸 안전 제거, 시작 방어막 제거와 PvP 보상은 유지한다. 규칙/모델을 바꾸면 버전을 올리고 분포·모델을 다시 수집하고 2~4인별로 검증한다.
4. 배포 목적지와 실제 인터넷 회선에서의 체감 지연은 아직 확인이 필요하다. 가상 TCP 지연/손실 및 실제 Socket.IO 통합 테스트는 저장소에 있다.

## 구조 메모

- 보드 엔진은 결정적이며 게임 규칙의 단일 출처다. 온라인은 서버가 좌석·합법 행동·상태 버전을 검증한다. `packages/engine`의 수치 변경은 `RulesConfig`와 문서·골든 테스트를 함께 갱신한다.
- 전투는 `packages/combat`, 전투 AI는 `packages/combat-ai`, 롤백 네트코드는 `packages/netcode`다. `packages/ai`는 보드 AI다.
- 현행 `obs_v2`/`act_v1`과 전투 `cobs_v1`/`cact_v1`을 조용히 변경하지 않는다. 가중치 호환성이 걸려 있다.
- 로컬 화면과 온라인 화면은 같은 웹 UI를 공유한다. 보드 UI의 행동은 서버/엔진에서 제공한 합법 행동을 통해 제출한다.
