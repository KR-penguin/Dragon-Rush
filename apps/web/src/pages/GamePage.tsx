import type { CombatantRef, SeatId } from '@dragon-rush/engine';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { Board } from '../components/board/Board';
import type { DiceRoll } from '../components/board/DiceTray';
import { DragonLair } from '../components/board/DragonLair';
import { TileTooltip, type TileHover } from '../components/board/TileTooltip';
import { Modal } from '../components/common/Modal';
import { Chronicle } from '../components/hud/Chronicle';
import { CornerCard } from '../components/hud/CornerCard';
import { Dock } from '../components/hud/Dock';
import { EventCards } from '../components/hud/EventCards';
import { SettingsPopover } from '../components/hud/SettingsPopover';
import { Spotlight } from '../components/hud/Spotlight';
import { TargetBanner } from '../components/hud/TargetBanner';
import { Toasts } from '../components/hud/Toasts';
import { TopStrip } from '../components/hud/TopStrip';
import { TurnRibbon } from '../components/hud/TurnRibbon';
import { CombatOverlay, type FighterLook } from '../components/overlays/CombatOverlay';
import { ResultOverlay } from '../components/overlays/ResultOverlay';
import { useAnimationQueue } from '../hooks/useAnimationQueue';
import { FxLayer, ShakeContainer } from '../fx';
import { useAssetUrl } from '../hooks/useAssetUrl';
import { useBgm, useMuted } from '../hooks/useAudio';
import { useBoardFit } from '../hooks/useBoardFit';
import { useCameraDirector } from '../hooks/useCameraDirector';
import { useCombatView } from '../hooks/useCombatView';
import { useCountdown } from '../hooks/useCountdown';
import { useDecisionUi } from '../hooks/useDecisionUi';
import { useEliminations } from '../hooks/useEliminations';
import { useEscape } from '../hooks/useEscape';
import { useEventCards } from '../hooks/useEventCards';
import { useGameView } from '../hooks/useGameView';
import { useLastDice } from '../hooks/useLastDice';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useSteppedMove } from '../hooks/useSteppedMove';
import { useToasts } from '../hooks/useToasts';
import { useTurnRibbon } from '../hooks/useTurnRibbon';
import { createEmberFxResolver } from '../services/emberFxResolver';
import type { GameSession, MenuPage } from '../store/navStore';
import { BOARD_BG_PATH } from '../types/assetPaths';
import { BOARD_TILT_DEG } from '../types/boardGeometry';
import { statOptions } from '../types/decisionView';
import { cornerOf } from '../types/hudLayout';
import { DRAGON_NAME, PHASE_LABEL, seatColor } from '../types/labels';
import { breathRunesLit, lairState } from '../types/lairView';
import { buildPawns } from '../types/pawnView';
import { playerCards, playerOf, seatName } from '../types/playerView';
import { outcomeHeadline, resultRows } from '../types/resultView';
import type { TileCategory } from '../types/tileView';
import { DecisionDialogs } from './game/DecisionDialogs';

const EXIT_LABEL: Record<MenuPage, string> = {
  home: '처음으로',
  localSetup: '게임 설정으로',
  online: '로비로',
};
const EXIT_NOTE = {
  local: '진행 중인 게임은 저장되지 않습니다.',
  online: '나가면 이 자리는 봇이 대신 플레이합니다. 다시 들어오면 이어서 할 수 있습니다.',
} as const;
const DRAGON_LOOK: FighterLook = { name: DRAGON_NAME, job: null, color: '#C8402A' };
const NARROW_QUERY = '(max-width: 1099px)';

interface GamePageProps {
  session: GameSession;
  onExit: () => void;
  onRestart: (() => void) | null;
}

