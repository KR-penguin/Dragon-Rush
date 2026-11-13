# 병합 인계: 왕자의 토템과 턴당 상점 구매 제한

작성일: 2026-11-13 (Asia/Seoul). 이 문서는 해당 기능을 구현한 AI가 병합 담당 AI에 전달하는 작업 기록이다. 실제 코드와 사용자 최종 요구사항을 우선하며, 아래 Git 상태는 문서 작성 시점의 스냅샷이다.

## 1. 먼저 확인할 Git 상태

| 항목 | 값 |
|---|---|
| 원본 저장소 / 기존 작업 worktree | `/home/sean/coding/Dragon-Rush` |
| 이 기능의 worktree | `/home/sean/coding/Dragon-Rush-prince-totem` |
| 기능 브랜치 | `feature/prince-totem-shop-limit` |
| 분기 기준 | 로컬 `main`, `8c03c740b40d5589d0b4dda49af5843b3ac6a41d` |
| 기준 커밋 제목 | `docs(combat): correct bot replay speed to 1x` |
| 현재 기능 브랜치 HEAD | 위 기준 커밋과 동일 |
| 기능 변경 상태 | **아직 커밋하지 않음. 기능 worktree의 작업 디렉터리에 있음** |
| 변경 규모 | 본 인계 문서 제외 74개 경로: 기존 파일 수정 67개, 삭제 1개, 신규 6개 |
| 기존 worktree 상태 | `bugfix/audit-findings`에서 별도의 미커밋 audit·성능 개선 작업이 진행 중 |

**브랜치 이름만 merge/cherry-pick하면 이 기능은 전달되지 않는다.** 먼저 기능 worktree의 변경을 검토해 커밋으로 만들어야 한다. `git diff`만으로 만든 일반 패치에는 미추적 신규 파일 6개가 빠진다. 이 인계 문서도 현재 신규 파일이므로 포함하면 총 75개 경로다.

기존 worktree의 수정 사항은 이 기능 worktree로 복사하지 않았고, 기존 작업 폴더에서 checkout·reset·stash·commit·merge를 수행하지 않았다. 새로운 라이브러리나 lockfile 변경은 없다. 이 요청에서는 인계 문서만 추가했으며 병합 자체는 수행하지 않았다.

## 2. 사용자 최종 요구사항과 결정된 동작

사용자는 main에서 새 branch/worktree를 만든 뒤 도둑 아이템을 왕자의 토템으로 교체하고, 상점 구매를 한 턴에 최대 3개로 제한하도록 요청했다. 이후 다음과 같이 토템 동작을 확정했다.

> 전투 시작시 1개 자동 소모, 전투가 끝나면 원래 최대 체력으로 복구

- 아이템 ID는 `princeTotem`, 표시 이름은 **왕자의 토템**, 가격은 **15코인**이다.
- 실제 전투 시작 시 참가자별 보유 토템을 **1개만 자동 소모**한다. 여러 개를 갖고 있어도 한 전투에서 전부 쓰지 않는다.
- 그 전투 동안 최대 HP를 **15 늘리고**, 현재 HP를 늘어난 최대 HP로 완전히 채운다.
- PvP 도착자와 방어자 모두 각각 적용 대상이고, 용전에서는 도전자에게 적용한다.
- 방어막으로 취소한 결투에서는 토템을 소모하거나 회복하지 않는다.
- 전투가 끝나면 원래 최대 HP로 복구한다. 남은 현재 HP가 복구된 최대 HP를 넘으면 그 최대 HP로 제한한다.
- 기존 PvP 승리 보상은 그 이후에 처리한다. 따라서 PvP 승자는 원래 최대 HP까지 회복한다.
- **최대 HP +15는 영구 증가가 아니다.** 앞선 대화의 잠정 가정은 사용자 답변으로 대체됐으며, 구현과 테스트는 일시 증가를 기준으로 한다.
- 상점에서 아이템 종류·방문 횟수를 합쳐 **자기 턴 전체에서 최대 3개**를 살 수 있다. 같은 종류를 세 번 사는 것도 가능하다.
- 텔레포트로 다른 상점에 가거나 다시 방문해도 구매 횟수를 유지하고, 다음 턴 시작에 초기화한다. 무료 획득·전리품은 구매 횟수에 포함하지 않는다.
- 유료 스탯 강화의 기존 턴당 3회 제한과 아이템 구매 3개 제한은 서로 별도다.

## 3. 구현 핵심과 유지해야 할 처리 순서

