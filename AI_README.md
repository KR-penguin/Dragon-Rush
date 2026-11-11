# AI_README — Hero's Dice (working title)

> Workspace guide for AI coding agents. Read it before touching anything in this repo.
> **Status: planning. The repo holds docs and editor/git config only. Every package, path, command and signature below is PLANNED** until the phase that builds it is done.
> Language: this file is English. `docs/*`, `README.md` and `coding_convention.md` are Korean (identifiers in English).

## 1. Purpose & reading order
This file is the workspace map: structure, libraries, patterns, stack. It does not override the canonical docs. If it disagrees with one, the canonical doc wins. Report the mismatch; do not pick one silently.

| Topic | Canonical doc |
|---|---|
| Rules, numbers, turn flow, edge cases, balance data | `docs/game-design.md` |
| Module boundaries, engine internals, patterns, multiplayer protocol, security, deploy | `docs/architecture.md` |
| `obs_v1`, `act_v1`, mask, reward, env server protocol, Python API, model contract, bots | `docs/ai-interface-spec.md` |
| Phases, DoD, open decisions (D1–D11, R1–R7), risks, asset request list | `docs/development-plan.md` |
| The 8 must-follow code rules | `coding_convention.md` |

Reading order for any task: this file → `coding_convention.md` → canonical doc(s) for the area you touch → the current phase's DoD in `docs/development-plan.md`.
`CLAUDE.md` imports this file and `coding_convention.md`. `prompt.md` is the user's personal file: read it if needed, never edit, delete, stage or commit it.

## 2. Project status
- Design is done and there is no code yet. **Next phase: P0 (monorepo & tooling scaffolding).** Git is initialized on branch `main`.
- Phases: P0 scaffolding → P1 rules engine (TDD) → P2 AI interface & training env (★ freeze `obs_v1`/`act_v1`) → P3 balance verification → P4 local web play → P5 online multiplayer → P6 user model integration (moves earlier once the weight format arrives) → P7 assets, polish, deploy.
- Open decisions use their documented defaults until the user answers (development-plan §2), except ★ checkpoints, which block the next phase. Simulation-driven rules approved by the user (2026-11-11): early PvP grace (rounds 1–3, `pvpGraceRounds`, R1), starting shield (`startingItems`, R5a), and ninja move-adjust cooldown (R5b). A rest turn (R7, decided) only blocks movement; upgrades, thief, dragon challenge and END_TURN stay legal. Implement them as `RulesConfig` values. Teleport has no per-turn limit by default (`teleport.perTurnLimit = null`, open question R2). The game-design §16 IDs match development-plan §2.

## 3. Product in ~10 lines
- Web dice board game with light RPG growth. 2–4 seats in any mix of human, bot and user model.
- 24-tile ring board (0–23, clockwise) and one 1d6 per move. Tile 0 `START` is a safe zone that gives a bonus when a dice move passes or lands on it. Every other tile has a fixed good, bad or special event (shops at 6 and 18, a Mystery card deck).
- Stats: `hp`, `maxHp`, `atk`, `def`, `coins`. Five unique jobs (`swordsman`, `archer`, `mage`, `ninja`, `berserker`), each with a passive.
- Coins buy stat upgrades during your own turn (`PRE_ROLL`/`POST_MOVE`, anywhere, escalating cost). On a SHOP tile they also buy items: `teleport`, `shield`, `thief` (all single-use).
- Stopping on a non-safe tile with another player starts an auto-resolved 1v1 duel. The loser is eliminated, and the winner takes `floor(coins / 2)` plus all of the loser's items. A shield cancels the duel.
- Dragon: `CHALLENGE_DRAGON` is a PRE_ROLL main action (no dice that turn). A win ends the game at once. A loss eliminates the challenger, and their coins and items vanish.
- Win by killing the dragon or being the last survivor. Reaching `maxRounds` is a draw (off in human games, 100 in the training env).
- Tile and card events never kill (HP floor 1). Deaths come only from combat. Everything is public except the server's RNG state.
- Modes: local hot-seat, vs AI, online rooms (server-authoritative), headless training env driven from Python.

