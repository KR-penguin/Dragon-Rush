# AI_README — Dragon Rush

> Workspace guide for AI coding agents. Read it before touching anything in this repo.
> **Status: implemented (P0–P7).** Two items wait on the user: the weight JSON format (P6 adapter) and real art/audio + a hosting target (P7).
> **2nd round (Phase R1–R8, 2026-11-12) in progress:** "Ember Table" board redesign, FX/audio, and real-time 2D combat for duels and the dragon with a separate combat AI model (development-plan §5).
> Language: this file is English. `docs/*`, `README.md` and `coding_convention.md` are Korean (identifiers in English).

## 1. Purpose & reading order
This file is the workspace map: structure, libraries, patterns, stack. It does not override the canonical docs. If it disagrees with one, the canonical doc wins. Report the mismatch; do not pick one silently.

| Topic | Canonical doc |
|---|---|
| Rules, numbers, turn flow, edge cases, balance data | `docs/game-design.md` |
| Module boundaries, engine internals, patterns, multiplayer protocol, security, deploy | `docs/architecture.md` |
| `obs_v1`, `act_v1`, mask, reward, env server protocol, Python API, model contract, bots | `docs/ai-interface-spec.md` |
| Training quick reference for the user (Korean, index tables) | `python/README.md` (must match the spec and `OBS_V1_LAYOUT`) |
| Phases (P0–P7 done, 2nd round R1–R8), open decisions (D1–D16, rule questions R1–R7), risks, **asset request list (§4.2)** | `docs/development-plan.md` |
| Board look, layout, camera, FX catalog (shake, hitstop, flashes), audio rules, accessibility settings (in progress) | `docs/art-direction.md` |
| Real-time combat: sim constants, controls, frame data, damage, job kits, duel/dragon rules, board seam, netcode (in progress; `DEFAULT_COMBAT_RULES` wins once built) | `docs/combat-design.md` |
| Combat AI: `cobs_v1`, `cact_v1`, masks, reward, `combat-env-server`, `CombatVecEnv`, `combat_resolver`, combat model contract (in progress) | `docs/combat-ai-spec.md` |
| The 8 must-follow code rules | `coding_convention.md` |

Reading order for any task: this file → `coding_convention.md` → canonical doc(s) for the area you touch → the code.
`CLAUDE.md` imports this file and `coding_convention.md`. `prompt.md` is the user's personal file (git-ignored): read it if needed, never edit, delete, stage or commit it.

## 2. Project status
- Done: engine (P1), AI interface + training env (P2), balance re-verified on the TS engine (P3), local web play (P4), online multiplayer (P5), model-integration plumbing (P6), deploy files (P7: Dockerfile, CI workflow).
- Waiting on the user: `USER_WEIGHT_ADAPTER` in `packages/ai/src/model/adapters/index.ts` stays `null` until the weight JSON format and parity samples arrive (model seats show "준비 중"). Assets are placeholders (emoji/CSS) until files arrive at the paths in development-plan §4.2.
- In progress (2nd round): `packages/combat` (deterministic 60 Hz combat sim, `DEFAULT_COMBAT_RULES`), `packages/combat-ai` (`cobs_v1`/`cact_v1` encoder, codec, masks, scripted bots, TS MLP runtime), `combat-env-server` + `CombatVecEnv`. The engine `COMBAT` phase is merged (`RulesConfig.combat.mode: 'dice' | 'external'`, `applyCombatResult`, `resolveCombatWithDice`; callers temporarily auto-resolve with dice). Check the code first. Board and combat models are separate models with separate envs.
- Approved simulation-driven rules: early PvP grace (rounds 1–2, `pvpGraceRounds`), starting shield (`startingItems`), ninja move-adjust cooldown. A rest turn only blocks movement. Teleport has no per-turn limit (`teleport.perTurnLimit = null`, open question R2); thief is once per turn (R3).

