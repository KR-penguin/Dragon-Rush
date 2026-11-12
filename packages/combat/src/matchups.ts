import type { JobId } from '@dragon-rush/engine';

export interface MatchupEdge {
  readonly beats: JobId;
  /** Mechanic that gives the edge (kept in sync with the kits in DEFAULT_COMBAT_RULES). */
  readonly why: string;
}

/**
 * Designed PvP chart: a 5-way rock-paper-scissors of soft counters. Each job beats exactly two jobs and loses
 * to the other two; mirrors are even. Target with balanced bots at equal base stats: the favoured side wins
 * 60-66% (never above 72%), and every job averages 47-53% across its four opponents.
 */
export const MATCHUPS: Readonly<Record<JobId, readonly [MatchupEdge, MatchupEdge]>> = {
  swordsman: [
    { beats: 'archer', why: 'parry reflects arrows and the dash closes the gap' },
    { beats: 'ninja', why: 'parry punishes fast dagger strings with a P 2.0 counter' },
  ],
  archer: [
    { beats: 'berserker', why: 'kites the slowest brawler; arrows outrange the shoulder charge' },
    { beats: 'mage', why: 'outranges and outpaces the slow bolt; full draws pierce' },
  ],
  ninja: [
    { beats: 'archer', why: 'two i-frame dashes close the gap; backstab while the archer draws' },
    { beats: 'mage', why: 'too fast for runes and slow bolts; dives behind the caster' },
  ],
  mage: [
    { beats: 'swordsman', why: 'meteor rune is unparryable and bolts pierce half DEF' },
    {
      beats: 'berserker',
      why: 'blink and runes keep the slow brawler out; pierce through its armor',
    },
  ],
  berserker: [
    { beats: 'ninja', why: 'super armor ignores dagger pokes; the whirlwind catches dodgers' },
    { beats: 'swordsman', why: 'armored axe and spinning whirlwind break parry timing' },
  ],
};

/** The job that is designed to win a pairing, or null for a mirror. */
export function favouredJob(a: JobId, b: JobId): JobId | null {
  if (a === b) return null;
  if (MATCHUPS[a].some((e) => e.beats === b)) return a;
  if (MATCHUPS[b].some((e) => e.beats === a)) return b;
  throw new Error(`no designed edge between ${a} and ${b}`);
}
