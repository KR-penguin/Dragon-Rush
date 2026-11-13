# 개발 계획서 — 드래곤 러쉬 (Dragon Rush)

> 상태: **1차 P0~P7 구현 완료 (2026-11-11)**, **2차 개발 진행 중 (2026-11-12, §5)**. 사용자 자료 대기: D4·D13(보드·전투 모델 가중치 포맷), D8·D12(추가 이미지·효과음), D9(배포 대상). 제공받은 MP3를 메뉴·전투·승리 BGM으로 사용한다. 보드·PvP·용전 학습 환경이 있으며 내부 결과 예측기는 제거됐다. 현행 보드 규칙은 `rush-11`, 실시간 전투 규칙은 `combat-9`이다. 이전 승률 수치는 현행 밸런스 기준선이 아니다.
> 정본 분담: 규칙·수치 → [game-design.md](game-design.md) · 구조·프로토콜 → [architecture.md](architecture.md) · 보드 AI 계약 → [ai-interface-spec.md](ai-interface-spec.md) · 실시간 전투 → [combat-design.md](combat-design.md) · 전투 AI 계약 → [combat-ai-spec.md](combat-ai-spec.md) · 화면·연출·효과·오디오 → [art-direction.md](art-direction.md) · 코딩 규칙 → [coding_convention.md](../coding_convention.md) · 워크스페이스 안내 → [README.md](../README.md), [AI_README.md](../AI_README.md)

## 1. 전체 전략
- **엔진 우선 + TDD**: 규칙은 `packages/engine` 한 곳에만 두고 테스트를 먼저 쓴다. 웹·서버·AI·sim이 모두 같은 엔진을 호출하므로, 버그를 한 번 고치면 모든 모드에 반영된다.
- **AI 스펙 버전 관리**: 현행 보드 관측 `obs_v4`(498)는 생성된 24칸 맵의 효과를 포함한다. 행동 `act_v3`(47)는 닌자 −1/0/+1 모두 쿨다운을 소비한다. 학습 env를 제공해 웹·온라인 개발과 병행 학습할 수 있다. 전투 모델(`cobs_v1`/`cact_v1`)은 별도로 관리한다.
- **로컬 → 온라인 순서**: 핫시트와 vs 봇으로 재미와 UI를 먼저 검증한다. 온라인은 같은 `GameClient` 인터페이스 뒤에 붙이므로 UI를 다시 만들지 않는다.
- **사용자 모델은 어댑터로 격리**: 가중치 JSON 포맷을 받은 뒤 `WeightAdapter`만 구현한다. 그 전에는 `Policy` 인터페이스와 내장 봇으로 AI 좌석 경로 전체를 검증해 둔다.
- **밸런스는 데이터로 관리**: 모든 수치는 `RulesConfig`(보드)와 `DEFAULT_COMBAT_RULES`(전투)에 둔다.
- **Phase 단위 진행**: Phase는 완료 기준(DoD, 테스트 포함)을 충족해야 끝난다. 결정이나 승인이 필요한 항목만 확인받고 다음 Phase로 넘어간다.
- **범위는 "게임"까지**: 트레이너(학습 코드)와 가중치 포맷 정의는 사용자 담당이다. 모델 업로드, 계정·DB, 서버 수평 확장은 범위 밖이다.

## 2. 사용자 결정·승인·주의 사항
답이 없으면 **기본안**으로 진행한다. ★ 표시는 진행을 멈추고 확인받는 체크포인트다. 2차 결정 항목 D12~D16은 §5.3.

| # | 항목 | 기본안 (답이 없을 때) | 필요 시점 | 영향 |
|---|---|---|---|---|
| D1 | 원격 저장소(GitHub 등) 사용 여부 | 로컬 git만 사용. 원격이 생기면 CI 워크플로(이미 준비됨)를 켠다. `prompt.md`는 커밋하지 않는다 | P0 | PR 리뷰·CI |
| D2 | 규칙 열린 질문 R1~R7 (§2.1, 기획서 §16) | 기획서 §16 기본안. R1 보호 승인은 최신 사용자 결정으로 철회되어 `rush-6`부터 제거, R5b 유지, R5a 시작 방어막은 `rush-3`에서 제거, R7 결정, R2·R3·R4는 기본안 | P1 전 | 엔진 분기, 수치, 관측 |
| D3 | ★ 보드 관측·행동 계약 동결 검토 | 현행 `obs_v4`(498)/`act_v3`(47)는 ai-interface-spec대로 고정. 이전 가중치는 재학습 또는 명시적 변환 필요 | P2 종료 (완료); 이후 버전 갱신 | 바뀌면 재학습 |
| D4 | 보드 가중치 JSON 포맷 + 통합 정보 + 패리티 샘플 (§2.2) | 받기 전까지 model 좌석은 "준비 중" | 언제든 (빠를수록 좋음) | 어댑터·패리티 테스트 |
| D5 | 재접속 유예 만료 후 처리 | 좌석을 HeuristicBot으로 영구 전환, 토큰은 관전용으로 강등 | P5 (적용됨) | 복귀 가능 여부 |
| D6 | 턴 타이머·재접속 유예 시간 | 둘 다 60초(`TURN_TIMEOUT_MS`·`RECONNECT_GRACE_MS`). 전투 중에는 턴 타이머 정지 | P5 (적용됨) | 게임 템포 |
| D7 | 지원 화면 | 데스크톱·태블릿·모바일 세로 웹 레이아웃과 터치 조작 지원 | P4 | 레이아웃 |
| D8 | 에셋 제공 (§4.2, 상업적 사용권 확보 파일) | 플레이스홀더로 개발·출시 가능. 2차 납품 방식은 D12 | 수시 | 완성도 |
| D9 | 배포 대상(호스팅)·도메인 | WebSocket 장기 연결을 지원하는 단일 Node 호스트(VPS 또는 Render·Fly.io). 서버리스 함수형은 부적합 | 배포 전 | 비용·운영 |
| D10 | 게임 이름 | **결정됨: "드래곤 러쉬 (Dragon Rush)"** (2026-11-12) | — | 로고 에셋 |
| D11 | 밸런스 프로토타입 보관 (`docs/balance/`) | 승인 전까지 ai-interface-spec §10 봇 요약과 기획서 §15 지표가 기준 | — | 프로토타입 직접 비교 |