## 3. Product in ~10 lines
- Web dice board game with light RPG growth. 2–4 seats in any mix of human, bot and user model.
- 24-tile ring board (0–23, clockwise), one 1d6 per move. Tile 0 `START` is a safe zone that pays a bonus when a dice move passes or lands on it. Other tiles have fixed events (shops at 6 and 18, a Mystery card deck).
- Stats: `hp`, `maxHp`, `atk`, `def`, `coins`. Five unique jobs (`swordsman`, `archer`, `mage`, `ninja`, `berserker`), each with a passive.
- Coins buy stat upgrades during your own turn (`PRE_ROLL`/`POST_MOVE`, anywhere, escalating cost). On a SHOP tile they also buy items: `teleport`, `shield`, `thief` (single-use).
- Stopping on a non-safe tile with another player starts an auto-resolved 1v1 duel. The loser is eliminated; the winner takes `floor(coins / 2)` plus all items. A shield cancels the duel.
- `CHALLENGE_DRAGON` is a PRE_ROLL main action (no dice that turn). Win = game over; loss = eliminated, coins and items vanish.
- Win by killing the dragon or being the last survivor. Reaching `maxRounds` is a draw (off in human games, 100 in the training env).
- Event damage never kills (HP floor 1). Everything is public except the server's RNG state.

## 4. Tech stack & libraries
| Area | Choice | Notes |
|---|---|---|
| Language | TypeScript 5.9 `strict` + `noUncheckedIndexedAccess` | `any` is forbidden |
| Monorepo | pnpm 10 workspaces | scope `@dragon-rush/*`; workspace packages export `src/index.ts` directly (no per-package build) |
| Runtime | Node 22 | server, sim, env server |
| Rules engine | zero-dependency TS + own **sfc32** PRNG | copy-on-write working copy per action (no Immer) |
| Validation | zod 4 | protocol schemas, env commands |
| Web | React 19 + Vite 7, Zustand 5, socket.io-client 4 | board = DOM + CSS animations |
| Server | Fastify 5 (+ @fastify/static) + Socket.IO 4 | in-memory rooms, no DB, no accounts |
| Bundling | tsup (server, sim → `dist/`), Vite (web); `tsx` runs TS directly in dev and for `pnpm sim` | |
| Tests | Vitest 3 + fast-check 4; pytest for Python | snapshots in `test/__snapshots__/` |
| Quality | ESLint 9 flat config + typescript-eslint + Prettier | engine purity enforced by ESLint |
| Training client | Python ≥3.10 + **numpy only** | no gymnasium, no torch |

Brief the user with a reason before adding any library that is not in this table.

## 5. Repository layout
```
/
├─ apps/
│  ├─ web/           # @dragon-rush/web: React + Vite client (local + online play, lobby, board UI)
│  └─ server/        # @dragon-rush/server: Fastify + Socket.IO authoritative server
├─ packages/
│  ├─ engine/        # @dragon-rush/engine: pure deterministic rules engine (ONLY rules source) + DEFAULT_RULES
│  ├─ protocol/      # @dragon-rush/protocol: C<->S message types, zod schemas, error codes, PROTOCOL_VERSION
│  ├─ ai/            # @dragon-rush/ai: obs encoder, action codec/mask, Policy, bots, ModelPolicy, parity, adapters
│  ├─ combat/        # (in progress) @dragon-rush/combat: deterministic real-time combat sim, DEFAULT_COMBAT_RULES
│  ├─ combat-ai/     # (in progress) @dragon-rush/combat-ai: cobs_v1/cact_v1, masks, scripted bots, combat model runtime
│  └─ sim/           # @dragon-rush/sim: batch runner, metrics, `pnpm sim` CLI, env server (stdio JSONL); + combat-env-server (in progress)
├─ python/           # rpgboard_env (numpy client; + CombatVecEnv in progress), examples/random_agent.py, tests/ (pytest), pyproject.toml
├─ models/           # user weight JSON (models/<id>.json); parity samples in models/parity/; combat models in models/combat/ (planned)
├─ docs/             # game-design, architecture, ai-interface-spec, development-plan, art-direction, combat-design, combat-ai-spec
├─ Dockerfile, .github/workflows/ci.yml
└─ README.md  AI_README.md  coding_convention.md  CLAUDE.md
```
- `engine/src`: `index.ts` (exports) · `reducer.ts` (dispatch + auto-apply single legal action) · `legal.ts` (`LEGAL_BY_PHASE`, `actionKey`) · `state.ts` (`createGame`, `cloneState`) · `public.ts` · flow `turn.ts movement.ts duel.ts dragon.ts items.ts` · parts `combat.ts jobs.ts economy.ts tiles.ts board.ts` · base `ctx.ts rng.ts rules/ types.ts`.
- `ai/src`: `obs/` (layout, encode) · `codec/actions.ts` · `policy.ts` · `bots/` (randomBot, heuristic/{estimate,heuristicBot}, registry) · `model/` (modelPolicy, parity, adapters/).
- `sim/src`: `runner.ts` (playGame, runBatch, deriveSeed) · `metrics.ts` · `cli.ts` + `simWorker.ts` (worker threads) · `modelLoader.ts` · `env/` (config zod schemas, envInstance, envServer) · `env-server.ts` (stdio entry).
- `server/src`: `main.ts app.ts config.ts errors.ts` · `socket/` (gateway, rateLimit) · `rooms/` (Room, RoomManager) · `session/SessionStore.ts` · `game/` (GameSession, TurnTimer, timeoutAction) · `ai/modelRegistry.ts`.
- `web/src`: `pages/`, `components/` (View, props only), `hooks/`, `store/gameStore.ts` (Zustand), `animation/eventTimeline.ts` + `eventSfx.ts`, `services/` (`gameClient.ts` port, `LocalGameClient`, `OnlineGameClient`, `onlineSession`, `audio.ts` Web Audio engine), `types/` (labels, view helpers).
- `web/src/fx` (game feel, renderer-agnostic): `core/` pure models (trauma `camera`, hit-stop `time` clock, SoA `particles` capped at 500, `floatingText`, `flash` governor, easing, xorshift `rng`, Perlin `noise`) · `audio/` (sound catalogue + procedural Web Audio fallback) · `eventFx.ts` (GameEvent → cue list, pure) + `recipes.ts` · `runtime/` (one rAF loop outside React: `fx`, `fxTime`, `createArenaFx()` for the Canvas arena) · `board/boardResolver.ts` (anchor → screen point; replace for a new board) · `components/` (`FxLayer`, `ShakeContainer` = `.world-shake`, settings dock) · `settings/` (accessibility policy).
- Assets: `apps/web/public/assets/{images,audio}/...` (list in development-plan §4.2); only files that exist are used. A sound file at `audio/sfx/<name>.{mp3,ogg,wav}` (variants `<name>_2` … `_5`) replaces its procedural placeholder automatically; `audio/bgm/loops.json` sets BGM loop points.

