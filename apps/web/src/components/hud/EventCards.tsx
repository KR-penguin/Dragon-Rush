import { useLayoutEffect, useRef, type CSSProperties } from 'react';
import {
  EVENT_CARD_FADE_MS,
  EVENT_CARD_FLIP_MS,
  EVENT_CARD_RISE_MS,
} from '../../animation/eventTimeline';
import type { Flyer, LiveCard } from '../../hooks/useEventCards';
import { getFxAnchor } from '../../services/fxAnchors';
import { seatColor } from '../../types/labels';
import { EffectChips } from '../board/BoardTile';
import { GameIcon } from '../icons/GameIcon';

const KIND_LABEL: Record<LiveCard['face']['kind'], string> = {
  tile: '사건',
  cave: '미지의 동굴',
  mystery: '동굴 카드',
  start: '출발',
};

function EventCard({ card, reduced }: { card: LiveCard; reduced: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const { face } = card;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || reduced || typeof el.animate !== 'function') return;
    // Rise from the tile to the centre with back-out easing.
    // Transform only: opacity here would flatten the 3D flip inside the card.
    const tile = face.tile === null ? null : getFxAnchor({ kind: 'tile', id: face.tile });
    const r = el.getBoundingClientRect();
    const dx = tile ? tile.x - (r.left + r.width / 2) : 0;
    const dy = tile ? tile.y - (r.top + r.height / 2) : 40;
    el.animate(
      [
        { transform: `translate(${dx}px, ${dy}px) scale(0.4)` },
        { transform: 'translate(0, 0) scale(1)' },
      ],
      { duration: EVENT_CARD_RISE_MS / card.speed, easing: 'cubic-bezier(.34,1.56,.64,1)' },
    );
    // Runs once per card: later updates only turn the card over.
  }, [card.key]);

  const style = {
    '--seat-color': seatColor(face.seat),
    '--life': `${card.lifeMs}ms`,
    '--fade-ms': `${EVENT_CARD_FADE_MS / card.speed}ms`,
    '--flip-delay': `${EVENT_CARD_RISE_MS / card.speed}ms`,
    '--flip-ms': `${EVENT_CARD_FLIP_MS / card.speed}ms`,
  } as CSSProperties;
  return (
    <div
      ref={ref}
      className={`event-card tone-${face.tone}${reduced ? ' is-reduced' : ''}`}
      style={style}
    >
      <div className={`event-card-inner${card.revealed ? ' is-revealed' : ''}`}>
        <div className="event-card-back">
          <GameIcon name={face.kind === 'cave' ? 'cave' : 'dragon'} />
          <span>{face.kind === 'cave' ? '미지의 동굴' : '드래곤 러쉬'}</span>
        </div>
        <div className="event-card-front parchment">
          <span className="event-card-kind">{KIND_LABEL[face.kind]}</span>
          <span className="event-card-art">
            <GameIcon name={face.icon} />
          </span>
          <strong className="event-card-title">{face.title}</strong>
          {face.flavor && <p className="event-card-flavor">{face.flavor}</p>}
          {face.notice && <p className="event-card-notice">{face.notice}</p>}
          <EffectChips chips={face.chips} className="event-card-chips" />
        </div>
      </div>
    </div>
  );
}

function FlyingChip({ flyer }: { flyer: Flyer }) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof el.animate !== 'function') return;
    const dx = flyer.to.x - flyer.from.x;
    const dy = flyer.to.y - flyer.from.y;
    el.animate(
      [
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
        {
          transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.7)`,
          opacity: 0.9,
        },
      ],
      { duration: flyer.ms, easing: 'cubic-bezier(.55,0,1,.45)', fill: 'forwards' },
    );
  }, [flyer]);
  return (
    <span
      ref={ref}
      className={`fly-chip chip-${flyer.tone}`}
      style={{ left: flyer.from.x, top: flyer.from.y }}
    >
      <GameIcon name={flyer.icon} />
      <b>{flyer.text}</b>
    </span>
  );
}

/** Event cards rising from tiles and their effect chips flying to the corner cards (§1.8). */
export function EventCards({
  cards,
  flyers,
  reduced,
}: {
  cards: readonly LiveCard[];
  flyers: readonly Flyer[];
  reduced: boolean;
}) {
  return (
    <div className="event-layer" aria-hidden="true">
      {cards.map((c) => (
        <EventCard key={c.key} card={c} reduced={reduced} />
      ))}
      {flyers.map((f) => (
        <FlyingChip key={f.key} flyer={f} />
      ))}
    </div>
  );
}
