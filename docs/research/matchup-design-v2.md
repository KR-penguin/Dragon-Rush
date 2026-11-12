# Dragon Rush: PvP job matchups (상성) and attack styles, design proposal v2 (after review)

> **Scope.** This covers real-time duels (`packages/combat`, `DEFAULT_COMBAT_RULES`) and their side effects on the dragon fight. Board rules, the five board passives and the shape of the damage formula do not change.
> - **[decision]** marks an item the user must approve before any code is written.
> - Every number is a starting value for the tuning loop in §6. Once the code exists, `DEFAULT_COMBAT_RULES` is canonical.
>
> **Reference stats** (rush-1 `DEFAULT_RULES`, HP/ATK/DEF): S 53/5/5 · A 39/6/6 · M 40/4/5 · N 34/4/5 · B 47/5/5 · Dragon 88/10/6.
> Damage = `S·P·ATK·K/(K+DEF)` with S = 1.6, K = 10. Abbreviations: S Swordsman, A Archer, M Mage, N Ninja, B Berserker. f = 60 Hz tick.
>
> **What changed from v1 after the adversarial review:**
> - Kite-to-timeout is closed: the ring shrinks earlier (G7) and kunai range is capped.
> - Reflect is positional (½ P), not a way to win the damage race.
> - New per-fighter poise: the berserker resists knockback, the dragon is immune.
> - Archer shots lead the target (G8).
> - Parry results are per-move data, which keeps the dragon fight at v1.
> - Shoulder Charge cooldown stays 60f.
> - A "loaded meteor" replaces hold-to-aim; `absorb` replaces `dispel`.
> - Starting values are consistent with each job's power budget.
> - New acceptance: degenerate-strategy suite, per-lobby fairness and PvE checks. Bands are wider; Hard delay is scored separately.

## 0. Summary
**The ring.** The cycle is **S → N → A → M → B → S**, and each job beats the next two:

| Job | Beats |
|---|---|
| S | A, N |
| N | M, A |
| A | B, M |
| M | S, B |
| B | N, S |

**Two edge sizes:**
- *Major* edges (the skip edges) target 64%, accepted range 60–68: S>A, A>B, B>N, N>M, M>S.
- *Minor* edges (the neighbour edges) target 60%, accepted range 56–64: S>N, N>A, A>M, M>B, B>S.
- Each job has one major win, one minor win, one major loss and one minor loss.
- Caps: no pooled cell above 68%, no Normal/Easy stratum cell above 70%, no Hard-stratum cell above 75%.

**Rules for building counters:**
- Counters come from move and fighter properties stored as data: parry outcome, armor window, armor break, poise, projectile cancel, rear bonus and lead. They never come from damage numbers set per pair.
- Each job has its own rhythm, range band and special defensive move (§4.1). Every job keeps a dash with i-frames.
- A counter must survive human play. No edge may rely on the timer, on stalling, or on a behaviour the bots happen to lack (§5.5, A12).
- Fractional HP inside fights (G1) comes before any tuning.

**Fairness is measured where players live:** per lobby of 2–4 unique jobs (A13) and against the dragon (A14), not only as the 5-job average.

