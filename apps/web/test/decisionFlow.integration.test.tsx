import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { startServer } from '../../server/src/app';
import { useDecisionUi } from '../src/hooks/useDecisionUi';
import { DecisionDialogs } from '../src/pages/game/DecisionDialogs';
import { LocalGameClient, type Scheduler } from '../src/services/LocalGameClient';
import { OnlineSession } from '../src/services/onlineSession';
import { createGameStore, isAnimating, type GameStore } from '../src/store/gameStore';

vi.mock('../src/hooks/useAssetUrl', () => ({ useAssetUrl: () => null }));
vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>();
  return {
    ...actual,
    randomInt: (min: number, max?: number): number =>
      min === 0 && max === 2 ** 47
        ? 2
        : max === undefined
          ? actual.randomInt(min)
          : actual.randomInt(min, max),
  };
});

const noBotScheduler: Scheduler = () => () => undefined;

function dialogMarkup(store: GameStore, currentSeatOnly = false): string {
  function Probe() {
    const { latest, display } = store.getState();
    if (!latest || !display) return null;
    const update =
      currentSeatOnly && latest.pending
        ? { ...latest, controllableSeats: [latest.pending.actor] }
        : latest;
    const ui = useDecisionUi(store, update, display, isAnimating(store.getState()));
    return (
      <DecisionDialogs
        ui={ui}
        state={update.publicState}
        nameOf={(seat) => update.seats.find((s) => s.seat === seat)?.name ?? `P${seat + 1}`}
      />
    );
  }
  return renderToStaticMarkup(<Probe />);
}

it('opens the zero-coin shop as soon as queued movement reaches it', async () => {
  const client = new LocalGameClient(
    {
      seed: 8,
      debug: true,
      seats: [
        { name: 'A', job: 'swordsman', kind: 'human' },
        { name: 'B', job: 'archer', kind: 'bot' },
      ],
    },
    noBotScheduler,
  );
  const store = createGameStore();
  store.getState().attach(client);
  store.getState().snap();
  const actor = store.getState().latest!.pending!.actor;
  client.debugPatchPlayer(actor, { coins: 0, items: { teleport: 1 } });
  store.getState().snap();
  expect(await store.getState().submit({ type: 'USE_TELEPORT', tile: 6 })).toEqual({ ok: true });
  const landed = store.getState().latest!;
  expect(landed.pending).toMatchObject({ actor, phase: 'POST_MOVE' });
  expect(landed.publicState.turn.canBuy).toBe(true);
  expect(landed.legalActions).toEqual([{ type: 'END_TURN' }]);
  expect(store.getState().queue.map((event) => event.type)).toEqual([
    'ItemUsed',
    'Moved',
    'TileResolved',
  ]);
  expect(dialogMarkup(store)).not.toContain('상점');
  store.getState().advance();
  expect(dialogMarkup(store)).not.toContain('상점');
  store.getState().advance();
  const shop = dialogMarkup(store);
  expect(shop).toContain('상점');
  expect(shop).toContain('보유 코인');
  expect(shop).toContain('>0</b>');
  expect(shop.match(/disabled=""/g) ?? []).toHaveLength(3);
  expect(store.getState().queue).toHaveLength(1);
  store.getState().detach();
});

