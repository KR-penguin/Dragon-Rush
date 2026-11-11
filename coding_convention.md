# 코딩 컨벤션 — 용사의 주사위 (Hero's Dice)

> 꼭 지켜야 할 규칙 8개만 둔다. 들여쓰기·따옴표·import 순서 같은 포매팅은 **Prettier + ESLint(flat config)** 가 정하므로 여기서 다루지 않는다.
> 설계 배경은 [docs/architecture.md](docs/architecture.md), AI 계약은 [docs/ai-interface-spec.md](docs/ai-interface-spec.md)를 본다. 규칙을 어겨야 할 사정이 있으면 커밋 본문(원격이 생기면 PR 설명)에 근거를 적고, 착수 전에 사용자에게 브리핑해 승인받는다.

## 1. 엔진은 순수·결정적이다

**`packages/engine`에서는 `Math.random`·`Date`·I/O·전역 가변 상태를 쓰지 않는다. 무작위는 모두 `state.rng`(seeded sfc32)에서 얻고, state는 변경하지 않고 새 객체를 반환한다.**
- 같은 `(setup, rules, seed, actions)`를 넣으면 항상 같은 state·events가 나와야 한다. 시드는 호출자(서버·브라우저·env)가 넘겨준다.
- **왜**: 서버 권위, 리플레이 검증, 학습 env, 골든 테스트가 모두 이 성질을 전제로 한다. ESLint로 강제한다.

```ts
const roll = 1 + Math.floor(Math.random() * 6); // ❌ 시드 밖 무작위
player.hp -= damage;                            // ❌ state 직접 변경
// ✅ RNG를 state 안에서 넘겨받고, 바뀐 부분만 새 객체로 만든다
const [roll, rng] = rollDie(state.rng, rules.combat.dieSides);
return { ...state, rng, players: updatePlayer(state.players, seat, (p) => ({ ...p, hp: p.hp - damage })) };
```

## 2. 규칙은 엔진에만, 수치는 `RulesConfig`에만 둔다

**게임 규칙의 출처는 `packages/engine` 하나뿐이다. web·server·ai·sim은 엔진 API(`getLegalActions`·`applyAction`·`toPublicState`)만 호출한다.**
- 어떤 행동이 지금 가능한지는 `getLegalActions` 결과로만 판단한다. UI·봇·서버에서 규칙을 다시 계산하지 않는다.
- 밸런스 수치(가격·피해·HP·보너스)는 `RulesConfig`(`DEFAULT_RULES`) 한 곳에만 둔다. 엔진 안에서도 매직 넘버를 쓰지 않고 `rules`에서 읽는다.
- **왜**: 규칙이 두 곳에 있으면 로컬·온라인·학습 env가 모르는 사이에 서로 다른 게임이 된다. 밸런스 조정은 설정 한 곳만 고치면 끝나야 한다.

```ts
const canBuy = me.coins >= 6 && tile.id === 'SHOP'; // ❌ (web) 규칙 재구현 + 매직 넘버
const canBuy = legalActions.some((a) => a.type === 'BUY_ITEM' && a.item === 'teleport'); // ✅
const price = publicState.rules.items.teleport.price; // ✅ 표시할 수치도 rules에서 읽는다
```

## 3. 서버가 권위를 갖고, 외부 입력은 경계에서 zod로 검증한다

**클라이언트는 `Action` 의도와 `stateVersion`만 보낸다. 서버는 좌석(`pending.actor`)·버전·합법성(`getLegalActions`)을 모두 확인한 뒤에만 적용한다.**
- 외부 입력(소켓 페이로드, env 서버 stdin 명령, 모델 가중치 JSON)은 진입 지점에서 `unknown`으로 받아 zod로 검증한다. 그 안쪽 코드는 검증된 타입만 다룬다.
- 사람·타이머·봇의 입력은 모두 `GameSession.submit()` 한 경로로 들어온다. 이 경로를 우회하는 코드를 만들지 않는다.
- **왜**: 클라이언트와 파일은 믿을 수 없다(치트, 손상된 JSON). 검증을 경계 한 곳에 모아 두면 안쪽 코드에 방어 코드가 흩어지지 않는다.

```ts
// ❌
socket.on('game:action', (msg) => session.apply(msg.action));
// ✅
socket.on('game:action', (raw: unknown, ack) => {
  const parsed = GameActionMessageSchema.safeParse(raw);
  if (!parsed.success) return ack(fail('INVALID_PAYLOAD'));
  ack(session.submit({ seat: seatOf(socket), ...parsed.data, source: 'human' }));
});
```

## 4. 계층을 나누고 의존은 한 방향으로만 흐르게 한다

**의존 방향은 `engine` ← `ai`·`protocol` ← `sim`·`server`·`web`이다. 역방향 import와 순환 import는 금지하며, engine은 다른 패키지를 import하지 않는다.**
- 한 파일에 UI·상태·비즈니스 로직을 섞지 않는다. 웹은 View(`components/`) → hooks·store(Zustand) → services(`GameClient`) → types 순서로 나누고, React 컴포넌트 안에서 게임 로직이나 소켓 호출을 하지 않는다.
- 함수형(순수 함수 + 불변 데이터)을 먼저 고려한다. 클래스는 수명·연결을 가진 셸 객체(`RoomManager`, `GameSession`, `TurnTimer`)에만 쓰고, 상속 대신 조합한다.
- 디자인 패턴(Strategy, Adapter 등)은 해결할 문제가 있을 때만 쓰고, **선택 이유를 커밋 본문(원격이 생기면 PR 설명)에 적는다**.
- **왜**: 같은 엔진·AI 코드를 브라우저·서버·env에서 그대로 재사용하려면 아래 계층이 위 계층을 몰라야 한다. 이유 없는 패턴은 간접 계층만 늘린다.

