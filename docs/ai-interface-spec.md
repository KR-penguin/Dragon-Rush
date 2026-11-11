# AI 인터페이스 명세 — 드래곤 러쉬 (Dragon Rush)

> 상태: **설계 단계 (코드 없음)**. 경로·명령·시그니처는 모두 "예정"이다.
> 이 문서가 **관측(`obs_v1`)·행동(`act_v1`)·마스크·보상·env 서버 프로토콜·Python 클라이언트 API·모델 통합 계약의 정본**이다.
> 규칙·수치 정본은 [game-design.md](game-design.md)(이하 "기획서", 근거는 절 번호로 인용), 모듈 경계는 [architecture.md](architecture.md).

## 1. 범위와 역할 분담

| 영역 | 우리 (게임 저장소) | 사용자 |
|---|---|---|
| 관측·행동·마스크·보상 정의 | ✅ 이 문서 + `packages/ai` 구현 (TS 단일 구현) | 읽고 사용 |
| 학습 환경 | ✅ env 서버(`packages/sim`, stdio JSON Lines) + numpy 전용 Python 클라이언트(`python/rpgboard_env`) | 호출 |
| 학습 알고리즘·트레이너 | ❌ 만들지 않음 (PyTorch·PPO/A2C·export 스크립트 없음) | ✅ 순수 numpy Actor-Critic |
| 가중치 JSON 포맷 | ❌ 정의하지 않음 (§9의 정보만 요청, 메타데이터는 권장) | ✅ 정의 |
| 게임 내 모델 실행 | ✅ `PolicyModel` + 사용자 포맷 어댑터(포맷 수령 후 구현), `ModelPolicy` | 가중치 파일·패리티 샘플 제공 |
| 내장 봇 | ✅ RandomBot, HeuristicBot (학습 상대·기준선·온라인 대리) | 선택 사용 |

- 인코더·마스크는 **`packages/ai`(TS)에만** 있다. Python은 env 서버가 준 벡터를 그대로 쓰고 재구현하지 않는다. 그래서 학습 관측과 실제 게임(브라우저·서버) 관측이 항상 같다.
- Python 의존성은 **numpy만**. 시그니처는 Gymnasium 스타일이지만 `gymnasium`은 import하지 않는다.

## 2. 버전 정책

| 상수 (`packages/ai`) | 값 | 의미 |
|---|---|---|
| `OBS_VERSION` / `OBS_DIM` | `"obs_v1"` / **253** | 관측 레이아웃·정규화 상수·특징 의미 |
| `ACT_VERSION` / `ACTION_DIM` | `"act_v1"` / **47** | 행동 인덱스 ↔ 엔진 `Action` 매핑 |
| `ENV_PROTOCOL` | `"rpgboard-env/1"` | env 서버 메시지 형식 |

- 인덱스 위치·길이, 정규화 상수, 인코딩 방식, 특징 의미 중 하나라도 바뀌면 버전을 올린다(`obs_v2`). **기존 인덱스의 의미를 다른 의미로 재사용하지 않는다.** 새 특징은 새 버전에서 뒤에 추가한다.
- `RulesConfig` 수치 변경(밸런스 조정)은 obs/act 버전을 바꾸지 않는다(값만 바뀜). 다만 정책 성능이 달라질 수 있으므로 env `info`가 `rules_version`을 함께 알려 주고, 모델 메타데이터에도 기록을 권장한다.
- 확인 지점: env `info` 응답(`obs_version`, `act_version`, `obs_dim`, `action_dim`, `obs_layout`), 모델 메타데이터(§9, 있으면 로드 시 일치 검사). 버전 상수 변경 없이 레이아웃이 바뀌면 골든 테스트가 실패한다(§11).

## 3. 관측 벡터 `obs_v1` (float32[253], 자기중심)

**공통 규칙**
- 관측은 항상 **결정 주체(`acting_seat`) 시점**이다(`encodeObservation(view: PublicGameState, seat)`). "자기" = 결정 주체. 방어자의 `SHIELD_DECISION`에서는 남의 턴이어도 방어자 시점이다(기획서 §6 표 `SHIELD_DECISION` 행).
- 좌석: 턴 순서 셔플 후 좌석 번호 = 턴 순서(0..n-1)이며 게임 내내 고정된다(기획서 §3 턴 순서). 상대 k(1..3)는 절대 좌석 `(mySeat + k) mod n`이다(k ≤ n-1). 즉 상대1 = 내 다음 차례. k ≥ n이면 빈 좌석이다.
- 빈 좌석: 블록 전체 0. 탈락 좌석: `present=1`, 나머지 전부 0(`alive=0` 포함).
- 스케일 특징: `n(x, S) = clip(x / S, 0, 2)`. 원-핫·플래그는 {0,1}. 따라서 모든 값 ∈ [0, 2]. 스탯 상한이 없으므로(기획서 §7) 클리핑으로 범위를 보장한다.
- 숨은 정보는 없다. 동굴 덱은 복원 추출이라 덱 상태가 없다(기획서 §5 동굴 덱). RNG 상태는 관측에 넣지 않는다.

아래 표는 `packages/ai`의 `OBS_V1_LAYOUT`(env `info.obs_layout`으로도 제공)과 1:1로 대응한다.

**정규화 상수** (`OBS_V1_SCALES`, 최종 밸런스 수치에서 유도. 바꾸면 버전 증가)

| 상수 | 값 | 근거 (config `final`) |
|---|---|---|
| `HP_S` | 120 | 용 HP 115, 기본 HP 30~56, HP 강화 +6/레벨 |
| `ATK_S`, `DEF_S` | 20 | 기본 ATK 4~6 / DEF 5~6, 용 10/6, 점증 비용(3+lvl, 2+lvl) |
| `COIN_S` | 50 | 시작 5, 출발 보너스 +10, 턴당 순 수입 ≈2.45, 도둑 7, 가격 5~6, 강화비 |
| `LVL_S` | 10 | 스탯별 강화 레벨 |
| `ITEM_S` | 3 | 시작 방어막 1, 무료 획득 ≈1/판, 구매 ≈0.45/판(종류별) |
| `ROUND_S` | 100 | 학습 env `maxRounds` 기본 100 (게임 길이 p95 = 32) |
| `GRACE_S` / `CD_S` / `TP_S` | 3 / 2 / 2 | 초반 보호 3라운드 / 닌자 쿨다운 2턴 / 이번 턴 텔레포트 사용 수 |
| `DIST_S` | 23 | 링(24칸)에서 최대 전진 거리 |

