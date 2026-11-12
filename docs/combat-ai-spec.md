# 전투 AI 인터페이스 명세 — 드래곤 러쉬 (Dragon Rush)

> 상태: **구현됨 (2차 개발 Phase R6, 2026-11-12)** — `packages/combat-ai`(인코더·코덱·마스크·봇·모델 정책), `packages/sim`(`combat-env-server`, 보드 `combat_resolver`), `python/rpgboard_env`(`CombatEnv`·`CombatVecEnv`). `packages/combat`의 `COBS_V1_LAYOUT`·`COBS_V1_SCALES`·`CACT_V1_NAMES`와 combat env 서버 `info` 응답이 정본이며, 이 문서가 다르면 코드에 맞춰 고친다. 처음 설계와 달라진 점은 각 절의 **[구현]** 표시로 적었다. 아직 없는 것: `model:<id>` 상대·`sim:<model>`/`outcome` 리졸버·전투 패리티 검사(사용자 가중치 포맷 수령 후), outcome 모델(§12).
> 이 문서가 **전투 관측(`cobs_v1`)·행동(`cact_v1`)·마스크·보상·combat env 서버 프로토콜·`CombatVecEnv`·전투 모델 통합 계약·보드 env의 `combat_resolver`의 정본**이다. 보드 AI는 [ai-interface-spec.md](ai-interface-spec.md), 전투 규칙·수치는 [combat-design.md](combat-design.md)(구현 후 `DEFAULT_COMBAT_RULES`).

## 1. 범위와 역할 분담
| 영역 | 우리 (게임 저장소) | 사용자 |
|---|---|---|
| `cobs_v1`·`cact_v1`·마스크·보상 정의 | ✅ 이 문서 + `packages/combat-ai` (TS 단일 구현) | 읽고 사용 |
| 학습 환경 | ✅ `combat-env-server`(보드 env와 **별도 프로세스**) + `CombatVecEnv`(`python/rpgboard_env`, numpy만) | 호출 |
| 트레이너·가중치 포맷 | ❌ 만들지 않음 (정보만 요청, §11) | ✅ numpy Actor-Critic |
| 게임 내 실행 | ✅ `CombatPolicyModel` + 사용자 포맷 어댑터(수령 후), `CombatModelPolicy`, 스크립트 봇 | 가중치·패리티 샘플 |
| 용 보스 | ✅ 결정적 스크립트 (학습 대상 아님) | — |
| outcome 모델 (§12) | ✅ 전투 데이터 생성 도구. 적합(fit) 도구 위치는 결정 항목(development-plan D16) | 결정 |

- **보드 모델과 전투 모델은 별개**다. 관측·행동·env 프로세스·가중치 파일이 모두 다르고, 한 번에 하나만 학습한다(§10). 보드 `obs_v1`/`act_v1`은 바뀌지 않는다.
- 인코더·코덱·마스크는 TS에만 있다. Python은 env가 준 벡터를 그대로 쓴다. 학습 관측 = 게임(브라우저·서버) 관측.
- 전투 모델이 없거나 어댑터가 아직 없으면 봇 전투원은 **스크립트 봇**으로 싸운다. 게임은 모델 없이도 끝까지 동작한다.
- **[구현]** 스크립트 봇은 `@dragon-rush/combat`의 직업 인식 봇 하나에 성향 3개(`balanced`·`aggressive`·`cautious`)다(처음 안의 rusher·kiter·turtle 대신). env·리졸버 이름은 `scripted:balanced|aggressive|cautious|idle|random|pool`(`COMBAT_BOT_NAMES`): `idle` = 가만히 있는 더미(커리큘럼 0단계), `random` = 마스크 안 균등 무작위 행동을 4틱 유지, `pool` = 에피소드마다 앞의 세 성향 중 하나.

## 2. 버전·상수
| 상수 (`packages/combat-ai`) | 값 | 의미 |
|---|---|---|
| `COBS_VERSION` / `COBS_DIM` | `"cobs_v1"` / **160** | 관측 레이아웃·정규화 |
| `CACT_VERSION` / `CACT_NVEC` / `CACT_FLAT_DIM` | `"cact_v1"` / **[9, 4]** / **36** | 행동 ↔ 입력 마스크 매핑 |
| `COMBAT_ENV_PROTOCOL` (`packages/sim`) | `"rpgboard-combat-env/1"` | combat env 메시지 형식 |
| `combat_rules_version` + `combat_rules_hash` | `DEFAULT_COMBAT_RULES.version`(현재 `"combat-1"`) + `hashCombatRules`(규칙 JSON의 FNV-1a 32비트) | 전투 수치 식별 |

- 버전 정책은 보드와 같다([ai-interface-spec.md §2](ai-interface-spec.md)): 인덱스·길이·정규화·의미가 바뀌면 `cobs_v2`처럼 올리고, 기존 인덱스의 의미를 재사용하지 않는다. 수치(`DEFAULT_COMBAT_RULES`)만 바뀌면 버전은 그대로이고 `combat_rules_version`·hash가 바뀐다.