## 4. Tech stack & libraries
| Area | Choice | Notes |
|---|---|---|
| Language | TypeScript `strict` (+ `noUncheckedIndexedAccess`) | all JS packages; `any` is forbidden |
| Monorepo | pnpm workspaces | package scope `@hero-dice/*` |
| Runtime | Node 22 (local 22.23), pnpm 10.34 | server, sim, env server |
| Rules engine | zero-dependency pure TS + own **sfc32** PRNG (not a library) | no Immer, by design |
| Validation | zod | protocol schemas, env commands, model JSON |
| Web | React + Vite, Zustand, Socket.IO client | board = DOM/SVG + CSS animations |
| Server | Fastify (HTTP, static files, `/health`, `/api/models`) + Socket.IO | in-memory rooms, no DB, no accounts |
| Tests | Vitest + fast-check; Playwright E2E (optional); pytest (Python) | |
| Quality | ESLint flat config + typescript-eslint + Prettier | Prettier owns formatting |
| Training client | Python 3.13 + **numpy only** | no gymnasium, no torch |
| TS run/bundle for server & sim | tsx / tsup are candidates | decide in P0, then record here |

Brief the user with a reason before adding any library that is not in this table.

## 5. Repository layout (planned)
Same tree as the confirmed layout in `README.md` (comments translated; package names added).
```
/
├─ apps/
│  ├─ web/                 # @hero-dice/web: React + Vite client (local/online play, lobby, board UI)
│  └─ server/              # @hero-dice/server: Node + Fastify + Socket.IO authoritative server (rooms, turn timer, reconnect, server-side AI seats)
├─ packages/
│  ├─ engine/              # @hero-dice/engine: pure deterministic rules engine (ONLY rules source) + RulesConfig (balance numbers)
│  ├─ protocol/            # @hero-dice/protocol: C<->S message types + zod schemas
│  ├─ ai/                  # @hero-dice/ai: encodeObservation, action codec/mask, Policy, bots, model adapters
│  └─ sim/                 # @hero-dice/sim: headless simulator, balance CLI, env server (stdio JSONL)
├─ python/
│  ├─ rpgboard_env/        # numpy-only Python client (wraps the env server)
│  └─ examples/            # usage examples such as random_agent.py
├─ models/                 # user-provided weight JSON (e.g. models/my-agent.json)
├─ docs/
│  ├─ game-design.md
│  ├─ development-plan.md
│  ├─ architecture.md
│  └─ ai-interface-spec.md
├─ README.md  AI_README.md  coding_convention.md  CLAUDE.md
```
- Planned sub-paths: `python/pyproject.toml`, `python/tests/` (pytest), `models/parity/<name>.json` (parity samples; the model registry does not scan sub-folders).
- `engine/src`: entry `index.ts reducer.ts legal.ts public.ts` → flow `turn.ts movement.ts duel.ts dragon.ts items.ts` → rule parts `combat.ts jobs.ts economy.ts tiles/ board.ts` → base `rng.ts rules/ types/` (`DEFAULT_RULES` lives in `rules/defaultRules.ts`). Imports only go down this list.
- `ai/src/codec/` (action codec, mask); `ai/src/model/adapters/` (user weight adapters, after the format arrives).
- `web/src`: `pages/`, `components/` (View), `hooks/`, `store/` (Zustand slices), `animation/eventTimeline.ts`, `services/` (`GameClient` + `LocalGameClient`/`OnlineGameClient`, `sessionToken.ts`, `modelSource.ts`), `types/`. Layers: components → hooks/store → services → types.
- `server/src`: `main.ts config.ts`, `http/`, `socket/`, `rooms/` (`RoomManager`, `Room`), `session/` (`SessionStore`), `game/` (`GameSession`, `TurnTimer`, `SeatController`, `timeoutAction`), `ai/` (`PolicyRunner`, `modelRegistry`).
- Assets: `apps/web/public/assets/{images,audio}/...` (list in development-plan §4.2). Placeholders until delivered.

**Dependency direction** (one way, no cycles): `engine` ← `protocol`, `ai` ← `sim`, `server`, `web`.
`protocol → engine` (types) + zod · `ai → engine` (+ zod, weight adapter input) · `sim → engine, ai` (+ zod, env commands) · `server → engine, protocol, ai` · `web → engine, protocol, ai` · **engine imports nothing.**
Runtime only: web ↔ server via Socket.IO; Python ↔ sim via subprocess stdio; `models/*.json` is loaded by the server (allow-list) or picked in the browser (local mode, never uploaded).

