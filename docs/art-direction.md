# 아트 디렉션 — 드래곤 러쉬 (Dragon Rush) · "Ember Table"

> 상태: **구현 예정 (2차 개발 Phase R2·R3·R8)**. 모든 수치는 v1 기본값이며 플레이테스트와 주스(juice) 디버그 패널로 조정한다.
> 이 문서가 **보드 화면·연출·효과(FX)·오디오 규칙·접근성 설정의 정본**이다. 실시간 전투 규칙과 sim 안의 수치(히트스톱·넉백·예고 시간)는 [combat-design.md](combat-design.md)(구현 후 `packages/combat`의 `DEFAULT_COMBAT_RULES`), 에셋 파일 목록은 [development-plan.md §4.2](development-plan.md), 규칙은 [game-design.md](game-design.md)가 정본이다.
> 이 문서의 항목은 표현(presentation)이다. 현행 `rush-12` 이동은 1~10 룰렛이며 보드 관측·행동은 `obs_v5`/`act_v4`다. 내부 `ROLL_DICE`/`DiceRolled` 명칭은 호환성을 위해 유지한다. 연출은 기존 이벤트 예산 안에 맞춘다: `DiceRolled` 700ms, `Moved` 160ms/칸, `TileResolved`·`EffectApplied` 각 250ms, `MysteryCardDrawn` 600ms, `CombatStarted` 600ms, `CombatEnded` 700ms, `PlayerEliminated` 900ms. 서버 타이머는 연출을 기다리지 않는다.

## 1. 콘셉트
- **Ember Table (불씨의 작전 탁자)**: 어두운 홀의 조각된 호두나무 작전 탁자를 보드 한가운데 용의 둥지가 아래에서 비춘다. 칸은 나무에 박힌 양피지 명판, 영웅은 채색 판지 스탠디(standee), UI는 금테를 두른 원정대 문구류다.
- 톤: **따뜻한 빛의 다크 판타지 동화**(Armello의 방향을 조금 더 친근하게).
- 원칙 3가지: ① 보드가 주인공(화면 높이 60% 이상)이고 HUD는 모서리에 둔다. ② 한 순간의 초점은 하나다. ③ 텍스트 로그 대신 보드 위 연출(공간형 UI)로 상태를 보여 준다.
- 지금 화면이 "시뮬레이션"처럼 보이는 원인과 대응:

| 현재 | 대응 |
|---|---|
| 250px·보드·280px 3열 대시보드, 상시 텍스트 로그 | 모서리 플레이어 카드, 토스트 + "연대기" 서랍 |
| 균일한 평면 칸, 칸 번호, 모서리도 같은 크기 | 양피지 명판, 1.5fr 모서리 랜드마크, 번호는 툴팁에만 |
| 이모지 아이콘, 시스템 글꼴, 보라색 앱 팔레트 | game-icons SVG → 채색 그림, 웹폰트 4종, 따뜻한 팔레트 |
| `left/top`으로 미끄러지는 말, 동시에 여러 무한 깜빡임 | transform 홉, 초점 하나(스포트라이트) |

## 2. 팔레트 (`:root` CSS 토큰, 캔버스용 상수로도 복제)
| 토큰 | 값 | 용도 |
|---|---|---|
| `--table-0` / `--table-1` | #0F0B0A / #1A1210 | 배경 |
| `--wood-dark` / `--wood` / `--wood-hi` | #3B2618 / #5A3A22 / #8A5A32 | 보드 테두리, 독(dock) |
| `--parchment` / `--parchment-shade` / `--parchment-hi` | #EAD9B5 / #D8C29A / #F6EBD3 | 칸, 카드 |
| `--ink` | #2B1D14 | 양피지 위 글자 (11.7:1, shade 위 9.4:1) |
| `--gold` / `--gold-hi` / `--gold-deep` | #D9A441 / #F6D47A / #8A6424 | 테두리, 제목 (gold-hi on panel 12.5:1) |
| `--ember` / `--ember-hot` / `--ember-glow` | #C8402A / #FF7A3D / #FFB25B | 용, 위험, 둥지 빛 |
| `--panel` / `--panel-2` / `--panel-line` | #1E1512 / #2A1D18 / #4A3524 | HUD 카드 |
| `--bone` / `--bone-dim` | #F1E6D2 / #B8A68C | HUD 글자 (14.5:1 / 7.6:1) |
| `--good` / `--bad` / `--special` / `--safe` | #3E7D4A / #A3322B / #6B4FA8 / #2F6E7C | 칸 분류 보석 |
| `--felt` | #1F3A2E | 룰렛 트레이 |
| `--moon` | #8FB3D9 | 방어막 거품, 피해 없는 예고(밀어내기), 밤 비네트 |
| `--hazard-fill` / `--hazard-edge` | #FF7A3D (α .35→.60 채워지는 동안) / #FFB25B | 경기장 피해 예고, 항상 빗금 |
| `--outline` | #1A1210 | 전투 스프라이트 1 논리px 외곽선 |
| `--lowhp` | #6E2A22, α ≤ .20 | 채도 낮춘 저체력 가장자리 비네트 |

| 좌석 | 색 | 문장(crest) |
|---|---|---|
| 1 | #D9443A | 방패 |
| 2 | #2F78D6 | 마름모 |
| 3 | #23935A | 잎 |
| 4 | #F0B429 | 별 |