## 3. 결정 타이밍·반응 지연
- sim은 60Hz. 두 좌석은 **4 라이브 틱마다 동시에** 결정한다(`action_repeat` 4, 초당 15회). 히트스톱(전역 정지) 틱은 세지 않으며, 정지 중에는 결정을 요청하지 않는다.
- 이동은 창(4틱) 내내 유지한다. 버튼은 레벨로 유지하고, 직전 결정과 다를 때만 누름 에지가 생긴다(같은 버튼 유지 = 홀드, 예: 궁수 당기기). 같은 버튼을 다시 누르려면 한 창 동안 `none`을 고른다. 연타는 동작 중 입력이 예약되므로(combat-design §2.1) 4틱 주기로 충분하다.
- **`actionable = false`**: 그 좌석이 창 전체 동안 경직·잠긴 회복 상태라 행동이 무시된다. 트레이너는 그 스텝을 저장하지 않고 보상을 다음 저장 스텝에 더한다(data skipping). 할인은 `γ^(k/4)`(k = `ticks_elapsed` 누적 라이브 틱).
- **반응 지연**: 관측은 `delay`틱 전 상태의 링 버퍼에서 만든다. `delay`는 에피소드마다 좌석별로 U[4, 18]에서 뽑고 관측에 `delay/18`로 넣는다(한 정책이 모든 난이도를 처리). 마스크와 직전 행동 one-hot만 현재 값이다. 에피소드 시작 시 버퍼는 첫 상태로 채운다.
- 실전 난이도(사용자 결정 D14, 기본안): Easy 16틱·temperature 1.3(이전 체크포인트 사용 가능) / **Normal 10틱·1.0** / Hard 5틱·0.7. Normal은 결정 지연 평균 2틱을 더해 약 200ms로 숙련 게이머 반응과 비슷하다. (`COMBAT_DIFFICULTY`)
- **[구현] 창 진행**: 결정 시점은 항상 라이브 틱(`hitstop = 0`)이다. env는 입력을 고정한 채 라이브 4틱을 진행하고, 그 뒤에 이어지는 정지 틱까지 마저 진행한 다음 결정을 묻는다. 정지 틱 동안에도 같은 입력이 유지된다.
- **[구현] `actionable = false`의 정의**: KO이거나, 경직(hitstun)이 `max(입력 버퍼 6, action_repeat)` 라이브 틱보다 오래 남은 경우. 이때 env는 받은 행동 대신 **입력 없음**(이동 0, 버튼 놓음)을 적용하고 직전 행동을 `none`으로 기록하므로, 그 스텝을 건너뛰어도 정확하다(버튼 홀드 상태도 남지 않는다). 다른 잠금(긴 회복·회오리 등)은 이동·방향 입력이 일부 반영되므로 `actionable = true`로 둔다.
- **[구현] 지연 링 버퍼**: `StateHistory`(용량 = 최대 지연 + 1)에 틱마다(정지 틱 포함) 불변 상태를 넣고 `delay`틱 전 상태를 인코딩한다. 게임 내 `CombatModelPolicy`도 같은 버퍼·창·입력 없음 규칙을 쓴다.

## 4. 관측 `cobs_v1` (float32[160])
**공통 규칙**
- 결정 좌석 시점. 상대 위치는 자기 기준이지만 **축 정렬(회전 없음)** 이다. 행동이 월드 방향이라 회전 관측과 섞으면 학습이 어렵다. 회전 대신 미러 증강을 쓴다.
- 스케일 `n(x,S) = clip(x/S, 0, 2)`, 부호 `s(x,S) = clip(x/S, −1, 1)`, 원-핫·플래그 {0,1}, sin/cos = BAM 테이블 Q14 값/16384. 거리는 정수 `isqrt`.
- `COBS_V1_SCALES`: `W` 경기장 폭(PvP 800, 용 896) · `H` 448 · `V_S` 720px/s · `PV_S` 960px/s · `HP_S` 100 · `STAT_S` 20 · `T_S` 60틱 · `R_S` 64px · `RING_S` 460 · `DELAY_S` 18 · `HITSTUN_S` 30.
- **미러 증강**(`mirror: true`): 에피소드마다 x·y 반전을 무작위로 정하고 env가 관측과 행동을 함께 변환한다. 사용자는 따로 처리할 필요가 없다(`episode_start.mirror`로 확인).
- 비어 있는 부분은 0: PvP의 용 블록, 쓰지 않는 위협 슬롯, 용전의 고리 반지름. 용전에서는 상대 블록이 용이다(`type` = dragon).
- **[구현] 세부 정의** (`packages/combat-ai/src/obs/encode.ts`):
  - `W`·`H`는 상태의 경기장 크기(`arenaW`·`arenaH`)를 읽는다. 속도는 "보이는" 속도다: 이동 속도 + 남은 넉백 + 대시 이동(px/s). `opp.motion`의 속도는 **상대 속도 − 내 속도**다.
  - 진행률: 기술 = moveTick/전체 길이(활 당기기는 당긴 틱/36), 대시 = moveTick/대시 길이, 경직 = 1 − 남은 경직/30, idle·move = 0. 연타 단계는 직업 공격의 `next` 사슬에서의 위치(검사 0/1/2, 닌자 0/1).
  - `opp.moveKind`: 스킬 상태 = skill, 공격 중 위력 P ≥ 1.5(`hitstop.heavyMinPower`) = heavy, 그 외 = light. 용: 발톱·꼬리 = light, 돌진·브레스·강하 = heavy, 화염구·돌풍 = skill.
  - 용 상태 매핑: idle → idle, returning → move, telegraph → startup, active → active, recovery·roar(포효) → recovery, stunned → hitstun. `dragon.maneuver`는 기술이 정해져 있는 동안(예고·진행·회복·기절) 켜진다. `dragon.stage[1]` = n(브레스까지 남은 피해 기술, 2), `[2]` = 머리 숙임 플래그. `telegraphAim`은 예고 도형의 방향(브레스 진행 중에는 현재 휩쓸기 각도), 원형 예고면 0.
  - 위협: 모든 투사체·지면 위험(내 것은 `hostile` 0으로 포함)과 용의 예고·진행 중 기술 도형(돌풍은 피해가 없어 `hostile` 0). 선(돌진)은 반지름 자리에 반폭을 넣는다. 정렬 키: 적대 우선 → (투사체) 최근접 도달 틱 / (지역) 유효까지 남은 틱 → 거리.
  - 미러: 용전에서는 **x 반전만** 쓴다(y 반전은 실전에 없는 "용이 아래" 상태를 만들기 때문). `mirrorCombatObservation(obs, mirror)`가 벡터 수준 변환(인볼루션)이고, `encodeCombatObservation(s, side, {…, mirror})`와 결과가 같다.

