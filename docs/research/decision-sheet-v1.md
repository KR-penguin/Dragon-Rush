# Dragon Rush (드래곤 러쉬): implementation decision sheet v1

**Tags:**
- **[BU]** board-ui report
- **[GF]** game-feel report
- **[CD]** combat-design report
- **[SN]** sim-netcode-rl report
- **[J]** my judgment, not sourced; tune it in playtests

Every number here is a v1 default.

**Repo facts used** (read-only):
- Starting HP/ATK/DEF:
  - swordsman 56/5/5
  - archer 39/6/6
  - mage 38/4/5
  - ninja 30/4/5
  - berserker 49/5/5
- Dragon 115/10/6, `breathEvery` 3, and breath ignores DEF.
- `indomitableUses` 1 per game.
- Archer gets +3 on the first attack.
- Mage divides DEF by 2.
- Ninja evade die is 1/8.
- Berserker rage is 13/10.
- Duel tie goes to the arriver; at the dragon cap the challenger loses.
- Dragon HP resets on every challenge.
- 24 tiles, corners 0 START / 6 SHOP / 12 INN / 18 SHOP, 22 unique tile ids.

---

## 0. Ground rules
1. **The board rules stay as they are.** The one behavioural change is that duels and dragon challenges are fought in real time (user item 5). The current dice resolver is kept as the `dice` mode.
2. **Two learned models and one script.**
   - Board policy: `obs_v1`/`act_v1`, unchanged.
   - Combat policy: `cobs_v1`/`cact_v1`, new.
   - The dragon is a scripted, deterministic state machine [CD][SN].
3. **Determinism boundary.** `packages/combat` is pure integer TypeScript. FX, camera and audio only *subscribe* to sim events, and they use their own RNG and clocks (`simTime` / `fxTime` / `uiTime`) [GF][SN].
4. **Presentation never feeds the sim.** Only hitstop, knockback, telegraph timings and the input buffer live in the sim, so they are identical in training.

---

## 1. Art direction: "Ember Table" (불씨의 작전 탁자) [BU]
**Concept.** A carved walnut war table lit from below by the dragon lair. Tiles are parchment plaques, heroes are painted cardboard standees, and the UI is gold-trimmed stationery. The tone is a dark fairytale in warm light. The board is the hero, the HUD sits in the corners, and there is one focal point at a time.

### 1.1 Palette (CSS tokens on `:root`; mirrored as constants for the canvases)
| Token | Hex | Use |
|---|---|---|
| `--table-0` / `--table-1` | #0F0B0A / #1A1210 | backdrop |
| `--wood-dark` / `--wood` / `--wood-hi` | #3B2618 / #5A3A22 / #8A5A32 | board rim, dock |
| `--parchment` / `--parchment-shade` / `--parchment-hi` | #EAD9B5 / #D8C29A / #F6EBD3 | tiles, cards |
| `--ink` | #2B1D14 | text on parchment (11.7:1) |
| `--gold` / `--gold-hi` / `--gold-deep` | #D9A441 / #F6D47A / #8A6424 | trim, titles |
| `--ember` / `--ember-hot` / `--ember-glow` | #C8402A / #FF7A3D / #FFB25B | dragon, danger, lair light |
| `--panel` / `--panel-2` / `--panel-line` | #1E1512 / #2A1D18 / #4A3524 | HUD cards |
| `--bone` / `--bone-dim` | #F1E6D2 / #B8A68C | HUD text |
| `--good` / `--bad` / `--special` / `--safe` | #3E7D4A / #A3322B / #6B4FA8 / #2F6E7C | tile category gems |
| `--felt` | #1F3A2E | dice tray |
| `--moon` | #8FB3D9 | shield bubble, non-damage telegraphs, night vignette |
| `--hazard-fill` / `--hazard-edge` [J] | #FF7A3D (α .35→.60 while filling) / #FFB25B | arena damage telegraphs, always hatched |
| `--outline` [J] | #1A1210 | 1-logical-px sprite outline |
| `--lowhp` [J] | #6E2A22 at α ≤ .20 | desaturated low-HP edge vignette |

**Seat colours:**

| Seat | Colour | Crest |
|---|---|---|
| 1 | #D9443A | shield |
| 2 | #2F78D6 | diamond |
| 3 | #23935A | leaf |
| 4 | #F0B429 | star |

- These replace `SEAT_COLORS` in `labels.ts`.
- Seat colours are used only as rims, rings, ribbons and crests, never as area fills.
- White text on a seat colour only at 18 px bold or larger; on amber, use ink text.
- The purple panel family is removed.

### 1.2 Typography [BU]
- **Load:**
  - `Hahmlet:wght@500;700;900`
  - `Black Han Sans`
  - `Noto Sans KR:wght@400;500;700`
  - `Gowun Batang:wght@400;700`
  - `display=swap`
  - Self-host through Fontsource for offline and hot-seat play.
- **Roles:**
  - `--font-display` Hahmlet: logo, titles, tile names, card titles.
  - `--font-impact` Black Han Sans: numbers, dice, damage and Korean banners. It has **no Latin**.
  - `--font-ui` Noto Sans KR, with `tabular-nums` on every counter.
  - `--font-flavor` Gowun Batang: card flavour text.
- **Latin rule:** VS, KO and DRAGON RUSH are set in Hahmlet 900 or baked into images.
- **Callout words (Black Han Sans):** 회피, 패링, 선제!, 불굴!, 광폭!, 관통, 준비, 싸워라!, 승리, 패배.
- **Sizes at 1080p:**

  | Element | Size |
  |---|---|
  | Logo | 88 px |
  | Banner | 40 px |
  | Card title | 22 px |
  | HUD numbers | 22 px |
  | Body | 15-16 px |
  | Tooltip | 14 px |
  | Minimum rendered | 12 px |

### 1.3 Screen layout (1920×1080 reference, minimum 1280×720) [BU]
- **Corner player cards**, 320×116, with the portrait medallion at 96 px.
  - Contents: name ribbon in the seat colour, HP bar 200×14 with a 400 ms ghost-drain, ATK/DEF/coin as 24 px icons with Black Han Sans numbers, and 3 item sockets of 30 px.
  - With 2 players, use the top corners only.
- **Top strip:** turn-order coins (36 px, active one 48 px), a stone round dial, and 3 breath runes.
- **Bottom dock, about 150 px:**
  - Primary button 220×64 "주사위 굴리기".
  - Crimson "용에게 도전", shown only when legal.
  - Item cards that hover at −12 px, scale 1.05, 150 ms.
  - Upgrades open as an anvil tray.
- **Log:** a toast stack bottom-left (3 items, 4 s each). The full `GameLog` moves into a parchment "연대기" drawer.
- **Under 1100 px wide:** stacked fallback with a flat board (`rotateX(0)`).

