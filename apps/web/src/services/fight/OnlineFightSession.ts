import type { CombatEvent, CombatResult, CombatState } from '@dragon-rush/combat';
import {
  FIGHT_C2S,
  FIGHT_S2C,
  FightControlSchema,
  FightEndSchema,
  FightGoSchema,
  FightRetimeSchema,
  FightSyncSchema,
} from '@dragon-rush/protocol';
import {
  FightClient,
  NetClock,
  SpectatorPlayback,
  inputToMask,
  type FightNetStats,
  type FightTransport,
} from '@dragon-rush/netcode';
import { KEY_LAYOUTS } from '../../types/combatControls';
import type { PendingFight } from '../gameClient';
import type { OnlineSession } from '../onlineSession';
import { createKeyboardSource, type KeyTracker } from './keyboardInput';
import { browserPads, combineSources, createGamepadSource } from './gamepadInput';
import type { FightFrame, FightSession, FrameListener } from './types';

const SERVER_EVENTS = [
  FIGHT_S2C.go,
  FIGHT_S2C.relay,
  FIGHT_S2C.confirm,
  FIGHT_S2C.control,
  FIGHT_S2C.sync,
  FIGHT_S2C.retime,
  FIGHT_S2C.end,
] as const;

/** Browser renderer driver for a server-authoritative fight. The server alone publishes the result. */
export class OnlineFightSession implements FightSession {
  readonly info: FightSession['info'];
  private readonly clock: NetClock;
  private readonly fighter: FightClient | null;
  private readonly spectator: SpectatorPlayback | null;
  private readonly source: ReturnType<typeof combineSources> | null;
  private readonly frameListeners = new Set<FrameListener>();
  private readonly endListeners = new Set<(result: CombatResult) => void>();
  private readonly offs: (() => void)[] = [];
  private raf: number | null = null;
  private started = false;
  private ended = false;
  private disposed = false;
  private paused = false;
  private last = performance.now();
  private readonly createdAt = performance.now();
  private lastWatchdogMs = Number.NEGATIVE_INFINITY;
  private alpha = 1;

  constructor(
    fight: PendingFight,
    private readonly online: OnlineSession,
    tracker: KeyTracker,
  ) {
    const meta = fight.online;
    if (!meta) throw new Error('online fight metadata missing');
    const start = meta.start;
    this.info = { id: fight.id, setup: fight.setup, seed: fight.seed, sides: fight.sides };
    const transport: FightTransport = {
      send: (event, payload) => {
        online.socket.emit(event, payload);
      },
    };
    this.clock = new NetClock(transport);
    this.clock.setFightMode(true);
    this.clock.burst(performance.now());
    this.fighter =
      start.you.role === 'fighter'
        ? new FightClient({ start, transport, clock: this.clock.sync })
        : null;
    this.spectator =
      start.you.role === 'spectator' ? new SpectatorPlayback(start, transport, false) : null;
    this.source = this.fighter
      ? combineSources([
          createKeyboardSource(tracker, KEY_LAYOUTS.solo),
          createGamepadSource('any', browserPads),
        ])
      : null;
    if (meta.go && this.fighter) this.fighter.receive(FIGHT_S2C.go, meta.go, performance.now());
    const onPong = (payload: unknown) => this.clock.onPong(payload, performance.now());
    online.socket.on(FIGHT_S2C.pong, onPong);
    this.offs.push(() => online.socket.off(FIGHT_S2C.pong, onPong));
    for (const event of SERVER_EVENTS) {
      const onPacket = (payload: unknown) => {
        const now = performance.now();
        const schema =
          event === FIGHT_S2C.go
            ? FightGoSchema
            : event === FIGHT_S2C.control
              ? FightControlSchema
              : event === FIGHT_S2C.sync
                ? FightSyncSchema
                : event === FIGHT_S2C.retime
                  ? FightRetimeSchema
                  : event === FIGHT_S2C.end
                    ? FightEndSchema
                    : null;
        const checked = schema ? schema.safeParse(payload) : null;
        if (schema && !checked?.success) return;
        const value = checked?.success ? checked.data : payload;
        this.fighter?.receive(event, value, now);
        this.spectator?.receive(event, value, now);
      };
      online.socket.on(event, onPacket);
      this.offs.push(() => online.socket.off(event, onPacket));
    }
    const onConnect = () => {
      this.clock.sync.reset();
      this.clock.burst(performance.now());
      this.fighter?.requestJoinSync(performance.now());
    };
    online.socket.on('connect', onConnect);
    this.offs.push(() => online.socket.off('connect', onConnect));
    const onVisibility = () => {
      this.fighter?.setHidden(document.hidden, performance.now());
      if (this.spectator) this.spectator.hidden = document.hidden;
      if (!document.hidden) this.clock.burst(performance.now());
    };
    document.addEventListener('visibilitychange', onVisibility);
    this.offs.push(() => document.removeEventListener('visibilitychange', onVisibility));
    if (document.hidden) onVisibility();
    this.schedule();
  }