**자기 블록** — offset 0, 길이 36
| off | len | 이름 | 인코딩 |
|---|---|---|---|
| 0 | 4 | `self.stats` | [hp/maxHp, n(maxHp, HP_S), n(atk, STAT_S), n(def, STAT_S)] |
| 4 | 5 | `self.job` | one-hot [swordsman, archer, mage, ninja, berserker] |
| 9 | 7 | `self.state` | one-hot [idle, move, startup, active, recovery, dash, hitstun] |
| 16 | 2 | `self.stateInfo` | [현재 상태 진행률 0~1, 연타 단계/2] |
| 18 | 4 | `self.cooldowns` | [스킬 남은 쿨다운/전체, 대시 남은 쿨다운/전체, 스킬 충전/최대, 대시 충전/최대] (충전 없는 기술은 사용 가능 1/0) |
| 22 | 8 | `self.flags` | [무적, 슈퍼 아머, 불굴 가능(검사 ∧ 미사용), 광폭, 선제 대기(궁수 ∧ 아직 명중 없음), 당김 틱/36, 회피 카운터/7, 대시 남용 중첩/2] |
| 30 | 2 | `self.vel` | [s(vx, V_S), s(vy, V_S)] |
| 32 | 2 | `self.facing` | [sin, cos] |
| 34 | 2 | `self.pos` | 경기장 중심 기준 [s(x−cx, W/2), s(y−cy, H/2)] |

**상대 블록** — offset 36, 길이 38 (블록 내부 r, 절대 offset = 36 + r)
| r | len | 이름 | 인코딩 |
|---|---|---|---|
| 0 | 3 | `opp.rel` | [s(dx, W), s(dy, H), n(거리, W)] |
| 3 | 4 | `opp.motion` | [상대 속도 s(dvx, V_S), s(dvy, V_S), facing sin, cos] |
| 7 | 4 | `opp.stats` | [hp/maxHp, n(maxHp, HP_S), n(atk, STAT_S), n(def, STAT_S)] |
| 11 | 6 | `opp.type` | one-hot [swordsman, archer, mage, ninja, berserker, dragon] |
| 17 | 8 | `opp.state` | one-hot 7 (자기 블록과 같은 순서, 용은 예고 = startup·기절 = hitstun) + 진행률 |
| 25 | 4 | `opp.moveKind` | one-hot [none, light, heavy, skill] |
| 29 | 6 | `opp.flags` | [무적, 슈퍼 아머, 불굴 가능, 광폭, 회피 카운터/7, 선제 대기] |
| 35 | 3 | `opp.ready` | [스킬 사용 가능, 대시 사용 가능, n(남은 경직, HITSTUN_S)] |

**용 블록** — offset 74, 길이 15 (PvP에서는 0)
| off | len | 이름 | 인코딩 |
|---|---|---|---|
| 74 | 3 | `dragon.phase` | one-hot [1, 2, 3] |
| 77 | 7 | `dragon.maneuver` | 예고·진행 중 기술 one-hot [claw, tail, fireball, charge, gust, breath, dive] (없으면 0) |
| 84 | 3 | `dragon.stage` | [단계(예고·유효·회복) 진행률, 브레스까지 남은 피해 기술 수/2, 머리 숙임(약점)] |
| 87 | 2 | `dragon.telegraphAim` | 예고 방향 [sin, cos] (없으면 0) |

**위협 슬롯** — offset 89, 6슬롯 × 9 = 54. 슬롯 k의 시작 = 89 + 9k
| r | 내용 |
|---|---|
| 0~8 | [present, hostile(내게 피해), kind(0 투사체 / 1 지역: 예고 원·원뿔·선, 불타는 바닥, 메테오 표식, 불의 고리 밖은 제외), s(dx, W), s(dy, H), s(vx, PV_S), s(vy, PV_S), n(반지름, R_S), n(유효까지 남은 틱, T_S)] |

- 정렬: 적대 위협 먼저, 그다음 최근접 도달 시간(투사체) 또는 유효까지 남은 틱(지역) 오름차순. 7번째부터는 버린다. 원뿔·선은 시작점·반지름(도달 거리)으로 넣고 방향은 용 블록 `telegraphAim`으로 준다.

**전역 블록** — offset 143, 길이 17
| off | len | 이름 | 인코딩 |
|---|---|---|---|
| 143 | 4 | `g.match` | [남은 시간/제한 시간(결투 45초, 용전 75초), 용전 여부, 불의 고리 반지름/RING_S, delay/DELAY_S] |
| 147 | 9 | `g.prevMove` | 직전 결정의 이동 one-hot |
| 156 | 4 | `g.prevButton` | 직전 결정의 버튼 one-hot |

**검산**: 36 + 38 + 15 + 54 + 17 = **160 = `COBS_DIM`** (블록 시작 0 / 36 / 74 / 89 / 143, 마지막 156 + 4 = 160). 남은 시간을 넣는 이유: 제한 시간이 과제의 일부이면 시간 종료를 진짜 종료로 다루고 남은 시간을 관측에 넣는다(Pardo et al. 2018).

## 5. 행동 `cact_v1`
- **MultiDiscrete [9, 4]**: 이동 0 = 없음, 1 = N(위), 2 = NE, 3 = E, 4 = SE, 5 = S, 6 = SW, 7 = W, 8 = NW (화면 기준 시계 방향). 버튼 0 = none, 1 = attack, 2 = skill, 3 = dash.
- **flat Discrete 36** (`flat_actions: true`): `index = move·4 + button`. 사용자의 단일 softmax head Actor-Critic을 그대로 쓰려면 이쪽을 권장한다.
- 변환: 이동 → 7비트 입력의 up/down/left/right, 버튼 → 레벨(§3). 조준은 바라보는 방향 + 공용 소프트 조준 보정(사람과 동일). 사람보다 정밀한 상대 방향 이동·조준 오프셋은 일부러 넣지 않았다(행동 공간 동등성).
- 이름: `CACT_V1_NAMES = { move: [none, N, NE, E, SE, S, SW, W, NW], button: [none, attack, skill, dash] }`, flat 이름(`CACT_NAMES`)은 `"NE+attack"` 형식. env `info.action_names`(`move`·`button`·`flat`)로도 제공.
- **[구현]** 코덱: `toFlat`/`fromFlat`, `toFighterInput(action, prevInput) → { input, press }`(창 동안 유지할 7비트 입력 + 이번 창 첫 틱에 눌림 에지가 생기는 버튼, 같은 버튼 유지면 0), `mirrorMove`/`mirrorAction`(인볼루션). 이동 번호는 sim의 `MoveDir`와 같다.

