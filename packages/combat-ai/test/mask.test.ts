import {
  BTN_ATTACK,
  BTN_DASH,
  BTN_SKILL,
  NO_INPUT,
  stepCombat,
  type CombatState,
  type FighterInput,
  type Side,
} from '@dragon-rush/combat';
import { describe, expect, it } from 'vitest';
import {
  BUTTON_ATTACK,
  BUTTON_DASH,
  BUTTON_SKILL,
  buttonReadyIn,
  combatActionMask,
  flatMask,
  hitstunLeft,
  inactiveMask,
  isActionable,
  toFighterInput,
} from '../src/index';
import { dragonFight, duel, playFight, type Frame } from './helpers';

const KIND = { [BUTTON_ATTACK]: 'attack', [BUTTON_SKILL]: 'skill', [BUTTON_DASH]: 'dash' } as const;
const BIT = {
  [BUTTON_ATTACK]: BTN_ATTACK,
  [BUTTON_SKILL]: BTN_SKILL,
  [BUTTON_DASH]: BTN_DASH,
} as const;
type Button = typeof BUTTON_ATTACK | typeof BUTTON_SKILL | typeof BUTTON_DASH;

interface Probe {
  readonly starts: Set<string>;
  /** Something outside the press changed the fighter's timeline (hit, parry, end of fight). */
  readonly disturbed: boolean;
}

/** Holds `button` for one 4-live-tick window (then nothing), replaying the opponent's recorded inputs. */
function probe(frames: Frame[], t: number, side: Side, button: number, liveTicks = 14): Probe {
  let s: CombatState = frames[t]!.state;
  const window: FighterInput = toFighterInput({ move: 0, button }, NO_INPUT).input;
  const starts = new Set<string>();
  let disturbed = false;
  let live = 0;
  for (let k = 0; live < liveTicks; k++) {
    if (s.outcome) {
      disturbed = true;
      break;
    }
    const mine = live < 4 ? window : NO_INPUT;
    const rec = frames[t + k]?.inputs ?? [NO_INPUT, NO_INPUT];
    const isLive = s.hitstop === 0;
    const r = stepCombat(s, side === 'a' ? [mine, rec[1]] : [rec[0], mine]);
    for (const e of r.events) {
      if (e.type === 'AttackStart' && e.who === side && e.move !== 'counter') starts.add('attack');
      else if (e.type === 'SkillUsed' && e.who === side) starts.add('skill');
      else if (e.type === 'Dash' && e.who === side) starts.add('dash');
      else if (
        (e.type === 'Hit' && e.target === side) ||
        // parrying refunds the skill; being parried staggers the attacker
        (e.type === 'Parry' && (e.who === side || e.attacker === side))
      )
        disturbed = true;
    }
    s = r.state;
    if (isLive) live++;
  }
  return { starts, disturbed };
}

describe('combatActionMask', () => {
  it('always allows every move and the none button; inactive slots allow only [none, none]', () => {
    const frames = playFight(duel('archer', 'berserker'), 4);
    for (const f of frames.slice(0, 200)) {
      const m = combatActionMask(f.state, 'b');
      expect(Array.from(m.move)).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1]);
      expect(m.button[0]).toBe(1);
      const flat = flatMask(m);
      for (let i = 0; i < 36; i++)
        expect(flat[i]).toBe(m.move[Math.floor(i / 4)]! & m.button[i % 4]!);
    }
    const inactive = inactiveMask();
    expect(Array.from(inactive.move)).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(Array.from(inactive.button)).toEqual([1, 0, 0, 0]);
    const ended = frames.at(-1)!.state;
    expect(Array.from(combatActionMask(ended, 'a').button)).toEqual([1, 0, 0, 0]);
  });

  // The mask assumes nothing hits the fighter: a light hit (4-8 ticks of hitstun) can cut a long move short,
  // so both directions are checked on runs where the fighter's timeline was left alone.
  it('masks a press exactly when it would expire before starting its action', () => {
    const setups = [
      duel('swordsman', 'ninja'),
      duel('archer', 'mage'),
      duel('berserker', 'swordsman'),
      duel('ninja', 'archer'),
      duel('mage', 'berserker'),
      dragonFight('swordsman', { atk: 9, def: 8, maxHp: 70, hp: 70 }),
      dragonFight('ninja'),
    ];
    const tally = { masked: 0, effective: 0, queued: 0 };
    for (const [i, setup] of setups.entries()) {
      const frames = playFight(setup, 900 + i, i % 2 ? 'aggressive' : 'cautious');
      for (let t = 0; t < frames.length - 1; t += 3) {
        const s = frames[t]!.state;
        const sides: Side[] = s.b ? ['a', 'b'] : ['a'];
        for (const side of sides) {
          const f = side === 'a' ? s.a : s.b!;
          if (f.mode === 'ko') continue;
          const mask = combatActionMask(s, side);
          const base = probe(frames, t, side, 0);
          // a press already buffered by the bot would compete with the probe
          if (base.disturbed || f.bufAttack > 0 || f.bufSkill > 0 || f.bufDash > 0) continue;
          for (const b of [BUTTON_ATTACK, BUTTON_SKILL, BUTTON_DASH] as Button[]) {
            if (f.held & BIT[b]) continue; // no edge: the button is already held
            if (b === BUTTON_ATTACK && f.move === 'draw' && !f.drawReleased) continue; // a hold
            const run = probe(frames, t, side, b);
            if (run.disturbed) continue;
            const effective = run.starts.has(KIND[b]) && !base.starts.has(KIND[b]);
            const where = `setup ${i} tick ${s.tick} side ${side} button ${KIND[b]} mode ${f.mode}/${f.move}/${f.moveTick}`;
            if (mask.button[b] === 0) {
              tally.masked++;
              if (effective) throw new Error(`masked press still acted: ${where}`);
            } else {
              if (!effective) throw new Error(`allowed press did nothing: ${where}`);
              tally.effective++;
              if (buttonReadyIn(s, side, b) > s.rules.inputBuffer) tally.queued++;
            }
          }
        }
      }
    }
    expect(tally.masked).toBeGreaterThan(1500);
    expect(tally.effective).toBeGreaterThan(1500);
    // string presses queued past the buffer were exercised too
    expect(tally.queued).toBeGreaterThan(0);
  });

  it('marks long hitstun and KO as not actionable', () => {
    let stunned = 0;
    let ended = 0;
    for (const [i, setup] of [
      duel('berserker', 'mage'),
      duel('mage', 'swordsman'),
      duel('ninja', 'berserker'),
    ].entries()) {
      const frames = playFight(setup, 12 + i);
      for (const f of frames) {
        const s = f.state;
        for (const side of ['a', 'b'] as const) {
          const me = side === 'a' ? s.a : s.b!;
          const actionable = isActionable(s, side, 4);
          if (me.mode === 'hitstun' && hitstunLeft(s, me) + 1 > s.rules.inputBuffer) {
            expect(actionable).toBe(false);
            stunned++;
          } else if (me.mode !== 'ko' && !s.outcome) expect(actionable).toBe(true);
        }
      }
      expect(isActionable(frames.at(-1)!.state, 'a', 4)).toBe(false);
      ended++;
    }
    expect(ended).toBe(3);
    expect(stunned).toBeGreaterThan(0);
  });
});