### 2.1 규칙 열린 질문 R1~R7 (상세는 기획서 §16, R6은 §15. 2차 Phase R1~R8과는 별개 번호)
- **R1 초반 PvP 보호** (최신 결정으로 제거): 과거 `rush-1`에서 3 → 2라운드였지만 `rush-6`은 `pvpGraceRounds = 0`이고 출발 칸도 PvP 가능하다. 4인 4,000판 조기 탈락률 44.5%는 기획서 §15에 기록했다.
- **R2 텔레포트 턴당 제한**: 기본 무제한(`perTurnLimit = null`). **R3 도둑**: 일회용·턴당 1회(`rush-1`에서 최대 10코인).
- **R4 목표 게임 길이·용 처치 비중**: 과거 `rush-10`/`combat-7` 4인 휴리스틱·스크립트 봇 300판(`pnpm sim --games 300 --players 4 --bots heuristic --seed 2026 --combat sim --json`, 초반 순수 회복 칸 제한 적용)은 평균 16.9433/중앙 19/p95 31라운드, 용 처치 종료 20.6667%, 3라운드 안 탈락 30.3333%, 용 도전 성공률 53.4483%, 판당 PvP 2.6회, 평균 전투 38.8945초, 보드 턴당 10초 가정 시 예상 평균 7.70324분이다. 이는 작은 봇 표본이며 실제 사람 선택 시간·승률은 미계측이다. **과거 측정**: `rush-9`/`combat-5` 1,000판은 평균 15.909/중앙 16/p95 29라운드, 용 처치 종료 21.1%, 3라운드 안 탈락 30.85%, 닌자 조건부 승률 37.56%였다(기획서 §15).
- **R5 밸런스 구조 변경**: 시작 방어막 지급은 `rush-3`에서 제거했다(2026-11-12 사용자 요청). 현행 닌자 보정은 −1/0/+1 중 어느 선택이든 쿨다운 2를 소비하며 다음 자기 턴에는 사용할 수 없고 그다음 자기 턴부터 가능하다(`ninjaCooldown`은 `obs_v4`에 포함).
- **현행 맵·방**: 매 게임 시드로 24칸을 생성한다. 출발 0·상점 6/18·여관 12는 고정, 기존 이동 칸 16개와 새 좋은 칸 2개·나쁜 칸 2개를 나머지 20자리에 섞는다. 첫 이동으로 도달 가능한 1~10번에는 약초 군락·달빛 우물 같은 순수 HP 회복 칸을 두지 않는다. 직업 중복 선택이 가능하다. 온라인 종료 후 호스트는 같은 방 코드·좌석·설정으로 로비에 돌아가 재경기를 시작할 수 있으며, 사람의 준비 상태는 초기화된다.
- **R6 밸런스 미달 수용**: 2·3인 아이템 구매 편중 등. 기본안 수용. **R7 쉬는 턴** (결정): 이동만 막는다.

### 2.2 모델 통합에 필요한 정보 (D4 보드, D13 전투)
- 네트워크 구조(층 수·크기), 활성화 함수, 행렬 배치(행/열 우선, `W·x`인지 `x·W`인지), 입력 정규화, actor 출력이 logits인지 확률인지, critic 출력, 메타에 버전 표기(권장).
- **패리티 샘플**: 관측·마스크 → actor(마스크 전 원출력)/critic 출력 쌍 5개 이상. 보드는 [ai-interface-spec.md §9](ai-interface-spec.md), 전투는 head 구조(9+4 또는 36)까지 [combat-ai-spec.md §11](combat-ai-spec.md).

### 2.3 주의
- 학습 코드와 가중치 포맷 정의는 **사용자 담당**이다. 우리는 env 서버, Python 클라이언트, 어댑터까지만 만든다.
- **보드 모델과 전투 모델은 별개**다. 전투 정책을 바꾸면 실제 `sim` 전투로 보드 정책을 다시 평가하고 필요하면 보드 모델을 미세 조정한다([combat-ai-spec.md](combat-ai-spec.md) §10.4).
- 수치가 바뀌면 `RulesConfig.version`·`combat_rules_version`으로 구분한다. 관측·행동 레이아웃은 그대로라 학습 코드는 그대로 쓸 수 있다.
- 온라인은 인메모리 단일 인스턴스다(재시작 시 진행 중 게임 소실, MVP 허용). 서버 모델은 운영자가 `models/`(전투는 `models/combat/`)에 직접 둔다.

## 3. 핵심 추가 내용
### 3.1 기술 스택·라이브러리
| 이름 | 용도 | 선택 이유 |
|---|---|---|
| TypeScript (strict) | 전 패키지 | 엔진 하나를 서버·브라우저·sim이 공유. 타입으로 Action·Event 계약을 고정 |
| pnpm workspaces | 모노레포 | 빠른 설치, workspace 의존 선언으로 단방향 의존 강제 |
| Node 22 | 서버, sim, env 서버 | LTS |
| React + Vite, Zustand | 웹 UI·상태 | 성숙한 생태계, 빠른 HMR / React 밖(services)에서도 갱신 |
| Socket.IO, Fastify | 온라인 방·실시간 동기화, HTTP·정적 파일 | room·ack·재연결 내장, 같은 포트 |
| zod | 프로토콜·env 명령 검증 | 스키마 하나에서 검증과 TS 타입 |
| Vitest + fast-check, Playwright | 단위·속성 테스트, E2E·브라우저 간 결정성 해시 | Vite와 설정 공유 |
| ESLint(flat) + typescript-eslint + Prettier | 품질 | 엔진·전투 sim의 비결정 API를 lint로 금지 |
| sfc32 (자체 구현) | 시드 PRNG | 무의존, 결정성 |
| Python 3.13 + numpy (+ pytest) | 학습 env 클라이언트 | 사용자 Actor-Critic이 numpy 기반 |
| (2차 예정) `@fontsource/*`, `bufferutil`·`utf-8-validate` | 웹폰트 자체 호스팅 / ws 바이너리 성능 | 추가 전에 이유를 브리핑한다 |

