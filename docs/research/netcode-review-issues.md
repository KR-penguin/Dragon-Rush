## Adversarial review of the Dragon Rush fight netcode design (v1)

**What I checked v1 against**
1. The WIP sim on `feature/realtime-combat` (commit `b07a819`, in `packages/combat/src`). Files read: `step.ts`, `moves.ts`, `work.ts`, `pack.ts`, `types.ts`. A concurrent agent is still editing it, so line numbers move.
2. `docs/combat-design.md` §1–§9, `docs/combat-ai-spec.md` §3/§5/§6, and `docs/architecture.md` §12.
3. Primary sources, listed at the end.

**Severity scale**
- **Critical:** breaks correctness under normal conditions.
- **High:** a visible failure in common conditions, or a real exploit.
- **Medium:** an edge case or unfair outcome that has a workaround.
- **Low:** hygiene.

Every fix below is already built into the corrected v2 design (the final_design output). The "Fix in v2" column points to its section.

### Summary

| ID | Sev | Area | Issue | Fix in v2 |
|---|---|---|---|---|
| C-1 | **Critical** | Desync detection | The hash is checked against a ring slot that has not been re-simulated yet, which produces false desyncs, a sync storm, then degraded mode | §5.4 `promoteConfirmed()` |
| H-1 | High | Prediction | The decay rule makes the opponent stop every frame once depth > 10 (≈ 250 ms RTT) | §2.3 split prediction and substitution |
| H-2 | High | Lead control | The p2 slack target chases TCP retransmission stalls, and the 2 s window plus gain 0.02 oscillates | §4.3 median, jitter-based target, gain 0.01 |
| H-3 | High | Server loop | Dropped loop time leaves fights behind W, and steps after a stall run before the socket I/O is read, so everyone's inputs are eaten | §6.1 step-to-W, I/O hop, retime |
| H-4 | High | Determinism | The 4-bit direction wire mask does not match the sim's `move 0..8`. SOCD conversion sits in several places | §2.2 canonical mask |
| H-5 | High | Determinism | Rules are not part of the handshake and are not in the hash. Debug knobs or a hotfix cause a silent permanent desync | §3.5 `rules` + `rulesHash` |
| H-6 | High | FX/SFX | Event and entity ids embed ticks, so a 1-tick shift plays sounds twice and makes projectiles blink | §5.7 two-stage match |
| H-7 | High | Smoothing | The own fighter is never smoothed, but global hitstop, push and knockback move it on opponent mispredictions | §5.6 |
| H-8 | High | Transport | Downlink backlog is unbounded (Socket.IO never drops non-volatile packets), so slow spectators and fighters drift seconds behind | §6.7 app-level acks |
| H-9 | High | Fairness | TCP uplink stalls eat real inputs. v1's only defence was a bigger margin for everyone (H-2) | §2.4 conditional stall hold |
| H-10 | High | Cheating | Relay reveals the opponent's same-tick input before your own commit. This is also a prerequisite for H-9 | §2.4 commit-before-reveal |
| M-1 | Medium | Handover | Bot takeover revokes inputs that were already relayed, and the owner never gets the bot's masks | §6.6 |
| M-2 | Medium | Handover | `fromTick` uses an RTT the server never measures, so a client can claim any value | §6.6 self-clocked handback |
| M-3 | Medium | High ping | D is capped at 4, so at 300–400 ms RTT depth reaches 16–24 and freezes at the PvP cap of 30 | §4.4, cap 40, O7 |
| M-4 | Medium | Client loop | D above the useful lead leaves the client behind the confirm stream and breaks the loop invariants | §4.4 clamp, §5.3 |
| M-5 | Medium | Client memory | The 128-slot input ring overflows during a freeze (`inputTick` keeps advancing) and corrupts own inputs | §5.2 512-slot rings |
| M-6 | Medium | Fight start | There is no readiness barrier, so a slow device starts as "AI 대행" | §4.1 `fight:go` |
| M-7 | Medium | Reconnect | A dead link takes 15 s to detect, then 1–5 s of reconnect backoff | §4.7 watchdog |
| M-8 | Medium | Cheating/UX | Hide/show summons the bot on demand. Windows Chrome reports a fully covered window as hidden | §6.6 tenure |
| M-9 | Medium | Hitstop | A late hit loses its weight, and a phantom hit's freeze makes both fighters jump | §5.6, §5.7 impact pulse |
| M-10 | Medium | Spectators | Batches overlap or leave gaps at a mid-fight join. New sockets (not only reconnects) never get `fight:start` | §5.8, §6.5 |
| M-11 | Medium | Cheating | The combat RNG state on clients reveals every future dragon pick for the whole fight | O5 option B |
| M-12 | Medium | Lifecycle | Messages after a fight ends count as violations. The u16 global fightId wraps | §3.4 u32, tombstones |
| M-13 | Medium | Bots | The server bot cadence must count live ticks and use the delayed-observation ring, as in training | §6.4 |
| L-1…L-10 | Low | Hygiene | Lint bans, tick numbering, KO SFX, sync spam, spin CPU, input timestamps, far-ahead end, sync payload, deploys, pre-roll re-anchor | see below |
| T-1 | — | Tests | v1's matrix cannot catch C-1, H-1, H-2, H-3, H-6 or H-8 | §8 |