**Dependency direction** (one way): `engine` ← `protocol`, `ai` ← `sim`, `server`, `web`. Engine imports nothing. Runtime only: web ↔ server via Socket.IO; Python ↔ sim via subprocess stdio.
Planned (architecture §12): `engine` ← `combat` ← `combat-ai` ← `sim`, `server`, `web`; the combat sim also bans transcendental `Math.*` and `**` for cross-browser determinism.

## 6. Architecture invariants — MUST NOT break
1. **Engine purity & determinism.** No `Math.random`, `Date`, I/O, `node:*`, `@dragon-rush/*` imports in `packages/engine` (ESLint). Same `(setup, rules, seed, actions)` → same state and events. Inputs are never mutated (`applyAction` works on a clone). Randomness only from `state.rng`.
2. **Single rules source.** Only the engine decides legality and outcomes. UI buttons come from `legalActions`. `GameEvent`s carry result values, so UI and logs never recompute rules.
3. **`RulesConfig` is the only place for numbers.** `DEFAULT_RULES` must equal `docs/game-design.md` (golden test `packages/engine/test/rules.test.ts`).
4. **Server authoritative.** Clients send `Action` + `stateVersion` only; the server derives the seat from the socket. Every input (human, timer, bot, model, proxy) goes through `GameSession.submit()`. Decisions key on `pending.actor`. RNG state never leaves the server.
5. **zod at boundaries.** Socket payloads and env-server stdin are parsed at entry. `z.infer<typeof ActionSchema>` equals the engine `Action` (compile-time check in `protocol/src/schemas.ts`). Model files: `JSON.parse` only.
6. **Versioned specs.** `OBS_VERSION "obs_v1"`/`OBS_DIM 253`, `ACT_VERSION "act_v1"`/`ACTION_DIM 47`, `ENV_PROTOCOL "rpgboard-env/1"`, `PROTOCOL_VERSION 1`, `RulesConfig.version "rush-1"`. Layout/meaning change → version bump + spec + golden snapshot update in the same change.
7. **Encoder, codec and mask live only in TS.** Python never re-implements them. Policies only see `PublicGameState`.
8. **Python client is numpy-only**; env server stdout is protocol-only, logs go to stderr.
9. **No trainer in this repo**, and **the user owns the weight JSON format** — implement `USER_WEIGHT_ADAPTER` only from their format and verify with `checkParity`.