it('shows the one-opponent confirmation before COMBAT and the shop after a win', async () => {
  const client = new LocalGameClient(
    {
      seed: 8,
      debug: true,
      seats: [
        { name: 'A', job: 'swordsman', kind: 'human' },
        { name: 'B', job: 'archer', kind: 'human' },
        { name: 'C', job: 'mage', kind: 'human' },
      ],
    },
    noBotScheduler,
  );
  const store = createGameStore();
  store.getState().attach(client);
  const before = store.getState().latest!;
  expect(before.publicState.round).toBe(1);
  expect(before.pending?.phase).toBe('PRE_ROLL');
  const arriver = before.pending!.actor;
  const defender = before.publicState.players.find((p) => p.seat !== arriver)!.seat;
  const bystander = before.publicState.players.find(
    (p) => p.seat !== arriver && p.seat !== defender,
  )!.seat;
  client.debugPatchPlayer(defender, { position: 6, items: { shield: 0 } });
  client.debugPatchPlayer(bystander, { position: 0 });
  client.debugPatchPlayer(arriver, { items: { teleport: 1, shield: 0 } });
  store.getState().snap();
  expect(await store.getState().submit({ type: 'USE_TELEPORT', tile: 6 })).toEqual({ ok: true });
  const encounter = store.getState().latest!;
  expect(encounter.pending).toMatchObject({ actor: arriver, phase: 'CHOOSE_PVP_TARGET' });
  expect(encounter.legalActions).toEqual([{ type: 'CHOOSE_PVP_TARGET', target: defender }]);
  expect(encounter.events.map((e) => e.type)).not.toContain('CombatStarted');
  expect(dialogMarkup(store, true)).not.toContain('결투 발생');
  store.getState().advance();
  store.getState().advance();
  expect(dialogMarkup(store, true)).toContain('결투 발생');
  expect(dialogMarkup(store, true)).toContain('결투 시작');
  expect(await store.getState().submit({ type: 'CHOOSE_PVP_TARGET', target: defender })).toEqual({
    ok: true,
  });
  const defenderDecision = store.getState().latest!;
  expect(defenderDecision.pending).toMatchObject({ actor: defender, phase: 'SHIELD_DECISION' });
  expect(defenderDecision.legalActions).toEqual([{ type: 'SHIELD_DECISION', use: false }]);
  expect(dialogMarkup(store, true)).toContain('결투 확인');
  expect(dialogMarkup(store, true)).toContain('결투 시작');
  expect(await store.getState().submit({ type: 'SHIELD_DECISION', use: false })).toEqual({
    ok: true,
  });
  const combat = store.getState().latest!;
  expect(combat.pending?.phase).toBe('COMBAT');
  expect(combat.fight?.request).toEqual({ kind: 'duel', a: arriver, b: defender });
  expect(await client.reportFight(combat.fight!.id, { winner: 'a', hpA: 1, hpB: 0 })).toEqual({
    ok: true,
  });
  const won = store.getState().latest!;
  expect(won.pending).toMatchObject({ actor: arriver, phase: 'POST_MOVE' });
  expect(won.publicState.turn.canBuy).toBe(true);
  expect(won.events).toContainEqual({
    type: 'TileResolved',
    seat: arriver,
    tile: 6,
    tileId: 'SHOP',
  });
  expect(store.getState().queue.length).toBeGreaterThan(0);
  expect(dialogMarkup(store, true)).toContain('상점');
  store.getState().detach();
});

it('delivers a SHOP decision through a real online client before queued effects finish', async () => {
  const server = await startServer(
    {
      port: 0,
      host: '127.0.0.1',
      turnTimeoutMs: 30_000,
      reconnectGraceMs: 2_000,
      botActionDelayMs: 0,
      maxConsecutiveTimeouts: 3,
      modelsDir: 'nonexistent-models-dir',
      webDistDir: null,
      roomTtlMs: 60_000,
      messagesPerSecond: 1000,
    },
    { quiet: true },
  );
  const sessions: OnlineSession[] = [];
  const stores: GameStore[] = [];
  try {
    const alice = await OnlineSession.connect(server.url);
    sessions.push(alice);
    const bob = await OnlineSession.connect(server.url);
    sessions.push(bob);
    const created = await alice.createRoom('Alice');
    if (!created.ok) throw new Error(created.error.code);
    expect((await bob.joinRoom(created.data.roomCode, 'Bob')).ok).toBe(true);
    expect((await alice.selectJob('swordsman')).ok).toBe(true);
    expect((await bob.selectJob('archer')).ok).toBe(true);
    expect((await bob.setReady(true)).ok).toBe(true);
    for (const session of sessions) {
      const store = createGameStore();
      store.getState().attach(session.createGameClient());
      stores.push(store);
    }
    expect((await alice.start()).ok).toBe(true);
    await waitFor(() => stores.every((store) => store.getState().latest !== null));
    const actorStore = stores.find((store) =>
      store.getState().latest?.legalActions.some((action) => action.type === 'ROLL_DICE'),
    );
    expect(actorStore).toBeDefined();
    const startVersion = actorStore!.getState().latest!.version;
    actorStore!.getState().snap();
    expect(await actorStore!.getState().submit({ type: 'ROLL_DICE' })).toEqual({ ok: true });
    await waitFor(() => actorStore!.getState().latest!.version > startVersion);
    const update = actorStore!.getState().latest!;
    expect(update.pending?.phase).toBe('POST_MOVE');
    expect(update.publicState.turn.canBuy).toBe(true);
    expect(update.events.map((event) => event.type)).toEqual([
      'DiceRolled',
      'Moved',
      'TileResolved',
    ]);
    expect(dialogMarkup(actorStore!)).not.toContain('상점');
    actorStore!.getState().advance();
    expect(dialogMarkup(actorStore!)).not.toContain('상점');
    actorStore!.getState().advance();
    expect(dialogMarkup(actorStore!)).toContain('상점');
    expect(actorStore!.getState().queue).toHaveLength(1);
  } finally {
    for (const store of stores) store.getState().detach();
    for (const session of sessions) session.disconnect();
    await server.close();
  }
});

async function waitFor(check: () => boolean): Promise<void> {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > 10_000) throw new Error('timed out waiting for online update');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