## 6. Architecture invariants — MUST NOT break
1. **Engine purity & determinism.** No `Math.random`, `Date`, I/O, `node:*`/`fs`, global mutable state, or `@hero-dice/*` imports in `packages/engine` (ESLint-enforced). Same `(setup, rules, seed, actions)` gives the same state and events. State is immutable (readonly, spread updates). Randomness comes only from `state.rng`.
2. **Single rules source.** Only the engine decides legality and outcomes. Everything else calls `getLegalActions` / `applyAction` / `toPublicState`. UI buttons come from `legalActions`. `GameEvent`s carry result values, so UI and logs never recompute rules.
3. **`RulesConfig` is the only place for numbers.** `DEFAULT_RULES` must equal `docs/game-design.md` (golden test). No balance literals anywhere, engine included. The UI reads displayed values from `publicState.rules`.
4. **Server authoritative.** Clients send `Action` intent + `stateVersion` only. The server derives the seat from the socket, never from the payload. Every input (human, timer, bot, model, reconnect proxy) goes through `GameSession.submit()`. Decisions key on `pending.actor`, not `current`. RNG state never leaves the server, and seeds come from a CSPRNG.
5. **zod at boundaries.** Socket payloads, env-server stdin and model JSON enter as `unknown` and are parsed at the entry point. `z.infer<typeof ActionSchema>` must equal the engine `Action` (type test). Model files are read with `JSON.parse` only, never eval.
6. **Versioned specs.** `OBS_VERSION "obs_v1"`/`OBS_DIM 253`, `ACT_VERSION "act_v1"`/`ACTION_DIM 47`, `ENV_PROTOCOL "rpgboard-env/1"`, `PROTOCOL_VERSION` (int), `RulesConfig.version`. Changing a layout, meaning or normalization means a version bump, a spec update and a golden update in the same change. Never repurpose an index.
7. **Encoder, codec and mask live only in TS** (`packages/ai`). Python uses the vectors as given and never re-implements them. Policies only ever see `PublicGameState`.
8. **Python client is numpy-only.** The env server's stdout is protocol-only; logs go to stderr.
9. **No trainer in this repo.** No PPO/A2C, PyTorch or export scripts. The user trains with their own numpy Actor-Critic.
10. **The user owns the weight JSON format.** Do not define or guess it. `WeightAdapter` is implemented only after the format and parity samples arrive (D4). Until then, model seats are disabled ("coming soon") in the UI.

## 7. Architecture patterns in use
| Pattern | Where | Why |
|---|---|---|
| Functional core / imperative shell | engine, ai = pure; server, web, sim = side effects | determinism, testability |
| Functional reducer + table-driven FSM | engine `legalByPhase`, `handlers` (phase × action) | same code in server/browser/sim; a (phase, action) pair missing from the table is illegal |
| Step pipeline | engine-internal `Step = { state, events }`, `pipe(step, f, g)` | accumulate events, thread RNG through state |
| Command | `Action` (serializable data) | transport, validation, logs, replay in one shape |
| Event log | `GameEvent` (PascalCase `type`, carries results) | animation queue, game log, replay, debugging |
| Data-driven table + handler map | tile effects `Record<EffectKind, EffectHandler>` | new tile = data (OCP) |
| Hook map (Strategy as data) | job passives: `initiative`, `modifyAttack`, `modifyDefense`, `onIncomingHit`, `onFatalDamage` | no `if (job === …)` in `combat.ts` |
| Strategy | `Policy` (Random/Heuristic/Model); `SeatController` (human/bot/model) | humans, bots, models, timeouts, reconnect proxy share one path |
| Adapter | `WeightAdapter`: user JSON → `PolicyModel` | a format change only swaps the adapter |
| Ports & Adapters (DIP) | `GameClient` → `LocalGameClient` / `OnlineGameClient` | UI does not know local vs online |
| Schema-first | `packages/protocol` (zod) | runtime validation + TS types from one definition |
| Server authority + version check | `GameSession.submit`, `stateVersion` | anti-cheat; on races the first arrival wins |
| Observer | Zustand store + selectors | minimal re-renders, updatable from services |
| Producer–Consumer | event animation queue | decouples server update rate from animation speed |