### 3.2 아키텍처 패턴 (상세는 architecture.md §1·§4·§12)
| 패턴 | 적용 위치 | 이유 |
|---|---|---|
| 함수형 코어 / 명령형 셸 | engine·ai·combat은 순수, server·web·sim은 부수효과 | 결정성, 테스트 용이성 |
| Reducer + 표 주도 FSM | `engine` reducer·legal | 합법 행동을 phase 단위로 국소화 |
| Command / 이벤트 로그 | `Action` / `GameEvent`, 전투 입력 마스크 / 전투 이벤트 | 전송·검증·리플레이·애니메이션의 공통 원천 |
| 데이터 주도 테이블·훅 맵 | 칸 효과, 직업 패시브, 용 기술 표 | 새 칸·패시브·기술 = 데이터 추가 |
| Strategy, Adapter | `Policy`·전투 정책 / `WeightAdapter`·`CombatWeightAdapter` | 사람·봇·모델 같은 경로, 포맷 변경은 어댑터만 |
| Ports & Adapters | `GameClient` → Local / Online | UI가 로컬/온라인을 모름 |
| 서버 권위 + 버전 검사 | `GameSession.submit`, `stateVersion` | 부정행위 방지, 경합 해결 |
| 고정 타임스텝 결정적 sim + 예측·재시뮬 | `packages/combat`, 온라인 전투 | 서버·브라우저·학습 env가 같은 결과 |
| Observer, Producer–Consumer | Zustand, 이벤트 애니메이션 큐, FX 이벤트 버스 | 연출 속도와 상태 갱신 분리 |

## 4. 기타 중요 사항
### 4.1 1차 Phase (P0~P7, 완료)
| Phase | 목표 | 결과 |
|---|---|---|
| P0 스캐폴딩 | 모노레포·툴링·엔진 순수성 lint | 완료 |
| P1 엔진 | 규칙 전부를 순수·결정적 엔진으로 (TDD, 속성·골든 테스트) | 완료 |
| P2 AI·env | 당시 `obs_v1`/`act_v1` 동결, env 서버, numpy 클라이언트 | 완료. 현재 보드 관측은 `obs_v4`(498), 행동은 `act_v3`(47); 이전 64 env 처리량은 당시 환경의 역사적 측정값 |
| P3 밸런스 | TS 엔진으로 프로토타입 지표 재현 | 4인 지표 전부 충족 |
| P4·P5 | 로컬 웹 플레이 / 온라인 서버·로비·재접속·타이머 | 완료 |
| P6 모델 통합 | 어댑터 자리·모델 레지스트리·sim `model:<id>`·패리티 도구 | 사용자 포맷(D4) 수령 후 어댑터만 구현 |
| P7 에셋·배포 | Dockerfile·CI 워크플로·문서 | 실제 에셋·배포는 D8·D9 대기 |
- Phase별 산출물·DoD 상세는 git 이력의 이전 판(2026-11-11)에 있다.

### 4.2 에셋 요청 목록 (2026-11-12 전면 개정)
- 경로는 모두 `apps/web/public/assets/` 기준이다. 파일이 없으면 이모지·CSS 플레이스홀더로 동작하므로 하나씩 넣어도 된다. **상업적 사용권을 확보한 파일**만 받는다. 연출 규격은 [art-direction.md](art-direction.md).
- 이미지: 스프라이트·아이콘·소품은 PNG(투명), 큰 불투명 텍스처·바닥은 JPG(품질 80~85). 1080p 표시 크기의 2배로 그리고, 레이어 원본(PSD/Aseprite)은 `public/` 밖에 둔다. 광원은 모두 좌상단, 전투 스프라이트는 1px 어두운 외곽선, 보드 그림 선은 잉크 #2B1D14.
- 오디오: MP3 44.1kHz(SFX 모노 128kbps, BGM·환경음 스테레오 192kbps) + 48kHz/24bit WAV 원본. SFX 피크 −3 dBFS, BGM 약 −16 LUFS. `_01..03` = 변형 파일 3개(`_01`, `_02`, `_03`).
- **우선**: P0 = 리디자인·전투 v1 완성에 필요, P1 = 다듬기, P2 = 있으면 좋음. **대체**: `절차` = 코드(CSS/SVG/Canvas/Web Audio)로 그려 파일은 선택 · `아이콘` = game-icons.net SVG(CC BY 3.0, 크레딧 "Lorc, Delapouite & contributors")로 먼저 내고 나중에 그림으로 교체(P0에서는 선택) · `—` = 파일 필요.
- 1차 목록에서 바뀐 경로: `images/tokens/*` → `images/jobs/standee/*`, `images/ui/{atk,def,hp,coin}.png` → `images/ui/icons/*`, `images/cards/*.png` → `images/cards/mystery/*`, `images/ui/logo.png` → `images/brand/logo_ko.png`, `board_bg.png` → `table_wood.jpg`(같은 이름 복사본도 가능), 효과음은 하위 폴더(아래 이전 이름 대응).

**이미지 149개** (P0 84 — 그중 50개는 `아이콘` 대체 가능 / P1 50 / P2 15) + 아틀라스 JSON 7개

