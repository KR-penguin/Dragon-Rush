# 학습 가이드 — `rpgboard_env`

numpy Actor-Critic으로 "드래곤 러쉬"를 학습시키기 위한 안내서다. 이 문서는 실제 코드 기준의 요약본이고, 계약의 정본은 [docs/ai-interface-spec.md](../docs/ai-interface-spec.md)다(관측 §3, 행동 §4, 마스크 §5, 보상 §6, env 프로토콜 §7, Python API §8, 모델 통합 §9).
세 과제의 실행 명령·배열 형태·리셋·모델 JSON 준비물은 [AI 학습 환경 시작 가이드](../docs/training-environments.md)에 모았다.

- 관측: `obs_v2`, float32 **257개**
- 행동: `act_v1`, 이산 **47개** + 행동 마스크
- 의존성: numpy만 (gymnasium·torch 없음)
- **전투 모델은 별도 모델·별도 env**다(`PvPCombatEnv`/`DragonCombatEnv`, `cobs_v1`/`cact_v1`). 보드 가중치와 전투 가중치는 호환되지 않는다. §9를 본다.

## 1. 빠른 시작

```bash
pnpm install && pnpm build        # 저장소 루트에서. env 서버(packages/sim/dist/env-server.js)를 만든다
pip install -e python/            # 이 패키지 설치
```

`python/rpgboard_env/env.py`의 기본 기대 관측 버전은 `obs_v2`다. 아래처럼 명시해도 같으며, 예제 스크립트도 기본 설정으로 실행할 수 있다.