Classes are used only for shell objects with a lifetime or connections (`RoomManager`, `GameSession`, `TurnTimer`). Prefer composition and do not build inheritance hierarchies.

## 8. Key interfaces (signatures only, planned)
```ts
// @hero-dice/engine
createGame(setup: GameSetup, rules: RulesConfig, seed: number): GameState
getLegalActions(state: GameState): Action[]                 // for state.pending.actor, deterministic order
applyAction(state: GameState, action: Action): { state: GameState; events: GameEvent[] }  // IllegalActionError
toPublicState(state: GameState): PublicGameState            // Omit<GameState, 'rng'>
isLegalAction(state, action): boolean; actionKey(action): string
type Phase = 'PRE_ROLL' | 'MOVE_ADJUST' | 'CHOOSE_PVP_TARGET' | 'SHIELD_DECISION' | 'TRAINING_CHOICE' | 'POST_MOVE'
type Action = { type: 'ROLL_DICE' } | { type: 'END_TURN' } | { type: 'CHALLENGE_DRAGON' }
  | { type: 'UPGRADE'; stat: UpgradeStat } | { type: 'CHOOSE_TRAINING_STAT'; stat: UpgradeStat }
  | { type: 'BUY_ITEM'; item: ItemId } | { type: 'USE_TELEPORT'; tile: number }
  | { type: 'USE_THIEF'; target: SeatId } | { type: 'CHOOSE_PVP_TARGET'; target: SeatId }
  | { type: 'ADJUST_MOVE'; delta: -1 | 0 | 1 } | { type: 'SHIELD_DECISION'; use: boolean }
// UpgradeStat = 'atk'|'def'|'maxHp'; ItemId = 'teleport'|'shield'|'thief'; SeatId = 0|1|2|3 (absolute seats)

// @hero-dice/ai
encodeObservation(view: PublicGameState, seat: SeatId): Float32Array   // obs_v1, length 253
encodeAction(view, seat, action): number; decodeAction(view, seat, index): Action
maskFromLegal(view, seat, legal): Uint8Array; ACTION_NAMES: readonly string[]   // act_v1, length 47
interface Policy { readonly id: string; decide(ctx: DecisionContext): Action }
interface DecisionContext { view: PublicGameState; seat: SeatId; legal: readonly Action[]; random: () => number }
interface PolicyModel { readonly meta: ModelMeta; forward(obs: Float32Array): Float32Array }   // length ACTION_DIM
type WeightAdapter = (raw: unknown) => PolicyModel;                                            // ModelFormatError
// ModelMeta = { id, obsVersion, actVersion, output: 'logits' | 'probs', obsDim, actionDim }
createModelPolicy(model: PolicyModel, opts?: { mode?: 'argmax' | 'sample'; temperature?: number }): Policy

// apps/web/src/services
interface GameClient {
  readonly mode: 'local' | 'online';
  subscribe(onUpdate: (u: GameUpdate) => void): () => void;
  submit(action: Action, stateVersion: number): Promise<SubmitResult>;
  requestSnapshot(): void; dispose(): void;
}
// apps/server: GameSession.submit({ seat, action, stateVersion, source })
```
- **obs_v1** (ego-centric, values in [0, 2]): self block @0 (len 51), opponent blocks @51/@105/@159 (len 54 each; opponent k = seat `(mySeat + k) mod n`), global block @213 (len 40).
- **act_v1** (Discrete 47 + mask): 0 ROLL_DICE, 1 END_TURN, 2 CHALLENGE_DRAGON, 3–5 UPGRADE, 6–8 BUY, 9–32 TELEPORT (absolute tile), 33–35 THIEF_OPP, 36–38 ADJUST, 39–40 SHIELD, 41–43 PVP_TARGET_OPP, 44–46 TRAIN.
- **Socket.IO protocol** (`domain:verb`, each C→S message gets an `Ack<T>`, handshake `auth: { protocolVersion, sessionToken? }`). C→S: `room:create|join|leave|configure|configureSeat|selectJob|setReady|start`, `game:action`, `game:requestSnapshot`. S→C: `session:welcome`, `room:state`, `game:update`, `game:snapshot`, `seat:status`, `error`.
- **Env server** (stdio JSON Lines, one request per line): `{ id, cmd: 'info'|'reset'|'step'|'close', params? }` → `{ id, ok: true, result }` or `{ id, ok: false, error: { code, message, env_index? } }`. `reset` takes `num_envs, seed, encoding, auto_reset, expect, config{ mode: single|selfplay, ... }`. `step` takes `{ actions: int[] }` and is atomic: one illegal action means no env advances. Each env result has `obs, legal, acting_seat, turn_seat, phase, round, rewards[4], terminated, truncated, outcome, eliminated, final_obs`.
- **Python**: `RPGBoardEnv(...)` / `RPGBoardVecEnv(num_envs=8, ...)` with `reset(seed=None) -> (obs, info)` and `step(action) -> (obs, reward, terminated, truncated, info)`. Read `info["action_mask"]` and `info["acting_seat"]`.