| 용도 | 경로·파일명 | 형식·크기 | 우선 | 대체 |
|---|---|---|---|---|
| 직업 초상화 (HUD 메달, 직업 선택, VS) | `images/jobs/{swordsman,archer,mage,ninja,berserker}.png` | PNG 256², 흉상, 3/4 우향 | P0 | — |
| 보드 말 스탠디 (흉상~무릎, 좌석색은 코드가 받침에) | `images/jobs/standee/{job}.png` ×5 | PNG 384×512 | P0 | — |
| 전투 바디 아틀라스 (위에서 비스듬히 내려다본 3/4 시점, 우향·좌는 반전) | `images/combat/jobs/{job}/{job}_body.png` + `.json` ×5 | 셀 128² (발 피벗 64,112), Aseprite/TexturePacker array JSON, 프레임 태그. 순수 측면 그림은 사용하지 않는다 | P0 | — |
| 회전 무기 | `images/combat/jobs/archer/bow.png`, `images/combat/jobs/mage/staff.png` | PNG 128², 손잡이 중심 피벗 | P0 | — |
| 투사체 | `images/combat/projectiles/` `arrow.png`(64×16), `arrow_charged.png`(96×24), `arcane_bolt.png`(48²×4 스트립), `kunai.png`(48×16), `fireball.png`(96²×6 스트립) | PNG | P0 | — |
| 전투 정면·후면 시트 (+ 바디 아틀라스 `victory` 태그 4프레임) | `images/combat/jobs/{job}/{job}_body_up.png`, `{job}_body_down.png` ×5 | 같은 규격 | P2 | — |
| 보드 용 (깨어 있음, 기존 경로) | `images/dragon/dragon.png` | PNG 1024² | P0 | — |
| 전투 용 컷아웃 리그 (body, neck, head_closed/open, jaw, throat_glow, eye_glow, wing_folded/spread, tail_1~3, foreleg_down/raised) | `images/combat/dragon/dragon_rig.png` + `.json` | 아틀라스 ≤ 2048², 논리 192×144의 2배 | P0 | — |
| 용 의도 아이콘 (공격, 브레스) | `images/dragon/intent_attack.png`, `intent_breath.png` | PNG 128² | P0 | 아이콘 |
| 보드 용 상태 (잠듦, 포효) | `images/dragon/lair_asleep.png`, `lair_roar.png` | PNG 1024² | P1 | — |
| 전투 용 포즈 (charge_side 4, stunned 4, takeoff 4, airborne_topdown 1, land 3, hurt 2, death 8) | `images/combat/dragon/dragon_poses.png` + `.json` | 셀 384×288 | P1 | — |
| 탁자 나무 / 보드 테두리(9-slice 64) / 양피지 결 / 둥지 분화구 | `images/board/table_wood.jpg`(1024² 타일링), `board_rim.png`(192²), `parchment.jpg`(512² 타일링), `lair_crater.png`(1200², 부드러운 투명 가장자리) | JPG/PNG | P0 | — |
| 용암 균열 오버레이 / 룰렛 펠트 | `images/board/lava_cracks.png`(512² 타일링, 알파) / `felt.jpg`(256²) | PNG / JPG | P1 / P2 | — / 절차 |
| 칸 그림 22종 (아이콘 → 채색 3/4 비네트로 교체) | `images/tiles/{start,goblin,poison_swamp,herb,bandit,training,shop,wolf,trap,treasure,pickpocket,blacksmith,inn,orc,cursed_altar,fountain,rockfall,mystery,troll,spider_web,wandering_merchant,storm}.png` | PNG 256² | P0 아이콘 → P1 그림 | 아이콘 |
| 모서리 랜드마크 스탠디 (START 깃발 문 + 흔들림, 상점 천막 2곳 공용, 여관) | `images/landmarks/start_gate.png`, `start_gate_idle.png`(4프레임 스트립), `shop_tent.png`, `inn.png` | PNG 384² | P1 | — |
| 결투 경기장 바닥 (돌 교차로, 플레이 영역 안 빨강·주황 금지) / 용 경기장 바닥 (현무암, 용암은 벽 밖만) | `images/combat/arenas/duel_floor.jpg`(플레이 1600×896) / `lair_floor.jpg`(플레이 1792×896) | JPG 1920×1080 | P0 | — |
| 경기장 장애물 (기둥, 부서지는 바위 2상태) | `images/combat/arenas/pillar.png`(128×160), `breakable_rock.png`(128²) | PNG | P2 | — |
| 아이템 / 스탯·코인 / 효과 칩 | `images/items/{teleport,shield,thief}.png`(256²) / `images/ui/icons/{hp,atk,def,coin}.png`(128²) / `images/ui/icons/chip_{skip,item,mystery,maxhp}.png`(64²) | PNG | P0 | 아이콘 |
| 전투 스킬·대시 / 패시브 핍 (방패, 금화살, 깨진 방패, 회피, 광폭) | `images/combat/ui/skill_{job}.png`, `dash_{job}.png` ×5(128²) / `images/combat/ui/passive_{job}.png` ×5(96²) | PNG | P0 | 아이콘 |
| UI 프레임 9-slice: 금 세공(HUD·전투 HUD) / 찢어진 양피지(카드·토스트·연대기) | `images/ui/frames/frame_gold.png`, `frame_parchment.png` | PNG 96², 32px 슬라이스 | P0 | — |
| UI 프레임 9-slice: 나무판(독·버튼) / 진홍 가죽(용·위험·보스 바) | `images/ui/frames/frame_wood.png`, `frame_crimson.png` | PNG 96² | P1 | — |
| VS 마크 (라틴 문자라 이미지) / 한글 로고 "드래곤 러쉬" | `images/ui/vs_lockup.png`(512×256) / `images/brand/logo_ko.png`(1200×420, 금색 + 어두운 외곽선) | PNG | P0 | — |
| 영문 로고 / 타이틀 키아트 / 앱 아이콘 | `images/brand/logo_en.png`(1200×300) / `title_keyart.jpg`(1920×1080) / `app_icon.png`(512²) | PNG/JPG | P1 | — |
| HUD 장식: 이름 리본(회색조, 코드가 좌석색 틴트), 밀랍 도장, 브레스 룬석 꺼짐·켜짐, 라운드 다이얼, 연대기 롤러, 탈락 금, 해골·KO 도장 | `images/ui/ribbon_name.png`(192×48 9-slice), `wax_seal.png`(128²), `rune_stone_off.png`·`rune_stone_on.png`(64²), `round_dial.png`(160²), `chronicle_caps.png`(480×64), `crack_overlay.png`(640×232), `skull_stamp.png`·`ko_stamp.png`(256²) | PNG | P1 | — |
| 동굴 카드 뒷면(용 인장)·좋음/나쁨 앞면 틀 | `images/cards/card_back.png`, `card_frame_good.png`, `card_frame_bad.png` | PNG 512×720 | P1 | — |
| 동굴 카드 그림 10종 | `images/cards/mystery/{hidden_gold,gem_vein,ancient_relic,healing_spring,giant_blessing,lost_bag,cave_in,goblin_trick,bat_swarm,lost_in_dark}.png` | PNG 512×400 | P1 | — |
| 대화창 소품: 상점 노점 / 수련장 모루 / 동굴 입구 | `images/props/shop_stall.png`(1280×720), `anvil.png`(512²), `cave_mouth.png`(1024×768) | PNG | P1 | — |
| 클릭 소품 보물 더미 / 상점 상인 흉상 | `images/props/coin_hoard.png`(256²), `merchant.png`(512²) | PNG | P2 | — |
| VFX 시트: 불꽃(브레스·화염구) / 연기 / 불의 고리 벽 / 불타는 바닥 루프 / 코인 회전 / 반짝임 | `images/vfx/fire_puff.png`(128²×8), `smoke_puff.png`(128²×6), `flame_column.png`(96×160×8), `burning_floor.png`(128²×4), `coin_spin.png`(64²×8), `sparkle.png`(64²×4) | PNG 스트립 | P1 | — |
| VFX 데칼·룬: 그을음 3, 균열 2, 메테오·관통 룬 고리 | `images/vfx/scorch_01..03.png`, `crack_01..02.png`, `rune_ring.png` | PNG 256² | P1 | — |

