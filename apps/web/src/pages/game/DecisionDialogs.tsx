import type { PublicGameState, SeatId } from '@dragon-rush/engine';
import { useMemo } from 'react';
import { DragonConfirmDialog } from '../../components/dialogs/DragonConfirmDialog';
import { HandoffDialog } from '../../components/dialogs/HandoffDialog';
import { MoveAdjustDialog } from '../../components/dialogs/MoveAdjustDialog';
import { PvpTargetDialog } from '../../components/dialogs/PvpTargetDialog';
import { ShieldDialog } from '../../components/dialogs/ShieldDialog';
import { ShopDialog } from '../../components/dialogs/ShopDialog';
import { ThiefDialog } from '../../components/dialogs/ThiefDialog';
import { TrainingDialog } from '../../components/dialogs/TrainingDialog';
import type { DecisionUi } from '../../hooks/useDecisionUi';
import { moveOptions, opponentSummaries, shopRows, statOptions } from '../../types/decisionView';
import { dragonWinChance, duelWinChance, shieldDecisionChance } from '../../types/estimates';
import { PHASE_LABEL, seatColor, seatCrest } from '../../types/labels';
import { playerOf } from '../../types/playerView';

interface DecisionDialogsProps {
  ui: DecisionUi;
  /** Authoritative state the pending decision belongs to. */
  state: PublicGameState;
  nameOf: (seat: SeatId) => string;
  /** Destination preview on the board for the ninja's move adjust. */
  onPreviewTile?: (tile: number | null) => void;
}

/** Renders the one dialog the decision UI asks for, wired to legal actions only. */
export function DecisionDialogs({ ui, state, nameOf, onPreviewTile }: DecisionDialogsProps) {
  const { dialog, actor, groups, locked, submit } = ui;

  const estimate = useMemo(() => {
    if (actor === null) return null;
    if (dialog === 'dragon') return dragonWinChance(state, actor);
    if (dialog === 'shield') return shieldDecisionChance(state, actor);
    return null;
  }, [dialog, state, actor]);

  const pvpChances = useMemo(
    () =>
      dialog === 'pvpTarget' && actor !== null
        ? new Map(groups.pvpTargets.map((t) => [t, duelWinChance(state, actor, t)]))
        : null,
    [dialog, state, actor, groups.pvpTargets],
  );

  if (dialog === null || actor === null) return null;
  const me = opponentSummaries(state, [actor])[0]!;

  switch (dialog) {
    case 'handoff':
      return (
        <HandoffDialog
          name={nameOf(actor)}
          color={seatColor(actor)}
          crest={seatCrest(actor)}
          phaseLabel={ui.phase ? PHASE_LABEL[ui.phase] : ''}
          onConfirm={ui.acknowledgeHandoff}
        />
      );
    case 'moveAdjust':
      return (
        <MoveAdjustDialog
          dice={state.turn.dice}
          options={moveOptions(state, groups.moveDeltas)}
          locked={locked}
          onChoose={(delta) => void submit({ type: 'ADJUST_MOVE', delta })}
          {...(onPreviewTile ? { onPreview: onPreviewTile } : {})}
        />
      );
    case 'pvpTarget':
      return (
        <PvpTargetDialog
          targets={opponentSummaries(state, groups.pvpTargets).map((summary) => ({
            name: nameOf(summary.seat),
            summary,
            chance: pvpChances?.get(summary.seat) ?? null,
          }))}
          locked={locked}
          onChoose={(target) => void submit({ type: 'CHOOSE_PVP_TARGET', target })}
        />
      );
    case 'shield': {
      const pvp = state.pvp;
      if (!pvp || pvp.target === null) return null;
      const opponent = actor === pvp.arriver ? pvp.target : pvp.arriver;
      return (
        <ShieldDialog
          deciderName={nameOf(actor)}
          role={actor === pvp.arriver ? 'arriver' : 'defender'}
          me={me}
          opponentName={nameOf(opponent)}
          opponent={opponentSummaries(state, [opponent])[0]!}
          chance={estimate}
          locked={locked}
          onDecide={(use) => void submit({ type: 'SHIELD_DECISION', use })}
        />
      );
    }
    case 'training':
      return (
        <TrainingDialog
          options={statOptions(state, actor, groups.trainingStats)}
          locked={locked}
          onChoose={(stat) => void submit({ type: 'CHOOSE_TRAINING_STAT', stat })}
        />
      );
    case 'shop':
      return (
        <ShopDialog
          rows={shopRows(state, actor, groups.buys)}
          coins={playerOf(state, actor).coins}
          locked={locked}
          onBuy={(item) => void submit({ type: 'BUY_ITEM', item })}
          onClose={ui.closeShop}
        />
      );
    case 'thief':
      return (
        <ThiefDialog
          targets={opponentSummaries(state, groups.thiefTargets).map((summary) => ({
            name: nameOf(summary.seat),
            summary,
          }))}
          stealMax={state.rules.thiefStealAmount}
          locked={locked}
          onChoose={(target) => void submit({ type: 'USE_THIEF', target })}
          onClose={ui.cancel}
        />
      );
    case 'dragon':
      return (
        <DragonConfirmDialog
          name={nameOf(actor)}
          me={me}
          dragon={state.rules.dragon}
          chance={estimate ?? 0}
          locked={locked}
          onConfirm={() => void submit({ type: 'CHALLENGE_DRAGON' })}
          onCancel={ui.cancel}
        />
      );
  }
}
