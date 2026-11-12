import type { CombatResult } from '@dragon-rush/combat';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { useKeyboardTest } from '../../hooks/useKeyboardTest';
import type { PendingFight, SeatInfo } from '../../services/gameClient';
import type { FightSession } from '../../services/fight';
import type { FightNetStats } from '@dragon-rush/netcode';
import { netDebugEnabled } from '../../services/fight/netDebug';
import { NetSimPanel } from './NetSimPanel';
import type { GameStore } from '../../store/gameStore';
import { fightCards } from '../../types/fightView';
import '../../styles/combat.css';

const NO_SEATS: readonly SeatInfo[] = [];

/**
 * The Game page's single mount point for real-time fights. Shows the fight the client is waiting
 * on once the board has caught up, and reports the result back through `GameClient.reportFight`.
 * Highlights of bot-only fights are skipped at 4× board speed; a crashed screen falls back to dice.
 */
export function CombatLayer({ store }: { store: GameStore }) {
  const fight = useFightGate(store);
  const client = useStore(store, (s) => s.client);
  const speed = useStore(store, (s) => s.speed);
  const seats = useStore(store, (s) => s.latest?.seats) ?? NO_SEATS;
  const report = useCallback(
    (id: number, outcome: CombatResult | 'dice') => {
      void client?.reportFight?.(id, outcome);
    },
    [client],
  );
  const fastSkip = fight !== null && fight.replay !== null && speed >= 4;
  useEffect(() => {
    if (fastSkip && fight?.replay) report(fight.id, fight.replay.result);
  }, [fastSkip, fight, report]);

  if (!fight || !client?.reportFight || fastSkip) return null;
  return (
    <FightErrorBoundary key={fight.id} onError={() => report(fight.id, 'dice')}>
      <FightContainer
        fight={fight}
        seats={seats}
        client={client}
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
}

function FightContainer({ fight, seats, client, onDone }: FightContainerProps) {
  const cards = useMemo(() => fightCards(fight, seats), [fight, seats]);
  const bundle = useFightSession(fight, client);
  const session = bundle?.session ?? null;
  const flow = useFightFlow(session, fight, onDone);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  useArenaRenderer(canvasRef, stageRef, session, fight, cards);

  const [helpOpen, setHelpOpen] = useState(false);
  const [testing, setTesting] = useState(false);
  const pressed = useKeyboardTest(helpOpen && testing);
  const live = fight.replay === null && flow.phase === 'fight';
  const pause = useFightPause(session, live, helpOpen);
  const pointerCapable = fight.sides.some(
    (side) => side.control === 'keyboard-p1' || side.control === 'keyboard-solo',
  );
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
      highlight={fight.replay !== null}
      paused={pause.paused}
      pointerCapable={pointerCapable && fight.replay === null}
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
