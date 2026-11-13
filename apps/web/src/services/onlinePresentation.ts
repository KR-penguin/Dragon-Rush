import type { FightGoMsg, FightReplayMsg, FightStartMsg } from '@dragon-rush/protocol';
import type { GameUpdate, PendingFight } from './gameClient';

interface FightMetadata {
  start: FightStartMsg;
  go: FightGoMsg | null;
  replay: PendingFight['replay'];
  entry: BoardEntry | null;
}

interface BoardEntry {
  update: GameUpdate;
  fightId: number | null;
}

/** Keeps server progress independent from the fights still being presented on screen. */
export class OnlinePresentationQueue {
  private readonly board: BoardEntry[] = [];
  private readonly fights = new Map<number, FightMetadata>();
  private active: BoardEntry | null = null;
  private completedThrough = 0;
  private completedBoardVersion = -1;

  constructor(private readonly publish: (update: GameUpdate) => void) {}

  receive(update: GameUpdate): void {
    if (update.version <= this.completedBoardVersion) return;
    if (update.snapshot) {
      for (let i = this.board.length - 1; i >= 0; i--) {
        const previous = this.board[i]!;
        if (previous.update.version >= update.version) continue;
        this.board.splice(i, 1);
        if (previous.fightId !== null) this.fights.delete(previous.fightId);
      }
    }
    const existing =
      this.active?.update.version === update.version
        ? this.active
        : this.board.find((entry) => entry.update.version === update.version);
    if (existing) {
      existing.update = update;
      if (existing === this.active) {
        if (update.snapshot) this.publish(this.withFight(existing));
        else this.refreshActive();
      } else {
        this.bindFights();
        if (!this.prioritizeLive()) this.flush();
      }
      return;
    }
    const entry: BoardEntry = { update, fightId: null };
    this.board.push(entry);
    this.bindFights();
    if (!this.prioritizeLive()) this.flush();
  }

  start(start: FightStartMsg): void {
    if (start.fightId <= this.completedThrough) return;
    const existing = this.fights.get(start.fightId);
    if (existing) existing.start = start;
    else this.fights.set(start.fightId, { start, go: null, replay: null, entry: null });
    this.bindFights();
    const metadata = this.fights.get(start.fightId)!;
    const entry = metadata.entry;
    if (this.prioritizeLive()) return;
    if (entry === this.active) this.refreshActive();
    this.flush();
  }

  go(message: FightGoMsg): void {
    const metadata = this.fights.get(message.fightId);
    if (metadata) metadata.go = message;
  }

  replay(message: FightReplayMsg): void {
    const metadata = this.fights.get(message.fightId);
    if (!metadata) return;
    const bytes: number[] = [];
    for (let i = 0; i < message.inputs.length; i += 3)
      for (let count = 0; count < message.inputs[i]!; count++)
        bytes.push(message.inputs[i + 1]!, message.inputs[i + 2]!);
    metadata.replay = {
      result: message.outcome,
      ticks: message.endTick,
      inputs: Uint8Array.from(bytes),
    };
    if (metadata.entry === this.active) this.refreshActive();
  }

  metadata(fightId: number): FightMetadata | undefined {
    return this.fights.get(fightId);
  }

  complete(fightId: number): boolean {
    if (this.active?.fightId !== fightId) return false;
    this.completedBoardVersion = this.active.update.version;
    this.active = null;
    this.completedThrough = Math.max(this.completedThrough, fightId);
    this.fights.delete(fightId);
    this.flush();
    return true;
  }

  private bindFights(): void {
    for (const metadata of this.fights.values()) {
      if (metadata.entry) continue;
      const { start } = metadata;
      const entry = this.board.find(({ update, fightId }) => {
        const request = update.publicState.combat;
        return (
          fightId === null &&
          update.pending?.phase === 'COMBAT' &&
          request &&
          request.kind === start.kind &&
          request.a === start.seats[0]?.engineSeat &&
          request.b === (start.kind === 'duel' ? start.seats[1]?.engineSeat : null)
        );
      });
      if (entry) {
        entry.fightId = start.fightId;
        metadata.entry = entry;
      }
    }
  }

  private prioritizeLive(): boolean {
    const metadata = [...this.fights.values()]
      .reverse()
      .find(
        ({ start, entry }) =>
          entry &&
          entry !== this.active &&
          start.you.role === 'fighter' &&
          (this.active || this.board[0] !== entry),
      );
    if (!metadata?.entry) return false;
    const { entry, start } = metadata;
    // A local fighter must join the current live match instead of waiting for old highlights.
    this.board.splice(0, this.board.indexOf(entry) + 1);
    this.completedThrough = start.fightId - 1;
    this.completedBoardVersion = entry.update.version - 1;
    for (const id of this.fights.keys()) if (id < start.fightId) this.fights.delete(id);
    this.active = entry;
    this.publish({ ...this.withFight(entry), snapshot: true });
    return true;
  }

  private flush(): void {
    if (this.active) return;
    while (this.board.length) {
      const entry = this.board[0]!;
      if (entry.update.pending?.phase === 'COMBAT') {
        if (entry.fightId === null) return;
        this.board.shift();
        this.active = entry;
        this.publish(this.withFight(entry));
        return;
      }
      this.board.shift();
      this.publish({ ...entry.update, fight: null });
    }
  }

  private refreshActive(): void {
    if (this.active)
      this.publish({
        ...this.withFight(this.active),
        snapshot: false,
        events: [],
        presentationOnly: true,
      });
  }

  private withFight(entry: BoardEntry): GameUpdate {
    const metadata = entry.fightId === null ? undefined : this.fights.get(entry.fightId);
    const request = entry.update.publicState.combat;
    if (!metadata || !request) return { ...entry.update, fight: null };
    const { start, go, replay } = metadata;
    const sideFor = (seat: 0 | 1): PendingFight['sides'][number] => ({
      side: seat === 0 ? 'a' : 'b',
      seat: seat === 0 ? request.a : request.b,
      control:
        request.b === null && seat === 1
          ? 'dragon'
          : start.you.role === 'fighter' && start.you.seat === seat
            ? 'keyboard-solo'
            : 'remote',
    });
    return {
      ...entry.update,
      fight: {
        id: start.fightId,
        request,
        setup: start.setup,
        seed: start.seed,
        sides: [sideFor(0), sideFor(1)],
        botLevel: 'normal',
        replay,
        online: { start, go },
      },
    };
  }
}