- `labels.ts`의 `SEAT_COLORS`를 위 값으로 바꾼다. 좌석색은 테두리·링·리본·문장에만 쓰고 넓은 면 채우기에는 쓰지 않는다(위험 색과 혼동 방지). 색만으로 구분하지 않도록 문장 모양을 항상 함께 쓴다(WCAG 1.4.1).
- 좌석색 위 흰 글자는 18px bold 이상에서만, 호박색(4) 위에는 잉크 글자(8.7:1). 기존 보라 패널 계열(#1c1626 등)은 없앤다.

## 3. 글꼴과 역할
| 토큰 | 글꼴 (Google Fonts) | 용도 |
|---|---|---|
| `--font-display` | Hahmlet 500/700/900 | 로고, 제목, 칸 이름, 카드 제목 |
| `--font-impact` | Black Han Sans | 숫자, 룰렛, 피해 숫자, 한글 배너. **라틴 글자 없음** |
| `--font-ui` | Noto Sans KR 400/500/700 | 라벨·버튼. 모든 카운터에 `font-variant-numeric: tabular-nums` |
| `--font-flavor` | Gowun Batang 400/700 | 카드 설명(분위기 글) |

- 로드: `family=Hahmlet:wght@500;700;900&family=Black+Han+Sans&family=Noto+Sans+KR:wght@400;500;700&family=Gowun+Batang:wght@400;700&display=swap`. 핫시트·오프라인용으로 Fontsource 패키지로 자체 호스팅한다(unicode-range 분할). 4종을 넘기지 않는다.
- 라틴 규칙: VS, KO, DRAGON RUSH는 Hahmlet 900 또는 이미지로 굽는다(Black Han Sans로 쓰면 시스템 글꼴로 대체됨).
- 콜아웃(Black Han Sans): 회피, 패링, 선제!, 불굴!, 광폭!, 관통, 준비, 싸워라!, 승리, 패배.
- 크기(1080p): 로고 88px · 배너 40px · 카드 제목 22px · HUD 숫자 22px · 본문 15~16px · 툴팁 14px · 최소 12px.

## 4. 화면 레이아웃 (기준 1920×1080, 최소 1280×720)
```
[P1 카드]     [턴 순서 코인 · 라운드 다이얼 · 브레스 룬 3개]      [P2 카드]
              ┌──────── 기울어진 보드 (먼 변 ≈805px) ────────┐
              │ START ……………………………………………………… SHOP │
              │   ⋮        용의 둥지 600×600 (중앙)        ⋮   │
              │ SHOP ………………………………………………………… INN │
              └──────── 가까운 변 ≈1190px ───────────────────┘
[P3 카드] 토스트↑   [룰렛 트레이] [룰렛 돌리기] [용에게 도전] [아이템]  [P4 카드] [연대기]
```
- **모서리 플레이어 카드** 320×116: 초상화 메달 96px(카드 밖으로 걸침), 좌석색 이름 리본, HP 바 200×14(400ms 고스트 감소), ATK·DEF·코인 24px 아이콘 + Black Han Sans 숫자, 아이템 소켓 30px×3. 2인이면 위쪽 두 모서리만 쓴다. 생각 중(봇·원격)은 초상화 위 점 3개.
- **상단 띠**: 턴 순서 코인 36px(현재 48px), 돌 라운드 다이얼, 브레스 룬 3개.
- **하단 독** 약 150px: 주 버튼 220×64 "룰렛 돌리기"(행동 가능할 때만 은은한 반짝임), 진홍 "용에게 도전"(합법일 때만 표시), 아이템 카드(호버 시 −12px·1.05배·150ms), 강화는 모루 트레이로 열린다.
- **로그**: 왼쪽 아래 토스트 3개(각 6초). 전체 `GameLog`는 양피지 "연대기" 서랍으로 옮긴다.
- 폭 1100px 미만: 지금의 세로 배치 + 평면 보드(`rotateX(0)`).

## 5. 보드와 카메라 (DOM + CSS 3D, 게임 엔진 없음)
**레이어 트리** (바깥 → 안쪽). transform 하나에는 주인이 하나뿐이다(두 시스템이 같은 transform을 쓰면 서로 덮어씀).
1. `.world-shake` — rAF trauma 루프가 쓴다(§11.3). HUD는 이 밖에 있다.
2. `.stage { perspective:1600px; perspective-origin:50% 35% }`
3. `.camera` — WAAPI 카메라 비트만 쓴다: `translate3d` + `scale`, 450~600ms, `cubic-bezier(.2,.7,.2,1)`.
4. `.board3d { transform: rotateX(40deg); transform-style: preserve-3d }` — 칸, `.token-layer`(preserve-3d), 덩어리 그림자. 기울기는 정적.
5. 화면 공간 파티클 `<canvas>` (`pointer-events:none`, DPR 스케일, 전투 캔버스와 코드 공유).
6. HUD.

- **2~4층 금지 속성**: `filter`, `opacity<1`, `overflow:hidden`, `clip-path`, `mask`, `mix-blend-mode`, `isolation`, `contain:paint`. 하나라도 있으면 3D가 조용히 평면화된다. 어둡게 하기·스포트라이트는 별도 화면 공간 오버레이에서, 선택 표시는 개별 칸에서 한다.
- **기하**: 보드 평면 960px, `grid-template: 1.5fr repeat(5,1fr) 1.5fr` → 모서리 180×180, 변 칸 120×180, 중앙 둥지 600×600. 기울기 36~42°(먼 변 축소 ≈0.84, 55°는 글자가 너무 눌림). 테두리 28px 호두나무 9-slice + 금 비즈. 명판 두께 `box-shadow: 0 6px 0 #6b4a2c, 0 10px 14px rgba(0,0,0,.45)`. 조명: `radial-gradient(circle at 50% 45%, rgba(255,140,60,.18), transparent 55%)` + 가장자리 비네트 `rgba(0,0,0,.6)`.
- Firefox 3D 정렬 확인: 말이 칸을 파고들면 말에 `translateZ(1px)`, DOM 순서상 뒤에 둔다.

| 카메라 비트 | 움직임 |
|---|---|
| 턴 시작 | 말 쪽으로 8% 이동, 1.04배, 500ms |
| 룰렛 이동 중 | 유지 |
| 이벤트 칸 착지 | 1.06배, 250ms |
| 결투·용 도전 | 칸 또는 둥지로 1.15배 400ms → 발톱 와이프 250ms로 전투 화면 전환 |
| 복귀 | 600ms ease-in-out |
| 승리 | 800ms 뒤로 물러남 |

## 6. 칸·랜드마크·용의 둥지
- **명판**: 양피지 그라디언트 #EAD9B5→#D8C29A + 종이결 텍스처. 아이콘 56~64px, 이름은 Hahmlet 700 15~16px 잉크색. 글자는 회전하지 않고 카메라를 향한다.
- **효과 칩**: 명판 아래쪽에 `+3 🪙`, `−5 HP`처럼 아이콘 + Black Han Sans 숫자. 이름을 읽지 않아도 효과를 안다.
- **칸 번호(`tile-index`) 제거**, 툴팁에만 표시. 호버: `translateZ(6px)` + 금테 + 화면 공간 툴팁 카드. 범례 보석에 호버하면 같은 분류의 칸이 모두 4px 떠오른다(Slay the Spire 2 방식).
- **분류 보석** (보석과 테두리만 칠하고 양피지는 그대로):

| 분류 | 칸 |
|---|---|
| good | GOBLIN, HERB, WOLF, TREASURE, BLACKSMITH, ORC, FOUNTAIN, TROLL (사냥 칸은 칩 두 개) |
| bad | POISON_SWAMP, BANDIT, TRAP, PICKPOCKET, CURSED_ALTAR, ROCKFALL, SPIDER_WEB, STORM |
| special | TRAINING, MYSTERY×2, WANDERING_MERCHANT |
| corner landmarks (visual category) | START, SHOP×2, INN — 외형 분류일 뿐이다. 현행 `rush-8`에서는 START를 포함해 PvP 안전 칸이 없다 |

- **모서리 랜드마크**: 명판에서 솟은 스탠디 소품, `rotateX(-40deg)` 빌보드. START = 깃발 문, SHOP = 등불 단 상인 천막(2곳 공용), INN = 굴뚝 연기 나는 목조 여관. 대기 루프 2~4초.
- **살아 있는 둥지** (600×600, 외형 전용, 규칙 영향 없음): 현무암 분화구 + 용암 균열(별도 leaf의 `transform` 6초 루프) + 불씨.

| 둥지 상태 | 조건 | 연출 |
|---|---|---|
| 잠듦 | 기본 | 콧김 연기 |
| 깨어남 | 누군가 이번 턴에 도전할 수 있음 | 눈이 빛남 |
| 포효 | 용 도전 시작 | 포효 SFX, 음악 더킹, trauma 0.55 |

- HP는 분할된 "비늘" 바로, 브레스는 룬석 3개와 "브레스까지 N" 의도 아이콘으로 보여 준다. 둥지 빛은 라운드마다 +2%(최대 +30%). 전투 전 화면에는 플레이어와 상대의 현재 스탯·선택지만 표시하고 승률 예측은 노출하지 않는다.
- `ShieldUsed`가 누구에게서 발생하든(상대·봇 포함) 플레이어 이름과 "결투 취소"를 전용 방어막 알림으로 2.4초 보여 준다. 일반 토스트 대기열과 독립적으로 표시한다.
- **주변 움직임 상한**: 용암 루프 6초, 모서리 소품 2~4초, 현재 말 숨쉬기 1.6초, 둥지 용 숨쉬기 3초(둥지 안만). 그 외는 정지. 코인 반짝임 같은 추가 루프는 두지 않는다.

## 7. 말(스탠디)과 이동
- **구성**: 흉상~무릎 직업 그림 + 좌석색 원형 받침과 문장. `transform: translate3d(x,y,0) rotateX(-40deg); transform-origin: 50% 100%`. 덩어리 그림자는 받침 폭의 70%. 위치는 transform으로만 바꾼다(`left/top` 금지).

| 홉 요소 | 값 |
|---|---|
| 칸당 시간 | 첫 칸 160ms, 이후 ×0.9씩 줄어 최소 120ms (`Moved` 예산 이내) |
| 궤적 | 안쪽 노드 `translateZ` 0 → 30px(45%) → 0(85%) |
| 그림자 | 크기 1 → 0.7 → 1, 불투명도 .5 → .3 → .5 |
| 찌그러짐 | 매 칸 (1.08, 0.92), 마지막 착지 (1.18, 0.84) |
| 칸 반응 | 착지마다 −2px 80ms 눌림, 틱 SFX 매 칸 +1 반음 |
| 마지막 착지 | 먼지 퍼프 + 칸 빛남 |

- 굴린 눈은 말 머리 위에 Black Han Sans 40px 금색(어두운 외곽선)으로 뜨고 홉마다 1씩 줄다가 0에서 터진다.
- 현재 말만 1.6초 주기로 2px 숨쉬고 나머지는 정지. **스포트라이트**: 화면 공간 오버레이 `radial-gradient(circle at var(--px) var(--py), transparent 9%, rgba(10,6,4,.35) 32%)`, 300ms 페이드인, 중심은 말의 `getBoundingClientRect()`. 현재 모서리 카드는 10px 안쪽으로·1.06배·좌석색 빛. 비활성 카드는 opacity 0.85(보드·말 레이어는 어둡게 하지 않음).
- 턴 리본 "○○의 차례": 600ms 등장 + 400ms 유지, 사람 차례에만.
- 탈락: 말이 350ms에 걸쳐 넘어짐(rotateX → 90°), 카드는 500ms에 금이 가며 채도 감소 + 해골 도장. 클래스는 카드에만 붙이고 3D 조상에는 붙이지 않는다.

## 8. 이동 룰렛 (SVG 10분할 원판)
- 펠트 트레이에 1~10을 균등하게 배치한 원판과 고정 포인터를 둔다. 서버 엔진의 `DiceRolled.value`가 결과를 결정하며 원판은 그 숫자가 포인터에 오도록 회전한다. 내부 `ROLL_DICE`/`DiceRolled` 이름은 호환성을 위해 유지한다.
- 700ms 회전과 600ms 무렵의 작은 초과 회전을 거쳐 정착한다. `prefers-reduced-motion`에서는 즉시 결과를 표시한다. 화면 낭독에는 "이동 룰렛 N칸"을 전달한다.

| 시간 | 단계 |
|---|---|
| `pointerdown` (로컬 사람만) | 소리 시작 — 요청 전에 시작해 서버 시간을 늘리지 않고 기대감을 만든다 |
| 0~600ms | 10분할 원판이 회전하고 결과 칸 근처에서 감속 |
| 600~700ms | 작은 초과 회전 뒤 고정 포인터 아래의 서버 결과에 정착 |

- 그 뒤 결과 숫자가 튀어나온다. 닌자 ±1은 룰렛 옆 화살표 버튼으로 결정한다.
- **충전 게이지는 두지 않는다**: 룰렛은 서버 RNG라 실력이 결과를 바꾸는 것처럼 보이면 안 된다. 빠른 전투의 d6은 별도 규칙이다.

## 9. 이벤트 카드·대화창 소품
- **카드 공개**: ① 칸 80ms 섬광 ② 카드가 칸에서 화면 중앙으로 0.4 → 1배(200ms, back-out) ③ 180ms 뒤집기 ④ 뒤집힌 면을 1배속에서 2.7초간 표시 ⑤ 250ms 페이드아웃. 카드 총 표시 시간은 1배속에서 3.33초다. 효과 칩은 주인의 모서리 카드로 250ms 날아가고(ease-in) 카운트업한다(§11.7). 일반 사건에서는 카드가 표시되는 동안 보드 연출 큐를 유지해 다음 사건이 덮지 않게 한다. 배속 설정을 올리면 표시 시간도 같은 비율로 줄어든다.
- **대화창 = 소품** (기능 동일, 겉모습만 교체):

| 대화 | 소품 |
|---|---|
| 상점 | 상인 노점 위 천에 아이템 카드 3장 + 코인 가격표, 못 사는 카드는 사슬 + 어둡게 |
| 수련장 | 모루와 스탯 카드(ATK·DEF·최대 HP), 망치 내려치기로 확정 |
| 미지의 동굴 | 동굴 입구의 엎어진 카드 덱 |
| 결투·용 도전 확인 | 도전 두루마리 |
| 텔레포트 대상 | 세계를 오버레이로 어둡게 + 유효 대상에 금테 |

## 10. 전투 경기장 아트
- **캔버스**: 논리 960×540, 1타일 = 32px, 16:9 맞춤, devicePixelRatio로 렌더. 정적 배경·바닥, 동적인 전투원·예고·FX, HUD를 겹친 캔버스로 합성하고 실제 변화가 있는 레이어만 갱신한다. 아트는 2배(스프라이트 셀 128×128 = 논리 64px)로 그린다. PvP 경기장 800×448, 용 경기장 896×448, 위쪽 56px HUD 띠 아래 중앙. 여백 ≥ 29px라 1.06배 줌 펀치에도 플레이 영역이 잘리지 않는다.
- **시점**: 2D 탑뷰 경기장 위에 위에서 비스듬히 내려다본 3/4 캐릭터를 y 정렬한다. 스탠디와 같은 디자인의 채색 스타일이다. 카메라는 **고정**(두 로컬 플레이어가 한 화면을 공유). 움직임은 킥·흔들림·줌 펀치(≤1.06)뿐.
- **v1 스프라이트**: 위에서 내려다본 3/4 몸통의 우향 포즈를 좌우 반전한다(순수 측면 포즈 금지). 8방향 공격의 실제 범위와 조준은 회전하는 궤적·무기·발 링 방향표로 표현한다. 정면·후면 전용 프레임은 P2.
- **가독성**: 좌석 발 링(타원 28×12 논리px, 2px 선), 머리 위 문장과 이름표, 1 논리px 어두운 외곽선, 절차 바닥 그림자. 같은 직업 대결은 링과 문장으로만 구분(팔레트 교체 없음).
- **바닥**: 중간 어둡기·저채도, 플레이 영역 안에 빨강·주황 금지(예고 대비 확보). 예고는 바닥 위·캐릭터 아래에 그린다. 피해 예고 = `--hazard-*` 빗금, 밀어내기(피해 없음) = `--moon`. 위험 종류는 화면에 최대 2종.
- **전투 HUD** (56 논리px 띠): HP 바 2개(400ms 고스트), 중앙 타이머, 스킬·대시 쿨다운 아이콘, 패시브 핍(불굴 방패, 선제 화살, 회피 8칸, 광폭). 용전은 진홍 가죽 보스 바 + 브레스 핍 3개.
- **진입**: 보드 1.15배 줌 → 발톱 와이프 250ms → VS 1.3초(초상화 300ms easeOutBack으로 미끄러져 들어옴, 충돌 순간 흰색 α ≤ 0.3·80ms, trauma 0.55) → 준비 1.5초(플레이어별 키캡 힌트) → "싸워라!"(sim 틱 0). 합계 2.8초.
- **퇴장**: 결과 카드 1.2초 → 와이프 → 보드 카메라 600ms 복귀 → 모서리 카드 HP 카운트다운.

## 11. 효과(FX)
### 11.1 구조
- **React 밖 rAF FX 루프 하나**가 trauma 흔들림, 파티클 풀(구조체 배열, 살아 있는 입자 최대 500), 떠오르는 글자, 오버레이 캔버스를 소유한다. React는 정적 레이아웃만 그리고, 효과는 ref로 `transform`/`opacity`만 쓰거나 캔버스에 그린다. DOM 1회성은 WAAPI, 탄성·튕김 곡선은 CSS `linear()`.
- **이벤트 버스**: 보드는 `eventTimeline.ts`, 전투는 sim 이벤트(`Hit{attacker,target,dmg,kind,dir,pos}`, `Parry`, `Evade`, `LastStand`, `RageOn`, `TelegraphStart/End{kind,shape,ticks}`, `ProjectileSpawn`, `WallSlam`, `PhaseChange`, `BreathTick`, `KO`, `FightEnded`)를 **구독만** 한다. 학습 env는 FX 없이 돈다.
- **결정성 경계**: FX RNG는 전투 시드나 보드 이벤트 id로 시드한 xorshift(재생이 똑같이 보이게). sim RNG·엔진 RNG를 쓰지 않는다. 시계 3개: `simTime`(히트스톱 중 정지), `fxTime`(계속 흐름 — 정지 중에도 흔들림·입자 진행), `uiTime`(슬로모와 무관). 프레임 독립: 선형 감쇠 `×dt`, 지수 감쇠 `pow(k, dt*60)`.
- **sim에 들어가는 것**: 히트스톱, 넉백, 예고 시간, 입력 버퍼뿐(학습과 실전이 같아야 함). 나머지는 모두 표현.
- **주스 디버그 패널**(juicy-breakout 방식): 효과마다 켜기/끄기와 슬라이더, 전체 "juice off" A/B 스위치.

### 11.2 카탈로그 (B = DOM 보드, A = 캔버스 경기장)
| 우선 | 면 | 효과 | 규격 |
|---|---|---|---|
| P0 | B | 룰렛·홉·스포트라이트·카드 | §7~§9 |
| P0 | B | 칸 착지 | 좋음: 빛남 1→1.08→1(easeOutBack 250ms) + 금 반짝이 12 + 차임. 나쁨: 4px×3회 흔들림 200ms + 검은 연기 8 + 둔탁음 + trauma 0.45. 동굴: 300ms 어두워짐 → 공개 팝 |
| P0 | B | 카운트업·떠오르는 숫자, 코인 비행 | §11.7 |
| P0 | B | 버튼 누름 | 누름 0.95배 + 2px(60~80ms), 놓음 easeOutBack 150~200ms, 호버 2px 뜸, 클릭 SFX ±1 반음 |
| P0 | A | 히트스톱(sim) + 피격자 떨림 | §11.4. 피격자는 넉백 축으로 3 논리px에서 0으로 줄며 떨림, 공격자 1px. 허트박스는 움직이지 않음 |
| P0 | A | 피격 섬광 | 미리 구운 흰 실루엣 2~3프레임 → 피격 포즈. 개체당 100ms에 1회. 광과민 모드: 50% 틴트 + 외곽선 |
| P0 | A | 넉백(sim) | 약 12f 동안 20px, 강 22f 동안 72px, 선형 감속. 벽 충돌 +6f 경직 |
| P0 | A | 타격 불꽃·충격 링 | 불꽃: 약 8 / 강 20 / 패링 14(청백), ±35° 원뿔, 200~500 논리px/s, 120~250ms, 가산 혼합, 줄무늬로. 링: 약 0.2초 r 4→28, 강 0.35초 r 8→64, 강하 0.5초 r 0→120, α .5→0, QuadOut, 선 6→1 |
| P0 | A | 피해 숫자 | §11.6 |
| P0 | A | 예고(telegraph) | 빗금 채움 0→1, 외곽선, 모양(원뿔·원·선), 공격마다 고유 SFX, 브레스 핍, 자막. 위험 종류 최대 2 |
| P0 | A | 찌그러짐·늘어남 | 준비 (1.15, 0.85) 60~80ms, 돌진 (0.85, 1.2), 피격 (1.25, 0.8), 회복 easeOutBack 120~150ms, sx·sy ≈ 1 유지 |
| P0 | 둘 다 | trauma 흔들림 / 오디오 핵심 / 접근성 | §11.3 / §11.8 / §12 + FlashGovernor |
| P1 | A | 카메라 킥 | 공격 반대 방향 6 논리px, 매 틱 ×0.85 (강타, 충전 화살, 메테오, 돌진) |
| P1 | A | 줌 펀치 | ≤1.06, 40ms 상승 후 틱당 ×0.9 (KO, 불굴, 페이즈 전환) |
| P1 | A | KO "보스 스톱" | 일반: 350ms 정지 → 0.3배속 700ms → 200ms 복귀. 용 처치: 500ms 정지 + 1.2초 슬로모 + 흰색 **페이드**(섬광 아님). sim은 KO 틱에 이미 끝났으므로 표현 전용 |
| P1 | A | 베기 궤적·직업 시그니처 | 궤적 100~150ms 테이퍼 호(검사 얼음빛 흰색, 광전사 주황, 닌자 보라, 마법사 비전색). 마법사 룬 고리 + 깨진 방패 "관통", 궁수 금화살(선제), 검사 방패 파편 10개 + 금색 "불굴!", 광전사 붉은 오라 |
| P1 | A | 먼지·잔상·데칼 | 먼지: 대시 시작 4, 강착지 8, 미끄러질 때 30ms마다 1. 잔상(닌자 대시·회피, 마법사 점멸) 35ms 간격 3~4개, α .5→0 150ms. 브레스 그을음·균열은 바닥 캔버스에 구움(링 버퍼 64) |
| P1 | 둘 다 | 불의 고리 VFX, 저체력 심장박동 + 비네트(≤1.5Hz), 음악 더킹, 모서리 소품·둥지 상태·소품 대화창·범례 호버, 탈락·승리(색종이 120~200 + 팡파르) | — |
| P2 | — | 클릭 소품(용 콧김, 보물 짤랑), 보드 용 숨쉬기, 전투 정면·후면, WebGL 아지랑이·왜곡 링, 게임패드 진동, 음악 스템, 보스 스톱 로우패스 | — |

### 11.2.1 전투·보드 속도감 보강 (2026-11-12)
- 강한 기술 시작·강타·어깨 돌진·용의 돌진/강하 발동과 보드 텔레포트 출발/도착에만 180ms 가장자리 속도선을 낸다. 화면 중앙은 비우고 320ms 재발동 간격을 두어 연속 타격도 계속 선을 연장하지 못하게 한다. 기존 FX 캔버스에서만 활성 프레임을 그리고 다섯 묶음으로 선을 그린다. 용의 적대적 예고가 진행되는 동안 전투 속도선을 숨겨 위험 영역의 모양과 빗금이 먼저 읽히게 한다.
- 예고 9종은 각기 다른 소리와 **공격 이름을 알리는 자막**을 함께 쓴다. 자막 기본값은 켬이며 사용자가 끌 수 있다. 동작 줄이기에서는 속도선을 생략하고 기존 소리·자막·충격 링·히트스톱을 유지한다. 보드/전투 sim의 틱·피해·판정은 건드리지 않는다.
- 근거: [GDC Juice It or Lose It](https://www.gdcvault.com/play/1016789/Juice-It-or-Lose) (반응을 여러 감각 채널로 쌓기), [GDC Juicing Your Cameras](https://media.gdcvault.com/gdc2016/Presentations/Eiserloh_Squirrel_JuicingYourCameras.pdf) (흔들림을 절제하고 감쇠시키기), [GDC Powerful and Effective Animation](https://media.gdcvault.com/gdcchina14/presentations/833784_MarielCartwright_PowerfulAndEffective_EN.pdf) (접촉 순간 히트스톱), [GDC VFX as a Game Design Language](https://media.gdcvault.com/GDC%2B2022/Speaker%2BSlides/VFXasagamedesignlanguage_Nguyen_An-Tim.pdf) (위험 신호의 정보성 및 색 외의 시각 언어), [MDN reduced motion](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/%40media/prefers-reduced-motion) (시스템 동작 선호 반영), [MDN Optimizing canvas](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas) (캔버스 호출 묶기와 비활성 프레임 렌더링 회피). 가장자리 속도선의 위치·시간은 이 원칙을 Dragon Rush에 적용한 연출 선택이다.

### 11.3 Trauma 흔들림
- shake = trauma², trauma 선형 감쇠 1.5/s, 1D Perlin 20Hz, 채널(roll, x, y) 오프셋 0/100/200. 기본 카메라의 **복사본**에만 적용.
- 상한: 보드 20 CSS px(1080p 기준, 뷰포트 높이 ÷ 1080로 스케일) + 1° 회전, `.world-shake`에 적용. 경기장 16 논리px + 2°. **HUD는 흔들지 않는다.** 적 예고가 채워지는 동안은 4px·회전 0으로 제한. 모두 흔들림 슬라이더를 곱한다.

| 사건 | trauma | ≈ 결과 |
|---|---|---|
| 보드: 룰렛 결과 / 텔레포트 / 나쁜 칸 | 0.32 / 0.35 / 0.45 | 2 / 2.5 / 4px |
| 보드: 결투·용 도전 / 탈락 | 0.55 / 0.63 | 6px / 8px + 0.4° |
| 경기장: 약타 / 강타 / 패링·벽 충돌 | 0.20 / 0.35 / 0.40 | 0.6 / 2 / 2.6px |
| 경기장: 플레이어가 발톱·꼬리·화염구 피격 / 불굴 | 0.50 / 0.55 | 4 / 4.8px |
| 경기장: 돌진 벽 충돌 / 강하 착지 | 0.60 / 0.65 | 5.8 / 6.8px |
| 경기장: 브레스 지속 | +0.6/s, 소프트 상한 0.5 | 4px |
| 경기장: KO / 용 처치 | 0.85 / 1.00 | 11.6 / 16px |

### 11.4 히트스톱 (sim 안, 60Hz 틱)
- 두 전투원과 모든 투사체가 함께 멈춘다(Sakurai). 정지 중 입력 버퍼 타이머도 멈춘다. 값의 정본은 구현 후 `DEFAULT_COMBAT_RULES`.

| 타격 | 틱 |
|---|---|
| 약 (P ≤ 0.8) / 다단(회오리·일제 사격) | 3 / 2 |
| 보통 (0.8 < P < 1.5) | 5 |
| 강 (P ≥ 1.5: 마무리, 도끼, 충전 화살, 메테오) | 7 |
| 패링 성공 | 10 |
| 광폭 중 타격 / 용 머리 약점 타격 | +2 / +2 |
| 용 발톱·꼬리·화염구 → 플레이어 / 돌진·강하 → 플레이어 | 6 / 8 |
| 브레스 틱, 불타는 바닥, 불의 고리 | 0 (섬광만) |
| 불굴 발동 | 15 (상한의 유일한 예외) |
| 상한 | 12 |
| KO | sim 0 — 전투는 KO 틱에 끝남. 정지·슬로모는 `FightEnded` 뒤 표현 |

### 11.5 FlashGovernor (항상 켜짐)
- 전체 화면 섬광은 350ms에 최대 1회(초당 3회 미만), α ≤ 0.3, ≤ 80ms.
- 채도 높은 빨강 금지: R/(R+G+B) ≥ 0.8인 전체 화면 효과는 채도를 낮춘다.
- 대비 10% 넘는 줄무늬가 화면 20% 이상을 덮지 않는다. 스프라이트 피격 섬광은 면적이 작고 개체당 100ms 제한.

### 11.6 피해 숫자 (경기장, Black Han Sans)

화면의 피해 수치만 소수점 첫째 자리로 반올림한다. 전투 계산에 사용하는 원래 정밀도는 유지한다.
| 종류 | 규격 |
|---|---|
| 보통 | 12 논리px, 팝 0.4→1.25→1(150ms), 700ms 동안 20px 상승, 마지막 30% 페이드, 2px 어두운 외곽선 |
| 강타 / 용이 플레이어를 침 | 16 논리px |
| 회복 | 초록, 더 느리게 |
| 회피 | 회색 "회피", 옆으로 20px |
| 패링 / 불굴 | 파랑 "패링" / 금색 "불굴!" 24px, 900ms 유지 |

- 같은 대상의 150ms 안 타격은 합친다. 대상당 최대 6개, 14px씩 쌓는다. 종류별 움직임 차이가 숫자보다 중요하다.

### 11.7 코인 비행·카운트업 (보드)
- 코인 1개당 스프라이트 1개(최대 10). 20~40px 퍼짐 120ms → HUD 카운터까지 2차 베지어 450ms(easeInCubic), 35ms 간격. 도착마다 짤랑 +1 반음, HUD 아이콘 1.1배 펀치. 소비는 반대 방향.
- 카운트업: 변화량 ≤ 10이면 300ms, 그 이상 500ms. 40ms마다 틱, 틱마다 +1 반음(최대 +12). 떠오르는 숫자 +초록/−빨강 600ms 동안 24px 상승 후 페이드. HP 바는 400ms 흰 고스트가 뒤따른다. rAF에서 ref로 `textContent`를 써 React 재렌더를 피한다.

### 11.8 오디오
- **컨텍스트**: `AudioContext({latencyHint:'interactive'})` 하나, 첫 클릭(타이틀 "시작")에서 `resume()`. 모든 SFX를 미리 `fetch` + `decodeAudioData`. 재생마다 새 `AudioBufferSourceNode`, `start(ctx.currentTime + offset)`으로 예약. 값 변경은 AudioParam 예약(`setValueAtTime`/`setTargetAtTime`)으로만(클릭 잡음 방지).
- **버스**: `sfx` 0.9, `ui` 0.7, `music` 0.6, `ambience` 0.5 → 마스터 `DynamicsCompressor`(threshold −6dB, ratio 12, attack 3ms, release 250ms) → 출력. 버스마다 볼륨 슬라이더.
- **변형**: 자주 나는 소리는 변형 3~5개 라운드로빈(같은 것 연속 금지), detune ±100~200 cents, 볼륨 −0~−3dB. 상승 시퀀스(홉, 코인, 카운트 틱)는 +1 반음씩, +12에서 리셋. 인식용으로 **고정**: 내 차례 차임, 룰렛 결과 차임, 브레스 충전. 소리당 동시 4개, 재발음 간격 ≥ 40ms.
- **더킹**: 용 포효·브레스·KO·VS 충돌 때 음악을 −9dB로: `setTargetAtTime(dbToGain(-9), t, 0.005)` → 400ms 유지 → `setTargetAtTime(1, t+0.4, 0.15)`.
- **동기화**: 타격 SFX는 접촉 프레임(히트스톱 시작)에 낸다. 그보다 먼저 내지 않는다(허용: 45ms 이르게 ~ 125ms 늦게). 보드 SFX는 네트워크 도착이 아니라 애니메이션 타임라인에서 예약한다.
- **루프**: 제공받은 `audio/bgm/menu.mp3`는 로비·보드, `battle.mp3`는 결투·PvE·용전에 사용한다. 승리 화면에는 제공받은 `triumph_of_the_hero.mp3`, 패배·무승부에는 자체 제작한 `result_defeat.mp3`·`result_draw.mp3`를 사용한다. 승자는 로컬 조종 좌석 기준이며 관전자는 승리 곡을 듣는다. 마지막 보드 애니메이션이 끝나고 결과 화면이 나타날 때 전환한다. 이전 음악을 짧게 감쇠해 완전히 멈춘 뒤 결과 곡을 시작한다. 첫 사용자 입력으로 `AudioContext`가 열린 뒤 음악 버스에서 재생하고 파일 전체를 반복한다. 선택 사항인 `audio/bgm/loops.json`의 키는 각 파일명이며 `loopStart`/`loopEnd`는 초 단위다. 결과 곡의 출처·재생성 범위는 `apps/web/assets/audio/README.md`를 참조한다.
- **파일 오류**: BGM 파일이 없거나 디코딩에 실패하면 음악을 재생하지 않는다. 절차 BGM은 사용하지 않는다. 효과음의 파일·절차 대체 경로는 그대로 유지한다.
- **레이어링 권장**(효과음 제작): 순간음(0~30ms) + 몸통 + 꼬리, 강타·폭발은 저역(sub) 레이어 추가.

## 12. 접근성·설정
| 설정 | 기본값 | 동작 |
|---|---|---|
| 동작 줄이기 | OS `prefers-reduced-motion` 따름(`change` 이벤트 구독), 게임 안 토글 | 기울기 0°, 카메라 이동·흔들림·줌 펀치·슬로모 없음, 홉 → 80ms 크로스페이드, 룰렛 회전 생략·결과 즉시 표시, 파티클 50%, 피해 숫자는 제자리 페이드. **히트스톱은 유지**(움직임이 아니라 정지) |
| 흔들림 세기 | 100% (0~100%) | 모든 흔들림·킥·줌 펀치에 곱함 |
| 광과민 모드 | 끔 | 전체 화면 섬광 전부 없음, 피격 섬광 → 틴트 + 외곽선. FlashGovernor는 설정과 무관하게 항상 동작 |
| 버스별 볼륨 | §11.8 기본 게인 | music / ambience / sfx / ui |
| 중요 소리 자막 | 켬 | "용이 숨을 들이쉰다!", 돌진, 불의 고리, "내 차례" |
| 배경 애니메이션 | 켬 | 끄면 용암·소품·숨쉬기 루프 정지 |
| 키보드 테스트 | — | 전투 키 8개 동시 입력 확인 화면 ([combat-design.md](combat-design.md) §2) |

- 글자 대비는 WCAG 1.4.3(본문 4.5:1, 큰 글자 3:1)을 만족한다(§2 팔레트 값으로 계산). 색은 항상 모양·무늬·글자의 보조로만 쓴다.

## 13. 구현 순서 (Phase R2·R3, 기능 변경 없음)
1. **R2-P0**: 글꼴·팔레트 토큰, 탁자 배경·테두리, 1.5fr 모서리, 보석·효과 칩이 있는 양피지 칸(번호 제거), 모서리 HUD, 토스트 + 연대기, 이모지 → game-icons SVG.
2. **R2-P1**: CSS 3D 기울기, 카메라 래퍼, 빌보드 스탠디·덩어리 그림자, transform 홉·카운트다운, 스포트라이트, 동작 줄이기 경로.
3. **R2-P2**: 룰렛·트레이, 이벤트 카드·HUD로 날아가는 카운트업, 소품 대화창, 둥지 상태.
4. **R3**: FX 루프·파티클·흔들림·FlashGovernor·오디오 버스·설정·디버그 패널 → 전투 경기장 P0 효과 → P1 효과. 그 뒤 R8에서 채색 에셋으로 교체.

## 14. 출처 (핵심)
- Armello 설계: https://www.thumbsticks.com/designing-armello-from-paper-and-card-to-tablet-and-console · https://www.gamedeveloper.com/design/road-to-the-igf-league-of-geeks-i-armello-i- · Hearthstone 보드의 물성: https://www.invenglobal.com/articles/1554/how-hearthstones-art-director-ben-thompson-breathed-life-into-hearthstone
- Monopoly Plus "Living Board": https://store.ubisoft.com/ca/monopoly-plus/59a6b2d788a7e33d638b4570.html?lang=en · 보드게임 디지털화의 긴장: https://blogs.tuni.fi/playlab/game-research-highlights/digitising-boardgames-issues-and-tensions/ · 공간형 UI 분류: https://gamedeveloper.com/design/user-interface-design-in-video-games
- CSS 3D 평면화 조건: https://developer.mozilla.org/en-US/docs/Web/CSS/transform-style · CSS3D 게임 구조: https://xem.github.io/articles/css3dgames.html
- transform/opacity만 애니메이션: https://web.dev/articles/animations-guide
- 글꼴: https://fontsource.org/fonts/hahmlet/about · https://fontsource.org/fonts/black-han-sans/about · https://developers.googleblog.com/en/google-fonts-launches-korean-support/
- 아이콘(CC BY 3.0): https://game-icons.net/
- Juice It or Lose It: https://gdcvault.com/play/1016487/Juice-It-or-Lose · 설정 목록: https://raw.githubusercontent.com/grapefrukt/juicy-breakout/master/src/com/grapefrukt/games/juicy/Settings.as
- Trauma 흔들림(Eiserloh GDC16): https://archive.org/stream/GDC2016Eiserloh/GDC2016-Eiserloh_djvu.txt · Bevy 구현: https://bevy.org/examples/camera/2d-screen-shake/
- 히트스톱(Sakurai): https://sourcegaming.info/2015/11/11/thoughts-on-hitstop-sakurais-famitsu-column-vol-490-1/ · https://www.ssbwiki.com/Hitlag
- Nuclear Throne 타격 분해: https://infovore.org/tag/feel/ · Celeste 소스: https://raw.githubusercontent.com/NoelFB/Celeste/master/Source/Player/Player.cs · deepnight 카메라: https://raw.githubusercontent.com/deepnight/gameBase/master/src/game/Camera.hx
- 이징: https://raw.githubusercontent.com/ai/easings.net/master/src/easings/easingsFunctions.ts · https://developer.mozilla.org/en-US/docs/Web/CSS/easing-function/linear · 미세 동작 수치(2차 분석): https://blakecrosley.com/guides/design/balatro
- 오디오: https://developer.chrome.com/blog/autoplay · https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices · 더킹 값: https://composer-docs.vindral.com/operators/operators-sidechain-ducking.html · A/V 동기 허용치: https://en.wikipedia.org/wiki/Audio-to-video_synchronization
- 접근성: https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/118 · https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/117 · https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html · https://www.w3.org/WAI/WCAG21/Understanding/use-of-color.html · https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion
