# AI 학습 환경 시작 가이드

보드 정책, 1v1 결투 정책, 용전 정책은 별도 에피소드로 학습한다. 보드는 `rpgboard-env/1`, 두 전투 과제는 `rpgboard-combat-env/1` 서버를 쓴다. 전투의 PvP/용전은 같은 `cobs_v1`/`cact_v1` 계약을 공유하므로 두 과제를 하나의 전투 모델로 학습할 수도 있다. 정확한 인덱스 정의는 [보드 AI 명세](ai-interface-spec.md)와 [전투 AI 명세](combat-ai-spec.md)를 따른다.

## 실행

저장소 루트에서 한 번 설치·빌드한다. Python 클라이언트의 외부 의존성은 numpy뿐이다.

```bash
pnpm install && pnpm build
pip install -e python/
python python/examples/random_agent.py --episodes 2 --combat-resolver sim
python python/examples/random_combat_agent.py --mode pvp --envs 2 --steps 40
python python/examples/random_combat_agent.py --mode pvp --p0 --opponent scripted:balanced --envs 2 --steps 40
python python/examples/random_combat_agent.py --mode dragon --envs 2 --steps 40
```

보드 예제의 `sim`은 실제 전투를 스크립트 봇으로 해결한다. `outcome`은 현재 보드·전투 규칙 버전과 호환되는 결과 예측 JSON이 있을 때 선택한다. 이 예측 JSON은 전투 **정책** 가중치가 아니다.

현재 보드 규칙은 `rush-6`이다. 첫 라운드와 출발 칸 착지에서도 PvP가 일어나며, 보드 관측 `obs_v1`의 `g.graceLeft`/`g.pvpEnabled`는 시작부터 0/1이다. PvP/용전 전투를 과거 보드 스탯 분포로 학습하려면 `stat_sampler="file:packages/sim/data/rush4_stat_dist_v1.json"`을 전달할 수 있다. 이 파일은 **과거 `rush-4` 수집본**이다. 전투·스탯 기본 수치는 같지만 현행 PvP 빈도와 대전 상대 분포는 다르며 `rush-6` 분포를 재수집하지 않았다. 기본 `uniform_board`는 더 넓은 범위의 스탯을 균등하게 뽑는다.

## Python 계약

| 과제 | 생성자와 기본 제어 | `reset()` 관측 | `step()` 행동 | 현재 마스크 | 보상과 종료 |
|---|---|---|---|---|---|
| 보드 | `RPGBoardEnv(mode="single")`; 배치는 `RPGBoardVecEnv` | `float32 (253,)`; 배치는 `(N,253)` | `int` 0~46; 배치는 `(N,)` | `info["action_mask"]`: `bool (47,)`; 배치는 `(N,47)` | single은 에이전트 `float`, 배치는 `(N,)`; 다좌석 `mode="selfplay"`은 절대 좌석별 `(4,)`/`(N,4)` |
| 1v1 결투 | `PvPCombatEnv()`/`PvPCombatVecEnv()`는 두 전투원 제어. `controlled="p0", opponent="scripted:balanced"`면 0번만 제어 | `float32 (2,160)` 또는 `(1,160)`; 배치는 앞에 N축 | `int` `(n_ctrl,2)`의 `[move,button]`; 배치는 `(N,n_ctrl,2)` | `move_mask` `(n_ctrl,9)`와 `button_mask` `(n_ctrl,4)`; 배치는 앞에 N축 | 좌석별 `float32 (n_ctrl,)`; 배치는 `(N,n_ctrl)` |
| 용전 | `DragonCombatEnv()`/`DragonCombatVecEnv()`는 도전자 0번만 제어 | `float32 (1,160)`; 배치는 `(N,1,160)` | `int` `(1,2)`; 배치는 `(N,1,2)` | 결투와 같은 9+4 마스크 | 도전자 `float32 (1,)`; 배치는 `(N,1)` |

- 전투 행동은 이동 0~8, 버튼 0~3이다. `flat_actions=True`면 행동은 `(n_ctrl,)`/`(N,n_ctrl)`의 0~35 (`move*4+button`)이고 마스크 키는 `action_mask`(마지막 차원 36)다. 마스크 밖 행동은 `IllegalActionError`이며 배치 전체가 진행하지 않는다.
- 결투의 슬롯 0은 전투원 a, 슬롯 1은 b다. 용전에서 `controlled="both"`를 직접 선택하면 슬롯 1은 비활성 패딩이다: 0 관측·보상, `[0,0]` 행동만 합법이다. `info["active"]`로 학습 버퍼에서 제외한다.
- 전투의 `info["actionable"] == False`인 슬롯은 그 결정의 입력이 무시된다. 보상은 다음 저장 결정에 누적하고 `ticks_elapsed`로 할인 시간을 계산한다. 전투 한 결정은 기본 라이브 4틱이며 히트스톱은 라이브 틱에 포함되지 않는다. 관측은 지연될 수 있지만 마스크는 현재 상태다.
- 보드는 기본 희소 보상으로 승리 +1, 탈락/패배 −1, `max_rounds` 도달 0이다. 승패는 `terminated`, 라운드 제한은 `truncated`다. single에서 에이전트가 먼저 탈락하면 게임을 더 진행하지 않고 `outcome=None`일 수 있다. 선택적 `reward_shaping`은 [보드 명세 §6](ai-interface-spec.md#6-보상과-에피소드)에 있다.
- 전투는 승리 +1, 패배 −1에 기본 피해량 shaping `k*(준 피해/상대 최대 HP − 받은 피해/자기 최대 HP)`를 더한다. `reward` 설정으로 k와 접근 보너스를 조정한다. KO/규칙 시간 종료는 `terminated`, 안전 상한은 `truncated`다. 결투 `outcome.winner`는 0/1, 용전은 0/`"dragon"`이다.
- `CombatEnv`/`CombatVecEnv`는 기존 혼합 과제다(`mode_mix={"pvp":0.75,"dragon":0.25}`). 고정 모드 래퍼는 `mode_mix`를 고정하며 직접 전달하면 `ValueError`를 낸다. 고정 모드에서 `info["mode"]`와 `episode_start["mode"]`도 항상 같은 과제를 가리킨다.

## 리셋과 버전

단일 `RPGBoardEnv`, `PvPCombatEnv`, `DragonCombatEnv`는 종료 후 `reset(seed=...)`을 다시 호출한다. 벡터형은 종료 즉시 같은 과제의 새 에피소드로 자동 리셋한다. 이때 `reward`, `terminated`, `truncated`, `outcome`, `final_obs`는 **끝난 에피소드**를, 새 `obs`·마스크·`episode_start`는 **다음 에피소드**를 가리킨다. 전투의 `ticks_elapsed`도 끝난 전이를 가리킨다. 같은 빌드·설정·시드·행동 열은 같은 결과를 낸다.

보드 모델은 `obs_v1`(253)과 `act_v1`(47)에, 전투 모델은 `cobs_v1`(160)과 `cact_v1`(9+4 또는 flat 36)에 묶인다. 클라이언트는 서버 `info`에서 차원·레이아웃·이름·버전을 확인한다. 보드는 `env.rules_version`, 전투는 `env.combat_rules_version`과 `env.combat_rules_hash`를 기록한다. 규칙 버전이나 수치가 바뀌면 학습 모델의 성능을 다시 검증한다.

## 모델 JSON을 게임에 연결할 때

이 저장소는 학습 알고리즘이나 가중치 JSON 포맷을 정하지 않는다. 현재 보드·전투 사용자 가중치 어댑터는 비어 있으므로 예제에서 얻은 가중치 JSON을 게임이 즉시 로드하지는 못한다. 사용자 포맷을 정한 뒤 **보드와 전투에 각각** 아래 자료를 제공해야 TS 어댑터와 패리티 검사를 구현할 수 있다.

| 모델 | 권장 메타데이터 | 필요한 원출력과 패리티 자료 |
|---|---|---|
| 보드 | `obs_version`, `act_version`, `obs_dim`, `rules_version` | 네트워크 층·활성화·행렬 배치·입력 정규화, 마스크 **전** 47개 actor 출력(logits/확률), critic 값, 관측·마스크가 포함된 샘플 5개 이상 |
| 전투 | `cobs_version`, `cact_version`, `obs_dim`, `combat_rules_version`, `head`, `output` | 위와 같은 네트워크 정보와 샘플. `head="multi"`면 이동 9개 + 버튼 4개 순서의 13개, `head="flat"`이면 36개 출력; 마스크 전 출력과 critic 값을 포함 |

파일 위치는 보드 `models/<name>.json`·`models/parity/<name>.json`, 전투 `models/combat/<name>.json`·`models/combat/parity/<name>.json`이다. 메타데이터는 **권장값**이며 현재 사용자 포맷의 확정 스키마가 아니다. 보드 상세는 [보드 명세 §9](ai-interface-spec.md#9-게임-내-모델-통합-계약), 전투 상세는 [전투 명세 §11](combat-ai-spec.md#11-전투-모델-통합-계약)을 본다.