## 6. 마스크
| 가지 | 규칙 |
|---|---|
| 이동 (9) | 항상 전부 1 (잠긴 동안은 무시될 뿐 불법이 아님) |
| 버튼 `none` | 항상 1 |
| `attack` / `skill` / `dash` | 쿨다운·충전·동작 잠금 때문에 **10틱(창 4 + 버퍼 6)보다 오래** 쓸 수 없으면 0. 회오리 같은 잠금 동안 `skill`은 0 |
| flat (36) | `mask[m·4 + b] = move[m] ∧ button[b]` |
| 비활성 슬롯 (용전의 두 번째 좌석) | `move 0`·`button 0`만 1 |

- 마스크는 현재 상태(자기 쿨다운)로 만든다. 마스크된 행동이 오면 env는 `ILLEGAL_ACTION`(원자적, 어느 env도 진행하지 않음). `actionable = false` 좌석의 행동은 마스크 안이면 받아서 무시한다.
- **[구현] 기준 10틱 → 입력 버퍼 6틱**: 버튼 레벨이 바뀌는 에지는 창의 **첫 틱**에 생기므로, 그 입력이 실제로 쓰일 수 있는 구간은 버퍼 6 라이브 틱뿐이다(`rules.inputBuffer`, 현재 상태가 정지 틱이면 5). 그래서 `combatActionMask`는 "그 버튼을 지금 누르면 6틱 안에 동작이 시작되는가"를 sim 규칙 그대로 계산한다(`buttonReadyIn`): 경직 남은 틱 + 1, 기술·대시 남은 길이, 연타 예약(`chainFrom`), 대시 공격 캔슬(`cancelFrom`), 활 발사 후 회복, 스킬·대시 충전 타이머. 활을 당기는 중(버튼을 아직 누르고 있음)에는 `attack`이 "계속 당기기"이므로 항상 1이다. 10틱 기준이면 7~10틱 뒤에야 쓸 수 있는 입력이 허용되어 그대로 버려지고, 다음 창에 같은 버튼을 고르면 홀드라 다시 눌리지도 않는다.
- 검증(`packages/combat-ai/test/mask.test.ts`): 스크립트 전투 7종의 모든 3틱마다 버튼별로 실제로 눌러 본다. 마스크 0이면 동작이 절대 시작되지 않고(약 5,800건), 마스크 1이고 그사이 맞지 않았으면 반드시 시작된다(약 2,000건).

## 7. 보상·종료
- **종단**: 승 +1, 패 −1. 무승부 없음(시간 종료도 결투는 HP 비율·동률은 도착자, 용전은 도전자 패배로 승패가 난다).
- **shaping**: `k · (Δ준 피해/상대 maxHp − Δ받은 피해/자기 maxHp)`, 스텝마다 [−1, 1]로 클리핑(종단 보상은 별도). k는 `k_start` 0.5 → `k_end` 0.1로 `anneal_decisions` 결정 동안 선형 감소(서버 프로세스가 결정 수를 센다. 권장: 전체 학습 결정 수의 25%). 피해 차이 보상은 Φ = HP%자기 − HP%상대인 potential 기반 shaping과 같아 최적 정책을 바꾸지 않는다.
- 시간 벌점·명중 보너스 없음. 접근 보너스(`approach`, 거리 감소량/W × 계수)는 커리큘럼 0단계에서만 쓴다(기본 0).
- **종료**: KO 또는 규칙 시간 종료(결투 45초, 용전 75초) → `terminated = true`. 안전 상한(규칙 시간의 2배) → `truncated = true`(부트스트랩).
- **[구현]** 피해는 현재(지연 없는) 상태의 HP 차이(0 아래는 0)로 잰다. 고리 피해도 받은 피해에 들어간다. k 감소용 결정 수는 서버 프로세스 전체에서 활성 슬롯의 결정을 센 값이고 reset으로 초기화하지 않는다. 종단 보상은 클리핑한 shaping 값에 더한다(그 스텝 보상은 [−2, 2]). `approach`는 클리핑 뒤에 더한다.

## 8. combat env 서버 프로토콜 (stdio JSON Lines)
- 실행: `node packages/sim/dist/combat-env-server.js` (= `pnpm combat-env-server`, 먼저 `pnpm build`). 보드 env 서버와 별도 프로세스이며, 메시지 형식은 보드와 같다([ai-interface-spec.md §7](ai-interface-spec.md)): 한 줄 요청 `{ id, cmd: info|reset|step|close, params? }` → `{ id, ok: true, result }` 또는 `{ id, ok: false, error: { code, message, env_index? } }`. stdout은 프로토콜 전용, 로그는 stderr. 오류 코드도 같다(`BAD_REQUEST`, `UNKNOWN_CMD`, `NOT_INITIALIZED`, `BAD_CONFIG`, `VERSION_MISMATCH`, `ILLEGAL_ACTION`, `EPISODE_OVER`, `INTERNAL`).
- **info**: `protocol`, `cobs_version`, `cact_version`, `cobs_dim` 160, `cact_nvec` [9,4], `cact_flat_dim` 36, `tick_hz` 60, `combat_rules_version`, `combat_rules_hash`, `obs_layout`, `action_names` (`move`·`button`·`flat`), `bots`(`scripted:balanced|aggressive|cautious|idle|random|pool`).
- **[구현] reset 결과**: `{ seed, n_ctrl, combat_rules_version, combat_rules_hash, envs }`(규칙을 덮어쓰면 hash가 달라진다).