## 9. Commands (planned, available after P0)
| Command | Purpose |
|---|---|
| `pnpm install` | install workspace deps |
| `pnpm dev` | web (Vite) + server together; Vite proxies `/socket.io` and `/api` |
| `pnpm test` / `pnpm lint` / `pnpm typecheck` / `pnpm build` | all Vitest / ESLint / type check / production build |
| `pnpm sim --games 10000 --players 4 --bots heuristic` | headless balance simulation |
| `pnpm env-server` | standalone env server (= `node packages/sim/dist/env-server.js`, run `pnpm build` first) |
| `pip install -e python/` then `python python/examples/random_agent.py` | Python env client + example (requires `pnpm install && pnpm build` first) |

- Server config: `PORT`, `TURN_TIMEOUT_MS` (60 s, every human decision), `RECONNECT_GRACE_MS`, `BOT_ACTION_DELAY_MS`, `MODELS_DIR` (default `models/`).
- Python client: `RPGBOARD_ENV_CMD` overrides the server command and `RPGBOARD_ROOT` sets the repo root.
- P0 DoD: `pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm build` passes.

## 10. Testing requirements
- **TDD**: write the failing test first. A bug fix starts with a repro test (fixed seed + action script).
- **Seeded**: `createGame(setup, DEFAULT_RULES, 42)`, never `Date.now()`. Record the seed of any failing fast-check case. Deep-freeze input state to catch mutation.
- **Property (fast-check)**: random seeds and random legal action sequences must hold `1 ≤ hp ≤ maxHp` for survivors, `coins ≥ 0`, `pending ≠ null ⇒ ≥ 1 legal action`, input state unchanged, same seed + actions ⇒ same result, and the game ends within `maxRounds`.
- **Golden fixtures**: event-log snapshots for fixed seed scripts, `DEFAULT_RULES` ↔ game-design numbers, `obs_v1` vectors (`packages/ai/test/obs.golden.test.ts` + `fixtures/obs_v1/*.json`), and layout continuity (`obs.layout.test.ts`).
- **Mask ↔ legal**: `packages/ai/test/mask.property.test.ts` checks that the mask set equals `getLegalActions` and that `encodeAction(decodeAction(i)) = i`.
- **Parity tests**: `packages/ai/test/model.parity.test.ts` compares the TS adapter forward against the user's numpy outputs in `models/parity/<name>.json`. Values must match within the tolerance agreed with the user (spec default in ai-interface-spec §11), and argmax after masking must match.
- **Contract & integration**: `packages/sim/test/env-server.contract.test.ts` (spawn, round-trip, atomic `ILLEGAL_ACTION`, no stdout logs). In-process server + socket.io-client tests cover rooms, reconnect, timeouts and `STALE_VERSION` races (fake timers). `python/tests/test_client.py` uses pytest.
- Engine line coverage ≥ 90% (P1). Bot regression via `packages/sim`. Playwright E2E is optional.