```python
import numpy as np
from rpgboard_env import RPGBoardEnv

rng = np.random.default_rng(0)
env = RPGBoardEnv(mode="single", num_players=4, opponents="heuristic", max_rounds=100,
                  combat_resolver="sim", expect_obs_version="obs_v2")
obs, info = env.reset(seed=0)                 # obs: float32 (257,)
while True:
    logits = np.zeros(env.action_dim)         # 예제용 균등 로짓; 학습한 actor(obs)로 교체
    logits = np.where(info["action_mask"], logits, -np.inf)
    p = np.exp(logits - logits.max()); p /= p.sum()
    action = int(rng.choice(env.action_dim, p=p))
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

## 3. 관측 `obs_v2` (257)

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
| 32 / 33 / 34 | `sameTile` / `iCanReach` / `canReachMe` | 같은 칸 / 내 이동 주사위(기본 1~10)로 닿음 / 상대 이동 주사위로 내 칸에 닿음 |
| 35 / 36 / 37 | `hp` / `maxHp` / `hpRatio` | 자기 블록과 같은 스케일 |
| 38 / 39 / 40 | `atk` / `def` / `coins` | 〃 |
| 41–43 | `upgradeLvl` | 강화 레벨/10 |
| 44–46 / 47–49 | `itemCount` / `hasItem` | 아이템 개수/3, 보유 여부 (모든 정보는 공개) |
| 50 / 51 / 52 / 53 | `skipNextTurn` / `indomitableReady` / `rageActive` / `ninjaCooldown` | 상태 플래그 |

### 3.3 전역 블록 (213~256)
| 인덱스 | 이름 | 내용 |
|---|---|---|
| 213 / 214 / 215 | `g.round` / `g.maxRounds` / `g.roundsLeftFrac` | round/100, maxRounds/100, 남은 라운드 비율 (무제한이면 0) |
| 216 / 217 | `g.graceLeft` / `g.pvpEnabled` | 초반 보호 남은 라운드/3, 이번 라운드에 PvP 가능 여부. `rush-8` 기본 규칙은 보호가 없어 시작부터 각각 0 / 1 |
| 218–220 | `g.numPlayers` | 시작 인원 one-hot [2, 3, 4] |
| 221 | `g.aliveCount` | 생존자 수/4 |
| 222–227 | `g.phase` | [PRE_ROLL, MOVE_ADJUST, CHOOSE_PVP_TARGET, SHIELD_DECISION, TRAINING_CHOICE, POST_MOVE] |
| 228–231 | `g.turnPlayer` | 턴 플레이어 [나, 상대1, 상대2, 상대3]. 내가 아니면 남의 턴에 하는 결정 |
| 232–241 | `g.dice` | 이번 턴 이동 주사위 눈 1~10 원-핫 (굴리기 전이면 0) |
| 242 / 243 | `g.canBuy` / `g.thiefUsed` | 이번 턴 상점에 도착함 / 이번 턴 도둑 사용함 |
| 244 / 245 | `g.teleportsUsed` / `g.teleportLimitReached` | 이번 턴 텔레포트 사용 수/2, 턴당 상한 도달(기본 무제한이라 0) |
| 246 / 247 | `g.pvpAmArriver` / `g.pvpAmDefender` | 진행 중인 결투에서 내가 도착자 / 방어자 |
| 248–250 | `g.pvpOpponent` | 결투 상대 one-hot [상대1, 상대2, 상대3] |
| 251–253 | `g.dragonHp/Atk/Def` | 용 스탯(`rush-8`: 88/120, **clip(50/20, 0, 2) = 2**, 10/20). `obs_v2` 레이아웃·정규화는 그대로이며 골든 벡터만 갱신 |
| 254–256 | `g.itemPrice` | [teleport, shield, thief] 가격/50 |

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
0 출발(PvP 가능) · 1 고블린 · 2 독 늪 · 3 약초 · 4 산적 · 5 수련장 · **6 상점** · 7 늑대 · 8 가시 함정 · 9 보물 · 10 소매치기 · 11 대장장이 · **12 여관(HP +20)** · 13 오크 · 14 저주 제단 · 15 행운의 샘 · 16 낙석 · 17 미지의 동굴 · **18 상점** · 19 트롤 · 20 거미줄(쉼) · 21 떠돌이 상인 · 22 폭풍 · 23 미지의 동굴. 칸별 효과 수치는 [기획서 §5](../docs/game-design.md)에 있다.

## 5. 보상과 종료

| 상황 | 보상 | 플래그 |
|---|---|---|
| 내가 승리 (용 처치 또는 최후 생존) | +1 | `terminated` |
| 내가 탈락 (결투 패배 또는 용 도전 실패) | −1 | `terminated`. single 모드에서는 남은 게임을 진행하지 않고 `outcome=None` |
| 남이 이겨서 게임 종료 | −1 | `terminated` |
| `max_rounds` 도달 | 0 | `truncated` (부트스트랩할지는 직접 결정) |

- 기본은 **희소 보상**이다. 선택적 shaping은 `RPGBoardEnv(reward_shaping={"coins": 0.01, "stats": 0.05, "kill": 0.3, "dragon_try": 0})`처럼 켠다. 기본값은 모두 0이다. 각 항목은 코인 변화, `(atk + def + maxHp/6)` 변화, 결투로 탈락시킨 수, 용 도전 횟수에 곱해진다.
- `info["outcome"]`은 `{"kind": "dragon"|"lastSurvivor"|"draw", "winner": 좌석}` 형태다. `info["final_obs"]`에는 끝난 좌석의 종료 관측이 들어 있다(`{좌석: (257,)}`).

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
| `combat_resolver` | `"sim"` | `sim`: 두 `scripted:balanced` 봇의 실제 60Hz 전투 / `dice`: 선택형 빠른 전투의 6면 주사위 판정. 관측 `obs_v2`는 동일 |

| `rules`, `reward_shaping`, `return_events` | `"default"`, `None`, `False` | 보드 규칙 일부 덮어쓰기 / §5 보상 계수 / 전이 이벤트 포함 |
| `server_cmd`, `cwd` | — | env 서버 실행 커맨드와 저장소 루트 (환경변수 `RPGBOARD_ENV_CMD`, `RPGBOARD_ROOT`) |

- **배치**: `RPGBoardVecEnv(num_envs=64, ...)`를 쓴다. 끝난 env는 자동으로 리셋되고, 반환 배열 앞에 `N` 축이 붙는다. 기본 `sim`은 전투를 실제 60Hz로 실행하므로 과거 결과 예측기 기반 처리량 수치는 적용되지 않는다. 현재 처리량은 별도로 측정해야 한다.
- **셀프플레이**: `reward`는 좌석별 `(4,)` 배열이다. `info["acting_seat"]`로 그 결정을 어느 좌석 버퍼에 넣을지 고르고, 탈락이나 종료 시에는 해당 좌석 버퍼의 마지막 전이에 `reward[seat]`를 더한다.
- **결정성**: 같은 `seed`와 같은 행동 열이면 같은 궤적이 나온다.

## 7. 기준선 (실제 60Hz 전투)

- **현행 측정**: `rush-8`/`combat-4` 4인 휴리스틱·스크립트 봇 1,000판(seed 2026, 8 workers, 실제 60Hz 전투)은 평균 20.386(중앙 18)/p95 43라운드, 용 처치 종료 13.9%, 용 도전 성공률 59.15%, 판당 PvP 2.762회, 3라운드 안 좌석 탈락 30.75%, 무승부 0%다. 직업별 조건부 승률은 검사/궁수/마법사/닌자/광전사 17.95/14.43/30.87/42.32/18.87%다. 사람 플레이 결과가 아니며 조건과 명령은 [기획서 §15](../docs/game-design.md#15-밸런스-근거)를 본다.
- **과거 기록**: 이전 `rush-6` 4인 휴리스틱 봇 4,000판(seed 2026, 4 workers, 당시 제거된 결과 예측기로 보드 봇 판단): 평균 4.37(중앙 4)/p95 9라운드, 용 처치 종료 42.9%, 판당 PvP 1.38회, 3라운드 안 좌석 탈락 44.5%, 무승부 0%. 이는 현재 코드의 성능 추정치가 아니다.

- **과거 기록**: 이전 `rush-4`의 4인 휴리스틱 8,000판(당시 제거된 결과 예측기를 보드 봇 판단에 사용, 실제 전투 결과는 60Hz `sim`): 평균 5.93(중앙 6)/p95 10라운드, 용 처치 종료 46.5%, 직업 승률 검/궁/마/닌/광 18.9/26.2/34.7/25.5/19.6%, 3라운드 안 좌석 탈락 22.6%. 3인·2인 실측은 [기획서 §15](../docs/game-design.md)를 본다. 당시 라운드 1~2 PvP 보호가 있었고, 현재 명령으로 동일 결과를 재현할 수 없다.
- 이전 `rush-3`·`rush-2`의 4인 실측은 역사적 기준이다. 현재 규칙의 수치로 사용하지 않는다.

- `rush-2`의 4인 휴리스틱 8,000판(당시 `rush-2` 내장 모델 사용): 평균 7.67라운드, 중앙 8, p95 11, 용 처치 종료 61.3%, 직업 승률 22.1~29.1%, 3라운드 안 탈락 3.1%. 보드 턴당 10초 가정과 실제 sim 전투 시간 합산 평균 5.19분이었다. 현재 규칙·모델의 재현 명령이 아니다.
- `rush-1`의 주사위 전투 결과(4인 용 처치 종료 87.5%)나 그 규칙에서 학습한 보드 정책을 현재 기준선으로 사용하지 않는다. 전투 정책과 보드 정책은 각각 별도 env에서 학습한다.
- 무작위 정책은 `CHALLENGE_DRAGON`(2번)을 자주 눌러 금방 탈락한다. 초반에는 이 행동의 로짓을 낮게 초기화하거나, `opponents="random"`으로 쉬운 상대부터 시작하는 것도 방법이다.

## 8. 학습한 모델을 게임에 넣으려면

다음을 보내 주면 TS 어댑터를 구현하고 패리티 테스트로 검증한다(자세한 양식은 [spec §9](../docs/ai-interface-spec.md)).
1. 가중치 JSON 예시 파일과 키 구조
2. 네트워크 구조(층 크기, actor/critic 공유 여부), 활성화 함수
3. 행렬 배치 규칙: `x @ W`인지 `W @ x`인지, dtype
4. 입력 정규화를 쓰는지(평균·표준편차의 위치), actor 출력이 logits인지 확률인지
5. **패리티 샘플**: env에서 뽑은 obs 5개 이상 + 각 `action_mask` + numpy actor 출력(마스크 전 47개) + critic 값

파일은 `models/<이름>.json`에, 패리티 샘플은 `models/parity/<이름>.json`에 둔다.

## 9. 전투 모델 학습 (`CombatVecEnv`)

결투·용 도전을 실시간 액션으로 싸우는 **전투 모델**용 env다. 보드 모델과 관측·행동·env 서버·가중치 파일이 모두 다르고, 한 번에 하나만 학습한다. 정본은 [docs/combat-ai-spec.md](../docs/combat-ai-spec.md)다.

- 관측 `cobs_v1` float32 **160개**, 행동 `cact_v1` MultiDiscrete **[9, 4]**(또는 flat **36**) + 가지별 마스크
- 서버 `packages/sim/dist/combat-env-server.js`(`pnpm build`로 생성). 보드 env와 별도 프로세스다.
- 과제별 생성자: `PvPCombatEnv`/`PvPCombatVecEnv`는 **결투만** 만들고 기본으로 두 전투원을 제어한다. `DragonCombatEnv`/`DragonCombatVecEnv`는 **용전만** 만들고 기본으로 도전자 한 명(`controlled="p0"`)을 제어한다. 혼합 과제 `CombatEnv`/`CombatVecEnv`도 그대로 쓸 수 있다. 고정 모드 생성자는 `mode_mix`를 받지 않는다.

```bash
python python/examples/random_combat_agent.py --mode pvp --envs 2 --steps 40
python python/examples/random_combat_agent.py --mode pvp --p0 --opponent scripted:balanced --envs 2 --steps 40
python python/examples/random_combat_agent.py --mode dragon --envs 2 --steps 40
```

`PvPCombatVecEnv` 관측은 기본 `(N,2,160)`, `DragonCombatVecEnv`는 기본 `(N,1,160)`이다. 행동·마스크·보상의 `n_ctrl` 축도 각각 2/1이다. `controlled="both"`인 용전의 두 번째 슬롯은 비활성 패딩으로, `info["active"]`가 False이며 `[0,0]`만 합법이다. 종료 후 벡터 env는 같은 전투 종류로 자동 리셋된다. 전이 보상·종료·`final_obs`는 끝난 전투, 새 관측·마스크·`episode_start`는 다음 전투다.

```python
import numpy as np
from rpgboard_env import CombatVecEnv

