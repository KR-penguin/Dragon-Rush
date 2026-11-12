import { COMBAT_TICK_HZ } from '@dragon-rush/combat';

/**
 * Netcode tunables (combat-design §9 defaults table). Code wins over the doc; tests pin the key ones.
 * Every value is in ticks unless the name says Ms.
 */
export const TICK_MS = 1000 / COMBAT_TICK_HZ;

/** Bumped when the netcode wire behaviour changes; part of combatBuildId. */
export const NETCODE_VERSION = 1;

/** Server: hold a missing human mask this long when the stream is alive (PvP) / always (PvE). */
export const PVP_HOLD_TICKS = 6;
export const PVE_HOLD_TICKS = 15;
/** A stream is alive while its last packet is at most this old. */
export const STREAM_ALIVE_MS = 250;
/** Substitution keeps the movement nibble for this many consecutive substituted ticks. */
export const DECAY_RUN = 10;
/** Masks may be stamped at most this far ahead of the server wall tick. */
export const MAX_AHEAD_TICKS = 30;
/** Confirms go out every N stepped ticks; a hash every HASH_EVERY ticks. */
export const CONFIRM_EVERY = 2;
export const HASH_EVERY = 30;
/** "준비" before tick 1: inputs are stamped and slack measured, nothing is simulated. */
export const PREROLL_TICKS = 90;
/** Server catch-up per wake before it retimes the fight. */
export const MAX_STEPS_PER_WAKE = 120;

/** Client prediction caps (simTick - confirmedTick). */
export const HARD_CAP_PVP = 40;
export const HARD_CAP_PVE = 120;
export const STATE_RING = 128;
export const INPUT_RING = 512;
export const MAX_INPUT_TICKS_PER_FRAME = 5;
/** Redundancy: each fight:input carries the newest max(4, new ticks) masks, at most 16. */
export const MAX_INPUT_MASKS_PER_PACKET = 16;
export const MAX_SIM_STEPS_PER_FRAME = 60;
export const MAX_FAST_FORWARD_PER_FRAME = 600;
export const OVERFLOW_TICKS = 480;
export const FRAME_DT_CLAMP_MS = 250;
/** Freeze (prediction cap reached) longer than this shows "내 연결 불안정". */
export const FREEZE_WARN_MS = 250;

/** Starvation / control handover (server). */
export const STARVE_CRITICAL_MS = 750;
export const STARVE_BOT_MS = 1500;
export const BOT_TENURE_TICKS = 180;
export const HANDBACK_BUFFERED_TICKS = 3;
/** Scripted bots decide every N live ticks and hold the input in between. */
export const BOT_DECISION_TICKS = 4;

/** Downlink backlog (ticks between last confirm sent and the recipient's ack). */
export const BACKLOG_CRITICAL = 60;
export const BACKLOG_DISCONNECT = 180;
export const SPECTATOR_BACKLOG_PAUSE = 90;
export const SPECTATOR_BACKLOG_RESUME = 10;

/** Desync policy: after this many syncs for one socket, sync every HASH_EVERY ticks. */
export const DESYNC_DEGRADE_AFTER = 3;
export const SYNC_MIN_INTERVAL_MS = 500;

/** Event reconciliation (view side). */
export const EVENT_REBIND_WINDOW = 6;
export const EVENT_LATE_SFX_TICKS = 7;

/** Spectator playback buffer. */
export const SPECTATOR_BUFFER_MIN = 6;
export const SPECTATOR_BUFFER_MAX = 15;
export const SPECTATOR_BUFFER_DEFAULT = 9;
export const SPECTATOR_CATCHUP_EXTRA = 30;

/** Start: fight:go when both fighters are ready, or after this long. */
export const READY_TIMEOUT_MS = 6000;
export const INTRO_MS = 2800;
export const GO_LEAD_MS = 1600;

/** Lead controller (time dilation). */
export const LEAD_BASE_MS = 6;
export const LEAD_TARGET_CAP_MS = 60;
export const LEAD_GAIN = 0.01;
export const LEAD_DEAD_BAND = 0.5;
export const LEAD_LIMIT = 0.03;
export const LEAD_LIMIT_FAR = 0.05;
export const LEAD_FAR_TICKS = 10;
export const LEAD_FAR_CONFIRMS = 15;
/** Server slack window (30 samples = 0.5 s at 60 packets/s). */
export const SLACK_WINDOW = 30;