### 3.1 자기 블록 — offset 0, 길이 51

| offset | len | 이름 | 인코딩 |
|---|---|---|---|
| 0 | 5 | `self.job` | 원-핫 [swordsman, archer, mage, ninja, berserker] |
| 5 | 24 | `self.pos` | 현재 칸 원-핫(절대 칸 0~23) |
| 29 | 1 | `self.hp` | n(hp, HP_S) |
| 30 | 1 | `self.maxHp` | n(maxHp, HP_S) |
| 31 | 1 | `self.hpRatio` | hp / maxHp |
| 32 | 1 | `self.atk` | n(atk, ATK_S) |
| 33 | 1 | `self.def` | n(def, DEF_S) |
| 34 | 1 | `self.coins` | n(coins, COIN_S) |
| 35 | 3 | `self.upgradeLvl` | [atk, def, maxHp] 각 n(lvl, LVL_S) (스탯별 레벨, 기획서 §7) |
| 38 | 3 | `self.upgradeCost` | [atk, def, maxHp] 다음 강화 비용 n(base + lvl·step, COIN_S) |
| 41 | 3 | `self.itemCount` | [teleport, shield, thief] n(count, ITEM_S) |
| 44 | 3 | `self.hasItem` | 위 3종 보유 여부(≥1) |
| 47 | 1 | `self.skipNextTurn` | 쉬는 턴 예정 또는 진행 중(턴 종료 시 소모) |
| 48 | 1 | `self.indomitableReady` | 검사 ∧ 불굴 미사용 (기획서 §4 불굴, `indomitableUsed`의 역) |
| 49 | 1 | `self.rageActive` | 광전사 ∧ 2·hp ≤ maxHp |
| 50 | 1 | `self.ninjaCooldown` | 닌자면 n(남은 쿨다운 턴, CD_S), 아니면 0. ±1 사용 직후 2, 자기 턴 시작마다 1 감소. PRE_ROLL에서 0보다 크면 이번 턴 MOVE_ADJUST 없음 |

### 3.2 상대 블록 ×3 — 상대1 offset 51, 상대2 offset 105, 상대3 offset 159 (각 길이 54)

블록 내부 상대 offset(r). 절대 offset = 블록 시작 + r. `fwd = (pos_opp − pos_me) mod 24`, `back = (pos_me − pos_opp) mod 24`.

| r | len | 이름 | 인코딩 |
|---|---|---|---|
| 0 | 1 | `present` | 이 게임에 존재하는 좌석 |
| 1 | 1 | `alive` | 생존 |
| 2 | 5 | `job` | 원-핫 (자기 블록과 같은 순서) |
| 7 | 24 | `pos` | 현재 칸 원-핫 |
| 31 | 1 | `fwdDist` | fwd / DIST_S (내 기준 전진 거리) |
| 32 | 1 | `sameTile` | fwd = 0 (공존 중, 출발 칸 포함) |
| 33 | 1 | `iCanReach` | 1 ≤ fwd ≤ 6 (내 주사위 착지 가능) |
| 34 | 1 | `canReachMe` | 1 ≤ back ≤ 6 (상대 주사위로 내 칸 착지 가능) |
| 35 | 1 | `hp` | n(hp, HP_S) |
| 36 | 1 | `maxHp` | n(maxHp, HP_S) |
| 37 | 1 | `hpRatio` | hp / maxHp |
| 38 | 1 | `atk` | n(atk, ATK_S) |
| 39 | 1 | `def` | n(def, DEF_S) |
| 40 | 1 | `coins` | n(coins, COIN_S) |
| 41 | 3 | `upgradeLvl` | [atk, def, maxHp] n(lvl, LVL_S) |
| 44 | 3 | `itemCount` | [teleport, shield, thief] n(count, ITEM_S) |
| 47 | 3 | `hasItem` | 보유 여부 |
| 50 | 1 | `skipNextTurn` | 쉬는 턴 예정 |
| 51 | 1 | `indomitableReady` | 검사 ∧ 불굴 미사용 |
| 52 | 1 | `rageActive` | 광전사 ∧ 2·hp ≤ maxHp |
| 53 | 1 | `ninjaCooldown` | n(남은 쿨다운, CD_S) |

### 3.3 전역 블록 — offset 213, 길이 40

| offset | len | 이름 | 인코딩 |
|---|---|---|---|
| 213 | 1 | `g.round` | n(round, ROUND_S). 라운드는 기획서 §12 라운드 집계 기준(1부터) |
| 214 | 1 | `g.maxRounds` | n(maxRounds, ROUND_S), 무제한이면 0 |
| 215 | 1 | `g.roundsLeftFrac` | (maxRounds − round + 1) / maxRounds, 무제한이면 0 |
| 216 | 1 | `g.graceLeft` | n(max(0, `rules.pvpGraceRounds` − round + 1), GRACE_S). 초반 보호 미도입(`pvpGraceRounds = 0`)이면 0 |
| 217 | 1 | `g.pvpEnabled` | 이번 라운드에 PvP가 성립하는가(graceLeft = 0) |
| 218 | 3 | `g.numPlayers` | 시작 인원 원-핫 [2, 3, 4] |
| 221 | 1 | `g.aliveCount` | 생존자 수 / 4 |
| 222 | 6 | `g.phase` | 원-핫 [PRE_ROLL, MOVE_ADJUST, CHOOSE_PVP_TARGET, SHIELD_DECISION, TRAINING_CHOICE, POST_MOVE] (종료 관측은 전부 0) |
| 228 | 4 | `g.turnPlayer` | 턴 플레이어 원-핫 [자기, 상대1, 상대2, 상대3]. 자기가 아니면 비턴 결정(방어자) |
| 232 | 6 | `g.dice` | 턴 플레이어가 이번 턴 `ROLL_DICE`로 낸 원래 눈(닌자 보정 전) 1~6 원-핫. `ROLL_DICE` 전이거나 이번 턴에 굴리지 않았으면(PRE_ROLL 텔레포트·용 도전) 0. 굴린 뒤 POST_MOVE에서 텔레포트해도 값을 유지 |
| 238 | 1 | `g.canBuy` | 턴 플레이어가 이번 턴 가장 최근에 상점에 도착함(기획서 §8 구매 조건) |
| 239 | 1 | `g.thiefUsed` | 턴 플레이어가 이번 턴 도둑 사용함(기획서 §8 도둑·§12 도둑 반복) |
| 240 | 1 | `g.teleportsUsed` | n(이번 턴 텔레포트 사용 수, TP_S) |
| 241 | 1 | `g.teleportLimitReached` | 턴당 상한이 설정되어 있고 도달함(§5, 상한 없으면 항상 0) |
| 242 | 1 | `g.pvpAmArriver` | 진행 중 PvP 결정에서 내가 도착자(CHOOSE_PVP_TARGET, SHIELD_DECISION) |
| 243 | 1 | `g.pvpAmDefender` | 진행 중 PvP 결정에서 내가 방어자 |
| 244 | 3 | `g.pvpOpponent` | 확정된 PvP 상대 원-핫 [상대1, 상대2, 상대3] (대상 선택 전이면 0) |
| 247 | 1 | `g.dragonHp` | n(dragon.hp, HP_S) |
| 248 | 1 | `g.dragonAtk` | n(dragon.atk, ATK_S) |
| 249 | 1 | `g.dragonDef` | n(dragon.def, DEF_S) |
| 250 | 3 | `g.itemPrice` | [teleport, shield, thief] n(price, COIN_S) |

