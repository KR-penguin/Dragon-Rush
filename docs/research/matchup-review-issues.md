I reviewed proposal v1 against `docs/combat-design.md` (v1 kits, §6 ring, §7 dragon), `docs/combat-ai-spec.md` (§3 delays, §4 cobs_v1) and `packages/engine/src/rules/defaultRules.ts`. `packages/combat*` has no code yet, so I could not simulate. Every number below is worked by hand from the v1 frame data and the damage formula (S = 1.6, K = 10, fractional HP as in G1).

## What holds up
- **The ring is valid.** It is the only 5-node regular tournament that fits the seven combat-design §5 edges (S>N, S>A, M>S, B>N, N>M, N>A, A>B). Those force B>S, A>M and M>B.
- **The tier maths is right.** The circulant skew matrix [0, a, b, −b, −a] goes singular at neighbour/skip = 1.618. Minor edges (neighbours) at 60 and major edges (skips) at 64 give a ratio of 0.71, which is safe.
- **The figures check out.** CP figures (S 4,293, B 4,054, A 3,969, M 2,880, N 2,331) and all hits-to-KO figures match.

## Severity legend
- **Critical:** a designed edge flips or a job becomes dominant against humans.
- **High:** likely breaks a cap, PvE, or game-level fairness.
- **Medium:** a measurement or bot artifact, or readability.
- **Low:** docs or hygiene.

---

### C1. Kite-to-timeout and lead-and-run flip three designed edges (Critical)
**What breaks:**
- A timeout is decided by HP ratio. The ring only forces contact once its radius is about 200 px or less (berserker charge 128 + axe reach 72), which happens at about 39.3 s. That leaves roughly 6 s before the 45 s timeout.
- Ninja kunai do 2.13 per charge against DEF 5. Sustained output is 1.42 dps, or 42.7 damage in 30 s if every kunai lands.
- A berserker (165 px/s plus a 128 px charge every 78f) cannot catch a 230 px/s ninja with two step charges in an open 800×448 arena. A faster evader escapes indefinitely: this is lion-and-man with a faster man.
- Any chip damage plus clean evasion therefore wins on timeout. B>N (major), S>N and B>S (minor) can all flip. In B>S, the swordsman takes one whiff-punish lead and then runs at 195 against 165.
- The bots hide this. The ninja script only throws kunai at targets that are drawing, casting or fleeing, so no bot ever tries it. Humans will.
- The "cautious" preset ("keep distance when ahead after 30 s") is this strategy.
- Precedent: SmashWiki treats stalling to run out the timer as a degenerate strategy that rulesets must cap (ledge-grab limits).

**Fix:**
- **G7 [decision]:** the ring shrinks from 24 s to 34 s, radius 460 → 160 px. Contact is then forced from about 33 s, giving about 12 s instead of 6 s.
- **Kunai range cap:** lifetime 16f, about 240 px, which is inside the berserker's charge-plus-reach threat zone. Kunai become a punish, not a kiting tool.
- **New acceptance A12 (degenerate-strategy suite):** adversarial kite-to-timeout and lead-and-run scripts must score ≤ 45% against the designed winner's Normal bot.

### C2. Reflect lets the swordsman out-zone the archer while standing still (Critical/High)
**What breaks:**
- In v1, a reflected full shot keeps P 1.6 and pierce and uses the swordsman's ATK: 8.0 damage to the archer. The swordsman takes 10.24 per shot that gets through. HP is 53 vs 39.
- With a 90f success cooldown, a swordsman who never approaches wins the ranged HP race (≈ 4.9 parry cycles to kill the archer vs ≈ 5.2 to die).
- The best play becomes parry-turtling until the ring closes, the opposite of "S wins by closing".
- Bots react in 10+6 = 16f. On reaction they parry quick shots from ≥ 192 px and full shots from ≥ 256 px. At Hard delay (5f), the archer has no safe action at its own range, so the 70% cap breaks.