## 7. Architecture patterns in use
| Pattern | Where | Why |
|---|---|---|
| Functional core / imperative shell | engine, ai = pure; server, web, sim = side effects | determinism, testability |
| Table-driven FSM + reducer | engine `LEGAL_BY_PHASE`, `reducer.dispatch` | one code path for server/browser/sim |
| Copy-on-write working copy | engine `Ctx` (`ctx.ts`) | events accumulate, RNG threads through state, inputs stay immutable |
| Command | `Action` | transport, validation, replay in one shape |
| Event log | `GameEvent` | animation queue, log, golden tests |
| Data-driven table + handler map | tile effects (`tiles.ts`) | new tile = data |
| Hook map (Strategy as data) | job passives (`jobs.ts` `PASSIVES`) | no job branching in `combat.ts` |
| Strategy | `Policy` (Random/Heuristic/Model), seat control in `GameSession` | humans, bots, models, proxies share one path |
| Adapter | `WeightAdapter`: user JSON → `PolicyModel` | format change swaps only the adapter |
| Ports & Adapters | `GameClient` → `LocalGameClient` / `OnlineGameClient` | UI does not know local vs online |
| Schema-first | `packages/protocol` (zod) | runtime validation + TS types |
| Observer + Producer–Consumer | Zustand store + event animation queue | minimal re-renders; animation decoupled from update rate |
| Cue list + injected resolver | `fx/eventFx.ts` → `FxCue[]` with symbolic anchors, run by `fx` with a board `FxResolver` | effect mapping is pure and testable; survives the board redesign |

## 8. Key interfaces
```ts
// @dragon-rush/engine
createGame(setup: GameSetup, rules: RulesConfig, seed: number): GameState   // createGameWithEvents also returns opening events
getLegalActions(state: PublicGameState): Action[]   // for pending.actor, fixed order (timeouts take the first)
applyAction(state: GameState, action: Action): { state; events }   // IllegalActionError
toPublicState(state): PublicGameState; isLegalAction(state, action); actionKey(action)
// @dragon-rush/ai
encodeObservation(view, seat): Float32Array(253); encodeAction/decodeAction; maskFromLegal; ACTION_NAMES
interface Policy { id; decide(ctx: DecisionContext): Action }   // ctx = { view, seat, legal, random }
interface PolicyModel { meta: ModelMeta; forward(obs): Float32Array(47); value?(obs): number }
createModelPolicy(model, { mode?: 'argmax'|'sample', temperature? }); checkParity(model, samples)
createPolicyByName('random'|'random:uniform'|'heuristic'|'heuristic:aggro|growth|rush', random)
// apps/web/src/services/gameClient.ts
interface GameClient { mode; subscribe(cb): () => void; submit(action, stateVersion): Promise<SubmitResult>; requestSnapshot(); dispose() }
// apps/server: GameSession.submit(seat, action, stateVersion, source: 'human'|'timer'|'policy')
```
- Socket.IO: C→S `room:create|join|leave|configure|configureSeat|selectJob|setReady|start`, `game:action`, `game:requestSnapshot` (each with an `Ack<T>`); S→C `session:welcome`, `room:state`, `game:update`, `game:snapshot`, `seat:status`. Handshake `auth: { protocolVersion, sessionToken? }`.
- Env server: `{ id, cmd: info|reset|step|close, params? }` per line; details in ai-interface-spec §7.
- Python: `RPGBoardEnv(...)`, `RPGBoardVecEnv(num_envs, ...)`; `info["action_mask"]`, `info["acting_seat"]`.

## 9. Commands
| Command | Purpose |
|---|---|
| `pnpm install` | install workspace deps |
| `pnpm dev` | web (Vite :5173) + server (:3001); Vite proxies `/socket.io` and `/api` |
| `pnpm test` / `pnpm lint` / `pnpm typecheck` / `pnpm build` | Vitest / ESLint / tsc / production build (web dist, server dist, sim dist) |
| `pnpm start` | run the built single service (serves `apps/web/dist` + Socket.IO) |
| `pnpm sim --games N --players 4[,3,2] --bots heuristic[,random,...] [--seed S] [--json]` | headless balance metrics (worker threads) |
| `pnpm env-server` | standalone env server (`node packages/sim/dist/env-server.js`, needs `pnpm build`) |
| `python -m pytest python/tests` | Python client tests (they run the TS server through `tsx`, no build needed) |

- Server env: `PORT`, `HOST`, `TURN_TIMEOUT_MS`, `RECONNECT_GRACE_MS`, `BOT_ACTION_DELAY_MS`, `MODELS_DIR`, `WEB_DIST_DIR`, `ROOM_TTL_MS`, `MESSAGES_PER_SECOND`.
- Python client: `RPGBOARD_ENV_CMD` overrides the server command, `RPGBOARD_ROOT` the repo root.

