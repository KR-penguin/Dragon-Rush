# AI_README — Dragon Rush

> Workspace guide for AI coding agents. Read it before touching anything in this repo.
> **Status: implemented (P0–P7).** The weight JSON format (P6 adapter), additional art/SFX, and a hosting target (P7) wait on the user. The supplied MP3 now provides BGM.
> **2nd round (Phase R1–R8, 2026-11-12) in progress:** "Ember Table" board redesign, FX/audio, and real-time 2D combat for duels and the dragon with a separate combat AI model (development-plan §5). The combat AI interface, training env, online rollback path, and calibrated `outcome_v1` result predictor are implemented. The balanced-bot 10f/16f pooled matchup test passes 10/10 directions; target margins and some 5f directions remain open, as does network feel validation. UI Easy/Hard use other styles and are not certified by that matrix.
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
| Real-time combat: sim constants, controls, frame data, damage, job kits, duel/dragon rules, board seam, implemented netcode and measured limits (`DEFAULT_COMBAT_RULES` and code win) | `docs/combat-design.md` |
| Combat AI: `cobs_v1`, `cact_v1`, masks, reward, `combat-env-server`, `CombatVecEnv`, `combat_resolver`, combat model contract (implemented; `[구현]` notes mark deviations) | `docs/combat-ai-spec.md` |
| The 8 must-follow code rules | `coding_convention.md` |

Reading order for any task: this file → `coding_convention.md` → canonical doc(s) for the area you touch → the code.
`CLAUDE.md` imports this file and `coding_convention.md`. `prompt.md` is the user's personal file (git-ignored): read it if needed, never edit, delete, stage or commit it.

## 2. Project status
- Done: engine (P1), AI interface + training env (P2), balance re-verified on the TS engine (P3), local web play (P4), online multiplayer (P5), model-integration plumbing (P6), deploy files (P7: Dockerfile, CI workflow).
- Waiting on the user: `USER_WEIGHT_ADAPTER` in `packages/ai/src/model/adapters/index.ts` stays `null` until the weight JSON format and parity samples arrive (model seats show "준비 중"). Visual/SFX stand-ins use game-icons SVG and procedural CSS, Canvas, and Web Audio until more files arrive at the paths in development-plan §4.2. BGM uses the supplied MP3.
- Done (2nd round, R6): `packages/combat-ai` (`cobs_v1`/`cact_v1` encoder, codec, masks, mirror augmentation, scripted bots by name, `CombatModelPolicy`, `USER_COMBAT_WEIGHT_ADAPTER = null`, board → combat setup), `combat-env-server` (`rpgboard-combat-env/1`) + Python `CombatEnv`/`CombatVecEnv`, and board `combat_resolver: 'outcome' | 'dice' | 'sim'`. Board and combat policies use separate models and envs; the shipped `outcome_v1` is an internal combat-result predictor, not a policy.
- Done (2nd round): `packages/combat` (deterministic 60 Hz integer combat sim, `DEFAULT_COMBAT_RULES`, `MATCHUPS` chart, scripted bots, calibration scripts; balanced-bot 10f/16f pooled matchup direction 10/10 with per-tick input, target margins and some 5f directions still missed). Local play runs real-time fights on the Canvas combat screen (`apps/web/src/services/fight/*`, `components/combat/*`, `combat/render/*`; `GameUpdate.fight`, `GameClient.reportFight`). The engine `COMBAT` phase is implemented (`RulesConfig.combat.mode: 'dice' | 'external'`, `applyCombatResult`, `resolveCombatWithDice`). Online fights use server-authoritative rollback by default; the protocol's `quickCombat` option selects dice resolution but is not exposed by the online UI. Scripted bots decide every tick in local, online, board sim, and outcome fitting; the combat training env retains its separate four-live-tick `action_repeat`. No win probability is displayed in game.
- Done (online path): `packages/netcode` provides `FightAuthority`, `FightClient`/`RollbackSession`, spectator playback, clocks, and a virtual TCP simulator. The server alone confirms combat inputs and applies the result; PvP clients predict and roll back changed inputs, PvE predicts the deterministic dragon locally with input delay zero, and spectators replay confirmed inputs. This is a functional implementation, not a claim that the latency targets have been met: see combat-design §9.5.
- Current `rush-3` rules: early PvP grace (rounds 1–2, `pvpGraceRounds`), no starting items (`startingItems = {}`), a four-turn ninja move-adjust cooldown, and a PvP victory reward of 30 coins plus full HP. A rest turn only blocks movement. Teleport has no per-turn limit (`teleport.perTurnLimit = null`, open question R2); thief is once per turn (R3).