**검산**: 자기 51 + 상대 54×3 = 213 → 전역 시작 213, 마지막 offset 250 + 길이 3 = **253 = `OBS_DIM`**. 각 블록 내부 offset도 연속(자기 0→51, 상대 0→54, 전역 213→253).
- PvP·공존 정보: 같은 칸 공존자는 상대 블록 `sameTile`, CHOOSE_PVP_TARGET 후보 = `alive ∧ sameTile`인 상대(기획서 §12 공존 중인 칸에 도착).
- 전투·패시브(기획서 §9 공격 1회 처리 순서, §4 패시브)는 자동 처리라 관측에는 상태(`indomitableReady`, `rageActive`, `ninjaCooldown`)만 있다.

## 4. 행동 공간 `act_v1` (Discrete 47)

| index | 이름 | 엔진 `Action` | 합법 phase |
|---|---|---|---|
| 0 | `ROLL_DICE` | `{type:'ROLL_DICE'}` | PRE_ROLL |
| 1 | `END_TURN` | `{type:'END_TURN'}` | POST_MOVE, PRE_ROLL(쉬는 턴만) |
| 2 | `CHALLENGE_DRAGON` | `{type:'CHALLENGE_DRAGON'}` | PRE_ROLL |
| 3–5 | `UPGRADE_{ATK,DEF,MAXHP}` | `{type:'UPGRADE', stat:'atk'\|'def'\|'maxHp'}` | PRE_ROLL, POST_MOVE |
| 6–8 | `BUY_{TELEPORT,SHIELD,THIEF}` | `{type:'BUY_ITEM', item}` | POST_MOVE |
| 9–32 | `TELEPORT_T00`…`TELEPORT_T23` | `{type:'USE_TELEPORT', tile: index − 9}` | PRE_ROLL, POST_MOVE |
| 33–35 | `THIEF_OPP{1,2,3}` | `{type:'USE_THIEF', target: abs(k)}` | PRE_ROLL, POST_MOVE |
| 36–38 | `ADJUST_{M1,0,P1}` | `{type:'ADJUST_MOVE', delta:-1\|0\|1}` | MOVE_ADJUST |
| 39–40 | `SHIELD_{NO,YES}` | `{type:'SHIELD_DECISION', use:false\|true}` | SHIELD_DECISION |
| 41–43 | `PVP_TARGET_OPP{1,2,3}` | `{type:'CHOOSE_PVP_TARGET', target: abs(k)}` | CHOOSE_PVP_TARGET |
| 44–46 | `TRAIN_{ATK,DEF,MAXHP}` | `{type:'CHOOSE_TRAINING_STAT', stat}` | TRAINING_CHOICE |

**검산**: 1+1+1+3+3+24+3+3+2+3+3 = **47 = `ACTION_DIM`** (마지막 index 46).
- `abs(k) = (mySeat + k) mod n` (§3과 같은 상대 좌석 규칙). 엔진 `Action`은 절대 좌석을 쓰고, 변환은 `packages/ai` 코덱이 한다.
- 텔레포트는 **절대 칸** 인코딩이다. 자기 기준 오프셋 인코딩도 검토했지만, 칸 효과(상점 6·18, 여관 12 등)가 절대 위치에 고정되어 있어 "여관으로 텔레포트" 같은 의미가 한 인덱스에 고정되는 쪽이 학습에 유리하다. 현재 칸 인덱스는 항상 마스크된다(기획서 §12 텔레포트 목적지).
- 코덱 API(예정, `packages/ai/src/codec/`): `encodeAction(view, seat, action): number`, `decodeAction(view, seat, index): Action`, `maskFromLegal(view, seat, legal): Uint8Array`, `ACTION_NAMES: readonly string[]`.

## 5. 마스크 규칙

마스크는 엔진 `getLegalActions(state)`에서 **만든다**(`maskFromLegal`). 아래 표는 엔진이 내놓아야 할 합법 조건의 명세이며, 엔진 테스트가 이를 검증한다. 표에 없는 (phase, 행동) 조합은 0이다.

| phase (actor) | 행동 | 합법 조건 |
|---|---|---|
| PRE_ROLL (턴 플레이어) | `ROLL_DICE` / `END_TURN` / `CHALLENGE_DRAGON` | 쉬는 턴이 아닐 때만 / 쉬는 턴일 때만 / 항상 (기획서 §6 1단계·§12 쉬는 턴, 용 도전 조건 없음: §10) |
| PRE_ROLL·POST_MOVE | `UPGRADE(s)` | coins ≥ baseCost(s) + lvl(s)·costStep(s) (스탯 상한 없음, 기획서 §7) |
| PRE_ROLL·POST_MOVE | `USE_TELEPORT(t)` | teleport ≥ 1 ∧ 쉬는 턴 아님 ∧ t ≠ 현재 칸 ∧ (`teleport.perTurnLimit` = null ∨ 이번 턴 사용 수 < 상한) |
| PRE_ROLL·POST_MOVE | `USE_THIEF(k)` | thief ≥ 1 ∧ 이번 턴 미사용 ∧ 상대 k 존재·생존 ∧ 상대 coins ≥ 1 (기획서 §8 도둑, §12 도둑 반복) |
| POST_MOVE (턴 플레이어) | `END_TURN` | 항상 |
| POST_MOVE | `BUY_ITEM(i)` | canBuy ∧ coins ≥ price(i) (재고·보유 한도 없음, 기획서 §8 구매 조건) |
| MOVE_ADJUST (닌자, 쿨다운 0) | `ADJUST_MOVE(-1)` / `(0)`, `(+1)` | 주사위 ≥ 2 / 항상 (최종 이동 ∈ [1, 7], 기획서 §4 그림자 걸음) |
| CHOOSE_PVP_TARGET (도착자) | `CHOOSE_PVP_TARGET(k)` | 상대 k 생존 ∧ 내 칸에 있음. 이 phase는 후보가 2명 이상일 때만 생김 |
| SHIELD_DECISION (방어막 보유한 도착자 또는 방어자) | `SHIELD_NO`, `SHIELD_YES` | 항상 둘 다 (보유자에게만 질의, 기획서 §6 5.2·§12 방어막 질의) |
| TRAINING_CHOICE (턴 플레이어) | `TRAIN(s)` | 항상 3개 모두 합법. 거부 행동 없음 (기획서 §5 수련장) |

