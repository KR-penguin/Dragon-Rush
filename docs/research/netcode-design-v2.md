# Dragon Rush: real-time fight netcode design (v2)

> **Status:** proposed. This replaces `docs/combat-design.md` §9.1–9.5 and the hot-path rows of `docs/architecture.md` §12.3 (30 Hz full snapshots with re-simulation). v2 = v1 plus the fixes from the adversarial review: C-1, H-1 to H-10, M-1 to M-13, and L-1 to L-10.
> **Language:** this file is in English because the task asked for English. When merged into `docs/`, translate it to Korean (AI_README §1). Identifiers stay in English.
> **Code is the source of truth:** once `packages/combat` lands, `DEFAULT_COMBAT_RULES` and the netcode constants in code win over this file. Names follow the WIP sim on `feature/realtime-combat`: `createCombat`, `stepCombat`, `cloneCombatState`, `serializeCombatState`, `hashCombatState`, `hashCombatRules`, `COMBAT_PACK_VERSION`. Every number below is a tunable default (§9).
> **Labels:** **[derived]** marks my own analysis. **[R]** points to the sources in §12.

---

## 0. Decisions at a glance

| # | Decision | One-line reason |
|---|---|---|
| 1 | **PvP uses server-authoritative input rollback.** The server relays each committed input to the other fighter and confirms tick k at wall tick k. A missing input gets the substitution rule. Clients predict everything and roll back only when a prediction was wrong. | Every melee contact happens on one timeline, with about 3 ticks less correction than 30 Hz snapshots (SnapNet/Psyonix, 2XKO, Quantum) [R] |
| 2 | **(v2) Commit-before-reveal relay:** B's tick-k input reaches A only after A's own tick k is committed. | Removes same-tick lookahead. The honest cost is ≤ max(0, m_B − m_A) ticks |
| 3 | **(v2) Conditional stall hold (PvP 6 ticks):** the server waits briefly for a live seat whose input is missing, instead of substituting at once. | TCP retransmission stalls stop eating real inputs. Safe because of #2 |
| 4 | **PvE (vs the dragon) uses the same path with D = 0 and hold H = 15.** | The dragon depends only on state, so client prediction is exact. No rollback is visible at a steady ping |
| 5 | **Spectators play back the confirmed input stream** through an adaptive buffer (default 9 ticks). | No rollbacks, full 60 Hz, about 2 KB/s |
| 6 | **Bots are server seats.** Their masks are relayed to **both** fighters. Lookahead is open item O2. | One code path for every seat type |
| 7 | **Hot-seat and offline stay local:** browser sim, D = 0. | combat-design §8.3 |
| 8 | **Each player pays for their own connection; there is no rift balancing.** | Depth on A's screen depends only on A's RTT and margin |
| 9 | **Transport: the existing Socket.IO WebSocket.** Hot-path messages are flat JSON integer arrays (one frame each). No `volatile`. The hot path has its own rate buckets. **(v2)** App-level acks bound the downlink backlog. | A binary emit costs 2 frames; a second volatile emit in the same turn is dropped; Socket.IO never drops normal emits [R] |
| 10 | **Upgrade path:** a WebRTC DataChannel, gated by telemetry. WebTransport is not adopted yet. | Node has no production WebTransport server [R] |
| 11 | **D is fixed per fight from the player's own RTT. (v2)** The table extends to 7, and D is clamped to what is useful. | Changing D mid-fight is noticeable. High ping moves cost into felt delay instead of 20-tick rollbacks |
| 12 | **(v2) The lead controller** uses the median arrival slack (0.5 s) against a jitter-based target, with gain 0.01 per tick of error. | Robust to TCP stalls, no oscillation; Unity- and GGPO-style rate limiting [R] |
| 13 | **Hard prediction cap: PvP 40, PvE 120 ticks.** Past the cap the screen freezes, but input stamping continues. | Inputs stay real at the server |
| 14 | **No pause.** Substitution, then a bot after 1.5 s. Disconnect or hidden: a bot from the first unaccepted tick. **(v2)** Minimum bot tenure 3 s; handback is self-clocked. | Pausing turns a lag switch into an exploit; tenure stops bot summoning |
| 15 | **(v2) A canonical 7-bit mask:** `move(0..8) \| attack<<4 \| skill<<5 \| dash<<6`. One `maskToInput` table lives in `packages/combat`. | One SOCD rule and one conversion, so there is no conversion desync |
| 16 | **(v2) `fight:start` carries the effective rules and `rulesHash`.** | Any rules mismatch is caught at the start, not as a silent desync |
| 17 | **(v2) The state hash is checked only on clean (post-resim, confirmed) slots.** On a mismatch: sync. After 3: sync every 30 ticks. | No false desyncs |
| 18 | **Cosmetics play on prediction. (v2)** Two-stage event matching (exact id, then a tick-free signature within ±6 ticks). KO text and the KO stinger, the result and the board write-back wait for confirmation. | No double sounds; irreversible outcomes are never predicted [R] |
| 19 | **No lag compensation, no rewind.** An input counts at its stamped tick if it is committed in time. | The cost falls on the late player (Rematch, Quantum) [R] |

---

## 1. Mode per case

| Case | Authority | Client sim | D | Netcode |
|---|---|---|---|---|
| Human vs human, online | Server sim at wall tick (+ stall hold) | Predict everything + rollback | auto 1–7 | Relay (commit-before-reveal) + confirm |
| Human vs server bot (PvP), online | Server sim; bot inference on the server | Same | auto | Bot = seat; bot masks relayed at once |
| Human vs dragon (PvE), online | Server re-simulates the input stream, deadline W ≥ k + H | Exact local sim | **0** | Same messages; no relay |
| Spectators (0–2 board players) | — | Deterministic playback of confirmed inputs | — | `fight:confirm` + `fight:ack` (§5.8) |
| All-bot fights | Server simulates the whole fight at once | Replay (4× highlight, combat-design §8.3) | — | `fight:replay` once |
| Hot-seat / offline | Browser (`LocalGameClient`) | Local | 0 | None |
| Disconnect, hidden tab, starvation | Server bot (Normal, "AI 대행") from the first unaccepted tick; at least 3 s | Own seat shown as remote | — | `fight:control` (§6.6) |

---

## 2. Shared model

### 2.1 Units and notation
- **T** = 16.667 ms; everything is counted in ticks.
- **Tick numbering:** `createCombat` produces state tick 0. The input for tick k is consumed by the step that produces state k (k ≥ 1). "Tick 1" is the first step after "싸워라!".
- **W(t)** = the server wall tick, `floor((performance.now() − epochServerMs) / T)`. The server uses this one clock everywhere.
- **fightTick** = the last tick the server has stepped for a fight (≤ W).
- **inputTick** = the client's input clock. **simTick** = the client's last simulated tick. **confirmedTick** = the highest contiguous tick the client knows is confirmed **and** has simulated.
- **D** = input delay. An input sampled when the client advances to `inputTick` applies at tick `inputTick + D`.

### 2.2 Canonical input mask (`packages/combat/src/input.ts`)
```ts
export const MOVE_NIBBLE = 0x0f;  // 0 = none, 1..8 = N, NE, E, SE, S, SW, W, NW (FighterInput.move)
export const BTN_ATTACK = 0x10, BTN_SKILL = 0x20, BTN_DASH = 0x40;
export const isValidMask = (m: number) => Number.isInteger(m) && m >= 0 && m <= 0x7f && (m & 0x0f) <= 8;
export function maskToInput(m: number): FighterInput;   // precomputed frozen table, 72 valid entries
export function inputToMask(i: FighterInput): number;
```
- The server decoder, client, bots, replays and netsim use only these two functions.
- **SOCD is resolved in the input latch**, before encoding: last-pressed wins per axis, open item O8. It never happens in the sim or the codec.
- The sim derives presses (rising edges) from `held`, which it stores in state (WIP `readInput`). Repeating a mask never creates a press and never releases a button.

### 2.3 Substitution (server) and prediction (client) [derived]
**Server substitution.** At the deadline for tick k, for a human seat with no committed mask:
```ts
export const DECAY_RUN = 10;
/** run = number of consecutive substituted ticks including k (resets on any real or bot mask). */
export const substitute = (lastReal: number, run: number) => (run <= DECAY_RUN ? lastReal : lastReal & ~MOVE_NIBBLE);
```
- Buttons stay held, so substitution never creates a press or a release; releasing would fire the archer's draw.
- Movement goes neutral after a 10-tick run, so a stalled fighter does not walk into the ring of fire.

**Client prediction** for seat s at an unknown tick t:
1. Find the newest tick n < t whose mask is known: real (relayed or own), or confirmed-substituted.
2. If the mask at n is real or bot: predict that mask (**pure repeat, no decay**).
3. If the mask at n is a confirmed substitution with run r: predict `substitute(lastRealMask(s), r + (t − n))`.

**Property.**
- While the opponent's stream is healthy, prediction never decays. This keeps steady-state high-ping prediction free of a stop bias.
- While the server is substituting, the client mirrors it exactly.
- The only mismatch: the movement part of ticks beyond 10 in a starvation episode the client has not yet heard about. That is at most one small correction per episode.

### 2.4 Authority, deadlines, relay
**PvP step rule (`FightAuthority`).**
- The server steps tick k when W ≥ k and, for every human seat, either a mask for k is committed or its hold has expired.
- **Stall hold.** A human seat s whose mask for k is missing at W ≥ k gets a hold of `PVP_HOLD = 6` ticks if both are true:
  - its stream is alive: the last packet arrived ≤ 250 ms ago;
  - no hold has expired in the current episode. An episode ends when a mask arrives on time.
  - Otherwise k is substituted at W ≥ k.