### 엔진

- `types.ts`: `ITEM_IDS`를 `[teleport, shield, princeTotem]`으로 변경했다. `USE_THIEF`, `CoinsStolen`, `thiefStealAmount`, `turn.thiefUsed`를 제거했다.
- `RulesConfig`에 `maxItemsBoughtPerTurn = 3`, `princeTotemMaxHpBonus = 15`를 추가했다. `items.princeTotem`은 `{ price: 15, perTurnLimit: null }`이다. 토템의 전투당 1개 소모는 `perTurnLimit`로 구현하지 않는다.
- `TurnContext.itemsBought`는 `freshTurn()`에서 0으로 만들고, `buyItem()`에서만 1씩 늘린다. `legal.ts`가 구매 한도와 잔액·상점 조건을 함께 검사한다.
- `items.ts`의 `activatePrinceTotem()`이 소모·최대 HP 증가·완전 회복을 수행한다. `restorePrinceTotem()`이 최대 HP 복구와 현재 HP 상한 적용을 수행한다.
- `fight.ts`의 `beginCombat()`에서 토템을 적용한 뒤 fighter/setup과 `CombatStarted`를 만든다. 이를 셸이나 UI에서 다시 적용하면 안 된다.
- 실제 적용한 보너스는 `CombatRequest.princeTotemBonusA?`, `princeTotemBonusB?`에 저장한다. 토템을 사용하지 않은 쪽의 필드는 추가하지 않는다. 기존 shallow clone으로 숫자 필드가 보존된다.
- `finishCombat()` 순서는 `CombatEnded` → 외부/주사위 결과 HP 기록 → 양쪽 토템 보너스 복구 → 종류별 정산(`settle`)이다. 외부 결과의 HP 검증은 아직 증가한 최대 HP를 기준으로 수행한다.
- 직접 주사위 전투와 `external` 후 `resolveCombatWithDice()` 대체 경로가 동일하게 동작한다. 대기 전투 해결 시 토템을 다시 소모하지 않는다.
- 시작 시 `ItemUsed(princeTotem)` 및 `EffectApplied(maxHp, hp)`, 종료 시 음수 `EffectApplied(maxHp)`와 최종 HP 이벤트를 내보낸다. 규칙과 수치는 엔진에만 있다.

### 웹과 봇·시뮬레이터

- 도둑 버튼·대상 선택·다이얼로그·이벤트 매핑을 제거했고 `ThiefDialog.tsx`를 삭제했다. 토템은 왕관 아이콘과 자동 발동 효과를 사용한다.
- `itemDescription(item, rules)`로 설정값을 읽어 토템 설명을 만들고, 종료 후 최대 HP 복구를 명시한다.
- `ShopDialog`에 `purchasesUsed`, `purchaseLimit`를 전달해 이번 턴 구매 횟수와 남은 수를 표시한다. 버튼 가능 여부는 엔진의 legal actions를 따른다.
- `eventTimeline`은 `ItemBought`에서 표시용 구매 횟수를 올리고 `TurnStarted`에서 초기화한다. 최대 HP 복구 이벤트에서는 표시 HP를 잘라낸다.
- 음수 최대 HP 이벤트를 `+-15`로 출력하거나 강화 효과음으로 처리하지 않는다. 복구 FX는 `최대 HP 복귀`로 표시한다.
- 휴리스틱 봇에서 도둑 사용·구매 판단을 제거했다. 위협 시 방어막 → 미보유 토템 → 기존 텔레포트 우선순위를 적용한다. 구매 legal action이 없으면 다른 행동을 계속 검토한다.
- `profileOf()`는 토템 1개 발동 후 HP를 내부 전투 추정에 반영한다. 실제 아이템 소모는 엔진만 수행한다.
- sim 구매 집계의 세 번째 키를 `thief`에서 `princeTotem`으로 변경했다. Python은 TS 인코더 결과를 계속 사용하며 별도 인코더를 추가하지 않았다.

## 4. 호환성 변경: 함께 병합해야 할 버전과 인덱스

| 계약 | 기존 main | 이 기능 |
|---|---|---|
| 보드 규칙 | `rush-11` | `rush-12` |
| 보드 관측 | `obs_v4`, 498차원 | `obs_v5`, 498차원 |
| 보드 행동 | `act_v3`, 47개 | `act_v4`, 44개 |
| 소켓 프로토콜 | 2 | 3 |
| 보드 env 메시지 형식 | `rpgboard-env/2` | 동일 |
| 실시간 전투 규칙 | `combat-8` | 이 기능에서는 변경하지 않음 |
| 전투 AI 관측/행동 | `cobs_v1` / `cact_v1` | 동일 |