  start(): void {
    this.started = true;
  }
  isStarted(): boolean {
    return this.started;
  }
  result(): CombatResult | null {
    return this.fighter?.result() ?? this.spectator?.result() ?? null;
  }
  stats(): FightNetStats | null {
    return this.fighter?.stats(performance.now()) ?? null;
  }
  frame(): FightFrame {
    const pair = this.fighter?.session.renderPair();
    const prev = pair?.prev ?? this.spectator?.previous;
    const curr = pair?.curr ?? this.spectator?.current;
    if (!prev || !curr) throw new Error('online fight has no state');
    return { prev, curr, alpha: this.alpha };
  }
  onFrame(listener: FrameListener): () => void {
    this.frameListeners.add(listener);
    return () => this.frameListeners.delete(listener);
  }
  onEnd(listener: (result: CombatResult) => void): () => void {
    this.endListeners.add(listener);
    return () => this.endListeners.delete(listener);
  }
  setPaused(paused: boolean): void {
    this.paused = paused;
  }
  isPaused(): boolean {
    return this.paused || document.hidden;
  }

  private tick(now: number): void {
    const dt = Math.max(0, Math.min(250, now - this.last));
    this.last = now;
    this.clock.poll(now);
    if (
      this.fighter?.phase === 'live' &&
      !document.hidden &&
      this.fighter.lastMessageMs > 0 &&
      now - this.fighter.lastMessageMs > 1000 &&
      now - this.lastWatchdogMs > 2000
    ) {
      this.lastWatchdogMs = now;
      this.online.socket.disconnect().connect();
    }
    if (
      this.fighter &&
      this.fighter.inputDelay === null &&
      (this.clock.sync.sampleCount >= 4 || now - this.createdAt > 5000)
    )
      this.fighter.ready();
    let events: readonly CombatEvent[] = [];
    if (this.started && !document.hidden) {
      if (this.fighter) {
        this.alpha = this.fighter.frame(now, (state: CombatState) =>
          inputToMask(this.source!.sample(state, this.fighter!.seat === 0 ? 'a' : 'b')),
        );
        events = this.fighter.session.reconciler
          .drain()
          .filter(
            (c) =>
              ((c.kind === 'play' || c.kind === 'late') && c.event.type !== 'KO') ||
              (c.kind === 'confirm' && c.event.type === 'KO'),
          )
          .map((c) => c.event);
      } else if (this.spectator) {
        events = this.spectator.frame(now);
        this.alpha = this.spectator.alpha;
      }
    }
    const frame = this.frame();
    for (const listener of this.frameListeners) listener(frame, events, dt);
    const result = this.result();
    if (result && !this.ended) {
      this.ended = true;
      for (const listener of this.endListeners) listener(result);
    }
  }

  private schedule(): void {
    if (this.disposed) return;
    this.raf = requestAnimationFrame((now) => {
      this.raf = null;
      this.tick(now);
      this.schedule();
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.raf !== null) cancelAnimationFrame(this.raf);
    for (const off of this.offs) off();
    this.source?.dispose?.();
    this.frameListeners.clear();
    this.endListeners.clear();
    this.online.socket.emit(FIGHT_C2S.stats, {
      fightId: this.info.id,
      depthHist: this.fighter?.session.stats.predictionDepth.buckets ?? [],
      rollbacks: this.fighter?.session.stats.rollbacks ?? 0,
      resimTicks: this.fighter?.session.stats.resimTicks ?? 0,
      freezes: this.fighter?.session.stats.frozenFrames ?? 0,
      snaps: 0,
      phantomKos: this.fighter?.session.reconciler.stats.phantomKos ?? 0,
      rebinds: this.fighter?.session.reconciler.stats.rebinds ?? 0,
      desyncs: this.fighter?.session.stats.desyncs ?? 0,
    });
  }
}
