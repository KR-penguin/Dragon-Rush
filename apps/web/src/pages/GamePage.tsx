import type { CombatantRef, SeatId } from '@dragon-rush/engine';
import { useCallback, useMemo, useState } from 'react';
import { Board, type TokenView } from '../components/board/Board';
import { DragonLair } from '../components/board/DragonLair';
import { Modal } from '../components/common/Modal';
import { ActionBar } from '../components/hud/ActionBar';
import { GameLog } from '../components/hud/GameLog';
import { PlayerPanel } from '../components/hud/PlayerPanel';
import { TopBar } from '../components/hud/TopBar';
import { CombatOverlay, type FighterLook } from '../components/overlays/CombatOverlay';
import { ResultOverlay } from '../components/overlays/ResultOverlay';
import { useAnimationQueue } from '../hooks/useAnimationQueue';
import { useAssetUrl } from '../hooks/useAssetUrl';
import { playSfx, useBgm, useEventSfx, useMuted } from '../hooks/useAudio';
import { useCombatView } from '../hooks/useCombatView';
import { useCountdown } from '../hooks/useCountdown';
import { useDecisionUi } from '../hooks/useDecisionUi';
import { useEliminations } from '../hooks/useEliminations';
import { useEscape } from '../hooks/useEscape';
import { useGameView } from '../hooks/useGameView';
import { useLastDice } from '../hooks/useLastDice';
import { useSteppedMove } from '../hooks/useSteppedMove';
import type { GameSession, MenuPage } from '../store/navStore';
import { BOARD_BG_PATH } from '../types/assetPaths';
import { statOptions } from '../types/decisionView';
import { DRAGON_NAME, PHASE_LABEL, seatColor } from '../types/labels';
import { playerCards, seatName } from '../types/playerView';
import { outcomeHeadline, resultRows } from '../types/resultView';
import { DecisionDialogs } from './game/DecisionDialogs';

const EXIT_LABEL: Record<MenuPage, string> = {
  home: '처음으로',
  localSetup: '게임 설정으로',
  online: '로비로',
};
const DRAGON_LOOK: FighterLook = { name: DRAGON_NAME, job: null, color: '#c0392b' };
const stepSfx = () => playSfx('move_step');

interface GamePageProps {
  session: GameSession;
  onExit: () => void;
  onRestart: (() => void) | null;
}