- `obs_v5`에서 세 번째 아이템 보유량·보유 여부·가격 슬롯은 토템을 의미한다. offset 243은 `g.itemsBoughtRemaining`이다.
- 값은 `max(0, maxItemsBoughtPerTurn - turn.itemsBought) / maxItemsBoughtPerTurn`이며 한도가 0이면 0이다. 기본값에서 `1 → 2/3 → 1/3 → 0`이 된다.
- 과거 `OBS_V2_LAYOUT`, `OBS_V3_LAYOUT`, `OBS_V4_LAYOUT`은 보존했다. 새 `obs/layoutV5.ts`가 활성 레이아웃이고 public `index.ts`가 활성 상수를 이 파일에서 export한다. 과거 `obs/layout.ts`의 `obs_v4` 상수와 역사적 `g.thiefUsed`를 일괄 치환하지 않는다.
- `BUY_PRINCE_TOTEM`은 index 8이다. 도둑 대상 행동 3개를 제거해 후속 인덱스가 바뀌었다.

| act_v4 index | 행동 |
|---|---|
| 0 / 1 / 2 | ROLL_DICE / END_TURN / CHALLENGE_DRAGON |
| 3–5 | UPGRADE_ATK / DEF / MAXHP |
| 6–8 | BUY_TELEPORT / SHIELD / PRINCE_TOTEM |
| 9–32 | TELEPORT_T00 … T23 |
| 33–35 | ADJUST_M1 / 0 / P1 |
| 36–37 | SHIELD_NO / YES |
| 38–40 | PVP_TARGET_OPP1 … OPP3 |
| 41–43 | TRAIN_ATK / DEF / MAXHP |

ActionSchema도 새 아이템만 허용하며 구형 도둑 구매·사용을 거부한다. 모델 메타 검증, Python 기본 기대 버전, env info/layout/action names, 스냅샷과 명세를 함께 수정했다. 기존 보드 모델은 재학습 또는 명시적인 변환이 필요하다. 다른 작업도 같은 버전을 선점했다면 최종 통합 계약에 맞춰 버전·문서·클라이언트·골든을 함께 조정한다.

## 5. 기존 audit·성능 작업과 합칠 때 주의할 지점

작성 시점 원본 worktree와 직접 겹치는 변경 경로는 **20개**다. 두 worktree에 공통으로 추가한 신규 파일은 없다. 전체 파일을 한쪽 버전으로 덮어쓰는 대신 아래 동작을 함께 보존해야 한다.

| 병합 지점 | 함께 유지해야 할 내용 |
|---|---|
| `apps/web/src/pages/GamePage.tsx` | audit의 `BoardScene`, 안정화한 `onPickTile`, `boardCovered`, 보드/HUD `inert`, `CombatLayer.onCoveredChange`와 이 기능의 도둑 타겟팅 제거·`Dock.rules` 전달을 합친다. |
| `animation/eventSfx.ts`, `types/labels.ts`, `test/navAndAudio.test.ts` | audit의 구형 `sfxForEvent` 및 폐기 이모지 상수 삭제를 유지한다. 살아 있는 `soundCuesForEvent`에 토템 소리와 음수 최대 HP에서 강화 소리를 생략하는 조건을 반영한다. 토템 라벨·설정 기반 설명도 유지한다. |
| `packages/ai/src/bots/heuristic/heuristicBot.ts` | audit의 `preferences()` 제너레이터와 불법 후보를 건너뛰고 다음 우선순위를 검사하는 수정을 유지하면서, 도둑 제거·토템 구매·구매 한도 처리를 이식한다. 예전 `choose()` 전체로 되돌리지 않는다. |
| `packages/ai/test/bots.test.ts` | audit의 유료 강화 소진 뒤 회복 텔레포트 회귀 테스트와 이 기능의 토템·구매 한도 테스트를 유지한다. 제거된 도둑 행동을 전제로 한 테스트는 새 행동에 맞게 갱신한다. |
| `LocalGameClient` / `fightSimulation` Worker 경로와 `test/localFight.test.ts` | audit의 비동기 봇 전투 준비·`preparingReplay`·`presentationOnly`를 유지한다. 토템으로 증가한 setup 및 `CombatRequest.princeTotemBonusA/B`를 보존한다. audit가 추가한 bot-duel fixture의 `thief: 0`도 `princeTotem: 0`으로 옮긴다. |
| `packages/sim/src/runner.ts` | audit의 미사용 `autoResolveCombat`·관련 import 삭제와 이 기능의 `purchases.princeTotem` 집계 변경을 모두 유지한다. audit의 `sim/src/index.ts` export 정리도 보존한다. |
| 규칙 버전·측정 문서 | audit는 동시 공격 시 능력치 캡처 수정과 `combat-9`를 포함한다. 함께 합치면 보드 `rush-12`와 전투 `combat-9`를 모두 반영한다. 이 기능의 문서에 있는 `rush-12/combat-8` 실측을 통합 버전의 측정치로 표기하지 말고 통합 후 다시 측정한다. |