### 1.4 Board and camera (DOM + CSS 3D, no engine) [BU]
**Layer tree:**
1. `.world-shake`, driven by the rAF trauma loop.
2. `.stage { perspective:1600px; perspective-origin:50% 35% }`.
3. `.camera`, driven only by WAAPI beats; `translate3d` + `scale`, 450-600 ms, `cubic-bezier(.2,.7,.2,1)`.
4. `.board3d { transform: rotateX(40deg); transform-style: preserve-3d }`, containing the tiles, `.token-layer` and blob shadows.
5. A screen-space particle `<canvas>`.
6. The HUD.

**Never on layers 2-4:** `filter`, `opacity<1`, `overflow:hidden`, `clip-path`, `mask`, `mix-blend-mode`, `isolation`, `contain:paint`. Any of these silently flattens 3D.

**Geometry:**
- Board plane 960 px.
- `grid-template: 1.5fr repeat(5,1fr) 1.5fr` gives corners 180×180, side tiles 120×180, and a 600×600 lair.
- Tilt range 36-42°.
- Rim: a 28 px walnut 9-slice with a gold bead.
- Plaque depth: `box-shadow: 0 6px 0 #6b4a2c, 0 10px 14px rgba(0,0,0,.45)`.
- Lighting: a warm pool `radial-gradient(circle at 50% 45%, rgba(255,140,60,.18), transparent 55%)` and an edge vignette to `rgba(0,0,0,.6)`.

**Camera beats:**

| Moment | Move |
|---|---|
| Turn start | pan 8% toward the pawn, zoom 1.04, 500 ms |
| Dice move | hold |
| Event tile | zoom 1.06, 250 ms |
| Duel or dragon | zoom 1.15 on the tile or lair over 400 ms, then a 250 ms claw-slash wipe to combat |
| Return | 600 ms ease-in-out |
| Victory | pull back 800 ms |

### 1.5 Tiles, landmarks, lair [BU + J]
- **Plaque.** Parchment gradient #EAD9B5→#D8C29A plus a grain texture. The icon is 64 px on the plane and the name is Hahmlet 700 at 15-16 px in ink.
- **Effect chips** sit at the bottom of the plaque (`+3 🪙`, `−5 HP`, rendered as icon plus a Black Han Sans number).
- **Remove `tile-index`**; show it only in the tooltip.
- **Hover:** `translateZ(6px)` with a gold rim and a screen-space tooltip.
- **Legend hover** lifts every tile of that category by 4 px.
- **Category gems [J]** (24 tiles):

  | Category | Tiles |
  |---|---|
  | good | GOBLIN, HERB, WOLF, TREASURE, BLACKSMITH, ORC, FOUNTAIN, TROLL. The hunts show both chips. |
  | bad | POISON_SWAMP, BANDIT, TRAP, PICKPOCKET, CURSED_ALTAR, ROCKFALL, SPIDER_WEB, STORM |
  | special | TRAINING, MYSTERY×2, WANDERING_MERCHANT |
  | safe | START, SHOP×2, INN |

- **Corners are standee landmarks** that billboard at `rotateX(-40deg)`:
  - START: banner gate
  - SHOP: merchant tent with a lantern
  - INN: timber inn with chimney smoke
  - Idle loops run 2-4 s.
- **Living lair** (600×600, cosmetic only):
  - Basalt crater with lava cracks (6 s `background-position` loop) and embers.
  - The dragon is asleep, awakens when someone may challenge, and roars on a challenge.
  - A segmented HP "scale" bar, always 115 because HP resets per challenge.
  - 3 breath rune stones and a "breath in N" intent icon.
  - Ember light +2% per round, capped at +30% [J].
  - Superseded UI proposal: win probability is not displayed in game; the outcome model is internal to bots and board env.

### 1.6 Pawns (standees) [BU + resolved GF]
**Construction:**
- Job art from bust to knees, on a round base in the seat colour with the seat crest.
- `transform: translate3d(x,y,0) rotateX(-40deg); transform-origin: 50% 100%`.
- Blob shadow at 70% of base width.
- Move with transforms only, never `left`/`top`.

**Hop:**
- The first step takes 160 ms. Each later step is ×0.9 shorter, down to 120 ms.
- The inner node rises to `translateZ` 30 px at 45% and is back at 0 by 85%.
- The shadow scales 1 → 0.7 → 1.
- Squash is (1.08, 0.92) on each step and (1.18, 0.84) on the final landing.
- The tile presses −2 px for 80 ms.
- The tick SFX rises 1 semitone per step.
- The final landing adds a dust puff and a tile glow.

**Around the pawn:**
- The rolled number floats above the head: Black Han Sans 40 px, gold with a dark stroke. It decrements on each hop and bursts at 0.
- The active pawn breathes 2 px over 1.6 s. Inactive pawns stand still.
- **Spotlight** is a screen-space overlay `radial-gradient(circle at var(--px) var(--py), transparent 9%, rgba(10,6,4,.35) 32%)` that fades in over 300 ms. The active corner card slides 10 px and scales to 1.06.
- The turn ribbon runs 600 ms in and holds 400 ms, for humans only.
- **Elimination:** the pawn topples (rotateX to 90°) over 350 ms. Its card cracks and desaturates over 500 ms; the class goes on the card, never on a 3D ancestor.

