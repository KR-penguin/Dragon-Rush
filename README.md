# 드래곤 러쉬 (Dragon Rush)

> 부루마블처럼 이어진 24칸 보드를 주사위로 돌며 코인을 모아 강해지고, 같은 칸에 멈춘 상대와 1:1로 결투하고, 충분히 강해졌을 때 용에 도전하는 웹 RPG 보드게임. 로컬·온라인 멀티플레이, AI 좌석, AI 학습 환경을 함께 제공한다.

## 현재 상태

- **P0~P7 구현 완료.** 규칙 엔진, 학습 환경(env 서버 + Python 클라이언트), 밸런스 시뮬, 웹 로컬 플레이, 온라인 멀티플레이 서버가 동작한다.
- **남은 것은 사용자 입력이 필요한 두 가지**: ① 가중치 JSON 포맷과 패리티 샘플을 받으면 모델 어댑터를 구현해 모델 좌석을 켠다(P6). ② 실제 에셋(이미지·음악)과 배포 대상을 받으면 적용한다(P7). 그 전까지 모델 좌석은 "준비 중"이고 에셋은 이모지·CSS 플레이스홀더로 대체된다.
- 관측·행동 스펙(`obs_v1`/`act_v1`)은 구현·테스트되어 있어 지금 바로 학습을 시작할 수 있다. 확인이 필요한 사항은 [개발 계획서 §2](docs/development-plan.md)와 [기획서 §16](docs/game-design.md)에 있다.

## 게임 한눈에 보기

수치는 한 판 7~10분을 목표로 한 `rush-1` 밸런스 값이며(4인 평균 약 10라운드), 정본은 [기획서](docs/game-design.md)다(엔진에서는 `RulesConfig` 한 곳에서 조정).

- **인원·보드**: 2~4명(사람·봇·AI 모델 자유 조합). 24칸 순환 링을 주사위 1개(1d6)로 돈다. 모두 0번(출발, 안전지대)에서 코인 10으로 시작하고, 주사위 이동으로 출발 칸을 지나거나 도착하면 코인 +20, HP +6.
- **칸 이벤트**: 좋은 칸 11, 나쁜 칸 8, 특수 칸 5(출발, 상점 2, 미지의 동굴 2). 예: 고블린 무리 처치 코인 +6, 가시 함정 HP −6. 이벤트로는 죽지 않는다(HP 최소 1).
- **성장**: 스탯 강화(`atk` +1 / `def` +1 / `maxHp` +6)는 자기 턴이면 어디서나 코인으로 한다. 비용은 `atk` 3 + 레벨, `def`·`maxHp` 2 + 레벨로 점점 오른다.
- **아이템**(일회용, 상점 칸에서 구매): 텔레포트(6코인, 원하는 칸으로 즉시 이동) · 방어막(6코인, 결투 취소) · 도둑(5코인, 상대 코인 최대 10개 탈취, 턴당 1회).
- **결투**: 같은 칸에 멈추면 1:1 전투가 자동으로 진행된다. 1회 피해 = `max(1, atk + 1d6 − 상대 def)`. 패자는 즉시 탈락하고, 승자는 패자 코인의 절반(내림)과 아이템 전부를 받는다.
- **용**(HP 88 / ATK 10 / DEF 6, 3번째 공격마다 방어력 무시 브레스): 자기 턴에 주사위 대신 도전한다. 이기면 즉시 승리, 지면 즉시 탈락하고 코인·아이템은 소멸한다.
- **승리 조건**: 용 처치 또는 최후의 생존자. `maxRounds`에 도달하면 무승부(사람 게임은 기본 꺼짐, 학습 env는 기본 100).
- **시뮬 기반 추가 규칙**(승인됨): 초반 보호(라운드 1~2는 같은 칸이어도 PvP 없음), 시작 방어막 1개, 닌자 보정 쿨다운. 스탯·코인·아이템은 모두 공개 정보다.

| 직업 | id | HP | ATK | DEF | 패시브 |
|---|---|---|---|---|---|
| 검사 | `swordsman` | 53 | 5 | 5 | **불굴**: 게임당 1회, HP가 0 이하가 될 피해를 HP 1로 버팀 |
| 궁수 | `archer` | 39 | 6 | 6 | **선제 사격**: 모든 전투에서 선공, 첫 공격 피해 +3 |
| 마법사 | `mage` | 40 | 4 | 5 | **마력 관통**: 공격할 때 상대 DEF를 절반(내림)만 적용 |
| 닌자 | `ninja` | 34 | 4 | 5 | **그림자 걸음**: 주사위에 −1/0/+1 보정(±1 사용 후 쿨다운) · **회피**: 피격마다 1/8 확률로 피해 0 |
| 광전사 | `berserker` | 47 | 5 | 5 | **광폭화**: HP가 최대 HP의 50% 이하면 ATK ×1.3(내림) |