- A hold delays the confirm stream by at most 100 ms. Relays and other seats are unaffected.

**PvE.** The server steps tick k when the mask for k is present and W ≥ k, or when W ≥ k + H (H = 15).

**Commit-before-reveal relay.**
- Seat s's mask for tick k is sent to the other human fighter o only when o's tick k is committed: accepted into o's buffer, or k ≤ fightTick.
- Accepting masks from either seat flushes whatever has become revealable, in both directions.
- Bot masks are revealed to both fighters as soon as they are computed.
- **A revealed mask is final.** Takeover rules (§6.6) never revoke an accepted mask.

### 2.5 Latency model [derived]
- `ow_X` = one-way latency server ↔ X; `m_X` = X's arrival margin; X leads the server by `L_X = ow_X + m_X − D_X`.
- **Opponent prediction depth on A's screen:** `depth_A ≈ RTT_A/T + max(0, m_A − m_B) − D_A`. It does not depend on B's latency, because B's lead absorbs it.
- **Confirm depth on A's screen** (KO confirmation, overrides of A's own inputs, hashes): `≈ RTT_A/T + m_A − D_A`, plus ≤ 1 for 2-tick batching, plus ≤ PVP_HOLD only during a stall.
- **Same-tick lookahead:** 0. A modified client sees B's tick-k input only after committing its own tick k. A cheating bot can still react in about `RTT_A − m_A`. That is the generic client-server limit; §6.8 flags it statistically.

**Why no rift balancing.**
1. A good connection would pay for a bad one.
2. A client that fakes a high RTT could inflate the honest player's margin.
3. Independent per-seat controllers are simpler.

Rematch and Quantum take the same stance [R].

**Reaction rule.** The defender needs attack startup ≥ `(ρ + RTT_defender)/T`. With ρ = 250 ms, 24 ticks covers RTT up to 150 ms. This matches combat-design §3: "online PvP reactable ≥ 24f".

**Expected depth** (equal margins, D from §4.4):

| RTT (± jitter) | D | Felt input delay | Depth median / p95 (ticks) | KO confirm after prediction |
|---|---|---|---|---|
| 20 ms (±5) | 1 | 17 ms | 0–1 / 2 | ≈ 2 t (33 ms) |
| 80 ms (±15) | 2 | 33 ms | 3 / 5 | ≈ 4 t (67 ms) |
| 150 ms (±20) | 3 | 50 ms | 6 / 8 | ≈ 7 t (117 ms) |
| 250 ms (±40) | 4 | 67 ms | 11 / 14 | ≈ 12 t (200 ms) |
| 300 ms (±40) | 5 | 83 ms | 13 / 16 | ≈ 16 t (267 ms) |
| 400 ms (±50) | 6–7 | 100–117 ms | 17 / 21 | ≈ 20 t (333 ms) |

- Rollbacks happen only on mispredictions: at most about 5 per second per remote human (Infil) [R].
- CPU cost: 40 ticks × 20 µs = 0.8 ms. How a correction looks is the real limit, not the CPU.

### 2.6 Hits and fairness
- One authoritative timeline; no lag compensation or rewind.
- A dodge pressed before the hit on the defender's own screen counts if it is committed in time. The lead controller and the stall hold make that the normal case.
- An attacker can occasionally see a predicted hit become a whiff. That is the honest trade, the same as in fighting-game rollback.

---

## 3. Transport and messages

### 3.1 Socket.IO configuration (`apps/server/src/app.ts`, `apps/web/.../onlineSession.ts`)
```ts
// server
new Server(app.server, { serveClient: false, transports: ['websocket'], perMessageDeflate: false,
  httpCompression: false, maxHttpBufferSize: 64 * 1024, pingInterval: 10_000, pingTimeout: 5_000 });
// client, while a fight is active (§4.7)
manager.reconnectionDelay(250); manager.reconnectionDelayMax(2000);
```
- **Nagle:** ws calls `setNoDelay()`, and Chromium sets TCP_NODELAY.
- **Proxy:** the idle timeout must be > 15 s.
- **Never `volatile`.** Every receiver needs every confirmed tick.
- **Hot path:** flat JSON integer arrays (1 frame each). The byte layouts in §3.4 define the canonical field order, and the same codec emits bytes in Phase 2.
- **Validation:** `packages/protocol/src/fight/wire.ts` holds hand-written decoders, `decodeFightInput(raw: unknown): FightInput | null` and friends. They check `Array.isArray`, length bounds, `Number.isInteger`, ranges and `isValidMask`, and they are fuzzed with fast-check. Reliable messages use zod.
- **Rate limits:** hot-path handlers are registered outside the generic 20/s limiter, with their own buckets (§6.3).
- `connectionStateRecovery` is not used; recovery is app-level `fight:sync`.

### 3.2 Message catalogue

| Event | Direction | Cadence | Size (JSON incl. framing) |
|---|---|---|---|
| `fight:input` | fighter → S | Each render frame that produced ≥ 1 tick (≈ 60/s) | ≈ 45 B |
| `fight:relay` | S → fighter(s) | When masks become revealable | ≈ 40 B |
| `fight:confirm` | S → fighters and spectators | Every 2 stepped ticks; hash every 30 ticks | ≈ 60–80 B |
| `fight:ack` | spectator → S | 4 Hz | ≈ 25 B |
| `fight:ping` / `fight:pong` | client ↔ S | Burst of 8 at 50 ms; then 2 Hz in a fight, 0.5 Hz on the board | ≈ 40 / 80 B |
| `fight:start`, `fight:ready`, `fight:go`, `fight:control`, `fight:away`, `fight:back`, `fight:requestSync`, `fight:sync`, `fight:retime`, `fight:end`, `fight:replay`, `fight:stats` | mixed | Rare | `fight:start` ≈ 10–20 KB (rules); `fight:sync` ≈ 3–5 KB |

**Bandwidth:** a fighter uses about 3 KB/s up and about 5 KB/s down; a spectator about 2 KB/s down.

### 3.3 Redundancy and acks
- `fight:input` carries the newest `n = max(4, new ticks)` masks (≤ 16) and `ackConfirmTick`, the client's highest contiguous received confirm tick.
- The server uses `ackConfirmTick` for backlog control (§6.7); Phase 2 uses it for resends.
- The server is first-write-wins per (seat, tick). A redundant copy with a different mask is ignored and counted.

### 3.4 Wire layouts (little-endian; the JSON array uses the same order without the type byte)
**`fight:input` (0x01)**: JSON `[fightId, newestTick, ackConfirmTick, m0, …, m(n−1)]`, newest first.

| Off | Type | Field |
|---|---|---|
| 0 | u8 | 0x01 |
| 1 | u32 | fightId (per-process monotonic) |
| 5 | i32 | newestTick (pre-roll ticks are ≤ 0) |
| 9 | i32 | ackConfirmTick |
| 13 | u8 | n (1–16) |
| 14 | u8[n] | masks; each must pass `isValidMask` |

**`fight:relay` (0x02)**: JSON `[fightId, seat, newestTick, m0, …]`, a contiguous run, newest first.

| Off | Type | Field |
|---|---|---|
| 0 | u8 | 0x02 |
| 1 | u32 | fightId |
| 5 | u8 | seat (0/1) |
| 6 | i32 | newestTick |
| 10 | u8 | n (1–16) |
| 11 | u8[n] | masks |

**`fight:confirm` (0x03)**: JSON `[fightId, firstTick, slackMedMs, jitUpMs, quality, hashTick, hash, a0, b0, f0, a1, b1, f1, …]`

| Off | Type | Field |
|---|---|---|
| 0 | u8 | 0x03 |
| 1 | u32 | fightId |
| 5 | i32 | firstTick |
| 9 | u8 | n ticks (normally 2; up to 32 on a Phase 2 resend) |
| 10 | i16 | slackMedMs: the **recipient's** median arrival slack over the last 0.5 s (§4.3); 0 for spectators |
| 12 | u8 | jitUpMs: the recipient's uplink jitter (RFC 3550 style, §4.3) |
| 13 | u8 | quality: bits 0–1 seat 0, bits 2–3 seat 1 (0 ok, 1 warning, 2 critical) |
| 14 | i32 | hashTick (−1 = none; otherwise a multiple of 30) |
| 18 | u32 | hash: `hashCombatState` of the state produced by hashTick |
| 22 | 3 B × n | per tick: u8 maskA, u8 maskB, u8 flags (bit0 substituted A, bit1 substituted B, bit2 bot A, bit3 bot B, bit4 terminal, bit5 held: the server applied a stall hold) |

**`fight:ack` (0x06)**: `[fightId, highestContiguousTick]`. **`fight:ping` (0x04)**: `[pingId u16, clientMs f64]`. **`fight:pong` (0x05)**: `[pingId, clientMs, serverRecvMs, serverSendMs]`.

### 3.5 Reliable messages (zod, `packages/protocol/src/fight/schemas.ts`)
- **`fight:start`** (S → room, and to any socket joining while the fight is active):
  `{ fightId, kind, seed, setup, rules, rulesHash, packVersion, combatBuildId, seats: [{ playerId, controller }], you: { role: 'fighter', seat } | { role: 'spectator' }, prerollTicks: 90, maxTicks, pveHoldTicks, pvpHoldTicks }`
  - The client builds the fight with `createCombat(setup, seed, rules)` from the **received** rules.
  - If `hashCombatRules(rules) !== rulesHash` or `packVersion !== COMBAT_PACK_VERSION`, the client aborts, reports the error, and the seat is bot-played.
  - A `combatBuildId` mismatch means the client is a stale build: it reloads.