원본의 서버 재접속·세션 만료·온라인 프레젠테이션·전투/넷코드 수정도 별도 작업으로 유지한다. 이 기능은 해당 런타임 파일을 직접 바꾸지 않았지만, 프로토콜 3과 확장된 CombatRequest를 통합 상태에서도 전달하는지 재검증해야 한다.

직접 겹치는 20개 경로:

```text
AI_README.md
README.md
apps/web/src/animation/eventSfx.ts
apps/web/src/pages/GamePage.tsx
apps/web/src/types/gameUi.ts
apps/web/src/types/labels.ts
apps/web/test/localFight.test.ts
apps/web/test/navAndAudio.test.ts
docs/ai-interface-spec.md
docs/architecture.md
docs/art-direction.md
docs/combat-ai-spec.md
docs/combat-design.md
docs/development-plan.md
docs/game-design.md
docs/training-environments.md
packages/ai/src/bots/heuristic/heuristicBot.ts
packages/ai/test/bots.test.ts
packages/sim/src/runner.ts
python/README.md
```

## 6. 변경을 병합 가능한 커밋으로 만드는 절차

다음 명령은 병합 담당자가 상태를 다시 확인한 뒤 사용할 예시이며, 작성 AI가 실행한 커밋/병합 기록이 아니다. 대상 worktree의 기존 변경은 별도 작업으로 보존하고, 통합은 적절한 통합 브랜치에서 진행한다.

```bash
source_worktree=/home/sean/coding/Dragon-Rush-prince-totem
git -C "$source_worktree" status --short
git -C "$source_worktree" diff --check
git -C "$source_worktree" diff --stat
git -C "$source_worktree" ls-files --others --exclude-standard
```

아래 전체 manifest와 비교해 다른 작업이 섞이지 않았는지 확인한다. 일치하는 경우 소스 worktree 안에서 신규·수정·삭제를 함께 stage하고 검토한다.

```bash
git -C "$source_worktree" add -A
git -C "$source_worktree" diff --cached --check
git -C "$source_worktree" diff --cached --stat
git -C "$source_worktree" commit -m "feat(engine)!: add prince totem and cap shop purchases"
git -C "$source_worktree" rev-parse HEAD
```

커밋 본문에는 아이템·행동·상태 계약 변경으로 `obs_v5/act_v4/protocol3`를 올린 이유를 기록한다. 그 커밋을 대상 통합 브랜치로 cherry-pick하거나 정해진 통합 절차로 merge한다. 대상에 다른 audit 수정이 있다면 §5의 동작을 조합한다. 통합 전후로 main에 직접 커밋하지 않는다.

## 7. 검증 결과와 재실행 명령

아래는 기능 코드 완료 시점의 실제 결과다. 인계 문서 작성 중에는 기능 코드를 수정하거나 전체 테스트를 재실행하지 않았다. 통합 담당자는 두 작업을 합친 상태에서 다시 검증해야 한다.

| 검증 | 실행 / 결과 |
|---|---|
| 전체 Vitest | `pnpm test --maxWorkers=2 --testTimeout=120000` → **93 files / 610 tests 통과**, 122.49초 |
| Python | 아래 기존 venv 명령 → **27 tests 통과**, 67.32초 |
| 타입 | `pnpm typecheck` → 전체 workspace 통과 |
| 린트 | `pnpm lint` → 진단 없이 통과 |
| 빌드 | `pnpm build` → sim/server/web 통과. 마지막 웹 변경 후 `pnpm --filter @dragon-rush/web build`도 통과 |
| 포맷 / diff | 변경 TS/TSX Prettier 검사와 `git diff --check` 통과 |
| 시뮬레이션 | 4인 휴리스틱·실시간 전투 1,000판 완료, §8 참조 |

