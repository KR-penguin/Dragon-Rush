import type { CombatResult } from '@dragon-rush/combat';
import { layoutOf, resultView, type FighterCard } from '../../types/fightView';
import { FightPortrait } from './FightPortrait';
import { KeycapHints } from './KeycapHints';

type Cards = readonly [FighterCard, FighterCard];

/** VS splash: portraits slide in and clash (art-direction §10, 1.3 s). */
export function FightIntro({ cards, replaySpeed }: { cards: Cards; replaySpeed: number | null }) {
  return (
    <div className="fight-intro" aria-live="polite">
      <div className="fight-wipe" />
      <FightPortrait card={cards[0]} side="left" />
      <div className="fight-vs">VS</div>
      <FightPortrait card={cards[1]} side="right" />
      {replaySpeed !== null && <div className="fight-intro-note">봇 전투 ×{replaySpeed}</div>}
    </div>
  );
}

const PLAYER_TAG: Readonly<Record<string, string>> = {
  'keyboard-p1': 'P1',
  'keyboard-p2': 'P2',
  'keyboard-solo': '조작',
};

/** READY: each local player's keycaps (1.5 s). */
export function FightReady({ cards }: { cards: Cards }) {
  const locals = cards.filter((c) => layoutOf(c.control) !== null);
  return (
    <div className="fight-ready">
      <div className="fight-ready-title">준비</div>
      <div className="fight-ready-players">
        {locals.map((c) => (
          <section key={c.side} className="fight-ready-card" style={{ borderColor: c.color }}>
            <header>
              <span className="fight-tag" style={{ background: c.color }}>
                {PLAYER_TAG[c.control]}
              </span>
              {c.name}
            </header>
            <KeycapHints layout={layoutOf(c.control)!} job={c.job} compact />
          </section>
        ))}
      </div>
    </div>
  );
}

export function FightGo() {
  return <div className="fight-go">싸워라!</div>;
}

export function FightResultCard({ cards, result }: { cards: Cards; result: CombatResult }) {
  const v = resultView(cards, result);
  return (
    <div className="fight-result" role="status">
      <div className={`fight-result-card${v.good ? ' is-good' : ' is-bad'}`}>
        <div className="fight-result-ko">{result.timedOut ? 'TIME' : 'KO'}</div>
        <h2>{v.headline}</h2>
        <ul>
          {v.lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function FightPaused({ onResume }: { onResume: () => void }) {
  return (
    <div className="fight-paused">
      <strong>일시 정지</strong>
      <button type="button" className="btn btn-primary" onClick={onResume}>
        계속 (Esc)
      </button>
    </div>
  );
}