---

### C-1 (Critical): the hash is verified on a slot that has not been re-simulated
- **Problem.** v1 §5.4 compares `hashFight(ring[hashTick].state)` while handling `fight:confirm` inside `net.drain()`. But the `resimulate(rollbackFrom)` that the same drain triggered (from relays processed in that drain, from the confirm's own substitutions or eaten own inputs, or from bot masks) runs later in `frame()`. So the slot can still hold a mispredicted state.
- **Failure.** Under commit-before-reveal (and in v1), a relay leads the confirm for the same ticks by only m + 0–1 ticks (17–50 ms). With ±15 ms downlink jitter, the two often land in the same frame, and always do after a TCP stall bunches messages.
  - Every such case where a tick ≤ hashTick changed gives a false `desync`.
  - Three of them switch the socket to "sync every 30 ticks" (6 KB/s) for the rest of the fight.
  - The telemetry also files them as P1 determinism bugs and hides the real ones.
- **Fix.**
  - `drain()` only stores data and never reads ring states.
  - After `resimulate()` and fast-forward, a single `promoteConfirmed()` walks the newly confirmed ticks. At this point the slots are clean, because every input ≤ confirmedTick is known.
  - It records `localHash[t]` for t % 30 = 0 and compares against `serverHash[t]` when both exist.
  - The same pass confirms events, HP and the terminal state.
  - Add the test "heavy misprediction, zero false desyncs".

### H-1 (High): prediction decay fires at ordinary high ping
- **Problem.** `predictMask` clears movement once `ticksSinceReal > 10`, and v1 requires client prediction to use the same function. In steady state the opponent's newest known input is `depth` ticks old. v1's own table gives depth median 11 and p95 14 at 250 ms.
- **Failure.**
  - At ≥ 250 ms, the newest 1–4 predicted ticks always have the opponent stopping (stop takes 3 ticks per combat-design §2.1). Every relay (60/s) then corrects it.
  - The result is a permanent backward bias of 3–13 px plus jitter while walking, and much larger errors during dashes (12 px/tick).
  - This is exactly the "regardless of ping" condition the design targets.
- **Fix.** Split the rules:
  - **Server substitution** decays after a run of 10 consecutive substituted ticks.
  - **Client prediction** is a pure repeat of the last known real mask while the stream is healthy. It switches to the server's rule only once a confirm shows SUBST for that seat, continuing the run count from the confirm.
  - With this split the client mirrors the server during starvation. The only mismatch is the movement of ticks 11+ of a starvation episode the client has not heard about yet: at most one small correction per episode.

### H-2 (High): the lead controller chases TCP stalls and oscillates
- **Problem 1: the target picks the wrong samples.**
  - On TCP, one lost segment delays every later input packet until fast retransmit (after 3 duplicate ACKs, RFC 5681), about RTT + 3 packets. The RTO path is ≥ 200 ms on Linux.
  - At 80 ms RTT, 0.5% loss and 60 packets/s, about 45% of 2 s windows contain at least one loss. Each loss delays about 8 of the 120 samples (6.7%) by up to about 130 ms.
  - The 2nd percentile (the 3rd-lowest sample) therefore lands inside the stall. The controller reads about −100 ms slack and dilates at +5% for up to 2 s, adding about 6 ticks of lead. When the stall leaves the window, it reverses.
  - Net effect: the opponent depth swings by about 6 ticks every few seconds. v1's test "timeScale stays in [0.95, 1.05]" passes while the feel fails.
- **Problem 2: the loop delay causes ringing.**
  - Gain 0.02 per tick is a rate gain of 1.2 s⁻¹. Measurement lag is about 1 s (the 2 s percentile window) plus RTT, so gain × delay ≈ 1.3 rad.
  - That gives a small phase margin, overshoot and ringing even without loss. GGPO, for comparison, applies a time-sync correction at most every 240 frames.
- **Fix.**
  - The server reports `slackMedMs`, the **median** over the last 0.5 s (robust to under 50% outliers, so stalls drop out), and `jitUpMs`, an RFC 3550 jitter of uplink transit with each sample clipped at 2T.
  - The client targets `6 ms + 2·jitUp` with gain 0.01 per tick of error, dead band ±0.5 tick, and ±3% (±5% only beyond 4 ticks of error).
  - It re-anchors only after |err| > 10 for 0.5 s.
  - Stalls are handled by H-9, not by the margin.
  - Precedent: Unity's fixed `TargetCommandSlack` (2 ticks) with `CommandAgeCorrectionFraction` 0.1.

### H-3 (High): the server loop drops time and steps before I/O is read
- **Problem 1: dropped time.**
  - v1 does `if (now >= next) { next = now + TICK_NS; overrun++ }` and calls `scheduler.stepDue()` once per tick.
  - After a hiccup, fights stay permanently behind W, while every client's clock (from `epochServerMs`) keeps counting. All inputs then look early, every controller slows down to re-centre, and each hiccup shifts everyone's lead.
- **Problem 2: steps run before inputs are read.**
  - During a JS stall (GC, board-model inference in another room, a sync serialization), inputs that arrived on time sit unread in the kernel.
  - If the catch-up steps run before a poll phase has drained them, the inputs are judged missing. Both players get mass substitution and own-character corrections for the server's fault.
- **Fix.**
  - Each wake steps every fight to `W`. It does not cap at 4 ticks: a step costs 20 µs, so 60 ticks ≈ 1.2 ms.
  - On a wake that is late by more than 2T, it first yields one `setImmediate` hop. That guarantees a poll phase runs before stepping. `setImmediate` runs after poll, and since libuv 1.45 (Node ≥ 20) timers also run after poll.
  - Arrivals processed in a late wake are excluded from the slack statistics and from "eaten" counts.
  - Only if a fight is more than 120 ticks behind does the server shift its epoch and send `fight:retime`.
  - The loop runs only while a fight exists (no idle spin).

### H-4 (High): the wire mask and the sim input disagree
- **Problem.**
  - v1 sends `{up, down, left, right, attack, skill, dash}` bits with `MOVE_BITS = 0b1111`.
  - The WIP sim takes `FighterInput { move: 0..8, attack, skill, dash }` (`types.ts`), and `readInput` sanitizes `move`.
  - Turning 16 direction-bit combinations into 9 moves requires an SOCD rule (left+right, up+down). That rule would have to be identical in the latch, codec, server decoder, bots and replay tools.
  - Two implementations with different SOCD choices desync silently; the hash notices up to 30 ticks later.
  - `predictMask`'s "clear MOVE_BITS" also assumes a bit layout the sim does not have.
- **Fix.**
  - Canonical 7-bit mask `move | attack<<4 | skill<<5 | dash<<6`, with move ∈ 0..8.
  - `isValidMask` rejects a low nibble > 8 or bit 7 set.
  - A single precomputed `maskToInput` table and `inputToMask` live in `packages/combat`. The server, client and bots use only these.
  - SOCD is resolved only in the input latch, before encoding (O8).

### H-5 (High): rules are not part of the handshake
- **Problem.**
  - `pack.ts` says "Rules are not packed", and `createCombat(setup, seed, rules = DEFAULT_COMBAT_RULES)` takes them as an argument.
  - v1's handshake carries only `combatBuildId`.
- **Failure.** Any difference in rules makes the sims diverge from tick 1. Examples:
  - the combat-design §11 debug knob panel (S, K, hitstop, buffer and more);
  - room difficulty;
  - `dragonDamageTakenScale` tuning;
  - a server hotfix without a client rebuild.

  The result is a desync every 30 ticks and degraded sync mode for the whole fight, with no message that names the cause.
- **Fix.**
  - `fight:start` carries the effective `rules`, plus `rulesHash` (the WIP sim already has `hashCombatRules`) and `packVersion`.
  - The client builds the fight from the received rules and aborts if its hash of them differs.
  - The knob panel in an online fight is server-side only (host → server → `fight:start`).

### H-6 (High): duplicated SFX and FX and blinking projectiles
- **Problem.**
  - In the WIP sim, `emit()` ids are `${tick}:${type}:${key}`.
  - Projectile ids are `entityId(tick, owner, slot) = tick·256 + …`.
  - Hit keys embed the source entity id, so they embed the spawn tick.
  - v1 dedupes by exact key only.
- **Failure.** A re-simulation that moves an event by one tick is common. Examples:
  - a remote projectile's hit tick shifts after the target's mispredicted movement is corrected;
  - a buffered own attack starts a tick later because a predicted hitstop vanished.

  The re-simulation emits a "new" key (played again if ≤ 7 ticks late) and a "vanished" key (faded over 100 ms). The player hears a double hit, sees two damage numbers, and sees the arrow disappear and reappear. Photon Quantum's event model also cancels and re-raises on a mismatch; it does not merge.
- **Fix.** Two-stage reconciliation:
  1. Match by exact id.
  2. Match unmatched new events to unmatched old ones by a tick-free signature (type, actor, move or kind, target, hit index) within ±6 ticks. Rebind them: move the spark, never replay.

  Entity views match by (owner, slot kind, spawn tick ±6), decoded from the id. No sim change is needed.

### H-7 (High): the own fighter snaps on opponent-caused corrections
- **Problem.** v1 smooths the own fighter "only after a server override". In the WIP sim, own position depends on the opponent:
  - global hitstop (`s.hitstop` freezes both fighters);
  - body separation (`physics.ts`);
  - knockback;
  - parry and counter.
- **Failure.** A predicted hit that is rolled back removes up to 12 frozen ticks. The own fighter then jumps forward about 38 px (about 100 px with a buffered dash), unsmoothed. A late-discovered hit pulls it back by the same amount.
- **Fix.**
  - Smooth every entity, own included. The own fighter uses a fast decay (k = 0.75, half-life ≈ 40 ms).
  - Snap only on a category change.
  - The camera follows the smoothed position.

### H-8 (High): unbounded downlink backlog
- **Problem.**
  - Socket.IO never drops non-volatile emits.
  - engine.io keeps unsent packets in a private `writeBuffer`, and flush is gated on `transport.writable`.
  - The ws/kernel buffers in front of that grow silently as well.
- **Failure.**
  - A spectator on a congested mobile link builds up seconds of confirms. The 2× catch-up needs downlink headroom the link does not have, and server memory grows per socket.
  - A fighter's confirm depth grows until the hard-cap freeze.
- **Fix.** Use app-level acks; there is no public buffer API.
  - Fighters already send `ackConfirmTick`, which v1 ignored on TCP.
  - Spectators send `fight:ack` at 4 Hz.
  - Backlog = last sent tick − acked tick.
    - Spectator backlog > 90 ticks: stop streaming and resync once the acks catch up.
    - Fighter backlog > 60: quality critical. Backlog > 180: force a disconnect, so the reconnect path resets the queue.

### H-9 (High): TCP uplink stalls eat real inputs
- **Problem.** Once H-2 is fixed, the margin is jitter-sized (about 2 ticks). Every uplink stall longer than that substitutes several real inputs, and the player sees own-character corrections. v1 had no mechanism other than a larger margin for everyone.
- **Fix: conditional stall hold.**
  - When a human seat's input for k is missing at W ≥ k, but that seat's stream is alive (a packet within the last 250 ms) and no hold expired in the current episode, the server waits up to `PVP_HOLD = 6` ticks (100 ms) before substituting.
  - Cost: the confirm stream (not the relay) pauses for at most 100 ms during that player's own stall.
  - A uniform delay G would cancel out (v1's argument); a stall-only hold does not, and that difference is the point.
  - Safe only together with H-10. Otherwise a faked stall would buy a 6-tick lookahead.

### H-10 (High): same-tick lookahead through the relay
- **Problem.** v1 relays B's input for tick k as soon as it arrives. A modified client A whose RTT is below B's margin sees B's tick-k input before committing its own tick k. v1's window is `m_B − RTT_A`, which is real on LAN or near the server, and H-9's hold would widen it.
- **Fix: commit-before-reveal.**
  - Reveal B's mask for tick k to A only after A's tick k is committed (received, or stepped).
  - Bot masks are revealed at once.
  - Honest cost: A loses `max(0, m_B − m_A)` ticks of prediction. Usually 0, at most 1–2.
  - Depth becomes `RTT_A/T + max(0, m_A − m_B) − D_A`, still independent of B's RTT. The same-tick window becomes 0.
  - What remains is ordinary machine-reaction cheating (reacting in RTT − m), which is common to every client-server game. Handle it with statistical flags.

### M-1 (Medium): bot takeover revokes relayed inputs
- **Problem.**
  - Takeover "from the next tick" or from `confirmTick + 1` discards human masks the server already accepted (up to W + 30) and relayed as real. That breaks "relay = final" and forces avoidable rollbacks on the opponent.
  - The owner of a bot-driven seat is not relayed the bot's masks, so it sees its own fighter only at confirm depth.
- **Fix.**
  - Take over at `max(fightTick + 1, lastAcceptedTick + 1)`.
  - Relay bot masks to both fighters.
  - While its seat is bot-controlled, the client treats that seat as remote.

### M-2 (Medium): the handback tick uses an unmeasured RTT
- **Problem.** `fromTick = confirm + ⌈SRTT/T⌉ + 6`, but SRTT exists only on the client (it is untrusted `fight:ready` telemetry).
- **Fix: self-clocked handback.**
  - After the minimum tenure and a `back` or input resumption, choose the first k > fightTick for which masks k, k+1 and k+2 are already buffered.
  - Announce it immediately. A late announcement costs the owner one small own rollback.

### M-3 (Medium): very high ping (over 300 ms)
- **Problem.** With D ≤ 4, depth is about RTT/T − 4: 14 at 300 ms and 20 at 400 ms. The PvP cap of 30 then freezes on any jitter, remote startups are never visible, and the reaction rule (≥ 24f) only holds to 150 ms.
- **Fix.**
  - Extend D: 5 at ≥ 270 ms, 6 at ≥ 340 ms, 7 at ≥ 420 ms (the setting allows up to 8).
  - PvP cap 40.
  - Critical warning at ≥ 300 ms.
  - Open item O7 (a rule decision): offer dice resolution when effRTT ≥ 500 ms at lock. Unity caps accepted ping with `MaxPredictAheadTimeMS` ≤ 500.

### M-4 (Medium): D larger than useful
- **Problem.** "부드럽게" at 20 ms RTT gives D = 2, more than RTT + m. The client then trails the confirm stream, the fast-forward puts `simTick > inputTick`, and v1's `target`/`alpha` logic assumes `simTick ≤ inputTick`.
- **Fix.**
  - Clamp D to `≤ ⌈effRTT/T⌉`.
  - Make the loop tolerate `simTick ≥ inputTick` (alpha = 1, no stepping).

### M-5 (Medium): the input ring overflows during a freeze
- **Problem.** `SeatInputs` has 128 slots keyed by `tick & 127`. During a freeze `inputTick` keeps advancing, and the PvE cap of 120 plus D is already close to 128. A stall of about 2.1 s or more overwrites unconfirmed own masks that the next re-simulation needs, so the own prediction is silently wrong.
- **Fix.**
  - Use 512-slot input rings with explicit `lastReal` fields.
  - Request a sync when `inputTick − confirmedTick > 480`.

### M-6 (Medium): no readiness barrier
- **Problem.** Tick 0 is fixed at t0 + 2.8 s. A phone still decoding sprites or audio, or a slow reload, starts the fight starving, and after 1.5 s a bot plays its first seconds.
- **Fix: two-phase start.**
  1. `fight:start` (setup) is sent first.
  2. Each fighter sends `fight:ready` once its assets and ping burst are done.
  3. The server sends `fight:go { epochServerMs }` when both fighters are ready, or at t0 + 6 s at the latest.
  - The common case keeps the 2.8 s timeline.

### M-7 (Medium): slow detection of a dead link
- **Problem.** A dead TCP link (Wi-Fi switch, NAT rebind) is found only by the heartbeat (10 + 5 s). Socket.IO's client then waits `reconnectionDelay` 1000 ms (randomization 0.5, max 5000). The bot plays the whole time.
- **Fix.**
  - A client watchdog: if the client is visible and gets no `fight:*` message for 1 s, it forces a reconnect.
  - During a fight, set `reconnectionDelay` to 250 ms and `reconnectionDelayMax` to 2000 ms.

### M-8 (Medium): away abuse and occlusion
- **Problem.**
  - `fight:away` hands the seat to the Normal bot at once and back on `back`. That is an on-demand assist or "panic button".
  - Chrome on Windows reports `hidden` when the window is fully covered (native occlusion tracking), so accidental away events happen too.
- **Fix.**
  - Minimum bot tenure of 3 s.
  - Handback only through the self-clocked rule (M-2).
  - Count away episodes in telemetry and flag them.

### M-9 (Medium): hitstop and rollback
- **Problem.**
  - A late-discovered hit whose sim hitstop already lies in the past shows no freeze at all, so it feels weightless.
  - A phantom hit's hitstop that is rolled back makes both fighters jump.
- **Fix.**
  - Use the smoothing from H-7.
  - A new (unpredicted) hit at least half of whose hitstop is already past gets a presentation-only "impact pulse": a flash, trauma and SFX for 50 ms, with no freeze.
  - Optionally cap online hitstop through a rules knob. That is a design decision, because it changes training/runtime parity.

### M-10 (Medium): spectator joins
- **Problem.**
  - 2-tick batches can overlap or leave a gap at the sync tick.
  - Sockets that enter a room mid-fight without being a reconnect (a new tab, or a board player joining late) never receive `fight:start`.
- **Fix.**
  - Ingest confirms idempotently: ignore ticks ≤ known, and request a sync on a gap.
  - The server serializes the sync and adds the socket to the fight broadcast in the same JS turn.
  - Send `fight:start` and `fight:go` to any socket that joins while a fight is active.

### M-11 (Medium): combat RNG exposure (v1 open item O5)
- **Problem.** Clients hold the seed and RNG state, so a trivial mod can print every future dragon maneuver for the whole fight, in a mode tuned to a win rate below 10% at starting stats.
- **Fix.** Make it an explicit user decision (O5).
  - **Option A (v1):** accept the exposure.
  - **Option B:** dragon picks become a server "directive" input stream. The server draws a pick from its private RNG when the dragon enters idle, then applies it `PICK_LEAD = 48` ticks later (shorter than the minimum idle of 78). Prediction stays exact for RTT + m < 800 ms, and a cheater learns only the next pick, about 0.8 s early. This changes the sim API and the combat env.

### M-12 (Medium): messages after a fight ends, and fightId wraparound
- **Problem.**
  - Inputs that arrive after `fight:end` count as violations.
  - The u16 global fightId wraps.
  - A stale packet could hit the next fight.
- **Fix.**
  - A per-process u32 fightId.
  - 10 s tombstones that drop such messages silently.
  - Clients stop sending on `fight:end`.

### M-13 (Medium): server bot cadence
- **Problem.** combat-ai-spec §3 has bots decide every 4 **live** ticks (hitstop does not count), from a `delay`-tick observation ring. v1 says "every 4 ticks", so an online bot would not behave like the trained one.
- **Fix.**
  - Count live ticks.
  - Keep a 32-state ring per fight on the server.

### Low
- **L-1.** Keep determinism lint bans in `packages/combat`: `.sort(`, `Map`/`Set` iteration, `for…in`, and `Object.keys/values/entries` in the step path. The WIP sim is clean today. Normalize `-0` with `| 0` in packing. A Phase 2 binary codec uses `DataView` little-endian, not the platform-endian `Int32Array`.
- **L-2.** Tick numbering is off by one. In the sim, `createCombat` is state tick 0 and the first step produces tick 1. Define it as "input for tick k is consumed by the step that produces state k (k ≥ 1)".
- **L-3.** The KO-specific SFX (bell, crowd, slow-mo stinger) should wait for confirmation. Hit SFX can stay predicted.
- **L-4.** `fight:requestSync` amplifies 3–5 KB per request. Allow at most 1 sync per 500 ms per socket.
- **L-5.** The `setImmediate` spin for the last 2 ms costs about 12% of a core. Run it only while fights exist. Use one server clock (`performance.now()`) for the epoch, W and pongs.
- **L-6.** When one frame produces several ticks, bucket presses by `KeyboardEvent.timeStamp` into the right tick instead of the first one.
- **L-7.** If `fight:end` arrives more than 600 ticks ahead, show the result directly instead of simulating.
- **L-8.** `serializeCombatState` already returns a JSON-safe `number[]`. Send that, not base64.
- **L-9.** A server restart or deploy mid-fight loses the fight (rooms are in memory). Drain deploys between fights. This is an accepted risk.
- **L-10.** During the pre-roll, re-anchor by jumping instead of dilating; nothing is simulated yet.

### T-1: test gaps
v1's matrix asserts `desyncs === 0` but has no case that:
- makes heavy misprediction coincide with hash ticks (C-1);
- runs ≥ 250 ms steadily while checking remote bias (H-1);
- measures lead variance under TCP loss (H-2);
- stalls the server event loop (H-3);
- shifts an event by one tick and counts sound plays (H-6);
- throttles downlink bandwidth (H-8);
- mismatches rules (H-5);
- spams away/back (M-8);
- joins a spectator at an odd tick (M-10).

All of these are added in v2 §8.

### Keep from v1 (reviewed, sound)
- Server-confirmed input relay, rather than snapshots.
- No rift balancing.
- D fixed per fight.
- No pause; substitute, then bot.
- Predicted cosmetics with confirmed KO.
- The pending-HP segment.
- Spectators play back confirmed inputs.
- Flat JSON integer arrays on Socket.IO, with no `volatile`.
- The WebRTC upgrade gated by telemetry.
- The SyncTest suite.
- The own netsim.
- The no-rewind fairness rule.

### Sources used in this review
- Node.js event loop phases (setImmediate after poll; timers after poll since libuv 1.45): https://nodejs.org/en/learn/asynchronous-work/event-loop-timers-and-nexttick
- Unity `ClientTickRate` (TargetCommandSlack 2, CommandAgeCorrectionFraction 0.1, PredictionTimeScale 0.9–1.1, MaxPredictAheadTimeMS ≤ 500): https://docs.unity3d.com/Packages/com.unity.netcode@1.5/api/Unity.NetCode.ClientTickRate.html
- GGPO `RECOMMENDATION_INTERVAL = 240`, averaged time sync: https://raw.githubusercontent.com/pond3r/ggpo/master/src/lib/ggpo/backends/p2p.cpp · https://raw.githubusercontent.com/pond3r/ggpo/master/src/lib/ggpo/timesync.cpp
- TCP fast retransmit: https://www.rfc-editor.org/rfc/rfc5681 · RTO: https://www.rfc-editor.org/rfc/rfc6298 · Linux 200 ms minimum RTO: https://access.redhat.com/node/2345531
- RTP jitter estimator: https://www.rfc-editor.org/rfc/rfc3550
- engine.io `writeBuffer` (private; flush gated on `transport.writable`): https://raw.githubusercontent.com/socketio/socket.io/main/packages/engine.io/lib/socket.ts
- Socket.IO client reconnection defaults: https://socket.io/docs/v4/client-options/
- Photon Quantum predicted, cancelled and synced events: https://doc.photonengine.com/quantum/v3/manual/quantum-ecs/game-events
- Chromium Windows native window occlusion: https://chromium.googlesource.com/chromium/src/+/main/docs/windows_native_window_occlusion_tracking.md
- MDN `Event.timeStamp`: https://developer.mozilla.org/en-US/docs/Web/API/Event/timeStamp
- The v1 source list (Infil, GGRS, 2XKO, Quantum, Overwatch, SnapNet, Gambetta, Gaffer, Socket.IO and ws sources, RFC 5905, Chrome throttling, Playwright) still applies; it is repeated in v2 §12.