직업은 게임 시작 전에 고르며 중복할 수 없다.

## 주요 기능

| 기능 | 내용 |
|---|---|
| 로컬 플레이 | 핫시트(한 화면에서 2~4명) + vs 봇. 서버 없이 브라우저에서 엔진을 직접 실행한다 |
| 온라인 멀티플레이 | 6자리 방 코드, 닉네임만 사용(계정 없음). **서버 권위**: 클라이언트는 행동 의도만 보내고 주사위·전투는 서버가 계산한다. 턴 타이머(60초, 초과 시 기본 행동), 재접속 유예 60초(끊긴 동안 `HeuristicBot`이 대신 플레이). 인메모리 단일 인스턴스(DB 없음) |
| AI 좌석 | 좌석마다 사람 / 봇(`RandomBot`, `HeuristicBot`) / 모델(`ModelPolicy`) 중 선택. 로컬 게임은 브라우저에서, 온라인 게임은 서버에서 실행한다. 모델 좌석은 사용자 가중치 JSON 포맷을 받기 전까지 "준비 중"으로 비활성화된다 |
| AI 학습 환경 | 화면 없는 env 서버(stdio JSON Lines, 배치 N env) + numpy만 쓰는 Python 클라이언트(`reset()`/`step()`, 행동 마스크). 단일 에이전트·셀프플레이 모드 |
| 밸런스 시뮬 | `pnpm sim`으로 봇끼리 대량 대전 → 직업별 승률, 게임 길이, 용 처치 시점 등 리포트 |

## 문서

| 문서 | 내용 |
|---|---|
| [docs/game-design.md](docs/game-design.md) | 게임 기획서. 규칙·수치·턴 흐름의 정본 |
| [docs/architecture.md](docs/architecture.md) | 아키텍처. 패키지 경계, 엔진 설계, 웹·서버 구조, 멀티플레이 프로토콜·동기화 |
| [python/README.md](python/README.md) | **학습 가이드**. 관측 253개·행동 47개 인덱스표, 보상, env 옵션, 기준선, 모델 전달 방법 |
| [docs/ai-interface-spec.md](docs/ai-interface-spec.md) | AI 인터페이스 명세. 관측·행동·마스크·보상, env 서버 프로토콜, Python API, 모델 통합 계약 |
| [docs/combat-ai-spec.md](docs/combat-ai-spec.md) | 전투 AI 명세(2차). 전투 관측 `cobs_v1`·행동 `cact_v1`·마스크·보상, combat env 서버, `CombatVecEnv`, 보드 env의 `combat_resolver` |
| [docs/development-plan.md](docs/development-plan.md) | 개발 계획서. Phase P0~P7, 사용자 결정 사항, 기술 스택, 에셋 요청 목록, 리스크 |
| [coding_convention.md](coding_convention.md) | 꼭 지켜야 할 코딩 규칙 8개 |
| [AI_README.md](AI_README.md) | AI 에이전트용 워크스페이스 가이드(영어). 구조·라이브러리·아키텍처 패턴·기술 스택 |
| [CLAUDE.md](CLAUDE.md) | Claude Code 진입점. `AI_README.md`와 `coding_convention.md`를 불러온다 |

## 저장소 구조

```
/
├─ apps/
│  ├─ web/                 # React + Vite 클라이언트 (로컬/온라인 플레이, 로비, 보드 UI)
│  └─ server/              # Node + Fastify + Socket.IO 권위 서버 (방, 턴 타이머, 재접속, 서버측 AI 좌석)
├─ packages/
│  ├─ engine/              # 순수·결정적 규칙 엔진 (유일한 규칙 소스) + RulesConfig(밸런스 수치)
│  ├─ protocol/            # C↔S 메시지 타입 + zod 스키마
│  ├─ ai/                  # encodeObservation, action codec/mask, Policy, 봇, 모델 어댑터
│  ├─ combat/              # (2차, 진행 중) 결정적 실시간 전투 sim + DEFAULT_COMBAT_RULES
│  ├─ combat-ai/           # (2차) 전투 관측 cobs_v1·행동 cact_v1·마스크, 스크립트 전투 봇, 전투 모델 정책
│  └─ sim/                 # 헤드리스 시뮬레이터, 밸런스 CLI, 보드 env 서버 + 전투 env 서버(stdio JSONL)
├─ python/
│  ├─ rpgboard_env/        # numpy-only Python 클라이언트 (env 서버 래핑)
│  └─ examples/            # random_agent.py 등 사용 예제
├─ models/                 # 사용자가 제공하는 가중치 JSON 보관 위치 (예: models/my-agent.json)
├─ docs/
│  ├─ game-design.md
│  ├─ development-plan.md
│  ├─ architecture.md
│  └─ ai-interface-spec.md
├─ README.md  AI_README.md  coding_convention.md  CLAUDE.md
```