- 텔레포트 턴당 상한: 기본값은 `perTurnLimit = null`(무제한, 사용자 원문 "얻은 턴에도 사용 가능" 우선)이다(기획서 §8). 밸런스 시뮬은 턴당 1회로 검증했으므로 사용자 결정(기획서 §16·개발 계획서 §2.1의 R2)에 따라 1로 바뀔 수 있다. 어느 쪽이든 obs/act 레이아웃은 같다(`g.teleportsUsed`, `g.teleportLimitReached`).
- 도둑은 기본 `perTurnLimit = 1`이다(기획서 §16 R3 미결. 바뀌어도 obs/act 레이아웃은 같고 `g.thiefUsed`·마스크 조건만 달라짐). 쉬는 턴에는 이동(`ROLL_DICE`·`USE_TELEPORT`)만 마스크되고 `END_TURN`이 열린다. 남의 턴·착지 처리 중에는 UPGRADE·아이템 phase가 아예 없다.
- **불변식** (§11에서 속성 테스트):
  1. `{decodeAction(i) | mask[i] = 1}` = `getLegalActions(state)` (집합 일치, 일대일). `encodeAction(decodeAction(i)) = i`.
  2. `pending ≠ null`이면 합법 행동 ≥ 1. 또한 합법 행동이 정확히 1개인 결정(v0에서는 "POST_MOVE에 END_TURN만" 하나뿐)은 엔진이 자동 적용하고 GameEvent로 기록하므로(기획서 §6 마지막 불릿), **정책·env가 받는 모든 결정은 합법 행동 ≥ 2**다.
  3. 마스크된 행동이 들어오면 엔진은 `IllegalActionError`, env 서버는 `ILLEGAL_ACTION` 오류를 낸다(조용히 대체하지 않음).

## 6. 보상과 에피소드

| 사건 | 해당 좌석 보상 | 에피소드 플래그 |
|---|---|---|
| 용 처치 또는 최후 생존 | 승자 +1 | 게임 종료: `terminated = true` |
| 탈락(PvP 패배·용 도전 실패) | 탈락 시점에 −1 | single: 에이전트면 즉시 `terminated = true`, `outcome = null`(게임 미완), 남은 게임은 시뮬하지 않음. 단, 에이전트 탈락으로 게임 자체가 끝나면(예: 2인) 실제 outcome을 준다 |
| 다른 사람이 용 처치 / 남의 최후 생존으로 게임 종료 | 남아 있던 패자 −1 | `terminated = true` |
| `maxRounds` 도달(마지막 라운드의 마지막 턴 종료 = maxRounds+1 라운드 시작 직전, 기획서 §12) | 생존자 0 | `truncated = true`, `outcome.kind = "draw"` |

- 기본은 희소 보상이다. 게임 내에서 maxRounds 무승부는 실제 종료지만(기획서 §12 `maxRounds` 도달), 학습 env는 `truncated`로 표시한다. 부트스트랩 여부는 사용자가 정한다(`info.outcome`으로 구분 가능).
- 선택적 shaping (`reward_shaping`, 기본 전부 0 = off). 좌석 s의 전이당 보상에 더한다: `coins·Δcoins_s + stats·Δ(atk + def + maxHp/6)_s + kill·(s가 PvP로 탈락시킨 수) + dragon_try·(s의 용 도전 수)`. 키: `coins`, `stats`, `kill`, `dragon_try`. 알 수 없는 키는 `BAD_CONFIG`.
- **비턴 결정**: 방어자의 SHIELD_DECISION도 일반 결정과 같다. env는 `acting_seat`(결정 주체)와 `turn_seat`(턴 플레이어)를 따로 준다. single 모드에서 에이전트가 방어막을 가진 방어자면 상대 턴 도중에도 Python에 제어가 넘어온다(기획서 §6 표 `SHIELD_DECISION` 행).
- **보상 전달(다좌석)**: 각 전이 응답은 절대 좌석별 `rewards: float[4]`를 준다(그 전이에서 생긴 보상, 대부분 0). 에피소드가 끝난 좌석(탈락, 또는 게임 종료·truncation 시 남아 있던 좌석)은 그 전이의 `rewards[s]`에 최종 보상, `final_obs[s]`에 종료 관측(§7)이 담기고, 탈락이면 `eliminated`에 좌석 번호가 들어간다. 이후 그 좌석은 다시 결정하지 않는다. 사용자는 좌석별 버퍼의 마지막 전이에 `rewards[s]`를 더하면 된다.

## 7. env 서버 프로토콜 (stdio JSON Lines)

- 실행: `node packages/sim/dist/env-server.js` (= `pnpm env-server`, 먼저 `pnpm build`). 보통은 Python 클라이언트가 subprocess로 자동 실행한다.
- stdin 한 줄 = 요청 1개, stdout 한 줄 = 응답 1개(UTF-8). **stdout은 프로토콜 전용, 로그는 stderr.** 요청은 순차 처리하며 응답은 `id`를 그대로 돌려준다. 아래 예시의 일부 응답은 가독성을 위해 줄바꿈했으며, 실제 전송은 항상 한 줄이다.
- 요청 `{ "id": int, "cmd": "info"|"reset"|"step"|"close", "params"?: {...} }` → 응답 `{ "id", "ok": true, "result" }` 또는 `{ "id", "ok": false, "error": { "code", "message", "env_index"? } }`.