**reset params**
| 키 | 타입·기본값 | 설명 |
|---|---|---|
| `num_envs`, `seed`, `encoding`, `auto_reset`, `expect` | 보드 env와 같음 | `expect`: `{cobs_version, cact_version, combat_rules_version?}`. 시드 = `splitmix64(seed, i, j)` |
| `config.controlled` | `"both"` \| `"p0"`, `"both"` | 외부 제어 좌석 수 `n_ctrl` = 2 / 1 |
| `config.opponent` | `"scripted:<name>"` \| `"external"`, `"scripted:pool"` | `p0`일 때 상대 좌석(이름은 §1). `external`은 `controlled: "both"`와만 쓴다(`p0`이면 `BAD_CONFIG`). **[예정]** `"model:<id>"` = `models/combat/<id>.json`(고정 사본, 셀프플레이용)은 어댑터가 생긴 뒤 추가 |
| `config.mode_mix` | `{pvp, dragon}`, `{pvp: 0.75, dragon: 0.25}` | 에피소드별 모드 확률 |
| `config.jobs` | `"uniform"` \| 좌석별 목록(직업 id 또는 `"uniform"`, 1~2개), `"uniform"` | 같은 직업 대결 허용. 목록이 1개면 두 좌석 모두에 적용 |
| `config.stat_sampler` | `"uniform_board"` \| `"start"` \| `"file:<path>"`, `"uniform_board"` | **[구현]** `uniform_board`: `rush-1` 직업 스탯 + 강화 단계 균등 표본(결투 ATK·DEF +0~6, maxHp +0~5단계×6, HP 35~100% / 용전 ATK·DEF +3~9, maxHp +2~7단계, HP 60~100% / 검사 불굴 남음 90%; 보드 휴리스틱 3000판 로그의 p5~p95를 덮도록 정함). `start`: 직업 시작 스탯. `file:<path>`: `stat_dist_v1` 파일(§10.3)에서 같은 직업·같은 전투 종류 표본 |
| `config.action_repeat` | int ≥ 1, 4 | §3 |
| `config.obs_delay` | `[min, max]` 또는 int, `[4, 18]` | §3 |
| `config.flat_actions` | bool, false | §5 |
| `config.reward` | `{k_start: 0.5, k_end: 0.1, anneal_decisions: 0, approach: 0}` | §7. `anneal_decisions` 0 = k 고정 |
| `config.dragon_curriculum` | `{hp_scale: [lo, hi], telegraph_scale: [lo, hi]}` \| null, null | 용전마다 범위에서 균등 표본(예: 시작 `[0.5,0.6]`/`[1.3,1.3]` → 끝 `[1,1]`/`[1,1]`) |
| `config.mirror` | bool, true | §4 (용전은 x만) |
| `config.rules` | `"default"` \| `DEFAULT_COMBAT_RULES` 부분 덮어쓰기 | 깊은 병합. 없는 키·다른 타입·배열 길이 불일치면 `BAD_CONFIG` |
| `config.return_events` | bool, false | 전투 이벤트 포함(디버그·리플레이) |

**step** — `{"actions": [...]}`: env마다 `[[move, button], …]`(n_ctrl개) 또는 flat이면 `[index, …]`. 모두 검증 후 하나라도 불법이면 아무것도 진행하지 않는다.

**env별 결과** (`result.envs[i]`, reset도 같은 형식)
| 키 | 설명 |
|---|---|
| `obs` | n_ctrl개 관측 (b64 float32 또는 숫자 배열) |
| `move_mask`, `button_mask` / `mask` | n_ctrl × 9, n_ctrl × 4 / flat이면 n_ctrl × 36 |
| `rewards`, `actionable`, `active` | 좌석별 보상, 행동 반영 여부, 슬롯 존재 여부(용전 두 번째 슬롯 = false) |
| `ticks_elapsed`, `tick`, `mode` | 이번 전이의 라이브 틱(보통 4), 전투 틱, `"pvp"`\|`"dragon"` |
| `terminated`, `truncated`, `outcome` | `null` 또는 `{winner: 0\|1\|"dragon", reason: "ko"\|"timeout"\|"cap", hp: [int, int\|null], last_stand_used: [bool, bool], dragon_hp?}` |
| `final_obs`, `episode_start` | 끝난 좌석의 종료 관측 `{"<slot>": obs}` / 새 에피소드 `{episode, seed, mode, jobs, stats, delay, mirror, opponent, dragon_hp_scale?, telegraph_scale?}` |

- **[구현] 자동 리셋 응답**: `rewards`·`terminated`·`truncated`·`outcome`·`final_obs`·`ticks_elapsed`는 끝난 에피소드, `obs`·마스크·`actionable`·`active`·`tick`·`mode`·`episode_start`는 새 에피소드를 가리킨다(보드 env와 같은 규칙). `auto_reset: false`(`num_envs` 1)면 종료 후 `step`은 `EPISODE_OVER`.
- **[구현] 슬롯**: 슬롯 0 = 전투원 a(도착자/도전자, 왼쪽), 슬롯 1 = 전투원 b. 반대편 시점은 x 미러 증강이 덮는다.

```json
{"id":1,"cmd":"reset","params":{"num_envs":2,"seed":7,"config":{"controlled":"both","flat_actions":true}}}
{"id":1,"ok":true,"result":{"envs":[{"obs":["AACAPw...","AACAPw..."],"mask":[[1,1,"..."],[1,1,"..."]],"rewards":[0,0],"actionable":[true,true],"active":[true,true],"ticks_elapsed":0,"tick":0,"mode":"pvp","terminated":false,"truncated":false,"outcome":null,"final_obs":{},"episode_start":{"episode":0,"seed":912,"mode":"pvp","jobs":["mage","ninja"],"stats":"...","delay":[9,15],"mirror":{"x":false,"y":true}}},{"...":"..."}]}}
{"id":2,"cmd":"step","params":{"actions":[[13,0],[5,32]]}}
```
- **결정성**: 같은 빌드·`(seed, config, actions 열)` → 바이트 단위로 같은 응답. 스크립트 봇·용·지연·미러 표본은 모두 에피소드 시드에서 파생한다.

