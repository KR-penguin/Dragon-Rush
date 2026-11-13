import type { CombatResult } from '@dragon-rush/combat';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { CombatScreen } from '../../components/combat/CombatScreen';
import { ControlsPanel } from '../../components/combat/ControlsPanel';
import { FightErrorBoundary } from '../../components/combat/FightErrorBoundary';
import { useArenaRenderer } from '../../hooks/useArenaRenderer';
import { useCombatPointerAttack } from '../../hooks/useCombatPointerAttack';
import { useEscape } from '../../hooks/useEscape';
import { useFightFlow } from '../../hooks/useFightFlow';
import { useFightGate } from '../../hooks/useFightGate';
import { useFightPause } from '../../hooks/useFightPause';
import { useFightSession } from '../../hooks/useFightSession';
import { touchControlSide } from '../../hooks/useTouchCooldowns';
import { useKeyboardTest } from '../../hooks/useKeyboardTest';
import type { PendingFight, SeatInfo } from '../../services/gameClient';
import type { FightSession } from '../../services/fight';
import type { FightFrame } from '../../services/fight/types';
import { BOT_REPLAY_SPEED } from '../../services/fight/LocalFightSession';
import type { FightNetStats } from '@dragon-rush/netcode';
import { netDebugEnabled } from '../../services/fight/netDebug';
import { NetSimPanel } from './NetSimPanel';
import { FightTouchControls } from './FightTouchControls';
import type { GameStore } from '../../store/gameStore';
import { fightCards } from '../../types/fightView';
import '../../styles/combat.css';

const NO_SEATS: readonly SeatInfo[] = [];

/**
 * The Game page's single mount point for real-time fights. Shows the fight the client is waiting
 * on once the board has caught up, and reports the result back through `GameClient.reportFight`.
 * Bot-only replays play at 1×; a crashed screen falls back to dice.
 */
export function CombatLayer({
  store,
  onFightLive,
  onCoveredChange,
}: {
  store: GameStore;
  onFightLive: (live: boolean) => void;
  onCoveredChange: (covered: boolean) => void;
}) {
  const fight = useFightGate(store);
  const client = useStore(store, (s) => s.client);
  const seats = useStore(store, (s) => s.latest?.seats) ?? NO_SEATS;
  const report = useCallback(
    (id: number, outcome: CombatResult | 'dice') => {
      void client?.reportFight?.(id, outcome);
    },
    [client],
  );
  if (!fight || !client?.reportFight) return null;
  return (
    <FightErrorBoundary key={fight.id} onError={() => report(fight.id, 'dice')}>
      <FightContainer
        fight={fight}
        seats={seats}
        client={client}
        onFightLive={onFightLive}
        onCoveredChange={onCoveredChange}
        onDone={(r) => report(fight.id, r)}
      />
    </FightErrorBoundary>
  );
}

interface FightContainerProps {
  fight: PendingFight;
  seats: readonly SeatInfo[];
  onDone: (result: CombatResult) => void;
  client: NonNullable<ReturnType<GameStore['getState']>['client']>;
  onFightLive: (live: boolean) => void;
  onCoveredChange: (covered: boolean) => void;
}

function FightContainer({
  fight,
  seats,
  client,
  onDone,
  onFightLive,
  onCoveredChange,
}: FightContainerProps) {
  const cards = useMemo(() => fightCards(fight, seats), [fight, seats]);
  const bundle = useFightSession(fight, client);
  const session = bundle?.session ?? null;
  const flow = useFightFlow(session, fight, onDone);
  useEffect(() => {
    if (flow.phase !== 'intro') onCoveredChange(true);
  }, [flow.phase, onCoveredChange]);
  useEffect(() => () => onCoveredChange(false), [onCoveredChange]);
  useEffect(() => {
    if (!session || flow.phase !== 'fight') return;
    let playing = false;
    const onFrame = (frame: FightFrame) => {
      if (playing || frame.curr.tick < 1) return;
      playing = true;
      onFightLive(true);
    };
    const off = session.onFrame(onFrame);
    onFrame(session.frame());
    return off;
  }, [session, flow.phase, onFightLive]);
  useEffect(() => () => onFightLive(false), [onFightLive]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  useArenaRenderer(canvasRef, stageRef, session, fight, cards);

  const [helpOpen, setHelpOpen] = useState(false);
  const [testing, setTesting] = useState(false);
  const pressed = useKeyboardTest(helpOpen && testing);
  const live = fight.replay === null && flow.phase === 'fight';
  const pause = useFightPause(session, live, helpOpen);
  const touchSide = touchControlSide(fight.sides);
  const pointerCapable = touchSide !== null;
  useLayoutEffect(() => {
    if (!live || pause.paused || helpOpen) bundle?.tracker.touch.releaseAll();
  }, [bundle, live, pause.paused, helpOpen]);
  useCombatPointerAttack(
    canvasRef,
    bundle?.tracker ?? null,
    live && pointerCapable && !pause.paused && !helpOpen,
  );
  useEscape(flow.skip !== null && !helpOpen, () => flow.skip?.());

  return (
    <CombatScreen
      cards={cards}
      phase={flow.phase}
      result={flow.result}
      go={flow.go}
      replaySpeed={fight.replay !== null ? BOT_REPLAY_SPEED : null}
      paused={pause.paused}
      pointerCapable={pointerCapable && fight.replay === null}
      online={fight.online !== undefined}
      touchControls={
        live && touchSide && bundle && !pause.paused && !helpOpen ? (
          <FightTouchControls
            session={session}
            side={touchSide}
            tracker={bundle.tracker.touch}
            onPause={pause.pause}
          />
        ) : null
      }
      canvasRef={canvasRef}
      stageRef={stageRef}
      onSkip={flow.skip}
      onResume={pause.resume}
      onOpenControls={() => setHelpOpen(true)}
    >
      {fight.online && <NetStatus session={session} fight={fight} />}
      {fight.online && netDebugEnabled() && <NetSimPanel />}
      {helpOpen && (
        <ControlsPanel
          pressed={pressed}
          testing={testing}
          onToggleTest={() => setTesting((t) => !t)}
          onClose={() => {
            setHelpOpen(false);
            setTesting(false);
          }}
        />
      )}
    </CombatScreen>
  );
}

function NetStatus({ session, fight }: { session: FightSession | null; fight: PendingFight }) {
  const [stats, setStats] = useState<FightNetStats | null>(null);
  useEffect(() => {
    if (!session?.stats) return;
    const read = () => setStats(session.stats?.() ?? null);
    read();
    const id = setInterval(read, 250);
    return () => clearInterval(id);
  }, [session]);
  if (!stats) return null;
  const ownSeat = fight.online?.start.you.role === 'fighter' ? fight.online.start.you.seat : null;
  const ownWarning = stats.frozen || (ownSeat !== null && stats.quality[ownSeat] === 2);
  const opponentWarning = ownSeat !== null && stats.quality[ownSeat === 0 ? 1 : 0] === 2;
  return (
    <div className="combat-badge" role="status" aria-live="polite">
      {Math.round(stats.rttMs)}ms · 입력 지연 {stats.inputDelay}f · 롤백 {stats.rollbackFrames}f
      (p95)
      {ownWarning ? ' · 내 연결 불안정' : ''}
      {opponentWarning ? ' · 상대 연결 불안정' : ''}
      {stats.ownBot ? ' · AI 대행' : ''}
    </div>
  );
}