**info** — 버전·차원·레이아웃 조회 (reset 전에도 가능)
```json
{"id":1,"cmd":"info"}
{"id":1,"ok":true,"result":{"protocol":"rpgboard-env/1","obs_version":"obs_v1","act_version":"act_v1",
 "obs_dim":253,"action_dim":47,"rules_version":"final-1","action_names":["ROLL_DICE","END_TURN","CHALLENGE_DRAGON","..."],
 "obs_layout":[{"name":"self.job","offset":0,"length":5},{"name":"self.pos","offset":5,"length":24},"..."],
 "bots":["random","random:uniform","heuristic","heuristic:aggro","heuristic:growth","heuristic:rush"]}}
```

**reset** — N개 env를 (재)생성하고 첫 결정까지 진행

| params | 타입·기본값 | 설명 |
|---|---|---|
| `num_envs` | int ≥ 1, 1 | 배치 크기 |
| `seed` | int (0..2^53−1), 생략 시 서버가 생성해 반환 | env i의 j번째 에피소드 시드 = `splitmix64(seed, i, j)`. 봇 RNG도 여기서 파생 |
| `encoding` | `"b64"` \| `"json"`, `"b64"` | 관측 = little-endian float32 base64 / 숫자 배열(디버그용) |
| `auto_reset` | bool, true | 종료된 env를 즉시 새 에피소드로. `false`는 `num_envs = 1`일 때만 |
| `expect` | `{obs_version, act_version}` 선택 | 다르면 `VERSION_MISMATCH` |
| `config.mode` | `"single"` \| `"selfplay"`, `"single"` | single: 에이전트 1좌석 + 나머지 내장 봇 / selfplay: `controlled_seats`(기본 전 좌석)를 모두 외부 제어(AEC) |
| `config.num_players` | 2~4 또는 목록(에피소드마다 균등 선택), 4 | |
| `config.agent_seat` | 0..n-1 또는 `"random"`, `"random"` | single 전용. 셔플 후 좌석 = 턴 순서이므로 기본은 무작위 |
| `config.controlled_seats` | 좌석 목록 또는 `"all"`, `"all"` | selfplay 전용. 나머지 좌석은 `opponents` 봇 |
| `config.jobs` | `"random"` 또는 좌석별 직업 id 목록, `"random"` | 중복 불가 |
| `config.opponents` | 봇 이름 또는 좌석별 목록, `"heuristic"`(성향 좌석별 무작위) | §10 |
| `config.max_rounds` | int \| null, 100 | |
| `config.rules` | `"default"` 또는 `RulesConfig` 부분 덮어쓰기, `"default"` | `validateRules` 실패 시 `BAD_CONFIG` |
| `config.reward_shaping` | object \| null, null | §6 |
| `config.return_events` | bool, false | 응답에 GameEvent 목록 포함(디버그·리플레이) |

**step** — `{"actions": [int, ...]}` (길이 = `num_envs`). 모든 행동을 먼저 검증하고 하나라도 불법이면 **어느 env도 진행하지 않고** `ILLEGAL_ACTION`(원자적). 정상이면 각 env에 행동을 적용한 뒤 다음 외부 제어 결정이 나올 때까지 봇 좌석·자동 구간을 진행한다.

env별 결과 객체(`result.envs[i]`, reset도 같은 형식):

| 키 | 설명 |
|---|---|
| `obs`, `legal` | 다음 결정의 관측(acting_seat 시점), 합법 행동 인덱스 오름차순 |
| `acting_seat`, `turn_seat`, `phase`, `round` | 결정 주체, 턴 플레이어, phase 문자열, 라운드 |
| `rewards` | float[4] 절대 좌석별 이번 전이 보상(reset이면 0) |
| `terminated`, `truncated`, `outcome` | 에피소드 종료 플래그, `null` 또는 `{"kind":"dragon"\|"lastSurvivor"\|"draw","winner":int\|null}` |
| `eliminated`, `final_obs` | 이번 전이에 탈락한 좌석 목록(봇 포함), 이번 전이에 에피소드가 끝난 **외부 제어 좌석 전부**(탈락자 + 게임 종료·truncation 시 남아 있던 좌석)의 종료 관측 `{"<seat>": obs}` |
| `episode_start` | 새 에피소드가 시작된 응답에만: `{"episode","seed","num_players","jobs","agent_seat"}` |
| `events` | `return_events`일 때만 |