## 3. Product in ~10 lines
- Web dice board game with light RPG growth. 2–4 seats in any mix of human, bot and user model.
- 24-tile ring board (0–23, clockwise), one 1d6 per move. Tile 0 `START` is a safe zone that pays a bonus when a dice move passes or lands on it. Other tiles have fixed events (shops at 6 and 18, a Mystery card deck).
- Stats: `hp`, `maxHp`, `atk`, `def`, `coins`. Five unique jobs (`swordsman`, `archer`, `mage`, `ninja`, `berserker`), each with a passive.
- Coins buy stat upgrades during your own turn (`PRE_ROLL`/`POST_MOVE`, anywhere, escalating cost). On a SHOP tile they also buy items: `teleport`, `shield`, `thief` (single-use).
- Stopping on a non-safe tile with another player after the grace rounds opens a duel confirmation, then a 1v1 fight (real-time by default, dice in quick-combat mode). The loser is eliminated; the winner takes `floor(coins / 2)` plus all items, gains 30 coins, and heals to max HP. A shield cancels the duel.
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
| Web | React 19 + Vite 7, Zustand 5, socket.io-client 4, react-icons (`gi` = game-icons.net, CC BY 3.0), Fontsource (Hahmlet, Black Han Sans, Noto Sans KR, Gowun Batang) | "Ember Table" board: DOM + CSS 3D (`.world-shake > .stage > .camera > .board3d`), FX layer in `src/fx` |
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
│  ├─ ai/            # @dragon-rush/ai: obs/act, bots, outcome_v1 JSON predictor, ModelPolicy, parity, adapters
│  ├─ combat/        # @dragon-rush/combat: deterministic real-time combat sim, DEFAULT_COMBAT_RULES
│  ├─ combat-ai/     # @dragon-rush/combat-ai: cobs_v1/cact_v1 encoder, codec, masks, scripted bots by name, combat model policy
│  ├─ netcode/       # @dragon-rush/netcode: authoritative fight timeline, rollback client, spectator, timing, network simulator
│  └─ sim/           # @dragon-rush/sim: batch runner, metrics, `pnpm sim` CLI, board env server + combat env server (stdio JSONL)
├─ python/           # rpgboard_env (numpy clients: board + combat), examples/random_agent.py + random_combat_agent.py, tests/ (pytest)
├─ models/           # user weight JSON (models/<id>.json); parity samples in models/parity/; combat models in models/combat/ (planned)
├─ docs/             # game-design, architecture, ai-interface-spec, development-plan, art-direction, combat-design, combat-ai-spec
├─ Dockerfile, .github/workflows/ci.yml
└─ README.md  AI_README.md  coding_convention.md  CLAUDE.md
```
- `engine/src`: `index.ts` (exports) · `reducer.ts` (dispatch + auto-apply single legal action) · `legal.ts` (`LEGAL_BY_PHASE`, `actionKey`) · `state.ts` (`createGame`, `cloneState`) · `public.ts` · flow `turn.ts movement.ts duel.ts dragon.ts items.ts` · parts `combat.ts jobs.ts economy.ts tiles.ts board.ts` · base `ctx.ts rng.ts rules/ types.ts`.
- `ai/src`: `obs/` (layout, encode) · `codec/actions.ts` · `policy.ts` · `bots/` (randomBot, heuristic/{estimate,heuristicBot}, registry) · `outcome/` (schema, bundled rush-3 artifact, structural-profile predictor) · `model/` (modelPolicy, parity, adapters/).
- `combat-ai/src`: `obs/` (layout `COBS_V1_LAYOUT`, encode, mirror) · `codec/actions.ts` (cact_v1, `toFighterInput`) · `mask.ts` (`combatActionMask`, `buttonReadyIn`, `isActionable`) · `runtime/history.ts` (`StateHistory`, reaction delay) · `bots/registry.ts` (`scripted:<name>`) · `model/` (types, modelPolicy, adapters/) · `board.ts` (`boardCombatSetup`).
- `netcode/src`: `authority.ts` (server input commits, confirms and sync) · `client/` (`fightClient`, `rollbackSession`, rings, event reconciliation, smoothing, spectator) · `clock.ts`, `timing.ts`, `netsim.ts`. `protocol/src/fight/` contains the versioned fight events, object schemas and flat integer-array codecs.
- `sim/src`: `runner.ts` (playGame, runBatch, deriveSeed) · `combatResolver.ts` (`outcome` | `dice` | `sim`) · `outcome/` (60Hz data generation, fit, JSON loader, calibration) · `statDist.ts` (`stat_dist_v1`) · `metrics.ts` · `cli.ts` + `simWorker.ts` (worker threads) · `modelLoader.ts` · `env/` (board env) · `combat-env/` (combat env).
- `server/src`: `main.ts app.ts config.ts errors.ts` · `socket/` (gateway, rateLimit) · `rooms/` (Room, RoomManager) · `session/SessionStore.ts` · `game/` (GameSession, TurnTimer, timeoutAction) · `fight/FightRoom.ts` (60 Hz authoritative online fights) · `ai/modelRegistry.ts`.
- `web/src`: `pages/`, `components/` (View, props only), `hooks/`, `store/gameStore.ts` (Zustand), `animation/eventTimeline.ts` + `eventSfx.ts`, `services/` (`gameClient.ts` port, `LocalGameClient`, `OnlineGameClient`, `onlineSession`, `audio.ts` Web Audio engine), `types/` (labels, view helpers).
- `web/src` real-time combat: `services/fight/` (no React: `FightLoop` for local/replay, `OnlineFightSession` for rollback or confirmed spectator playback; keyboard/gamepad input and optional network debug pipe; `fightSetup` board stats → `CombatSetup`) · `combat/` (`render/` Canvas arena renderer + HUD, `fightFx.ts` pure sim event → FX/audio map, `fightDirector.ts`, `fightFlow.ts` VS/READY/KO/result phases) · `components/combat/` views · `hooks/useFight*` · `pages/game/CombatLayer.tsx` (single mount point, online status and optional `NetSimPanel`) · `types/combatControls.ts`.
- `web/src/fx` (game feel, renderer-agnostic): `core/` pure models (trauma `camera`, hit-stop `time` clock, SoA `particles` capped at 500, `floatingText`, `flash` governor, easing, xorshift `rng`, Perlin `noise`) · `audio/` (sound catalogue + procedural Web Audio fallback) · `eventFx.ts` (GameEvent → cue list, pure) + `recipes.ts` · `runtime/` (one rAF loop outside React: `fx`, `fxTime`, `createArenaFx()` for the Canvas arena) · `board/boardResolver.ts` (anchor → screen point; replace for a new board) · `components/` (`FxLayer`, `ShakeContainer` = `.world-shake`, settings dock) · `settings/` (accessibility policy).
- Assets: `apps/web/public/assets/{images,audio}/...` (list in development-plan §4.2); only files that exist are used. `audio/bgm/dragon_foothills.mp3` is the single BGM file for lobby, board, duel, and dragon scenes. An SFX file at `audio/sfx/<name>.{mp3,ogg,wav}` (variants `<name>_2` … `_5`) replaces its procedural placeholder automatically; optional `audio/bgm/loops.json` sets BGM loop points by filename.

**Dependency direction** (one way): `engine` ← `protocol`, `ai` ← `sim`, `server`, `web`; `engine` ← `combat` ← `combat-ai` ← `sim`, `server`, `web`; `combat` + `protocol` ← `netcode` ← `server`, `web`. Engine imports nothing; the combat sim imports only the engine and also bans transcendental `Math.*` and `**` for cross-browser determinism. Runtime only: web ↔ server via Socket.IO; Python ↔ sim via subprocess stdio (two separate env processes).

## 6. Architecture invariants — MUST NOT break
1. **Engine purity & determinism.** No `Math.random`, `Date`, I/O, `node:*`, `@dragon-rush/*` imports in `packages/engine` (ESLint). Same `(setup, rules, seed, actions)` → same state and events. Inputs are never mutated (`applyAction` works on a clone). Randomness only from `state.rng`.
2. **Single rules source.** Only the engine decides legality and outcomes. UI buttons come from `legalActions`. `GameEvent`s carry result values, so UI and logs never recompute rules.
3. **`RulesConfig` is the only place for numbers.** `DEFAULT_RULES` must equal `docs/game-design.md` (golden test `packages/engine/test/rules.test.ts`).
4. **Server authoritative.** Board clients send `Action` + `stateVersion`; the server derives the seat from the socket. Board inputs (human, timer, bot, model, proxy) go through `GameSession.submit()`. During `COMBAT`, fight input masks go to `FightAuthority`; only its confirmed result enters `GameSession.submitCombatResult()`. Board RNG state stays server-side. The fight seed is sent in `fight:start` so clients can simulate the same combat.
5. **zod at boundaries.** Socket payloads and env-server stdin are parsed at entry. `z.infer<typeof ActionSchema>` equals the engine `Action` (compile-time check in `protocol/src/schemas.ts`). Model files: `JSON.parse` only.
6. **Versioned specs.** `OBS_VERSION "obs_v1"`/`OBS_DIM 253`, `ACT_VERSION "act_v1"`/`ACTION_DIM 47`, `ENV_PROTOCOL "rpgboard-env/1"`, `PROTOCOL_VERSION 2`, `RulesConfig.version "rush-3"`. Combat model: `COBS_VERSION "cobs_v1"`/`COBS_DIM 160`, `CACT_VERSION "cact_v1"`/`CACT_NVEC [9, 4]`/`CACT_FLAT_DIM 36`, `COMBAT_ENV_PROTOCOL "rpgboard-combat-env/1"`, `DEFAULT_COMBAT_RULES.version` + `hashCombatRules`, and `NETCODE_VERSION 1` in the combat build ID. `outcome_v1` requires matching board and combat rule versions. Layout/meaning change (including mask, mirror, reward or action-repeat semantics) → version bump + spec + golden snapshot update in the same change.
7. **Encoder, codec and mask live only in TS** (`packages/ai` for the board, `packages/combat-ai` for combat). Python never re-implements them. Board policies only see `PublicGameState`; combat policies see the (delayed) `CombatState` through `encodeCombatObservation`, and training and play share `StateHistory`, the action-repeat window and the "no input while not actionable" rule.
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
| Strategy | `Policy` (Random/Heuristic/Model), seat control in `GameSession`; `CombatPolicy` (scripted bots, `CombatModelPolicy`) | humans, bots, models, proxies share one path |
| Adapter | `WeightAdapter`: user JSON → `PolicyModel`; `CombatWeightAdapter` → `CombatPolicyModel` | format change swaps only the adapter |
| Shell-side resolver | `createCombatResolver('outcome' \| 'dice' \| 'sim')` settles engine `COMBAT` for sims and the board env | engine never calls the combat sim; the default board env samples the bundled model with engine RNG |
| Ports & Adapters | `GameClient` → `LocalGameClient` / `OnlineGameClient` | UI does not know local vs online |
| Fight sessions | Local `FightLoop`/replay and `OnlineFightSession` (`FightClient` or `SpectatorPlayback`) feed the combat renderer | the server confirms online inputs and results while local fights run in the browser |
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
// @dragon-rush/combat-ai
encodeCombatObservation(state, side, { delay, prevMove, prevButton, mirror? }): Float32Array(160)
combatActionMask(state, side): { move: Uint8Array(9); button: Uint8Array(4) }; flatMask(mask): Uint8Array(36); isActionable(state, side, repeat)
toFighterInput(action, prevInput): { input: FighterInput; press }; toFlat / fromFlat; mirrorMove; mirrorCombatObservation
createCombatBotByName('scripted:balanced|aggressive|cautious|idle|random|pool', random): CombatPolicy
interface CombatPolicyModel { meta: CombatModelMeta; forward(obs): Float32Array(13 | 36) }; createCombatModelPolicy(model, { difficulty?, mode?, temperature? })
boardCombatSetup(gameState): CombatSetup   // engine COMBAT request -> combat setup from board stats
// apps/web/src/services/gameClient.ts
interface GameClient { mode; subscribe(cb): () => void; submit(action, stateVersion): Promise<SubmitResult>; requestSnapshot(); dispose();
  reportFight?(fightId, result: CombatResult | 'dice'): Promise<SubmitResult> }   // GameUpdate.fight?: PendingFight | null (setup, seed, sides/controls, replay)
// apps/server: GameSession.submit(seat, action, stateVersion, source: 'human'|'timer'|'policy')
```
- Socket.IO: C→S `room:create|join|leave|configure|configureSeat|selectJob|setReady|start`, `game:action`, `game:requestSnapshot` (each with an `Ack<T>`); S→C `session:welcome`, `room:state`, `game:update`, `game:snapshot`, `seat:status`. Handshake `auth: { protocolVersion, sessionToken? }`.
- Online fights: `fight:start`/`ready`/`go`; `fight:input`/`relay`/`confirm`; `fight:ping`/`pong`/`ack`; `fight:control`/`sync`/`requestSync`/`retime`/`end`/`replay`. Hot-path packets are validated flat JSON integer arrays, not binary snapshots. `fight:confirm` carries confirmed inputs, substitution flags, timing feedback and periodic hashes. See architecture §12 and combat-design §9.
- Env server: `{ id, cmd: info|reset|step|close, params? }` per line; details in ai-interface-spec §7 (board) and combat-ai-spec §8 (combat, actions per env as `[[move, button], …]` or flat indices).
- Python: `RPGBoardEnv(...)`, `RPGBoardVecEnv(num_envs, ...)`; `info["action_mask"]`, `info["acting_seat"]`. `CombatEnv(...)`, `CombatVecEnv(num_envs, controlled='both'|'p0', ...)`; `info["move_mask"]`/`["button_mask"]` (or `["action_mask"]` flat), `info["actionable"]`, `info["ticks_elapsed"]`.

## 9. Commands
| Command | Purpose |
|---|---|
| `pnpm install` | install workspace deps |
| `pnpm dev` | web (Vite :5173) + server (:3001); Vite proxies `/socket.io` and `/api` |
| `pnpm test` / `pnpm lint` / `pnpm typecheck` / `pnpm build` | Vitest / ESLint / tsc / production build (web dist, server dist, sim dist) |
| `pnpm start` | run the built single service (serves `apps/web/dist` + Socket.IO) |
| `pnpm sim --games N --players 4[,3,2] --bots heuristic[,random,...] [--seed S] [--json] [--combat dice\|sim\|outcome] [--outcome-model packages/ai/src/outcome/model.json] [--log-fights <file>]` | headless balance metrics; `sim` runs each real-time fight, `outcome` samples the internal model, `--log-fights` writes `stat_dist_v1` |
| `pnpm env-server` | standalone board env server (`node packages/sim/dist/env-server.js`, needs `pnpm build`) |
| `pnpm combat-env-server` | standalone combat env server (`node packages/sim/dist/combat-env-server.js`, needs `pnpm build`) |
| `python -m pytest python/tests` | Python client tests (they run the TS server through `tsx`, no build needed) |

- Server env: `PORT`, `HOST`, `TURN_TIMEOUT_MS`, `RECONNECT_GRACE_MS`, `BOT_ACTION_DELAY_MS`, `MODELS_DIR`, `WEB_DIST_DIR`, `ROOM_TTL_MS`, `MESSAGES_PER_SECOND`.
- Python client: `RPGBOARD_ENV_CMD` / `RPGBOARD_COMBAT_ENV_CMD` override the board / combat server command, `RPGBOARD_ROOT` the repo root.

## 10. Testing requirements
- **TDD**: failing test first; bug fixes start with a seeded repro.
- **Seeded** tests only. Engine property tests (fast-check) deep-freeze inputs and check invariants, determinism and termination.
- **Golden**: `engine/test/golden.test.ts` (event log), `ai/test/obs.golden.test.ts` (obs hashes), `engine/test/rules.test.ts` (numbers). Update snapshots only for intended changes (`vitest -u`), with version bumps where required.
- **Mask ↔ legal** (`ai/test/codec.test.ts`), env contract incl. a real stdio spawn (`sim/test/env.test.ts`), balance regression (`sim/test/balance.test.ts`), server integration over real sockets (`server/test/online.test.ts`, `models.test.ts`), web services against a live server (`web/test/onlineClient.test.ts`).
- Combat AI: `combat-ai/test/` (layout = 160, obs ranges/one-hots over all 25 matchups + dragon, mirror involution, tick-0 golden snapshot, **mask ↔ sim** by actually pressing each button, codec, model policy), `sim/test/combatEnv.test.ts` (contract, atomic `ILLEGAL_ACTION`, byte determinism, stdio spawn, 64-env throughput printout), `python/tests/test_combat.py`.
- Netcode: `netcode/test/authority.test.ts` checks same-tick commit-before-reveal, sync privacy, rollback convergence, PvE prediction and bot takeover; `netMatrix.test.ts` checks two clients and the server under seeded virtual TCP latency/jitter/loss. Server `fightOnline.test.ts` uses real Socket.IO for a dragon fight and a PvP duel with a spectator. In the virtual matrix, no-loss 80/150/250 ms p95 prediction depth is 6/9/15 frames; at 0.5/1/2% loss it reaches roughly 10–11/18–19/33 frames. The hash and outcome converge, but lossy depth misses the design targets; this is a `RollbackSession` test, not full browser feel validation.
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
| Combat obs/action feature | Never edit `cobs_v1`/`cact_v1` in place: new layout version (`COBS_VERSION`/`CACT_VERSION`), combat-ai-spec §4–6, golden snapshot, Python README §9; warn the user (combat model retraining). Combat rule numbers only change `combat_rules_version`/hash. |
| Combat weight adapter | Implement `USER_COMBAT_WEIGHT_ADAPTER` from the user's format (head 9+4 or 36), add a combat parity test, then `model:<id>` opponents and the `sim:<model>` resolver. |

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