```bash
cd /home/sean/coding/Dragon-Rush-prince-totem
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test --maxWorkers=2 --testTimeout=120000
pnpm build
PYTHONPATH=/home/sean/coding/Dragon-Rush-prince-totem/python /tmp/dragon-rush-review-venv/bin/python -m pytest python/tests -q
pnpm sim --games 1000 --players 4 --bots heuristic --seed 2026 --workers 2 --combat sim --json
```

Python venv는 이 호스트에 이미 있던 테스트 환경이다. 다른 호스트에서는 numpy/pytest가 설치된 Python을 사용하고, `PYTHONPATH`는 통합 worktree의 `python`으로 바꾼다. `pnpm install`은 이전 실행에서 `--offline --frozen-lockfile`로 수행했다.

검증 과정의 참고 사항:

- 초기 `--maxWorkers=4` 전체 실행은 성공하지 않았다. 수정 전 로컬 전투 테스트의 엄격한 request 기대값이 새 `princeTotemBonusB`를 누락했고, 동시 검증 부하 중 기존 전투 fuzz(30초)·상성 테스트(50초)가 시간 초과했다. 로비 disconnect 중 소켓 종료 unhandled rejection도 기록됐다.
- 로컬 테스트는 토템 시작/종료까지 확인하도록 고쳤다. 전투 fuzz와 로컬 전투 25개를 별도 실행해 통과한 뒤, 병렬 수를 줄인 위 최종 전체 명령에서 **모든 610개와 로비 테스트가 통과**했고 unhandled error가 없었다. 기본 옵션 `pnpm test`가 처음부터 통과했다고 인계하면 안 된다.
- 프로덕션 빌드는 성공했지만 Zod PURE 주석 처리와 500 kB 초과 JS 번들 경고가 남아 있다. 이번 기능에서 번들 분할을 수행하지 않았다.
- 브라우저 수동 플레이·스크린샷 검증은 수행하지 않았다. 로컬/온라인 서비스·렌더링·소켓 통합 테스트로 확인했다.
- 핵심 신규 테스트는 `princeTotem.test.ts` 11개, `shopLimit.test.ts` 4개, `boardTotem.test.ts` 2개, 상점 UI 2개, 제거된 도둑 입력 거부와 새 구매 허용 1개다. 기존 테스트·골든도 함께 갱신했다.

같은 호스트에 로그가 남아 있으면 `/tmp/dragon-rush-totem-tests-final.log`, `-python.log`, `-typecheck-final.log`, `-lint-final.log`, `-build.log`, `-web-build-final.log`, `-balance.json`을 참고한다. 이 로그들은 Git 산출물이 아니며 다른 환경으로 자동 전달되지 않는다.

## 8. 1,000판 측정과 통합 후 해석

측정 조합은 **rush-12 / combat-8**, 4인, heuristic, seed 2026, workers 2, combat sim이다. 실시간 전투 봇을 사용하는 자동 경기 표본이며 사람 승률이나 통합 후 combat-9 결과가 아니다.

| 지표 | 값 |
|---|---:|
| 평균 / 중앙 / p95 라운드 | 16.481 / 17 / 29 |
| 용 처치 종료 / 도전 성공률 / 무승부 | 24.60% / 57.21% / 0% |
| 3라운드 안 좌석 탈락 / 판당 PvP | 30.80% / 2.55 |
| 판당 구매 teleport / shield / princeTotem | 0.997 / 1.141 / 0.668 |
| 직업별 조건부 승률: 검사 / 궁수 / 마법사 / 닌자 / 광전사 | 20.61% / 20.08% / 25.60% / 38.05% / 20.25% |

아이템·구매 제한·봇 정책을 함께 바꾼 측정이므로 각 변경의 개별 효과를 분리하지 않는다. 기존 직업 밸런스 문제는 남아 있다. `docs/game-design.md` §15, README와 AI_README에 이 조합의 기준선을 기록했고 과거 표는 구분해 보존했다.

## 9. 통합 완료 확인 항목