- 전투 프레임 태그(직업당 약 33~41프레임): 공통 idle 4(8fps 루프)·run 6(12fps)·dash 3·hit 2·death 6 + 검사 atk 4/4/5·패링 3·반격 4, 궁수 draw 3(마지막 유지)·release 2·volley 4, 마법사 cast 4·meteor 5, 닌자 stab 3/3·kunai 3, 광전사 windup 3·swing 3·whirlwind 4(루프). 프레임 길이는 combat-design 프레임 데이터를 따른다.
- **파일 없이 코드로 만드는 것**(요청하지 않음): 10칸 룰렛 휠, 분류 보석·효과 칩·HP 바·버튼·턴 순서 코인, 좌석 문장·발 링, 스포트라이트·비네트·둥지 빛, 예고 데칼, 타격 불꽃·충격 링·먼지·색종이·불씨·방패 파편, 베기 궤적, 피격 섬광 실루엣·잔상, 발톱 와이프, 피해 숫자·배너·카운트다운, 키캡 힌트·키보드 테스트, 그림자, 아이템·스탯 카드(카드 틀 + 아이콘 조합).

**효과음 164개** (P0 106 / P1 47 / P2 11). 표의 길이는 파일당 권장 길이.

| 폴더 | 파일 — 용도 (길이) | 우선 |
|---|---|---|
| `audio/sfx/ui/` | `ui_click_01..03` 버튼(50~80ms) · `ui_open` 패널·서랍 열림(0.2~0.35s) · `ui_deny` 불가·코인 부족(0.15~0.25s) · `turn_start` 내 차례 고정 차임, 자막(0.6~0.9s) · `count_tick` 카운트업 틱(20~40ms, 절차 가능) | P0 |
| `audio/sfx/ui/` | `ui_hover_01..02` 호버 −12dB(30~50ms, 절차 가능) · `ui_close` 닫기(0.15~0.25s) · `ui_confirm` 밀랍 도장(0.25~0.4s) / P2: `toast` 종이 넘김(0.12~0.2s) | P1 (P2) |
| `audio/sfx/board/` | `dice_land_01..03` 펠트에 딱(0.1~0.25s) · `dice_result` 결과 고정 차임(0.3~0.5s) · `pawn_hop_01..04` 칸마다 나무 톡(60~120ms) · `tile_good` 좋은 칸 차임(0.5~0.8s) · `tile_bad` 나쁜 칸 둔탁음(0.4~0.7s) · `coin_gain_01..03` 코인 HUD 도착(80~150ms) · `coin_loss` 코인 흩어짐(0.3~0.5s) | P0 |
| `audio/sfx/board/` | `hp_heal` 회복(0.5~0.8s) · `hp_damage_01..02` 이벤트 피해(0.2~0.4s) · `stat_up` 수련장·대장간 망치(0.4~0.7s) · `card_flip_01..02` 카드(0.15~0.25s) · `item_teleport`(0.5~0.8s) · `item_shield` 방어막·결투 취소(0.4~0.7s) · `item_thief` 낚아챔(0.3~0.5s) · `item_use`(0.2~0.4s) · `duel_clash` VS 충돌, 더킹(0.8~1.2s) · `elimination` 탈락 낮은 쿵(1~1.5s) | P0 |
| `audio/sfx/board/` | `dice_rattle` 누르는 동안 덜그럭, 루프 가능(0.3~0.6s) · `dice_throw`(0.15~0.25s) · `pawn_land` 마지막 착지(0.15~0.25s) · `shop_bell`(0.4~0.7s) · `purchase`(0.4~0.6s) · `inn_rest` 여관 회복(1~1.5s) · `cave_enter` 동굴 울림(0.6~0.9s) · `mystery_good`·`mystery_bad`(0.5~0.8s) · `pass_start` 출발 보너스(0.8~1.2s) · `claw_wipe` 보드→전투 전환(0.25~0.4s) | P1 |
| `audio/sfx/board/` | `skip_turn` 쉬는 턴(0.4~0.6s) · `dice_six` 6 특별 차임(0.5~0.7s) · `dragon_snort` 둥지 용 클릭(0.6~0.9s) · `hoard_jingle` 보물 클릭(0.4~0.6s) · `chronicle_open` 두루마리(0.3~0.5s) | P2 |
| `audio/sfx/combat/` | `fight_ready` 준비 카운트(0.1~0.2s) · `fight_go` "싸워라!" 징(0.8~1.2s) · `dash_01..03`(0.15~0.25s) · `swing_light_01..03`(0.1~0.2s) · `swing_heavy_01..03`(0.25~0.4s) · `hit_light_01..04` 접촉 프레임(80~150ms) · `hit_heavy_01..03`(0.2~0.35s) · `evade_01..02` 회피(0.2~0.3s) · `parry_01..03` 패링 쨍(0.2~0.4s) · `ko` 더킹(0.8~1.2s) · `result_win`·`result_lose` 결과 카드(1.5~2.5s) | P0 |
| `audio/sfx/combat/` | `hit_sub_01..02` 강타 저역 레이어(0.15~0.3s) · `wall_slam_01..02` 벽 충돌(0.2~0.3s) · `heartbeat_loop` 저체력(0.8~1s 루프) · `fire_ring_start` 고리 수축 시작, 자막(1s) · `fire_ring_loop`(2~4s 루프) · `timer_warn` 마지막 5초(80~120ms, 절차 가능) / P2: `footstep_01..04`(40~80ms) | P1 (P2) |
| `audio/sfx/jobs/` | 검사 `sword_parry_stance`(0.25~0.35s), `sword_counter`(0.25~0.4s), `sword_last_stand` 불굴(1~1.5s) · 궁수 `bow_draw` 36f 당김(0.6s), `arrow_release_01..03`, `arrow_impact_01..03`(각 0.1~0.2s) · 마법사 `mage_bolt_cast_01..02`, `mage_bolt_impact_01..02`(각 0.2~0.3s), `mage_meteor_mark` 표식 30f(0.5s), `mage_meteor_explode_01..02`(0.8~1.2s) | P0 |
| `audio/sfx/jobs/` | 닌자 `ninja_stab_01..03`(80~150ms), `ninja_kunai_throw_01..02`(0.1~0.2s) · 광전사 `zerk_axe_swing_01..02`, `zerk_axe_impact_01..02`(각 0.3~0.45s), `zerk_rage` 광폭 포효(1~1.5s) | P0 |
| `audio/sfx/jobs/` | `sword_thrust_01..02`(0.2~0.3s) · `archer_volley`(0.3s) · `first_strike` 금화살(0.4~0.6s) · `mage_blink`, `mage_pierce` 관통(각 0.2~0.3s) · `ninja_kunai_hit_01..02`(0.1s) · `ninja_shadow_step_01..02`(0.15~0.25s) · `zerk_whirlwind_loop`(0.6s 루프) · `zerk_charge`(0.3~0.5s) / P2: `archer_backstep`(0.2s) | P1 (P2) |
| `audio/sfx/dragon/` | `roar_01..02` 도전·페이즈 전환, 더킹(2~3s) · `claw_swipe_01..02`(0.3~0.5s) · `tail_sweep_01..02`(0.5~0.7s) · `fireball_launch_01..02`(0.3~0.5s) · `fireball_impact_01..03`(0.5~0.8s) · `charge_windup` 증기(0.8s) · `charge_run_loop`(1s 루프) · `wall_crash` 벽 충돌·기절(1~1.5s) · `breath_charge` **브레스 예고 고정음**, 자막 "용이 숨을 들이쉰다!"(0.6~0.8s) · `breath_loop`(1.2s 루프) · `hurt_01..03`(0.3~0.5s) · `death`(3~4s) | P0 |
| `audio/sfx/dragon/` | `claw_windup`(0.4~0.6s) · `tail_windup`(0.5s) · `burning_floor_loop`(2s) · `stunned_loop`(1.5s) · `gust` 날개 돌풍(1~1.5s) · `breath_end`(0.4~0.6s) · `dive_takeoff`(1s) · `dive_whistle` 그림자 고정(0.5s) · `dive_land`(1~1.5s) · `weakpoint_hit` 머리 약점(0.3s) · `growl_idle_01..02` 대기·둥지(2~3s) | P1 |