의존 방향(단방향): `engine` ← `ai`, `protocol` ← `sim`, `server`, `web`. `engine`은 어떤 패키지도 import하지 않는다.

## 기술 스택

| 영역 | 기술 |
|---|---|
| 언어·모노레포 | TypeScript (strict) + pnpm workspaces. 패키지 스코프 `@dragon-rush/*` |
| 규칙 엔진 (`engine`) | 의존성 없는 순수 TS. 결정적(seeded PRNG sfc32를 state 안에 보관), 불변 state, 순수 함수 API |
| 프로토콜 (`protocol`) | 클라이언트↔서버 메시지 타입 + zod 스키마 |
| AI (`ai`) | 관측 인코더, 행동 코덱·마스크, `Policy`(Strategy 패턴), 내장 봇, 가중치 JSON 어댑터(Adapter 패턴) |
| 시뮬·env (`sim`) | 헤드리스 시뮬레이터, 밸런스 CLI, env 서버(stdio JSON Lines) |
| 웹 (`web`) | React + Vite + Zustand + Socket.IO client. 보드는 DOM/SVG + CSS 애니메이션 |
| 서버 (`server`) | Node 22 + Fastify(HTTP·정적 파일) + Socket.IO(방·실시간). 서버 권위, 인메모리 방 |
| Python | Python 3.13 + numpy만 사용(gymnasium 의존성 없음). 테스트는 pytest |
| 테스트·품질 | Vitest + fast-check(속성 테스트), Playwright E2E(선택), ESLint(flat config) + Prettier |

## 실행 방법

필요 환경: Node 22, pnpm 10, Python 3.10+ + numpy.

```bash
pnpm install                 # 의존성 설치
pnpm dev                     # web(Vite, http://localhost:5173) + server(:3001) 동시 실행
pnpm test                    # 전체 Vitest (엔진·AI·sim·서버·웹 서비스)
pnpm lint                    # ESLint
pnpm typecheck               # 타입 검사
pnpm build                   # 프로덕션 빌드
pnpm start                   # 빌드 후 단일 Node 서비스 실행 (웹 정적 파일 + Socket.IO, :3001)
pnpm sim --games 10000 --players 4 --bots heuristic   # 헤드리스 밸런스 시뮬 (CPU 코어 수만큼 병렬)
pnpm sim --games 1000 --players 4 --combat sim        # 결투·용전을 실시간 전투 sim(스크립트 봇)으로 해결
pnpm env-server              # 학습용 env 서버(stdio) 단독 실행. 먼저 pnpm build, 보통은 Python 클라이언트가 자동 실행
pnpm combat-env-server       # 전투 모델 학습용 env 서버(stdio) 단독 실행. 보드 env와 별도 프로세스

pip install -e python/                     # Python 학습 환경 클라이언트 설치 (선행: pnpm install && pnpm build)
python python/examples/random_agent.py     # 무작위 에이전트 예제
python python/examples/random_combat_agent.py   # 전투 env 무작위 에이전트 예제
python -m pytest python/tests              # Python 클라이언트 테스트
docker build -t dragon-rush . && docker run -p 3001:3001 dragon-rush   # 컨테이너 배포 (선택)
```

서버 설정(환경변수): `PORT`(3001), `TURN_TIMEOUT_MS`(60000), `RECONNECT_GRACE_MS`(60000), `BOT_ACTION_DELAY_MS`(700), `MODELS_DIR`(`models/`).

## AI 모델·학습 환경

> 학습을 시작한다면 **[python/README.md](python/README.md)(학습 가이드)**부터 본다.