- [ ] 토템은 실제 전투당 참가자별 1개, shield 취소 시 0개 소모한다.
- [ ] PvP 양쪽/용 도전자 setup에 증가한 최대 HP와 가득 찬 HP가 전달된다. Worker·리플레이·온라인에서도 복구용 request 필드를 잃지 않는다.
- [ ] 승패·주사위 대체 경로에 관계없이 원래 최대 HP로 돌아온다. PvP 보상 회복은 복구 이후다.
- [ ] 서로 다른 종류·중복 종류·여러 상점 방문 모두 자기 턴 3개 제한을 공유하고, 다음 턴에는 재구매 가능하다.
- [ ] 도둑 런타임 행동·UI·집계가 제거됐다. 역사적 레이아웃/문서와 입력 거부 테스트의 `thief` 문자열은 남을 수 있다.
- [ ] 새 파일 6개와 `ThiefDialog.tsx` 삭제가 커밋에 포함됐다.
- [ ] 활성 계약·Python 기본값·프로토콜·명세·골든이 일치하고 audit의 전투 규칙/버그 수정이 보존됐다.
- [ ] 통합 상태의 테스트·타입·린트·빌드 및 통합 버전 시뮬레이션을 실행했다.

## 10. 기능 변경 전체 manifest

아래 경로는 기능 worktree 루트를 기준으로 한다. `M`은 수정, `D`는 삭제, `A`는 신규다. 본 인계 문서 자체는 목록에서 제외했다.

```text
M AI_README.md
M README.md
M apps/server/test/models.test.ts
M apps/web/src/animation/eventSfx.ts
M apps/web/src/animation/eventTimeline.ts
M apps/web/src/components/dialogs/ShopDialog.tsx
D apps/web/src/components/dialogs/ThiefDialog.tsx
M apps/web/src/components/hud/CornerCard.tsx
M apps/web/src/components/hud/Dock.tsx
M apps/web/src/components/hud/TargetBanner.tsx
M apps/web/src/components/icons/GameIcon.tsx
M apps/web/src/fx/eventFx.ts
M apps/web/src/fx/recipes.ts
M apps/web/src/pages/GamePage.tsx
M apps/web/src/pages/game/DecisionDialogs.tsx
M apps/web/src/styles/dialogs.css
M apps/web/src/types/actionGroups.ts
M apps/web/src/types/decisionView.ts
M apps/web/src/types/gameUi.ts
M apps/web/src/types/icons.ts
M apps/web/src/types/labels.ts
M apps/web/test/decisionUi.test.ts
M apps/web/test/fxEventMapping.test.ts
M apps/web/test/localFight.test.ts
M apps/web/test/merchantItemCard.test.tsx
M apps/web/test/navAndAudio.test.ts
M apps/web/test/timeline.test.ts
M apps/web/test/viewModels.test.ts
M docs/ai-interface-spec.md
M docs/architecture.md
M docs/art-direction.md
M docs/combat-ai-spec.md
M docs/combat-design.md
M docs/development-plan.md
M docs/game-design.md
M docs/training-environments.md
M packages/ai/src/bots/heuristic/estimate.ts
M packages/ai/src/bots/heuristic/heuristicBot.ts
M packages/ai/src/codec/actions.ts
M packages/ai/src/index.ts
M packages/ai/src/model/modelPolicy.ts
M packages/ai/src/obs/encode.ts
M packages/ai/test/__snapshots__/obs.golden.test.ts.snap
M packages/ai/test/bots.test.ts
M packages/ai/test/codec.test.ts
M packages/ai/test/obs.test.ts
M packages/ai/test/parity.test.ts
M packages/engine/src/fight.ts
M packages/engine/src/items.ts
M packages/engine/src/legal.ts
M packages/engine/src/reducer.ts
M packages/engine/src/rules/defaultRules.ts
M packages/engine/src/rules/validateRules.ts
M packages/engine/src/turn.ts
M packages/engine/src/types.ts
M packages/engine/test/__snapshots__/golden.test.ts.snap
M packages/engine/test/externalCombat.test.ts
M packages/engine/test/flow.test.ts
M packages/engine/test/merchantItem.test.ts
M packages/engine/test/rules.test.ts
M packages/protocol/src/events.ts
M packages/protocol/src/schemas.ts
M packages/sim/src/env/envServer.ts
M packages/sim/src/runner.ts
M packages/sim/test/env.test.ts
M python/README.md
M python/rpgboard_env/env.py
M python/tests/test_client.py
A apps/web/test/shopDialog.test.tsx
A packages/ai/src/obs/layoutV5.ts
A packages/combat-ai/test/boardTotem.test.ts
A packages/engine/test/princeTotem.test.ts
A packages/engine/test/shopLimit.test.ts
A packages/protocol/test/itemActions.test.ts
```