/** Plays any GameClient on the Ember Table: board, corner cards, dock, decisions, combat, result. */
export function GamePage({ session, onExit, onRestart }: GamePageProps) {
  const { store } = session;
  useAnimationQueue(store);
  const view = useGameView(store);
  const { latest, display, animating } = view;
  const ui = useDecisionUi(store, latest, animating);
  const combat = useCombatView(store);
  const eliminations = useEliminations(store);
  // Effects and their sounds (hop ticks included) follow the animation queue via the FX layer.
  const stepped = useSteppedMove(view.current, view.speed);
  const fxResolver = useMemo(() => createEmberFxResolver(), []);
  const dice = useLastDice(view.current, display);
  const countdown = useCountdown(latest?.pending?.timeLeftMs ?? null, latest?.version ?? 0);
  const boardBg = useAssetUrl(BOARD_BG_PATH);
  const audio = useMuted();
  const motion = useReducedMotion();
  const narrow = useMediaQuery(NARROW_QUERY);
  const clientMode = useStore(store, (s) => s.client?.mode ?? 'local');
  const tiltDeg = motion.reduced || narrow ? 0 : BOARD_TILT_DEG;

  const areaRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<HTMLDivElement>(null);
  const fit = useBoardFit(areaRef, tiltDeg);
  useCameraDirector(store, cameraRef, { tiltDeg, reduced: motion.reduced });
  const { cards: eventCards, flyers } = useEventCards(store, motion.reduced);
  const toasts = useToasts(store);
  const ribbon = useTurnRibbon(store);

  const [confirmExit, setConfirmExit] = useState(false);
  const [chronicleOpen, setChronicleOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [legend, setLegend] = useState<TileCategory | null>(null);
  const [hover, setHover] = useState<TileHover | null>(null);
  const [preview, setPreview] = useState<number | null>(null);
  useBgm(combat?.kind === 'dragonFight' ? 'dragon_battle' : 'board');

  const escapable =
    ui.teleportPicking || ui.dialog === 'thief' || ui.dialog === 'dragon' || ui.dialog === 'shop';
  useEscape(escapable, () => (ui.dialog === 'shop' ? ui.closeShop() : ui.cancel()));
  useEscape(chronicleOpen, () => setChronicleOpen(false));
  useEscape(settingsOpen, () => setSettingsOpen(false));
  // Tiles swap between <div> and <button> when targeting toggles, so a hover may never see its leave.
  useEffect(() => setHover(null), [ui.teleportPicking]);
  useEffect(() => {
    if (ui.dialog !== 'moveAdjust') setPreview(null);
  }, [ui.dialog]);

  const seats = useMemo(() => latest?.seats ?? [], [latest]);
  const nameOf = useCallback((seat: SeatId) => seatName(seats, seat), [seats]);

  const pawns = useMemo(
    () =>
      display
        ? buildPawns({
            display,
            current: view.current,
            stepped,
            pending: latest?.pending ?? null,
            combat,
            speed: view.speed,
            nameOf,
          })
        : [],
    [display, view.current, stepped, latest, combat, view.speed, nameOf],
  );

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

  const onHoverTile = useCallback((index: number | null, el: HTMLElement | null) => {
    if (index === null || !el) setHover(null);
    else setHover({ index, rect: el.getBoundingClientRect() });
  }, []);

  if (!latest || !display) {
    return (
      <main className="game-loading">
        <span className="loading-die" />
        게임을 불러오는 중…
      </main>
    );
  }

  const state = latest.publicState;
  const actor = ui.actor;
  const phase = ui.phase;
  const controllable = latest.controllableSeats;
  const finished = state.outcome !== null && !animating;
  const pendingText =
    actor !== null && phase !== null ? `${nameOf(actor)}님의 결정: ${PHASE_LABEL[phase]}` : '';

  let status = pendingText;
  if (finished) status = '게임이 끝났습니다';
  else if (animating) status = `${nameOf(display.current)}님의 차례`;
  else if (!ui.mine && actor !== null) status = `${nameOf(actor)}님이 결정하는 중…`;

  const mainPhase = phase === 'PRE_ROLL' || phase === 'POST_MOVE';
  // While another seat's turn is still animating, do not reveal the next decision's buttons yet.
  const showActions = ui.mine && mainPhase && !ui.handoff && (!animating || display.current === actor);
  const shopAvailable = phase === 'POST_MOVE' && (ui.groups.buys.length > 0 || state.turn.canBuy);
  const thiefTargeting = ui.dialog === 'thief';
  const thiefTargets = new Set(thiefTargeting ? ui.groups.thiefTargets : []);

  const current = view.current;
  const roll: DiceRoll | null =
    current?.type === 'DiceRolled'
      ? { key: current, value: current.value, seat: current.seat, local: controllable.includes(current.seat) }
      : null;

  const spotlightMode =
    ui.teleportPicking || thiefTargeting
      ? 'targeting'
      : finished || combat || ui.dialog !== null
        ? 'off'
        : 'turn';
  const breathLit = breathRunesLit(combat, display.rules.dragon.breathEvery);
  const cards = playerCards(display, seats, animating ? null : actor);
  const ribbonPlayer = ribbon ? display.players.find((p) => p.seat === ribbon.seat) : undefined;
  const occupants = hover
    ? display.players.filter((p) => p.alive && p.position === hover.index).map((p) => nameOf(p.seat))
    : [];

  return (
    <div className="game" data-players={display.players.length}>
      <div className="board-area" ref={areaRef}>
        {/* `.world-shake`: the FX trauma camera owns its transform; the HUD stays outside it. */}
        <ShakeContainer className="board-shake">
          <Board
            tiles={display.rules.board}
            pawns={pawns}
            targets={targets}
            preview={preview}
            activeTile={display.players.find((p) => p.seat === display.current)?.position ?? null}
            flashTile={current?.type === 'TileResolved' ? current.tile : null}
            legend={legend}
            tiltDeg={tiltDeg}
            fit={fit}
            reduced={motion.reduced}
            cameraRef={cameraRef}
            backgroundUrl={boardBg}
            onPickTile={(tile) => void ui.submit({ type: 'USE_TELEPORT', tile })}
            onHoverTile={onHoverTile}
          >
            <DragonLair
              dragon={display.rules.dragon}
              state={lairState(combat, ui.groups.challengeDragon && showActions)}
              round={display.round}
              breathLit={breathLit}
              legend={legend}
              onLegend={setLegend}
            />
          </Board>
        </ShakeContainer>
      </div>

      <Spotlight seat={display.current} mode={spotlightMode} />

      <div className="hud">
        <TopStrip
          order={display.players.map((p) => ({
            seat: p.seat,
            name: nameOf(p.seat),
            job: p.job,
            color: seatColor(p.seat),
            alive: p.alive,
            active: p.alive && p.seat === display.current && !display.outcome,
          }))}
          round={display.round}
          maxRounds={display.rules.maxRounds}
          breathEvery={display.rules.dragon.breathEvery}
          breathLit={breathLit}
          speed={view.speed}
          canSkip={animating}
          muted={audio.muted}
          reduced={motion.reduced}
          onSpeed={(s) => store.getState().setSpeed(s)}
          onSkip={() => store.getState().snap()}
          onToggleMute={audio.toggle}
          onToggleMotion={motion.toggle}
          onChronicle={() => setChronicleOpen(true)}
          onSettings={() => setSettingsOpen(true)}
          onExit={() => (state.outcome ? onExit() : setConfirmExit(true))}
        />

        <div className="corner-cards">
          {cards.map((card, i) => (
            <CornerCard
              key={card.seat}
              card={card}
              corner={cornerOf(i, cards.length)}
              thinking={card.isActor && !controllable.includes(card.seat) && !finished}
              countdown={countdown}
              reduced={motion.reduced}
              onPick={
                thiefTargets.has(card.seat) && !ui.locked
                  ? () => void ui.submit({ type: 'USE_THIEF', target: card.seat })
                  : null
              }
              dimmed={thiefTargeting && !thiefTargets.has(card.seat)}
            />
          ))}
        </div>

        <Toasts toasts={toasts} onOpenChronicle={() => setChronicleOpen(true)} />

        <Dock
          status={status}
          countdown={countdown}
          error={view.lastError}
          dice={{ value: dice.value, roll, speed: view.speed, reduced: motion.reduced }}
          showActions={showActions}
          locked={ui.locked || ui.teleportPicking}
          groups={ui.groups}
          shopAvailable={shopAvailable}
          upgrades={showActions && actor !== null ? statOptions(state, actor, ui.groups.upgrades) : null}
          items={showActions && actor !== null ? playerOf(state, actor).items : null}
          coins={actor !== null ? playerOf(state, actor).coins : 0}
          onRoll={() => void ui.submit({ type: 'ROLL_DICE' })}
          onEndTurn={() => void ui.submit({ type: 'END_TURN' })}
          onDragon={() => ui.open('dragon')}
          onTeleport={() => ui.open('teleport')}
          onThief={() => ui.open('thief')}
          onShop={() => ui.open('shop')}
          onUpgrade={(stat) => void ui.submit({ type: 'UPGRADE', stat })}
        />
      </div>

      <EventCards cards={eventCards} flyers={flyers} reduced={motion.reduced} />
      {ribbon && ribbonPlayer && (
        <TurnRibbon
          ribbon={ribbon}
          name={nameOf(ribbon.seat)}
          job={ribbonPlayer.job}
          color={seatColor(ribbon.seat)}
        />
      )}
      <TileTooltip hover={hover} tiles={display.rules.board} occupants={occupants} />
      {ui.teleportPicking && (
        <TargetBanner icon="teleport" onCancel={ui.cancel}>
          금빛 테두리가 빛나는 칸 중 이동할 곳을 고르세요
        </TargetBanner>
      )}

      <DecisionDialogs ui={ui} state={state} nameOf={nameOf} onPreviewTile={setPreview} />

      {combat && (
        <CombatOverlay
          view={combat}
          lookOf={lookOf}
          breathEvery={display.rules.dragon.breathEvery}
          breathLit={breathLit}
          onSkip={() => store.getState().snap()}
        />
      )}

      {finished && state.outcome && (
        <ResultOverlay
          {...outcomeHeadline(state.outcome, nameOf)}
          winnerJob={state.outcome.winner !== null ? playerOf(state, state.outcome.winner).job : null}
          winnerColor={state.outcome.winner !== null ? seatColor(state.outcome.winner) : null}
          rounds={state.round}
          rows={resultRows(state, nameOf, eliminations)}
          onRestart={onRestart}
          onHome={onExit}
          homeLabel={EXIT_LABEL[session.exitTo]}
        />
      )}

      {chronicleOpen && <Chronicle entries={view.log} onClose={() => setChronicleOpen(false)} />}
      {settingsOpen && <SettingsPopover onClose={() => setSettingsOpen(false)} />}

      <FxLayer store={store} resolver={fxResolver} />

      {confirmExit && (
        <Modal
          className="modal-scroll exit-confirm"
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
          <p>{EXIT_NOTE[clientMode]}</p>
        </Modal>
      )}
    </div>
  );
}