- 용의 공격은 모두 **고유한 예고 소리**를 가진다(예고 3겹 중 하나). 타격음은 순간음 + 몸통 + 꼬리로 레이어링하고, 자주 나는 소리는 같은 세션에서 변형을 녹음한다.
- 이전 이름 대응은 `apps/web/src/fx/audio/soundCatalog.ts`의 `soundFileCandidates()` 별칭으로 구현했다(2026-11-12). 파일을 `public/assets/` 아래 표의 경로에 놓으면 자동으로 절차 효과음을 대체한다. 예: `dice_roll` → `board/dice_land_01`, `move_step` → `board/pawn_hop_01`, `attack_hit` → `combat/hit_light_01`, `coin` → `board/coin_gain_01`, `upgrade` → `board/stat_up`, `item_use` → `board/item_use`, `shield` → `board/item_shield`, `dragon_breath` → `dragon/breath_loop`, `victory`·`defeat` → `bgm/stinger_victory`·`stinger_defeat`.

**음악 8개 + 환경음 3개**
현재 로비·보드는 제공받은 `audio/bgm/menu.mp3`, PvP·PvE·용전은 `battle.mp3`를 사용한다. 승리 결과에는 제공받은 `triumph_of_the_hero.mp3`(Triumph of the Hero), 패배·무승부에는 프로젝트에서 제작한 `result_defeat.mp3`·`result_draw.mp3`를 사용한다. 출처와 재생성 범위는 `apps/web/assets/audio/README.md`에 기록했다. 모두 음악 버스와 음소거 설정을 공유한다. 아래의 추가 장면별 음악은 선택적 교체 목록이다.
| 용도 | 경로·파일명 | 길이·규격 | 우선 |
|---|---|---|---|
| 보드 진행 루프 (따뜻한 선술집 판타지, 현악·가벼운 타악) | `audio/bgm/board.mp3` | 2~3분 이음매 없는 루프, 90~100 BPM | P0 |
| PvP 결투 루프 (몰아치는 타악·금관) | `audio/bgm/duel.mp3` | 60~90초 루프, 140~160 BPM | P0 |
| 용전 루프 (기존 이름) | `audio/bgm/dragon_battle.mp3` | 90~120초 루프 | P0 |
| 결과 화면 승리·패배·무승부 루프 (구현) | `audio/bgm/triumph_of_the_hero.mp3` / `result_defeat.mp3` / `result_draw.mp3` | 제공받은 승리곡 119.736초 / 자체 제작 패배곡 21.8초 / 무승부곡 18.5초 | 완료 |
| 게임 승리 / 패배·탈락 스팅어 (이전 `victory`/`defeat`) | `audio/bgm/stinger_victory.mp3` / `stinger_defeat.mp3` | 4~8초 / 3~5초 | P0 |
| 루프 지점 (선택) | `audio/bgm/loops.json` — `{ "menu.mp3": { "loopStart": 초, "loopEnd": 초 } }` | JSON; 제공받은 파일은 현재 전체 길이를 반복 | P0 |
| 타이틀·로비 루프 (기존 이름) / 다른 플레이어 탈락 스팅어 | `audio/bgm/lobby.mp3` / `stinger_elimination.mp3` | 1.5~2.5분 루프 / 2~3초 | P1 |
| 용전 3페이즈 강화 스템 (박자 맞춤) | `audio/bgm/dragon_battle_p3.mp3` | `dragon_battle`과 같은 길이·템포 | P2 |
| 보드 실내 환경음 (벽난로, 먼 바람) | `audio/ambience/hall_fire.mp3` | 30~60초 루프 | P1 |
| 용암 웅웅 (둥지·용 경기장) / 결투 경기장 바람 | `audio/ambience/lair_lava.mp3` / `arena_wind.mp3` | 30초 루프 | P2 |