### 1.7 Dice [BU]
**Cube and tray:**
- A CSS 3D cube, 56 px, in a felt tray of 220×120 (#1F3A2E).
- Faces: 1 front, 6 `rotateY(180)`, 3 `rotateY(90)`, 4 `rotateY(-90)`, 5 `rotateX(90)`, 2 `rotateX(-90)`, each followed by `translateZ(28px)`.
- To land on the server's value, use the matching rotation plus 720° on X and 360° on Y.
- Faces are ivory `linear-gradient(145deg,#FBF4E6,#D9CCB3)` with an 18% corner radius and ink pips. The 1 pip is red (a dragon eye).

**Roll timeline:**

| Time | Step |
|---|---|
| on `pointerdown` (local human only) | rattle starts |
| 0-80 ms | lift |
| 80-600 ms | tumble along a 160 px path with 2 bounces, `cubic-bezier(.15,.6,.25,1)` |
| 600-700 ms | settle with a 4° overshoot, a clack SFX and a 2 px shake |

**After the roll:**
- The number pops 0 → 1.25 → 1 over 180 ms.
- Bots and remote players throw from their corner card.
- The ninja's ±1 shows as arrow buttons beside the die.
- There is no charge gauge, because the roll comes from the server RNG.

### 1.8 Event cards and dialogs [BU]
**Event card reveal:**
1. The tile flashes for 80 ms.
2. A card rises to centre, scale 0.4 → 1 over 200 ms with back-out easing.
3. It flips over 180 ms.
4. Chips fly to the owner's corner card over 250 ms with ease-in.
5. The count-up runs (300 ms when the change is 10 or less, 500 ms otherwise).
6. The card stays as a sticky for 1.2 s and does not block play.

**Dialogs become props:**
- Shop: a merchant stall.
- Training: an anvil with stat cards.
- Mystery: a deck at the cave mouth.
- Duel or dragon: a challenge scroll.
- Targeting: a world-dim overlay with gold rims on valid targets.

### 1.9 Combat art direction [CD + J]
- **Canvas:** logical 960×540 and 1 tile = 32 px, scaled to fit at 16:9 and rendered at devicePixelRatio. Art is authored at 2×: a sprite cell is 128×128, which is 64 logical px.
- **View:** 3/4 oblique with y-sorting, in a painted style that matches the standees (same character designs).
- **v1 sprites follow the Nuclear Throne approach:** a side-view body mirrored for left and right. True 8-direction aim is shown by rotated slash arcs and weapon sprites. Front and back facings are P2.
- **Fighter readability:**
  - A seat foot ring (ellipse 28×12 logical px, 2 px stroke).
  - The crest and a name tag above the head.
  - A 1-logical-px dark outline and a procedural ground shadow.
  - Mirror matches are told apart only by ring and crest; there are no palette swaps.
- **Floors** are mid-dark and low-saturation, with no red or orange inside the play area, so ember telegraphs stand out. Telegraphs draw above the floor and below the characters.
- **Combat HUD** (a 56 logical px top band):
  - Two HP bars with a 400 ms ghost-drain, and a central timer.
  - Skill and dash cooldown icons.
  - Passive pips: Last Stand shield, First Strike arrow, 8 evade pips, rage.
  - In dragon fights, a boss bar in crimson leather with 3 breath pips.
- **Transition in:**
  1. Board zoom to 1.15.
  2. Claw wipe, 250 ms.
  3. VS splash, 1.3 s: portraits slide in over 300 ms with easeOutBack; the clash flashes white at α ≤ 0.3 for 80 ms with trauma 0.55.
  4. READY for 1.5 s, showing keycap hints for each player.
  5. "싸워라!"
- **Transition out:** result card 1.2 s, then the wipe, then the board camera returns over 600 ms, then the HP count-down runs on the corner card.

### 1.10 Accessibility and settings [GF]
**Reduced motion** defaults from `prefers-reduced-motion` and can also be turned on in game. It applies:
- Tilt 0°.
- No pans, shake, zoom punch or slow-mo.
- Hops become 80 ms cross-fades and the die becomes a 150 ms fade.
- Particles at 50%.
- Hitstop is kept.
- Damage numbers fade in place.

**Other settings:**
- Shake slider, 0-100%, default 100.
- Photosensitive mode: no full-screen flashes at all.
- A volume slider per bus.
- Captions for critical sounds ("용이 숨을 들이쉰다!", charge, fire ring).
- An "animate background" toggle.

---

## 2. Effects: architecture and priorities [GF + BU]

### 2.1 Architecture
- **One rAF FX loop outside React.** It owns the trauma shake, the particle pool, floating text and the overlay canvas.
  - The particle pool is struct-of-arrays, capped at 500 live particles.
  - React renders static layout only. Effects write `transform`/`opacity` through refs or draw on canvas.
  - Use WAAPI for DOM one-shots and CSS `linear()` for elastic and bounce curves.
  - Animate only `transform` and `opacity`.
- **Event bus.**
  - Board events come from `eventTimeline.ts`.
  - Combat sim events: `Hit{attacker,target,dmg,kind,dir,pos}`, `Parry`, `Evade`, `LastStand`, `RageOn`, `TelegraphStart/End{kind,shape,ticks}`, `ProjectileSpawn`, `WallSlam`, `PhaseChange`, `BreathTick`, `KO`, `FightEnded`.
- **FX RNG** is an xorshift seeded from the fight seed or the event id, never the sim RNG.
- **Frame-rate independence.** Linear decays use `×dt`; exponential decays use `pow(k, dt*60)`.
- **Juice debug panel**, copying juicy-breakout: an on/off toggle and sliders for every effect, plus a global "juice off" A/B switch.

### 2.2 Priority catalog (B = DOM board, A = canvas arena)
**P0, first pass:**

| Surface | Effect | Spec |
|---|---|---|
| B | Dice, hop, spotlight, event card | §1.6–1.8 |
| B | Tile landing | **Good:** glow 1→1.08→1 (easeOutBack, 250 ms), 12 gold sparkles, chime. **Bad:** wobble 4 px ×3 in 200 ms, 8 dark smoke puffs, thud, trauma 0.45. **Cave:** darken 300 ms, then a reveal pop. |
| B | Count-up and floating numbers | 300/500 ms. Floating number +green / −red rises 24 px over 600 ms and fades. |
| B | Coin fly-to-HUD | 1 coin sprite per coin (max 10). Burst 20–40 px in 120 ms, then a quadratic Bézier to the HUD counter in 450 ms (easeInCubic), staggered 35 ms. Each arrival plays a clink at +1 semitone and punches the HUD icon to 1.1. Thief: victim → thief. |
| B | Button press | Down: scale 0.95 + 2 px over 60–80 ms. Release: easeOutBack 150–200 ms. Hover: lift 2 px. Click SFX ±1 semitone. |
| A | Hitstop (in sim) and victim shake | Table §2.4. Victim shakes 3 logical px along the knockback axis, tapering to 0. Attacker shakes 1 px. Hurtboxes do not move. |
| A | Hit flash | Pre-baked white silhouette for 2–3 frames, then the hurt pose. Max 1 per entity per 100 ms. Photosensitive mode: 50% tint plus outline instead. |
| A | Knockback (in sim) | Light 20 px over 12f of hitstun; heavy 72 px over 22f; linear velocity decay. Wall hit: +6f stun. |
| A | Hit sparks and impact ring | **Sparks:** light 8, heavy 20, parry 14 (blue-white). ±35° cone, 200–500 logical px/s, 120–250 ms, additive blend, drawn as streaks. **Ring:** light 0.2 s r 4→28; heavy 0.35 s r 8→64; dive 0.5 s r 0→120; α 0.5→0, QuadOut, stroke 6→1. |
| A | Damage numbers | Black Han Sans. **Normal** 12 logical px: pop 0.4→1.25→1 over 150 ms, rise 20 px over 700 ms, fade over the last 30%, 2 px dark stroke. **Heavy / dragon-on-player** 16 px. **Heal** green, slower. **회피** grey, slides sideways 20 px. **패링** blue. **불굴!** gold, 24 px, holds 900 ms. Hits on one target within 150 ms merge; max 6 numbers per target. |
| A | Telegraphs | Ember hatched fill grows from 0→1 over the telegraph; edge outline; shapes are cone, circle and line. Unique SFX per attack. Breath pips. Caption. Max 2 hazard types on screen. |
| A | Squash and stretch | Windup (1.15, 0.85) for 60–80 ms. Lunge (0.85, 1.2) along the motion. Hit taken (1.25, 0.8). Recovery: easeOutBack 120–150 ms. Keep sx·sy ≈ 1. |
| Both | Trauma shake | Table §2.3 |
| Audio | Core | §2.6 |
| Settings | Accessibility | §1.10, plus the FlashGovernor |

**P1:**
- Camera kick: 6 logical px opposite the attack direction, friction 0.85/tick. Used on heavy hits, charged arrows, meteor and charge.
- Zoom punch: ≤1.06, 40 ms ramp, then decay ×0.9/tick. Used on KO, Last Stand and phase change.
- KO "boss stop":
  - Normal KO: 350 ms freeze, then 0.3× for 700 ms, then a 200 ms ramp back.
  - Dragon death: 500 ms freeze + 1.2 s slow-mo + a white *fade* (not a flash).
- Music ducking.
- Slash trails: tapered arc, 100–150 ms. Colours: swordsman ice-white, berserker orange, ninja violet, mage arcane.
- Job signature VFX:
  - Mage: rune ring + cracked-shield "관통".
  - Archer: golden arrow on First Strike.
  - Swordsman: shield shatter (10 shards) + gold "불굴!".
  - Berserker: red aura burst.
- Dust: 4 on dash start, 8 on slam, 1 every 30 ms while skidding.
- Afterimages: ninja dash/evade and mage blink. 3–4 ghosts 35 ms apart, α 0.5→0 over 150 ms.
- Decals baked into a floor canvas: breath scorch, crack, 64-entry ring buffer.
- Fire-ring VFX.
- Low-HP heartbeat + vignette: pulse ≤1.5 Hz.
- Corner-prop loops, lair states, dialogs-as-props, legend hover.
- Elimination and victory sequences: confetti 120–200 particles plus a fanfare.

**P2:**
- Clickable lair props: dragon snort, hoard jingle.
- Board dragon breathing.
- Front/back sprite facings.
- WebGL heat shimmer and distortion ring.
- Gamepad rumble.
- Music stems and a lowpass sweep during the boss stop.

### 2.3 Trauma shake (shake = trauma², linear decay 1.5/s, 1D Perlin at 20 Hz, channel offsets 0/100/200)
**Limits:**
- Board: 20 CSS px at 1080p (scale by viewport height ÷ 1080) and 1° roll, applied on `.world-shake`.
- Arena: 16 logical px and 2° roll.
- The HUD never shakes.
- While a hostile telegraph is filling, output is capped at 4 px with no roll.
- Everything is multiplied by the shake slider.

| Event | Trauma | ≈ Result |
|---|---|---|
| Board: dice land | 0.32 | 2 px |
| Board: thief / teleport | 0.35 | 2.5 px |
| Board: bad tile | 0.45 | 4 px |
| Board: duel or dragon challenge | 0.55 | 6 px |
| Board: elimination | 0.63 | 8 px + 0.4° |
| Arena: light hit | 0.20 | 0.6 px (hitstop and flash carry it) |
| Arena: heavy hit / parry / wall slam | 0.35 / 0.40 / 0.40 | 2–2.6 px |
| Arena: player hit by claw, tail or fireball | 0.50 | 4 px |
| Arena: Last Stand | 0.55 | 4.8 px |
| Arena: charge wall-crash | 0.60 | 5.8 px |
| Arena: dive landing | 0.65 | 6.8 px |
| Arena: breath active | +0.6/s, soft cap 0.5 | 4 px |
| Arena: KO | 0.85 | 11.6 px |
| Arena: dragon death | 1.00 | 16 px |

### 2.4 Hitstop (inside the sim)
- Ticks at 60 Hz.
- Both fighters and all projectiles freeze.
- The input-buffer timer pauses during the freeze.

| Hit | Ticks |
|---|---|
| Light (P ≤ 0.8), multi-hit ticks (whirlwind, volley) | 3 (multi-hit: 2) |
| Normal (0.8 < P < 1.5) | 5 |
| Heavy (P ≥ 1.5: finisher, axe, charged arrow, meteor) | 7 |
| Successful parry | 10 |
| Berserker rage active | +2 |
| Dragon claw / tail / fireball on player | 6 |
| Dragon charge / dive on player | 8 |
| Breath ticks, burning floor, fire ring | 0 (flash only) |
| Weak-point hit on the dragon | +2 |
| Last Stand trigger | 15 (only exception to the cap) |
| Cap | 12 |
| KO | 0 in the sim: the fight ends on the KO tick. Freeze and slow-mo are presentation only. |

### 2.5 FlashGovernor (always on)
- At most 1 full-screen flash per 350 ms (fewer than 3 per second).
- Alpha ≤ 0.3 and ≤ 80 ms.
- Never saturated red, i.e. R/(R+G+B) ≥ 0.8.
- No stripes with more than 10% contrast covering 20% or more of the screen.
- Sprite hit flashes are small and rate-limited.

### 2.6 Audio [GF + J]
**Context and buffers:**
- One `AudioContext({latencyHint:'interactive'})`, resumed inside the first click (the title "시작" button).
- Pre-fetch and `decodeAudioData` all SFX.
- Create a new `AudioBufferSourceNode` per play and schedule it with `start(ctx.currentTime+offset)`.
- Use AudioParam scheduling only.

**Bus graph:**
- `sfx`, `ui`, `music` and `ambience` gains feed a master `DynamicsCompressor`: threshold −6 dB, ratio 12, attack 3 ms, release 250 ms [J].
- Default gains: music 0.6, ambience 0.5, sfx 0.9, ui 0.7 [J].

**Variation and voices:**
- Round-robin 3–5 variants, never the same one twice in a row.
- Detune ±100–200 cents and volume −0 to −3 dB.
- Rising sequences go up +1 semitone per step, capped at +12 and then reset.
- Kept fixed for recognition: your-turn chime, dice-result chime, breath charge.
- At most 4 voices per sound, with a retrigger gap of 40 ms or more.

**Ducking:**
- Triggered by the dragon roar, breath, KO and the VS clash.
- Music drops to −9 dB with `setTargetAtTime(dbToGain(-9), t, 0.005)`, holds 400 ms, then `setTargetAtTime(1, t+0.4, 0.15)`.

**Sync:**
- Impact SFX fire on the contact frame, which is the hitstop onset, never before it. Audio may be at most 45 ms early or 125 ms late.
- Board SFX are scheduled from the animation timeline, not from network arrival.

**Loops:** mp3 encoder padding breaks gapless `loop`. Loop BGM through `AudioBufferSourceNode` with `loopStart`/`loopEnd` read from `audio/bgm/loops.json` [J].

---

## 3. Real-time combat design

### 3.1 Sim constants [SN + CD]
| Item | Value |
|---|---|
| Tick | **60 Hz** fixed, integer tick counter. Client uses an accumulator with a 0.25 s clamp, at most 5 steps per frame, and renders interpolated with alpha = acc/dt. |
| Units | Positions and velocities are Q8 (1 px = 256). Logical canvas 960×540; 1 tile = 32 px. |
| Arenas | **PvP 800×448** (25×14 tiles). **Dragon 896×448** (28×14). Both centred under a 56 px HUD band. Each leaves ≥ 29 px margin so a 1.06 zoom punch never crops play. |
| Angles | 256-step BAM (u8). sin/cos come from a **hard-coded 256-entry Q14 table**. Integer `atan2` uses octant reduction plus a 33-entry table. |
| Banned in sim (ESLint `no-restricted-properties`) | `Math.sin/cos/tan/atan2/exp/log/pow/sqrt/hypot/cbrt`, `**`, `Math.random`, `Date`, iteration order that depends on object keys |
| Collision | Circle–circle; melee arcs as circle + dot-product test against the facing table; squared distances only. |
| RNG | `combatSeed = nextU32(boardRng)`, with its own stream. Draws: dragon maneuver choice, and the archer's quick-shot spread (none in v1). |
| Input | 7-bit mask `{up, down, left, right, attack, skill, dash}`, read as levels; a press is the rising edge. **Buffer 6 live ticks.** |
| Determinism check | FNV-1a hash of the packed state every 60 ticks. Golden replays in Vitest (Node) and Playwright (Chromium, Firefox, WebKit). Fuzz 10k random-input fights. |
| Replay record | `{seed, setup, per-tick inputs ×2, outcome, hash}`, about 20–40 KB raw per fight, run-length compressed. Stored with the game log. |

### 3.2 Controls [CD]
**Movement and aim:**
- 8-way movement, reaching top speed in 4 ticks and stopping in 3.
- Facing is the last non-zero direction. It locks during startup and active frames, and while drawing a bow.
- Aim is the facing direction plus **soft aim assist**: if the target is within ±25° and 1.5× range when the attack starts, snap to the exact BAM angle. Humans and the AI get the same assist.
- No mouse aim in v1.

**Key layout** (read `KeyboardEvent.code`):

| Player | Move | Attack | Skill | Dash |
|---|---|---|---|---|
| P1, hot-seat (the **arriver** uses this) | WASD | F | G | H |
| P2, full keyboard (the defender uses this) | Arrows | Numpad1 | Numpad2 | Numpad3 |
| P2, laptop / TKL | Arrows | Comma | Period | Slash |
| Solo / online / vs dragon | WASD or Arrows | J or Z | K or X | L, C or Space |
| Gamepad (both) | Stick (deadzone 0.35, quantised to 8-way) or D-pad | South | West | East or RB |

**Rules:**
- Never bind Shift, Ctrl, Alt, Tab or Meta.
- `preventDefault` on Space, the arrow keys and `/`.
- Clear held keys on `blur` and `visibilitychange`.
- Add a "키보드 테스트" screen that lights 8 simultaneous keys.

### 3.3 Global frame data [CD]
| Item | Value |
|---|---|
| Light melee | startup 5–7f / active 2–4f / recovery 10–16f |
| Heavy melee | startup 12–18f / active 4–6f / recovery 18–26f |
| Reactable threshold | Offline: ≥ 18f startup or projectile travel. Online PvP: ≥ 24f for anything meant to be dodged on reaction. Boss telegraphs: ≥ 30f for anything doing ≥ 15% of max HP, never below 24f. |
| Default dash | 16f total. 12 px/f for f1–8, then 4 px/f for f9–16 (128 px). I-frames f1–10. Can cancel into an attack from f11. 40f cooldown after it ends. |
| Dash staling | Each dash started within 60f of the previous one starts its i-frames 3f later (max 2 stacks). Resets after 60f with no dash. |
| Hitstun / knockback | Light 12f / 20 px. Heavy 22f / 72 px. Anti-loop rule: hitstun < attacker recovery + fastest startup, except in designed strings. String finishers push 64 px or more. |
| Hurtbox / body | r 12 / r 14 on a sprite of about 40×48 |
| Projectiles | Destroyed on walls. Fast 600–960, slow 300–480, boss 240–420 px/s. |

### 3.4 Damage formula [CD, scale fixed to the real rules]
```
dmg = max(1, roundHalfUp( S · P · ATK_eff · K / (K + DEF_eff) )) + flat
S = 8/5 (1.6)   K = 10
ATK_eff = ATK × 13/10 when berserker HP*2 <= maxHP
DEF_eff = DEF/2 for mage attacks; 0 for dragon Breath (board rule)
flat = +3 on the archer's first landed hit (after mitigation)
```
- Compute with integer numerators and denominators, then `floor((2·num + den) / (2·den))`.
- No variance and no crits.
- HP is board HP 1:1. The winner's HP and any Last Stand use are written back to the board.

**Sanity table at P 1.0 unless noted:**

| Matchup | Damage | Hits to kill |
|---|---|---|
| Swordsman 5 → archer (DEF 6, HP 39) | 5 | 8 |
| Archer 6 → swordsman (DEF 5, HP 56): quick shot P 0.7 / charged P 1.6 | 4 / 10 | 14 / 6 |
| Mage 4 → ninja (DEF 5 → 2.5, HP 30): bolt P 0.9 | 5 | 6 |
| Ninja 4 → berserker (DEF 5, HP 49): dagger P 0.6 | 3 | 17 stabs (9 strings) |
| Berserker 5 → swordsman: axe P 1.8 (raged) | 10 (12) | 6 (5) |
| Dragon 10 → DEF 5: claw P 1.2 / breath tick P 0.4 (DEF ignored) | 13 / 6 | 3–5 claws |
| ATK 5 → dragon (DEF 6) | 5 (head ×1.5 = 7–8) | 23 basic hits |

### 3.5 Job kits (each board passive is kept) [CD + J]
**Swordsman (검사)**
- **Speed:** 190 px/s.
- **Attack (3-hit string):** 110° arc, reach 60, 12 px lunge per hit.
  - H1 6/3/12f, P 1.0.
  - H2 5/3/12f, P 1.0.
  - H3 thrust 9/4/22f, P 1.6, knockback 64.
- **Skill: Parry (cooldown 240f).**
  - 6f startup, active on f6–23 across the front 180°.
  - Negates a melee hit, or reflects a projectile, and then counter-slashes for P 2.0.
  - A whiffed parry has 24f of recovery.
  - The mage's meteor and the dragon's breath, charge and dive cannot be parried. Claw and tail can be negated, and a fireball can be reflected for P 1.0 [J].
- **Dash:** default.
- **Passive, 불굴 (Last Stand):** only if it is still unused this game. The first lethal hit leaves 1 HP, then 60f of invulnerability, a 15f freeze and a gold flash.

**Archer (궁수)**
- **Speed:** 200 px/s, or 100 while drawing.
- **Attack:** pressing starts a draw.
  - Released before 8f: quick shot at f8, 720 px/s, P 0.7, range 480, recovery 10f.
  - Held to 36f: full shot, 960 px/s, P 1.6, pierces. Facing is locked while drawing, which lets the archer strafe.
- **Skill: Volley (cooldown 210f).** 3 arrows at ±15°, P 0.6 each, 14f startup.
- **Dash: Backstep (cooldown 45f).** 112 px directly away from facing, i-frames f1–8, facing kept.
- **Passive, 선제 (First Strike):** starts the fight with a full draw nocked, so it can release at tick 0. The first landed hit gets +3 flat. The arrow takes about 0.5 s to cross the 480 px spawn gap, so it can be dodged.

**Mage (마법사)**
- **Speed:** 180 px/s.
- **Attack: arcane bolt.** 10f startup, 480 px/s, homing 1 BAM per tick up to 21, P 0.9, recovery 14f.
- **Skill: Meteor Rune (cooldown 240f).**
  - 12f cast [J], then a mark (r 56) appears 192 px ahead, or on the aim-assisted target.
  - The mark is visible for 30f, then explodes for P 2.2 with knockback 96 [J].
  - Cannot be parried.
- **Dash: Blink (cooldown 60f).** Teleports 160 px over 4f; invisible and invulnerable f1–8.
- **Passive, 관통 (Arcane Pierce):** every mage hit uses DEF/2. A cracked-shield VFX marks it.

**Ninja (닌자)**
- **Speed:** 230 px/s.
- **Attack: 2-hit dagger.** 4/2/8f per hit, 90° arc, reach 44, P 0.6 each.
- **Skill: Kunai (2 charges, 90f recharge per charge).** 6f startup, 900 px/s, P 0.5.
- **Dash: Shadow Step (2 charges, 50f recharge per charge).** 14f, 144 px, i-frames f1–10.
- **Passive, 회피 (Evade):** a deterministic counter; every 8th incoming damage instance misses. Shown as 8 pips and included in the observation.
- The board's ±1 move is unchanged.

**Berserker (광전사)**
- **Speed:** 175 px/s.
- **Attack: greataxe.** 14/5/20f, 150° arc, reach 72, P 1.8, knockback 48. Super armor on f6–14 (takes damage without flinching).
- **Skill: Whirlwind (cooldown 300f).** Spins for 40f, hitting every 10f in r 72 for P 0.6 ×4, while moving at 60% speed.
- **Dash: Shoulder Charge (cooldown 60f).** 18f, 128 px, P 0.6 plus knockback on contact, super armor, i-frames only f1–4.
- **Passive, 광폭 (Rage):** at HP ≤ 50%, ATK ×13/10, a red aura, and +2 hitstop on hits.

**Intended loop:** parry beats pokes and arrows. Meteor beats parry. Armor beats ninja pokes. Ninja speed beats mage and archer. Archer kiting beats berserker.

### 3.6 Duel rules [CD + SN + J]
- **Start:**
  - Fighters spawn 480 px apart on the horizontal centre line, facing each other. The arriver is on the left using P1 keys.
  - READY lasts 1.5 s, then "싸워라!" at tick 0.
- **Time limit:** 45 s (2,700 ticks).
- **Fire ring:** a circle centred on the arena.
  - Its radius shrinks linearly from 460 to 180 px between 35.0 s and 43.0 s, then holds.
  - Standing outside costs 2 HP per 30 ticks, ignores DEF, can kill and counts toward the ninja evade counter.
  - It also pushes the fighter inward at 60 px/s [J].
- **Timeout:** higher HP% wins, compared as `hpA·maxB` vs `hpB·maxA`. An exact tie goes to the arriver.
- **Write-back:** the winner's HP is written back. The loser is eliminated, as on the board.
- **Shield item:** still cancels the duel on the board before any fight starts.

### 3.7 Dragon boss (scripted, deterministic) [CD + J]
**Body and stats:**
- Stats 115/10/6, using the same formula; breath ignores DEF.
- Anchored top-centre. The sprite is about 192×144 logical px.
- Body hurtbox: an ellipse approximated by 3 circles of r 40 [J].
- Head: r 28, a ×1.5 weak point while lowered (during the 48f after Breath and the 90f Charge stun).
- No contact damage. The dragon drifts sideways at 60 px/s to track the player's x.
- The player spawns bottom-centre, 320 px away.

**Selection rules:**
- Moves are picked by weighted seeded choice per range band.
- Idle gap between moves: 96–132f in P1, 78–108f in P2.
- **Every 3rd damaging maneuver is Breath.** Gust does not count toward the 3.

**Maneuvers** (damage shown against a DEF 5 player):

| # | Maneuver (when) | Telegraph | Active | Recovery / punish | Damage |
|---|---|---|---|---|---|
| 1 | Claw Swipe (player ≤ 160 px in front) | 30f: 120° arc r 140 fills | 6f | 30f | P 1.2 → 13, knockback 64 (parry negates) |
| 2 | Tail Sweep (player at the side or behind, ≤ 220 px) | 36f: 220° ring fills | 8f | 36f | P 1.0 → 11, knockback 96 |
| 3 | Fireball Volley (mid or long range) | 42f ground circle r 44 per target. Targets are sampled from the player's position every 12f. | 6f blast | — | P 1.0 → 11 each. P1: 3 balls. P2: 5 balls plus burning floor for 120f (P 0.2 per 15f → 2). |
| 4 | Charge | 48f: line 120 wide; direction locks 18f before | 720 px/s until it hits a wall | Wall hit: 90f stun with the head exposed | P 1.8 → 19, knockback 128. Cannot be parried. |
| 5 | Wing Gust (P2+) | 30f: moonlight-blue swirl | 60f, pushes 150 px/s | Followed by a Volley | 0, displacement only |
| 6 | **Breath** (every 3rd) | 48f in P1, 42f in P2, 36f in P3: a 50° cone r 360 fills, plus the throat glow and breath-charge SFX | 72f, ticks every 12f. P2 sweeps 60°; P3 sweeps twice. | 48f with the head down | P 0.4 per tick ignoring DEF → 6/tick, 36 if you take all 6. Cannot be parried. |
| 7 | Inferno Dive (P3) | Untargetable 60f while the shadow tracks the player; it locks 30f before landing | Landing AoE r 120 | 90f | P 2.0 → 21. Cannot be parried. |

**Phases:**
- P1 at 100–60% HP.
- P2 at 60–25% HP: telegraphs −12%; Gust → Volley combos.
- P3 at ≤ 25%: adds Dive; recoveries −25%; kept short.
- Each phase change plays a 60f roar. The dragon is invulnerable during it, trauma 0.5, and all projectiles are cleared [J].

**Time limit:** at 60 s a soft enrage multiplies idle gaps by ×0.8. At 90 s the challenger loses.

**Fairness rules:**
- Every hazard is escapable with one dash (≤ 128 px of perpendicular travel).
- Shape, colour and a unique SFX for every attack.
- At most 2 hazard types on screen at once.
- Recovery length is proportional to telegraph length.

**Tuning knob:** `dragonDamageTakenScale`, default 1.0. Target: a Normal bot at starting stats wins under 10% of the time, and a bot at ATK 9 / DEF 8 / HP 70 wins about 50% [J].

---

## 4. Netcode (online rooms; hot-seat and offline run the sim locally) [SN + CD + J]
**Transport:**
- Use the existing Socket.IO connection with binary payloads.
- Install `bufferutil` and `utf-8-validate`.
- Send fight messages with `compress(false)`.
- Do not rely on connection-state recovery for snapshots.

**Server loop:**
- One loop for all fights: an hrtime accumulator woken by `setTimeout`/`setImmediate`.
- 60 Hz, with catch-up capped at 5 steps.
- The board turn timer is paused while the phase is `combat`.

**Messages:**

| Message | Direction | Rate | Payload |
|---|---|---|---|
| `FightStart` | server → room, reliable | once | `{fightId, seed, setup, startTick}`. Opens a 2.8 s splash and READY; RTT is measured with acks during it. |
| `ci` | client → server | every tick (60/s) | `{fightId u16, tick u32, last 4 masks u8}`, about 10 B |
| `cs` | server → fighters, not volatile | every 2nd tick (30 Hz) | tick, `ackTick[2]`, `inputLate[2]`, 2 fighters × about 24 B, ≤16 projectiles × 10 B, events; about 60–250 B |
| `cs` (spectator) | server → others, volatile | 20 Hz | same packet; interpolated 150–200 ms behind |
| `FightEnd` / `FightSync` | reliable | — | outcome / full state on (re)join |

**Server input handling:**
- Inputs go into a per-player queue indexed by tick.
- An input that arrives late, for a tick already simulated, is discarded. That tick used the last mask repeated.
- If more than 4 ticks are queued ahead, the oldest is dropped.

**Client timing:**
- The client runs ahead of the server by RTT/2 + jitter + 1 tick.
- It adjusts this lead by ±1 tick using `inputLate`, via 1–2% time dilation.

**Client rendering:**
- On each snapshot, reset to the authoritative state and re-simulate up to the present: own inputs from history, opponent's input = last known mask repeated, capped at 10 ticks.
- Position errors under 24 px blend out over 6 ticks; larger errors snap.
- FX fire from predicted events, keyed by `(tick, attacker, moveId)`.
- If an event is not confirmed within 12 ticks, its damage number fades quickly. There is no "undo" animation.

**Other policies:**
- **Lag compensation:** none in v1, because telegraphs and hurtboxes are generous. If needed later, rewind the target by `min(interp + RTT/2, 150 ms)` against a 60-entry history.
- **Disconnect:** the combat bot takes over at Normal difficulty, labelled "AI 대행". On reconnect, send `FightSync` and hand control back at the next tick.
- **Bots online:** inference runs on the server only.
- **Test:** emulate 150 ms RTT, 20 ms jitter and 1% loss, then count corrections per minute and the size of the opponent's snaps.

---

## 5. Combat RL environment (separate model) [SN + CD + J]
**Packages:**
- `packages/combat`: the sim.
- `packages/combat-ai`: `cobs_v1` encoder, `cact_v1` codec and masks, scripted bots (dummy, rusher, kiter, parry-turtle, random), and a TS MLP runtime with a 1e-5 parity test against numpy.
- `packages/sim` gains a `combat-env-server`: the same JSONL stdio protocol (`info/reset/step/close`, base64 float32). `info` returns `obs_layout`, `combat_rules_hash` and the versions.
- `python/rpgboard_env/combat.py` provides `CombatVecEnv` (numpy only).

**API:**
```
reset(num_envs, seed, config={
  controlled: "both"|"p0",
  opponent: "scripted:<name>"|"model:<json>"|"external",
  mode_mix: {pvp: 0.75, dragon: 0.25},
  jobs: "uniform",
  stat_sampler: "board_dist:<file>",
  action_repeat: 4,
  obs_delay: [4, 18],
  flat_actions: false,
  reward: {k_start: 0.5, k_end: 0.1, anneal_frac: 0.25},
  dragon_curriculum: {hp_scale: [0.5, 1.0], telegraph_scale: [1.3, 1.0]},
})
→ obs [N, n_ctrl, 160] f32, masks, info

step(actions [N, n_ctrl, 2]  (or [N, n_ctrl] if flat))
→ obs, reward [N, n_ctrl], terminated [N], truncated [N],
  info{ticks_elapsed, actionable[N, n_ctrl], winner, hp}
```

**Actions:**
- `MultiDiscrete([9, 4])`:
  - move: none plus 8 world directions
  - button: none / attack / skill / dash
- `flat_actions` gives `Discrete(36)`. This is recommended for reusing the user's numpy Actor-Critic with a single softmax head.

**Action repeat:**
- Both seats decide every **4 live ticks**; global hitstop ticks do not count.
- Movement is held for the whole window.
- The button is held as a level and makes an edge only when it changes.
- `actionable=false` means the seat is in hitstun or locked recovery for the whole window. The trainer drops those steps and adds their reward to the next stored step (data skipping). Discount by γ^(k/4).

**Masks:**
- A button is masked when its cooldown or charges keep it unusable for more than 10 ticks (the 4-tick window plus the 6-tick buffer).
- Dash is masked the same way.
- Skill is masked during whirlwind and similar locks.

**Reaction delay:**
- Observations come from a ring buffer, `delay` ticks old.
- Delay is sampled per seat per episode from U[4, 18] and exposed as a feature.
- Runtime: Easy 16, Normal 10, Hard 5, plus temperature 1.3 / 1.0 / 0.7 and an older checkpoint for Easy.

**Observation `cobs_v1`:** 160 float32. Positions are relative to self and axis-aligned. Values are normalised to [−1, 1] or [0, 1].

| Block | Features | Size |
|---|---|---|
| Self | hp/maxHp, maxHp/100, atk/20, def/20, job one-hot(5), state one-hot(7: idle, move, startup, active, recovery, dash, hitstun) + progress, string index/2, skill CD fraction, dash CD fraction, skill charges/max, dash charges/max, invulnerable, super armor, Last Stand available, rage, First Strike pending, draw fraction, evade counter/7, dash stale/2, velocity/vmax (2), facing sin/cos (2), position from arena centre/half-extent (2) | 36 |
| Opponent | relative position (2), distance/arena width, relative velocity (2), facing sin/cos (2), hp%, maxHp/100, atk, def, type one-hot(6: 5 jobs + dragon), state one-hot(7) + progress, move kind one-hot(4: none, light, heavy, skill), flags(6: invulnerable, armor, Last Stand, rage, evade counter, First Strike), skill ready, dash ready, hitstun remaining/30 | 38 |
| Dragon (zeros in PvP) | phase one-hot(3), maneuver one-hot(7), stage progress, attacks-until-breath/2, head lowered, telegraph aim sin/cos (2) | 15 |
| Threats, K = 6 slots, hostile first, sorted by time to closest approach or ticks until active | present, hostile, kind (projectile=0 / zone=1), relative x, relative y, vx, vy, radius/64, ticks until active/60 | 54 |
| Global | time left fraction, mode (pvp/dragon), fire-ring radius/460, delay/18, previous action one-hot (9+4) | 17 |

**Augmentation:** a random x and/or y mirror per episode, with the actions remapped.

**Reward and episode:**
- Terminal reward: +1 for a win, −1 for a loss. There are no draws.
- Shaping: `k·(Δdealt/oppMaxHp − Δtaken/selfMaxHp)`, with k going 0.5 → 0.1 over the first 25% of decisions. Each step is clipped to [−1, 1].
- No time penalty and no approach or hit bonuses, except an approach bonus in curriculum stage 0.
- A rule timeout (45 s / 90 s) sets `terminated=True`, and remaining time is in the observation.
- A safety cap at 2× sets `truncated=True`, which bootstraps.

**Training defaults:**
- Network: MLP 160 → 128 → 128 (tanh), with heads of 9 + 4 (or 36) and a value head.
- Orthogonal init: √2 / 0.01 / 1.0.
- γ 0.99 per decision (half-life about 4.6 s); 0.995 for dragon-heavy runs. λ 0.95.
- 64 envs × 2 seats × 128-step rollouts.
- Entropy 0.01, Adam ε 1e-5, gradient clip 0.5, advantages normalised per minibatch.

**Curriculum:**

| Stage | Opponents | Advance when |
|---|---|---|
| 0 | idle dummy | win rate > 90% |
| 1 | scripted pool, with dragon episodes at 25% on the HP/telegraph curriculum | win rate > 70% against each |
| 2 | self-play: 70% latest / 20% past (a snapshot every 100k decisions, window 20, harder ones sampled first) / 10% scripted | — |

- Evaluate Elo against a frozen reference set every 500k decisions, with 200 fights per opponent.

**Stat sampler bootstrap [J]:**
- Run 10k board games with heuristic bots and the `dice` resolver.
- Log (job, hp, maxHp, atk, def, lastStand) at every fight to produce `stat_dist_v1.json`.

**Throughput targets (to benchmark):** sim tick ≤ 5 µs; ≥ 30k decisions/s per env process; ≥ 10k/s end to end with numpy.

**Export:** weights as JSON, run by the TS runtime. Online they run on the server; offline, in the browser.

---

## 6. How the board side resolves fights [SN + CD + J]

### 6.1 Resolver
- **Board env option:** `combat_resolver: "dice" | "outcome:<file>" | "sim:<combat-model>"`.
  - The default stays `dice` until the first combat model exists, then becomes `outcome`.
  - `obs_v1` and `act_v1` are unchanged.
  - `info` reports `combat_resolver`, `combat_model_id` and `outcome_model_id`. A mismatch fails in the same way as `VERSION_MISMATCH`.
- **Engine seam:**
  - The pure `resolveCombat` is wrapped behind `CombatResolver.resolve(setup, rng) → {winner, hpA, hpB, lastStandUsedA, lastStandUsedB}`.
  - `setup` is `{kind: duel|dragon, a, b, arriver}`.
  - Live games add a `combat` phase that waits for a `CombatResolved` action.
  - The game log keeps the `CombatStarted` / `CombatEnded` summary events. Per-exchange dice events are dropped in real-time mode.

### 6.2 Outcome model (default for board training)
1. **Freeze** a combat model version.
2. **Generate data:** 200k fights across worker processes, bot vs bot at Normal delay with sampled actions, plus dragon fights. Setups come from `stat_dist_v1.json`.
3. **Features:**
   - mode
   - job one-hot for both sides (or dragon)
   - hp, maxHp, atk and def for each side
   - Last Stand available
   - derived log(hits-to-kill) for each side, computed with the §3.4 formula
4. **Model:** an MLP of 2×32 or a logistic regression with job-pair interactions. Outputs:
   - P(arriver wins), or P(challenger wins) for the dragon
   - a 10-bin histogram of the winner's HP%
   - P(Last Stand consumed)
5. **Gate:** calibration within ±3% per decile (Brier score and reliability curve).
6. **Sampling in the board env:** the seeded RNG picks the winner, then an HP bin, then an integer HP ≥ 1 uniformly within the bin.

**Robustness:**
- During board training, add a logit skill shift ε ~ N(0, 0.5) per seat per episode, so the board AI does not over-trust its fight odds.
- Spot-check with `sim:<model>` (about 10–50 ms per fight).

**Training order:**
- Alternate the two models; never train both at once.
- When the combat model is retrained, regenerate the outcome model, then fine-tune the board model.

**Same model in the game:** the heuristic bot and board env use the outcome model internally. The in-game probability display was removed.

### 6.3 Live matchups
| Matchup | Runs where | Notes |
|---|---|---|
| Human vs human, hot-seat | browser sim | P1/P2 key layouts or gamepads |
| Human vs bot (offline or hot-seat) | browser sim + TS MLP | the bot uses the difficulty setting |
| Human vs human, online | server sim; clients predict (§4) | — |
| Human vs bot, online | server sim + server inference | — |
| Bot vs bot (any mode), bot vs dragon | full sim runs instantly (server, or local engine) | Shows a 4× replay highlight of at most 6 s, skippable; auto-skipped in fast/all-bot mode. The replay is stored as inputs. |
| Human vs dragon | same as human vs bot | the dragon is scripted |
| Disconnect | AI 대행, Normal | — |

---

## 7. Build order [J]
- **M0:** `packages/combat` core (movement, dash, melee, projectiles, hitstop) with golden replays and cross-browser hash tests.
- **M1:** local hot-seat duels with placeholder rectangles and the P0 arena FX. Playtest frame data.
- **M2:** dragon script and telegraphs.
- **M3:** `combat-env-server` and `CombatVecEnv`, then training stages 0–2.
- **M4:** outcome model, the board `combat_resolver`, and the switch of the UI and heuristic estimates.
- **M5:** online netcode.
- **M6:** art pass.
- **In parallel:** the board redesign P0 → P3 per [BU]:
  - P0: fonts, palette, corners, plaques, corner HUD, toasts, and game-icons SVG in place of emoji.
  - P1: 3D tilt, standees, hops.
  - P2: dice, event cards, props, lair states.
  - P3: particles, shake, painted art.

## 8. Playtest knobs (expose in a debug panel)
- S, K, and the P values for each move.
- Ninja damage and evade counter length.
- `dragonDamageTakenScale`.
- Telegraph lengths per phase.
- Fire-ring start time and radius.
- Dash cooldown and staling.
- Input buffer length.
- Shake trauma per event and the readability cap.
- Hitstop table.
- Bot delay and temperature for each difficulty.

**Key sources:**
- Fix your timestep: https://gafferongames.com/post/fix_your_timestep/
- Client prediction: https://www.gabrielgambetta.com/client-side-prediction-server-reconciliation.html
- Rollback netcode: https://words.infil.net/w02-netcode-p4.html
- ECMAScript Math approximation: https://tc39.es/ecma262/#sec-function-properties-of-the-math-object
- Hitlag: https://www.ssbwiki.com/Hitlag
- Juicing your cameras: https://archive.org/stream/GDC2016Eiserloh/GDC2016-Eiserloh_djvu.txt
- Celeste source: https://raw.githubusercontent.com/NoelFB/Celeste/master/Source/Player/Player.cs
- Cuphead boss design: https://gameinformer.com/feature/2022/12/27/how-studio-mdhr-builds-a-cuphead-boss
- FightingICE: https://ice.ci.ritsumei.ac.jp/~ftgaic/index-3.html
- OpenAI Five: https://openai.com/index/openai-five/
- Time limits in RL: https://proceedings.mlr.press/v80/pardo18a.html
- Reward shaping: https://www.cs.utexas.edu/~shivaram/readings/b2hd-NgHR1999.html
- CSS transform-style: https://developer.mozilla.org/en-US/docs/Web/CSS/transform-style
- Photosensitivity (XAG 118): https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/118
- Fonts: https://fontsource.org/fonts/hahmlet/about
- Icons: https://game-icons.net/