- **`fight:ready`** (C → S): `{ fightId, inputDelay, rttMs, jitterMs }`. It is sent after assets are decoded and the ping burst is done. It is telemetry only, except as a readiness signal.
- **`fight:go`** (S → room; resent on reconnect or join): `{ fightId, epochServerMs }`.
- **`fight:control`** (S → room): `{ fightId, seat, controller: 'human'|'bot', fromTick }`.
- **`fight:away`** / **`fight:back`** (C → S): `{ fightId }`.
- **`fight:requestSync`** (C → S): `{ fightId, reason: 'join'|'gap'|'desync'|'stall'|'backlog'|'overflow', tick?, clientHash? }`. The server sends at most one sync per 500 ms per socket.
- **`fight:sync`** (S → C): `{ fightId, tick, state: number[] /* serializeCombatState */, hash, seats: [{ lastRealTick, lastRealMask, substRun, controller }] ×2, pending: [{ seat, firstTick, masks: number[] }] }`
  - `seats` and `pending` make the client's prediction inputs equal the server's.
  - `pending` holds only masks that are revealable to the recipient.
- **`fight:retime`** (S → room): `{ fightId, epochServerMs, atTick }`, sent only after a server stall > 2 s (§6.1).
- **`fight:end`** (S → room): `{ fightId, endTick, outcome, finalHash }`. Afterwards the server drops messages for this fightId silently for 10 s (a tombstone).
- **`fight:replay`** (all-bot fights): `{ fightId, seed, setup, rules, inputs: RLE number[], outcome, highlight }`.
- **`fight:stats`** (optional C → S at the end; untrusted telemetry): depth histogram, rollbacks per minute, pops, freezes, phantom KOs, event rebinds.

### 3.6 Upgrade path
1. **Gate.** Log input-stall events per fight: an arrival gap > 100 ms, or any hold that expired.
   - Add Phase 2 when more than 5% of fights show over 1 stall per 10 s, or the p75 of eaten inputs exceeds 1 per minute.
2. **Phase 2:** hot path over a WebRTC DataChannel.
   - geckos.io 3.x on node-datachannel, `ordered:false, maxRetransmits:0`, one UDP port, own STUN, no TURN.
   - Same codec as bytes. Input = all unacknowledged masks (≤ 16). Confirm = everything since `ackConfirmTick` (≤ 32, otherwise a sync).
   - Reliable messages stay on Socket.IO. geckos.io is a new library, so brief the user first.
3. **WebTransport:** re-evaluate when `node:quic` ships unflagged in a Node LTS [R].

---

## 4. Timing

### 4.1 Two-phase fight start (inside the 2.8 s transition of combat-design §8.2)

| Time | Server | Fighters | Spectators |
|---|---|---|---|
| t0 | Engine stops in `COMBAT`; `TurnTimer` paused. Creates `FightRoom` (CSPRNG seed, effective rules). Sends `fight:start`. | Zoom and wipe; preload the arena, sprites and SFX; ping burst of 8 × 50 ms (the filter is warm from 0.5 Hz board pings). | Same; ping burst only. |
| by t0 + 1.3 s (end of VS) | Waits for `fight:ready` from both human fighters. | **Lock D** (§4.4). Send `fight:ready` once assets and the burst are done. Hold VS until `fight:go`. | Preload. |
| tGo = both ready, or t0 + 6 s at the latest | Sends `fight:go { epochServerMs = alignToLoopPhase(max(t0 + 2800, tGo + 1600)) }`. The common case keeps the 2.8 s timeline. | Start the input clock at tick −90 + the initial lead. Pre-roll "준비" (1.5 s, ticks −89…0): send inputs; **re-anchor by jumping** (nothing is simulated); stamp normally. | Start buffering. |
| Pre-roll | Accepts inputs for ticks ≤ 0 and measures slack. Sends confirms (zero masks + slack). No stepping. | Inputs sampled in the last D pre-roll ticks apply to ticks 1…D, so a key held before "싸워라!" works. | — |
| Tick 1 | First `stepCombat`. | Play. | Playback starts once the buffer fills. |

- A fighter that is not ready at `fight:go` joins through `fight:requestSync { reason: 'join' }`. Until then it is starving, and the bot rule applies after 1.5 s.
- **Combat seed exposure.** The combat seed and RNG state reach clients; exact PvE prediction requires them. This is a combat-only exception to AI_README invariant 4, and the board RNG is unaffected. Open item O5 describes option B, which removes it.

### 4.2 Clock sync, RTT and jitter (`packages/combat-net/src/clock.ts`)
- **Offset θ** (`serverMs ≈ clientMs + θ`), using the NTP on-wire formulas (RFC 5905):
  - offset = ((s1 − c0) + (s2 − c3)) / 2
  - delay = (c3 − c0) − (s2 − s1)
  - Keep the last 16 samples; take the median offset of the 4 lowest-delay samples.
  - Slew θ by at most 2 ms per sample; snap if the error exceeds 100 ms.
- **RTT** (RFC 6298): update `RTTVAR ← ¾·RTTVAR + ¼·|SRTT − R|` first, then `SRTT ← ⅞·SRTT + ⅛·R`. **effRTT = SRTT + 2·RTTVAR**, used for D, the bars and warnings.
- **Downlink jitter** (RFC 3550) on confirm arrivals: `J += (|(Rj − Ri) − (tickj − ticki)·T| − J)/16`. Also keep a 3 s p97 for spectator buffer sizing.
- **Pings:** a burst at fight start, after a reconnect and on becoming visible; then 2 Hz in a fight.
- Use `performance.now()` only; re-sync after resume from sleep.

### 4.3 Lead controller (time dilation) [derived; v2]
**Anchor.**
- `estServerTick(now) = (now + θ − epochServerMs) / T`.
- `inputTick = floor(estServerTick) + ceil((SRTT/2 + 6 ms + 2·J)/T) − D`.

**Server measurement, per human seat (`FightAuthority`):**
- For each received `fight:input`: `slack = deadlineMs(newestTick) − arrivalMs`, where `deadlineMs(k) = epochServerMs + k·T`.
  - Skip packets processed in a late wake (§6.1), because a server stall is not the client's lateness.
- Keep the last 30 samples (0.5 s). `slackMedMs` = their **median**. TCP stall bursts (≈ 4–7% of samples at 0.5–1% loss) cannot move a median.
- `transit_i = arrivalMs_i − newestTick_i·T`; `J_up += (min(|transit_i − transit_{i−1}|, 2T) − J_up)/16`; report `jitUpMs = round(J_up)`.

**Client control law,** on each confirm:
```ts
const target = Math.min(6 + 2 * jitUpMs, 60);                    // ms
const err = (slackMedMs - target) / T;                           // ticks; < 0 means my inputs are late
const lim = Math.abs(err) > 4 ? 0.05 : 0.03;
timeScale = Math.abs(err) <= 0.5 ? 1 : 1 - clamp(0.01 * err, -lim, lim);
if (Math.abs(err) > 10) { if (++farCount >= 15) reanchor(); } else farCount = 0;   // 0.5 s of confirms
```
- The input clock advances by `dt × timeScale`. A 3% change is imperceptible; Overwatch dilated about 5% [R].
- **Why it is stable [derived].**
  - Rate gain = 0.01 × 60 = 0.6 s⁻¹.
  - Measurement lag = half of the 0.5 s window + downlink + confirm interval ≈ 0.35–0.5 s.
  - Gain × delay ≤ 0.3, so it is well damped. v1's p2 over 2 s at gain 0.02 was ≈ 1.3, which rings.
  - GGPO likewise rate-limits time-sync corrections (`RECOMMENDATION_INTERVAL` 240 frames), and Unity corrects 10% of the error per frame towards a fixed slack [R].
- **Expected margin:** `m ≈ 6 ms + 2·J_up`. With Gaussian-like jitter, fewer than 1% of inputs are late; stalls are covered by the hold (§2.4).
- No GGPO-style frame skipping (it stutters) [R].

### 4.4 Input delay D (client-side, fixed per fight)

| effRTT at lock | D auto | Typical RTT |
|---|---|---|
| < 60 ms | 1 | 20 ms |
| 60–130 | 2 | 80 ms |
| 130–210 | 3 | 150 ms |
| 210–270 | 4 | 250 ms |
| 270–340 | 5 | 300 ms |
| 340–420 | 6 | 380 ms |
| ≥ 420 | 7 | 450 ms+ |

- **Setting "입력 반응":** 반응 우선 (D − 1) / 표준 / 부드럽게 (D + 1). The result is clamped to `[0, min(8, ceil(effRTT/T))]`, since a larger D only puts the client behind the confirm stream.
- **PvE, hot-seat and offline:** D = 0. **Never change D mid-fight,** including across a reconnect.
- **effRTT ≥ 500 ms at lock:** see open item O7.

### 4.5 Prediction window and caps
- **`inputTick`** advances with the lead clock and stamps own masks at `inputTick + D`. It never stops while the page is visible.
- **`simTick`** advances toward `inputTick`, but never beyond `confirmedTick + HARD_CAP` (PvP 40, PvE 120).
- **At the cap** (usually a downlink stall):
  - The screen freezes; inputs keep being stamped and sent.
  - On recovery, re-simulate with ≤ 60 steps per frame.
  - Snap the visuals (§5.6). After 250 ms of freeze, show "내 연결 불안정".