## 9. Python API (`python/rpgboard_env`, numpy만)
```python
from rpgboard_env import CombatVecEnv
env = CombatVecEnv(num_envs=64, controlled="both", opponent="scripted:pool",
                   mode_mix={"pvp": 0.75, "dragon": 0.25}, jobs="uniform", stat_sampler="uniform_board",
                   action_repeat=4, obs_delay=(4, 18), flat_actions=False, reward=None,
                   dragon_curriculum=None, mirror=True, rules="default", return_events=False,
                   server_cmd=None, cwd=None, expect_cobs_version="cobs_v1",
                   expect_cact_version="cact_v1", timeout=60.0)          # 항상 auto_reset
obs, info = env.reset(seed=0)
obs, reward, terminated, truncated, info = env.step(actions)
```
| 값 | 형태 |
|---|---|
| `obs` | `float32 (N, n_ctrl, 160)` |
| `actions` (입력) | `int64 (N, n_ctrl, 2)`, flat이면 `(N, n_ctrl)` |
| `reward` | `float32 (N, n_ctrl)` |
| `terminated`, `truncated` | `bool (N,)` |
| `info["move_mask"]`, `["button_mask"]` / `["action_mask"]` | `bool (N, n_ctrl, 9)`, `(N, n_ctrl, 4)` / flat `(N, n_ctrl, 36)` |
| `info["actionable"]`, `["active"]` | `bool (N, n_ctrl)` |
| `info["ticks_elapsed"]` | `int64 (N,)` |
| `info["outcome"]`, `["final_obs"]`, `["episode_start"]` | 길이 N 리스트 |

- 속성: `obs_dim`(160), `action_nvec`((9, 4)), `flat_dim`(36), `n_ctrl`, `cobs_version`, `cact_version`, `combat_rules_version`, `combat_rules_hash`, `tick_hz`, `obs_layout`, `action_names`(`move`·`button`·`flat`), `bots`, `describe(obs)`.
- **[구현]** `CombatEnv(**같은 인자)`: 단일 env(자동 리셋 없음). 관측 `(n_ctrl, 160)`, 행동 `(n_ctrl, 2)` 또는 flat `(n_ctrl,)`, 보상 `(n_ctrl,)`, 종료 후 `step`은 `EPISODE_OVER`. 예제 `python/examples/random_combat_agent.py`(Gumbel-max 가지별 마스크 샘플링).
- 서버 커맨드: `server_cmd` > 환경변수 `RPGBOARD_COMBAT_ENV_CMD` > 기본 `node packages/sim/dist/combat-env-server.js`. 작업 폴더·예외(`RPGBoardEnvError`, `IllegalActionError`, `SERVER_NOT_BUILT`, `VERSION_MISMATCH`)는 `RPGBoardEnv`와 같다.
- 두 head 정책: 가지마다 마스크(−∞)를 적용한 softmax에서 따로 뽑고 log-prob은 합한다. 예: `m = sample(masked_softmax(logits[:9], info["move_mask"][i, s]))`, `b = sample(masked_softmax(logits[9:], info["button_mask"][i, s]))`.

## 10. 커리큘럼·학습 기본값 (권장값, 트레이너는 사용자 코드)
### 10.1 네트워크·하이퍼파라미터
- MLP 160 → 128 → 128 (tanh), 정책 head 9 + 4(또는 36) + value head. 직교 초기화 √2 / 0.01 / 1.0.
- 결정당 γ 0.99(15Hz에서 반감기 약 4.6초), 용전 비중이 크면 0.995. λ 0.95. 64 env × 2좌석 × 128스텝 롤아웃. 엔트로피 0.01, Adam ε 1e-5, 그래디언트 클립 0.5, 미니배치별 advantage 정규화.

### 10.2 커리큘럼·셀프플레이
| 단계 | 상대 | 다음 단계 조건 |
|---|---|---|
| 0 | `scripted:dummy` (+ `approach` 보너스) | 승률 > 90% |
| 1 | 스크립트 풀(rusher, kiter, turtle, random) + 용전 25%(`dragon_curriculum` HP·예고 배율 사용) | 각 상대에 승률 > 70% |
| 2 | 셀프플레이: 최신 70% / 과거 스냅샷 20%(10만 결정마다 저장, 창 20, 어려운 상대 우선) / 스크립트 10% | — |
- 50만 결정마다 고정 기준 집합과 상대당 200전으로 Elo 평가(시작 1200, K 16~32). 보상 합보다 Elo를 본다. 셀프플레이는 `controlled="both"`로 두 좌석에 서로 다른 가중치 사본을 넣으면 numpy만으로 된다.

### 10.3 스탯 분포·처리량
- `stat_dist_v1.json`: HeuristicBot 보드 1만 판(`dice` 리졸버)에서 전투마다 `(job, hp, maxHp, atk, def, lastStand)`를 로그해 만든다(`pnpm sim --games 10000 --log-fights <file>`).
  - **[구현]** 형식(`packages/sim/src/statDist.ts`, zod 검증): `{ "version": "stat_dist_v1", "rules_version", "resolver", "games", "fighters": [{ "kind": "duel"|"dragonFight", "job", "hp", "maxHp", "atk", "def", "indomitableAvailable" }] }`. 1만 판이면 약 3MB라 저장소에는 넣지 않고 필요할 때 만든다. env 기본값은 이 분포의 p5~p95를 덮는 `uniform_board`다(§8).
- 처리량 목표(벤치마크로 확인): sim 1틱 ≤ 5µs, env 프로세스당 ≥ 30k 결정/s(64 env 배치), numpy 포함 종단 ≥ 10k 결정/s. 코어당 프로세스 하나로 확장.
  - **[구현] 측정값**(개발 PC, Node 22, 64 env): sim 1틱 약 0.45µs(입력 없음)·1.8µs(스크립트 봇 2개 포함), 인코딩+마스크 약 1.1µs. env 서버 단독 `both` 약 7만 결정/s, `p0`(상대 스크립트 봇이 매 틱 판단) 약 4만 결정/s. numpy 예제 포함 종단 `both` 약 2만, `p0` 약 1.2만 결정/s. Vitest 벤치마크(`combatEnv.test.ts`)가 매 실행마다 값을 출력한다.

### 10.4 두 모델의 학습 순서
- 두 모델을 동시에 학습하지 않는다. 전투 모델을 고정한 채 보드 모델을 학습하고, 전투 모델을 다시 학습하면 outcome 모델을 다시 만든 뒤 보드 모델을 미세 조정한다.