- 조달 권장: P0 아이콘은 game-icons로 바로 시작 → 직업 5종(초상화·스탠디·전투 시트)은 한 작가 → 용(둥지 상태 + 컷아웃 리그)은 한 작가 → 텍스처·바닥은 라이브러리 + 팔레트 색보정. 전투 시트는 idle·run·attack·hit·death를 먼저(플레이 가능), 그다음 skill·dash. 그림이 오기 전에는 색 원 + 베기 VFX로 프레임 데이터를 조정한다.

### 4.3 리스크와 대응
| 리스크 | 영향 | 대응 |
|---|---|---|
| 사용자 모델 포맷·수치 정밀도 불일치 | 패리티 실패 | 샘플 입출력과 허용 오차를 미리 합의, 필요하면 float64 forward, 차이는 어댑터 안에서만 흡수 |
| 동결 후 관측·행동 변경 | 재학습 필요 | 동결 체크포인트(D3, D15), 변경은 새 버전으로만, 골든 테스트 |
| 온라인 동기화 경합·재접속 버그 | 이중 적용 | `submit` 단일 경로 + `stateVersion`, fake timer 통합 테스트 |
| 전투 sim의 브라우저 간 비결정 | 리플레이·온라인 예측 깨짐 | 초월함수 금지 lint, Q8·BAM 정수 수학, 3개 브라우저 골든 해시, 1만 판 퍼즈 |
| 온라인 전투 지연·TCP 손실 | 타격감 저하 | 예측 + 재시뮬, 넉넉한 예고(≥ 24f), 네트워크 에뮬 테스트, 필요 시 지연 보정 |
| 실시간 전투로 게임이 길어짐 | 7~10분 초과 | 현행 상한은 결투 45초·용전 60초(3,600틱), 소프트 격노는 20초(1,200틱). 현행 300판 봇 표본의 예상 평균은 보드 턴당 10초 가정 시 7.70324분; 사람 경기 시간은 별도 측정 |
| 전투 모델 품질·지연 | 봇 전투가 약하거나 이상함 | 스크립트 봇 기본값, 셀프플레이에 스크립트 10% 유지, Elo 평가, 난이도 = 지연·temperature |
| 에셋 규모(전투 시트 약 176프레임) | 일정 지연 | `절차`·`아이콘` 대체, 프레임 우선순위, 플레이스홀더 출시 가능 |
| env 처리량 부족 | 학습 속도 저하 | 배치 env, 프로세스 여러 개, 처리량 DoD 측정 |

### 4.4 작업 운영 (상세는 [coding_convention.md](../coding_convention.md))
- **브랜치**: `main`에는 직접 커밋하지 않는다. `feature/xxx`, `bugfix/xxx`, `docs/xxx`, `chore/xxx`. 작업이 끝나면 `main`에 병합한다.
- **커밋**: 영어 Conventional Commits(예: `feat(engine): resolve shield decision order`). 테스트와 구현은 같은 커밋에 둔다.
- **Phase 단위 진행**: DoD를 충족하면 결정·승인이 필요한 항목만 보고하고 다음 Phase로 간다. 대규모 구조 변경은 착수 전에 범위와 이유를 브리핑하고 승인받는다.
- **TDD**, **문서 동기화**(구조·라이브러리·명령이 바뀌면 AI_README·README 갱신), **모호하면 질문**, 주석은 영어로 꼭 필요한 곳에만.

## 5. 2차 개발 (2026-11-12)
### 5.1 요구사항 → 문서
| # | 요구 | 정본 문서 |
|---|---|---|
| 1 | 게임 이름 "드래곤 러쉬" | 완료 (D10) |
| 2 | PC 보드게임 감성 리디자인 "Ember Table" | [art-direction.md](art-direction.md) §1~§10 |
| 3 | 타격감: 흔들림·히트스톱·효과음·VFX | [art-direction.md](art-direction.md) §11~§12 |
| 4 | 필요한 이미지·효과음 전체 목록 | §4.2 |
| 5 | PvP·용전 = 실시간 2D 탑다운 액션, 전투 AI는 보드 AI와 **별개 모델·별개 학습 환경** | [combat-design.md](combat-design.md), [combat-ai-spec.md](combat-ai-spec.md) |
| 6 | 한 판 7~10분 목표. 현행 전투 상한은 결투 45초·용전 60초(3,600틱), 용의 소프트 격노는 20초(1,200틱)부터 | [game-design.md](game-design.md)(밸런스 담당), combat-design §6·§7 |

