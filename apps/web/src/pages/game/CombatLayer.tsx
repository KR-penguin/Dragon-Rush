import type { CombatResult } from '@dragon-rush/combat';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { CombatScreen } from '../../components/combat/CombatScreen';
import { ControlsPanel } from '../../components/combat/ControlsPanel';
import { FightErrorBoundary } from '../../components/combat/FightErrorBoundary';
import { useArenaRenderer } from '../../hooks/useArenaRenderer';
import { useEscape } from '../../hooks/useEscape';
import { useFightBgm } from '../../hooks/useFightBgm';
import { useFightFlow } from '../../hooks/useFightFlow';
import { useFightGate } from '../../hooks/useFightGate';
import { useFightPause } from '../../hooks/useFightPause';
import { useFightSession } from '../../hooks/useFightSession';
import { useKeyboardTest } from '../../hooks/useKeyboardTest';
import type { PendingFight, SeatInfo } from '../../services/gameClient';
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
      <FightContainer fight={fight} seats={seats} onDone={(r) => report(fight.id, r)} />
    </FightErrorBoundary>
  );
}

interface FightContainerProps {
  fight: PendingFight;
  seats: readonly SeatInfo[];
  onDone: (result: CombatResult) => void;
}

function FightContainer({ fight, seats, onDone }: FightContainerProps) {
  const cards = useMemo(() => fightCards(fight, seats), [fight, seats]);
  const bundle = useFightSession(fight);
  const session = bundle?.session ?? null;
  const flow = useFightFlow(session, fight, onDone);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  useArenaRenderer(canvasRef, stageRef, session, fight, cards);
  useFightBgm(fight.setup.kind);

  const [helpOpen, setHelpOpen] = useState(false);
  const [testing, setTesting] = useState(false);
  const pressed = useKeyboardTest(helpOpen && testing);
  const live = fight.replay === null && flow.phase === 'fight';
  const pause = useFightPause(session, live, helpOpen);
  useEscape(flow.skip !== null && !helpOpen, () => flow.skip?.());

  return (
    <CombatScreen
      cards={cards}
      phase={flow.phase}
      result={flow.result}
      go={flow.go}
      highlight={fight.replay !== null}
      paused={pause.paused}
      canvasRef={canvasRef}
      stageRef={stageRef}
      onSkip={flow.skip}
      onResume={pause.resume}
      onOpenControls={() => setHelpOpen(true)}
    >
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