```tsx
// ❌ components/ShopDialog.tsx 안에서 소켓으로 직접 보냄
socket.emit('game:action', { action: { type: 'BUY_ITEM', item }, stateVersion });
// ✅ View는 props만 받고, 제출은 hook → GameClient가 한다(local/online 구분 없음)
<ShopDialog items={buyable} onBuy={(item) => submit({ type: 'BUY_ITEM', item })} />
```

## 5. AI 인터페이스는 버전으로 고정한다

**`obs_v1`·`act_v1` 레이아웃(길이·인덱스 의미·정규화·마스크 규칙)을 바꿀 때는 같은 커밋에서 버전 증가, `docs/ai-interface-spec.md` 갱신, 골든 테스트 갱신을 함께 한다.**
- 기존 인덱스의 의미를 다른 용도로 바꿔 쓰지 않는다. 배치를 바꿔야 하면 새 버전에서 바꾼다.
- 인코더·행동 코덱·마스크는 `packages/ai`(TS)에만 구현한다. Python에서 다시 구현하지 않고, env 서버가 준 벡터를 그대로 쓴다.
- `PROTOCOL_VERSION`(C↔S 메시지)과 `RulesConfig.version`에도 같은 원칙을 적용한다.
- **왜**: 사용자가 학습시킨 Actor-Critic 가중치는 특정 레이아웃에 묶여 있다. 버전 표시 없이 바꾸면 오류 없이 모델 성능만 망가진다.

```text
❌ 인덱스 k의 의미를 "상대1 방어막 보유"에서 "상대1 도둑 보유"로 바꾸고 obs_v1을 유지
✅ OBS_VERSION = 'obs_v2' + spec 표 갱신 + obs_v2 골든 벡터 추가 + 커밋 feat(ai)!: ...
```

## 6. TDD: 테스트를 먼저 쓴다

**엔진·인코더·코덱을 바꿀 때는 실패하는 테스트를 먼저 쓴다. 버그를 고칠 때는 재현 테스트부터 쓴다.**
- 무작위가 끼는 테스트는 시드를 고정한다(`createGame(setup, rules, 42)`). fast-check가 실패하면 그 seed를 기록해 다시 재현할 수 있게 한다.
- 버그 재현 테스트는 고정 시드 + 행동 스크립트로 만든다. 엔진 테스트는 입력 state를 deep-freeze해서 변이를 잡아낸다.
- **왜**: 결정적 엔진에서는 "시드 + 행동 순서"만 있으면 상황을 그대로 재현할 수 있다. 테스트 없이 규칙을 바꾸면 밸런스와 AI 관측이 모르는 사이에 깨진다.

```ts
const s0 = createGame(setup, DEFAULT_RULES, Date.now());     // ❌ 실행마다 시드가 달라 재현 불가
const s0 = deepFreeze(createGame(setup, DEFAULT_RULES, 42)); // ✅ 고정 시드 + 불변 검사
```

## 7. TypeScript는 strict, `any`는 쓰지 않고, 코드는 영어로 쓴다

**`strict: true`. `any`·`as any`·`@ts-ignore`는 금지한다. 피할 수 없으면 `unknown`으로 받고 타입 가드나 zod로 좁힌다.**
- 유니온 타입(`Action`, `GameEvent`, `Phase`)은 `switch` + `assertNever`로 모든 경우를 처리한다.
- 식별자·커밋 메시지·코드 주석은 영어로 쓴다. 용어는 기획서 용어집(`swordsman`, `atk`, `teleport`, `duel` 등)을 그대로 쓴다.
- 주석은 '왜'를 설명해야 할 때만 단다. '무엇'을 하는지는 이름과 코드로 드러낸다.
- **왜**: 엔진·프로토콜·AI 코덱 사이를 지켜 주는 것은 타입이다. `any` 하나가 경계 검증과 빠짐없는 분기 검사를 모두 무력화한다.

```ts
// ❌ const cmd = JSON.parse(line) as any;
// ✅ const cmd = EnvCommandSchema.parse(JSON.parse(line) as unknown);
// ❌ // decrease hp
// ✅ // Tile events never kill: deaths come only from combat.
```

## 8. Git: 브랜치에서 작업하고, 커밋은 영어 Conventional Commits로 쓴다

**`main`에 직접 커밋하지 않는다. 브랜치 이름은 `feature/xxx`·`bugfix/xxx`·`docs/xxx`·`chore/xxx`(kebab-case)로 짓는다.**
- 커밋 제목은 `type(scope): summary` 형식이다(호환을 깨는 변경은 규칙 5에 따라 `type(scope)!:`). 영어 명령형, 소문자로 시작, 마침표 없이, 72자 이내로 쓴다.
  - type: `feat` `fix` `test` `refactor` `perf` `docs` `chore` / scope: `engine` `ai` `protocol` `sim` `server` `web` `python` `docs`
- 커밋 하나에는 논리적 변경 하나를 테스트와 함께 담는다. 본문에는 '왜'(패턴 선택 이유, 버전 증가 사유)를 적는다.
- **왜**: 커밋 이력이 곧 설계 기록이다. scope로 패키지별 변경을 추적하고, 리뷰어가 의도를 바로 읽을 수 있다.

```text
✅ feat(engine): resolve duel on shared tile
✅ fix(server): reject stale stateVersion on timer race
❌ 버그 수정   ❌ update   ❌ WIP   ❌ Fixed stuff.
```