| 담당 | 범위 |
|---|---|
| **사용자** | 순수 numpy Actor-Critic 학습(트레이너), 가중치 JSON 포맷 정의, 가중치 파일·패리티 샘플 제공 |
| **이 저장소** | 관측·행동·마스크·보상 스펙, 학습 env(env 서버 + Python 클라이언트), 내장 봇, `PolicyModel` + 사용자 포맷 어댑터, 게임 내 AI 좌석 통합 |

이 저장소는 학습 코드(PPO/A2C 트레이너, PyTorch, export 스크립트)를 만들지 않고, 가중치 JSON 스키마도 정의하지 않는다.

- **관측 `obs_v1`**: float32[253], 결정하는 좌석 기준 자기중심(자기 블록 → 상대 블록 3개 → 전역 블록). **행동 `act_v1`**: 이산 47개 + 행동 마스크.
- 인코더·마스크는 TS(`packages/ai`)에만 구현한다. Python은 env 서버가 준 벡터를 그대로 쓰므로 학습 관측과 실제 게임 관측이 항상 같다.
- **보상**: 승리 +1, 탈락·패배 −1, 무승부(`truncated`) 0. 선택적 shaping은 기본 꺼짐.
- **모드**: `single`(에이전트 1좌석 + 나머지 내장 봇) / `selfplay`(지정 좌석을 모두 Python이 제어, 매 step `acting_seat` 제공). 배치용 `RPGBoardVecEnv`.

```python
from rpgboard_env import RPGBoardEnv

env = RPGBoardEnv(mode="single", num_players=4, opponents="heuristic", max_rounds=100)
obs, info = env.reset(seed=0)        # obs: float32 (253,), info["action_mask"]: bool (47,)
obs, reward, terminated, truncated, info = env.step(action)   # action: 마스크가 True인 인덱스
env.close()
```

- **전투 모델(2차)**: 실시간 결투·용전용 모델은 보드 모델과 따로 학습한다. 관측 `cobs_v1` float32[160], 행동 `cact_v1` [이동 9, 버튼 4](또는 flat 36), 별도 env 서버(`pnpm combat-env-server`)와 `CombatVecEnv`. 보드 env는 `combat_resolver="sim"`으로 전투를 실시간 sim으로 해결할 수 있다(기본 `dice`). 자세한 내용은 [python/README.md §9](python/README.md)와 [combat-ai-spec.md](docs/combat-ai-spec.md).
- **게임에 모델 넣기**: 가중치 파일을 `models/<name>.json`(예: `models/my-agent.json`)에 둔다. 게임은 관측 인코딩 → 순수 TS forward → 마스크 적용 → argmax/샘플링으로 행동을 고른다(critic 출력은 쓰지 않음). 업로드 기능은 없다. 어댑터가 구현되면 온라인 방의 모델 좌석과 `pnpm sim --bots model:<name>,heuristic`으로 평가할 수 있다.
- **어댑터 구현 전에 필요한 정보**: 네트워크 구조, 활성화 함수, 행렬 배치 규칙, 입력 정규화, actor 출력이 logits인지 확률인지, critic 출력 형태, JSON 예시 파일, **패리티 샘플**(obs 5개 이상 + 행동 마스크 → numpy actor(마스크 전)/critic 출력, `models/parity/<name>.json`). 모델 메타데이터에 `obs_v1`/`act_v1` 표기를 권장한다. 상세 양식은 [ai-interface-spec.md §9](docs/ai-interface-spec.md).

## 기여 규칙

상세는 [coding_convention.md](coding_convention.md)(규칙 8개)를 따른다. 핵심만 요약하면 다음과 같다.

- `main`에 직접 커밋하지 않는다. 브랜치는 `feature/xxx`, `bugfix/xxx`, `docs/xxx`, `chore/xxx`.
- 커밋 메시지는 영어 Conventional Commits(예: `feat(engine): resolve duel on shared tile`).
- TDD로 실패하는 테스트를 먼저 쓴다. 엔진은 순수·결정적이고, 규칙은 엔진에만, 수치는 `RulesConfig`에만 둔다.
- `obs_v1`/`act_v1` 레이아웃을 바꾸면 버전 증가, 스펙 문서, 골든 테스트를 같은 커밋에서 함께 갱신한다.
- 구조·라이브러리·명령이 바뀌면 같은 작업에서 `README.md`와 `AI_README.md`를 갱신한다. 대규모 구조 변경이나 여러 파일 수정은 착수 전에 범위와 이유를 브리핑하고 승인받는다.
- 모호하면 추측하지 말고 묻는다. 코드 주석은 영어로, 꼭 필요한 곳에만 단다.