## 10. Testing requirements
- **TDD**: failing test first; bug fixes start with a seeded repro.
- **Seeded** tests only. Engine property tests (fast-check) deep-freeze inputs and check invariants, determinism and termination.
- **Golden**: `engine/test/golden.test.ts` (event log), `ai/test/obs.golden.test.ts` (obs hashes), `engine/test/rules.test.ts` (numbers). Update snapshots only for intended changes (`vitest -u`), with version bumps where required.
- **Mask ↔ legal** (`ai/test/codec.test.ts`), env contract incl. a real stdio spawn (`sim/test/env.test.ts`), balance regression (`sim/test/balance.test.ts`), server integration over real sockets (`server/test/online.test.ts`, `models.test.ts`), web services against a live server (`web/test/onlineClient.test.ts`).
- Parity: when the adapter lands, add a test loading `models/parity/<id>.json` into `checkParity` (tolerance in ai-interface-spec §11).

## 11. Working agreements for AI agents
- Read this file first; update it (and `README.md`) in the same change when structure, libraries, patterns or commands change.
- **Before a massive or multi-file structural change**, brief the scope and reason and wait for approval.
- **Strict modularization**: never mix UI, state and business logic in one file (View / Hook·State / Service / Type).
- **SOLID balanced with FP**; use a pattern only for a real problem and state why (commit body).
- **Ambiguous? Ask, don't guess** — rules, scope, and the user's model format above all.
- Git: never commit to `main` directly; `feature/xxx`, `bugfix/xxx`, `docs/xxx`, `chore/xxx`; English Conventional Commits.
- Comments: **English and minimal** (why, not what).
- **Asset requests** state purpose + path + filename (e.g. `apps/web/public/assets/audio/bgm/board.mp3`).
- Work phase by phase; stop only for decisions the user must make. Plans ≤ 300 lines.

## 12. Change cookbook
| Change | Steps |
|---|---|
| Tile event | Edit `DEFAULT_RULES.board` (`TileDef = { id, name, safe, effects }`); new effect kinds get a handler in `tiles.ts`. Update game-design, golden snapshots, re-run `pnpm sim`. Board size change → obs+act bump. |
| Item | `ItemId`, `RulesConfig.items`, `items.ts`, `legal.ts`, protocol `ActionSchema`, UI. Item features/BUY indices change → `obs_v2`/`act_v2`. |
| Job passive | Hook in `jobs.ts` `PASSIVES` + params in `RulesConfig.passives`; keep the RNG order in game-design §9. Observable state → obs bump. |
| Action | `Action` union, `LEGAL_BY_PHASE`, reducer dispatch, `ActionSchema`, codec + `ACTION_NAMES`, `timeoutAction`, HeuristicBot, UI → `act_v2`. |
| Observation feature | Never edit `obs_v1` in place: new layout version, scales, golden snapshot, spec §3, env `info`; warn the user (retraining). |
| Protocol message | `domain:verb` + zod schema in `packages/protocol`, handler in `server/src/socket/gateway.ts`, mapping in `OnlineGameClient`; bump `PROTOCOL_VERSION` only when breaking. |
| Balance tweak | Change `DEFAULT_RULES`, bump `RulesConfig.version`, update game-design + `rules.test.ts`, re-run `pnpm sim` (game-design §15 metrics), tell the user (`rules_version`). |
| Weight adapter | Implement `USER_WEIGHT_ADAPTER` (pure TS forward), add a parity test with the user's samples, then enable model seats in the web setup page. |

## 13. Glossary (KO ↔ code)
| Korean | Code | Korean | Code |
|---|---|---|---|
| 드래곤 러쉬 | Dragon Rush | 칸 / 보드 | `Tile` / `Board` |
| 검사 / 궁수 / 마법사 | `swordsman` / `archer` / `mage` | 용 | `Dragon` |
| 닌자 / 광전사 | `ninja` / `berserker` | 전투 (PvP / 용전) | `duel` / `dragonFight` |
| 공격력 / 방어력 | `atk` / `def` | 라운드 / 턴 / 단계 | `round` / `turn` / `phase` |
| 최대 체력 / 현재 체력 | `maxHp` / `hp` | 행동 / 이벤트 | `Action` / `GameEvent` |
| 코인 | `coins` | 텔레포트 / 방어막 / 도둑 | `teleport` / `shield` / `thief` |
| 밸런스 수치 | `RulesConfig` | 쉬는 턴 | `skipNextTurn`, `turn.resting` |