**Fix:**
- Reflected projectiles fly at ×1.0 speed, deal **P × 0.5**, lose pierce, and never get First Strike (`reflectPMult` data).
- Riposte still refunds the dash, so each correct read is worth 128 px of approach, not a damage race.
- A turtling swordsman now loses the HP race and has to approach.
- Score Hard as its own stratum with a 75% cap (see M14).

### H3. Straight shots can be dodged by strafing on reaction (High)
**What breaks:**
- Soft aim snaps to the target's current position. To dodge, a target needs 12 px hurtbox + about 4 px arrow radius = 16 px of sideways movement.
- At 300 px a full shot flies 18.75f. After a 10f reaction, sideways movement in the remaining time is: N 33 px, S 28, M 25, B 24. Everyone escapes.
- At 250 px it is marginal (B 15.5 px).
- The archer's band is 260–420 px, so A>B and A>M depend on whether bot pathing happens to move sideways. The berserker's cut-off steering does. These edges come from bot behaviour, not mechanics.

**Fix:**
- **G8 [decision]:** archer shots aim at p + v·min(flight time, 12f), still inside the ±25° cone. Humans and AI get the same assist.
- Steady strafing gets hit. A target that stops or reverses after the release is missed, which is a guess, not a reaction check ([leading the target](https://www.gamedev.net/tutorials/programming/math-and-physics/leading-the-target-r4223/)).
- Bots dodge by **juking** (reversing sideways direction), with a floor in §5.4.
- No lead on kunai, because it would make kunai kiting stronger.

### H4. Full-shot knockback is a soft stun-lock on the slowest job (High)
**What breaks:**
- A full shot does 48 px knockback plus 12f stagger, so the berserker loses about 80 px per hit. During one 36f draw it only gains about 39 px on an archer walking back at 100 px/s.
- Over a 108f cycle (3 shots, one charge), even a cornered archer pushes the berserker back about 240 px, while the berserker's armored closing is 375 px minus whatever arrows it eats.
- If every shot lands, A>B is far above 70%. Combined with H3, A>B swings between about 50% and 85% depending only on dodge AI.

**Fix:**
- Full-shot knockback 40 px / stagger 10f, scaled by a new **per-fighter `poise`** (G4):
  - berserker 0.5, so it takes 20 px / 5f;
  - other jobs 1.0;
  - dragon immune.
- `armorBreak` ignores poise.
- This fits the heavyweight archetype (SmashWiki: weight is knockback resistance) and stops the lock.

### H5. Side effects on the dragon fight, with no PvE acceptance at all (High)
Killing the dragon wins the game, so PvE balance per job decides games.

**What breaks:**
1. The 90f success cooldown and Riposte also apply to dragon claw, tail and fireball. The swordsman can counter about every 100f (P 2.0 = 10.0 vs DEF 6), so it becomes the best dragon slayer.
2. "The dragon has no armor flag" means it is a normal target. Full-shot knockback/stagger would stagger-lock the boss every ~50f, and `armorBreak` and `rearMult` behaviour against it is undefined.
3. Raising Shoulder Charge's cooldown from 60f to 90f makes the berserker's dodge cycle 108f. Dragon gaps are 78–108f in phase 2, or 62f under soft enrage. Combined with speed 165, the berserker is forced to eat telegraphed hazards (§7.6 "every hazard dodgeable with one dash").
4. §6.3 has no PvE criterion.

**Fix:**
- Parry results become **per-move data** (`successCd`, `riposte`, `reflectPMult`). Dragon moves keep v1: 240f, no Riposte, fireball reflected at P 1.0.
- The dragon gets `poise: immune` (no knockback, stagger or armorBreak) and has no rear cone.
- Shoulder Charge cooldown stays at **60f**.
- **New acceptance A14:** per-job dragon win rate at reference stats is 40–60%, best minus worst ≤ 15 points, plus a scripted dodge-coverage check.

### H6. Kit changes move S and A the wrong way for their power budget (High)
**What breaks:**
- §3.5 says the swordsman needs −0.23 and the archer −0.15 (net nerfs).
- Yet the swordsman gets +5 speed, a 240→90f cooldown and Riposte. The archer gets knockback, stagger, projectile cancel and a draw-keeping backstep, offset only by −10 speed.
- The starting point probably makes S and A the top two. The loop's "general knobs first" step would then nerf the very moves the edges rely on.

**Fix:**
- Every buff ships with a stated compensating nerf in the starting values:
  - swordsman: finisher P 1.6→1.5, plus the ½ P reflect;
  - archer: full draw 36→40f.
- Add a sign-check table (§3.6) so the first iteration starts near budget.

### H7. "50% against the field" is not what players get (High)
**What breaks:**
- Lobbies have 2–4 *unique* jobs:
  - Every 2-player game has a 60–64% favourite.
  - Five of the ten 3-job lobbies are transitive: one job beats both others, for example {S, N, A}, where S wins 60 and 64.
  - Every 4-job lobby leaves two jobs with 2 wins and two with 1.
- With sequential visible picks and the ring shown at job select (G6), the later picker counter-picks.

**Fix:**
- **D6 recommended default:** blind simultaneous picks (online: hidden lock-in; hot-seat: random by default or pass-the-screen).
- **New acceptance A13:** per-lobby job win share in full-game sims within ±8 points of fair share.

### H8. Stat-robustness targets are probably unreachable, and tuning β through bot noise is circular (High)
**What breaks:**
- Damage is deterministic and bots have ε = 0.03, so same-job fights with a stat gap will be close to deterministic. β is likely ≫ 1.6.
- At β = 3, a 64% edge has m* ≈ 1.21, so it flips at +1 ATK.
- §7's "lower β by design… confirm bots use mix-ups" ends up tuning balance through bot noise parameters.

**Fix:**
- A7 becomes report-only, with one blocking floor: no major flips at +1 ATK (m* ≥ 1.2).
- D2 is asked right after calibration (loop step 0), not at the end.
- Bot noise is frozen and never adjusted to hit β.

### M9. Hold-to-aim meteor contradicts the bots and nerfs the mage where it most needs power (Medium)
**What breaks:**
1. Soft aim fixes the *angle* toward the target's current position, and only distance is chosen. The bot aims at a predicted 2-D point (pos + vel × (42+delay)), which the kit cannot reach for sideways motion.
2. The reticle is visible for up to 60f and facing is locked, so the defender just steps off the line. That is a net nerf against S and B, exactly the edges that need ×2.0–2.5 kit power.
3. "A tap is exactly v1" is false: v1 places the mark *on the soft-aim target*.
4. The threat slot "ticks-to-active = 30 while held" is wrong data.

**Fix: a "loaded meteor".**
- Keep v1 targeting.
- After the 12f cast, holding keeps it loaded for up to 24f at 50% move speed, with a rune glow on the mage.
- Release places the mark instantly on the soft-aim target. The mark is shown only from release (30f fuse).
- The prediction becomes *when* to release, for example on the opponent's commitment. This is a readable mind game, and the bot can execute it.

### M10. Several measured edges rest on missing bot behaviours (Medium)
**What breaks:**
- The ninja bot never baits the parry. It dives on recovery triggers only, so S>N is inflated.
- The berserker bot never dodges arrows.
- Archer and mage bands are hand-set constants that decide the A–M range war.
- Backstab loops against the axe's 39f facing lock (step on seeing the startup, two stabs of 4.48 during the recovery) may flip B>N for Hard bots.

**Fix:**
- A generic, data-driven **bait-before-commit** rule for every bot: if a ready opposing move's flag beats my main attack, bait it first.
- Juke dodge.
- Bands derived from move data.
- A hold-out run with bands ±20%.
- Adversarial scripts (A12). `rearMult` is the first knob for B>N.

### M11. `dispel` makes the swordsman's parry a trap (Medium)
**What breaks:** a 24f whiff recovery plus 240f cooldown for pressing parry against a projectile, when an arrow is reflected. It is unreadable and leaves no real way out (Riot design values).

**Fix:** `absorb`. The bolt is negated and the parry ends, with no counter and no whiff recovery, and the normal 240f cooldown. It has a distinct fizzle VFX.

### M12. Readability (Medium)
**What breaks:** five parry outcomes, armor windows, rear cones, the Riposte refund and the loaded meteor are mostly invisible.

**Fix: one visual language.**
- A red glint on the *weapon* at startup for every move that beats the parry (`crush`, `unparryable`). Not an icon over the body: Sekiro's 危 kanji is criticised for hiding the body.
- A metal outline exactly during armor frames, with a "clank" spark.
- A facing wedge under each fighter. The rear cone is shown when a ninja is within 120 px.
- A dash-icon flash on Riposte.
- Distinct SFX and VFX for each parry outcome.

### M13. Acceptance bands are as narrow as the measurement noise (Medium)
**What breaks:**
- The minor band 58–62 (±2) equals the per-cell 95% CI (±2.1). A true 60% cell lands outside it about 6% of the time, so about 27% of confirm runs fail one of the five minor edges.
- The gap between bot and human results is far larger than 2 points anyway.

**Fix:**
- Majors 60–68, minors 56–64.
- Keep the order explicitly: mean(majors) − mean(minors) ≥ 2, and each job's major win ≥ its minor win − 2.

### M14. Pooling superhuman Hard delay (5f) inflates reaction-based counters (Medium)
**What breaks:** reflect, the meteor walk-out and sidestepping all get stronger at 5f than any human manages.

**Fix:**
- The headline matrix pools Normal (10) and Easy (16).
- Hard is a stratum with a 75% cap.

### M15. Duels start at carried-over HP (Medium)
**What breaks:** a berserker at ≤ 50% HP starts in Rage, and Last Stand may already be used. The full-HP matrix misses both.

**Fix:**
- An entry-HP stratum {100, 60, 35}% for each side.
- A5 must hold at 100% and 60%.

### L16. Doc mismatch is wider than D5 says (Low)
combat-design §4 also uses Ninja HP 30 and Berserker HP 49. `DEFAULT_RULES` has 34 and 47, as well as S 53 vs 56 and Dragon 88 vs 115. Extend D5.

### L17. G6 `intendedMatchups` is a promise the matrix may not keep (Low)
**Fix:** a CI test asserts that every listed edge passed A3 in the last confirmed run.

### L18. Knife edges and the cobs_v1 note (Low)
- 3 meteors do 33.79 to a 34 HP ninja, so ±1 on any stat changes the kill count. A11 must include ±1 stat perturbations.
- cobs_v1 is not frozen yet, since no combat code exists. Still, record the new semantics (loaded meteor = opp.state startup at progress 1 + moveKind skill, poise, lead) in combat-ai-spec. The bogus held-reticle threat slot goes away with the M9 fix.

## Sources added by this review
- [SmashWiki: Stalling](https://www.ssbwiki.com/Stalling) · [Plank](https://www.ssbwiki.com/Plank) · [Heavy/weight](https://www.ssbwiki.com/Heavy) · [Armor](https://www.ssbwiki.com/Armor)
- [Lion and Man: Can Both Win?](https://arxiv.org/pdf/0909.2524)
- [Leading the target (gamedev.net)](https://www.gamedev.net/tutorials/programming/math-and-physics/leading-the-target-r4223/)
- [Readability in ARPGs (Game Developer)](https://www.gamedeveloper.com/game-platforms/designing-for-difficulty-readability-in-arpgs) · [Sekiro kanji criticism (Nexus forum)](https://forums.nexusmods.com/topic/7510946-mod-request-coloured-kanji-for-sweepthrust-attacks)
- [Battlerite sudden-death zone (PC Gamer)](https://www.pcgamer.com/battlerite-is-bite-sized-moba-mayhem)
- [Sirlin, Game Balance and Yomi](https://sirlin.net/articles/game-balance-and-yomi): re-checked, 0 of 210 matchups at 7-3.