## 1. Research and the rules taken from it
1. **Soft archetype cycle.** In fighting games, rushdown beats zoner, zoner beats grappler, and grappler beats rushdown ([lucio](https://lucio.bearblog.dev/fgc-rock-paper-scissors/), [SmashLabs](https://smashlabs.design.blog/2020/05/03/archetype-triangle/)). Riot: juggernauts get kited, artillery mages get punished once caught ([Riot classes](https://archive.runeterra.net/na/riot-official/VpVuQRtu)).
2. **Only one shape exists for five jobs.** "Each beats 2, loses 2" on 5 options is the RPSLS shape, unique up to relabelling ([Kass](https://www.samkass.com/theories/RPSSL.html), [tournaments](https://en.wikipedia.org/wiki/Tournament_(graph_theory))).
3. **Locked-in characters need soft counters.**
   - Yomi has 0 of 210 matchups at 7-3 ([Sirlin](https://sirlin.net/articles/game-balance-and-yomi)), and severe matchups are unfair once characters are locked in ([Part 3](https://www.sirlin.net/articles/balancing-multiplayer-games-part-3-fairness)).
   - SmashWiki: 55–60 is a soft counter, about 65 or more a hard one ([Soft counter](https://ssbwiki.com/Soft_counter)).
4. **Payoff sizes shift the equilibrium** ([Schreiber L9](https://gamebalanceconcepts.wordpress.com/2010/09/01/level-9-intransitive-mechanics/)). For this ring the 5×5 matrix goes singular when the neighbour/skip ratio is 1.618, so minor edges must never outgrow major edges.
5. **Fix a matchup with a mechanic that matters mostly in that matchup,** and always leave the loser a real option ([Sirlin Part 3](https://www.sirlin.net/articles/balancing-multiplayer-games-part-3-fairness), [Riot values](https://archive.runeterra.net/na/riot-official/m1tKGoHQ)).
6. **Shared defense, unique offense** ([Sirlin, Guilty Gear](https://www.sirlin.net/articles/designing-defensively-guilty-gear), [Battlerite 007](https://blog.stunlock.com/dev-blog-007/), [Overwatch](https://overwatch.blizzard.com/en-us/news/23652236)).
7. **Stalling is the default failure of a timer decided by HP.** Smash rulesets cap ledge stalling to stop time-outs ([SmashWiki Stalling](https://www.ssbwiki.com/Stalling), [Plank](https://www.ssbwiki.com/Plank)). Battlerite pushes players together with a contracting zone ([PC Gamer](https://www.pcgamer.com/battlerite-is-bite-sized-moba-mayhem)). A faster evader is never caught in open space ([lion and man](https://arxiv.org/pdf/0909.2524)). **Rule:** the arena, not the chaser's speed, must force contact well before the timeout.
8. **Heavies resist knockback** ([SmashWiki weight](https://www.ssbwiki.com/Heavy), [armor](https://www.ssbwiki.com/Armor)). **Rule:** the juggernaut's identity includes poise, so ranged knockback cannot stun-lock it.
9. **Projectiles that do not lead miss any target moving sideways,** and more so at long flight times ([leading the target](https://www.gamedev.net/tutorials/programming/math-and-physics/leading-the-target-r4223/)). **Rule:** the zoner's charged shot leads partially, so dodging is a guess, not a reaction check.
10. **Readability.** Mark the moves that beat a defense consistently, without hiding the body. Sekiro's danger kanji is criticised for covering the enemy's body ([ARPG readability](https://www.gamedeveloper.com/game-platforms/designing-for-difficulty-readability-in-arpgs), [player report](https://forums.nexusmods.com/topic/7510946-mod-request-coloured-kanji-for-sweepthrust-attacks)).
11. **Measurement:**
    - Split the logit matrix into power plus cycle ([Balduzzi 2018](https://arxiv.org/abs/1806.02643)).
    - Play every seed twice with sides swapped ([fishtest](https://official-stockfish.github.io/docs/fishtest-wiki/Fishtest-Mathematics.html)).
    - Give bots human-like delays ([EA](https://arxiv.org/abs/1903.10545)).
    - Test with restricted play ([Jaffe](https://ojs.aaai.org/index.php/AIIDE/article/view/12513)).

## 2. Archetypes
| Job | Archetype | Core verb | Band (px) | Wins by | Loses to |
|---|---|---|---|---|---|
| S | Duelist / counter | **Read** (parry) | 50–90 | winning at sword range; turning committed hits and projectiles into approach and counters | damage the parry cannot use: delayed magic (M) and heavy armored hits (B) |
| A | Zoner / kiter | **Space** (draw, release) | 250–480 | holding slow jobs off with leading full shots | someone who reads the arrows (S) or arrives before a draw finishes (N) |
| M | Trapper | **Time** (loaded meteor) | 180–320 | placing damage on the opponent's commitment; ignoring half of DEF | a target fast enough to walk out (N), or one that out-ranges the bolts (A) |
| N | Rushdown / assassin | **Dive** (in, out, behind) | 0–44, kunai ≤ 240 | punishing setups (draws, casts) up close or from behind | armor that ignores small hits (B) and a guard that punishes predictable strings (S) |
| B | Juggernaut | **Trade** (armor, poise) | 0–80 | walking through small hits; one axe beats several stabs | kiting (A) and being caught committed (M) |

## 3. Matchup structure
### 3.1 Ring
- The ring is the only assignment that fits the seven combat-design §5 edges (brute force over all 1,024 orientations).
- Edges that need new kit support: A>M, M>B, B>S and S>N.

### 3.2 Tiers and caps
- **Majors** are the themed counters: parry beats arrows, kiting beats the juggernaut, armor beats chip damage, speed beats zones, and meteor beats parry.
- **Minors** are footsies-level edges.
- Order rule: mean(majors) − mean(minors) ≥ 2 points, and each job's major win ≥ its minor win − 2. With minor 60 and major 64, a 5-point drift on any edge keeps all Nash weights in 0.16–0.27.

### 3.3 Target matrix
Row job's win rate against the column job: default stats, Normal and Easy delays pooled, styles pooled.

| | S | N | A | M | B |
|---|---|---|---|---|---|
| **S** | 50 | **60** | **64** | 36 | 40 |
| **N** | 40 | 50 | **60** | **64** | 36 |
| **A** | 36 | 40 | 50 | **60** | **64** |
| **M** | **64** | 36 | 40 | 50 | **60** |
| **B** | **60** | **64** | 36 | 40 | 50 |

### 3.4 What players actually face
Lobbies have 2–4 unique jobs, so the 5-job average of 50% is not what players get:
- Every 2-player game has a 60–64% favourite.
- Five of the ten 3-job lobbies are transitive: one job beats both others, for example {S, N, A}.
- In every 4-job lobby, two jobs have two wins and two have one.

Three things dampen this:
- edges stay soft (≤ 64);
- the board decides who meets whom, and duels are only part of how games end;
- blind picks (D6).

A13 measures the result.

### 3.5 The ten pairings
"Way out" is the loser's real option. "First knobs" are the `DEFAULT_COMBAT_RULES` values to turn first when a cell misses its target.

| Edge | Tier | Mechanical reason | Way out | First knobs |
|---|---|---|---|---|
| **S > A** | major | Reflect sends arrows back at P ×0.5. Riposte refunds the dash, so each read is 128 px of free approach. Full shots are reactable from ≥ 256 px and quick shots from ≥ 192 px. Turtling loses the HP race (a full shot does 10.2 to S, a reflect 4.0 to A), so S must close. Close up, S's string beats the 40f draw. | Bait with quick shots inside 190 px (a whiff costs 24f + 240f). Draw-keeping backstep. The reflected arrow is slow enough to backstep. | reflect P mult, parry success cooldown, archer full draw |
| **A > B** | major | Speed 190 vs 165. Leading full shots (G8) hit steady movers. Knockback is 20 px / 5f on the berserker (poise 0.5), so each hit costs it about 34 px. Backstep keeps the draw. Range 480 vs reach 72. | Charge (128 px, armor, unparryable, cooldown 60f). Juke after a release. Whirlwind armor-walk. Ring from 24 s. Rage (4 axe hits kill the archer). | full-shot knockback, berserker speed, charge distance |
| **B > N** | major | Armor (axe f6–14, charge, whole whirlwind) means 0.7-P stabs never interrupt. The 40f whirlwind outlasts the step's 10 i-frames. Axe kills in 4 hits (3 in Rage) vs 16 stabs. Kunai cap at 240 px, and the ring from 24 s stops kiting to the timeout. | Step through to backstab (×1.5) during the axe's 39f facing lock. Kunai inside 240 px. Wait out the whirlwind (300f). | backstab multiplier, whirlwind armor/cooldown, axe reach |
| **N > M** | major | Walking out of a mark takes 68 px in the 30f fuse. After a 10f reaction that needs 3.4 px/f, and only N (3.83) manages it. Two step charges vs one blink. The 4f dagger interrupts the 10f bolt startup and the 12f cast. | Loaded meteor released on the ninja's commitment (dive or step recovery). Blink, then bolt. Homing re-tracks after i-frames. | step recharge, loaded-hold maximum, bolt homing |
| **M > S** | major | The parry has no profitable outcome: bolts `absorb` it and the meteor is unparryable. S approaches at 195 vs 175 plus blink, under homing bolts. Meteor knockback 96. Arcane Pierce halves DEF. | Dash through bolts and close during the blink cooldown. A full string does about 18.7 of the mage's 40 HP. Ring from 24 s. Last Stand. | meteor cooldown and fuse, blink cooldown; reserve: blink echo |
| **S > N** | minor | Reach 60/110° vs 44/90°. A dagger counter is a read (4f startup) worth P 2.0 = 10.7 (31% of ninja HP) plus Riposte. Kunai are reflected. HP 53 vs 34. | Bait the parry, then dive during its 240f cooldown. The parry covers only the front 180°: step through and backstab. Evade. | swordsman reach, parry startup, backstab multiplier |
| **N > A** | minor | 230 px/s vs 190, or 100 while drawing. Step i-frames go through a full shot. The 4f dagger beats any draw (40f full, 8f quick + 10f recovery). G1: stab 2.8 vs DEF 6. | Volley (±15°) on step exits. Draw-keeping backstep. Full shots destroy kunai. First Strike. | archer speed, Volley cooldown, step recharge |
| **A > M** | minor | Arrows reach 480 px at 720–960 px/s; bolts fizzle at 360 px. Full shots destroy bolts. 190 vs 175. | A loaded meteor (≤ 288 px) forces a drawing archer to backstep or cancel. Blink in. Homing bolts hit a drawing archer. | bolt lifetime, full-shot cancel, meteor range |
| **M > B** | minor | The slowest job walks 2.75 px/f, short of the 3.4 needed to leave a mark. Meteor `armorBreak` (22f, ignores poise) punishes armored swings. Bolts chip during the approach. | Charge 128 px in 18f, out of the mark and onto the mage. Point-blank axe: 5 hits (4 in Rage). | armor-break stagger, mark radius, charge distance |
| **B > S** | minor | `crush` on axe and whirlwind (no counter, cooldown 240f). Charge is unparryable. Reach 72 vs 60. The armor (f6–14) trades through the 6f string start. Poise halves the finisher push (64 → 32), so the berserker stays in axe range. | Whiff-punish the axe's 20f recovery. The parry still negates axe damage. Bait the whirlwind (300f). Taking a lead and running is *not* an out: the ring from 24 s and A12 test it. | crush pushback, axe armor window, poise |

### 3.6 Power budget and sign check
- **Combat power (CP)** = HP·(K+DEF)·ATK, with passives approximated: S 4,293 · B 4,054 · A 3,969 · M 2,880 · N 2,331.
- Kit offsets needed (log CP): **N +0.38, M +0.17, A −0.15, B −0.17, S −0.23**.
- The hardest edges to build: M>S, N>A, N>M, M>B.
- The starting values must already point the right way:

| Job | Needs | Buffs in v2 | Compensating nerfs in v2 | Expected net |
|---|---|---|---|---|
| S | − | speed +5; 90f success cooldown and Riposte (PvP only) | finisher P 1.6 → 1.5; reflect ×0.5; crush and absorb outcomes | slightly − |
| A | − | knockback, projectile cancel, lead, draw-keeping backstep | speed 200 → 190; full draw 36 → 40f | ≈ 0 to −; the loop decides |
| M | + | meteor cooldown 240 → 210f, loaded release, armorBreak | speed −5; bolt lifetime 45 ticks | + |
| N | ++ | dagger P 0.7, backstab, pass-through | kunai range 240 | ++ |
| B | − | poise 0.5, whirlwind armor | speed 175 → 165 | − |

## 4. Attack styles and kit changes
### 4.1 Identity sheet
| | S | A | M | N | B |
|---|---|---|---|---|---|
| Rhythm | 1-2-3 string (~1.3 s), then a standing read | draw … release (0.67 s) | cast, hold, release; hits 0.5 s later | 2 stabs in 0.2 s, then away | walk in, one big swing (0.65 s), spin to clear |
| Band (px) | 50–90 | 250–480 | 180–320 | 0–44, kunai ≤ 240 | 0–80 |
| Aim | 110° arc | straight leading shot, pierce | homing bolt + mark on target | 90° arc, ×1.5 from behind | 150° arc + 360° spin |
| Special defense | parry (counter / reflect) | backstep that keeps the draw | blink (invisible) | 2 step charges through bodies | super armor + poise 0.5 |
| Hits to KO 47 HP / DEF 5 | 8–9 (about 3 strings) | 5 full / 11 quick | 5 meteors / 11 bolts | 16 stabs / 11 from behind | 5 axe (4 in Rage) |
| Feel cues | steel clang, gold parry flash, 10f hitstop | creak, glint at full draw, recoil | rune glow when loaded, low boom | rapid ticks, 3f hitstop, after-images | thud, 7f hitstop, clank on armor |

Guardrails:
- No two jobs share a range band or special defense.
- Each job keeps three verbs.
- Every job keeps a dash with i-frames.

### 4.2 Global rules
| # | Rule |
|---|---|
| **G1 [decision]** | **HP inside a fight is tracked in Q8.** Damage is `dmgQ8 = max(256, roundHalfUp(256·S·P·ATK_eff·K/(K+DEF_eff))) + 256·flat`. KO when hpQ8 ≤ 0. Write back to the board as `ceil(hpQ8/256)`; the winner keeps at least 1. Integer math only. Changes combat-design §4. |
| G2 | **Data, no per-pair tables.** Each move has a parry flag plus `successCd`, `riposte` and `reflectPMult`, and optionally `armor [from,to]`, `armorBreak`, `cancelsProjectiles`, `pierce`, `rearMult` and `lead`. Each fighter has `poise`. |
| G3 | **Super armor:** no flinch and no knockback, but damage is still taken. Only `armorBreak` staggers armor (22f), and it ignores poise. |
| G4 | **Poise multiplies knockback and stagger from hits without `armorBreak`.** Berserker 0.5, other jobs 1.0, dragon immune: no knockback, stagger or armorBreak from players. |
| G5 | **Rear hits:** the attacker is inside the target's rear 120° cone. Only `rearMult` moves use it. The dragon has no rear cone. |
| G6 | **Speed ladder:** N 230 > S 195 > A 190 (100 while drawing) > M 175 > B 165. |
| **G7 [decision]** | **The fire ring shrinks from 24.0 s to 34.0 s, radius 460 → 160** (v1: 30 → 40 s, 180). Contact is forced from about 33 s, about 12 s before the 45 s timeout. Out-of-ring damage and push are unchanged. Changes combat-design §6. |
| **G8 [decision]** | **Lead on `lead` moves (archer quick and full shot only).** Soft aim targets p + v·min(flight time, 12f), inside the ±25° cone. Humans and AI get the same assist. A target that keeps strafing is hit; one that stops or reverses after the release is missed. Changes combat-design §2.1. |
| G9 | **`intendedMatchups = [{winner, loser, tier}]` is UI metadata** (job select, VS screen). A CI test asserts that every listed edge passed A3 in the last confirmed run. Damage never reads it. |

**Parry outcomes** (window f6–23, front 180°; the parry ends on its first success tick; a whiff costs 24f recovery and a 240f cooldown):

| Flag | Moves | Result | successCd | Riposte |
|---|---|---|---|---|
| `counter` | sword string; ninja dagger from the front | negated, then an automatic counter-slash: P 2.0, 4f startup, reach 70 | 90f | yes |
| `counter` | dragon claw, tail | as above (v1) | 240f | no |
| `reflect` | quick shot, full shot, Volley, kunai | the projectile turns back at ×1.0 speed with P ×0.5. It loses pierce, uses the reflector's ATK, cannot be reflected again and gets no First Strike. | 90f | yes |
| `reflect` | dragon fireball | P 1.0 (v1) | 240f | no |
| `crush` | greataxe, whirlwind ticks | negated; the parry ends with no counter, pushback 24 px, 8f blockstun | 240f | no |
| `absorb` | arcane bolt | negated; the parry ends with no counter and no whiff recovery | 240f | no |
| `unparryable` | meteor, Shoulder Charge, dragon breath / charge / dive, ring | no effect | — | — |

### 4.3 Kit changes per job (v1 → v2; anything not listed stays v1)
**Swordsman**
- Speed **195**.
- Parry results follow the table above.
- String finisher P 1.6 → **1.5** (power budget).

**Archer**
- Speed **190** (100 while drawing).
- Full draw 36 → **40f**.
- Full shot gains:
  - knockback **40 px + 10f stagger**, scaled by poise;
  - `cancelsProjectiles`: destroys bolts and kunai, not fireballs;
  - `lead`.
- Quick shot gains `lead`.
- Backstep **keeps the draw progress**.
- Volley and First Strike unchanged.

**Mage**
- Speed **175**.
- Arcane bolt: lifetime **45 ticks (≈ 360 px)**, parry flag `absorb`.
- **Loaded meteor:**
  - The 12f cast and v1 targeting stay: the mark goes on the soft-aim target within ±25° and ≤ 288 px, otherwise 192 px ahead.
  - Holding the skill after the cast keeps it loaded for up to 24f. The mage moves at 50% speed and the rune glows on the mage.
  - Release, or the end of the 24f, places the mark instantly.
  - The mark (r 56, fuse 30f, P 2.2, knockback 96, unparryable, **`armorBreak`**) is shown only from release.
- Meteor cooldown 240 → **210f**.
- Reserve lever, used only if M>S or M>B measures low: **blink echo**. The departure point detonates after 24f (r 48, P 0.8).

**Ninja**
- Dagger P 0.6 → **0.7**, with `rearMult` **1.5** (P 1.05 from behind; does not break armor).
- Shadow Step **passes through bodies**.
- Kunai lifetime **16f (≈ 240 px)**, parry flag `reflect`.
- Evade unchanged; ring and whirlwind ticks still count toward it.

**Berserker**
- Speed **165**, **poise 0.5**.
- Axe: flag `crush`.
- Whirlwind: **full armor** for the spin, flag `crush`.
- Shoulder Charge: flag `unparryable`. Cooldown **stays 60f**: the dodge cycle must be ≤ 78f to cover dragon hazards.
- Rage unchanged.

### 4.4 Side effects
| Change | Touches | Check |
|---|---|---|
| reflect ×0.5 and Riposte | S–A, S–N | A12 parry-turtle script |
| absorb, crush | S–M, S–B | intended |
| full-shot knockback, lead | archer vs S, M, N; berserker at half | general archer buff, offset by the 40f draw (A2) |
| poise 0.5 | berserker vs all: shorter finisher push and meteor knockback | B budget (A2) |
| ring G7 | every pair; mostly hurts A and M late | A8 time buckets; designed signs must hold |
| kunai cap | N vs all | N>A, N>M must still pass A3 |
| loaded meteor | M vs all | A tap behaves exactly like v1 |
| backstab, pass-through | N vs all | B>N stays ≥ 60 (A12 backstab-loop script) |

### 4.5 Dragon fight (PvE) protections
- The swordsman's parry against the dragon stays v1: 240f, no Riposte, fireball reflected at P 1.0.
- The dragon is immune to knockback, stagger and armorBreak, and has no rear cone.
- Berserker and mage dodge cycles stay at v1 (78f and 64f).
- The v1 phase-2 soft-enrage gap (62f) is checked by A14.
- **cobs_v1:** no layout change.
  - New meanings: a loaded meteor = opponent state startup at progress 1 with moveKind skill. Poise, lead and parry data are rules data.
  - The meteor mark enters a threat slot only on release.
  - `combat_rules_version` and its hash change. Record the meanings in combat-ai-spec §4 before the first training run.

## 5. Bots
### 5.1 Common model (combat-ai-spec §3)
**Perception and timing**
- Bots see the state `delay` ticks old: 5 / 10 / 16 (Hard / Normal / Easy), ±2 jitter per decision.
- Decisions happen every 4 live ticks; buttons are held as levels.
- ε: 0.03. Release timing ±4f. Spawn jitter ±8 px. Unique replay hashes ≥ 95%.
- **Bot noise is frozen. It is never tuned to change win rates or β.**

**Knowledge from data only**
- Bots read flags, armor windows, poise and `rearMult` from `DEFAULT_COMBAT_RULES`.
- They never use a matchup table keyed by job name.

**Bait before commit**
- When a ready opposing move's flag beats my main attack (a `counter`/`reflect` parry facing me, active armor, a loaded meteor), I bait it with p_bait 0.5: enter its threat range + 10 px and leave after 8–12f.
- I commit only when that move is on cooldown, in recovery, or wasted.

**Dodging**
- On seeing a projectile released toward me, I reverse my sideways direction (juke) with p 0.6.
- I dash if the time to impact is < 12f.
- Reactions fire at the earliest at t + delay. Anything faster can only be answered by a read with `p_read`.

**Bands derived from data**
- Default band = the job's §4.1 band, clipped to stay ≥ 20 px outside the opponent's fastest threat (reach + dash/charge distance) when the arena allows.

**Ring**
- After 22 s, stay ≥ 40 px inside the ring.
- Kiters flee toward open space.

### 5.2 Style presets
| Parameter | aggressive | balanced | cautious |
|---|---|---|---|
| Band | ×0.8 | ×1.0 | ×1.2 |
| `p_read` | ×0.6 | ×1.0 | ×1.4 |
| Punish if opponent's recovery ≥ | 0f | 6f | 12f |
| Disengage when behind on HP ratio by | never | > 30% | > 0% |
| Keep distance when ahead after 24 s (stall stress test) | no | no | yes |
| ε | 0.05 | 0.03 | 0.02 |

### 5.3 Archetype scripts (balanced)
**Swordsman**
- Holds the opponent's reach + 20 px against melee jobs. Weaves (±20°) toward ranged jobs and dashes in at 140–200 px.
- Reactive parry when a `reflect` projectile's perceived time to impact is 6–23f.
- Never parries `absorb`, `crush` or `unparryable` moves.
- Read parry (`p_read` 0.35) when the opponent is inside its reach + 16 px with its attack ready.
- Dashes in after a Riposte.

**Archer**
- Holds 260–420 px. Below 220 px, backsteps (keeping the draw) or flees to open space.
- Releases a full shot when:
  - the target is committed (≥ 12f left in a move),
  - the target's dash is down,
  - the target has been moving in a straight line for ≥ 12f (the lead works), or
  - the shot has been held 60f.
- Quick shot below 200 px.
- Against a facing swordsman with parry ready: quick-shot baits at 150–190 px; full shots only while the parry is on cooldown.
- Volley when the opponent dashes toward it or is below 180 px.

**Mage**
- Holds 180–320 px; fires a bolt whenever ready at ≤ 340 px.
- Casts the meteor when the target is in the cone and ≤ 288 px.
- Holds it loaded and releases when the opponent commits (startup or recovery ≥ 12f, or dash down), otherwise at 24f.
- Blinks when the opponent is ≤ 100 px away, or on a melee startup or charge seen within 120 px. Blinks away, turned up to 60° toward the centre, then bolts.

**Ninja**
- Hovers at 100–140 px, about 35° off the opponent's facing.
- Dives when the opponent is in recovery, drawing, casting, has a locked facing, or has its counter on cooldown (bait rule).
- Two stabs, then retreats 120–160 px.
- With 2 step charges and the opponent's facing locked, steps through for a backstab.
- Kunai at ≤ 240 px when the opponent is drawing, casting or fleeing.
- Reactive steps through marks, full-shot releases, whirlwind starts and axe startups.

**Berserker**
- Steers toward a cut-off point: the target's position plus its velocity, pulled toward the ring centre.
- Charges at 90–150 px, also through arrows. Jukes against full shots.
- Axe when the predicted target position at +14f is within 72 px.
- Whirlwind when the opponent is ≤ 80 px away and ready or diving (p 0.5). Against a ninja with 2 step charges, prefers the whirlwind over the axe.
- Aggressive preset in Rage.

### 5.4 Validity floors (if one fails, fix the bot first)
| Job | Floor |
|---|---|
| S | ≥ 3 parries per 30 s against A; ≥ 35% reflect |
| A | median distance ≥ 250 against melee jobs; full-shot hit rate against B 30–70% |
| M | meteor hit rate 15–45%; median distance 180–320 |
| N | ≥ 6 in/out cycles per 30 s; backstabs ≥ 15% of dagger hits against B; ≥ 1 parry bait per 10 s against S |
| B | ≥ 1 armored trade per 10 s against N; ≥ 1 charge per 10 s against ranged jobs; dodges ≥ 25% of full shots at ≥ 300 px |

### 5.5 Degenerate-strategy suite (adversarial scripts that know the opponent bot's rules)
| Script | Pairs it targets |
|---|---|
| kite-to-timeout | the faster job with any poke: N vs all, S vs B, A vs M and B |
| lead-and-run | take the first hit, then flee |
| parry-turtle | S stands facing the opponent with parry ready |
| armor face-tank | B moves forward only during armored moves |
| backstab loop | N steps through every axe or string |
| loaded-meteor camp | M kites with a loaded meteor |
| stagger lock | A fires only max-range full shots |

## 6. Tuning loop and acceptance
### 6.1 Harness
- **Unit:** a side-swapped pair (same seed, styles, delays and stats; arriver and spawns mirrored), scored 0 / 0.5 / 1.
- **Per fight, JSONL:** rules version, seed, pair, side, styles, delays, stats, entry HP, winner, ticks, timeout, damage and hits by move, distance histogram, replay hash.
- **Strata**, sampled per fight:
  - style 3×3;
  - delay: the headline pools Normal and Easy; Hard is its own stratum;
  - entry HP {100, 60, 35}% per side, which covers Rage and Last Stand states.
- **Stat regimes:**
  - (a) default stats;
  - (b) draws from `stat_dist_v1`;
  - (c) upgrade budgets of +10, +25 and +50 coins;
  - (d) ΔATK {+1, +2, +3, +6} to the underdog;
  - (e) equal stats 45/5/5, as a kit-only diagnostic.
- **Analysis output:**
  - Wilson CIs;
  - power + cycle split with bootstrap CIs;
  - Nash weights and the Nash value of the style sub-game;
  - β and m*;
  - restricted-play deltas;
  - fight-end buckets (< 24 s, 24–34 s, > 34 s);
  - a diff against the previous run.

### 6.2 Loop (one rules change per iteration)
0. **Calibrate.** Check the floors, then mirror sanity. Measure β. **If β > 1.6, ask D2 now.**
1. **Screen.** 200 pairs per job pair, with SPRT (0.5 vs 0.6, α = β = 0.05).
2. **Diagnose** with damage share, hit rates, time to kill, timeouts and restricted play.
3. **Change knobs.** First general job power (main-attack P, speed) until A2 passes, then the per-edge knobs from §3.5. Touch S, K or HP last. Bump `combat_rules_version` and write the reason in the commit body.
4. **Re-run with common random numbers** and judge the paired difference.
5. **Confirm.** 1,100 pairs per job pair, plus: the style sub-game, delay and entry-HP strata, the ΔATK sweep, budgets, mirrors, the A12 suite (7 scripts × 400) and A14 (5 jobs × 1,000).
6. **Hold out** with perturbed scripts (bands and thresholds ±20%), and later the trained combat model.
7. **Human playtests** for feel and exploits on contested cells.
8. **CI:** a fixed-seed suite of 200 per pair with wide bands. The full matrix runs nightly.

### 6.3 Acceptance criteria
| ID | Criterion |
|---|---|
| A1 | Harness sanity: arriver wins 45–55% of mirrors; P1/P2 gap < 2 points; unique replay hashes ≥ 95% |
| A2 | Each job averages 47–53% against the field (headline, and again in `stat_dist`); power r_i within ±0.12 logit; within 46–54% at the +10, +25 and +50 budgets |
| A3 | Majors 60–68, minors 56–64, lower 95% bound > 54; tier order as in §3.2 |
| A4 | Pooled cells ≤ 68; Normal/Easy stratum cells ≤ 70; Hard cells ≤ 75 |
| A5 | Every designed sign holds: balanced vs balanced, ≥ 7 of 9 style pairs, Normal and Easy, entry HP 100% and 60%, style Nash value |
| A6 | Nash weights 0.12–0.28; no job weakly dominated |
| A7 | m* is reported per edge. Blocking only if a major flips at +1 ATK (m* < 1.2), which then goes to D2 |
| A8 | Timeouts ≤ 10% per pair; median fight 20–30 s; ≥ 85% of fights end before 40 s; signs hold in the < 24 s bucket |
| A9 | Turning off any one verb costs that job 3–20 points |
| A10 | Median distance inside each job's band; each job's top damage source is a different move type; pairwise action Jensen-Shannon divergence ≥ 0.2 |
| A11 | Every A3 sign survives ±10% on each tuned knob and ±1 on any stat |
| **A12** | Each degenerate script scores ≤ 45% against the Normal balanced bot of a job it is designed to lose to, and averages ≤ 52% against the field. Timeouts with a script ≤ 15% |
| **A13** | Full-game sims with real-time duel outcomes (matrix lookup, plus 2k full-combat games): job win share within ±8 points of fair share for each lobby size (2p 42–58, 3p 25–42, 4p 17–33); no single lobby beyond ±12. Ninja duel win rate in full games ≤ 53% |
| **A14** | Dragon, Normal bot, each job: < 10% at its start stats; 40–60% at reference ATK 9 / DEF 8 / HP 70; best minus worst ≤ 15 points; parry counters ≤ 35% of the swordsman's dragon damage; scripted dodge-coverage check passes for every job |

## 7. Stat gaps
**Model.**
- Win logit = β·(κ − log m), where m is the underdog's CP multiplier and κ the edge size.
- The parity point m* = e^κ does not depend on β. The win rate at equal stats, σ(βκ), does.

**Targets at β ≈ 1.2** (+1 ATK ≈ 0.18 log CP; +1 DEF ≈ 0.065, or 0.04 against the mage; +6 maxHp ≈ 0.12):
- Majors: m* ≈ 1.6, about +3 ATK.
- Minors: m* ≈ 1.4, about +2 ATK.

**Likely reality.** Deterministic damage and low-noise bots probably give β > 1.6. Then counters fade after one or two upgrades.
- My recommendation for D2: keep the equal-stat bands and caps, which is what players feel, and accept that counters matter most early in the game.
- The alternative is to compress stats inside combat, which changes combat-design §4.

**Passive states.** Test each: Rage on, Last Stand used and unused, and Arcane Pierce against stacked DEF.

## 8. Integration and open decisions
**Docs to update once approved:**
- combat-design §2.1 (G8), §4 (G1), §5 (kits, ten-edge table, way-out column), §6 (G7), §7 (dragon protections), §11 (knobs);
- art-direction §11.4: the readability language:
  - a red weapon glint at startup on `crush` and `unparryable` moves, never an icon over the body;
  - a metal outline during armor frames, with a clank spark;
  - a facing wedge under each fighter, with the rear cone shown when a ninja is within 120 px;
  - a Riposte flash;
  - five distinct parry-outcome effects;
  - the loaded-meteor rune glow;
- combat-ai-spec §1 (bots) and §4 (field meanings).

**Board use.**
- Show the ring at job select and on the VS screen from G9.
- Train the combat outcome model on the validated bot pool, so that "용의 눈" and HeuristicBot learn the matchups.

**Decisions:**
- **D1:** fractional HP (G1). Recommended.
- **D2:** stat robustness vs edge size. Ask after calibration.
- **D3:** bot taxonomy. The `balanced/aggressive/cautious` presets × job scripts vs combat-ai-spec's `rusher/kiter/turtle`.
- **D4:** dice mode. Stay matchup-blind, or add an edge table, which needs a `rush-2` bump and new goldens.
- **D5:** doc mismatch. combat-design uses S HP 56, N 30, B 49 and Dragon 115; `DEFAULT_RULES` has 53, 34, 47 and 88.
- **D6:** pick order. Recommended: blind simultaneous picks (online hidden lock-in; hot-seat random by default).
- **D7:** ring timing (G7). Recommended.
- **D8:** archer lead (G8). Recommended.

## 9. Sources
- **Schreiber:** [Intransitive mechanics](https://gamebalanceconcepts.wordpress.com/2010/09/01/level-9-intransitive-mechanics/) · [Situational balance](https://gamebalanceconcepts.wordpress.com/2010/08/11/level-6-situational-balance/)
- **Sirlin:** [Yomi](https://sirlin.net/articles/game-balance-and-yomi) · [Fantasy Strike](https://sirlin.net/posts/game-balance-and-fantasy-strike) · [Part 2](https://www.sirlin.net/articles/balancing-multiplayer-games-part-2-viable-options) · [Part 3](https://www.sirlin.net/articles/balancing-multiplayer-games-part-3-fairness) · [Guilty Gear](https://www.sirlin.net/articles/designing-defensively-guilty-gear)
- **Jaffe:** [Metagame (GDC 2015)](https://gdcvault.com/play/1022155/Metagame) · [Restricted Play](https://ojs.aaai.org/index.php/AIIDE/article/view/12513)
- **critpoints:** [Counterplay](https://critpoints.net/2025/05/06/building-counterplay-for-pvp-games/) · [Frame data](https://critpoints.net/2023/02/20/frame-data-patterns-that-game-designers-should-know)
- **Riot:** [Classes](https://archive.runeterra.net/na/riot-official/VpVuQRtu) · [Values](https://archive.runeterra.net/na/riot-official/m1tKGoHQ) · [Balance framework](https://www.leagueoflegends.com/en-us/news/dev/dev-champion-balance-framework/)
- **Archetypes:** [lucio](https://lucio.bearblog.dev/fgc-rock-paper-scissors/) · [SmashLabs](https://smashlabs.design.blog/2020/05/03/archetype-triangle/)
- **SmashWiki:** [Soft counter](https://ssbwiki.com/Soft_counter) · [Stalling](https://www.ssbwiki.com/Stalling) · [Plank](https://www.ssbwiki.com/Plank) · [Heavy](https://www.ssbwiki.com/Heavy) · [Armor](https://www.ssbwiki.com/Armor) · [Reflection](https://www.ssbwiki.com/Reflection)
- **Stunlock / Battlerite:** [007](https://blog.stunlock.com/dev-blog-007/) · [PC Gamer on Battlerite](https://www.pcgamer.com/battlerite-is-bite-sized-moba-mayhem)
- **Blizzard:** [Overwatch balance](https://overwatch.blizzard.com/en-us/news/23652236)
- **Aim and readability:** [Leading the target](https://www.gamedev.net/tutorials/programming/math-and-physics/leading-the-target-r4223/) · [ARPG readability](https://www.gamedeveloper.com/game-platforms/designing-for-difficulty-readability-in-arpgs)
- **Maths:** [RPSLS](https://www.samkass.com/theories/RPSSL.html) · [Tournaments](https://en.wikipedia.org/wiki/Tournament_(graph_theory)) · [Lion and man](https://arxiv.org/pdf/0909.2524)
- **Evaluation:** [Balduzzi 2018](https://arxiv.org/abs/1806.02643) · [2019](https://arxiv.org/abs/1901.08106) · [EA](https://arxiv.org/abs/1903.10545) · [fishtest](https://official-stockfish.github.io/docs/fishtest-wiki/Fishtest-Mathematics.html) · [FightingICE](https://ice.ci.ritsumei.ac.jp/~ftgaic/index-3.html)