## 11. 전투 모델 통합 계약
```ts
interface CombatPolicyModel { readonly meta: CombatModelMeta; forward(obs: Float32Array): Float32Array; value?(obs: Float32Array): number } // 출력 13(9+4) 또는 36
type CombatWeightAdapter = (raw: unknown) => CombatPolicyModel;             // 형식 오류 시 ModelFormatError
interface CombatModelMeta { id: string; cobsVersion: string | null; cactVersion: string | null; head: 'multi' | 'flat'; output: 'logits' | 'probs'; obsDim: 160 }
createCombatModelPolicy(model, { difficulty: 'easy' | 'normal' | 'hard'; temperature?: number; mode?: 'sample' | 'argmax' })
```
- **파이프라인**: 난이도 지연만큼 늦은 관측 → `forward` → 가지별 마스크 → temperature 샘플링(기본 `sample`) → `[move, button]` → 입력 마스크를 4틱 유지. 출력 길이 불일치·NaN·유효값 없음이면 그 결정만 스크립트 봇으로 대체하고 경고. 온라인은 서버, 오프라인은 브라우저에서만 추론한다(리플레이는 입력 저장이라 엔진 간 추론 결정성은 불필요).
- **[구현]** `createCombatModelPolicy(model, { difficulty?, temperature?, mode?, delay?, actionRepeat?, fallback?, onFallback? })`는 `CombatPolicy`(전투 하나당 하나, 상태 있음)를 돌려주므로 `runCombat`·서버·브라우저에서 스크립트 봇과 같은 자리에 꽂힌다. 내부는 env와 같은 `StateHistory`·창 진행·"actionable이 아니면 입력 없음" 규칙을 써서 학습과 실전이 같다. `selectCombatAction(out, mask, meta, opts, random)`이 마스크·argmax·샘플링만 따로 제공한다. 전투용 패리티 검사(`checkParity`의 전투판)는 어댑터와 함께 추가한다.
- **어댑터 자리**: `packages/combat-ai/src/model/adapters/index.ts`의 `USER_COMBAT_WEIGHT_ADAPTER`(포맷 수령 전 `null`, 모델 전투원은 "준비 중"). 보드 어댑터와 따로 둔다.
- **파일**: `models/combat/<name>.json`(`^[a-z0-9_-]+\.json$`, 서버 `COMBAT_MODELS_DIR` 기본 `models/combat`), 패리티 샘플 `models/combat/parity/<name>.json`. 보드 레지스트리는 `models/` 최상위만 보므로 섞이지 않는다. Easy용 이전 체크포인트는 `<name>-easy.json`(선택).
- **사용자에게 요청할 정보** (보드 모델과 같은 항목, [ai-interface-spec.md §9](ai-interface-spec.md)): ① 층 수·크기, actor/critic 공유 여부, bias ② 활성화 함수 ③ 행렬 배치(`x @ W` / `W @ x`, 행 우선, dtype) ④ 입력 정규화(러닝 평균·표준편차 위치, 클리핑) ⑤ actor 출력: logits/확률, **head 구조(9+4 두 head 또는 36 flat, 출력 벡터 안 순서)** ⑥ critic 출력 ⑦ JSON 키 예시 파일 ⑧ **패리티 샘플**: obs 5개 이상 + 각 obs의 마스크(9+4 또는 36) + 마스크 전 actor 원출력 + critic 값(버튼이 일부 막힌 경우 포함 권장).
- 패리티 허용 오차는 보드와 같다: `abs(ts − ref) ≤ 1e-5 + 1e-5·abs(ref)`, 마스크 후 argmax 일치.
- **권장 메타데이터**: `"cobs_version": "cobs_v1"`, `"cact_version": "cact_v1"`, `"obs_dim": 160`, `"head": "multi" | "flat"`, `"output": "logits"`, `"combat_rules_version"`, 학습 설정 요약. 버전이 있으면 로드 시 일치를 검사한다.

## 12. 보드 env의 전투 해결 (`combat_resolver`)
- 보드 env(`rpgboard-env/1`) reset에 `config.combat_resolver: "dice" | "outcome:<file>" | "sim:<combat-model-id>"`를 추가한다. 기본은 첫 전투 모델이 나오기 전까지 `dice`, 그 뒤 `outcome`. `obs_v1`/`act_v1`은 그대로다. `info`가 `combat_resolver`·`combat_model_id`·`outcome_model_id`를 알려 주고, `expect`와 다르면 `VERSION_MISMATCH`.
- 구현: `dice`는 엔진 `combat.mode = 'dice'`. `outcome`·`sim`은 `'external'`로 두고 env가 `COMBAT`에서 결과를 만들어 `applyCombatResult`로 넣는다(combat-design §8.1). `sim`은 고정 전투 모델로 실제 전투를 끝까지 돌린다(전투당 약 10~50ms, 주기적 점검·미세 조정용).
- **[구현] 현재 상태** (`packages/sim/src/combatResolver.ts`): `combat_resolver: "dice" | "sim"`, 기본 `dice`.
  - `dice` = `resolveCombatWithDice`(이전 동작과 바이트 단위로 같음).
  - `sim` = `boardCombatSetup(state)`(`@dragon-rush/combat-ai`)로 두 플레이어의 보드 스탯(직업, hp, maxHp, atk, def, 불굴 남음 여부; 용은 규칙의 hp·atk·def)을 전투 setup으로 바꾸고, 양쪽 `scripted:balanced` 봇으로 `runCombat`을 끝까지 돌린 뒤 `applyCombatResult`. 전투 시드는 에피소드(게임) 시드와 전투 순번에서 파생되어 결정적이다. 전투당 약 1ms(봇 포함 sim 1.8µs/틱 × 평균 약 490틱). 모델 기반 `sim:<id>`와 `outcome:<file>`은 전투 모델·outcome 모델이 생긴 뒤 추가한다.
  - reset 결과에 `combat_resolver`가 붙고, `expect.combat_resolver`가 다르면 `VERSION_MISMATCH`. Python `RPGBoardEnv(combat_resolver="sim")`.
  - 밸런스 CLI: `pnpm sim --combat dice|sim [--combat-bot scripted:<name>] [--log-fights <file>]`. 4인 2000판 기준(휴리스틱, seed 1, 2026-11-12, 보정 전 `combat-1`): `dice` 평균 10.2라운드·용 처치 종료 85.9%·용 도전 성공률 77.2%·직업 승률 검/궁/마/닌/광 27.5/24.6/26.6/23.1/23.2% → `sim` 9.7라운드·96.5%·**100%**·27.3/22.9/25.9/24.9/24.1%(판당 전투 2.04회, 전투당 sim 시간 8.2초), 단일 스레드 140 → 117판/s. 실시간 용전이 보드 용(HP 88)에 비해 너무 쉬우므로 전투 보정(R5) 때 다시 잰다.
