# 학습 가이드 — `rpgboard_env`

numpy Actor-Critic으로 "드래곤 러쉬"를 학습시키기 위한 안내서다. 이 문서는 실제 코드 기준의 요약본이고, 계약의 정본은 [docs/ai-interface-spec.md](../docs/ai-interface-spec.md)다(관측 §3, 행동 §4, 마스크 §5, 보상 §6, env 프로토콜 §7, Python API §8, 모델 통합 §9).

- 관측: `obs_v1`, float32 **253개**
- 행동: `act_v1`, 이산 **47개** + 행동 마스크
- 의존성: numpy만 (gymnasium·torch 없음)

## 1. 빠른 시작

```bash
pnpm install && pnpm build        # 저장소 루트에서. env 서버(packages/sim/dist/env-server.js)를 만든다
pip install -e python/            # 이 패키지 설치
python python/examples/random_agent.py --episodes 20
```

```python
import numpy as np
from rpgboard_env import RPGBoardEnv

env = RPGBoardEnv(mode="single", num_players=4, opponents="heuristic", max_rounds=100)
obs, info = env.reset(seed=0)                 # obs: float32 (253,)
while True:
    logits = my_actor(obs)                    # (47,)
    logits = np.where(info["action_mask"], logits, -np.inf)
    p = np.exp(logits - logits.max()); p /= p.sum()
    action = int(np.random.choice(47, p=p))
    obs, reward, terminated, truncated, info = env.step(action)
    if terminated or truncated:
        break
env.close()
```

## 2. step 하나 = 결정 하나

- 한 턴 안에서 여러 번 결정한다. 예: 강화 → 강화 → 주사위 → (이동 후) 상점 구매 → 턴 종료. 각각이 `step` 한 번이다.
- 상대 봇의 차례와 자동 구간(이동, 전투, 칸 이벤트)은 `step` 안에서 모두 진행된다. 다음 `obs`는 항상 **내가 다음에 결정할 시점**이다.
- 선택지가 1개뿐인 결정은 엔진이 자동으로 처리한다. 그래서 받는 결정은 **항상 합법 행동이 2개 이상**이다.
- 에피소드 길이(휴리스틱 봇끼리 대전 기준): 좌석당 결정 수 중앙값 **약 40회**, 95퍼센타일 약 75회다.
- phase 비율은 대략 `PRE_ROLL` 49%, `POST_MOVE` 39~42%, `MOVE_ADJUST` 5%, `SHIELD_DECISION` 2~4%, `TRAINING_CHOICE` 2%, `CHOOSE_PVP_TARGET` 0.1%다.
- 남의 턴에도 결정할 때가 있다. 내가 방어막을 가진 상태로 공격받으면 `SHIELD_DECISION`이 온다. `info["turn_seat"] != info["acting_seat"]`로 구분하고, 관측의 `g.turnPlayer`(228~231)에도 나타난다.

## 3. 관측 `obs_v1` (253)

**자기중심**이다. 항상 지금 결정하는 좌석의 시점이다. 모든 값은 [0, 2] 범위다. 스케일 특징은 `clip(x / S, 0, 2)`로 만들고, one-hot과 플래그는 0 또는 1이다.
스케일 상수: HP 120, ATK/DEF 20, 코인 50, 강화 레벨 10, 아이템 개수 3, 라운드 100, 거리 23.

