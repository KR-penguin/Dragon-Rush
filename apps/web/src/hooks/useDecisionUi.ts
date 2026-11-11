import type { Action, SeatId } from '@dragon-rush/engine';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { GameUpdate } from '../services/gameClient';
import type { GameStore } from '../store/gameStore';
import { groupActions } from '../types/actionGroups';
import {
  activeDialog,
  canAct,
  needsHandoff,
  shopVisitKey,
  type DialogKind,
  type UserRequest,
} from '../types/gameUi';

/**
 * Decision UI state for the Game page: which dialog or board mode is open and what may be submitted.
 * Everything selectable comes from `latest.legalActions`.
 */
export function useDecisionUi(store: GameStore, latest: GameUpdate | null, animating: boolean) {
  const [request, setRequest] = useState<UserRequest | null>(null);
  const [shopDismissedKey, setShopDismissedKey] = useState<string | null>(null);
  const [handoffAck, setHandoffAck] = useState<SeatId | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  // Any applied action closes one-shot requests; the shop stays open for repeated buying.
  const version = latest?.version ?? -1;
  const [seenVersion, setSeenVersion] = useState(version);
  if (seenVersion !== version) {
    setSeenVersion(version);
    if (request !== null && request !== 'shop') setRequest(null);
  }

  const groups = useMemo(() => groupActions(latest?.legalActions ?? []), [latest]);
  const state = latest?.publicState ?? null;
  const actor = latest?.pending?.actor ?? null;
  const phase = latest?.pending?.phase ?? null;
  const acting = canAct(latest, animating);
  const settled = canAct(latest, false);
  const handoff = settled && needsHandoff(latest?.controllableSeats ?? [], actor, handoffAck);
  const shopAvailable =
    phase === 'POST_MOVE' && (groups.buys.length > 0 || state?.turn.canBuy === true);
  const visitKey = state ? shopVisitKey(state) : '';
  const inputs = {
    phase,
    handoffNeeded: handoff,
    shopAvailable,
    shopDismissed: shopDismissedKey === visitKey,
    request,
  };
  const dialogNow = activeDialog({ ...inputs, canAct: acting });
  // Keep the shop on screen during the short purchase animation instead of flickering it.
  const lastDialog = useRef<DialogKind | null>(null);
  const keepShop =
    animating &&
    lastDialog.current === 'shop' &&
    activeDialog({ ...inputs, canAct: settled }) === 'shop';
  const dialog: DialogKind | null = dialogNow ?? (keepShop ? 'shop' : null);
  useEffect(() => {
    lastDialog.current = dialog;
  });

  const submit = async (action: Action): Promise<void> => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await store.getState().submit(action);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return {
    groups,
    actor,
    phase,
    /** The local player may decide now (animations done, decision is ours). */
    acting,
    /** The pending decision belongs to this screen, even if animations are still catching up. */
    mine: settled,
    handoff,
    /** Inputs are locked while animating or while a submit is in flight. */
    locked: !acting || busy,
    dialog,
    teleportPicking:
      acting && !handoff && request === 'teleport' && groups.teleportTiles.length > 0,
    submit,
    open: (r: UserRequest) => setRequest(r),
    cancel: () => setRequest(null),
    closeShop: () => {
      setShopDismissedKey(visitKey);
      setRequest((r) => (r === 'shop' ? null : r));
    },
    acknowledgeHandoff: () => setHandoffAck(actor),
  };
}

export type DecisionUi = ReturnType<typeof useDecisionUi>;