### 5.2 Phase R1~R8
| Phase | 목표·산출물 | DoD |
|---|---|---|
| R1 이름 변경 | "드래곤 러쉬", `@dragon-rush/*` | **완료** (`chore/rename-dragon-rush`) |
| R2 보드 리디자인 | 글꼴·팔레트 토큰, 1.5fr 모서리 명판, 모서리 HUD, 토스트·연대기, game-icons SVG → CSS 3D 기울기·스탠디·홉·스포트라이트 → 1~10 룰렛 트레이·이벤트 카드·소품 대화창·둥지 상태 | UI에 규칙 코드 0, 기존 이벤트 예산 유지, 1280×720~1920×1080, 동작 줄이기 경로, Firefox 3D 정렬, 핫시트 1판 수동 체크 |
| R3 FX·오디오 | rAF FX 루프, trauma 흔들림, 파티클 풀, 피해 숫자, 코인 비행, FlashGovernor, 오디오 버스·더킹·변형, 접근성 설정, 주스 디버그 패널 | FX가 엔진·sim RNG 미사용(lint), juice off A/B, 프레임 독립, 섬광 제한 테스트 |
| R4 실시간 전투 sim + 봇 | `packages/combat`(60Hz·Q8·BAM, 직업 키트, 결투 규칙, 용 스크립트, 히트스톱·넉백), `packages/combat-ai` 스크립트 봇, 로컬 핫시트 결투·용전 화면(도형 + 경기장 P0 FX), 키보드 테스트 | 골든 리플레이 해시 Node + Chromium·Firefox·WebKit 일치, 1만 판 퍼즈, 프레임 데이터·피해 표 테스트, 현행 45초·60초 상한 |
| R5 보드↔전투 통합 + 온라인 | 엔진 `COMBAT` phase(`combat.mode: 'external'`) 연결, 로컬·온라인 매치업, 서버 60Hz 전투 루프·`fight:*` 메시지·예측·재시뮬, AI 대행, 전투 리플레이, `PROTOCOL_VERSION` 2 | 소켓 통합 테스트(150ms RTT·20ms 지터·1% 손실), `FightSync` 재접속, 관전자 보간, `dice` 모드 골든 유지 |
| R6 전투 학습 환경 | `cobs_v1`/`cact_v1`, 별도 `CombatVecEnv`, 보드 env(`rpgboard-env/2`)의 기본 `sim`·선택형 `dice` 리졸버 | 전투 정책 가중치·패리티 어댑터(D13)는 사용자 포맷 대기. 과거 결과 예측기는 사용자 요청으로 제거됨 |
| R7 7~10분 밸런스 | 과거 `rush-2` 실시간 4인 밸런스·전투 시간 측정 | **역사적 측정**: 8,000판 중앙 8/p95 11라운드, 용 처치 종료 61.3%, 직업 승률 22.1~29.1%. 중앙 9~11 목표 미달. 턴당 10초 가정 5.19분·14초 가정 6.90분; 사람 턴 미계측. 3인·2인 한계는 game-design §15 |
| R8 아트·오디오 통합 | §4.2 파일 배치, `loops.json`, 크레딧 화면(game-icons CC BY 3.0), 이모지 폴백 유지 | 누락 파일은 플레이스홀더로 동작·오류 0, 라이선스 목록 |

**구현 현황(2026-11-12):** R1~R5의 보드·FX·실시간 전투·온라인 롤백 경로가 동작한다. `combat-2` balanced 봇의 반응 10f/16f 합산 상성 방향 10개는 과거 매 틱 입력에서 통과했지만 목표 우세 강도와 5f 일부 방향은 미달이다. UI Easy/Hard는 별도 스타일이다. 가상 TCP 시험의 최종 해시는 일치하나 손실 있는 150~250ms에서 롤백 깊이 목표는 미달이다. R6의 분리된 보드/전투 env는 동작하고 보드 env는 실제 60Hz 스크립트 전투 `sim`이 기본이다. 내부 결과 예측기는 제거됐으며 사용자 전투 정책 가중치·패리티 어댑터는 D13 대기다. 현행 `rush-11`/`combat-9` 1,000판 봇 표본은 [game-design.md §15](game-design.md)에 있다. 과거 R7의 4인 수치와 `rush-9`/`combat-5` 1,000판 측정은 현행 기준선이 아니다. 과거 `combat-3` 용전 balanced 봇 160시드/직업 비교는 [combat-design.md](combat-design.md)에 있으며 현행 용전의 직업별 교정은 아직 필요하다. 인게임 승률 예측은 표시하지 않는다.

- 순서: R2·R3(보드 표현)은 R4와 병행 → R4 → R5, R4 → R6 → ★D15 → 사용자 전투 학습 → D13 수령 → 전투 어댑터. R7은 R5 이후 실측으로 확정, R8은 파일이 오는 대로.

### 5.3 사용자 결정 항목 (2차)
| # | 항목 | 기본안 (답이 없을 때) | 필요 시점 |
|---|---|---|---|
| D12 | 에셋 납품 방식·순서·사용권 (§4.2) | P0 그림부터(직업 5종 디자인 묶음, 용, 경기장 바닥). 그 전에는 `아이콘`·`절차`·도형 플레이스홀더 | R2 시작, R8 |
| D13 | 전투 모델 가중치 JSON 포맷 + 패리티 샘플 (combat-ai-spec §11) | 받기 전까지 모델 전투원 "준비 중", 봇 전투는 스크립트 봇 | R6 이후 언제든 |
| D14 | 전투 봇 난이도 기본값 | Easy 16틱·T 1.3 / **Normal 10틱·T 1.0** / Hard 5틱·T 0.7, 기본 Normal, 온라인 AI 대행 Normal | R5 |
| D15 | ★ `cobs_v1`/`cact_v1` 동결 검토 | combat-ai-spec 그대로 동결, 이후 변경은 `cobs_v2`로만 | R6 종료 |
| D16 | 내부 전투 결과 예측기 | 이전 `outcome_v1` JSON·적합 CLI는 사용자 요청으로 제거. 보드 env 기본은 실제 `sim` 전투 | 제거 완료 |