def masked_sample(logits, mask, rng):           # softmax 샘플(Gumbel-max), 마스크 밖은 제외
    return np.argmax(np.where(mask, logits + rng.gumbel(size=logits.shape), -np.inf), axis=-1)

rng = np.random.default_rng(0)
env = CombatVecEnv(num_envs=64, controlled="both")         # 두 전투원 모두 내가 조종(셀프플레이)
obs, info = env.reset(seed=0)                               # obs (64, 2, 160)
for _ in range(1000):
    logits = np.zeros((*obs.shape[:2], 13))                  # 예제용 균등 로짓; 두 head actor(obs)로 교체
    move = masked_sample(logits[..., :9], info["move_mask"], rng)
    button = masked_sample(logits[..., 9:], info["button_mask"], rng)
    obs, reward, terminated, truncated, info = env.step(np.stack([move, button], axis=-1))
env.close()
```
예제: `python python/examples/random_combat_agent.py --envs 64 --steps 2000` (`--p0`이면 스크립트 봇 상대).

### 9.1 결정 타이밍
- 전투 **학습 env**의 sim은 60Hz다. step 하나 = 결정 하나 = **라이브 4틱**(`action_repeat`). 히트스톱(정지) 틱은 세지 않고, 정지 중에는 결정을 묻지 않는다. `info["ticks_elapsed"]`가 이번 전이의 라이브 틱 수다(보통 4, 끝나는 스텝은 더 적을 수 있다). 로컬·온라인 실전의 스크립트 봇과 보드 `sim`의 스크립트 봇은 상성 측정과 동일하게 매 틱 입력을 결정한다.
- 이동은 4틱 동안 유지되고 버튼은 레벨이다. **직전과 같은 버튼을 다시 고르면 '누르고 있기'**(궁수 당기기)이지 새 입력이 아니다. 다시 누르려면 한 번 `none`을 고른다.
- `info["actionable"]`이 False인 슬롯은 긴 경직 중이라 이번 결정이 아무 영향도 없다(env가 입력을 무시한다). 그 스텝은 버퍼에 넣지 말고 보상은 다음 저장 스텝에 더한다. 할인은 `γ^(누적 ticks_elapsed / 4)`.
- **반응 지연**: 관측은 좌석마다 에피소드별 U[4, 18]틱 전 상태다(`g.match[3]` = delay/18). 마스크와 직전 행동만 현재 값이다.

### 9.2 관측 `cobs_v1` (160)
자기 시점, 축 정렬(회전 없음), 값은 모두 [−1, 2]다. 위치·속도는 화면 좌표(y는 아래가 +).

| 인덱스 | 이름 | 내용 |
|---|---|---|
| 0–3 | `self.stats` | hp/maxHp, maxHp/100, atk/20, def/20 |
| 4–8 | `self.job` | 직업 one-hot [swordsman, archer, mage, ninja, berserker] |
| 9–15 | `self.state` | one-hot [idle, move, startup, active, recovery, dash, hitstun] |
| 16–17 | `self.stateInfo` | 현재 상태 진행률, 연타 단계/2 |
| 18–21 | `self.cooldowns` | 스킬·대시 남은 쿨다운 비율, 스킬·대시 충전/최대 |
| 22–29 | `self.flags` | 무적, 슈퍼 아머, 불굴 가능, 광폭, 선제 대기, 당김/36, 회피 카운터/7, 대시 남용/2 |
| 30–31 / 32–33 / 34–35 | `self.vel` / `self.facing` / `self.pos` | 속도/720px/s, 방향 [sin, cos], 경기장 중심 기준 위치 |
| 36–38 | `opp.rel` | 상대(용전이면 용) 위치 dx/W, dy/H, 거리/W |
| 39–42 | `opp.motion` | 상대 속도 − 내 속도, 상대 방향 [sin, cos] |
| 43–46 | `opp.stats` | 자기와 같은 스케일 |
| 47–52 | `opp.type` | 직업 5 + 용 |
| 53–60 | `opp.state` | 상태 one-hot 7 + 진행률 (용: 예고 = startup, 기절 = hitstun) |
| 61–64 | `opp.moveKind` | [none, light, heavy, skill] |
| 65–70 | `opp.flags` | 무적, 슈퍼 아머, 불굴 가능, 광폭, 회피 카운터/7, 선제 대기 |
| 71–73 | `opp.ready` | 스킬 가능, 대시 가능, 남은 경직/30 |
| 74–76 | `dragon.phase` | 페이즈 one-hot (결투면 74–88 전체가 0) |
| 77–83 | `dragon.maneuver` | [claw, tail, volley(화염구), charge, gust, breath, dive] |
| 84–86 | `dragon.stage` | 단계 진행률, 브레스까지 남은 피해 기술/2, 머리 숙임(약점) |
| 87–88 | `dragon.telegraphAim` | 예고 방향 [sin, cos] |
| 89–142 | `threat0`~`threat5` | 위협 6슬롯 × 9: [있음, 적대, 종류(0 투사체/1 지역), dx/W, dy/H, vx/960, vy/960, 반지름/64, 유효까지 틱/60]. 적대 먼저, 그다음 빠른(가까운) 순 |
| 143–146 | `g.match` | 남은 시간 비율, 용전 여부, 불의 고리 반지름/460, delay/18 |
| 147–155 / 156–159 | `g.prevMove` / `g.prevButton` | 직전 결정 one-hot |

- **미러 증강**(`mirror=True`, 기본): 에피소드마다 x(결투는 y도) 반전을 뽑고 env가 관측과 행동을 함께 변환한다. 따로 처리할 필요가 없다(`info["episode_start"][i]["mirror"]`로 확인).
- 이름으로 보기: `env.describe(obs[i, slot])`, 레이아웃은 `env.obs_layout`.

### 9.3 행동 `cact_v1`과 마스크
| 가지 | 값 |
|---|---|
| 이동 (9) | 0 none, 1 N(위), 2 NE, 3 E, 4 SE, 5 S, 6 SW, 7 W, 8 NW |
| 버튼 (4) | 0 none, 1 attack, 2 skill, 3 dash |

- 입력은 `(N, n_ctrl, 2)` = `[move, button]`. `flat_actions=True`면 `(N, n_ctrl)`의 `move·4 + button`(0~35)이고 마스크는 `info["action_mask"]` `(N, n_ctrl, 36)`. 이름은 `env.action_names`.
- 마스크: 이동은 항상 전부 허용. 버튼은 **지금 누르면 입력 버퍼(6틱) 안에 실제로 나갈 때만** 1이다(쿨다운·충전·동작·경직 반영). `none`은 항상 1. 마스크 밖 행동은 `IllegalActionError`이고 어느 env도 진행하지 않는다.
- 용전의 두 번째 슬롯(`info["active"]` False)은 `[none, none]`만 허용되고 관측과 보상은 0이다.

### 9.4 보상과 종료
- 종단: 승 **+1**, 패 **−1** (무승부 없음: 결투 시간 종료는 HP 비율, 용전 시간 종료는 도전자 패배).
- shaping: `k · (준 피해/상대 maxHp − 받은 피해/내 maxHp)`, 스텝마다 [−1, 1] 클립. `reward={"k_start": 0.5, "k_end": 0.1, "anneal_decisions": N}`이면 서버가 센 결정 수 N 동안 k가 선형 감소한다(기본 0 = k 0.5 고정). `approach`(거리 감소 보너스, 커리큘럼 0단계용)는 기본 0.
- `terminated` = KO 또는 규칙 시간 종료(결투 45초, 용전 30초). 용전은 20초(1,200틱)부터 소프트 격노하고 30초(1,800틱)에 종료한다. `truncated`는 안전 상한(규칙 시간의 2배)에서만 난다.
- `info["outcome"][i]` = `{"winner": 0|1|"dragon", "reason": "ko"|"timeout"|"cap", "hp": [a, b|None], "last_stand_used": [.., ..], "dragon_hp"?}`. 자동 리셋된 env는 `reward`·`terminated`·`outcome`·`final_obs`가 끝난 에피소드를, `obs`·마스크·`mode`가 새 에피소드를 가리킨다.

### 9.5 옵션
| 인자 | 기본값 | 설명 |
|---|---|---|
| `controlled` | `"both"` | `both`: 슬롯 0(전투원 a, 도착자/도전자)과 슬롯 1(b) 모두 외부 제어 / `p0`: 슬롯 0만, 상대는 `opponent` |
| `opponent` | `"scripted:pool"` | `scripted:balanced`·`aggressive`·`cautious`·`idle`·`random`·`pool`(에피소드마다 앞의 세 성향 중 하나). `p0`에서 사용 |
| `mode_mix` | `{"pvp": 0.75, "dragon": 0.25}` | 에피소드별 결투/용전 확률 |
| `jobs` | `"uniform"` | 또는 슬롯별 목록, 예 `["ninja", "uniform"]` (같은 직업 대결 허용) |
| `stat_sampler` | `"uniform_board"` | 현재도 유지된 직업 시작 스탯 + 강화 단계(과거 보드 휴리스틱 로그의 p5~p95 범위)에서 균등 표본 / `"start"`(시작 스탯) / `"file:<path>"`(`packages/sim/data/rush4_stat_dist_v1.json` 또는 `pnpm sim --combat sim --log-fights <path>`의 `stat_dist_v1`) |
| `action_repeat` / `obs_delay` | 4 / `(4, 18)` | 결정당 라이브 틱 / 반응 지연 범위(정수면 고정) |
| `flat_actions` / `mirror` | False / True | |
| `reward`, `return_events` | None, False | shaping 계수(`k_start`, `k_end`, `anneal_decisions`, `approach`) / 전투 이벤트 포함 |
| `dragon_curriculum` | None | `{"hp_scale": [0.5, 0.6], "telegraph_scale": [1.3, 1.3]}`처럼 용 HP·예고 길이 배율 범위 |
| `rules` | `"default"` | `DEFAULT_COMBAT_RULES` 부분 덮어쓰기, 예 `{"timeLimit": {"duel": 1200}}` |
| `server_cmd`, `cwd` | — | 환경변수 `RPGBOARD_COMBAT_ENV_CMD`, `RPGBOARD_ROOT` |

- `CombatEnv(...)`는 단일 env(자동 리셋 없음)다. 관측 `(n_ctrl, 160)`, 행동 `(n_ctrl, 2)`.
- 속도(64 env 셀프플레이, 개발 PC): 서버 단독 약 7만 결정/s, numpy 포함 종단 약 2만 결정/s. 코어당 프로세스 하나로 늘린다.
- 학습한 전투 모델을 게임에 넣으려면 보드 모델과 별도의 JSON·패리티 샘플을 준비한다(§8의 항목 + **head 구조와 출력 순서**). 파일은 `models/combat/<이름>.json`, 샘플은 `models/combat/parity/<이름>.json`에 둔다. 현재 전투 가중치 어댑터는 비어 있으므로 바로 로드되지는 않는다.