### 3.1 자기 블록 (0~50)
| 인덱스 | 이름 | 내용 |
|---|---|---|
| 0–4 | `self.job` | 직업 one-hot [swordsman, archer, mage, ninja, berserker] |
| 5–28 | `self.pos` | 현재 칸 one-hot (0~23, 칸 목록은 §4.1) |
| 29 / 30 / 31 | `self.hp` / `self.maxHp` / `self.hpRatio` | hp/120, maxHp/120, hp/maxHp |
| 32 / 33 / 34 | `self.atk` / `self.def` / `self.coins` | atk/20, def/20, coins/50 |
| 35–37 | `self.upgradeLvl` | [atk, def, maxHp] 강화 레벨/10 |
| 38–40 | `self.upgradeCost` | [atk, def, maxHp] 다음 강화 비용/50 |
| 41–43 | `self.itemCount` | [teleport, shield, thief] 개수/3 |
| 44–46 | `self.hasItem` | 위 3종 보유 여부 |
| 47 | `self.skipNextTurn` | 쉬는 턴 예정 또는 진행 중(이번 턴에는 이동 불가) |
| 48 | `self.indomitableReady` | 검사이고 불굴이 남아 있음 |
| 49 | `self.rageActive` | 광전사이고 hp ≤ maxHp/2 |
| 50 | `self.ninjaCooldown` | 닌자 보정 쿨다운/2 |

탈락한 뒤의 종료 관측에서는 `self.job`만 남고 나머지는 0이다.

### 3.2 상대 블록 3개 (각 54칸)
**상대 k** = 절대 좌석 `(내 좌석 + k) mod 인원`이다. 상대1은 **내 다음 차례**다. 블록 시작 인덱스는 상대1 **51**, 상대2 **105**, 상대3 **159**다(블록 시작 + r).

| r | 이름 | 내용 |
|---|---|---|
| 0 / 1 | `present` / `alive` | 이 게임에 있는 좌석 / 생존. 빈 좌석은 블록 전체가 0이고, 탈락 좌석은 `present`만 1 |
| 2–6 | `job` | 직업 one-hot |
| 7–30 | `pos` | 칸 one-hot |
| 31 | `fwdDist` | 내 위치에서 그 상대까지 전진 거리/23 |
| 32 / 33 / 34 | `sameTile` / `iCanReach` / `canReachMe` | 같은 칸 / 내 주사위(1~6)로 닿음 / 상대 주사위로 내 칸에 닿음 |
| 35 / 36 / 37 | `hp` / `maxHp` / `hpRatio` | 자기 블록과 같은 스케일 |
| 38 / 39 / 40 | `atk` / `def` / `coins` | 〃 |
| 41–43 | `upgradeLvl` | 강화 레벨/10 |
| 44–46 / 47–49 | `itemCount` / `hasItem` | 아이템 개수/3, 보유 여부 (모든 정보는 공개) |
| 50 / 51 / 52 / 53 | `skipNextTurn` / `indomitableReady` / `rageActive` / `ninjaCooldown` | 상태 플래그 |

### 3.3 전역 블록 (213~252)
| 인덱스 | 이름 | 내용 |
|---|---|---|
| 213 / 214 / 215 | `g.round` / `g.maxRounds` / `g.roundsLeftFrac` | round/100, maxRounds/100, 남은 라운드 비율 (무제한이면 0) |
| 216 / 217 | `g.graceLeft` / `g.pvpEnabled` | 초반 보호 남은 라운드/3, 이번 라운드에 PvP 가능 여부(라운드 4부터 1) |
| 218–220 | `g.numPlayers` | 시작 인원 one-hot [2, 3, 4] |
| 221 | `g.aliveCount` | 생존자 수/4 |
| 222–227 | `g.phase` | [PRE_ROLL, MOVE_ADJUST, CHOOSE_PVP_TARGET, SHIELD_DECISION, TRAINING_CHOICE, POST_MOVE] |
| 228–231 | `g.turnPlayer` | 턴 플레이어 [나, 상대1, 상대2, 상대3]. 내가 아니면 남의 턴에 하는 결정 |
| 232–237 | `g.dice` | 이번 턴 주사위 눈 1~6 (굴리기 전이면 0) |
| 238 / 239 | `g.canBuy` / `g.thiefUsed` | 이번 턴 상점에 도착함 / 이번 턴 도둑 사용함 |
| 240 / 241 | `g.teleportsUsed` / `g.teleportLimitReached` | 이번 턴 텔레포트 사용 수/2, 턴당 상한 도달(기본 무제한이라 0) |
| 242 / 243 | `g.pvpAmArriver` / `g.pvpAmDefender` | 진행 중인 결투에서 내가 도착자 / 방어자 |
| 244–246 | `g.pvpOpponent` | 결투 상대 one-hot [상대1, 상대2, 상대3] |
| 247–249 | `g.dragonHp/Atk/Def` | 용 스탯(규칙 상수: 115/120, 10/20, 6/20) |
| 250–252 | `g.itemPrice` | [teleport, shield, thief] 가격/50 |