- **outcome 모델** (보드 학습 기본):
  1. 전투 모델 버전을 고정한다.
  2. 워커 프로세스로 20만 전투(봇 vs 봇, Normal 지연, 샘플링 행동, 용전 포함)를 생성한다. 설정은 `stat_dist_v1.json`에서 뽑는다.
  3. 특징: 모드, 양쪽 직업 one-hot(또는 용), 양쪽 hp·maxHp·atk·def, 불굴 가능, combat-design §4 공식으로 구한 양쪽 log(처치 타수).
  4. 모델: 2×32 MLP 또는 직업 쌍 상호작용이 있는 로지스틱 회귀. 출력 = P(도착자 승) 또는 P(도전자 승), 승자 HP% 10구간 히스토그램, P(불굴 소모).
  5. 통과 기준: 10분위마다 보정 오차 ±3% 이내(Brier 점수, 신뢰도 곡선).
  6. 보드 env에서: 시드 RNG로 승자 → HP 구간 → 구간 안 정수 HP(≥ 1)를 균등하게 뽑는다.
- **강건성**: 보드 학습 중 좌석·에피소드마다 로짓 실력 편차 ε ~ N(0, 0.5)(`config.outcome_skill_noise`)를 더해 보드 AI가 전투 승률을 과신하지 않게 한다.
- 같은 outcome 모델을 UI "용의 눈"과 HeuristicBot 추정에도 쓴다(실시간 모드, combat-design §8.4).
- 적합(fit) 도구와 `outcome_v1` 파일 포맷을 저장소에 둘지는 사용자 결정이다(development-plan D16. 기본안: numpy 전용 적합 스크립트와 포맷을 우리가 제공하며, 이것은 정책 트레이너가 아니다).

## 13. 테스트 계획
| 테스트 | 내용 |
|---|---|
| 레이아웃 | `COBS_V1_LAYOUT` offset 연속, 합 160, 값 범위([−1, 2]), 원-핫 합 ∈ {0, 1}, `CACT_V1_NAMES` 길이 9·4·36 |
| cobs 골든 | 고정 시드 전투(직업 5종, 용전 3페이즈, 투사체·예고 포함)의 관측 벡터 스냅샷. 버전 상수 변경 없이 바뀌면 실패 |
| 마스크·코덱 | 속성 테스트: 마스크 0 ⇔ 10틱 넘게 사용 불가, flat ↔ multi 왕복, 미러 왕복(관측·행동) |
| 결정성 | 같은 시드·행동 열 → 같은 바이트, env 프로세스 2개 비교 |
| env 계약 | spawn → info/reset/step/close, `ILLEGAL_ACTION` 원자성, 자동 리셋, `actionable`·`active`, data skipping 보상 합 보존, stdout에 로그 없음 |
| Python | pytest: 형태·dtype, b64 디코딩, 버전 불일치, 예제 루프 |
| 패리티·outcome | 사용자 샘플로 TS forward 비교(어댑터 구현 시), outcome 모델 10분위 보정 ±3% |

- **[구현] 테스트 위치**: `packages/combat-ai/test/`(layout, obs — 25쌍+용전 범위·원-핫·미러·tick 0 골든 스냅샷, mask — 실제 눌러 보는 양방향 검사, codec, modelPolicy — 선택·폴백·봇 이름·지연 버퍼·보드 setup 변환), `packages/sim/test/combatEnv.test.ts`(info·오류 코드·자동 리셋·보상·`p0`+flat·원자성·바이트 결정성·`auto_reset: false`·actionable·스탯 파일·커리큘럼·64 env 벤치마크·stdio spawn), `runner.test.ts`·`env.test.ts`(`sim` 리졸버 재현성), `python/tests/test_combat.py`. 골든 스냅샷은 tick 0 관측만 고정한다(전투 수치 보정 중에도 깨지지 않도록). 데이터 스키핑 보상 합 보존은 트레이너 쪽 일이라 env 테스트에는 없다.

## 14. 출처 (핵심)
- 행동 반복·반응 지연: https://openai.com/index/openai-five/ · https://ice.ci.ritsumei.ac.jp/~ftgaic/index-3.html · https://unity-technologies.github.io/ml-agents/Learning-Environment-Design-Agents/
- 행동 공간 설계·마스킹: https://arxiv.org/abs/2004.00980 · https://arxiv.org/abs/2105.13807 · https://iclr-blog-track.github.io/2022/03/25/ppo-implementation-details/ · https://docs.diambra.ai/envs/
- 1v1 격투 RL(data skipping, 셀프플레이 커리큘럼): https://arxiv.org/abs/1904.03821 · 셀프플레이 설정: https://huggingface.co/learn/deep-rl-course/unit7/self-play · PFSP: https://deepmind.google/blog/alphastar-grandmaster-level-in-starcraft-ii-using-multi-agent-reinforcement-learning/
- 시간 제한과 종료: https://proceedings.mlr.press/v80/pardo18a.html · https://gymnasium.farama.org/main/tutorials/handling_time_limits/ · 보상 shaping: https://www.cs.utexas.edu/~shivaram/readings/b2hd-NgHR1999.html
- 슬롯 패딩 주의: https://arxiv.org/html/2508.12524v1 · 옵션(semi-MDP) 관점의 보드↔전투 분리: https://people.cs.umass.edu/~barto/courses/cs687/Sutton-Precup-Singh-AIJ99.pdf