## 11. Working agreements for AI agents
- Read this file first, and update it (and `README.md`) in the same change when structure, libraries, patterns or commands change.
- **Before a massive or multi-file structural change**, brief the scope and the reason, then wait for approval.
- **Strict modularization**: never mix UI, state and business logic in one file. Keep View / Hook·State / Service / Type layers separate.
- **SOLID balanced with functional programming.** Do not follow OOP dogmatically. Use a design pattern only for a real problem, and **state why it was chosen** (PR or commit body).
- **Ambiguous? Ask, don't guess**: rules, scope, and the user's model format above all.
- Git: never commit to `main` directly. Branches use git-flow style kebab-case names: `feature/xxx`, `bugfix/xxx`, `docs/xxx`, `chore/xxx`. **Commit messages are in English** and follow Conventional Commits, `type(scope): summary` (`!` marks breaking changes).
- Code comments are **English and minimal**: explain *why*, never *what*.
- **Asset requests** must state the purpose, the path and the filename, e.g. `apps/web/public/assets/audio/bgm/board.mp3`.
- Work **phase by phase**. Meet the DoD, then stop only for decisions or approvals the user must make.
- Plan documents stay **≤ 300 lines** and cover only strategy, decisions needing approval, new libraries/patterns/stack, and other key notes.
- **TDD** everywhere (§10).

## 12. Change cookbook
| Change | Steps |
|---|---|
| Tile event | Edit `RulesConfig.board` (`TileDef = { id, safe, effects }`) in `DEFAULT_RULES`. A new effect kind gets an entry in the `tiles/` handler map, with no branching elsewhere. Then update the game-design tile table, the golden tests and the sim. The board stays 24 tiles, because a different size changes `self.pos` / TELEPORT, which needs obs+act version bumps. |
| Item | Add to `ItemId`, `RulesConfig.items`, `items.ts`, `legal.ts`, the protocol `ActionSchema` and the UI dialog. The 3-wide item features and BUY indices change, so bump obs and act (`obs_v2`/`act_v2`). Update the spec, golden tests and bots, then re-run the sim. |
| Job passive | Add a hook in the `jobs.ts` hook map with parameters in `RulesConfig.jobs`. Keep job checks out of `combat.ts`. Fix the order and RNG draws in game-design §9. Observable passive state (or a new job) → obs version bump. |
| Action | Add a variant to the `Action` union, `legalByPhase` + `handlers`, the zod `ActionSchema` (keep the type-equality test), the codec + `ACTION_NAMES`, a timeout default if it is a new phase, HeuristicBot and the UI. → **`act_v2`**, with spec §4/§5 and mask property tests updated. |
| Observation feature | Never edit `obs_v1` in place. Create `obs_v2` with the feature appended, a new layout + scales, golden fixtures, spec §3 and env `info`. Warn the user, because trained models need retraining. → **obs version bump**. |
| Protocol message | Name it `domain:verb` and add a zod schema in `packages/protocol`. In the server socket router, call `safeParse` and fail with `INVALID_PAYLOAD`. Update the `OnlineGameClient` mapping and add error codes if needed. Bump `PROTOCOL_VERSION` only on breaking changes, and update architecture §7. |
| Balance tweak | Change `DEFAULT_RULES` only and bump `RulesConfig.version`. Update the game-design numbers and the golden test. **Re-run `pnpm sim`** and check the game-design §15 metrics. obs/act versions stay the same; tell the user, since `rules_version` changed. |

## 13. Glossary (KO ↔ code)
| Korean | Code | Korean | Code |
|---|---|---|---|
| 용사의 주사위 | Hero's Dice (working title) | 칸 / 보드 | `Tile` / `Board` |
| 검사 | `swordsman` | 용 | `Dragon` |
| 궁수 | `archer` | 전투 | `Combat` |
| 마법사 | `mage` | PvP / 용전 | `duel` / `dragonFight` |
| 닌자 | `ninja` | 라운드 / 턴 | `round` / `turn` |
| 광전사 | `berserker` | 행동 | `Action` |
| 공격력 / 방어력 | `atk` / `def` | 이벤트 (애니메이션·로그용) | `GameEvent` |
| 최대 체력 / 현재 체력 | `maxHp` / `hp` | 밸런스 수치 | `RulesConfig` |
| 코인 | `coins` | 텔레포트 / 방어막 / 도둑 | `teleport` / `shield` / `thief` |
| 단계 | `phase` | | |

`phase` values: `PRE_ROLL`, `MOVE_ADJUST`, `CHOOSE_PVP_TARGET`, `SHIELD_DECISION`, `TRAINING_CHOICE`, `POST_MOVE`.