이름으로 보고 싶을 때는 다음처럼 한다.

```python
d = env.describe(obs)            # {"self.coins": 0.1, "self.job": [0,0,1,0,0], ...}
env.obs_layout                   # [{"name", "offset", "length"}, ...] 서버가 주는 레이아웃
```

## 4. 행동 `act_v1` (47)

| 인덱스 | 이름 | 의미 | 가능한 phase |
|---|---|---|---|
| 0 | `ROLL_DICE` | 주사위 굴리기 | PRE_ROLL (쉬는 턴 제외) |
| 1 | `END_TURN` | 턴 종료 | POST_MOVE, 쉬는 턴의 PRE_ROLL |
| 2 | `CHALLENGE_DRAGON` | 용 도전 (지면 탈락) | PRE_ROLL |
| 3–5 | `UPGRADE_ATK/DEF/MAXHP` | 코인으로 스탯 강화 | PRE_ROLL, POST_MOVE |
| 6–8 | `BUY_TELEPORT/SHIELD/THIEF` | 아이템 구매 | POST_MOVE (상점 도착 시) |
| 9–32 | `TELEPORT_T00`~`T23` | 칸 (인덱스−9)로 텔레포트 | PRE_ROLL, POST_MOVE |
| 33–35 | `THIEF_OPP1/2/3` | 상대 k에게 도둑 사용 | PRE_ROLL, POST_MOVE |
| 36–38 | `ADJUST_M1/0/P1` | 닌자 이동 보정 −1/0/+1 | MOVE_ADJUST |
| 39–40 | `SHIELD_NO/YES` | 방어막 미사용/사용 | SHIELD_DECISION |
| 41–43 | `PVP_TARGET_OPP1/2/3` | 결투 상대 선택 | CHOOSE_PVP_TARGET |
| 44–46 | `TRAIN_ATK/DEF/MAXHP` | 수련장 무료 강화 | TRAINING_CHOICE |

- **마스크가 정답이다.** `info["action_mask"]`(bool 47)에서 True인 것만 고른다. 불법 행동을 보내면 `IllegalActionError`가 나고 상태는 바뀌지 않는다. `info["legal"]`에는 합법 인덱스 목록이 있다.
- 이름 목록은 `env.action_names`에 있다.

### 4.1 칸 번호 (텔레포트 대상, `self.pos`)
0 출발(안전지대) · 1 고블린 · 2 독 늪 · 3 약초 · 4 산적 · 5 수련장 · **6 상점** · 7 늑대 · 8 가시 함정 · 9 보물 · 10 소매치기 · 11 대장장이 · **12 여관(HP +20)** · 13 오크 · 14 저주 제단 · 15 행운의 샘 · 16 낙석 · 17 미지의 동굴 · **18 상점** · 19 트롤 · 20 거미줄(쉼) · 21 떠돌이 상인 · 22 폭풍 · 23 미지의 동굴. 칸별 효과 수치는 [기획서 §5](../docs/game-design.md)에 있다.

## 5. 보상과 종료

| 상황 | 보상 | 플래그 |
|---|---|---|
| 내가 승리 (용 처치 또는 최후 생존) | +1 | `terminated` |
| 내가 탈락 (결투 패배 또는 용 도전 실패) | −1 | `terminated`. single 모드에서는 남은 게임을 진행하지 않고 `outcome=None` |
| 남이 이겨서 게임 종료 | −1 | `terminated` |
| `max_rounds` 도달 | 0 | `truncated` (부트스트랩할지는 직접 결정) |