- **Fast-forward.** If confirms are ahead of `simTick`, step the confirmed inputs directly, ≤ 600 ticks per frame. Beyond that: `requestSync('gap')`.
- **Overflow.** If `inputTick − confirmedTick > 480`: `requestSync('overflow')`.

### 4.6 Visibility
- **Hidden** (`visibilitychange`, `pagehide`):
  - Send `fight:away` and release all keys.
  - Stop rendering.
  - The server hands the seat to the bot from the first unaccepted tick, for at least 3 s (§6.6).
  - Note: Chrome on Windows also reports `hidden` for a fully covered window [R].
- **Visible:**
  - Ping burst, reset the accumulator, send `fight:back`.
  - Fast-forward if the stream is contiguous, otherwise sync.
  - Show the own seat as bot-driven until `fight:control { human, fromTick }`.
  - Never simulate the missed time from local inputs.
- **Window blur while visible:** release keys only.
- **Spectators:** hidden means stop playback; visible means fast-forward or sync.

### 4.7 Dead-link watchdog and reconnect
- **Watchdog.** If the client is in a fight and visible, and no `fight:*` message has arrived for 1000 ms: `socket.disconnect(); socket.connect()`. Do not wait 15 s for the heartbeat.
  - During a fight, reconnection backoff is 250 ms initial and 2000 ms max. The Socket.IO defaults are 1000 / 5000 ms with randomization 0.5 [R].
- **Server.** A disconnect is treated as `away`. On reconnect (session token), `GameSession` re-binds the seat and `FightRoom` re-binds the fight socket. It then sends `fight:start` (you = fighter) and `fight:go` (same epoch).
- **Client.** It creates a fresh session with the same D and sends `requestSync('join')`. The handback is self-clocked (§6.6).

---

## 5. Client architecture

### 5.1 Modules
All core logic is pure: no DOM, injected `now()` and `FightTransport`, so it runs unchanged in Vitest.
- **`packages/combat-net`** (new; open item O1):
  - `predict.ts`, `clock.ts`, `leadController.ts`, `stats.ts`
  - `client/rollbackSession.ts`: rings, rollback, fast-forward, `promoteConfirmed`
  - `client/eventReconciler.ts`
  - `spectator.ts`, `authority.ts`, `netsim/`
- **`apps/web/src/services/fight/`:**
  - the `FightClient` port with `OnlineFightClient` and `LocalFightClient`
  - `socketFightTransport.ts`
  - `inputLatch.ts` (keyboard and gamepad, SOCD, timestamps)
- **Rendering** is a canvas through refs, driven by the existing single rAF loop (`web/src/fx/runtime/fxRuntime.ts`): fight step, then FX, then draw.
  - Per-tick state never goes through React or Zustand. The HUD store gets changed values only, at ≤ 10 Hz.
  - Views: `NetIndicators.tsx`, `NetDebugOverlay.tsx`, `NetSimPanel.tsx` (dev only).

### 5.2 Data structures
```ts
interface TickSlot { tick: number; state: CombatState; used: [number, number]; events: readonly CombatEvent[] } // state produced by `tick`
class StateRing { /* 128 slots, tick & 127, slot.tick guards wrap; retains confirmedTick..simTick (cap 120 + 1) */ }
class SeatInputs {                 // one per seat; 512 slots so a freeze cannot overwrite unconfirmed masks
  mask: Int16Array(512); kind: Uint8Array(512);   // -1 unknown; kind 0 predicted, 1 real, 2 confirmed-subst, 3 bot
  substRun: Uint8Array(512);       // run length for confirmed substitutions
  lastReal: { tick: number; mask: number };        // explicit, never searched in the ring
  inputFor(t: number): number { /* §2.3 */ }
}
```
- The own seat stores its own stamped masks as real until a confirm overrides them, **unless** the seat is bot-controlled. In that case the own seat behaves like a remote seat (relayed bot masks plus prediction).
- Ring slots hold immutable states (`stepCombat` clones its working copy). The hand-written clone costs ≤ 1 µs.

### 5.3 Per-frame loop
```ts
function frame(nowMs: number) {
  const dt = Math.min(nowMs - last, 250); last = nowMs;              // Fix Your Timestep clamp
  net.drain();                     // store masks/flags/hashes, set rollbackFrom, handle sync; NEVER reads ring states
  acc += dt * lead.timeScale;
  let produced = 0;
  while (acc >= T && produced < 5) {                                  // MAX_STEPS_PER_FRAME
    acc -= T; produced++; inputTick++;
    own.set(inputTick + D, latch.consumeTick(tickBoundaryMs(produced))); // presses bucketed by event.timeStamp
  }
  if (acc >= 5 * T) lead.reanchor();                                  // far behind: never spiral
  if (produced) transport.send(encodeInput(fightId, inputTick + D, ackTick, own.newest(Math.max(4, produced))));
  if (confirmHead > simTick) fastForward();                           // §4.5
  if (rollbackFrom <= simTick) resimulate(rollbackFrom);              // §5.4
  const target = Math.min(inputTick, confirmedHead + HARD_CAP);
  for (let n = 0; simTick < target && n < 60; n++) stepInto(simTick + 1);
  promoteConfirmed();                                                 // §5.4: hashes, event tiers, HP, terminal
  stats.frame(simTick < inputTick);
  render(simTick >= inputTick ? acc / T : 1);                         // alpha; tolerates simTick > inputTick
  view.reconcile();                                                   // §5.6, §5.7
}
```
- **Input latch:**
  - `keydown` sets `held` and `pressed`; `keyup` clears `held`. Auto-repeat is harmless, because edges come from levels.
  - `consumeTick()` returns `held | pressed`, then clears `pressed`. A tap shorter than a tick is never lost.
  - When a frame produces several ticks, a press goes to the tick whose boundary follows its `event.timeStamp` [R].
  - SOCD (O8) is resolved before `inputToMask`.

### 5.4 Applying network data
- **`fight:relay` (seat s):**
  1. Store masks with tick > confirmedTick as real (or bot, per the controller).
  2. Scan from the oldest new tick to `simTick`; the first t where `inputFor(s, t) !== ring[t].used[s]` sets `rollbackFrom = min(rollbackFrom, t)`. New real masks also change later predictions, so the scan is needed.
- **`fight:confirm`:**
  - Ingest is idempotent: ticks ≤ the highest confirm already received are ignored; a gap leads to `requestSync('gap')`.
  - Store both masks with their flags. A mismatch with `used` sets `rollbackFrom`; this includes the own seat when the server substituted it (an "eaten" input, counted).
  - Store `serverHash[hashTick]`. Feed `slackMedMs` and `jitUpMs` to the lead controller and `quality` to the UI.
  - Raise `confirmHead`.
- **`resimulate(from)`:**
  1. Record the render positions at simTick.
  2. Take `s = ring[from − 1].state`; for t = from…simTick, step with `[maskToInput(inputFor(0, t)), maskToInput(inputFor(1, t))]` and rewrite slot t.
  3. Pass the old and new positions to smoothing (§5.6) and the old and new events to the reconciler (§5.7).
  4. `from ≥ confirmedTick + 1` always, so the base slot is retained.
- **`promoteConfirmed()`** is the only place that treats a slot as authoritative. It runs after any re-simulation, fast-forward or sync. For t = lastPromoted + 1 … min(confirmHead, simTick):
  - mark t confirmed and set `confirmedTick = t`;
  - if t % 30 = 0: `localHash[t] = hashCombatState(ring[t].state)`;
  - if `serverHash[t]` exists and differs: `requestSync('desync', t, localHash[t])`;
  - confirm t's events, set confirmed HP, and if t is terminal, enter the confirmed-KO tier (§5.7).
  - Hash maps are pruned beyond 300 ticks; a hash is compared when both sides exist, in either order.
- **`fight:sync`:**
  1. Replace the ring with `deserializeCombatState(state, rules)` at `tick`. Set the seat tables from `seats` and `pending`, and `confirmedTick = simTick = lastPromoted = tick`.
  2. Fast-forward to `inputTick` on predictions.
  3. Snap all visual offsets.

### 5.5 Render interpolation (120/144 Hz)
- Draw `lerp(ring[simTick − 1], ring[simTick], alpha)` for positions (Q8 → px), plus the smoothing offsets. Discrete values (animation frame, telegraph fill) come from simTick.
- Without interpolation, high-refresh screens judder.
- During a freeze, or when simTick ≥ inputTick, alpha = 1.
- iOS Low Power Mode at 30 Hz rAF is fine: 2 ticks per frame.

### 5.6 Visual smoothing (render only; never fed back into the sim or hitboxes)
- **On any re-simulation,** for each entity matched before and after (§5.7 matching): `offset += pre − post`.
  - This includes **the own fighter**, whose position depends on the opponent through global hitstop, body push, knockback and parry.
- **Snap** (offset = 0) if `|offset| > 48 px`, or on a category change: dash or blink start, knockback start, KO, spawn or despawn, sync, freeze recovery.
- **Decay per frame,** frame-rate independent (`pow(k, dt·60/1000)`):
  - remote entities: k = 0.90 while |offset| ≤ 6 px, else 0.80;
  - own fighter: k = 0.75;
  - zero below 0.25 px.
  - **Exception:** an entity in an active hit frame uses k = 0.6, so contact looks connected.
- **The camera** follows the smoothed own position.
- **Projectile catch-up:** a remote projectile first seen at age a is drawn from the muzzle and closes its offset over 5 frames.
- Hitstop and the movement acceleration curves hide most pops; Quantum also calls easing in movement the most useful fix [R]. Open item O6 (dash anticipation) shrinks the largest pop.