- **종료 관측**: 그 좌석 시점으로 전이 직후 상태를 인코딩하되 `g.phase`는 전부 0(대기 결정 없음). 탈락 좌석이면 자기 블록은 `self.job` 원-핫만 남고 나머지는 0이다. truncation에서 critic 부트스트랩(V(s'))에 쓸 수 있다.
- **종료 응답(`auto_reset=false`)**: `obs` = single이면 에이전트, selfplay이면 이번 행동을 낸 좌석의 종료 관측, `legal = []`, `acting_seat`·`turn_seat`·`phase` = `null`. 이후 `step`은 `EPISODE_OVER`.

자동 리셋된 env는 `terminated`/`truncated`/`rewards`/`eliminated`/`outcome`/`final_obs`가 **끝난 에피소드**를, `obs`/`legal`/`acting_seat`/`phase`/`round`가 **새 에피소드의 첫 결정**을 가리키고 `episode_start`가 붙는다.
```json
{"id":2,"cmd":"reset","params":{"num_envs":2,"seed":42,"config":{"mode":"single","num_players":4}}}
{"id":2,"ok":true,"result":{"envs":[{"obs":"AACAPwAA...","legal":[0,2,3,4,5],"acting_seat":1,"turn_seat":1,"phase":"PRE_ROLL","round":1,"rewards":[0,0,0,0],"terminated":false,"truncated":false,"outcome":null,"eliminated":[],"final_obs":{},"episode_start":{"episode":0,"seed":81723,"num_players":4,"jobs":["mage","swordsman","archer","ninja"],"agent_seat":1}},{"...":"..."}]}}
{"id":3,"cmd":"step","params":{"actions":[0,2]}}
{"id":3,"ok":true,"result":{"envs":[{"obs":"...","legal":[1,3,4,5,8],"acting_seat":1,"turn_seat":1,"phase":"POST_MOVE","round":1,"rewards":[0,0,0,0],"terminated":false,"truncated":false,"outcome":null,"eliminated":[],"final_obs":{}},
 {"obs":"...(새 에피소드)","legal":[0,2,3,4,5],"acting_seat":3,"turn_seat":3,"phase":"PRE_ROLL","round":1,"rewards":[0,0,-1,0],"terminated":true,"truncated":false,"outcome":null,"eliminated":[2],"final_obs":{"2":"..."},"episode_start":{"episode":1,"...":"..."}}]}}
{"id":4,"cmd":"step","params":{"actions":[7,0]}}
{"id":4,"ok":false,"error":{"code":"ILLEGAL_ACTION","message":"action 7 (BUY_SHIELD) not legal: coins 5 < price 6","env_index":0}}
{"id":5,"cmd":"close"}
{"id":5,"ok":true,"result":{}}
```

**오류 코드**: `BAD_REQUEST`(JSON·스키마 오류), `UNKNOWN_CMD`, `NOT_INITIALIZED`(reset 전 step), `BAD_CONFIG`, `VERSION_MISMATCH`, `ILLEGAL_ACTION`(상태 변화 없음), `EPISODE_OVER`(`auto_reset=false`에서 종료 후 step), `INTERNAL`(서버 상태 불명 → 클라이언트가 프로세스 재시작). `close` 후 서버는 종료한다. stdin EOF도 종료로 처리한다.

**결정성**: 같은 빌드·같은 `(seed, config, actions 열)` → 바이트 단위로 같은 응답 열. 게임 RNG는 엔진 state 안(소비 순서는 기획서 §9), 봇은 별도 정책 RNG(`DecisionContext.random`)를 쓰며 둘 다 에피소드 시드에서 파생된다. 서버는 wall-clock·`Math.random`을 쓰지 않는다.

## 8. Python 클라이언트 API (`python/rpgboard_env`, numpy만)

```python
RPGBoardEnv(mode="single", num_players=4, agent_seat="random", controlled_seats="all",
            jobs="random", opponents="heuristic", max_rounds=100, rules="default",
            reward_shaping=None, return_events=False, server_cmd=None, cwd=None,
            expect_obs_version="obs_v1", expect_act_version="act_v1", timeout=60.0)
RPGBoardVecEnv(num_envs=8, **위와 같은 인자)          # 항상 auto_reset
```
- 서버 실행 커맨드 우선순위: `server_cmd` 인자 > 환경변수 `RPGBOARD_ENV_CMD` > 기본 `node packages/sim/dist/env-server.js`. 문자열이면 `shlex.split`. 작업 폴더: `cwd` 인자 > `RPGBOARD_ROOT` > 패키지 위치에서 찾은 저장소 루트. 생성 시 `info`를 호출해 버전을 확인하고, 다르면 `RPGBoardEnvError("VERSION_MISMATCH")`. 기본 커맨드인데 `packages/sim/dist/env-server.js`가 없으면 `RPGBoardEnvError("SERVER_NOT_BUILT")`로 `pnpm install && pnpm build`를 안내한다(클라이언트 예외이며 §7 서버 오류 코드가 아님).
- 속성: `obs_dim`(253), `action_dim`(47), `obs_version`, `act_version`, `rules_version`, `action_names`(list[str]), `obs_layout`(list[dict]).
- 메서드: `reset(seed=None) -> (obs, info)`, `step(action) -> (obs, reward, terminated, truncated, info)`, `close()`(컨텍스트 매니저 지원). `RPGBoardEnv`는 `auto_reset=False`라 종료 후 `reset()`이 필요하다.
- 예외: `RPGBoardEnvError(code, message)`, 불법 행동은 하위 클래스 `IllegalActionError`(env 상태는 바뀌지 않음).

| 반환값 | `RPGBoardEnv` | `RPGBoardVecEnv` |
|---|---|---|
| `obs` | `float32 (253,)` | `float32 (N, 253)` |
| `reward` | single: `float`(에이전트 좌석) / selfplay: `float32 (4,)` | single: `float32 (N,)` / selfplay: `float32 (N, 4)` |
| `terminated`, `truncated` | `bool` | `bool (N,)` |
| `info["action_mask"]` | `bool (47,)` (종료 응답에서는 전부 False) | `bool (N, 47)` |
| `info["acting_seat"]`, `["turn_seat"]`, `["round"]` | `int` (종료 응답의 좌석 값은 `None`) | `int64 (N,)` |
| `info["phase"]` | `str` | `list[str]` |
| `info["seat_rewards"]` | `float32 (4,)` | `float32 (N, 4)` |
| `info["eliminated"]`, `["outcome"]`, `["final_obs"]`, `["episode_start"]` | 값 그대로(`final_obs`: `dict[int, float32 (253,)]`) | 길이 N 리스트 |

예시 — 사용자 numpy actor가 masked softmax로 행동을 고르는 루프(`python/examples/random_agent.py`의 확장형):
```python
import numpy as np
from rpgboard_env import RPGBoardEnv

def masked_softmax(logits, mask, temperature=1.0):
    z = np.where(mask, logits / temperature, -np.inf)
    p = np.exp(z - z.max())
    return p / p.sum()

env = RPGBoardEnv(mode="single", num_players=4, opponents="heuristic", max_rounds=100)
rng = np.random.default_rng(0)
W = rng.normal(0.0, 0.01, (env.obs_dim, env.action_dim)).astype(np.float32)  # 사용자 actor 자리
b = np.zeros(env.action_dim, dtype=np.float32)

for episode in range(10):
    obs, info = env.reset(seed=1000 + episode)
    done, ret = False, 0.0
    while not done:
        probs = masked_softmax(obs @ W + b, info["action_mask"])
        action = int(rng.choice(env.action_dim, p=probs))
        obs, reward, terminated, truncated, info = env.step(action)
        ret += reward
        done = terminated or truncated
    print(episode, ret, info["outcome"])
env.close()
```
- selfplay: `info["acting_seat"]`로 좌석별 정책·버퍼를 고르고, `reward`(4,)를 각 좌석의 마지막 전이에 더한다. `info["eliminated"]`의 좌석은 그 시점에 버퍼를 닫는다(§6). 상대 좌석에 사용자 모델의 고정 사본을 쓰면 numpy만으로 셀프플레이가 된다.

## 9. 게임 내 모델 통합 계약

**TS 인터페이스** (`packages/ai`, [architecture.md §9](architecture.md)와 동일)
```ts
interface Policy { readonly id: string; decide(ctx: DecisionContext): Action }
interface DecisionContext { view: PublicGameState; seat: SeatId; legal: readonly Action[]; random: () => number }
interface PolicyModel { readonly meta: ModelMeta; forward(obs: Float32Array): Float32Array }   // 길이 ACTION_DIM
type WeightAdapter = (raw: unknown) => PolicyModel;                                            // 형식 오류 시 ModelFormatError
interface ModelMeta {
  id: string;                                   // 파일명 기반 ('models/my-agent.json' → 'my-agent')
  obsVersion: string | null; actVersion: string | null;   // 사용자 메타에 있으면 채움
  output: 'logits' | 'probs'; obsDim: number; actionDim: number;
}
createModelPolicy(model: PolicyModel, opts?: { mode?: 'argmax' | 'sample'; temperature?: number }): Policy
```

**ModelPolicy 파이프라인**
1. `obs = encodeObservation(ctx.view, ctx.seat)` (Float32Array 253). 사용자 입력 정규화(평균·표준편차 등)는 어댑터의 `forward` 안에서 적용한다.
2. `scores = model.forward(obs)` (길이 47). `output = 'probs'`면 `log(max(p, 1e-12))`로 logits화.
3. `mask = maskFromLegal(view, seat, ctx.legal)`. 불법 인덱스는 −∞.
4. `mode = 'argmax'`(기본, 온라인·평가) 또는 `'sample'`: `softmax(logits / temperature)`에서 `ctx.random`으로 추출(기본 temperature 1.0).
5. `decodeAction` → 절대 좌석 `Action`.
6. 출력 길이 불일치·NaN·마스크 후 유효값 없음 → 그 결정 1회만 HeuristicBot으로 대체하고 경고 로그. 게임은 멈추지 않는다.
- critic 출력은 게임 플레이에 쓰지 않는다(패리티 테스트에서만 확인).
- 로드 검증: `obsDim = 253`, `actionDim = 47`, 영벡터 forward 결과 길이 47. 메타 버전이 있으면 `obs_v1`/`act_v1`과 일치해야 하며, 없으면 경고만 하고 허용한다(강제는 사용자 포맷 확정 후).

**사용자에게 요청할 정보** (어댑터 구현 전 필요)
1. 네트워크 구조: 층 수·크기, actor/critic 공유 여부(공유 trunk + 두 head 등), bias 유무.
2. 활성화 함수(은닉층·출력층 각각, 예: tanh/ReLU, 출력층 없음).
3. 행렬 배치 규칙: `y = x @ W + b`(W: [in, out]) 인지 `y = W @ x + b`(W: [out, in]) 인지, JSON 중첩 리스트의 행 우선 여부, dtype(float32/64).
4. 입력 정규화: 러닝 평균·표준편차 사용 여부, 그 값의 JSON 위치, 클리핑 범위.
5. actor 출력: logits인지 확률(softmax 포함)인지, 모델 내부에서 마스킹을 하는지.
6. critic 출력: 스칼라 1개인지, 보상 스케일·할인율(참고용).
7. JSON 키 구조를 보여 주는 작은 예시 파일.
8. **패리티 샘플**: env에서 뽑은 obs 5개 이상과 각 obs의 `info["action_mask"]`(47개 bool), 사용자 numpy 코드로 계산한 actor 원출력(마스크 적용 전 47개)과 critic 값. 파일 형식은 사용자 편의대로 정하되 이 네 항목은 들어 있어야 한다(일부 행동이 막힌 마스크 포함 권장).

**권장 메타데이터** (강제 아님): `"obs_version": "obs_v1"`, `"act_version": "act_v1"`, `"obs_dim": 253`, `"action_dim": 47`, `"output": "logits"`, `"rules_version"`, 학습 설정 요약.
**파일 위치**: `models/<name>.json` (파일명 `^[a-z0-9_-]+\.json$`, 서버 `MODELS_DIR` 허용 목록만 로드), 패리티 샘플은 `models/parity/<name>.json`(하위 폴더는 레지스트리가 스캔하지 않음). 어댑터는 포맷 수령 후 `packages/ai/src/model/adapters/`에 구현하고, 그 전까지 model 좌석은 UI에서 "준비 중"으로 비활성화한다.

## 10. 내장 봇

| 봇 | 이름(env `opponents`) | 동작 | 용도 |
|---|---|---|---|
| RandomBot | `random`, `random:uniform` | 기본: 합법 행동의 **종류**를 먼저 균등 선택한 뒤 인자를 균등 선택. `CHALLENGE_DRAGON`은 가중치 1%(설정 가능). `uniform`은 합법 인덱스 순수 균등 | 스모크 테스트, 최하 기준선 |
| HeuristicBot | `heuristic`(좌석별 성향 무작위), `heuristic:{aggro,growth,rush}` | **아래 요약이 정본**이다. 설계 단계 Python 프로토타입(`hero_sim.py` "Heuristic bots")을 옮긴 것이며, 프로토타입은 저장소 밖 참고 자료다(보관 여부는 개발 계획서 D11) | 학습 상대, 평가 기준선, 온라인 대리 플레이 |

**HeuristicBot 요약** (규칙 수치는 모두 `RulesConfig`에서 읽는다. `wp` = 추정 승률)
- 승률 추정: 실제 전투 규칙 그대로의 몬테카를로(PvP 192회, 용 320회), 스탯 프로필 `(직업, hp, maxHp, atk, def, 불굴 잔여)` 키로 캐시. 난수는 `DecisionContext.random`만 사용(결정적).
- 전투력 지표 `race(A, B) = ln(hA / eB) − ln(hB / eA)`(> 0이면 A 우세). `eX` = X의 1회 기대 피해 = `mean_{d=1..6} max(1, atk − def' + d)`(def' = 마법사면 `floor(def/2)`). 광전사는 0.6·보통 + 0.4·광폭화 값, 용은 `((k−1)·보통 + def 0 값) / k`(k = `breathEvery`), 피격자가 닌자면 ×(1 − 회피 확률), 하한 0.05. `hX = maxHp + 상대 e × 불굴 잔여`, 상대가 궁수면 −3. "타격 수"는 올림 없는 연속값 `h / e`다.
- 강화: `score = wd·race(나, 용) + wp·mean race(나, 생존 상대)`. 예산(코인 − 저축) 안에서 Δscore/비용이 최대(> 0)인 스탯을 반복 구매. 저축 = 방어막이 없으면 방어막 가격 + (aggro만) 텔레포트가 없으면 텔레포트 가격.
- 칸 가치 `V(t)`: 코인 증감(손실은 보유 코인까지) + HP(회복 `min(Δ, 잃은 HP)`×0.45, 피해 `min(Δ, hp−1)`×0.35, hp ≥ maxHp/2이면 둘 다 ×0.2) + 무료 스탯 `3 + 해당 레벨` + 아이템 5 − 쉼 4 + 수련장 `2 + 최소 레벨` + 상점 3(coins ≥ 최저 가격 ∧ (저축 > 0 ∨ 도둑 0개)) + 동굴 = 카드 10장 평균 + 출발 보너스(통과 시) + PvP 기대값 `wp·(상대 코인/2 + 상대 아이템 가격 합 + 12) − (1−wp)·(60 + 내 코인)`(점유자 중 wp 최대 상대. 초반 보호·안전지대 제외. 상대 방어막 ∧ wp > 0.5면 0, 내 방어막 ∧ wp < 0.5면 −방어막 가격).
- 용 도전: 가진 코인 전부를 `race(·, 용)` 기준으로 강화했다고 가정한 스탯의 wp(그 race < −0.9면 0)가 임계 이상이면 그 강화를 실행하고 도전. 임계 = 성향 값 − 0.01·max(0, round − 40), 생존 2인이고 상대의 같은 추정 ≥ 0.5면 −0.12, 하한 0.35.
- 텔레포트(턴당 최대 1회 사용, 프로토타입과 동일): ① 사냥 = 안전지대·내 칸이 아닌 칸에 혼자 있는 상대 중 wp ≥ 사냥 임계(상대 방어막 ∧ wp > 0.5 제외), `wp·(코인/2 + 아이템 가격 합 + 12)` 최대 ② 여관 = hp ≤ maxHp·inn_frac ∧ 잃은 HP ≥ 12 ③ (PRE_ROLL만) 상점 = coins ≥ 방어막 + 도둑 가격 + 2 ∧ (앞쪽 가장 가까운 상점까지 7칸 이상 ∨ 상점 위) ∧ (방어막 0개 ∨ (도둑 0개 ∧ 최다 코인 상대 ≥ 7))일 때 현재 칸이 아닌 상점 중 V 최대(V > 0) ④ (PRE_ROLL만) 경제 점프 = `max_t V(t) − mean_d V(주사위 착지)` ≥ tp_econ(보유 2장 이상이면 −2)인 칸.
- 구매(반복): 위협(어떤 상대의 나에 대한 wp ≥ 0.5)이면 방어막 → 도둑 0개 ∧ 최다 코인 상대 ≥ thief_min이면 도둑 → 텔레포트 < want_tp ∧ coins ≥ 가격 + tp_buy_spare면 텔레포트 → hp ≤ 40% ∧ 잃은 HP ≥ 15면 탈출용 텔레포트. 도둑 사용: 최다 코인 상대가 ≥ 7, 또는 ≥ thief_min이고 3턴 이상 보유, 또는 ≥ 2이고 8턴 이상 보유.
- 결정 순서: PRE_ROLL(도둑 → 용 도전 → 강화 → 텔레포트 → 주사위), MOVE_ADJUST(d−1/d/d+1의 V 비교, 이득 ≥ 2이거나 보정 없을 때 V ≤ −20(재앙 회피)일 때만 보정), CHOOSE_PVP_TARGET(`wp − (상대 방어막 ∧ wp > 0.5 ? 1 : 0)` 최대, 동률은 코인), SHIELD_DECISION(wp < 0.5면 사용), TRAINING_CHOICE(Δscore 최대), POST_MOVE(구매 → 도둑 → 텔레포트 ①② → 강화 → END_TURN).

| 성향 | wd / wp | 용 임계 | 사냥 임계 | want_tp | thief_min | inn_frac | tp_econ | tp_buy_spare |
|---|---|---|---|---|---|---|---|---|
| aggro | 0.35 / 0.65 | 0.55 | 0.70 | 1 | 6 | 0.35 | 5 | 0 |
| growth | 0.6 / 0.4 | 0.60 | 0.80 | 1 | 7 | 0.45 | 6 | 4 |
| rush | 1.0 / 0 | 0.48 | 0.85 | 0 | 7 | 0.5 | 6 | 99 |

- 기준선 지표(밸런스 결과): 4인에서 무작위 정책 좌석 승률 3.5%(공정 25%), 2인 12.9%(공정 50%). 온라인 대리 플레이(연결 끊김·연속 시간 초과, 기획서 §13 재접속)는 `heuristic:growth`.

## 11. 테스트 계획 (TDD, Vitest + fast-check, Python은 pytest)

| 테스트 | 위치(예정) | 내용 |
|---|---|---|
| 레이아웃 | `packages/ai/test/obs.layout.test.ts` | `OBS_V1_LAYOUT` offset 연속성, 마지막 offset + length = 253, `ACTION_NAMES.length = 47`, 모든 값 ∈ [0, 2], 원-핫 합 ∈ {0, 1} |
| obs 골든 | `packages/ai/test/obs.golden.test.ts` + `fixtures/obs_v1/*.json` | 고정 시드 + 행동 스크립트(4인·3인·2인, 탈락·방어자 결정·닌자 보정·수련장 포함)의 관측 벡터 스냅샷. 버전 상수 변경 없이 바뀌면 실패 |
| 마스크 ↔ 합법 | `packages/ai/test/mask.property.test.ts` | 임의 시드·인원·직업 + 임의 합법 행동 열: §5 불변식 1·2, `encode∘decode = id`, 마스크가 §5 표의 조건과 일치(코인 경계, canBuy, 도둑 대상 0코인, 주사위 1의 −1, 현재 칸 텔레포트) |
| 결정성 | `packages/ai`, `packages/sim` | 같은 시드 + 같은 행동 열 → 같은 obs 바이트 열. env 서버 프로세스 2개에서 같은 응답 열 |
| env 프로토콜 계약 | `packages/sim/test/env-server.contract.test.ts` | spawn → info/reset/step/close 왕복, 스키마 검증, `ILLEGAL_ACTION` 원자성(상태 불변), 자동 리셋 필드, 탈락 시 `rewards`/`final_obs`, truncation, 오류 코드, stdout에 로그 없음 |
| Python 클라이언트 | `python/tests/test_client.py` | shape·dtype(§8 표), b64 디코딩, 버전 불일치 예외, 예제 루프 1판 완주 |
| 모델 패리티 | `packages/ai/test/model.parity.test.ts` | 사용자 샘플(`models/parity/<name>.json`)에 대해 TS 어댑터 forward(actor 원출력·critic)와 numpy 결과 비교: `abs(ts − ref) ≤ 1e-5 + 1e-5·abs(ref)`(패리티 허용 오차의 정본, 사용자와 합의해 조정), 샘플 마스크 적용 후 argmax 일치. 어댑터 구현 시 추가 |
| 봇 회귀 | `packages/sim` | RandomBot 좌석 승률·HeuristicBot 대전 지표가 기획서 §15 지표 범위 안(시드 고정, CI용 소규모) |