- 기본은 **희소 보상**이다. 선택적 shaping은 `RPGBoardEnv(reward_shaping={"coins": 0.01, "stats": 0.05, "kill": 0.3, "dragon_try": 0})`처럼 켠다. 기본값은 모두 0이다. 각 항목은 코인 변화, `(atk + def + maxHp/6)` 변화, 결투로 탈락시킨 수, 용 도전 횟수에 곱해진다.
- `info["outcome"]`은 `{"kind": "dragon"|"lastSurvivor"|"draw", "winner": 좌석}` 형태다. `info["final_obs"]`에는 끝난 좌석의 종료 관측이 들어 있다(`{좌석: (253,)}`).

## 6. 모드와 옵션

| 인자 | 기본값 | 설명 |
|---|---|---|
| `mode` | `"single"` | `single`: 내 좌석 1개, 나머지는 내장 봇 / `selfplay`: `controlled_seats`의 모든 결정을 내가 내림 |
| `num_players` | 4 | 2~4, 또는 `[2, 3, 4]`처럼 목록을 주면 에피소드마다 무작위 |
| `agent_seat` | `"random"` | single 전용. 좌석 번호 = 턴 순서(0이 선) |
| `controlled_seats` | `"all"` | selfplay 전용 |
| `opponents` | `"heuristic"` | `random`, `random:uniform`, `heuristic`(성향 무작위), `heuristic:aggro`/`growth`/`rush`, 또는 좌석별 목록 |
| `jobs` | `"random"` | 좌석별 직업 목록으로 고정 가능 |
| `max_rounds` | 100 | `None`이면 무제한 |
| `server_cmd`, `cwd` | — | env 서버 실행 커맨드와 저장소 루트 (환경변수 `RPGBOARD_ENV_CMD`, `RPGBOARD_ROOT`) |

- **배치**: `RPGBoardVecEnv(num_envs=64, ...)`를 쓴다. 끝난 env는 자동으로 리셋되고, 반환 배열 앞에 `N` 축이 붙는다. 64 env 셀프플레이 기준 약 21,000 step/s다.
- **셀프플레이**: `reward`는 좌석별 `(4,)` 배열이다. `info["acting_seat"]`로 그 결정을 어느 좌석 버퍼에 넣을지 고르고, 탈락이나 종료 시에는 해당 좌석 버퍼의 마지막 전이에 `reward[seat]`를 더한다.
- **결정성**: 같은 `seed`와 같은 행동 열이면 같은 궤적이 나온다.

## 7. 기준선 (P3 시뮬)

- 무작위 정책 좌석의 승률은 4인 5.4%, 2인 18.6%다. 휴리스틱 봇끼리는 공정 승률(4인 25%) 근처다.
- 한 판 평균 23.5라운드이고, 용 처치로 끝나는 비율이 62%다. 휴리스틱 봇의 용 도전 성공률은 73%다.
- 무작위 정책은 `CHALLENGE_DRAGON`(2번)을 자주 눌러 금방 탈락한다. 초반에는 이 행동의 로짓을 낮게 초기화하거나, `opponents="random"`으로 쉬운 상대부터 시작하는 것도 방법이다.

## 8. 학습한 모델을 게임에 넣으려면

다음을 보내 주면 TS 어댑터를 구현하고 패리티 테스트로 검증한다(자세한 양식은 [spec §9](../docs/ai-interface-spec.md)).
1. 가중치 JSON 예시 파일과 키 구조
2. 네트워크 구조(층 크기, actor/critic 공유 여부), 활성화 함수
3. 행렬 배치 규칙: `x @ W`인지 `W @ x`인지, dtype
4. 입력 정규화를 쓰는지(평균·표준편차의 위치), actor 출력이 logits인지 확률인지
5. **패리티 샘플**: env에서 뽑은 obs 5개 이상 + 각 `action_mask` + numpy actor 출력(마스크 전 47개) + critic 값

파일은 `models/<이름>.json`에, 패리티 샘플은 `models/parity/<이름>.json`에 둔다.