### 5.7 Event reconciliation and confirmation tiers [derived]
- **Matching after a re-simulation of [from, simTick]** (old = table entries with tick ≥ from; new = re-emitted events):
  1. Exact match on the sim's event `id` (`${tick}:${type}:${key}` in the WIP sim): keep.
  2. **Signature match:** `sig` = type + actor + move/kind/skill + target + hit index. It is computed by the view from the event body, with ticks and entity ids stripped.
     - An unmatched new event rebinds to the closest unmatched old entry with the same `sig` and |Δtick| ≤ 6.
     - A rebind moves the spark and number and updates the tick. It **never replays**.
  3. **Unmatched new:** play the SFX and sparks if `simTick − tick ≤ 7` (117 ms, within art-direction's 125 ms sync rule); otherwise apply persistent state only.
     - If it is a hit with `simTick − tick ≥ hitstop/2`, play a presentation-only **impact pulse** (flash, trauma, SFX, 50 ms, no freeze), so late hits keep their weight.
  4. **Unmatched old (vanished):** fade the sound over 100 ms and the sparks and damage numbers over 150 ms. No "undo" animation.
- **Entity views match the same way.** First by id, then by (owner, slot kind, spawn tick ±6), with spawn tick = `floor(id / 256)` from the WIP `entityId`.
- Sounds and effects are never triggered from inside `stepCombat`; only the reconciler emits them.
- Photon Quantum's event model is the reference: predicted events are confirmed or cancelled, and synced events wait for confirmation [R].

**Tiers:**

| Thing | When shown |
|---|---|
| Hit spark, hit SFX, hitstop flash, camera trauma, telegraph visuals | On prediction |
| HP bar | Main bar = predicted HP. A pale hatched "pending" segment covers the gap to confirmed HP and shrinks at promotion |
| KO / dragon slain | Predicted terminal: presentation-only impact freeze (350 ms; 500 ms for the dragon), **no KO text and no KO stinger**. Confirmed terminal (promotion): KO banner, KO stinger, slow-motion, then the result card after `fight:end`. If unconfirmed when the freeze ends: hold up to 1.5 s more with "판정 확인 중", then keep holding. If rolled back: unfreeze within 1 frame and count a "phantom KO" |
| Board write-back | Only through the server: `fight:end` → `applyCombatResult` → `game:update` |

- After a predicted KO the client keeps stamping inputs (the sim ignores input on a terminal state) until confirmation.
- The worst steady-state confirm latency (≈ 267 ms at 300 ms RTT) fits inside the 350 ms freeze.

### 5.8 Spectator playback (`spectator.ts`)
- Subscribe to `fight:confirm`; play the sim on confirmed inputs at `playTick`. Send `fight:ack` at 4 Hz.
- **Buffer:** `B = clamp(3 + ceil(1.25·p97Jitter/T) + 2, 6, 15)` ticks (default 9). B ≥ PVP_HOLD, so a stall hold never underruns a healthy spectator.
- Adapt with playback rate 0.95–1.05. On underrun, hold the frame. If more than B + 30 behind, catch up at 2×.
- **Join:**
  - Any socket that enters the room during a fight gets `fight:start` + `fight:go`, then sends `requestSync('join')`.
  - The server serializes the sync and adds the socket to the confirm broadcast in the **same JS turn**.
  - Ingest is idempotent, so a batch that overlaps the sync tick is harmless.
- Hash checks run through the same `promoteConfirmed`.
- **Backlog:** handled by the server (§6.7). On `fight:sync { reason: 'backlog' }` the spectator snaps forward.

### 5.9 UI indicators

| Where | What |
|---|---|
| Board avatars, VS screen | Connection bars (5 to 0) at effRTT < 50 / 90 / 140 / 200 / 300 / ≥ 300 ms, plus the ms number. VS also shows "입력 지연 2F" |
| In the fight, only at warning or critical | Three distinct icons, each with shape + text + number, never colour alone (XAG 103): **내 연결**, **상대 연결 불안정** (server `quality` bits), **기기 성능** (frame-time p95 > 20 ms or re-sim > 4 ms per frame). "AI 대행" comes from the bot flags |
| Thresholds (enter after 1 s, clear after 3 s) | **Warning:** effRTT ≥ 200 ms, or own eaten > 2%, or jitter > 40 ms, or holds > 3/10 s. **Critical:** effRTT ≥ 300 ms for 3 s, or eaten > 8%, or freeze or starvation > 500 ms, or downlink backlog > 60 ticks |
| Debug overlay (F3 / backquote; dev builds + an advanced setting) | RTT and jitter sparkline, depth per frame, re-sim ms, timeScale, slackMed / target, jitUp, D, eaten per minute, holds, freezes, desyncs, rebinds, `simTick − confirmedTick` |
| After the fight | "연결 상태가 이번 전투에 영향을 줬습니다" if any critical period occurred |

Icons are static or pulse at ≤ 1 Hz (WCAG 2.3.1) and honour `prefers-reduced-motion`.

---

## 6. Server architecture

### 6.1 Modules and the global loop
- **`packages/combat-net/src/authority.ts` — `FightAuthority`** (pure, injected clock): input buffers, the step rule with holds, commit-before-reveal relay, slack and jitter statistics, starvation clocks, the hash schedule, controllers.
- **`apps/server/src/fight/`:**
  - `FightScheduler.ts` (one global loop, running only while ≥ 1 fight exists)
  - `FightRoom.ts` (shell: authority + sockets + bot driver + telemetry + backlog)
  - `fightGateway.ts`
  - `fightBots.ts`
- **Loop** (never `setInterval`; it ran at 46.6 Hz on a Windows dev box):
```ts
function wake() {
  const now = performance.now();
  const late = now - plannedMs > 2 * T;
  plannedMs = nextBoundary(now);
  if (late) { lateWake = true; setImmediate(stepAll); return; }     // let one poll phase drain socket input first
  stepAll();
}
function stepAll() {
  const W = wallTick(performance.now());
  for (const room of rooms) room.authority.advanceTo(W, { maxSteps: 120, lateWake });   // steps k ≤ W per §2.4
  for (const room of rooms) room.flush();                            // one relay/confirm batch per socket
  lateWake = false;
  const ms = plannedMs - performance.now();
  if (ms > 2) setTimeout(wake, ms - 1); else setImmediate(wake);
}
```
- **Why the I/O hop.** Node runs `setImmediate` callbacks after the poll phase, and since libuv 1.45 (Node ≥ 20) timers also run after poll. A late wake therefore yields once, so inputs that arrived during a JS stall are parsed before any tick is judged missing [R].
- **No dropped time.** Each fight steps to W. If a fight is more than 120 ticks behind after a wake (a server stall > 2 s), shift its epoch by the deficit, send `fight:retime`, and count an overrun.
- Arrivals processed during a late wake are excluded from slack statistics and eaten counts.
- Monitor `perf_hooks.monitorEventLoopDelay`. If p99 > 4 ms, move board-model inference to `worker_threads`.

### 6.2 `FightAuthority.advanceTo(W)`, per tick k
```ts
while (fightTick < W && steps++ < maxSteps) {
  const k = fightTick + 1;
  if (!allCommittedOrExpired(k, W)) break;                 // stall hold (§2.4); PvE: W >= k + H
  const masks = [0, 0]; let flags = 0;
  for (const s of [0, 1]) {
    if (controller[s] === 'bot') { masks[s] = botMask(s, k); flags |= BOT << s; lastReal[s] = { tick: k, mask: masks[s] }; run[s] = 0; }
    else if (buf[s].has(k)) { masks[s] = buf[s].get(k)!; lastReal[s] = { tick: k, mask: masks[s] }; run[s] = 0; }
    else { run[s]++; masks[s] = substitute(lastReal[s].mask, run[s]); flags |= SUBST << s; stats.eaten[s]++; }
    if (heldFor[s] === k) flags |= HELD;
  }
  ({ state } = stepCombat(state, [maskToInput(masks[0]), maskToInput(masks[1])]));
  fightTick = k; log.push(k, masks[0], masks[1], flags);
  if (k % 30 === 0) hashes.set(k, hashCombatState(state));
  if (state.outcome) { endFight(k); break; }
}
```
- The input log (2 B per seat per tick + flags) is kept for the whole fight: it feeds the replay, `fight:sync` and telemetry.

### 6.3 Input acceptance and relay
- The seat comes from the socket. Spectator inputs are rejected.
- Messages with an unknown or tombstoned fightId are dropped silently.
- Masks are accepted for ticks in `[fightTick + 1, W + 30]` if the slot is empty (first write wins) and `isValidMask` passes.
  - Ticks further ahead are rejected and flagged (speed hack).
  - Late masks (≤ fightTick) are dropped and counted; they still give a slack sample unless in a late wake.
- On accept:
  1. Record slack and jitter (§4.3).
  2. Flush every newly revealable mask of **both** seats (§2.4) as `fight:relay` contiguous runs.
- **Rate buckets** per socket: `fight:input` 120/s (burst 60), `fight:ping` 20/s, `fight:ack` 10/s, other `fight:*` 10/s; at most 1 `requestSync` per 500 ms. Excess is dropped and counted.

### 6.4 Bots (server-side inputs)
- The bot driver runs the combat `Policy` exactly as in training (combat-ai-spec §3):
  - a decision every 4 **live** ticks (hitstop ticks are not counted, and no decision is requested during hitstop);
  - observations from a per-fight ring of the last 32 states, at the difficulty's `delay`;
  - masks from the current state;
  - the policy's own seeded stream.
  - "AI 대행" uses Normal; bot seats use the room difficulty.
- Bot masks are converted with `inputToMask` and revealed to both fighters as soon as they are computed.
- **Lookahead (open item O2):** if decisions used only state ≤ t − delay, the server could reveal them `delay` ticks early, and humans would almost never mispredict bots. This needs the action mask from the delayed state, which changes the training contract.

### 6.5 Desync detection and recovery
- The server puts its hash in the confirm every 30 ticks. Clients and spectators compare in `promoteConfirmed()` only (§5.4).
- On `requestSync('desync')`:
  1. Send `fight:sync`.
  2. Log `{ seed, setup, rulesHash, input log, tick, both hashes, userAgent, combatBuildId }` as a P1 determinism bug.
- **After 3 desyncs** for one socket in one fight, push `fight:sync` every 30 ticks for the rest of the fight (degraded mode, about 6 KB/s).
- A mismatch never changes server state. A rules or pack mismatch at `fight:start` never reaches this path (§3.5).

### 6.6 Starvation, disconnect, control handover (no pauses)

| Condition (per human seat) | Action |
|---|---|
| Mask for k missing at W ≥ k, stream alive, no expired hold this episode | Hold ≤ 6 ticks (flag HELD) |
| Hold expired, or stream not alive | `substitute` (SUBST). The opponent's client mirrors it once it sees the flag (§2.3) |
| No arrival for 750 ms (socket up, visible) | quality = critical → the opponent sees "상대 연결 불안정" |
| No arrival for 1.5 s, or socket disconnect, or `fight:away` | Bot from `takeoverTick = max(fightTick + 1, lastAcceptedTick + 1)`, so accepted and revealed masks are never revoked. Send `fight:control { bot, fromTick: takeoverTick }`. Minimum tenure 180 ticks (3 s) |
| Tenure over, and (`fight:back`, reconnect + sync, or inputs resume) | **Self-clocked handback:** the first k > fightTick with masks for k, k+1, k+2 already buffered. Send `fight:control { human, fromTick: k }` immediately. Masks stamped earlier are stored but unused |
| Page reload | `fight:start` + `fight:go` to the new socket, then `fight:sync` on request |

- Away episodes per fight are counted in telemetry. More than 3 in one fight is flagged.
- The board reconnect grace (architecture §8.3) remains separate.

### 6.7 Downlink backlog control [derived]
- Socket.IO never drops normal emits, and engine.io's `writeBuffer` is private, so the server measures backlog with app-level acks [R].
  - **Fighters:** `backlog = lastSentConfirmTick − ackConfirmTick` (from `fight:input`).
  - **Spectators:** the same from `fight:ack`.
- **Spectator:** backlog > 90 ticks → stop sending confirms to that socket. When its ack catches up to within 10 ticks of the last sent, send `fight:sync { reason: 'backlog' }` and resume.
- **Fighter:**
  - backlog > 60 → quality critical for that seat;
  - backlog > 180 (3 s) → disconnect the socket. The reconnect path (§4.7) resets the queue, and meanwhile the bot rule applies.

### 6.8 PvE specifics and anti-cheat bounds
- **PvE hold** H = 15 ticks (250 ms, Unreal's ±0.25 s margin). The server never steps k before W ≥ k.
  - **Bullet time:** a modified client can delay its commitment by about H + m ticks at most (O4).
  - The combat RNG on clients reveals dragon picks (O5).
- **Inputs:** 7-bit masks only, `isValidMask`, the tick window, n ≤ 16, first-write-wins, rate buckets.
- **Authority:** HP, KO, outcome and board results come only from the server sim; client hashes are never trusted.
- **Lag switch:** gains nothing (hold, substitution, bot). **Away spam:** limited by the 3 s tenure.
- **Lookahead:** none by construction (commit-before-reveal).
- **Statistical flags** (offline, from replays):
  - reaction time under 120 ms from an opponent's revealed press (PvP) or a telegraph start (PvE);
  - inputs that always arrive just before the deadline while input changes correlate with the opponent's revealed changes.

### 6.9 End of fight → board
1. At the terminal tick (KO or time limit inside the sim), flush the final confirm, then send `fight:end { endTick, outcome, finalHash }`. Tombstone the fightId for 10 s.
2. `combatResult(state)` → `GameSession.submitCombatResult(fightId, result)`, the single path from architecture §12.2. It is keyed by fightId, not `stateVersion`, so unrelated board changes during the fight cannot reject it. Then `applyCombatResult` → `game:update`, and `TurnTimer` resumes.
3. Store the replay `{ seed, setup, rules, inputs ×2 (RLE), flags, outcome, hash }`.
4. Clients stop sending inputs. If `fight:end` is more than 600 ticks ahead of the client, it shows the result without simulating. Otherwise it plays the result card and queues the board update through `eventTimeline`.

### 6.10 Telemetry (structured stderr JSON per fight)
- kind, rulesHash, combatBuildId;
- per seat: D, SRTT, RTTVAR, slackMed and target, jitUp;
- eaten per minute, holds (applied and expired), late histogram, input-stall events (the Phase 2 gate);
- starvation episodes, bot takeovers, away episodes, desync requests, backlog events, late wakes, retimes, overruns;
- optional client `fight:stats`.

---

## 7. Requirements on `packages/combat` (the netcode depends on these)
1. **API.** `createCombat(setup, seed, rules)` and `stepCombat(state, [FighterInput, FighterInput?]) → { state, events }`.
   - Pure and deterministic.
   - Stepping a terminal state returns the same state and no events (the WIP sim already does this).
2. **Input module** (§2.2): `maskToInput`, `inputToMask`, `isValidMask`, `MOVE_NIBBLE`, `BTN_*`. Edges, the 6-tick buffer (aging only on live ticks), chain flags and the archer draw are derived inside the sim from `held` (the WIP `readInput`).
3. **Stable ids.**
   - Entity ids depend only on (spawn tick, owner, slot) (WIP `entityId`).
   - Event ids are `${tick}:${type}:${key}` and are unique within a tick; a dev assertion checks this.
   - Event bodies carry the actor, move or kind, target and hit index, so the view can derive `sig`.
4. **Helpers:**
   - `cloneCombatState` (≤ 1 µs);
   - `hashCombatState` (FNV-1a over canonical packed integers, never key iteration) [R];
   - `serializeCombatState` / `deserializeCombatState(data, rules)` (`number[]`, ≤ 4 KB as JSON);
   - `hashCombatRules`, `COMBAT_PACK_VERSION`, `combatResult`.
   - Packing normalizes with `| 0`, so `-0` never appears. A Phase 2 binary codec uses `DataView` little-endian.
5. **Lint** (in addition to the existing bans on transcendental `Math.*`, `**`, `Math.random` and `Date`): ban `.sort(` and `Map`/`Set` iteration, `for…in`, and `Object.keys/values/entries` in the step path. The WIP sim is clean today.
6. **Performance:** `stepCombat` p99 ≤ 20 µs on Node CI and ≤ 100 µs on a mid phone.
7. **The dragon** draws only from `state.rng` (option A), or from the directive stream if O5 option B is chosen.

---

## 8. Testing plan

### 8.1 Network simulator (`packages/combat-net/src/netsim/`)
```ts
export interface NetProfile { oneWayMs: number; jitterMs: number; lossPct: number; mode: 'tcp' | 'datagram';
  spike?: { everyMs: number; durationMs: number }; clockRate?: number; bandwidthBps?: number; seed: number }
export function deliveryAt(now: number, lastRelease: number, bytes: number, p: NetProfile, rng: () => number): number | null {
  let t = now + p.oneWayMs + (rng() * 2 - 1) * p.jitterMs;
  if (rng() * 100 < p.lossPct) {
    if (p.mode === 'datagram') return null;                                  // real drop (Phase 2)
    const rtt = 2 * p.oneWayMs; t += rng() < 0.8 ? rtt + 50 : Math.max(200, 2 * rtt); // fast retransmit vs RTO
  }
  if (p.spike && now % p.spike.everyMs < p.spike.durationMs) t = Math.max(t, now - (now % p.spike.everyMs) + p.spike.durationMs + p.oneWayMs);
  if (p.bandwidthBps) t = Math.max(t, lastRelease + (bytes * 8 * 1000) / p.bandwidthBps); // serialization queue
  return p.mode === 'tcp' ? Math.max(t, lastRelease) : t;                  // in-order release = head-of-line blocking
}
```
- **Implementations:** `VirtualClock` + `VirtualLink` (min-heap) for Vitest, and `NetSimTransport`, a decorator around the real transport (client and server).
- **Server stall injection:** `VirtualClock.blockServer(ms)` queues arrivals without delivering them, which models a JS stall.
- **Why our own:** DevTools has no WebSocket jitter or loss, its "Offline" mode pauses a socket instead of dropping it, and Firefox does not throttle WebSockets at all [R].

### 8.2 Vitest in-process matrix (`packages/combat-net/test/netMatrix.test.ts`, every PR)
**Harness:** `FightAuthority` + 2 `RollbackSession`s + 1 `SpectatorPlayback` on the virtual clock. Inputs come from a seeded human-like script: direction change about 5/s, attack about 2/s, dash about every 2 s, archer holds, SOCD presses.

**Every scenario asserts:**
- `desyncs === 0`;
- the final hash is equal at the server, A, B and the spectator;
- no spurious rollbacks;
- no ring overflow;
- **no false desync requests**.

| Scenario (RTT A / B, jitter, loss, tcp) | Extra assertions |
|---|---|
| LAN 10/10, 0, 0 | Max depth ≤ 2; eaten = 0 |
| Good 30/30, ±5, 0 | Depth p95 ≤ 3; eaten = 0 |
| Typical 80/80, ±15, 0.5% | Depth median ≤ 3, p95 ≤ 6; eaten ≤ 1/min; **lead std ≤ 0.7 tick; \|timeScale − 1\| ≤ 0.03 for ≥ 95% of frames** |
| Bad 150/150, ±20, 1% | Median ≤ 6, p95 ≤ 10; eaten ≤ 3/min; holds ≤ 20/min |
| Awful 250/250, ±40, 2% | Median ≤ 11, p95 ≤ 16; freezes ≤ 1/min; **remote position bias while walking ≤ 2 px (no decay artefact)** |
| Very high 400/400, ±50, 0% | D ∈ {6, 7}; p95 ≤ 22; freezes ≤ 1/min |
| Asymmetric 20 / 200 | A's p95 ≤ 3; B's p95 ≤ 14 |
| B uplink spike 400 ms every 20 s | A gets no extra rollbacks; the lead re-established ≤ 2 s; no re-anchor |
| B clock drift 1.005 | Median lead error ≤ 1 tick; late rate does not grow |
| **Server stall 300 ms every 10 s** | eaten = 0; no retime; no slack samples recorded during late wakes |
| **Server stall 3 s** | retime once; hashes equal |
| **Heavy misprediction** (both change input every 3 ticks, relays bunched with confirms) | 0 desync requests |
| B disconnect 5 s, then reconnect | Bot from `lastAccepted + 1`; A gets no rollback at takeover; sync; handback self-clocked; tenure ≥ 3 s |
| **Away/back spam ×5 in 10 s** | Each bot tenure ≥ 180 ticks; flagged |
| PvE 150, ±20, 1% | **Own corrections = 0**; dragon bit-identical |
| PvE uplink spike 600 ms (> H) | A correction happens and converges; no desync |
| **Spectator downlink 20 KB/s + 2 s stall** | Spectator backlog resync ≤ 1 per stall; server queue bounded |
| **Spectator joins at an odd tick** | No gap; no duplicate tick |
| **Rules mismatch** (client knob changed) | The fight aborts at start with an explicit error; no desync path |
| Spectator in every row | Never rolls back; no freeze > 100 ms at ≤ 1% loss |

Thresholds are starting points; tighten them after the first baselines.

### 8.3 Other unit suites
- **SyncTest** (in `packages/combat`): every tick, roll back k ∈ 1…8 at random, re-simulate and compare hashes, over 45 s PvP and 75 s PvE scripts. fast-check seeds are printed for replay [R].
- **Event reconciler:** a 1-tick shift of an attack or projectile hit gives exactly 1 sound play and 0 vanish fades. A rolled-back phantom hit fades. A late hit gets the impact pulse.
- **Smoothing:** a predicted hit that is rolled back moves the own fighter ≤ 6 px per frame (unless it snaps).
- **Codec:** array ↔ bytes round-trip. Fuzz all 256 mask byte values: invalid nibble → `null`; `maskToInput` agrees with the bots.
- **Prediction:** client prediction equals server substitution for every SUBST run after the flag is seen.
- **Clock and lead:** offset convergence under asymmetric jitter; the step response shows overshoot ≤ 20% and no sustained oscillation under TCP-stall bursts.
- **Bench** (`vitest bench`): `stepCombat` p99 ≤ 20 µs; re-simulating 40 ticks ≤ 1 ms; `hashCombatState` ≤ 5 µs.

### 8.4 Dev network-conditions panel (web)
- **`NetSimPanel`** (dev builds or `?netdebug=1`):
  - Presets: LAN, Good, Typical, Bad, Awful, Very high (400 ±50), Spike, Low-bandwidth spectator.
  - Sliders per direction: one-way, jitter, loss, mode, bandwidth.
- **Server side:** env `NETSIM=ow:75,jit:15,loss:1`, plus a dev-only per-socket admin event. It refuses to run when `NODE_ENV === 'production'` unless `DEV_NETSIM` is set.
- **"Typical" is on by default in `pnpm dev`,** with a visible badge. This follows Killer Instinct's QA practice [R].

### 8.5 Playwright (new dev dependency, O3)
- **`e2e/determinism.spec.ts`** (every PR): golden replays `{ seed, setup, rules, inputs, hash every 60 ticks }` run in Chromium, Firefox and WebKit, and must equal the Node run.
- **`e2e/duel-latency.spec.ts`** (nightly, Chromium; Firefox and WebKit weekly):
  - 2 fighters + 1 spectator.
  - Fighter A goes through `page.routeWebSocket` with an ordered delay queue (75 ±10 ms).
  - Inputs come from the seeded `window.__duel` hook.
  - Assert the fight ends, hashes are equal, desyncs = 0, and depth is within bounds.
- **Manual QA:** clumsy on Windows, `tc netem` in the container, and the timer bench in the production container.

---

## 9. Defaults table

| Parameter | Default |
|---|---|
| Tick | 60 Hz, T = 16.667 ms; input k is consumed by the step that produces state k |
| Mask | `move(0..8) \| attack<<4 \| skill<<5 \| dash<<6`; SOCD in the latch (last-pressed wins per axis, O8) |
| PvP step | W ≥ k and all human seats committed, or hold expired |
| PvP stall hold | 6 ticks, if the stream is alive (packet ≤ 250 ms ago) and no expired hold this episode |
| PvE hold H | 15 ticks |
| Relay | Commit-before-reveal; bot masks at once to both fighters |
| Max ahead accepted | W + 30 ticks |
| Input delay D | effRTT < 60 → 1, < 130 → 2, < 210 → 3, < 270 → 4, < 340 → 5, < 420 → 6, else 7. Setting ±1, clamp [0, min(8, ⌈effRTT/T⌉)]. Fixed per fight. PvE/local 0 |
| Substitution | Repeat the last real mask for a run ≤ 10, then clear move, keep buttons |
| Client prediction | Pure repeat while healthy; mirror substitution after a SUBST flag |
| Lead target | Median slack (0.5 s, 30 samples) ≥ 6 ms + 2·jitUp (cap 60) |
| Time dilation | Gain 0.01 per tick of error; dead band ±0.5; ±3% (±5% beyond 4 ticks); re-anchor if \|err\| > 10 for 0.5 s; jumps allowed in the pre-roll |
| Rings | State 128; inputs 512; sync if `inputTick − confirmedTick > 480` |
| Hard cap | PvP 40, PvE 120 ticks |
| Steps per frame | 5 input ticks; 60 sim catch-up; fast-forward ≤ 600 per frame |
| Frame dt clamp | 250 ms |
| Input packet | Newest max(4, new) masks, ≤ 16, once per frame that produced ticks |
| Confirm | Every 2 stepped ticks; hash every 30 ticks; verified only in `promoteConfirmed` |
| Smoothing | Remote ×0.90 (≤ 6 px) / ×0.80; own ×0.75; active hit frame ×0.6; snap > 48 px or on a category change |
| Event matching | Exact id, then signature within ±6 ticks; SFX late window 7 ticks; vanish fade 100/150 ms; impact pulse if ≥ half the hitstop is past |
| KO | Presentation freeze 350 ms (dragon 500 ms) with no text or stinger; then "판정 확인 중" up to 1.5 s |
| Spectator buffer | clamp(3 + ⌈1.25·p97J/T⌉ + 2, 6, 15), default 9; rate 0.95–1.05; 2× catch-up above B + 30; ack at 4 Hz |
| Backlog | Spectator > 90 ticks: pause and resync. Fighter > 60: critical; > 180: disconnect |
| Clock filter | 16 samples, 4 lowest-delay, median; slew ≤ 2 ms per sample; snap > 100 ms |
| Pings | Burst 8 × 50 ms (start, reconnect, visible); 2 Hz in a fight, 0.5 Hz on the board |
| Starvation | 750 ms → critical; 1.5 s → bot. Disconnect or away → bot from `max(fightTick, lastAccepted) + 1`. Tenure 3 s. Self-clocked handback (3 buffered ticks) |
| Watchdog | No `fight:*` message for 1 s while visible → reconnect; backoff 250 → 2000 ms |
| Start | `fight:go` when both ready, or t0 + 6 s; epoch = max(t0 + 2.8 s, tGo + 1.6 s) |
| Desync | requestSync (≤ 1 per 500 ms); 3 per fight → sync every 30 ticks |
| Server loop | Runs while fights exist; hrtime-free (`performance.now()`); `setTimeout(ms − 1)` then `setImmediate`; I/O hop on a late wake; step to W; retime if > 120 ticks behind |
| Socket.IO | websocket only; ping 10 s / timeout 5 s; no deflate; no volatile; flat integer arrays |
| Rate buckets | input 120/s (burst 60); ping 20/s; ack 10/s; other fight messages 10/s |
| fightId | u32, per-process monotonic; tombstone 10 s |

## 10. Acceptance targets
"RTT" means the round trip to the game server.

| Condition | Target |
|---|---|
| ≤ 80 ms ±15, 0.5% loss | Depth median ≤ 3, p95 ≤ 5; eaten ≤ 1/min; snaps ≤ 1/min; no freezes; lead std ≤ 0.7 tick |
| **150 ms ±20, 0% loss: "playable feel"** | Depth median ≤ 6, p95 ≤ 9; snaps ≤ 6/min; no freezes; playtest rating "fine" from ≥ 4 of 5 testers |
| **250 ms ±40, 2% loss: graceful degradation** | p95 ≤ 16; freezes ≤ 1/min; no desync; warning shown; KO confirm ≤ 350 ms p95; no decay artefact |
| 400 ms ±50 | Completes; p95 ≤ 22; critical shown; freezes ≤ 1/min at 0% loss |
| Asymmetric 20 / 200 ms | The low-ping player's p95 ≤ own baseline + 1 |
| PvE | 0 corrections at any steady RTT with spikes ≤ 250 ms; dragon bit-identical |
| Spectators | Delay 150–200 ms; no freeze > 100 ms at ≤ 1% loss; bounded backlog |
| Determinism | 0 desyncs in 10k fuzz fights × Node + 3 browsers; production desync rate < 0.01% of fights; **0 false desync requests** |
| Server | 0 eaten inputs caused by stalls ≤ 1 s; ≤ 0.1 ms per fight-tick |
| CPU (client) | Re-sim ≤ 1 ms per frame p99 on desktop, ≤ 4 ms on a mid phone |
| Bandwidth | Fighter ≤ 8 KB/s down and ≤ 6 KB/s up, headers included |
| Audio | 0 duplicated hit or whoosh sounds in the event-shift suite |

## 11. Document changes and open items for the user
- **Same change as the code:**
  - Replace combat-design §9.1–9.5 and architecture §12.3 with this design (in Korean).
  - Update architecture §12.1 (new package) and AI_README §5 and §6 (structure; the combat-seed exception unless O5 option B is chosen).
  - Add the netcode rows to development-plan.
  - `PROTOCOL_VERSION` 2 covers the new `fight:*` events.
- **O1 — structural.** Add `@dragon-rush/combat-net`. Dependency direction: engine ← combat ← combat-net ← server, web; protocol holds the wire codec and schemas. It needs approval before starting (AI_README §11).
- **O2 — training contract.** Bot lookahead needs decisions and masks from the delayed state. Default: no lookahead.
- **O3 — dev dependency.** `@playwright/test`. Phase 2 geckos.io needs a briefing when the gate triggers.
- **O4 — PvE hold.** H = 15 lets a modified client bank about 250 ms. Lower to 9 for competitive play.
- **O5 — combat RNG exposure.**
  - **Option A (default v1):** send the seed and state; a mod can foresee every dragon pick in the fight.
  - **Option B:** the dragon's random draws become a server **directive stream**.
    1. When the dragon enters idle at tick i, the server draws the next maneuver and the idle length from its private RNG.
    2. It sends them in the confirm stream as `{ tick: i + PICK_LEAD, directive }`, with `PICK_LEAD = 48` (< minimum idle 78).
    3. The sim consumes the directive at that tick instead of `state.rng`.
    - Prediction stays exact for RTT + m < 800 ms, and a cheater learns only the next pick about 0.8 s ahead.
    - Cost: a `stepCombat` signature change, and directive generation in `combat-env-server`. Training distributions are unchanged.
- **O6 — combat-design knob.** The dash (12 px per tick in f1–8) is the largest pop. Consider 2 anticipation ticks at about 4 px per tick with the same total distance.
- **O7 — very high ping (rule decision).** If either fighter's effRTT is ≥ 500 ms at lock, offer the fighters dice resolution (`resolveCombatWithDice`) instead of real-time? Default: no; play with D = 7 and the critical warning.
- **O8 — SOCD rule (UX).** Last-pressed wins per axis (proposed) or opposite keys cancel. Hot-seat uses the same latch.
- **O9 — online hitstop.** Optionally scale hitstop down in online PvP to reduce correction pops. It is a rules value, so training/runtime parity must be considered. Default: unchanged.

## 12. Sources (primary first)
- **Rollback practice:**
  - Infil netcode explainer: https://words.infil.net/w02-netcode-p4.html · https://words.infil.net/w02-netcode-p5.html · https://words.infil.net/w02-netcode-p6.html · SF6 review: https://words.infil.net/w04-sf6review-p5.html
  - GGPO DeveloperGuide and source: https://raw.githubusercontent.com/pond3r/ggpo/master/doc/DeveloperGuide.md · https://raw.githubusercontent.com/pond3r/ggpo/master/src/lib/ggpo/timesync.cpp · https://raw.githubusercontent.com/pond3r/ggpo/master/src/lib/ggpo/backends/p2p.cpp (`RECOMMENDATION_INTERVAL` 240)
  - GGRS: https://docs.rs/ggrs/latest/ggrs/struct.SessionBuilder.html · https://docs.rs/crate/ggrs/0.12.0/source/docs/time-synchronization.md
  - Fortress Rollback: https://wallstop.github.io/fortress-rollback/fortress-vs-ggrs
  - 2XKO: https://2xko.riotgames.com/en-us/news/dev/how-2xko-handles-online-play/
  - INVERSUS: https://www.gamedeveloper.com/design/rollback-networking-in-inversus
  - MK/Injustice 2: https://www.gdcvault.com/play/1025471/8-Frames-in-16ms-Rollback
  - Cargo Space audio: https://johanhelsing.studio/posts/cargo-space-devlog-4/
- **Server authority and time:**
  - Photon Quantum: https://doc.photonengine.com/quantum/v3/concepts-and-patterns/server-client-role · https://doc.photonengine.com/quantum/current/concepts-and-patterns/mispredictions-and-entity-views · events: https://doc.photonengine.com/quantum/v3/manual/quantum-ecs/game-events
  - Rollback netcode for client-server architectures (OPODIS 2025): https://drops.dagstuhl.de/storage/00lipics/lipics-vol361-opodis2025/html/LIPIcs.OPODIS.2025.11/LIPIcs.OPODIS.2025.11.html
  - Overwatch (GDC 2017): https://gdcvault.com/play/1024001 · summary: https://edgegap.com/blog/game-backend-deep-dive-overwatch-2016-netcode-architecture-rollback
  - Unity ClientTickRate (TargetCommandSlack, CommandAgeCorrectionFraction, PredictionTimeScale, MaxPredictAheadTimeMS): https://docs.unity3d.com/Packages/com.unity.netcode@1.5/api/Unity.NetCode.ClientTickRate.html
  - SnapNet: https://www.snapnet.dev/blog/netcode-architectures-part-2-rollback/ · https://www.snapnet.dev/blog/netcode-architectures-part-3-snapshot-interpolation/
  - Rematch Netcode 2.0: https://mixed-news.com/en/rematch-netcode-2-0-server-initiated-hits-50ms-input-delay/
  - Gambetta: https://www.gabrielgambetta.com/client-side-prediction-server-reconciliation.html
  - Gaffer: https://gafferongames.com/post/fix_your_timestep/ · https://gafferongames.com/post/deterministic_lockstep/ · https://gafferongames.com/post/udp_vs_tcp/ · https://gafferongames.com/post/state_synchronization/
- **Web transport, timing and the runtime:**
  - Node.js event loop: https://nodejs.org/en/learn/asynchronous-work/event-loop-timers-and-nexttick
  - Socket.IO: https://socket.io/docs/v4/server-options/ · https://socket.io/docs/v4/client-options/ · https://socket.io/docs/v4/emitting-events/ · https://socket.io/docs/v4/socket-io-protocol/
  - engine.io: https://raw.githubusercontent.com/socketio/socket.io/main/packages/engine.io/lib/socket.ts · https://raw.githubusercontent.com/socketio/socket.io/main/packages/engine.io/lib/transports/websocket.ts · https://raw.githubusercontent.com/socketio/socket.io/main/packages/engine.io/lib/transports/webtransport.ts
  - ws: https://raw.githubusercontent.com/websockets/ws/master/lib/websocket.js
  - geckos.io and node-datachannel: https://github.com/geckosio/geckos.io · https://cdn.jsdelivr.net/npm/node-datachannel@0.32.2/README.md
  - WebTransport status: https://webkit.org/blog/17862/webkit-features-for-safari-26-4/ · https://nodejs.org/en/blog/events/nodejs-interactive-2026
  - TCP: https://www.rfc-editor.org/rfc/rfc5681 · https://www.rfc-editor.org/rfc/rfc6298 · Linux 200 ms minimum RTO: https://access.redhat.com/node/2345531
  - Clocks and jitter: https://www.rfc-editor.org/rfc/rfc5905 · https://www.rfc-editor.org/rfc/rfc3550
  - Chrome timer throttling: https://developer.chrome.com/blog/timer-throttling-in-chrome-88 · Windows occlusion: https://chromium.googlesource.com/chromium/src/+/main/docs/windows_native_window_occlusion_tracking.md
  - MDN: https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API · https://developer.mozilla.org/en-US/docs/Web/API/Event/timeStamp
- **Testing and UX:**
  - Playwright: https://playwright.dev/docs/api/class-websocketroute
  - Browser throttling limits: https://developer.chrome.com/blog/new-in-devtools-99 · https://bugzilla.mozilla.org/show_bug.cgi?id=1421357
  - Network emulation: https://github.com/jagt/clumsy · https://man7.org/linux/man-pages/man8/tc-netem.8.html · https://dev.epicgames.com/documentation/en-us/unreal-engine/using-network-emulation-in-unreal-engine
  - VALORANT instability indicators: https://playvalorant.com/en-us/news/game-updates/valorant-game-and-network-instability-basics
  - Accessibility: https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html · https://learn.microsoft.com/en-gb/gaming/accessibility/xbox-accessibility-guidelines/103
