# Dragon Rush asset list (images, SFX, BGM)

**Conventions**
- All paths are relative to `apps/web/public/assets/`.
- Existing paths in `apps/web/src/types/assetPaths.ts` are kept where they already exist, so `AssetImage` picks the art up without code changes:
  - `images/jobs/{job}.png`
  - `images/tiles/{tile_lowercase}.png`
  - `images/items/{item}.png`
  - `images/dragon/dragon.png`
  - `images/board/board_bg.png`
  - `audio/sfx/{name}.mp3`
  - `audio/bgm/{name}.mp3`
- `AssetImage` keeps its emoji fallback, so every file can land one at a time.

**Priorities**
- **P0**: needed for the redesign and combat v1 to look finished.
- **P1**: the polish pass.
- **P2**: nice to have.
- **[SVG interim]**: start with a free [game-icons.net](https://game-icons.net/) SVG (CC BY 3.0; credit "Lorc, Delapouite & contributors" on a credits screen). Render it as a single-colour mask in gold or ink with a 2 px outline, then replace it later with painted art.
- **[proc]**: make it with CSS, SVG, Canvas or Web Audio. No artist needed.

**Image formats and sizes**
- Use PNG with alpha for sprites, icons and props.
- Use JPG (quality 80-85) for large opaque textures and floors.
- Art is authored at 2x display size for 1080p.
- Keep the layered PSD/Aseprite sources outside `public/`.

**Audio formats**
- Ship mp3 at 44.1 kHz, since the existing code expects `.mp3`:
  - SFX: mono, 128 kbps.
  - BGM and ambience: stereo, 192 kbps.
- Also deliver 48 kHz / 24-bit WAV masters.
- Leveling:
  - SFX peak-normalized to -3 dBFS, with final balance done in code on the audio buses.
  - BGM at about -16 LUFS integrated.
- Every loop needs `loopStart` and `loopEnd` written to `audio/bgm/loops.json`, because mp3 encoder padding breaks gapless looping.

**Rough counts**
- About 95 image files, of which about 40 are P0.
- About 165 SFX files including variants (about 70 are P0), 7 music files and 3 ambience loops.
- Combat sprites are the biggest cost: about 40 frames per job, about 200 frames in total.

---

## 1. Emoji replacement map (what is currently an emoji)
| Current emoji | Replaced by | Priority |
|---|---|---|
| JOB_ICON ⚔️🏹🔮🥷🪓 | `images/jobs/{swordsman,archer,mage,ninja,berserker}.png` portraits | P0 |
| TILE_ICON (22 ids) | `images/tiles/*.png` (section 3.3) | P0 [SVG interim], then P1 painted |
| ITEM_ICON 🌀🛡️🦝 | `images/items/{teleport,shield,thief}.png` | P0 [SVG interim], then P1 painted |
| STAT_ICON ⚔️🛡️❤️ and COIN_ICON 🪙 | `images/ui/icons/{atk,def,hp,coin}.png` | P0 [SVG interim], then P1 painted |
| DRAGON_ICON 🐉 | `images/dragon/dragon.png` and the lair states | P0 |
| Mystery card ids (text only today) | `images/cards/mystery/*.png` | P1 |

---

## 2. P0: ship blockers

### 2.1 Brand and board surface
| File | Purpose | Format / size | Notes |
|---|---|---|---|
| `images/brand/logo_ko.png` | "드래곤 러쉬" logo for the title screen and HomePage | PNG 1200x420, transparent | Gold with a dark stroke. Ember sparks are optional. |
| `images/board/table_wood.jpg` | Dark walnut tabletop behind the board | JPG 1024x1024, tileable | Replaces `board_bg.png`. Keep that file name as an alias if you want no code change. |
| `images/board/board_rim.png` | Walnut board frame with a gold inner bead | PNG 192x192, 9-slice (64 px slices) | Used by `border-image`. |
| `images/board/parchment.jpg` | Tile plaque and card paper grain | JPG 512x512, tileable | Tinted by CSS gradients. |
| `images/dragon/dragon.png` | Lair dragon, **awake** state (existing path) | PNG 1024x1024, transparent | Faces the camera, coiled on a crater, eyes glowing. |
| `images/board/lair_crater.png` | Basalt crater at the board centre | PNG 1200x1200, soft transparent edge | Lava glow comes from CSS. |

### 2.2 Heroes (one character design reused across board, HUD and combat)
| File | Purpose | Format / size |
|---|---|---|
| `images/jobs/{job}.png` x5 | HUD medallion, setup JobCard and VS splash portrait | PNG 256x256, bust, transparent, facing 3/4 right (mirrored for P2) |
| `images/jobs/standee/{job}.png` x5 | Board pawn standee (bust to knees) and setup screen | PNG 384x512, transparent. No seat colour in the art, because the base is tinted by code. |

### 2.3 Combat sprites (biggest cost)

**Sheet format**
- One Aseprite or TexturePacker atlas per job: `images/combat/jobs/{job}/{job}_body.png` plus `.json` (array format with frame tags).
- Each cell is 128x128, which is 64x64 logical px. The pivot is at the feet, (64,112).
- Side view only, facing right. Code mirrors it for left.
- Aim direction is shown by rotated slash arcs and weapon sprites, Nuclear-Throne style. Front and back views are P2.
- Frame timing follows the frame data: startup poses hold for the startup ticks, and there is one frame per active window.

**Frames per job**

| Tag | Swordsman | Archer | Mage | Ninja | Berserker |
|---|---|---|---|---|---|
| idle (loop, 8 fps) | 4 | 4 | 4 | 4 | 4 |
| run (loop, 12 fps) | 6 | 6 | 6 | 6 | 6 |
| attack | atk1 4, atk2 4, atk3 thrust 5 | draw 3 (last frame holds), release 2 | cast 4 | stab1 3, stab2 3 | axe windup 3, swing 3 |
| skill | parry stance 3, counter 4 | volley 4 | meteor cast 5 | kunai throw 3 | whirlwind spin 4 (loop) |
| dash | 3 | backstep 3 | blink out 3 (in = reversed) | shadow step 3 | shoulder charge 3 |
| hit | 2 | 2 | 2 | 2 | 2 |
| death | 6 | 6 | 6 | 6 | 6 |
| **Total** | **~41** | **~35** | **~33** | **~33** | **~34** |

**Separate rotatable weapons and projectiles**

| File | Purpose | Format / size |
|---|---|---|
| `images/combat/jobs/archer/bow.png` | Bow, rotated to aim | PNG 128x128, grip pivot at the centre |
| `images/combat/jobs/mage/staff.png` | Staff, rotated to aim | PNG 128x128 |
| `images/combat/projectiles/arrow.png` | Quick shot | PNG 64x16 |
| `images/combat/projectiles/arrow_charged.png` | Full-draw piercing arrow, glowing | PNG 96x24 |
| `images/combat/projectiles/arcane_bolt.png` | Mage bolt | PNG strip, 4 frames of 48x48 (192x48) |
| `images/combat/projectiles/kunai.png` | Ninja kunai | PNG 48x16 |
| `images/combat/projectiles/fireball.png` | Dragon fireball | PNG strip, 6 frames of 96x96 |

Swordsman, berserker and ninja blades are painted into the body frames. Their slash arcs are [proc].

### 2.4 Dragon (combat), built as a cutout rig to save frames
| File | Purpose | Format / size | Notes |
|---|---|---|---|
| `images/combat/dragon/dragon_rig.png` + `.json` | Layer atlas animated in code by rotation, translation and squash | PNG atlas, up to 2048x2048, at 2x of a 192x144 logical body | Layers: body, neck, head_closed, head_open, jaw, throat_glow overlay, eye_glow, wing_folded and wing_spread (mirrored for the other side), tail_1, tail_2, tail_3, foreleg_down and foreleg_raised (mirrored). Lighting matches the 3/4 view. |
| `images/dragon/intent_attack.png`, `intent_breath.png` | Slay-the-Spire-style intent icons for the lair and the boss bar | PNG 128x128 | Could also be [SVG interim]. |

### 2.5 Arenas
| File | Purpose | Format / size | Notes |
|---|---|---|---|
| `images/combat/arenas/duel_floor.jpg` | PvP arena: a stone crossroads ring | JPG 1920x1080 (full canvas at 2x), with the 1600x896 play area clearly framed | Mid-dark and low-saturation. No red or orange inside the play area, because telegraph contrast depends on it. |
| `images/combat/arenas/lair_floor.jpg` | Dragon arena: basalt floor with lava only beyond the walls | JPG 1920x1080, play area 1792x896 | Same contrast rule. |

### 2.6 UI frames (minimum set)
| File | Purpose | Format / size |
|---|---|---|
| `images/ui/frames/frame_gold.png` | Gold filigree: HUD cards, combat HUD, timer | PNG 96x96, 9-slice (32 px slices) |
| `images/ui/frames/frame_parchment.png` | Torn parchment: cards, toasts, tooltips, Chronicle | PNG 96x96, 9-slice |
| `images/ui/vs_lockup.png` | "VS" splash mark. Latin text, so it is baked into an image. | PNG 512x256 |

### 2.7 Icons with an [SVG interim] version (ship now, paint in P1)
| File (final) | Count | Final size |
|---|---|---|
| `images/tiles/{id}.png` | 22 (list in section 3.3) | PNG 256x256 |
| `images/items/{teleport,shield,thief}.png` | 3 | PNG 256x256 |
| `images/ui/icons/{hp,atk,def,coin}.png` | 4 | PNG 128x128 |
| `images/ui/icons/chip_{skip,item,mystery,maxhp}.png` | 4 effect-chip icons | PNG 64x64 |
| `images/combat/ui/skill_{job}.png`, `dash_{job}.png` | 10 | PNG 128x128 |
| `images/combat/ui/passive_{job}.png` (shield pip, golden arrow, cracked shield, evade pip, rage) | 5 | PNG 96x96 |

---

## 3. P1: polish pass

### 3.1 Board props and lair states
| File | Purpose | Format / size |
|---|---|---|
| `images/landmarks/start_gate.png` | START corner standee (banner gate) | PNG 384x384 |
| `images/landmarks/start_gate_idle.png` | Flag sway loop | PNG strip, 4 frames of 384x384 |
| `images/landmarks/shop_tent.png` | SHOP corners (one file shared by both) | PNG 384x384. The lantern flicker is [proc]. |
| `images/landmarks/inn.png` | INN corner (timber inn) | PNG 384x384. Chimney smoke is [proc] particles. |
| `images/dragon/lair_asleep.png`, `lair_roar.png` | Lair dragon states | PNG 1024x1024 each |
| `images/board/lava_cracks.png` | Lava overlay scrolled by `background-position` | PNG 512x512, tileable, alpha |
| `images/board/table_vignette` | — | [proc] radial gradient |

### 3.2 Cards and dialog props
| File | Purpose | Format / size |
|---|---|---|
| `images/cards/card_back.png` | Mystery card back (dragon seal) | PNG 512x720 |
| `images/cards/card_frame_good.png`, `card_frame_bad.png` | Event and mystery card fronts | PNG 512x720 |
| `images/cards/mystery/{hidden_gold,gem_vein,ancient_relic,healing_spring,giant_blessing,lost_bag,cave_in,goblin_trick,bat_swarm,lost_in_dark}.png` | 10 mystery card illustrations | PNG 512x400 each |
| `images/props/shop_stall.png` | Shop dialog backdrop (merchant stall and cloth) | PNG 1280x720 |
| `images/props/anvil.png` | Training dialog prop | PNG 512x512 |
| `images/props/cave_mouth.png` | Mystery dialog backdrop | PNG 1024x768 |

Item cards and stat cards are composed in code from the card frame plus an icon [proc].

### 3.3 Painted tile illustrations
Each is a 256x256 PNG at `images/tiles/{id}.png`, painted in one consistent style with a 3/4 vignette.

| File | Subject |
|---|---|
| start | banner and flag |
| goblin | goblin pack, loot |
| poison_swamp | bubbling green swamp |
| herb | glowing herbs |
| bandit | masked bandit |
| training | dummy and weapon rack |
| shop | coin purse and sign |
| wolf | wolf pack |
| trap | spike trap |
| treasure | open chest |
| pickpocket | hand and purse |
| blacksmith | anvil spark |
| inn | bed and lantern |
| orc | orc warrior |
| cursed_altar | candles and skull altar |
| fountain | luck fountain |
| rockfall | falling boulders |
| mystery | cave mouth with "?" runes |
| troll | troll |
| spider_web | web |
| wandering_merchant | backpack trader |
| storm | thundercloud |

### 3.4 Dragon combat poses (frame art for moments the rig cannot sell)
`images/combat/dragon/dragon_poses.png` plus `.json`, with 384x288 cells:

| Tag | Frames |
|---|---|
| charge_side | 4 (mirrored) |
| stunned | 4 |
| takeoff | 4 |
| airborne_topdown | 1 (384x384 silhouette) |
| land | 3 |
| hurt | 2 |
| death | 8 |

### 3.5 VFX sprite sheets (everything else is procedural)
| File | Purpose | Format / size |
|---|---|---|
| `images/vfx/fire_puff.png` | Breath and fireball particle | PNG strip, 8 frames of 128x128 |
| `images/vfx/smoke_puff.png` | Smoke for bad tiles, after breath, lair snort | PNG strip, 6 frames of 128x128 |
| `images/vfx/flame_column.png` | Duel fire ring wall | PNG strip, 8 frames of 96x160 |
| `images/vfx/burning_floor.png` | Phase-2 burning ground (loop) | PNG strip, 4 frames of 128x128 |
| `images/vfx/coin_spin.png` | Coin fly-to-HUD and loot | PNG strip, 8 frames of 64x64 |
| `images/vfx/sparkle.png` | Good tile, heal, upgrade | PNG strip, 4 frames of 64x64 |
| `images/vfx/scorch_01..03.png` | Breath and fireball decals | PNG 256x256 each |
| `images/vfx/crack_01..02.png` | Charge wall-crash and dive landing decals | PNG 256x256 each |
| `images/vfx/rune_ring.png` | Mage meteor mark and pierce rune (rotated in code) | PNG 256x256 |

### 3.6 UI completion
| File | Purpose | Format / size |
|---|---|---|
| `images/ui/frames/frame_wood.png` | Dock and buttons | PNG 96x96, 9-slice |
| `images/ui/frames/frame_crimson.png` | Dragon/danger panels, boss bar, challenge button | PNG 96x96, 9-slice |
| `images/ui/ribbon_name.png` | Name ribbon (tinted to the seat colour in code) | PNG 192x48, 9-slice, greyscale |
| `images/ui/wax_seal.png` | Primary confirm and roll button emblem | PNG 128x128 |
| `images/ui/rune_stone_off.png`, `rune_stone_on.png` | Breath counter (top strip, lair, boss bar) | PNG 64x64 each |
| `images/ui/round_dial.png` | Round counter stone | PNG 160x160 |
| `images/ui/chronicle_caps.png` | Scroll rollers for the Chronicle drawer | PNG 480x64 (top and bottom stacked) |
| `images/ui/crack_overlay.png` | Eliminated player card | PNG 640x232 |
| `images/ui/skull_stamp.png`, `ko_stamp.png` | Elimination and KO stamps | PNG 256x256 each |
| `images/brand/logo_en.png` | "DRAGON RUSH" subtitle lockup | PNG 1200x300 |
| `images/brand/title_keyart.jpg` | Title/lobby background (dragon over the war table) | JPG 1920x1080 |
| `images/brand/app_icon.png` | Favicon and app icon | PNG 512x512 |

---

## 4. P2: nice to have
- **Front and back facing** combat sheets for all 5 jobs. This adds about 2x frames. Use the same tags, `{job}_body_up` and `{job}_body_down`.
- **Victory poses:** 4 frames per job at 128 px for the fight result card.
- **Arena variants:**
  - `images/combat/arenas/pillar.png` (PNG 128x160, 3/4 view)
  - `breakable_rock.png` (two states, 128x128)
- **Lair props:** `images/props/coin_hoard.png` (256x256) for the clickable jingle.
- **Felt texture:** `images/board/felt.jpg` (JPG 256x256, tileable). CSS works fine until then.
- **Merchant NPC bust** for the shop stall: `images/props/merchant.png` (PNG 512x512).

---

## 5. Procedural (no art needed)
| Item | How |
|---|---|
| Dice (all faces) | CSS 3D cube, ivory gradient, ink and red pips |
| Category gems, effect chips, HP bars, buttons, turn-order coins | CSS gradients and borders on the 9-slice frames |
| Seat crests (shield, diamond, leaf, star) and foot rings | Inline SVG and canvas ellipses |
| Spotlight, vignettes, lair light pool, ember glow | CSS radial gradients |
| Telegraph decals (cone, circle, line, hatched fill) | Canvas paths with a hatch `createPattern` |
| Hit sparks, impact rings, dust, confetti, embers, shield hex shards | Canvas particle pool |
| Slash arcs and trails | Canvas tapered arcs from tip samples |
| White hit-flash silhouettes, afterimages | Generated at runtime from sprite frames (`source-atop`) |
| Claw-slash wipe transition | 3 SVG paths animated with `stroke-dashoffset` |
| Damage numbers, banners, countdown, "준비 / 싸워라!" | Black Han Sans text with a stroke |
| Keycap hints, keyboard test screen | CSS |
| Ground shadows, blob shadows | Radial gradients |
| UI tick, hover and timer-warning blips (optional) | Web Audio oscillators, if recorded files are not ready |

---

## 6. SFX

### 6.1 Legacy name mapping
These are the names in today's `SFX_NAMES`. Point `sfxPath()` to the new folders, or keep these file names as copies.

| Legacy name | New file |
|---|---|
| dice_roll | `audio/sfx/board/dice_land_01.mp3` |
| move_step | `board/pawn_hop_01` |
| attack_hit | `combat/hit_light_01` |
| coin | `board/coin_gain_01` |
| upgrade | `board/stat_up` |
| item_use | `board/item_use` |
| shield | `board/item_shield` |
| dragon_breath | `dragon/breath_loop` |
| victory | `bgm/stinger_victory` |
| defeat | `bgm/stinger_defeat` |

### 6.2 UI: `audio/sfx/ui/`
| File (variants) | Trigger | Duration | Pri |
|---|---|---|---|
| `ui_click_01..03` | Any button | 50-80 ms | P0 |
| `ui_open` | Panel or drawer opens (wood/paper slide) | 200-350 ms | P0 |
| `ui_deny` | Illegal action, cannot afford | 150-250 ms | P0 |
| `turn_start` | Your turn (fixed chime; also caption "내 차례") | 600-900 ms | P0 |
| `count_tick` | Count-up tick, pitched up 1 semitone per tick ([proc] OK) | 20-40 ms | P0 |
| `ui_hover_01..02` | Hover (-12 dB) | 30-50 ms | P1 |
| `ui_close` | Close | 150-250 ms | P1 |
| `ui_confirm` | Wax-seal stamp on confirm | 250-400 ms | P1 |
| `toast` | Soft paper flick | 120-200 ms | P2 |

### 6.3 Board: `audio/sfx/board/`
| File (variants) | Trigger | Duration | Pri |
|---|---|---|---|
| `dice_land_01..03` | Die clacks on felt (with a 2 px shake) | 100-250 ms | P0 |
| `dice_result` | Result pop (fixed chime) | 300-500 ms | P0 |
| `pawn_hop_01..04` | Each step (wooden tap, pitched up per step) | 60-120 ms | P0 |
| `tile_good` | Good tile chime | 500-800 ms | P0 |
| `tile_bad` | Bad tile thud with smoke | 400-700 ms | P0 |
| `coin_gain_01..03` | Each coin arriving at the HUD | 80-150 ms | P0 |
| `coin_loss` | Coins scatter or leave | 300-500 ms | P0 |
| `hp_heal` | HP up (herb, inn, fountain) | 500-800 ms | P0 |
| `hp_damage_01..02` | HP down from an event | 200-400 ms | P0 |
| `stat_up` | Training or blacksmith (anvil hammer) | 400-700 ms | P0 |
| `card_flip_01..02` | Event or mystery card flip | 150-250 ms | P0 |
| `item_teleport` | Teleport whoosh | 500-800 ms | P0 |
| `item_shield` | Shield bubble (duel cancelled) | 400-700 ms | P0 |
| `item_thief` | Snatch | 300-500 ms | P0 |
| `item_use` | Generic item use | 200-400 ms | P0 |
| `duel_clash` | VS splash clash (sword clang and boom; ducks music) | 0.8-1.2 s | P0 |
| `elimination` | Player eliminated (low boom) | 1.0-1.5 s | P0 |
| `dice_rattle` | Held on pointerdown (loopable) | 300-600 ms | P1 |
| `dice_throw` | Throw whoosh | 150-250 ms | P1 |
| `pawn_land` | Final landing thud | 150-250 ms | P1 |
| `shop_bell` | Enter shop | 400-700 ms | P1 |
| `purchase` | Buy (coins and bag) | 400-600 ms | P1 |
| `inn_rest` | Inn heal (hearth crackle and chime) | 1.0-1.5 s | P1 |
| `cave_enter` | Mystery cave rumble | 600-900 ms | P1 |
| `mystery_good`, `mystery_bad` | Mystery card result | 500-800 ms | P1 |
| `pass_start` | Start bonus fanfare | 0.8-1.2 s | P1 |
| `claw_wipe` | Board-to-combat transition whoosh | 250-400 ms | P1 |
| `skip_turn` | Spider web or lost-in-dark | 400-600 ms | P2 |
| `dice_six` | Special chime on a 6 | 500-700 ms | P2 |
| `dragon_snort` | Clicking the lair dragon | 600-900 ms | P2 |
| `hoard_jingle` | Clicking the coin hoard | 400-600 ms | P2 |
| `chronicle_open` | Scroll unroll | 300-500 ms | P2 |

### 6.4 Combat (shared): `audio/sfx/combat/`
| File (variants) | Trigger | Duration | Pri |
|---|---|---|---|
| `fight_ready` | READY count tick | 100-200 ms | P0 |
| `fight_go` | "싸워라!" gong | 0.8-1.2 s | P0 |
| `dash_01..03` | Dash or dodge whoosh | 150-250 ms | P0 |
| `swing_light_01..03` | Light swing | 100-200 ms | P0 |
| `swing_heavy_01..03` | Heavy swing | 250-400 ms | P0 |
| `hit_light_01..04` | Light flesh hit (plays on the contact frame) | 80-150 ms | P0 |
| `hit_heavy_01..03` | Heavy hit | 200-350 ms | P0 |
| `evade_01..02` | Ninja evade or "회피" (whoosh and shimmer) | 200-300 ms | P0 |
| `parry_01..03` | Successful parry (clang) | 200-400 ms | P0 |
| `ko` | KO boom (ducks music) | 0.8-1.2 s | P0 |
| `result_win`, `result_lose` | Fight result card | 1.5-2.5 s | P0 |
| `hit_sub_01..02` | Sub-bass layer under heavy hits | 150-300 ms | P1 |
| `wall_slam_01..02` | Knocked into a wall | 200-300 ms | P1 |
| `heartbeat_loop` | Low-HP loop | 0.8-1.0 s loop | P1 |
| `fire_ring_start` | Ring starts closing (also caption) | 1.0 s | P1 |
| `fire_ring_loop` | Ring burning | 2-4 s loop | P1 |
| `timer_warn` | Last 5 s tick ([proc] OK) | 80-120 ms | P1 |
| `footstep_01..04` | Run steps | 40-80 ms | P2 |

### 6.5 Job SFX: `audio/sfx/jobs/`
| File (variants) | Trigger | Duration | Pri |
|---|---|---|---|
| `sword_parry_stance` | Swordsman parry start (shing) | 250-350 ms | P0 |
| `sword_counter` | Parry counter-slash | 250-400 ms | P0 |
| `sword_last_stand` | 불굴 trigger (gold chime and heartbeat) | 1.0-1.5 s | P0 |
| `sword_thrust_01..02` | 3rd-hit thrust | 200-300 ms | P1 |
| `bow_draw` | Archer draw creak (about 600 ms, matching the 36f full draw) | 600 ms | P0 |
| `arrow_release_01..03` | Release | 100-200 ms | P0 |
| `arrow_impact_01..03` | Arrow hit | 100-200 ms | P0 |
| `archer_volley` | Volley | 300 ms | P1 |
| `first_strike` | Golden-arrow glint | 400-600 ms | P1 |
| `archer_backstep` | Backstep | 200 ms | P2 |
| `mage_bolt_cast_01..02` | Bolt cast | 200-300 ms | P0 |
| `mage_bolt_impact_01..02` | Bolt hit | 200-300 ms | P0 |
| `mage_meteor_mark` | Rune hum while the mark is visible (30f) | 500 ms | P0 |
| `mage_meteor_explode_01..02` | Meteor blast | 0.8-1.2 s | P0 |
| `mage_blink` | Blink | 200-300 ms | P1 |
| `mage_pierce` | "관통" glass crack layer | 200-300 ms | P1 |
| `ninja_stab_01..03` | Dagger stab | 80-150 ms | P0 |
| `ninja_kunai_throw_01..02` | Kunai throw | 100-200 ms | P0 |
| `ninja_kunai_hit_01..02` | Kunai hit | 100 ms | P1 |
| `ninja_shadow_step_01..02` | Shadow step | 150-250 ms | P1 |
| `zerk_axe_swing_01..02` | Greataxe swing | 300-450 ms | P0 |
| `zerk_axe_impact_01..02` | Greataxe hit | 300-450 ms | P0 |
| `zerk_rage` | 광폭 trigger roar | 1.0-1.5 s | P0 |
| `zerk_whirlwind_loop` | Whirlwind | 600 ms loop | P1 |
| `zerk_charge` | Shoulder charge | 300-500 ms | P1 |

### 6.6 Dragon: `audio/sfx/dragon/`
Every attack gets its own **unique telegraph sound**, because sound is one of the three telegraph layers.

| File (variants) | Trigger | Duration | Pri |
|---|---|---|---|
| `roar_01..02` | Board challenge, phase change (ducks music) | 2-3 s | P0 |
| `claw_swipe_01..02` | Claw active | 300-500 ms | P0 |
| `tail_sweep_01..02` | Tail active | 500-700 ms | P0 |
| `fireball_launch_01..02` | Volley launch | 300-500 ms | P0 |
| `fireball_impact_01..03` | Fireball explodes | 500-800 ms | P0 |
| `charge_windup` | Charge telegraph (steam hiss) | 800 ms | P0 |
| `charge_run_loop` | Charging stomps | 1 s loop | P0 |
| `wall_crash` | Charge hits wall, stun starts | 1.0-1.5 s | P0 |
| `breath_charge` | **Breath telegraph** (rising inhale, fixed sound; caption "용이 숨을 들이쉰다!") | 600-800 ms | P0 |
| `breath_loop` | Breath active (72f) | 1.2 s loop | P0 |
| `hurt_01..03` | Dragon takes a hit | 300-500 ms | P0 |
| `death` | Dragon defeated (with boss stop) | 3-4 s | P0 |
| `claw_windup` | Claw telegraph | 400-600 ms | P1 |
| `tail_windup` | Tail telegraph | 500 ms | P1 |
| `burning_floor_loop` | Phase-2 burning ground | 2 s loop | P1 |
| `stunned_loop` | Dazed after wall crash | 1.5 s loop | P1 |
| `gust` | Wing gust | 1.0-1.5 s | P1 |
| `breath_end` | Breath ends, head drops | 400-600 ms | P1 |
| `dive_takeoff` | Inferno Dive takeoff (wing flaps) | 1 s | P1 |
| `dive_whistle` | Shadow lock (rising whistle) | 500 ms | P1 |
| `dive_land` | Dive impact | 1.0-1.5 s | P1 |
| `weakpoint_hit` | Bonus crunch on a head hit | 300 ms | P1 |
| `growl_idle_01..02` | Idle between attacks, and the lair on the board | 2-3 s | P1 |

---

## 7. Music and ambience
| File | Purpose | Length / spec | Pri |
|---|---|---|---|
| `audio/bgm/board.mp3` | Board loop: warm tavern-fantasy, strings, light percussion | 2-3 min seamless loop, about 90-100 BPM | P0 |
| `audio/bgm/duel.mp3` | PvP fight loop: driving percussion and brass | 60-90 s loop, 140-160 BPM | P0 |
| `audio/bgm/dragon_battle.mp3` | Dragon fight loop (existing name) | 90-120 s loop | P0 |
| `audio/bgm/stinger_victory.mp3` | Game won (replaces legacy `victory`) | 4-8 s | P0 |
| `audio/bgm/stinger_defeat.mp3` | Lost or eliminated at game end (replaces legacy `defeat`) | 3-5 s | P0 |
| `audio/bgm/lobby.mp3` | Title and lobby (existing name) | 1.5-2.5 min loop | P1 |
| `audio/bgm/stinger_elimination.mp3` | Another player is eliminated | 2-3 s | P1 |
| `audio/bgm/dragon_battle_p3.mp3` | Phase-3 intensity stem, beat-synced with `dragon_battle` | same length, same tempo | P2 |
| `audio/ambience/hall_fire.mp3` | Board room tone (hearth crackle, distant wind) | 30-60 s loop | P1 |
| `audio/ambience/lair_lava.mp3` | Lava rumble under the board and in the dragon arena | 30 s loop | P2 |
| `audio/ambience/arena_wind.mp3` | Duel arena bed | 30 s loop | P2 |

---

## 8. Practical sourcing notes for a small team (my judgment; check each licence)
- **Cheapest path to "finished" quickly:**
  1. P0 [SVG interim] icons from game-icons.net.
  2. One illustrator for the 5 job designs: portrait, standee and the combat side-view sheet together, so the style matches.
  3. One illustrator for the dragon: the lair states plus the cutout rig layers.
  4. Textures and floors can come from a texture library, colour-graded to the palette.
- **SFX:** layer royalty-free library sounds as transient + body + tail per hit, and record 3-5 variants per frequent sound in the same session. UI blips and ticks can be synthesized.
- **Character sheets:** order them in this sequence: idle, run, attack, hit and death first (playable), then skill and dash. Placeholder coloured circles with slash VFX are enough to tune frame data before the art arrives.
- **Style lock:** every hero and monster uses the same light direction (top-left), a 1 px dark outline in combat sprites, and ink #2B1D14 line work on board art.