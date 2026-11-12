import type { GameEvent, SeatId } from '@dragon-rush/engine';
import { useEffect, useState } from 'react';
import { getFxAnchor } from '../services/fxAnchors';
import type { GameStore } from '../store/gameStore';
import { eventCardFor, type EventCardFace } from '../types/eventCards';
import type { FxAnchorKind } from '../types/fxAnchor';
import type { IconName } from '../types/icons';
import { signed, type ChipTone } from '../types/tileView';

export interface LiveCard {
  readonly key: number;
  readonly face: EventCardFace;
  /** False while a cave card waits face down for its mystery card. */
  readonly revealed: boolean;
  /** Total time on screen since `born` at the current speed (rise, flip and the 1.2 s sticky). */
  readonly lifeMs: number;
  readonly born: number;
  readonly speed: number;
}

export interface Flyer {
  readonly key: number;
  readonly icon: IconName;
  readonly text: string;
  readonly tone: ChipTone;
  readonly from: { readonly x: number; readonly y: number };
  readonly to: { readonly x: number; readonly y: number };
  readonly ms: number;
}

const RISE_MS = 200;
const FLIP_MS = 180;
const STICKY_MS = 1200;
const FLY_MS = 250;
/** Where the card sits: the CSS centres `.event-card` here (fraction of the viewport). */
export const CARD_SCREEN_POS = { x: 0.5, y: 0.42 } as const;

function flyerFor(
  e: Extract<GameEvent, { type: 'EffectApplied' }>,
): { icon: IconName; amount: number; target: FxAnchorKind } | null {
  // Coins are flown to the purse by the FX toolkit's coin flight, so the card does not double them.
  switch (e.effect) {
    case 'hp':
      return e.delta === 0 ? null : { icon: 'hp', amount: e.delta, target: 'seatHp' };
    case 'maxHp':
      return { icon: 'maxHp', amount: e.delta, target: 'seatHp' };
    case 'stat':
      return { icon: e.stat ?? 'atk', amount: e.delta, target: 'seat' };
    default:
      return null;
  }
}

/** Event cards rising from tiles and effect chips flying to the owner's corner card (§1.8). */
export function useEventCards(store: GameStore, reduced: boolean): { cards: LiveCard[]; flyers: Flyer[] } {
  const [cards, setCards] = useState<LiveCard[]>([]);
  const [flyers, setFlyers] = useState<Flyer[]>([]);

  useEffect(() => {
    let key = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const later = (fn: () => void, ms: number) => {
      const t = setTimeout(() => {
        timers.delete(t);
        fn();
      }, ms);
      timers.add(t);
    };
    let cardTimer: ReturnType<typeof setTimeout> | null = null;
    const expireCard = (k: number, ms: number) => {
      if (cardTimer) clearTimeout(cardTimer);
      cardTimer = setTimeout(() => setCards((cs) => cs.filter((c) => c.key !== k)), ms);
    };

    const showCard = (face: EventCardFace, speed: number) => {
      const lifeMs = (RISE_MS + FLIP_MS + STICKY_MS) / speed;
      const now = performance.now();
      setCards((cs) => {
        const last = cs.at(-1);
        // A mystery card turns over the cave card that is already waiting face down.
        if (face.kind === 'mystery' && last && last.face.kind === 'cave' && last.face.seat === face.seat) {
          expireCard(last.key, lifeMs);
          return [
            {
              ...last,
              face: { ...face, tile: last.face.tile },
              revealed: true,
              lifeMs: now - last.born + lifeMs,
              speed,
            },
          ];
        }
        const k = ++key;
        expireCard(k, lifeMs);
        return [{ key: k, face, revealed: face.kind !== 'cave', lifeMs, born: now, speed }];
      });
    };

    const fly = (seat: SeatId, e: Extract<GameEvent, { type: 'EffectApplied' }>, speed: number) => {
      const f = flyerFor(e);
      if (!f || typeof window === 'undefined') return;
      const to = getFxAnchor({ kind: f.target, id: seat }) ?? getFxAnchor({ kind: 'seat', id: seat });
      if (!to) return;
      const from = {
        x: window.innerWidth * CARD_SCREEN_POS.x,
        y: window.innerHeight * CARD_SCREEN_POS.y,
      };
      const k = ++key;
      const ms = FLY_MS / speed;
      const flyer: Flyer = {
        key: k,
        icon: f.icon,
        text: signed(f.amount),
        tone: f.amount > 0 ? 'good' : f.amount < 0 ? 'bad' : 'neutral',
        from,
        to: { x: to.x, y: to.y },
        ms,
      };
      setFlyers((fs) => [...fs.slice(-5), flyer]);
      later(() => setFlyers((fs) => fs.filter((x) => x.key !== k)), ms + 60);
    };

    const unsubscribe = store.subscribe((s, prev) => {
      const e = s.current;
      if (!e || e === prev.current || !s.display) return;
      const face = eventCardFor(e, s.display.rules);
      if (face) showCard(face, s.speed);
      if (e.type === 'EffectApplied' && !reduced) fly(e.seat, e, s.speed);
    });
    return () => {
      unsubscribe();
      if (cardTimer) clearTimeout(cardTimer);
      for (const t of timers) clearTimeout(t);
    };
  }, [store, reduced]);

  return { cards, flyers };
}