/** Plays any GameClient: board, panels, decisions, combat and result. */
export function GamePage({ session, onExit, onRestart }: GamePageProps) {
  const { store } = session;
  useAnimationQueue(store);
  useEventSfx(store);
  const view = useGameView(store);
  const { latest, display, animating } = view;
  const ui = useDecisionUi(store, latest, animating);
  const combat = useCombatView(store);
  const eliminations = useEliminations(store);
  const stepped = useSteppedMove(view.current, view.speed, stepSfx);
  const dice = useLastDice(view.current, display);
  const countdown = useCountdown(latest?.pending?.timeLeftMs ?? null, latest?.version ?? 0);
  const boardBg = useAssetUrl(BOARD_BG_PATH);
  const audio = useMuted();
  const [confirmExit, setConfirmExit] = useState(false);
  useBgm(combat?.kind === 'dragonFight' ? 'dragon_battle' : 'board');

  const escapable =
    ui.teleportPicking || ui.dialog === 'thief' || ui.dialog === 'dragon' || ui.dialog === 'shop';
  useEscape(escapable, () => (ui.dialog === 'shop' ? ui.closeShop() : ui.cancel()));

  const seats = useMemo(() => latest?.seats ?? [], [latest]);
  const nameOf = useCallback((seat: SeatId) => seatName(seats, seat), [seats]);

  const tokens = useMemo<TokenView[]>(() => {
    if (!display) return [];
    return display.players
      .filter((p) => p.alive)
      .map((p) => ({
        seat: p.seat,
        tile: stepped?.seat === p.seat ? stepped.tile : p.position,
        color: seatColor(p.seat),
        job: p.job,
        name: nameOf(p.seat),
        active: p.seat === display.current && !display.outcome,
      }));
  }, [display, stepped, nameOf]);

  const targets = useMemo(
    () => (ui.teleportPicking ? new Set(ui.groups.teleportTiles) : null),
    [ui.teleportPicking, ui.groups],
  );

  const lookOf = useCallback(
    (ref: CombatantRef): FighterLook => {
      if (ref === 'dragon') return DRAGON_LOOK;
      const job = display?.players.find((p) => p.seat === ref)?.job ?? null;
      return { name: nameOf(ref), job, color: seatColor(ref) };
    },
    [display, nameOf],
  );

  if (!latest || !display) {
    return <main className="game-loading">게임을 불러오는 중…</main>;
  }

  const state = latest.publicState;
  const actor = ui.actor;
  const phase = ui.phase;
  const pendingText =
    actor !== null && phase !== null ? `${nameOf(actor)}님의 결정: ${PHASE_LABEL[phase]}` : '';
  const finished = state.outcome !== null && !animating;
  const decisionText = finished
    ? '게임 종료'
    : animating
      ? `${nameOf(display.current)}님의 턴`
      : pendingText;

  let status = pendingText;
  if (finished) status = '게임이 끝났습니다';
  else if (animating) status = '⏳ 진행 중…';
  else if (!ui.mine && actor !== null) status = `${nameOf(actor)}님이 결정하는 중…`;

  const mainPhase = phase === 'PRE_ROLL' || phase === 'POST_MOVE';
  // While another seat's turn is still animating, do not reveal the next decision's buttons yet.
  const showActions =
    ui.mine && mainPhase && !ui.handoff && (!animating || display.current === actor);
  const shopAvailable = phase === 'POST_MOVE' && (ui.groups.buys.length > 0 || state.turn.canBuy);

  return (
    <div className="game">
      <TopBar
        round={display.round}
        speed={view.speed}
        canSkip={animating}
        muted={audio.muted}
        onSpeed={(s) => store.getState().setSpeed(s)}
        onSkip={() => store.getState().snap()}
        onToggleMute={audio.toggle}
        onExit={() => (state.outcome ? onExit() : setConfirmExit(true))}
      />

      <div className="game-body">
        <aside className="game-players">
          {playerCards(display, seats, animating ? null : actor).map((card) => (
            <PlayerPanel key={card.seat} card={card} />
          ))}
        </aside>

        <section className="game-board">
          <Board
            tiles={display.rules.board}
            tokens={tokens}
            targets={targets}
            activeTile={display.players.find((p) => p.seat === display.current)?.position ?? null}
            backgroundUrl={boardBg}
            onPickTile={(tile) => void ui.submit({ type: 'USE_TELEPORT', tile })}
          >
            <DragonLair
              dragon={display.rules.dragon}
              round={display.round}
              maxRounds={display.rules.maxRounds}
              dice={dice}
              decision={decisionText}
              countdown={countdown}
            >
              {ui.teleportPicking && (
                <div className="pick-banner">
                  <span>🌀 이동할 칸을 선택하세요</span>
                  <button type="button" className="btn btn-ghost" onClick={ui.cancel}>
                    취소 (Esc)
                  </button>
                </div>
              )}
            </DragonLair>
          </Board>
        </section>

        <aside className="game-side">
          <GameLog entries={view.log} />
        </aside>
      </div>

      <ActionBar
        status={status}
        showActions={showActions}
        locked={ui.locked || ui.teleportPicking}
        groups={ui.groups}
        shopAvailable={shopAvailable}
        upgrades={
          showActions && actor !== null ? statOptions(state, actor, ui.groups.upgrades) : null
        }
        error={view.lastError}
        onRoll={() => void ui.submit({ type: 'ROLL_DICE' })}
        onEndTurn={() => void ui.submit({ type: 'END_TURN' })}
        onDragon={() => ui.open('dragon')}
        onTeleport={() => ui.open('teleport')}
        onThief={() => ui.open('thief')}
        onShop={() => ui.open('shop')}
        onUpgrade={(stat) => void ui.submit({ type: 'UPGRADE', stat })}
      />

      <DecisionDialogs ui={ui} state={state} nameOf={nameOf} />

      {combat && (
        <CombatOverlay view={combat} lookOf={lookOf} onSkip={() => store.getState().snap()} />
      )}

      {finished && state.outcome && (
        <ResultOverlay
          {...outcomeHeadline(state.outcome, nameOf)}
          rounds={state.round}
          rows={resultRows(state, nameOf, eliminations)}
          onRestart={onRestart}
          onHome={onExit}
          homeLabel={EXIT_LABEL[session.exitTo]}
        />
      )}

      {confirmExit && (
        <Modal
          title="게임에서 나갈까요?"
          onClose={() => setConfirmExit(false)}
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setConfirmExit(false)}>
                계속하기
              </button>
              <button type="button" className="btn btn-danger" onClick={onExit}>
                나가기
              </button>
            </>
          }
        >
          <p>진행 중인 게임은 저장되지 않습니다.</p>
        </Modal>
      )}
    </div>
  );
}
